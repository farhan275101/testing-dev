/* ============================================================================
   SIMPLICITY ERP - KARIGER EXPRESS VOUCHER (TALLYPRIME WHITE & GOLD EDITION)
   Folder: kariger-express / File: kariger-express.js
   Developed for: Farhan Jawed
   Features:
   - TallyPrime White & Gold 2-Column Voucher Layout (Matching Profile Creation)
   - Dynamic Right-Pane Picker (List of Karigers / Bana Stock / Zari Stock)
   - Auto-Tani Detection & Carry-Forward Rollover
   - Zero-Mouse Enter Chaining, Shift+Enter Back, Arrow Navigation & A6 Print
============================================================================ */

(() => {
    'use strict';

    let selectedKariger = null;
    let currentActiveSheet = null;
    let activeSheetIndex = 0;
    let prevDeliveredSarees = 0;
    let lastSavedTransaction = null;

    // Right-Pane Tally Picker State
    let pickerMode = 'summary'; // 'kariger' | 'bana' | 'zari' | 'summary'
    let pickerItems = [];
    let pickerActiveIdx = 0;
    let pickerArrowUsed = false;

    /* ========================================================================
       1. SAFE HELPERS & DATA STORES (UNCHANGED)
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

    const getToday = () => {
        return (typeof window.getTodayDate === 'function')
            ? window.getTodayDate()
            : new Date().toISOString().split('T')[0];
    };

    const getBanaStockBacha = (itemName, kGodown) => {
        if (!itemName) return 0;
        if (typeof window.getBanaItemStats === 'function') {
            return safeNum(window.getBanaItemStats(itemName, kGodown).bacha);
        }
        const raw = toArray(getFromStore('bana_stock'));
        const item = raw.find(x => x && x.name && x.name.toLowerCase() === itemName.toLowerCase() &&
            ((!x.karkhanaId && kGodown === 'k_main') || String(x.karkhanaId) === String(kGodown)));
        return item ? safeNum(item.bacha) : 0;
    };

    const getZariStockBacha = (itemName, kGodown) => {
        if (!itemName) return 0;
        if (typeof window.getZariItemStats === 'function') {
            return safeNum(window.getZariItemStats(itemName, kGodown).bacha);
        }
        const raw = toArray(getFromStore('zari_stock'));
        const item = raw.find(x => x && x.name && x.name.toLowerCase() === itemName.toLowerCase() &&
            ((!x.karkhanaId && kGodown === 'k_main') || String(x.karkhanaId) === String(kGodown)));
        return item ? safeNum(item.bacha) : 0;
    };

    const getKarigerExpressDatalists = () => {
        const rawKarigers = toArray(getFromStore('kariger_list'));
        let kOpts = '';
        rawKarigers.forEach((k) => {
            if (k && k.name) {
                const sDesign = k.saree ? ` [${k.saree}]` : '';
                kOpts += `<option value="${esc(k.name)}">${esc(k.name)}${esc(sDesign)}</option>`;
            }
        });

        const rawBana = toArray(getFromStore('bana_stock'));
        const uB = [];
        let bOpts = '';
        rawBana.forEach((b) => {
            if (b && b.name && uB.indexOf(b.name.trim().toLowerCase()) === -1) {
                uB.push(b.name.trim().toLowerCase());
                bOpts += `<option value="${esc(b.name.trim())}">`;
            }
        });

        const rawZari = toArray(getFromStore('zari_stock'));
        const uZ = [];
        let zOpts = '';
        rawZari.forEach((z) => {
            if (z && z.name && uZ.indexOf(z.name.trim().toLowerCase()) === -1) {
                uZ.push(z.name.trim().toLowerCase());
                zOpts += `<option value="${esc(z.name.trim())}">`;
            }
        });

        const rawSancha = toArray(getFromStore('sancha_items'));
        let taniOpts = '';
        let chukkaOpts = '';
        const uT = [], uC = [];

        rawSancha.forEach((s) => {
            if (!s || !s.name) return;
            const cat = String(s.category || 'tani').toLowerCase();
            const bacha = safeNum(s.bacha !== undefined ? s.bacha : s.aaya);
            if (cat === 'tani' && uT.indexOf(s.name.trim().toLowerCase()) === -1) {
                uT.push(s.name.trim().toLowerCase());
                taniOpts += `<option value="${esc(s.name.trim())}">${esc(s.name.trim())} (Bacha: ${bacha.toFixed(2)} Kg)</option>`;
            } else if (cat === 'chukka' && uC.indexOf(s.name.trim().toLowerCase()) === -1) {
                uC.push(s.name.trim().toLowerCase());
                chukkaOpts += `<option value="${esc(s.name.trim())}">${esc(s.name.trim())} (Bacha: ${bacha.toFixed(2)} Kg)</option>`;
            }
        });

        return { kOpts, bOpts, zOpts, taniOpts, chukkaOpts };
    };

    const deductSanchaStockItem = (itemName, category, wazan, kGodown, refKey, kName) => {
        if (!itemName || !wazan || wazan <= 0) return;
        const sList = toArray(getFromStore('sancha_items'));
        const found = sList.find((x) => {
            const matchKid = (!x.karkhanaId && kGodown === 'k_main') || String(x.karkhanaId) === String(kGodown);
            return x && x.name && x.name.toLowerCase() === itemName.toLowerCase() &&
                   String(x.category || 'tani').toLowerCase() === category.toLowerCase() && matchKid;
        });

        if (found) {
            found.gaya = Math.max(0, safeNum((safeNum(found.gaya) + safeNum(wazan)).toFixed(2)));
            found.bacha = safeNum((safeNum(found.aaya) - found.gaya).toFixed(2));
            setToStore('sancha_items', sList);
        }

        let sHist = toArray(getFromStore('sancha_history'));
        sHist.push({
            id: `shist_${Date.now()}_${category.charAt(0)}`,
            refId: refKey,
            date: getToday(),
            category: category,
            name: itemName,
            kariger: kName,
            type: `Kariger Issue (${category === 'tani' ? 'Tani' : 'Chukka'})`,
            aaya: 0,
            gaya: safeNum(wazan),
            karkhanaId: kGodown,
            timestamp: Date.now()
        });
        setToStore('sancha_history', sHist);
    };

    /* ========================================================================
       2. SCOPED TALLYPRIME WHITE & GOLD STYLES
       ------------------------------------------------------------------------
    ======================================================================== */
    const ensureTallyExpressStyles = () => {
        if (document.getElementById('kexp-tally-styles')) return;
        const style = document.createElement('style');
        style.id = 'kexp-tally-styles';
        style.textContent = `
            .kexp-overlay {
                position: fixed; inset: 0;
                background: rgba(31, 41, 55, 0.38);
                backdrop-filter: blur(2px);
                z-index: 999999;
                display: flex; align-items: center; justify-content: center;
                padding: 14px; box-sizing: border-box;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            }
            .kexp-card {
                background: #ffffff;
                width: 100%; max-width: 980px;
                border: 1.5px solid #d9b86c;
                border-radius: 8px;
                box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);
                overflow: hidden;
                max-height: 95vh;
                display: flex; flex-direction: column;
                color: #1f2937;
            }
            .kexp-header {
                background: #fdf6e2;
                border-bottom: 1.5px solid #e5d5a7;
                padding: 10px 18px;
                display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;
            }
            .kexp-title {
                margin: 0; font-size: 15px; font-weight: 800; color: #1f2937;
                letter-spacing: 0.2px;
            }
            .kexp-pill-btn {
                background: #ffffff; color: #374151;
                border: 1px solid #d1d5db; border-radius: 5px;
                padding: 5px 11px; font-size: 12px; font-weight: 700;
                cursor: pointer; transition: all 0.12s ease;
            }
            .kexp-pill-btn:hover { border-color: #d9a425; background: #fef9ea; color: #1f2937; }
            .kexp-pill-gold {
                background: #f2b71d; color: #1f2937;
                border: 1px solid #d9a425; border-radius: 5px;
                padding: 5px 12px; font-size: 12px; font-weight: 800;
                cursor: pointer;
            }
            .kexp-pill-gold:hover { background: #e5aa12; }
            .kexp-body {
                display: grid; grid-template-columns: 1.55fr 1fr;
                gap: 16px; padding: 14px 18px;
                overflow-y: auto; flex: 1; background: #ffffff;
            }
            @media (max-width: 820px) {
                .kexp-body { grid-template-columns: 1fr; }
            }
            .kexp-sec-title {
                font-size: 11px; font-weight: 800; color: #92400e;
                text-transform: uppercase; letter-spacing: 0.6px;
                border-bottom: 1px solid #eadab0;
                padding-bottom: 4px; margin: 12px 0 8px 0;
            }
            .kexp-row {
                display: grid; grid-template-columns: 155px 1fr;
                align-items: center; gap: 10px; margin-bottom: 7px;
            }
            .kexp-row-2 {
                display: grid; grid-template-columns: 1fr 1fr;
                gap: 12px; margin-bottom: 7px;
            }
            .kexp-mini-row {
                display: grid; grid-template-columns: 115px 1fr;
                align-items: center; gap: 8px;
            }
            .kexp-lbl {
                font-size: 12.5px; font-weight: 600; color: #374151;
            }
            .kexp-inp {
                width: 100%; box-sizing: border-box;
                padding: 6px 10px;
                border: 1px solid #d1d5db; border-radius: 4px;
                font-size: 13.5px; font-weight: 700; color: #111827;
                background: #ffffff; outline: none;
                transition: border-color 0.12s, background 0.12s;
            }
            .kexp-inp:focus {
                border-color: #d9a425 !important;
                background: #fffdf5 !important;
                box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.22);
            }
            .kexp-inp-num { text-align: right; font-variant-numeric: tabular-nums; }
            .kexp-right-panel {
                border: 1px solid #e5d5a7; border-radius: 6px;
                background: #ffffff; display: flex; flex-direction: column;
                overflow: hidden; min-height: 360px;
            }
            .kexp-right-head {
                background: #fdf6e2; border-bottom: 1px solid #e5d5a7;
                padding: 8px 12px; font-size: 12.5px; font-weight: 800; color: #1f2937;
                display: flex; justify-content: space-between; align-items: center;
            }
            .kexp-picker-list {
                flex: 1; overflow-y: auto; max-height: 360px;
            }
            .kexp-picker-item {
                padding: 7px 12px; font-size: 12.5px; font-weight: 600; color: #1f2937;
                border-bottom: 1px solid #f3f4f6; cursor: pointer;
                display: flex; justify-content: space-between; align-items: center; gap: 8px;
            }
            .kexp-picker-item:hover { background: #fef9ea; }
            .kexp-picker-item.active {
                background: #f2b71d; color: #1f2937; font-weight: 800;
            }
            .kexp-picker-sub {
                font-size: 11px; color: #6b7280; font-weight: 600;
            }
            .kexp-picker-item.active .kexp-picker-sub { color: #374151; }
            .kexp-footer {
                background: #fdf6e2; border-top: 1px solid #e5d5a7;
                padding: 8px 18px;
                display: flex; justify-content: space-between; align-items: center;
                flex-wrap: wrap; gap: 8px; font-size: 11.5px; color: #6b7280;
            }
            .kexp-btn-save {
                background: #f2b71d; color: #1f2937;
                border: 1px solid #d9a425; border-radius: 5px;
                padding: 7px 20px; font-size: 13px; font-weight: 800;
                cursor: pointer;
            }
            .kexp-btn-save:hover { background: #e5aa12; }
            .kexp-btn-sec {
                background: #ffffff; color: #1f2937;
                border: 1px solid #d1d5db; border-radius: 5px;
                padding: 7px 14px; font-size: 12.5px; font-weight: 700;
                cursor: pointer;
            }
            .kexp-btn-sec:hover { border-color: #d9a425; background: #fef9ea; }
        `;
        document.head.appendChild(style);
    };

    /* ========================================================================
       3. OPEN KARIGER EXPRESS VOUCHER (TALLY WHITE & GOLD)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.openKarigerExpressModal = () => {
        ensureTallyExpressStyles();
        const existing = document.getElementById('kariger-express-modal');
        if (existing) existing.remove();

        selectedKariger = null;
        currentActiveSheet = null;
        activeSheetIndex = 0;
        prevDeliveredSarees = 0;
        lastSavedTransaction = null;
        pickerMode = 'kariger';
        pickerItems = [];
        pickerActiveIdx = 0;
        pickerArrowUsed = false;

        const { kOpts, bOpts, zOpts } = getKarigerExpressDatalists();
        const today = getToday();

        const modalHtml = `
        <div id="kariger-express-modal" class="kexp-overlay">
            <div class="kexp-card">

                <!-- Top Cream Tally Header -->
                <div class="kexp-header">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <h3 class="kexp-title">Kariger Baithak Voucher</h3>
                        <button type="button" id="kexp-btn-alt-c" class="kexp-pill-gold" onclick="openAltCKarigerModal()">+ Naya Kariger [Alt+C]</button>
                        <button type="button" class="kexp-pill-btn" onclick="openExpressNewTaniModal()">+ Nayi Tani [Alt+N]</button>
                    </div>
                    <button type="button" class="kexp-pill-btn" onclick="closeKarigerExpressModal()">&larr; [Esc] Back</button>
                </div>

                <!-- Main 2-Column Split Body -->
                <div class="kexp-body">

                    <!-- LEFT PANE: CLEAN TALLY FORM -->
                    <div>
                        <div class="kexp-row-2">
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Date :</label>
                                <input type="date" id="kexp-date" value="${today}" data-next="kexp-kariger-input" class="kexp-inp">
                            </div>
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Kariger [F2] :</label>
                                <input type="text" id="kexp-kariger-input" data-next="kexp-saree-qty" placeholder="Type name or &uarr;&darr;..." autocomplete="off" class="kexp-inp">
                                <datalist id="kexp-kariger-dl">${kOpts}</datalist>
                            </div>
                        </div>

                        <!-- Tani Selection Tabs Strip -->
                        <div id="kexp-tani-tabs-bar" style="display:none; margin:6px 0 8px 0; background:#fdf6e2; padding:5px 8px; border-radius:4px; border:1px solid #e5d5a7; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                            <div id="kexp-tani-chips-container" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;"></div>
                            <span style="font-size:11px; color:#92400e; font-weight:700;">Active Tani</span>
                        </div>

                        <!-- SECTION 1: INWARD -->
                        <div class="kexp-sec-title">Inward &mdash; Saree Jama &amp; Material Return</div>
                        <div class="kexp-row-2">
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Saree Jama (Pcs) :</label>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="kexp-saree-qty" data-next="kexp-saree-lott" placeholder="0" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num" style="border-color:#d9a425;">
                            </div>
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Lott / Cut (Pcs) :</label>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="kexp-saree-lott" data-next="kexp-ret-bana" placeholder="0" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num">
                            </div>
                        </div>
                        <div class="kexp-row-2">
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Bana Wapsi (Kg) :</label>
                                <input type="text" inputmode="decimal" id="kexp-ret-bana" data-next="kexp-ret-zari" placeholder="0.00" class="kexp-inp kexp-inp-num">
                            </div>
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Zari Wapsi (Kg) :</label>
                                <input type="text" inputmode="decimal" id="kexp-ret-zari" data-next="kexp-bana-name" placeholder="0.00" class="kexp-inp kexp-inp-num">
                            </div>
                        </div>

                        <!-- SECTION 2: OUTWARD -->
                        <div class="kexp-sec-title">Outward &mdash; Bana &amp; Zari Issue</div>
                        <div class="kexp-row">
                            <label class="kexp-lbl">Bana Item : <small id="kexp-live-bana-badge" style="display:block; font-size:10.5px; color:#b47d00; font-weight:700;">Bacha: 0.00 Kg</small></label>
                            <input type="text" id="kexp-bana-name" data-next="kexp-bana-cone" placeholder="Select Bana..." autocomplete="off" oninput="updateExpressStockBadges()" class="kexp-inp">
                            <datalist id="kexp-bana-dl">${bOpts}</datalist>
                        </div>
                        <div class="kexp-row-2">
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Bana Gross (Kg) :</label>
                                <input type="text" inputmode="decimal" id="kexp-bana-cone" data-next="kexp-bana-lesstp" placeholder="0.00" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num">
                            </div>
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Less TP (Kg) :</label>
                                <input type="text" inputmode="decimal" id="kexp-bana-lesstp" data-next="kexp-zari-name" placeholder="0.00" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num">
                            </div>
                        </div>

                        <div class="kexp-row" style="margin-top:8px;">
                            <label class="kexp-lbl">Zari Item : <small id="kexp-live-zari-badge" style="display:block; font-size:10.5px; color:#b47d00; font-weight:700;">Bacha: 0.00 Kg</small></label>
                            <input type="text" id="kexp-zari-name" data-next="kexp-zari-qty" placeholder="Select Zari..." autocomplete="off" oninput="updateExpressStockBadges()" class="kexp-inp">
                            <datalist id="kexp-zari-dl">${zOpts}</datalist>
                        </div>
                        <div class="kexp-row-2">
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Zari Gross (Kg) :</label>
                                <input type="text" inputmode="decimal" id="kexp-zari-qty" data-next="kexp-zari-topi" placeholder="0.00" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num">
                            </div>
                            <div class="kexp-mini-row">
                                <label class="kexp-lbl">Topi Less (Kg) :</label>
                                <input type="text" inputmode="decimal" id="kexp-zari-topi" data-next="kexp-paid-amount" placeholder="0.00" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num">
                            </div>
                        </div>

                        <!-- SECTION 3: MAZDOORI & ROKAD -->
                        <div class="kexp-sec-title">Mazdoori &amp; Rokad Payment</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#fdfcf7; border:1px solid #eadab0; border-radius:4px; padding:6px 10px; margin-bottom:8px; font-size:12.5px;">
                            <span>Bani Rate: <strong id="kexp-disp-bani-rate" style="color:#1f2937;">₹ 0.00</strong></span>
                            <span>Aaj ki Mazdoori: <strong id="kexp-disp-gross-bani" style="color:#b47d00;">₹ 0.00</strong></span>
                        </div>
                        <div class="kexp-row">
                            <label class="kexp-lbl">Aaj Rokad Diya (₹) :</label>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="kexp-paid-amount" placeholder="0" oninput="calculateKarigerExpressLive()" class="kexp-inp kexp-inp-num" style="border-color:#d9a425; font-size:15px;">
                        </div>

                        <!-- Bottom Voucher Action Strip -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid #eadab0; flex-wrap:wrap; gap:8px;">
                            <div style="font-size:13px; font-weight:700; color:#374151;">
                                Antim Baki: <span id="kexp-disp-net-balance" style="font-size:17px; font-weight:900; color:#b47d00; margin-left:4px;">₹ 0.00</span>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button type="button" id="kexp-print-btn" class="kexp-btn-sec" onclick="printLastSavedExpressSlip()">A6 Parchi [Alt+P]</button>
                                <button type="button" id="kexp-submit-btn" class="kexp-btn-save" onclick="submitKarigerExpress()">Save &amp; Parchi [Enter]</button>
                            </div>
                        </div>
                    </div>

                    <!-- RIGHT PANE: TALLY CONTEXTUAL PANEL -->
                    <div class="kexp-right-panel">
                        <div class="kexp-right-head">
                            <span id="kexp-right-title">List of Karigers</span>
                            <span id="kexp-right-hint" style="font-size:11px; color:#6b7280; font-weight:600;">&uarr;&darr; + Enter</span>
                        </div>

                        <!-- Dynamic Picker List (Visible when Kariger / Bana / Zari focused) -->
                        <div id="kexp-right-picker" class="kexp-picker-list"></div>

                        <!-- Weaver Snapshot Banner (Always in DOM, visible when entering quantities) -->
                        <div id="kexp-weaver-banner" style="display:none; padding:12px; font-size:12.5px; line-height:1.5; flex:1; overflow-y:auto;">
                            <span style="color:#6b7280;">Kariger chunein — tani ka poora hisab aur 8 colors yahan dikhenge.</span>
                        </div>
                    </div>

                </div>

                <!-- Bottom Tally Status Bar -->
                <div class="kexp-footer">
                    <div>
                        <span id="kexp-status-msg" style="font-weight:700; color:#b47d00;">[F2] Kariger &bull; [Enter] Next / Save &bull; [Shift+Enter] Prev &bull; [Alt+C] Naya Kariger &bull; [Alt+N] Nayi Tani &bull; [Esc] Back</span>
                    </div>
                    <div style="font-weight:600;">TallyPrime White &amp; Gold Mode</div>
                </div>

            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        bindKarigerExpressEvents();
        showRightPicker('kariger', '');
    };

    /* ========================================================================
       4. RIGHT-PANE CONTEXTUAL PICKER (TALLY LIST OF KARIGERS / STOCK)
       ------------------------------------------------------------------------
    ======================================================================== */
    const showRightPicker = (mode, queryText) => {
        pickerMode = mode;
        const pickerEl = document.getElementById('kexp-right-picker');
        const bannerEl = document.getElementById('kexp-weaver-banner');
        const titleEl = document.getElementById('kexp-right-title');
        const hintEl = document.getElementById('kexp-right-hint');
        if (!pickerEl || !bannerEl) return;

        if (mode === 'summary') {
            pickerEl.style.display = 'none';
            bannerEl.style.display = 'block';
            if (titleEl) titleEl.textContent = selectedKariger ? `Snapshot: ${selectedKariger.name}` : 'Tani & Hisab Snapshot';
            if (hintEl) hintEl.textContent = 'Live Balance';
            return;
        }

        pickerEl.style.display = 'block';
        bannerEl.style.display = 'none';
        if (hintEl) hintEl.textContent = '↑↓ + Enter';

        const q = String(queryText || '').trim().toLowerCase();
        const kGodown = selectedKariger ? (selectedKariger.karkhanaId || 'k_main') : 'k_main';
        pickerItems = [];

        if (mode === 'kariger') {
            if (titleEl) titleEl.textContent = 'List of Karigers';
            const list = toArray(getFromStore('kariger_list')).filter(k => k && k.name);
            list.forEach((k) => {
                const text = `${k.name} ${k.saree || ''}`.toLowerCase();
                if (!q || text.includes(q)) {
                    pickerItems.push({
                        label: k.name,
                        sub: k.saree || 'Saree',
                        data: k
                    });
                }
            });
        } else if (mode === 'bana') {
            if (titleEl) titleEl.textContent = 'List of Bana Stock';
            const raw = toArray(getFromStore('bana_stock'));
            const seen = new Set();
            raw.forEach((b) => {
                if (!b || !b.name) return;
                const nm = b.name.trim();
                const key = nm.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                if (!q || key.includes(q)) {
                    const bacha = getBanaStockBacha(nm, kGodown);
                    pickerItems.push({
                        label: nm,
                        sub: `${bacha.toFixed(2)} Kg`,
                        data: nm
                    });
                }
            });
        } else if (mode === 'zari') {
            if (titleEl) titleEl.textContent = 'List of Zari Stock';
            const raw = toArray(getFromStore('zari_stock'));
            const seen = new Set();
            raw.forEach((z) => {
                if (!z || !z.name) return;
                const nm = z.name.trim();
                const key = nm.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                if (!q || key.includes(q)) {
                    const bacha = getZariStockBacha(nm, kGodown);
                    pickerItems.push({
                        label: nm,
                        sub: `${bacha.toFixed(2)} Kg`,
                        data: nm
                    });
                }
            });
        }

        if (pickerActiveIdx >= pickerItems.length) pickerActiveIdx = 0;
        if (pickerActiveIdx < 0) pickerActiveIdx = 0;
        renderRightPickerList();
    };

    const renderRightPickerList = () => {
        const pickerEl = document.getElementById('kexp-right-picker');
        if (!pickerEl) return;

        if (!pickerItems.length) {
            pickerEl.innerHTML = `<div style="padding:18px 12px; text-align:center; color:#6b7280; font-size:12px;">Koi matching record nahi mila.</div>`;
            return;
        }

        let html = '';
        pickerItems.forEach((item, idx) => {
            const cls = idx === pickerActiveIdx ? 'kexp-picker-item active' : 'kexp-picker-item';
            html += `<div class="${cls}" data-pidx="${idx}" onmousedown="event.preventDefault(); window.__kexpPickItem(${idx})">
                <span>${esc(item.label)}</span>
                <span class="kexp-picker-sub">${esc(item.sub)}</span>
            </div>`;
        });
        pickerEl.innerHTML = html;

        const activeEl = pickerEl.querySelector('.kexp-picker-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    window.__kexpPickItem = (idx) => {
        const item = pickerItems[idx];
        if (!item) return;

        if (pickerMode === 'kariger') {
            const k = item.data;
            const kInp = document.getElementById('kexp-kariger-input');
            if (kInp) kInp.value = k.name;
            applySelectedKariger(k);
            const nextEl = document.getElementById('kexp-saree-qty');
            if (nextEl) { nextEl.focus(); nextEl.select(); }
        } else if (pickerMode === 'bana') {
            const bInp = document.getElementById('kexp-bana-name');
            if (bInp) bInp.value = item.data;
            updateExpressStockBadges();
            const nextEl = document.getElementById('kexp-bana-cone');
            if (nextEl) { nextEl.focus(); nextEl.select(); }
        } else if (pickerMode === 'zari') {
            const zInp = document.getElementById('kexp-zari-name');
            if (zInp) zInp.value = item.data;
            updateExpressStockBadges();
            const nextEl = document.getElementById('kexp-zari-qty');
            if (nextEl) { nextEl.focus(); nextEl.select(); }
        }
    };

    const applySelectedKariger = (k) => {
        selectedKariger = k;
        const sheets = (typeof window.getKarigerSheets === 'function') ? window.getKarigerSheets(k.id) : [];
        activeSheetIndex = sheets.length ? sheets.length - 1 : 0;
        currentActiveSheet = sheets[activeSheetIndex] || null;

        renderKarigerExpressTaniTabs();
        updateWeaverBannerSnapshot();
        calculateKarigerExpressLive();
    };

    /* ========================================================================
       5. TANI SELECTION & SNAPSHOT BANNER
       ------------------------------------------------------------------------
    ======================================================================== */
    const renderKarigerExpressTaniTabs = () => {
        const bar = document.getElementById('kexp-tani-tabs-bar');
        const container = document.getElementById('kexp-tani-chips-container');
        if (!bar || !container || !selectedKariger) {
            if (bar) bar.style.display = 'none';
            return;
        }

        const sheets = (typeof window.getKarigerSheets === 'function') ? window.getKarigerSheets(selectedKariger.id) : [];
        if (!sheets.length) {
            bar.style.display = 'none';
            return;
        }

        bar.style.display = 'flex';
        let html = '';

        sheets.forEach((sh, idx) => {
            const isActive = (idx === activeSheetIndex);
            html += `<button type="button" onclick="switchExpressTaniSheet(${idx})" style="background:${isActive ? '#f2b71d' : '#ffffff'}; color:#1f2937; border:1px solid ${isActive ? '#d9a425' : '#d1d5db'}; padding:3px 10px; border-radius:4px; font-size:11.5px; font-weight:${isActive ? '800' : '600'}; cursor:pointer;">
                ${esc(sh.title || `Tani ${idx + 1}`)}
            </button>`;
        });

        container.innerHTML = html;
    };

    window.switchExpressTaniSheet = (idx) => {
        activeSheetIndex = idx;
        const sheets = (typeof window.getKarigerSheets === 'function') ? window.getKarigerSheets(selectedKariger.id) : [];
        currentActiveSheet = sheets[idx] || sheets[sheets.length - 1];

        renderKarigerExpressTaniTabs();
        updateWeaverBannerSnapshot();
        calculateKarigerExpressLive();
        showRightPicker('summary', '');
    };

    const updateWeaverBannerSnapshot = () => {
        const banner = document.getElementById('kexp-weaver-banner');
        if (!banner || !selectedKariger || !currentActiveSheet) return;

        const k = selectedKariger;
        const calc = (typeof window.calculateSheetTotals === 'function')
            ? window.calculateSheetTotals(currentActiveSheet)
            : { remainingAmt: 0, remainingBana: 0, remainingZari: 0, totSaree: 0 };

        prevDeliveredSarees = safeNum(calc.totSaree);

        const rateBani = safeNum(currentActiveSheet.rateBani, 240);
        const totalTaniTarget = safeNum(currentActiveSheet.taniPcs, 72);
        const taniSancha = currentActiveSheet.taniSancha || 'N/A';
        const chukkaSancha = currentActiveSheet.chukkaSancha || 'N/A';
        const taniItem = currentActiveSheet.taniItem || 'Tani';

        const colorsArr = Array.isArray(currentActiveSheet.colors) ? currentActiveSheet.colors : [];
        let colorsHtml = '';
        if (colorsArr.length) {
            colorsArr.forEach((c, idx) => {
                if (c && String(c).trim()) {
                    colorsHtml += `<span style="background:#fdf6e2; color:#1f2937; border:1px solid #e5d5a7; font-size:11px; font-weight:600; padding:1px 6px; border-radius:3px;">${idx + 1}. ${esc(c)}</span> `;
                }
            });
        }
        if (!colorsHtml) colorsHtml = `<span style="color:#9ca3af; font-size:11px;">Colors set nahi hain</span>`;

        const banaInp = document.getElementById('kexp-bana-name');
        const zariInp = document.getElementById('kexp-zari-name');
        if (banaInp && currentActiveSheet.banaItem && !banaInp.value) {
            banaInp.value = currentActiveSheet.banaItem;
        }
        if (zariInp && currentActiveSheet.zariItem && !zariInp.value) {
            zariInp.value = currentActiveSheet.zariItem;
        }

        updateExpressStockBadges();

        banner.innerHTML = `
            <div style="border-bottom:1px solid #eadab0; padding-bottom:8px; margin-bottom:8px;">
                <div style="font-size:14px; font-weight:800; color:#1f2937;">${esc(k.name)}</div>
                <div style="font-size:11.5px; color:#6b7280;">Design: <strong style="color:#1f2937;">${esc(k.saree || 'Satan')}</strong> &bull; ${esc(currentActiveSheet.title || 'Tani')}</div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-bottom:10px;">
                <div style="background:#fdfcf7; border:1px solid #eadab0; padding:6px 8px; border-radius:4px;">
                    <div style="font-size:10.5px; color:#6b7280;">Sancha / Tani</div>
                    <strong style="color:#1f2937;">${esc(taniSancha)}</strong> <span style="font-size:11px; color:#6b7280;">(${esc(taniItem)})</span>
                </div>
                <div style="background:#fdfcf7; border:1px solid #eadab0; padding:6px 8px; border-radius:4px;">
                    <div style="font-size:10.5px; color:#6b7280;">Chukka Sancha</div>
                    <strong style="color:#1f2937;">${esc(chukkaSancha)}</strong>
                </div>
            </div>

            <div id="kexp-live-tani-progress" style="background:#fdf6e2; border:1px solid #e5d5a7; padding:7px 9px; border-radius:4px; font-size:12px; margin-bottom:10px;">
                Tani: <strong>${totalTaniTarget} Pcs</strong> &bull; Aayi: <strong>${prevDeliveredSarees}</strong> &bull; Baki: <strong style="color:#b47d00;">${Math.max(0, totalTaniTarget - prevDeliveredSarees)} Pcs</strong>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:12px; border-bottom:1px solid #f3f4f6; padding-bottom:6px; margin-bottom:6px;">
                <span style="color:#6b7280;">Pichla Baki Rupya:</span>
                <strong style="color:#b47d00;">₹ ${safeNum(calc.remainingAmt).toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; border-bottom:1px solid #f3f4f6; padding-bottom:6px; margin-bottom:6px;">
                <span style="color:#6b7280;">Kariger ke paas Bana:</span>
                <strong>${safeNum(calc.remainingBana).toFixed(2)} Kg</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; border-bottom:1px solid #f3f4f6; padding-bottom:6px; margin-bottom:8px;">
                <span style="color:#6b7280;">Kariger ke paas Zari:</span>
                <strong>${safeNum(calc.remainingZari).toFixed(2)} Kg</strong>
            </div>

            <div>
                <div style="font-size:10.5px; font-weight:700; color:#92400e; text-transform:uppercase; margin-bottom:4px;">8 Colors Matching</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${colorsHtml}</div>
            </div>
        `;
        const rateEl = document.getElementById('kexp-disp-bani-rate');
        if (rateEl) rateEl.textContent = `₹ ${rateBani.toFixed(2)}`;
    };

    /* ========================================================================
       6. ALT + C MODAL: NEW WEAVER SETUP (TALLY WHITE & GOLD)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.openAltCKarigerModal = () => {
        ensureTallyExpressStyles();
        const existing = document.getElementById('alt-c-kariger-modal');
        if (existing) existing.remove();

        const { taniOpts, chukkaOpts } = getKarigerExpressDatalists();
        const activeKid = (selectedKariger && selectedKariger.karkhanaId) ? selectedKariger.karkhanaId : 'k_main';

        let karkhanas = (typeof window.getKarkhanasSafe === 'function')
            ? window.getKarkhanasSafe()
            : toArray(getFromStore('karkhana_list'));
        if (!karkhanas.length) karkhanas = [{ id: 'k_main', name: 'Main Godown', isDefault: true }];

        let karkhanaOptions = '';
        karkhanas.forEach((k) => {
            const isSel = (String(k.id) === String(activeKid));
            karkhanaOptions += `<option value="${esc(k.id)}" ${isSel ? 'selected' : ''}>${esc(k.name)}</option>`;
        });

        const modalHtml = `
        <div id="alt-c-kariger-modal" class="kexp-overlay" style="z-index:1000005;">
            <div class="kexp-card" style="max-width:720px;">

                <div class="kexp-header">
                    <div>
                        <h3 class="kexp-title">Naya Kariger &amp; Tani 1 Setup (Alt+C)</h3>
                        <span style="font-size:11px; color:#6b7280;">[Enter] Next Field &bull; [Ctrl+Enter] Save &amp; Load &bull; [Esc] Close</span>
                    </div>
                    <button type="button" class="kexp-pill-btn" onclick="closeAltCKarigerModal()">&larr; [Esc] Cancel</button>
                </div>

                <div style="padding:14px 18px; overflow-y:auto; flex:1;">
                    <div class="kexp-sec-title" style="margin-top:0;">1. Kariger Master Details</div>
                    <div class="kexp-row-2">
                        <div class="kexp-mini-row">
                            <label class="kexp-lbl">Kariger Name :</label>
                            <input type="text" id="altc-kar-name" data-altc-next="altc-kar-saree" placeholder="Jaise: GUDDU ANSARI" autocomplete="off" class="kexp-inp" style="border-color:#d9a425;">
                        </div>
                        <div class="kexp-mini-row">
                            <label class="kexp-lbl">Saree Design :</label>
                            <input type="text" id="altc-kar-saree" data-altc-next="altc-kar-mobile" placeholder="Jaise: Satan" class="kexp-inp">
                        </div>
                    </div>
                    <div class="kexp-row-2">
                        <div class="kexp-mini-row">
                            <label class="kexp-lbl">Mobile No. :</label>
                            <input type="tel" id="altc-kar-mobile" data-altc-next="altc-kar-godown" placeholder="10-digit Mobile" class="kexp-inp">
                        </div>
                        <div class="kexp-mini-row">
                            <label class="kexp-lbl">Karkhana :</label>
                            <select id="altc-kar-godown" data-altc-next="altc-tani-item" class="kexp-inp">${karkhanaOptions}</select>
                        </div>
                    </div>

                    <div class="kexp-sec-title">2. Taana &amp; Sancha Setup (Tani 1)</div>
                    <div style="display:grid; grid-template-columns:1.4fr 1fr 0.8fr 0.8fr; gap:8px; margin-bottom:8px;">
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Tani Item :</label>
                            <input type="text" id="altc-tani-item" list="altc-tani-dl" data-altc-next="altc-tani-sancha" placeholder="Tani Item..." class="kexp-inp" style="font-size:12px;">
                            <datalist id="altc-tani-dl">${taniOpts}</datalist>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Sancha Maker :</label>
                            <input type="text" id="altc-tani-sancha" data-altc-next="altc-tani-wazan" placeholder="Jaise: Azhar" class="kexp-inp" style="font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Wazan (Kg) :</label>
                            <input type="number" step="0.01" id="altc-tani-wazan" data-altc-next="altc-tani-pcs" placeholder="0.00" class="kexp-inp" style="font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Tani Saree :</label>
                            <input type="number" id="altc-tani-pcs" value="72" data-altc-next="altc-chukka-item" class="kexp-inp" style="font-size:12px;">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1.4fr 1fr 0.8fr 0.8fr; gap:8px;">
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Chukka Item :</label>
                            <input type="text" id="altc-chukka-item" list="altc-chukka-dl" data-altc-next="altc-chukka-sancha" placeholder="Chukka Item..." class="kexp-inp" style="font-size:12px;">
                            <datalist id="altc-chukka-dl">${chukkaOpts}</datalist>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Chukka Maker :</label>
                            <input type="text" id="altc-chukka-sancha" data-altc-next="altc-chukka-wazan" placeholder="Jaise: Arman" class="kexp-inp" style="font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Wazan (Kg) :</label>
                            <input type="number" step="0.01" id="altc-chukka-wazan" data-altc-next="altc-chukka-pcs" placeholder="0.00" class="kexp-inp" style="font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Chukka Pcs :</label>
                            <input type="number" id="altc-chukka-pcs" value="72" data-altc-next="altc-rate-bani" class="kexp-inp" style="font-size:12px;">
                        </div>
                    </div>

                    <div class="kexp-sec-title">3. Mazdoori &amp; Consumption Rates</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Bani Rate (₹/Saree) :</label>
                            <input type="number" id="altc-rate-bani" value="240" data-altc-next="altc-rate-bana" class="kexp-inp">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Bana Rate (Kg/Saree) :</label>
                            <input type="number" step="0.001" id="altc-rate-bana" value="0.311" data-altc-next="altc-rate-zari" class="kexp-inp">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Zari Rate (Kg/Saree) :</label>
                            <input type="number" step="0.001" id="altc-rate-zari" value="0.110" data-altc-next="altc-col-1" class="kexp-inp">
                        </div>
                    </div>

                    <div class="kexp-sec-title">4. Tani Ke 8 Colors (Optional)</div>
                    <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:6px; margin-bottom:6px;">
                        <input type="text" id="altc-col-1" data-altc-next="altc-col-2" placeholder="1. Rani" class="kexp-inp" style="font-size:12px;">
                        <input type="text" id="altc-col-2" data-altc-next="altc-col-3" placeholder="2. Lal" class="kexp-inp" style="font-size:12px;">
                        <input type="text" id="altc-col-3" data-altc-next="altc-col-4" placeholder="3. Mehendi" class="kexp-inp" style="font-size:12px;">
                        <input type="text" id="altc-col-4" data-altc-next="altc-col-5" placeholder="4. Blue" class="kexp-inp" style="font-size:12px;">
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:6px;">
                        <input type="text" id="altc-col-5" data-altc-next="altc-col-6" placeholder="5. Peela" class="kexp-inp" style="font-size:12px;">
                        <input type="text" id="altc-col-6" data-altc-next="altc-col-7" placeholder="6. Wine" class="kexp-inp" style="font-size:12px;">
                        <input type="text" id="altc-col-7" data-altc-next="altc-col-8" placeholder="7. Firozi" class="kexp-inp" style="font-size:12px;">
                        <input type="text" id="altc-col-8" placeholder="8. Mungia" class="kexp-inp" style="font-size:12px;">
                    </div>
                </div>

                <div class="kexp-footer">
                    <button type="button" class="kexp-btn-sec" onclick="closeAltCKarigerModal()">Cancel [Esc]</button>
                    <button type="button" class="kexp-btn-save" onclick="saveAltCKariger()">Save &amp; Load in Voucher [Ctrl+Enter]</button>
                </div>

            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const altCModal = document.getElementById('alt-c-kariger-modal');
        if (altCModal) {
            altCModal.querySelectorAll('[data-altc-next]').forEach((el) => {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.ctrlKey) {
                        e.preventDefault();
                        const nextEl = document.getElementById(el.getAttribute('data-altc-next'));
                        if (nextEl) {
                            nextEl.focus();
                            if (typeof nextEl.select === 'function') nextEl.select();
                        }
                    }
                });
            });
            const col8 = document.getElementById('altc-col-8');
            if (col8) {
                col8.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveAltCKariger();
                    }
                });
            }
        }

        setTimeout(() => { document.getElementById('altc-kar-name')?.focus(); }, 80);
    };

    window.closeAltCKarigerModal = () => {
        const modal = document.getElementById('alt-c-kariger-modal');
        if (modal) modal.remove();
        document.getElementById('kexp-kariger-input')?.focus();
    };

    window.saveAltCKariger = () => {
        const nameInp = document.getElementById('altc-kar-name');
        const name = String(nameInp?.value || '').trim().toUpperCase();
        const saree = String(document.getElementById('altc-kar-saree')?.value || '').trim();
        const mobile = String(document.getElementById('altc-kar-mobile')?.value || '').trim();
        const kGodown = document.getElementById('altc-kar-godown')?.value || 'k_main';

        if (!name) {
            alert('Kripya naye Kariger ka naam likhein!');
            nameInp?.focus();
            return;
        }

        const now = Date.now();
        const newKarigerId = `kar_${now}`;

        const list = toArray(getFromStore('kariger_list'));
        const newKarObj = {
            id: newKarigerId,
            name: name,
            saree: saree || 'General Saree',
            mobile: mobile,
            date: getToday(),
            karkhanaId: kGodown
        };
        list.push(newKarObj);
        setToStore('kariger_list', list);

        const rateBani = safeNum(document.getElementById('altc-rate-bani')?.value, 240);
        const rateBana = safeNum(document.getElementById('altc-rate-bana')?.value, 0.311);
        const rateZari = safeNum(document.getElementById('altc-rate-zari')?.value, 0.110);
        const taniPcs = safeNum(document.getElementById('altc-tani-pcs')?.value, 72);
        const chukkaPcs = safeNum(document.getElementById('altc-chukka-pcs')?.value, 72);

        const taniItem = String(document.getElementById('altc-tani-item')?.value || '').trim();
        const taniSancha = String(document.getElementById('altc-tani-sancha')?.value || '').trim();
        const taniWazan = safeNum(document.getElementById('altc-tani-wazan')?.value, 0);

        const chukkaItem = String(document.getElementById('altc-chukka-item')?.value || '').trim();
        const chukkaSancha = String(document.getElementById('altc-chukka-sancha')?.value || '').trim();
        const chukkaWazan = safeNum(document.getElementById('altc-chukka-wazan')?.value, 0);

        const colors = [];
        for (let i = 1; i <= 8; i++) {
            const cVal = String(document.getElementById(`altc-col-${i}`)?.value || '').trim();
            if (cVal) colors.push(cVal);
        }

        const newSheetObj = {
            id: 'tani_1',
            title: 'Tani 1',
            pichlaBana: 0,
            pichlaZari: 0,
            pichlaBani: 0,
            banaWaste: 0,
            zariWaste: 0,
            rateBana: rateBana,
            rateZari: rateZari,
            rateBani: rateBani,
            taniPcs: taniPcs,
            chukkaPcs: chukkaPcs,
            taniItem: taniItem,
            taniSancha: taniSancha,
            taniWazan: taniWazan,
            chukkaItem: chukkaItem,
            chukkaSancha: chukkaSancha,
            chukkaWazan: chukkaWazan,
            colors: colors,
            note: 'Naya Kariger (Alt+C Mode)',
            rows: []
        };

        const sheets = [newSheetObj];
        if (typeof window.saveKarigerSheets === 'function') {
            window.saveKarigerSheets(newKarigerId, sheets);
        } else {
            setToStore(`kariger_sheets_${newKarigerId}`, sheets);
        }

        if (taniItem && taniWazan > 0) {
            deductSanchaStockItem(taniItem, 'tani', taniWazan, kGodown, `${newKarigerId}_tani_1_t`, name);
        }
        if (chukkaItem && chukkaWazan > 0) {
            deductSanchaStockItem(chukkaItem, 'chukka', chukkaWazan, kGodown, `${newKarigerId}_tani_1_c`, name);
        }

        closeAltCKarigerModal();

        const kInp = document.getElementById('kexp-kariger-input');
        if (kInp) kInp.value = name;

        selectedKariger = newKarObj;
        currentActiveSheet = newSheetObj;
        activeSheetIndex = 0;

        renderKarigerExpressTaniTabs();
        updateWeaverBannerSnapshot();
        calculateKarigerExpressLive();
        showRightPicker('summary', '');

        setTimeout(() => {
            const sareeInp = document.getElementById('kexp-saree-qty');
            if (sareeInp) sareeInp.focus();
        }, 100);

        alert(`✅ Naya Kariger [${name}] Tani 1 (${taniPcs} Pcs) ke sath ban gaya aur Voucher me load ho gaya!`);
    };

    /* ========================================================================
       7. NAYI TANI MODAL (TALLY WHITE & GOLD)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.openExpressNewTaniModal = () => {
        ensureTallyExpressStyles();
        if (!selectedKariger || !currentActiveSheet) {
            return alert('Pehle koi Kariger chunein!');
        }

        const existing = document.getElementById('express-new-tani-modal');
        if (existing) existing.remove();

        const { taniOpts } = getKarigerExpressDatalists();
        const sheets = (typeof window.getKarigerSheets === 'function') ? window.getKarigerSheets(selectedKariger.id) : [];
        const nextNum = sheets.length + 1;

        const calc = (typeof window.calculateSheetTotals === 'function')
            ? window.calculateSheetTotals(currentActiveSheet)
            : { remainingBana: 0, remainingZari: 0, remainingAmt: 0 };

        const pBana = safeNum(calc.remainingBana);
        const pZari = safeNum(calc.remainingZari);
        const pBani = safeNum(calc.remainingAmt);

        const modalHtml = `
        <div id="express-new-tani-modal" class="kexp-overlay" style="z-index:1000005;">
            <div class="kexp-card" style="max-width:620px;">

                <div class="kexp-header">
                    <h3 class="kexp-title">Nayi Tani Chadhayein &bull; Tani ${nextNum} (${esc(selectedKariger.name)})</h3>
                    <button type="button" class="kexp-pill-btn" onclick="closeExpressNewTaniModal()">&larr; [Esc] Close</button>
                </div>

                <div style="padding:14px 18px; overflow-y:auto; flex:1;">
                    <div style="background:#fdf6e2; border:1px solid #e5d5a7; border-radius:4px; padding:8px 12px; margin-bottom:12px;">
                        <div style="font-size:11px; font-weight:800; color:#92400e; text-transform:uppercase; margin-bottom:4px;">Carry Forward from Previous Tani</div>
                        <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; color:#1f2937;">
                            <span>Bacha Bana: +${pBana.toFixed(2)} Kg</span>
                            <span>Bachi Zari: +${pZari.toFixed(2)} Kg</span>
                            <span>Baki Rupya: <strong style="color:#b47d00;">₹ ${pBani.toFixed(2)}</strong></span>
                        </div>
                    </div>

                    <div class="kexp-sec-title" style="margin-top:0;">Naya Taana / Sancha Details</div>
                    <div style="display:grid; grid-template-columns:1.5fr 1fr 0.8fr 0.8fr; gap:8px; margin-bottom:10px;">
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Tani Item :</label>
                            <input type="text" id="ntani-tani-item" list="ntani-tani-dl" placeholder="Tani Item..." class="kexp-inp" style="font-size:12px;">
                            <datalist id="ntani-tani-dl">${taniOpts}</datalist>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Sancha Maker :</label>
                            <input type="text" id="ntani-tani-sancha" value="${esc(currentActiveSheet.taniSancha || '')}" class="kexp-inp" style="font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Wazan (Kg) :</label>
                            <input type="number" step="0.01" id="ntani-tani-wazan" placeholder="0.00" class="kexp-inp" style="font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Target Pcs :</label>
                            <input type="number" id="ntani-tani-pcs" value="${currentActiveSheet.taniPcs || 72}" class="kexp-inp" style="font-size:12px;">
                        </div>
                    </div>

                    <div class="kexp-sec-title">Mazdoori Rates</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Bani (₹/Saree) :</label>
                            <input type="number" id="ntani-rate-bani" value="${currentActiveSheet.rateBani || 240}" class="kexp-inp">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Bana Rate :</label>
                            <input type="number" step="0.001" id="ntani-rate-bana" value="${currentActiveSheet.rateBana || 0.311}" class="kexp-inp">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; color:#374151;">Zari Rate :</label>
                            <input type="number" step="0.001" id="ntani-rate-zari" value="${currentActiveSheet.rateZari || 0.110}" class="kexp-inp">
                        </div>
                    </div>
                </div>

                <div class="kexp-footer">
                    <button type="button" class="kexp-btn-sec" onclick="closeExpressNewTaniModal()">Cancel [Esc]</button>
                    <button type="button" class="kexp-btn-save" onclick="saveExpressNewTani(${nextNum}, ${pBana}, ${pZari}, ${pBani})">Tani ${nextNum} Chadhayein [Save]</button>
                </div>

            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setTimeout(() => { document.getElementById('ntani-tani-item')?.focus(); }, 80);
    };

    window.closeExpressNewTaniModal = () => {
        const modal = document.getElementById('express-new-tani-modal');
        if (modal) modal.remove();
    };

    window.saveExpressNewTani = (nextNum, pBana, pZari, pBani) => {
        const kId = selectedKariger.id;
        const kGodown = selectedKariger.karkhanaId || 'k_main';

        const taniItem = String(document.getElementById('ntani-tani-item')?.value || '').trim();
        const taniSancha = String(document.getElementById('ntani-tani-sancha')?.value || '').trim();
        const taniWazan = safeNum(document.getElementById('ntani-tani-wazan')?.value, 0);
        const taniPcs = safeNum(document.getElementById('ntani-tani-pcs')?.value, 72);

        const rateBani = safeNum(document.getElementById('ntani-rate-bani')?.value, 240);
        const rateBana = safeNum(document.getElementById('ntani-rate-bana')?.value, 0.311);
        const rateZari = safeNum(document.getElementById('ntani-rate-zari')?.value, 0.110);

        const sheets = (typeof window.getKarigerSheets === 'function') ? window.getKarigerSheets(kId) : [];

        const newSheetObj = {
            id: `tani_${nextNum}`,
            title: `Tani ${nextNum}`,
            pichlaBana: pBana,
            pichlaZari: pZari,
            pichlaBani: pBani,
            banaWaste: 0,
            zariWaste: 0,
            rateBana: rateBana,
            rateZari: rateZari,
            rateBani: rateBani,
            taniPcs: taniPcs,
            chukkaPcs: currentActiveSheet.chukkaPcs || 72,
            taniItem: taniItem || currentActiveSheet.taniItem || '',
            taniSancha: taniSancha || currentActiveSheet.taniSancha || '',
            taniWazan: taniWazan,
            chukkaItem: currentActiveSheet.chukkaItem || '',
            chukkaSancha: currentActiveSheet.chukkaSancha || '',
            chukkaWazan: 0,
            colors: Array.isArray(currentActiveSheet.colors) ? [...currentActiveSheet.colors] : [],
            note: `Tani ${nextNum} (Kariger Express Mode)`,
            rows: []
        };

        sheets.push(newSheetObj);
        if (typeof window.saveKarigerSheets === 'function') {
            window.saveKarigerSheets(kId, sheets);
        } else {
            setToStore(`kariger_sheets_${kId}`, sheets);
        }

        if (taniItem && taniWazan > 0) {
            deductSanchaStockItem(taniItem, 'tani', taniWazan, kGodown, `${kId}_tani_${nextNum}_t`, selectedKariger.name);
        }

        closeExpressNewTaniModal();

        activeSheetIndex = sheets.length - 1;
        currentActiveSheet = newSheetObj;

        renderKarigerExpressTaniTabs();
        updateWeaverBannerSnapshot();
        calculateKarigerExpressLive();
        showRightPicker('summary', '');

        alert(`✅ Tani ${nextNum} safalta-poorvak shuru ho gayi! Pichla hisab carry-forward ho gaya.`);
    };

    /* ========================================================================
       8. ZERO-MOUSE KEYBOARD CHAINING, PICKER NAV & SHORTCUT LISTENERS
       ------------------------------------------------------------------------
    ======================================================================== */
    const FIELD_ORDER = [
        'kexp-date',
        'kexp-kariger-input',
        'kexp-saree-qty',
        'kexp-saree-lott',
        'kexp-ret-bana',
        'kexp-ret-zari',
        'kexp-bana-name',
        'kexp-bana-cone',
        'kexp-bana-lesstp',
        'kexp-zari-name',
        'kexp-zari-qty',
        'kexp-zari-topi',
        'kexp-paid-amount'
    ];

    const moveField = (currentId, dir) => {
        const idx = FIELD_ORDER.indexOf(currentId);
        if (idx === -1) return;
        const nextIdx = idx + dir;
        if (nextIdx >= 0 && nextIdx < FIELD_ORDER.length) {
            const el = document.getElementById(FIELD_ORDER[nextIdx]);
            if (el) {
                el.focus();
                if (typeof el.select === 'function') el.select();
            }
        }
    };

    const bindKarigerExpressEvents = () => {
        const modal = document.getElementById('kariger-express-modal');
        if (!modal) return;

        const karigerInp = document.getElementById('kexp-kariger-input');
        const banaInp = document.getElementById('kexp-bana-name');
        const zariInp = document.getElementById('kexp-zari-name');
        const paidInp = document.getElementById('kexp-paid-amount');

        setTimeout(() => { if (karigerInp) karigerInp.focus(); }, 100);

        // Focus handlers to switch Right-Pane Context automatically
        if (karigerInp) {
            karigerInp.addEventListener('focus', () => {
                pickerArrowUsed = false;
                pickerActiveIdx = 0;
                showRightPicker('kariger', karigerInp.value);
            });
            karigerInp.addEventListener('input', () => {
                pickerArrowUsed = false;
                pickerActiveIdx = 0;
                const val = karigerInp.value.trim().toLowerCase();
                showRightPicker('kariger', val);

                const raw = toArray(getFromStore('kariger_list'));
                const k = raw.find(x => x && x.name && x.name.toLowerCase() === val);
                if (k) {
                    applySelectedKariger(k);
                } else {
                    selectedKariger = null;
                    currentActiveSheet = null;
                    renderKarigerExpressTaniTabs();
                    const banner = document.getElementById('kexp-weaver-banner');
                    if (banner) banner.innerHTML = `<span style="font-size:12px; color:#6b7280;">Kariger chunein — tani ka poora hisab aur colors yahan dikhenge.</span>`;
                    const rateEl = document.getElementById('kexp-disp-bani-rate');
                    if (rateEl) rateEl.textContent = `₹ 0.00`;
                    calculateKarigerExpressLive();
                }
            });
        }

        if (banaInp) {
            banaInp.addEventListener('focus', () => {
                pickerArrowUsed = false;
                pickerActiveIdx = 0;
                showRightPicker('bana', '');
            });
            banaInp.addEventListener('input', () => {
                pickerArrowUsed = true;
                pickerActiveIdx = 0;
                showRightPicker('bana', banaInp.value);
            });
        }

        if (zariInp) {
            zariInp.addEventListener('focus', () => {
                pickerArrowUsed = false;
                pickerActiveIdx = 0;
                showRightPicker('zari', '');
            });
            zariInp.addEventListener('input', () => {
                pickerArrowUsed = true;
                pickerActiveIdx = 0;
                showRightPicker('zari', zariInp.value);
            });
        }

        // All other voucher inputs switch Right Pane to Live Tani Snapshot
        FIELD_ORDER.forEach((fid) => {
            if (fid === 'kexp-kariger-input' || fid === 'kexp-bana-name' || fid === 'kexp-zari-name') return;
            const el = document.getElementById(fid);
            if (!el) return;
            el.addEventListener('focus', () => {
                showRightPicker('summary', '');
            });
        });

        // Enter / Shift+Enter / ArrowUp-Down inside Voucher Inputs
        FIELD_ORDER.forEach((fid) => {
            const el = document.getElementById(fid);
            if (!el) return;

            el.addEventListener('keydown', (e) => {
                // Arrow Up / Down inside Picker-linked inputs
                if ((fid === 'kexp-kariger-input' || fid === 'kexp-bana-name' || fid === 'kexp-zari-name') &&
                    (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    if (pickerItems.length) {
                        e.preventDefault();
                        pickerArrowUsed = true;
                        if (e.key === 'ArrowDown') {
                            pickerActiveIdx = (pickerActiveIdx + 1) % pickerItems.length;
                        } else {
                            pickerActiveIdx = (pickerActiveIdx - 1 + pickerItems.length) % pickerItems.length;
                        }
                        renderRightPickerList();
                    }
                    return;
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        moveField(fid, -1);
                        return;
                    }

                    // Kariger input Enter picks highlighted Kariger
                    if (fid === 'kexp-kariger-input') {
                        if (pickerItems.length && (pickerArrowUsed || karigerInp.value.trim() !== '' || !selectedKariger)) {
                            window.__kexpPickItem(pickerActiveIdx);
                            return;
                        }
                    }

                    // Bana / Zari Enter picks if user navigated list or typed filter
                    if ((fid === 'kexp-bana-name' || fid === 'kexp-zari-name') && pickerArrowUsed && pickerItems.length) {
                        window.__kexpPickItem(pickerActiveIdx);
                        return;
                    }

                    // Last field -> Submit
                    if (fid === 'kexp-paid-amount') {
                        submitKarigerExpress();
                        return;
                    }

                    moveField(fid, 1);
                }
            });
        });

        if (paidInp) {
            paidInp.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    submitKarigerExpress();
                }
            });
        }

        window.removeEventListener('keydown', handleKarigerExpressKeydown, true);
        window.addEventListener('keydown', handleKarigerExpressKeydown, true);
    };

    const handleKarigerExpressKeydown = (e) => {
        const modal = document.getElementById('kariger-express-modal');
        if (!modal || modal.style.display === 'none') return;

        // If Alt+C modal is open
        const altCModal = document.getElementById('alt-c-kariger-modal');
        if (altCModal) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                closeAltCKarigerModal();
                return;
            }
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                e.stopImmediatePropagation();
                saveAltCKariger();
                return;
            }
            return;
        }

        // If New Tani modal is open
        const newTaniModal = document.getElementById('express-new-tani-modal');
        if (newTaniModal) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                closeExpressNewTaniModal();
                return;
            }
            return;
        }

        // Escape -> Close Kariger Express
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeKarigerExpressModal();
            return;
        }

        // Alt + C -> Naya Kariger Form
        if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            openAltCKarigerModal();
            return;
        }

        // Alt + N -> Nayi Tani Modal
        if (e.altKey && (e.key === 'n' || e.key === 'N')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            openExpressNewTaniModal();
            return;
        }

        // F2 -> Search Kariger
        if (e.key === 'F2') {
            e.preventDefault();
            e.stopImmediatePropagation();
            const inp = document.getElementById('kexp-kariger-input');
            if (inp) { inp.focus(); inp.select(); }
            return;
        }

        // Alt + P -> Print
        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            printLastSavedExpressSlip();
            return;
        }

        // Ctrl + A -> Direct Submit (Tally style)
        if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
            const activeTag = document.activeElement?.tagName;
            if (activeTag !== 'INPUT' || document.activeElement?.id !== 'kexp-kariger-input') {
                e.preventDefault();
                e.stopImmediatePropagation();
                submitKarigerExpress();
                return;
            }
        }
    };

    window.closeKarigerExpressModal = () => {
        window.removeEventListener('keydown', handleKarigerExpressKeydown, true);
        const modal = document.getElementById('kariger-express-modal');
        if (modal) modal.remove();
        selectedKariger = null;
        currentActiveSheet = null;
    };

    // Live Calculation
    window.calculateKarigerExpressLive = () => {
        const saree = safeNum(document.getElementById('kexp-saree-qty')?.value);
        const lott = safeNum(document.getElementById('kexp-saree-lott')?.value);
        const paid = safeNum(document.getElementById('kexp-paid-amount')?.value);

        const rateBani = currentActiveSheet ? safeNum(currentActiveSheet.rateBani, 240) : 240;

        let pichlaAmt = 0;
        if (currentActiveSheet && typeof window.calculateSheetTotals === 'function') {
            pichlaAmt = safeNum(window.calculateSheetTotals(currentActiveSheet).remainingAmt);
        }

        const netSaree = Math.max(0, saree - lott);
        const grossBani = netSaree * rateBani;
        const netRemaining = (pichlaAmt + grossBani) - paid;

        const dispGross = document.getElementById('kexp-disp-gross-bani');
        const dispNet = document.getElementById('kexp-disp-net-balance');

        if (dispGross) dispGross.textContent = `₹ ${grossBani.toFixed(2)}`;
        if (dispNet) {
            dispNet.textContent = `₹ ${netRemaining.toFixed(2)}`;
            dispNet.style.color = netRemaining > 0 ? '#b47d00' : '#1f2937';
        }

        const progEl = document.getElementById('kexp-live-tani-progress');
        if (progEl && currentActiveSheet) {
            const totalTaniTarget = safeNum(currentActiveSheet.taniPcs, 72);
            const liveTotalDelivered = prevDeliveredSarees + saree;
            const liveRemainingOnLoom = Math.max(0, totalTaniTarget - liveTotalDelivered);
            progEl.innerHTML = `Tani: <strong>${totalTaniTarget} Pcs</strong> &bull; Aayi: <strong>${liveTotalDelivered}</strong> &bull; Baki: <strong style="color:#b47d00;">${liveRemainingOnLoom} Pcs</strong>`;
        }
    };

    window.updateExpressStockBadges = () => {
        const kGodown = selectedKariger ? (selectedKariger.karkhanaId || 'k_main') : 'k_main';
        const bName = String(document.getElementById('kexp-bana-name')?.value || '').trim();
        const zName = String(document.getElementById('kexp-zari-name')?.value || '').trim();

        const bBacha = getBanaStockBacha(bName, kGodown);
        const zBacha = getZariStockBacha(zName, kGodown);

        const bBadge = document.getElementById('kexp-live-bana-badge');
        const zBadge = document.getElementById('kexp-live-zari-badge');

        if (bBadge) bBadge.textContent = `Bacha: ${bBacha.toFixed(2)} Kg`;
        if (zBadge) zBadge.textContent = `Bacha: ${zBacha.toFixed(2)} Kg`;
    };

    /* ========================================================================
       9. ATOMIC SUBMIT & AUTO-TANI COMPLETE ROLLOVER ENGINE (100% PRESERVED)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.submitKarigerExpress = () => {
        if (!selectedKariger) {
            alert('Kripya Kariger ka sahi naam chunein (ya Alt+C se naya banayein)!');
            document.getElementById('kexp-kariger-input')?.focus();
            return;
        }

        const kId = selectedKariger.id;
        const kName = selectedKariger.name;
        const sDesign = selectedKariger.saree || 'General Saree';
        const kGodown = selectedKariger.karkhanaId || 'k_main';
        const date = document.getElementById('kexp-date')?.value || getToday();

        const bCone = safeNum(document.getElementById('kexp-bana-cone')?.value);
        const bLess = safeNum(document.getElementById('kexp-bana-lesstp')?.value);
        const zQty = safeNum(document.getElementById('kexp-zari-qty')?.value);
        const topi = safeNum(document.getElementById('kexp-zari-topi')?.value);

        const saree = safeNum(document.getElementById('kexp-saree-qty')?.value);
        const lott = safeNum(document.getElementById('kexp-saree-lott')?.value);
        const paid = safeNum(document.getElementById('kexp-paid-amount')?.value);
        const retB = safeNum(document.getElementById('kexp-ret-bana')?.value);
        const retZ = safeNum(document.getElementById('kexp-ret-zari')?.value);

        const banaItemName = String(document.getElementById('kexp-bana-name')?.value || '').trim();
        const zariItemName = String(document.getElementById('kexp-zari-name')?.value || '').trim();

        if (saree === 0 && bCone === 0 && zQty === 0 && paid === 0 && retB === 0 && retZ === 0) {
            return alert('Kam se kam ek entry (Saree, Bana, Zari ya Payment) bharein!');
        }

        const nBana = Math.max(0, bCone - bLess);
        const nZari = Math.max(0, zQty - topi);
        const rowId = `row_${Date.now()}`;

        let sheets = (typeof window.getKarigerSheets === 'function') ? window.getKarigerSheets(kId) : [];
        if (!sheets || !sheets.length) {
            sheets = [{
                id: 'tani_1', title: 'Tani 1',
                pichlaBana: 0, pichlaZari: 0, pichlaBani: 0,
                banaWaste: 0, zariWaste: 0,
                rateBana: 0.311, rateZari: 0.110, rateBani: 240,
                taniPcs: 72, chukkaPcs: 72, colors: [],
                note: '', rows: []
            }];
        }

        const activeSheet = sheets[activeSheetIndex] || sheets[sheets.length - 1];
        if (banaItemName) activeSheet.banaItem = banaItemName;
        if (zariItemName) activeSheet.zariItem = zariItemName;

        const rowObj = {
            id: rowId,
            date: date,
            cone: bCone,
            lessTp: bLess,
            netBana: safeNum(nBana.toFixed(2)),
            zariQty: zQty,
            topi: topi,
            netZari: safeNum(nZari.toFixed(2)),
            saree: saree,
            lott: lott,
            paid: paid,
            retBana: retB,
            retZari: retZ,
            banaItem: banaItemName,
            zariItem: zariItemName
        };

        if (!activeSheet.rows) activeSheet.rows = [];
        activeSheet.rows.push(rowObj);

        if (typeof window.saveKarigerSheets === 'function') {
            window.saveKarigerSheets(kId, sheets);
        } else {
            setToStore(`kariger_sheets_${kId}`, sheets);
        }

        const freshSaree = Math.max(0, saree - lott);
        let sHist = toArray(getFromStore('saree_history'));

        if (freshSaree > 0) {
            sHist.push({
                id: `saree_${Date.now()}_f`,
                refId: rowId,
                date: date,
                sareeName: sDesign,
                karigerName: kName,
                kariger: kName,
                partyName: kName,
                karkhanaId: kGodown,
                type: 'fresh',
                typeLabel: 'Fresh Saree (Kariger Sheet)',
                aai: freshSaree,
                gai: 0,
                isOut: false,
                timestamp: Date.now()
            });
        }
        if (lott > 0) {
            sHist.push({
                id: `saree_${Date.now()}_l`,
                refId: rowId,
                date: date,
                sareeName: sDesign,
                karigerName: kName,
                kariger: kName,
                partyName: kName,
                karkhanaId: kGodown,
                type: 'lott',
                typeLabel: 'Lott Saree (Kariger Sheet)',
                aai: lott,
                gai: 0,
                isOut: false,
                timestamp: Date.now() + 1
            });
        }
        setToStore('saree_history', sHist);

        if (banaItemName && (nBana > 0 || retB > 0)) {
            const bHist = toArray(getFromStore('bana_history'));
            bHist.push({
                id: `bhist_${Date.now()}`,
                refId: rowId,
                date: date,
                name: banaItemName,
                kariger: kName,
                type: 'Kariger Issue',
                aaya: retB > 0 ? retB : 0,
                gaya: nBana > 0 ? nBana : 0,
                karkhanaId: kGodown,
                timestamp: Date.now()
            });
            setToStore('bana_history', bHist);
        }

        if (zariItemName && (nZari > 0 || retZ > 0)) {
            const zHist = toArray(getFromStore('zari_history'));
            zHist.push({
                id: `zhist_${Date.now()}`,
                refId: rowId,
                date: date,
                name: zariItemName,
                kariger: kName,
                type: 'Kariger Issue',
                aaya: retZ > 0 ? retZ : 0,
                gaya: nZari > 0 ? nZari : 0,
                karkhanaId: kGodown,
                timestamp: Date.now()
            });
            setToStore('zari_history', zHist);
        }

        if (paid > 0) {
            const payList = toArray(getFromStore('payment_history'));
            payList.push({
                id: `pay_${Date.now()}`,
                date: date,
                party: kName,
                type: 'कारीगर मजदूरी',
                amount: paid,
                mode: 'Cash',
                timestamp: Date.now()
            });
            setToStore('payment_history', payList);
        }

        const totalsAfter = (typeof window.calculateSheetTotals === 'function')
            ? window.calculateSheetTotals(activeSheet)
            : { remainingAmt: 0, remainingBana: 0, remainingZari: 0, totSaree: 0 };

        const targetTaniPcs = safeNum(activeSheet.taniPcs, 72);
        const deliveredSoFar = safeNum(totalsAfter.totSaree);

        // AUTO-TANI COMPLETE & ROLLOVER TRIGGER
        let isTaniCompleted = false;
        let completedTaniTitle = activeSheet.title;
        let nextTaniTitle = '';
        let pBana = 0, pZari = 0, pBani = 0;

        if (targetTaniPcs > 0 && deliveredSoFar >= targetTaniPcs) {
            isTaniCompleted = true;
            const nextNum = sheets.length + 1;
            nextTaniTitle = `Tani ${nextNum}`;

            pBana = safeNum(totalsAfter.remainingBana);
            pZari = safeNum(totalsAfter.remainingZari);
            pBani = safeNum(totalsAfter.remainingAmt);

            const autoNewSheet = {
                id: `tani_${nextNum}`,
                title: nextTaniTitle,
                pichlaBana: pBana,
                pichlaZari: pZari,
                pichlaBani: pBani,
                banaWaste: 0,
                zariWaste: 0,
                rateBana: safeNum(activeSheet.rateBana, 0.311),
                rateZari: safeNum(activeSheet.rateZari, 0.110),
                rateBani: safeNum(activeSheet.rateBani, 240),
                taniPcs: targetTaniPcs,
                chukkaPcs: safeNum(activeSheet.chukkaPcs, 72),
                taniItem: activeSheet.taniItem || '',
                taniSancha: activeSheet.taniSancha || '',
                taniWazan: 0,
                chukkaItem: activeSheet.chukkaItem || '',
                chukkaSancha: activeSheet.chukkaSancha || '',
                chukkaWazan: 0,
                colors: Array.isArray(activeSheet.colors) ? [...activeSheet.colors] : [],
                note: `Auto Rollover: ${completedTaniTitle} (${targetTaniPcs} Saree Poori Hui)`,
                rows: []
            };

            sheets.push(autoNewSheet);

            if (typeof window.saveKarigerSheets === 'function') {
                window.saveKarigerSheets(kId, sheets);
            } else {
                setToStore(`kariger_sheets_${kId}`, sheets);
            }

            activeSheetIndex = sheets.length - 1;
            currentActiveSheet = autoNewSheet;
        }

        lastSavedTransaction = {
            karigerName: kName,
            sDesign: sDesign,
            kGodown: kGodown,
            date: date,
            taniTitle: completedTaniTitle,
            sanchaMaker: activeSheet.taniSancha || 'N/A',
            taniPcs: targetTaniPcs,
            deliveredSarees: deliveredSoFar,
            colors: activeSheet.colors || [],
            saree: saree,
            lott: lott,
            netBana: nBana,
            banaItem: banaItemName,
            netZari: nZari,
            zariItem: zariItemName,
            retBana: retB,
            retZari: retZ,
            paid: paid,
            netRemaining: safeNum(totalsAfter.remainingAmt),
            isTaniCompleted: isTaniCompleted,
            nextTaniTitle: nextTaniTitle
        };

        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();

        document.getElementById('kexp-saree-qty').value = '';
        document.getElementById('kexp-saree-lott').value = '';
        document.getElementById('kexp-ret-bana').value = '';
        document.getElementById('kexp-ret-zari').value = '';
        document.getElementById('kexp-bana-cone').value = '';
        document.getElementById('kexp-bana-lesstp').value = '';
        document.getElementById('kexp-zari-qty').value = '';
        document.getElementById('kexp-zari-topi').value = '';
        document.getElementById('kexp-paid-amount').value = '';

        const statusMsg = document.getElementById('kexp-status-msg');
        if (statusMsg) {
            if (isTaniCompleted) {
                statusMsg.innerHTML = `✅ ${esc(kName)} ki ${esc(completedTaniTitle)} (${targetTaniPcs} Pcs) poori hui — ${esc(nextTaniTitle)} auto-create ho gayi.`;
            } else {
                statusMsg.innerHTML = `✅ ${esc(kName)} (${esc(completedTaniTitle)}) ka hisab save ho gaya.`;
            }
        }

        if (isTaniCompleted) {
            alert(`🎉 Mubarak!\n\n${kName} ki [${completedTaniTitle}] (${targetTaniPcs} Saree) poori ho gayi!\n\n✨ Nayi [${nextTaniTitle}] apne aap shuru ho gayi hai.\n• Bacha Bana: +${pBana.toFixed(2)} Kg\n• Bachi Zari: +${pZari.toFixed(2)} Kg\n• Baki Rupya: ₹ ${pBani.toFixed(2)}\nNayi tani me transfer ho gaya hai!`);
        }

        printLastSavedExpressSlip();

        const kInp = document.getElementById('kexp-kariger-input');
        if (kInp) {
            kInp.value = '';
            kInp.focus();
        }
        selectedKariger = null;
        currentActiveSheet = null;
        renderKarigerExpressTaniTabs();
        const banner = document.getElementById('kexp-weaver-banner');
        if (banner) banner.innerHTML = `<span style="font-size:12px; color:#6b7280;">Kariger chunein — tani ka poora hisab aur colors yahan dikhenge.</span>`;
        showRightPicker('kariger', '');
    };

    /* ========================================================================
       10. A6 THERMAL SLIP PRINT (UNCHANGED)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.printLastSavedExpressSlip = () => {
        if (!lastSavedTransaction) {
            return alert('Print karne ke liye koi recent hisab nahi mila!');
        }

        const t = lastSavedTransaction;
        const kGodamName = (typeof window.getKarkhanaNameById === 'function')
            ? window.getKarkhanaNameById(t.kGodown)
            : 'Main Godown';

        const remainingOnLoom = Math.max(0, t.taniPcs - t.deliveredSarees);
        const colorsTxt = (t.colors && t.colors.length) ? t.colors.join(', ') : 'N/A';

        const printWindow = window.open('', '', 'width=420,height=600');
        if (!printWindow) return alert('Popup block hai! Kripya allow karein.');

        printWindow.document.write(`
            <html>
            <head>
                <title>Baithak Parchi - ${esc(t.karigerName)}</title>
                <style>
                    @page { size: A6 portrait; margin: 4mm; }
                    body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                    .ticket { width: 100%; max-width: 90mm; margin: 0 auto; border: 1.5px dashed #000; padding: 8px; box-sizing: border-box; }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 5px; margin-bottom: 6px; }
                    .header h2 { margin: 0; font-size: 15px; text-transform: uppercase; }
                    .header p { margin: 2px 0 0; font-size: 10px; font-weight: bold; }
                    .meta { margin-bottom: 6px; font-size: 10.5px; border-bottom: 1.5px dashed #666; padding-bottom: 4px; }
                    .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                    table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 6px 0; }
                    th, td { padding: 3px 2px; text-align: left; border-bottom: 1px dashed #ccc; }
                    th { border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 10px; }
                    .highlight-box { background: #f4f4f4; border: 1px solid #000; padding: 4px 6px; margin: 6px 0; font-size: 11px; font-weight: bold; }
                    .completed-banner { background: #eee; border: 1.5px solid #000; padding: 5px; text-align: center; font-weight: 900; font-size: 11px; margin-bottom: 6px; }
                    .signs { display: flex; justify-content: space-between; margin-top: 22px; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        <h2>SIMPLICITY ERP</h2>
                        <p>⚡ बैठक ले-देन पर्ची (EXPRESS RECEIPT)</p>
                    </div>

                    ${t.isTaniCompleted ? `
                    <div class="completed-banner">
                        🎉 ताना पूरा हुआ: ${esc(t.taniTitle)} (${t.taniPcs} Saree)<br>
                        ✨ अगली ताना (${esc(t.nextTaniTitle)}) स्वतः शुरू हो गई!
                    </div>` : ''}

                    <div class="meta">
                        <div class="meta-row"><span><strong>कारीगर:</strong> ${esc(t.karigerName)}</span><span><strong>तारीख:</strong> ${esc(t.date)}</span></div>
                        <div class="meta-row"><span><strong>साड़ी (Design):</strong> ${esc(t.sDesign)}</span><span><strong>खाता:</strong> ${esc(t.taniTitle)}</span></div>
                        <div class="meta-row"><span><strong>साँचा (Maker):</strong> ${esc(t.sanchaMaker)}</span><span><strong>गोदाम:</strong> ${esc(kGodamName)}</span></div>
                    </div>

                    <div class="highlight-box">
                        <div style="display:flex; justify-content:space-between;">
                            <span>कुल तानी: ${t.taniPcs} Pcs</span>
                            <span>अब तक आई: ${t.deliveredSarees} Pcs</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:2px;">
                            <span>लूम पर बाकी: ${remainingOnLoom} Pcs</span>
                        </div>
                        <div style="font-size:9.5px; font-weight:normal; margin-top:3px; color:#333;">
                            रंग (Colors): ${esc(colorsTxt)}
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr><th>विवरण (ITEM / DETAIL)</th><th style="text-align:right;">मात्रा / वज़न</th></tr>
                        </thead>
                        <tbody>
                            ${t.saree > 0 ? `<tr><td>साड़ी जमा</td><td style="text-align:right; font-weight:bold;">+${t.saree} Pcs</td></tr>` : ''}
                            ${t.lott > 0 ? `<tr><td>लोट साड़ी</td><td style="text-align:right; font-weight:bold;">-${t.lott} Pcs</td></tr>` : ''}
                            ${t.netBana > 0 ? `<tr><td>बाना दिया (${esc(t.banaItem || 'बाना')})</td><td style="text-align:right; font-weight:bold;">${t.netBana.toFixed(2)} Kg</td></tr>` : ''}
                            ${t.netZari > 0 ? `<tr><td>जरी दी (${esc(t.zariItem || 'जरी')})</td><td style="text-align:right; font-weight:bold;">${t.netZari.toFixed(2)} Kg</td></tr>` : ''}
                            ${t.retBana > 0 ? `<tr><td>वापस बाना</td><td style="text-align:right;">${t.retBana.toFixed(2)} Kg</td></tr>` : ''}
                            ${t.retZari > 0 ? `<tr><td>वापस जरी</td><td style="text-align:right;">${t.retZari.toFixed(2)} Kg</td></tr>` : ''}
                            ${t.paid > 0 ? `<tr><td>मजदूरी दिया (Paid)</td><td style="text-align:right; font-weight:bold;">₹ ${t.paid.toFixed(2)}</td></tr>` : ''}
                        </tbody>
                    </table>

                    <div style="border-top:1.5px dashed #000; padding-top:4px; font-size:11.5px; font-weight:bold; display:flex; justify-content:space-between;">
                        <span>अंतिम बाकी रुपया:</span>
                        <span>₹ ${t.netRemaining.toFixed(2)}</span>
                    </div>

                    <div class="signs">
                        <div>हस्ताक्षर मुंशी<br><br>___________</div>
                        <div>हस्ताक्षर कारीगर<br><br>___________</div>
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
    window.KarigerExpressEngine = {
        openKarigerExpressModal,
        closeKarigerExpressModal,
        openAltCKarigerModal,
        closeAltCKarigerModal,
        saveAltCKariger,
        openExpressNewTaniModal,
        closeExpressNewTaniModal,
        saveExpressNewTani,
        switchExpressTaniSheet,
        calculateKarigerExpressLive,
        updateExpressStockBadges,
        submitKarigerExpress,
        printLastSavedExpressSlip
    };

})();
