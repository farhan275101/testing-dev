/* ============================================================================
   SIMPLICITY ERP - PAYMENTS & PARTY LEDGER ENGINE (TALLYPRIME WHITE & GOLD)
   File: payment/payment.js • Developed by Farhan Jawed
   (100% Supabase-Safe | Inline Party Ledger -> F5 Payment -> F8 Tani Sheet)
============================================================================ */

(() => {
    'use strict';

    /* ========================================================================
       1. GLOBAL STATE & MEMOIZATION POOL
       ======================================================================== */
    window.currentPaymentKarkhanaFilter = 'all';
    window.activePaymentKarigerId = null;
    window.activePaymentKarigerName = '';

    const WEAVER_BAKAYA_CACHE = new Map();
    let paymentSearchDebounceTimer = null;
    let passbookSearchDebounceTimer = null;

    // View State: 'list' (Party Ledgers) | 'ledger' (Inline Party Ledger)
    let paymentViewMode = 'list';
    let paymentListActiveIdx = 0;

    // Main Payment Table Pagination State (15 Items / Page)
    let paymentTableCurrentPage = 1;
    const PAYMENT_TABLE_PAGE_SIZE = 15;
    let currentPaymentFilteredRowsCache = [];

    // Ledger/Passbook Pagination State (20 Items / Page)
    let paymentPassbookCurrentPage = 1;
    const PAYMENT_PASSBOOK_PAGE_SIZE = 20;
    let filteredPaymentPassbookCache = [];
    let paymentLedgerActiveIdx = 0;

    const invalidatePaymentCache = (karigerId) => {
        if (karigerId) {
            WEAVER_BAKAYA_CACHE.delete(String(karigerId).trim());
        } else {
            WEAVER_BAKAYA_CACHE.clear();
        }
    };

    /* ========================================================================
       2. SAFE DOM & DATA SANITIZATION UTILITIES
       ======================================================================== */
    const esc = (s) => {
        if (typeof window.sanitizeHTML === 'function') return window.sanitizeHTML(s);
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    const escJsAttr = (s) => encodeURIComponent(String(s || '')).replace(/'/g, '%27');

    const safeGetStore = (key) => {
        try {
            const raw = typeof window.getStore === 'function' ? window.getStore(key) : [];
            return typeof window.safeArray === 'function' ? window.safeArray(raw) : (Array.isArray(raw) ? raw : []);
        } catch (_) {
            return [];
        }
    };

    const safeNum = (val, fallback = 0) => {
        const n = parseFloat(val);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const roundCurrency = (val) => {
        const num = parseFloat(val);
        if (isNaN(num) || !isFinite(num)) return 0;
        return Math.round((num + Number.EPSILON) * 100) / 100;
    };

    const setDisplay = (id, val) => {
        if (typeof window.setDisplay === 'function') {
            window.setDisplay(id, val);
        } else {
            const el = document.getElementById(id);
            if (el) el.style.display = val;
        }
    };

    const setText = (id, val) => {
        if (typeof window.setElementText === 'function') {
            window.setElementText(id, val);
        } else {
            const el = document.getElementById(id);
            if (el) el.textContent = (val !== undefined && val !== null) ? val : '';
        }
    };

    const getToday = () => {
        return (typeof window.getTodayDate === 'function')
            ? window.getTodayDate()
            : new Date().toISOString().split('T')[0];
    };

    const isAnyExpressOverlayOpen = () => {
        return Boolean(
            document.getElementById('kariger-express-modal') ||
            document.getElementById('master-stock-express-modal') ||
            document.getElementById('master-jobwork-express-modal')
        );
    };

    /* ========================================================================
       3. SCOPED TALLYPRIME WHITE & GOLD STYLES FOR #payment-section
       ======================================================================== */
    const ensurePaymentTallyStyles = () => {
        if (document.getElementById('payment-tally-styles')) return;
        const style = document.createElement('style');
        style.id = 'payment-tally-styles';
        style.textContent = `
            #payment-section {
                padding: 0 !important;
                overflow: hidden;
                font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            }
            #payment-section .module-header {
                background: #fdf6e2 !important;
                border-bottom: 1.5px solid #e5d5a7 !important;
                padding: 12px 20px !important;
                margin-bottom: 0 !important;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            #payment-section .module-header h2 {
                color: #1f2937 !important;
                font-size: 17px !important;
                font-weight: 800 !important;
                margin: 0 !important;
            }
            #payment-section .back-btn {
                background: #ffffff !important;
                color: #374151 !important;
                border: 1px solid #d1d5db !important;
                border-radius: 6px !important;
                padding: 6px 12px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                cursor: pointer;
            }
            #payment-section .back-btn:hover {
                border-color: #d9a425 !important;
                background: #fef9ea !important;
            }
            #payment-section #payment-karkhana-tabs-bar {
                padding: 12px 20px 0 20px;
                margin-bottom: 10px !important;
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }
            #payment-section .sheet-tab {
                background: #ffffff !important;
                color: #374151 !important;
                border: 1px solid #d1d5db !important;
                border-radius: 5px !important;
                padding: 5px 12px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                cursor: pointer;
            }
            #payment-section .sheet-tab.active {
                background: #f2b71d !important;
                color: #1f2937 !important;
                border-color: #d9a425 !important;
                font-weight: 800 !important;
            }
            #payment-section .pay-summary-strip {
                margin: 0 20px 10px 20px !important;
                padding: 9px 16px !important;
                background: #fdfcf7 !important;
                border: 1px solid #e5d5a7 !important;
                border-radius: 6px !important;
                display: flex !important;
                justify-content: space-between;
                align-items: center;
                gap: 14px !important;
            }
            #payment-section .pay-summary-strip > div {
                background: transparent !important;
                border: none !important;
                padding: 0 !important;
                border-radius: 0 !important;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                font-weight: 700;
                color: #6b7280;
            }
            #payment-section .pay-summary-strip h3 {
                margin: 0 !important;
                font-size: 15px !important;
                font-weight: 800 !important;
                color: #b47d00 !important;
            }
            #payment-section .filter-panel {
                padding: 0 20px 10px 20px;
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: wrap;
            }
            #payment-section .search-box {
                flex: 1;
                min-width: 200px;
                padding: 7px 12px !important;
                border: 1px solid #d1d5db !important;
                border-radius: 5px !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                background: #ffffff !important;
                color: #111827 !important;
                outline: none;
            }
            #payment-section .search-box:focus {
                border-color: #d9a425 !important;
                background: #fffdf5 !important;
                box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.2);
            }
            #payment-section .table-responsive {
                padding: 0 20px;
                box-sizing: border-box;
            }
            #payment-section table {
                width: 100%;
                border-collapse: collapse;
                border: 1px solid #e5d5a7;
                background: #ffffff;
            }
            #payment-section table thead tr {
                background: #fdf6e2 !important;
                color: #1f2937 !important;
            }
            #payment-section table th {
                padding: 9px 12px !important;
                font-size: 12px !important;
                font-weight: 800 !important;
                color: #1f2937 !important;
                border-bottom: 1.5px solid #e5d5a7 !important;
                text-align: left;
            }
            #payment-section table td {
                padding: 9px 12px !important;
                font-size: 13px !important;
                color: #1f2937 !important;
                border-bottom: 1px solid #f3f4f6 !important;
            }
            #payment-section .pay-main-tbl th:nth-child(8),
            #payment-section .pay-main-tbl td:nth-child(8) {
                display: none !important;
            }
            #payment-section .pay-main-tbl th:nth-child(9) {
                text-align: right !important;
            }
            #payment-section .pay-ledger-row,
            #payment-section .pay-pass-row {
                cursor: pointer;
                transition: background 0.1s ease;
            }
            #payment-section .pay-ledger-row:hover,
            #payment-section .pay-pass-row:hover {
                background: #fef9ea !important;
            }
            #payment-section .pay-ledger-row.active,
            #payment-section .pay-pass-row.active {
                background: #f2b71d !important;
                color: #1f2937 !important;
            }
            #payment-section .pay-ledger-row.active td,
            #payment-section .pay-pass-row.active td {
                font-weight: 700 !important;
                color: #1f2937 !important;
            }
            #payment-section .pay-tally-btn {
                background: #ffffff;
                color: #1f2937;
                border: 1px solid #d1d5db;
                border-radius: 5px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
            }
            #payment-section .pay-tally-btn:hover {
                border-color: #d9a425;
                background: #fef9ea;
            }
            #payment-section .pay-tally-btn-gold {
                background: #f2b71d;
                color: #1f2937;
                border: 1px solid #d9a425;
                border-radius: 5px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                white-space: nowrap;
            }
            #payment-section .pay-tally-btn-gold:hover { background: #e5aa12; }
            #payment-section .pay-status-strip {
                background: #fdf6e2;
                border-top: 1px solid #e5d5a7;
                padding: 9px 20px;
                margin-top: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                font-size: 11.5px;
                color: #6b7280;
                font-weight: 600;
            }
            .pay-modal-overlay {
                position: fixed; inset: 0;
                background: rgba(31, 41, 55, 0.38);
                backdrop-filter: blur(2px);
                z-index: 999999;
                display: flex; align-items: center; justify-content: center;
                padding: 15px; box-sizing: border-box;
                font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            }
            .pay-modal-card {
                background: #ffffff;
                width: 100%; max-width: 470px;
                border: 1.5px solid #d9b86c;
                border-radius: 8px;
                box-shadow: 0 18px 42px rgba(0, 0, 0, 0.16);
                overflow: hidden;
                color: #1f2937;
            }
            .pay-modal-head {
                background: #fdf6e2;
                border-bottom: 1.5px solid #e5d5a7;
                padding: 11px 16px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .pay-modal-head h3 {
                margin: 0; font-size: 15px; font-weight: 800; color: #1f2937;
            }
            .pay-modal-inp {
                width: 100%; box-sizing: border-box;
                padding: 7px 10px;
                border: 1px solid #d1d5db; border-radius: 4px;
                font-size: 13px; font-weight: 700; color: #111827;
                background: #ffffff; outline: none;
            }
            .pay-modal-inp:focus {
                border-color: #d9a425 !important;
                background: #fffdf5 !important;
                box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.22);
            }
            .pay-accept-bar {
                background: #fdf6e2;
                border: 1.5px solid #d9a425;
                border-radius: 5px;
                padding: 8px 12px;
                margin-top: 10px;
                display: flex; justify-content: space-between; align-items: center; gap: 10px;
            }
        `;
        document.head.appendChild(style);
    };

    /* ========================================================================
       4. VIEW CONTROLLER: PARTY LIST vs INLINE PARTY LEDGER
       ======================================================================== */
    const setPaymentViewMode = (mode) => {
        paymentViewMode = mode; // 'list' | 'ledger'
        const sec = document.getElementById('payment-section');
        if (!sec) return;

        const kTabsBar = document.getElementById('payment-karkhana-tabs-bar');
        const paidEl = document.getElementById('total-paid-display');
        const sumStrip = paidEl?.closest('.pay-summary-strip') || paidEl?.parentElement?.parentElement;
        if (sumStrip && !sumStrip.classList.contains('pay-summary-strip')) {
            sumStrip.classList.add('pay-summary-strip');
        }
        const filterPanel = sec.querySelector(':scope > .filter-panel');
        const mainTbl = document.getElementById('payment-table-body')?.closest('.table-responsive');
        const mainPager = document.getElementById('payment-table-pagination-controls');
        const mainStrip = document.getElementById('payment-main-status-strip');
        const ledgerView = document.getElementById('payment-inline-ledger-view');
        const headerTitle = sec.querySelector('.module-header h2');
        const headerBackBtn = sec.querySelector('.module-header .back-btn');

        const isList = (mode === 'list');
        if (kTabsBar) kTabsBar.style.display = isList ? 'flex' : 'none';
        if (sumStrip) sumStrip.style.display = isList ? 'flex' : 'none';
        if (filterPanel) filterPanel.style.display = isList ? 'flex' : 'none';
        if (mainTbl) mainTbl.style.display = isList ? 'block' : 'none';
        if (mainPager) mainPager.style.display = isList ? 'flex' : 'none';
        if (mainStrip) mainStrip.style.display = isList ? 'flex' : 'none';
        if (ledgerView) ledgerView.style.display = isList ? 'none' : 'block';

        if (headerTitle) {
            headerTitle.textContent = isList
                ? 'Payments & Party Ledgers'
                : `Party Ledger: ${window.activePaymentKarigerName || 'Kariger'}`;
        }
        if (headerBackBtn) {
            headerBackBtn.textContent = isList ? '← [Esc] Dashboard' : '← [Esc] Party List';
        }
    };

    const handlePaymentBackStep = () => {
        if (paymentViewMode === 'ledger') {
            setPaymentViewMode('list');
            renderPaymentTable();
            return;
        }
        if (typeof window.backToDashboard === 'function') {
            window.backToDashboard();
        }
    };

    /* ========================================================================
       5. NAVIGATION & BRANCH TABS CONTROLLER
       ======================================================================== */
    const openPaymentModule = () => {
        ensurePaymentTallyStyles();
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';

        setDisplay('payment-section', 'block');
        setPaymentViewMode('list');
        paymentListActiveIdx = 0;

        renderPaymentKarkhanaTabs();
        renderPaymentTable();
        bindPaymentSearchInput();
        bindPaymentKeyboardEngine();
    };

    const renderPaymentKarkhanaTabs = () => {
        const bar = document.getElementById('payment-karkhana-tabs-bar');
        if (!bar) return;

        let karkhanas = [];
        if (typeof window.getKarkhanasSafe === 'function') {
            karkhanas = window.getKarkhanasSafe();
        } else {
            karkhanas = safeGetStore('karkhana_list');
        }
        if (!karkhanas.length) {
            karkhanas = [{ id: 'k_main', name: 'Main Godown', isDefault: true }];
        }

        const isAllActive = (window.currentPaymentKarkhanaFilter === 'all') ? ' active' : '';

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; width:100%;">
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                    <button type="button" class="sheet-tab${isAllActive}" onclick="switchPaymentKarkhanaTab('all')">Sabhi Godam</button>`;

        karkhanas.forEach((k) => {
            const isActive = (String(window.currentPaymentKarkhanaFilter) === String(k.id)) ? ' active' : '';
            html += `<button type="button" class="sheet-tab${isActive}" onclick="switchPaymentKarkhanaTab(decodeURIComponent('${escJsAttr(k.id)}'))">${esc(k.name)}</button>`;
        });

        html += `
                </div>
                <div>
                    <button type="button" class="pay-tally-btn" onclick="openCashTransferModal()">
                        Contra / Cash Transfer [F4]
                    </button>
                </div>
            </div>`;

        bar.innerHTML = html;
    };

    const switchPaymentKarkhanaTab = (kId) => {
        window.currentPaymentKarkhanaFilter = kId || 'all';
        paymentTableCurrentPage = 1;
        paymentListActiveIdx = 0;
        renderPaymentKarkhanaTabs();
        renderPaymentTable();
    };

    const cyclePaymentKarkhanaTab = () => {
        let karkhanas = (typeof window.getKarkhanasSafe === 'function')
            ? window.getKarkhanasSafe()
            : safeGetStore('karkhana_list');
        if (!karkhanas.length) karkhanas = [{ id: 'k_main', name: 'Main Godown' }];
        const ids = ['all', ...karkhanas.map(k => String(k.id))];
        const curIdx = ids.indexOf(String(window.currentPaymentKarkhanaFilter));
        switchPaymentKarkhanaTab(ids[(curIdx + 1) % ids.length]);
    };

    const filterPayment = () => {
        paymentTableCurrentPage = 1;
        paymentListActiveIdx = 0;
        renderPaymentTable();
    };

    const bindPaymentSearchInput = () => {
        const searchInput = document.getElementById('search-payment-input');
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.dataset.bound = 'true';
            searchInput.addEventListener('input', () => {
                clearTimeout(paymentSearchDebounceTimer);
                paymentSearchDebounceTimer = setTimeout(() => {
                    paymentTableCurrentPage = 1;
                    paymentListActiveIdx = 0;
                    renderPaymentTable();
                }, 150);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    e.preventDefault();
                    searchInput.blur();
                    if (e.key === 'Enter' && currentPaymentFilteredRowsCache.length > 0) {
                        const pageRows = getPaymentCurrentPageRows();
                        const chosen = pageRows[paymentListActiveIdx] || pageRows[0];
                        if (chosen) openPaymentPassbook(chosen.id, chosen.kariger);
                    }
                }
            });
        }
    };

    /* ========================================================================
       6. MEMOIZED WEAVER BAKAYA RESOLVER (INCLUDES PICHLA BANI FIX)
       ======================================================================== */
    const getWeaverWageMetrics = (kId) => {
        if (!kId) return { mazdoori: 0, diya: 0, baki: 0 };
        const cleanId = String(kId).trim();

        if (WEAVER_BAKAYA_CACHE.has(cleanId)) {
            return WEAVER_BAKAYA_CACHE.get(cleanId);
        }

        const sheets = (typeof window.getKarigerSheets === 'function')
            ? window.getKarigerSheets(cleanId)
            : [];
        const curSheet = (sheets && sheets.length) ? sheets[sheets.length - 1] : null;

        let mazdoori = 0;
        let diya = 0;
        let baki = 0;

        if (curSheet && typeof window.calculateSheetTotals === 'function') {
            const calc = window.calculateSheetTotals(curSheet);
            // Fix: Include carried-forward pichlaBani so total due (Mazdoori) never shows ₹ 0.00 when pichlaBani exists
            mazdoori = roundCurrency(safeNum(curSheet.pichlaBani) + safeNum(calc.grossBani));
            diya = roundCurrency(calc.totPaid);
            baki = roundCurrency(calc.remainingAmt);
        }

        const metrics = { mazdoori, diya, baki };
        WEAVER_BAKAYA_CACHE.set(cleanId, metrics);
        return metrics;
    };

    const getPaymentCurrentPageRows = () => {
        const startIndex = (paymentTableCurrentPage - 1) * PAYMENT_TABLE_PAGE_SIZE;
        return currentPaymentFilteredRowsCache.slice(startIndex, startIndex + PAYMENT_TABLE_PAGE_SIZE);
    };

    const highlightPaymentListRow = (idx) => {
        const rows = Array.from(document.querySelectorAll('#payment-table-body .pay-ledger-row'));
        if (!rows.length) return;
        paymentListActiveIdx = ((idx % rows.length) + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle('active', i === paymentListActiveIdx));
        rows[paymentListActiveIdx]?.scrollIntoView({ block: 'nearest' });
    };

    /* ========================================================================
       7. MAIN PARTY LEDGERS TABLE (CLEAN WHITE & GOLD — ZERO ROW BUTTONS)
       ======================================================================== */
    const renderPaymentTable = () => {
        ensurePaymentTallyStyles();
        bindPaymentSearchInput();

        const tbody = document.getElementById('payment-table-body');
        if (!tbody) return;

        const tbl = tbody.closest('table');
        if (tbl && !tbl.classList.contains('pay-main-tbl')) {
            tbl.classList.add('pay-main-tbl');
        }

        const paidEl = document.getElementById('total-paid-display');
        const sumStrip = paidEl?.parentElement?.parentElement;
        if (sumStrip && !sumStrip.classList.contains('pay-summary-strip')) {
            sumStrip.classList.add('pay-summary-strip');
        }

        let karigers = safeGetStore('kariger_list')
            .filter((k) => k && k.name && String(k.name).trim() !== '');

        if (window.currentPaymentKarkhanaFilter !== 'all') {
            karigers = karigers.filter((k) =>
                String(k.karkhanaId) === String(window.currentPaymentKarkhanaFilter) ||
                (!k.karkhanaId && window.currentPaymentKarkhanaFilter === 'k_main')
            );
        }

        const searchInp = document.getElementById('search-payment-input');
        const searchTxt = searchInp ? searchInp.value.toLowerCase().trim() : '';

        if (searchInp && searchInp.parentElement) {
            if (!document.getElementById('payment-table-pay-btn')) {
                const payBtn = document.createElement('button');
                payBtn.id = 'payment-table-pay-btn';
                payBtn.type = 'button';
                payBtn.className = 'pay-tally-btn-gold';
                payBtn.innerHTML = 'Payment Voucher [F5]';
                payBtn.onclick = () => triggerSelectedQuickPay();
                searchInp.parentElement.appendChild(payBtn);
            }
            if (!document.getElementById('payment-table-print-btn')) {
                const printBtn = document.createElement('button');
                printBtn.id = 'payment-table-print-btn';
                printBtn.type = 'button';
                printBtn.className = 'pay-tally-btn';
                printBtn.innerHTML = 'A6 Print [Alt+P]';
                printBtn.onclick = () => printPaymentReport();
                searchInp.parentElement.appendChild(printBtn);
            }
        }

        let grandTotalPaid = 0;
        let grandTotalBaki = 0;
        const rowsData = [];

        karigers.forEach((k) => {
            const metrics = getWeaverWageMetrics(k.id);

            grandTotalPaid += metrics.diya;
            grandTotalBaki += metrics.baki;

            const kName = k.name || 'Kariger';
            const sName = k.saree || '-';
            const gName = k.karkhanaName || ((typeof window.getKarkhanaNameById === 'function')
                ? window.getKarkhanaNameById(k.karkhanaId)
                : 'Main Godown');

            const rowObj = {
                id: k.id,
                karkhanaId: k.karkhanaId || 'k_main',
                karkhana: gName,
                kariger: kName,
                saree: sName,
                mazdoori: metrics.mazdoori,
                diya: metrics.diya,
                baki: metrics.baki
            };

            if (searchTxt) {
                const fullText = `${rowObj.karkhana} ${rowObj.kariger} ${rowObj.saree} ${rowObj.mazdoori} ${rowObj.diya} ${rowObj.baki}`.toLowerCase();
                if (fullText.includes(searchTxt)) {
                    rowsData.push(rowObj);
                }
            } else {
                rowsData.push(rowObj);
            }
        });

        currentPaymentFilteredRowsCache = rowsData;

        setText('total-paid-display', `₹ ${roundCurrency(grandTotalPaid).toFixed(2)}`);
        setText('total-baki-display', `₹ ${roundCurrency(grandTotalBaki).toFixed(2)}`);

        const totalEntries = rowsData.length;
        const sec = document.getElementById('payment-section');
        let pager = document.getElementById('payment-table-pagination-controls');
        if (!pager) {
            const tblWrap = tbody.closest('.table-responsive') || tbody.parentElement;
            if (tblWrap && tblWrap.parentElement) {
                pager = document.createElement('div');
                pager.id = 'payment-table-pagination-controls';
                pager.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin:10px 20px 0 20px; padding:8px 0; border-top:1px solid #eadab0; flex-wrap:wrap; gap:8px;';
                tblWrap.insertAdjacentElement('afterend', pager);
                if (paymentViewMode !== 'list') pager.style.display = 'none';
            }
        }

        if (sec && !document.getElementById('payment-main-status-strip')) {
            const strip = document.createElement('div');
            strip.id = 'payment-main-status-strip';
            strip.className = 'pay-status-strip';
            strip.innerHTML = `
                <span style="color:#92400e; font-weight:700;">[↑ ↓] Party Chunein · [Enter / Click] Open Ledger · [F5] Payment · [F4] Cash Transfer · [F2] Godam · [/] Search · [Esc] Back</span>
                <span id="payment-main-count-lbl">0 Parties</span>
            `;
            sec.appendChild(strip);
            if (paymentViewMode !== 'list') strip.style.display = 'none';
        }

        if (!totalEntries) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:22px; color:#6b7280;">Koi Kariger Record nahi mila.</td></tr>';
            if (pager) pager.innerHTML = '';
        } else {
            const totalPages = Math.ceil(totalEntries / PAYMENT_TABLE_PAGE_SIZE) || 1;
            if (paymentTableCurrentPage > totalPages) paymentTableCurrentPage = totalPages;
            if (paymentTableCurrentPage < 1) paymentTableCurrentPage = 1;

            const startIndex = (paymentTableCurrentPage - 1) * PAYMENT_TABLE_PAGE_SIZE;
            const pageRows = rowsData.slice(startIndex, startIndex + PAYMENT_TABLE_PAGE_SIZE);
            if (paymentListActiveIdx >= pageRows.length) paymentListActiveIdx = 0;
            if (paymentListActiveIdx < 0) paymentListActiveIdx = 0;

            let html = '';
            pageRows.forEach((r, idx) => {
                const safeKName = escJsAttr(r.kariger);
                const safeId = escJsAttr(r.id);
                const activeCls = (idx === paymentListActiveIdx) ? ' active' : '';

                html += `<tr class="pay-ledger-row${activeCls}" data-payidx="${idx}" onclick="window.__paySelectAndOpen(${idx}, decodeURIComponent('${safeId}'), decodeURIComponent('${safeKName}'))">
                    <td>${startIndex + idx + 1}</td>
                    <td>${esc(r.karkhana)}</td>
                    <td><strong>${esc(r.kariger)}</strong></td>
                    <td>${esc(r.saree)}</td>
                    <td style="font-weight:700;">₹ ${r.mazdoori.toFixed(2)}</td>
                    <td style="font-weight:700; color:#6b7280;">₹ ${r.diya.toFixed(2)}</td>
                    <td style="font-weight:800; color:#b47d00;">₹ ${r.baki.toFixed(2)}</td>
                    <td></td>
                    <td style="text-align:right; font-weight:700; font-size:12px;">Ledger →</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            if (pager) {
                pager.innerHTML = `
                    <div style="font-size:12px; color:#6b7280; font-weight:600;">
                        Showing <strong>${startIndex + 1}</strong> - <strong>${Math.min(startIndex + PAYMENT_TABLE_PAGE_SIZE, totalEntries)}</strong> of <strong>${totalEntries}</strong> Parties
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button type="button" class="pay-tally-btn" ${paymentTableCurrentPage <= 1 ? 'disabled style="opacity:0.45; cursor:not-allowed;"' : ''} onclick="changePaymentTablePage(-1)">◀ Prev</button>
                        <span style="font-size:12px; font-weight:700; padding:4px 8px; background:#fdf6e2; border:1px solid #e5d5a7; border-radius:4px;">${paymentTableCurrentPage} / ${totalPages}</span>
                        <button type="button" class="pay-tally-btn" ${paymentTableCurrentPage >= totalPages ? 'disabled style="opacity:0.45; cursor:not-allowed;"' : ''} onclick="changePaymentTablePage(1)">Next ▶</button>
                    </div>`;
            }
        }

        const cntLbl = document.getElementById('payment-main-count-lbl');
        if (cntLbl) cntLbl.textContent = `${totalEntries} Parties`;
    };

    window.__paySelectAndOpen = (idx, id, name) => {
        highlightPaymentListRow(idx);
        openPaymentPassbook(id, name);
    };

    const triggerSelectedQuickPay = () => {
        if (paymentViewMode === 'ledger' && window.activePaymentKarigerId) {
            const kList = safeGetStore('kariger_list');
            const k = kList.find(x => String(x.id) === String(window.activePaymentKarigerId));
            const metrics = getWeaverWageMetrics(window.activePaymentKarigerId);
            openQuickPayModal(
                window.activePaymentKarigerId,
                escJsAttr(window.activePaymentKarigerName || k?.name || 'Kariger'),
                escJsAttr(k?.karkhanaId || 'k_main'),
                metrics.baki
            );
            return;
        }

        const pageRows = getPaymentCurrentPageRows();
        const chosen = pageRows[paymentListActiveIdx];
        if (!chosen) return alert('Pehle koi Kariger chunein!');
        openQuickPayModal(chosen.id, escJsAttr(chosen.kariger), escJsAttr(chosen.karkhanaId), chosen.baki);
    };

    const changePaymentTablePage = (delta) => {
        paymentTableCurrentPage += delta;
        paymentListActiveIdx = 0;
        renderPaymentTable();
    };

    /* ========================================================================
       8. TALLY PAYMENT VOUCHER MODAL (F5 — WHITE & GOLD + ACCEPT? Y/N)
       ======================================================================== */
    const showQuickPayAcceptStrip = (show) => {
        const bar = document.getElementById('qp-accept-strip');
        if (!bar) return;
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            document.getElementById('qp-accept-yes')?.focus();
        }
    };

    const openQuickPayModal = (karigerId, safeKName, safeKid, bakiAmt) => {
        ensurePaymentTallyStyles();
        const karigerName = decodeURIComponent(safeKName || '');
        const karkhanaId = decodeURIComponent(safeKid || '');
        const encodedKarigerId = escJsAttr(karigerId);

        const existingModal = document.getElementById('quick-pay-modal');
        if (existingModal) existingModal.remove();

        const today = getToday();
        const godamName = (typeof window.getKarkhanaNameById === 'function')
            ? window.getKarkhanaNameById(karkhanaId)
            : 'Main Godown';

        const modalHtml = `
            <div id="quick-pay-modal" class="pay-modal-overlay">
                <div class="pay-modal-card">
                    <div class="pay-modal-head">
                        <h3>Payment Voucher (F5)</h3>
                        <button type="button" class="pay-tally-btn" onclick="closeQuickPayModal()">&larr; [Esc] Close</button>
                    </div>
                    <div style="padding:16px;">
                        <div style="background:#fdf6e2; border:1px solid #e5d5a7; border-radius:6px; padding:10px 12px; margin-bottom:12px; font-size:12.5px;">
                            <div style="display:flex; justify-content:space-between;">
                                <span><strong>Account :</strong> Cash (${esc(godamName)})</span>
                                <span><strong>Vch :</strong> Payment</span>
                            </div>
                            <div style="margin-top:4px;"><strong>Particulars :</strong> ${esc(karigerName)}</div>
                            <div style="color:#b47d00; font-weight:800; font-size:13.5px; margin-top:4px;">Cur Bal (Baki): ₹ ${roundCurrency(bakiAmt).toFixed(2)}</div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Amount (₹) :</label>
                                <input type="number" step="0.01" id="quick-pay-amount" placeholder="0.00" class="pay-modal-inp" style="text-align:right; font-size:15px;">
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Date :</label>
                                <input type="date" id="quick-pay-date" value="${today}" class="pay-modal-inp">
                            </div>
                        </div>
                        <div style="margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Narration / Note (Optional) :</label>
                            <input type="text" id="quick-pay-note" placeholder="e.g. Weekly Hafta payment" class="pay-modal-inp">
                        </div>

                        <div id="qp-accept-strip" class="pay-accept-bar" style="display:none;">
                            <span style="font-size:13px; font-weight:800; color:#1f2937;">Accept? Payment Save Karein?</span>
                            <div style="display:flex; gap:8px;">
                                <button type="button" id="qp-accept-yes" class="pay-tally-btn-gold" onclick="submitQuickPayForm(decodeURIComponent('${encodedKarigerId}'), '${escJsAttr(karigerName)}', '${escJsAttr(karkhanaId)}')">Yes [Y / Enter]</button>
                                <button type="button" id="qp-accept-no" class="pay-tally-btn" onclick="window.__qpCancelAccept()">No [N / Esc]</button>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                            <button type="button" class="pay-tally-btn" onclick="closeQuickPayModal()">Cancel [Esc]</button>
                            <button type="button" class="pay-tally-btn-gold" onclick="submitQuickPayForm(decodeURIComponent('${encodedKarigerId}'), '${escJsAttr(karigerName)}', '${escJsAttr(karkhanaId)}')">Save Payment [Ctrl+Enter]</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        window.__qpCancelAccept = () => {
            showQuickPayAcceptStrip(false);
            document.getElementById('quick-pay-note')?.focus();
        };

        const yesBtn = document.getElementById('qp-accept-yes');
        if (yesBtn) {
            yesBtn.addEventListener('keydown', (e) => {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    submitQuickPayForm(karigerId, escJsAttr(karigerName), escJsAttr(karkhanaId));
                } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.__qpCancelAccept();
                }
            });
        }

        const order = ['quick-pay-amount', 'quick-pay-date', 'quick-pay-note'];
        order.forEach((fid, i) => {
            const el = document.getElementById(fid);
            if (!el) return;
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    submitQuickPayForm(karigerId, escJsAttr(karigerName), escJsAttr(karkhanaId));
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (i > 0) document.getElementById(order[i - 1])?.focus();
                        return;
                    }
                    if (i < order.length - 1) {
                        const nxt = document.getElementById(order[i + 1]);
                        if (nxt) { nxt.focus(); if (nxt.select) nxt.select(); }
                    } else {
                        showQuickPayAcceptStrip(true);
                    }
                }
            });
        });

        setTimeout(() => {
            const amtEl = document.getElementById('quick-pay-amount');
            if (amtEl) { amtEl.focus(); amtEl.select(); }
        }, 50);
    };

    const closeQuickPayModal = () => {
        const modal = document.getElementById('quick-pay-modal');
        if (modal) modal.remove();
    };

    const submitQuickPayForm = (karigerId, safeKName, safeKid) => {
        showQuickPayAcceptStrip(false);
        const karigerName = decodeURIComponent(safeKName || '');
        const karkhanaId = decodeURIComponent(safeKid || '');

        const amt = roundCurrency(document.getElementById('quick-pay-amount')?.value);
        const payDate = document.getElementById('quick-pay-date')?.value || getToday();
        const note = String(document.getElementById('quick-pay-note')?.value || '').trim();

        if (amt <= 0) {
            alert('Kripya sahi raqam (Amount ₹) daalein!');
            document.getElementById('quick-pay-amount')?.focus();
            return;
        }

        try {
            // 1. Kariger Tani Sheet Update
            let sheets = (typeof window.getKarigerSheets === 'function')
                ? window.getKarigerSheets(karigerId)
                : [];

            if (!sheets || !sheets.length) {
                sheets = [{
                    id: 'tani_1',
                    title: 'Tani 1',
                    pichlaBana: 0,
                    pichlaZari: 0,
                    pichlaBani: 0,
                    banaWaste: 0,
                    zariWaste: 0,
                    rateBana: 0.311,
                    rateZari: 0.110,
                    rateBani: 240,
                    note: '',
                    rows: []
                }];
            }

            const activeSheet = sheets[sheets.length - 1];
            activeSheet.rows = window.safeArray ? window.safeArray(activeSheet.rows) : (Array.isArray(activeSheet.rows) ? activeSheet.rows : []);

            const payRef = `pay_${Date.now()}`;
            const newRow = {
                id: payRef,
                date: payDate,
                cone: 0,
                lessTp: 0,
                netBana: 0,
                zariQty: 0,
                topi: 0,
                netZari: 0,
                saree: 0,
                lott: 0,
                paid: amt,
                retBana: 0,
                retZari: 0,
                banaItem: activeSheet.banaItem || '',
                zariItem: activeSheet.zariItem || '',
                note: note || 'Mazdoori Payment'
            };

            activeSheet.rows.push(newRow);

            if (typeof window.saveKarigerSheets === 'function') {
                window.saveKarigerSheets(karigerId, sheets);
            }

            // 2. DEDICATED PAYMENTS STORE RECORD (Saved to Supabase 'payments' table)
            const payRecords = safeGetStore('payment_records');
            payRecords.push({
                id: `pay_rec_${Date.now()}`,
                date: payDate,
                type: 'kariger_mazdoori',
                category: 'Kariger Mazdoori',
                party: karigerName,
                karigerId: karigerId,
                karkhanaId: karkhanaId,
                amount: amt,
                paymentMode: 'Cash',
                remarks: `Kariger Mazdoori: ${karigerName}${note ? ` (${note})` : ''}`,
                refId: payRef,
                timestamp: Date.now()
            });

            if (typeof window.setStore === 'function') {
                window.setStore('payment_records', payRecords);
            }

            invalidatePaymentCache(karigerId);
            if (typeof window.invalidateCalcCache === 'function') {
                window.invalidateCalcCache(karigerId);
            }
            if (typeof window.updateDashboardBadgeTotals === 'function') {
                window.updateDashboardBadgeTotals();
            }
            if (typeof window.slSyncDashboardCharts === 'function') {
                window.slSyncDashboardCharts();
            }

            closeQuickPayModal();

            if (paymentViewMode === 'ledger' && String(window.activePaymentKarigerId) === String(karigerId)) {
                applyPaymentPassbookFilters();
            }
            renderPaymentTable();

            alert(`✅ ₹ ${amt.toFixed(2)} safalta-poorvak ${karigerName} ki sheet aur Payments Table me darj ho gaya!`);
        } catch (err) {
            console.error('[PaymentEngine] Quick pay execution failure:', err);
            alert('Payment process karne me takleef aayi.');
        }
    };

    /* ========================================================================
       9. CONTRA / CASH TRANSFER MODAL (F4 — WHITE & GOLD + ACCEPT? Y/N)
       ======================================================================== */
    const showCashTransferAcceptStrip = (show) => {
        const bar = document.getElementById('ct-accept-strip');
        if (!bar) return;
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            document.getElementById('ct-accept-yes')?.focus();
        }
    };

    const openCashTransferModal = () => {
        ensurePaymentTallyStyles();
        const existingModal = document.getElementById('cash-transfer-modal');
        if (existingModal) existingModal.remove();

        let karkhanas = [];
        if (typeof window.getKarkhanasSafe === 'function') {
            karkhanas = window.getKarkhanasSafe();
        } else {
            karkhanas = safeGetStore('karkhana_list');
        }

        const today = getToday();
        let fromOptions = '';
        let toOptions = '';

        karkhanas.forEach((k) => {
            const isMain = (k.id === 'k_main' || k.isDefault);
            fromOptions += `<option value="${esc(k.id)}" ${isMain ? 'selected' : ''}>${esc(k.name)}</option>`;
            toOptions += `<option value="${esc(k.id)}" ${!isMain ? 'selected' : ''}>${esc(k.name)}</option>`;
        });

        const modalHtml = `
            <div id="cash-transfer-modal" class="pay-modal-overlay">
                <div class="pay-modal-card">
                    <div class="pay-modal-head">
                        <h3>Contra / Cash Transfer (F4)</h3>
                        <button type="button" class="pay-tally-btn" onclick="closeCashTransferModal()">&larr; [Esc] Close</button>
                    </div>
                    <div style="padding:16px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">From (Source) :</label>
                                <select id="cash-from-godam" class="pay-modal-inp">${fromOptions}</select>
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">To (Destination) :</label>
                                <select id="cash-to-godam" class="pay-modal-inp">${toOptions}</select>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Amount (₹) :</label>
                                <input type="number" step="0.01" id="cash-transfer-amt" placeholder="0.00" class="pay-modal-inp" style="text-align:right; font-size:15px;">
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Date :</label>
                                <input type="date" id="cash-transfer-date" value="${today}" class="pay-modal-inp">
                            </div>
                        </div>
                        <div style="margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Narration / Note :</label>
                            <input type="text" id="cash-transfer-note" placeholder="e.g. Weekly Mazdoori ke liye bheja" class="pay-modal-inp">
                        </div>

                        <div id="ct-accept-strip" class="pay-accept-bar" style="display:none;">
                            <span style="font-size:13px; font-weight:800; color:#1f2937;">Accept? Cash Transfer Confirm?</span>
                            <div style="display:flex; gap:8px;">
                                <button type="button" id="ct-accept-yes" class="pay-tally-btn-gold" onclick="submitCashTransferForm()">Yes [Y / Enter]</button>
                                <button type="button" id="ct-accept-no" class="pay-tally-btn" onclick="window.__ctCancelAccept()">No [N / Esc]</button>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                            <button type="button" class="pay-tally-btn" onclick="closeCashTransferModal()">Cancel [Esc]</button>
                            <button type="button" class="pay-tally-btn-gold" onclick="submitCashTransferForm()">Transfer Confirm [Ctrl+Enter]</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        window.__ctCancelAccept = () => {
            showCashTransferAcceptStrip(false);
            document.getElementById('cash-transfer-note')?.focus();
        };

        const yesBtn = document.getElementById('ct-accept-yes');
        if (yesBtn) {
            yesBtn.addEventListener('keydown', (e) => {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    submitCashTransferForm();
                } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.__ctCancelAccept();
                }
            });
        }

        const order = ['cash-from-godam', 'cash-to-godam', 'cash-transfer-amt', 'cash-transfer-date', 'cash-transfer-note'];
        order.forEach((fid, i) => {
            const el = document.getElementById(fid);
            if (!el) return;
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    submitCashTransferForm();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (i > 0) document.getElementById(order[i - 1])?.focus();
                        return;
                    }
                    if (i < order.length - 1) {
                        const nxt = document.getElementById(order[i + 1]);
                        if (nxt) { nxt.focus(); if (nxt.select) nxt.select(); }
                    } else {
                        showCashTransferAcceptStrip(true);
                    }
                }
            });
        });

        setTimeout(() => {
            const amtEl = document.getElementById('cash-transfer-amt');
            if (amtEl) { amtEl.focus(); amtEl.select(); }
        }, 50);
    };

    const closeCashTransferModal = () => {
        const modal = document.getElementById('cash-transfer-modal');
        if (modal) modal.remove();
    };

    const submitCashTransferForm = () => {
        showCashTransferAcceptStrip(false);
        const fromKid = document.getElementById('cash-from-godam')?.value;
        const toKid = document.getElementById('cash-to-godam')?.value;
        const amt = roundCurrency(document.getElementById('cash-transfer-amt')?.value);
        const date = document.getElementById('cash-transfer-date')?.value || getToday();
        const note = String(document.getElementById('cash-transfer-note')?.value || '').trim();

        if (String(fromKid) === String(toKid)) {
            return alert('Bhejne wala aur Paane wala godam alag-alag hona chahiye!');
        }
        if (amt <= 0) {
            alert('Kripya sahi amount (₹) bharein!');
            document.getElementById('cash-transfer-amt')?.focus();
            return;
        }

        try {
            const fromName = (typeof window.getKarkhanaNameById === 'function')
                ? window.getKarkhanaNameById(fromKid)
                : fromKid;
            const toName = (typeof window.getKarkhanaNameById === 'function')
                ? window.getKarkhanaNameById(toKid)
                : toKid;

            const trRef = `tr_cash_${Date.now()}`;

            const payRecords = safeGetStore('payment_records');

            payRecords.push({
                id: `pay_tr_out_${Date.now()}`,
                date,
                type: 'cash_transfer_out',
                category: 'Karkhana Fund Transfer',
                party: toName,
                karkhanaId: fromKid,
                amount: amt,
                paymentMode: 'Cash',
                remarks: `Cash Bheja ➔ ${toName}${note ? ` (${note})` : ''}`,
                refId: trRef,
                timestamp: Date.now()
            });

            payRecords.push({
                id: `pay_tr_in_${Date.now() + 1}`,
                date,
                type: 'cash_transfer_in',
                category: 'Karkhana Fund Transfer',
                party: fromName,
                karkhanaId: toKid,
                amount: amt,
                paymentMode: 'Cash',
                remarks: `Cash Aamad ⬅ ${fromName}${note ? ` (${note})` : ''}`,
                refId: trRef,
                timestamp: Date.now() + 1
            });

            if (typeof window.setStore === 'function') {
                window.setStore('payment_records', payRecords);
            }

            if (typeof window.recordTransferEntry === 'function') {
                window.recordTransferEntry({
                    id: trRef,
                    date,
                    fromKarkhanaId: fromKid,
                    toKarkhanaId: toKid,
                    type: 'cash',
                    amount: amt,
                    remarks: note || `Fund Transfer: ${fromName} ➔ ${toName}`
                });
            }

            if (typeof window.updateDashboardBadgeTotals === 'function') {
                window.updateDashboardBadgeTotals();
            }

            closeCashTransferModal();
            alert(`✅ ₹ ${amt.toFixed(2)} safalta-poorvak transfer ho gaya aur Payments Table sync ho gayi!`);
        } catch (err) {
            console.error('[PaymentEngine] Cash transfer failure:', err);
            alert('Cash transfer execute karne me takleef aayi.');
        }
    };

    /* ========================================================================
       10. INLINE PARTY LEDGER (WITH F5 PAY & F8 OPEN KARIGER TANI SHEET!)
       ======================================================================== */
    const ensureInlinePaymentLedgerContainer = () => {
        const sec = document.getElementById('payment-section');
        if (!sec) return null;

        let container = document.getElementById('payment-inline-ledger-view');
        if (container) return container;

        container = document.createElement('div');
        container.id = 'payment-inline-ledger-view';
        container.style.display = 'none';
        container.innerHTML = `
            <div style="margin:12px 20px 10px 20px; padding:10px 14px; background:#fdfcf7; border:1px solid #e5d5a7; border-radius:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="pay-tally-btn" onclick="window.__closePaymentLedgerView()">&larr; [Esc] Party List</button>
                    <strong id="pay-ledger-summary-title" style="font-size:14px; color:#1f2937;">Ledger: -</strong>
                    <span id="pay-ledger-summary-totals" style="font-size:12px; color:#b47d00; font-weight:800;"></span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="pay-tally-btn-gold" onclick="window.__payTriggerFromLedger()">Pay Voucher [F5]</button>
                    <button type="button" class="pay-tally-btn" onclick="window.__payOpenKarigerSheet()">Open Tani Sheet [S / F8]</button>
                    <button type="button" class="pay-tally-btn" onclick="window.__payPrintSingleSelected()">Voucher Slip [P]</button>
                    <button type="button" class="pay-tally-btn" onclick="printPaymentPassbookFiltered()">A6 Print [Alt+P]</button>
                </div>
            </div>

            <div style="padding:0 20px 10px 20px; display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end;">
                <div>
                    <label style="font-size:11px; font-weight:700; color:#6b7280; display:block; margin-bottom:2px;">From Date [F]:</label>
                    <input type="date" id="pay-pass-from-date" onchange="applyPaymentPassbookFilters()" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:4px; font-size:12.5px; font-weight:600;">
                </div>
                <div>
                    <label style="font-size:11px; font-weight:700; color:#6b7280; display:block; margin-bottom:2px;">To Date:</label>
                    <input type="date" id="pay-pass-to-date" onchange="applyPaymentPassbookFilters()" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:4px; font-size:12.5px; font-weight:600;">
                </div>
                <div style="flex:1; min-width:180px;">
                    <label style="font-size:11px; font-weight:700; color:#6b7280; display:block; margin-bottom:2px;">Search [/]:</label>
                    <input type="text" id="pay-pass-search-input" class="search-box" placeholder="Search Date, Sheet, Amount..." oninput="debouncedPassbookSearch()">
                </div>
                <button type="button" class="pay-tally-btn" onclick="resetPaymentPassbookFilters()">Reset [R]</button>
            </div>

            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Tarikh</th>
                            <th>Khata / Tani</th>
                            <th>Vch Type</th>
                            <th style="text-align:right;">Saree (Pcs)</th>
                            <th style="text-align:right;">Paid (Diya ₹)</th>
                            <th>Narration / Note</th>
                        </tr>
                    </thead>
                    <tbody id="payment-passbook-table-body"></tbody>
                </table>
            </div>

            <div id="payment-passbook-pagination-controls" style="display:flex; justify-content:space-between; align-items:center; margin:10px 20px 0 20px; padding:8px 0; border-top:1px solid #eadab0; flex-wrap:wrap; gap:8px;"></div>

            <div class="pay-status-strip">
                <span style="color:#92400e; font-weight:700;">[↑ ↓] Entry · [F5] Pay Voucher · [S / F8] Open Tani Sheet · [Enter / P] Single Slip · [Alt+P] Statement · [Esc] Party List</span>
                <span id="pay-ledger-count-lbl">0 Entries</span>
            </div>
        `;

        const mainStrip = document.getElementById('payment-main-status-strip');
        if (mainStrip) {
            sec.insertBefore(container, mainStrip);
        } else {
            sec.appendChild(container);
        }

        const fInp = document.getElementById('pay-pass-from-date');
        const tInp = document.getElementById('pay-pass-to-date');
        const sInp = document.getElementById('pay-pass-search-input');
        if (fInp) {
            fInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); tInp?.focus(); }
            });
        }
        if (tInp) {
            tInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); sInp?.focus(); }
            });
        }
        if (sInp) {
            sInp.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    e.preventDefault();
                    sInp.blur();
                }
            });
        }

        return container;
    };

    window.__closePaymentLedgerView = () => {
        setPaymentViewMode('list');
        renderPaymentTable();
    };

    window.__payTriggerFromLedger = triggerSelectedQuickPay;

    window.__payOpenKarigerSheet = () => {
        if (!window.activePaymentKarigerId) return alert('Pehle koi Kariger chunein!');
        if (typeof window.openKarigerSheet !== 'function') {
            return alert('Kariger Sheet module load nahi hua hai.');
        }
        setDisplay('payment-section', 'none');
        window.openKarigerSheet(window.activePaymentKarigerId);
    };

    window.__payPrintSingleSelected = () => {
        const startIndex = (paymentPassbookCurrentPage - 1) * PAYMENT_PASSBOOK_PAGE_SIZE;
        const pageRows = filteredPaymentPassbookCache.slice(startIndex, startIndex + PAYMENT_PASSBOOK_PAGE_SIZE);
        const row = pageRows[paymentLedgerActiveIdx];
        if (!row) return alert('Print karne ke liye koi entry chunein!');
        printSinglePaymentEntry(row.date, row.sheetTitle, row.saree, row.paid, row.note);
    };

    const openPaymentPassbook = (karigerId, karigerName) => {
        ensurePaymentTallyStyles();
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';
        setDisplay('payment-section', 'block');

        window.activePaymentKarigerId = karigerId;
        window.activePaymentKarigerName = karigerName;
        paymentPassbookCurrentPage = 1;
        paymentLedgerActiveIdx = 0;

        ensureInlinePaymentLedgerContainer();
        setPaymentViewMode('ledger');
        bindPaymentKeyboardEngine();
        applyPaymentPassbookFilters();
    };

    const resetPaymentPassbookFilters = () => {
        const fDate = document.getElementById('pay-pass-from-date');
        const tDate = document.getElementById('pay-pass-to-date');
        const sInp = document.getElementById('pay-pass-search-input');
        if (fDate) fDate.value = '';
        if (tDate) tDate.value = '';
        if (sInp) sInp.value = '';
        paymentPassbookCurrentPage = 1;
        paymentLedgerActiveIdx = 0;
        applyPaymentPassbookFilters();
    };

    const debouncedPassbookSearch = () => {
        clearTimeout(passbookSearchDebounceTimer);
        passbookSearchDebounceTimer = setTimeout(() => {
            paymentPassbookCurrentPage = 1;
            paymentLedgerActiveIdx = 0;
            applyPaymentPassbookFilters();
        }, 150);
    };

    const applyPaymentPassbookFilters = () => {
        if (!window.activePaymentKarigerId) return;

        const sheets = (typeof window.getKarigerSheets === 'function')
            ? window.getKarigerSheets(window.activePaymentKarigerId)
            : [];

        let allRows = [];
        sheets.forEach((sh) => {
            const rows = window.safeArray ? window.safeArray(sh?.rows) : (Array.isArray(sh?.rows) ? sh.rows : []);
            rows.forEach((r) => {
                const paidVal = safeNum(r?.paid);
                const sareeVal = safeNum(r?.saree);
                if (paidVal > 0 || sareeVal > 0) {
                    allRows.push({
                        date: r?.date || '-',
                        sheetTitle: sh?.title || 'Tani Khata',
                        saree: sareeVal,
                        paid: paidVal,
                        vchType: paidVal > 0 ? 'Payment' : 'Saree Jama',
                        note: r?.note || (paidVal > 0 ? 'Payment Diya' : 'Saree Jama')
                    });
                }
            });
        });

        const fDate = document.getElementById('pay-pass-from-date')?.value || '';
        const tDate = document.getElementById('pay-pass-to-date')?.value || '';
        const sTxt = (document.getElementById('pay-pass-search-input')?.value || '').toLowerCase().trim();

        if (fDate) allRows = allRows.filter((x) => x.date >= fDate);
        if (tDate) allRows = allRows.filter((x) => x.date <= tDate);

        if (sTxt) {
            allRows = allRows.filter((x) => {
                const full = `${x.date} ${x.sheetTitle} ${x.saree} ${x.paid} ${x.note}`.toLowerCase();
                return full.includes(sTxt);
            });
        }

        // Show newest first
        allRows = allRows.slice().reverse();

        filteredPaymentPassbookCache = allRows;

        const metrics = getWeaverWageMetrics(window.activePaymentKarigerId);
        const kList = safeGetStore('kariger_list');
        const kObj = kList.find(x => String(x.id) === String(window.activePaymentKarigerId));
        const godamName = kObj?.karkhanaName || ((typeof window.getKarkhanaNameById === 'function') ? window.getKarkhanaNameById(kObj?.karkhanaId) : 'Main Godown');

        const titleEl = document.getElementById('pay-ledger-summary-title');
        const totEl = document.getElementById('pay-ledger-summary-totals');
        if (titleEl) titleEl.textContent = `${window.activePaymentKarigerName} (${godamName}${kObj?.saree ? ` · ${kObj.saree}` : ''})`;
        if (totEl) {
            totEl.textContent = `Kul Dena: ₹ ${metrics.mazdoori.toFixed(2)} · Diya: ₹ ${metrics.diya.toFixed(2)} · Closing Baki: ₹ ${metrics.baki.toFixed(2)}`;
        }

        renderPaymentPassbookRows();
    };

    const highlightPaymentLedgerRow = (idx) => {
        const rows = Array.from(document.querySelectorAll('#payment-passbook-table-body .pay-pass-row'));
        if (!rows.length) return;
        paymentLedgerActiveIdx = ((idx % rows.length) + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle('active', i === paymentLedgerActiveIdx));
        rows[paymentLedgerActiveIdx]?.scrollIntoView({ block: 'nearest' });
    };

    const renderPaymentPassbookRows = () => {
        const tbody = document.getElementById('payment-passbook-table-body');
        const pager = document.getElementById('payment-passbook-pagination-controls');
        if (!tbody) return;
        tbody.innerHTML = '';

        const totalEntries = filteredPaymentPassbookCache.length;
        const cntEl = document.getElementById('pay-ledger-count-lbl');
        if (cntEl) cntEl.textContent = `${totalEntries} Entries`;

        if (!totalEntries) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:#6b7280;">Koi payment ya saree entry nahi mili. [F5] se Payment kaat sakte hain ya [S] se Tani Sheet kholein.</td></tr>';
            if (pager) pager.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(totalEntries / PAYMENT_PASSBOOK_PAGE_SIZE) || 1;
        if (paymentPassbookCurrentPage > totalPages) paymentPassbookCurrentPage = totalPages;
        if (paymentPassbookCurrentPage < 1) paymentPassbookCurrentPage = 1;

        const startIndex = (paymentPassbookCurrentPage - 1) * PAYMENT_PASSBOOK_PAGE_SIZE;
        const pageRows = filteredPaymentPassbookCache.slice(startIndex, startIndex + PAYMENT_PASSBOOK_PAGE_SIZE);
        if (paymentLedgerActiveIdx >= pageRows.length) paymentLedgerActiveIdx = 0;
        if (paymentLedgerActiveIdx < 0) paymentLedgerActiveIdx = 0;

        let html = '';
        pageRows.forEach((row, idx) => {
            const activeCls = (idx === paymentLedgerActiveIdx) ? ' active' : '';
            html += `<tr class="pay-pass-row${activeCls}" data-plidx="${idx}" onclick="window.__paySelectLedgerRow(${idx})">
                <td>${esc(row.date)}</td>
                <td><strong>${esc(row.sheetTitle)}</strong></td>
                <td><span style="font-size:11.5px; font-weight:700; color:${row.paid > 0 ? '#b47d00' : '#6b7280'};">${esc(row.vchType)}</span></td>
                <td style="text-align:right;">${row.saree ? `${row.saree} Pcs` : '-'}</td>
                <td style="text-align:right; font-weight:800; color:#b47d00;">${row.paid ? `₹ ${row.paid.toFixed(2)}` : '-'}</td>
                <td style="color:#6b7280; font-size:12px;">${esc(row.note)}</td>
            </tr>`;
        });

        tbody.innerHTML = html;

        if (pager) {
            pager.innerHTML = `
                <div style="font-size:12px; color:#6b7280; font-weight:600;">
                    Showing <strong>${startIndex + 1}</strong> - <strong>${Math.min(startIndex + PAYMENT_PASSBOOK_PAGE_SIZE, totalEntries)}</strong> of <strong>${totalEntries}</strong> entries
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="pay-tally-btn" ${paymentPassbookCurrentPage <= 1 ? 'disabled style="opacity:0.45; cursor:not-allowed;"' : ''} onclick="changePaymentPassbookPage(-1)">◀ Prev</button>
                    <span style="font-size:12px; font-weight:700; padding:4px 8px; background:#fdf6e2; border:1px solid #e5d5a7; border-radius:4px;">${paymentPassbookCurrentPage} / ${totalPages}</span>
                    <button type="button" class="pay-tally-btn" ${paymentPassbookCurrentPage >= totalPages ? 'disabled style="opacity:0.45; cursor:not-allowed;"' : ''} onclick="changePaymentPassbookPage(1)">Next ▶</button>
                </div>`;
        }
    };

    window.__paySelectLedgerRow = (idx) => {
        highlightPaymentLedgerRow(idx);
    };

    const changePaymentPassbookPage = (delta) => {
        paymentPassbookCurrentPage += delta;
        paymentLedgerActiveIdx = 0;
        renderPaymentPassbookRows();
    };

    /* ========================================================================
       11. KEYBOARD NAVIGATION ENGINE FOR #payment-section (ZERO CONFLICTS)
       ======================================================================== */
    const handlePaymentKeydown = (e) => {
        const sec = document.getElementById('payment-section');
        if (!sec || sec.style.display === 'none') return;
        if (isAnyExpressOverlayOpen()) return;

        // 1. Quick Pay Modal open
        const qpModal = document.getElementById('quick-pay-modal');
        if (qpModal) {
            if (e.key === 'Escape') {
                e.preventDefault();
                const bar = document.getElementById('qp-accept-strip');
                if (bar && bar.style.display !== 'none') window.__qpCancelAccept();
                else closeQuickPayModal();
            }
            return;
        }

        // 2. Cash Transfer Modal open
        const ctModal = document.getElementById('cash-transfer-modal');
        if (ctModal) {
            if (e.key === 'Escape') {
                e.preventDefault();
                const bar = document.getElementById('ct-accept-strip');
                if (bar && bar.style.display !== 'none') window.__ctCancelAccept();
                else closeCashTransferModal();
            }
            return;
        }

        const tag = (document.activeElement && document.activeElement.tagName) || '';
        const isTyping = (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA');

        if (e.key === 'Escape') {
            e.preventDefault();
            handlePaymentBackStep();
            return;
        }

        if (e.key === 'F5') {
            e.preventDefault();
            triggerSelectedQuickPay();
            return;
        }

        if (e.key === 'F4') {
            e.preventDefault();
            openCashTransferModal();
            return;
        }

        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            if (paymentViewMode === 'ledger') printPaymentPassbookFiltered();
            else printPaymentReport();
            return;
        }

        if (e.key === 'F2' && paymentViewMode === 'list') {
            e.preventDefault();
            cyclePaymentKarkhanaTab();
            return;
        }

        if (e.key === 'F3') {
            e.preventDefault();
            const sEl = document.getElementById(paymentViewMode === 'ledger' ? 'pay-pass-search-input' : 'search-payment-input');
            if (sEl) { sEl.focus(); sEl.select(); }
            return;
        }

        if (e.key === 'F8' && paymentViewMode === 'ledger') {
            e.preventDefault();
            window.__payOpenKarigerSheet();
            return;
        }

        if (isTyping) return;

        // 3. Inside Party Ledger View
        if (paymentViewMode === 'ledger') {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightPaymentLedgerRow(paymentLedgerActiveIdx + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightPaymentLedgerRow(paymentLedgerActiveIdx - 1);
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                changePaymentPassbookPage(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                changePaymentPassbookPage(-1);
            } else if (e.key === 'Enter' || e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                window.__payPrintSingleSelected();
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                window.__payOpenKarigerSheet();
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                document.getElementById('pay-pass-from-date')?.focus();
            } else if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                resetPaymentPassbookFilters();
            } else if (e.key === '/') {
                e.preventDefault();
                const sEl = document.getElementById('pay-pass-search-input');
                if (sEl) { sEl.focus(); sEl.select(); }
            }
            return;
        }

        // 4. Inside Main Party Ledgers List
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightPaymentListRow(paymentListActiveIdx + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightPaymentListRow(paymentListActiveIdx - 1);
        } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            e.preventDefault();
            changePaymentTablePage(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault();
            changePaymentTablePage(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const pageRows = getPaymentCurrentPageRows();
            const chosen = pageRows[paymentListActiveIdx];
            if (chosen) openPaymentPassbook(chosen.id, chosen.kariger);
        } else if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            openCashTransferModal();
        } else if (e.key === '/') {
            e.preventDefault();
            const sEl = document.getElementById('search-payment-input');
            if (sEl) { sEl.focus(); sEl.select(); }
        }
    };

    const bindPaymentKeyboardEngine = () => {
        if (window.__paymentKeysBound) return;
        window.__paymentKeysBound = true;
        document.addEventListener('keydown', handlePaymentKeydown);
    };

    /* ========================================================================
       12. A6 PAPER & THERMAL PRINTER PRINT ENGINES (UNCHANGED)
       ======================================================================== */
    const getPaymentKarkhanaPrintName = (kId) => {
        if (!kId || kId === 'all') return 'Sabhi Godam (All Units)';
        if (typeof window.getKarkhanaNameById === 'function') {
            return window.getKarkhanaNameById(kId);
        }
        return kId;
    };

    const printPaymentReport = () => {
        const rows = currentPaymentFilteredRowsCache;
        if (!rows || !rows.length) {
            return alert('Print karne ke liye koi Payment record nahi mila!');
        }

        const kName = getPaymentKarkhanaPrintName(window.currentPaymentKarkhanaFilter);
        const today = new Date().toLocaleDateString('hi-IN');

        let grandMazdoori = 0;
        let grandDiya = 0;
        let grandBaki = 0;

        let rowsHtml = '';
        rows.forEach((r, idx) => {
            grandMazdoori += safeNum(r.mazdoori);
            grandDiya += safeNum(r.diya);
            grandBaki += safeNum(r.baki);

            rowsHtml += `
                <tr style="border-bottom:1px dashed #ccc;">
                    <td style="padding:4px 2px;">${idx + 1}</td>
                    <td style="padding:4px 2px; font-weight:bold;">${esc(r.kariger)}</td>
                    <td style="padding:4px 2px;">${esc(r.karkhana)}</td>
                    <td style="padding:4px 2px; text-align:right;">₹${r.mazdoori.toFixed(2)}</td>
                    <td style="padding:4px 2px; text-align:right;">₹${r.diya.toFixed(2)}</td>
                    <td style="padding:4px 2px; text-align:right; font-weight:bold;">₹${r.baki.toFixed(2)}</td>
                </tr>`;
        });

        const printWindow = window.open('', '', 'width=450,height=650');
        if (!printWindow) return alert('Popup block hai! Kripya browser me popup allow karein.');

        printWindow.document.write(`
            <html>
            <head>
                <title>Payment & Bakaya Statement - A6</title>
                <style>
                    @page { size: A6 portrait; margin: 4mm; }
                    body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                    .ticket { width: 100%; max-width: 96mm; margin: 0 auto; }
                    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
                    .header h2 { margin: 0; font-size: 15px; text-transform: uppercase; }
                    .header p { margin: 2px 0 0; font-size: 10px; }
                    .meta { font-size: 10px; margin-bottom: 6px; border-bottom: 1px dashed #666; padding-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; font-size: 10px; }
                    th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 3px 2px; }
                    .total-box { margin-top: 8px; border-top: 2px dashed #000; padding-top: 4px; font-size: 11px; font-weight: bold; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px dashed #aaa; padding-top: 6px; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        <h2>SIMPLICITY ERP</h2>
                        <p><strong>MAZDOORI & BAKAYA HISAB STATEMENT</strong></p>
                    </div>
                    <div class="meta">
                        <div><strong>Karkhana:</strong> ${esc(kName)}</div>
                        <div><strong>Print Tarikh:</strong> ${today}</div>
                        <div><strong>Total Karigers:</strong> ${rows.length}</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th><th>KARIGER</th><th>KARKHANA</th><th style="text-align:right;">MAZDOORI</th><th style="text-align:right;">DIYA</th><th style="text-align:right;">BAKI</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    <div class="total-box">
                        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                            <span>Kul Mazdoori:</span> <span>₹ ${grandMazdoori.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                            <span>Kul Diya (Paid):</span> <span>₹ ${grandDiya.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:12px; border-top:1px dashed #000; padding-top:3px;">
                            <span>KUL DENA BAKI:</span> <span>₹ ${grandBaki.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="footer">
                        <p>हस्ताक्षर / मुंशी: ____________________</p>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                        setTimeout(() => window.close(), 600);
                    };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const printPaymentPassbookFiltered = () => {
        const rows = filteredPaymentPassbookCache;
        if (!rows || !rows.length) {
            return alert('Print karne ke liye koi passbook entry nahi mili!');
        }

        const karigerName = window.activePaymentKarigerName || 'Kariger';
        const fDate = document.getElementById('pay-pass-from-date')?.value || '';
        const tDate = document.getElementById('pay-pass-to-date')?.value || '';
        const dateRangeTxt = (fDate && tDate) ? `${fDate} se ${tDate}` : (fDate ? `${fDate} ke baad` : (tDate ? `${tDate} tak` : 'Sabhi Tarikh'));

        let totalSaree = 0;
        let totalPaid = 0;

        let rowsHtml = '';
        rows.forEach((r) => {
            const sVal = safeNum(r.saree);
            const pVal = safeNum(r.paid);

            totalSaree += sVal;
            totalPaid += pVal;

            rowsHtml += `
                <tr style="border-bottom:1px dashed #ccc;">
                    <td style="padding:3px 2px;">${esc(r.date)}</td>
                    <td style="padding:3px 2px; font-weight:600;">${esc(r.sheetTitle)}</td>
                    <td style="padding:3px 2px; text-align:right;">${sVal > 0 ? `${sVal} Pcs` : '-'}</td>
                    <td style="padding:3px 2px; text-align:right; font-weight:bold;">${pVal > 0 ? `₹${pVal.toFixed(2)}` : '-'}</td>
                </tr>`;
        });

        const printWindow = window.open('', '', 'width=450,height=650');
        if (!printWindow) return alert('Popup block hai! Kripya browser me popup allow karein.');

        printWindow.document.write(`
            <html>
            <head>
                <title>Kariger Payment Passbook - A6</title>
                <style>
                    @page { size: A6 portrait; margin: 4mm; }
                    body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                    .ticket { width: 100%; max-width: 96mm; margin: 0 auto; }
                    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
                    .header h2 { margin: 0; font-size: 15px; text-transform: uppercase; }
                    .header p { margin: 2px 0 0; font-size: 10px; }
                    .meta { font-size: 10px; margin-bottom: 6px; border-bottom: 1px dashed #666; padding-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; font-size: 10px; }
                    th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 3px 2px; }
                    .total-box { margin-top: 8px; border-top: 2px dashed #000; padding-top: 4px; font-size: 11px; font-weight: bold; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px dashed #aaa; padding-top: 6px; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        <h2>SIMPLICITY ERP</h2>
                        <p><strong>KARIGER PAYMENT PASSBOOK</strong></p>
                    </div>
                    <div class="meta">
                        <div><strong>Kariger:</strong> ${esc(karigerName)}</div>
                        <div><strong>Filter Avadhi:</strong> ${esc(dateRangeTxt)}</div>
                        <div><strong>Kul Entries:</strong> ${rows.length}</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>TARIKH</th><th>KHATA / TANI</th><th style="text-align:right;">SAREE</th><th style="text-align:right;">PAID (₹)</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    <div class="total-box">
                        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                            <span>Kul Saree Jama:</span> <span>${totalSaree} Pcs</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:12px; border-top:1px dashed #000; padding-top:3px;">
                            <span>KUL DIYA (PAID):</span> <span>₹ ${totalPaid.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="footer">
                        <p>हस्ताक्षर कारीगर: _________________ &nbsp; मुंशी: _________________</p>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                        setTimeout(() => window.close(), 600);
                    };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const printSinglePaymentEntry = (date, sheetTitle, saree, paid, note) => {
        const karigerName = window.activePaymentKarigerName || 'Kariger';
        const paidAmt = safeNum(paid);

        const printWindow = window.open('', '', 'width=420,height=550');
        if (!printWindow) return alert('Popup block hai! Kripya browser me popup allow karein.');

        printWindow.document.write(`
            <html>
            <head>
                <title>Payment Voucher - A6</title>
                <style>
                    @page { size: A6 portrait; margin: 4mm; }
                    body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                    .ticket { width: 100%; max-width: 90mm; margin: 0 auto; border: 1px dashed #000; padding: 8px; box-sizing: border-box; }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
                    .header h2 { margin: 0; font-size: 15px; }
                    .header p { margin: 2px 0 0; font-size: 10px; font-weight: bold; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 11px; }
                    .total-highlight { background: #eee; padding: 6px 4px; border: 1px solid #000; font-size: 14px; font-weight: 900; text-align: center; margin: 10px 0; }
                    .signs { display: flex; justify-content: space-between; margin-top: 25px; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        <h2>SIMPLICITY ERP</h2>
                        <p>MAZDOORI BHUGTAN PARCHI</p>
                    </div>
                    <div class="row"><span><strong>Tarikh:</strong></span><span>${esc(date)}</span></div>
                    <div class="row"><span><strong>Kariger:</strong></span><span>${esc(karigerName)}</span></div>
                    <div class="row"><span><strong>Khata / Tani:</strong></span><span>${esc(sheetTitle)}</span></div>
                    ${saree > 0 ? `<div class="row"><span><strong>Saree Jama:</strong></span><span>${saree} Pcs</span></div>` : ''}
                    <div class="row"><span><strong>Vivran:</strong></span><span>${esc(note || 'Mazdoori Payment')}</span></div>
                    <div class="total-highlight">
                        PAID: ₹ ${paidAmt.toFixed(2)}
                    </div>
                    <div class="signs">
                        <div>हस्ताक्षर मुंशी<br><br>________</div>
                        <div>हस्ताक्षर कारीगर<br><br>________</div>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                        setTimeout(() => window.close(), 600);
                    };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    /* ========================================================================
       13. GLOBAL EXPORT & EVENT LISTENERS
       ======================================================================== */
    const paymentAPI = {
        openPaymentModule,
        renderPaymentKarkhanaTabs,
        switchPaymentKarkhanaTab,
        filterPayment,
        renderPaymentTable,
        changePaymentTablePage,
        printPaymentReport,
        openQuickPayModal,
        closeQuickPayModal,
        submitQuickPayForm,
        openCashTransferModal,
        closeCashTransferModal,
        submitCashTransferForm,
        openPaymentPassbook,
        resetPaymentPassbookFilters,
        debouncedPassbookSearch,
        applyPaymentPassbookFilters,
        renderPaymentPassbookRows,
        changePaymentPassbookPage,
        printPaymentPassbookFiltered,
        printSinglePaymentEntry,
        invalidatePaymentCache
    };

    Object.keys(paymentAPI).forEach((fnName) => {
        window[fnName] = paymentAPI[fnName];
    });

    window.PaymentEngine = paymentAPI;

    document.addEventListener('DOMContentLoaded', () => {
        bindPaymentSearchInput();
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = paymentAPI;
    }
})();
