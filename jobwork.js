/* ============================================================================
   SIMPLICITY ERP - HIGH-PERFORMANCE JOB WORK HUB, BATCH & BILLING ENGINE
   File: jobwork.js • Developed by Farhan Jawed (TallyPrime White & Gold Edition)
   Processes: Cutting | Embroidery | Calender | Dukan | Bills | Tracking Day-Book
============================================================================ */

(() => {
    'use strict';

    /* ========================================================================
       1. GLOBAL STATE & MEMOIZATION POOL
       ======================================================================== */
    window.currentJobWorkMode = 'hub';
    window.activeJobWorkerId = null;
    window.activeJobSheetId = null;
    window.currentDiyaBatch = [];
    window.currentAayiBatch = [];
    window.activeBatchModalInfo = null;
    window.currentJwBillTab = 'pending';
    window.currentJwMovementTab = 'cutting';

    let hubActiveIdx = 0;
    let workerTableList = [];
    let workerActiveIdx = 0;
    let billTableList = [];
    let billActiveIdx = 0;
    let activeBillLedgerId = null;

    // Sheet Voucher State (Exact jobwork-express pattern)
    let shMovementType = 'gayi'; // 'gayi' | 'aayi'
    let shStockSource = 'fresh'; // 'fresh' | 'cutting' | 'embroidery'
    let shBatchItems = [];
    let shLastSavedChallan = null;
    let shLastNaap = '3.60';
    let shPickerMode = 'maker'; // 'movement' | 'source' | 'maker' | 'summary'
    let shPickerItems = [];
    let shPickerActiveIdx = 0;
    let shMakerArrowUsed = false;
    let shInlineEditItemIdx = null;

    // Bill Worker Picker State
    let billPickerItems = [];
    let billPickerActiveIdx = 0;

    // Double-Enter Guard
    let jwOpenGuardTs = 0;
    const armEnterGuard = () => { jwOpenGuardTs = Date.now(); };
    const isEnterGuarded = () => (Date.now() - jwOpenGuardTs) < 175;

    const WORKER_SUMMARY_CACHE = new Map();
    const WORKER_ACTIVE_CACHE = new Map();
    const KARIGER_STOCK_CACHE = new Map();

    const invalidateJobWorkCache = (workerId) => {
        if (workerId) {
            WORKER_SUMMARY_CACHE.delete(String(workerId).trim());
            WORKER_ACTIVE_CACHE.delete(String(workerId).trim());
        } else {
            WORKER_SUMMARY_CACHE.clear();
            WORKER_ACTIVE_CACHE.clear();
        }
        KARIGER_STOCK_CACHE.clear();

        if (typeof window.invalidateSareeCalcCache === 'function') window.invalidateSareeCalcCache();
        if (typeof window.invalidateCalenderCalcCache === 'function') window.invalidateCalenderCalcCache();
        if (typeof window.invalidateCuttingCalcCache === 'function') window.invalidateCuttingCalcCache();
        if (typeof window.invalidateEmbroideryCalcCache === 'function') window.invalidateEmbroideryCalcCache();
    };

    /* ========================================================================
       2. SAFE DOM, DATE & DATA SANITIZATION UTILITIES
       ======================================================================== */
    const toArray = (v) => {
        if (Array.isArray(v)) return v;
        if (typeof window.safeArray === 'function') return window.safeArray(v);
        return [];
    };

    const getFromStore = (key) => {
        if (typeof window.getStore === 'function') return window.getStore(key);
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    };

    const setToStore = (key, val) => {
        if (typeof window.setStore === 'function') window.setStore(key, val);
        else localStorage.setItem(key, JSON.stringify(val));
    };

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

    const toIsoDate = (val) => {
        if (!val) return '';
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const parts = s.split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return s;
    };

    const getTodayIso = () => {
        const raw = (typeof window.getTodayDate === 'function')
            ? window.getTodayDate()
            : new Date().toISOString().split('T')[0];
        const iso = toIsoDate(raw);
        return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().split('T')[0];
    };

    const formatDisplay = (d) => {
        if (typeof window.formatDateDisplay === 'function') return window.formatDateDisplay(d);
        return d || '-';
    };

    const normText = (txt, fallback = '') => String(txt || fallback).trim().toUpperCase();

    const normGodownId = (kid) => {
        if (!kid || kid === 'all') return 'all';
        const clean = String(kid).trim();
        return (!clean || clean === 'k_main') ? 'k_main' : clean;
    };

    const getEffectiveGodown = () => {
        const kid = (typeof window.getActiveKarkhanaId === 'function')
            ? window.getActiveKarkhanaId()
            : (window.currentDashboardKarkhanaFilter || 'k_main');
        return (!kid || kid === 'all') ? 'k_main' : kid;
    };

    const getCleanMobile = (rawMob) => {
        let mob = String(rawMob || '').trim().replace(/[^0-9]/g, '');
        if (mob.length === 11 && mob.startsWith('0')) mob = mob.substring(1);
        if (mob.length === 10) mob = `91${mob}`;
        return mob;
    };

    const isVisible = (id) => {
        const el = document.getElementById(id);
        return Boolean(el && el.style.display !== 'none' && el.offsetParent !== null);
    };

    const lockNumberStepping = (rootEl) => {
        if (!rootEl) return;
        rootEl.addEventListener('keydown', (e) => {
            const t = e.target;
            if (!t || t.tagName !== 'INPUT') return;
            if (t.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
            }
        }, true);
        rootEl.addEventListener('wheel', (e) => {
            const t = e.target;
            if (t && t.tagName === 'INPUT' && t.type === 'number' && document.activeElement === t) {
                t.blur();
            }
        }, { passive: true });
    };

    /* ========================================================================
       3. NAVIGATION & GATEWAY HUB CONTROLLER
       ======================================================================== */
    const openJobWorkModule = () => {
        if (typeof window.hideAllSections === 'function') window.hideAllSections();
        setDisplay('jobwork-section', 'block');
        armEnterGuard();
        showJobWorkHub();
    };

    const setHubActiveRow = (idx) => {
        const rows = Array.from(document.querySelectorAll('#jw-hub-list .jw-hub-row'));
        if (!rows.length) return;
        hubActiveIdx = ((idx % rows.length) + rows.length) % rows.length;
        rows.forEach((r, i) => {
            if (i === hubActiveIdx) r.classList.add('active');
            else r.classList.remove('active');
        });
    };

    const showJobWorkHub = () => {
        window.currentJobWorkMode = 'hub';
        window.activeJobWorkerId = null;
        window.activeJobSheetId = null;
        activeBillLedgerId = null;
        window.activeBatchModalInfo = null;
        armEnterGuard();

        setDisplay('jw-hub-view', 'block');
        setDisplay('jw-workers-view', 'none');
        setDisplay('jw-sheet-view', 'none');
        setDisplay('jw-dukan-view', 'none');
        setDisplay('jw-billing-view', 'none');
        setDisplay('jw-movement-view', 'none');

        setText('jw-header-context-lbl', 'Gateway');
        updateJobWorkHubBadges();
        setHubActiveRow(hubActiveIdx);
    };

    const openJobWorkSubSection = (mode) => {
        window.currentJobWorkMode = mode;
        armEnterGuard();
        setDisplay('jw-hub-view', 'none');

        if (mode === 'cutting' || mode === 'embroidery' || mode === 'calender') {
            setDisplay('jw-sheet-view', 'none');
            setDisplay('jw-dukan-view', 'none');
            setDisplay('jw-billing-view', 'none');
            setDisplay('jw-movement-view', 'none');
            setDisplay('jw-workers-view', 'block');

            const titleEl = document.getElementById('jw-workers-title');
            const addBtnEl = document.getElementById('jw-add-worker-btn-text');

            if (mode === 'cutting') {
                if (titleEl) titleEl.textContent = 'Booti Cutting Workers';
                if (addBtnEl) addBtnEl.textContent = '+ Naya Cutting Kariger [Alt+N]';
                setText('jw-header-context-lbl', 'Booti Cutting');
            } else if (mode === 'embroidery') {
                if (titleEl) titleEl.textContent = 'Embroidery Workers';
                if (addBtnEl) addBtnEl.textContent = '+ Naya Embroidery Kariger [Alt+N]';
                setText('jw-header-context-lbl', 'Embroidery');
            } else {
                if (titleEl) titleEl.textContent = 'Calender Workers';
                if (addBtnEl) addBtnEl.textContent = '+ Naya Calender Kariger [Alt+N]';
                setText('jw-header-context-lbl', 'Calender');
            }

            workerActiveIdx = 0;
            renderJobWorkWorkersTable();
        } else if (mode === 'dukan') {
            setDisplay('jw-workers-view', 'none');
            setDisplay('jw-sheet-view', 'none');
            setDisplay('jw-billing-view', 'none');
            setDisplay('jw-movement-view', 'none');
            setDisplay('jw-dukan-view', 'block');
            setText('jw-header-context-lbl', 'Dukan Bheja');

            if (window.DukanEngine && typeof window.DukanEngine.initDukanVoucher === 'function') {
                window.DukanEngine.initDukanVoucher();
            } else if (typeof window.renderDukanTransferTable === 'function') {
                window.renderDukanTransferTable();
            }
        } else if (mode === 'billing') {
            setDisplay('jw-workers-view', 'none');
            setDisplay('jw-sheet-view', 'none');
            setDisplay('jw-dukan-view', 'none');
            setDisplay('jw-movement-view', 'none');
            setDisplay('jw-billing-view', 'block');
            setText('jw-header-context-lbl', 'Bills & Hisab');

            initJobWorkBillingView();
        } else if (mode === 'movement') {
            setDisplay('jw-workers-view', 'none');
            setDisplay('jw-sheet-view', 'none');
            setDisplay('jw-dukan-view', 'none');
            setDisplay('jw-billing-view', 'none');
            setDisplay('jw-movement-view', 'block');
            setText('jw-header-context-lbl', 'Tracking Day-Book');

            setJwMovementToday();
        }
    };

    const updateJobWorkHubBadges = () => {
        const workers = getJobWorkers();
        const cutCount = workers.filter((w) => String(w?.type || '').toLowerCase() === 'cutting').length;
        const calCount = workers.filter((w) => String(w?.type || '').toLowerCase() === 'calender').length;
        const embCount = workers.filter((w) => String(w?.type || '').toLowerCase() === 'embroidery').length;

        setText('jw-hub-badge-cutting', `${cutCount} Kariger`);
        setText('jw-hub-badge-calender', `${calCount} Kariger`);
        setText('jw-hub-badge-embroidery', `${embCount} Kariger`);

        let totSent = 0;
        if (typeof window.getDukanTransfers === 'function') {
            window.getDukanTransfers().forEach((d) => { totSent += safeNum(d?.pcs); });
        } else {
            toArray(getFromStore('dukan_transfer_history')).forEach((d) => { totSent += safeNum(d?.pcs); });
        }
        setText('jw-hub-badge-dukan', `${totSent} Pcs Bheje`);

        const billStats = getJwBillingStats();
        setText('jw-hub-badge-billing', `Baki: ₹ ${billStats.pending.toFixed(0)}`);
    };

    /* ========================================================================
       4. WORKER REGISTRY & DIRECTORY (ZERO ROW BUTTONS)
       ======================================================================== */
    const getJobWorkers = () => toArray(getFromStore('jobwork_workers'));

    const saveJobWorkers = (list) => {
        setToStore('jobwork_workers', toArray(list));
        invalidateJobWorkCache();
    };

    const getJobWorkerLastActiveInfo = (workerId) => {
        if (!workerId) return { lastDate: '-', daysAbsent: 0 };
        const cleanId = String(workerId).trim();
        if (WORKER_ACTIVE_CACHE.has(cleanId)) return WORKER_ACTIVE_CACHE.get(cleanId);

        let latestDate = null;
        const sheets = getJobWorkerSheets(cleanId);
        if (sheets.length > 0) {
            const lastSheet = sheets[sheets.length - 1];
            const rows = toArray(lastSheet?.rows);
            for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i]?.date) {
                    latestDate = rows[i].date;
                    break;
                }
            }
        }

        const w = getJobWorkers().find((x) => String(x.id) === cleanId);
        if (!latestDate) latestDate = w?.date || null;

        if (!latestDate) {
            const res = { lastDate: '-', daysAbsent: 0 };
            WORKER_ACTIVE_CACHE.set(cleanId, res);
            return res;
        }

        const iso = toIsoDate(latestDate);
        const lastDateTime = new Date(`${iso}T00:00:00`).getTime();
        const diffDays = isNaN(lastDateTime) ? 0 : Math.max(0, Math.floor((Date.now() - lastDateTime) / 86400000));

        const result = { lastDate: latestDate, daysAbsent: diffDays };
        WORKER_ACTIVE_CACHE.set(cleanId, result);
        return result;
    };

    const toggleJobWorkerForm = () => {
        const f = document.getElementById('add-jw-worker-form');
        if (!f) return;

        const isOpening = (f.style.display !== 'block');
        f.style.display = isOpening ? 'block' : 'none';
        setDisplay('jw-worker-accept-bar', 'none');

        if (isOpening) {
            cancelJobWorkerEdit();
            setTimeout(() => {
                const nEl = document.getElementById('jw-worker-name');
                if (nEl) nEl.focus();
            }, 40);
        }
    };

    const cancelJobWorkerEdit = () => {
        const setV = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v;
        };
        setV('jw-worker-edit-id', '');
        setV('jw-worker-name', '');
        setV('jw-worker-address', '');
        setV('jw-worker-mobile', '');
        setV('jw-worker-date', getTodayIso());

        const btn = document.getElementById('jw-worker-save-btn');
        if (btn) btn.textContent = 'Save Kariger';
        setDisplay('jw-worker-cancel-btn', 'none');
        setDisplay('jw-worker-accept-bar', 'none');
    };

    const saveNewJobWorker = () => {
        const editId = document.getElementById('jw-worker-edit-id')?.value || '';
        const d = toIsoDate(document.getElementById('jw-worker-date')?.value) || getTodayIso();
        const n = normText(document.getElementById('jw-worker-name')?.value);
        const addr = String(document.getElementById('jw-worker-address')?.value || '').trim();
        const m = String(document.getElementById('jw-worker-mobile')?.value || '').trim();

        if (!n) {
            alert('Kariger ka naam zaroori hai!');
            document.getElementById('jw-worker-name')?.focus();
            return;
        }

        const list = [...getJobWorkers()];
        let targetId = editId;

        if (editId) {
            const it = list.find((x) => String(x.id) === String(editId));
            if (it) {
                it.name = n;
                it.address = addr;
                it.mobile = m;
                it.date = d;
            }
        } else {
            targetId = `jw_${Date.now()}`;
            const workerType = ['cutting', 'embroidery', 'calender'].includes(window.currentJobWorkMode)
                ? window.currentJobWorkMode
                : 'cutting';
            list.push({
                id: targetId,
                type: workerType,
                date: d,
                name: n,
                address: addr,
                mobile: m
            });
        }

        saveJobWorkers(list);
        invalidateJobWorkCache(targetId);
        cancelJobWorkerEdit();
        setDisplay('add-jw-worker-form', 'none');

        if (isVisible('jw-sheet-view') && String(window.activeJobWorkerId) === String(targetId)) {
            openJobWorkerSheet(targetId);
        } else {
            renderJobWorkWorkersTable();
        }
        updateJobWorkHubBadges();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
    };

    const editJobWorker = (workerId) => {
        const w = getJobWorkers().find((x) => String(x.id) === String(workerId));
        if (!w) return;

        if (!isVisible('jw-workers-view')) {
            openJobWorkSubSection(String(w.type || 'cutting').toLowerCase());
        }

        setDisplay('add-jw-worker-form', 'block');
        setDisplay('jw-worker-accept-bar', 'none');

        const setV = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v;
        };
        setV('jw-worker-edit-id', w.id);
        setV('jw-worker-date', toIsoDate(w.date) || getTodayIso());
        setV('jw-worker-name', w.name);
        setV('jw-worker-address', w.address || '');
        setV('jw-worker-mobile', w.mobile || '');

        const btn = document.getElementById('jw-worker-save-btn');
        if (btn) btn.textContent = 'Update Kariger';
        setDisplay('jw-worker-cancel-btn', 'inline-block');
        setTimeout(() => {
            const nEl = document.getElementById('jw-worker-name');
            if (nEl) { nEl.focus(); nEl.select(); }
        }, 40);
    };

    const editActiveSheetWorker = () => {
        if (!window.activeJobWorkerId) return;
        const id = window.activeJobWorkerId;
        closeJobWorkerSheet();
        editJobWorker(id);
    };

    const deleteJobWorker = (workerId) => {
        if (!confirm('Kya is Job Worker ko delete karna chahte hain?')) return;
        saveJobWorkers(getJobWorkers().filter((x) => String(x.id) !== String(workerId)));
        try { localStorage.removeItem(`jobwork_sheets_${workerId}`); } catch {}

        invalidateJobWorkCache(workerId);
        renderJobWorkWorkersTable();
        updateJobWorkHubBadges();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
    };

    const filterJobWorkWorkers = () => {
        workerActiveIdx = 0;
        renderJobWorkWorkersTable();
    };

    const highlightWorkerRow = (idx) => {
        if (!workerTableList.length) return;
        workerActiveIdx = ((idx % workerTableList.length) + workerTableList.length) % workerTableList.length;
        const rows = document.querySelectorAll('#jw-workers-table-body tr.jw-nav-row');
        rows.forEach((tr, i) => {
            if (i === workerActiveIdx) {
                tr.classList.add('jw-row-active');
                tr.scrollIntoView({ block: 'nearest' });
            } else {
                tr.classList.remove('jw-row-active');
            }
        });
    };

    const renderJobWorkWorkersTable = () => {
        const tbody = document.getElementById('jw-workers-table-body');
        if (!tbody) return;

        const mode = String(window.currentJobWorkMode || 'cutting').toLowerCase();
        const allTypeWorkers = getJobWorkers().filter((w) => w && String(w.type || '').toLowerCase() === mode);

        let filtered = [...allTypeWorkers];
        const txt = (document.getElementById('jw-search-worker-input')?.value || '').toLowerCase().trim();
        if (txt) {
            filtered = filtered.filter((w) => `${w.name || ''} ${w.address || ''} ${w.mobile || ''}`.toLowerCase().includes(txt));
        }

        const minDays = safeInt(document.getElementById('jw-absent-filter')?.value);
        if (minDays > 0) {
            filtered = filtered.filter((w) => getJobWorkerLastActiveInfo(w.id).daysAbsent >= minDays);
        }

        let totGayi = 0, totAayi = 0, totDmg = 0;
        allTypeWorkers.forEach((w) => {
            const sum = getJobWorkerOverallSummary(w.id);
            totGayi += sum.totGayi;
            totAayi += sum.totAayi;
            totDmg += sum.totDmg;
        });

        setText('jw-stat-total-gayi', `${totGayi} Pcs`);
        setText('jw-stat-total-aayi', `${totAayi} Pcs`);
        setText('jw-stat-total-damage', `${totDmg} Pcs`);

        workerTableList = filtered;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#6b7280;">Koi Kariger nahi mila.</td></tr>';
            return;
        }

        if (workerActiveIdx >= filtered.length) workerActiveIdx = 0;

        let html = '';
        filtered.forEach((w, idx) => {
            const act = getJobWorkerLastActiveInfo(w.id);
            const sum = getJobWorkerOverallSummary(w.id);
            let statusHtml = `<span class="jw-status-pill">Active (${sum.pendingSaree} Pcs)</span>`;
            if (act.daysAbsent >= 30) {
                statusHtml = `<span class="jw-status-pill absent">${act.daysAbsent} Din Absent (${sum.pendingSaree} Pcs)</span>`;
            } else if (act.daysAbsent >= 15) {
                statusHtml = `<span class="jw-status-pill absent">${act.daysAbsent} Din hue (${sum.pendingSaree} Pcs)</span>`;
            }

            html += `<tr class="jw-nav-row ${idx === workerActiveIdx ? 'jw-row-active' : ''}" data-idx="${idx}" onclick="JobWorkEngine.onWorkerRowClick(${idx}, '${esc(w.id)}')">
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

    const onWorkerRowClick = (idx, workerId) => {
        highlightWorkerRow(idx);
        openJobWorkerSheet(workerId);
    };

    const sendJobWorkerTagadaWhatsApp = (workerId, days) => {
        const w = getJobWorkers().find((x) => String(x.id) === String(workerId));
        if (!w) return;

        const mob = getCleanMobile(w.mobile);
        if (!mob || mob.length < 10) {
            alert(`${w.name} ka Mobile Number saved nahi hai. Pehle [E] Edit karke Mobile number daalein.`);
            editJobWorker(workerId);
            return;
        }

        const sum = getJobWorkerOverallSummary(workerId);
        let typeTitle = 'कटिंग';
        if (w.type === 'calender') typeTitle = 'कैलेंडर';
        else if (w.type === 'embroidery') typeTitle = 'कढ़ाई (Embroidery)';

        const msg = `SIMPLICITY ERP\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `सलाम ${w.name} भाई,\n\n` +
            `कारखाने से साड़ी (${typeTitle}) का काम ले जाए आपको *${days} दिन* हो चुके हैं।\n` +
            `आपके पास बकाया साड़ी: *${sum.pendingSaree} Pcs*\n\n` +
            `कृपया जल्द से जल्द आकर तैयार साड़ी जमा करें।\n━━━━━━━━━━━━━━━━━━━━━\n_Simplicity ERP • by Farhan Jawed_`;

        window.open(`https://wa.me/${mob}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    /* ========================================================================
       5. SHEET STORAGE & TOTALS ENGINE
       ======================================================================== */
    const getJobWorkerSheets = (workerId) => {
        if (!workerId) return [];
        const sheets = toArray(getFromStore(`jobwork_sheets_${workerId}`));
        sheets.forEach((sh) => { if (sh) sh.rows = toArray(sh.rows); });
        return sheets;
    };

    const saveJobWorkerSheets = (workerId, sheets) => {
        if (!workerId) return;
        const clean = toArray(sheets);
        clean.forEach((sh) => { if (sh) sh.rows = toArray(sh.rows); });
        setToStore(`jobwork_sheets_${workerId}`, clean);
        invalidateJobWorkCache(workerId);
    };

    const calculateJobWorkSheetTotals = (sh) => {
        const def = {
            closingPendingSaree: 0, closingBakiAmt: 0,
            totGayiQty: 0, totAayiQty: 0, totDamageAmt: 0, totDamagePcs: 0, pendingSaree: 0
        };
        if (!sh || typeof sh !== 'object') return def;

        const rows = toArray(sh.rows);
        let gayiQ = 0, aayiQ = 0, dmgAmt = 0, dmgPcs = 0;

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!r) continue;
            gayiQ += safeNum(r.gayiQty);
            aayiQ += safeNum(r.aayiQty);
            dmgAmt += safeNum(r.damageAmt);
            dmgPcs += safeNum(r.damagePcs);
        }

        const pichliSaree = safeNum(sh.closingPendingSaree);
        return {
            closingPendingSaree: pichliSaree,
            closingBakiAmt: safeNum(sh.closingBakiAmt),
            totGayiQty: gayiQ,
            totAayiQty: aayiQ,
            totDamageAmt: dmgAmt,
            totDamagePcs: dmgPcs,
            pendingSaree: Math.max(0, (pichliSaree + gayiQ) - (aayiQ + dmgPcs))
        };
    };

    const getJobWorkerOverallSummary = (workerId) => {
        if (!workerId) return { totGayi: 0, totAayi: 0, totDmg: 0, pendingSaree: 0 };
        const cleanId = String(workerId).trim();
        if (WORKER_SUMMARY_CACHE.has(cleanId)) return WORKER_SUMMARY_CACHE.get(cleanId);

        const sheets = getJobWorkerSheets(cleanId);
        if (!sheets.length) {
            const empty = { totGayi: 0, totAayi: 0, totDmg: 0, pendingSaree: 0 };
            WORKER_SUMMARY_CACHE.set(cleanId, empty);
            return empty;
        }

        let gTot = 0, aTot = 0, dTot = 0;
        sheets.forEach((sh) => {
            const c = calculateJobWorkSheetTotals(sh);
            gTot += c.totGayiQty;
            aTot += c.totAayiQty;
            dTot += c.totDamagePcs;
        });

        const lastSheetCalc = calculateJobWorkSheetTotals(sheets[sheets.length - 1]);
        const summary = { totGayi: gTot, totAayi: aTot, totDmg: dTot, pendingSaree: lastSheetCalc.pendingSaree };
        WORKER_SUMMARY_CACHE.set(cleanId, summary);
        return summary;
    };

    /* ========================================================================
       6. LIVE MAKER STOCK RESOLVER (EXACT JOBWORK-EXPRESS ENGINE)
       ======================================================================== */
    const getKarigerAvailableSareeStock = (karigerName) => {
        const kName = normText(karigerName);
        if (!kName) return { fresh: 0, cutting: 0, embroidery: 0, total: 0 };
        if (KARIGER_STOCK_CACHE.has(kName)) return KARIGER_STOCK_CACHE.get(kName);

        const sH = toArray(getFromStore('saree_history'));
        let fAai = 0, fGai = 0, cAai = 0, cGai = 0, eAai = 0, eGai = 0;

        for (let i = 0; i < sH.length; i++) {
            const r = sH[i];
            if (!r) continue;
            const rk = normText(r.karigerName || r.kariger);
            if (rk === kName) {
                const t = String(r.type || 'fresh').toLowerCase();
                const isGai = (r.isOut === true) || (safeNum(r.gai) > 0);
                const a = isGai ? 0 : safeNum(r.aai !== undefined && r.aai !== null ? r.aai : r.pcs);
                const g = isGai ? safeNum(r.gai !== undefined && r.gai !== null ? r.gai : r.pcs) : 0;

                if (t === 'fresh') { fAai += a; fGai += g; }
                else if (t === 'cutting' || t === 'cut') { cAai += a; cGai += g; }
                else if (t === 'embroidery' || t === 'emb') { eAai += a; eGai += g; }
            }
        }

        const fBacha = Math.max(0, fAai - fGai);
        const cBacha = Math.max(0, cAai - cGai);
        const eBacha = Math.max(0, eAai - eGai);
        const stock = { fresh: fBacha, cutting: cBacha, embroidery: eBacha, total: fBacha + cBacha + eBacha };
        KARIGER_STOCK_CACHE.set(kName, stock);
        return stock;
    };

    const getActiveWorkerType = () => {
        const w = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        return String(w?.type || window.currentJobWorkMode || 'cutting').toLowerCase();
    };

    const getSheetLookupStage = () => {
        const wType = getActiveWorkerType();
        if (wType === 'cutting') return 'fresh';
        if (wType === 'embroidery') return (shMovementType === 'gayi') ? shStockSource : (shStockSource || 'fresh');
        if (wType === 'calender') return (shMovementType === 'gayi') ? shStockSource : (shStockSource || 'cutting');
        return 'fresh';
    };

    const resolveMakerLiveStockInfo = (makerName, targetStage) => {
        const cleanM = normText(makerName);
        if (!cleanM) return null;

        const sH = toArray(getFromStore('saree_history'));
        const targetKid = getEffectiveGodown();
        const map = new Map();

        sH.forEach((h) => {
            if (!h || String(h.type || '').toLowerCase() !== targetStage) return;
            const hKid = normGodownId(h.karkhanaId);
            if (targetKid !== 'all' && hKid !== targetKid) return;
            if (normText(h.karigerName || h.kariger) !== cleanM) return;

            const sName = normText(h.sareeName || h.name, 'GENERAL SAREE');
            const isGai = (h.isOut === true) || (safeNum(h.gai) > 0);
            const inQ = isGai ? 0 : safeNum(h.aai !== undefined ? h.aai : h.pcs);
            const outQ = isGai ? safeNum(h.gai !== undefined ? h.gai : h.pcs) : 0;
            map.set(sName, (map.get(sName) || 0) + (inQ - outQ));
        });

        let bestMatch = null;
        let maxBachi = -1;
        map.forEach((bachi, sName) => {
            if (bachi > maxBachi) {
                maxBachi = bachi;
                bestMatch = { maker: cleanM, saree: sName, bachi: Math.max(0, bachi), godown: targetKid };
            }
        });

        if (bestMatch && bestMatch.bachi > 0) return bestMatch;

        const allKars = toArray(getFromStore('kariger_list'));
        const found = allKars.find((k) => k?.name && normText(k.name) === cleanM);
        return {
            maker: cleanM,
            saree: normText(found?.saree, 'GENERAL SAREE'),
            bachi: Math.max(0, maxBachi),
            godown: found?.karkhanaId || targetKid
        };
    };

    const getAvailableMakersForSheet = (queryText = '') => {
        const q = String(queryText || '').trim().toLowerCase();
        const sH = toArray(getFromStore('saree_history'));
        const allKars = toArray(getFromStore('kariger_list'));
        const targetKid = getEffectiveGodown();
        const targetStage = getSheetLookupStage();

        const stockMap = new Map();
        sH.forEach((h) => {
            if (!h || String(h.type || '').toLowerCase() !== targetStage) return;
            const kid = normGodownId(h.karkhanaId);
            if (targetKid !== 'all' && kid !== targetKid) return;

            const sName = normText(h.sareeName || h.name, 'GENERAL SAREE');
            const kName = normText(h.karigerName || h.kariger, 'KARKHANA');
            const key = `${kName}___${sName}`;

            const isGai = (h.isOut === true) || (safeNum(h.gai) > 0);
            const inQ = isGai ? 0 : safeNum(h.aai !== undefined ? h.aai : h.pcs);
            const outQ = isGai ? safeNum(h.gai !== undefined ? h.gai : h.pcs) : 0;

            if (!stockMap.has(key)) stockMap.set(key, { kName, sName, bachi: 0 });
            stockMap.get(key).bachi += (inQ - outQ);
        });

        const results = [];
        const addedNames = new Set();

        stockMap.forEach((val) => {
            if (val.bachi > 0) {
                addedNames.add(val.kName);
                const full = `${val.kName} ${val.sName}`.toLowerCase();
                if (!q || full.includes(q)) {
                    results.push({ label: val.kName, sub: `${val.sName} (${val.bachi} Pcs)`, data: val.kName });
                }
            }
        });

        allKars.forEach((k) => {
            if (!k || !k.name) return;
            const kn = normText(k.name);
            if (!addedNames.has(kn)) {
                addedNames.add(kn);
                const sNm = k.saree || 'Saree';
                const full = `${kn} ${sNm}`.toLowerCase();
                if (!q || full.includes(q)) {
                    results.push({ label: kn, sub: sNm, data: kn });
                }
            }
        });

        return results;
    };

    const updateSheetMakerStockHint = () => {
        const hint = document.getElementById('jw-sh-live-stock-hint');
        const mInp = document.getElementById('jw-sh-maker-input');
        if (!hint) return;

        const val = normText(mInp?.value);
        if (!val) {
            hint.textContent = '';
            return;
        }
        const stage = getSheetLookupStage();
        const info = resolveMakerLiveStockInfo(val, stage);
        hint.textContent = info ? `${stage.toUpperCase()} Stock: ${info.bachi} Pcs [${info.saree}]` : '';
    };

    const updateJwKarigerLiveStockBadge = () => updateSheetMakerStockHint();

    /* ========================================================================
       7. SHEET VIEW & EXACT JOBWORK-EXPRESS RIGHT-PANE PICKER
       ======================================================================== */
    const getSourceDisplayName = (src) => {
        if (src === 'cutting') return 'Cutting Stock';
        if (src === 'embroidery') return 'Embroidery Stock';
        return 'Fresh Godown Stock';
    };

    const updateSheetVoucherControls = () => {
        const wType = getActiveWorkerType();
        const movInp = document.getElementById('jw-sh-movement-input');
        const srcRow = document.getElementById('jw-sh-source-row');
        const srcInp = document.getElementById('jw-sh-source-input');
        const srcLocked = document.getElementById('jw-sh-source-locked');
        const naapBox = document.getElementById('jw-sh-naap-container');

        if (movInp) {
            movInp.value = (shMovementType === 'gayi') ? 'Saree Gayi (Bheja)' : 'Wapas Aayi (Tayyar)';
        }
        if (naapBox) {
            naapBox.style.display = (wType === 'embroidery') ? 'block' : 'none';
        }
        if (srcRow && srcInp && srcLocked) {
            if (shMovementType !== 'gayi') {
                srcRow.style.display = 'none';
            } else if (wType === 'cutting') {
                srcRow.style.display = 'grid';
                srcInp.style.display = 'none';
                srcLocked.style.display = 'block';
                srcLocked.textContent = 'Fresh Godown Stock [Locked]';
                shStockSource = 'fresh';
            } else {
                srcRow.style.display = 'grid';
                srcLocked.style.display = 'none';
                srcInp.style.display = 'block';
                if (wType === 'embroidery' && !['fresh', 'cutting'].includes(shStockSource)) shStockSource = 'fresh';
                if (wType === 'calender' && !['cutting', 'embroidery', 'fresh'].includes(shStockSource)) shStockSource = 'cutting';
                srcInp.value = getSourceDisplayName(shStockSource);
            }
        }
    };

    const showSheetRightPicker = (mode, queryText = '') => {
        shPickerMode = mode;
        const pickerEl = document.getElementById('jw-sh-right-picker');
        const titleEl = document.getElementById('jw-sh-right-title');
        const hintEl = document.getElementById('jw-sh-right-hint');
        if (!pickerEl) return;

        const wType = getActiveWorkerType();
        shPickerItems = [];

        if (mode === 'movement') {
            if (titleEl) titleEl.textContent = 'Select Len-Den (Movement)';
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            shPickerItems = [
                { label: 'Saree Gayi (Bheja)', sub: 'Outward', data: 'gayi' },
                { label: 'Wapas Aayi (Tayyar)', sub: 'Inward', data: 'aayi' }
            ];
            shPickerActiveIdx = shPickerItems.findIndex((x) => x.data === shMovementType);
            if (shPickerActiveIdx < 0) shPickerActiveIdx = 0;
        } else if (mode === 'source') {
            if (titleEl) titleEl.textContent = 'Select Stock Source';
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            if (wType === 'embroidery') {
                shPickerItems = [
                    { label: 'Fresh Godown Stock', sub: 'Fresh', data: 'fresh' },
                    { label: 'Cutting Stock', sub: 'Cutting', data: 'cutting' }
                ];
            } else {
                shPickerItems = [
                    { label: 'Cutting Stock', sub: 'Cutting', data: 'cutting' },
                    { label: 'Embroidery Stock', sub: 'Embroidery', data: 'embroidery' },
                    { label: 'Fresh Godown Stock', sub: 'Fresh', data: 'fresh' }
                ];
            }
            shPickerActiveIdx = shPickerItems.findIndex((x) => x.data === shStockSource);
            if (shPickerActiveIdx < 0) shPickerActiveIdx = 0;
        } else if (mode === 'maker') {
            const effStage = getSheetLookupStage();
            if (titleEl) titleEl.textContent = `List of Makers (${effStage.toUpperCase()} Stock)`;
            if (hintEl) hintEl.textContent = shBatchItems.length > 0 ? 'Khali Enter = Batch Poora' : '↑↓ + Enter';
            shPickerItems = getAvailableMakersForSheet(queryText);
            if (shPickerActiveIdx >= shPickerItems.length || shPickerActiveIdx < 0) shPickerActiveIdx = 0;
        } else {
            if (titleEl) titleEl.textContent = 'Active Sheet Context';
            if (hintEl) hintEl.textContent = 'Live Info';
            const w = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
            pickerEl.innerHTML = `
                <div style="padding:12px 14px; font-size:12.5px; line-height:1.7;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f3f4f6; padding-bottom:4px; margin-bottom:4px;">
                        <span style="color:#6b7280;">Kariger:</span> <strong style="color:#b47d00;">${esc(w?.name || '-')}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f3f4f6; padding-bottom:4px; margin-bottom:4px;">
                        <span style="color:#6b7280;">Len-Den:</span> <strong>${shMovementType === 'gayi' ? 'Saree Gayi (Bheja)' : 'Wapas Aayi (Tayyar)'}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#6b7280;">Source:</span> <strong>${esc(getSourceDisplayName(shStockSource))}</strong>
                    </div>
                </div>`;
            return;
        }

        renderSheetRightPickerList();
    };

    const renderSheetRightPickerList = () => {
        const pickerEl = document.getElementById('jw-sh-right-picker');
        if (!pickerEl) return;

        if (!shPickerItems.length) {
            pickerEl.innerHTML = '<div style="padding:18px 12px; text-align:center; color:#6b7280; font-size:12px;">Koi matching maker nahi mila.</div>';
            return;
        }

        let html = '';
        shPickerItems.forEach((item, idx) => {
            const cls = idx === shPickerActiveIdx ? 'jw-picker-item active' : 'jw-picker-item';
            html += `<div class="${cls}" onmousedown="event.preventDefault(); JobWorkEngine.pickSheetItem(${idx})">
                <span>${esc(item.label)}</span>
                <span class="jw-picker-sub">${esc(item.sub)}</span>
            </div>`;
        });
        pickerEl.innerHTML = html;

        const activeEl = pickerEl.querySelector('.jw-picker-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const confirmClearSheetBatchIfNeeded = (label) => {
        if (!shBatchItems.length) return true;
        const ok = confirm(`Batch list me ${shBatchItems.length} item pehle se jode hue hain.\n${label} badalne par purani list clear ho jayegi.\n\nAage badhein?`);
        if (ok) {
            shBatchItems = [];
            renderSheetBatchGrid();
        }
        return ok;
    };

    const pickSheetItem = (idx) => {
        const item = shPickerItems[idx];
        if (!item) return;

        if (shPickerMode === 'movement') {
            if (item.data !== shMovementType) {
                if (!confirmClearSheetBatchIfNeeded('Len-Den (Gayi/Aayi)')) return;
                shMovementType = item.data;
                updateSheetVoucherControls();
                updateSheetMakerStockHint();
            }
            const wType = getActiveWorkerType();
            if (shMovementType === 'gayi' && (wType === 'embroidery' || wType === 'calender')) {
                focusSheetField('jw-sh-source-input');
            } else {
                focusSheetField('jw-sh-date');
            }
        } else if (shPickerMode === 'source') {
            if (item.data !== shStockSource) {
                if (!confirmClearSheetBatchIfNeeded('Stock Source')) return;
                shStockSource = item.data;
                updateSheetVoucherControls();
                updateSheetMakerStockHint();
            }
            focusSheetField('jw-sh-date');
        } else if (shPickerMode === 'maker') {
            const mInp = document.getElementById('jw-sh-maker-input');
            if (mInp) mInp.value = item.data;
            updateSheetMakerStockHint();
            if (getActiveWorkerType() === 'embroidery') focusSheetField('jw-sh-naap-input');
            else focusSheetField('jw-sh-qty-input');
        }
    };

    const focusSheetField = (id) => {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (el && el.offsetParent !== null) {
                el.focus();
                if (typeof el.select === 'function' && !el.readOnly) el.select();
            }
        }, 35);
    };

    const openJobWorkerSheet = (workerId) => {
        const w = getJobWorkers().find((x) => String(x.id) === String(workerId));
        if (!w) return alert('Kariger nahi mila!');

        armEnterGuard();
        window.activeJobWorkerId = w.id;
        window.activeCuttingWorkerId = w.id;
        window.activeCalenderWorkerId = w.id;
        window.activeEmbroideryWorkerId = w.id;

        const wType = String(w.type || '').toLowerCase();
        window.currentJobWorkMode = wType || 'cutting';

        let typeTitle = 'Booti Cutting';
        if (wType === 'calender') typeTitle = 'Calender';
        else if (wType === 'embroidery') typeTitle = 'Embroidery';

        const sess = (typeof window.getActiveFinancialSession === 'function')
            ? window.getActiveFinancialSession()
            : '2026-2027';

        setText('jw-sheet-banner-name', `${w.name} (${typeTitle} • ${sess} Khata)`);
        setText('jw-header-context-lbl', `${w.name} • ${typeTitle}`);

        shMovementType = 'gayi';
        shStockSource = (wType === 'calender') ? 'cutting' : 'fresh';
        shBatchItems = [];
        window.currentDiyaBatch = [];
        window.currentAayiBatch = [];
        shInlineEditItemIdx = null;
        window.activeBatchModalInfo = null;
        setDisplay('jw-inline-batch-panel', 'none');
        setDisplay('jw-sh-accept-strip', 'none');

        const dToday = getTodayIso();
        const shDate = document.getElementById('jw-sh-date');
        if (shDate) shDate.value = dToday;

        const mInp = document.getElementById('jw-sh-maker-input');
        if (mInp) mInp.value = '';
        const qInp = document.getElementById('jw-sh-qty-input');
        if (qInp) qInp.value = '';
        const nInp = document.getElementById('jw-sh-naap-input');
        if (nInp) nInp.value = shLastNaap;

        setDisplay('jw-hub-view', 'none');
        setDisplay('jw-workers-view', 'none');
        setDisplay('jw-dukan-view', 'none');
        setDisplay('jw-billing-view', 'none');
        setDisplay('jw-movement-view', 'none');
        setDisplay('jw-sheet-view', 'block');

        let sheets = getJobWorkerSheets(window.activeJobWorkerId);
        if (!sheets.length) {
            sheets = [{
                id: `jw_sh_${Date.now()}`,
                title: `Month 1 (${dToday.substring(0, 7)})`,
                closingPendingSaree: 0,
                closingBakiAmt: 0,
                rows: []
            }];
            saveJobWorkerSheets(window.activeJobWorkerId, sheets);
        }

        window.activeJobSheetId = sheets[sheets.length - 1].id;
        updateSheetVoucherControls();
        renderSheetBatchGrid();
        renderJobWorkSheetTabs();
        loadCurrentJobWorkSheet();
        showSheetRightPicker('maker', '');
        focusSheetField('jw-sh-maker-input');
    };

    const closeJobWorkerSheet = () => {
        window.activeJobWorkerId = null;
        window.activeJobSheetId = null;
        shBatchItems = [];
        window.currentDiyaBatch = [];
        window.currentAayiBatch = [];
        window.activeBatchModalInfo = null;
        armEnterGuard();

        setDisplay('jw-inline-batch-panel', 'none');
        setDisplay('jw-sheet-view', 'none');
        setDisplay('jw-workers-view', 'block');
        renderJobWorkWorkersTable();
        updateJobWorkHubBadges();
    };

    const renderJobWorkSheetTabs = () => {
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const box = document.getElementById('jw-month-tabs-container');
        if (!box) return;

        box.innerHTML = '';
        sheets.forEach((sh) => {
            if (!sh) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `sheet-tab ${String(sh.id) === String(window.activeJobSheetId) ? 'active' : ''}`;
            btn.innerHTML = `${esc(sh.title)}${sheets.length > 1 ? `<span class="del-tab-btn" onclick="JobWorkEngine.deleteJobWorkerMonthlySheet('${esc(sh.id)}', event)"> &times;</span>` : ''}`;
            btn.onclick = () => switchJobWorkerSheetTab(sh.id);
            box.appendChild(btn);
        });
    };

    const switchJobWorkerSheetTab = (id) => {
        window.activeJobSheetId = id;
        setDisplay('jw-inline-batch-panel', 'none');
        window.activeBatchModalInfo = null;
        renderJobWorkSheetTabs();
        loadCurrentJobWorkSheet();
    };

    const addNewJobWorkerMonthlySheet = () => {
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const cur = sheets.find((s) => s && String(s.id) === String(window.activeJobSheetId)) || sheets[sheets.length - 1];
        const calc = cur ? calculateJobWorkSheetTotals(cur) : { pendingSaree: 0 };

        const newS = {
            id: `jw_sh_${Date.now()}`,
            title: `Month ${sheets.length + 1} (${getTodayIso().substring(0, 7)})`,
            closingPendingSaree: calc.pendingSaree,
            closingBakiAmt: 0,
            rows: []
        };

        sheets.push(newS);
        saveJobWorkerSheets(window.activeJobWorkerId, sheets);
        window.activeJobSheetId = newS.id;
        renderJobWorkSheetTabs();
        loadCurrentJobWorkSheet();
    };

    const deleteJobWorkerMonthlySheet = (sheetId, e) => {
        if (e) e.stopPropagation();
        let sheets = getJobWorkerSheets(window.activeJobWorkerId);
        if (sheets.length <= 1) return alert('Pehli sheet delete nahi ho sakti!');
        if (!confirm('Kya is Mahine ki Sheet ko delete karna chahte hain?')) return;

        sheets = sheets.filter((s) => s && String(s.id) !== String(sheetId));
        saveJobWorkerSheets(window.activeJobWorkerId, sheets);
        window.activeJobSheetId = sheets[0].id;
        renderJobWorkSheetTabs();
        loadCurrentJobWorkSheet();
    };

    const loadCurrentJobWorkSheet = () => {
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeJobSheetId)) || sheets[0];
        if (!sh) return;

        window.activeJobSheetId = sh.id;
        setText('jw-sheet-active-badge', sh.title);

        const elPichliSaree = document.getElementById('jw-top-pichli-saree');
        if (elPichliSaree) elPichliSaree.value = sh.closingPendingSaree || 0;

        renderJobWorkSheetTable(sh);
    };

    const saveJobWorkSheetConfig = () => {
        if (!window.activeJobWorkerId) return;
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeJobSheetId));
        if (!sh) return;

        sh.closingPendingSaree = safeInt(document.getElementById('jw-top-pichli-saree')?.value);
        saveJobWorkerSheets(window.activeJobWorkerId, sheets);
        renderJobWorkSheetTable(sh);
    };

    const populateKarigersDatalist = () => {
        const dl = document.getElementById('dl-karigers-list');
        if (!dl) return;
        dl.innerHTML = '';
        toArray(getFromStore('kariger_list')).forEach((k) => {
            if (k?.name) {
                const opt = document.createElement('option');
                opt.value = k.name;
                dl.appendChild(opt);
            }
        });
    };

    /* ========================================================================
       8. SHEET BATCH ROW BUILDER & GATTHI LIST
       ======================================================================== */
    const addSheetBatchRow = () => {
        const mInp = document.getElementById('jw-sh-maker-input');
        const nInp = document.getElementById('jw-sh-naap-input');
        const qInp = document.getElementById('jw-sh-qty-input');

        const wType = getActiveWorkerType();
        const makerName = normText(mInp?.value);
        const naap = (wType === 'embroidery' && nInp) ? (nInp.value.trim() || '3.60') : '';
        const qty = safeInt(qInp?.value);

        if (!makerName) {
            alert('Maker (Bunne Wala) ka naam chunein!');
            mInp?.focus();
            return;
        }
        if (qty <= 0) {
            alert('Sahi Saree Qty (Pcs) bharein!');
            qInp?.focus();
            return;
        }

        if (naap) shLastNaap = naap;

        const stage = getSheetLookupStage();
        const info = resolveMakerLiveStockInfo(makerName, stage);
        shBatchItems.push({
            id: `sh_it_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            maker: makerName,
            saree: info?.saree || 'GENERAL SAREE',
            naap: naap,
            qty: qty,
            source: (shMovementType === 'gayi') ? stage : undefined
        });

        renderSheetBatchGrid();
        if (mInp) mInp.value = '';
        if (qInp) qInp.value = '';
        updateSheetMakerStockHint();
        showSheetRightPicker('maker', '');
        focusSheetField('jw-sh-maker-input');
    };

    const removeSheetBatchItem = (idx) => {
        shBatchItems.splice(idx, 1);
        renderSheetBatchGrid();
    };

    const renderSheetBatchGrid = () => {
        const tbody = document.getElementById('jw-sh-batch-body');
        const totalDisp = document.getElementById('jw-sh-live-batch-total');
        const summaryDisp = document.getElementById('jw-sh-live-batch-summary');
        const badge = document.getElementById('jw-sh-batch-count-badge');
        if (!tbody) return;

        if (!shBatchItems.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:14px; color:#6b7280;">Gatthi khali hai. Upar Maker chunein aur Qty daalein.</td></tr>';
            if (totalDisp) totalDisp.textContent = '0 Pcs';
            if (summaryDisp) summaryDisp.textContent = 'Batch khali hai';
            if (badge) badge.textContent = '0 Items';
            return;
        }

        let total = 0;
        let html = '';
        shBatchItems.forEach((it, idx) => {
            total += it.qty;
            html += `<tr>
                <td>${idx + 1}</td>
                <td><strong>${esc(it.maker)}</strong></td>
                <td>${esc(it.saree)}</td>
                <td style="text-align:center; color:#b47d00; font-weight:700;">${it.naap ? esc(it.naap) : '-'}</td>
                <td style="text-align:right; font-weight:800;">${it.qty} Pcs</td>
                <td style="text-align:center;">
                    <button type="button" tabindex="-1" class="jw-btn-del" onclick="JobWorkEngine.removeSheetBatchItem(${idx})">&times;</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if (totalDisp) totalDisp.textContent = `${total} Pcs`;
        if (summaryDisp) summaryDisp.textContent = `Kul ${shBatchItems.length} Karigaron ki gatthi (${shMovementType === 'gayi' ? 'Gayi' : 'Wapas Aayi'})`;
        if (badge) badge.textContent = `${shBatchItems.length} Items`;
    };

    const showSheetAcceptPrompt = (show) => {
        const bar = document.getElementById('jw-sh-accept-strip');
        if (!bar) return;
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            setTimeout(() => {
                document.getElementById('jw-sh-accept-yes')?.focus();
            }, 30);
        }
    };

    const cancelSheetAccept = () => {
        showSheetAcceptPrompt(false);
        focusSheetField('jw-sh-maker-input');
    };

    /* ========================================================================
       9. ATOMIC SHEET BATCH SAVE & SAREE_HISTORY RECONCILIATION
       ======================================================================== */
    const rebuildSareeHistoryForBatchRow = (sHList, worker, rowObj) => {
        const refId = String(rowObj.id);
        let filtered = sHList.filter((h) => !h || String(h.refId) !== refId);

        const workerName = worker ? worker.name : 'Worker';
        const wType = String(worker?.type || 'cutting').toLowerCase();
        let processLabel = 'Cutting';
        if (wType === 'calender') processLabel = 'Calender';
        else if (wType === 'embroidery') processLabel = 'Embroidery';
        const targetLabel = `${workerName} (${processLabel})`;

        const allKars = toArray(getFromStore('kariger_list'));
        const resolveMeta = (wKarName) => {
            for (let i = filtered.length - 1; i >= 0; i--) {
                const h = filtered[i];
                if (h && normText(h.karigerName || h.kariger) === wKarName && h.sareeName) {
                    return { saree: normText(h.sareeName), godown: h.karkhanaId || getEffectiveGodown() };
                }
            }
            const foundKar = allKars.find((k) => k?.name && normText(k.name) === wKarName);
            return {
                saree: normText(foundKar?.saree, 'GENERAL SAREE'),
                godown: foundKar?.karkhanaId || getEffectiveGodown()
            };
        };

        const d = toIsoDate(rowObj.date) || getTodayIso();

        toArray(rowObj.gayiItems).forEach((item, idx) => {
            const wKarName = normText(item.karigar || item.maker, 'GENERAL');
            const meta = resolveMeta(wKarName);
            const fallbackSource = (wType === 'calender') ? 'cutting' : 'fresh';
            const itemSource = item.source || rowObj.stockSource || fallbackSource;

            filtered.push({
                id: `sh_diya_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                refId: refId,
                date: d,
                sareeName: meta.saree,
                karigerName: wKarName,
                kariger: wKarName,
                partyName: targetLabel,
                targetWorker: targetLabel,
                karkhanaId: meta.godown,
                type: itemSource,
                typeLabel: `📤 ${targetLabel} ko bheja [${itemSource.toUpperCase()} Stock]`,
                aai: 0,
                gai: safeNum(item.qty),
                isOut: true,
                note: `${targetLabel} ko bheja (${itemSource})`,
                timestamp: Date.now() + idx
            });
        });

        toArray(rowObj.aayiItems).forEach((item, idx) => {
            const wKarName = normText(item.karigar || item.maker, 'GENERAL');
            const meta = resolveMeta(wKarName);
            let destTab = 'cutting';
            let icon = '✂️';
            if (wType === 'embroidery') { destTab = 'embroidery'; icon = '🪡'; }
            else if (wType === 'calender') { destTab = 'finished'; icon = '✨'; }

            filtered.push({
                id: `sh_aayi_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                refId: refId,
                date: d,
                sareeName: meta.saree,
                karigerName: wKarName,
                kariger: wKarName,
                partyName: targetLabel,
                targetWorker: targetLabel,
                karkhanaId: meta.godown,
                type: destTab,
                typeLabel: `${icon} ${targetLabel} se Tayyar Aayi${item.naap ? ` [Naap: ${item.naap}]` : ''}`,
                aai: safeNum(item.qty),
                gai: 0,
                isOut: false,
                note: `${targetLabel} se tayyar aayi${item.naap ? ` (Naap: ${item.naap})` : ''}`,
                naap: item.naap || '',
                timestamp: Date.now() + 100 + idx
            });
        });

        if (safeInt(rowObj.damagePcs) > 0) {
            filtered.push({
                id: `sh_dmg_${Date.now()}`,
                refId: refId,
                date: d,
                sareeName: 'Damage Saree',
                karigerName: workerName,
                kariger: workerName,
                partyName: targetLabel,
                targetWorker: targetLabel,
                karkhanaId: getEffectiveGodown(),
                type: 'lott',
                typeLabel: `⚠️ ${targetLabel} se Damage Aayi (Fine: ₹${safeNum(rowObj.damageAmt)})`,
                aai: safeInt(rowObj.damagePcs),
                gai: 0,
                isOut: false,
                note: `Damage Fine: ₹${safeNum(rowObj.damageAmt)}`,
                timestamp: Date.now() + 200
            });
        }

        return filtered;
    };

    const saveJobWorkBatchLine = (doPrint = false) => {
        showSheetAcceptPrompt(false);
        if (!window.activeJobWorkerId) return;

        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeJobSheetId));
        if (!sh) return;

        const worker = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        const wType = String(worker?.type || 'cutting').toLowerCase();

        const damagePcs = safeInt(document.getElementById('jw-form-damage-pcs')?.value);
        const damageAmt = safeNum(document.getElementById('jw-form-damage-amt')?.value);

        if (!shBatchItems.length && damagePcs === 0) {
            alert('Kam se kam 1 Maker ki Saree batch me jodein!');
            focusSheetField('jw-sh-maker-input');
            return;
        }

        const dDate = toIsoDate(document.getElementById('jw-sh-date')?.value) || getTodayIso();
        const isGayi = (shMovementType === 'gayi');
        const effSource = (wType === 'cutting') ? 'fresh' : shStockSource;

        let totQty = 0;
        const formattedItems = shBatchItems.map((it) => {
            totQty += safeInt(it.qty);
            return {
                id: it.id,
                karigar: it.maker,
                qty: safeInt(it.qty),
                naap: it.naap || '',
                source: isGayi ? (it.source || effSource) : undefined
            };
        });

        const newRow = {
            id: `jwb_${Date.now()}`,
            date: dDate,
            gayiQty: isGayi ? totQty : 0,
            gayiItems: isGayi ? formattedItems : [],
            stockSource: isGayi ? effSource : 'fresh',
            aayiQty: isGayi ? 0 : totQty,
            aayiItems: isGayi ? [] : formattedItems,
            damagePcs,
            damageAmt
        };

        let sH = [...toArray(getFromStore('saree_history'))];
        sH = rebuildSareeHistoryForBatchRow(sH, worker, newRow);
        setToStore('saree_history', sH);

        sh.rows = toArray(sh.rows);
        sh.rows.push(newRow);
        saveJobWorkerSheets(window.activeJobWorkerId, sheets);

        shLastSavedChallan = {
            category: wType.toUpperCase(),
            worker: worker ? worker.name : 'Worker',
            date: dDate,
            isGayi,
            source: effSource,
            items: shBatchItems.map((x) => ({ ...x })),
            damagePcs
        };

        shBatchItems = [];
        renderSheetBatchGrid();
        const dmgPcsEl = document.getElementById('jw-form-damage-pcs');
        const dmgAmtEl = document.getElementById('jw-form-damage-amt');
        if (dmgPcsEl) dmgPcsEl.value = '';
        if (dmgAmtEl) dmgAmtEl.value = '';

        invalidateJobWorkCache(window.activeJobWorkerId);
        renderJobWorkSheetTable(sh);
        updateJobWorkHubBadges();
        if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();

        if (doPrint) printChallanObject(shLastSavedChallan);

        showSheetRightPicker('maker', '');
        focusSheetField('jw-sh-maker-input');
    };

    // Legacy compatibility wrappers
    const addDiyaBatchKarigarItem = () => addSheetBatchRow();
    const removeDiyaBatchItem = (idx) => removeSheetBatchItem(idx);
    const renderDiyaBatchChips = () => renderSheetBatchGrid();
    const addAayiBatchKarigarItem = () => addSheetBatchRow();
    const removeAayiBatchItem = (idx) => removeSheetBatchItem(idx);
    const renderAayiBatchChips = () => renderSheetBatchGrid();

    /* ========================================================================
       10. MONTHLY REGISTER TABLE & INLINE BATCH BREAKDOWN DRAWER
       ======================================================================== */
    const renderJobWorkSheetTable = (sh) => {
        const tbody = document.getElementById('jw-sheet-rows-body');
        if (!tbody) return;

        const rows = toArray(sh?.rows);

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:16px; color:#6b7280;">Is Mahine me abhi koi entry nahi hui hai.</td></tr>';
        } else {
            let html = '';
            rows.forEach((r, idx) => {
                if (!r) return;
                const activeCls = (window.activeBatchModalInfo && String(window.activeBatchModalInfo.rowId) === String(r.id))
                    ? 'jw-row-active' : '';
                const gCount = r.gayiItems ? r.gayiItems.length : (r.gayiQty > 0 ? 1 : 0);
                const aCount = r.aayiItems ? r.aayiItems.length : (r.aayiQty > 0 ? 1 : 0);

                html += `<tr class="jw-nav-row ${activeCls}" onclick="JobWorkEngine.openInlineBatchDrawer('${esc(sh.id)}', '${esc(r.id)}', ${idx})">
                    <td>${formatDisplay(r.date)}</td>
                    <td>${r.gayiQty > 0 ? `<strong>-${r.gayiQty} Pcs</strong> <small style="color:#6b7280;">(${gCount})</small>` : '-'}</td>
                    <td>${r.aayiQty > 0 ? `<strong style="color:#b47d00;">+${r.aayiQty} Pcs</strong> <small style="color:#6b7280;">(${aCount})</small>` : '-'}</td>
                    <td>${r.damagePcs > 0 ? `${r.damagePcs} Pcs` : '-'}</td>
                    <td>${r.damageAmt > 0 ? `₹ ${safeNum(r.damageAmt).toFixed(2)}` : '-'}</td>
                    <td style="text-align:right;"><span class="jw-open-ind">Detail &rarr;</span></td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        const c = calculateJobWorkSheetTotals(sh);
        setText('jw-card-total-gayi', `${c.totGayiQty} Pcs`);
        setText('jw-card-total-aayi', `${c.totAayiQty} Pcs`);
        setText('jw-card-total-lott', `${c.totDamagePcs} Pcs`);
        setText('jw-calc-baki-saree-display', `${c.pendingSaree} Pcs Baki`);
    };

    const openInlineBatchDrawer = (sheetId, rowId, rowIdx) => {
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(sheetId));
        const r = sh ? toArray(sh.rows).find((x) => x && String(x.id) === String(rowId)) : null;
        if (!sh || !r) return;

        const defaultType = (safeNum(r.gayiQty) > 0) ? 'gayi' : 'aayi';
        window.activeBatchModalInfo = { sheetId, rowId, type: defaultType, rowIdx };
        shInlineEditItemIdx = null;
        renderJobWorkSheetTable(sh);
        renderInlineBatchDrawer();
    };

    const closeInlineBatchDrawer = () => {
        window.activeBatchModalInfo = null;
        shInlineEditItemIdx = null;
        setDisplay('jw-inline-batch-panel', 'none');
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeJobSheetId));
        if (sh) renderJobWorkSheetTable(sh);
    };

    const switchInlineDrawerType = (type) => {
        if (!window.activeBatchModalInfo) return;
        window.activeBatchModalInfo.type = type;
        shInlineEditItemIdx = null;
        renderInlineBatchDrawer();
    };

    const renderInlineBatchDrawer = () => {
        const panel = document.getElementById('jw-inline-batch-panel');
        if (!panel || !window.activeBatchModalInfo) return;

        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeBatchModalInfo.sheetId));
        const rowIdx = toArray(sh?.rows).findIndex((x) => x && String(x.id) === String(window.activeBatchModalInfo.rowId));
        const r = rowIdx >= 0 ? sh.rows[rowIdx] : null;
        if (!sh || !r) {
            closeInlineBatchDrawer();
            return;
        }

        const isGayi = (window.activeBatchModalInfo.type === 'gayi');
        const items = isGayi ? toArray(r.gayiItems) : toArray(r.aayiItems);

        let rowsHtml = '';
        let tot = 0;
        if (!items.length) {
            rowsHtml = '<tr><td colspan="5" style="text-align:center; padding:12px; color:#6b7280;">Is category me koi item nahi hai.</td></tr>';
        } else {
            items.forEach((it, idx) => {
                const qty = safeNum(it.qty);
                tot += qty;
                const karName = it.karigar || it.maker || '-';

                if (shInlineEditItemIdx === idx) {
                    rowsHtml += `<tr style="background:#fdf6e2;">
                        <td>${idx + 1}</td>
                        <td><input type="text" id="jw-inl-edit-kar" value="${esc(karName)}" class="jw-inp" style="padding:4px 8px;"></td>
                        <td>${isGayi ? esc(it.source || r.stockSource || 'fresh').toUpperCase() : `<input type="text" id="jw-inl-edit-naap" value="${esc(it.naap || '')}" class="jw-inp" style="width:72px; padding:4px 6px;">`}</td>
                        <td><input type="number" id="jw-inl-edit-qty" value="${qty}" class="jw-inp jw-inp-num" style="width:80px; padding:4px 6px;"></td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button type="button" class="jw-btn-gold" style="padding:4px 10px; font-size:11.5px;" onclick="JobWorkEngine.saveInlineBatchItemEdit(${idx})">Save</button>
                            <button type="button" class="jw-btn-sec" style="padding:4px 8px; font-size:11.5px;" onclick="JobWorkEngine.cancelInlineBatchItemEdit()">Cancel</button>
                        </td>
                    </tr>`;
                } else {
                    const metaInfo = isGayi
                        ? esc((it.source || r.stockSource || 'fresh').toUpperCase())
                        : (it.naap ? `Naap: ${esc(it.naap)}` : '-');
                    rowsHtml += `<tr>
                        <td>${idx + 1}</td>
                        <td><strong>${esc(karName)}</strong></td>
                        <td style="color:#6b7280;">${metaInfo}</td>
                        <td style="font-weight:800;">${qty} Pcs</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button type="button" class="jw-btn-sec" style="padding:3px 9px; font-size:11px;" onclick="JobWorkEngine.startInlineBatchItemEdit(${idx})">Edit</button>
                            <button type="button" class="jw-btn-del" style="padding:3px 9px; font-size:11px;" onclick="JobWorkEngine.deleteJwBatchItem(${idx})">Del</button>
                        </td>
                    </tr>`;
                }
            });
        }

        const hasGayi = safeNum(r.gayiQty) > 0;
        const hasAayi = safeNum(r.aayiQty) > 0;

        panel.innerHTML = `
            <div class="jw-inline-head">
                <div>
                    <strong style="font-size:14px;">Batch Breakdown (${formatDisplay(r.date)})</strong>
                    <span style="margin-left:8px; font-size:12px; color:#b47d00; font-weight:700;">Kul: ${tot} Pcs</span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                    ${hasGayi ? `<button type="button" class="sheet-tab ${isGayi ? 'active' : ''}" onclick="JobWorkEngine.switchInlineDrawerType('gayi')">Gayi (${r.gayiQty})</button>` : ''}
                    ${hasAayi ? `<button type="button" class="sheet-tab ${!isGayi ? 'active' : ''}" onclick="JobWorkEngine.switchInlineDrawerType('aayi')">Aayi (${r.aayiQty})</button>` : ''}
                    <button type="button" class="jw-btn-sec" onclick="JobWorkEngine.printSavedBatchRow('${esc(sh.id)}', '${esc(r.id)}')">A6 Challan Print</button>
                    <button type="button" class="jw-btn-del" onclick="JobWorkEngine.deleteJobWorkBatchRow(${rowIdx})">Delete Full Row</button>
                    <button type="button" class="jw-btn-sec" onclick="JobWorkEngine.closeInlineBatchDrawer()">Close [Esc]</button>
                </div>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th style="width:40px;">#</th>
                            <th>Maker (Bunne Wala)</th>
                            <th>Source / Naap</th>
                            <th>Qty (Pcs)</th>
                            <th style="text-align:right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
        panel.style.display = 'block';
        panel.scrollIntoView({ block: 'nearest' });
    };

    const startInlineBatchItemEdit = (idx) => {
        shInlineEditItemIdx = idx;
        renderInlineBatchDrawer();
        setTimeout(() => {
            document.getElementById('jw-inl-edit-qty')?.focus();
        }, 30);
    };

    const cancelInlineBatchItemEdit = () => {
        shInlineEditItemIdx = null;
        renderInlineBatchDrawer();
    };

    const saveInlineBatchItemEdit = (itemIdx) => {
        if (!window.activeBatchModalInfo) return;
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeBatchModalInfo.sheetId));
        const r = sh ? toArray(sh.rows).find((x) => x && String(x.id) === String(window.activeBatchModalInfo.rowId)) : null;
        if (!sh || !r) return;

        const newKar = normText(document.getElementById('jw-inl-edit-kar')?.value);
        const newQty = safeInt(document.getElementById('jw-inl-edit-qty')?.value);
        const naapEl = document.getElementById('jw-inl-edit-naap');

        if (!newKar || newQty <= 0) {
            alert('Sahi Kariger naam aur Qty bharein!');
            return;
        }

        const isGayi = (window.activeBatchModalInfo.type === 'gayi');
        const items = isGayi ? toArray(r.gayiItems) : toArray(r.aayiItems);
        const it = items[itemIdx];
        if (!it) return;

        it.karigar = newKar;
        it.qty = newQty;
        if (!isGayi && naapEl) it.naap = String(naapEl.value || '').trim();

        let newTot = 0;
        items.forEach((x) => { newTot += safeNum(x.qty); });
        if (isGayi) r.gayiQty = newTot;
        else r.aayiQty = newTot;

        const worker = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        let sH = [...toArray(getFromStore('saree_history'))];
        sH = rebuildSareeHistoryForBatchRow(sH, worker, r);
        setToStore('saree_history', sH);

        saveJobWorkerSheets(window.activeJobWorkerId, sheets);
        shInlineEditItemIdx = null;
        renderInlineBatchDrawer();
        renderJobWorkSheetTable(sh);
        updateJobWorkHubBadges();
        if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
    };

    const deleteJobWorkBatchRow = (idx) => {
        if (!confirm('Kya is poori Batch Line ko delete karna chahte hain? Saree stock theek ho jayega.')) return;
        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeJobSheetId));
        if (!sh) return;

        const r = toArray(sh.rows)[idx];
        if (!r) return;

        if (r.id) {
            const sH = toArray(getFromStore('saree_history')).filter((h) => !h || String(h.refId) !== String(r.id));
            setToStore('saree_history', sH);
        }

        sh.rows.splice(idx, 1);
        saveJobWorkerSheets(window.activeJobWorkerId, sheets);
        closeInlineBatchDrawer();
        renderJobWorkSheetTable(sh);
        updateJobWorkHubBadges();

        if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
    };

    const deleteJwBatchItem = (itemIdx) => {
        if (!confirm('Kya is item ko delete karna chahte hain? Saree stock update ho jayega.')) return;
        if (!window.activeBatchModalInfo) return;

        const sheets = getJobWorkerSheets(window.activeJobWorkerId);
        const sh = sheets.find((s) => s && String(s.id) === String(window.activeBatchModalInfo.sheetId));
        const rowIdx = toArray(sh?.rows).findIndex((x) => x && String(x.id) === String(window.activeBatchModalInfo.rowId));
        const r = rowIdx >= 0 ? sh.rows[rowIdx] : null;
        if (!sh || !r) return;

        const isGayi = (window.activeBatchModalInfo.type === 'gayi');
        const items = isGayi ? toArray(r.gayiItems) : toArray(r.aayiItems);
        items.splice(itemIdx, 1);

        let newTot = 0;
        items.forEach((x) => { newTot += safeNum(x.qty); });
        if (isGayi) r.gayiQty = newTot;
        else r.aayiQty = newTot;

        const worker = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        let sH = [...toArray(getFromStore('saree_history'))];

        if (safeNum(r.gayiQty) === 0 && safeNum(r.aayiQty) === 0 && safeNum(r.damagePcs) === 0) {
            sH = sH.filter((h) => !h || String(h.refId) !== String(r.id));
            sh.rows.splice(rowIdx, 1);
            setToStore('saree_history', sH);
            saveJobWorkerSheets(window.activeJobWorkerId, sheets);
            closeInlineBatchDrawer();
        } else {
            sH = rebuildSareeHistoryForBatchRow(sH, worker, r);
            setToStore('saree_history', sH);
            saveJobWorkerSheets(window.activeJobWorkerId, sheets);
            renderInlineBatchDrawer();
        }

        renderJobWorkSheetTable(sh);
        updateJobWorkHubBadges();
        if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
    };

    const openJwBatchModal = (sheetId, rowId, type) => {
        window.activeBatchModalInfo = { sheetId, rowId, type };
        renderInlineBatchDrawer();
    };

    const closeJwBatchModal = () => {
        setDisplay('jw-batch-modal', 'none');
        closeInlineBatchDrawer();
    };

    const renderJwBatchModalTable = () => renderInlineBatchDrawer();
    const editJwBatchItem = (idx) => startInlineBatchItemEdit(idx);

    /* ========================================================================
       11. A6 THERMAL CHALLAN & SHEET REPORT PRINT
       ======================================================================== */
    const printChallanObject = (b) => {
        if (!b || !b.items || !b.items.length) return alert('Print karne ke liye batch item nahi mila!');

        let tot = 0;
        let rowsHtml = '';
        const hasNaap = b.items.some((x) => Boolean(x.naap));

        b.items.forEach((it, idx) => {
            const q = safeNum(it.qty);
            tot += q;
            rowsHtml += `<tr style="border-bottom:1px dashed #ccc;">
                <td style="padding:4px 2px;">${idx + 1}</td>
                <td style="padding:4px 2px; font-weight:bold;">${esc(it.maker || it.karigar)}</td>
                <td style="padding:4px 2px;">${esc(it.saree || '-')}</td>
                ${hasNaap ? `<td style="padding:4px 2px; text-align:center;">${esc(it.naap || '-')}</td>` : ''}
                <td style="padding:4px 2px; text-align:right; font-weight:bold;">${q}</td>
            </tr>`;
        });

        const titleText = b.isGayi ? 'JOB WORK DISPATCH (GAYI)' : 'JOB WORK RECEIPT (AAYI)';
        let processLabel = 'BOOTI CUTTING';
        if (b.category === 'CALENDER') processLabel = 'CALENDER FINISHING';
        else if (b.category === 'EMBROIDERY') processLabel = 'SAREE EMBROIDERY';

        const pw = window.open('', '', 'width=420,height=580');
        if (!pw) return alert('Popup block hai! Kripya allow karein.');

        pw.document.write(`<html><head><title>JobWork Challan - A6</title>
            <style>
                @page { size: A6 portrait; margin: 4mm; }
                body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                .ticket { width: 100%; max-width: 90mm; margin: 0 auto; border: 1.5px dashed #000; padding: 8px; box-sizing: border-box; }
                .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
                .header h2 { margin: 0; font-size: 14px; text-transform: uppercase; }
                .header p { margin: 2px 0 0; font-size: 10px; font-weight: bold; }
                .meta { font-size: 10px; margin-bottom: 6px; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; }
                th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 3px 2px; }
                .total-box { background: #eee; padding: 6px 4px; border: 1px solid #000; font-size: 13px; font-weight: 900; text-align: center; margin: 8px 0; }
                .signs { display: flex; justify-content: space-between; margin-top: 25px; font-size: 10px; }
            </style></head><body>
            <div class="ticket">
                <div class="header"><h2>SIMPLICITY ERP</h2><p>${titleText}</p></div>
                <div class="meta">
                    <div><strong>Party / Worker:</strong> ${esc(b.worker)} (${processLabel})</div>
                    <div><strong>Tarikh:</strong> ${formatDisplay(b.date)}</div>
                    ${b.isGayi && (b.category === 'CALENDER' || b.category === 'EMBROIDERY') ? `<div><strong>Stock Source:</strong> ${esc((b.source || 'fresh').toUpperCase())} STOCK</div>` : ''}
                </div>
                <table><thead><tr><th>#</th><th>BUNNE WALA</th><th>SAREE</th>${hasNaap ? '<th style="text-align:center;">NAAP</th>' : ''}<th style="text-align:right;">PCS</th></tr></thead>
                <tbody>${rowsHtml}</tbody></table>
                <div class="total-box">KUL SAREE: ${tot} Pcs ${b.damagePcs > 0 ? `(Dmg: ${b.damagePcs})` : ''}</div>
                <div class="signs"><div>हस्ताक्षर मुंशी<br><br>________</div><div>हस्ताक्षर पाने वाला<br><br>________</div></div>
            </div>
            <script>window.onload=function(){window.focus();window.print();setTimeout(()=>window.close(),600);};<\/script>
            </body></html>`);
        pw.document.close();
    };

    const printLastSheetChallan = () => {
        if (!shLastSavedChallan) return alert('Abhi koi recent batch save nahi hui hai.');
        printChallanObject(shLastSavedChallan);
    };

    const printSavedBatchRow = (sheetId, rowId) => {
        const sh = getJobWorkerSheets(window.activeJobWorkerId).find((s) => s && String(s.id) === String(sheetId));
        const r = sh ? toArray(sh.rows).find((x) => x && String(x.id) === String(rowId)) : null;
        if (!r) return;

        const w = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        const wType = String(w?.type || 'cutting').toUpperCase();
        const isGayi = (window.activeBatchModalInfo?.type === 'gayi') || (safeNum(r.gayiQty) > 0 && safeNum(r.aayiQty) === 0);
        const items = isGayi ? toArray(r.gayiItems) : toArray(r.aayiItems);

        printChallanObject({
            category: wType,
            worker: w ? w.name : 'Worker',
            date: r.date,
            isGayi,
            source: r.stockSource || 'fresh',
            items: items.map((x) => ({
                maker: x.karigar || x.maker || '-',
                saree: resolveMakerLiveStockInfo(x.karigar || x.maker, r.stockSource || 'fresh')?.saree || 'Saree',
                naap: x.naap || '',
                qty: x.qty
            })),
            damagePcs: r.damagePcs || 0
        });
    };

    const printJobWorkSheetReport = () => {
        if (!window.activeJobWorkerId || !window.activeJobSheetId) return;
        const w = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        const sh = getJobWorkerSheets(window.activeJobWorkerId).find((s) => s && String(s.id) === String(window.activeJobSheetId));
        if (!w || !sh) return;

        const c = calculateJobWorkSheetTotals(sh);
        let rowsHtml = '';
        toArray(sh.rows).forEach((r) => {
            rowsHtml += `<tr style="border-bottom:1px dashed #ccc;">
                <td style="padding:3px 2px;">${formatDisplay(r.date)}</td>
                <td style="padding:3px 2px; text-align:right;">${r.gayiQty > 0 ? `-${r.gayiQty}` : '-'}</td>
                <td style="padding:3px 2px; text-align:right;">${r.aayiQty > 0 ? `+${r.aayiQty}` : '-'}</td>
                <td style="padding:3px 2px; text-align:right;">${r.damagePcs > 0 ? r.damagePcs : '-'}</td>
            </tr>`;
        });

        const pw = window.open('', '', 'width=440,height=620');
        if (!pw) return alert('Popup block hai!');

        pw.document.write(`<html><head><title>JobWork Hisab - A6</title>
            <style>
                @page { size: A6 portrait; margin: 4mm; }
                body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                .ticket { width: 100%; max-width: 94mm; margin: 0 auto; }
                .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 5px; margin-bottom: 6px; }
                .header h2 { margin: 0; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 6px 0; }
                th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 2px; text-align: left; }
                .sum { border-top: 1.5px dashed #000; padding-top: 6px; font-weight: bold; }
                .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            </style></head><body>
            <div class="ticket">
                <div class="header"><h2>SIMPLICITY ERP</h2><div>${esc(String(w.type || '').toUpperCase())} KHATA STATEMENT</div></div>
                <div class="row"><span><strong>Kariger:</strong> ${esc(w.name)}</span><span>${esc(sh.title)}</span></div>
                <table><thead><tr><th>TARIKH</th><th style="text-align:right;">GAYI</th><th style="text-align:right;">AAYI</th><th style="text-align:right;">DMG</th></tr></thead>
                <tbody>${rowsHtml || '<tr><td colspan="4" style="text-align:center;">Koi entry nahi</td></tr>'}</tbody></table>
                <div class="sum">
                    <div class="row"><span>Pichli Baki:</span><span>${c.closingPendingSaree} Pcs</span></div>
                    <div class="row"><span>Kul Gayi:</span><span>${c.totGayiQty} Pcs</span></div>
                    <div class="row"><span>Wapas Aayi:</span><span>${c.totAayiQty} Pcs</span></div>
                    <div class="row"><span>Damage:</span><span>${c.totDamagePcs} Pcs</span></div>
                    <div class="row" style="font-size:13px; border-top:1px solid #000; padding-top:4px;"><span>ABHI BAKI:</span><span>${c.pendingSaree} Pcs</span></div>
                </div>
            </div>
            <script>window.onload=function(){window.focus();window.print();setTimeout(()=>window.close(),600);};<\/script>
            </body></html>`);
        pw.document.close();
    };

    const shareJobWorkOnWhatsApp = () => {
        if (!window.activeJobWorkerId || !window.activeJobSheetId) return alert('Pehle koi Khata Sheet kholein!');
        const w = getJobWorkers().find((x) => String(x.id) === String(window.activeJobWorkerId));
        const sheet = getJobWorkerSheets(window.activeJobWorkerId).find((s) => s && String(s.id) === String(window.activeJobSheetId));
        if (!w || !sheet) return alert('Data nahi mila!');

        const mob = getCleanMobile(w.mobile);
        if (!mob || mob.length < 10) {
            alert(`${w.name} ka Mobile Number saved nahi hai. Pehle [E] Edit Profile me Mobile number daalein.`);
            editActiveSheetWorker();
            return;
        }

        let procTitle = 'BOOTI CUTTING';
        if (w.type === 'calender') procTitle = 'CALENDER';
        else if (w.type === 'embroidery') procTitle = 'EMBROIDERY';

        const c = calculateJobWorkSheetTotals(sheet);
        const text = `*${procTitle} HISAB PARCHI*\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Kariger: *${w.name}*\nMahina: ${sheet.title}\nTarikh: ${formatDisplay(getTodayIso())}\n━━━━━━━━━━━━━━━━━━━━━\n` +
            (c.closingPendingSaree > 0 ? `Pichli Baki: *${c.closingPendingSaree} Pcs*\n` : '') +
            `Kul Gayi: *${c.totGayiQty} Pcs*\nWapas Aayi: *${c.totAayiQty} Pcs*\n` +
            (c.totDamagePcs > 0 ? `Damage: *${c.totDamagePcs} Pcs*\n` : '') +
            `-------------------------------------\nABHI BAKI SAREE: *${c.pendingSaree} Pcs*\n━━━━━━━━━━━━━━━━━━━━━\n_Simplicity ERP • by Farhan Jawed_`;

        window.open(`https://wa.me/${mob}?text=${encodeURIComponent(text)}`, '_blank');
    };

    /* ========================================================================
       12. BILLING & INLINE PAYMENT LEDGER ENGINE
       ======================================================================== */
    const getJwBills = () => toArray(getFromStore('jw_bills_list'));
    const saveJwBills = (list) => setToStore('jw_bills_list', toArray(list));
    const getJwPayments = () => toArray(getFromStore('jw_payments_list'));
    const saveJwPayments = (list) => setToStore('jw_payments_list', toArray(list));

    const initJobWorkBillingView = () => {
        populateWorkerSelectOptions();
        const dInp = document.getElementById('jw-bill-input-date');
        if (dInp) dInp.value = getTodayIso();
        setDisplay('add-jw-bill-form', 'none');
        setDisplay('jw-bill-inline-ledger', 'none');
        activeBillLedgerId = null;
        billActiveIdx = 0;
        renderJwBillsTable();
    };

    const populateWorkerSelectOptions = () => {
        const sel = document.getElementById('jw-bill-input-worker');
        if (!sel) return;
        sel.innerHTML = '';
        const workers = getJobWorkers();
        if (!workers.length) {
            sel.innerHTML = '<option value="">Pehle Naya Kariger Banayein</option>';
            return;
        }
        workers.forEach((w) => {
            const opt = document.createElement('option');
            opt.value = w.id;
            const tag = w.type === 'calender' ? 'Calender' : (w.type === 'embroidery' ? 'Embroidery' : 'Cutting');
            opt.textContent = `${w.name} (${tag})`;
            sel.appendChild(opt);
        });
    };

    const renderBillWorkerPicker = (query = '') => {
        const box = document.getElementById('jw-bill-worker-picker');
        if (!box) return;
        const q = String(query || '').trim().toLowerCase();
        const workers = getJobWorkers().filter((w) => !q || `${w.name} ${w.type}`.toLowerCase().includes(q));
        billPickerItems = workers;
        if (billPickerActiveIdx >= workers.length) billPickerActiveIdx = 0;

        if (!workers.length) {
            box.innerHTML = '<div style="padding:16px; text-align:center; color:#6b7280; font-size:12px;">Koi Job Worker nahi mila.</div>';
            return;
        }

        let html = '';
        workers.forEach((w, idx) => {
            const cls = idx === billPickerActiveIdx ? 'jw-picker-item active' : 'jw-picker-item';
            html += `<div class="${cls}" onmousedown="event.preventDefault(); JobWorkEngine.pickBillWorker(${idx})">
                <span>${esc(w.name)}</span>
                <span class="jw-picker-sub">${esc(String(w.type || 'cutting').toUpperCase())}</span>
            </div>`;
        });
        box.innerHTML = html;
        const activeEl = box.querySelector('.jw-picker-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const pickBillWorker = (idx) => {
        const w = billPickerItems[idx];
        if (!w) return;
        const sel = document.getElementById('jw-bill-input-worker');
        const txt = document.getElementById('jw-bill-input-worker-text');
        if (sel) sel.value = w.id;
        if (txt) txt.value = w.name;
        setTimeout(() => document.getElementById('jw-bill-input-no')?.focus(), 30);
    };

    const toggleAddJwBillForm = () => {
        const f = document.getElementById('add-jw-bill-form');
        if (!f) return;
        const isOpening = (f.style.display !== 'block');
        f.style.display = isOpening ? 'block' : 'none';
        setDisplay('jw-bill-accept-bar', 'none');

        if (isOpening) {
            populateWorkerSelectOptions();
            const dInp = document.getElementById('jw-bill-input-date');
            if (dInp) dInp.value = getTodayIso();
            const wTxt = document.getElementById('jw-bill-input-worker-text');
            if (wTxt) wTxt.value = '';
            const wSel = document.getElementById('jw-bill-input-worker');
            if (wSel) wSel.value = '';
            billPickerActiveIdx = 0;
            renderBillWorkerPicker('');
            setTimeout(() => wTxt?.focus(), 40);
        }
    };

    const saveJobWorkNewBill = () => {
        setDisplay('jw-bill-accept-bar', 'none');
        const d = toIsoDate(document.getElementById('jw-bill-input-date')?.value) || getTodayIso();
        const billNo = String(document.getElementById('jw-bill-input-no')?.value || '-').trim();
        const note = String(document.getElementById('jw-bill-input-note')?.value || billNo).trim();
        const wId = document.getElementById('jw-bill-input-worker')?.value || '';
        const pcs = safeInt(document.getElementById('jw-bill-input-pcs')?.value);
        const amt = safeNum(document.getElementById('jw-bill-input-amt')?.value);

        if (!wId || amt <= 0) {
            alert('Job Worker aur Sahi Bill Amount (₹) bharein!');
            return;
        }

        const worker = getJobWorkers().find((x) => String(x.id) === String(wId));
        const bills = [...getJwBills()];
        bills.push({
            id: `bill_${Date.now()}`,
            billNo,
            date: d,
            workerId: wId,
            workerName: worker ? worker.name : 'Worker',
            workType: worker ? worker.type : 'cutting',
            pcs,
            billAmt: amt,
            paidAmt: 0,
            note
        });

        saveJwBills(bills);
        ['jw-bill-input-no', 'jw-bill-input-pcs', 'jw-bill-input-amt', 'jw-bill-input-note', 'jw-bill-input-worker-text'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        setDisplay('add-jw-bill-form', 'none');
        renderJwBillsTable();
        updateJobWorkHubBadges();
    };

    const getJwBillingStats = () => {
        let totBilled = 0, totPaid = 0;
        getJwBills().forEach((b) => {
            if (!b) return;
            totBilled += safeNum(b.billAmt);
            totPaid += safeNum(b.paidAmt);
        });
        return { total: totBilled, paid: totPaid, pending: Math.max(0, totBilled - totPaid) };
    };

    const switchJwBillTab = (tab) => {
        window.currentJwBillTab = tab;
        const btnP = document.getElementById('btn-jw-bill-pending');
        const btnPd = document.getElementById('btn-jw-bill-paid');
        if (btnP) btnP.className = (tab === 'pending') ? 'sheet-tab active' : 'sheet-tab';
        if (btnPd) btnPd.className = (tab === 'paid') ? 'sheet-tab active' : 'sheet-tab';
        activeBillLedgerId = null;
        setDisplay('jw-bill-inline-ledger', 'none');
        billActiveIdx = 0;
        renderJwBillsTable();
    };

    const filterJwBills = () => {
        billActiveIdx = 0;
        renderJwBillsTable();
    };

    const highlightBillRow = (idx) => {
        if (!billTableList.length) return;
        billActiveIdx = ((idx % billTableList.length) + billTableList.length) % billTableList.length;
        const rows = document.querySelectorAll('#jw-bills-table-tbody tr.jw-nav-row');
        rows.forEach((tr, i) => {
            if (i === billActiveIdx) {
                tr.classList.add('jw-row-active');
                tr.scrollIntoView({ block: 'nearest' });
            } else {
                tr.classList.remove('jw-row-active');
            }
        });
    };

    const renderJwBillsTable = (customList) => {
        const thead = document.getElementById('jw-bills-table-thead');
        const tbody = document.getElementById('jw-bills-table-tbody');
        if (!thead || !tbody) return;

        const stats = getJwBillingStats();
        setText('jw-bill-stat-total', `₹ ${stats.total.toFixed(2)}`);
        setText('jw-bill-stat-paid', `₹ ${stats.paid.toFixed(2)}`);
        setText('jw-bill-stat-pending', `₹ ${stats.pending.toFixed(2)}`);

        thead.innerHTML = `<tr>
            <th>Date</th><th>Bill No.</th><th>Job Worker</th><th>Process</th><th>Pcs</th><th>Total (₹)</th><th>Paid (₹)</th><th>Baki (₹)</th><th>Status</th><th style="text-align:right;">Open</th>
        </tr>`;

        const txt = (document.getElementById('jw-search-bill-input')?.value || '').toLowerCase().trim();
        const isPending = (window.currentJwBillTab === 'pending');

        const filtered = (customList || getJwBills()).filter((b) => {
            if (!b) return false;
            if (txt && !`${b.workerName || ''} ${b.billNo || ''} ${b.date || ''}`.toLowerCase().includes(txt)) return false;
            const baki = Math.max(0, safeNum(b.billAmt) - safeNum(b.paidAmt));
            return isPending ? (baki > 0) : (baki <= 0);
        });

        billTableList = filtered;
        if (billActiveIdx >= filtered.length) billActiveIdx = 0;

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:#6b7280;">${isPending ? 'Koi dena baki nahi hai.' : 'Abhi koi paid bill nahi hai.'}</td></tr>`;
            return;
        }

        let html = '';
        filtered.forEach((b, idx) => {
            const baki = Math.max(0, safeNum(b.billAmt) - safeNum(b.paidAmt));
            const procTitle = b.workType === 'calender' ? 'Calender' : (b.workType === 'embroidery' ? 'Embroidery' : 'Cutting');
            const activeCls = (String(activeBillLedgerId) === String(b.id) || idx === billActiveIdx) ? 'jw-row-active' : '';

            html += `<tr class="jw-nav-row ${activeCls}" onclick="JobWorkEngine.openBillInlineLedger(${idx}, '${esc(b.id)}')">
                <td>${formatDisplay(b.date)}</td>
                <td><strong>${esc(b.billNo || '-')}</strong></td>
                <td><strong>${esc(b.workerName)}</strong></td>
                <td>${procTitle}</td>
                <td>${b.pcs > 0 ? `${b.pcs} Pcs` : '-'}</td>
                <td>₹ ${safeNum(b.billAmt).toFixed(2)}</td>
                <td>₹ ${safeNum(b.paidAmt).toFixed(2)}</td>
                <td><strong style="color:#b47d00;">₹ ${baki.toFixed(2)}</strong></td>
                <td><span class="jw-status-pill">${baki > 0 ? 'Baki' : 'Clear'}</span></td>
                <td style="text-align:right;"><span class="jw-open-ind">Ledger &rarr;</span></td>
            </tr>`;
        });

        tbody.innerHTML = html;
    };

    const openBillInlineLedger = (idx, billId) => {
        highlightBillRow(idx);
        activeBillLedgerId = billId;
        renderBillInlineLedger();
    };

    const closeBillInlineLedger = () => {
        activeBillLedgerId = null;
        setDisplay('jw-bill-inline-ledger', 'none');
        renderJwBillsTable();
    };

    const renderBillInlineLedger = () => {
        const panel = document.getElementById('jw-bill-inline-ledger');
        if (!panel || !activeBillLedgerId) return;

        const b = getJwBills().find((x) => String(x.id) === String(activeBillLedgerId));
        if (!b) {
            closeBillInlineLedger();
            return;
        }

        const baki = Math.max(0, safeNum(b.billAmt) - safeNum(b.paidAmt));
        const payments = getJwPayments().filter((p) => p && String(p.billId) === String(b.id));

        let payRows = '';
        if (!payments.length) {
            payRows = '<tr><td colspan="5" style="text-align:center; padding:12px; color:#6b7280;">Is Bill par koi payment nahi hai.</td></tr>';
        } else {
            payments.forEach((p, idx) => {
                payRows += `<tr>
                    <td>${idx + 1}</td>
                    <td>${formatDisplay(p.date)}</td>
                    <td>${esc(p.note || 'Bill Payment')} (${esc(p.mode || 'Cash')})</td>
                    <td style="font-weight:800; color:#b47d00;">₹ ${safeNum(p.amount).toFixed(2)}</td>
                    <td style="text-align:right;"><button type="button" class="jw-btn-del" onclick="JobWorkEngine.deleteJwPaymentEntry('${esc(p.id)}', '${esc(b.id)}')">Del</button></td>
                </tr>`;
            });
        }

        const payFormHtml = (baki > 0) ? `
            <div style="background:#ffffff; border:1px solid #e5d5a7; border-radius:6px; padding:12px; margin-bottom:12px; max-width:520px;">
                <div class="jw-sec-title" style="margin-top:0;">Payment Entry (Baki: ₹ ${baki.toFixed(2)})</div>
                <div class="jw-row"><label class="jw-lbl">Tarikh :</label><input type="date" id="jw-inline-pay-date" value="${getTodayIso()}" class="jw-inp"></div>
                <div class="jw-row"><label class="jw-lbl">Amount (₹) :</label><input type="text" inputmode="decimal" id="jw-inline-pay-amt" value="${baki}" class="jw-inp jw-inp-num"></div>
                <div class="jw-row"><label class="jw-lbl">Mode :</label>
                    <select id="jw-inline-pay-mode" class="jw-inp">
                        <option value="Cash">Cash</option>
                        <option value="UPI / Online">UPI / Online</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                    </select>
                </div>
                <div class="jw-row"><label class="jw-lbl">Note :</label><input type="text" id="jw-inline-pay-note" value="Payment for Bill ${esc(b.billNo || '')}" class="jw-inp"></div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                    <button type="button" class="jw-btn-gold" onclick="JobWorkEngine.saveInlineBillPayment('${esc(b.id)}')">Save Payment</button>
                </div>
            </div>` : '';

        panel.innerHTML = `
            <div class="jw-inline-head">
                <div>
                    <strong style="font-size:14.5px;">Bill #${esc(b.billNo || '-')} &mdash; ${esc(b.workerName)}</strong>
                    <span style="margin-left:10px; font-size:12px; color:#b47d00; font-weight:800;">Total: ₹ ${safeNum(b.billAmt).toFixed(2)} | Paid: ₹ ${safeNum(b.paidAmt).toFixed(2)} | Baki: ₹ ${baki.toFixed(2)}</span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="jw-btn-sec" onclick="JobWorkEngine.sendJwPaymentWhatsAppReceipt('${esc(b.id)}')">[W] WhatsApp</button>
                    <button type="button" class="jw-btn-del" onclick="JobWorkEngine.deleteJwBill('${esc(b.id)}')">Delete Bill</button>
                    <button type="button" class="jw-btn-sec" onclick="JobWorkEngine.closeBillInlineLedger()">Close [Esc]</button>
                </div>
            </div>
            ${payFormHtml}
            <div style="font-size:11.5px; font-weight:800; color:#92400e; text-transform:uppercase; margin-bottom:6px;">Payment Passbook</div>
            <div class="table-responsive">
                <table>
                    <thead><tr><th style="width:40px;">#</th><th>Date</th><th>Note / Mode</th><th>Amount</th><th style="text-align:right;">Action</th></tr></thead>
                    <tbody>${payRows}</tbody>
                </table>
            </div>
        `;
        panel.style.display = 'block';
        panel.scrollIntoView({ block: 'nearest' });
    };

    const saveInlineBillPayment = (billId) => {
        const d = toIsoDate(document.getElementById('jw-inline-pay-date')?.value) || getTodayIso();
        const payAmt = safeNum(document.getElementById('jw-inline-pay-amt')?.value);
        const mode = document.getElementById('jw-inline-pay-mode')?.value || 'Cash';
        const note = String(document.getElementById('jw-inline-pay-note')?.value || '').trim();
        commitBillPayment(billId, d, payAmt, mode, note);
    };

    const commitBillPayment = (billId, d, payAmt, mode, note) => {
        if (payAmt <= 0) {
            alert('Sahi Payment Amount bharein!');
            return;
        }
        const bills = [...getJwBills()];
        const b = bills.find((x) => String(x.id) === String(billId));
        if (!b) return;

        b.paidAmt = safeNum(b.paidAmt) + payAmt;
        saveJwBills(bills);

        const payments = [...getJwPayments()];
        payments.push({
            id: `pay_${Date.now()}`,
            billId,
            billNo: b.billNo || '-',
            date: d,
            workerName: b.workerName,
            amount: payAmt,
            mode,
            note
        });
        saveJwPayments(payments);

        renderJwBillsTable();
        if (activeBillLedgerId === billId) renderBillInlineLedger();
        updateJobWorkHubBadges();
    };

    const viewJwBillPassbook = (billId) => {
        activeBillLedgerId = billId;
        renderBillInlineLedger();
    };

    const deleteJwPaymentEntry = (payId, billId) => {
        if (!confirm('Kya is payment record ko delete karna chahte hain?')) return;
        const payments = getJwPayments();
        const p = payments.find((x) => x && String(x.id) === String(payId));
        if (!p) return;

        const bills = [...getJwBills()];
        const b = bills.find((x) => x && String(x.id) === String(billId));
        if (b) {
            b.paidAmt = Math.max(0, safeNum(b.paidAmt) - safeNum(p.amount));
            saveJwBills(bills);
        }

        saveJwPayments(payments.filter((x) => !x || String(x.id) !== String(payId)));
        renderJwBillsTable();
        if (activeBillLedgerId === billId) renderBillInlineLedger();
        updateJobWorkHubBadges();
    };

    const openJwPayModal = (billId) => {
        activeBillLedgerId = billId;
        renderBillInlineLedger();
    };

    const closeJwPayModal = () => setDisplay('jw-pay-modal', 'none');

    const saveJobWorkPayment = () => {
        const billId = document.getElementById('jw-pay-bill-id')?.value;
        const d = toIsoDate(document.getElementById('jw-pay-date')?.value) || getTodayIso();
        const payAmt = safeNum(document.getElementById('jw-pay-amount')?.value);
        const mode = document.getElementById('jw-pay-mode')?.value || 'Cash';
        const note = String(document.getElementById('jw-pay-note')?.value || '').trim();
        commitBillPayment(billId, d, payAmt, mode, note);
        closeJwPayModal();
    };

    const sendJwPaymentWhatsAppReceipt = (billId) => {
        const b = getJwBills().find((x) => String(x.id) === String(billId));
        if (!b) return;

        const worker = getJobWorkers().find((w) => String(w.id) === String(b.workerId));
        const mob = getCleanMobile(worker?.mobile);
        if (!mob || mob.length < 10) {
            alert(`${b.workerName} ka Mobile Number saved nahi hai. Pehle Worker profile me mobile number daalein.`);
            return;
        }

        const baki = Math.max(0, safeNum(b.billAmt) - safeNum(b.paidAmt));
        const text = `*JOB WORK PAYMENT RASEED*\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Bill No: *${b.billNo || '-'}*\nJob Worker: *${b.workerName}*\nTarikh: ${formatDisplay(getTodayIso())}\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Total Bill: ₹ ${safeNum(b.billAmt).toFixed(2)}\nPaid: ₹ ${safeNum(b.paidAmt).toFixed(2)}\n-------------------------------------\n` +
            (baki > 0 ? `*BAKI HAI: ₹ ${baki.toFixed(2)}*\n` : '*STATUS: CHUKTA HO GAYA*\n') +
            `━━━━━━━━━━━━━━━━━━━━━\n_Simplicity ERP • by Farhan Jawed_`;

        window.open(`https://wa.me/${mob}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const deleteJwBill = (billId) => {
        if (!confirm('Kya is Bill ko delete karna chahte hain? Sabhi jude payments bhi delete honge.')) return;
        saveJwBills(getJwBills().filter((x) => !x || String(x.id) !== String(billId)));
        saveJwPayments(getJwPayments().filter((p) => !p || String(p.billId) !== String(billId)));
        if (activeBillLedgerId === billId) closeBillInlineLedger();
        renderJwBillsTable();
        updateJobWorkHubBadges();
    };

    /* ========================================================================
       13. DAILY TRACKING DAY-BOOK ENGINE (NORMALIZED ISO DATE FIX)
       ======================================================================== */
    const setJwMovementToday = () => {
        const dEl = document.getElementById('jw-mov-date');
        if (dEl) dEl.value = getTodayIso();
        renderJwMovementDaybook();
    };

    const switchJwMovementTab = (tab) => {
        window.currentJwMovementTab = tab;
        ['cutting', 'embroidery', 'calender', 'payment'].forEach((t) => {
            const el = document.getElementById(`btn-jw-mov-${t}`);
            if (el) {
                if (t === tab) el.classList.add('active');
                else el.classList.remove('active');
            }
        });
        renderJwMovementDaybook();
    };

    const getDaybookSnapshot = (targetIso) => {
        let cutG = 0, cutA = 0, embG = 0, embA = 0, calG = 0, calA = 0, payOut = 0;
        const cuttingRows = [], embroideryRows = [], calenderRows = [], paymentRows = [];

        getJobWorkers().forEach((w) => {
            const wType = String(w.type || '').toLowerCase();
            getJobWorkerSheets(w.id).forEach((sh) => {
                toArray(sh.rows).forEach((r) => {
                    if (!r || toIsoDate(r.date) !== targetIso) return;
                    const gQty = safeNum(r.gayiQty);
                    const aQty = safeNum(r.aayiQty);
                    if (gQty <= 0 && aQty <= 0) return;

                    const rowObj = { worker: w.name, sheet: sh.title, gayi: gQty, aayi: aQty, damagePcs: r.damagePcs || 0 };
                    if (wType === 'calender') { calG += gQty; calA += aQty; calenderRows.push(rowObj); }
                    else if (wType === 'embroidery') { embG += gQty; embA += aQty; embroideryRows.push(rowObj); }
                    else if (wType === 'cutting') { cutG += gQty; cutA += aQty; cuttingRows.push(rowObj); }
                });
            });
        });

        getJwPayments().forEach((p) => {
            if (p && toIsoDate(p.date) === targetIso) {
                const amt = safeNum(p.amount);
                payOut += amt;
                paymentRows.push({
                    worker: p.workerName || '-',
                    billNo: p.billNo || '-',
                    amount: amt,
                    mode: p.mode || 'Cash'
                });
            }
        });

        return { cutG, cutA, embG, embA, calG, calA, payOut, cuttingRows, embroideryRows, calenderRows, paymentRows };
    };

    const renderJwMovementDaybook = () => {
        const dEl = document.getElementById('jw-mov-date');
        const targetIso = toIsoDate(dEl?.value) || getTodayIso();
        const thead = document.getElementById('jw-mov-table-thead');
        const tbody = document.getElementById('jw-mov-table-tbody');
        const tfoot = document.getElementById('jw-mov-table-tfoot');
        if (!thead || !tbody || !tfoot) return;

        const txt = (document.getElementById('jw-mov-search')?.value || '').toLowerCase().trim();
        const snap = getDaybookSnapshot(targetIso);

        setText('sub-jw-mov-cutting', `Gayi: -${snap.cutG} | Aayi: +${snap.cutA}`);
        setText('sub-jw-mov-embroidery', `Gayi: -${snap.embG} | Aayi: +${snap.embA}`);
        setText('sub-jw-mov-calender', `Gayi: -${snap.calG} | Aayi: +${snap.calA}`);
        setText('sub-jw-mov-payment', `Diya: ₹ ${snap.payOut.toFixed(0)}`);

        const renderProcessTab = (rows, gTot, aTot, label) => {
            thead.innerHTML = `<tr><th>${label} Kariger</th><th>Sheet</th><th style="text-align:center;">Gayi</th><th style="text-align:center;">Wapas Aayi</th><th>Damage</th></tr>`;
            const filtered = rows.filter((r) => !txt || `${r.worker} ${r.sheet}`.toLowerCase().includes(txt));
            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px; color:#6b7280;">Is tarikh me koi entry nahi hai.</td></tr>';
            } else {
                let html = '';
                filtered.forEach((r) => {
                    html += `<tr><td><strong>${esc(r.worker)}</strong></td><td>${esc(r.sheet)}</td><td style="text-align:center;">-${r.gayi} Pcs</td><td style="text-align:center; font-weight:800; color:#b47d00;">+${r.aayi} Pcs</td><td>${r.damagePcs > 0 ? `${r.damagePcs} Pcs` : '-'}</td></tr>`;
                });
                tbody.innerHTML = html;
            }
            tfoot.innerHTML = `<tr style="background:#fdf6e2; font-weight:800; border-top:1.5px solid #e5d5a7;"><td colspan="2">TOTAL ${label.toUpperCase()}:</td><td style="text-align:center;">-${gTot} Pcs</td><td style="text-align:center; color:#b47d00;">+${aTot} Pcs</td><td>-</td></tr>`;
        };

        if (window.currentJwMovementTab === 'cutting') {
            renderProcessTab(snap.cuttingRows, snap.cutG, snap.cutA, 'Cutting');
        } else if (window.currentJwMovementTab === 'embroidery') {
            renderProcessTab(snap.embroideryRows, snap.embG, snap.embA, 'Embroidery');
        } else if (window.currentJwMovementTab === 'calender') {
            renderProcessTab(snap.calenderRows, snap.calG, snap.calA, 'Calender');
        } else {
            thead.innerHTML = '<tr><th>Job Worker</th><th>Bill No.</th><th>Mode</th><th style="text-align:right;">Diya (Paid)</th></tr>';
            const filteredPay = snap.paymentRows.filter((r) => !txt || `${r.worker} ${r.billNo}`.toLowerCase().includes(txt));
            if (!filteredPay.length) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:18px; color:#6b7280;">Koi payment nahi diya gaya.</td></tr>';
            } else {
                let html = '';
                filteredPay.forEach((r) => {
                    html += `<tr><td><strong>${esc(r.worker)}</strong></td><td>${esc(r.billNo)}</td><td>${esc(r.mode)}</td><td style="text-align:right; font-weight:800; color:#b47d00;">₹ ${r.amount.toFixed(2)}</td></tr>`;
                });
                tbody.innerHTML = html;
            }
            tfoot.innerHTML = `<tr style="background:#fdf6e2; font-weight:800; border-top:1.5px solid #e5d5a7;"><td colspan="3">TOTAL BHUGTAN:</td><td style="text-align:right; color:#b47d00;">₹ ${snap.payOut.toFixed(2)}</td></tr>`;
        }
    };

    const printJwMovementDaybook = () => {
        const dEl = document.getElementById('jw-mov-date');
        const targetIso = toIsoDate(dEl?.value) || getTodayIso();
        const snap = getDaybookSnapshot(targetIso);

        const pw = window.open('', '', 'width=440,height=620');
        if (!pw) return alert('Popup block hai!');

        pw.document.write(`<html><head><title>JobWork Day-Book - A6</title>
            <style>
                @page { size: A6 portrait; margin: 4mm; }
                body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                .ticket { width: 100%; max-width: 94mm; margin: 0 auto; }
                .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 5px; margin-bottom: 6px; }
                .header h2 { margin: 0; font-size: 14px; }
                .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #ccc; }
            </style></head><body>
            <div class="ticket">
                <div class="header"><h2>SIMPLICITY ERP</h2><div>JOBWORK TRACKING DAY-BOOK (${formatDisplay(targetIso)})</div></div>
                <div class="row"><strong>Cutting:</strong><span>Gayi -${snap.cutG} | Aayi +${snap.cutA}</span></div>
                <div class="row"><strong>Embroidery:</strong><span>Gayi -${snap.embG} | Aayi +${snap.embA}</span></div>
                <div class="row"><strong>Calender:</strong><span>Gayi -${snap.calG} | Aayi +${snap.calA}</span></div>
                <div class="row"><strong>Payments:</strong><span>₹ ${snap.payOut.toFixed(2)}</span></div>
            </div>
            <script>window.onload=function(){window.focus();window.print();setTimeout(()=>window.close(),600);};<\/script>
            </body></html>`);
        pw.document.close();
    };

    /* ========================================================================
       14. KEYBOARD ENGINE (SHEET VOUCHER, HUB, WORKERS, BILLING & ESC HIERARCHY)
       ======================================================================== */
    const bindSheetVoucherEvents = () => {
        const movInp = document.getElementById('jw-sh-movement-input');
        const srcInp = document.getElementById('jw-sh-source-input');
        const dateEl = document.getElementById('jw-sh-date');
        const makerInp = document.getElementById('jw-sh-maker-input');
        const naapInp = document.getElementById('jw-sh-naap-input');
        const qtyInp = document.getElementById('jw-sh-qty-input');
        const dmgPcs = document.getElementById('jw-form-damage-pcs');
        const dmgAmt = document.getElementById('jw-form-damage-amt');
        const yesBtn = document.getElementById('jw-sh-accept-yes');

        const attachPicker = (el, modeName) => {
            if (!el) return;
            el.addEventListener('focus', () => showSheetRightPicker(modeName, ''));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (shPickerItems.length) {
                        e.preventDefault();
                        shPickerActiveIdx = e.key === 'ArrowDown'
                            ? (shPickerActiveIdx + 1) % shPickerItems.length
                            : (shPickerActiveIdx - 1 + shPickerItems.length) % shPickerItems.length;
                        renderSheetRightPickerList();
                    }
                    return;
                }
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (shPickerItems.length && shPickerItems[shPickerActiveIdx]) pickSheetItem(shPickerActiveIdx);
                }
            });
        };

        attachPicker(movInp, 'movement');
        attachPicker(srcInp, 'source');

        if (dateEl) {
            dateEl.addEventListener('focus', () => showSheetRightPicker('summary', ''));
            dateEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    focusSheetField('jw-sh-maker-input');
                }
            });
        }

        if (makerInp) {
            makerInp.addEventListener('focus', () => {
                shMakerArrowUsed = false;
                shPickerActiveIdx = 0;
                showSheetRightPicker('maker', makerInp.value);
            });
            makerInp.addEventListener('input', () => {
                shMakerArrowUsed = true;
                shPickerActiveIdx = 0;
                showSheetRightPicker('maker', makerInp.value);
                updateSheetMakerStockHint();
            });
            makerInp.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (shPickerItems.length) {
                        e.preventDefault();
                        shMakerArrowUsed = true;
                        shPickerActiveIdx = e.key === 'ArrowDown'
                            ? (shPickerActiveIdx + 1) % shPickerItems.length
                            : (shPickerActiveIdx - 1 + shPickerItems.length) % shPickerItems.length;
                        renderSheetRightPickerList();
                    }
                    return;
                }
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    const typed = makerInp.value.trim();
                    if (!typed && shBatchItems.length > 0 && !shMakerArrowUsed) {
                        showSheetAcceptPrompt(true);
                        return;
                    }
                    if (shPickerItems.length && (shMakerArrowUsed || typed !== '' || shBatchItems.length === 0)) {
                        pickSheetItem(shPickerActiveIdx);
                    }
                }
            });
        }

        if (naapInp) {
            naapInp.addEventListener('focus', () => showSheetRightPicker('summary', ''));
            naapInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (naapInp.value.trim()) shLastNaap = naapInp.value.trim();
                    focusSheetField('jw-sh-qty-input');
                }
            });
        }

        if (qtyInp) {
            qtyInp.addEventListener('focus', () => showSheetRightPicker('summary', ''));
            qtyInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    addSheetBatchRow();
                }
            });
        }

        if (dmgPcs) {
            dmgPcs.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    focusSheetField('jw-form-damage-amt');
                }
            });
        }

        if (dmgAmt) {
            dmgAmt.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    showSheetAcceptPrompt(true);
                }
            });
        }

        if (yesBtn) {
            yesBtn.addEventListener('keydown', (e) => {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    saveJobWorkBatchLine(false);
                } else if (e.key === 'p' || e.key === 'P') {
                    e.preventDefault();
                    e.stopPropagation();
                    saveJobWorkBatchLine(true);
                } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelSheetAccept();
                }
            });
        }
    };

    const bindWorkerAndBillFormEvents = () => {
        // Worker Form Enter Chain
        const wIds = ['jw-worker-date', 'jw-worker-name', 'jw-worker-address', 'jw-worker-mobile'];
        wIds.forEach((id, i) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (i < wIds.length - 1) {
                        document.getElementById(wIds[i + 1])?.focus();
                    } else {
                        setDisplay('jw-worker-accept-bar', 'flex');
                        document.getElementById('jw-worker-accept-yes')?.focus();
                    }
                }
            });
        });

        const wYes = document.getElementById('jw-worker-accept-yes');
        if (wYes) {
            wYes.addEventListener('keydown', (e) => {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                    e.preventDefault(); e.stopPropagation();
                    saveNewJobWorker();
                } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                    e.preventDefault(); e.stopPropagation();
                    setDisplay('jw-worker-accept-bar', 'none');
                    document.getElementById('jw-worker-name')?.focus();
                }
            });
        }

        // Bill Worker Picker & Form Enter Chain
        const bWInp = document.getElementById('jw-bill-input-worker-text');
        if (bWInp) {
            bWInp.addEventListener('focus', () => renderBillWorkerPicker(bWInp.value));
            bWInp.addEventListener('input', () => {
                billPickerActiveIdx = 0;
                renderBillWorkerPicker(bWInp.value);
            });
            bWInp.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (billPickerItems.length) {
                        e.preventDefault();
                        billPickerActiveIdx = e.key === 'ArrowDown'
                            ? (billPickerActiveIdx + 1) % billPickerItems.length
                            : (billPickerActiveIdx - 1 + billPickerItems.length) % billPickerItems.length;
                        renderBillWorkerPicker(bWInp.value);
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (billPickerItems[billPickerActiveIdx]) pickBillWorker(billPickerActiveIdx);
                }
            });
        }

        const bIds = ['jw-bill-input-date', 'jw-bill-input-worker-text', 'jw-bill-input-no', 'jw-bill-input-pcs', 'jw-bill-input-amt', 'jw-bill-input-note'];
        bIds.forEach((id, i) => {
            if (id === 'jw-bill-input-worker-text') return;
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (i < bIds.length - 1) {
                        document.getElementById(bIds[i + 1])?.focus();
                    } else {
                        setDisplay('jw-bill-accept-bar', 'flex');
                        document.getElementById('jw-bill-accept-yes')?.focus();
                    }
                }
            });
        });

        const bYes = document.getElementById('jw-bill-accept-yes');
        if (bYes) {
            bYes.addEventListener('keydown', (e) => {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                    e.preventDefault(); e.stopPropagation();
                    saveJobWorkNewBill();
                } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                    e.preventDefault(); e.stopPropagation();
                    setDisplay('jw-bill-accept-bar', 'none');
                    document.getElementById('jw-bill-input-amt')?.focus();
                }
            });
        }
    };

    const handleGlobalJobWorkKeydown = (e) => {
        if (!isVisible('jobwork-section')) return;
        // Do not intercept if Express Modal or any overlay modal is open
        if (document.getElementById('master-jobwork-express-modal')) return;
        if (isVisible('item-modal') || isVisible('jw-batch-modal') || isVisible('jw-pay-modal')) return;

        const activeTag = document.activeElement?.tagName;
        const isTyping = (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT');

        // GLOBAL ESC HIERARCHY INSIDE JOBWORK
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();

            if (isVisible('jw-worker-accept-bar')) {
                setDisplay('jw-worker-accept-bar', 'none');
                document.getElementById('jw-worker-name')?.focus();
                return;
            }
            if (isVisible('jw-sh-accept-strip')) {
                cancelSheetAccept();
                return;
            }
            if (isVisible('jw-bill-accept-bar')) {
                setDisplay('jw-bill-accept-bar', 'none');
                document.getElementById('jw-bill-input-amt')?.focus();
                return;
            }
            if (isVisible('add-jw-worker-form')) {
                toggleJobWorkerForm();
                return;
            }
            if (isVisible('add-jw-bill-form')) {
                toggleAddJwBillForm();
                return;
            }
            if (isVisible('jw-inline-batch-panel')) {
                closeInlineBatchDrawer();
                return;
            }
            if (isVisible('jw-bill-inline-ledger')) {
                closeBillInlineLedger();
                return;
            }
            if (isVisible('jw-dukan-inline-detail')) {
                if (window.DukanEngine && typeof window.DukanEngine.closeDukanInlineDetail === 'function') {
                    window.DukanEngine.closeDukanInlineDetail();
                    return;
                }
            }
            if (isVisible('jw-sheet-view')) {
                closeJobWorkerSheet();
                return;
            }
            if (isVisible('jw-workers-view') || isVisible('jw-dukan-view') || isVisible('jw-billing-view') || isVisible('jw-movement-view')) {
                showJobWorkHub();
                return;
            }
            if (isVisible('jw-hub-view')) {
                if (typeof window.backToDashboard === 'function') window.backToDashboard();
                return;
            }
            return;
        }

        // Alt+N: New Worker / New Bill
        if (e.altKey && (e.key === 'n' || e.key === 'N')) {
            if (isVisible('jw-workers-view')) {
                e.preventDefault();
                toggleJobWorkerForm();
                return;
            }
            if (isVisible('jw-billing-view')) {
                e.preventDefault();
                toggleAddJwBillForm();
                return;
            }
        }

        // Alt+P: Contextual Print
        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            if (isVisible('jw-sheet-view')) {
                e.preventDefault();
                printJobWorkSheetReport();
                return;
            }
            if (isVisible('jw-movement-view')) {
                e.preventDefault();
                printJwMovementDaybook();
                return;
            }
        }

        // SHEET VIEW SHORTCUTS
        if (isVisible('jw-sheet-view')) {
            if (e.key === 'F5') {
                e.preventDefault();
                if (confirmClearSheetBatchIfNeeded('Len-Den (Gayi/Aayi)')) {
                    shMovementType = (shMovementType === 'gayi') ? 'aayi' : 'gayi';
                    updateSheetVoucherControls();
                    updateSheetMakerStockHint();
                    showSheetRightPicker('maker', '');
                }
                return;
            }
            if (e.key === 'F6') {
                e.preventDefault();
                const wType = getActiveWorkerType();
                if (shMovementType === 'gayi' && wType !== 'cutting') {
                    if (confirmClearSheetBatchIfNeeded('Stock Source')) {
                        if (wType === 'embroidery') shStockSource = (shStockSource === 'fresh') ? 'cutting' : 'fresh';
                        else shStockSource = (shStockSource === 'cutting') ? 'embroidery' : (shStockSource === 'embroidery' ? 'fresh' : 'cutting');
                        updateSheetVoucherControls();
                        updateSheetMakerStockHint();
                        showSheetRightPicker('maker', '');
                    }
                }
                return;
            }
            if (e.key === 'F7') {
                e.preventDefault();
                addNewJobWorkerMonthlySheet();
                return;
            }
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                saveJobWorkBatchLine(false);
                return;
            }
            if (!isTyping && (e.key === 'e' || e.key === 'E')) {
                e.preventDefault();
                editActiveSheetWorker();
                return;
            }
            if (!isTyping && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
                shareJobWorkOnWhatsApp();
                return;
            }
            return;
        }

        // HUB VIEW NAVIGATION
        if (isVisible('jw-hub-view') && !isTyping) {
            const rows = Array.from(document.querySelectorAll('#jw-hub-list .jw-hub-row'));
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHubActiveRow(hubActiveIdx + 1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHubActiveRow(hubActiveIdx - 1);
                return;
            }
            if (e.key === 'Enter' && !isEnterGuarded()) {
                e.preventDefault();
                const mode = rows[hubActiveIdx]?.getAttribute('data-jw-mode');
                if (mode) openJobWorkSubSection(mode);
                return;
            }
            if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
                e.preventDefault();
                const match = rows.find((r) => r.getAttribute('data-jw-key') === e.key);
                const mode = match?.getAttribute('data-jw-mode');
                if (mode) openJobWorkSubSection(mode);
                return;
            }
            return;
        }

        // WORKERS DIRECTORY NAVIGATION
        if (isVisible('jw-workers-view') && !isVisible('add-jw-worker-form')) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightWorkerRow(workerActiveIdx + 1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightWorkerRow(workerActiveIdx - 1);
                return;
            }
            if (e.key === 'Enter' && !isEnterGuarded() && document.activeElement?.tagName !== 'SELECT') {
                const w = workerTableList[workerActiveIdx];
                if (w) {
                    e.preventDefault();
                    openJobWorkerSheet(w.id);
                }
                return;
            }
            if (!isTyping && workerTableList[workerActiveIdx]) {
                const w = workerTableList[workerActiveIdx];
                if (e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                    editJobWorker(w.id);
                } else if (e.key === 'w' || e.key === 'W') {
                    e.preventDefault();
                    const act = getJobWorkerLastActiveInfo(w.id);
                    sendJobWorkerTagadaWhatsApp(w.id, act.daysAbsent || 0);
                } else if (e.key === 'Delete') {
                    e.preventDefault();
                    deleteJobWorker(w.id);
                }
            }
            return;
        }

        // BILLS DIRECTORY NAVIGATION
        if (isVisible('jw-billing-view') && !isVisible('add-jw-bill-form') && !isVisible('jw-bill-inline-ledger')) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightBillRow(billActiveIdx + 1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightBillRow(billActiveIdx - 1);
                return;
            }
            if (e.key === 'Enter' && !isEnterGuarded()) {
                const b = billTableList[billActiveIdx];
                if (b) {
                    e.preventDefault();
                    openBillInlineLedger(billActiveIdx, b.id);
                }
            }
        }
    };

    /* ========================================================================
       15. GLOBAL EXPORT & INITIALIZATION
       ======================================================================== */
    const jobWorkAPI = {
        openJobWorkModule,
        showJobWorkHub,
        openJobWorkSubSection,
        updateJobWorkHubBadges,
        getJobWorkers,
        saveJobWorkers,
        getJobWorkerLastActiveInfo,
        toggleJobWorkerForm,
        cancelJobWorkerEdit,
        saveNewJobWorker,
        editJobWorker,
        editActiveSheetWorker,
        deleteJobWorker,
        filterJobWorkWorkers,
        renderJobWorkWorkersTable,
        onWorkerRowClick,
        sendJobWorkerTagadaWhatsApp,
        getJobWorkerSheets,
        saveJobWorkerSheets,
        calculateJobWorkSheetTotals,
        getJobWorkerOverallSummary,
        getKarigerAvailableSareeStock,
        updateJwKarigerLiveStockBadge,
        openJobWorkerSheet,
        closeJobWorkerSheet,
        renderJobWorkSheetTabs,
        switchJobWorkerSheetTab,
        addNewJobWorkerMonthlySheet,
        deleteJobWorkerMonthlySheet,
        loadCurrentJobWorkSheet,
        saveJobWorkSheetConfig,
        populateKarigersDatalist,
        addSheetBatchRow,
        removeSheetBatchItem,
        pickSheetItem,
        cancelSheetAccept,
        printLastSheetChallan,
        printSavedBatchRow,
        printJobWorkSheetReport,
        openInlineBatchDrawer,
        closeInlineBatchDrawer,
        switchInlineDrawerType,
        startInlineBatchItemEdit,
        cancelInlineBatchItemEdit,
        saveInlineBatchItemEdit,
        addDiyaBatchKarigarItem,
        removeDiyaBatchItem,
        renderDiyaBatchChips,
        addAayiBatchKarigarItem,
        removeAayiBatchItem,
        renderAayiBatchChips,
        saveJobWorkBatchLine,
        renderJobWorkSheetTable,
        deleteJobWorkBatchRow,
        openJwBatchModal,
        closeJwBatchModal,
        renderJwBatchModalTable,
        editJwBatchItem,
        deleteJwBatchItem,
        getJwBills,
        saveJwBills,
        getJwPayments,
        saveJwPayments,
        initJobWorkBillingView,
        populateWorkerSelectOptions,
        pickBillWorker,
        toggleAddJwBillForm,
        saveJobWorkNewBill,
        getJwBillingStats,
        switchJwBillTab,
        filterJwBills,
        renderJwBillsTable,
        openBillInlineLedger,
        closeBillInlineLedger,
        saveInlineBillPayment,
        viewJwBillPassbook,
        deleteJwPaymentEntry,
        openJwPayModal,
        closeJwPayModal,
        saveJobWorkPayment,
        sendJwPaymentWhatsAppReceipt,
        deleteJwBill,
        shareJobWorkOnWhatsApp,
        setJwMovementToday,
        switchJwMovementTab,
        renderJwMovementDaybook,
        printJwMovementDaybook,
        invalidateJobWorkCache
    };

    Object.keys(jobWorkAPI).forEach((fnName) => {
        window[fnName] = jobWorkAPI[fnName];
    });

    window.JobWorkEngine = jobWorkAPI;

    const initBindings = () => {
        const sec = document.getElementById('jobwork-section');
        if (sec) lockNumberStepping(sec);

        const workerSearch = document.getElementById('jw-search-worker-input');
        if (workerSearch) {
            const debounced = (typeof window.debounce === 'function')
                ? window.debounce(filterJobWorkWorkers, 200)
                : filterJobWorkWorkers;
            workerSearch.addEventListener('input', debounced);
        }

        const billSearch = document.getElementById('jw-search-bill-input');
        if (billSearch) {
            const debounced = (typeof window.debounce === 'function')
                ? window.debounce(filterJwBills, 200)
                : filterJwBills;
            billSearch.addEventListener('input', debounced);
        }

        const movSearch = document.getElementById('jw-mov-search');
        if (movSearch) {
            const debounced = (typeof window.debounce === 'function')
                ? window.debounce(renderJwMovementDaybook, 200)
                : renderJwMovementDaybook;
            movSearch.addEventListener('input', debounced);
        }

        bindSheetVoucherEvents();
        bindWorkerAndBillFormEvents();

        window.removeEventListener('keydown', handleGlobalJobWorkKeydown, false);
        window.addEventListener('keydown', handleGlobalJobWorkKeydown, false);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBindings);
    } else {
        setTimeout(initBindings, 30);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = jobWorkAPI;
    }
})();
