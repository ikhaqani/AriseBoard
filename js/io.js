import { state } from './state.js';
import { Toast } from './toast.js';

const safeToast = (msg, type = 'info', ms) => {
    if (!Toast || typeof Toast.show !== 'function') return;
    Toast.show(msg, type, ms);
};

const toCsvField = (text) => {
    if (text === null || text === undefined) return '""';
    const str = String(text);
    return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
};

const getFileName = (ext) => {
    const title = state.data.projectTitle || "sipoc_project";
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");

    return `${safeTitle}_${dateStr}_${timeStr}.${ext}`;
};

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const downloadCanvas = (canvas) => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = getFileName("png");
    a.click();
};

export async function saveToFile() {
    const dataStr = JSON.stringify(state.data, null, 2);
    const fileName = getFileName("json");

    try {
        if ("showSaveFilePicker" in window) {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [
                    {
                        description: "SIPOC Project File",
                        accept: { "application/json": [".json"] }
                    }
                ]
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            return;
        }
    } catch (err) {
        if (err?.name === "AbortError") return;
        console.warn("FS API failed, falling back to legacy download.", err);
    }

    downloadBlob(new Blob([dataStr], { type: "application/json" }), fileName);
}

export function loadFromFile(file, onSuccess) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);

            if (!parsed || !Array.isArray(parsed.sheets)) {
                throw new Error("Ongeldig formaat: Geen sheets gevonden.");
            }

            state.project = parsed;

            if (typeof onSuccess === "function") onSuccess();
        } catch (err) {
            console.error("Load Error:", err);
            safeToast(`Fout bij laden: ${err.message}`, "error");
        }
    };
    reader.readAsText(file);
}

export function exportToCSV() {
    try {
        const headers = [
            "Sheet",
            "Kolom",
            "ID",
            "Stap",
            "Inhoud",
            "Type",
            "Waarde",
            "Status",
            "Score",
            "QA / Specs",
            "Root Causes",
            "Maatregelen"
        ];

        const csvLines = [headers.join(";")];

        let globalIn = 0;
        let globalOut = 0;

        state.data.sheets.forEach((sheet) => {
            sheet.columns.forEach((col, colIdx) => {
                let rowId = "";
                if (col.slots[2].text?.trim()) {
                    globalIn++;
                    rowId = `IN${globalIn}`;
                }
                if (col.slots[4].text?.trim()) {
                    globalOut++;
                    rowId = `OUT${globalOut}`;
                }

                col.slots.forEach((slot, slotIdx) => {
                    const rowLabels = ["Lev", "Sys", "Input", "Proces", "Output", "Klant"];

                    let score = "";
                    if (slotIdx === 1 && slot.systemData) {
                        score = `${slot.systemData.calculatedScore || 0}%`;
                    }

                    let details = "";
                    if (slot.qa) {
                        details = Object.entries(slot.qa)
                            .filter(([_, v]) => v?.result)
                            .map(([k, v]) => `${k}:${v.result}`)
                            .join(" | ");
                    }

                    const rowData = [
                        sheet.name,
                        colIdx + 1,
                        slotIdx === 2 || slotIdx === 4 ? rowId : "",
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

        const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
        downloadBlob(blob, getFileName("csv"));
    } catch (e) {
        console.error(e);
        safeToast("Fout bij genereren CSV", "error");
    }
}

export async function exportHD(copyToClipboard = false) {
    if (typeof html2canvas === "undefined") {
        safeToast("Export module niet geladen", "error");
        return;
    }

    const board = document.getElementById("board");
    if (!board) return;

    safeToast("Afbeelding genereren...", "info", 2000);

    try {
        const canvas = await html2canvas(board, {
            backgroundColor: "#121619",
            scale: 2.5,
            logging: false,
            ignoreElements: (el) => el.classList.contains("col-actions"),
            onclone: (doc) => {
                doc.body.classList.add("exporting");

                const v = doc.getElementById("viewport");
                if (v) {
                    v.style.overflow = "visible";
                    v.style.width = "fit-content";
                    v.style.height = "auto";
                    v.style.padding = "40px";
                }
            }
        });

        if (copyToClipboard) {
            canvas.toBlob((blob) => {
                try {
                    const item = new ClipboardItem({ "image/png": blob });
                    navigator.clipboard.write([item]);
                    safeToast("Afbeelding gekopieerd naar klembord!", "success");
                } catch (err) {
                    downloadCanvas(canvas);
                    safeToast("Klembord mislukt, afbeelding gedownload", "info");
                }
            });
            return;
        }

        downloadCanvas(canvas);
    } catch (err) {
        console.error("Export failed:", err);
        safeToast("Screenshot mislukt", "error");
    }
}