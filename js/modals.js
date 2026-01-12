import { state } from './state.js';
import { 
    IO_CRITERIA, 
    SYSTEM_QUESTIONS, 
    ACTIVITY_TYPES, 
    LEAN_VALUES, 
    PROCESS_STATUSES, 
    DISRUPTION_FREQUENCIES, 
    DEFINITION_TYPES 
} from './config.js';

// --- State Variables ---
let editingSticky = null;
let activeIoTab = 'def'; 
let areListenersAttached = false; // Zorgt dat we maar 1x luisteraars instellen

// --- HTML Generators ---

const createRadioGroup = (name, options, selectedValue, isHorizontal = false) => `
    <div class="radio-group-container ${isHorizontal ? 'horizontal' : 'vertical'}">
        ${options.map((opt) => {
            const val = opt.value ?? opt; 
            const label = opt.label ?? opt;
            // Strict check: Zorg dat 0 niet als 'niets' wordt gezien
            const isSelected = selectedValue !== null && selectedValue !== undefined && String(val) === String(selectedValue);
            
            return `
                <div class="sys-opt ${isSelected ? 'selected' : ''}" 
                     data-value="${val}">
                    ${label}
                </div>
            `;
        }).join('')}
        <input type="hidden" name="${name}" value="${selectedValue !== null && selectedValue !== undefined ? selectedValue : ''}">
    </div>
`;

const createDynamicList = (items, placeholder, type) => {
    const displayItems = (items && items.length > 0) ? items : [''];
    return `
    <div class="dynamic-list-wrapper" data-type="${type}">
        ${displayItems.map(item => `
            <div class="dynamic-row">
                <input type="text" value="${item}" class="def-input" placeholder="${placeholder}">
                <button class="btn-row-del-tiny" data-action="remove-row" title="Verwijder regel">×</button>
            </div>
        `).join('')}
    </div>
    <button class="btn-row-add btn-row-add-tiny" data-action="add-list-item" data-type="${type}">+ ${placeholder} toevoegen</button>
`;
};

// --- Render Logic (Intern) ---

function getStickyData() {
    if (!editingSticky) return null;
    const sheet = state.activeSheet;
    return sheet.columns[editingSticky.colIdx].slots[editingSticky.slotIdx];
}

function renderContent() {
    const data = getStickyData();
    if (!data) return;

    const slotIdx = editingSticky.slotIdx;
    const content = document.getElementById("modalContent");
    const title = document.getElementById("modalTitle");

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
}

function renderSystemTab(data) {
    const sysData = data.systemData || {};
    let html = `<div id="systemWrapper"><div class="io-helper">Geef aan hoe goed dit systeem het proces ondersteunt.</div>`;
    
    SYSTEM_QUESTIONS.forEach(q => {
        const currentVal = sysData[q.id] !== undefined ? sysData[q.id] : null;
        const optionsMapped = q.options.map((optText, idx) => ({ value: idx, label: optText }));

        html += `
            <div class="system-question">
                <div class="sys-q-title">${q.label}</div>
                ${createRadioGroup(`sys_${q.id}`, optionsMapped, currentVal, true)}
            </div>`;
    });
    return html + `</div>`;
}

