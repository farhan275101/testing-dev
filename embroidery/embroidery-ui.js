/* ============================================================================
   SIMPLICITY ERP - EMBROIDERY UI & SHEET ENGINE
   File: embroidery/embroidery-ui.js • Developed by Farhan Jawed
   Theme: Pure White & Gold (Synced with JobWorkEngine, Zero Duplicate Listeners)
============================================================================ */

(() => {
    'use strict';

    window.activeEmbroideryWorkerId = null;
    window.activeEmbroiderySheetId = null;
    window.activeEmbroiderySheetIndex = 0;

    const esc = (s) => {
        if (typeof window.sanitizeHTML === 'function') return window.sanitizeHTML(s);
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    const safeNum = (val, fallback = 0) => {
        const n = parseFloat(val);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const safeInt = (val, fallback = 0) => {
        const n = parseInt(val, 10);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const setDisplay = (id, val) => {
        if (typeof window.setDisplay === 'function') window.setDisplay(id, val);
        else {
            const el = document.getElementById(id);
            if (el) el.style.display = val;
        }
    };

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val !== undefined && val !== null) ? String(val) : '';
    };

    const formatDisplay = (d) => {
        return (typeof window.formatDateDisplay === 'function')
            ? window.formatDateDisplay(d)
            : (d || '-');
    };

    /* ========================================================================
       DATA BRIDGES
       ======================================================================== */
    const getEmbroideryWorkers = () => {
        if (typeof window.getJobWorkers === 'function') {
            return window.getJobWorkers().filter((w) => w && String(w.type || '').toLowerCase() === 'embroidery');
        }
        const all = window.safeArray ? window.safeArray(window.getStore('jobwork_workers')) : [];
        return all.filter((w) => w && String(w.type || '').toLowerCase() === 'embroidery');
    };

    const getEmbroideryWorkerAbsentInfo = (workerId) => {
        if (typeof window.getJobWorkerLastActiveInfo === 'function') {
            return window.getJobWorkerLastActiveInfo(workerId);
        }
        return { lastDate: '-', daysAbsent: 0 };
    };

    const getEmbroideryWorkerOverallSummary = (workerId) => {
        if (typeof window.getJobWorkerOverallSummary === 'function') {
            return window.getJobWorkerOverallSummary(workerId);
        }
        return { totGayi: 0, totAayi: 0, totDmg: 0, pendingSaree: 0 };
    };

    const calculateEmbroiderySheetTotals = (sh) => {
        if (typeof window.calculateJobWorkSheetTotals === 'function') {
            return window.calculateJobWorkSheetTotals(sh);
        }
        return {
            totGayiQty: 0,
            totAayiQty: 0,
            totDamagePcs: 0,
            totDamageAmt: 0,
            pendingSaree: 0
        };
    };

    /* ========================================================================
       NAVIGATION & DIRECTORY
       ======================================================================== */
    const openEmbroideryModule = () => {
        window.currentJobWorkMode = 'embroidery';
        if (typeof window.hideAllSections === 'function') window.hideAllSections();
        setDisplay('jobwork-section', 'block');

        if (window.JobWorkEngine && typeof window.JobWorkEngine.openJobWorkSubSection === 'function') {
            window.JobWorkEngine.openJobWorkSubSection('embroidery');
            return;
        }

        setDisplay('jw-hub-view', 'none');
        setDisplay('jw-sheet-view', 'none');
        setDisplay('jw-dukan-view', 'none');
        setDisplay('jw-billing-view', 'none');
        setDisplay('jw-movement-view', 'none');
        setDisplay('jw-workers-view', 'block');

        setText('jw-workers-title', 'Embroidery Workers');
        setText('jw-add-worker-btn-text', '+ Naya Embroidery Kariger [Alt+N]');
        renderEmbroideryWorkersTable();
    };

    const renderEmbroideryWorkersTable = () => {
        window.currentJobWorkMode = 'embroidery';
        if (window.JobWorkEngine && typeof window.JobWorkEngine.renderJobWorkWorkersTable === 'function') {
            window.JobWorkEngine.renderJobWorkWorkersTable();
            return;
        }

        const tbody = document.getElementById('jw-workers-table-body');
        if (!tbody) return;

        let list = getEmbroideryWorkers();
        const txt = (document.getElementById('jw-search-worker-input')?.value || '').toLowerCase().trim();
        if (txt) {
            list = list.filter((w) => `${w.name || ''} ${w.address || ''} ${w.mobile || ''}`.toLowerCase().includes(txt));
        }
        const minDays = safeInt(document.getElementById('jw-absent-filter')?.value);
        if (minDays > 0) {
            list = list.filter((w) => getEmbroideryWorkerAbsentInfo(w.id).daysAbsent >= minDays);
        }

        let totGayi = 0, totAayi = 0, totDmg = 0;
        getEmbroideryWorkers().forEach((w) => {
            const sum = getEmbroideryWorkerOverallSummary(w.id);
            totGayi += safeNum(sum.totGayi);
            totAayi += safeNum(sum.totAayi);
            totDmg += safeNum(sum.totDmg);
        });
        setText('jw-stat-total-gayi', `${totGayi} Pcs`);
        setText('jw-stat-total-aayi', `${totAayi} Pcs`);
        setText('jw-stat-total-damage', `${totDmg} Pcs`);

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#6b7280;">Koi Embroidery Kariger nahi mila.</td></tr>';
            return;
        }

        let html = '';
        list.forEach((w) => {
            const act = getEmbroideryWorkerAbsentInfo(w.id);
            const sum = getEmbroideryWorkerOverallSummary(w.id);
            const statusHtml = (act.daysAbsent >= 15)
                ? `<span class="jw-status-pill absent">${act.daysAbsent} Din Absent (${sum.pendingSaree} Pcs)</span>`
                : `<span class="jw-status-pill">Active (${sum.pendingSaree} Pcs)</span>`;

            html += `<tr class="jw-nav-row" onclick="openEmbroiderySheet('${esc(w.id)}')">
                <td>${formatDisplay(w.date)}</td>
                <td><strong>${esc(w.name)}</strong></td>
                <td>${esc(w.address || '-')}</td>
                <td>${esc(w.mobile || '-')}</td>
                <td>${statusHtml}</td>
                <td style="text-align:right;"><span class="jw-open-ind">Open &rarr;</span></td>
            </tr>`;
        });
        tbody.innerHTML = html;
    };

    /* ========================================================================
       CRUD & SHEET BRIDGES
       ======================================================================== */
    const toggleEmbroideryWorkerForm = () => {
        if (typeof window.toggleJobWorkerForm === 'function') window.toggleJobWorkerForm();
    };

    const cancelEmbroideryWorkerEdit = () => {
        if (typeof window.cancelJobWorkerEdit === 'function') window.cancelJobWorkerEdit();
    };

    const saveEmbroideryWorker = () => {
        if (typeof window.saveNewJobWorker === 'function') window.saveNewJobWorker();
    };

    const editEmbroideryWorker = (id) => {
        if (typeof window.editJobWorker === 'function') window.editJobWorker(id);
    };

    const deleteEmbroideryWorker = (id) => {
        if (typeof window.deleteJobWorker === 'function') window.deleteJobWorker(id);
    };

    const openEmbroiderySheet = (id) => {
        window.activeEmbroideryWorkerId = id;
        window.activeJobWorkerId = id;
        if (window.JobWorkEngine && typeof window.JobWorkEngine.openJobWorkerSheet === 'function') {
            window.JobWorkEngine.openJobWorkerSheet(id);
        } else if (typeof window.openJobWorkerSheet === 'function') {
            window.openJobWorkerSheet(id);
        }
    };

    const loadCurrentEmbroiderySheetData = () => {
        if (window.JobWorkEngine && typeof window.JobWorkEngine.loadCurrentJobWorkSheet === 'function') {
            window.JobWorkEngine.loadCurrentJobWorkSheet();
        }
    };

    const deleteEmbroideryRow = (idx) => {
        if (typeof window.deleteJobWorkBatchRow === 'function') {
            window.deleteJobWorkBatchRow(idx);
        }
    };

    const sendEmbroideryTagadaWhatsApp = (workerId, days) => {
        if (typeof window.sendJobWorkerTagadaWhatsApp === 'function') {
            window.sendJobWorkerTagadaWhatsApp(workerId, days);
        }
    };

    /* ========================================================================
       EXPORTS
       ======================================================================== */
    const embroideryUIAPI = {
        openEmbroideryModule,
        renderEmbroideryWorkersTable,
        toggleEmbroideryWorkerForm,
        cancelEmbroideryWorkerEdit,
        saveEmbroideryWorker,
        editEmbroideryWorker,
        deleteEmbroideryWorker,
        openEmbroiderySheet,
        loadCurrentEmbroiderySheetData,
        deleteEmbroideryRow,
        sendEmbroideryTagadaWhatsApp,
        getEmbroideryWorkers,
        getEmbroideryWorkerAbsentInfo,
        getEmbroideryWorkerOverallSummary,
        calculateEmbroiderySheetTotals
    };

    Object.keys(embroideryUIAPI).forEach((fnName) => {
        window[fnName] = embroideryUIAPI[fnName];
    });

    window.EmbroideryUIEngine = embroideryUIAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = embroideryUIAPI;
    }
})();
