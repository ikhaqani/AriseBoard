import {
  createProjectState,
  createSheet,
  createColumn,
  createSticky,
  STORAGE_KEY
} from './config.js';

class StateManager {
  constructor() {
    this.project = createProjectState();
    this.listeners = new Set();
    this.saveCallbacks = new Set();
    this.historyStack = [];
    this.redoStack = [];
    this.maxHistory = 20;

    this._lastNotifyTs = 0;
    this._notifyQueued = false;
    this._pendingMeta = null;
    this._suspendNotify = 0;

    this.loadFromStorage();
  }

  subscribe(listenerFn) {
    this.listeners.add(listenerFn);
    return () => this.listeners.delete(listenerFn);
  }

  onSave(fn) {
    this.saveCallbacks.add(fn);
    return () => this.saveCallbacks.delete(fn);
  }

  beginBatch(meta = { reason: 'batch' }) {
    this._suspendNotify++;
    this._pendingMeta = this._mergeMeta(this._pendingMeta, meta);
  }

  endBatch(meta = null) {
    this._suspendNotify = Math.max(0, this._suspendNotify - 1);
    if (meta) this._pendingMeta = this._mergeMeta(this._pendingMeta, meta);
    if (this._suspendNotify === 0) this.notify(this._pendingMeta || { reason: 'batch' });
  }

  _mergeMeta(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return a ? { ...a } : null;
    return { ...a, ...b };
  }

  notify(meta = { reason: 'full' }, { clone = false, throttleMs = 0 } = {}) {
    if (this._suspendNotify > 0) {
      this._pendingMeta = this._mergeMeta(this._pendingMeta, meta);
      return;
    }

    const now = performance.now();

    if (throttleMs > 0 && now - this._lastNotifyTs < throttleMs) {
      this._pendingMeta = this._mergeMeta(this._pendingMeta, meta);
      if (this._notifyQueued) return;
      this._notifyQueued = true;

      requestAnimationFrame(() => {
        this._notifyQueued = false;
        const merged = this._pendingMeta || meta;
        this._pendingMeta = null;
        this._lastNotifyTs = performance.now();
        this._emit(merged, { clone });
      });

      return;
    }

    this._lastNotifyTs = now;
    this._emit(meta, { clone });
  }

  _emit(meta, { clone }) {
    const payload = clone
      ? (typeof structuredClone === 'function'
          ? structuredClone(this.project)
          : JSON.parse(JSON.stringify(this.project)))
      : this.project;

    this.listeners.forEach((fn) => fn(payload, meta));
  }

