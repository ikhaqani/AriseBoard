// ===============================
// File: js/dom.js  (VOLLEDIG AANGEPAST)
// Fixes:
// 1) Smiley (processStatus emoji) rechtsboven in proces-sticky (label-tr)
// 2) Input "Output als Input" toont altijd ID (linkedSourceId) óók als input.text leeg is
// 3) Linked input is read-only in board (voorkomt dat input-event je link overschrijft)
// ===============================

import { state } from './state.js';
import { IO_CRITERIA, PROCESS_STATUSES } from './config.js';

const $ = (id) => document.getElementById(id);

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

function syncRowHeights() {
  const rowHeadersEl = $("row-headers");
  const rowHeaders = rowHeadersEl?.children;
  if (!rowHeaders || !rowHeaders.length) return;

  const heights = [];

  for (let r = 0; r < 6; r++) {
    let max = 160;
    const slots = document.querySelectorAll(`.col .slots .slot:nth-child(${r + 1})`);
    slots.forEach((s) => {
      const sticky = s.firstElementChild;
      if (!sticky) return;
      const h = sticky.offsetHeight;
      if (h > max) max = h;
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
      const processOffset = heights[0] + heights[1] + heights[2] + 3 * gapSize;

      document.querySelectorAll(".col-connector").forEach((c) => {
        if (!c.classList.contains("parallel-connector")) {
          c.style.paddingTop = `${processOffset}px`;
        }
      });
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

  select.innerHTML = "";
  state.project.sheets.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    opt.selected = s.id === state.project.activeSheetId;
    select.appendChild(opt);
  });
}

function renderHeader(activeSheet) {
  const headDisp = $("board-header-display");
  if (headDisp) headDisp.textContent = activeSheet.name;
}

function shouldSkipRender() {
  const focusedEl = document.activeElement;
  if (!focusedEl) return false;
  return (
    focusedEl.classList.contains("text") ||
    focusedEl.classList.contains("connector-input-minimal")
  );
}

function attachStickyInteractions({ stickyEl, textEl, colIdx, slotIdx, openModalFn }) {
  const openModalIfAllowed = (e) => {
    if (![1, 2, 3].includes(slotIdx)) return;
    e.preventDefault();
    e.stopPropagation();

    const sel = window.getSelection?.();
    if (sel) sel.removeAllRanges();

    openModalFn(colIdx, slotIdx);
  };

  const focusText = (e) => {
    if (e.detail && e.detail > 1) return;

    if (
      e.target.closest(
        ".sticky-grip, .qa-score-badge, .id-tag, .label-tl, .label-tr, .label-br, .link-icon"
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
  if (qaScore !== null) {
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
  scoreBadgeHTML
}) {
  const procEmoji = (slotIdx === 3 && slot.processStatus) ? getProcessEmoji(slot.processStatus) : "";

  return `
    <div class="sticky ${statusClass}" data-col="${colIdx}" data-slot="${slotIdx}">
      <div class="sticky-grip"></div>

      ${(slotIdx === 3 && slot.type) ? `<div class="label-tl">${typeIcon} ${slot.type}</div>` : ''}
      ${(slotIdx === 3 && procEmoji) ? `<div class="label-tr">${procEmoji}</div>` : ''}
      ${(slotIdx === 3 && slot.processValue) ? `<div class="label-br">${slot.processValue}</div>` : ''}

      ${(slotIdx === 2 && myInputId) ? `<div class="id-tag">${myInputId}</div>` : ''}
      ${(slotIdx === 4 && myOutputId) ? `<div class="id-tag">${myOutputId}</div>` : ''}

      ${scoreBadgeHTML}

      ${isLinked ? '<span class="link-icon" style="position:absolute; top:2px; right:4px;">🔗</span>' : ''}

      <div class="sticky-content">
        <div class="text"
             ${isLinked ? 'contenteditable="false" data-linked="true"' : 'contenteditable="true"'}
             spellcheck="false"></div>
      </div>
    </div>
  `;
}

function renderConnector({ colsContainer, activeSheet, col, colIdx }) {
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
    colsContainer.appendChild(connEl);
    return;
  }

  connEl.className = "col-connector";

  if (col.hasTransition) {
    connEl.innerHTML = `
      <div class="connector-active">
        <input class="connector-input-minimal" placeholder="Tijd...">
        <div class="connector-arrow-minimal"></div>
        <span class="connector-text-export"></span>
        <button class="connector-delete">×</button>
      </div>
    `;

    const inp = connEl.querySelector("input");
    const exportSpan = connEl.querySelector(".connector-text-export");
    const delBtn = connEl.querySelector(".connector-delete");

    inp.value = col.transitionNext || "";
    if (exportSpan) exportSpan.textContent = inp.value;

    inp.oninput = (e) => {
      state.setTransition(colIdx, e.target.value);
      if (exportSpan) exportSpan.textContent = e.target.value;
    };

    if (delBtn) {
      delBtn.onclick = () => state.setTransition(colIdx, null);
    }
  } else {
    const btn = document.createElement("button");
    btn.className = "connector-add";
    btn.textContent = "+";
    btn.onclick = () => state.setTransition(colIdx, "");
    connEl.appendChild(btn);
  }

  colsContainer.appendChild(connEl);
}

export function renderBoard(openModalFn) {
  const activeSheet = state.activeSheet;
  if (!activeSheet) return;
  if (shouldSkipRender()) return;

  renderSheetSelect();
  renderHeader(activeSheet);
  ensureRowHeaders();

  const colsContainer = $("cols");
  if (!colsContainer) return;
  colsContainer.innerHTML = "";

  const offsets = state.getGlobalCountersBeforeActive();
  const allOutputMap = state.getAllOutputs();

  let localInCounter = 0;
  let localOutCounter = 0;

  const stats = { happy: 0, neutral: 0, sad: 0 };

  activeSheet.columns.forEach((col, colIdx) => {
    if (col.isVisible === false) return;

    let myInputId = "";
    let myOutputId = "";

    // ✅ Input ID: als linkedSourceId bestaat, toon die altijd (ook als input.text leeg is)
    if (col.slots[2].linkedSourceId && allOutputMap[col.slots[2].linkedSourceId]) {
      myInputId = col.slots[2].linkedSourceId;
    } else if (col.slots[2].text?.trim()) {
      localInCounter++;
      myInputId = `IN${offsets.inStart + localInCounter}`;
    }

    // Output ID: zoals voorheen
    if (col.slots[4].text?.trim()) {
      localOutCounter++;
      myOutputId = `OUT${offsets.outStart + localOutCounter}`;
    }

    const colEl = document.createElement("div");
    colEl.className = `col ${col.isParallel ? "is-parallel" : ""}`;
    colEl.dataset.idx = colIdx;

    const actionsEl = document.createElement("div");
    actionsEl.className = "col-actions";
    actionsEl.innerHTML = `
      <button class="btn-col-action btn-arrow" data-action="move" data-dir="-1">←</button>
      <div class="btn-col-action btn-move-col">↔</div>
      <button class="btn-col-action btn-arrow" data-action="move" data-dir="1">→</button>
      ${colIdx > 0 ? `<button class="btn-col-action btn-parallel ${col.isParallel ? "active" : ""}" data-action="parallel">∥</button>` : ""}
      <button class="btn-col-action btn-hide-col" data-action="hide">👁️</button>
      <button class="btn-col-action btn-add-col-here" data-action="add">+</button>
      <button class="btn-col-action btn-delete-col" data-action="delete">×</button>
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

      // ✅ Linked input: toon output-tekst en maak read-only
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
        scoreBadgeHTML
      });

      const textEl = slotDiv.querySelector(".text");
      const stickyEl = slotDiv.querySelector(".sticky");

      textEl.textContent = displayText;

      attachStickyInteractions({ stickyEl, textEl, colIdx, slotIdx, openModalFn });

      // ✅ Voorkom dat linked input edits state.updateStickyText triggeren
      if (!isLinked) {
        textEl.addEventListener("input", () => {
          state.updateStickyText(colIdx, slotIdx, textEl.textContent);
        });
      }

      slotsEl.appendChild(slotDiv);
    });

    colEl.appendChild(slotsEl);
    colsContainer.appendChild(colEl);

    renderConnector({ colsContainer, activeSheet, col, colIdx });
  });

  const happyEl = $("countHappy");
  const neutralEl = $("countNeutral");
  const sadEl = $("countSad");

  if (happyEl) happyEl.textContent = stats.happy;
  if (neutralEl) neutralEl.textContent = stats.neutral;
  if (sadEl) sadEl.textContent = stats.sad;

  setTimeout(syncRowHeights, 0);
}

export function setupDelegatedEvents() {
  const colsContainer = $("cols");
  if (!colsContainer) return;

  colsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-col-action");
    if (!btn) return;

    const colEl = btn.closest(".col");
    if (!colEl) return;

    const idx = parseInt(colEl.dataset.idx, 10);
    const action = btn.dataset.action;

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
        if (state.toggleParallel) {
          state.toggleParallel(idx);
        } else {
          const col = state.activeSheet.columns[idx];
          col.isParallel = !col.isParallel;
        }
        break;
    }
  });
}