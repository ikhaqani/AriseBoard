import { state } from './state.js';
import { renderBoard } from './dom.js';
import { 
    IO_CRITERIA, 
    SYSTEM_QUESTIONS, 
    ACTIVITY_TYPES, 
    LEAN_VALUES, 
    PROCESS_STATUSES, 
    DISRUPTION_FREQUENCIES, 
    DEFINITION_TYPES 
} from './config.js';

let editingSticky = null;
let activeIoTab = 'def'; // 'def' (Definitie) of 'qual' (Kwaliteit)

// --- HTML Generators (Helpers) ---

/**
 * Genereert een set 'radio buttons' die eruit zien als knoppen.
 * @param {string} name - De naam voor de hidden input
 * @param {Array} options - Array van objecten {value, label} of strings
 * @param {string|number} selectedValue - De huidige waarde
 * @param {boolean} isHorizontal - Layout richting
 */
const createRadioGroup = (name, options, selectedValue, isHorizontal = false) => `
    <div class="radio-group-container ${isHorizontal ? 'horizontal' : 'vertical'}">
        ${options.map((opt, idx) => {
            // Support voor zowel simpele strings als configuratie objecten
            const val = opt.value ?? opt; 
            const label = opt.label ?? opt;
            const isSelected = String(val) === String(selectedValue);
            
            return `
                <div class="sys-opt ${isSelected ? 'selected' : ''}" 
                     data-group="${name}" 
                     data-value="${val}">
                    ${label}
                </div>
            `;
        }).join('')}
        <input type="hidden" name="${name}" value="${selectedValue ?? ''}">
    </div>
`;

/**
 * Genereert een dynamische lijst (voor Oorzaken/Maatregelen).
 */
const createDynamicList = (items, placeholder, type) => `
    <div class="dynamic-list-wrapper" data-type="${type}">
        ${items.map(item => `
            <div class="dynamic-row">
                <input type="text" value="${item}" class="def-input" placeholder="${placeholder}">
                <button class="btn-row-del-tiny" data-action="remove-row">×</button>
            </div>
        `).join('')}
    </div>
    <button class="btn-row-add btn-row-add-tiny" data-action="add-list-item" data-type="${type}">+ ${placeholder} toevoegen</button>
`;

// --- Tab Renderers ---

/**
 * Render Slot 1: Systeem Fit Analyse
 */
function renderSystemTab(data) {
    const sysData = data.systemData || {};
    let html = `<div id="systemWrapper"><div class="io-helper">Geef aan hoe goed dit systeem het proces ondersteunt.</div>`;
    
    SYSTEM_QUESTIONS.forEach(q => {
        // Gebruik index (0-3) als value, tenzij anders gedefinieerd
        const currentVal = sysData[q.id] ?? 0;
        
        // Map de opties array naar {value, label} voor de helper functie
        const optionsMapped = q.options.map((optText, idx) => ({ value: idx, label: optText }));

        html += `
            <div class="system-question">
                <div class="sys-q-title">${q.label}</div>
                ${createRadioGroup(`sys_${q.id}`, optionsMapped, currentVal, true)}
            </div>`;
    });
    return html + `</div>`;
}

/**
 * Render Slot 3: Proces Analyse (Status, RC/CM, Verstoringen)
 */
