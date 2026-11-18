/* ============================================================================
   SIMPLICITY ERP - JOBWORK EXPRESS VOUCHER (TALLYPRIME WHITE & GOLD EDITION)
   Folder: jobwork-express / File: jobwork-express.js
   Developed for: Farhan Jawed
   Features:
   - True TallyPrime Voucher Anatomy:
     Top Split (Form Left + Full-Height Picker Right) + Full-Width Batch Grid Bottom
   - Clean Profile-Creation Style Single-Field-Per-Row Alignment (Zero Clipping)
   - Right-Pane Pickers: Process -> Len-Den -> Stock Source -> Worker -> Maker
   - Tally "End of List" (Empty Maker + Enter) & "Accept? (Yes / No)" Strip
   - Process Switch Zero-Mix Guard, Focus Tab Trap & Instant A6 Challan Print
============================================================================ */

(() => {
    'use strict';

    let activeCategory = 'cutting';   // 'cutting' | 'embroidery' | 'calender' | 'dukan'
    let movementType = 'gayi';        // 'gayi' | 'aayi'
    let stockSource = 'fresh';        // 'fresh' | 'cutting' | 'embroidery'
    let expressBatchItems = [];
    let lastSavedExpressBatch = null;
    let lastEnteredNaap = '3.60';

    // Right-Pane Tally Picker State
    let jwPickerMode = 'process';     // 'process' | 'movement' | 'source' | 'worker' | 'maker' | 'summary'
    let jwPickerItems = [];
    let jwPickerActiveIdx = 0;
    let jwMakerArrowUsed = false;

    /* ========================================================================
       1. SAFE HELPERS & STORES (100% PRESERVED)
       ------------------------------------------------------------------------
    ======================================================================== */
    const toArray = (v) => {
        if (Array.isArray(v)) return v;
        if (typeof window.safeArray === 'function') return window.safeArray(v);
        return [];
    };

    const getFromStore = (key) => {
        if (typeof window.getStore === 'function') return window.getStore(key);
        try {
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch {
            return [];
        }
    };

    const setToStore = (key, val) => {
        if (typeof window.setStore === 'function') {
            window.setStore(key, val);
        } else {
            localStorage.setItem(key, JSON.stringify(val));
        }
    };

    const safeNum = (val, fallback = 0) => {
        const n = parseFloat(val);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const safeInt = (val, fallback = 0) => {
        const n = parseInt(val, 10);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const esc = (s) => {
        if (typeof window.sanitizeHTML === 'function') return window.sanitizeHTML(s);
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
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

    const getToday = () => {
        const raw = (typeof window.getTodayDate === 'function')
            ? window.getTodayDate()
            : new Date().toISOString().split('T')[0];
        const iso = toIsoDate(raw);
        return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().split('T')[0];
    };

    const formatDisplay = (d) => {
        return (typeof window.formatDateDisplay === 'function')
            ? window.formatDateDisplay(d)
            : (d || '-');
    };

    const normText = (txt, fallback = '') => {
        return String(txt || fallback).trim().toUpperCase();
    };

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

    const getMonthTitleFromDate = (dateStr) => {
        if (!dateStr) return 'Current Month';
        const iso = toIsoDate(dateStr);
        const parts = String(iso).trim().split('-');
        if (parts.length < 2) return dateStr;
        const year = parts[0];
        const monthNum = parseInt(parts[1], 10);
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const mName = monthNames[monthNum - 1] || `Month ${monthNum}`;
        return `${mName} ${year}`;
    };

    const getDefaultSourceForCategory = (cat) => {
        if (cat === 'cutting') return 'fresh';
        if (cat === 'embroidery') return 'fresh';
        if (cat === 'calender') return 'cutting';
        return 'finished';
    };

    const getTargetStageForLookup = () => {
        if (activeCategory === 'dukan') return 'finished';
        if (activeCategory === 'cutting') return 'fresh';
        if (activeCategory === 'embroidery') {
            return (movementType === 'gayi') ? stockSource : 'embroidery';
        }
        if (activeCategory === 'calender') {
            return (movementType === 'gayi') ? stockSource : 'finished';
        }
        return 'fresh';
    };

    const getCategoryDisplayName = (cat) => {
        if (cat === 'cutting') return '1. Cutting';
        if (cat === 'embroidery') return '2. Embroidery';
        if (cat === 'calender') return '3. Calender';
        return '4. Dukan';
    };

    const getSourceDisplayName = (src) => {
        if (src === 'cutting') return 'Cutting Stock';
        if (src === 'embroidery') return 'Embroidery Stock';
        if (src === 'finished') return 'Finished Stock';
        return 'Fresh Godown Stock';
    };

    /* ========================================================================
       2. LIVE STOCK RESOLVER & MAKER LIST BUILDER
       ------------------------------------------------------------------------
    ======================================================================== */
    const resolveMakerLiveStockInfo = (makerName, targetStage) => {
        const cleanM = normText(makerName);
        if (!cleanM) return null;

        const sH = toArray(getFromStore('saree_history'));
        const targetKid = getEffectiveGodown();

        let bestMatch = null;
        let maxBachi = -1;

        const map = new Map();
        sH.forEach((h) => {
            if (!h || String(h.type || '').toLowerCase() !== targetStage) return;
            const hKid = normGodownId(h.karkhanaId);
            if (targetKid !== 'all' && hKid !== targetKid) return;

            const kName = normText(h.karigerName || h.kariger);
            if (kName !== cleanM) return;

            const sName = normText(h.sareeName || h.name, 'GENERAL SAREE');
            const isGai = (h.isOut === true) || (safeNum(h.gai) > 0);
            const inQ = isGai ? 0 : safeNum(h.aai !== undefined ? h.aai : h.pcs);
            const outQ = isGai ? safeNum(h.gai !== undefined ? h.gai : h.pcs) : 0;

            const cur = map.get(sName) || 0;
            map.set(sName, cur + (inQ - outQ));
        });

        map.forEach((bachi, sName) => {
            if (bachi > maxBachi) {
                maxBachi = bachi;
                bestMatch = { maker: cleanM, saree: sName, bachi: Math.max(0, bachi) };
            }
        });

        if (bestMatch && bestMatch.bachi > 0) return bestMatch;

        const allKars = toArray(getFromStore('kariger_list'));
        const found = allKars.find((k) => k?.name && normText(k.name) === cleanM);
        return {
            maker: cleanM,
            saree: found?.saree || 'General Saree',
            bachi: Math.max(0, maxBachi)
        };
    };

    const getAvailableMakersList = (queryText = '') => {
        const q = String(queryText || '').trim().toLowerCase();
        const sH = toArray(getFromStore('saree_history'));
        const allKars = toArray(getFromStore('kariger_list'));
        const targetKid = getEffectiveGodown();

        let targetStage = getTargetStageForLookup();
        if (movementType === 'aayi' && activeCategory === 'embroidery') {
            targetStage = stockSource || 'fresh';
        } else if (movementType === 'aayi' && activeCategory === 'calender') {
            targetStage = stockSource || 'cutting';
        }

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

            if (!stockMap.has(key)) {
                stockMap.set(key, { kName, sName, bachi: 0 });
            }
            stockMap.get(key).bachi += (inQ - outQ);
        });

        const results = [];
        const addedNames = new Set();

        stockMap.forEach((val) => {
            if (val.bachi > 0) {
                addedNames.add(val.kName);
                const full = `${val.kName} ${val.sName}`.toLowerCase();
                if (!q || full.includes(q)) {
                    results.push({
                        label: val.kName,
                        sub: `${val.sName} (${val.bachi} Pcs)`,
                        data: val.kName
                    });
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
                    results.push({
                        label: kn,
                        sub: `${sNm}`,
                        data: kn
                    });
                }
            }
        });

        return results;
    };

    const updateExpressMakerDatalist = () => {
        const dl = document.getElementById('jw-exp-maker-dl');
        if (!dl) return;
        const list = getAvailableMakersList('');
        let opts = '';
        list.forEach((it) => {
            opts += `<option value="${esc(it.data)}">${esc(it.label)} — ${esc(it.sub)}</option>`;
        });
        dl.innerHTML = opts;
    };

    /* ========================================================================
       3. SCOPED TALLYPRIME WHITE & GOLD STYLES (FULL-WIDTH BATCH GRID)
       ------------------------------------------------------------------------
    ======================================================================== */
    const ensureTallyJobWorkStyles = () => {
        const old = document.getElementById('jw-tally-styles');
        if (old) old.remove();

        const style = document.createElement('style');
        style.id = 'jw-tally-styles';
        style.textContent = `
            .jw-overlay {
                position: fixed; inset: 0;
                background: rgba(31, 41, 55, 0.36);
                backdrop-filter: blur(2px);
                z-index: 999999;
                display: flex; align-items: center; justify-content: center;
                padding: 14px; box-sizing: border-box;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            }
            .jw-card {
                background: #ffffff;
                width: 100%; max-width: 980px;
                border: 1.5px solid #d9b86c;
                border-radius: 8px;
                box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);
                overflow: hidden;
                max-height: 95vh;
                display: flex; flex-direction: column;
                color: #1f2937;
                box-sizing: border-box;
            }
            .jw-header {
                background: #fdf6e2;
                border-bottom: 1.5px solid #e5d5a7;
                padding: 9px 20px;
                display: flex; justify-content: space-between; align-items: center;
                gap: 10px; flex-wrap: wrap;
                box-sizing: border-box;
            }
            .jw-title {
                margin: 0; font-size: 15px; font-weight: 800; color: #1f2937;
            }
            .jw-pill-btn {
                background: #ffffff; color: #374151;
                border: 1px solid #d1d5db; border-radius: 5px;
                padding: 4px 10px; font-size: 11.5px; font-weight: 700;
                cursor: pointer; transition: all 0.12s ease;
                white-space: nowrap;
            }
            .jw-pill-btn:hover { border-color: #d9a425; background: #fef9ea; color: #1f2937; }
            .jw-pill-btn.active {
                background: #f2b71d; color: #1f2937;
                border-color: #d9a425; font-weight: 800;
            }
            .jw-body {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 14px 20px;
                overflow-y: auto;
                overflow-x: hidden;
                flex: 1;
                background: #ffffff;
                box-sizing: border-box;
            }
            .jw-top-grid {
                display: grid;
                grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
                gap: 18px;
                align-items: stretch;
                min-width: 0;
            }
            @media (max-width: 840px) {
                .jw-top-grid { grid-template-columns: minmax(0, 1fr); }
            }
            .jw-left-col, .jw-right-col {
                min-width: 0;
                box-sizing: border-box;
            }
            .jw-right-col {
                display: flex; flex-direction: column;
            }
            .jw-sec-title {
                font-size: 11px; font-weight: 800; color: #92400e;
                text-transform: uppercase; letter-spacing: 0.6px;
                border-bottom: 1px solid #eadab0;
                padding-bottom: 3px; margin: 10px 0 7px 0;
            }
            .jw-row {
                display: grid;
                grid-template-columns: 145px minmax(0, 1fr);
                align-items: center;
                gap: 10px;
                margin-bottom: 6px;
                min-width: 0;
            }
            .jw-row > * { min-width: 0; }
            .jw-lbl {
                font-size: 12.5px; font-weight: 600; color: #374151;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .jw-inp {
                width: 100%; min-width: 0; max-width: 100%;
                box-sizing: border-box;
                padding: 6px 10px;
                border: 1px solid #d1d5db; border-radius: 4px;
                font-size: 13px; font-weight: 700; color: #111827;
                background: #ffffff; outline: none;
                transition: border-color 0.12s, background 0.12s;
            }
            .jw-inp:focus {
                border-color: #d9a425 !important;
                background: #fffdf5 !important;
                box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.22);
            }
            .jw-inp-num { text-align: right; font-variant-numeric: tabular-nums; }
            .jw-right-panel {
                border: 1px solid #e5d5a7; border-radius: 6px;
                background: #ffffff; display: flex; flex-direction: column;
                overflow: hidden; min-width: 0; flex: 1;
            }
            .jw-right-head {
                background: #fdf6e2; border-bottom: 1px solid #e5d5a7;
                padding: 7px 12px; font-size: 12px; font-weight: 800; color: #1f2937;
                display: flex; justify-content: space-between; align-items: center;
            }
            .jw-picker-list {
                overflow-y: auto; flex: 1; min-height: 210px; max-height: 295px;
            }
            .jw-picker-item {
                padding: 7px 12px; font-size: 12.5px; font-weight: 600; color: #1f2937;
                border-bottom: 1px solid #f3f4f6; cursor: pointer;
                display: flex; justify-content: space-between; align-items: center; gap: 8px;
            }
            .jw-picker-item:hover { background: #fef9ea; }
            .jw-picker-item.active {
                background: #f2b71d; color: #1f2937; font-weight: 800;
            }
            .jw-picker-sub {
                font-size: 11px; color: #6b7280; font-weight: 600;
            }
            .jw-picker-item.active .jw-picker-sub { color: #374151; }
            .jw-batch-panel {
                border: 1px solid #e5d5a7; border-radius: 6px;
                background: #ffffff; overflow: hidden; width: 100%;
                box-sizing: border-box;
            }
            .jw-batch-table {
                width: 100%; border-collapse: collapse; font-size: 12.5px;
            }
            .jw-batch-table th {
                background: #fdf6e2; color: #1f2937; font-weight: 800;
                padding: 6px 10px; text-align: left;
                border-bottom: 1px solid #e5d5a7; font-size: 11.5px;
                position: sticky; top: 0;
            }
            .jw-batch-table td {
                padding: 6px 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937;
            }
            .jw-footer {
                background: #fdf6e2; border-top: 1px solid #e5d5a7;
                padding: 8px 20px;
                display: flex; justify-content: space-between; align-items: center;
                flex-wrap: wrap; gap: 8px; font-size: 11.5px; color: #6b7280;
            }
            .jw-btn-save {
                background: #f2b71d; color: #1f2937;
                border: 1px solid #d9a425; border-radius: 5px;
                padding: 7px 18px; font-size: 13px; font-weight: 800;
                cursor: pointer; white-space: nowrap;
            }
            .jw-btn-save:hover { background: #e5aa12; }
            .jw-btn-sec {
                background: #ffffff; color: #1f2937;
                border: 1px solid #d1d5db; border-radius: 5px;
                padding: 7px 13px; font-size: 12px; font-weight: 700;
                cursor: pointer; white-space: nowrap;
            }
            .jw-btn-sec:hover { border-color: #d9a425; background: #fef9ea; }
            .jw-accept-bar {
                background: #fdf6e2; border: 1.5px solid #d9a425; border-radius: 5px;
                padding: 8px 14px;
                display: flex; justify-content: space-between; align-items: center; gap: 10px;
            }
        `;
        document.head.appendChild(style);
    };

    /* ========================================================================
       4. OPEN JOBWORK EXPRESS MODAL (TOP SPLIT + FULL-WIDTH BATCH BOTTOM)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.openJobWorkExpressModal = () => {
        ensureTallyJobWorkStyles();
        const existing = document.getElementById('master-jobwork-express-modal');
        if (existing) existing.remove();

        activeCategory = 'cutting';
        movementType = 'gayi';
        stockSource = 'fresh';
        expressBatchItems = [];
        lastSavedExpressBatch = null;
        jwPickerMode = 'process';
        jwPickerItems = [];
        jwPickerActiveIdx = 0;
        jwMakerArrowUsed = false;

        const today = getToday();
        const activeKid = getEffectiveGodown();
        const godamName = (typeof window.getKarkhanaNameById === 'function')
            ? window.getKarkhanaNameById(activeKid)
            : 'Main Godown';

        const modalHtml = `
        <div id="master-jobwork-express-modal" class="jw-overlay">
            <div class="jw-card">

                <!-- Clean Minimal Cream Header -->
                <div class="jw-header">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <h3 class="jw-title">JobWork Voucher</h3>
                        <button type="button" tabindex="-1" id="jw-exp-cat-cutting" class="jw-pill-btn active" onclick="switchJobWorkCategory('cutting')">Cutting [F1]</button>
                        <button type="button" tabindex="-1" id="jw-exp-cat-embroidery" class="jw-pill-btn" onclick="switchJobWorkCategory('embroidery')">Embroidery [F2]</button>
                        <button type="button" tabindex="-1" id="jw-exp-cat-calender" class="jw-pill-btn" onclick="switchJobWorkCategory('calender')">Calender [F3]</button>
                        <button type="button" tabindex="-1" id="jw-exp-cat-dukan" class="jw-pill-btn" onclick="switchJobWorkCategory('dukan')">Dukan [F4]</button>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:11.5px; color:#6b7280; font-weight:700;">Godown: ${esc(godamName)}</span>
                        <button type="button" tabindex="-1" id="jw-exp-btn-movement" style="display:none;" onclick="toggleMovementType()">Saree Gayi</button>
                        <button type="button" tabindex="-1" id="jw-exp-close-btn" class="jw-pill-btn" onclick="closeJobWorkExpressModal()">&larr; [Esc] Back</button>
                    </div>
                </div>

                <!-- BODY: TOP SPLIT + BOTTOM FULL-WIDTH BATCH TABLE -->
                <div class="jw-body">

                    <!-- TOP 2-COLUMN SPLIT -->
                    <div class="jw-top-grid">

                        <!-- LEFT PANE: 1 FIELD PER ROW -->
                        <div class="jw-left-col">
                            <div class="jw-sec-title" style="margin-top:0;">1. Process, Len-Den &amp; Worker</div>

                            <div class="jw-row">
                                <label class="jw-lbl">Process [F1-F4] :</label>
                                <input type="text" id="jw-exp-cat-input" value="1. Cutting" readonly class="jw-inp" style="border-color:#d9a425; cursor:pointer;">
                            </div>

                            <div class="jw-row" id="jw-exp-movement-row">
                                <label class="jw-lbl">Len-Den [F5] :</label>
                                <input type="text" id="jw-exp-movement-input" value="Saree Gayi (Bheja)" readonly class="jw-inp" style="cursor:pointer;">
                            </div>

                            <div id="jw-exp-source-container" class="jw-row">
                                <label class="jw-lbl">Stock Source [F6] :</label>
                                <div>
                                    <input type="text" id="jw-exp-source-input" value="Fresh Godown Stock" readonly class="jw-inp" style="display:none; cursor:pointer;">
                                    <select id="jw-exp-source-select" tabindex="-1" onchange="onExpressSourceDropdownChange(this.value)" style="display:none;"></select>
                                    <span id="jw-exp-source-locked" style="display:block; width:100%; box-sizing:border-box; padding:6px 10px; background:#fdfcf7; border:1px solid #eadab0; border-radius:4px; font-size:12.5px; font-weight:700; color:#6b7280;">Fresh Godown Stock [Locked]</span>
                                </div>
                            </div>

                            <div class="jw-row">
                                <label id="jw-exp-lbl-worker" class="jw-lbl">Cutting Kariger :</label>
                                <div>
                                    <input type="text" id="jw-exp-worker-input" placeholder="Select Worker..." autocomplete="off" class="jw-inp" style="border-color:#d9a425;">
                                    <select id="jw-exp-worker" tabindex="-1" style="display:none;"></select>
                                </div>
                            </div>

                            <div class="jw-row">
                                <label class="jw-lbl">Date :</label>
                                <input type="date" id="jw-exp-date" value="${today}" class="jw-inp">
                            </div>

                            <!-- SECTION 2: BATCH ENTRY -->
                            <div class="jw-sec-title" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>2. Batch Entry (Bunne Wale Ka Naam)</span>
                                <span id="jw-exp-live-stock-hint" style="color:#b47d00; font-size:11px; text-transform:none;"></span>
                            </div>

                            <div class="jw-row">
                                <label class="jw-lbl">Maker (Bunne Wala) :</label>
                                <div>
                                    <input type="text" id="jw-exp-maker-input" placeholder="Maker naam likhein ya &uarr;&darr; chunein..." autocomplete="off" class="jw-inp" style="border-color:#d9a425;">
                                    <datalist id="jw-exp-maker-dl"></datalist>
                                </div>
                            </div>

                            <div class="jw-row">
                                <label class="jw-lbl">Saree Qty (Pcs) :</label>
                                <div style="display:flex; gap:8px; align-items:center; min-width:0;">
                                    <div id="jw-exp-naap-container" style="display:none; width:88px; flex-shrink:0;">
                                        <input type="text" id="jw-exp-naap-input" value="${lastEnteredNaap}" placeholder="Naap" title="Embroidery Naap" class="jw-inp jw-inp-num">
                                    </div>
                                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="jw-exp-qty-input" placeholder="0 Pcs" class="jw-inp jw-inp-num" style="flex:1; min-width:60px; border-color:#d9a425;">
                                    <button type="button" tabindex="-1" id="jw-exp-add-row-btn" class="jw-btn-save" style="padding:6px 12px; font-size:12px;" onclick="addExpressBatchRow()">+ Jodein</button>
                                </div>
                            </div>

                            <!-- SECTION 3: DAMAGE (HIDDEN IN DUKAN) -->
                            <div id="jw-exp-damage-row">
                                <div class="jw-sec-title">3. Damage / Kaat (Optional)</div>
                                <div class="jw-row">
                                    <label class="jw-lbl">Damage &amp; Fine :</label>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; min-width:0;">
                                        <input type="text" inputmode="numeric" id="jw-exp-damage-pcs" placeholder="Damage Pcs (0)" class="jw-inp jw-inp-num">
                                        <input type="text" inputmode="decimal" id="jw-exp-damage-amt" placeholder="Fine ₹ (0.00)" class="jw-inp jw-inp-num">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- RIGHT PANE: FULL-HEIGHT TALLY PICKER -->
                        <div class="jw-right-col">
                            <div class="jw-right-panel">
                                <div class="jw-right-head">
                                    <span id="jw-right-title">List of Processes</span>
                                    <span id="jw-right-hint" style="font-size:11px; color:#6b7280; font-weight:600;">&uarr;&darr; + Enter</span>
                                </div>
                                <div id="jw-right-picker" class="jw-picker-list"></div>
                            </div>
                        </div>

                    </div>

                    <!-- FULL-WIDTH GATTHI / BATCH LIST TABLE (BOTTOM) -->
                    <div class="jw-batch-panel">
                        <div class="jw-right-head">
                            <span>Gatthi / Batch List</span>
                            <div style="display:flex; align-items:center; gap:14px;">
                                <span id="jw-exp-batch-count-badge" style="color:#6b7280; font-weight:700;">0 Items</span>
                                <span style="font-size:12.5px; font-weight:800; color:#1f2937;">Total: <strong id="jw-exp-live-batch-total" style="color:#b47d00; font-size:14px;">0 Pcs</strong></span>
                            </div>
                        </div>
                        <div style="overflow-y:auto; max-height:145px;">
                            <table class="jw-batch-table">
                                <thead>
                                    <tr>
                                        <th style="width:45px;">#</th>
                                        <th>Maker (Bunne Wala)</th>
                                        <th>Saree Design</th>
                                        <th style="width:90px; text-align:center;">Naap</th>
                                        <th style="width:100px; text-align:right;">Qty (Pcs)</th>
                                        <th style="width:65px; text-align:center;">Del</th>
                                    </tr>
                                </thead>
                                <tbody id="jw-exp-table-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Tally Accept? (Yes / No) Confirmation Bar -->
                    <div id="jw-exp-accept-strip" class="jw-accept-bar" style="display:none;">
                        <span style="font-size:13px; font-weight:800; color:#1f2937;">Accept? Batch Save &amp; Challan Print Karein?</span>
                        <div style="display:flex; gap:8px;">
                            <button type="button" id="jw-exp-accept-yes" class="jw-btn-save" style="padding:5px 14px;" onclick="submitMasterJobWorkExpress(true)">Yes [Y / Enter]</button>
                            <button type="button" id="jw-exp-accept-no" class="jw-btn-sec" style="padding:5px 14px;" onclick="window.__jwCancelAccept()">No [N / Esc]</button>
                        </div>
                    </div>

                    <!-- Full-Width Action Bar -->
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span id="jw-exp-live-batch-summary" style="font-size:12px; color:#6b7280; font-weight:600;">Batch khali hai</span>
                        <div style="display:flex; gap:8px;">
                            <button type="button" tabindex="-1" id="jw-exp-print-btn" class="jw-btn-sec" onclick="printLastSavedJobWorkChallan()">A6 Challan [Alt+P]</button>
                            <button type="button" id="jw-exp-submit-btn" class="jw-btn-save" onclick="submitMasterJobWorkExpress(true)">Save &amp; Challan [Ctrl+Enter]</button>
                        </div>
                    </div>

                </div>

                <!-- Bottom Tally Status Bar -->
                <div class="jw-footer">
                    <div id="jw-exp-status-msg" style="font-weight:700; color:#b47d00;">
                        [&uarr;&darr; + Enter] Right List Select &bull; [F1-F4] Process &bull; [F5] Gayi/Aayi &bull; [F6] Source &bull; [Ctrl+&crarr;] Save &bull; [Esc] Back
                    </div>
                    <div style="font-weight:600;">TallyPrime White &amp; Gold Mode</div>
                </div>

            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        updateCategoryStyles();
        populateExpressWorkers();
        updateSubBarState();
        updateExpressMakerDatalist();
        renderExpressBatchGrid();
        bindJobWorkExpressEvents();
        showJwRightPicker('process', '');
    };

    /* ========================================================================
       5. RIGHT-PANE DYNAMIC TALLY PICKER CONTROLLER
       ------------------------------------------------------------------------
    ======================================================================== */
    const getWorkerPickerList = (queryText = '') => {
        const q = String(queryText || '').trim().toLowerCase();
        if (activeCategory === 'dukan') {
            return [
                { label: 'Apni Main Dukan', sub: 'Main', id: 'dukan_main' },
                { label: 'Party / Retailer', sub: 'Party', id: 'dukan_party' }
            ].filter(x => !q || x.label.toLowerCase().includes(q));
        }

        const allWorkers = toArray(getFromStore('jobwork_workers'));
        return allWorkers
            .filter(w => w && String(w.type || '').toLowerCase().trim() === activeCategory)
            .filter(w => !q || `${w.name} ${w.mobile || ''}`.toLowerCase().includes(q))
            .map(w => ({
                label: w.name,
                sub: w.mobile || activeCategory.toUpperCase(),
                id: w.id
            }));
    };

    const showJwRightPicker = (mode, queryText) => {
        jwPickerMode = mode;
        const pickerEl = document.getElementById('jw-right-picker');
        const titleEl = document.getElementById('jw-right-title');
        const hintEl = document.getElementById('jw-right-hint');
        if (!pickerEl) return;

        jwPickerItems = [];

        if (mode === 'process') {
            if (titleEl) titleEl.textContent = 'List of Processes';
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            jwPickerItems = [
                { label: '1. Cutting', sub: 'F1', data: 'cutting' },
                { label: '2. Embroidery', sub: 'F2', data: 'embroidery' },
                { label: '3. Calender', sub: 'F3', data: 'calender' },
                { label: '4. Dukan', sub: 'F4', data: 'dukan' }
            ];
            const idx = jwPickerItems.findIndex(x => x.data === activeCategory);
            jwPickerActiveIdx = idx >= 0 ? idx : 0;
        } else if (mode === 'movement') {
            if (titleEl) titleEl.textContent = 'Select Len-Den (Movement)';
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            jwPickerItems = [
                { label: 'Saree Gayi (Bheja)', sub: 'Outward', data: 'gayi' },
                { label: 'Wapas Aayi (Tayyar)', sub: 'Inward', data: 'aayi' }
            ];
            const idx = jwPickerItems.findIndex(x => x.data === movementType);
            jwPickerActiveIdx = idx >= 0 ? idx : 0;
        } else if (mode === 'source') {
            if (titleEl) titleEl.textContent = 'Select Stock Source';
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            if (activeCategory === 'embroidery') {
                jwPickerItems = [
                    { label: 'Fresh Godown Stock', sub: 'Fresh', data: 'fresh' },
                    { label: 'Cutting Stock', sub: 'Cutting', data: 'cutting' }
                ];
            } else if (activeCategory === 'calender') {
                jwPickerItems = [
                    { label: 'Cutting Stock', sub: 'Cutting', data: 'cutting' },
                    { label: 'Embroidery Stock', sub: 'Embroidery', data: 'embroidery' },
                    { label: 'Fresh Godown Stock', sub: 'Fresh', data: 'fresh' }
                ];
            }
            const idx = jwPickerItems.findIndex(x => x.data === stockSource);
            jwPickerActiveIdx = idx >= 0 ? idx : 0;
        } else if (mode === 'worker') {
            if (titleEl) titleEl.textContent = activeCategory === 'dukan' ? 'Select Dukan / Receiver' : `List of ${activeCategory.toUpperCase()} Workers`;
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            const list = getWorkerPickerList(queryText);
            jwPickerItems = list.map(w => ({ label: w.label, sub: w.sub, data: w }));
            const curVal = document.getElementById('jw-exp-worker')?.value;
            const curIdx = jwPickerItems.findIndex(x => String(x.data.id) === String(curVal));
            jwPickerActiveIdx = curIdx >= 0 ? curIdx : 0;
        } else if (mode === 'maker') {
            const effStage = getTargetStageForLookup();
            if (titleEl) titleEl.textContent = `List of Makers (${effStage.toUpperCase()} Stock)`;
            if (hintEl) hintEl.textContent = expressBatchItems.length > 0 ? 'Khali Enter = Batch Poora' : '↑↓ + Enter';
            jwPickerItems = getAvailableMakersList(queryText);
            if (jwPickerActiveIdx >= jwPickerItems.length) jwPickerActiveIdx = 0;
            if (jwPickerActiveIdx < 0) jwPickerActiveIdx = 0;
        } else if (mode === 'summary') {
            if (titleEl) titleEl.textContent = 'Active Entry Context';
            if (hintEl) hintEl.textContent = 'Live Info';
            const wText = document.getElementById('jw-exp-worker-input')?.value || '-';
            const srcTxt = getSourceDisplayName(stockSource);
            pickerEl.innerHTML = `
                <div style="padding:12px 14px; font-size:12.5px; line-height:1.7;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f3f4f6; padding-bottom:5px; margin-bottom:5px;">
                        <span style="color:#6b7280;">Process:</span> <strong>${esc(getCategoryDisplayName(activeCategory))}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f3f4f6; padding-bottom:5px; margin-bottom:5px;">
                        <span style="color:#6b7280;">Len-Den:</span> <strong>${movementType === 'gayi' ? 'Saree Gayi (Bheja)' : 'Wapas Aayi (Tayyar)'}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f3f4f6; padding-bottom:5px; margin-bottom:5px;">
                        <span style="color:#6b7280;">Source:</span> <strong>${esc(srcTxt)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#6b7280;">Worker:</span> <strong style="color:#b47d00;">${esc(wText)}</strong>
                    </div>
                </div>`;
            return;
        }

        renderJwRightPickerList();
    };

    const renderJwRightPickerList = () => {
        const pickerEl = document.getElementById('jw-right-picker');
        if (!pickerEl) return;

        if (!jwPickerItems.length) {
            pickerEl.innerHTML = `<div style="padding:18px 12px; text-align:center; color:#6b7280; font-size:12px;">Koi matching record nahi mila.</div>`;
            return;
        }

        let html = '';
        jwPickerItems.forEach((item, idx) => {
            const cls = idx === jwPickerActiveIdx ? 'jw-picker-item active' : 'jw-picker-item';
            html += `<div class="${cls}" onmousedown="event.preventDefault(); window.__jwPickItem(${idx})">
                <span>${esc(item.label)}</span>
                <span class="jw-picker-sub">${esc(item.sub)}</span>
            </div>`;
        });
        pickerEl.innerHTML = html;

        const activeEl = pickerEl.querySelector('.jw-picker-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const focusNextAfterProcess = () => {
        if (activeCategory === 'dukan') {
            focusFirstField('jw-exp-worker-input');
        } else {
            focusFirstField('jw-exp-movement-input');
        }
    };

    const focusNextAfterMovement = () => {
        if (movementType === 'gayi' && (activeCategory === 'embroidery' || activeCategory === 'calender')) {
            focusFirstField('jw-exp-source-input');
        } else {
            focusFirstField('jw-exp-worker-input');
        }
    };

    window.__jwPickItem = (idx) => {
        const item = jwPickerItems[idx];
        if (!item) return;

        if (jwPickerMode === 'process') {
            if (item.data !== activeCategory) {
                if (!switchJobWorkCategory(item.data, true)) return;
            } else {
                focusNextAfterProcess();
            }
        } else if (jwPickerMode === 'movement') {
            if (item.data !== movementType) {
                if (!confirmClearBatchIfNeeded('Len-Den (Gayi/Aayi)')) return;
                movementType = item.data;
                updateSubBarState();
                updateExpressMakerDatalist();
                updateMakerLiveStockDisplay();
            }
            focusNextAfterMovement();
        } else if (jwPickerMode === 'source') {
            if (item.data !== stockSource) {
                if (!confirmClearBatchIfNeeded('Stock Source')) return;
                stockSource = item.data;
                updateSubBarState();
                updateExpressMakerDatalist();
                updateMakerLiveStockDisplay();
            }
            focusFirstField('jw-exp-worker-input');
        } else if (jwPickerMode === 'worker') {
            const wSel = document.getElementById('jw-exp-worker');
            const wInp = document.getElementById('jw-exp-worker-input');
            if (wSel) wSel.value = item.data.id;
            if (wInp) wInp.value = item.data.label;
            focusFirstField('jw-exp-date');
        } else if (jwPickerMode === 'maker') {
            const mInp = document.getElementById('jw-exp-maker-input');
            if (mInp) mInp.value = item.data;
            updateMakerLiveStockDisplay();
            if (activeCategory === 'embroidery') {
                focusFirstField('jw-exp-naap-input');
            } else {
                focusFirstField('jw-exp-qty-input');
            }
        }
    };

    /* ========================================================================
       6. TALLY-STYLE KEYBOARD ENGINE (FOCUS TRAP + ENTER CHAINING + ACCEPT)
       ------------------------------------------------------------------------
    ======================================================================== */
    const getOrderedFocusableInputs = () => {
        const ids = [
            'jw-exp-cat-input',
            'jw-exp-movement-input',
            'jw-exp-source-input',
            'jw-exp-worker-input',
            'jw-exp-date',
            'jw-exp-maker-input',
            'jw-exp-naap-input',
            'jw-exp-qty-input',
            'jw-exp-damage-pcs',
            'jw-exp-damage-amt',
            'jw-exp-submit-btn'
        ];
        return ids
            .map((id) => document.getElementById(id))
            .filter((el) => el && !el.disabled && el.offsetParent !== null && getComputedStyle(el).display !== 'none');
    };

    const moveJwField = (currentId, dir) => {
        const list = getOrderedFocusableInputs();
        const curEl = document.getElementById(currentId);
        const idx = list.indexOf(curEl);
        if (idx === -1) return;
        const nextIdx = idx + dir;
        if (nextIdx >= 0 && nextIdx < list.length) {
            const el = list[nextIdx];
            if (el) {
                el.focus();
                if (typeof el.select === 'function' && !el.readOnly) el.select();
            }
        }
    };

    const focusFirstField = (targetId = 'jw-exp-cat-input') => {
        setTimeout(() => {
            const el = document.getElementById(targetId);
            if (el && el.offsetParent !== null && getComputedStyle(el).display !== 'none') {
                el.focus();
                if (typeof el.select === 'function' && !el.readOnly) el.select();
            } else {
                const list = getOrderedFocusableInputs();
                if (list.length) list[0].focus();
            }
        }, 50);
    };

    const showJwAcceptPrompt = (show) => {
        const bar = document.getElementById('jw-exp-accept-strip');
        if (!bar) return;
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            const yesBtn = document.getElementById('jw-exp-accept-yes');
            if (yesBtn) yesBtn.focus();
        }
    };

    const bindJobWorkExpressEvents = () => {
        const modal = document.getElementById('master-jobwork-express-modal');
        if (!modal) return;

        window.__jwCancelAccept = () => {
            showJwAcceptPrompt(false);
            focusFirstField('jw-exp-maker-input');
        };

        const yesBtn = document.getElementById('jw-exp-accept-yes');
        if (yesBtn) {
            yesBtn.addEventListener('keydown', (e) => {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    submitMasterJobWorkExpress(true);
                } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.__jwCancelAccept();
                }
            });
        }

        const catInp = document.getElementById('jw-exp-cat-input');
        const movInp = document.getElementById('jw-exp-movement-input');
        const srcInp = document.getElementById('jw-exp-source-input');
        const workerInp = document.getElementById('jw-exp-worker-input');
        const dateEl = document.getElementById('jw-exp-date');
        const makerInp = document.getElementById('jw-exp-maker-input');
        const naapInp = document.getElementById('jw-exp-naap-input');
        const qtyInp = document.getElementById('jw-exp-qty-input');
        const dmgPcsInp = document.getElementById('jw-exp-damage-pcs');
        const dmgAmtInp = document.getElementById('jw-exp-damage-amt');

        focusFirstField('jw-exp-cat-input');

        const attachStepPicker = (el, modeName, isFilterable) => {
            if (!el) return;
            el.addEventListener('focus', () => {
                showJwRightPicker(modeName, '');
            });
            if (isFilterable) {
                el.addEventListener('input', () => {
                    jwPickerActiveIdx = 0;
                    showJwRightPicker(modeName, el.value);
                });
            }
            el.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (jwPickerItems.length) {
                        e.preventDefault();
                        if (e.key === 'ArrowDown') {
                            jwPickerActiveIdx = (jwPickerActiveIdx + 1) % jwPickerItems.length;
                        } else {
                            jwPickerActiveIdx = (jwPickerActiveIdx - 1 + jwPickerItems.length) % jwPickerItems.length;
                        }
                        renderJwRightPickerList();
                    }
                    return;
                }
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        moveJwField(el.id, -1);
                        return;
                    }
                    if (jwPickerItems.length && jwPickerItems[jwPickerActiveIdx]) {
                        window.__jwPickItem(jwPickerActiveIdx);
                    } else {
                        moveJwField(el.id, 1);
                    }
                }
            });
        };

        attachStepPicker(catInp, 'process', false);
        attachStepPicker(movInp, 'movement', false);
        attachStepPicker(srcInp, 'source', false);
        attachStepPicker(workerInp, 'worker', true);

        if (dateEl) {
            dateEl.addEventListener('focus', () => showJwRightPicker('summary', ''));
            dateEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) moveJwField('jw-exp-date', -1);
                    else focusFirstField('jw-exp-maker-input');
                }
            });
        }

        if (makerInp) {
            makerInp.addEventListener('focus', () => {
                jwMakerArrowUsed = false;
                jwPickerActiveIdx = 0;
                showJwRightPicker('maker', makerInp.value);
            });
            makerInp.addEventListener('input', () => {
                jwMakerArrowUsed = true;
                jwPickerActiveIdx = 0;
                showJwRightPicker('maker', makerInp.value);
                updateMakerLiveStockDisplay();
            });
            makerInp.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (jwPickerItems.length) {
                        e.preventDefault();
                        jwMakerArrowUsed = true;
                        if (e.key === 'ArrowDown') {
                            jwPickerActiveIdx = (jwPickerActiveIdx + 1) % jwPickerItems.length;
                        } else {
                            jwPickerActiveIdx = (jwPickerActiveIdx - 1 + jwPickerItems.length) % jwPickerItems.length;
                        }
                        renderJwRightPickerList();
                    }
                    return;
                }
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        moveJwField('jw-exp-maker-input', -1);
                        return;
                    }
                    const typed = makerInp.value.trim();
                    if (!typed && expressBatchItems.length > 0 && !jwMakerArrowUsed) {
                        if (activeCategory !== 'dukan' && dmgPcsInp && dmgPcsInp.offsetParent !== null) {
                            dmgPcsInp.focus();
                            dmgPcsInp.select();
                        } else {
                            showJwAcceptPrompt(true);
                        }
                        return;
                    }
                    if (jwPickerItems.length && (jwMakerArrowUsed || typed !== '' || expressBatchItems.length === 0)) {
                        window.__jwPickItem(jwPickerActiveIdx);
                        return;
                    }
                }
            });
        }

        if (naapInp) {
            naapInp.addEventListener('focus', () => showJwRightPicker('summary', ''));
            naapInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) { moveJwField('jw-exp-naap-input', -1); return; }
                    if (naapInp.value.trim()) lastEnteredNaap = naapInp.value.trim();
                    if (qtyInp) { qtyInp.focus(); qtyInp.select(); }
                }
            });
        }

        if (qtyInp) {
            qtyInp.addEventListener('focus', () => showJwRightPicker('summary', ''));
            qtyInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) { moveJwField('jw-exp-qty-input', -1); return; }
                    addExpressBatchRow();
                }
            });
        }

        if (dmgPcsInp) {
            dmgPcsInp.addEventListener('focus', () => showJwRightPicker('summary', ''));
            dmgPcsInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) { moveJwField('jw-exp-damage-pcs', -1); return; }
                    if (dmgAmtInp) { dmgAmtInp.focus(); dmgAmtInp.select(); }
                }
            });
        }

        if (dmgAmtInp) {
            dmgAmtInp.addEventListener('focus', () => showJwRightPicker('summary', ''));
            dmgAmtInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) { moveJwField('jw-exp-damage-amt', -1); return; }
                    showJwAcceptPrompt(true);
                }
            });
        }

        window.removeEventListener('keydown', handleJobWorkExpressGlobalKeydown, true);
        window.addEventListener('keydown', handleJobWorkExpressGlobalKeydown, true);
    };

    const handleJobWorkExpressGlobalKeydown = (e) => {
        const modal = document.getElementById('master-jobwork-express-modal');
        if (!modal || modal.style.display === 'none') return;

        if (e.key === 'Tab') {
            const list = getOrderedFocusableInputs();
            if (!list.length) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const curIdx = list.indexOf(document.activeElement);
            let nextIdx = 0;
            if (curIdx === -1) nextIdx = 0;
            else if (e.shiftKey) nextIdx = (curIdx - 1 + list.length) % list.length;
            else nextIdx = (curIdx + 1) % list.length;

            const nextEl = list[nextIdx];
            if (nextEl) {
                nextEl.focus();
                if (typeof nextEl.select === 'function' && !nextEl.readOnly) nextEl.select();
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const acceptBar = document.getElementById('jw-exp-accept-strip');
            if (acceptBar && acceptBar.style.display !== 'none') {
                window.__jwCancelAccept();
            } else {
                closeJobWorkExpressModal();
            }
            return;
        }

        if (e.key === 'F1' || (e.altKey && (e.key === '1' || e.code === 'Digit1'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            switchJobWorkCategory('cutting', true);
            return;
        }
        if (e.key === 'F2' || (e.altKey && (e.key === '2' || e.code === 'Digit2'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            switchJobWorkCategory('embroidery', true);
            return;
        }
        if (e.key === 'F3' || (e.altKey && (e.key === '3' || e.code === 'Digit3'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            switchJobWorkCategory('calender', true);
            return;
        }
        if (e.key === 'F4' || (e.altKey && (e.key === '4' || e.code === 'Digit4'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            switchJobWorkCategory('dukan', true);
            return;
        }
        if (e.key === 'F5' || (e.altKey && (e.key === '5' || e.code === 'Digit5'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            toggleMovementType(true);
            return;
        }
        if (e.key === 'F6' || (e.altKey && (e.key === '6' || e.code === 'Digit6'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            toggleStockSource(true);
            return;
        }

        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            submitMasterJobWorkExpress(true);
            return;
        }

        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            printLastSavedJobWorkChallan();
            return;
        }
    };

    window.closeJobWorkExpressModal = () => {
        window.removeEventListener('keydown', handleJobWorkExpressGlobalKeydown, true);
        const modal = document.getElementById('master-jobwork-express-modal');
        if (modal) modal.remove();
        expressBatchItems = [];
    };

    /* ========================================================================
       7. LEVEL 1 & 2 SWITCHES (WITH ZERO-MIX GUARD)
       ------------------------------------------------------------------------
    ======================================================================== */
    const confirmClearBatchIfNeeded = (actionLabel) => {
        if (expressBatchItems.length === 0) return true;
        const ok = confirm(`Batch list me ${expressBatchItems.length} item pehle se jode hue hain.\n${actionLabel} badalne par purani list clear ho jayegi taaki maal mix na ho.\n\nAage badhein?`);
        if (ok) {
            expressBatchItems = [];
            renderExpressBatchGrid();
        }
        return ok;
    };

    window.switchJobWorkCategory = (cat, advanceFocus = false) => {
        if (cat === activeCategory) {
            if (advanceFocus) focusNextAfterProcess();
            return true;
        }
        if (!confirmClearBatchIfNeeded('Process')) return false;

        activeCategory = cat;
        movementType = 'gayi';
        stockSource = getDefaultSourceForCategory(cat);

        updateCategoryStyles();
        populateExpressWorkers();
        updateSubBarState();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();

        if (advanceFocus) {
            focusNextAfterProcess();
        } else {
            focusFirstField('jw-exp-worker-input');
        }
        return true;
    };

    window.onExpressSourceDropdownChange = (nextVal) => {
        if (!nextVal || nextVal === stockSource) return;
        if (!confirmClearBatchIfNeeded('Stock Source')) {
            const sel = document.getElementById('jw-exp-source-select');
            if (sel) sel.value = stockSource;
            return;
        }
        stockSource = nextVal;
        updateSubBarState();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();
    };

    window.toggleStockSource = (advanceFocus = false) => {
        if (activeCategory === 'cutting' || activeCategory === 'dukan' || movementType !== 'gayi') return;

        let nextSource = stockSource;
        if (activeCategory === 'embroidery') {
            nextSource = (stockSource === 'fresh') ? 'cutting' : 'fresh';
        } else if (activeCategory === 'calender') {
            if (stockSource === 'cutting') nextSource = 'embroidery';
            else if (stockSource === 'embroidery') nextSource = 'fresh';
            else nextSource = 'cutting';
        }

        if (nextSource === stockSource) return;
        if (!confirmClearBatchIfNeeded('Stock Source')) return;

        stockSource = nextSource;
        updateSubBarState();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();
        if (advanceFocus) focusFirstField('jw-exp-worker-input');
    };

    window.toggleMovementType = (advanceFocus = false) => {
        if (activeCategory === 'dukan') return;
        if (!confirmClearBatchIfNeeded('Len-Den (Gayi/Aayi)')) return;

        movementType = (movementType === 'gayi') ? 'aayi' : 'gayi';
        updateSubBarState();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();
        if (advanceFocus) focusNextAfterMovement();
    };

    const updateCategoryStyles = () => {
        const btnCut = document.getElementById('jw-exp-cat-cutting');
        const btnEmb = document.getElementById('jw-exp-cat-embroidery');
        const btnCal = document.getElementById('jw-exp-cat-calender');
        const btnDuk = document.getElementById('jw-exp-cat-dukan');
        const catInp = document.getElementById('jw-exp-cat-input');

        [btnCut, btnEmb, btnCal, btnDuk].forEach((b) => {
            if (b) b.classList.remove('active');
        });

        if (activeCategory === 'cutting' && btnCut) btnCut.classList.add('active');
        else if (activeCategory === 'embroidery' && btnEmb) btnEmb.classList.add('active');
        else if (activeCategory === 'calender' && btnCal) btnCal.classList.add('active');
        else if (activeCategory === 'dukan' && btnDuk) btnDuk.classList.add('active');

        if (catInp) catInp.value = getCategoryDisplayName(activeCategory);

        const naapBox = document.getElementById('jw-exp-naap-container');
        if (naapBox) {
            naapBox.style.display = (activeCategory === 'embroidery') ? 'block' : 'none';
        }

        const dmgRow = document.getElementById('jw-exp-damage-row');
        if (dmgRow) {
            dmgRow.style.display = (activeCategory === 'dukan') ? 'none' : 'block';
        }
    };

    const updateSubBarState = () => {
        const btnMov = document.getElementById('jw-exp-btn-movement');
        const movRow = document.getElementById('jw-exp-movement-row');
        const movInp = document.getElementById('jw-exp-movement-input');
        const srcContainer = document.getElementById('jw-exp-source-container');
        const srcSelect = document.getElementById('jw-exp-source-select');
        const srcInp = document.getElementById('jw-exp-source-input');
        const srcLocked = document.getElementById('jw-exp-source-locked');
        const lblWorker = document.getElementById('jw-exp-lbl-worker');

        if (btnMov) {
            if (activeCategory === 'dukan') {
                movementType = 'gayi';
                btnMov.textContent = 'Dukan Bheja';
            } else if (movementType === 'gayi') {
                btnMov.textContent = 'Saree Gayi [F5]';
            } else {
                btnMov.textContent = 'Wapas Aayi [F5]';
            }
        }

        if (movRow) {
            movRow.style.display = (activeCategory === 'dukan') ? 'none' : 'grid';
        }
        if (movInp) {
            movInp.value = (movementType === 'gayi') ? 'Saree Gayi (Bheja)' : 'Wapas Aayi (Tayyar)';
        }

        if (srcContainer && srcSelect && srcLocked && srcInp) {
            if (activeCategory === 'dukan' || movementType !== 'gayi') {
                srcContainer.style.display = 'none';
                srcInp.style.display = 'none';
                srcLocked.style.display = 'none';
            } else if (activeCategory === 'cutting') {
                srcContainer.style.display = 'grid';
                srcInp.style.display = 'none';
                srcLocked.style.display = 'block';
                srcLocked.textContent = 'Fresh Godown Stock [Locked]';
            } else if (activeCategory === 'embroidery') {
                srcContainer.style.display = 'grid';
                srcLocked.style.display = 'none';
                srcInp.style.display = 'block';
                srcSelect.innerHTML = `
                    <option value="fresh">Fresh Godown Stock</option>
                    <option value="cutting">Cutting Stock</option>
                `;
                if (stockSource !== 'fresh' && stockSource !== 'cutting') stockSource = 'fresh';
                srcSelect.value = stockSource;
                srcInp.value = getSourceDisplayName(stockSource);
            } else if (activeCategory === 'calender') {
                srcContainer.style.display = 'grid';
                srcLocked.style.display = 'none';
                srcInp.style.display = 'block';
                srcSelect.innerHTML = `
                    <option value="cutting">Cutting Stock</option>
                    <option value="embroidery">Embroidery Stock</option>
                    <option value="fresh">Fresh Godown Stock</option>
                `;
                if (!['cutting', 'embroidery', 'fresh'].includes(stockSource)) stockSource = 'cutting';
                srcSelect.value = stockSource;
                srcInp.value = getSourceDisplayName(stockSource);
            }
        }

        if (lblWorker) {
            if (activeCategory === 'dukan') lblWorker.textContent = 'Dukan / Receiver :';
            else if (activeCategory === 'cutting') lblWorker.textContent = 'Cutting Kariger :';
            else if (activeCategory === 'embroidery') lblWorker.textContent = 'Embroidery Kariger :';
            else lblWorker.textContent = 'Calender Kariger :';
        }
    };

    const populateExpressWorkers = () => {
        const wSel = document.getElementById('jw-exp-worker');
        const wInp = document.getElementById('jw-exp-worker-input');
        if (!wSel) return;

        wSel.innerHTML = '';
        if (activeCategory === 'dukan') {
            wSel.innerHTML = '<option value="dukan_main">Apni Main Dukan</option><option value="dukan_party">Party / Retailer</option>';
            wSel.value = 'dukan_main';
            if (wInp) wInp.value = 'Apni Main Dukan';
            return;
        }

        const allWorkers = toArray(getFromStore('jobwork_workers'));
        const filtered = allWorkers.filter((w) => String(w?.type || '').toLowerCase().trim() === activeCategory);

        if (!filtered.length) {
            wSel.innerHTML = `<option value="">-- Koi ${activeCategory.toUpperCase()} Kariger nahi hai --</option>`;
            if (wInp) wInp.value = '';
            return;
        }

        filtered.forEach((w) => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = `${w.name}${w.mobile ? ` (${w.mobile})` : ''}`;
            wSel.appendChild(opt);
        });

        wSel.value = filtered[0].id;
        if (wInp) wInp.value = filtered[0].name;
    };

    const updateMakerLiveStockDisplay = () => {
        const mInp = document.getElementById('jw-exp-maker-input');
        const hint = document.getElementById('jw-exp-live-stock-hint');
        if (!hint) return;

        let rawVal = String(mInp?.value || '').trim();
        if (rawVal.includes('—')) rawVal = rawVal.split('—')[0].trim();
        const val = normText(rawVal);

        if (!val) {
            hint.textContent = '';
            return;
        }

        const effStage = getTargetStageForLookup();
        const info = resolveMakerLiveStockInfo(val, effStage);
        if (info && info.bachi !== undefined) {
            hint.textContent = `${effStage.toUpperCase()} Stock: ${info.bachi} Pcs [${info.saree}]`;
        } else {
            hint.textContent = '';
        }
    };

    /* ========================================================================
       8. LEVEL 3: BATCH ROW BUILDER
       ------------------------------------------------------------------------
    ======================================================================== */
    window.addExpressBatchRow = () => {
        const mInp = document.getElementById('jw-exp-maker-input');
        const nInp = document.getElementById('jw-exp-naap-input');
        const qInp = document.getElementById('jw-exp-qty-input');

        let rawMaker = String(mInp?.value || '').trim();
        if (rawMaker.includes('—')) rawMaker = rawMaker.split('—')[0].trim();
        const makerName = normText(rawMaker);

        const naap = (activeCategory === 'embroidery' && nInp) ? (nInp.value.trim() || '3.60') : '';
        const qty = safeInt(qInp?.value);

        if (!makerName) {
            alert('Kripya bunne wale Kariger ka naam chunein!');
            mInp?.focus();
            return;
        }

        if (qty <= 0) {
            alert('Kripya sahi Saree Qty (Pcs) bharein!');
            qInp?.focus();
            return;
        }

        if (naap) lastEnteredNaap = naap;

        const effStage = getTargetStageForLookup();
        const info = resolveMakerLiveStockInfo(makerName, effStage);
        const resolvedSaree = info?.saree || 'General Saree';

        expressBatchItems.push({
            maker: makerName,
            saree: resolvedSaree,
            naap: naap,
            qty: qty,
            source: effStage
        });

        renderExpressBatchGrid();

        if (mInp) mInp.value = '';
        if (qInp) qInp.value = '';
        updateMakerLiveStockDisplay();
        if (mInp) mInp.focus();
    };

    window.removeExpressBatchItem = (idx) => {
        expressBatchItems.splice(idx, 1);
        renderExpressBatchGrid();
    };

    const renderExpressBatchGrid = () => {
        const tbody = document.getElementById('jw-exp-table-body');
        const totalDisp = document.getElementById('jw-exp-live-batch-total');
        const summaryDisp = document.getElementById('jw-exp-live-batch-summary');
        const badge = document.getElementById('jw-exp-batch-count-badge');
        if (!tbody) return;

        let total = 0;
        let html = '';

        if (!expressBatchItems.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:16px; color:#6b7280;">Gatthi khali hai. Upar Maker chunein aur Qty daalein.</td></tr>';
            if (totalDisp) totalDisp.textContent = '0 Pcs';
            if (summaryDisp) summaryDisp.textContent = 'Batch khali hai';
            if (badge) badge.textContent = '0 Items';
            return;
        }

        expressBatchItems.forEach((it, idx) => {
            total += it.qty;
            html += `<tr>
                <td>${idx + 1}</td>
                <td style="font-weight:700;">${esc(it.maker)}</td>
                <td>${esc(it.saree)}</td>
                <td style="text-align:center; color:#b47d00; font-weight:700;">${it.naap ? esc(it.naap) : '-'}</td>
                <td style="text-align:right; font-weight:800;">${it.qty} Pcs</td>
                <td style="text-align:center;">
                    <button type="button" tabindex="-1" onclick="removeExpressBatchItem(${idx})" style="background:#ffffff; color:#374151; border:1px solid #d1d5db; border-radius:3px; padding:1px 7px; cursor:pointer; font-weight:700;">&times;</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if (totalDisp) totalDisp.textContent = `${total} Pcs`;
        if (summaryDisp) summaryDisp.textContent = `Kul ${expressBatchItems.length} Karigaron ki gatthi`;
        if (badge) badge.textContent = `${expressBatchItems.length} Items`;
    };

    /* ========================================================================
       9. ATOMIC COMMIT (100% PRESERVED SUPABASE & SHEET LOGIC)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.submitMasterJobWorkExpress = (doPrint = false) => {
        showJwAcceptPrompt(false);

        const wSel = document.getElementById('jw-exp-worker');
        const dInp = document.getElementById('jw-exp-date');

        const workerId = wSel?.value;
        if (!workerId) {
            alert('Kripya Job Worker ka chunav karein!');
            document.getElementById('jw-exp-worker-input')?.focus();
            return;
        }

        const isDukan = (activeCategory === 'dukan');
        const allWorkers = toArray(getFromStore('jobwork_workers'));
        const worker = isDukan
            ? { name: wSel.options[wSel.selectedIndex]?.text || 'Apni Dukan' }
            : allWorkers.find((x) => String(x.id) === String(workerId));
        const workerName = worker ? worker.name : 'Worker';

        const isGayi = (movementType === 'gayi');
        const d = toIsoDate(dInp?.value) || getToday();
        const targetKid = getEffectiveGodown();

        const damagePcs = isDukan ? 0 : safeInt(document.getElementById('jw-exp-damage-pcs')?.value);
        const damageAmt = isDukan ? 0 : safeNum(document.getElementById('jw-exp-damage-amt')?.value);

        if (!expressBatchItems.length && damagePcs <= 0) {
            alert('Batch me kam se kam 1 Kariger ki saree jodein!');
            document.getElementById('jw-exp-maker-input')?.focus();
            return;
        }

        const batchRowId = `jwb_${Date.now()}`;
        let totQty = 0;
        expressBatchItems.forEach((x) => { totQty += x.qty; });

        let sH = [...toArray(getFromStore('saree_history'))];

        let processTag = 'Cutting';
        if (activeCategory === 'calender') processTag = 'Calender';
        else if (activeCategory === 'embroidery') processTag = 'Embroidery';
        const targetLabel = isDukan ? '🏪 Apni Dukan' : `${workerName} (${processTag})`;

        const effectiveGayiSource = (activeCategory === 'calender' || activeCategory === 'embroidery') ? stockSource : 'fresh';

        expressBatchItems.forEach((it, idx) => {
            if (isDukan) {
                sH.push({
                    id: `sh_dukan_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                    refId: batchRowId,
                    date: d,
                    sareeName: it.saree,
                    karigerName: it.maker,
                    kariger: it.maker,
                    partyName: '🏪 Apni Dukan',
                    targetWorker: '🏪 Apni Dukan',
                    karkhanaId: targetKid,
                    type: 'finished',
                    typeLabel: '🏪 Dukan Bheja (Challan)',
                    aai: 0,
                    gai: it.qty,
                    isOut: true,
                    note: `${it.saree} (${workerName})`,
                    timestamp: Date.now() + idx
                });
            } else if (isGayi) {
                const effSource = it.source || effectiveGayiSource;
                sH.push({
                    id: `sh_diya_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                    refId: batchRowId,
                    date: d,
                    sareeName: it.saree,
                    karigerName: it.maker,
                    kariger: it.maker,
                    partyName: targetLabel,
                    targetWorker: targetLabel,
                    karkhanaId: targetKid,
                    type: effSource,
                    typeLabel: `📤 ${targetLabel} ko bheja [${effSource.toUpperCase()} Stock]`,
                    aai: 0,
                    gai: it.qty,
                    isOut: true,
                    note: `${targetLabel} ko bheja (${effSource})`,
                    timestamp: Date.now() + idx
                });
            } else {
                let targetTab = 'cutting';
                let icon = '✂️';

                if (activeCategory === 'calender') {
                    targetTab = 'finished';
                    icon = '✨';
                } else if (activeCategory === 'embroidery') {
                    targetTab = 'embroidery';
                    icon = '🪡';
                }

                sH.push({
                    id: `sh_aayi_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                    refId: batchRowId,
                    date: d,
                    sareeName: it.saree,
                    karigerName: it.maker,
                    kariger: it.maker,
                    partyName: targetLabel,
                    targetWorker: targetLabel,
                    karkhanaId: targetKid,
                    type: targetTab,
                    typeLabel: `${icon} ${targetLabel} se Tayyar Aayi${it.naap ? ` [Naap: ${it.naap}]` : ''}`,
                    aai: it.qty,
                    gai: 0,
                    isOut: false,
                    note: `${targetLabel} se tayyar aayi${it.naap ? ` (Naap: ${it.naap})` : ''}`,
                    naap: it.naap || '',
                    timestamp: Date.now() + idx
                });
            }
        });

        if (damagePcs > 0) {
            sH.push({
                id: `sh_dmg_${Date.now()}`,
                refId: batchRowId,
                date: d,
                sareeName: 'Damage Saree',
                karigerName: workerName,
                kariger: workerName,
                partyName: targetLabel,
                targetWorker: targetLabel,
                karkhanaId: targetKid,
                type: 'lott',
                typeLabel: `⚠️ ${targetLabel} se Damage Aayi (Fine: ₹${damageAmt})`,
                aai: damagePcs,
                gai: 0,
                isOut: false,
                note: `Damage Fine: ₹${damageAmt}`,
                timestamp: Date.now() + 200
            });
        }

        setToStore('saree_history', sH);

        if (isDukan) {
            const dukList = [...toArray(getFromStore('dukan_transfer_history'))];
            expressBatchItems.forEach((it, idx) => {
                dukList.push({
                    id: `duk_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                    date: d,
                    sareeName: it.saree,
                    karigerName: it.maker,
                    pcs: it.qty,
                    note: `${workerName} (Express)`,
                    timestamp: Date.now() + idx
                });
            });
            setToStore('dukan_transfer_history', dukList);
        } else {
            let sheets = toArray(getFromStore(`jobwork_sheets_${workerId}`));
            const targetMonthTitle = getMonthTitleFromDate(d);
            const targetMonthKey = String(d).substring(0, 7);

            let activeSheet = sheets.find((s) => s && (s.monthKey === targetMonthKey || String(s.title || '').includes(targetMonthTitle)));

            if (!activeSheet) {
                let carryForwardSaree = 0;
                if (sheets.length > 0) {
                    const prevSheet = sheets[sheets.length - 1];
                    const pSaree = safeNum(prevSheet.closingPendingSaree);
                    let gQty = 0, aQty = 0, dPcs = 0;
                    toArray(prevSheet.rows).forEach((r) => {
                        gQty += safeNum(r.gayiQty);
                        aQty += safeNum(r.aayiQty);
                        dPcs += safeNum(r.damagePcs);
                    });
                    carryForwardSaree = Math.max(0, (pSaree + gQty) - (aQty + dPcs));
                }

                activeSheet = {
                    id: `jw_sh_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    title: targetMonthTitle,
                    monthKey: targetMonthKey,
                    closingPendingSaree: carryForwardSaree,
                    closingBakiAmt: 0,
                    rows: []
                };
                sheets.push(activeSheet);
            }

            activeSheet.rows = toArray(activeSheet.rows);
            const batchItemsFormatted = expressBatchItems.map((x) => ({
                karigar: x.maker,
                qty: x.qty,
                naap: x.naap || '',
                source: isGayi ? (x.source || effectiveGayiSource) : undefined
            }));

            activeSheet.rows.push({
                id: batchRowId,
                date: d,
                gayiQty: isGayi ? totQty : 0,
                gayiItems: isGayi ? batchItemsFormatted : [],
                stockSource: isGayi ? effectiveGayiSource : 'fresh',
                aayiQty: isGayi ? 0 : totQty,
                aayiItems: isGayi ? [] : batchItemsFormatted,
                damagePcs,
                damageAmt
            });

            setToStore(`jobwork_sheets_${workerId}`, sheets);
        }

        lastSavedExpressBatch = {
            category: activeCategory.toUpperCase(),
            worker: workerName,
            date: d,
            isGayi: isGayi,
            source: effectiveGayiSource,
            items: [...expressBatchItems],
            damagePcs: damagePcs
        };

        if (typeof window.invalidateJobWorkCache === 'function') window.invalidateJobWorkCache(workerId);
        if (typeof window.invalidateSareeCalcCache === 'function') window.invalidateSareeCalcCache();
        if (typeof window.invalidateCalenderCalcCache === 'function') window.invalidateCalenderCalcCache();
        if (typeof window.invalidateCuttingCalcCache === 'function') window.invalidateCuttingCalcCache();
        if (typeof window.invalidateEmbroideryCalcCache === 'function') window.invalidateEmbroideryCalcCache();

        if (typeof window.updateJobWorkHubBadges === 'function') window.updateJobWorkHubBadges();
        if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
        if (typeof window.renderDukanTransferTable === 'function') window.renderDukanTransferTable();

        if (doPrint) {
            printLastSavedJobWorkChallan();
        }

        expressBatchItems = [];
        const dmgPcsEl = document.getElementById('jw-exp-damage-pcs');
        const dmgAmtEl = document.getElementById('jw-exp-damage-amt');
        if (dmgPcsEl) dmgPcsEl.value = '';
        if (dmgAmtEl) dmgAmtEl.value = '';

        renderExpressBatchGrid();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();

        const statusMsg = document.getElementById('jw-exp-status-msg');
        if (statusMsg) {
            statusMsg.innerHTML = `✅ ${totQty} Pcs Saree batch [${esc(workerName)}] ke khate me darj ho gaya!`;
        }

        focusFirstField('jw-exp-maker-input');
    };

    /* ========================================================================
       10. A6 THERMAL CHALLAN PRINT ENGINE (UNCHANGED)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.printLastSavedJobWorkChallan = () => {
        if (!lastSavedExpressBatch || !lastSavedExpressBatch.items.length) {
            return alert('Print karne ke liye koi recent batch entry nahi mili!');
        }

        const b = lastSavedExpressBatch;
        let tot = 0;
        let rowsHtml = '';
        const hasNaap = b.items.some((x) => Boolean(x.naap));

        b.items.forEach((it, idx) => {
            tot += it.qty;
            rowsHtml += `
                <tr style="border-bottom:1px dashed #ccc;">
                    <td style="padding:4px 2px;">${idx + 1}</td>
                    <td style="padding:4px 2px; font-weight:bold;">${esc(it.maker)}</td>
                    <td style="padding:4px 2px;">${esc(it.saree)}</td>
                    ${hasNaap ? `<td style="padding:4px 2px; text-align:center;">${it.naap || '-'}</td>` : ''}
                    <td style="padding:4px 2px; text-align:right; font-weight:bold;">${it.qty}</td>
                </tr>`;
        });

        const titleText = (b.category === 'DUKAN')
            ? 'DUKAN DISPATCH CHALLAN'
            : (b.isGayi ? 'JOB WORK DISPATCH (GAYI)' : 'JOB WORK RECEIPT (AAYI)');

        let processLabel = 'DUKAN TRANSFER';
        if (b.category === 'CALENDER') processLabel = 'CALENDER FINISHING';
        else if (b.category === 'EMBROIDERY') processLabel = 'SAREE EMBROIDERY';
        else if (b.category === 'CUTTING') processLabel = 'BOOTI CUTTING';

        const printWindow = window.open('', '', 'width=420,height=580');
        if (!printWindow) return alert('Popup block hai! Kripya allow karein.');

        printWindow.document.write(`
            <html>
            <head>
                <title>JobWork Challan - A6</title>
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
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        <h2>SIMPLICITY ERP</h2>
                        <p>⚡ ${titleText}</p>
                    </div>
                    <div class="meta">
                        <div><strong>Party / Worker:</strong> ${esc(b.worker)} (${processLabel})</div>
                        <div><strong>Tarikh:</strong> ${formatDisplay(b.date)}</div>
                        ${b.isGayi && (b.category === 'CALENDER' || b.category === 'EMBROIDERY') ? `<div><strong>Stock Source:</strong> ${b.source.toUpperCase()} STOCK</div>` : ''}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th><th>BUNNE WALA</th><th>SAREE</th>${hasNaap ? '<th style="text-align:center;">NAAP</th>' : ''}<th style="text-align:right;">PCS</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    <div class="total-box">
                        KUL SAREE: ${tot} Pcs ${b.damagePcs > 0 ? `(Dmg: ${b.damagePcs})` : ''}
                    </div>
                    <div class="signs">
                        <div>हस्ताक्षर मुंशी<br><br>________</div>
                        <div>हस्ताक्षर पाने वाला<br><br>________</div>
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
       11. GLOBAL EXPORT
       ------------------------------------------------------------------------
    ======================================================================== */
    window.JobWorkExpressEngine = {
        openJobWorkExpressModal,
        closeJobWorkExpressModal,
        switchJobWorkCategory,
        onExpressSourceDropdownChange,
        toggleStockSource,
        toggleMovementType,
        addExpressBatchRow,
        removeExpressBatchItem,
        submitMasterJobWorkExpress,
        printLastSavedJobWorkChallan
    };

})();
