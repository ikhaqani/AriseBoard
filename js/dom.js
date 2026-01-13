import { state } from './state.js';
import { IO_CRITERIA, PROCESS_STATUSES } from './config.js';

const $ = (id) => document.getElementById(id);

let _openModalFn = null;
let _delegatedBound = false;

let _syncRaf = 0;
let _lastPointerDownTs = 0;

function calculateLSSScore(qa) {
  if (!qa) return null;

  let totalW = 0;
  let earnedW = 0;

  IO_CRITERIA.forEach((c) => {
    const val = qa[c.key]?.result;
    if (val === 'OK' || val === 'NOT_OK') {
      totalW += c.weight;
      if (val === 'OK') earnedW += c.weight;
    }
  });

  return totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
}

function getProcessEmoji(status) {
  if (!status) return '';
  const s = PROCESS_STATUSES?.find?.((x) => x.value === status);
  return s?.emoji || '';
}

/* =========================================================
   Werkbeleving / werkplezier (Optie A)
   Slot: alleen Proces (slotIdx === 3)
   ========================================================= */

function escapeAttr(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getWorkExpMeta(workExp) {
  const v = String(workExp || '').toUpperCase();

  if (v === 'OBSTACLE') {
    return {
      icon: '🛠️',
      short: 'Obstakel',
      context: 'Kost energie & frustreert. Het proces werkt tegen me. (Actie: Verbeteren)'
    };
  }
  if (v === 'ROUTINE') {
    return {
      icon: '🤖',
      short: 'Routine',
      context: 'Saai & Repeterend. Ik voeg hier geen unieke waarde toe. (Actie: Automatiseren)'
    };
  }
  if (v === 'FLOW') {
    return {
      icon: '🚀',
      short: 'Flow',
      context: 'Geeft energie & voldoening. Hier maak ik het verschil. (Actie: Koesteren)'
    };
  }
  return null;
}

function buildWorkExpBadge(slot) {
  const meta = getWorkExpMeta(slot?.workExp);
  if (!meta) return '';

  const note = String(slot?.workExpNote || '').trim();
  const title = note ? `${meta.context}\n\nNotitie: ${note}` : meta.context;

  return `
    <div class="workexp-badge" title="${escapeAttr(title)}" aria-label="${escapeAttr(meta.short)}">
      <span class="workexp-icn">${meta.icon}</span>
    </div>
  `;
}

/* =========================================================
   Gate / Checks (Optie B) — visualisatie op board
   - Gate badge op proces-sticky die een gate is
   - Check badge op proces-sticky die door een gate wordt gebruikt
   ========================================================= */

function getProcessIdForColumn(sheet, colIdx) {
  const procSlot = sheet?.columns?.[colIdx]?.slots?.[3];
  if (procSlot?.id) return String(procSlot.id);
  const sid = sheet?.id ? String(sheet.id) : 'sheet';
  return `${sid}:col${colIdx}:process`;
}

function getProcessLabelForColumn(sheet, colIdx) {
  const procSlot = sheet?.columns?.[colIdx]?.slots?.[3];
  const raw = (procSlot?.text || '').trim();
  const name = raw ? raw.replace(/\s+/g, ' ') : 'Proces (geen titel)';
  const short = name.length > 42 ? name.slice(0, 42) + '…' : name;
  return `${colIdx + 1}. ${short}`;
}

function findColumnIndexByProcessId(sheet, pid) {
  const cols = sheet?.columns || [];
  for (let i = 0; i < cols.length; i++) {
    const id = getProcessIdForColumn(sheet, i);
    if (String(id) === String(pid)) return i;
  }
  return -1;
}

function buildGateBadge({ sheet, colIdx, slot }) {
  if (!slot?.isGate) return '';

  const gate = slot?.gate || {};
  const checks = Array.isArray(gate.checkProcessIds) ? gate.checkProcessIds : [];
  const failPid = gate.onFailTargetProcessId || '';
  const passPid = gate.onPassTargetProcessId || '';

  const failIdx = failPid ? findColumnIndexByProcessId(sheet, failPid) : -1;
  const passIdx = passPid ? findColumnIndexByProcessId(sheet, passPid) : -1;

  const failLbl = failIdx >= 0 ? getProcessLabelForColumn(sheet, failIdx) : (failPid ? String(failPid) : '—');
  const passLbl =
    passPid && passIdx >= 0 ? getProcessLabelForColumn(sheet, passIdx) : (passPid ? String(passPid) : 'Normale flow');

  const checkLbls = checks
    .map((pid) => {
      const idx = findColumnIndexByProcessId(sheet, pid);
      return idx >= 0 ? getProcessLabelForColumn(sheet, idx) : String(pid);
    })
    .join('\n');

  const title =
    `GATE (regel: ALL_OK)\n` +
    `Checks (${checks.length}):\n${checkLbls || '—'}\n\n` +
    `PASS → ${passLbl}\n` +
    `FAIL → ${failLbl}` +
    (gate.note ? `\n\nNotitie:\n${String(gate.note).trim()}` : '');

  // Inline style zodat je direct ziet zonder extra CSS.
  return `
    <div class="gate-badge"
         title="${escapeAttr(title)}"
         aria-label="Gate"
         style="position:absolute; top:2px; left:4px; font-size:10px; font-weight:900; letter-spacing:.6px;
                padding:2px 6px; border-radius:10px; background:rgba(255,202,40,.92); color:#1b1b1b;
                border:1px solid rgba(0,0,0,.18); box-shadow:0 2px 4px rgba(0,0,0,.25);">
      GATE
    </div>
  `;
}

function buildCheckBadge({ usedByGates }) {
  if (!usedByGates || usedByGates.length === 0) return '';

  const title =
    `CHECK\nGebruikt door gates:\n` +
    usedByGates.map((x) => `- ${x}`).join('\n');

  return `
    <div class="check-badge"
         title="${escapeAttr(title)}"
         aria-label="Check"
         style="position:absolute; top:2px; left:56px; font-size:10px; font-weight:900; letter-spacing:.6px;
                padding:2px 6px; border-radius:10px; background:rgba(144,202,249,.22); color:#e3f2fd;
                border:1px solid rgba(144,202,249,.35); box-shadow:0 2px 4px rgba(0,0,0,.20);">
      CHECK
    </div>
  `;
}

function scheduleSyncRowHeights() {
  if (_syncRaf) cancelAnimationFrame(_syncRaf);
  _syncRaf = requestAnimationFrame(() => {
    _syncRaf = 0;
    syncRowHeightsNow();
  });
}

function syncRowHeightsNow() {
  const rowHeadersEl = $("row-headers");
  const rowHeaders = rowHeadersEl?.children;
  if (!rowHeaders || !rowHeaders.length) return;

  const colsContainer = $("cols");
  const cols = colsContainer?.querySelectorAll?.(".col");
  if (!cols || !cols.length) return;

  const heights = Array(6).fill(160);

  cols.forEach((col) => {
    const slotNodes = col.querySelectorAll(".slots .slot");
    for (let r = 0; r < 6; r++) {
      const slot = slotNodes[r];
      if (!slot) continue;
      const sticky = slot.firstElementChild;
      if (!sticky) continue;
      const h = sticky.offsetHeight;
      if (h > heights[r]) heights[r] = h;
    }
  });

  for (let r = 0; r < 6; r++) {
    const hStr = `${heights[r]}px`;
    if (rowHeaders[r]) rowHeaders[r].style.height = hStr;

    cols.forEach((col) => {
      const slotNodes = col.querySelectorAll(".slots .slot");
      if (slotNodes[r]) slotNodes[r].style.height = hStr;
    });
  }

  const gapSize = 20;
  const processOffset = heights[0] + heights[1] + heights[2] + 3 * gapSize;

  colsContainer.querySelectorAll(".col-connector").forEach((c) => {
    if (!c.classList.contains("parallel-connector")) {
      c.style.paddingTop = `${processOffset}px`;
    }
  });
}

function ensureRowHeaders() {
  const rowHeaderContainer = $("row-headers");
  if (!rowHeaderContainer || rowHeaderContainer.children.length > 0) return;

  ["Leverancier", "Systeem", "Input", "Proces", "Output", "Klant"].forEach((label) => {
    const div = document.createElement("div");
    div.className = "row-header";
    div.innerHTML = `<span>${label}</span>`;
    rowHeaderContainer.appendChild(div);
  });
}

function renderSheetSelect() {
  const select = $("sheetSelect");
  if (!select) return;

  const activeId = state.project.activeSheetId;
  select.innerHTML = "";

  state.project.sheets.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    opt.selected = s.id === activeId;
    select.appendChild(opt);
  });
}

