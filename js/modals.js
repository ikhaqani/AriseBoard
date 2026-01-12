import { state } from './state.js';
import { IO_CRITERIA, SYSTEM_QUESTIONS } from './config.js';
import { renderBoard } from './dom.js';

let editingSticky = null;

export function openColumnManager() {
    const sheet = state.getActiveSheet();
    const list = document.getElementById("colManagerList");
    list.innerHTML = "";
    
    sheet.columns.forEach((col, idx) => {
        const procText = col.slots[3].text || `Kolom ${idx + 1}`;
        const div = document.createElement("div");
        div.className = "col-manager-item";
        div.innerHTML = `
            <span class="col-manager-label">${idx+1}. ${procText.substring(0,30)}</span>
            <label class="toggle-switch">
                <input type="checkbox" ${col.isVisible !== false ? 'checked' : ''} onchange="window.app.setColVis(${idx}, this.checked)">
                <span class="slider"></span>
            </label>
        `;
        list.appendChild(div);
    });
    document.getElementById("colManagerModal").style.display = 'grid';
}

export function openEditModal(c, s) {
    editingSticky = { colIdx: c, slotIdx: s };
    const sheet = state.getActiveSheet();
    const data = sheet.columns[c].slots[s];
    const modal = document.getElementById("editModal");
    const content = document.getElementById("modalContent");
    document.getElementById("modalTitle").innerText = s===3 ? "Proces Stap" : (s===1 ? "Systeem" : "Specificaties");

    if (s === 3) {
        content.innerHTML = `
          <div class="modal-label">Status</div>
          <div class="status-selector">
            <div class="status-option ${data.processStatus==='SAD'?'selected-sad':''}" data-val="SAD"><span class="status-emoji">☹️</span></div>
            <div class="status-option ${data.processStatus==='NEUTRAL'?'selected-neu':''}" data-val="NEUTRAL"><span class="status-emoji">😐</span></div>
            <div class="status-option ${data.processStatus==='HAPPY'?'selected-hap':''}" data-val="HAPPY"><span class="status-emoji">🙂</span></div>
          </div>
          <div class="metrics-grid">
            <div><div class="modal-label">Type</div><select id="modalType"><option value="Taak" ${data.type==='Taak'?'selected':''}>📝 Taak</option><option value="Afspraak" ${data.type==='Afspraak'?'selected':''}>📅 Afspraak</option></select></div>
            <div><div class="modal-label">Waarde</div><select id="modalValue"><option value="VA" ${data.processValue==='VA'?'selected':''}>VA - Klantwaarde</option><option value="BNVA" ${data.processValue==='BNVA'?'selected':''}>BNVA - Noodzakelijk</option><option value="NVA" ${data.processValue==='NVA'?'selected':''}>NVA - Verspilling</option></select></div>
          </div>`;
          
          // Add click handlers for status options
          setTimeout(() => {
              content.querySelectorAll('.status-option').forEach(opt => {
                  opt.onclick = () => {
                      content.querySelectorAll('.status-option').forEach(el => el.className = 'status-option');
                      const val = opt.dataset.val;
                      opt.classList.add(val === 'SAD' ? 'selected-sad' : (val === 'NEUTRAL' ? 'selected-neu' : 'selected-hap'));
                      opt.dataset.selected = "true";
                  };
                  if(opt.classList.contains('selected-sad') || opt.classList.contains('selected-neu') || opt.classList.contains('selected-hap')) {
                      opt.dataset.selected = "true";
                  }
              });
          }, 0);

    } else if (s === 2 || s === 4) {
        content.innerHTML = `<table class="io-table" id="qaTable"></table>`;
        const table = content.querySelector("#qaTable");
        IO_CRITERIA.forEach(crit => {
            const res = data.qa[crit.key] || "";
            table.innerHTML += `<tr><td>${crit.label}</td><td><select class="qa-input" data-key="${crit.key}"><option value="">-</option><option value="OK" ${res==='OK'?'selected':''}>Voldoet</option><option value="NOT_OK" ${res==='NOT_OK'?'selected':''}>Niet OK</option></select></td></tr>`;
        });
    } else if (s === 1) {
        content.innerHTML = `<div id="sysQs"></div>`;
        const div = content.querySelector("#sysQs");
        const sysData = data.systemData || {};
        SYSTEM_QUESTIONS.forEach(q => {
            div.innerHTML += `<div style="margin-bottom:10px;"><div class="modal-label">${q.label}</div><select class="sys-input" data-id="${q.id}">
            ${q.options.map((opt, i) => `<option value="${i}" ${sysData[q.id]===i?'selected':''}>${opt}</option>`).join('')}
            </select></div>`;
        });
    } else {
        content.innerHTML = "Geen instellingen.";
    }
    modal.style.display = "grid";
}

export function saveModalDetails() {
    if(!editingSticky) return;
    const { colIdx, slotIdx } = editingSticky;
    const sheet = state.getActiveSheet();
    const s = sheet.columns[colIdx].slots[slotIdx];
    const content = document.getElementById("modalContent");

    if (slotIdx === 3) {
        const sel = content.querySelector('.status-option[data-selected="true"]');
        s.processStatus = sel ? sel.dataset.val : null;
        s.type = document.getElementById("modalType").value;
        s.processValue = document.getElementById("modalValue").value;
    } else if (slotIdx === 2 || slotIdx === 4) {
        content.querySelectorAll('.qa-input').forEach(inp => s.qa[inp.dataset.key] = inp.value);
    } else if (slotIdx === 1) {
        let total = 0;
        content.querySelectorAll('.sys-input').forEach(inp => {
            const val = parseInt(inp.value);
            s.systemData[inp.dataset.id] = val;
            total += val;
        });
        s.systemData.calculatedScore = Math.round(100 * (1 - (total / 15)));
    }
    state.saveToStorage();
    document.getElementById("editModal").style.display = "none";
    renderBoard(openEditModal);
}