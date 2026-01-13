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
        this.loadFromStorage();
    }

    subscribe(listenerFn) {
        this.listeners.add(listenerFn);
    }

    onSave(fn) {
        this.saveCallbacks.add(fn);
    }

    notify() {
        const safeClone = JSON.parse(JSON.stringify(this.project));
        this.listeners.forEach((fn) => fn(safeClone));
    }

    pushHistory() {
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
        this.notify();
        return true;
    }

    redo() {
        if (this.redoStack.length === 0) return false;
        this.historyStack.push(JSON.stringify(this.project));
        this.project = JSON.parse(this.redoStack.pop());
        this.notify();
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
                    col.slots = Array(6)
                        .fill(null)
                        .map(() => createSticky());
                    return;
                }

                col.slots = col.slots.map((slot) => {
                    const clean = createSticky();
                    return {
                        ...clean,
                        ...slot,
                        qa: { ...clean.qa, ...(slot?.qa || {}) },
                        systemData: { ...clean.systemData, ...(slot?.systemData || {}) }
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
            this.notify();
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
        this.notify();
    }

    updateProjectTitle(title) {
        this.project.projectTitle = title;
        this.notify();
    }

    updateStickyText(colIdx, slotIdx, text) {
        const sheet = this.activeSheet;
        const slot = sheet.columns[colIdx]?.slots?.[slotIdx];
        if (!slot) return;
        slot.text = text;
        this.notify();
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

        this.notify();
    }

    addSheet(name) {
        this.pushHistory();
        const newSheet = createSheet(name || `Proces ${this.project.sheets.length + 1}`);
        this.project.sheets.push(newSheet);
        this.project.activeSheetId = newSheet.id;
        this.notify();
    }

    renameSheet(newName) {
        const sheet = this.activeSheet;
        if (!sheet || !newName || sheet.name === newName) return;
        this.pushHistory();
        sheet.name = newName;
        this.notify();
    }

    deleteSheet() {
        if (this.project.sheets.length <= 1) return false;

        const idx = this.project.sheets.findIndex((s) => s.id === this.project.activeSheetId);
        if (idx === -1) return false;

        this.pushHistory();
        this.project.sheets.splice(idx, 1);

        const newIdx = Math.max(0, idx - 1);
        this.project.activeSheetId = this.project.sheets[newIdx].id;

        this.notify();
        return true;
    }

    addColumn(afterIndex) {
        this.pushHistory();
        const sheet = this.activeSheet;
        const newCol = createColumn();

        if (afterIndex === -1) sheet.columns.push(newCol);
        else sheet.columns.splice(afterIndex + 1, 0, newCol);

        this.notify();
    }

    deleteColumn(index) {
        const sheet = this.activeSheet;
        if (sheet.columns.length <= 1) return false;

        this.pushHistory();
        sheet.columns.splice(index, 1);
        this.notify();
        return true;
    }

    moveColumn(index, direction) {
        const sheet = this.activeSheet;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= sheet.columns.length) return;

        this.pushHistory();
        [sheet.columns[index], sheet.columns[targetIndex]] = [sheet.columns[targetIndex], sheet.columns[index]];
        this.notify();
    }

    setColVisibility(index, isVisible) {
        const sheet = this.activeSheet;
        if (!sheet.columns[index]) return;

        this.pushHistory();
        sheet.columns[index].isVisible = isVisible;
        this.notify();
    }

    saveStickyDetails() {
        this.pushHistory();
        this.notify();
    }

    toggleParallel(colIdx) {
        this.pushHistory();
        const col = this.activeSheet.columns[colIdx];
        if (!col) return;

        col.isParallel = !col.isParallel;
        this.notify();
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