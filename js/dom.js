import { state } from './state.js';
import { IO_CRITERIA } from './config.js';

function calculateLSSScore(qa) {
    if (!qa) return null;
    let totalW = 0, earnedW = 0;
    IO_CRITERIA.forEach(c => {
        const val = qa[c.key]?.result; 
        if (val === 'OK' || val === 'NOT_OK') {
            totalW += c.weight;
            if (val === 'OK') earnedW += c.weight;
        }
    });
    return totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
}

function syncRowHeights() {
    const rowHeaders = document.getElementById("row-headers").children;
    if (!rowHeaders.length) return;
    const heights = [];
    for (let r = 0; r < 6; r++) {
        let max = 160;
        const slots = document.querySelectorAll(`.col .slots .slot:nth-child(${r + 1})`);
        slots.forEach(s => {
            if (s.firstElementChild) {
                const h = s.firstElementChild.offsetHeight;
                if (h > max) max = h;
            }
        });
        heights.push(max);
    }
    requestAnimationFrame(() => {
        for (let r = 0; r < 6; r++) {
            const hStr = `${heights[r]}px`;
            if (rowHeaders[r]) rowHeaders[r].style.height = hStr;
            const slots = document.querySelectorAll(`.col .slots .slot:nth-child(${r + 1})`);
            for (let i = 0; i < slots.length; i++) slots[i].style.height = hStr;
        }
        if (heights.length >= 3) {
            const gapSize = 20; 
            const processOffset = heights[0] + heights[1] + heights[2] + (3 * gapSize);
            const connectors = document.querySelectorAll('.col-connector');
            connectors.forEach(c => {
                if (!c.classList.contains('parallel-connector')) {
                    c.style.paddingTop = `${processOffset}px`;
                }
            });
        }
    });
}

