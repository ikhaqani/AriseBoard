import { state } from './state.js';
import { renderBoard, setupDelegatedEvents } from './dom.js';
import { openEditModal, saveModalDetails } from './modals.js';
import { saveToFile, loadFromFile, exportToCSV, exportHD } from './io.js';
import { Toast } from './toast.js';

const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (el) {
        el.onclick = (e) => {
            e.preventDefault();
            handler(e);
        };
    }
};

const initApp = () => {
    console.log("🚀 SIPOC Application Started");
    
    try { if (Toast && Toast.init) Toast.init(); } catch (e) { console.warn("Toast failed", e); }
    setupDelegatedEvents();

    // --- 1. Project Title (NO AUTOSAVE) ---
    const titleInput = document.getElementById("boardTitle");
    if (titleInput) {
        // Alleen geheugen updaten tijdens typen
        titleInput.addEventListener("input", (e) => {
            state.updateProjectTitle(e.target.value);
        });

        // Pas opslaan bij wegklikken
        titleInput.addEventListener("blur", () => {
            state.saveToStorage();
        });
    }

    // --- 2. Rename Logic ---
    const performRename = () => {
        const currentName = state.activeSheet.name;
        const newName = prompt("Hernoem proces:", currentName);
        if (newName && newName.trim() && newName !== currentName) {
            state.renameSheet(newName.trim());
            if(Toast) Toast.show("Naam gewijzigd", 'success');
        }
    };

    document.addEventListener('dblclick', (e) => {
        if (e.target && e.target.id === 'board-header-display') performRename();
    });
    bindClick("btnRenameSheet", performRename);

    // --- 3. Sheet Controls ---
    const sheetSelect = document.getElementById("sheetSelect");
    if(sheetSelect) sheetSelect.onchange = (e) => {
        state.setActiveSheet(e.target.value);
        if(Toast) Toast.show(`Gewisseld naar: ${state.activeSheet.name}`, 'info', 1000);
    };

    bindClick("btnAddSheet", () => {
        const name = prompt("Nieuw procesblad naam:", `Proces ${state.data.sheets.length + 1}`);
        if (name && name.trim()) {
            state.addSheet(name.trim());
            if(Toast) Toast.show("Procesblad toegevoegd", 'success');
        }
    });

    bindClick("btnDelSheet", () => {
        if (state.data.sheets.length <= 1) {
            if(Toast) Toast.show("Laatste blad kan niet verwijderd worden", 'error');
            return;
        }
        if (confirm(`Weet je zeker dat je "${state.activeSheet.name}" wilt verwijderen?`)) {
            state.deleteSheet();
            if(Toast) Toast.show("Procesblad verwijderd", 'info');
        }
    });

    // --- 4. Toolbar Actions ---
    bindClick("saveBtn", async () => { await saveToFile(); if(Toast) Toast.show("Project opgeslagen", 'success'); });
    bindClick("exportCsvBtn", () => { exportToCSV(); if(Toast) Toast.show("Excel export gereed", 'success'); });
    bindClick("exportBtn", async () => { await exportHD(); if(Toast) Toast.show("Screenshot gemaakt", 'success'); });
    
    bindClick("loadBtn", () => document.getElementById('loadBtn') && document.getElementById('fileInput').click());
    const fileInput = document.getElementById('fileInput');
    if(fileInput) fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            loadFromFile(e.target.files[0], () => {
                fileInput.value = ''; 
                if(Toast) Toast.show("Project geladen", 'success');
            });
        }
    };

    bindClick("clearBtn", () => {
        if (confirm("⚠️ Pas op: Alles wissen?")) { localStorage.clear(); location.reload(); }
    });

    // --- 5. Zoom ---
    let zoomLevel = 1;
    const updateZoom = () => {
        const boardEl = document.getElementById("board");
        const zoomDisplay = document.getElementById("zoomDisplay");
        if(!boardEl) return;
        zoomLevel = Math.max(0.4, Math.min(2.0, zoomLevel));
        boardEl.style.transform = `scale(${zoomLevel})`;
        if(zoomDisplay) zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    };
    bindClick("zoomIn", () => { zoomLevel += 0.1; updateZoom(); });
    bindClick("zoomOut", () => { zoomLevel -= 0.1; updateZoom(); });

    // --- 6. Menu Toggle ---
    bindClick("menuToggle", () => {
        const topbar = document.getElementById("topbar");
        const viewportEl = document.getElementById("viewport");
        const icon = document.querySelector("#menuToggle .toggle-icon");
        if(topbar) {
            const isCollapsed = topbar.classList.toggle("collapsed");
            if(viewportEl) viewportEl.classList.toggle("expanded-view");
            if(icon) icon.style.transform = isCollapsed ? "rotate(180deg)" : "rotate(0deg)";
        }
    });

    // --- 7. Column Manager ---
    bindClick("btnManageCols", () => {
        const list = document.getElementById("colManagerList");
        const modal = document.getElementById("colManagerModal");
        if(!list || !modal) return;
        list.innerHTML = "";
        state.activeSheet.columns.forEach((col, idx) => {
            const procText = col.slots[3].text ? col.slots[3].text.substring(0, 25) + (col.slots[3].text.length>25?'...':'') : `<i>(Leeg)</i>`;
            const item = document.createElement("div");
            item.className = "col-manager-item";
            item.innerHTML = `<span style="font-size:13px; color:#ddd;"><strong>Kolom ${idx + 1}</strong>: ${procText}</span><input type="checkbox" ${col.isVisible !== false ? 'checked' : ''} style="cursor:pointer; transform:scale(1.2);">`;
            item.querySelector("input").onchange = (e) => state.setColVisibility(idx, e.target.checked);
            list.appendChild(item);
        });
        modal.style.display = "grid";
    });
    bindClick("colManagerCloseBtn", () => {
        document.getElementById("colManagerModal").style.display = "none";
    });

    // --- 8. Modals ---
    bindClick("modalSaveBtn", () => { saveModalDetails(); if(Toast) Toast.show("Wijzigingen opgeslagen", 'save'); });
    bindClick("modalCancelBtn", () => { document.getElementById("editModal").style.display = "none"; });

    // --- 9. State Sub ---
    state.subscribe(() => {
        renderBoard(openEditModal);
        
        if (titleInput && state.data.projectTitle && document.activeElement !== titleInput) {
            titleInput.value = state.data.projectTitle;
        }
        
        document.title = state.data.projectTitle ? `${state.data.projectTitle} - SIPOC` : 'SIPOC Board';
        
        const header = document.getElementById("board-header-display");
        if(header) {
            header.style.cursor = "pointer";
            header.title = "Dubbelklik om naam te wijzigen";
        }
    });

    renderBoard(openEditModal);
    if(titleInput) titleInput.value = state.data.projectTitle;

    // Save Indicator
    const saveStatusEl = document.getElementById('saveStatus');
    if(state && state.onSave) {
        state.onSave((status, msg) => {
            if (!saveStatusEl) return;
            if (status === 'saving') {
                saveStatusEl.innerHTML = `<div class="spinner"></div> Opslaan...`;
                saveStatusEl.className = 'save-status saving';
            } else if (status === 'saved') {
                saveStatusEl.innerHTML = `✅ Opgeslagen`;
                saveStatusEl.className = 'save-status saved';
                setTimeout(() => saveStatusEl.classList.remove('saved'), 2000);
            } else if (status === 'error') {
                if(Toast) Toast.show(msg || "Fout bij opslaan", 'error');
            }
        });
    }

    setTimeout(() => { if(Toast) Toast.show("Klaar voor gebruik", 'info'); }, 500);
};

// Global Hotkeys
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveToFile();
        if(Toast) Toast.show("Quick Save", 'save');
    }
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
});

document.addEventListener('DOMContentLoaded', initApp);