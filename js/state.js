import { createProjectState, createSheet, createColumn, createSticky, STORAGE_KEY } from './config.js';

/**
 * state.js
 * Robuuste State Manager - ZONDER Autosave tijdens typen.
 */

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

    subscribe(listenerFn) { this.listeners.add(listenerFn); }
    onSave(fn) { this.saveCallbacks.add(fn); }

    notify() {
        const safeClone = JSON.parse(JSON.stringify(this.project));
        this.listeners.forEach(fn => fn(safeClone));
    }

    pushHistory() {
        const snapshot = JSON.stringify(this.project);
        if (this.historyStack.length > 0 && this.historyStack[this.historyStack.length - 1] === snapshot) return;
        this.historyStack.push(snapshot);
        if (this.historyStack.length > this.maxHistory) this.historyStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.historyStack.length === 0) return false;
        this.redoStack.push(JSON.stringify(this.project));
        this.project = JSON.parse(this.historyStack.pop());
        this.saveToStorage();
        return true;
    }

    redo() {
        if (this.redoStack.length === 0) return false;
        this.historyStack.push(JSON.stringify(this.project));
        this.project = JSON.parse(this.redoStack.pop());
        this.saveToStorage();
        return true;
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.project = this.sanitizeProjectData(parsed);
            }
        } catch (e) {
            console.error("Critical: Failed to load project state.", e);
        }
    }

    sanitizeProjectData(data) {
        const fresh = createProjectState();
        const merged = { ...fresh, ...data };
        if (!Array.isArray(merged.sheets) || merged.sheets.length === 0) {
            merged.sheets = fresh.sheets;
        } else {
            merged.sheets.forEach(sheet => {
                if (!Array.isArray(sheet.columns)) sheet.columns = [createColumn()];
                sheet.columns.forEach(col => {
                    if (!Array.isArray(col.slots)) {
                        col.slots = Array(6).fill(null).map(() => createSticky());
                    } else {
                        col.slots = col.slots.map(slot => {
                            const cleanSticky = createSticky();
                            return { 
                                ...cleanSticky, ...slot, 
                                qa: { ...cleanSticky.qa, ...(slot.qa || {}) },
                                systemData: { ...cleanSticky.systemData, ...(slot.systemData || {}) }
                            };
                        });
                    }
                });
            });
        }
        return merged;
    }

    // De enige echte Save functie
    saveToStorage() {
        try {
            this.project.lastModified = new Date().toISOString();
            this.saveCallbacks.forEach(fn => fn('saving'));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
            
            this.notify(); // Update het scherm
            
            setTimeout(() => this.saveCallbacks.forEach(fn => fn('saved')), 400);
        } catch (e) {
            console.error("Save error:", e);
            this.saveCallbacks.forEach(fn => fn('error', "Opslag fout"));
        }
    }

    get data() { return this.project; }
    get activeSheet() { return this.project.sheets.find(s => s.id === this.project.activeSheetId) || this.project.sheets[0]; }

    setActiveSheet(id) {
        if (this.project.sheets.some(s => s.id === id)) {
            this.project.activeSheetId = id;
            this.saveToStorage();
        }
    }

    // --- Update Functies (ALLEEN DATA, GEEN SAVE) ---
    // Deze functies passen nu alleen het geheugen aan. Save wordt getriggerd door 'blur' events in de UI.

    updateProjectTitle(title) {
        this.project.projectTitle = title;
    }

    updateStickyText(colIdx, slotIdx, text) {
        const sheet = this.activeSheet;
        const slot = sheet.columns[colIdx]?.slots[slotIdx];
        if (slot) {
            slot.text = text;
        }
    }

    setTransition(colIdx, val) {
        const col = this.activeSheet.columns[colIdx];
        if(!col) return;
        if (val === null) {
            col.hasTransition = false;
            col.transitionNext = "";
        } else {
            col.hasTransition = true;
            col.transitionNext = val;
        }
    }

    // --- Acties die wel direct moeten saven (structuur wijzigingen) ---

    addSheet(name) {
        this.pushHistory();
        const newSheet = createSheet(name || `Proces ${this.project.sheets.length + 1}`);
        this.project.sheets.push(newSheet);
        this.project.activeSheetId = newSheet.id;
        this.saveToStorage();
    }

    renameSheet(newName) {
        const sheet = this.activeSheet;
        if (sheet && newName && sheet.name !== newName) {
            this.pushHistory();
            sheet.name = newName;
            this.saveToStorage();
        }
    }

    deleteSheet() {
        if (this.project.sheets.length <= 1) return false;
        const idx = this.project.sheets.findIndex(s => s.id === this.project.activeSheetId);
        if (idx === -1) return false;
        this.pushHistory();
        this.project.sheets.splice(idx, 1);
        const newIdx = Math.max(0, idx - 1);
        this.project.activeSheetId = this.project.sheets[newIdx].id;
        this.saveToStorage();
        return true;
    }

    addColumn(afterIndex) {
        this.pushHistory();
        const sheet = this.activeSheet;
        const newCol = createColumn(); 
        if (afterIndex === -1) sheet.columns.push(newCol);
        else sheet.columns.splice(afterIndex + 1, 0, newCol);
        this.saveToStorage();
    }

    deleteColumn(index) {
        const sheet = this.activeSheet;
        if (sheet.columns.length > 1) {
            this.pushHistory();
            sheet.columns.splice(index, 1);
            this.saveToStorage();
            return true;
        }
        return false;
    }

    moveColumn(index, direction) {
        const sheet = this.activeSheet;
        const targetIndex = index + direction;
        if (targetIndex >= 0 && targetIndex < sheet.columns.length) {
            this.pushHistory();
            [sheet.columns[index], sheet.columns[targetIndex]] = [sheet.columns[targetIndex], sheet.columns[index]];
            this.saveToStorage();
        }
    }

    setColVisibility(index, isVisible) {
        const sheet = this.activeSheet;
        if (sheet.columns[index]) {
            this.pushHistory(); 
            sheet.columns[index].isVisible = isVisible;
            this.saveToStorage();
        }
    }

    saveStickyDetails() {
        this.pushHistory();
        this.saveToStorage();
    }

    toggleParallel(colIdx) {
        this.pushHistory();
        const col = this.activeSheet.columns[colIdx];
        if (col) {
            col.isParallel = !col.isParallel;
            this.saveToStorage();
        }
    }

    getGlobalCountersBeforeActive() {
        let inCount = 0;
        let outCount = 0;
        for (const sheet of this.project.sheets) {
            if (sheet.id === this.project.activeSheetId) break;
            sheet.columns.forEach(col => {
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
        this.project.sheets.forEach(sheet => {
            sheet.columns.forEach(col => {
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