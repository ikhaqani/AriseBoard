import { state } from './state.js';
import { IO_CRITERIA } from './config.js';

// --- Helpers ---

/**
 * Berekent de LSS score (0-100) op basis van QA resultaten.
 */
function calculateLSSScore(qa) {
    if (!qa) return null;
    let totalW = 0, earnedW = 0;
    
    IO_CRITERIA.forEach(c => {
        const val = qa[c.key]?.result; // Veilig accessen via ?.result
        if (val === 'OK' || val === 'NOT_OK') {
            totalW += c.weight;
            if (val === 'OK') earnedW += c.weight;
        }
    });
    
    return totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
}

/**
 * Synchroniseert de hoogte van rijen (zodat alles netjes uitlijnt).
 */
function syncRowHeights() {
    const rowHeaders = document.getElementById("row-headers").children;
    
    // Batch DOM reads
    const heights = [];
    for (let r = 0; r < 6; r++) {
        let max = 170; // Minimale hoogte
        const slots = document.querySelectorAll(`.col .slots .slot:nth-child(${r + 1})`);
        slots.forEach(s => {
            const h = s.firstElementChild.offsetHeight; // Meet sticky height
            if (h > max) max = h;
        });
        heights.push(max);
    }

    // Batch DOM writes
    requestAnimationFrame(() => {
        for (let r = 0; r < 6; r++) {
            const h = `${heights[r]}px`;
            // Zet hoogte op headers
            if (rowHeaders[r]) rowHeaders[r].style.height = h;
            // Zet hoogte op alle slots in die rij
            document.querySelectorAll(`.col .slots .slot:nth-child(${r + 1})`).forEach(s => s.style.height = h);
        }
        
        // Connectors centreren
        const processRowHeight = heights[3];
        // Dit is een benadering; CSS flexbox doet het meeste werk al verticaal
    });
}

// --- Main Render Function ---

/**
 * Render de volledige board UI.
 * @param {Function} openModalFn - Callback om modal te openen.
 */