  pushHistory({ throttleMs = 0 } = {}) {
    if (throttleMs > 0) {
      const now = performance.now();
      if (this._lastHistoryTs && now - this._lastHistoryTs < throttleMs) return;
      this._lastHistoryTs = now;
    }

    const snapshot = JSON.stringify(this.project);
    const last = this.historyStack[this.historyStack.length - 1];
    if (last === snapshot) return;

    this.historyStack.push(snapshot);
    if (this.historyStack.length > this.maxHistory) this.historyStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.historyStack.length === 0) return false;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.historyStack.pop());
    this.notify({ reason: 'full' }, { clone: false });
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.historyStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    this.notify({ reason: 'full' }, { clone: false });
    return true;
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      this.project = this.sanitizeProjectData(parsed);
    } catch (e) {
      console.error("Critical: Failed to load project state.", e);
    }
  }

  sanitizeProjectData(data) {
    const fresh = createProjectState();
    const merged = { ...fresh, ...data };

    if (!Array.isArray(merged.sheets) || merged.sheets.length === 0) {
      merged.sheets = fresh.sheets;
      return merged;
    }

    merged.sheets.forEach((sheet) => {
      if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) {
        sheet.columns = [createColumn()];
      }

      sheet.columns.forEach((col) => {
        if (!Array.isArray(col.slots) || col.slots.length !== 6) {
          col.slots = Array(6).fill(null).map(() => createSticky());
          return;
        }

        col.slots = col.slots.map((slot) => {
          const clean = createSticky();
          const s = slot || {};

          return {
            ...clean,
            ...s,

            // Keep nested objects merged
            qa: { ...clean.qa, ...(s.qa || {}) },
            systemData: { ...clean.systemData, ...(s.systemData || {}) },

            // Keep existing fields
            linkedSourceId: s.linkedSourceId ?? clean.linkedSourceId,
            inputDefinitions: Array.isArray(s.inputDefinitions) ? s.inputDefinitions : clean.inputDefinitions,
            disruptions: Array.isArray(s.disruptions) ? s.disruptions : clean.disruptions,

            // NEW: Werkbeleving / werkplezier velden
            workExp: s.workExp ?? clean.workExp,
            workExpNote: s.workExpNote ?? clean.workExpNote
          };
        });
      });
    });

    return merged;
  }

  saveToStorage() {
    try {
      this.project.lastModified = new Date().toISOString();
      this.saveCallbacks.forEach((fn) => fn('saving'));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      this.notify({ reason: 'saved' }, { clone: false });
      setTimeout(() => this.saveCallbacks.forEach((fn) => fn('saved')), 400);
    } catch (e) {
      console.error("Save error:", e);
      this.saveCallbacks.forEach((fn) => fn('error', "Opslag fout"));
    }
  }

  get data() {
    return this.project;
  }

  get activeSheet() {
    return this.project.sheets.find((s) => s.id === this.project.activeSheetId) || this.project.sheets[0];
  }

  setActiveSheet(id) {
    if (!this.project.sheets.some((s) => s.id === id)) return;
    this.project.activeSheetId = id;
    this.notify({ reason: 'sheet' }, { clone: false });
  }

  updateProjectTitle(title) {
    this.project.projectTitle = title;
    this.notify({ reason: 'title' }, { clone: false, throttleMs: 50 });
  }

  updateStickyText(colIdx, slotIdx, text) {
    const sheet = this.activeSheet;
    const slot = sheet.columns[colIdx]?.slots?.[slotIdx];
    if (!slot) return;
    slot.text = text;
    this.notify({ reason: 'text', colIdx, slotIdx }, { clone: false, throttleMs: 50 });
  }

  setTransition(colIdx, val) {
    const col = this.activeSheet.columns[colIdx];
    if (!col) return;

    if (val === null) {
      col.hasTransition = false;
      col.transitionNext = "";
    } else {
      col.hasTransition = true;
      col.transitionNext = val;
    }

    this.notify({ reason: 'transition', colIdx }, { clone: false, throttleMs: 50 });
  }

  addSheet(name) {
    this.pushHistory();
    const newSheet = createSheet(name || `Proces ${this.project.sheets.length + 1}`);
    this.project.sheets.push(newSheet);
    this.project.activeSheetId = newSheet.id;
    this.notify({ reason: 'sheets' }, { clone: false });
  }

  renameSheet(newName) {
    const sheet = this.activeSheet;
    if (!sheet || !newName || sheet.name === newName) return;
    this.pushHistory();
    sheet.name = newName;
    this.notify({ reason: 'sheets' }, { clone: false });
  }

  deleteSheet() {
    if (this.project.sheets.length <= 1) return false;

    const idx = this.project.sheets.findIndex((s) => s.id === this.project.activeSheetId);
    if (idx === -1) return false;

    this.pushHistory();
    this.project.sheets.splice(idx, 1);

    const newIdx = Math.max(0, idx - 1);
    this.project.activeSheetId = this.project.sheets[newIdx].id;

    this.notify({ reason: 'sheets' }, { clone: false });
    return true;
  }

  addColumn(afterIndex) {
    this.pushHistory();
    const sheet = this.activeSheet;
    const newCol = createColumn();

    if (afterIndex === -1) sheet.columns.push(newCol);
    else sheet.columns.splice(afterIndex + 1, 0, newCol);

    this.notify({ reason: 'columns' }, { clone: false });
  }

  deleteColumn(index) {
    const sheet = this.activeSheet;
    if (sheet.columns.length <= 1) return false;

    this.pushHistory();
    sheet.columns.splice(index, 1);
    this.notify({ reason: 'columns' }, { clone: false });
    return true;
  }

  moveColumn(index, direction) {
    const sheet = this.activeSheet;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sheet.columns.length) return;

    this.pushHistory();
    [sheet.columns[index], sheet.columns[targetIndex]] = [sheet.columns[targetIndex], sheet.columns[index]];
    this.notify({ reason: 'columns' }, { clone: false });
  }

  setColVisibility(index, isVisible) {
    const sheet = this.activeSheet;
    if (!sheet.columns[index]) return;

    this.pushHistory();
    sheet.columns[index].isVisible = isVisible;
    this.notify({ reason: 'columns' }, { clone: false });
  }

  saveStickyDetails() {
    this.pushHistory();
    this.notify({ reason: 'details' }, { clone: false });
  }

  toggleParallel(colIdx) {
    this.pushHistory();
    const col = this.activeSheet.columns[colIdx];
    if (!col) return;

    col.isParallel = !col.isParallel;
    this.notify({ reason: 'columns' }, { clone: false });
  }

  getGlobalCountersBeforeActive() {
    let inCount = 0;
    let outCount = 0;

    for (const sheet of this.project.sheets) {
      if (sheet.id === this.project.activeSheetId) break;
      sheet.columns.forEach((col) => {
        if (col.isVisible !== false) {
          if (col.slots[2].text?.trim()) inCount++;
          if (col.slots[4].text?.trim()) outCount++;
        }
      });
    }

    return { inStart: inCount, outStart: outCount };
  }

  getAllOutputs() {
    const map = {};
    let counter = 0;

    this.project.sheets.forEach((sheet) => {
      sheet.columns.forEach((col) => {
        if (col.slots[4].text?.trim()) {
          counter++;
          map[`OUT${counter}`] = col.slots[4].text;
        }
      });
    });

    return map;
  }
}

export const state = new StateManager();