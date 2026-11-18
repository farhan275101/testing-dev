/* ============================================================================
   SIMPLICITY ERP - TANI ORDER EXPRESS ENGINE (TALLYPRIME WHITE & GOLD)
   Folder: tani / File: tani-express.js • Developed for: Farhan Jawed
   Layout:
   - Top-Left: Order Details (Zero Native Dropdowns, Zero Number Spinners)
   - Top-Right: Live Contextual Picker (Karigers / Sanchas / Rangi / Learned Colors)
   - Bottom Full-Width: Compact 2x4 8-Colors Matching Matrix + Contrast Strip
   - Tally Accept Bar: Save & Print [Y/Enter] | Only Save [S] | Edit [N/Esc]
   - 100% Preserved: Sancha Portal Sync, Tani Order List, Urdu A6 Print & WhatsApp
============================================================================ */

(() => {
    'use strict';

    let lastSavedTaniExpressOrder = null;

    // Contextual Picker State
    let activePickerKind = 'kariger'; // 'kariger' | 'sancha' | 'rangi' | 'color' | 'summary'
    let activeTargetInputId = 'texp-kariger';
    let pickerFilteredItems = [];
    let pickerSelectedIdx = 0;
    let pickerNavigated = false;

    /* ========================================================================
       1. SAFE SANITIZATION & STORAGE BRIDGES
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
        } catch (_) {
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

    const safeInt = (val, fallback = 0) => {
        const n = parseInt(val, 10);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const safeNum = (val, fallback = 0) => {
        const n = parseFloat(val);
        return isNaN(n) || !isFinite(n) ? fallback : n;
    };

    const getToday = () => {
        let rawDate = (typeof window.getTodayDate === 'function')
            ? window.getTodayDate()
            : new Date().toISOString().split('T')[0];

        if (typeof rawDate === 'string' && rawDate.includes('-')) {
            const parts = rawDate.split('-');
            if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        return rawDate || new Date().toISOString().split('T')[0];
    };

    const formatDisplay = (d) => {
        return (typeof window.formatDateDisplay === 'function')
            ? window.formatDateDisplay(d)
            : (d || '-');
    };

    /* ========================================================================
       2. REPOSITORY, AUTO SERIAL (#1) & LEARNED MEMORY LISTS
       ======================================================================== */
    const getTaniOrders = () => toArray(getFromStore('tani_orders_list'));

    const getNextParchiNumber = () => {
        const list = getTaniOrders();
        if (!list.length) return '1';
        let maxNum = 0;
        list.forEach((item) => {
            const n = safeInt(item.orderNo);
            if (n > maxNum) maxNum = n;
        });
        return String(maxNum + 1);
    };

    const getLearnedColors = () => {
        const stored = toArray(getFromStore('tani_learned_colors'));
        const orders = getTaniOrders();
        const colorsSet = new Set(stored.map(c => String(c).trim()).filter(Boolean));

        orders.forEach(o => {
            if (o.border) colorsSet.add(String(o.border).trim());
            if (o.bana) colorsSet.add(String(o.bana).trim());
            if (Array.isArray(o.matchingTable)) {
                o.matchingTable.forEach(row => {
                    if (row.saree) colorsSet.add(String(row.saree).trim());
                    if (row.border) colorsSet.add(String(row.border).trim());
                    if (row.bana) colorsSet.add(String(row.bana).trim());
                });
            }
        });

        return Array.from(colorsSet).sort((a, b) => a.localeCompare(b));
    };

    const saveNewLearnedColors = (newColors = []) => {
        if (!newColors.length) return;
        const current = getLearnedColors();
        const updatedSet = new Set([...current, ...newColors.map(c => String(c).trim()).filter(Boolean)]);
        setToStore('tani_learned_colors', Array.from(updatedSet));
    };

    const getPickerDataset = (kind) => {
        if (kind === 'kariger') {
            return toArray(getFromStore('kariger_list'))
                .filter(k => k && k.name && String(k.name).trim())
                .map(k => ({
                    value: String(k.name).trim(),
                    label: String(k.name).trim(),
                    sub: [k.saree, k.mohalla || k.address].filter(Boolean).join(' · ') || 'Kariger',
                    mohalla: String(k.mohalla || k.address || k.pata || '').trim()
                }));
        }

        if (kind === 'sancha') {
            const sanchaItems = toArray(getFromStore('sancha_items'))
                .filter(s => (s?.category || 'tani').toLowerCase() === 'tani');
            const map = new Map();
            sanchaItems.forEach(s => {
                const nm = String(s?.name || '').trim();
                if (!nm) return;
                const bacha = safeNum(s.bacha !== undefined ? s.bacha : s.aaya);
                map.set(nm.toLowerCase(), {
                    value: nm,
                    label: nm,
                    sub: `${bacha.toFixed(1)} Kg`
                });
            });
            getTaniOrders().forEach(o => {
                const nm = String(o?.sancha || '').trim();
                if (nm && !map.has(nm.toLowerCase())) {
                    map.set(nm.toLowerCase(), { value: nm, label: nm, sub: 'Past Order' });
                }
            });
            return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
        }

        if (kind === 'rangi') {
            const learned = toArray(getFromStore('tani_learned_rangi'));
            const set = new Set([
                ...learned.map(r => String(r || '').trim()).filter(Boolean),
                ...getTaniOrders().map(o => String(o?.rangi || '').trim()).filter(Boolean)
            ]);
            return Array.from(set)
                .sort((a, b) => a.localeCompare(b))
                .map(r => ({ value: r, label: r, sub: 'Dyer / Rangi' }));
        }

        if (kind === 'color') {
            return getLearnedColors().map(c => ({
                value: c,
                label: c,
                sub: 'Saved Color'
            }));
        }

        return [];
    };

    const sortAndFilterPickerItems = (items, query) => {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return items;
        const prefix = [];
        const substr = [];
        items.forEach(it => {
            const hay = `${it.label} ${it.sub || ''}`.toLowerCase();
            if (it.label.toLowerCase().startsWith(q)) prefix.push(it);
            else if (hay.includes(q)) substr.push(it);
        });
        return [...prefix, ...substr];
    };

    const renderContextualPicker = (kind, inputId, queryText = '') => {
        activePickerKind = kind;
        activeTargetInputId = inputId;

        const titleEl = document.getElementById('texp-picker-title');
        const hintEl = document.getElementById('texp-picker-hint');
        const listEl = document.getElementById('texp-picker-list');
        if (!titleEl || !listEl) return;

        const titleMap = {
            kariger: 'List of Karigers',
            sancha: 'List of Sanchas',
            rangi: 'List of Rangi / Dyers',
            color: 'Learned Colors',
            summary: 'Parchi Snapshot'
        };
        titleEl.textContent = titleMap[kind] || 'Picker';

        if (kind === 'summary') {
            if (hintEl) hintEl.textContent = '[Enter] Next';
            const kName = document.getElementById('texp-kariger')?.value || '-';
            const sName = document.getElementById('texp-sancha')?.value || '-';
            const rName = document.getElementById('texp-rangi')?.value || '-';
            const mtr = document.getElementById('texp-meter')?.value || '0';
            const pcs = document.getElementById('texp-pcs')?.value || '0';
            const paai = document.getElementById('texp-paai')?.value || '-';
            const brd = document.getElementById('texp-border')?.value || '-';
            const bana = document.getElementById('texp-bana')?.value || '-';

            listEl.innerHTML = `
                <div style="padding:10px 12px; font-size:12px; line-height:1.7; color:#374151;">
                    <div><strong>Kariger :</strong> <span style="color:#92400e;">${esc(kName)}</span></div>
                    <div><strong>Sancha :</strong> ${esc(sName)}</div>
                    <div><strong>Rangi :</strong> ${esc(rName)}</div>
                    <div><strong>Meter / Pcs :</strong> ${esc(mtr)} Mtr · <strong style="color:#b47d00;">${esc(pcs)} Pcs</strong></div>
                    <div><strong>Paai / Border :</strong> ${esc(paai)} · ${esc(brd)}</div>
                    <div><strong>Bana Spec :</strong> ${esc(bana)}</div>
                    <div style="margin-top:8px; padding-top:6px; border-top:1px dashed #e5d5a7; font-size:11px; color:#6b7280;">
                        Tip: Kisi bhi Color box me pehla akshar type karein (jaise <strong>R</strong>), learned colors turant aa jayenge. <strong>[Ctrl+Enter]</strong> se seedha Save bar khulega.
                    </div>
                </div>
            `;
            pickerFilteredItems = [];
            return;
        }

        if (hintEl) hintEl.textContent = '↑ ↓ + Enter';

        const rawItems = getPickerDataset(kind);
        pickerFilteredItems = sortAndFilterPickerItems(rawItems, queryText);
        if (pickerSelectedIdx >= pickerFilteredItems.length) pickerSelectedIdx = 0;
        if (pickerSelectedIdx < 0) pickerSelectedIdx = 0;

        if (!pickerFilteredItems.length) {
            listEl.innerHTML = `
                <div style="padding:14px 12px; text-align:center; font-size:12px; color:#6b7280;">
                    ${queryText ? `<strong>"${esc(queryText)}"</strong> naya naam hai — [Enter] dabakar aage badhein (auto-save ho jayega).` : 'Koi saved record nahi mila.'}
                </div>
            `;
            return;
        }

        listEl.innerHTML = pickerFilteredItems.map((it, idx) => `
            <div class="texp-pick-row${idx === pickerSelectedIdx ? ' active' : ''}" data-pidx="${idx}">
                <span class="texp-pick-lbl">${esc(it.label)}</span>
                <small class="texp-pick-sub">${esc(it.sub || '')}</small>
            </div>
        `).join('');

        listEl.querySelectorAll('.texp-pick-row').forEach((row) => {
            row.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                const idx = parseInt(row.dataset.pidx, 10);
                if (!isNaN(idx)) applyPickerSelection(idx, true);
            });
        });

        const activeRow = listEl.querySelector('.texp-pick-row.active');
        activeRow?.scrollIntoView({ block: 'nearest' });
    };

    const applyPickerSelection = (idx, advanceFocus = true) => {
        const chosen = pickerFilteredItems[idx];
        const inp = document.getElementById(activeTargetInputId);
        if (!chosen || !inp) return false;

        inp.value = chosen.value;
        if (activeTargetInputId === 'texp-kariger') {
            const mohEl = document.getElementById('texp-mohalla');
            if (mohEl) mohEl.value = chosen.mohalla || '';
        }

        pickerNavigated = false;

        if (advanceFocus) {
            const nextId = inp.getAttribute('data-next');
            if (nextId === 'texp-accept-bar') {
                showTaniAcceptBar(true);
            } else if (nextId) {
                const nxt = document.getElementById(nextId);
                if (nxt) {
                    nxt.focus();
                    if (typeof nxt.select === 'function') nxt.select();
                }
            }
        }
        return true;
    };

    const showTaniAcceptBar = (show) => {
        const bar = document.getElementById('texp-accept-bar');
        if (!bar) return;
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            document.getElementById('texp-accept-print-btn')?.focus();
        }
    };

    const hideTaniAcceptBarToEdit = () => {
        showTaniAcceptBar(false);
        const target = document.getElementById('texp-col-saree-1') || document.getElementById('texp-kariger');
        if (target) { target.focus(); target.select?.(); }
    };

    /* ========================================================================
       3. OPEN TANI EXPRESS MODAL (TALLYPRIME WHITE & GOLD 2-COL + 2x4 MATRIX)
       ======================================================================== */
    window.openTaniExpressModal = () => {
        const existing = document.getElementById('master-tani-express-modal');
        if (existing) existing.remove();

        const today = getToday();
        const nextOrderNo = getNextParchiNumber();

        const build4ColorRows = (startIdx, endIdx) => {
            let html = '';
            for (let i = startIdx; i <= endIdx; i++) {
                const nextSaree = `texp-col-border-${i}`;
                const nextBorder = `texp-col-bana-${i}`;
                const nextBana = (i === 8) ? 'texp-accept-bar' : `texp-col-saree-${i + 1}`;
                html += `
                <tr>
                    <td class="texp-td-num">${i}</td>
                    <td><input type="text" id="texp-col-saree-${i}" class="texp-c-inp" data-picker="color" data-next="${nextSaree}" autocomplete="off"></td>
                    <td><input type="text" id="texp-col-border-${i}" class="texp-c-inp" data-picker="color" data-next="${nextBorder}" autocomplete="off"></td>
                    <td><input type="text" id="texp-col-bana-${i}" class="texp-c-inp" data-picker="color" data-next="${nextBana}" autocomplete="off"></td>
                </tr>`;
            }
            return html;
        };

        const modalHtml = `
        <div id="master-tani-express-modal" class="texp-overlay">
            <style>
                .texp-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(31, 41, 55, 0.42);
                    backdrop-filter: blur(2px);
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px;
                    box-sizing: border-box;
                    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
                }
                .texp-dialog {
                    background: #ffffff;
                    width: 100%;
                    max-width: 980px;
                    border: 1.5px solid #d9b86c;
                    border-radius: 8px;
                    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.22);
                    overflow: hidden;
                    max-height: 95vh;
                    max-height: 95dvh;
                    display: flex;
                    flex-direction: column;
                    color: #1f2937;
                }
                .texp-dialog * { box-sizing: border-box; }
                .texp-header {
                    background: #fdf6e2;
                    border-bottom: 1.5px solid #e5d5a7;
                    padding: 9px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                    flex-shrink: 0;
                }
                .texp-header-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .texp-header-left h3 {
                    margin: 0;
                    font-size: 15.5px;
                    font-weight: 800;
                    color: #1f2937;
                }
                .texp-parchi-pill {
                    background: #f2b71d;
                    color: #1f2937;
                    border: 1px solid #d9a425;
                    border-radius: 4px;
                    padding: 2px 9px;
                    font-size: 12px;
                    font-weight: 800;
                }
                .texp-btn-plain {
                    background: #ffffff;
                    color: #374151;
                    border: 1px solid #d1d5db;
                    border-radius: 5px;
                    padding: 5px 11px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .texp-btn-plain:hover {
                    border-color: #d9a425;
                    background: #fef9ea;
                    color: #1f2937;
                }
                .texp-btn-gold {
                    background: #f2b71d;
                    color: #1f2937;
                    border: 1px solid #d9a425;
                    border-radius: 5px;
                    padding: 6px 14px;
                    font-size: 12.5px;
                    font-weight: 800;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .texp-btn-gold:hover,
                .texp-btn-gold:focus {
                    background: #e5aa12;
                    outline: 2px solid #92400e;
                }
                .texp-body {
                    padding: 12px 14px;
                    overflow-y: auto;
                    flex: 1;
                    background: #ffffff;
                }
                .texp-top-split {
                    display: grid;
                    grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.9fr);
                    gap: 12px;
                    margin-bottom: 10px;
                    align-items: stretch;
                }
                .texp-left-form {
                    background: #ffffff;
                    border: 1px solid #e5d5a7;
                    border-radius: 6px;
                    padding: 10px 12px;
                }
                .texp-sec-lbl {
                    font-size: 10.5px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                    color: #92400e;
                    margin: 0 0 7px 0;
                    padding-bottom: 4px;
                    border-bottom: 1px solid #fdf6e2;
                }
                .texp-row-1 {
                    display: grid;
                    grid-template-columns: 112px minmax(0, 1fr);
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .texp-row-2 {
                    display: grid;
                    grid-template-columns: 112px minmax(0, 1fr) 72px minmax(0, 1fr);
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .texp-row-3 {
                    display: grid;
                    grid-template-columns: 112px minmax(0, 1fr) 72px minmax(0, 1fr) 52px minmax(0, 0.8fr);
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                }
                .texp-left-form label {
                    font-size: 11.5px;
                    font-weight: 700;
                    color: #374151;
                    white-space: nowrap;
                }
                .texp-inp {
                    width: 100%;
                    min-width: 0;
                    height: 30px;
                    padding: 4px 8px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 12.5px;
                    font-weight: 700;
                    color: #111827;
                    background: #ffffff;
                    outline: none;
                }
                .texp-inp:focus {
                    border-color: #d9a425;
                    background: #fffdf5;
                    box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.22);
                }
                .texp-right-picker {
                    background: #fdfcf7;
                    border: 1.5px solid #d9b86c;
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    min-height: 224px;
                    max-height: 248px;
                }
                .texp-picker-head {
                    background: #fdf6e2;
                    border-bottom: 1.5px solid #e5d5a7;
                    padding: 7px 11px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .texp-picker-head strong {
                    font-size: 12.5px;
                    font-weight: 800;
                    color: #1f2937;
                }
                .texp-picker-head small {
                    font-size: 11px;
                    font-weight: 700;
                    color: #92400e;
                }
                .texp-picker-list {
                    overflow-y: auto;
                    flex: 1;
                }
                .texp-pick-row {
                    padding: 6px 11px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                    font-size: 12.5px;
                    border-bottom: 1px solid #f3f4f6;
                    cursor: pointer;
                }
                .texp-pick-row:hover { background: #fef9ea; }
                .texp-pick-row.active {
                    background: #f2b71d;
                    color: #1f2937;
                }
                .texp-pick-lbl { font-weight: 700; }
                .texp-pick-sub { font-size: 11px; color: #6b7280; font-weight: 600; }
                .texp-pick-row.active .texp-pick-sub { color: #1f2937; }

                /* --- BOTTOM 8-COLORS COMPACT 2x4 MATRIX --- */
                .texp-colors-card {
                    border: 1px solid #e5d5a7;
                    border-radius: 6px;
                    overflow: hidden;
                    background: #ffffff;
                }
                .texp-colors-head {
                    background: #fdf6e2;
                    border-bottom: 1px solid #e5d5a7;
                    padding: 6px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .texp-colors-head strong {
                    font-size: 12px;
                    font-weight: 800;
                    color: #1f2937;
                }
                .texp-contrast-inline {
                    display: flex;
                    gap: 14px;
                    align-items: center;
                    flex-wrap: wrap;
                    font-size: 11.5px;
                    font-weight: 700;
                    color: #374151;
                }
                .texp-contrast-inline label {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    cursor: pointer;
                }
                .texp-matrix-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    padding: 8px 10px;
                }
                .texp-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                    border: 1px solid #e5d5a7;
                }
                .texp-table th {
                    background: #fdfcf7;
                    color: #92400e;
                    font-size: 11px;
                    font-weight: 800;
                    padding: 5px 4px;
                    border-bottom: 1px solid #e5d5a7;
                    text-align: center;
                }
                .texp-table td {
                    padding: 2px;
                    border-bottom: 1px solid #f3f4f6;
                }
                .texp-td-num {
                    width: 24px;
                    text-align: center;
                    font-size: 11.5px;
                    font-weight: 800;
                    color: #92400e;
                    background: #fdf6e2;
                }
                .texp-c-inp {
                    width: 100%;
                    height: 27px;
                    padding: 3px 6px;
                    border: 1px solid #d1d5db;
                    border-radius: 3px;
                    font-size: 12px;
                    font-weight: 700;
                    color: #111827;
                    background: #ffffff;
                    outline: none;
                }
                .texp-c-inp:focus {
                    border-color: #d9a425;
                    background: #fffdf5;
                    box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.22);
                }

                /* --- ACCEPT BAR & FOOTER --- */
                .texp-accept-bar {
                    margin-top: 9px;
                    background: #fdf6e2;
                    border: 1.5px solid #d9a425;
                    border-radius: 6px;
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .texp-footer {
                    background: #fdf6e2;
                    border-top: 1.5px solid #e5d5a7;
                    padding: 8px 14px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                    flex-shrink: 0;
                }
                .texp-footer-actions {
                    display: flex;
                    gap: 7px;
                    flex-wrap: wrap;
                    align-items: center;
                }

                @media (max-width: 840px) {
                    .texp-top-split { grid-template-columns: 1fr; }
                    .texp-matrix-grid { grid-template-columns: 1fr; }
                    .texp-row-2, .texp-row-3 { grid-template-columns: 100px minmax(0, 1fr); }
                }
            </style>

            <div class="texp-dialog">
                <div class="texp-header">
                    <div class="texp-header-left">
                        <h3>Tani Order Voucher</h3>
                        <span class="texp-parchi-pill" id="texp-parchi-badge">Parchi #${nextOrderNo}</span>
                    </div>
                    <button type="button" class="texp-btn-plain" onclick="closeTaniExpressModal()">← [Esc] Back</button>
                </div>

                <div class="texp-body">
                    <div class="texp-top-split">
                        <!-- TOP-LEFT: ORDER DETAILS -->
                        <div class="texp-left-form">
                            <div class="texp-sec-lbl">Order &amp; Loom Specifications</div>

                            <div class="texp-row-2">
                                <label for="texp-order-no">Parchi No :</label>
                                <input type="text" id="texp-order-no" class="texp-inp" value="${nextOrderNo}" readonly style="background:#fdf6e2; border-color:#d9b86c; color:#92400e; text-align:center; cursor:not-allowed;">
                                <label for="texp-order-date">Date :</label>
                                <input type="date" id="texp-order-date" class="texp-inp" value="${today}" data-picker="summary" data-next="texp-kariger">
                            </div>

                            <div class="texp-row-1">
                                <label for="texp-kariger">Kariger :</label>
                                <input type="text" id="texp-kariger" class="texp-inp" data-picker="kariger" data-next="texp-mohalla" autocomplete="off">
                            </div>

                            <div class="texp-row-1">
                                <label for="texp-mohalla">Mohalla :</label>
                                <input type="text" id="texp-mohalla" class="texp-inp" data-picker="summary" data-next="texp-sancha" autocomplete="off">
                            </div>

                            <div class="texp-row-2">
                                <label for="texp-sancha">Sancha :</label>
                                <input type="text" id="texp-sancha" class="texp-inp" data-picker="sancha" data-next="texp-rangi" autocomplete="off">
                                <label for="texp-rangi">Rangi :</label>
                                <input type="text" id="texp-rangi" class="texp-inp" data-picker="rangi" data-next="texp-meter" autocomplete="off">
                            </div>

                            <div class="texp-row-3">
                                <label for="texp-meter">Meter / Pcs :</label>
                                <input type="text" inputmode="decimal" id="texp-meter" class="texp-inp" data-picker="summary" data-next="texp-pcs" autocomplete="off" oninput="this.value=this.value.replace(/[^0-9.]/g,'').replace(/(\\..*)\\./g,'$1')" style="text-align:right;">
                                <label for="texp-pcs">Saree Pcs :</label>
                                <input type="text" inputmode="numeric" id="texp-pcs" class="texp-inp" data-picker="summary" data-next="texp-paai" autocomplete="off" oninput="this.value=this.value.replace(/[^0-9]/g,'')" style="text-align:right; color:#b47d00;">
                                <label for="texp-paai">Paai :</label>
                                <input type="text" id="texp-paai" class="texp-inp" data-picker="summary" data-next="texp-border" autocomplete="off" style="text-align:center;">
                            </div>

                            <div class="texp-row-2" style="margin-bottom:0;">
                                <label for="texp-border">Border :</label>
                                <input type="text" id="texp-border" class="texp-inp" data-picker="summary" data-next="texp-bana" autocomplete="off">
                                <label for="texp-bana">Bana :</label>
                                <input type="text" id="texp-bana" class="texp-inp" data-picker="summary" data-next="texp-col-saree-1" autocomplete="off">
                            </div>
                        </div>

                        <!-- TOP-RIGHT: LIVE CONTEXTUAL PICKER -->
                        <div class="texp-right-picker">
                            <div class="texp-picker-head">
                                <strong id="texp-picker-title">List of Karigers</strong>
                                <small id="texp-picker-hint">↑ ↓ + Enter</small>
                            </div>
                            <div class="texp-picker-list" id="texp-picker-list"></div>
                        </div>
                    </div>

                    <!-- BOTTOM FULL-WIDTH: COMPACT 2x4 8-COLORS MATRIX + CONTRAST -->
                    <div class="texp-colors-card">
                        <div class="texp-colors-head">
                            <strong>8-Colors Matching Table (Type Color Letter &rarr; Right Picker &rarr; Enter)</strong>
                            <div class="texp-contrast-inline">
                                <label><input type="checkbox" name="texp_contrast" value="aanchal_blouse" checked> Aanchal Blouse</label>
                                <label><input type="checkbox" name="texp_contrast" value="border_only"> Sirf Border</label>
                                <label><input type="checkbox" name="texp_contrast" value="self"> Self</label>
                            </div>
                        </div>
                        <div class="texp-matrix-grid">
                            <table class="texp-table">
                                <thead>
                                    <tr><th style="width:24px;">#</th><th>Saree</th><th>Border</th><th>Bana</th></tr>
                                </thead>
                                <tbody>${build4ColorRows(1, 4)}</tbody>
                            </table>
                            <table class="texp-table">
                                <thead>
                                    <tr><th style="width:24px;">#</th><th>Saree</th><th>Border</th><th>Bana</th></tr>
                                </thead>
                                <tbody>${build4ColorRows(5, 8)}</tbody>
                            </table>
                        </div>
                    </div>

                    <!-- TALLY ACCEPT BAR (SAVE & PRINT | ONLY SAVE | EDIT) -->
                    <div id="texp-accept-bar" class="texp-accept-bar" style="display:none;">
                        <span style="font-size:13px; font-weight:800; color:#1f2937;">Accept? Parchi Save Karein?</span>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" id="texp-accept-print-btn" class="texp-btn-gold" onclick="submitTaniExpress(true)">Save &amp; Print [Y / Enter]</button>
                            <button type="button" id="texp-accept-save-btn" class="texp-btn-plain" onclick="submitTaniExpress(false)">Only Save [S]</button>
                            <button type="button" id="texp-accept-edit-btn" class="texp-btn-plain" onclick="window.__texpHideAccept()">Edit [N / Esc]</button>
                        </div>
                    </div>
                </div>

                <div class="texp-footer">
                    <div id="texp-status-msg" style="font-size:12px; font-weight:700; color:#92400e;">[↑ ↓ + Enter] Picker Select · [Ctrl+Enter] Accept Bar · [Alt+P] Urdu A6 Print · [Alt+W] WhatsApp</div>
                    <div class="texp-footer-actions">
                        <button type="button" class="texp-btn-plain" onclick="closeTaniExpressModal()">Cancel [Esc]</button>
                        <button type="button" class="texp-btn-plain" onclick="sendTaniExpressWhatsApp()">WhatsApp [Alt+W]</button>
                        <button type="button" class="texp-btn-plain" onclick="printLastSavedTaniExpressSlip()">A6 Print [Alt+P]</button>
                        <button type="button" id="texp-submit-btn" class="texp-btn-gold" onclick="window.__texpOpenAccept()">Accept / Save [Ctrl+Enter]</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        window.__texpOpenAccept = () => showTaniAcceptBar(true);
        window.__texpHideAccept = hideTaniAcceptBarToEdit;
        bindTaniExpressEvents();
    };

    /* ========================================================================
       4. KEYBOARD NAVIGATION, CONTEXTUAL PICKER & ENTER CHAINING
       ======================================================================== */
    const bindTaniExpressEvents = () => {
        const modal = document.getElementById('master-tani-express-modal');
        if (!modal) return;

        const karigerInp = document.getElementById('texp-kariger');
        const mohallaInp = document.getElementById('texp-mohalla');

        const fields = Array.from(modal.querySelectorAll('input[data-next]'));
        fields.forEach((inp, idx) => {
            inp.addEventListener('focus', () => {
                pickerSelectedIdx = 0;
                pickerNavigated = false;
                const kind = inp.getAttribute('data-picker') || 'summary';
                renderContextualPicker(kind, inp.id, inp.value);
            });

            inp.addEventListener('input', () => {
                const kind = inp.getAttribute('data-picker') || 'summary';
                pickerSelectedIdx = 0;
                renderContextualPicker(kind, inp.id, inp.value);

                if (inp.id === 'texp-kariger' && mohallaInp) {
                    const kName = String(inp.value || '').trim().toUpperCase();
                    const allKarigers = toArray(getFromStore('kariger_list'));
                    const found = allKarigers.find(k => k && String(k.name || '').trim().toUpperCase() === kName);
                    if (found) mohallaInp.value = found.mohalla || found.address || found.pata || '';
                }
            });

            inp.addEventListener('keydown', (e) => {
                const isPickerActive = (activePickerKind !== 'summary' && pickerFilteredItems.length > 0);

                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    showTaniAcceptBar(true);
                    return;
                }

                if (isPickerActive && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    e.preventDefault();
                    e.stopPropagation();
                    pickerNavigated = true;
                    const len = pickerFilteredItems.length;
                    pickerSelectedIdx = (e.key === 'ArrowDown')
                        ? (pickerSelectedIdx + 1) % len
                        : (pickerSelectedIdx - 1 + len) % len;
                    const rows = document.querySelectorAll('#texp-picker-list .texp-pick-row');
                    rows.forEach((r, rIdx) => r.classList.toggle('active', rIdx === pickerSelectedIdx));
                    rows[pickerSelectedIdx]?.scrollIntoView({ block: 'nearest' });
                    return;
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.shiftKey) {
                        if (idx > 0) {
                            fields[idx - 1].focus();
                            fields[idx - 1].select?.();
                        }
                        return;
                    }

                    // Pick from Right Contextual Picker if navigated OR user typed a matching query
                    const typedNonEmpty = inp.value.trim() !== '';
                    if (isPickerActive && (pickerNavigated || typedNonEmpty)) {
                        applyPickerSelection(pickerSelectedIdx, true);
                        return;
                    }

                    const nextId = inp.getAttribute('data-next');
                    if (nextId === 'texp-accept-bar') {
                        showTaniAcceptBar(true);
                    } else if (nextId) {
                        const nxt = document.getElementById(nextId);
                        if (nxt) {
                            nxt.focus();
                            nxt.select?.();
                        }
                    }
                }
            });
        });

        // Accept bar keyboard shortcuts (Y / Enter -> Save & Print | S -> Only Save | N -> Edit)
        const acceptBar = document.getElementById('texp-accept-bar');
        if (acceptBar) {
            acceptBar.addEventListener('keydown', (e) => {
                const k = e.key.toLowerCase();
                if (k === 'y' || (e.key === 'Enter' && document.activeElement?.id === 'texp-accept-print-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    submitTaniExpress(true);
                } else if (k === 's' || (e.key === 'Enter' && document.activeElement?.id === 'texp-accept-save-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    submitTaniExpress(false);
                } else if (k === 'n' || (e.key === 'Enter' && document.activeElement?.id === 'texp-accept-edit-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    hideTaniAcceptBarToEdit();
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const btns = Array.from(acceptBar.querySelectorAll('button'));
                    const cur = btns.indexOf(document.activeElement);
                    if (cur >= 0) {
                        const nxt = (e.key === 'ArrowRight') ? (cur + 1) % btns.length : (cur - 1 + btns.length) % btns.length;
                        btns[nxt]?.focus();
                    }
                }
            });
        }

        setTimeout(() => {
            if (karigerInp) {
                karigerInp.focus();
                renderContextualPicker('kariger', 'texp-kariger', '');
            }
        }, 60);

        window.removeEventListener('keydown', handleTaniExpressGlobalKeydown, true);
        window.addEventListener('keydown', handleTaniExpressGlobalKeydown, true);
    };

    const handleTaniExpressGlobalKeydown = (e) => {
        const modal = document.getElementById('master-tani-express-modal');
        if (!modal || modal.style.display === 'none') return;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const acceptBar = document.getElementById('texp-accept-bar');
            if (acceptBar && acceptBar.style.display !== 'none') {
                hideTaniAcceptBarToEdit();
                return;
            }
            closeTaniExpressModal();
            return;
        }

        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            printLastSavedTaniExpressSlip();
            return;
        }

        if (e.altKey && (e.key === 'w' || e.key === 'W')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            sendTaniExpressWhatsApp();
            return;
        }
    };

    window.closeTaniExpressModal = () => {
        window.removeEventListener('keydown', handleTaniExpressGlobalKeydown, true);
        const modal = document.getElementById('master-tani-express-modal');
        if (modal) modal.remove();
    };

    /* ========================================================================
       5. ATOMIC SUBMIT (SAVES TO TANI_ORDERS_LIST & PUSHES TO SANCHA PORTAL)
       ======================================================================== */
    window.submitTaniExpress = (shouldPrint = null) => {
        const orderNo = String(document.getElementById('texp-order-no')?.value || '').trim() || getNextParchiNumber();
        const date = document.getElementById('texp-order-date')?.value || getToday();
        const kariger = String(document.getElementById('texp-kariger')?.value || '').trim().toUpperCase();
        const mohalla = String(document.getElementById('texp-mohalla')?.value || '').trim();
        const sancha = String(document.getElementById('texp-sancha')?.value || '').trim().toUpperCase();
        const rangi = String(document.getElementById('texp-rangi')?.value || '').trim().toUpperCase();

        const meter = safeNum(document.getElementById('texp-meter')?.value);
        const pcs = safeInt(document.getElementById('texp-pcs')?.value);
        const paai = String(document.getElementById('texp-paai')?.value || '').trim();
        const border = String(document.getElementById('texp-border')?.value || '').trim();
        const bana = String(document.getElementById('texp-bana')?.value || '').trim();

        if (!kariger) {
            showTaniAcceptBar(false);
            alert('कृपया कारीगर का नाम चुनिए!');
            document.getElementById('texp-kariger')?.focus();
            return;
        }

        const allKarigers = toArray(getFromStore('kariger_list'));
        const karigerExists = allKarigers.some(k => k && String(k.name || '').trim().toUpperCase() === kariger);
        if (!karigerExists) {
            showTaniAcceptBar(false);
            alert('चुना गया कारीगर Master Sheet में नहीं है! कृपया सही कारीगर चुनें।');
            document.getElementById('texp-kariger')?.focus();
            return;
        }

        const matchingTable = [];
        const usedColors = [];

        if (border) usedColors.push(border);
        if (bana) usedColors.push(bana);

        for (let i = 1; i <= 8; i++) {
            const sCol = String(document.getElementById(`texp-col-saree-${i}`)?.value || '').trim();
            const bCol = String(document.getElementById(`texp-col-border-${i}`)?.value || '').trim();
            const bnCol = String(document.getElementById(`texp-col-bana-${i}`)?.value || '').trim();
            if (sCol || bCol || bnCol) {
                matchingTable.push({ row: i, saree: sCol, border: bCol, bana: bnCol });
                if (sCol) usedColors.push(sCol);
                if (bCol) usedColors.push(bCol);
                if (bnCol) usedColors.push(bnCol);
            }
        }

        saveNewLearnedColors(usedColors);

        if (rangi) {
            const rList = toArray(getFromStore('tani_learned_rangi'));
            if (!rList.includes(rangi)) {
                rList.push(rangi);
                setToStore('tani_learned_rangi', rList);
            }
        }

        const selectedContrasts = [];
        const contrastLabels = [];
        document.querySelectorAll('input[name="texp_contrast"]:checked').forEach(c => {
            selectedContrasts.push(c.value);
            if (c.value === 'aanchal_blouse') contrastLabels.push('آنچل بلاؤز');
            else if (c.value === 'border_only') contrastLabels.push('صرف بارڈر');
            else if (c.value === 'self') contrastLabels.push('سیلف');
        });

        const contrastVal = selectedContrasts.length ? selectedContrasts.join(', ') : 'aanchal_blouse';
        const contrastLabel = contrastLabels.length ? contrastLabels.join(' + ') : 'آنچل بلاؤز کنٹراس';

        const list = getTaniOrders();
        const targetId = `tani_${Date.now()}`;

        const newOrderObj = {
            id: targetId,
            orderNo: orderNo,
            date: date,
            sancha: sancha,
            kariger: kariger,
            mohalla: mohalla,
            paai: paai,
            border: border,
            bana: bana,
            meter: meter,
            pcs: pcs,
            rangi: rangi,
            matchingTable: matchingTable,
            contrastVal: contrastVal,
            contrastLabel: contrastLabel,
            selectedContrasts: selectedContrasts,
            status: 'sancha',
            sanchaPortalStatus: 'pending',
            statusHistory: [
                { status: 'sancha', date: date, note: 'Tani Express Entry' }
            ],
            createdAt: Date.now()
        };

        list.unshift(newOrderObj);
        setToStore('tani_orders_list', list);

        lastSavedTaniExpressOrder = newOrderObj;

        // Sancha Mobile Portal Auto-Push (100% Preserved)
        if (sancha && window.SanchaPortalSync && typeof window.SanchaPortalSync.pushTaniOrderToSanchaPortal === 'function') {
            window.SanchaPortalSync.pushTaniOrderToSanchaPortal(newOrderObj).then((ok) => {
                if (ok) {
                    const latest = getTaniOrders();
                    const found = latest.find(x => String(x.id) === String(newOrderObj.id));
                    if (found && !found.sanchaPortalPushed) {
                        found.sanchaPortalPushed = true;
                        setToStore('tani_orders_list', latest);
                    }
                }
            });
        }

        if (typeof window.updateTaniOrderBadges === 'function') window.updateTaniOrderBadges();
        if (typeof window.renderTaniMonthTabs === 'function') window.renderTaniMonthTabs();
        if (typeof window.renderTaniOrdersTable === 'function') window.renderTaniOrdersTable();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
        if (typeof window.slSyncDashboardCharts === 'function') window.slSyncDashboardCharts();

        showTaniAcceptBar(false);

        const statusMsg = document.getElementById('texp-status-msg');
        if (statusMsg) {
            statusMsg.textContent = `✅ Parchi #${orderNo} (${kariger}) save & sync ho gayi!`;
        }

        const nextNum = getNextParchiNumber();
        const noEl = document.getElementById('texp-order-no');
        const badgeEl = document.getElementById('texp-parchi-badge');
        if (noEl) noEl.value = nextNum;
        if (badgeEl) badgeEl.textContent = `Parchi #${nextNum}`;

        const kInp = document.getElementById('texp-kariger');
        if (kInp) kInp.value = '';
        document.getElementById('texp-mohalla').value = '';
        document.getElementById('texp-sancha').value = '';
        document.getElementById('texp-rangi').value = '';
        document.getElementById('texp-meter').value = '';
        document.getElementById('texp-pcs').value = '';
        document.getElementById('texp-paai').value = '';
        document.getElementById('texp-border').value = '';
        document.getElementById('texp-bana').value = '';

        for (let i = 1; i <= 8; i++) {
            const sEl = document.getElementById(`texp-col-saree-${i}`);
            const bEl = document.getElementById(`texp-col-border-${i}`);
            const bnEl = document.getElementById(`texp-col-bana-${i}`);
            if (sEl) sEl.value = '';
            if (bEl) bEl.value = '';
            if (bnEl) bnEl.value = '';
        }

        if (shouldPrint === true) {
            printLastSavedTaniExpressSlip();
        } else if (shouldPrint === null) {
            if (confirm(`✅ Parchi #${orderNo} save ho gayi!\n\nKya aap iski Urdu A6 Parchi print karna chahte hain?`)) {
                printLastSavedTaniExpressSlip();
            }
        }

        if (kInp) {
            kInp.focus();
            renderContextualPicker('kariger', 'texp-kariger', '');
        }
    };

    /* ========================================================================
       6. A6 PHYSICAL SLIP PRINT (EXACT NASTALIQ URDU REPLICA - UNTOUCHED)
       ======================================================================== */
    window.printLastSavedTaniExpressSlip = () => {
        if (!lastSavedTaniExpressOrder) {
            return alert('प्रिंट करने के लिए कोई रीसेंट तानी पर्ची नहीं मिली!');
        }

        const item = lastSavedTaniExpressOrder;
        const matching = Array.isArray(item.matchingTable) ? item.matchingTable : [];
        let rowsHtml = '';

        for (let i = 1; i <= 8; i++) {
            const rowData = matching.find((m) => m.row === i) || { saree: '', border: '', bana: '' };
            rowsHtml += `
                <tr>
                    <td style="border:1.5px solid #8b0000; padding:4px; text-align:center; font-weight:bold;">${esc(rowData.saree || '-')}</td>
                    <td style="border:1.5px solid #8b0000; padding:4px; text-align:center; font-weight:bold;">${esc(rowData.border || '-')}</td>
                    <td style="border:1.5px solid #8b0000; padding:4px; text-align:center; font-weight:bold;">${esc(rowData.bana || '-')}</td>
                </tr>`;
        }

        const selContrasts = Array.isArray(item.selectedContrasts) ? item.selectedContrasts : ['aanchal_blouse'];
        const isAanchal = selContrasts.includes('aanchal_blouse') ? '☑' : '☐';
        const isBorder = selContrasts.includes('border_only') ? '☑' : '☐';
        const isSelf = selContrasts.includes('self') ? '☑' : '☐';

        const printWin = window.open('', '', 'width=450,height=700');
        if (!printWin) return alert('Popup block hai! Kripya browser me popup allow karein.');

        printWin.document.write(`
            <!DOCTYPE html>
            <html lang="ur" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>Tani Parchi #${item.orderNo}</title>
                <style>
                    @page { size: A6 portrait; margin: 4mm; }
                    body { font-family: 'Noto Nastaliq Urdu', 'Segoe UI', Tahoma, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #8b0000; direction: rtl; }
                    .ticket { width: 100%; max-width: 96mm; margin: 0 auto; border: 2px solid #8b0000; padding: 6px; box-sizing: border-box; }
                    .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #8b0000; padding-bottom: 4px; margin-bottom: 6px; }
                    .top-no { font-size: 18px; font-weight: 900; }
                    .header-line { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
                    .main-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 4px; margin-top: 6px; }
                    table { width: 100%; border-collapse: collapse; font-size: 10px; }
                    th { border: 1.5px solid #8b0000; padding: 3px; background: #fff5f5; font-size: 11px; text-align: center; }
                    .spec-col { display: flex; flex-direction: column; justify-content: space-between; border-right: 1.5px solid #8b0000; padding-right: 6px; }
                    .spec-item { border-bottom: 1px solid #8b0000; padding: 4px 2px; font-size: 11px; display: flex; justify-content: space-between; }
                    .bottom-strip { border-top: 1.5px solid #8b0000; margin-top: 8px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="top-bar">
                        <div class="top-no">${item.orderNo}</div>
                        <div style="font-size:12px; font-weight:bold;">سانچہ: <strong>${esc(item.sancha || '-')}</strong></div>
                        <div style="font-size:11px;">تاریخ: <strong>${formatDisplay(item.date)}</strong></div>
                    </div>

                    <div class="header-line">
                        <div>کاریگر کا نام: <strong>${esc(item.kariger || '-')}</strong></div>
                        <div>محلہ: <strong>${esc(item.mohalla || '-')}</strong></div>
                    </div>

                    <div class="main-grid">
                        <div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>ساڑی</th>
                                        <th>بارڈر</th>
                                        <th>بانا</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                            </table>
                        </div>

                        <div class="spec-col">
                            <div class="spec-item"><span>پائی:</span> <strong>${esc(item.paai || '-')}</strong></div>
                            <div class="spec-item"><span>بارڈر:</span> <strong>${esc(item.border || '-')}</strong></div>
                            <div class="spec-item"><span>بانا:</span> <strong>${esc(item.bana || '-')}</strong></div>
                            <div class="spec-item"><span>میٹر:</span> <strong>${safeNum(item.meter)} Mtr</strong></div>
                            <div class="spec-item"><span>عدد:</span> <strong style="font-size:13px;">${safeInt(item.pcs)} Saree</strong></div>
                            <div class="spec-item" style="border-bottom:none;"><span>رنگی:</span> <strong style="font-size:12px;">${esc(item.rangi || '-')}</strong></div>
                        </div>
                    </div>

                    <div class="bottom-strip">
                        <div>${isAanchal} آنچل بلاؤز کنٹراس</div>
                        <div>${isBorder} صرف بارڈر کنٹراس</div>
                        <div>${isSelf} سیلف</div>
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                        setTimeout(() => window.close(), 700);
                    };
                <\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    /* ========================================================================
       7. WHATSAPP PARCHI SHARING
       ======================================================================== */
    window.sendTaniExpressWhatsApp = () => {
        if (!lastSavedTaniExpressOrder) {
            return alert('व्हाट्सएप पर भेजने के लिए कोई रीसेंट पर्ची नहीं मिली!');
        }

        const item = lastSavedTaniExpressOrder;
        let msg = `📜 *TANI ORDER & RANGAI PARCHI #${item.orderNo}*\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `📅 *Tarikh:* ${formatDisplay(item.date)}\n` +
            `⚙️ *Sancha:* ${item.sancha || '-'}\n` +
            `👤 *Kariger:* ${item.kariger || '-'}${item.mohalla ? ` (${item.mohalla})` : ''}\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📏 *Meter:* ${safeNum(item.meter)} Mtr\n` +
            `🥻 *Adad (Saree):* ${safeInt(item.pcs)} Pcs\n` +
            `🧵 *Paai:* ${item.paai || '-'}\n` +
            `✨ *Border:* ${item.border || '-'}\n` +
            `🧶 *Bana:* ${item.bana || '-'}\n` +
            `🎨 *Rangi Wala:* ${item.rangi || '-'}\n` +
            `🎯 *Matching:* ${item.contrastLabel || 'Self'}\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n`;

        if (Array.isArray(item.matchingTable) && item.matchingTable.length > 0) {
            msg += `🎨 *8 COLORS MATCHING:*\n`;
            item.matchingTable.forEach((m) => {
                msg += `• Row ${m.row}: Saree: ${m.saree || '-'} | Border: ${m.border || '-'} | Bana: ${m.bana || '-'}\n`;
            });
            msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
        }

        msg += `_Simplicity ERP • by Farhan Jawed_`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    };

    /* ========================================================================
       8. GLOBAL EXPORTS
       ======================================================================== */
    window.TaniExpressEngine = {
        openTaniExpressModal,
        closeTaniExpressModal,
        submitTaniExpress,
        printLastSavedTaniExpressSlip,
        sendTaniExpressWhatsApp
    };

})();
