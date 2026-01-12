import { state } from './state.js';
import { renderBoard } from './dom.js';
import * as io from './io.js';
import * as modals from './modals.js';

// --- Global App Interface (Bridge for HTML onClick) ---
window.app = {
    // Column Actions
    moveCol: (idx, dir) => { state.moveColumn(idx, dir); render(); },
    addCol: (idx) => { state.addColumn(idx); render(); },
    delCol: (idx) => { if(state.deleteColumn(idx)) render(); },
    hideCol: (idx) => { state.toggleColVisibility(idx, false); render(); },
    toggleParallel: (idx) => { state.toggleParallel(idx); render(); },
    
    // Transitions
    updateTransition: (idx, val) => { 
        const s = state.getActiveSheet(); s.columns[idx].transitionNext = val; state.saveToStorage(); 
    },
    toggleTransition: (idx) => { 
        const s = state.getActiveSheet(); s.columns[idx].hasTransition = !s.columns[idx].hasTransition; state.saveToStorage(); render(); 
    },

    // Sticky
    updateText: (c, s, txt) => { state.updateStickyText(c, s, txt); },

    // Modal
    setColVis: (idx, val) => { state.toggleColVisibility(idx, val); render(); } // Re-render to show updates immediately in background if visible
};

// --- Helper Render Wrapper ---
function render() {
    renderBoard(modals.openEditModal);
}

// --- Event Listeners (UI Controls) ---
document.addEventListener('DOMContentLoaded', () => {
    // Sheets
    document.getElementById('sheetSelect').onchange = (e) => { state.setActiveSheet(e.target.value); render(); };
    document.getElementById('btnAddSheet').onclick = () => { 
        const name = prompt("Naam:", `Proces ${state.project.sheets.length+1}`); 
        if(name) { state.addSheet(name); render(); } 
    };
    document.getElementById('btnRenameSheet').onclick = () => { 
        const name = prompt("Nieuwe naam:", state.getActiveSheet().name); 
        if(name) { state.renameSheet(name); render(); } 
    };
    document.getElementById('btnDelSheet').onclick = () => { if(state.deleteSheet()) render(); };

    // Toolbar
    document.getElementById('saveBtn').onclick = io.saveToFile;
    document.getElementById('loadBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = (e) => io.loadFromFile(e.target.files[0], render);
    document.getElementById('exportBtn').onclick = io.exportHD;
    document.getElementById('exportCsvBtn').onclick = io.exportToCSV;
    document.getElementById('clearBtn').onclick = () => { 
        if(confirm("Alles resetten?")) { localStorage.clear(); location.reload(); } 
    };

    // Managers
    document.getElementById('btnManageCols').onclick = modals.openColumnManager;
    document.getElementById('colManagerCloseBtn').onclick = () => { 
        document.getElementById('colManagerModal').style.display='none'; 
        render(); // Ensure render reflects changes
    };

    // Modal Save/Cancel
    document.getElementById('modalSaveBtn').onclick = modals.saveModalDetails;
    document.getElementById('modalCancelBtn').onclick = () => document.getElementById('editModal').style.display='none';

    // Zoom & Menu
    let zoom = 1;
    document.getElementById('zoomIn').onclick = () => { zoom = Math.min(1.5, zoom+0.1); applyZoom(); };
    document.getElementById('zoomOut').onclick = () => { zoom = Math.max(0.5, zoom-0.1); applyZoom(); };
    function applyZoom() { 
        document.getElementById('board').style.transform = `scale(${zoom})`; 
        document.getElementById('zoomDisplay').innerText = Math.round(zoom*100)+'%'; 
    }

    document.getElementById('menuToggle').onclick = () => {
        const top = document.getElementById('topbar');
        const view = document.getElementById('viewport');
        const isCol = top.classList.toggle('collapsed');
        view.classList.toggle('expanded-view');
        document.getElementById('toggleText').innerText = isCol ? "Menu Uitklappen" : "Menu Inklappen";
    };

    // Initial Render
    render();
});