/**
 * toast.js
 * High-End Notification System.
 * Genereert de HTML die past bij jouw CSS (met voortgangsbalk en SVG iconen).
 */

// 1. Scherpe SVG iconen die passen bij je thema
const ICONS = {
    success: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    info:    `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    save:    `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
    close:   `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

export const Toast = {
    container: null,
    maxToasts: 5, // Voorkom dat het scherm volstroomt

    // Initialisatie van de container in de body
    init() {
        if (document.getElementById('toast-container')) {
            this.container = document.getElementById('toast-container');
            return;
        }
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        document.body.appendChild(this.container);
    },

    /**
     * Toont een notificatie.
     * @param {string} message - Bericht
     * @param {string} type - 'success', 'error', 'info', 'save'
     * @param {number} duration - Tijd in ms (bv. 3000)
     */
    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        // Queue Management: Verwijder oudste als er te veel zijn
        if (this.container.childElementCount >= this.maxToasts) {
            const oldest = this.container.firstChild;
            if (oldest) this.removeToast(oldest);
        }

        // Maak het element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Genereer de HTML die jouw CSS verwacht
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
                <span class="toast-msg">${message}</span>
            </div>
            <button class="toast-close">${ICONS.close}</button>
            <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
        `;

        // Voeg functionaliteit toe aan de sluitknop
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.onclick = () => this.removeToast(toast);

        // Timer logica met pause-on-hover
        let timer;
        const startTimer = () => {
            timer = setTimeout(() => this.removeToast(toast), duration);
            // Hervat animatie
            const bar = toast.querySelector('.toast-progress');
            if(bar) bar.style.animationPlayState = 'running';
        };
        
        const stopTimer = () => {
            clearTimeout(timer);
            // Pauzeer animatie
            const bar = toast.querySelector('.toast-progress');
            if(bar) bar.style.animationPlayState = 'paused';
        };

        // Koppel hover events
        toast.addEventListener('mouseenter', stopTimer);
        toast.addEventListener('mouseleave', startTimer);

        // Zet in DOM en start
        this.container.appendChild(toast);
        
        // Wacht 1 frame voor de CSS transitie (zodat hij in kan glijden)
        requestAnimationFrame(() => {
            toast.classList.add('visible');
            startTimer();
        });
    },

    // Helper om netjes te verwijderen met animatie
    removeToast(toast) {
        toast.classList.remove('visible'); // Start fade-out in CSS
        toast.classList.add('removing');
        
        // Wacht tot CSS animatie klaar is, dan pas uit DOM verwijderen
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) {
                toast.remove();
            }
        });
    }
};