/* ============================================================================
   SIMPLICITY ERP - KARIGER INFO LEDGER (DYNAMIC + COLUMNS & UNIVERSAL SEARCH)
   File: info/info-ledger.js • Developed by Farhan Jawed
   Architecture: Row-by-Row Global Sync + Live Sheet Auto-Sync + 20-Row Paging
   Columns: Name, Saree, Mob, Address, Bana, Zari, Chukka, Tani, Bani,
            Kadi, Baithka + Unlimited Dynamic '+' Custom Columns
============================================================================ */

(() => {
    'use strict';

    const PAGE_SIZE = 20;
    const META_ROW_ID = '__columns__';

    let currentKarkhanaFilter = 'all';
    let currentSearchQuery = '';
    let currentPage = 1;
    let isInternalSyncRunning = false;
    let syncTimer = null;

    const esc = (s) => {
        if (typeof window.sanitizeHTML === 'function') return window.sanitizeHTML(s);
        return String(s ?? '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    const getKarigersSafe = () => {
        if (typeof window.sanitizeKarigerList === 'function') {
            return window.sanitizeKarigerList();
        }
        const raw = typeof window.getStore === 'function' ? window.getStore('kariger_list') : [];
        const list = Array.isArray(raw) ? raw : [];
        return list.filter((k) => k && k.name && String(k.name).trim() !== '');
    };

    const getSheetsSafe = (karigerId) => {
        if (!karigerId) return [];
        if (typeof window.getKarigerSheets === 'function') {
            const sh = window.getKarigerSheets(karigerId);
            return Array.isArray(sh) ? sh : [];
        }
        const raw = typeof window.getStore === 'function' ? window.getStore(`kariger_sheets_${karigerId}`) : [];
        return Array.isArray(raw) ? raw : [];
    };

    const getStoredInfoArray = () => {
        const raw = typeof window.getStore === 'function' ? window.getStore('info_ledger') : [];
        return Array.isArray(raw) ? raw : [];
    };

    const extractLatestSheetInfo = (karigerId) => {
        const sheets = getSheetsSafe(karigerId);
        const latest = sheets.length ? sheets[sheets.length - 1] : null;
        if (!latest || typeof latest !== 'object') {
            return { bana: '', zari: '', chukka: '', tani: '', bani: '' };
        }

        const bana = String(latest.banaItem || '').trim();
        const zari = String(latest.zariItem || '').trim();

        const chukkaItem = String(latest.chukkaItem || '').trim();
        const chukkaSancha = String(latest.chukkaSancha || '').trim();
        let chukka = '';
        if (chukkaItem && chukkaSancha && chukkaItem.toLowerCase() !== chukkaSancha.toLowerCase()) {
            chukka = `${chukkaItem} (${chukkaSancha})`;
        } else {
            chukka = chukkaItem || chukkaSancha;
        }

        const taniItem = String(latest.taniItem || '').trim();
        const taniSancha = String(latest.taniSancha || '').trim();
        let tani = '';
        if (taniItem && taniSancha && taniItem.toLowerCase() !== taniSancha.toLowerCase()) {
            tani = `${taniItem} (${taniSancha})`;
        } else {
            tani = taniItem || taniSancha;
        }

        const baniRaw = latest.rateBani;
        const bani = (baniRaw !== undefined && baniRaw !== null && String(baniRaw).trim() !== '')
            ? String(baniRaw).trim()
            : '';

        return { bana, zari, chukka, tani, bani };
    };

    const buildMergedSnapshot = () => {
        const rawArr = getStoredInfoArray();
        let metaRow = null;
        const storedById = new Map();

        rawArr.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            const rid = String(row.id || '').trim();
            if (!rid) return;
            if (rid === META_ROW_ID || row.rowType === 'columns_meta') {
                metaRow = {
                    id: META_ROW_ID,
                    rowType: 'columns_meta',
                    customCols: Array.isArray(row.customCols)
                        ? row.customCols.filter((c) => c && c.id && c.label)
                        : []
                };
            } else {
                storedById.set(rid, row);
            }
        });

        if (!metaRow) {
            metaRow = { id: META_ROW_ID, rowType: 'columns_meta', customCols: [] };
        }

        const karigers = getKarigersSafe();
        const mergedRows = [];

        karigers.forEach((k) => {
            const kid = String(k.id || '').trim();
            if (!kid) return;

            const prev = storedById.get(kid) || {};
            const liveSheet = extractLatestSheetInfo(kid);
            const addr = String(k.mohalla || k.address || k.pata || '').trim();

            mergedRows.push({
                id: kid,
                rowType: 'kariger_info',
                karigerId: kid,
                name: String(k.name || '').trim(),
                saree: String(k.saree || '').trim(),
                mobile: String(k.mobile || '').trim(),
                address: addr,
                bana: liveSheet.bana,
                zari: liveSheet.zari,
                chukka: liveSheet.chukka,
                tani: liveSheet.tani,
                bani: liveSheet.bani,
                kadi: String(prev.kadi || ''),
                baithka: String(prev.baithka || ''),
                custom: (prev.custom && typeof prev.custom === 'object' && !Array.isArray(prev.custom))
                    ? { ...prev.custom }
                    : {},
                karkhanaId: k.karkhanaId || 'k_main',
                karkhanaName: k.karkhanaName || ''
            });
        });

        return { metaRow, mergedRows, rawArr };
    };

    const persistInfoArrayIfChanged = (metaRow, mergedRows, rawArr, forceSave = false) => {
        if (window.isBackupPreviewMode || window.isRemoteUpdating || isInternalSyncRunning) return;
        if (typeof window.setStore !== 'function') return;

        const nextArr = [
            {
                id: META_ROW_ID,
                rowType: 'columns_meta',
                customCols: metaRow.customCols || []
            },
            ...mergedRows.map((r) => ({
                id: r.id,
                rowType: 'kariger_info',
                karigerId: r.karigerId,
                name: r.name,
                saree: r.saree,
                mobile: r.mobile,
                address: r.address,
                bana: r.bana,
                zari: r.zari,
                chukka: r.chukka,
                tani: r.tani,
                bani: r.bani,
                kadi: r.kadi,
                baithka: r.baithka,
                custom: r.custom || {}
            }))
        ];

        if (!forceSave) {
            let prevStr = '';
            let nextStr = '';
            try {
                prevStr = JSON.stringify(rawArr);
                nextStr = JSON.stringify(nextArr);
            } catch (_) {}
            if (prevStr === nextStr) return;
        }

        isInternalSyncRunning = true;
        try {
            window.setStore('info_ledger', nextArr);
        } finally {
            isInternalSyncRunning = false;
        }
    };

    const syncAllKarigersToInfoLedger = () => {
        if (window.isBackupPreviewMode || window.isRemoteUpdating) return;
        const { metaRow, mergedRows, rawArr } = buildMergedSnapshot();
        persistInfoArrayIfChanged(metaRow, mergedRows, rawArr, false);
        updateInfoLedgerBadge();
        const sec = document.getElementById('info-ledger-section');
        if (sec && sec.style.display !== 'none') {
            renderInfoLedgerTable(false);
        }
    };

    const scheduleInfoLedgerSync = () => {
        if (window.isBackupPreviewMode || window.isRemoteUpdating) return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncTimer = null;
            syncAllKarigersToInfoLedger();
        }, 120);
    };

    /* ========================================================================
       UI SHELL INJECTION & STYLES
    ======================================================================== */
    const ensureInfoLedgerSection = () => {
        if (!document.getElementById('info-ledger-styles')) {
            const st = document.createElement('style');
            st.id = 'info-ledger-styles';
            st.textContent = `
                .il-wrap { background:#ffffff; border-radius:14px; border:1px solid #e2e8f0; padding:14px; box-shadow:0 4px 14px rgba(15,23,42,0.05); }
                .il-search-bar {
                    display:flex; gap:10px; align-items:center; flex-wrap:wrap;
                    background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px;
                    padding:10px 12px; margin-bottom:12px;
                }
                .il-search-input-wrap {
                    position:relative; flex:1; min-width:240px; display:flex; align-items:center;
                }
                .il-search-input {
                    width:100%; padding:10px 36px 10px 14px; border:1.5px solid #6366f1;
                    border-radius:9px; font-size:13.5px; font-weight:600; color:#0f172a;
                    background:#ffffff; outline:none; box-sizing:border-box;
                }
                .il-search-input:focus { box-shadow:0 0 0 3px rgba(99,102,241,0.18); }
                .il-clear-btn {
                    position:absolute; right:8px; background:#e2e8f0; color:#334155; border:none;
                    width:22px; height:22px; border-radius:50%; font-size:12px; font-weight:800;
                    cursor:pointer; display:none; align-items:center; justify-content:center;
                }
                .il-table-wrap { overflow-x:auto; border:1px solid #e2e8f0; border-radius:10px; }
                .il-table { width:100%; border-collapse:collapse; font-size:12.5px; min-width:1180px; }
                .il-table thead tr { background:#312e81; color:#ffffff; }
                .il-table th {
                    padding:10px 8px; text-align:left; font-weight:800; font-size:11.5px;
                    white-space:nowrap; border-right:1px solid rgba(255,255,255,0.12);
                }
                .il-table td {
                    padding:7px 8px; border-bottom:1px solid #f1f5f9; border-right:1px solid #f1f5f9;
                    vertical-align:middle; color:#0f172a;
                }
                .il-table tbody tr:hover { background:#f8fafc; }
                .il-cell-input {
                    width:100%; min-width:86px; padding:5px 7px; border:1px solid #cbd5e1;
                    border-radius:6px; font-size:12px; font-weight:600; color:#0f172a;
                    background:#ffffff; box-sizing:border-box; transition:border-color 0.15s, background 0.15s;
                }
                .il-cell-input:focus {
                    outline:none; border-color:#4f46e5; background:#eef2ff;
                }
                .il-cell-input:read-only { background:#f1f5f9; color:#475569; cursor:not-allowed; }
                .il-plus-th-btn {
                    background:#22c55e; color:#ffffff; border:none; width:28px; height:28px;
                    border-radius:8px; font-size:18px; font-weight:900; line-height:1;
                    cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
                    box-shadow:0 2px 6px rgba(34,197,94,0.35);
                }
                .il-plus-th-btn:hover { background:#16a34a; transform:scale(1.06); }
                .il-custom-th-wrap { display:inline-flex; align-items:center; gap:5px; }
                .il-th-mini-btn {
                    background:rgba(255,255,255,0.16); color:#ffffff; border:none;
                    border-radius:4px; padding:1px 5px; font-size:10px; cursor:pointer;
                }
                .il-th-mini-btn:hover { background:rgba(255,255,255,0.3); }
                .il-pill-auto {
                    display:inline-block; padding:3px 7px; border-radius:6px; font-size:11.5px;
                    font-weight:700; white-space:nowrap;
                }
                .il-pag-bar {
                    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;
                    gap:10px; margin-top:12px; padding-top:10px; border-top:1px solid #e2e8f0;
                }
            `;
            document.head.appendChild(st);
        }

        let sec = document.getElementById('info-ledger-section');
        if (sec) return sec;

        const container = document.querySelector('.main-container') || document.body;
        sec = document.createElement('section');
        sec.id = 'info-ledger-section';
        sec.className = 'module-section';
        sec.style.display = 'none';
        sec.innerHTML = `
            <div class="module-header">
                <button type="button" class="back-btn" onclick="backToDashboard()">← Dashboard</button>
                <h2 style="color:#4338ca; font-size:19px;">📋 Info Ledger (Kariger Directory)</h2>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <span id="info-ledger-save-badge" style="font-size:11.5px; font-weight:800; color:#15803d; background:#dcfce7; padding:4px 10px; border-radius:99px; display:none;">✅ Saved</span>
                    <button type="button" class="add-btn" style="background:#4f46e5;" onclick="addInfoLedgerCustomColumn()">+ Naya Column</button>
                </div>
            </div>

            <div class="il-wrap">
                <div id="info-karkhana-tabs-bar" class="sheet-tabs-bar" style="margin-bottom:12px;"></div>

                <div class="il-search-bar">
                    <div class="il-search-input-wrap">
                        <input type="text" id="search-info-ledger-input" class="il-search-input"
                               placeholder="🔍 Universal Search: Name, Saree, Mob, Address, Bana, Zari, Chukka, Tani, Kadi, Baithka ya koi bhi column..."
                               oninput="handleInfoLedgerSearch(this.value)">
                        <button type="button" id="info-search-clear-btn" class="il-clear-btn" onclick="clearInfoLedgerSearch()" title="Clear Search">✕</button>
                    </div>
                    <div id="info-search-stats" style="font-size:12px; font-weight:700; color:#475569;"></div>
                </div>

                <div class="il-table-wrap">
                    <table class="il-table">
                        <thead id="info-ledger-thead"></thead>
                        <tbody id="info-ledger-tbody"></tbody>
                    </table>
                </div>

                <div id="info-ledger-pagination-bar" class="il-pag-bar"></div>
            </div>
        `;
        container.appendChild(sec);
        return sec;
    };

    const flashSavedBadge = () => {
        const el = document.getElementById('info-ledger-save-badge');
        if (!el) return;
        el.style.display = 'inline-block';
        clearTimeout(el._hideTmr);
        el._hideTmr = setTimeout(() => { el.style.display = 'none'; }, 1400);
    };

    const updateInfoLedgerBadge = () => {
        const badge = document.getElementById('btn-total-info');
        if (!badge) return;
        const count = getKarigersSafe().length;
        badge.textContent = `Total: ${count}`;
    };

    /* ========================================================================
       KARKHANA TABS, SEARCH & 20-ROW PAGINATION
    ======================================================================== */
    const renderInfoKarkhanaTabs = (allRows) => {
        const bar = document.getElementById('info-karkhana-tabs-bar');
        if (!bar) return;

        let karkhanas = (typeof window.getKarkhanasSafe === 'function')
            ? window.getKarkhanasSafe()
            : (Array.isArray(window.getStore?.('karkhana_list')) ? window.getStore('karkhana_list') : []);
        if (!karkhanas.length) karkhanas = [{ id: 'k_main', name: 'Main Godown', isDefault: true }];

        let html = `<button type="button" class="sheet-tab ${currentKarkhanaFilter === 'all' ? 'active' : ''}" onclick="switchInfoKarkhanaTab('all')">👥 Sabhi (${allRows.length})</button>`;

        karkhanas.forEach((k) => {
            const count = allRows.filter((r) =>
                String(r.karkhanaId) === String(k.id) || (!r.karkhanaId && (k.isDefault || k.id === 'k_main'))
            ).length;
            const isMain = (k.id === 'k_main' || k.isDefault);
            const icon = isMain ? '🏢 ' : '🏭 ';
            const isActive = String(currentKarkhanaFilter) === String(k.id) ? 'active' : '';
            html += `<button type="button" class="sheet-tab ${isActive}" onclick="switchInfoKarkhanaTab('${esc(k.id)}')">${icon}${esc(k.name)} (${count})</button>`;
        });

        bar.innerHTML = html;
    };

    const switchInfoKarkhanaTab = (kId) => {
        currentKarkhanaFilter = kId || 'all';
        currentPage = 1;
        renderInfoLedgerTable(false);
    };

    const handleInfoLedgerSearch = (val) => {
        currentSearchQuery = String(val || '');
        currentPage = 1;
        const clearBtn = document.getElementById('info-search-clear-btn');
        if (clearBtn) clearBtn.style.display = currentSearchQuery.trim() ? 'flex' : 'none';
        renderInfoLedgerTable(false);
    };

    const clearInfoLedgerSearch = () => {
        const inp = document.getElementById('search-info-ledger-input');
        if (inp) inp.value = '';
        handleInfoLedgerSearch('');
    };

    const nextInfoLedgerPage = () => {
        currentPage++;
        renderInfoLedgerTable(false);
    };

    const prevInfoLedgerPage = () => {
        if (currentPage > 1) {
            currentPage--;
            renderInfoLedgerTable(false);
        }
    };

    /* ========================================================================
       DYNAMIC '+' CUSTOM COLUMNS (ADD / RENAME / DELETE)
    ======================================================================== */
    const addInfoLedgerCustomColumn = () => {
        if (window.isBackupPreviewMode) return alert('👁️ Preview Mode me naya column add nahi ho sakta.');
        const label = prompt('Naye Column ka Naam likhein (jaise: Loom No, Paai, Border, Note):');
        if (!label || !label.trim()) return;

        const cleanLabel = label.trim().slice(0, 40);
        const { metaRow, mergedRows, rawArr } = buildMergedSnapshot();

        const duplicate = (metaRow.customCols || []).some(
            (c) => String(c.label || '').trim().toLowerCase() === cleanLabel.toLowerCase()
        );
        if (duplicate) return alert('⚠️ Is naam ka column pehle se maujood hai!');

        metaRow.customCols.push({
            id: `col_${Date.now()}`,
            label: cleanLabel
        });

        persistInfoArrayIfChanged(metaRow, mergedRows, rawArr, true);
        flashSavedBadge();
        renderInfoLedgerTable(false);
    };

    const renameInfoLedgerCustomColumn = (colId) => {
        if (window.isBackupPreviewMode) return alert('👁️ Preview Mode me rename nahi ho sakta.');
        const { metaRow, mergedRows, rawArr } = buildMergedSnapshot();
        const col = (metaRow.customCols || []).find((c) => String(c.id) === String(colId));
        if (!col) return;

        const nextName = prompt('Column ka naya naam likhein:', col.label);
        if (!nextName || !nextName.trim()) return;
        col.label = nextName.trim().slice(0, 40);

        persistInfoArrayIfChanged(metaRow, mergedRows, rawArr, true);
        flashSavedBadge();
        renderInfoLedgerTable(false);
    };

    const deleteInfoLedgerCustomColumn = (colId) => {
        if (window.isBackupPreviewMode) return alert('👁️ Preview Mode me delete nahi ho sakta.');
        const { metaRow, mergedRows, rawArr } = buildMergedSnapshot();
        const col = (metaRow.customCols || []).find((c) => String(c.id) === String(colId));
        if (!col) return;

        if (!confirm(`Kya aap '${col.label}' column aur uska data sabhi rows se hatana chahte hain?`)) return;

        metaRow.customCols = (metaRow.customCols || []).filter((c) => String(c.id) !== String(colId));
        mergedRows.forEach((r) => {
            if (r.custom && Object.prototype.hasOwnProperty.call(r.custom, colId)) {
                delete r.custom[colId];
            }
        });

        persistInfoArrayIfChanged(metaRow, mergedRows, rawArr, true);
        flashSavedBadge();
        renderInfoLedgerTable(false);
    };

    /* ========================================================================
       INLINE CELL SAVE (ADDRESS, KADI, BAITHKA & CUSTOM COLUMNS)
    ======================================================================== */
    const saveInfoLedgerCell = (karigerId, fieldKey, value, isCustom = false) => {
        if (window.isBackupPreviewMode) return;
        const cleanVal = String(value ?? '').trim();

        // Address edit hone par kariger_list me bhi sync karein
        if (!isCustom && fieldKey === 'address') {
            const kList = getKarigersSafe();
            const targetK = kList.find((x) => String(x.id) === String(karigerId));
            if (targetK && String(targetK.mohalla || targetK.address || targetK.pata || '').trim() !== cleanVal) {
                targetK.mohalla = cleanVal;
                if (typeof window.setStore === 'function') {
                    isInternalSyncRunning = true;
                    try {
                        window.setStore('kariger_list', kList);
                    } finally {
                        isInternalSyncRunning = false;
                    }
                }
                if (typeof window.renderKarigerTable === 'function') {
                    window.renderKarigerTable();
                }
            }
        }

        const { metaRow, mergedRows, rawArr } = buildMergedSnapshot();
        const row = mergedRows.find((r) => String(r.id) === String(karigerId));
        if (!row) return;

        if (isCustom) {
            if (!row.custom || typeof row.custom !== 'object') row.custom = {};
            if (String(row.custom[fieldKey] || '') === cleanVal) return;
            row.custom[fieldKey] = cleanVal;
        } else {
            if (fieldKey === 'kadi' && String(row.kadi || '') === cleanVal) return;
            if (fieldKey === 'baithka' && String(row.baithka || '') === cleanVal) return;
            if (fieldKey === 'address') {
                row.address = cleanVal;
            } else {
                row[fieldKey] = cleanVal;
            }
        }

        persistInfoArrayIfChanged(metaRow, mergedRows, rawArr, true);
        flashSavedBadge();
    };

    const handleCellKeyDown = (e, karigerId, colKey) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.target.blur();
        const inputs = Array.from(document.querySelectorAll(`.il-cell-input[data-col="${CSS.escape(colKey)}"]`));
        const idx = inputs.indexOf(e.target);
        if (idx >= 0 && idx + 1 < inputs.length) {
            inputs[idx + 1].focus();
            inputs[idx + 1].select();
        }
    };

    /* ========================================================================
       TABLE RENDERER (UNIVERSAL SEARCH + 20-ROW PAGINATION)
    ======================================================================== */
    const renderInfoLedgerTable = (syncIfNeeded = true) => {
        ensureInfoLedgerSection();
        updateInfoLedgerBadge();

        const { metaRow, mergedRows, rawArr } = buildMergedSnapshot();
        if (syncIfNeeded) {
            persistInfoArrayIfChanged(metaRow, mergedRows, rawArr, false);
        }

        renderInfoKarkhanaTabs(mergedRows);

        const customCols = Array.isArray(metaRow.customCols) ? metaRow.customCols : [];
        const isPreview = Boolean(window.isBackupPreviewMode);

        // 1. Karkhana Filter
        let list = mergedRows;
        if (currentKarkhanaFilter !== 'all') {
            list = list.filter((r) =>
                String(r.karkhanaId) === String(currentKarkhanaFilter) ||
                (!r.karkhanaId && currentKarkhanaFilter === 'k_main')
            );
        }

        // 2. Universal Search across ALL fixed + dynamic '+' columns
        const q = currentSearchQuery.trim().toLowerCase();
        if (q) {
            const terms = q.split(/\s+/).filter(Boolean);
            list = list.filter((r) => {
                const kName = r.karkhanaName || (typeof window.getKarkhanaNameById === 'function' ? window.getKarkhanaNameById(r.karkhanaId) : '');
                const customVals = customCols.map((c) => r.custom?.[c.id] || '').join(' ');
                const haystack = [
                    r.name, r.saree, r.mobile, r.address, kName,
                    r.bana, r.zari, r.chukka, r.tani, r.bani,
                    r.kadi, r.baithka, customVals
                ].join(' ').toLowerCase();
                return terms.every((t) => haystack.includes(t));
            });
        }

        const totalItems = list.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const statsEl = document.getElementById('info-search-stats');
        if (statsEl) {
            statsEl.textContent = q
                ? `🔎 Match: ${totalItems} / ${mergedRows.length} Kariger`
                : `👥 Kul Kariger: ${totalItems}`;
        }

        // Render <thead> with '+' column button
        const thead = document.getElementById('info-ledger-thead');
        if (thead) {
            const customThs = customCols.map((c) => `
                <th>
                    <div class="il-custom-th-wrap">
                        <span>${esc(c.label)}</span>
                        ${!isPreview ? `
                            <button type="button" class="il-th-mini-btn" title="Rename Column" onclick="renameInfoLedgerCustomColumn('${esc(c.id)}')">✏️</button>
                            <button type="button" class="il-th-mini-btn" title="Delete Column" onclick="deleteInfoLedgerCustomColumn('${esc(c.id)}')">✕</button>
                        ` : ''}
                    </div>
                </th>
            `).join('');

            thead.innerHTML = `
                <tr>
                    <th style="width:44px; text-align:center;">#</th>
                    <th>Name</th>
                    <th>Saree</th>
                    <th>Mob</th>
                    <th>Address</th>
                    <th>Bana</th>
                    <th>Zari</th>
                    <th>Chukka</th>
                    <th>Tani</th>
                    <th>Bani</th>
                    <th>Kadi</th>
                    <th>Baithka</th>
                    ${customThs}
                    <th style="width:46px; text-align:center;">
                        <button type="button" class="il-plus-th-btn" title="Naya Column Jodein (+)" onclick="addInfoLedgerCustomColumn()">+</button>
                    </th>
                </tr>
            `;
        }

        // Render <tbody> (20 rows per page)
        const tbody = document.getElementById('info-ledger-tbody');
        const colSpan = 13 + customCols.length;

        if (tbody) {
            if (!totalItems) {
                tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:26px; color:#64748b; font-weight:700;">${q ? 'Search se koi Kariger match nahi hua.' : 'Koi Kariger nahi mila.'}</td></tr>`;
            } else {
                const startIdx = (currentPage - 1) * PAGE_SIZE;
                const pageRows = list.slice(startIdx, startIdx + PAGE_SIZE);
                const roAttr = isPreview ? 'readonly' : '';

                tbody.innerHTML = pageRows.map((r, idx) => {
                    const rowNo = startIdx + idx + 1;
                    const kIdEsc = esc(r.id);

                    const customTds = customCols.map((c) => {
                        const val = r.custom?.[c.id] || '';
                        return `
                            <td>
                                <input type="text" class="il-cell-input" data-col="custom_${esc(c.id)}" ${roAttr}
                                       value="${esc(val)}" placeholder="-"
                                       onchange="saveInfoLedgerCell('${kIdEsc}', '${esc(c.id)}', this.value, true)"
                                       onkeydown="handleInfoLedgerCellKey(event, '${kIdEsc}', 'custom_${esc(c.id)}')">
                            </td>
                        `;
                    }).join('');

                    return `
                        <tr>
                            <td style="text-align:center; font-weight:800; color:#64748b;">${rowNo}</td>
                            <td style="font-weight:800; color:#0f172a; white-space:nowrap;">${esc(r.name)}</td>
                            <td style="white-space:nowrap;">${esc(r.saree || '-')}</td>
                            <td style="white-space:nowrap;">${esc(r.mobile || '-')}</td>
                            <td>
                                <input type="text" class="il-cell-input" data-col="address" ${roAttr}
                                       value="${esc(r.address || '')}" placeholder="Address..."
                                       onchange="saveInfoLedgerCell('${kIdEsc}', 'address', this.value, false)"
                                       onkeydown="handleInfoLedgerCellKey(event, '${kIdEsc}', 'address')">
                            </td>
                            <td>${r.bana ? `<span class="il-pill-auto" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">${esc(r.bana)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                            <td>${r.zari ? `<span class="il-pill-auto" style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa;">${esc(r.zari)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                            <td>${r.chukka ? `<span class="il-pill-auto" style="background:#faf5ff; color:#6d28d9; border:1px solid #ddd6fe;">${esc(r.chukka)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                            <td>${r.tani ? `<span class="il-pill-auto" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${esc(r.tani)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                            <td style="font-weight:800; color:#0f766e; white-space:nowrap;">${r.bani ? `₹ ${esc(r.bani)}` : '<span style="color:#94a3b8;">-</span>'}</td>
                            <td>
                                <input type="text" class="il-cell-input" data-col="kadi" ${roAttr}
                                       value="${esc(r.kadi || '')}" placeholder="Kadi..."
                                       onchange="saveInfoLedgerCell('${kIdEsc}', 'kadi', this.value, false)"
                                       onkeydown="handleInfoLedgerCellKey(event, '${kIdEsc}', 'kadi')">
                            </td>
                            <td>
                                <input type="text" class="il-cell-input" data-col="baithka" ${roAttr}
                                       value="${esc(r.baithka || '')}" placeholder="Baithka..."
                                       onchange="saveInfoLedgerCell('${kIdEsc}', 'baithka', this.value, false)"
                                       onkeydown="handleInfoLedgerCellKey(event, '${kIdEsc}', 'baithka')">
                            </td>
                            ${customTds}
                            <td style="text-align:center; color:#cbd5e1;">•</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Render 20-20 Pagination Bar
        const pagBar = document.getElementById('info-ledger-pagination-bar');
        if (pagBar) {
            if (!totalItems) {
                pagBar.style.display = 'none';
            } else {
                pagBar.style.display = 'flex';
                const sIdx = (currentPage - 1) * PAGE_SIZE + 1;
                const eIdx = Math.min(currentPage * PAGE_SIZE, totalItems);
                pagBar.innerHTML = `
                    <div style="color:#4338ca; font-weight:700; font-size:12.5px;">📊 Dikh rahe hain: ${sIdx} - ${eIdx} (Kul: ${totalItems}) • 20 / Page</div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button type="button" class="quick-btn btn-out" ${currentPage <= 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="prevInfoLedgerPage()">◀️ Pichla</button>
                        <span style="background:#f8fafc; border:1px solid #cbd5e1; padding:5px 12px; border-radius:7px; font-weight:800; font-size:12px;">Page ${currentPage} / ${totalPages}</span>
                        <button type="button" class="quick-btn btn-in" ${currentPage >= totalPages ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="nextInfoLedgerPage()">Agla ▶️</button>
                    </div>
                `;
            }
        }
    };

    const openInfoLedgerModule = () => {
        ensureInfoLedgerSection();
        document.querySelectorAll('.module-section').forEach((s) => { s.style.display = 'none'; });
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';

        const sec = document.getElementById('info-ledger-section');
        if (sec) sec.style.display = 'block';

        currentPage = 1;
        renderInfoLedgerTable(true);
    };

    /* ========================================================================
       AUTO-SYNC HOOKS (KARIGER SHEET & KARIGER MASTER CHANGES -> INFO LEDGER)
    ======================================================================== */
    const installAutoSyncHooks = () => {
        if (typeof window.saveKarigerSheets === 'function' && !window.saveKarigerSheets._infoWrapped) {
            const origSaveSheets = window.saveKarigerSheets;
            window.saveKarigerSheets = function () {
                const res = origSaveSheets.apply(this, arguments);
                scheduleInfoLedgerSync();
                return res;
            };
            window.saveKarigerSheets._infoWrapped = true;
        }

        if (typeof window.setStore === 'function' && !window.setStore._infoWrapped) {
            const origSetStore = window.setStore;
            window.setStore = function (key) {
                const res = origSetStore.apply(this, arguments);
                if (!isInternalSyncRunning && String(key) === 'kariger_list') {
                    scheduleInfoLedgerSync();
                }
                return res;
            };
            window.setStore._infoWrapped = true;
        }

        if (typeof window.updateDashboardBadgeTotals === 'function' && !window.updateDashboardBadgeTotals._infoWrapped) {
            const origBadgeFn = window.updateDashboardBadgeTotals;
            window.updateDashboardBadgeTotals = function () {
                const res = origBadgeFn.apply(this, arguments);
                updateInfoLedgerBadge();
                return res;
            };
            window.updateDashboardBadgeTotals._infoWrapped = true;
        }
    };

    const initInfoLedger = async () => {
        installAutoSyncHooks();
        try {
            if (window.StoragePreloadPromise && typeof window.StoragePreloadPromise.then === 'function') {
                await window.StoragePreloadPromise;
            }
        } catch (_) {}
        installAutoSyncHooks();
        updateInfoLedgerBadge();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInfoLedger);
    } else {
        initInfoLedger();
    }

    const infoAPI = {
        openInfoLedgerModule,
        renderInfoLedgerTable,
        updateInfoLedgerBadge,
        switchInfoKarkhanaTab,
        handleInfoLedgerSearch,
        clearInfoLedgerSearch,
        nextInfoLedgerPage,
        prevInfoLedgerPage,
        addInfoLedgerCustomColumn,
        renameInfoLedgerCustomColumn,
        deleteInfoLedgerCustomColumn,
        saveInfoLedgerCell,
        handleInfoLedgerCellKey: handleCellKeyDown,
        syncAllKarigersToInfoLedger
    };

    Object.keys(infoAPI).forEach((fn) => {
        window[fn] = infoAPI[fn];
    });

    window.InfoLedgerEngine = infoAPI;
})();