export function renderBoard(openModalFn) {
    const activeSheet = state.activeSheet; // Gebruik getter uit state
    if (!activeSheet) return;

    // 1. Update Sheet Selector
    const select = document.getElementById("sheetSelect");
    // Alleen updaten als opties veranderd zijn om flikkeren te voorkomen? 
    // Voor nu simpelweg rebuilden.
    select.innerHTML = "";
    state.project.sheets.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id; 
        opt.textContent = s.name;
        opt.selected = (s.id === state.project.activeSheetId);
        select.appendChild(opt);
    });

    // 2. Update Headers
    document.getElementById("board-header-display").textContent = activeSheet.name;
    const rowHeaderContainer = document.getElementById("row-headers");
    rowHeaderContainer.innerHTML = "";
    ["Leverancier", "Systeem", "Input", "Proces", "Output", "Klant"].forEach(l => {
        const div = document.createElement("div");
        div.className = "row-header";
        div.innerHTML = `<span>${l}</span>`;
        rowHeaderContainer.appendChild(div);
    });

    // 3. Render Columns
    const colsContainer = document.getElementById("cols");
    colsContainer.innerHTML = ""; // Clear current

    // Globale counters berekenen voor IN/OUT labels
    const offsets = state.getGlobalCountersBeforeActive();
    let localInCounter = 0;
    let localOutCounter = 0;
    const allOutputMap = state.getAllOutputs();
    const stats = { happy: 0, neutral: 0, sad: 0 };

    activeSheet.columns.forEach((col, colIdx) => {
        if (col.isVisible === false) return; // Skip hidden columns

        // ID Logic
        let myOutputId = "";
        if (col.slots[2].text?.trim()) localInCounter++;
        if (col.slots[4].text?.trim()) {
            localOutCounter++;
            myOutputId = `OUT${offsets.outStart + localOutCounter}`;
        }
        // Input ID tonen? (Optioneel, staat niet in je originele design maar wel handig)
        // const myInputId = col.slots[2].text?.trim() ? `IN${offsets.inStart + localInCounter}` : "";

        // --- Column Container ---
        const colEl = document.createElement("div");
        colEl.className = `col ${col.isParallel ? 'is-parallel' : ''}`;
        colEl.dataset.idx = colIdx;

        // --- Action Toolbar ---
        const actionsEl = document.createElement("div");
        actionsEl.className = "col-actions";
        actionsEl.innerHTML = `
            <button class="btn-col-action btn-arrow" data-action="move" data-dir="-1">←</button>
            <div class="btn-col-action btn-move-col" draggable="true">↔</div>
            <button class="btn-col-action btn-arrow" data-action="move" data-dir="1">→</button>
            ${colIdx > 0 ? `<button class="btn-col-action btn-parallel ${col.isParallel ? 'active' : ''}" data-action="parallel">∥</button>` : ''}
            <button class="btn-col-action btn-hide-col" data-action="hide">👁️</button>
            <button class="btn-col-action btn-add-col-here" data-action="add">+</button>
            <button class="btn-col-action btn-delete-col" data-action="delete">×</button>
        `;
        colEl.appendChild(actionsEl);

        // --- Slots Container ---
        const slotsEl = document.createElement("div");
        slotsEl.className = "slots";

        col.slots.forEach((s, slotIdx) => {
            // Stats counting
            if (slotIdx === 3) {
                if (s.processStatus === 'HAPPY') stats.happy++;
                else if (s.processStatus === 'NEUTRAL') stats.neutral++;
                else if (s.processStatus === 'SAD') stats.sad++;
            }

            // Linked Text Logic (Input gekoppeld aan Output van andere stap)
            let displayText = s.text;
            let isLinked = false;
            if (slotIdx === 2 && s.linkedSourceId && allOutputMap[s.linkedSourceId]) {
                displayText = allOutputMap[s.linkedSourceId];
                isLinked = true;
            }

            // Score Badge Logic
            const score = calculateLSSScore(s.qa);
            let scoreBadgeHTML = "";
            if (score !== null) {
                const badgeClass = score >= 80 ? 'score-high' : (score >= 60 ? 'score-med' : 'score-low');
                scoreBadgeHTML = `<div class="qa-score-badge ${badgeClass}">Q: ${score}%</div>`;
            }
            if (slotIdx === 1 && s.systemData?.calculatedScore != null) {
                 const sysScore = s.systemData.calculatedScore;
                 const badgeClass = sysScore >= 80 ? 'score-high' : (sysScore >= 60 ? 'score-med' : 'score-low');
                 scoreBadgeHTML += `<div class="qa-score-badge ${badgeClass}" style="bottom:22px">Sys: ${sysScore}%</div>`;
            }

            // Status Class
            let statusClass = "";
            if (slotIdx === 3) {
                if (s.processStatus === 'HAPPY') statusClass = "status-happy";
                if (s.processStatus === 'NEUTRAL') statusClass = "status-neutral";
                if (s.processStatus === 'SAD') statusClass = "status-sad";
            }

            // Slot Element
            const slotDiv = document.createElement("div");
            slotDiv.className = "slot";
            
            // Sticky Content Construction
            // Note: We use innerHTML for structure but textContent for user data inside the editable div
            slotDiv.innerHTML = `
                <div class="sticky ${statusClass}" data-col="${colIdx}" data-slot="${slotIdx}">
                    <div class="sticky-grip"></div>
                    ${slotIdx === 3 ? `<div class="label-tl">${s.type === 'Afspraak' ? '📅' : '📝'} ${s.type}</div>` : ''}
                    ${slotIdx === 3 ? `<div class="label-br">${s.processValue}</div>` : ''}
                    ${(slotIdx === 4 && myOutputId) ? `<div class="id-tag">${myOutputId}</div>` : ''}
                    ${scoreBadgeHTML}
                    ${isLinked ? '<span class="link-icon" style="position:absolute; top:2px; right:4px;">🔗</span>' : ''}
                    <div class="sticky-content">
                        <div class="text" contenteditable="true" spellcheck="false"></div>
                    </div>
                </div>
            `;
            
            // Safely set text content
            slotDiv.querySelector(".text").textContent = displayText;

            // Events
            const stickyEl = slotDiv.querySelector(".sticky");
            
            // Double click -> Modal
            stickyEl.addEventListener('dblclick', (e) => {
                // Alleen specifieke rijen openen modal
                if ([1, 2, 3, 4].includes(slotIdx)) {
                    e.stopPropagation();
                    openModalFn(colIdx, slotIdx);
                }
            });

            // Input -> State Update (Debounce zou hier goed zijn voor performance, maar direct is responsiever)
            const textEl = slotDiv.querySelector(".text");
            textEl.addEventListener('input', () => {
                // Als gelinkt, ontkoppel
                if (isLinked) {
                    state.updateStickyText(colIdx, slotIdx, textEl.textContent); 
                    // Je zou hier s.linkedSourceId = null moeten zetten in state updateStickyText
                } else {
                    state.updateStickyText(colIdx, slotIdx, textEl.textContent);
                }
            });

            slotsEl.appendChild(slotDiv);
        });

        colEl.appendChild(slotsEl);
        colsContainer.appendChild(colEl);

        // --- Connector Logic ---
        if (colIdx < activeSheet.columns.length - 1) {
             // Zoek volgende zichtbare kolom
             let nextVisible = null;
             for(let i = colIdx + 1; i < activeSheet.columns.length; i++){
                 if(activeSheet.columns[i].isVisible !== false){ nextVisible = activeSheet.columns[i]; break; }
             }

             if(nextVisible) {
                 const connEl = document.createElement("div");
                 
                 if(nextVisible.isParallel) {
                     connEl.className = "col-connector parallel-connector";
                     connEl.innerHTML = `<div class="parallel-line"></div><div class="parallel-badge">||</div>`;
                 } else {
                     connEl.className = "col-connector";
                     if(col.hasTransition) {
                         connEl.innerHTML = `
                            <div class="connector-active">
                                <input class="connector-input-minimal" placeholder="Tijd..." value="">
                                <div class="connector-arrow-minimal"></div>
                                <span class="connector-text-export"></span>
                                <button class="connector-delete">×</button>
                            </div>`;
                         
                         // Safe value setting & binding
                         const inp = connEl.querySelector("input");
                         inp.value = col.transitionNext || "";
                         inp.oninput = (e) => state.setTransition(colIdx, e.target.value);
                         
                         connEl.querySelector(".connector-text-export").textContent = col.transitionNext;
                         connEl.querySelector(".connector-delete").onclick = () => state.setTransition(colIdx, null);

                     } else {
                         const btn = document.createElement("button");
                         btn.className = "connector-add";
                         btn.textContent = "+";
                         btn.onclick = () => state.setTransition(colIdx, "");
                         connEl.appendChild(btn);
                     }
                 }
                 colsContainer.appendChild(connEl);
             }
        }
    });

    // 4. Update Stats in UI
    document.getElementById("countHappy").textContent = stats.happy;
    document.getElementById("countNeutral").textContent = stats.neutral;
    document.getElementById("countSad").textContent = stats.sad;

    // 5. Sync Heights
    // Timeout om rendering browser kans te geven
    setTimeout(syncRowHeights, 0);
}

// --- Event Delegation Setup (Call this once in main.js) ---

export function setupDelegatedEvents() {
    const colsContainer = document.getElementById("cols");

    colsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-col-action');
        if (!btn) return;

        const colEl = btn.closest('.col');
        if (!colEl) return;
        
        const idx = parseInt(colEl.dataset.idx);
        const action = btn.dataset.action;

        switch(action) {
            case 'move':
                state.moveColumn(idx, parseInt(btn.dataset.dir));
                break;
            case 'delete':
                if (confirm("Kolom verwijderen?")) state.deleteColumn(idx);
                break;
            case 'add':
                state.addColumn(idx); // Add AFTER this index
                break;
            case 'hide':
                state.setColVisibility(idx, false);
                break;
            case 'parallel':
                state.toggleParallel(idx);
                break;
        }
    });
}