function renderProcessTab(data) {
    const status = data.processStatus || 'NEUTRAL'; // Default fallback
    const isHappy = status === 'HAPPY';
    const isBad = status === 'SAD' || status === 'NEUTRAL';

    // Status Selector genereren uit Config
    const statusHtml = PROCESS_STATUSES.map(s => `
        <div class="status-option ${status === s.value ? s.class : ''}" data-action="set-status" data-val="${s.value}">
            <span class="status-emoji">${s.emoji}</span>
            <span class="status-text">${s.label}</span>
        </div>
    `).join('');

    // Verstoringen tabel rijen
    const disruptRows = (data.disruptions || []).map((dis, i) => `
        <tr>
            <td><input class="def-input" value="${dis.scenario || ''}" placeholder="Scenario..."></td>
            <td>${createRadioGroup(`dis_freq_${i}`, DISRUPTION_FREQUENCIES, dis.frequency || DISRUPTION_FREQUENCIES[0], false)}</td>
            <td><input class="def-input" value="${dis.workaround || ''}" placeholder="Workaround..."></td>
            <td><button class="btn-row-del" data-action="remove-row">×</button></td>
        </tr>
    `).join('');

    return `
        <div class="modal-label">Proces Status</div>
        <div class="status-selector">
            ${statusHtml}
        </div>
        <input type="hidden" id="processStatus" value="${status}">

        <div class="metrics-grid" style="margin-top: 20px;">
            <div>
                <div class="modal-label">Type Activiteit</div>
                ${createRadioGroup('metaType', ACTIVITY_TYPES, data.type || 'Taak', true)}
            </div>
            <div>
                <div class="modal-label">Lean Waarde</div>
                ${createRadioGroup('metaValue', LEAN_VALUES, data.processValue || 'VA', true)}
            </div>
        </div>

        <div id="sectionHappy" style="display: ${isHappy ? 'block' : 'none'}; margin-top:15px;">
            <div class="modal-label" style="color:var(--ui-success)">Waarom werkt dit goed? (Succesfactoren)</div>
            <textarea id="successFactors" class="modal-input" placeholder="Bv. Standaard gevolgd, Cpk > 1.33...">${data.successFactors || ''}</textarea>
        </div>

        <div id="sectionBad" style="display: ${isBad ? 'block' : 'none'}; margin-top:15px;">
            <div class="tab-nav">
                <button class="tab-btn active" data-tab="analyse">Analyse</button>
                <button class="tab-btn" data-tab="disrupt">Verstoringen</button>
            </div>

            <div id="subTabAnalyse">
                <div class="modal-section-title">Oorzaken (Root Causes)</div>
                ${createDynamicList(data.causes || [], "Oorzaak", "RC")}
                
                <div class="modal-section-title" style="margin-top:15px;">Maatregelen (Countermeasures)</div>
                ${createDynamicList(data.improvements || [], "Maatregel", "CM")}
            </div>

            <div id="subTabDisrupt" style="display:none;">
                <div class="io-helper">Welke verstoringen treden op en wat is de workaround?</div>
                <table class="io-table proc-table">
                    <thead><tr><th style="width:30%">Scenario</th><th style="width:25%">Frequentie</th><th style="width:40%">Workaround</th><th></th></tr></thead>
                    <tbody id="disruptTbody">${disruptRows}</tbody>
                </table>
                <button class="btn-row-add" data-action="add-disrupt-row">+ Verstoring toevoegen</button>
            </div>
        </div>
    `;
}

/**
 * Render Slot 2 & 4: Input / Output Specificaties
 */