function renderHeader(activeSheet) {
  const headDisp = $("board-header-display");
  if (headDisp) headDisp.textContent = activeSheet.name;
}

function attachStickyInteractions({ stickyEl, textEl, colIdx, slotIdx, openModalFn }) {
  const openModalIfAllowed = (e) => {
    if (![1, 2, 3].includes(slotIdx)) return;
    e.preventDefault();
    e.stopPropagation();

    const sel = window.getSelection?.();
    if (sel) sel.removeAllRanges();

    openModalFn?.(colIdx, slotIdx);
  };

  const focusText = (e) => {
    if (e.detail && e.detail > 1) return;

    if (
      e.target.closest(
        ".sticky-grip, .qa-score-badge, .id-tag, .label-tl, .label-tr, .label-br, .link-icon, .workexp-badge, .gate-badge, .check-badge, .btn-col-action, .col-actions, .connector-add, .connector-delete, .connector-input-minimal"
      )
    ) {
      return;
    }

    requestAnimationFrame(() => {
      textEl.focus();

      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  };

  stickyEl.addEventListener("dblclick", openModalIfAllowed);
  textEl.addEventListener("dblclick", openModalIfAllowed);
  stickyEl.addEventListener("click", focusText);
}

function buildScoreBadges({ slotIdx, slot }) {
  let html = "";

  const qaScore = calculateLSSScore(slot.qa);
  if (qaScore !== null && (slotIdx === 2 || slotIdx === 4)) {
    const badgeClass = qaScore >= 80 ? "score-high" : qaScore >= 60 ? "score-med" : "score-low";
    html += `<div class="qa-score-badge ${badgeClass}">Q: ${qaScore}%</div>`;
  }

  if (slotIdx === 1 && slot.systemData?.calculatedScore != null) {
    const sysScore = slot.systemData.calculatedScore;
    const badgeClass = sysScore >= 80 ? "score-high" : sysScore >= 60 ? "score-med" : "score-low";
    html += `<div class="qa-score-badge ${badgeClass}" style="bottom:22px">Sys: ${sysScore}%</div>`;
  }

  return html;
}

function buildSlotHTML({
  colIdx,
  slotIdx,
  slot,
  statusClass,
  typeIcon,
  myInputId,
  myOutputId,
  isLinked,
  scoreBadgeHTML,
  gateHTML,
  checkHTML
}) {
  const procEmoji = (slotIdx === 3 && slot.processStatus) ? getProcessEmoji(slot.processStatus) : "";

  const workExpHTML = (slotIdx === 3) ? buildWorkExpBadge(slot) : "";

  return `
    <div class="sticky ${statusClass}" data-col="${colIdx}" data-slot="${slotIdx}">
      <div class="sticky-grip"></div>

      ${(slotIdx === 3 && slot.type) ? `<div class="label-tl">${typeIcon} ${slot.type}</div>` : ''}
      ${(slotIdx === 3 && procEmoji) ? `<div class="label-tr">${procEmoji}</div>` : ''}
      ${(slotIdx === 3 && slot.processValue) ? `<div class="label-br">${slot.processValue}</div>` : ''}

      ${(slotIdx === 2 && myInputId) ? `<div class="id-tag">${myInputId}</div>` : ''}
      ${(slotIdx === 4 && myOutputId) ? `<div class="id-tag">${myOutputId}</div>` : ''}

      ${scoreBadgeHTML}

      ${workExpHTML}

      ${gateHTML || ''}
      ${checkHTML || ''}

      ${isLinked ? '<span class="link-icon" style="position:absolute; top:2px; right:4px;">🔗</span>' : ''}

      <div class="sticky-content">
        <div class="text"
             ${isLinked ? 'contenteditable="false" data-linked="true"' : 'contenteditable="true"'}
             spellcheck="false"></div>
      </div>
    </div>
  `;
}

function renderConnector({ frag, activeSheet, col, colIdx }) {
  if (colIdx >= activeSheet.columns.length - 1) return;

  let nextVisible = null;
  for (let i = colIdx + 1; i < activeSheet.columns.length; i++) {
    if (activeSheet.columns[i].isVisible !== false) {
      nextVisible = activeSheet.columns[i];
      break;
    }
  }
  if (!nextVisible) return;

  const connEl = document.createElement("div");

  if (nextVisible.isParallel) {
    connEl.className = "col-connector parallel-connector";
    connEl.innerHTML = `<div class="parallel-line"></div><div class="parallel-badge">||</div>`;
    frag.appendChild(connEl);
    return;
  }

  connEl.className = "col-connector";

  if (col.hasTransition) {
    connEl.innerHTML = `
      <div class="connector-active">
        <input class="connector-input-minimal" placeholder="Tijd...">
        <div class="connector-arrow-minimal"></div>
        <span class="connector-text-export"></span>
        <button class="connector-delete" type="button">×</button>
      </div>
    `;

    const inp = connEl.querySelector("input");
    const exportSpan = connEl.querySelector(".connector-text-export");

    if (inp) {
      inp.value = col.transitionNext || "";
      if (exportSpan) exportSpan.textContent = inp.value;

      inp.addEventListener(
        "input",
        (e) => {
          state.setTransition(colIdx, e.target.value);
          if (exportSpan) exportSpan.textContent = e.target.value;
        },
        { passive: true }
      );
    }
  } else {
    const btn = document.createElement("button");
    btn.className = "connector-add";
    btn.textContent = "+";
    btn.type = "button";
    btn.addEventListener("click", () => state.setTransition(colIdx, ""), { passive: true });
    connEl.appendChild(btn);
  }

  frag.appendChild(connEl);
}

function renderStats(stats) {
  const happyEl = $("countHappy");
  const neutralEl = $("countNeutral");
  const sadEl = $("countSad");

  if (happyEl) happyEl.textContent = stats.happy;
  if (neutralEl) neutralEl.textContent = stats.neutral;
  if (sadEl) sadEl.textContent = stats.sad;
}

function renderColumnsOnly(openModalFn) {
  const activeSheet = state.activeSheet;
  if (!activeSheet) return;

  const colsContainer = $("cols");
  if (!colsContainer) return;

  const offsets = state.getGlobalCountersBeforeActive();
  const allOutputMap = state.getAllOutputs();

  let localInCounter = 0;
  let localOutCounter = 0;

  const stats = { happy: 0, neutral: 0, sad: 0 };

  // Build reverse mapping: processId -> [gate labels that reference it]
  const reverseCheckMap = {};
  activeSheet.columns.forEach((col, colIdx) => {
    if (col.isVisible === false) return;
    const procSlot = col.slots?.[3];
    if (!procSlot?.isGate || !procSlot?.gate) return;

    const gatePid = getProcessIdForColumn(activeSheet, colIdx);
    const gateLbl = getProcessLabelForColumn(activeSheet, colIdx);

    const checks = Array.isArray(procSlot.gate.checkProcessIds) ? procSlot.gate.checkProcessIds : [];
    checks.forEach((pid) => {
      const k = String(pid);
      if (!reverseCheckMap[k]) reverseCheckMap[k] = [];
      reverseCheckMap[k].push(gateLbl);
    });

    // Optional: also register the gate itself (can be useful later)
    reverseCheckMap[String(gatePid)] = reverseCheckMap[String(gatePid)] || reverseCheckMap[String(gatePid)];
  });

  const frag = document.createDocumentFragment();

  activeSheet.columns.forEach((col, colIdx) => {
    if (col.isVisible === false) return;

    let myInputId = "";
    let myOutputId = "";

    const inputSlot = col.slots?.[2];
    const outputSlot = col.slots?.[4];

    if (inputSlot?.linkedSourceId && allOutputMap[inputSlot.linkedSourceId]) {
      myInputId = inputSlot.linkedSourceId;
    } else if (inputSlot?.text?.trim()) {
      localInCounter++;
      myInputId = `IN${offsets.inStart + localInCounter}`;
    }

    if (outputSlot?.text?.trim()) {
      localOutCounter++;
      myOutputId = `OUT${offsets.outStart + localOutCounter}`;
    }

    const colEl = document.createElement("div");
    colEl.className = `col ${col.isParallel ? "is-parallel" : ""}`;
    colEl.dataset.idx = colIdx;

    const actionsEl = document.createElement("div");
    actionsEl.className = "col-actions";
    actionsEl.innerHTML = `
      <button class="btn-col-action btn-arrow" data-action="move" data-dir="-1" type="button">←</button>
      <div class="btn-col-action btn-move-col" aria-hidden="true">↔</div>
      <button class="btn-col-action btn-arrow" data-action="move" data-dir="1" type="button">→</button>
      ${colIdx > 0 ? `<button class="btn-col-action btn-parallel ${col.isParallel ? "active" : ""}" data-action="parallel" type="button">∥</button>` : ""}
      <button class="btn-col-action btn-hide-col" data-action="hide" type="button">👁️</button>
      <button class="btn-col-action btn-add-col-here" data-action="add" type="button">+</button>
      <button class="btn-col-action btn-delete-col" data-action="delete" type="button">×</button>
    `;
    colEl.appendChild(actionsEl);

    const slotsEl = document.createElement("div");
    slotsEl.className = "slots";

    col.slots.forEach((slot, slotIdx) => {
      if (slotIdx === 3) {
        if (slot.processStatus === "HAPPY") stats.happy++;
        else if (slot.processStatus === "NEUTRAL") stats.neutral++;
        else if (slot.processStatus === "SAD") stats.sad++;
      }

      let displayText = slot.text;
      let isLinked = false;

      if (slotIdx === 2 && slot.linkedSourceId && allOutputMap[slot.linkedSourceId]) {
        displayText = allOutputMap[slot.linkedSourceId];
        isLinked = true;
      }

      const scoreBadgeHTML = buildScoreBadges({ slotIdx, slot });

      let statusClass = "";
      if (slotIdx === 3 && slot.processStatus) {
        statusClass = `status-${slot.processStatus.toLowerCase()}`;
      }

      let typeIcon = "📝";
      if (slot.type === "Afspraak") typeIcon = "📅";
      if (slot.type === "Besluit") typeIcon = "💎";
      if (slot.type === "Wacht") typeIcon = "⏳";

      // Gate/Check visual only for process slot
      let gateHTML = "";
      let checkHTML = "";
      if (slotIdx === 3) {
        gateHTML = buildGateBadge({ sheet: activeSheet, colIdx, slot });

        const myPid = getProcessIdForColumn(activeSheet, colIdx);
        const usedBy = reverseCheckMap[String(myPid)] || [];
        // If this process itself is a gate, still can also be a check; badge is ok.
        checkHTML = buildCheckBadge({ usedByGates: usedBy });
      }

      const slotDiv = document.createElement("div");
      slotDiv.className = "slot";
      slotDiv.innerHTML = buildSlotHTML({
        colIdx,
        slotIdx,
        slot,
        statusClass,
        typeIcon,
        myInputId,
        myOutputId,
        isLinked,
        scoreBadgeHTML,
        gateHTML,
        checkHTML
      });

      const textEl = slotDiv.querySelector(".text");
      const stickyEl = slotDiv.querySelector(".sticky");
      if (textEl) textEl.textContent = displayText;

      attachStickyInteractions({ stickyEl, textEl, colIdx, slotIdx, openModalFn });

      if (!isLinked && textEl) {
        textEl.addEventListener(
          "input",
          () => {
            state.updateStickyText(colIdx, slotIdx, textEl.textContent);
          },
          { passive: true }
        );
      }

      slotsEl.appendChild(slotDiv);
    });

    colEl.appendChild(slotsEl);
    frag.appendChild(colEl);

    renderConnector({ frag, activeSheet, col, colIdx });
  });

  colsContainer.replaceChildren(frag);
  renderStats(stats);
  scheduleSyncRowHeights();
}

function updateSingleText(colIdx, slotIdx) {
  const colsContainer = $("cols");
  const colEl = colsContainer?.querySelector?.(`.col[data-idx="${colIdx}"]`);
  if (!colEl) return false;

  const slot = state.activeSheet.columns[colIdx]?.slots?.[slotIdx];
  if (!slot) return false;

  const slotEl = colEl.querySelector(`.sticky[data-col="${colIdx}"][data-slot="${slotIdx}"] .text`);
  if (!slotEl) return false;

  if (slotEl && slotEl.isContentEditable && document.activeElement === slotEl) return true;

  slotEl.textContent = slot.text ?? '';
  return true;
}

export function renderBoard(openModalFn) {
  _openModalFn = openModalFn || _openModalFn;

  const activeSheet = state.activeSheet;
  if (!activeSheet) return;

  renderSheetSelect();
  renderHeader(activeSheet);
  ensureRowHeaders();
  renderColumnsOnly(_openModalFn);
}

export function applyStateUpdate(meta, openModalFn) {
  _openModalFn = openModalFn || _openModalFn;

  const reason = meta?.reason || 'full';

  if (reason === 'text' && Number.isFinite(meta?.colIdx) && Number.isFinite(meta?.slotIdx)) {
    const ok = updateSingleText(meta.colIdx, meta.slotIdx);
    if (ok) return;
  }

  if (reason === 'title') return;

  if (reason === 'sheet' || reason === 'sheets') {
    const activeSheet = state.activeSheet;
    if (activeSheet) {
      renderSheetSelect();
      renderHeader(activeSheet);
    }
    renderColumnsOnly(_openModalFn);
    return;
  }

  if (reason === 'columns' || reason === 'transition' || reason === 'details') {
    renderColumnsOnly(_openModalFn);
    return;
  }

  renderBoard(_openModalFn);
}

export function setupDelegatedEvents() {
  if (_delegatedBound) return;
  _delegatedBound = true;

  const act = (e) => {
    const btn = e.target.closest(".btn-col-action");
    if (!btn) return;

    const action = btn.dataset.action;
    if (!action) return;

    if (e.type === 'mousedown' && performance.now() - _lastPointerDownTs < 250) return;
    if (e.type === 'pointerdown') _lastPointerDownTs = performance.now();

    e.preventDefault();
    e.stopPropagation();

    const colEl = btn.closest(".col");
    if (!colEl) return;

    const idx = parseInt(colEl.dataset.idx, 10);
    if (!Number.isFinite(idx)) return;

    switch (action) {
      case "move":
        state.moveColumn(idx, parseInt(btn.dataset.dir, 10));
        break;
      case "delete":
        if (confirm("Kolom verwijderen?")) state.deleteColumn(idx);
        break;
      case "add":
        state.addColumn(idx);
        break;
      case "hide":
        state.setColVisibility(idx, false);
        break;
      case "parallel":
        state.toggleParallel?.(idx);
        break;
    }
  };

  document.addEventListener("pointerdown", act, true);
  document.addEventListener("mousedown", act, true);
  document.addEventListener("touchstart", act, { capture: true, passive: false });
}