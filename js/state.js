import { createProjectState, createSheet, createColumn, STORAGE_KEY } from './config.js';

/**
 * state.js
 * Verantwoordelijk voor State Management (Data) en Reactivity (Observer Pattern).
 * Dit is de enige plek waar data-mutaties plaatsvinden.
 */

class StateManager {
    constructor() {
        // 1. Initialiseer met standaard lege structuur
        this.project = createProjectState();
        
        // 2. Lijst met functies die luisteren naar wijzigingen
        this.listeners = new Set();
        
        // 3. Probeer opgeslagen data te laden
        this.loadFromStorage();
    }

    // --- Observer Pattern (Reactivity) ---

    /**
     * Abonneer een functie op wijzigingen.
     * @param {Function} listenerFn - Functie die wordt uitgevoerd bij update.
     */
    subscribe(listenerFn) {
        this.listeners.add(listenerFn);
    }

    /**
     * Trigger alle abonnees (bv. renderBoard).
     */
    notify() {
        this.listeners.forEach(fn => fn(this.project));
    }

    // --- Getters ---

    /** Geeft het volledige data object terug */
    get data() {
        return this.project;
    }

    /** Geeft het momenteel actieve tabblad (Sheet) terug */
    get activeSheet() {
        return this.project.sheets.find(s => s.id === this.project.activeSheetId) || this.project.sheets[0];
    }

    // --- Persistence ---

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validatie: check of de structuur geldig is
                if (parsed && Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
                    this.project = parsed;
                }
            }
        } catch (e) {
            console.error("Critical: Failed to load project state.", e);
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
            // Cruciaal: Vertel de app dat de data is gewijzigd
            this.notify();
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                alert("Opslag limiet bereikt! Exporteer je project en maak ruimte vrij.");
            } else {
                console.error("Save error:", e);
            }
        }
    }

    // --- Sheet Operations ---

    setActiveSheet(id) {
        if (this.project.sheets.some(s => s.id === id)) {
            this.project.activeSheetId = id;
            this.saveToStorage();
        }
    }

    addSheet(name) {
        const newSheet = createSheet(name || `Proces ${this.project.sheets.length + 1}`);
        this.project.sheets.push(newSheet);
        this.project.activeSheetId = newSheet.id;
        this.saveToStorage();
    }

    renameSheet(newName) {
        const sheet = this.activeSheet;
        if (sheet && newName) {
            sheet.name = newName;
            this.saveToStorage();
        }
    }

    deleteSheet() {
        if (this.project.sheets.length <= 1) return false;
        
        const idx = this.project.sheets.findIndex(s => s.id === this.project.activeSheetId);
        if (idx === -1) return false;

        this.project.sheets.splice(idx, 1);
        
        // Selecteer vorig blad, of het eerste als we op index 0 stonden
        const newIdx = Math.max(0, idx - 1);
        this.project.activeSheetId = this.project.sheets[newIdx].id;
        
        this.saveToStorage();
        return true;
    }

    // --- Column Operations ---

    addColumn(afterIndex) {
        const sheet = this.activeSheet;
        const newCol = createColumn(); 
        
        if (afterIndex === -1) {
            sheet.columns.push(newCol);
        } else {
            sheet.columns.splice(afterIndex + 1, 0, newCol);
        }
        this.saveToStorage();
    }

    deleteColumn(index) {
        const sheet = this.activeSheet;
        if (sheet.columns.length > 1) {
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
            // Array destructuring swap
            [sheet.columns[index], sheet.columns[targetIndex]] = 
            [sheet.columns[targetIndex], sheet.columns[index]];
            
            this.saveToStorage();
        }
    }

    setColVisibility(index, isVisible) {
        const sheet = this.activeSheet;
        if (sheet.columns[index]) {
            sheet.columns[index].isVisible = isVisible;
            this.saveToStorage();
        }
    }

    // --- Content Operations ---

    updateStickyText(colIdx, slotIdx, text) {
        const sheet = this.activeSheet;
        if (sheet.columns[colIdx] && sheet.columns[colIdx].slots[slotIdx]) {
            sheet.columns[colIdx].slots[slotIdx].text = text;
            
            // Note: We roepen hier saveToStorage aan, wat een re-render triggert.
            // Dit is nodig voor Input/Output ID updates (IN1, OUT2), maar kan typen vertragen.
            // In dom.js gebruiken we 'input' event. Voor optimalisatie zou debounce kunnen,
            // maar voor deze schaal is direct saven prima.
            this.saveToStorage(); 
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
        this.saveToStorage();
    }

    // --- Global Logic Helpers ---

    /**
     * Telt hoeveel Inputs/Outputs er in de voorgaande sheets waren.
     * Dit zorgt voor doorgenummerde ID's (IN1..IN5 op blad 1, IN6 op blad 2).
     */
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

    /**
     * Verzamelt alle Outputs van het hele project voor de 'Linked Input' dropdown.
     */
    getAllOutputs() {
        const map = {};
        let counter = 0;
        
        this.project.sheets.forEach(sheet => {
            sheet.columns.forEach(col => {
                // Check of output slot (index 4) tekst heeft
                if (col.slots[4].text?.trim()) {
                    counter++;
                    const id = `OUT${counter}`;
                    map[id] = col.slots[4].text;
                }
            });
        });
        return map;
    }
}

// Singleton: we exporteren één instantie die door de hele app wordt gebruikt.
export const state = new StateManager();