function renderProcessTab(data) {
    const status = data.processStatus; 
    const isHappy = status === 'HAPPY';
    const isBad = status === 'SAD' || status === 'NEUTRAL';

    const statusHtml = PROCESS_STATUSES.map(s => `
        <div class="status-option ${status === s.value ? s.class : ''}" data-action="set-status" data-val="${s.value}">
            <span class="status-emoji">${s.emoji}</span>
            <span class="status-text">${s.label}</span>
        </div>
    `).join('');

    const disruptions = (data.disruptions && data.disruptions.length > 0) 
        ? data.disruptions 
        : [{scenario:'', frequency:null, workaround:''}];

    const disruptRows = disruptions.map((dis, i) => `
        <tr>
            <td><input class="def-input" value="${dis.scenario || ''}" placeholder="Scenario..."></td>
            <td>${createRadioGroup(`dis_freq_${i}`, DISRUPTION_FREQUENCIES, dis.frequency, false)}</td>
            <td><input class="def-input" value="${dis.workaround || ''}" placeholder="Workaround..."></td>
            <td><button class="btn-row-del-tiny" data-action="remove-row">×</button></td>
        </tr>
    `).join('');

    return `
        <div class="modal-label">Proces Status ${!status ? '<span style="color:#ff5252">*</span>' : ''}</div>
        <div class="status-selector">
            ${statusHtml}
        </div>
        <input type="hidden" id="processStatus" value="${status || ''}">

        <div class="metrics-grid" style="margin-top: 24px;">
            <div>
                <div class="modal-label">Type Activiteit ${!data.type ? '<span style="color:#ff5252">*</span>' : ''}</div>
                ${createRadioGroup('metaType', ACTIVITY_TYPES, data.type, true)}
            </div>
            <div>
                <div class="modal-label">Lean Waarde ${!data.processValue ? '<span style="color:#ff5252">*</span>' : ''}</div>
                ${createRadioGroup('metaValue', LEAN_VALUES, data.processValue, true)}
            </div>
        </div>

        <div id="sectionHappy" style="display: ${isHappy ? 'block' : 'none'}; margin-top:20px;">
            <div class="modal-label" style="color:var(--ui-success)">Waarom werkt dit goed? (Succesfactoren)</div>
            <textarea id="successFactors" class="modal-input" placeholder="Bv. Standaard gevolgd, Cpk > 1.33...">${data.successFactors || ''}</textarea>
        </div>

        <div id="sectionBad" style="display: ${isBad ? 'block' : 'none'}; margin-top:20px;">
            <div class="tab-nav">
                <button class="tab-btn active" data-tab="analyse">Analyse</button>
                <button class="tab-btn" data-tab="disrupt">Verstoringen</button>
            </div>

            <div id="subTabAnalyse" style="padding-top: 10px;">
                <div class="modal-section-title">Oorzaken (Root Causes)</div>
                ${createDynamicList(data.causes || [], "Oorzaak", "RC")}
                
                <div class="modal-section-title" style="margin-top:20px;">Maatregelen (Countermeasures)</div>
                ${createDynamicList(data.improvements || [], "Maatregel", "CM")}
            </div>

            <div id="subTabDisrupt" style="display:none; padding-top: 10px;">
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

function renderIoTab(data, isInputRow) {
    const isDef = activeIoTab === 'def';
    let linkHtml = '';
    
    if (isInputRow) {
        const allOutputs = state.getAllOutputs();
        const options = Object.entries(allOutputs).map(([id, text]) => 
            `<option value="${id}" ${data.linkedSourceId === id ? 'selected' : ''}>${id}: ${text.substring(0,40)}...</option>`
        ).join('');
        
        linkHtml = `
            <div style="margin-bottom: 20px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                <div class="modal-label" style="margin-top:0;">Input Bron (Koppel aan Output)</div>
                <select id="inputSourceSelect" class="modal-input">
                    <option value="">-- Geen / Externe Input --</option>
                    ${options}
                </select>
                <div id="linkedInfoText" style="display:${data.linkedSourceId ? 'block' : 'none'}; color:var(--ui-accent); font-size:11px; margin-top:8px; font-weight:600;">
                    🔗 Gekoppeld. Tekst wordt automatisch bijgewerkt.
                </div>
            </div>`;
    }

    let html = `
        <div class="tab-nav">
            <button class="tab-btn ${isDef ? 'active' : ''}" data-tab="def">1. Definitie & Specs</button>
            <button class="tab-btn ${!isDef ? 'active' : ''}" data-tab="qual">2. Kwaliteits Criteria</button>
        </div>
    `;

    if (isDef) {
        const definitions = (data.inputDefinitions && data.inputDefinitions.length > 0) 
            ? data.inputDefinitions 
            : [{item:'', specifications:'', type:null}];

        const rows = definitions.map((def, i) => `
            <tr>
                <td><input class="def-input" value="${def.item || ''}" placeholder="Naam item..."></td>
                <td><textarea class="def-sub-input" placeholder="Specificaties...">${def.specifications || ''}</textarea></td>
                <td>${createRadioGroup(`def_type_${i}`, DEFINITION_TYPES, def.type, true)}</td>
                <td><button class="btn-row-del-tiny" data-action="remove-row">×</button></td>
            </tr>
        `).join('');

        html += `
            <div id="ioTabDef" style="padding-top: 10px;">
                ${linkHtml}
                <table class="io-table def-table">
                    <thead><tr><th style="width:25%">Item</th><th style="width:40%">Specificaties</th><th style="width:30%">Type</th><th></th></tr></thead>
                    <tbody id="defTbody">${rows}</tbody>
                </table>
                <button class="btn-row-add" data-action="add-def-row">+ Specificatie toevoegen</button>
            </div>
        `;
    } else {
        html += `
            <div id="ioTabQual" style="padding-top: 10px;">
                <div class="io-helper">Beoordeel de kwaliteit van de input/output.</div>
                <table class="io-table">
                    <thead><tr><th>Criterium</th><th>Resultaat</th><th>Opmerking</th></tr></thead>
                    <tbody>
                        ${IO_CRITERIA.map(c => {
                            const qa = data.qa[c.key] || {};
                            return `
                                <tr>
                                    <td><div style="font-weight:bold; color:#fff;">${c.label}</div><div style="font-size:10px; opacity:0.6">${c.meet}</div></td>
                                    <td style="width:240px;">
                                        ${createRadioGroup(`qa_${c.key}`, 
                                            [{value:'OK', label:'OK'}, {value:'NOT_OK', label:'Niet OK'}, {value:'NA', label:'N.V.T'}], 
                                            qa.result, true
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

// --- Main Entry ---

export function openEditModal(colIdx, slotIdx) {
    editingSticky = { colIdx, slotIdx };
    activeIoTab = 'def'; // Reset tab

    // 1. Initialiseer Listeners (Slechts 1x per sessie!)
    if (!areListenersAttached) {
        setupPermanentListeners();
        areListenersAttached = true;
    }

    // 2. Render de inhoud
    renderContent();

    // 3. Toon Modal
    document.getElementById("editModal").style.display = "grid";
}

// --- Permanent Listeners (De Fix) ---

function setupPermanentListeners() {
    const modal = document.getElementById("editModal");
    const content = document.getElementById("modalContent");

    // Sluit & Save Knoppen
    document.getElementById("modalSaveBtn").onclick = () => saveModalDetails();
    document.getElementById("modalCancelBtn").onclick = () => modal.style.display = "none";

    // 1. Universal Radio Toggle (Werkt altijd, ook voor dynamische rijen)
    content.addEventListener('click', (e) => {
        const opt = e.target.closest('.sys-opt');
        if (!opt) return;

        const container = opt.closest('.radio-group-container');
        const input = container.querySelector('input[type="hidden"]');
        const wasSelected = opt.classList.contains('selected');

        // Reset de hele groep
        container.querySelectorAll('.sys-opt').forEach(el => el.classList.remove('selected'));

        if (wasSelected) {
            // Deselecteer
            if(input) input.value = "";
        } else {
            // Selecteer
            opt.classList.add('selected');
            if(input) input.value = opt.dataset.value;
        }
    });

    // 2. Tab Switching
    content.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            const tabName = e.target.dataset.tab;
            
            if (tabName === 'def' || tabName === 'qual') {
                activeIoTab = tabName;
                renderContent(); // Re-render alles
            } 
            else if (tabName === 'analyse' || tabName === 'disrupt') {
                content.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const subAnalyse = document.getElementById('subTabAnalyse');
                const subDisrupt = document.getElementById('subTabDisrupt');
                if(subAnalyse) subAnalyse.style.display = tabName === 'analyse' ? 'block' : 'none';
                if(subDisrupt) subDisrupt.style.display = tabName === 'disrupt' ? 'block' : 'none';
            }
        }
    });

    // 3. Process Status (Smileys)
    content.addEventListener('click', (e) => {
        const statusOpt = e.target.closest('.status-option');
        if (!statusOpt) return;

        const val = statusOpt.dataset.val;
        const configStatus = PROCESS_STATUSES.find(s => s.value === val);
        const input = document.getElementById('processStatus');
        const wasActive = statusOpt.classList.contains(configStatus.class);

        // Reset alle smileys
        PROCESS_STATUSES.forEach(s => {
            content.querySelectorAll(`.status-option.${s.class}`).forEach(el => el.classList.remove(s.class));
        });

        if (wasActive) {
            input.value = ""; // Deselect
            const h = document.getElementById('sectionHappy'); 
            const b = document.getElementById('sectionBad');
            if(h) h.style.display = 'none'; 
            if(b) b.style.display = 'none';
        } else {
            input.value = val; // Select
            statusOpt.classList.add(configStatus.class);
            const isHappy = val === 'HAPPY';
            const h = document.getElementById('sectionHappy'); 
            const b = document.getElementById('sectionBad');
            if(h) h.style.display = isHappy ? 'block' : 'none';
            if(b) b.style.display = !isHappy ? 'block' : 'none';
        }
    });

    // 4. Dynamic Lists Add/Remove
    content.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.dataset.action === 'remove-row') {
            target.closest('.dynamic-row, tr').remove();
        }

        if (target.dataset.action === 'add-list-item') {
            const type = target.dataset.type;
            const wrapper = content.querySelector(`.dynamic-list-wrapper[data-type="${type}"]`);
            const div = document.createElement('div');
            div.className = "dynamic-row";
            div.innerHTML = `<input type="text" class="def-input" placeholder="${type === 'RC' ? 'Oorzaak...' : 'Maatregel...'}"><button class="btn-row-del-tiny" data-action="remove-row">×</button>`;
            wrapper.appendChild(div);
            div.querySelector('input').focus();
        }

        if (target.dataset.action === 'add-def-row') {
            const tbody = document.getElementById('defTbody');
            const idx = tbody.children.length; // Unieke index voor radiogroup name is niet meer nodig voor logica, maar wel voor HTML validiteit
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><input class="def-input" placeholder="Naam item..."></td><td><textarea class="def-sub-input"></textarea></td><td>${createRadioGroup(`def_type_new_${Date.now()}`, DEFINITION_TYPES, null, true)}</td><td><button class="btn-row-del-tiny" data-action="remove-row">×</button></td>`;
            tbody.appendChild(tr);
            tr.querySelector('input').focus();
        }

        if (target.dataset.action === 'add-disrupt-row') {
            const tbody = document.getElementById('disruptTbody');
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><input class="def-input" placeholder="Scenario..."></td><td>${createRadioGroup(`dis_freq_new_${Date.now()}`, DISRUPTION_FREQUENCIES, null, false)}</td><td><input class="def-input" placeholder="Workaround..."></td><td><button class="btn-row-del-tiny" data-action="remove-row">×</button></td>`;
            tbody.appendChild(tr);
            tr.querySelector('input').focus();
        }
    });

    // 5. Linked Input Change
    content.addEventListener('change', (e) => {
        if (e.target.id === 'inputSourceSelect') {
            const info = document.getElementById('linkedInfoText');
            if(info) info.style.display = e.target.value ? 'block' : 'none';
        }
    });
}

// --- Save Logic ---

export function saveModalDetails() {
    const data = getStickyData();
    if (!data) return;

    const slotIdx = editingSticky.slotIdx;
    const content = document.getElementById("modalContent");

    if (slotIdx === 3) {
        const statusVal = document.getElementById('processStatus').value;
        data.processStatus = statusVal === "" ? null : statusVal;
        
        const typeVal = content.querySelector('input[name="metaType"]').value;
        data.type = typeVal === "" ? null : typeVal;
        
        const procVal = content.querySelector('input[name="metaValue"]').value;
        data.processValue = procVal === "" ? null : procVal;

        data.successFactors = document.getElementById('successFactors').value;
        data.causes = Array.from(content.querySelectorAll('.dynamic-list-wrapper[data-type="RC"] input')).map(i => i.value).filter(v => v.trim());
        data.improvements = Array.from(content.querySelectorAll('.dynamic-list-wrapper[data-type="CM"] input')).map(i => i.value).filter(v => v.trim());

        if (document.getElementById('disruptTbody')) {
            const rows = document.querySelectorAll('#disruptTbody tr');
            data.disruptions = Array.from(rows).map(tr => ({
                scenario: tr.querySelector('td:nth-child(1) input').value,
                frequency: tr.querySelector('td:nth-child(2) input[type="hidden"]').value || null,
                workaround: tr.querySelector('td:nth-child(3) input').value
            })).filter(d => d.scenario.trim());
        }

    } else if (slotIdx === 1) {
        let total = 0;
        let answeredCount = 0;
        
        SYSTEM_QUESTIONS.forEach(q => {
            const valStr = content.querySelector(`input[name="sys_${q.id}"]`).value;
            if (valStr === "") {
                data.systemData[q.id] = null; 
            } else {
                const val = parseInt(valStr);
                data.systemData[q.id] = val;
                total += val;
                answeredCount++;
            }
        });

        if (answeredCount > 0) {
            const maxPoints = SYSTEM_QUESTIONS.length * 3;
            // score = 100 * (1 - (total / max)) -> 0 punten (beste) = 100%
            const safeTotal = Math.min(total, maxPoints);
            data.systemData.calculatedScore = Math.round(100 * (1 - (safeTotal / maxPoints)));
        } else {
            data.systemData.calculatedScore = null;
        }

    } else if (slotIdx === 2 || slotIdx === 4) {
        if (slotIdx === 2) {
            const select = document.getElementById('inputSourceSelect');
            if (select) data.linkedSourceId = select.value || null;
        }
        if (document.getElementById('defTbody')) {
            const rows = document.querySelectorAll('#defTbody tr');
            data.inputDefinitions = Array.from(rows).map(tr => ({
                item: tr.querySelector('td:nth-child(1) input').value,
                specifications: tr.querySelector('td:nth-child(2) textarea').value,
                type: tr.querySelector('td:nth-child(3) input[type="hidden"]').value || null
            })).filter(d => d.item.trim());
        }
        if (document.getElementById('ioTabQual')) {
            IO_CRITERIA.forEach(c => {
                const resultInput = content.querySelector(`input[name="qa_${c.key}"]`);
                const noteInput = document.getElementById(`note_${c.key}`);
                if (resultInput) {
                    const val = resultInput.value;
                    data.qa[c.key] = {
                        result: val === "" ? null : val,
                        note: noteInput ? noteInput.value : ""
                    };
                }
            });
        }
    }

    if (state.saveStickyDetails) {
        state.saveStickyDetails();
    } else {
        state.saveToStorage();
    }
    
    document.getElementById("editModal").style.display = "none";
}