function renderIoTab(data, isInputRow) {
    const isDef = activeIoTab === 'def';
    
    // Link Logic (Alleen voor inputs - Slot 2)
    let linkHtml = '';
    if (isInputRow) {
        const allOutputs = state.getAllOutputs();
        const options = Object.entries(allOutputs).map(([id, text]) => 
            `<option value="${id}" ${data.linkedSourceId === id ? 'selected' : ''}>${id}: ${text.substring(0,40)}...</option>`
        ).join('');
        
        linkHtml = `
            <div style="margin-bottom: 20px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <div class="modal-label">Input Bron (Koppel aan Output)</div>
                <select id="inputSourceSelect" class="modal-input">
                    <option value="">-- Geen / Externe Input --</option>
                    ${options}
                </select>
                <div id="linkedInfoText" style="display:${data.linkedSourceId ? 'block' : 'none'}; color:#64b5f6; font-size:11px; margin-top:6px;">
                    🔗 Gekoppeld. Tekst wordt automatisch bijgewerkt.
                </div>
            </div>`;
    }

    // Tabs Navigatie
    let html = `
        <div class="tab-nav">
            <button class="tab-btn ${isDef ? 'active' : ''}" data-tab="def">1. Definitie & Specs</button>
            <button class="tab-btn ${!isDef ? 'active' : ''}" data-tab="qual">2. Kwaliteits Criteria</button>
        </div>
    `;

    // Content: Definitie Tabel
    if (isDef) {
        const rows = (data.inputDefinitions || []).map((def, i) => `
            <tr>
                <td><input class="def-input" value="${def.item || ''}" placeholder="Naam item..."></td>
                <td><textarea class="def-sub-input" placeholder="Specificaties...">${def.specifications || ''}</textarea></td>
                <td>${createRadioGroup(`def_type_${i}`, DEFINITION_TYPES, def.type || DEFINITION_TYPES[0].value, true)}</td>
                <td><button class="btn-row-del" data-action="remove-row">×</button></td>
            </tr>
        `).join('');

        html += `
            <div id="ioTabDef">
                ${linkHtml}
                <table class="io-table def-table">
                    <thead><tr><th style="width:25%">Item</th><th style="width:40%">Specificaties</th><th style="width:30%">Type</th><th></th></tr></thead>
                    <tbody id="defTbody">${rows}</tbody>
                </table>
                <button class="btn-row-add" data-action="add-def-row">+ Specificatie toevoegen</button>
            </div>
        `;
    } 
    // Content: Kwaliteit (QA) Tabel
    else {
        html += `
            <div id="ioTabQual">
                <div class="io-helper">Beoordeel de kwaliteit van de input/output.</div>
                <table class="io-table">
                    <thead><tr><th>Criterium</th><th>Resultaat</th><th>Opmerking</th></tr></thead>
                    <tbody>
                        ${IO_CRITERIA.map(c => {
                            const qa = data.qa[c.key] || {};
                            return `
                                <tr>
                                    <td><div style="font-weight:bold">${c.label}</div><div style="font-size:9px; opacity:0.7">${c.meet}</div></td>
                                    <td style="width:240px;">
                                        ${createRadioGroup(`qa_${c.key}`, 
                                            [{value:'OK', label:'OK'}, {value:'NOT_OK', label:'Niet OK'}, {value:'NA', label:'N.V.T'}], 
                                            qa.result || '', true
                                        )}
                                    </td>
                                    <td><textarea id="note_${c.key}" class="io-note" placeholder="Opmerking...">${qa.note || ''}</textarea></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    return html;
}

// --- Main Modal Entry ---

export function openEditModal(colIdx, slotIdx) {
    editingSticky = { colIdx, slotIdx };
    const sheet = state.activeSheet;
    const data = sheet.columns[colIdx].slots[slotIdx];
    
    const modal = document.getElementById("editModal");
    const content = document.getElementById("modalContent");
    const title = document.getElementById("modalTitle");

    // Reset interne state bij openen
    activeIoTab = 'def'; 

    // Render Logic
    const render = () => {
        if (slotIdx === 3) {
            title.textContent = "Proces Stap Analyse";
            content.innerHTML = renderProcessTab(data);
        } else if (slotIdx === 1) {
            title.textContent = "Systeem Fit Analyse";
            content.innerHTML = renderSystemTab(data);
        } else if (slotIdx === 2 || slotIdx === 4) {
            title.textContent = slotIdx === 2 ? "Input Specificaties" : "Output Specificaties";
            content.innerHTML = renderIoTab(data, slotIdx === 2);
        }
        setupEventListeners(data); // Bind alle clicks in 1 keer
    };

    render();
    modal.style.display = "grid";

    // Koppel de save/cancel buttons (die buiten modalContent staan)
    const saveBtn = document.getElementById("btnSaveModal");
    const cancelBtn = document.getElementById("btnCancelModal");
    
    // Zorg dat we geen dubbele listeners stapelen (overschrijf onclick)
    saveBtn.onclick = () => saveModalDetails();
    cancelBtn.onclick = () => modal.style.display = "none";
}

// --- Event Delegation (The Smart Way) ---

function setupEventListeners(data) {
    const content = document.getElementById("modalContent");

    // 1. Radio Buttons (Generic - werkt voor System, Type, Value, QA, etc.)
    content.addEventListener('click', (e) => {
        const opt = e.target.closest('.sys-opt');
        if (opt) {
            const group = opt.dataset.group;
            // Deselect siblings
            content.querySelectorAll(`.sys-opt[data-group="${group}"]`).forEach(el => el.classList.remove('selected'));
            // Select clicked
            opt.classList.add('selected');
            // Update hidden input
            const input = content.querySelector(`input[name="${group}"]`);
            if(input) input.value = opt.dataset.value;
        }
    });

    // 2. Tab Switching (IO & Proces Subtabs)
    content.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            const tabName = e.target.dataset.tab;
            
            // IO Tabs (Her-render nodig)
            if (tabName === 'def' || tabName === 'qual') {
                activeIoTab = tabName;
                const { colIdx, slotIdx } = editingSticky;
                const stickyData = state.activeSheet.columns[colIdx].slots[slotIdx];
                content.innerHTML = renderIoTab(stickyData, slotIdx === 2);
                setupEventListeners(stickyData); // Re-bind na innerHTML verandering
            } 
            // Proces Subtabs (Alleen display toggle)
            else if (tabName === 'analyse' || tabName === 'disrupt') {
                content.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById('subTabAnalyse').style.display = tabName === 'analyse' ? 'block' : 'none';
                document.getElementById('subTabDisrupt').style.display = tabName === 'disrupt' ? 'block' : 'none';
            }
        }
    });

    // 3. Process Status Selection
    content.addEventListener('click', (e) => {
        const statusOpt = e.target.closest('.status-option');
        if (statusOpt) {
            // UI Reset
            PROCESS_STATUSES.forEach(s => {
                content.querySelectorAll(`.status-option.${s.class}`).forEach(el => el.classList.remove(s.class));
            });
            
            const val = statusOpt.dataset.val;
            document.getElementById('processStatus').value = val;
            
            // UI Set Active
            const configStatus = PROCESS_STATUSES.find(s => s.value === val);
            if (configStatus) statusOpt.classList.add(configStatus.class);

            // Toggle sections
            const secHappy = document.getElementById('sectionHappy');
            const secBad = document.getElementById('sectionBad');
            if(secHappy && secBad) {
                secHappy.style.display = val === 'HAPPY' ? 'block' : 'none';
                secBad.style.display = val !== 'HAPPY' ? 'block' : 'none';
            }
        }
    });

    // 4. Dynamic Rows (Add/Remove)
    content.addEventListener('click', (e) => {
        const target = e.target;
        
        // Remove Row
        if (target.dataset.action === 'remove-row') {
            target.closest('.dynamic-row, tr').remove();
        }

        // Add Root Cause / Countermeasure
        if (target.dataset.action === 'add-list-item') {
            const type = target.dataset.type;
            const wrapper = content.querySelector(`.dynamic-list-wrapper[data-type="${type}"]`);
            const div = document.createElement('div');
            div.className = "dynamic-row";
            div.innerHTML = `
                <input type="text" class="def-input" placeholder="${type === 'RC' ? 'Oorzaak...' : 'Maatregel...'}">
                <button class="btn-row-del-tiny" data-action="remove-row">×</button>
            `;
            wrapper.appendChild(div);
        }

        // Add Def Row
        if (target.dataset.action === 'add-def-row') {
            const tbody = document.getElementById('defTbody');
            const idx = tbody.children.length;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input class="def-input" placeholder="Naam item..."></td>
                <td><textarea class="def-sub-input"></textarea></td>
                <td>${createRadioGroup(`def_type_new_${idx}`, DEFINITION_TYPES, DEFINITION_TYPES[0].value, true)}</td>
                <td><button class="btn-row-del" data-action="remove-row">×</button></td>
            `;
            tbody.appendChild(tr);
        }

        // Add Disrupt Row
        if (target.dataset.action === 'add-disrupt-row') {
            const tbody = document.getElementById('disruptTbody');
            const idx = tbody.children.length;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input class="def-input" placeholder="Scenario..."></td>
                <td>${createRadioGroup(`dis_freq_new_${idx}`, DISRUPTION_FREQUENCIES, DISRUPTION_FREQUENCIES[0], false)}</td>
                <td><input class="def-input" placeholder="Workaround..."></td>
                <td><button class="btn-row-del" data-action="remove-row">×</button></td>
            `;
            tbody.appendChild(tr);
        }
    });

    // 5. Linked Input Change
    const linkSelect = document.getElementById('inputSourceSelect');
    if (linkSelect) {
        linkSelect.addEventListener('change', (e) => {
            const info = document.getElementById('linkedInfoText');
            info.style.display = e.target.value ? 'block' : 'none';
        });
    }
}

