import { defaultProjectState, createSheet, defaultSticky, uid, STORAGE_KEY } from './config.js';

class StateManager {
    constructor() {
        this.project = defaultProjectState();
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.sheets) this.project = parsed;
            }
        } catch (e) { console.error("Load error", e); }
    }

    saveToStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
    }

    getActiveSheet() {
        return this.project.sheets.find(s => s.id === this.project.activeSheetId);
    }

    setActiveSheet(id) {
        this.project.activeSheetId = id;
        this.saveToStorage();
    }

    addSheet(name) {
        const newSheet = createSheet(name);
        this.project.sheets.push(newSheet);
        this.project.activeSheetId = newSheet.id;
        this.saveToStorage();
    }

    renameSheet(newName) {
        const sheet = this.getActiveSheet();
        if (sheet) {
            sheet.name = newName;
            this.saveToStorage();
        }
    }

    deleteSheet() {
        if (this.project.sheets.length <= 1) return false;
        const idx = this.project.sheets.findIndex(s => s.id === this.project.activeSheetId);
        this.project.sheets.splice(idx, 1);
        this.project.activeSheetId = this.project.sheets[0].id;
        this.saveToStorage();
        return true;
    }

    // Column Ops
    addColumn(idx) {
        const sheet = this.getActiveSheet();
        sheet.columns.splice(idx + 1, 0, {
            id: uid(), isVisible: true,
            slots: Array(6).fill(null).map(() => defaultSticky()),
            hasTransition: false, transitionNext: "", isParallel: false
        });
        this.saveToStorage();
    }

    deleteColumn(idx) {
        const sheet = this.getActiveSheet();
        if (sheet.columns.length > 1) {
            sheet.columns.splice(idx, 1);
            this.saveToStorage();
            return true;
        }
        return false;
    }

    moveColumn(idx, dir) {
        const sheet = this.getActiveSheet();
        const target = idx + dir;
        if (target >= 0 && target < sheet.columns.length) {
            const temp = sheet.columns[idx];
            sheet.columns[idx] = sheet.columns[target];
            sheet.columns[target] = temp;
            this.saveToStorage();
        }
    }

    toggleColVisibility(idx, visible) {
        const sheet = this.getActiveSheet();
        sheet.columns[idx].isVisible = visible;
        this.saveToStorage();
    }

    toggleParallel(idx) {
        const sheet = this.getActiveSheet();
        sheet.columns[idx].isParallel = !sheet.columns[idx].isParallel;
        this.saveToStorage();
    }

    // Text update
    updateStickyText(colIdx, slotIdx, text) {
        const sheet = this.getActiveSheet();
        sheet.columns[colIdx].slots[slotIdx].text = text;
        this.saveToStorage();
    }

    // Helpers for IDs
    getGlobalCountersBeforeActive() {
        let inCount = 0, outCount = 0;
        for (let sheet of this.project.sheets) {
            if (sheet.id === this.project.activeSheetId) break;
            sheet.columns.forEach(col => {
                if (col.slots[2].text?.trim()) inCount++;
                if (col.slots[4].text?.trim()) outCount++;
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