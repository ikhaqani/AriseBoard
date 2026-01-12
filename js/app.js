import { state } from './state.js';
import { renderBoard, setupDelegatedEvents } from './dom.js';
import { openEditModal, saveModalDetails } from './modals.js'; // <-- HIER ZAT DE FOUT (was modal.js)
import { saveToFile, loadFromFile, exportToCSV, exportHD } from './io.js';

/**
 * app.js
 * Entry point van de applicatie.
 * Verbindt UI events met de logica modules.
 */

const initApp = () => {
    console.log("🚀 SIPOC Application Started");

    // --- 1. Toolbar: Bestand Operaties ---

    document.getElementById("saveBtn").onclick = saveToFile;
    document.getElementById("exportCsvBtn").onclick = exportToCSV;
    document.getElementById("exportBtn").onclick = exportHD;

    // Load setup
    const fileInput = document.getElementById('fileInput');
    document.getElementById("loadBtn").onclick = () => fileInput.click();
    
    fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            loadFromFile(e.target.files[0], () => {
                fileInput.value = ''; 
            });
        }
    };

    // Reset setup
    document.getElementById("clearBtn").onclick = () => {
        if (confirm("Weet je zeker dat je het hele project wilt wissen? Niet opgeslagen werk gaat verloren.")) {
            localStorage.clear();
            location.reload();
        }
    };

    // --- 2. Toolbar: Project Titel ---
    
    const titleInput = document.getElementById("boardTitle");
    if(titleInput) {
        titleInput.addEventListener("input", (e) => {
            state.data.projectTitle = e.target.value;
            state.saveToStorage(); 
        });
    }

    // --- 3. Toolbar: Sheet Management ---

    const sheetSelect = document.getElementById("sheetSelect");

    // Wisselen van Sheet
    if(sheetSelect) {
        sheetSelect.onchange = (e) => {
            state.setActiveSheet(e.target.value);
        };
    }

    // Toevoegen Sheet
    document.getElementById("btnAddSheet").onclick = () => {
        const name = prompt("Naam van het nieuwe proces:", `Proces ${state.data.sheets.length + 1}`);
        if (name && name.trim()) {
            state.addSheet(name.trim());
        }
    };

    // Hernoemen Sheet
    document.getElementById("btnRenameSheet").onclick = () => {
        const currentName = state.activeSheet.name;
        const newName = prompt("Hernoem proces:", currentName);
        if (newName && newName.trim()) {
            state.renameSheet(newName.trim());
        }
    };

    // Verwijderen Sheet
    document.getElementById("btnDelSheet").onclick = () => {
        if (state.data.sheets.length <= 1) {
            alert("Je kunt het laatste blad niet verwijderen.");
            return;
        }
        if (confirm(`Weet je zeker dat je "${state.activeSheet.name}" wilt verwijderen?`)) {
            state.deleteSheet();
        }
    };

    // --- 4. Viewport: Zoom Controls ---

    let zoomLevel = 1;
    const boardEl = document.getElementById("board");
    const zoomDisplay = document.getElementById("zoomDisplay");

    const updateZoom = () => {
        zoomLevel = Math.max(0.5, Math.min(2.0, zoomLevel));
        boardEl.style.transform = `scale(${zoomLevel})`;
        if(zoomDisplay) zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    };

    document.getElementById("zoomIn").onclick = () => { zoomLevel += 0.1; updateZoom(); };
    document.getElementById("zoomOut").onclick = () => { zoomLevel -= 0.1; updateZoom(); };

    // --- 5. UI: Menu Toggle (Responsive) ---

    const menuToggle = document.getElementById("menuToggle");
    if(menuToggle) {
        menuToggle.onclick = () => {
            const topbar = document.getElementById("topbar");
            const viewport = document.getElementById("viewport");
            const toggleText = document.getElementById("toggleText");
            const icon = document.querySelector("#menuToggle .toggle-icon");

            const isCollapsed = topbar.classList.toggle("collapsed");
            viewport.classList.toggle("expanded-view");

            if(toggleText) toggleText.textContent = isCollapsed ? "Menu Uitklappen" : "Menu Inklappen";
            if(icon) icon.style.transform = isCollapsed ? "rotate(180deg)" : "rotate(0deg)";
        };
    }

    // --- 6. UI: Column Manager Modal ---

    const colModal = document.getElementById("colManagerModal");

    document.getElementById("btnManageCols").onclick = () => {
        const list = document.getElementById("colManagerList");
        list.innerHTML = "";

        state.activeSheet.columns.forEach((col, idx) => {
            const procText = col.slots[3].text ? col.slots[3].text.substring(0, 30) : `<i>(Leeg)</i>`;
            const labelText = `Kolom ${idx + 1}: ${procText}`;

            const item = document.createElement("div");
            item.className = "col-manager-item";
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);";
            
            item.innerHTML = `
                <span style="font-size:13px;">${labelText}</span>
                <input type="checkbox" ${col.isVisible !== false ? 'checked' : ''}>
            `;

            item.querySelector("input").onchange = (e) => {
                state.setColVisibility(idx, e.target.checked);
            };

            list.appendChild(item);
        });

        colModal.style.display = "grid";
    };

    document.getElementById("colManagerCloseBtn").onclick = () => {
        colModal.style.display = "none";
    };

    // --- 7. UI: Sticky Details Modal ---

    document.getElementById("modalSaveBtn").onclick = saveModalDetails;
    document.getElementById("modalCancelBtn").onclick = () => {
        document.getElementById("editModal").style.display = "none";
    };

    // --- 8. Initialization & State Binding ---

    // Koppelen van klik acties op het bord (delegeert naar dom.js)
    setupDelegatedEvents();

    // Reageren op wijzigingen in data
    state.subscribe(() => {
        renderBoard(openEditModal);
        
        if (titleInput && state.data.projectTitle) {
            if(titleInput.value !== state.data.projectTitle) {
                titleInput.value = state.data.projectTitle;
            }
            document.title = `${state.data.projectTitle} - SIPOC`;
        }
    });

    // Start
    renderBoard(openEditModal);
    if(titleInput) titleInput.value = state.data.projectTitle;
};

document.addEventListener('DOMContentLoaded', initApp);

window.addEventListener('error', (e) => {
    console.error("Global Error:", e.error);
});