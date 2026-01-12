import { state } from './state.js';

/**
 * io.js
 * Verantwoordelijk voor Import, Export (JSON, CSV) en Screenshots.
 */

// --- Helpers ---

/**
 * Sanitized tekst voor CSV formaat (RFC 4180).
 * Escapet dubbele quotes en wikkelt tekst in quotes.
 */
const toCsvField = (text) => {
    if (text === null || text === undefined) return '""';
    const stringText = String(text);
    // Vervang " door "" en wikkel in "
    return `"${stringText.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
};

/**
 * Genereert een bestandsnaam op basis van de projecttitel en datum.
 */
const getFileName = (extension) => {
    const title = state.data.projectTitle || "sipoc_project";
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const date = new Date().toISOString().split('T')[0];
    return `${safeTitle}_${date}.${extension}`;
};

// --- Export Functies ---

/**
 * Slaat het project op als JSON.
 * Gebruikt File System Access API indien beschikbaar, anders klassieke download.
 */
export async function saveToFile() {
    const dataStr = JSON.stringify(state.data, null, 2);
    const fileName = getFileName('json');

    try {
        // 1. Moderne browser methode (Chrome, Edge, Opera)
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
            return;
        }
    } catch (err) {
        if (err.name === 'AbortError') return; // Gebruiker annuleerde
        console.warn("File System Access API failed, falling back to blob.", err);
    }

    // 2. Fallback methode (Firefox, Safari, etc.)
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); 
    a.href = url; 
    a.download = fileName; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Exporteert alle data naar een CSV bestand geschikt voor Excel.
 */
export function exportToCSV() {
    const headers = [
        "Sheet", "Kolom ID", "Input ID", "Output ID", 
        "Rij Label", "Inhoud Sticky", "Type", "Status", 
        "Waarde", "Systeem Score", "QA Data", "Root Causes", "Maatregelen"
    ];

    let csvContent = headers.join(";") + "\n";
    
    // Globale tellers (optioneel: resetten per sheet of doorlopend, hier doorlopend gekozen)
    let globalIn = 0;
    let globalOut = 0;

    state.data.sheets.forEach(sheet => {
        sheet.columns.forEach((col, colIdx) => {
            // ID Logica
            let inId = "", outId = "";
            const hasInput = !!col.slots[2].text?.trim();
            const hasOutput = !!col.slots[4].text?.trim();

            if (hasInput) { globalIn++; inId = `IN${globalIn}`; }
            if (hasOutput) { globalOut++; outId = `OUT${globalOut}`; }

            col.slots.forEach((slot, slotIdx) => {
                const rowLabels = ["Leverancier", "Systeem", "Input", "Proces", "Output", "Klant"];
                
                // Data formatting
                const sysScore = (slotIdx === 1 && slot.systemData) ? slot.systemData.calculatedScore : "";
                
                // Flatten QA object
                const qaStr = (slot.qa && (slotIdx === 2 || slotIdx === 4)) 
                    ? Object.entries(slot.qa).map(([k, v]) => `${k}: ${v.result}`).join(" | ")
                    : "";

                const row = [
                    sheet.name,
                    colIdx + 1,
                    (slotIdx === 2) ? inId : "",
                    (slotIdx === 4) ? outId : "",
                    rowLabels[slotIdx],
                    slot.text,
                    slot.type,
                    slot.processStatus,
                    slot.processValue,
                    sysScore,
                    qaStr,
                    (slot.causes || []).join(" | "),
                    (slot.improvements || []).join(" | ")
                ];

                // Map en escape alle velden
                csvContent += row.map(toCsvField).join(";") + "\n";
            });
        });
    });

    // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getFileName('csv');
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Maakt een screenshot van het bord.
 * Gebruikt 'onclone' om UI elementen te verbergen zonder flikkering.
 */
export async function exportHD() {
    // Check global dependency
    if (typeof html2canvas === 'undefined') {
        alert("Fout: html2canvas library is niet geladen.");
        return;
    }

    const boardElement = document.getElementById("board");
    if (!boardElement) return;

    try {
        const canvas = await html2canvas(boardElement, {
            backgroundColor: "#263238", // Match CSS background
            scale: 2, // High DPI
            logging: false,
            // Dit is de magie: manipuleer de gekloonde DOM, niet de echte
            onclone: (clonedDoc) => {
                const clonedBody = clonedDoc.body;
                clonedBody.classList.add("exporting"); // Activeer CSS die knoppen verbergt
                
                // Forceer volledige breedte indien nodig
                const viewport = clonedDoc.querySelector('.viewport');
                if (viewport) {
                    viewport.style.overflow = 'visible';
                    viewport.style.width = 'auto';
                    viewport.style.height = 'auto';
                }
            }
        });

        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = getFileName('png');
        a.click();
    } catch (err) {
        console.error("Screenshot failed:", err);
        alert("Kon geen screenshot maken. Zie console voor details.");
    }
}

/**
 * Laadt projectdata in vanuit een JSON bestand.
 * @param {File} file 
 * @param {Function} onSuccessCallback - Wordt aangeroepen na succesvolle load
 */
export function loadFromFile(file, onSuccessCallback) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const rawData = ev.target.result;
            const parsedData = JSON.parse(rawData);

            // Basic Schema Validatie
            if (!parsedData || !Array.isArray(parsedData.sheets)) {
                throw new Error("Ongeldig bestandsformaat: Geen sheets gevonden.");
            }

            // Directe manipulatie van state instance (via property access)
            state.project = parsedData;
            
            // Persist & Notify
            state.saveToStorage();
            
            if (onSuccessCallback) onSuccessCallback();
            
        } catch (err) {
            console.error("Load Error:", err);
            alert("Fout bij laden bestand:\n" + err.message);
        }
    };
    reader.readAsText(file);
}