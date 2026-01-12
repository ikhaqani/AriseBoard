export const STORAGE_KEY = "pro_lss_sipoc_v53_modular";

export const SYSTEM_QUESTIONS = [
    { id: 'workarounds', label: "1. Hoe vaak dwingt het systeem je tot workarounds?", options: ["Nooit", "Soms", "Vaak", "Altijd"] },
    { id: 'performance', label: "2. Hoe vaak remt het systeem je af?", options: ["Nooit", "Soms", "Vaak", "Altijd"] },
    { id: 'double', label: "3. Hoe vaak registreer je dubbel?", options: ["Nooit", "Soms", "Vaak", "Altijd"] },
    { id: 'error', label: "4. Ruimte voor fouten?", options: ["Nooit", "Soms", "Vaak", "Altijd"] },
    { id: 'depend', label: "5. Afhankelijkheid?", options: ["Veilig", "Vertraging", "Risico", "Stilstand"] }
];

export const IO_CRITERIA = [
    { key: "compleet", label: "Compleetheid", weight: 5, meet: "Alles aanwezig" },
    { key: "kwaliteit", label: "Datakwaliteit", weight: 5, meet: "Beeldkwaliteit OK" },
    { key: "duidelijkheid", label: "Eenduidigheid", weight: 3, meet: "Geen interpretatie nodig" },
    { key: "tijdigheid", label: "Tijdigheid", weight: 3, meet: "Op tijd geleverd" }
];

export const uid = () => Math.random().toString(36).slice(2);

export const defaultSticky = () => ({
    id: uid(), text: "", causes: [], improvements: [], type: "Taak",
    processValue: "VA", processStatus: null, successFactors: "",
    qa: {}, systemData: { calculatedScore: null },
    inputDefinitions: [{ item: "", specifications: "", type: "", consequence: "" }],
    disruptions: [{ scenario: "", frequency: "", workaround: "" }]
});

export const createSheet = (name) => ({
    id: uid(),
    name: name,
    columns: [{ 
        id: uid(), isVisible: true, 
        slots: Array(6).fill(null).map(() => defaultSticky()), 
        hasTransition: false, transitionNext: "", isParallel: false 
    }]
});

export const defaultProjectState = () => {
    const firstSheet = createSheet("Start Proces");
    return {
        projectTitle: "Proces Project",
        activeSheetId: firstSheet.id,
        sheets: [firstSheet]
    };
};