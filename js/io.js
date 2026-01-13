import { state } from './state.js';
import { Toast } from './toast.js';
import { IO_CRITERIA } from './config.js';

const toCsvField = (text) => {
    if (text === null || text === undefined) return '""';
    const str = String(text);
    return `"${str.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

const getFileName = (ext) => {
    const title = state.data.projectTitle || 'sipoc_project';
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `${safeTitle}_${dateStr}_${timeStr}.${ext}`;
};

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const downloadCanvas = (canvas) => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = getFileName('png');
    a.click();
};

const calculateLSSScore = (qa) => {
    if (!qa) return null;
    let totalW = 0;
    let earnedW = 0;

    IO_CRITERIA.forEach((c) => {
        const val = qa[c.key]?.result;
        if (val === 'OK' || val === 'NOT_OK') {
            totalW += c.weight;
            if (val === 'OK') earnedW += c.weight;
        }
    });

    return totalW === 0 ? null : Math.round((earnedW / totalW) * 100);
};

const SIPOC_LABELS = ['Leverancier', 'Systeem', 'Input', 'Proces', 'Output', 'Klant'];

const TYPE_EMOJI = {
    Taak: '📝',
    Afspraak: '📅',
    Besluit: '💎',
    Wacht: '⏳'
};

const yesNo = (v) => (v ? 'Ja' : 'Nee');

const formatInputSpecs = (defs) => {
    if (!Array.isArray(defs) || defs.length === 0) return '';
    return defs
        .filter((d) => d && (d.item || d.specifications || d.type))
        .map((d) => {
            const item = (d.item || '').trim();
            const specs = (d.specifications || '').trim();
            const type = (d.type || '').trim();
            const main = [item, specs].filter(Boolean).join(': ');
            return type ? `${main} (${type})` : main;
        })
        .filter(Boolean)
        .join(' | ');
};

const formatDisruptions = (disruptions) => {
    if (!Array.isArray(disruptions) || disruptions.length === 0) return '';
    return disruptions
        .filter((d) => d && (d.scenario || d.frequency || d.workaround))
        .map((d) => {
            const scenario = (d.scenario || '').trim();
            const freq = (d.frequency || '').trim();
            const workaround = (d.workaround || '').trim();
            const left = [scenario, freq].filter(Boolean).join(' - ');
            return workaround ? `${left}: ${workaround}` : left;
        })
        .filter(Boolean)
        .join(' | ');
};

export async function saveToFile() {
    const dataStr = JSON.stringify(state.data, null, 2);
    const fileName = getFileName('json');

    try {
        if ('showSaveFilePicker' in window) {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [
                    {
                        description: 'SIPOC Project File',
                        accept: { 'application/json': ['.json'] }
                    }
                ]
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            return;
        }
    } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('FS API failed, falling back to legacy download.', err);
    }

    downloadBlob(new Blob([dataStr], { type: 'application/json' }), fileName);
}

export function loadFromFile(file, onSuccess) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            if (!parsed || !Array.isArray(parsed.sheets)) {
                throw new Error('Ongeldig formaat: Geen sheets gevonden.');
            }

            state.project = parsed;
            if (typeof state.notify === 'function') state.notify();

            if (onSuccess) onSuccess();
        } catch (err) {
            console.error('Load Error:', err);
            Toast.show(`Fout bij laden: ${err.message}`, 'error');
        }
    };
    reader.readAsText(file);
}

export function exportToCSV() {
    try {
        const headers = [
            'Kolom Nr',
            'SIPOC Categorie',
            'Input ID',
            'Output ID',
            'Inhoud (Sticky)',
            'Emoji',
            'Type',
            'Proces Status',
            'LSS Waarde',
            'QA Score (%)',
            'Systeem Score (%)',
            'Succesfactoren',
            'Oorzaken (RC)',
            'Maatregelen (CM)',
            'Verstoringen',
            'Input Specificaties',
            'Parallel'
        ];

        const lines = [headers.map(toCsvField).join(';')];

        let globalIn = 0;
        let globalOut = 0;

        state.data.sheets.forEach((sheet) => {
            let visibleColNr = 0;

            sheet.columns.forEach((col) => {
                if (col.isVisible === false) return;
                visibleColNr += 1;

                const slotInput = col.slots?.[2];
                const slotOutput = col.slots?.[4];

                let inputId = '';
                let outputId = '';

                const hasInputText = !!slotInput?.text?.trim();
                const hasOutputText = !!slotOutput?.text?.trim();

                if (hasOutputText) {
                    globalOut += 1;
                    outputId = `OUT${globalOut}`;
                }

                if (hasInputText) {
                    if (slotInput?.linkedSourceId) {
                        inputId = slotInput.linkedSourceId;
                    } else {
                        globalIn += 1;
                        inputId = `IN${globalIn}`;
                    }
                }

                col.slots.forEach((slot, slotIdx) => {
                    const category = SIPOC_LABELS[slotIdx] || '';
                    const inhoud = slot?.text ?? '';

                    const isProcess = slotIdx === 3;
                    const isSystem = slotIdx === 1;
                    const isIoRow = slotIdx === 2 || slotIdx === 4;

                    const emoji = isProcess && slot?.type ? (TYPE_EMOJI[slot.type] || '') : '';
                    const type = isProcess ? (slot?.type || '') : '';
                    const procStatus = isProcess ? (slot?.processStatus || '') : '';
                    const lssWaarde = isProcess ? (slot?.processValue || '') : '';

                    const qaScore = isIoRow ? calculateLSSScore(slot?.qa) : null;
                    const sysScore = isSystem ? (slot?.systemData?.calculatedScore ?? null) : null;

                    const succesfactoren = isProcess ? (slot?.successFactors || '') : '';
                    const oorzaken = isProcess && Array.isArray(slot?.causes) ? slot.causes.join(' | ') : '';
                    const maatregelen = isProcess && Array.isArray(slot?.improvements) ? slot.improvements.join(' | ') : '';
                    const verstoringen = isProcess ? formatDisruptions(slot?.disruptions) : '';

                    const inputSpecs = isIoRow ? formatInputSpecs(slot?.inputDefinitions) : '';

                    const row = [
                        visibleColNr,
                        category,
                        slotIdx === 2 ? inputId : '',
                        slotIdx === 4 ? outputId : '',
                        inhoud,
                        emoji,
                        type,
                        procStatus,
                        lssWaarde,
                        qaScore === null ? '' : String(qaScore),
                        sysScore === null ? '' : String(sysScore),
                        succesfactoren,
                        oorzaken,
                        maatregelen,
                        verstoringen,
                        inputSpecs,
                        yesNo(!!col.isParallel)
                    ];

                    lines.push(row.map(toCsvField).join(';'));
                });
            });
        });

        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, getFileName('csv'));
    } catch (e) {
        console.error(e);
        Toast.show('Fout bij genereren CSV', 'error');
    }
}

export async function exportHD(copyToClipboard = false) {
    if (typeof html2canvas === 'undefined') {
        Toast.show('Export module niet geladen', 'error');
        return;
    }

    const board = document.getElementById('board');
    if (!board) return;

    Toast.show('Afbeelding genereren...', 'info', 2000);

    try {
        const canvas = await html2canvas(board, {
            backgroundColor: '#121619',
            scale: 2.5,
            logging: false,
            ignoreElements: (el) => el.classList.contains('col-actions'),
            onclone: (doc) => {
                doc.body.classList.add('exporting');
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
            canvas.toBlob((blob) => {
                try {
                    const item = new ClipboardItem({ 'image/png': blob });
                    navigator.clipboard.write([item]);
                    Toast.show('Afbeelding gekopieerd naar klembord!', 'success');
                } catch (err) {
                    downloadCanvas(canvas);
                    Toast.show('Klembord mislukt, afbeelding gedownload', 'info');
                }
            });
        } else {
            downloadCanvas(canvas);
        }
    } catch (err) {
        console.error('Export failed:', err);
        Toast.show('Screenshot mislukt', 'error');
    }
}