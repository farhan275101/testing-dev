/* ============================================================================
   SIMPLICITY ERP - BOOTI CUTTING UI & SHEET ENGINE
   File: cutting/cutting-ui.js • Developed by Farhan Jawed
   Theme: Pure White & Gold (Synced with JobWorkEngine, Zero Duplicate Listeners)
============================================================================ */

(() => {
    'use strict';

    window.activeCuttingWorkerId = null;
    window.activeCuttingSheetId = null;
    window.activeCuttingSheetIndex = 0;

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
    const getCuttingWorkers = () => {
        if (typeof window.getJobWorkers === 'function') {
            return window.getJobWorkers().filter((w) => w && String(w.type || '').toLowerCase() === 'cutting');
        }
        const all = window.safeArray ? window.safeArray(window.getStore('jobwork_workers')) : [];
        return all.filter((w) => w && String(w.type || '').toLowerCase() === 'cutting');
    };

    const getCuttingWorkerAbsentInfo = (workerId) => {
        if (typeof window.getJobWorkerLastActiveInfo === 'function') {
            return window.getJobWorkerLastActiveInfo(workerId);
        }
        return { lastDate: '-', daysAbsent: 0 };
    };

    const getCuttingWorkerOverallSummary = (workerId) => {
        if (typeof window.getJobWorkerOverallSummary === 'function') {
            return window.getJobWorkerOverallSummary(workerId);
        }
        return { totGayi: 0, totAayi: 0, totDmg: 0, pendingSaree: 0 };
    };

    const calculateCuttingSheetTotals = (sh) => {
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
    const openCuttingModule = () => {
        window.currentJobWorkMode = 'cutting';
        if (typeof window.hideAllSections === 'function') window.hideAllSections();
        setDisplay('jobwork-section', 'block');

        if (window.JobWorkEngine && typeof window.JobWorkEngine.openJobWorkSubSection === 'function') {
            window.JobWorkEngine.openJobWorkSubSection('cutting');
            return;
        }

        setDisplay('jw-hub-view', 'none');
        setDisplay('jw-sheet-view', 'none');
        setDisplay('jw-dukan-view', 'none');
        setDisplay('jw-billing-view', 'none');
        setDisplay('jw-movement-view', 'none');
        setDisplay('jw-workers-view', 'block');

        setText('jw-workers-title', 'Booti Cutting Workers');
        setText('jw-add-worker-btn-text', '+ Naya Cutting Kariger [Alt+N]');
        renderCuttingWorkersTable();
    };

    const renderCuttingWorkersTable = () => {
        window.currentJobWorkMode = 'cutting';
        if (window.JobWorkEngine && typeof window.JobWorkEngine.renderJobWorkWorkersTable === 'function') {
            window.JobWorkEngine.renderJobWorkWorkersTable();
            return;
        }

        const tbody = document.getElementById('jw-workers-table-body');
        if (!tbody) return;

        let list = getCuttingWorkers();
        const txt = (document.getElementById('jw-search-worker-input')?.value || '').toLowerCase().trim();
        if (txt) {
            list = list.filter((w) => `${w.name || ''} ${w.address || ''} ${w.mobile || ''}`.toLowerCase().includes(txt));
        }
        const minDays = safeInt(document.getElementById('jw-absent-filter')?.value);
        if (minDays > 0) {
            list = list.filter((w) => getCuttingWorkerAbsentInfo(w.id).daysAbsent >= minDays);
        }

        let totGayi = 0, totAayi = 0, totDmg = 0;
        getCuttingWorkers().forEach((w) => {
            const sum = getCuttingWorkerOverallSummary(w.id);
            totGayi += safeNum(sum.totGayi);
            totAayi += safeNum(sum.totAayi);
            totDmg += safeNum(sum.totDmg);
        });
        setText('jw-stat-total-gayi', `${totGayi} Pcs`);
        setText('jw-stat-total-aayi', `${totAayi} Pcs`);
        setText('jw-stat-total-damage', `${totDmg} Pcs`);

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#6b7280;">Koi Cutting Kariger nahi mila.</td></tr>';
            return;
        }

        let html = '';
        list.forEach((w) => {
            const act = getCuttingWorkerAbsentInfo(w.id);
            const sum = getCuttingWorkerOverallSummary(w.id);
            const statusHtml = (act.daysAbsent >= 15)
                ? `<span class="jw-status-pill absent">${act.daysAbsent} Din Absent (${sum.pendingSaree} Pcs)</span>`
                : `<span class="jw-status-pill">Active (${sum.pendingSaree} Pcs)</span>`;

            html += `<tr class="jw-nav-row" onclick="openCuttingSheet('${esc(w.id)}')">
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
    const toggleCuttingWorkerForm = () => {
        if (typeof window.toggleJobWorkerForm === 'function') window.toggleJobWorkerForm();
    };

    const cancelCuttingWorkerEdit = () => {
        if (typeof window.cancelJobWorkerEdit === 'function') window.cancelJobWorkerEdit();
    };

    const saveCuttingWorker = () => {
        if (typeof window.saveNewJobWorker === 'function') window.saveNewJobWorker();
    };

    const editCuttingWorker = (id) => {
        if (typeof window.editJobWorker === 'function') window.editJobWorker(id);
    };

    const deleteCuttingWorker = (id) => {
        if (typeof window.deleteJobWorker === 'function') window.deleteJobWorker(id);
    };

    const openCuttingSheet = (id) => {
        window.activeCuttingWorkerId = id;
        window.activeJobWorkerId = id;
        if (window.JobWorkEngine && typeof window.JobWorkEngine.openJobWorkerSheet === 'function') {
            window.JobWorkEngine.openJobWorkerSheet(id);
        } else if (typeof window.openJobWorkerSheet === 'function') {
            window.openJobWorkerSheet(id);
        }
    };

    const loadCurrentCuttingSheetData = () => {
        if (window.JobWorkEngine && typeof window.JobWorkEngine.loadCurrentJobWorkSheet === 'function') {
            window.JobWorkEngine.loadCurrentJobWorkSheet();
        }
    };

    const deleteCuttingRow = (idx) => {
        if (typeof window.deleteJobWorkBatchRow === 'function') {
            window.deleteJobWorkBatchRow(idx);
        }
    };

    const sendCuttingTagadaWhatsApp = (workerId, days) => {
        if (typeof window.sendJobWorkerTagadaWhatsApp === 'function') {
            window.sendJobWorkerTagadaWhatsApp(workerId, days);
        }
    };

    /* ========================================================================
       EXPORTS
       ======================================================================== */
    const cuttingUIAPI = {
        openCuttingModule,
        renderCuttingWorkersTable,
        toggleCuttingWorkerForm,
        cancelCuttingWorkerEdit,
        saveCuttingWorker,
        editCuttingWorker,
        deleteCuttingWorker,
        openCuttingSheet,
        loadCurrentCuttingSheetData,
        deleteCuttingRow,
        sendCuttingTagadaWhatsApp,
        getCuttingWorkers,
        getCuttingWorkerAbsentInfo,
        getCuttingWorkerOverallSummary,
        calculateCuttingSheetTotals
    };

    Object.keys(cuttingUIAPI).forEach((fnName) => {
        window[fnName] = cuttingUIAPI[fnName];
    });

    window.CuttingUIEngine = cuttingUIAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = cuttingUIAPI;
    }
})();