export function renderBoard(openModalFn) {
    const activeSheet = state.activeSheet;
    if (!activeSheet) return;

    // Alleen renderen als de gebruiker niet actief typt
    const focusedEl = document.activeElement;
    if (focusedEl && (focusedEl.classList.contains('text') || focusedEl.classList.contains('connector-input-minimal'))) {
        return; 
    }

    const select = document.getElementById("sheetSelect");
    if (select) {
        select.innerHTML = "";
        state.project.sheets.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.id; 
            opt.textContent = s.name;
            opt.selected = (s.id === state.project.activeSheetId);
            select.appendChild(opt);
        });
    }

    const headDisp = document.getElementById("board-header-display");
    if(headDisp) headDisp.textContent = activeSheet.name;
    
    const rowHeaderContainer = document.getElementById("row-headers");
    if (rowHeaderContainer.children.length === 0) {
        ["Leverancier", "Systeem", "Input", "Proces", "Output", "Klant"].forEach(l => {
            const div = document.createElement("div");
            div.className = "row-header";
            div.innerHTML = `<span>${l}</span>`;
            rowHeaderContainer.appendChild(div);
        });
    }

    const colsContainer = document.getElementById("cols");
    colsContainer.innerHTML = ""; 

    const offsets = state.getGlobalCountersBeforeActive();
    let localInCounter = 0;
    let localOutCounter = 0;
    const allOutputMap = state.getAllOutputs();
    const stats = { happy: 0, neutral: 0, sad: 0 };

    activeSheet.columns.forEach((col, colIdx) => {
        if (col.isVisible === false) return; 

        let myInputId = "";
        let myOutputId = "";
        if (col.slots[2].text?.trim()) { localInCounter++; myInputId = `IN${offsets.inStart + localInCounter}`; }
        if (col.slots[4].text?.trim()) { localOutCounter++; myOutputId = `OUT${offsets.outStart + localOutCounter}`; }

        const colEl = document.createElement("div");
        colEl.className = `col ${col.isParallel ? 'is-parallel' : ''}`;
        colEl.dataset.idx = colIdx;

        const actionsEl = document.createElement("div");
        actionsEl.className = "col-actions";
        actionsEl.innerHTML = `
            <button class="btn-col-action btn-arrow" data-action="move" data-dir="-1">←</button>
            <div class="btn-col-action btn-move-col">↔</div>
            <button class="btn-col-action btn-arrow" data-action="move" data-dir="1">→</button>
            ${colIdx > 0 ? `<button class="btn-col-action btn-parallel ${col.isParallel ? 'active' : ''}" data-action="parallel">∥</button>` : ''}
            <button class="btn-col-action btn-hide-col" data-action="hide">👁️</button>
            <button class="btn-col-action btn-add-col-here" data-action="add">+</button>
            <button class="btn-col-action btn-delete-col" data-action="delete">×</button>
        `;
        colEl.appendChild(actionsEl);

        const slotsEl = document.createElement("div");
        slotsEl.className = "slots";

        col.slots.forEach((s, slotIdx) => {
            if (slotIdx === 3) {
                if (s.processStatus === 'HAPPY') stats.happy++;
                else if (s.processStatus === 'NEUTRAL') stats.neutral++;
                else if (s.processStatus === 'SAD') stats.sad++;
            }

            let displayText = s.text;
            let isLinked = false;
            if (slotIdx === 2 && s.linkedSourceId && allOutputMap[s.linkedSourceId]) {
                displayText = allOutputMap[s.linkedSourceId];
                isLinked = true;
            }

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

            let statusClass = "";
            if (slotIdx === 3 && s.processStatus) { statusClass = `status-${s.processStatus.toLowerCase()}`; }

            let typeIcon = '📝';
            if (s.type === 'Afspraak') typeIcon = '📅';
            if (s.type === 'Besluit') typeIcon = '💎';
            if (s.type === 'Wacht') typeIcon = '⏳';

            const slotDiv = document.createElement("div");
            slotDiv.className = "slot";
            
            slotDiv.innerHTML = `
                <div class="sticky ${statusClass}" data-col="${colIdx}" data-slot="${slotIdx}">
                    <div class="sticky-grip"></div>
                    ${(slotIdx === 3 && s.type) ? `<div class="label-tl">${typeIcon} ${s.type}</div>` : ''}
                    ${(slotIdx === 3 && s.processValue) ? `<div class="label-br">${s.processValue}</div>` : ''}
                    ${(slotIdx === 2 && myInputId) ? `<div class="id-tag">${myInputId}</div>` : ''}
                    ${(slotIdx === 4 && myOutputId) ? `<div class="id-tag">${myOutputId}</div>` : ''}
                    ${scoreBadgeHTML}
                    ${isLinked ? '<span class="link-icon" style="position:absolute; top:2px; right:4px;">🔗</span>' : ''}
                    <div class="sticky-content">
                        <div class="text" contenteditable="true" spellcheck="false" ${isLinked ? 'data-linked="true"' : ''}></div>
                    </div>
                </div>
            `;
            
            const textEl = slotDiv.querySelector(".text");
            textEl.textContent = displayText;
            const stickyEl = slotDiv.querySelector(".sticky");

            // --- DE DEFINITIEVE CLICK & DUBBELKLIK FIX ---
            let lastClickTime = 0;

            stickyEl.addEventListener('click', (e) => {
                const currentTime = new Date().getTime();
                const timeDiff = currentTime - lastClickTime;

                if (timeDiff < 300 && timeDiff > 0) {
                    // DUBBELKLIK GEREGISTREERD
                    lastClickTime = 0; // Reset
                    if ([1, 2, 3].includes(slotIdx)) {
                        e.preventDefault();
                        e.stopPropagation();
                        openModalFn(colIdx, slotIdx);
                    }
                } else {
                    // ENKELE KLIK ACTIE: Focus op tekst
                    lastClickTime = currentTime;
                    
                    // We wachten heel even om te zien of er een tweede klik komt
                    setTimeout(() => {
                        if (lastClickTime === currentTime) {
                            textEl.focus();
                            // Cursor naar het einde zetten
                            const range = document.createRange();
                            const sel = window.getSelection();
                            range.selectNodeContents(textEl);
                            range.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }, 300);
                }
            });

            textEl.addEventListener('input', () => {
                state.updateStickyText(colIdx, slotIdx, textEl.textContent);
            });

            textEl.addEventListener('blur', () => {
                state.saveToStorage(); 
            });

            slotsEl.appendChild(slotDiv);
        });

        colEl.appendChild(slotsEl);
        colsContainer.appendChild(colEl);

        // Connectors logic (onveranderd)
        if (colIdx < activeSheet.columns.length - 1) {
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
                         connEl.innerHTML = `<div class="connector-active"><input class="connector-input-minimal" placeholder="Tijd..."><div class="connector-arrow-minimal"></div><span class="connector-text-export"></span><button class="connector-delete">×</button></div>`;
                         const inp = connEl.querySelector("input");
                         inp.value = col.transitionNext || "";
                         inp.oninput = (e) => { state.setTransition(colIdx, e.target.value); connEl.querySelector(".connector-text-export").textContent = e.target.value; };
                         inp.onblur = () => state.saveToStorage();
                         connEl.querySelector(".connector-delete").onclick = () => { state.setTransition(colIdx, null); state.saveToStorage(); };
                     } else {
                         const btn = document.createElement("button");
                         btn.className = "connector-add";
                         btn.textContent = "+";
                         btn.onclick = () => { state.setTransition(colIdx, ""); state.saveToStorage(); };
                         connEl.appendChild(btn);
                     }
                 }
                 colsContainer.appendChild(connEl);
             }
        }
    });

    document.getElementById("countHappy").textContent = stats.happy;
    document.getElementById("countNeutral").textContent = stats.neutral;
    document.getElementById("countSad").textContent = stats.sad;
    setTimeout(syncRowHeights, 0);
}

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
            case 'move': state.moveColumn(idx, parseInt(btn.dataset.dir)); break;
            case 'delete': if (confirm("Kolom verwijderen?")) state.deleteColumn(idx); break;
            case 'add': state.addColumn(idx); break;
            case 'hide': state.setColVisibility(idx, false); break;
            case 'parallel': 
                if (state.toggleParallel) state.toggleParallel(idx); 
                else { const col = state.activeSheet.columns[idx]; col.isParallel = !col.isParallel; state.saveToStorage(); }
                break;
        }
    });
}