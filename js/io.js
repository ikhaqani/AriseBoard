import { state } from './state.js';

export async function saveToFile() {
    const dataStr = JSON.stringify(state.project, null, 2);
    const title = state.project.projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({ 
                suggestedName: `${title}.json`, 
                types: [{ description: 'Project File', accept: {'application/json': ['.json']} }] 
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr); await writable.close();
            return;
        } catch(e) {}
    }
    const blob = new Blob([dataStr], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.json`; a.click();
}

export function exportToCSV() {
    let csv = "Blad;Kolom ID;Global IN;Global OUT;Rij;Tekst;Status;Waarde\n";
    let globalIn = 0, globalOut = 0;

    state.project.sheets.forEach(sheet => {
        sheet.columns.forEach((c, ci) => {
            let inId = "", outId = "";
            if(c.slots[2].text?.trim()) { globalIn++; inId = `IN${globalIn}`; }
            if(c.slots[4].text?.trim()) { globalOut++; outId = `OUT${globalOut}`; }

            c.slots.forEach((s, si) => {
                csv += `"${sheet.name}";${ci+1};${si===2?inId:""};${si===4?outId:""};${si+1};"${(s.text||"").replace(/"/g, '""')}";${s.processStatus || ""};${s.processValue || ""}\n`;
            });
        });
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "project_export.csv"; a.click();
}

export async function exportHD() {
    document.body.classList.add("exporting");
    const canvas = await html2canvas(document.getElementById("board"), { backgroundColor: "#263238", scale: 2 });
    const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "view.png"; a.click();
    document.body.classList.remove("exporting");
}

export function loadFromFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if(data.sheets) state.project = data; // Valid new format
            state.saveToStorage();
            callback();
        } catch (err) { alert("Fout bij laden: " + err); }
    };
    reader.readAsText(file);
}