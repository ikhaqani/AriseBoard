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

let editingSticky = null;
let activeIoTab = 'def';
let areListenersAttached = false;

const $ = (id) => document.getElementById(id);

const PROCESS_STATUS_DEFS = {
  HAPPY: {
    title: 'Onder controle',
    body:
      'Het proces verloopt voorspelbaar en stabiel. Input/werkstappen zijn duidelijk, afwijkingen zijn zeldzaam en impact is laag. Er is geen herstelwerk nodig om door te kunnen.'
  },
  NEUTRAL: {
    title: 'Aandachtspunt',
    body:
      'Het proces werkt meestal, maar is niet altijd voorspelbaar. Er zijn terugkerende haperingen of variatie waardoor soms extra afstemming/herstelwerk nodig is. Risico op verstoring is aanwezig.'
  },
  SAD: {
    title: 'Niet onder controle',
    body:
      'Het proces is instabiel of faalt regelmatig. Variatie en verstoringen zijn hoog, er is vaak herstelwerk nodig, en doorlooptijd/kwaliteit wordt structureel geraakt.'
  }
};

// =========================================================
// Werkbeleving / Werkplezier (Obstakel / Routine / Flow)
// =========================================================
const WORK_EXP_OPTIONS = [
  {
    value: 'OBSTACLE',
    icon: '🛠️',
    label: 'Obstakel',
    title: 'Obstakel',
    body: 'Kost energie & frustreert. Het proces werkt tegen me. (Actie: Verbeteren)',
    cls: 'selected-sad'
  },
  {
    value: 'ROUTINE',
    icon: '🤖',
    label: 'Routine',
    title: 'Routine',
    body: 'Saai & repeterend. Ik voeg hier geen unieke waarde toe. (Actie: Automatiseren)',
    cls: 'selected-neu'
  },
  {
    value: 'FLOW',
    icon: '🚀',
    label: 'Flow',
    title: 'Flow',
    body: 'Geeft energie & voldoening. Hier maak ik het verschil. (Actie: Koesteren)',
    cls: 'selected-hap'
  }
];

const escapeAttr = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const createRadioGroup = (name, options, selectedValue, isHorizontal = false) => `
  <div class="radio-group-container ${isHorizontal ? 'horizontal' : 'vertical'}">
    ${options
      .map((opt) => {
        const val = opt.value ?? opt;
        const label = opt.label ?? opt;
        const isSelected =
          selectedValue !== null &&
          selectedValue !== undefined &&
          String(val) === String(selectedValue);

        return `
          <div class="sys-opt ${isSelected ? 'selected' : ''}" data-value="${val}">
            ${label}
          </div>
        `;
      })
      .join('')}
    <input type="hidden" name="${name}" value="${selectedValue !== null && selectedValue !== undefined ? selectedValue : ''}">
  </div>
`;

const createDynamicList = (items, placeholder, type) => {
  const displayItems = items && items.length > 0 ? items : [''];
  return `
    <div class="dynamic-list-wrapper" data-type="${type}">
      ${displayItems
        .map(
          (item) => `
            <div class="dynamic-row">
              <input type="text" value="${escapeAttr(item)}" class="def-input" placeholder="${escapeAttr(placeholder)}">
              <button class="btn-row-del-tiny" data-action="remove-row" title="Verwijder regel" type="button">×</button>
            </div>
          `
        )
        .join('')}
    </div>
    <button class="btn-row-add btn-row-add-tiny" data-action="add-list-item" data-type="${escapeAttr(type)}" type="button">
      + ${escapeAttr(placeholder)} toevoegen
    </button>
  `;
};

const getStickyData = () => {
  if (!editingSticky) return null;
  const sheet = state.activeSheet;
  return sheet.columns[editingSticky.colIdx].slots[editingSticky.slotIdx];
};

const renderSystemTab = (data) => {
  const sysData = data.systemData || {};
  let html = `<div id="systemWrapper"><div class="io-helper">Geef aan hoe goed dit systeem het proces ondersteunt.</div>`;

  SYSTEM_QUESTIONS.forEach((q) => {
    const currentVal = sysData[q.id] !== undefined ? sysData[q.id] : null;
    const optionsMapped = q.options.map((optText, idx) => ({ value: idx, label: optText }));

    html += `
      <div class="system-question">
        <div class="sys-q-title">${escapeAttr(q.label)}</div>
        ${createRadioGroup(`sys_${q.id}`, optionsMapped, currentVal, true)}
      </div>
    `;
  });

  return `${html}</div>`;
};

