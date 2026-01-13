import { state } from './state.js';
import { renderBoard, setupDelegatedEvents } from './dom.js';
import { openEditModal, saveModalDetails } from './modals.js';
import { saveToFile, loadFromFile, exportToCSV, exportHD } from './io.js';
import { Toast } from './toast.js';

const $ = (id) => document.getElementById(id);

const bindClick = (id, handler) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
        e.preventDefault();
        handler(e);
    });
};

const safeToast = (msg, type = 'info', ms) => {
    if (!Toast || typeof Toast.show !== 'function') return;
    Toast.show(msg, type, ms);
};

const initToast = () => {
    try {
        if (Toast && typeof Toast.init === 'function') Toast.init();
    } catch (e) {
        console.warn("Toast init failed", e);
    }
};

const renameActiveSheet = () => {
    const currentName = state.activeSheet?.name || '';
    const newName = prompt("Hernoem proces:", currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    state.renameSheet(newName.trim());
    safeToast("Naam gewijzigd", "success");
};

const setupProjectTitle = () => {
    const titleInput = $("boardTitle");
    if (!titleInput) return;

    titleInput.addEventListener("input", (e) => {
        state.updateProjectTitle(e.target.value);
    });
};

const setupSheetControls = () => {
    const sheetSelect = $("sheetSelect");
    if (sheetSelect) {
        sheetSelect.addEventListener("change", (e) => {
            state.setActiveSheet(e.target.value);
            safeToast(`Gewisseld naar: ${state.activeSheet.name}`, "info", 1000);
        });
    }

    bindClick("btnRenameSheet", renameActiveSheet);

    document.addEventListener("dblclick", (e) => {
        if (e.target && e.target.id === "board-header-display") renameActiveSheet();
    });

    bindClick("btnAddSheet", () => {
        const name = prompt("Nieuw procesblad naam:", `Proces ${state.data.sheets.length + 1}`);
        if (!name || !name.trim()) return;
        state.addSheet(name.trim());
        safeToast("Procesblad toegevoegd", "success");
    });

    bindClick("btnDelSheet", () => {
        if (state.data.sheets.length <= 1) {
            safeToast("Laatste blad kan niet verwijderd worden", "error");
            return;
        }
        if (!confirm(`Weet je zeker dat je "${state.activeSheet.name}" wilt verwijderen?`)) return;
        state.deleteSheet();
        safeToast("Procesblad verwijderd", "info");
    });
};

const setupToolbarActions = () => {
    bindClick("saveBtn", async () => {
        await saveToFile();
        safeToast("Project opgeslagen", "success");
    });

    bindClick("exportCsvBtn", () => {
        exportToCSV();
        safeToast("Excel export gereed", "success");
    });

    bindClick("exportBtn", async () => {
        await exportHD();
        safeToast("Screenshot gemaakt", "success");
    });

    bindClick("loadBtn", () => {
        const inp = $("fileInput");
        if (inp) inp.click();
    });

    const fileInput = $("fileInput");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            loadFromFile(file, () => {
                fileInput.value = "";
                safeToast("Project geladen", "success");
            });
        });
    }

    bindClick("clearBtn", () => {
        if (!confirm("⚠️ Pas op: Alles wissen?")) return;
        localStorage.clear();
        location.reload();
    });
};

const setupZoom = () => {
    let zoomLevel = 1;

    const updateZoom = () => {
        const boardEl = $("board");
        if (!boardEl) return;

        zoomLevel = Math.max(0.4, Math.min(2.0, zoomLevel));
        boardEl.style.transform = `scale(${zoomLevel})`;

        const zoomDisplay = $("zoomDisplay");
        if (zoomDisplay) zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;

        setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    };

    bindClick("zoomIn", () => {
        zoomLevel += 0.1;
        updateZoom();
    });

    bindClick("zoomOut", () => {
        zoomLevel -= 0.1;
        updateZoom();
    });

    updateZoom();
};

const setupMenuToggle = () => {
    bindClick("menuToggle", () => {
        const topbar = $("topbar");
        if (!topbar) return;

        const viewportEl = $("viewport");
        const icon = document.querySelector("#menuToggle .toggle-icon");

        const isCollapsed = topbar.classList.toggle("collapsed");
        if (viewportEl) viewportEl.classList.toggle("expanded-view");
        if (icon) icon.style.transform = isCollapsed ? "rotate(180deg)" : "rotate(0deg)";
    });
};

const setupColumnManager = () => {
    bindClick("btnManageCols", () => {
        const list = $("colManagerList");
        const modal = $("colManagerModal");
        if (!list || !modal) return;

        list.innerHTML = "";

        state.activeSheet.columns.forEach((col, idx) => {
            const raw = col.slots?.[3]?.text || "";
            const procText = raw
                ? `${raw.substring(0, 25)}${raw.length > 25 ? "..." : ""}`
                : "<i>(Leeg)</i>";

            const item = document.createElement("div");
            item.className = "col-manager-item";
            item.innerHTML = `
                <span style="font-size:13px; color:#ddd;">
                    <strong>Kolom ${idx + 1}</strong>: ${procText}
                </span>
                <input type="checkbox" ${col.isVisible !== false ? "checked" : ""} style="cursor:pointer; transform:scale(1.2);">
            `;

            const checkbox = item.querySelector("input");
            checkbox.addEventListener("change", (e) => state.setColVisibility(idx, e.target.checked));

            list.appendChild(item);
        });

        modal.style.display = "grid";
    });

    bindClick("colManagerCloseBtn", () => {
        const modal = $("colManagerModal");
        if (modal) modal.style.display = "none";
    });
};

const setupModals = () => {
    bindClick("modalSaveBtn", () => {
        saveModalDetails();
        safeToast("Wijzigingen opgeslagen", "save");
    });

    bindClick("modalCancelBtn", () => {
        const m = $("editModal");
        if (m) m.style.display = "none";
    });
};

const setupStateSubscription = () => {
    const titleInput = $("boardTitle");

    state.subscribe(() => {
        renderBoard(openEditModal);

        if (titleInput && state.data.projectTitle && document.activeElement !== titleInput) {
            titleInput.value = state.data.projectTitle;
        }

        document.title = state.data.projectTitle ? `${state.data.projectTitle} - SIPOC` : "SIPOC Board";

        const header = $("board-header-display");
        if (header) {
            header.style.cursor = "pointer";
            header.title = "Dubbelklik om naam te wijzigen";
        }
    });
};

const setupGlobalHotkeys = () => {
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveToFile();
            safeToast("Quick Save", "save");
        }

        if (e.key === "Escape") {
            document.querySelectorAll(".modal-overlay").forEach((m) => (m.style.display = "none"));
        }
    });
};

const initApp = () => {
    console.log("🚀 SIPOC Application Started");
    initToast();
    setupDelegatedEvents();
    setupProjectTitle();
    setupSheetControls();
    setupToolbarActions();
    setupZoom();
    setupMenuToggle();
    setupColumnManager();
    setupModals();
    setupStateSubscription();
    setupGlobalHotkeys();

    renderBoard(openEditModal);

    const titleInput = $("boardTitle");
    if (titleInput) titleInput.value = state.data.projectTitle;

    setTimeout(() => safeToast("Klaar voor gebruik", "info"), 500);
};

document.addEventListener("DOMContentLoaded", initApp);