// --- Save Logic ---

export function saveModalDetails() {
    if (!editingSticky) return;
    const { colIdx, slotIdx } = editingSticky;
    const sheet = state.activeSheet;
    const s = sheet.columns[colIdx].slots[slotIdx];
    const content = document.getElementById("modalContent");

    if (slotIdx === 3) {
        // Process
        s.processStatus = document.getElementById('processStatus').value;
        s.successFactors = document.getElementById('successFactors').value;
        s.type = content.querySelector('input[name="metaType"]').value;
        s.processValue = content.querySelector('input[name="metaValue"]').value;

        // Lists
        s.causes = Array.from(content.querySelectorAll('.dynamic-list-wrapper[data-type="RC"] input')).map(i => i.value).filter(v => v);
        s.improvements = Array.from(content.querySelectorAll('.dynamic-list-wrapper[data-type="CM"] input')).map(i => i.value).filter(v => v);

        // Disruptions Table
        if (document.getElementById('disruptTbody')) {
            const rows = document.querySelectorAll('#disruptTbody tr');
            s.disruptions = Array.from(rows).map(tr => ({
                scenario: tr.querySelector('td:nth-child(1) input').value,
                frequency: tr.querySelector('td:nth-child(2) input[type="hidden"]').value,
                workaround: tr.querySelector('td:nth-child(3) input').value
            })).filter(d => d.scenario);
        }

    } else if (slotIdx === 1) {
        // System
        let total = 0;
        SYSTEM_QUESTIONS.forEach(q => {
            const val = parseInt(content.querySelector(`input[name="sys_${q.id}"]`).value || 0);
            s.systemData[q.id] = val;
            total += val;
        });
        
        // Score berekening: Max score is (aantal vragen * (opties - 1)). 
        // Bij 5 vragen en 4 opties (0,1,2,3) is max score 15.
        // Hoge input waarde = slecht (vaak workaround/fout).
        const maxScore = SYSTEM_QUESTIONS.length * 3;
        s.systemData.calculatedScore = Math.round(100 * (1 - (total / maxScore)));

    } else if (slotIdx === 2 || slotIdx === 4) {
        // IO Data
        
        // Link (Slot 2 only)
        if (slotIdx === 2) {
            const select = document.getElementById('inputSourceSelect');
            if (select) s.linkedSourceId = select.value || null;
        }

        // Definitions Table
        if (document.getElementById('defTbody')) {
            const rows = document.querySelectorAll('#defTbody tr');
            s.inputDefinitions = Array.from(rows).map(tr => ({
                item: tr.querySelector('td:nth-child(1) input').value,
                specifications: tr.querySelector('td:nth-child(2) textarea').value,
                type: tr.querySelector('td:nth-child(3) input[type="hidden"]').value
            })).filter(d => d.item);
        }

        // QA Data
        if (document.getElementById('ioTabQual')) {
            IO_CRITERIA.forEach(c => {
                const resultInput = content.querySelector(`input[name="qa_${c.key}"]`);
                const noteInput = document.getElementById(`note_${c.key}`);
                if (resultInput) {
                    s.qa[c.key] = {
                        result: resultInput.value,
                        note: noteInput ? noteInput.value : ""
                    };
                }
            });
        }
    }

    state.saveToStorage();
    document.getElementById("editModal").style.display = "none";
    
    // Forceer render update (al gebeurt dit meestal via de state observer)
    renderBoard(openEditModal); 
}