const renderProcessTab = (data) => {
  const status = data.processStatus;
  const isHappy = status === 'HAPPY';
  const isBad = status === 'SAD' || status === 'NEUTRAL';

  const statusHtml = PROCESS_STATUSES.map((s) => {
    const def = PROCESS_STATUS_DEFS[s.value] || {};
    const tTitle = def.title || s.label || '';
    const tBody = def.body || '';
    return `
      <div class="status-option ${status === s.value ? s.class : ''}"
           data-action="set-status"
           data-val="${escapeAttr(s.value)}"
           data-tt-title="${escapeAttr(tTitle)}"
           data-tt-body="${escapeAttr(tBody)}"
           tabindex="0"
           role="button"
           aria-label="${escapeAttr(tTitle)}">
        <span class="status-emoji">${escapeAttr(s.emoji)}</span>
        <span class="status-text">${escapeAttr(s.label)}</span>
      </div>
    `;
  }).join('');

  // NEW: Werkbeleving UI
  const workExp = data.workExp || null;

  const workExpHtml = WORK_EXP_OPTIONS.map((o) => `
      <div class="status-option ${workExp === o.value ? o.cls : ''}"
           data-action="set-workexp"
           data-val="${escapeAttr(o.value)}"
           data-tt-title="${escapeAttr(o.title)}"
           data-tt-body="${escapeAttr(o.body)}"
           tabindex="0"
           role="button"
           aria-label="${escapeAttr(o.title)}">
        <span class="status-emoji">${escapeAttr(o.icon)}</span>
        <span class="status-text">${escapeAttr(o.label)}</span>
      </div>
  `).join('');

  const disruptions =
    data.disruptions && data.disruptions.length > 0
      ? data.disruptions
      : [{ scenario: '', frequency: null, workaround: '' }];

  const disruptRows = disruptions
    .map(
      (dis, i) => `
        <tr>
          <td><input class="def-input" value="${escapeAttr(dis.scenario || '')}" placeholder="Scenario..."></td>
          <td>${createRadioGroup(`dis_freq_${i}`, DISRUPTION_FREQUENCIES, dis.frequency, false)}</td>
          <td><input class="def-input" value="${escapeAttr(dis.workaround || '')}" placeholder="Workaround..."></td>
          <td><button class="btn-row-del-tiny" data-action="remove-row" type="button">×</button></td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="modal-label">Proces Status ${!status ? '<span style="color:#ff5252">*</span>' : ''}</div>
    <div class="status-selector">${statusHtml}</div>
    <input type="hidden" id="processStatus" value="${escapeAttr(status || '')}">

    <div class="modal-label" style="margin-top:16px;">Werkbeleving (Werkplezier)</div>
    <div class="io-helper" style="margin-top:0; margin-bottom:12px; font-size:13px;">
      Kies wat dit met je doet (en de bijbehorende actie-richting).
    </div>
    <div class="status-selector">${workExpHtml}</div>
    <input type="hidden" id="workExp" value="${escapeAttr(workExp || '')}">
    <textarea id="workExpNote" class="modal-input" placeholder="Korte context (optioneel): wat maakt dit een obstakel/routine/flow?">${escapeAttr(data.workExpNote || '')}</textarea>

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
      <textarea id="successFactors" class="modal-input" placeholder="Bv. Standaard gevolgd, Cpk > 1.33...">${escapeAttr(data.successFactors || '')}</textarea>
    </div>

    <div id="sectionBad" style="display: ${isBad ? 'block' : 'none'}; margin-top:20px;">
      <div class="tab-nav">
        <button class="tab-btn active" data-tab="analyse" type="button">Analyse</button>
        <button class="tab-btn" data-tab="disrupt" type="button">Verstoringen</button>
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
        <button class="btn-row-add" data-action="add-disrupt-row" type="button">+ Verstoring toevoegen</button>
      </div>
    </div>
  `;
};

const renderIoTab = (data, isInputRow) => {
  const isDef = activeIoTab === 'def';
  let linkHtml = '';

  if (isInputRow) {
    const allOutputs = state.getAllOutputs();
    const options = Object.entries(allOutputs)
      .map(([id, text]) => {
        const t = (text || '').substring(0, 40);
        return `<option value="${escapeAttr(id)}" ${data.linkedSourceId === id ? 'selected' : ''}>${escapeAttr(id)}: ${escapeAttr(t)}${(text || '').length > 40 ? '...' : ''}</option>`;
      })
      .join('');

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
      </div>
    `;
  }

  let html = `
    <div class="tab-nav">
      <button class="tab-btn ${isDef ? 'active' : ''}" data-tab="def" type="button">1. Definitie & Specs</button>
      <button class="tab-btn ${!isDef ? 'active' : ''}" data-tab="qual" type="button">2. Kwaliteits Criteria</button>
    </div>
  `;

  if (isDef) {
    const definitions =
      data.inputDefinitions && data.inputDefinitions.length > 0
        ? data.inputDefinitions
        : [{ item: '', specifications: '', type: null }];

    const rows = definitions
      .map(
        (def, i) => `
          <tr>
            <td><input class="def-input" value="${escapeAttr(def.item || '')}" placeholder="Naam item..."></td>
            <td><textarea class="def-sub-input" placeholder="Specificaties...">${escapeAttr(def.specifications || '')}</textarea></td>
            <td>${createRadioGroup(`def_type_${i}`, DEFINITION_TYPES, def.type, true)}</td>
            <td><button class="btn-row-del-tiny" data-action="remove-row" type="button">×</button></td>
          </tr>
        `
      )
      .join('');

    html += `
      <div id="ioTabDef" style="padding-top: 10px;">
        ${linkHtml}
        <table class="io-table def-table">
          <thead><tr><th style="width:25%">Item</th><th style="width:40%">Specificaties</th><th style="width:30%">Type</th><th></th></tr></thead>
          <tbody id="defTbody">${rows}</tbody>
        </table>
        <button class="btn-row-add" data-action="add-def-row" type="button">+ Specificatie toevoegen</button>
      </div>
    `;
  } else {
    html += `
      <div id="ioTabQual" style="padding-top: 10px;">
        <div class="io-helper">Beoordeel de kwaliteit van de input/output.</div>
        <table class="io-table">
          <thead><tr><th>Criterium</th><th>Resultaat</th><th>Opmerking</th></tr></thead>
          <tbody>
            ${IO_CRITERIA.map((c) => {
              const qa = data.qa?.[c.key] || {};
              return `
                <tr>
                  <td>
                    <div style="font-weight:bold; color:#fff;">${escapeAttr(c.label)}</div>
                    <div style="font-size:10px; opacity:0.6">${escapeAttr(c.meet)}</div>
                  </td>
                  <td style="width:240px;">
                    ${createRadioGroup(
                      `qa_${c.key}`,
                      [
                        { value: 'OK', label: 'OK' },
                        { value: 'NOT_OK', label: 'Niet OK' },
                        { value: 'NA', label: 'N.V.T' }
                      ],
                      qa.result,
                      true
                    )}
                  </td>
                  <td><textarea id="note_${c.key}" class="io-note" placeholder="Opmerking...">${escapeAttr(qa.note || '')}</textarea></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  return html;
};

const renderContent = () => {
  const data = getStickyData();
  if (!data) return;

  const slotIdx = editingSticky.slotIdx;
  const content = $("modalContent");
  const title = $("modalTitle");
  if (!content || !title) return;

  if (slotIdx === 3) {
    title.textContent = "Proces Stap Analyse";
    content.innerHTML = renderProcessTab(data);
    return;
  }

  if (slotIdx === 1) {
    title.textContent = "Systeem Fit Analyse";
    content.innerHTML = renderSystemTab(data);
    return;
  }

  if (slotIdx === 2 || slotIdx === 4) {
    title.textContent = slotIdx === 2 ? "Input Specificaties" : "Output Specificaties";
    content.innerHTML = renderIoTab(data, slotIdx === 2);
  }
};

function syncModalToState() {
  const modal = $("editModal");
  if (!modal || modal.style.display === "none") return;
  saveModalDetails(false);
}

let _ttEl = null;
let _ttVisible = false;

function ensureTooltipEl() {
  if (_ttEl) return _ttEl;

  const el = document.createElement('div');
  el.id = 'customTooltip';
  el.style.position = 'fixed';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.transform = 'translate(-9999px, -9999px)';
  el.style.zIndex = '10000';
  el.style.pointerEvents = 'none';
  el.style.opacity = '0';
  el.style.transition = 'opacity 120ms ease, transform 120ms ease';
  el.style.maxWidth = '360px';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '10px';
  el.style.background = 'rgba(20, 24, 28, 0.95)';
  el.style.border = '1px solid rgba(255,255,255,0.12)';
  el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.45)';
  el.style.backdropFilter = 'blur(10px)';
  el.style.color = '#fff';
  el.style.fontFamily = '"Inter", sans-serif';
  el.style.fontSize = '12px';
  el.style.lineHeight = '1.4';

  el.innerHTML = `
    <div style="font-weight:900; font-size:11px; letter-spacing:.6px; text-transform:uppercase; opacity:.9; margin-bottom:6px;" data-tt="title"></div>
    <div style="opacity:.85" data-tt="body"></div>
  `;

  document.body.appendChild(el);
  _ttEl = el;
  return el;
}

function showTooltip(target, x, y) {
  const el = ensureTooltipEl();

  const title = target?.dataset?.ttTitle || '';
  const body = target?.dataset?.ttBody || '';
  if (!title && !body) return;

  const tEl = el.querySelector('[data-tt="title"]');
  const bEl = el.querySelector('[data-tt="body"]');
  if (tEl) tEl.textContent = title;
  if (bEl) bEl.textContent = body;

  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  el.style.opacity = '1';
  _ttVisible = true;

  const rect = el.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;

  if (left + rect.width + 8 > vw) left = x - rect.width - pad;
  if (top + rect.height + 8 > vh) top = y - rect.height - pad;

  left = Math.max(8, Math.min(vw - rect.width - 8, left));
  top = Math.max(8, Math.min(vh - rect.height - 8, top));

  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function hideTooltip() {
  if (!_ttEl || !_ttVisible) return;
  _ttEl.style.opacity = '0';
  _ttEl.style.transform = 'translate(-9999px, -9999px)';
  _ttVisible = false;
}

const setupPermanentListeners = () => {
  const modal = $("editModal");
  const content = $("modalContent");
  const saveBtn = $("modalSaveBtn");
  const cancelBtn = $("modalCancelBtn");

  if (saveBtn) saveBtn.onclick = () => saveModalDetails(true);
  if (cancelBtn && modal) cancelBtn.onclick = () => (modal.style.display = "none");
  if (!content) return;

  content.addEventListener("pointerenter", (e) => {
    const opt = e.target.closest(".status-option");
    if (!opt) return;
    showTooltip(opt, e.clientX, e.clientY);
  }, true);

  content.addEventListener("pointermove", (e) => {
    const opt = e.target.closest(".status-option");
    if (!opt) {
      hideTooltip();
      return;
    }
    showTooltip(opt, e.clientX, e.clientY);
  }, true);

  content.addEventListener("pointerleave", (e) => {
    const opt = e.target.closest(".status-option");
    if (!opt) return;
    hideTooltip();
  }, true);

  content.addEventListener("scroll", () => hideTooltip(), { passive: true });
  if (modal) modal.addEventListener("scroll", () => hideTooltip(), { passive: true });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTooltip();
  });

  content.addEventListener("click", (e) => {
    const opt = e.target.closest(".sys-opt");
    if (!opt) return;

    const container = opt.closest(".radio-group-container");
    const input = container?.querySelector('input[type="hidden"]');
    const wasSelected = opt.classList.contains("selected");

    container?.querySelectorAll(".sys-opt").forEach((el) => el.classList.remove("selected"));

    if (wasSelected) {
      if (input) input.value = "";
      return;
    }

    opt.classList.add("selected");
    if (input) input.value = opt.dataset.value;
  });

  content.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;

    const tabName = btn.dataset.tab;

    if (tabName === "def" || tabName === "qual") {
      syncModalToState();
      activeIoTab = tabName;
      renderContent();
      return;
    }

    if (tabName === "analyse" || tabName === "disrupt") {
      syncModalToState();

      content.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const subAnalyse = $("subTabAnalyse");
      const subDisrupt = $("subTabDisrupt");
      if (subAnalyse) subAnalyse.style.display = tabName === "analyse" ? "block" : "none";
      if (subDisrupt) subDisrupt.style.display = tabName === "disrupt" ? "block" : "none";
    }
  });

  // Proces status select (bestaand)
  content.addEventListener("click", (e) => {
    const statusOpt = e.target.closest('.status-option[data-action="set-status"]');
    if (!statusOpt) return;

    const val = statusOpt.dataset.val;
    const configStatus = PROCESS_STATUSES.find((s) => s.value === val);
    const input = $("processStatus");
    if (!configStatus || !input) return;

    const wasActive = statusOpt.classList.contains(configStatus.class);

    PROCESS_STATUSES.forEach((s) => {
      content
        .querySelectorAll(`.status-option.${s.class}[data-action="set-status"]`)
        .forEach((el) => el.classList.remove(s.class));
    });

    const happySection = $("sectionHappy");
    const badSection = $("sectionBad");

    if (wasActive) {
      input.value = "";
      if (happySection) happySection.style.display = "none";
      if (badSection) badSection.style.display = "none";
      hideTooltip();
      return;
    }

    input.value = val;
    statusOpt.classList.add(configStatus.class);

    const isHappyLocal = val === "HAPPY";
    if (happySection) happySection.style.display = isHappyLocal ? "block" : "none";
    if (badSection) badSection.style.display = !isHappyLocal ? "block" : "none";
  });

  // NEW: Werkbeleving select (Obstakel / Routine / Flow)
  content.addEventListener("click", (e) => {
    const opt = e.target.closest('.status-option[data-action="set-workexp"]');
    if (!opt) return;

    const input = $("workExp");
    if (!input) return;

    const val = opt.dataset.val;
    const wasActive = (input.value || "") === val;

    // clear all highlights
    content
      .querySelectorAll('.status-option[data-action="set-workexp"]')
      .forEach((el) => el.classList.remove("selected-hap", "selected-neu", "selected-sad"));

    if (wasActive) {
      input.value = "";
      hideTooltip();
      return;
    }

    input.value = val;

    const found = WORK_EXP_OPTIONS.find((o) => o.value === val);
    if (found?.cls) opt.classList.add(found.cls);
  });

  content.addEventListener("click", (e) => {
    const target = e.target;

    if (target?.dataset?.action === "remove-row") {
      target.closest(".dynamic-row, tr")?.remove();
      return;
    }

    if (target?.dataset?.action === "add-list-item") {
      const type = target.dataset.type;
      const wrapper = content.querySelector(`.dynamic-list-wrapper[data-type="${type}"]`);
      if (!wrapper) return;

      const div = document.createElement("div");
      div.className = "dynamic-row";
      div.innerHTML = `
        <input type="text" class="def-input" placeholder="${type === 'RC' ? 'Oorzaak...' : 'Maatregel...'}">
        <button class="btn-row-del-tiny" data-action="remove-row" type="button">×</button>
      `;
      wrapper.appendChild(div);
      div.querySelector("input")?.focus();
      return;
    }

    if (target?.dataset?.action === "add-def-row") {
      const tbody = $("defTbody");
      if (!tbody) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="def-input" placeholder="Naam item..."></td>
        <td><textarea class="def-sub-input" placeholder="Specificaties..."></textarea></td>
        <td>${createRadioGroup(`def_type_new_${Date.now()}`, DEFINITION_TYPES, null, true)}</td>
        <td><button class="btn-row-del-tiny" data-action="remove-row" type="button">×</button></td>
      `;
      tbody.appendChild(tr);
      tr.querySelector("input")?.focus();
      return;
    }

    if (target?.dataset?.action === "add-disrupt-row") {
      const tbody = $("disruptTbody");
      if (!tbody) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="def-input" placeholder="Scenario..."></td>
        <td>${createRadioGroup(`dis_freq_new_${Date.now()}`, DISRUPTION_FREQUENCIES, null, false)}</td>
        <td><input class="def-input" placeholder="Workaround..."></td>
        <td><button class="btn-row-del-tiny" data-action="remove-row" type="button">×</button></td>
      `;
      tbody.appendChild(tr);
      tr.querySelector("input")?.focus();
    }
  });

  content.addEventListener("change", (e) => {
    if (e.target?.id !== "inputSourceSelect") return;

    const data = getStickyData();
    if (!data) return;

    data.linkedSourceId = e.target.value || null;

    const info = $("linkedInfoText");
    if (info) info.style.display = e.target.value ? "block" : "none";

    state.saveStickyDetails();
  });
};

export function openEditModal(colIdx, slotIdx) {
  editingSticky = { colIdx, slotIdx };
  activeIoTab = 'def';

  if (!areListenersAttached) {
    setupPermanentListeners();
    areListenersAttached = true;
  }

  renderContent();

  const modal = $("editModal");
  if (modal) modal.style.display = "grid";
}

export function saveModalDetails(closeModal = true) {
  const data = getStickyData();
  if (!data) return;

  const slotIdx = editingSticky.slotIdx;
  const content = $("modalContent");
  if (!content) return;

  if (slotIdx === 3) {
    const statusVal = $("processStatus")?.value ?? "";
    data.processStatus = statusVal === "" ? null : statusVal;

    // NEW: werkbeleving opslaan
    const expVal = $("workExp")?.value ?? "";
    data.workExp = expVal === "" ? null : expVal;

    const expNote = $("workExpNote");
    data.workExpNote = expNote ? expNote.value : "";

    const typeVal = content.querySelector('input[name="metaType"]')?.value ?? "";
    data.type = typeVal === "" ? null : typeVal;

    const procVal = content.querySelector('input[name="metaValue"]')?.value ?? "";
    data.processValue = procVal === "" ? null : procVal;

    const success = $("successFactors");
    data.successFactors = success ? success.value : "";

    data.causes = Array.from(content.querySelectorAll('.dynamic-list-wrapper[data-type="RC"] input'))
      .map((i) => i.value)
      .filter((v) => v.trim());

    data.improvements = Array.from(content.querySelectorAll('.dynamic-list-wrapper[data-type="CM"] input'))
      .map((i) => i.value)
      .filter((v) => v.trim());

    const disruptTbody = $("disruptTbody");
    if (disruptTbody) {
      const rows = disruptTbody.querySelectorAll("tr");
      data.disruptions = Array.from(rows)
        .map((tr) => ({
          scenario: tr.querySelector("td:nth-child(1) input")?.value || "",
          frequency: tr.querySelector('td:nth-child(2) input[type="hidden"]')?.value || null,
          workaround: tr.querySelector("td:nth-child(3) input")?.value || ""
        }))
        .filter((d) => d.scenario.trim());
    }
  } else if (slotIdx === 1) {
    data.systemData = data.systemData || {};
    let total = 0;
    let answeredCount = 0;

    SYSTEM_QUESTIONS.forEach((q) => {
      const valStr = content.querySelector(`input[name="sys_${q.id}"]`)?.value ?? "";
      if (valStr === "") {
        data.systemData[q.id] = null;
        return;
      }
      const val = parseInt(valStr, 10);
      data.systemData[q.id] = Number.isFinite(val) ? val : null;
      if (Number.isFinite(val)) {
        total += val;
        answeredCount++;
      }
    });

    if (answeredCount > 0) {
      const maxPoints = SYSTEM_QUESTIONS.length * 3;
      const safeTotal = Math.min(total, maxPoints);
      data.systemData.calculatedScore = Math.round(100 * (1 - safeTotal / maxPoints));
    } else {
      data.systemData.calculatedScore = null;
    }
  } else if (slotIdx === 2 || slotIdx === 4) {
    if (slotIdx === 2) {
      const select = $("inputSourceSelect");
      if (select) data.linkedSourceId = select.value || null;
    }

    const defTbody = $("defTbody");
    if (defTbody) {
      const rows = defTbody.querySelectorAll("tr");
      data.inputDefinitions = Array.from(rows)
        .map((tr) => ({
          item: tr.querySelector("td:nth-child(1) input")?.value || "",
          specifications: tr.querySelector("td:nth-child(2) textarea")?.value || "",
          type: tr.querySelector('td:nth-child(3) input[type="hidden"]')?.value || null
        }))
        .filter((d) => d.item.trim() || d.specifications.trim() || (d.type != null && String(d.type).trim() !== ""));
    }

    const ioQual = $("ioTabQual");
    if (ioQual) {
      data.qa = data.qa || {};
      IO_CRITERIA.forEach((c) => {
        const resultInput = content.querySelector(`input[name="qa_${c.key}"]`);
        const noteInput = $(`note_${c.key}`);
        if (!resultInput) return;

        const val = resultInput.value;
        data.qa[c.key] = {
          result: val === "" ? null : val,
          note: noteInput ? noteInput.value : ""
        };
      });
    }
  }

  state.saveStickyDetails();

  if (closeModal) {
    const modal = $("editModal");
    if (modal) modal.style.display = "none";
    hideTooltip();
  }
}