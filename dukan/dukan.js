/* ============================================================================
   SIMPLICITY ERP - DUKAN FINAL OUT VOUCHER & REGISTER ENGINE
   File: dukan/dukan.js • Developed by Farhan Jawed (TallyPrime White & Gold)
   Features:
   - Exact jobwork-express Batch Voucher (Receiver -> Note -> Date -> Maker -> Qty)
   - Right-Side Live Picker for Finished Stock Makers (1-2 letter search + ↑↓ Enter)
   - Multi-Maker Gatthi Batch List + Accept? (Yes / No) + A6 Challan Print
   - Inline Register Detail (Zero Row Buttons, Atomic saree_history Rollback)
============================================================================ */

(() => {
    'use strict';

    /* ========================================================================
       1. GLOBAL STATE & PAGINATION POOL
       ======================================================================== */
    let dukanCurrentPage = 1;
    const DUKAN_PAGE_SIZE = 15;
    let dukanEditId = null;
    let filteredDukanCache = [];
    let activeDukanDetailId = null;
    let dukanGlobalKeyBound = false;

    // Batch Voucher State
    let dukanBatchItems = [];
    let lastSavedDukanBatch = null;
    let dukanPickerMode = 'maker'; // 'receiver' | 'maker' | 'summary'
    let dukanPickerItems = [];
    let dukanPickerActiveIdx = 0;
    let dukanMakerArrowUsed = false;

    /* ========================================================================
       2. SAFE DATA, DATE & DOM HELPERS
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

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val !== undefined && val !== null) ? String(val) : '';
    };

    const setDisplay = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.style.display = val;
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
        return (typeof window.formatDateDisplay === 'function')
            ? window.formatDateDisplay(d)
            : (d || '-');
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

    const triggerAllCachesInvalidation = () => {
        if (typeof window.invalidateSareeCalcCache === 'function') window.invalidateSareeCalcCache();
        if (typeof window.invalidateCalenderCalcCache === 'function') window.invalidateCalenderCalcCache();
        if (typeof window.invalidateJobWorkCache === 'function') window.invalidateJobWorkCache();
    };

    const isDukanVisible = () => {
        const sec = document.getElementById('jobwork-section');
        const view = document.getElementById('jw-dukan-view');
        return Boolean(sec && sec.style.display !== 'none' && view && view.style.display !== 'none');
    };

    /* ========================================================================
       3. STORE ACCESSORS & FINISHED STOCK RESOLVER
       ======================================================================== */
    const getDukanTransfers = () => {
        try {
            return toArray(getFromStore('dukan_transfer_history'));
        } catch (err) {
            console.error('[DukanEngine] getDukanTransfers failure:', err);
            return [];
        }
    };

    const saveDukanTransfers = (list) => {
        try {
            setToStore('dukan_transfer_history', toArray(list));
        } catch (err) {
            console.error('[DukanEngine] saveDukanTransfers failure:', err);
        }
    };

    const getAvailableFinishedSareesMap = () => {
        const sH = toArray(getFromStore('saree_history'));
        const map = new Map();

        sH.forEach((h) => {
            if (!h || String(h.type || '').toLowerCase() !== 'finished') return;
            const sName = normText(h.sareeName || h.name, 'GENERAL SAREE');
            const kName = normText(h.karigerName || h.kariger, 'KARKHANA');
            const kid = normGodownId(h.karkhanaId);
            const key = `${sName}___${kName}___${kid}`;

            const isGai = (h.isOut === true) || (safeNum(h.gai) > 0);
            const inQ = isGai ? 0 : safeNum(h.aai !== undefined ? h.aai : h.pcs);
            const outQ = isGai ? safeNum(h.gai !== undefined ? h.gai : h.pcs) : 0;

            if (!map.has(key)) {
                map.set(key, { sName, kName, kid, aai: 0, gai: 0, bachi: 0 });
            }
            const item = map.get(key);
            item.aai += inQ;
            item.gai += outQ;
            item.bachi = Math.max(0, item.aai - item.gai);
        });

        return map;
    };

    const resolveFinishedMakerInfo = (makerName) => {
        const cleanM = normText(makerName);
        if (!cleanM) return null;

        const targetKid = getEffectiveGodown();
        const finishedMap = getAvailableFinishedSareesMap();
        let best = null;
        let maxBachi = -1;

        finishedMap.forEach((val) => {
            if (val.kName !== cleanM) return;
            if (targetKid !== 'all' && val.kid !== targetKid) return;
            if (val.bachi > maxBachi) {
                maxBachi = val.bachi;
                best = val;
            }
        });

        if (best) return { maker: cleanM, saree: best.sName, bachi: best.bachi, kid: best.kid };

        const allKars = toArray(getFromStore('kariger_list'));
        const found = allKars.find((k) => k?.name && normText(k.name) === cleanM);
        return {
            maker: cleanM,
            saree: normText(found?.saree, 'FINISHED SAREE'),
            bachi: 0,
            kid: found?.karkhanaId || targetKid
        };
    };

    const getDukanMakersPickerList = (queryText = '') => {
        const q = String(queryText || '').trim().toLowerCase();
        const targetKid = getEffectiveGodown();
        const finishedMap = getAvailableFinishedSareesMap();
        const allKars = toArray(getFromStore('kariger_list'));

        const results = [];
        const added = new Set();

        finishedMap.forEach((val) => {
            if (targetKid !== 'all' && val.kid !== targetKid) return;
            if (val.bachi > 0) {
                added.add(val.kName);
                const full = `${val.kName} ${val.sName}`.toLowerCase();
                if (!q || full.includes(q)) {
                    results.push({
                        label: val.kName,
                        sub: `${val.sName} (${val.bachi} Pcs)`,
                        data: val.kName,
                        saree: val.sName,
                        bachi: val.bachi,
                        kid: val.kid
                    });
                }
            }
        });

        allKars.forEach((k) => {
            if (!k || !k.name) return;
            const kn = normText(k.name);
            if (!added.has(kn)) {
                added.add(kn);
                const sNm = normText(k.saree, 'FINISHED SAREE');
                const full = `${kn} ${sNm}`.toLowerCase();
                if (!q || full.includes(q)) {
                    results.push({
                        label: kn,
                        sub: sNm,
                        data: kn,
                        saree: sNm,
                        bachi: 0,
                        kid: k.karkhanaId || targetKid
                    });
                }
            }
        });

        return results;
    };

    const populateDukanSareeDropdown = () => {
        if (dukanPickerMode === 'maker') {
            showDukanRightPicker('maker', document.getElementById('jw-dukan-maker-input')?.value || '');
        }
    };

    /* ========================================================================
       4. DUKAN RIGHT-PANE TALLY PICKER & BATCH VOUCHER
       ======================================================================== */
    const updateDukanMakerStockHint = () => {
        const hint = document.getElementById('jw-dukan-live-stock-hint');
        const mInp = document.getElementById('jw-dukan-maker-input');
        if (!hint) return;

        const val = normText(mInp?.value);
        if (!val) {
            hint.textContent = '';
            return;
        }
        const info = resolveFinishedMakerInfo(val);
        hint.textContent = info ? `FINISHED Stock: ${info.bachi} Pcs [${info.saree}]` : '';
    };

    const showDukanRightPicker = (mode, queryText = '') => {
        dukanPickerMode = mode;
        const pickerEl = document.getElementById('jw-dukan-right-picker');
        const titleEl = document.getElementById('jw-dukan-right-title');
        const hintEl = document.getElementById('jw-dukan-right-hint');
        if (!pickerEl) return;

        dukanPickerItems = [];

        if (mode === 'receiver') {
            if (titleEl) titleEl.textContent = 'Select Dukan / Receiver';
            if (hintEl) hintEl.textContent = '↑↓ + Enter';
            dukanPickerItems = [
                { label: 'Apni Main Dukan', sub: 'Main', data: 'Apni Main Dukan' },
                { label: 'Party / Retailer', sub: 'Party', data: 'Party / Retailer' }
            ];
            const cur = document.getElementById('jw-dukan-receiver-input')?.value || '';
            const idx = dukanPickerItems.findIndex((x) => x.data === cur);
            dukanPickerActiveIdx = idx >= 0 ? idx : 0;
        } else if (mode === 'maker') {
            if (titleEl) titleEl.textContent = 'List of Makers (FINISHED Stock)';
            if (hintEl) hintEl.textContent = dukanBatchItems.length > 0 ? 'Khali Enter = Batch Poora' : '↑↓ + Enter';
            dukanPickerItems = getDukanMakersPickerList(queryText);
            if (dukanPickerActiveIdx >= dukanPickerItems.length || dukanPickerActiveIdx < 0) dukanPickerActiveIdx = 0;
        } else {
            if (titleEl) titleEl.textContent = 'Dukan Dispatch Context';
            if (hintEl) hintEl.textContent = 'Live Info';
            const rec = document.getElementById('jw-dukan-receiver-input')?.value || 'Apni Main Dukan';
            const note = document.getElementById('jw-dukan-note')?.value || rec;
            pickerEl.innerHTML = `
                <div style="padding:12px 14px; font-size:12.5px; line-height:1.7;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f3f4f6; padding-bottom:4px; margin-bottom:4px;">
                        <span style="color:#6b7280;">Receiver:</span> <strong style="color:#b47d00;">${esc(rec)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#6b7280;">Note:</span> <strong>${esc(note)}</strong>
                    </div>
                </div>`;
            return;
        }

        renderDukanRightPickerList();
    };

    const renderDukanRightPickerList = () => {
        const pickerEl = document.getElementById('jw-dukan-right-picker');
        if (!pickerEl) return;

        if (!dukanPickerItems.length) {
            pickerEl.innerHTML = '<div style="padding:18px 12px; text-align:center; color:#6b7280; font-size:12px;">Koi Finished Stock maker nahi mila.</div>';
            return;
        }

        let html = '';
        dukanPickerItems.forEach((item, idx) => {
            const cls = idx === dukanPickerActiveIdx ? 'jw-picker-item active' : 'jw-picker-item';
            html += `<div class="${cls}" onmousedown="event.preventDefault(); DukanEngine.pickDukanItem(${idx})">
                <span>${esc(item.label)}</span>
                <span class="jw-picker-sub">${esc(item.sub)}</span>
            </div>`;
        });
        pickerEl.innerHTML = html;

        const activeEl = pickerEl.querySelector('.jw-picker-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const focusDukanField = (id) => {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (el && el.offsetParent !== null) {
                el.focus();
                if (typeof el.select === 'function' && !el.readOnly) el.select();
            }
        }, 35);
    };

    const pickDukanItem = (idx) => {
        const item = dukanPickerItems[idx];
        if (!item) return;

        if (dukanPickerMode === 'receiver') {
            const rInp = document.getElementById('jw-dukan-receiver-input');
            const nInp = document.getElementById('jw-dukan-note');
            if (rInp) rInp.value = item.data;
            if (nInp && !nInp.value.trim()) nInp.value = item.data;
            focusDukanField('jw-dukan-note');
        } else if (dukanPickerMode === 'maker') {
            const mInp = document.getElementById('jw-dukan-maker-input');
            if (mInp) mInp.value = item.data;
            updateDukanMakerStockHint();
            focusDukanField('jw-dukan-pcs');
        }
    };

    const addDukanBatchRow = () => {
        const mInp = document.getElementById('jw-dukan-maker-input');
        const qInp = document.getElementById('jw-dukan-pcs');

        const makerName = normText(mInp?.value);
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

        const info = resolveFinishedMakerInfo(makerName);
        dukanBatchItems.push({
            id: `duk_it_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            maker: makerName,
            saree: info?.saree || 'FINISHED SAREE',
            kid: info?.kid || getEffectiveGodown(),
            qty: qty
        });

        renderDukanBatchGrid();
        if (mInp) mInp.value = '';
        if (qInp) qInp.value = '';
        updateDukanMakerStockHint();
        showDukanRightPicker('maker', '');
        focusDukanField('jw-dukan-maker-input');
    };

    const removeDukanBatchItem = (idx) => {
        dukanBatchItems.splice(idx, 1);
        renderDukanBatchGrid();
    };

    const renderDukanBatchGrid = () => {
        const tbody = document.getElementById('jw-dukan-batch-body');
        const totalDisp = document.getElementById('jw-dukan-live-batch-total');
        const summaryDisp = document.getElementById('jw-dukan-live-batch-summary');
        const badge = document.getElementById('jw-dukan-batch-count-badge');
        if (!tbody) return;

        if (!dukanBatchItems.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:14px; color:#6b7280;">Batch khali hai. Maker chunein aur Pcs daalein.</td></tr>';
            if (totalDisp) totalDisp.textContent = '0 Pcs';
            if (summaryDisp) summaryDisp.textContent = 'Batch khali hai';
            if (badge) badge.textContent = '0 Items';
            return;
        }

        let total = 0;
        let html = '';
        dukanBatchItems.forEach((it, idx) => {
            total += it.qty;
            html += `<tr>
                <td>${idx + 1}</td>
                <td><strong>${esc(it.maker)}</strong></td>
                <td>${esc(it.saree)}</td>
                <td style="text-align:right; font-weight:800;">${it.qty} Pcs</td>
                <td style="text-align:center;">
                    <button type="button" tabindex="-1" class="jw-btn-del" onclick="DukanEngine.removeDukanBatchItem(${idx})">&times;</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if (totalDisp) totalDisp.textContent = `${total} Pcs`;
        if (summaryDisp) summaryDisp.textContent = `Kul ${dukanBatchItems.length} Karigaron ki dukan gatthi`;
        if (badge) badge.textContent = `${dukanBatchItems.length} Items`;
    };

    const showDukanAcceptPrompt = (show) => {
        const bar = document.getElementById('jw-dukan-accept-strip');
        if (!bar) return;
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            setTimeout(() => document.getElementById('jw-dukan-accept-yes-print')?.focus(), 30);
        }
    };

    const cancelDukanAccept = () => {
        showDukanAcceptPrompt(false);
        focusDukanField('jw-dukan-maker-input');
    };

    const initDukanVoucher = () => {
        bindDukanVoucherEvents();
        dukanEditId = null;
        dukanBatchItems = [];
        activeDukanDetailId = null;
        setDisplay('jw-dukan-inline-detail', 'none');
        setDisplay('jw-dukan-accept-strip', 'none');

        const dInp = document.getElementById('jw-dukan-date');
        if (dInp) dInp.value = getTodayIso();
        const rInp = document.getElementById('jw-dukan-receiver-input');
        if (rInp) rInp.value = 'Apni Main Dukan';
        const nInp = document.getElementById('jw-dukan-note');
        if (nInp) nInp.value = '';
        const mInp = document.getElementById('jw-dukan-maker-input');
        if (mInp) mInp.value = '';
        const pInp = document.getElementById('jw-dukan-pcs');
        if (pInp) pInp.value = '';

        const btn = document.getElementById('jw-dukan-save-btn');
        if (btn) btn.textContent = 'Save & A6 Challan [Ctrl+Enter]';
        setDisplay('jw-dukan-cancel-edit-btn', 'none');

        updateDukanMakerStockHint();
        renderDukanBatchGrid();
        renderDukanTransferTable();
        showDukanRightPicker('maker', '');
        focusDukanField('jw-dukan-maker-input');
    };

    /* ========================================================================
       5. ATOMIC SAVE & EDIT DISPATCHER
       ======================================================================== */
    const addDukanTransferEntry = (doPrint = false) => {
        showDukanAcceptPrompt(false);

        const dateInput = document.getElementById('jw-dukan-date');
        const pcsInput = document.getElementById('jw-dukan-pcs');
        const noteInput = document.getElementById('jw-dukan-note');
        const recInput = document.getElementById('jw-dukan-receiver-input');
        const makerInput = document.getElementById('jw-dukan-maker-input');

        const d = toIsoDate(dateInput?.value) || getTodayIso();
        const receiver = String(recInput?.value || 'Apni Main Dukan').trim();
        const cleanNote = String(noteInput?.value || '').trim() || receiver;

        try {
            let sH = [...toArray(getFromStore('saree_history'))];
            let list = [...getDukanTransfers()];

            if (dukanEditId) {
                const makerName = normText(makerInput?.value, 'KARKHANA FINISHED');
                const pcs = safeInt(pcsInput?.value);
                if (pcs <= 0) {
                    alert('Kripya sahi Saree Pcs sankhya bharein!');
                    pcsInput?.focus();
                    return;
                }

                const info = resolveFinishedMakerInfo(makerName);
                const targetSName = info?.saree || 'FINISHED SAREE';
                const targetKid = info?.kid || getEffectiveGodown();

                const item = list.find((x) => String(x.id) === String(dukanEditId));
                if (item) {
                    item.date = d;
                    item.sareeName = targetSName;
                    item.karigerName = makerName;
                    item.pcs = pcs;
                    item.note = cleanNote;
                }

                sH = sH.filter((h) => !h || String(h.refId) !== String(dukanEditId));
                sH.push({
                    id: `sh_dukan_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    refId: dukanEditId,
                    date: d,
                    sareeName: targetSName,
                    karigerName: makerName,
                    kariger: makerName,
                    partyName: cleanNote,
                    targetWorker: cleanNote,
                    karkhanaId: targetKid,
                    type: 'finished',
                    typeLabel: `🏪 Dukan Bheja (${cleanNote})`,
                    aai: 0,
                    gai: pcs,
                    isOut: true,
                    note: `${targetSName} (${cleanNote})`,
                    timestamp: Date.now()
                });

                saveDukanTransfers(list);
                setToStore('saree_history', sH);
                lastSavedDukanBatch = {
                    date: d,
                    note: cleanNote,
                    items: [{ maker: makerName, saree: targetSName, qty: pcs }]
                };
            } else {
                if (!dukanBatchItems.length) {
                    const directMaker = normText(makerInput?.value);
                    const directQty = safeInt(pcsInput?.value);
                    if (directMaker && directQty > 0) {
                        const info = resolveFinishedMakerInfo(directMaker);
                        dukanBatchItems.push({
                            id: `duk_it_${Date.now()}`,
                            maker: directMaker,
                            saree: info?.saree || 'FINISHED SAREE',
                            kid: info?.kid || getEffectiveGodown(),
                            qty: directQty
                        });
                    }
                }

                if (!dukanBatchItems.length) {
                    alert('Kam se kam 1 Maker aur Saree Pcs batch me jodein!');
                    focusDukanField('jw-dukan-maker-input');
                    return;
                }

                const savedItemsForPrint = [];
                dukanBatchItems.forEach((it, idx) => {
                    const entryId = `duk_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`;
                    list.push({
                        id: entryId,
                        date: d,
                        sareeName: it.saree,
                        karigerName: it.maker,
                        pcs: it.qty,
                        note: cleanNote,
                        timestamp: Date.now() + idx
                    });

                    sH.push({
                        id: `sh_dukan_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
                        refId: entryId,
                        date: d,
                        sareeName: it.saree,
                        karigerName: it.maker,
                        kariger: it.maker,
                        partyName: cleanNote,
                        targetWorker: cleanNote,
                        karkhanaId: it.kid || getEffectiveGodown(),
                        type: 'finished',
                        typeLabel: `🏪 Dukan Bheja (${cleanNote})`,
                        aai: 0,
                        gai: it.qty,
                        isOut: true,
                        note: `${it.saree} (${cleanNote})`,
                        timestamp: Date.now() + idx
                    });

                    savedItemsForPrint.push({ maker: it.maker, saree: it.saree, qty: it.qty });
                });

                saveDukanTransfers(list);
                setToStore('saree_history', sH);
                lastSavedDukanBatch = {
                    date: d,
                    note: cleanNote,
                    items: savedItemsForPrint
                };
            }

            triggerAllCachesInvalidation();
            cancelDukanEdit();
            renderDukanTransferTable();
            showDukanRightPicker('maker', '');

            if (typeof window.updateJobWorkHubBadges === 'function') window.updateJobWorkHubBadges();
            if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
            if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();

            if (doPrint && lastSavedDukanBatch) {
                printDukanBatchChallan(lastSavedDukanBatch);
            }

            focusDukanField('jw-dukan-maker-input');
        } catch (err) {
            console.error('[DukanEngine] Outward transfer transaction failure:', err);
            alert('Transfer record save karne me takleef aayi.');
        }
    };

    const editDukanTransferEntry = (id) => {
        const item = getDukanTransfers().find((x) => String(x.id) === String(id));
        if (!item) return alert('Entry nahi mili!');

        dukanEditId = item.id;
        dukanBatchItems = [];
        renderDukanBatchGrid();
        closeDukanInlineDetail();

        const dInp = document.getElementById('jw-dukan-date');
        const pInp = document.getElementById('jw-dukan-pcs');
        const nInp = document.getElementById('jw-dukan-note');
        const mInp = document.getElementById('jw-dukan-maker-input');
        if (dInp) dInp.value = toIsoDate(item.date) || getTodayIso();
        if (pInp) pInp.value = item.pcs;
        if (nInp) nInp.value = item.note || '';
        if (mInp) mInp.value = item.karigerName || '';

        updateDukanMakerStockHint();

        const btn = document.getElementById('jw-dukan-save-btn');
        if (btn) btn.textContent = 'Update Dukan Entry';
        setDisplay('jw-dukan-cancel-edit-btn', 'inline-block');

        focusDukanField('jw-dukan-pcs');
    };

    const cancelDukanEdit = () => {
        dukanEditId = null;
        dukanBatchItems = [];
        renderDukanBatchGrid();

        const dInp = document.getElementById('jw-dukan-date');
        const pInp = document.getElementById('jw-dukan-pcs');
        const nInp = document.getElementById('jw-dukan-note');
        const mInp = document.getElementById('jw-dukan-maker-input');
        if (dInp) dInp.value = getTodayIso();
        if (pInp) pInp.value = '';
        if (nInp) nInp.value = '';
        if (mInp) mInp.value = '';

        updateDukanMakerStockHint();

        const btn = document.getElementById('jw-dukan-save-btn');
        if (btn) btn.textContent = 'Save & A6 Challan [Ctrl+Enter]';
        setDisplay('jw-dukan-cancel-edit-btn', 'none');
    };

    const deleteDukanTransferEntry = (identifier) => {
        if (!confirm('Kya is entry ko delete karna chahte hain? Saree wapas Finished Stock me jud jayegi.')) return;

        try {
            let list = [...getDukanTransfers()];
            let targetItem = null;
            if (typeof identifier === 'string') targetItem = list.find((x) => String(x.id) === identifier);
            else if (typeof identifier === 'number' && list[identifier]) targetItem = list[identifier];

            if (!targetItem) return alert('Entry nahi mili!');

            const refId = targetItem.id;
            list = list.filter((x) => String(x.id) !== String(refId));
            saveDukanTransfers(list);

            const sH = toArray(getFromStore('saree_history')).filter((h) => !h || String(h.refId) !== String(refId));
            setToStore('saree_history', sH);

            triggerAllCachesInvalidation();
            closeDukanInlineDetail();
            cancelDukanEdit();
            renderDukanTransferTable();
            showDukanRightPicker('maker', '');

            if (typeof window.updateJobWorkHubBadges === 'function') window.updateJobWorkHubBadges();
            if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
            if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
        } catch (err) {
            console.error('[DukanEngine] Deletion rollback failure:', err);
            alert('Delete karne me takleef aayi.');
        }
    };

    /* ========================================================================
       6. REGISTER TABLE RENDERER (ZERO ROW BUTTONS + INLINE DETAIL)
       ======================================================================== */
    const renderDukanTransferTable = () => {
        const tbody = document.getElementById('jw-dukan-table-body');
        if (!tbody) return;

        const list = getDukanTransfers();
        const fDate = toIsoDate(document.getElementById('jw-dukan-from-date')?.value || '');
        const tDate = toIsoDate(document.getElementById('jw-dukan-to-date')?.value || '');
        const sTxt = (document.getElementById('jw-dukan-search-input')?.value || '').toLowerCase().trim();

        const filtered = list.filter((d) => {
            if (!d) return false;
            const dIso = toIsoDate(d.date);
            if (fDate && dIso < fDate) return false;
            if (tDate && dIso > tDate) return false;
            if (sTxt) {
                const full = `${d.date || ''} ${d.sareeName || ''} ${d.karigerName || ''} ${d.pcs || ''} ${d.note || ''}`.toLowerCase();
                if (!full.includes(sTxt)) return false;
            }
            return true;
        });

        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        filteredDukanCache = filtered;

        let totCalenderFinished = 0;
        if (typeof window.getCalenderFinishedLiveStats === 'function') {
            totCalenderFinished = safeNum(window.getCalenderFinishedLiveStats().totFinished);
        } else if (typeof window.getJobWorkers === 'function') {
            const workers = window.getJobWorkers().filter((w) => String(w?.type || '').toLowerCase() === 'calender');
            workers.forEach((w) => {
                const sheets = (typeof window.getJobWorkerSheets === 'function') ? window.getJobWorkerSheets(w.id) : [];
                sheets.forEach((sh) => {
                    toArray(sh?.rows).forEach((r) => { totCalenderFinished += safeNum(r?.aayiQty); });
                });
            });
        }

        let totDukanSent = 0;
        list.forEach((d) => { totDukanSent += safeNum(d?.pcs); });
        const bachaInKarkhana = Math.max(0, totCalenderFinished - totDukanSent);

        setText('jw-stat-calender-finished', `${totCalenderFinished} Pcs`);
        setText('jw-stat-dukan-sent', `${totDukanSent} Pcs`);
        setText('jw-stat-karkhana-bacha', `${bachaInKarkhana} Pcs`);

        const pager = document.getElementById('jw-dukan-pagination-controls');
        const totalEntries = filtered.length;

        if (!totalEntries) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:#6b7280;">Koi Dukan Transfer entry nahi mili.</td></tr>';
            if (pager) pager.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(totalEntries / DUKAN_PAGE_SIZE) || 1;
        if (dukanCurrentPage > totalPages) dukanCurrentPage = totalPages;
        if (dukanCurrentPage < 1) dukanCurrentPage = 1;

        const startIndex = (dukanCurrentPage - 1) * DUKAN_PAGE_SIZE;
        const pageRows = filtered.slice(startIndex, startIndex + DUKAN_PAGE_SIZE);

        let html = '';
        pageRows.forEach((d) => {
            const safeId = esc(d.id);
            const activeCls = (String(activeDukanDetailId) === String(d.id)) ? 'jw-row-active' : '';
            html += `<tr class="jw-nav-row ${activeCls}" onclick="DukanEngine.openDukanInlineDetail('${safeId}')">
                <td>${formatDisplay(d.date)}</td>
                <td><strong>${esc(d.sareeName || 'Finished Saree')}</strong></td>
                <td><strong>${esc(d.karigerName || '-')}</strong></td>
                <td style="text-align:right;"><strong style="color:#b47d00;">+${safeNum(d.pcs)} Pcs</strong></td>
                <td>${esc(d.note || 'Apni Dukan')}</td>
                <td style="text-align:right;"><span class="jw-open-ind">Detail &rarr;</span></td>
            </tr>`;
        });

        tbody.innerHTML = html;

        if (pager) {
            pager.innerHTML = `
                <div style="font-size:12px; color:#6b7280; font-weight:600;">
                    Showing <strong>${startIndex + 1}</strong> - <strong>${Math.min(startIndex + DUKAN_PAGE_SIZE, totalEntries)}</strong> of <strong>${totalEntries}</strong> entries
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="jw-btn-sec" ${dukanCurrentPage <= 1 ? 'disabled' : ''} onclick="changeDukanPage(-1)">&larr; Prev</button>
                    <span style="font-size:12px; font-weight:800; padding:4px 8px; background:#fdf6e2; border:1px solid #e5d5a7; border-radius:4px;">${dukanCurrentPage} / ${totalPages}</span>
                    <button type="button" class="jw-btn-sec" ${dukanCurrentPage >= totalPages ? 'disabled' : ''} onclick="changeDukanPage(1)">Next &rarr;</button>
                </div>`;
        }
    };

    const openDukanInlineDetail = (id) => {
        const item = getDukanTransfers().find((x) => String(x.id) === String(id));
        const panel = document.getElementById('jw-dukan-inline-detail');
        if (!item || !panel) return;

        activeDukanDetailId = item.id;
        renderDukanTransferTable();

        const safeId = esc(item.id);
        panel.innerHTML = `
            <div class="jw-inline-head">
                <div>
                    <strong style="font-size:14.5px;">Challan #${esc(String(item.id).slice(-6))} &mdash; ${esc(item.karigerName || '-')}</strong>
                    <span style="margin-left:10px; font-size:12px; color:#b47d00; font-weight:800;">${esc(item.sareeName || 'Finished Saree')} &bull; ${safeNum(item.pcs)} Pcs</span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="jw-btn-gold" onclick="printSingleDukanSlip('${safeId}')">A6 Parchi Print</button>
                    <button type="button" class="jw-btn-sec" onclick="editDukanTransferEntry('${safeId}')">Edit Entry</button>
                    <button type="button" class="jw-btn-del" onclick="deleteDukanTransferEntry('${safeId}')">Delete</button>
                    <button type="button" class="jw-btn-sec" onclick="DukanEngine.closeDukanInlineDetail()">Close [Esc]</button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px; font-size:12.5px;">
                <div><span style="color:#6b7280;">Tarikh:</span> <strong>${formatDisplay(item.date)}</strong></div>
                <div><span style="color:#6b7280;">Kariger (Maker):</span> <strong>${esc(item.karigerName || '-')}</strong></div>
                <div><span style="color:#6b7280;">Saree Design:</span> <strong>${esc(item.sareeName || '-')}</strong></div>
                <div><span style="color:#6b7280;">Receiver / Note:</span> <strong>${esc(item.note || 'Apni Dukan')}</strong></div>
            </div>
        `;
        panel.style.display = 'block';
        panel.scrollIntoView({ block: 'nearest' });
    };

    const closeDukanInlineDetail = () => {
        activeDukanDetailId = null;
        setDisplay('jw-dukan-inline-detail', 'none');
        renderDukanTransferTable();
    };

    const changeDukanPage = (delta) => {
        dukanCurrentPage += delta;
        renderDukanTransferTable();
    };

    const resetDukanFilter = () => {
        const f = document.getElementById('jw-dukan-from-date');
        const t = document.getElementById('jw-dukan-to-date');
        const s = document.getElementById('jw-dukan-search-input');
        if (f) f.value = '';
        if (t) t.value = '';
        if (s) s.value = '';
        dukanCurrentPage = 1;
        renderDukanTransferTable();
    };

    /* ========================================================================
       7. SAFE PASSBOOK HOOK (PRESERVING #item-modal DOM INTEGRITY)
       ======================================================================== */
    const openDukanPassbookModal = () => {
        const modal = document.getElementById('item-modal');
        const tbody = document.getElementById('modal-history-body');
        const title = document.getElementById('modal-item-title');
        if (!modal || !tbody) return;

        if (title) title.textContent = 'Dukan Bheja Passbook';
        const list = [...getDukanTransfers()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#6b7280;">Koi Dukan entry nahi mili.</td></tr>';
        } else {
            let html = '<tr style="background:#fdf6e2; font-weight:800;"><td>TARIKH</td><td>SAREE</td><td>KARIGER</td><td>RECEIVER</td><td style="text-align:right;">PCS</td></tr>';
            list.slice(0, 100).forEach((d) => {
                html += `<tr>
                    <td>${formatDisplay(d.date)}</td>
                    <td>${esc(d.sareeName || 'Finished Saree')}</td>
                    <td><strong>${esc(d.karigerName || '-')}</strong></td>
                    <td>${esc(d.note || 'Apni Dukan')}</td>
                    <td style="text-align:right; font-weight:800; color:#b47d00;">-${safeNum(d.pcs)} Pcs</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }
        modal.style.display = 'flex';
    };

    /* ========================================================================
       8. A6 THERMAL CHALLAN & STATEMENT PRINT ENGINES
       ======================================================================== */
    const printDukanBatchChallan = (batch) => {
        if (!batch || !batch.items || !batch.items.length) return alert('Print karne ke liye koi batch nahi mili!');

        let tot = 0;
        let rowsHtml = '';
        batch.items.forEach((it, idx) => {
            const q = safeNum(it.qty);
            tot += q;
            rowsHtml += `<tr style="border-bottom:1px dashed #ccc;">
                <td style="padding:4px 2px;">${idx + 1}</td>
                <td style="padding:4px 2px; font-weight:bold;">${esc(it.maker)}</td>
                <td style="padding:4px 2px;">${esc(it.saree)}</td>
                <td style="padding:4px 2px; text-align:right; font-weight:bold;">${q}</td>
            </tr>`;
        });

        const pw = window.open('', '', 'width=420,height=580');
        if (!pw) return alert('Popup block hai! Kripya allow karein.');

        pw.document.write(`<html><head><title>Dukan Dispatch Challan - A6</title>
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
                <div class="header"><h2>SIMPLICITY ERP</h2><p>DUKAN DISPATCH CHALLAN</p></div>
                <div class="meta">
                    <div><strong>Receiver:</strong> ${esc(batch.note || 'Apni Dukan')}</div>
                    <div><strong>Tarikh:</strong> ${formatDisplay(batch.date)}</div>
                </div>
                <table><thead><tr><th>#</th><th>BUNNE WALA</th><th>SAREE</th><th style="text-align:right;">PCS</th></tr></thead>
                <tbody>${rowsHtml}</tbody></table>
                <div class="total-box">KUL DUKAN BHEJA: ${tot} Pcs</div>
                <div class="signs"><div>हस्ताक्षर मुंशी<br><br>________</div><div>दुकान रिसीवर<br><br>________</div></div>
            </div>
            <script>window.onload=function(){window.focus();window.print();setTimeout(()=>window.close(),600);};<\/script>
            </body></html>`);
        pw.document.close();
    };

    const printLastDukanBatch = () => {
        if (!lastSavedDukanBatch) return alert('Abhi koi recent Dukan challan save nahi hua hai.');
        printDukanBatchChallan(lastSavedDukanBatch);
    };

    const printSingleDukanSlip = (id) => {
        const item = getDukanTransfers().find((x) => String(x.id) === String(id));
        if (!item) return alert('Parchi nahi mili!');
        printDukanBatchChallan({
            date: item.date,
            note: item.note || 'Apni Dukan',
            items: [{ maker: item.karigerName || '-', saree: item.sareeName || 'Finished Saree', qty: item.pcs }]
        });
    };

    const printDukanStatementReport = () => {
        const rows = filteredDukanCache;
        if (!rows || !rows.length) return alert('Print karne ke liye koi data nahi mila!');

        const fDate = document.getElementById('jw-dukan-from-date')?.value || '';
        const tDate = document.getElementById('jw-dukan-to-date')?.value || '';
        const dateRangeTxt = (fDate && tDate) ? `${fDate} se ${tDate}` : (fDate ? `${fDate} ke baad` : (tDate ? `${tDate} tak` : 'Sabhi Tarikh'));

        let totalPcs = 0;
        let rowsHtml = '';
        rows.forEach((r, idx) => {
            const pcs = safeNum(r.pcs);
            totalPcs += pcs;
            rowsHtml += `<tr style="border-bottom:1px dashed #ccc;">
                <td style="padding:3px 2px;">${idx + 1}</td>
                <td style="padding:3px 2px;">${formatDisplay(r.date)}</td>
                <td style="padding:3px 2px; font-weight:bold;">${esc(r.sareeName || 'Saree')}</td>
                <td style="padding:3px 2px;">${esc(r.karigerName || '-')}</td>
                <td style="padding:3px 2px;">${esc(r.note || 'Dukan')}</td>
                <td style="padding:3px 2px; text-align:right; font-weight:bold;">${pcs}</td>
            </tr>`;
        });

        const pw = window.open('', '', 'width=450,height=650');
        if (!pw) return alert('Popup block hai! Kripya allow karein.');

        pw.document.write(`<html><head><title>Dukan Outward Report - A6</title>
            <style>
                @page { size: A6 portrait; margin: 4mm; }
                body { font-family: monospace, sans-serif; font-size: 11px; margin: 0; padding: 4mm; color: #000; }
                .ticket { width: 100%; max-width: 96mm; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
                .header h2 { margin: 0; font-size: 15px; text-transform: uppercase; }
                .meta { font-size: 10px; margin-bottom: 6px; border-bottom: 1px dashed #666; padding-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 3px 2px; }
                .total-box { margin-top: 8px; border-top: 2px dashed #000; padding-top: 4px; font-size: 11px; font-weight: bold; display: flex; justify-content: space-between; }
                .footer { text-align: center; margin-top: 25px; font-size: 10px; border-top: 1px dashed #aaa; padding-top: 6px; }
            </style></head><body>
            <div class="ticket">
                <div class="header"><h2>SIMPLICITY ERP</h2><p>DUKAN BHEJA STATEMENT</p></div>
                <div class="meta"><div><strong>Avadhi:</strong> ${esc(dateRangeTxt)}</div><div><strong>Total Challan:</strong> ${rows.length}</div></div>
                <table><thead><tr><th>#</th><th>TARIKH</th><th>SAREE</th><th>MAKER</th><th>RECEIVER</th><th style="text-align:right;">PCS</th></tr></thead>
                <tbody>${rowsHtml}</tbody></table>
                <div class="total-box"><span>KUL BHEJI SAREE:</span><span>${totalPcs} Pcs</span></div>
                <div class="footer"><p>हस्ताक्षर / मुंशी: ____________________</p></div>
            </div>
            <script>window.onload=function(){window.focus();window.print();setTimeout(()=>window.close(),600);};<\/script>
            </body></html>`);
        pw.document.close();
    };

    /* ========================================================================
       9. KEYBOARD BINDINGS FOR DUKAN BATCH VOUCHER (LOAD-ORDER SAFE)
       ======================================================================== */
    const bindDukanVoucherEvents = () => {
        const recInp = document.getElementById('jw-dukan-receiver-input');
        const noteInp = document.getElementById('jw-dukan-note');
        const dateInp = document.getElementById('jw-dukan-date');
        const makerInp = document.getElementById('jw-dukan-maker-input');
        const pcsInp = document.getElementById('jw-dukan-pcs');
        const yesPrint = document.getElementById('jw-dukan-accept-yes-print');
        const yesOnly = document.getElementById('jw-dukan-accept-yes');

        if (recInp && !recInp.dataset.dukanBound) {
            recInp.dataset.dukanBound = '1';
            recInp.addEventListener('focus', () => showDukanRightPicker('receiver', ''));
            recInp.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (dukanPickerItems.length) {
                        e.preventDefault();
                        dukanPickerActiveIdx = e.key === 'ArrowDown'
                            ? (dukanPickerActiveIdx + 1) % dukanPickerItems.length
                            : (dukanPickerActiveIdx - 1 + dukanPickerItems.length) % dukanPickerItems.length;
                        renderDukanRightPickerList();
                    }
                } else if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (dukanPickerItems[dukanPickerActiveIdx]) pickDukanItem(dukanPickerActiveIdx);
                }
            });
        }

        if (noteInp && !noteInp.dataset.dukanBound) {
            noteInp.dataset.dukanBound = '1';
            noteInp.addEventListener('focus', () => showDukanRightPicker('summary', ''));
            noteInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    focusDukanField('jw-dukan-date');
                }
            });
        }

        if (dateInp && !dateInp.dataset.dukanBound) {
            dateInp.dataset.dukanBound = '1';
            dateInp.addEventListener('focus', () => showDukanRightPicker('summary', ''));
            dateInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    focusDukanField('jw-dukan-maker-input');
                }
            });
        }

        if (makerInp && !makerInp.dataset.dukanBound) {
            makerInp.dataset.dukanBound = '1';
            makerInp.addEventListener('focus', () => {
                dukanMakerArrowUsed = false;
                dukanPickerActiveIdx = 0;
                showDukanRightPicker('maker', makerInp.value);
            });
            makerInp.addEventListener('input', () => {
                dukanMakerArrowUsed = true;
                dukanPickerActiveIdx = 0;
                showDukanRightPicker('maker', makerInp.value);
                updateDukanMakerStockHint();
            });
            makerInp.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (dukanPickerItems.length) {
                        e.preventDefault();
                        dukanMakerArrowUsed = true;
                        dukanPickerActiveIdx = e.key === 'ArrowDown'
                            ? (dukanPickerActiveIdx + 1) % dukanPickerItems.length
                            : (dukanPickerActiveIdx - 1 + dukanPickerItems.length) % dukanPickerItems.length;
                        renderDukanRightPickerList();
                    }
                    return;
                }
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    const typed = makerInp.value.trim();
                    if (!typed && dukanBatchItems.length > 0 && !dukanMakerArrowUsed) {
                        showDukanAcceptPrompt(true);
                        return;
                    }
                    if (dukanPickerItems.length && (dukanMakerArrowUsed || typed !== '' || dukanBatchItems.length === 0)) {
                        pickDukanItem(dukanPickerActiveIdx);
                    }
                }
            });
        }

        if (pcsInp && !pcsInp.dataset.dukanBound) {
            pcsInp.dataset.dukanBound = '1';
            pcsInp.addEventListener('focus', () => showDukanRightPicker('summary', ''));
            pcsInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    if (dukanEditId) addDukanTransferEntry(false);
                    else addDukanBatchRow();
                }
            });
        }

        const handleAcceptKeys = (e, isPrintBtn) => {
            if (e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation();
                addDukanTransferEntry(isPrintBtn);
            } else if (e.key === 'p' || e.key === 'P') {
                e.preventDefault(); e.stopPropagation();
                addDukanTransferEntry(true);
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault(); e.stopPropagation();
                addDukanTransferEntry(false);
            } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                cancelDukanAccept();
            }
        };
        if (yesPrint && !yesPrint.dataset.dukanBound) {
            yesPrint.dataset.dukanBound = '1';
            yesPrint.addEventListener('keydown', (e) => handleAcceptKeys(e, true));
        }
        if (yesOnly && !yesOnly.dataset.dukanBound) {
            yesOnly.dataset.dukanBound = '1';
            yesOnly.addEventListener('keydown', (e) => handleAcceptKeys(e, false));
        }

        if (!dukanGlobalKeyBound) {
            dukanGlobalKeyBound = true;
            window.addEventListener('keydown', (e) => {
                if (!isDukanVisible()) return;
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    addDukanTransferEntry(true);
                } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    printDukanStatementReport();
                } else if (e.key === 'Escape' && document.getElementById('jw-dukan-accept-strip')?.style.display !== 'none') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    cancelDukanAccept();
                }
            });
        }
    };

    /* ========================================================================
       10. GLOBAL EXPORT
       ======================================================================== */
    const dukanAPI = {
        initDukanVoucher,
        getDukanTransfers,
        saveDukanTransfers,
        addDukanBatchRow,
        removeDukanBatchItem,
        pickDukanItem,
        cancelDukanAccept,
        addDukanTransferEntry,
        editDukanTransferEntry,
        cancelDukanEdit,
        deleteDukanTransferEntry,
        filterDukanTransfers: renderDukanTransferTable,
        resetDukanFilter,
        renderDukanTransferTable,
        openDukanInlineDetail,
        closeDukanInlineDetail,
        changeDukanPage,
        openDukanPassbookModal,
        resetDukanPassbookFilter: () => {},
        applyDukanPassbookFilter: () => {},
        changeDukanPassbookPage: () => {},
        printSingleDukanSlip,
        printLastDukanBatch,
        printDukanStatementReport,
        populateDukanSareeDropdown
    };

    Object.keys(dukanAPI).forEach((fnName) => {
        window[fnName] = dukanAPI[fnName];
    });

    window.DukanEngine = dukanAPI;

    window.addEventListener('load', bindDukanVoucherEvents);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = dukanAPI;
    }
})();
