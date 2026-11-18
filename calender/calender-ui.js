/* ============================================================================
   SIMPLICITY ERP - CALENDER FINISHING UI & SHEET ENGINE
   File: calender/calender-ui.js • Developed by Farhan Jawed
   Theme: Pure White & Gold (Synced with JobWorkEngine, Zero Duplicate Listeners)
============================================================================ */

(() => {
    'use strict';

    window.activeCalenderWorkerId = null;
    window.activeCalenderSheetId = null;
    window.activeCalenderSheetIndex = 0;

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
    const getCalenderWorkers = () => {
        if (typeof window.getJobWorkers === 'function') {
            return window.getJobWorkers().filter((w) => w && String(w.type || '').toLowerCase() === 'calender');
        }
        const all = window.safeArray ? window.safeArray(window.getStore('jobwork_workers')) : [];
        return all.filter((w) => w && String(w.type || '').toLowerCase() === 'calender');
    };

    const getCalenderWorkerAbsentInfo = (workerId) => {
        if (typeof window.getJobWorkerLastActiveInfo === 'function') {
            return window.getJobWorkerLastActiveInfo(workerId);
        }
        return { lastDate: '-', daysAbsent: 0 };
    };

    const getCalenderWorkerOverallSummary = (workerId) => {
        if (typeof window.getJobWorkerOverallSummary === 'function') {
            return window.getJobWorkerOverallSummary(workerId);
        }
        return { totGayi: 0, totAayi: 0, totDmg: 0, pendingSaree: 0 };
    };

    const calculateCalenderSheetTotals = (sh) => {
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
    const openCalenderModule = () => {
        window.currentJobWorkMode = 'calender';
        if (typeof window.hideAllSections === 'function') window.hideAllSections();
        setDisplay('jobwork-section', 'block');

        if (window.JobWorkEngine && typeof window.JobWorkEngine.openJobWorkSubSection === 'function') {
            window.JobWorkEngine.openJobWorkSubSection('calender');
            return;
        }

        setDisplay('jw-hub-view', 'none');
        setDisplay('jw-sheet-view', 'none');
        setDisplay('jw-dukan-view', 'none');
        setDisplay('jw-billing-view', 'none');
        setDisplay('jw-movement-view', 'none');
        setDisplay('jw-workers-view', 'block');

        setText('jw-workers-title', 'Calender Workers');
        setText('jw-add-worker-btn-text', '+ Naya Calender Kariger [Alt+N]');
        renderCalenderWorkersTable();
    };

    const renderCalenderWorkersTable = () => {
        window.currentJobWorkMode = 'calender';
        if (window.JobWorkEngine && typeof window.JobWorkEngine.renderJobWorkWorkersTable === 'function') {
            window.JobWorkEngine.renderJobWorkWorkersTable();
            return;
        }

        const tbody = document.getElementById('jw-workers-table-body');
        if (!tbody) return;

        let list = getCalenderWorkers();
        const txt = (document.getElementById('jw-search-worker-input')?.value || '').toLowerCase().trim();
        if (txt) {
            list = list.filter((w) => `${w.name || ''} ${w.address || ''} ${w.mobile || ''}`.toLowerCase().includes(txt));
        }
        const minDays = safeInt(document.getElementById('jw-absent-filter')?.value);
        if (minDays > 0) {
            list = list.filter((w) => getCalenderWorkerAbsentInfo(w.id).daysAbsent >= minDays);
        }

        let totGayi = 0, totAayi = 0, totDmg = 0;
        getCalenderWorkers().forEach((w) => {
            const sum = getCalenderWorkerOverallSummary(w.id);
            totGayi += safeNum(sum.totGayi);
            totAayi += safeNum(sum.totAayi);
            totDmg += safeNum(sum.totDmg);
        });
        setText('jw-stat-total-gayi', `${totGayi} Pcs`);
        setText('jw-stat-total-aayi', `${totAayi} Pcs`);
        setText('jw-stat-total-damage', `${totDmg} Pcs`);

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#6b7280;">Koi Calender Kariger nahi mila.</td></tr>';
            return;
        }

        let html = '';
        list.forEach((w) => {
            const act = getCalenderWorkerAbsentInfo(w.id);
            const sum = getCalenderWorkerOverallSummary(w.id);
            const statusHtml = (act.daysAbsent >= 15)
                ? `<span class="jw-status-pill absent">${act.daysAbsent} Din Absent (${sum.pendingSaree} Pcs)</span>`
                : `<span class="jw-status-pill">Active (${sum.pendingSaree} Pcs)</span>`;

            html += `<tr class="jw-nav-row" onclick="openCalenderSheet('${esc(w.id)}')">
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
    const toggleCalenderWorkerForm = () => {
        if (typeof window.toggleJobWorkerForm === 'function') window.toggleJobWorkerForm();
    };

    const cancelCalenderWorkerEdit = () => {
        if (typeof window.cancelJobWorkerEdit === 'function') window.cancelJobWorkerEdit();
    };

    const saveCalenderWorker = () => {
        if (typeof window.saveNewJobWorker === 'function') window.saveNewJobWorker();
    };

    const editCalenderWorker = (id) => {
        if (typeof window.editJobWorker === 'function') window.editJobWorker(id);
    };

    const deleteCalenderWorker = (id) => {
        if (typeof window.deleteJobWorker === 'function') window.deleteJobWorker(id);
    };

    const openCalenderSheet = (id) => {
        window.activeCalenderWorkerId = id;
        window.activeJobWorkerId = id;
        if (window.JobWorkEngine && typeof window.JobWorkEngine.openJobWorkerSheet === 'function') {
            window.JobWorkEngine.openJobWorkerSheet(id);
        } else if (typeof window.openJobWorkerSheet === 'function') {
            window.openJobWorkerSheet(id);
        }
    };

    const loadCurrentCalenderSheetData = () => {
        if (window.JobWorkEngine && typeof window.JobWorkEngine.loadCurrentJobWorkSheet === 'function') {
            window.JobWorkEngine.loadCurrentJobWorkSheet();
        }
    };

    const deleteCalenderRow = (idx) => {
        if (typeof window.deleteJobWorkBatchRow === 'function') {
            window.deleteJobWorkBatchRow(idx);
        }
    };

    const sendCalenderTagadaWhatsApp = (workerId, days) => {
        if (typeof window.sendJobWorkerTagadaWhatsApp === 'function') {
            window.sendJobWorkerTagadaWhatsApp(workerId, days);
        }
    };

    /* ========================================================================
       EXPORTS
       ======================================================================== */
    const calenderUIAPI = {
        openCalenderModule,
        renderCalenderWorkersTable,
        toggleCalenderWorkerForm,
        cancelCalenderWorkerEdit,
        saveCalenderWorker,
        editCalenderWorker,
        deleteCalenderWorker,
        openCalenderSheet,
        loadCurrentCalenderSheetData,
        deleteCalenderRow,
        sendCalenderTagadaWhatsApp,
        getCalenderWorkers,
        getCalenderWorkerAbsentInfo,
        getCalenderWorkerOverallSummary,
        calculateCalenderSheetTotals
    };

    Object.keys(calenderUIAPI).forEach((fnName) => {
        window[fnName] = calenderUIAPI[fnName];
    });

    window.CalenderUIEngine = calenderUIAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = calenderUIAPI;
    }
})();
