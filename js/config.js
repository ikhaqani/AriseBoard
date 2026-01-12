/**
 * config.js
 * Single Source of Truth.
 * Bevat alle statische teksten, configuraties, wegingen en factory functies.
 */

export const STORAGE_KEY = "pro_lss_sipoc_v2_final";

// --- 1. Algemene Instellingen ---

export const DEFAULTS = Object.freeze({
    PROJECT_TITLE: "Nieuw Proces Project",
    SHEET_NAME: "Proces Flow 1",
    STICKY_TYPE: "Taak",
    PROCESS_VALUE: "VA",
    PROCESS_STATUS: "NEUTRAL"
});

// --- 2. Systeem Fit Analyse Vragen (Slot 1) ---

export const SYSTEM_QUESTIONS = Object.freeze([
    { 
        id: 'workarounds', 
        label: "1. Hoe vaak dwingt het systeem je tot workarounds (Excel, mail, knip/plak)?", 
        options: ["(Bijna) nooit", "Soms", "Vaak", "(Bijna) altijd"] 
    },
    { 
        id: 'performance', 
        label: "2. Hoe vaak remt het systeem je af (traagheid, storingen, wachten)?", 
        options: ["(Bijna) nooit", "Soms", "Vaak", "(Bijna) altijd"] 
    },
    { 
        id: 'double', 
        label: "3. Hoe vaak moet je gegevens dubbel registreren (overtypen)?", 
        options: ["(Bijna) nooit", "Soms", "Vaak", "(Bijna) altijd"] 
    },
    { 
        id: 'error', 
        label: "4. Hoe vaak laat het systeem ruimte voor fouten (geen validatie)?", 
        options: ["(Bijna) nooit", "Soms", "Vaak", "(Bijna) altijd"] 
    },
    { 
        id: 'depend', 
        label: "5. Hoe afhankelijk is het proces van dit systeem (risico bij uitval)?", 
        options: ["Veilig (Fallback)", "Vertraging", "Groot Risico", "Volledige Stilstand"] 
    }
]);

// --- 3. Input/Output Kwaliteitscriteria (Slot 2 & 4) ---

export const IO_CRITERIA = Object.freeze([
    { key: "compleet", label: "Compleetheid", weight: 5, meet: "Alle benodigde data/materialen zijn aanwezig." },
    { key: "kwaliteit", label: "Datakwaliteit", weight: 5, meet: "Formaat, resolutie en inhoud zijn correct." },
    { key: "duidelijkheid", label: "Eenduidigheid", weight: 3, meet: "Geen interpretatie of vragen nodig om te starten." },
    { key: "tijdigheid", label: "Tijdigheid", weight: 3, meet: "Beschikbaar op het geplande moment." },
    { key: "standaard", label: "Standaardisatie", weight: 1, meet: "Conform naamgeving en protocollen." },
    { key: "overdracht", label: "Overdracht", weight: 1, meet: "Status correct bijgewerkt in bronsystemen." }
]);

// --- 4. Proces Metadata Opties (Slot 3) ---

export const ACTIVITY_TYPES = Object.freeze([
    { value: 'Taak', label: '📝 Taak' },
    { value: 'Afspraak', label: '📅 Afspraak' }
]);

export const LEAN_VALUES = Object.freeze([
    { value: 'VA', label: 'VA - Klantwaarde' },
    { value: 'BNVA', label: 'BNVA - Noodzakelijk' },
    { value: 'NVA', label: 'NVA - Verspilling' }
]);

export const PROCESS_STATUSES = Object.freeze([
    { value: 'SAD', label: 'Niet in control', emoji: '☹️', class: 'selected-sad' },
    { value: 'NEUTRAL', label: 'Kwetsbaar', emoji: '😐', class: 'selected-neu' },
    { value: 'HAPPY', label: 'In control', emoji: '🙂', class: 'selected-hap' }
]);

// --- 5. Tabel Opties ---

export const DISRUPTION_FREQUENCIES = Object.freeze(['Zelden', 'Soms', 'Vaak', 'Altijd']);

export const DEFINITION_TYPES = Object.freeze([
    { value: 'HARD', label: 'Noodzakelijk (Hard Stop)' },
    { value: 'SOFT', label: 'Wenselijk (Soft)' }
]);


// --- Helpers ---

/**
 * Genereert een cryptografisch sterke UUID.
 * Fallback naar timestamp+random voor oudere browsers.
 */
export const uid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// --- Factory Functions (Data Models) ---

/**
 * Creëert een nieuw leeg sticky/slot object.
 * Initialiseert automatisch de datastructuren op basis van bovenstaande arrays.
 */
export const createSticky = () => {
    // 1. Pre-fill QA structuur (voorkomt undefined errors in UI)
    const initialQA = {};
    IO_CRITERIA.forEach(c => {
        initialQA[c.key] = { result: "", note: "" };
    });

    // 2. Pre-fill System Data (default index 0)
    const initialSysData = { calculatedScore: null };
    SYSTEM_QUESTIONS.forEach(q => {
        initialSysData[q.id] = 0; 
    });

    return {
        id: uid(),
        text: "",
        linkedSourceId: null, // Voor koppeling Input -> Output
        
        // Metadata
        type: DEFAULTS.STICKY_TYPE,
        processValue: DEFAULTS.PROCESS_VALUE,
        processStatus: null, // null, HAPPY, NEUTRAL, SAD
        emoji: null, // Override emoji indien nodig
        
        // Content Fields
        successFactors: "",
        causes: [],         // Array of strings (Root Causes)
        improvements: [],   // Array of strings (Countermeasures)
        
        // Complex Structures
        qa: initialQA,
        systemData: initialSysData,
        inputDefinitions: [], // Array of { item, specifications, type }
        disruptions: []       // Array of { scenario, frequency, workaround }
    };
};

/**
 * Creëert een nieuwe kolom met de standaard 6 SIPOC slots.
 * Volgorde: Leverancier (0), Systeem (1), Input (2), Proces (3), Output (4), Klant (5)
 */
export const createColumn = () => ({
    id: uid(),
    isVisible: true,
    isParallel: false,
    hasTransition: false,
    transitionNext: "",
    outputId: null, // Cache voor ID (bv OUT1)
    slots: Array(6).fill(null).map(() => createSticky())
});

/**
 * Creëert een nieuwe sheet (tabblad).
 */
export const createSheet = (name = DEFAULTS.SHEET_NAME) => ({
    id: uid(),
    name: name,
    columns: [createColumn()] // Start altijd met minimaal 1 kolom
});

/**
 * Genereert de initiële state voor een compleet nieuw project.
 */
export const createProjectState = () => {
    const firstSheet = createSheet();
    return {
        id: uid(),
        projectTitle: DEFAULTS.PROJECT_TITLE,
        activeSheetId: firstSheet.id,
        createdAt: new Date().toISOString(),
        version: "2.0",
        sheets: [firstSheet]
    };
};