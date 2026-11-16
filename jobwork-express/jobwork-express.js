/* ============================================================================
   SIMPLICITY ERP - ⚡ MASTER JOBWORK EXPRESS ENGINE (TALLY KEYBOARD COUNTER)
   Folder: jobwork-express / File: jobwork-express.js
   Developed for: Farhan Jawed
   Features:
   - Default Opens on 1. CUTTING [F1] (No Accidental Calender Default)
   - Clear Stock Source Selector (<select> + [F6]) for Embroidery & Calender
   - Strict Modal Focus Trap & tabindex="-1" on Header Tabs (Zero Tab Jump!)
   - Tally-Style Enter Chaining: Worker -> Date -> Source -> Maker -> Naap -> Qty -> Loop
   - Empty Maker + Enter = Tally "End of List" Jump to Damage / Save
   - Process Switch Guard (Prevents Mixing Items Across Cutting/Emb/Cal/Dukan)
============================================================================ */

(() => {
    'use strict';

    let activeCategory = 'cutting';   // 'cutting' | 'embroidery' | 'calender' | 'dukan'
    let movementType = 'gayi';        // 'gayi' | 'aayi'
    let stockSource = 'fresh';        // 'fresh' | 'cutting' | 'embroidery'
    let expressBatchItems = [];
    let lastSavedExpressBatch = null;
    let lastEnteredNaap = '3.60';

    /* ========================================================================
       1. SAFE HELPERS & STORES
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
        return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
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

    /* ========================================================================
       2. LIVE STOCK RESOLVER: EXACT CURRENT SAREE & AVAILABLE PIECES
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

    /* ========================================================================
       3. DYNAMIC DATALIST: LIVE AVAILABLE STOCK + MASTER KARIGERS
       ------------------------------------------------------------------------
    ======================================================================== */
    const updateExpressMakerDatalist = () => {
        const dl = document.getElementById('jw-exp-maker-dl');
        if (!dl) return;

        const sH = toArray(getFromStore('saree_history'));
        const allKars = toArray(getFromStore('kariger_list'));
        const targetKid = getEffectiveGodown();

        let targetStage = getTargetStageForLookup();
        // Aayi mode me jis stage ka maal worker ke paas ho sakta hai uska hint dikhayein
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
            const item = stockMap.get(key);
            item.bachi += (inQ - outQ);
        });

        let opts = '';
        const addedNames = new Set();

        stockMap.forEach((val) => {
            if (val.bachi > 0) {
                addedNames.add(val.kName);
                opts += `<option value="${esc(val.kName)}">${esc(val.kName)} — 🥻 ${esc(val.sName)} (Stock: ${val.bachi} Pcs)</option>`;
            }
        });

        allKars.forEach((k) => {
            if (!k || !k.name) return;
            const kn = normText(k.name);
            if (!addedNames.has(kn)) {
                addedNames.add(kn);
                opts += `<option value="${esc(kn)}">${esc(kn)} — 🥻 ${esc(k.saree || 'Saree')}</option>`;
            }
        });

        dl.innerHTML = opts;
    };

    /* ========================================================================
       4. OPEN MODAL (DEFAULT: 1. CUTTING | TALLY KEYBOARD COUNTER)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.openJobWorkExpressModal = () => {
        const existing = document.getElementById('master-jobwork-express-modal');
        if (existing) existing.remove();

        activeCategory = 'cutting';
        movementType = 'gayi';
        stockSource = 'fresh';
        expressBatchItems = [];
        lastSavedExpressBatch = null;

        const today = getToday();
        const activeKid = getEffectiveGodown();
        const godamName = (typeof window.getKarkhanaNameById === 'function')
            ? window.getKarkhanaNameById(activeKid)
            : 'Main Godown';

        const modalHtml = `
        <div id="master-jobwork-express-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.88); z-index:999999; display:flex; align-items:center; justify-content:center; padding:10px; box-sizing:border-box;">
            <div style="background:#ffffff; width:100%; max-width:980px; border-radius:14px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.65); overflow:hidden; font-family:sans-serif; max-height:97vh; display:flex; flex-direction:column;">
                
                <!-- Header -->
                <div style="background:#0f172a; color:#fff; padding:12px 20px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:26px;">⚡</span>
                        <h3 style="margin:0; font-size:17px; letter-spacing:0.5px; font-weight:800;">JOBWORK EXPRESS • जॉबवर्क फास्ट काउन्टर</h3>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:11.5px; background:#1e293b; color:#38bdf8; padding:5px 10px; border-radius:6px; font-weight:bold;">[F1-F4] Process | [F5] Gayi/Aayi | [F6] Source | [Enter] Next | [Ctrl+↵] Save | [Esc] Close</span>
                        <button type="button" tabindex="-1" onclick="closeJobWorkExpressModal()" style="background:transparent; border:none; color:#fff; font-size:26px; cursor:pointer; line-height:1;">&times;</button>
                    </div>
                </div>

                <!-- Body -->
                <div style="padding:16px 20px; overflow-y:auto; flex:1;">
                    
                    <!-- LEVEL 1: 4 PROCESS TABS (tabindex="-1" so Tab never jumps here!) -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:14px;">
                        <button type="button" tabindex="-1" id="jw-exp-cat-cutting" onclick="switchJobWorkCategory('cutting')" style="background:#e11d48; color:#fff; border:none; padding:13px 6px; border-radius:10px; font-weight:900; font-size:14px; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px;">
                            ✂️ 1. CUTTING [F1]
                        </button>
                        <button type="button" tabindex="-1" id="jw-exp-cat-embroidery" onclick="switchJobWorkCategory('embroidery')" style="background:#f1f5f9; color:#475569; border:1.5px solid #cbd5e1; padding:13px 6px; border-radius:10px; font-weight:900; font-size:14px; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px;">
                            🪡 2. EMBROIDERY [F2]
                        </button>
                        <button type="button" tabindex="-1" id="jw-exp-cat-calender" onclick="switchJobWorkCategory('calender')" style="background:#f1f5f9; color:#475569; border:1.5px solid #cbd5e1; padding:13px 6px; border-radius:10px; font-weight:900; font-size:14px; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px;">
                            🎛️ 3. CALENDER [F3]
                        </button>
                        <button type="button" tabindex="-1" id="jw-exp-cat-dukan" onclick="switchJobWorkCategory('dukan')" style="background:#f1f5f9; color:#475569; border:1.5px solid #cbd5e1; padding:13px 6px; border-radius:10px; font-weight:900; font-size:14px; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px;">
                            🏪 4. DUKAN [F4]
                        </button>
                    </div>

                    <!-- LEVEL 2: MOVEMENT & CLEAR STOCK SOURCE BAR -->
                    <div style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px; padding:10px 16px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <!-- F5 Len-Den Toggle -->
                        <div style="display:flex; gap:10px; align-items:center;">
                            <span style="font-size:13px; font-weight:bold; color:#334155;">लेन-देन:</span>
                            <button type="button" tabindex="-1" id="jw-exp-btn-movement" onclick="toggleMovementType()" style="background:#dc2626; color:#fff; border:none; padding:9px 18px; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">
                                📤 Saree Gayi (Bheja) [F5]
                            </button>
                        </div>

                        <!-- F6 Clear Stock Source Dropdown + Locked Badge -->
                        <div id="jw-exp-source-container" style="display:flex; gap:8px; align-items:center;">
                            <span style="font-size:13px; font-weight:bold; color:#334155;">स्टॉक सोर्स [F6]:</span>
                            <select id="jw-exp-source-select" onchange="onExpressSourceDropdownChange(this.value)" style="display:none; padding:8px 12px; border:2px solid #0284c7; border-radius:8px; font-weight:800; font-size:13px; background:#ffffff; color:#0f172a; cursor:pointer;"></select>
                            <span id="jw-exp-source-locked" style="background:#64748b; color:#fff; padding:8px 14px; border-radius:8px; font-weight:bold; font-size:13px;">
                                🥻 Fresh Godown se [Locked]
                            </span>
                        </div>

                        <!-- Active Godown -->
                        <div style="font-size:13px; color:#1e293b;">
                            🏢 <strong>गोदाम:</strong> <span style="color:#0284c7; font-weight:bold;">${esc(godamName)}</span>
                        </div>
                    </div>

                    <!-- 2-COLUMN BALANCED COUNTER LAYOUT -->
                    <div style="display:grid; grid-template-columns:1.25fr 1fr; gap:16px;">
                        
                        <!-- COLUMN 1: WORKER, DATE & LEVEL 3 BATCH LOOP -->
                        <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;">
                            
                            <!-- Worker & Date -->
                            <div style="display:flex; gap:12px; margin-bottom:14px;">
                                <div style="flex:1.7; min-width:0;">
                                    <label id="jw-exp-lbl-worker" style="font-size:12px; font-weight:bold; color:#1e3a8a; display:block; margin-bottom:4px;">
                                        Cutting Kariger:
                                    </label>
                                    <select id="jw-exp-worker" style="width:100%; box-sizing:border-box; padding:11px 12px; border:2px solid #2563eb; border-radius:8px; font-weight:bold; font-size:14px; background:#ffffff;"></select>
                                </div>
                                <div style="flex:1; min-width:0;">
                                    <label style="font-size:12px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">
                                        तारीख (Date):
                                    </label>
                                    <input type="date" id="jw-exp-date" value="${today}" style="width:100%; box-sizing:border-box; padding:10px 10px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:bold; background:#ffffff;">
                                </div>
                            </div>

                            <!-- LEVEL 3: FAST BATCH LOOP -->
                            <div style="background:#eff6ff; border:2px solid #93c5fd; padding:14px; border-radius:10px; margin-bottom:14px;">
                                <div style="font-weight:800; color:#1e40af; font-size:13px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span>📦 Batch Entry (Bunne Wale Ka Naam):</span>
                                    <span id="jw-exp-live-stock-hint" style="color:#0284c7; font-weight:bold; font-size:12px;"></span>
                                </div>

                                <!-- Box 1: Maker -->
                                <div style="margin-bottom:12px;">
                                    <label style="font-size:12px; font-weight:bold; color:#1e3a8a; display:block; margin-bottom:4px;">
                                        बुन्ने वाला (Maker) <small style="font-weight:normal; color:#64748b;">— Khali par [Enter] = Batch Poora</small>:
                                    </label>
                                    <input type="text" id="jw-exp-maker-input" list="jw-exp-maker-dl" placeholder="Maker naam likhein..." autocomplete="off" style="width:100%; box-sizing:border-box; padding:12px 14px; border:2px solid #0284c7; border-radius:8px; font-size:16px; font-weight:bold; color:#0f172a; background:#ffffff;">
                                    <datalist id="jw-exp-maker-dl"></datalist>
                                </div>

                                <!-- Box 2 (Naap) & Box 3 (Qty) & Button -->
                                <div id="jw-exp-loop-row" style="display:flex; gap:10px; align-items:flex-end;">
                                    
                                    <!-- Naap Box (Active only for Embroidery) -->
                                    <div id="jw-exp-naap-container" style="display:none; width:130px; flex-shrink:0;">
                                        <label style="font-size:12px; font-weight:bold; color:#d97706; display:block; margin-bottom:4px;">
                                            📏 Naap:
                                        </label>
                                        <input type="text" id="jw-exp-naap-input" value="${lastEnteredNaap}" placeholder="3.60" style="width:100%; box-sizing:border-box; padding:11px 8px; border:2.5px solid #d97706; border-radius:8px; font-size:18px; font-weight:900; color:#b45309; text-align:center; background:#fffbeb;">
                                    </div>

                                    <!-- Qty Box -->
                                    <div style="flex:1; min-width:120px;">
                                        <label style="font-size:12px; font-weight:bold; color:#1e3a8a; display:block; margin-bottom:4px;">
                                            Saree Qty (Pcs):
                                        </label>
                                        <input type="text" inputmode="numeric" pattern="[0-9]*" id="jw-exp-qty-input" placeholder="10 / 20" style="width:100%; box-sizing:border-box; padding:11px 14px; border:2.5px solid #0284c7; border-radius:8px; font-size:22px; font-weight:900; color:#1e3a8a; background:#ffffff; text-align:center;">
                                    </div>

                                    <!-- + Jodein Button (tabindex="-1" so Enter/Tab flows smoothly) -->
                                    <div style="flex-shrink:0;">
                                        <button type="button" tabindex="-1" id="jw-exp-add-row-btn" onclick="addExpressBatchRow()" style="background:#0284c7; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-weight:900; font-size:14px; cursor:pointer; white-space:nowrap; box-shadow:0 2px 4px rgba(2,132,199,0.3);">
                                            + Jodein [↵]
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Damage & Note Inputs (Hidden in Dukan mode) -->
                            <div id="jw-exp-damage-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <div>
                                    <label style="font-size:11px; font-weight:bold; color:#ea580c; display:block; margin-bottom:3px;">⚠️ Damage Saree (Pcs):</label>
                                    <input type="text" inputmode="numeric" id="jw-exp-damage-pcs" placeholder="0" style="width:100%; box-sizing:border-box; padding:9px 10px; border:1.5px solid #fed7aa; border-radius:6px; font-size:13px; font-weight:bold;">
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:bold; color:#dc2626; display:block; margin-bottom:3px;">Damage Fine / Kaat (₹):</label>
                                    <input type="text" inputmode="decimal" id="jw-exp-damage-amt" placeholder="0.00" style="width:100%; box-sizing:border-box; padding:9px 10px; border:1.5px solid #fecaca; border-radius:6px; font-size:13px; font-weight:bold;">
                                </div>
                            </div>

                        </div>

                        <!-- COLUMN 2: LIVE BATCH TABLE -->
                        <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <h4 style="margin:0 0 10px 0; color:#1e3a8a; font-size:14px; border-bottom:1.5px solid #cbd5e1; padding-bottom:6px; display:flex; justify-content:space-between;">
                                    <span>📋 Gatthi / Batch List</span>
                                    <span id="jw-exp-batch-count-badge" style="color:#0284c7; font-weight:bold;">0 Items</span>
                                </h4>

                                <div class="table-responsive" style="max-height:230px; overflow-y:auto; border:1.5px solid #cbd5e1; border-radius:8px;">
                                    <table style="margin:0; width:100%; border-collapse:collapse;">
                                        <thead>
                                            <tr style="background:#1e3a8a; color:white; font-size:12px;">
                                                <th style="padding:7px 5px;">#</th>
                                                <th style="padding:7px 5px;">Maker</th>
                                                <th style="padding:7px 5px;">Saree</th>
                                                <th style="padding:7px 5px; text-align:center;">Naap</th>
                                                <th style="padding:7px 5px; text-align:right;">Qty</th>
                                                <th style="padding:7px 5px; text-align:center;">Del</th>
                                            </tr>
                                        </thead>
                                        <tbody id="jw-exp-table-body"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Total Batch Summary Card -->
                            <div style="background:#f0fdf4; border:2px dashed #86efac; border-radius:10px; padding:12px; text-align:center; margin-top:12px;">
                                <div style="font-size:12px; color:#64748b; font-weight:bold;">KUL BATCH SAREE:</div>
                                <div id="jw-exp-live-batch-total" style="font-size:26px; font-weight:900; color:#15803d; margin-top:2px;">
                                    0 Pcs
                                </div>
                                <div id="jw-exp-live-batch-summary" style="font-size:12px; color:#475569; margin-top:3px;">
                                    Batch khali hai
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- LEVEL 4: BOTTOM ACTION BUTTONS -->
                <div style="background:#f1f5f9; padding:12px 20px; border-top:1.5px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div id="jw-exp-status-msg" style="font-size:13px; font-weight:bold; color:#059669;"></div>
                    <div style="display:flex; gap:10px;">
                        <button type="button" tabindex="-1" id="jw-exp-close-btn" onclick="closeJobWorkExpressModal()" style="background:#cbd5e1; color:#334155; border:none; padding:11px 16px; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">
                            ✕ [Esc] Radd
                        </button>
                        <button type="button" tabindex="-1" id="jw-exp-print-btn" onclick="printLastSavedJobWorkChallan()" style="background:#1e3a8a; color:#ffffff; border:none; padding:11px 18px; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            🖨️ [Alt+P] A6 Challan
                        </button>
                        <button type="button" id="jw-exp-submit-btn" onclick="submitMasterJobWorkExpress(true)" style="background:#15803d; color:#ffffff; border:none; padding:12px 28px; border-radius:8px; font-size:15px; font-weight:900; cursor:pointer; box-shadow:0 4px 6px rgba(21,128,61,0.3); display:inline-flex; align-items:center; gap:8px;">
                            🚀 बैच सेव व चालान [Ctrl + Enter]
                        </button>
                    </div>
                </div>

            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        bindJobWorkExpressEvents();
        updateCategoryStyles();
        populateExpressWorkers();
        updateSubBarState();
        updateExpressMakerDatalist();
        renderExpressBatchGrid();
    };

    /* ========================================================================
       5. TALLY-STYLE KEYBOARD ENGINE (FOCUS TRAP + ENTER CHAINING + F1-F6)
       ------------------------------------------------------------------------
    ======================================================================== */
    const getOrderedFocusableInputs = () => {
        const ids = [
            'jw-exp-worker',
            'jw-exp-date',
            'jw-exp-source-select',
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

    const focusFirstField = (targetId = 'jw-exp-worker') => {
        setTimeout(() => {
            const el = document.getElementById(targetId);
            if (el && el.offsetParent !== null) {
                el.focus();
                if (typeof el.select === 'function') el.select();
            } else {
                const list = getOrderedFocusableInputs();
                if (list.length) list[0].focus();
            }
        }, 60);
    };

    const focusAfterDate = () => {
        const srcSel = document.getElementById('jw-exp-source-select');
        if (srcSel && srcSel.offsetParent !== null && getComputedStyle(srcSel).display !== 'none') {
            srcSel.focus();
            return;
        }
        const mInp = document.getElementById('jw-exp-maker-input');
        if (mInp) { mInp.focus(); mInp.select(); }
    };

    const bindJobWorkExpressEvents = () => {
        const modal = document.getElementById('master-jobwork-express-modal');
        if (!modal) return;

        const workerEl = document.getElementById('jw-exp-worker');
        const dateEl = document.getElementById('jw-exp-date');
        const sourceEl = document.getElementById('jw-exp-source-select');
        const makerInp = document.getElementById('jw-exp-maker-input');
        const naapInp = document.getElementById('jw-exp-naap-input');
        const qtyInp = document.getElementById('jw-exp-qty-input');
        const dmgPcsInp = document.getElementById('jw-exp-damage-pcs');
        const dmgAmtInp = document.getElementById('jw-exp-damage-amt');
        const submitBtn = document.getElementById('jw-exp-submit-btn');

        focusFirstField('jw-exp-worker');

        if (workerEl) {
            workerEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (dateEl) { dateEl.focus(); }
                }
            });
        }

        if (dateEl) {
            dateEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    focusAfterDate();
                }
            });
        }

        if (sourceEl) {
            sourceEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (makerInp) { makerInp.focus(); makerInp.select(); }
                }
            });
        }

        if (makerInp) {
            makerInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = makerInp.value.trim();
                    if (val) {
                        if (activeCategory === 'embroidery' && naapInp) {
                            naapInp.focus();
                            naapInp.select();
                        } else if (qtyInp) {
                            qtyInp.focus();
                            qtyInp.select();
                        }
                    } else if (expressBatchItems.length > 0) {
                        // Tally "End of List": khali Maker par Enter -> Damage/Save par jaye
                        if (activeCategory !== 'dukan' && dmgPcsInp && dmgPcsInp.offsetParent !== null) {
                            dmgPcsInp.focus();
                            dmgPcsInp.select();
                        } else if (submitBtn) {
                            submitBtn.focus();
                        }
                    }
                }
            });
            makerInp.addEventListener('input', updateMakerLiveStockDisplay);
        }

        if (naapInp) {
            naapInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (naapInp.value.trim()) lastEnteredNaap = naapInp.value.trim();
                    if (qtyInp) {
                        qtyInp.focus();
                        qtyInp.select();
                    }
                }
            });
        }

        if (qtyInp) {
            qtyInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addExpressBatchRow();
                }
            });
        }

        if (dmgPcsInp) {
            dmgPcsInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (dmgAmtInp) { dmgAmtInp.focus(); dmgAmtInp.select(); }
                }
            });
        }

        if (dmgAmtInp) {
            dmgAmtInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (submitBtn) submitBtn.focus();
                }
            });
        }

        window.removeEventListener('keydown', handleJobWorkExpressGlobalKeydown, true);
        window.addEventListener('keydown', handleJobWorkExpressGlobalKeydown, true);
    };

    const handleJobWorkExpressGlobalKeydown = (e) => {
        const modal = document.getElementById('master-jobwork-express-modal');
        if (!modal || modal.style.display === 'none') return;

        // STRICT MODAL TAB TRAP (Tab kabhi header buttons ya background page par nahi jayega)
        if (e.key === 'Tab') {
            const list = getOrderedFocusableInputs();
            if (!list.length) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const curIdx = list.indexOf(document.activeElement);
            let nextIdx = 0;
            if (curIdx === -1) {
                nextIdx = 0;
            } else if (e.shiftKey) {
                nextIdx = (curIdx - 1 + list.length) % list.length;
            } else {
                nextIdx = (curIdx + 1) % list.length;
            }
            const nextEl = list[nextIdx];
            if (nextEl) {
                nextEl.focus();
                if (typeof nextEl.select === 'function') nextEl.select();
            }
            return;
        }

        // [Esc] -> Close
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            closeJobWorkExpressModal();
            return;
        }

        // [F1] -> CUTTING
        if (e.key === 'F1' || (e.altKey && (e.key === '1' || e.code === 'Digit1'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            switchJobWorkCategory('cutting');
            return;
        }

        // [F2] -> EMBROIDERY
        if (e.key === 'F2' || (e.altKey && (e.key === '2' || e.code === 'Digit2'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            switchJobWorkCategory('embroidery');
            return;
        }

        // [F3] -> CALENDER
        if (e.key === 'F3' || (e.altKey && (e.key === '3' || e.code === 'Digit3'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            switchJobWorkCategory('calender');
            return;
        }

        // [F4] -> DUKAN
        if (e.key === 'F4' || (e.altKey && (e.key === '4' || e.code === 'Digit4'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            switchJobWorkCategory('dukan');
            return;
        }

        // [F5] -> TOGGLE MOVEMENT (Saree Gayi ⟷ Wapas Aayi)
        if (e.key === 'F5' || (e.altKey && (e.key === '5' || e.code === 'Digit5'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleMovementType();
            return;
        }

        // [F6] -> SMART STOCK SOURCE SWITCH
        if (e.key === 'F6' || (e.altKey && (e.key === '6' || e.code === 'Digit6'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleStockSource();
            return;
        }

        // [Ctrl + Enter] -> Save Batch
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            submitMasterJobWorkExpress(true);
            return;
        }

        // [Alt + P] -> Print Challan
        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
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
       6. LEVEL 1 & 2 SWITCHES (WITH ZERO-MIX GUARD)
       ------------------------------------------------------------------------
    ======================================================================== */
    const confirmClearBatchIfNeeded = (actionLabel) => {
        if (expressBatchItems.length === 0) return true;
        const ok = confirm(`Batch list mein ${expressBatchItems.length} item pehle se jode hue hain.\n${actionLabel} badalne par purani list clear ho jayegi taaki maal mix na ho.\n\nAage badhein?`);
        if (ok) {
            expressBatchItems = [];
            renderExpressBatchGrid();
        }
        return ok;
    };

    window.switchJobWorkCategory = (cat) => {
        if (cat === activeCategory) return;
        if (!confirmClearBatchIfNeeded('Process')) return;

        activeCategory = cat;
        movementType = 'gayi';
        stockSource = getDefaultSourceForCategory(cat);

        updateCategoryStyles();
        populateExpressWorkers();
        updateSubBarState();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();
        focusFirstField('jw-exp-worker');
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

    window.toggleStockSource = () => {
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
    };

    window.toggleMovementType = () => {
        if (activeCategory === 'dukan') return;
        if (!confirmClearBatchIfNeeded('Len-Den (Gayi/Aayi)')) return;

        movementType = (movementType === 'gayi') ? 'aayi' : 'gayi';
        updateSubBarState();
        updateExpressMakerDatalist();
        updateMakerLiveStockDisplay();
    };

    const updateCategoryStyles = () => {
        const btnCut = document.getElementById('jw-exp-cat-cutting');
        const btnEmb = document.getElementById('jw-exp-cat-embroidery');
        const btnCal = document.getElementById('jw-exp-cat-calender');
        const btnDuk = document.getElementById('jw-exp-cat-dukan');

        [btnCut, btnEmb, btnCal, btnDuk].forEach((b) => {
            if (b) {
                b.style.background = '#f1f5f9';
                b.style.color = '#475569';
                b.style.border = '1.5px solid #cbd5e1';
                b.style.boxShadow = 'none';
            }
        });

        if (activeCategory === 'cutting' && btnCut) {
            btnCut.style.background = '#e11d48'; btnCut.style.color = '#fff'; btnCut.style.border = 'none';
            btnCut.style.boxShadow = '0 3px 6px rgba(225,29,72,0.25)';
        } else if (activeCategory === 'embroidery' && btnEmb) {
            btnEmb.style.background = '#d97706'; btnEmb.style.color = '#fff'; btnEmb.style.border = 'none';
            btnEmb.style.boxShadow = '0 3px 6px rgba(217,119,6,0.25)';
        } else if (activeCategory === 'calender' && btnCal) {
            btnCal.style.background = '#0284c7'; btnCal.style.color = '#fff'; btnCal.style.border = 'none';
            btnCal.style.boxShadow = '0 3px 6px rgba(2,132,199,0.25)';
        } else if (activeCategory === 'dukan' && btnDuk) {
            btnDuk.style.background = '#15803d'; btnDuk.style.color = '#fff'; btnDuk.style.border = 'none';
            btnDuk.style.boxShadow = '0 3px 6px rgba(21,128,61,0.25)';
        }

        const naapBox = document.getElementById('jw-exp-naap-container');
        if (naapBox) {
            naapBox.style.display = (activeCategory === 'embroidery') ? 'block' : 'none';
        }

        const dmgRow = document.getElementById('jw-exp-damage-row');
        if (dmgRow) {
            dmgRow.style.display = (activeCategory === 'dukan') ? 'none' : 'grid';
        }
    };

    const updateSubBarState = () => {
        const btnMov = document.getElementById('jw-exp-btn-movement');
        const srcContainer = document.getElementById('jw-exp-source-container');
        const srcSelect = document.getElementById('jw-exp-source-select');
        const srcLocked = document.getElementById('jw-exp-source-locked');
        const lblWorker = document.getElementById('jw-exp-lbl-worker');

        if (btnMov) {
            if (activeCategory === 'dukan') {
                movementType = 'gayi';
                btnMov.style.background = '#15803d';
                btnMov.innerHTML = '🏪 Dukan Bheja (Final Out)';
            } else if (movementType === 'gayi') {
                btnMov.style.background = '#dc2626';
                btnMov.innerHTML = '📤 Saree Gayi (Bheja) [F5]';
            } else {
                btnMov.style.background = '#059669';
                btnMov.innerHTML = '📥 Wapas Aayi (Tayyar) [F5]';
            }
        }

        if (srcContainer && srcSelect && srcLocked) {
            if (activeCategory === 'dukan' || movementType !== 'gayi') {
                srcContainer.style.display = 'none';
                srcSelect.style.display = 'none';
                srcLocked.style.display = 'none';
            } else if (activeCategory === 'cutting') {
                srcContainer.style.display = 'flex';
                srcSelect.style.display = 'none';
                srcLocked.style.display = 'inline-block';
                srcLocked.textContent = '🥻 Fresh Godown se [Locked]';
            } else if (activeCategory === 'embroidery') {
                srcContainer.style.display = 'flex';
                srcLocked.style.display = 'none';
                srcSelect.style.display = 'inline-block';
                srcSelect.style.borderColor = '#d97706';
                srcSelect.innerHTML = `
                    <option value="fresh">🥻 Fresh Godown Stock se</option>
                    <option value="cutting">✂️ Cutting Stock se</option>
                `;
                if (stockSource !== 'fresh' && stockSource !== 'cutting') stockSource = 'fresh';
                srcSelect.value = stockSource;
            } else if (activeCategory === 'calender') {
                srcContainer.style.display = 'flex';
                srcLocked.style.display = 'none';
                srcSelect.style.display = 'inline-block';
                srcSelect.style.borderColor = '#0284c7';
                srcSelect.innerHTML = `
                    <option value="cutting">✂️ Cutting Stock se</option>
                    <option value="embroidery">🪡 Embroidery Stock se</option>
                    <option value="fresh">🥻 Fresh Godown Stock se</option>
                `;
                if (!['cutting', 'embroidery', 'fresh'].includes(stockSource)) stockSource = 'cutting';
                srcSelect.value = stockSource;
            }
        }

        if (lblWorker) {
            if (activeCategory === 'dukan') lblWorker.textContent = 'Dukan / Receiver:';
            else if (activeCategory === 'cutting') lblWorker.textContent = 'Cutting Kariger:';
            else if (activeCategory === 'embroidery') lblWorker.textContent = 'Embroidery Kariger:';
            else lblWorker.textContent = 'Calender Kariger:';
        }
    };

    const populateExpressWorkers = () => {
        const wSel = document.getElementById('jw-exp-worker');
        if (!wSel) return;

        wSel.innerHTML = '';
        if (activeCategory === 'dukan') {
            wSel.innerHTML = '<option value="dukan_main">🏪 Apni Main Dukan</option><option value="dukan_party">🏪 Party / Retailer</option>';
            return;
        }

        const allWorkers = toArray(getFromStore('jobwork_workers'));
        const filtered = allWorkers.filter((w) => String(w?.type || '').toLowerCase().trim() === activeCategory);

        if (!filtered.length) {
            wSel.innerHTML = `<option value="">-- Koi ${activeCategory.toUpperCase()} Kariger nahi hai --</option>`;
            return;
        }

        filtered.forEach((w) => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = `${w.name}${w.mobile ? ` (${w.mobile})` : ''}`;
            wSel.appendChild(opt);
        });
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
            hint.textContent = `(${effStage.toUpperCase()} Stock: ${info.bachi} Pcs [${info.saree}])`;
        } else {
            hint.textContent = '';
        }
    };

    /* ========================================================================
       7. LEVEL 3: BATCH ROW BUILDER
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
            alert('कृपया बुन्ने वाले कारीगर का नाम चुनिए!');
            mInp?.focus();
            return;
        }

        if (qty <= 0) {
            alert('कृपया सही साड़ी संख्या (Qty Pcs) भरिए!');
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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:#888;">Gatthi khali hai. Maker likhkar [Enter] dabayein.</td></tr>';
            if (totalDisp) totalDisp.textContent = '0 Pcs';
            if (summaryDisp) summaryDisp.textContent = 'Batch khali hai';
            if (badge) badge.textContent = '0 Items';
            return;
        }

        expressBatchItems.forEach((it, idx) => {
            total += it.qty;
            html += `<tr>
                <td style="padding:6px 4px;">${idx + 1}</td>
                <td style="padding:6px 4px; font-weight:bold;">${esc(it.maker)}</td>
                <td style="padding:6px 4px;">${esc(it.saree)}</td>
                <td style="padding:6px 4px; text-align:center; color:#d97706; font-weight:bold;">${it.naap ? esc(it.naap) : '-'}</td>
                <td style="padding:6px 4px; text-align:right; font-weight:800; color:#1e3a8a;">${it.qty} Pcs</td>
                <td style="padding:6px 4px; text-align:center;">
                    <button type="button" tabindex="-1" onclick="removeExpressBatchItem(${idx})" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:4px; padding:2px 6px; cursor:pointer; font-weight:bold;">✕</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if (totalDisp) totalDisp.textContent = `${total} Pcs`;
        if (summaryDisp) summaryDisp.textContent = `Kul ${expressBatchItems.length} Karigaron ki gatthi`;
        if (badge) badge.textContent = `${expressBatchItems.length} Kariger`;
    };

    /* ========================================================================
       8. ATOMIC COMMIT (AUTO-MONTH SHEET CREATION & CARRY-FORWARD BALANCE)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.submitMasterJobWorkExpress = (doPrint = false) => {
        const wSel = document.getElementById('jw-exp-worker');
        const dInp = document.getElementById('jw-exp-date');

        const workerId = wSel?.value;
        if (!workerId) {
            alert('कृपया जॉब वर्कर का चुनाव करें!');
            wSel?.focus();
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
            alert('बैच में कम से कम 1 कारीगर की साड़ी जोड़िए!');
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
            statusMsg.innerHTML = `✅ ${totQty} Pcs साड़ी बैच [${esc(workerName)}] के खाते में दर्ज हो गया!`;
        }

        focusFirstField('jw-exp-maker-input');
    };

    /* ========================================================================
       9. A6 THERMAL CHALLAN PRINT ENGINE (WITH NAAP 3.60)
       ------------------------------------------------------------------------
    ======================================================================== */
    window.printLastSavedJobWorkChallan = () => {
        if (!lastSavedExpressBatch || !lastSavedExpressBatch.items.length) {
            return alert('प्रिंट करने के लिए कोई रीसेंट बैच एंट्री नहीं मिली!');
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
       10. GLOBAL EXPORT
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
