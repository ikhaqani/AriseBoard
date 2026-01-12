import { state } from './state.js';
import { Toast } from './toast.js';

/**
 * io.js
 * High-Performance Import/Export Module.
 * Features: File System Access API, Clipboard integration, High-DPI Screenshots.
 */

// --- Helpers ---

/**
 * Maakt tekst veilig voor CSV (RFC 4180 standaard).
 * @param {any} text 
 */
const toCsvField = (text) => {
    if (text === null || text === undefined) return '""';
    const str = String(text);
    // Vervang " door "" en wrap in "
    return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
};

/**
 * Genereert een consistente bestandsnaam met timestamp.
 * @param {string} ext - Extensie (zonder punt).
 */
const getFileName = (ext) => {
    const title = state.data.projectTitle || "sipoc_project";
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10);
    const timeStr = now.toTimeString().slice(0,8).replace(/:/g, ''); // HHMMSS
    
    return `${safeTitle}_${dateStr}_${timeStr}.${ext}`;
};

// --- JSON Import / Export ---

/**
 * Slaat het project op als JSON bestand.
 * Probeert de moderne 'Save As' dialoog te gebruiken.
 */
export async function saveToFile() {
    const dataStr = JSON.stringify(state.data, null, 2);
    const fileName = getFileName('json');

    try {
        // 1. Moderne Browser API (Chrome, Edge)
        if ('showSaveFilePicker' in window) {
            const handle = await window.showSaveFilePicker({ 
                suggestedName: fileName, 
                types: [{ 
                    description: 'SIPOC Project File', 
                    accept: {'application/json': ['.json']} 
                }] 
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr); 
            await writable.close();
            return; // Success handled by caller toast
        }
    } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled
        console.warn("FS API failed/cancelled, falling back to legacy download.");
    }

    // 2. Legacy Fallback (Safari, Firefox)
    downloadBlob(new Blob([dataStr], { type: "application/json" }), fileName);
}

/**
 * Laadt een JSON bestand en update de state.
 * @param {File} file 
 * @param {Function} onSuccess - Callback na succes.
 */
export function loadFromFile(file, onSuccess) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);

            // Validatie: check of cruciale velden bestaan
            if (!parsed || !Array.isArray(parsed.sheets)) {
                throw new Error("Ongeldig formaat: Geen sheets gevonden.");
            }

            // State update (State manager handelt sanitization af indien nodig)
            state.project = parsed;
            state.saveToStorage();
            
            if (onSuccess) onSuccess();
            
        } catch (err) {
            console.error("Load Error:", err);
            Toast.show(`Fout bij laden: ${err.message}`, 'error');
        }
    };
    reader.readAsText(file);
}

// --- CSV / Excel Export ---

export function exportToCSV() {
    try {
        const headers = [
            "Sheet", "Kolom", "ID", "Stap", "Inhoud", 
            "Type", "Waarde", "Status", "Score", 
            "QA / Specs", "Root Causes", "Maatregelen"
        ];

        let csvLines = [headers.join(";")];
        let globalIn = 0, globalOut = 0;

        state.data.sheets.forEach(sheet => {
            sheet.columns.forEach((col, colIdx) => {
                // Bereken ID's voor mapping
                let rowId = "";
                if (col.slots[2].text?.trim()) { globalIn++; rowId = `IN${globalIn}`; }
                if (col.slots[4].text?.trim()) { globalOut++; rowId = `OUT${globalOut}`; }

                // Map elke slot naar een CSV rij
                col.slots.forEach((slot, slotIdx) => {
                    const rowLabels = ["Lev", "Sys", "Input", "Proces", "Output", "Klant"];
                    
                    // Format specifieke velden
                    let score = "";
                    if (slotIdx === 1 && slot.systemData) score = `${slot.systemData.calculatedScore || 0}%`;
                    
                    let details = "";
                    if (slot.qa) {
                        details = Object.entries(slot.qa)
                            .filter(([_, v]) => v.result) // Alleen ingevulde tonen
                            .map(([k, v]) => `${k}:${v.result}`)
                            .join(" | ");
                    }

                    const rowData = [
                        sheet.name,
                        colIdx + 1,
                        (slotIdx === 2 || slotIdx === 4) ? rowId : "",
                        rowLabels[slotIdx],
                        slot.text,
                        slot.type || "",
                        slot.processValue || "",
                        slot.processStatus || "",
                        score,
                        details,
                        (slot.causes || []).join(" | "),
                        (slot.improvements || []).join(" | ")
                    ];

                    csvLines.push(rowData.map(toCsvField).join(";"));
                });
            });
        });

        // BOM toevoegen voor correcte weergave in Excel (UTF-8)
        const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
        downloadBlob(blob, getFileName('csv'));

    } catch (e) {
        console.error(e);
        Toast.show("Fout bij genereren CSV", 'error');
    }
}

// --- Image Export (High DPI) ---

/**
 * Maakt een screenshot van het bord.
 * @param {boolean} copyToClipboard - Indien true, kopieert naar klembord i.p.v. download.
 */
export async function exportHD(copyToClipboard = false) {
    if (typeof html2canvas === 'undefined') {
        Toast.show("Export module niet geladen", 'error');
        return;
    }

    const board = document.getElementById("board");
    if (!board) return;

    // UX: Geef feedback dat we bezig zijn
    Toast.show("Afbeelding genereren...", 'info', 2000);

    try {
        const canvas = await html2canvas(board, {
            backgroundColor: "#121619", // Match var(--bg-color) uit theme.css
            scale: 2.5, // Hoge resolutie (Retina quality)
            logging: false,
            ignoreElements: (el) => el.classList.contains('col-actions'), // Negeer zwevende knoppen
            onclone: (doc) => {
                // CSS aanpassingen voor de screenshot versie
                doc.body.classList.add("exporting");
                
                // Zorg dat het bord volledig zichtbaar is
                const v = doc.getElementById('viewport');
                if (v) {
                    v.style.overflow = 'visible';
                    v.style.width = 'fit-content';
                    v.style.height = 'auto';
                    v.style.padding = '40px';
                }
            }
        });

        if (copyToClipboard) {
            canvas.toBlob(blob => {
                try {
                    const item = new ClipboardItem({ "image/png": blob });
                    navigator.clipboard.write([item]);
                    Toast.show("Afbeelding gekopieerd naar klembord!", 'success');
                } catch (err) {
                    // Fallback voor browsers die dit blokkeren
                    downloadCanvas(canvas);
                    Toast.show("Klembord mislukt, afbeelding gedownload", 'info');
                }
            });
        } else {
            downloadCanvas(canvas);
        }

    } catch (err) {
        console.error("Export failed:", err);
        Toast.show("Screenshot mislukt", 'error');
    }
}

// --- Private Utilities ---

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadCanvas(canvas) {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = getFileName('png');
    a.click();
}