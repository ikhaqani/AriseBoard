import { state } from './state.js';
import { IO_CRITERIA } from './config.js';

// Helper om LSS Score te berekenen
function calculateLSSScore(qa) {
    let totalW = 0, earnedW = 0;
    IO_CRITERIA.forEach(c => {
        const val = qa[c.key];
        if (val === 'OK' || val === 'NOT_OK') {
            totalW += c.weight;
            if (val === 'OK') earnedW += c.weight;
        }
    });
    return totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
}

export function renderBoard(openModalCallback) {
    const activeSheet = state.getActiveSheet();
    if (!activeSheet) return;

    // Update Dropdown
    const select = document.getElementById("sheetSelect");
    select.innerHTML = "";
    state.project.sheets.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id; opt.text = s.name;
        opt.selected = (s.id === state.project.activeSheetId);
        select.appendChild(opt);
    });

    document.getElementById("board-header-display").innerText = activeSheet.name;
    document.getElementById("row-headers").innerHTML = "";
    ["Leverancier", "Systeem", "Input", "Proces", "Output", "Klant"].forEach(l => {
        document.getElementById("row-headers").innerHTML += `<div class="row-header"><span>${l}</span></div>`;
    });

    const colsEl = document.getElementById("cols");
    colsEl.innerHTML = "";

    const offsets = state.getGlobalCountersBeforeActive();
    let localInCounter = 0;
    let localOutCounter = 0;
    const allOutputMap = state.getAllOutputs();
    let stats = { happy: 0, neutral: 0, sad: 0 };

    activeSheet.columns.forEach((col, colIdx) => {
        let myOutputId = "";
        if (col.slots[2].text?.trim()) localInCounter++;
        if (col.slots[4].text?.trim()) {
            localOutCounter++;
            myOutputId = `OUT${offsets.outStart + localOutCounter}`;
        }

        if (col.isVisible === false) return; // Skip hidden

        // CREATE COLUMN DOM
        const colDiv = document.createElement("div");
        colDiv.className = `col ${col.isParallel ? 'is-parallel' : ''}`;
        
        // Actions
        colDiv.innerHTML = `
            <div class="col-actions">
                <button class="btn-col-action btn-arrow" onclick="window.app.moveCol(${colIdx}, -1)">←</button>
                <button class="btn-col-action btn-move-col">↔</button>
                <button class="btn-col-action btn-arrow" onclick="window.app.moveCol(${colIdx}, 1)">→</button>
                ${colIdx > 0 ? `<button class="btn-col-action btn-parallel ${col.isParallel ? 'active' : ''}" onclick="window.app.toggleParallel(${colIdx})">∥</button>` : ''}
                <button class="btn-col-action btn-hide-col" onclick="window.app.hideCol(${colIdx})">👁️</button>
                <button class="btn-col-action btn-add-col-here" onclick="window.app.addCol(${colIdx})">+</button>
                <button class="btn-col-action btn-delete-col" onclick="window.app.delCol(${colIdx})">×</button>
            </div>
            <div class="slots"></div>
        `;

        const slotsDiv = colDiv.querySelector(".slots");

        col.slots.forEach((s, slotIdx) => {
            if (slotIdx === 3) {
                if (s.processStatus === 'HAPPY') stats.happy++;
                else if (s.processStatus === 'NEUTRAL') stats.neutral++;
                else if (s.processStatus === 'SAD') stats.sad++;
            }

            const slotEl = document.createElement("div");
            slotEl.className = "slot";
            
            let statusClass = "";
            if (slotIdx === 3) {
                if (s.processStatus === 'HAPPY') statusClass = "status-happy";
                else if (s.processStatus === 'NEUTRAL') statusClass = "status-neutral";
                else if (s.processStatus === 'SAD') statusClass = "status-sad";
            }

            const score = calculateLSSScore(s.qa);
            const scoreBadge = score !== null ? `<div class="qa-score-badge ${score >= 80 ? 'score-high' : 'score-low'}">Q: ${score}%</div>` : "";
            
            let displayText = s.text;
            let isLinked = false;
            if (slotIdx === 2 && s.linkedSourceId && allOutputMap[s.linkedSourceId]) {
                displayText = allOutputMap[s.linkedSourceId];
                isLinked = true;
            }

            // Create Sticky HTML
            slotEl.innerHTML = `
                <div class="sticky ${statusClass}">
                    <div class="sticky-grip"></div>
                    ${slotIdx === 3 ? `<div class="label-tl">${s.type === 'Afspraak' ? '📅' : '📝'} ${s.type}</div>` : ''}
                    ${slotIdx === 3 ? `<div class="label-br">${s.processValue}</div>` : ''}
                    ${(slotIdx === 4 && myOutputId) ? `<div class="id-tag">${myOutputId}</div>` : ''}
                    ${scoreBadge}
                    ${isLinked ? '<span style="position:absolute; top:20px; right:4px; font-size:12px;">🔗</span>' : ''}
                    <div class="sticky-content">
                        <div class="text" contenteditable="true" oninput="window.app.updateText(${colIdx}, ${slotIdx}, this.innerText)">${displayText}</div>
                    </div>
                </div>
            `;
            
            // Add Double Click Listener manually to the sticky element
            slotEl.querySelector('.sticky').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                openModalCallback(colIdx, slotIdx); 
            });

            slotsDiv.appendChild(slotEl);
        });

        colsEl.appendChild(colDiv);

        // Connector Logic (Simple)
        if (colIdx < activeSheet.columns.length - 1) {
             let nextVisible = null;
             for(let i=colIdx+1; i<activeSheet.columns.length; i++){
                 if(activeSheet.columns[i].isVisible!==false){ nextVisible=activeSheet.columns[i]; break; }
             }
             if(nextVisible) {
                 const conn = document.createElement("div");
                 if(nextVisible.isParallel) {
                     conn.className = "col-connector parallel-connector";
                     conn.innerHTML = `<div class="parallel-line"></div><div class="parallel-badge">||</div>`;
                 } else {
                     conn.className = "col-connector";
                     if(col.hasTransition) {
                         conn.innerHTML = `
                            <div class="connector-active">
                                <input class="connector-input-minimal" value="${col.transitionNext}" oninput="window.app.updateTransition(${colIdx}, this.value)" placeholder="Tijd...">
                                <div class="connector-arrow-minimal"></div>
                                <span class="connector-text-export">${col.transitionNext}</span>
                                <button class="connector-delete" onclick="window.app.toggleTransition(${colIdx})">×</button>
                            </div>`;
                     } else {
                         conn.innerHTML = `<button class="connector-add" onclick="window.app.toggleTransition(${colIdx})">+</button>`;
                     }
                 }
                 colsEl.appendChild(conn);
             }
        }
    });

    document.getElementById("countHappy").innerText = stats.happy;
    document.getElementById("countNeutral").innerText = stats.neutral;
    document.getElementById("countSad").innerText = stats.sad;
    
    // Sync heights
    setTimeout(() => {
        for (let r = 0; r < 6; r++) {
            let max = 170;
            document.querySelectorAll(`.col:not(.hidden-col) .slots .slot:nth-child(${r+1})`).forEach(s => max = Math.max(max, s.offsetHeight));
            document.querySelectorAll(`.col .slots .slot:nth-child(${r+1})`).forEach(s => s.style.height = max + "px");
            if (document.getElementById("row-headers").children[r]) 
                document.getElementById("row-headers").children[r].style.height = max + "px";
        }
    }, 50);
}