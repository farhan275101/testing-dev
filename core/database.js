/* ============================================================================
   SIMPLICITY ERP - ENTERPRISE AUTO-POLLING, DELTA SYNC & LIVE REALTIME ENGINE
   File: core/database.js • Developed by Farhan Jawed
   Modules: Multi-Godam + Jobwork + Tani Orders & Rangai + Row-by-Row Delta Sync
============================================================================ */

(() => {
    'use strict';

    // 🚀 SUPABASE CONFIGURATION
    const SUPABASE_CONFIG = Object.freeze({
        url: "https://mvbejtoylowskerlgfxs.supabase.co",
        anonKey: "sb_publishable_NhTU4xzRMi0gtKH4CzVf_Q_lRfzjg3c"
    });

    const PULL_COOLDOWN_MS = 45000; // 45 sec cooldown for focus/visibility pulls
    const ROW_PAGE_SIZE = 1000;
    const ROW_WRITE_CHUNK = 200;

    let supabaseClient = null;
    let isConnectedToCloud = false;
    let renderDebounceTimer = null;
    let realtimeChannel = null;
    let isSyncingInProgress = false;
    let lastFullPullAt = 0;
    let lastFullPullUid = null;
    const recentSelfWrites = {};
    const tablePullTimers = {};
    const tablePullInFlight = {};

    try {
        if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            window.supabaseClient = supabaseClient;
            console.log('✅ [CloudEngine] Supabase Realtime Engine Initialized (test-dav).');
        }
    } catch (initErr) {
        console.error('❌ [CloudEngine] Supabase Init failure:', initErr);
    }

    /* ========================================================================
       GENERIC ROW-BY-ROW & DELTA SYNC SCHEMA REGISTRY
       (Naya module convert karte waqt bas yahin 1 block add karna hoga)
    ======================================================================== */
    const ROW_SYNC_SCHEMAS = {
        payments: {
            defaultSourceKey: 'payment_records',
            resolveSourceKey: (shortKey) => {
                const k = String(shortKey || '').toLowerCase();
                if (k.includes('payment_history')) return 'payment_history';
                return 'payment_records';
            },
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'date', 'type', 'category', 'party',
                    'karigerId', 'karkhanaId', 'amount', 'paymentMode',
                    'remarks', 'refId', 'timestamp'
                ]);
                const extra = {};
                if (item && typeof item === 'object') {
                    Object.keys(item).forEach((k) => {
                        if (!known.has(k) && item[k] !== undefined) {
                            extra[k] = item[k];
                        }
                    });
                }
                const rid = String(item.id).trim();
                return {
                    id: `${ctx.uid}_${ctx.sess}_${ctx.sourceKey}_${rid}`,
                    record_id: rid,
                    user_id: ctx.uid,
                    tenant_id: ctx.tid,
                    session: ctx.sess,
                    source_key: ctx.sourceKey,
                    date: item.date || null,
                    type: item.type || null,
                    category: item.category || null,
                    party: item.party || null,
                    kariger_id: item.karigerId || null,
                    karkhana_id: item.karkhanaId || null,
                    amount: Number(item.amount) || 0,
                    payment_mode: item.paymentMode || 'Cash',
                    remarks: item.remarks || null,
                    ref_id: item.refId || null,
                    client_ts: item.timestamp ? Number(item.timestamp) : null,
                    extra,
                    is_deleted: false
                };
            },
            fromSqlRow: (row) => {
                const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                    ? row.extra
                    : {};
                return {
                    ...extraObj,
                    id: row.record_id || row.id,
                    date: row.date || '',
                    type: row.type || '',
                    category: row.category || '',
                    party: row.party || '',
                    karigerId: row.kariger_id || '',
                    karkhanaId: row.karkhana_id || '',
                    amount: Number(row.amount) || 0,
                    paymentMode: row.payment_mode || 'Cash',
                    remarks: row.remarks || '',
                    refId: row.ref_id || '',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        }
        // === ADD NEW ROW-BY-ROW MODULES HERE IN FUTURE ===
    };

    const isLightweightLocalKey = (key) => {
        if (typeof window.StorageEngine?.isLightweightKey === 'function') {
            return window.StorageEngine.isLightweightKey(key);
        }
        const k = String(key || '').toLowerCase();
        return (
            k.includes('session') ||
            k.includes('user_id') ||
            k.includes('tenant_id') ||
            k.includes('app_users') ||
            k.includes('karkhana_list') ||
            k.includes('active_karkhana') ||
            k.includes('billing_config') ||
            k.includes('portal_token')
        );
    };

    const getSafeUserId = () => {
        try {
            if (window.currentUserId && String(window.currentUserId).trim() && window.currentUserId !== 'app') {
                return String(window.currentUserId).trim();
            }
            if (window.currentUserProfile && window.currentUserProfile.id) {
                return String(window.currentUserProfile.id).trim();
            }
            const authData = localStorage.getItem('app_active_session_auth');
            if (authData) {
                const parsed = JSON.parse(authData);
                if (parsed && parsed.id) return String(parsed.id).trim();
            }
            if (typeof window.getEffectiveUserId === 'function') {
                const id = window.getEffectiveUserId();
                if (id && id !== 'app' && id !== '10001') return String(id).trim();
            }
            const stored = localStorage.getItem('app_current_user_id') || localStorage.getItem('currentUserId');
            if (stored) {
                const clean = String(stored).trim().replace(/[^a-zA-Z0-9_@-]/g, '');
                if (clean && clean !== 'app') return clean;
            }
        } catch (_) {}
        return null;
    };

    const getSafeTenantId = () => {
        try {
            if (window.currentTenantId) return String(window.currentTenantId).trim();
            const stored = localStorage.getItem('app_current_tenant_id') || localStorage.getItem('tenantId');
            if (stored) return String(stored).trim();
        } catch (_) {}
        return getSafeUserId();
    };

    const getActiveSessionVal = () => {
        try {
            if (typeof window.getActiveFinancialSession === 'function') {
                return window.getActiveFinancialSession();
            }
            const uId = getSafeUserId();
            if (uId) {
                const stored = localStorage.getItem(`${uId}_app_active_session`) || localStorage.getItem('app_active_session');
                if (stored) return String(stored).replace(/['"]+/g, '').trim();
            }
        } catch (_) {}
        return '2026-2027';
    };

    /**
     * ⭐ AUTO PUSH KARKHANAS (Main Godown + Bahadurganj)
     */
    const autoPushKarkhanasToSupabase = async () => {
        if (!supabaseClient || !navigator.onLine) return;
        const uid = getSafeUserId();
        if (!uid) return;
        const sess = getActiveSessionVal();

        let list = [];
        try {
            if (typeof window.getKarkhanasSafe === 'function') {
                list = window.getKarkhanasSafe();
            }
            if (!Array.isArray(list) || list.length === 0) {
                const rawPrefixed =
                    localStorage.getItem(`${uid}_${sess}_karkhana_list`) ||
                    localStorage.getItem(`${uid}_karkhana_list`);
                if (rawPrefixed) list = JSON.parse(rawPrefixed);
            }
            if (!Array.isArray(list) || list.length === 0) {
                if (typeof window.getStore === 'function') {
                    const st = window.getStore('karkhana_list');
                    if (Array.isArray(st) && st.length > 0) list = st;
                }
            }
        } catch (_) {}

        if (!Array.isArray(list) || list.length === 0) {
            list = [
                { id: 'k_main', name: 'Main Godown', isDefault: true },
                { id: 'k_bahadurganj', name: 'Bahadurganj', isDefault: false }
            ];
        }

        try {
            recentSelfWrites['karkhanas'] = Date.now();
            await supabaseClient.from('karkhanas').delete().eq('user_id', uid);

            const rows = list.map((k) => ({
                user_id: uid,
                karkhana_name: String(k.name || 'Karkhana').trim(),
                is_default: Boolean(k.isDefault || k.id === 'k_main'),
                created_at: new Date().toISOString()
            }));

            let { error } = await supabaseClient.from('karkhanas').insert(rows);

            if (error) {
                const rowsWithId = rows.map((r, i) => ({ ...r, id: i + 1 }));
                await supabaseClient.from('karkhanas').insert(rowsWithId);
            }
            console.log('🟢 [Auto-Sync] karkhanas cloud table updated!');
        } catch (err) {
            console.warn('[autoPushKarkhanasToSupabase]:', err);
        }
    };

    const resolveTargetTable = (fullKey) => {
        const k = String(fullKey).toLowerCase();

        if (k.includes('karkhana_list')) return 'KARKHANA_ACTION';
        if (k.includes('session') || k.includes('app_store')) return 'app_store';

        // ⭐ Nayi dedicated tables
        if (k.includes('info_ledger')) return 'info_ledger';
        if (k.includes('billing_config')) return 'billing_config';
        if (k.includes('tani_learned')) return 'tani_learned';

        if (k.includes('saree_history')) return 'saree_history';
        if (k.includes('saree_stock') || k.includes('saree_items') || k.includes('saree')) return 'saree_stock';
        if (k.includes('zari_history')) return 'zari_history';
        if (k.includes('zari_stock') || k.includes('zari')) return 'zari_stock';
        if (k.includes('bana_history')) return 'bana_history';
        if (k.includes('bana_stock') || k.includes('bana')) return 'bana_stock';
        if (k.includes('sancha_history')) return 'sancha_history';
        if (k.includes('sancha_items') || k.includes('sancha_list') || k.includes('sancha')) return 'sancha_list';
        if (k.includes('kariger_sheet') || k.includes('tani_sheet')) return 'tani_sheets';
        if (k.includes('kariger_list') || k.includes('karigers') || k.includes('kariger')) return 'karigers';
        if (
            k.includes('payment_records') ||
            k.includes('payment_history') ||
            k.includes('payment_list') ||
            k.includes('payments')
        ) {
            // jw_payments_list ko job_work_bills me hi rakhna hai
            if (!k.includes('jw_payment')) {
                return 'payments';
            }
        }
        if (k.includes('material_transfer') || k.includes('transfer')) return 'material_transfers';
        if (k.includes('dukan')) return 'dukan_challans';

        // ⭐ TANI ORDERS & RANGAI TABLE ROUTING
        if (k.includes('tani_order') || k.includes('tani_parchi') || k.includes('tani_rangai')) return 'tani_orders';

        if (k.includes('embroidery_history')) return 'embroidery_history';
        if (k.includes('cutting_history')) return 'cutting_history';
        if (k.includes('calender_history')) return 'calender_history';

        // KHATA SHEETS ➔ HISTORY TABLES
        if (k.includes('jobwork_sheets_') || k.includes('jw_sheet_')) {
            const workerId = k.replace(/.*jobwork_sheets_/, '').replace(/.*jw_sheet_/, '');
            let workers = [];
            try {
                if (typeof window.getStore === 'function') workers = window.getStore('jobwork_workers') || [];
                if (!workers.length) workers = JSON.parse(localStorage.getItem('jobwork_workers') || '[]');
            } catch (_) {}
            const found = workers.find(w => w && String(w.id).toLowerCase() === workerId.toLowerCase());
            const wType = String(found?.type || '').toLowerCase();

            if (wType === 'embroidery') return 'embroidery_history';
            if (wType === 'calender') return 'calender_history';
            return 'cutting_history';
        }

        // WORKERS LIST ➔ MASTER TABLES
        if (k.includes('jobwork_workers') || k.includes('cutting_workers') || k.includes('calender_workers') || k.includes('embroidery_workers')) {
            return 'WORKERS_ACTION';
        }

        if (k.includes('jw_bill') || k.includes('jobwork_bill') || k.includes('jw_payment')) {
            return 'job_work_bills';
        }

        // Fallback: Agar kisi nayi/bina-table wali key ka data aaye toh app_store me safe sync ho
        console.warn('[CloudEngine] Unmapped key synced to app_store fallback:', fullKey);
        return 'app_store';
    };

    const isRowSyncKey = (fullKey) => {
        const tbl = resolveTargetTable(fullKey);
        return Boolean(tbl && Object.prototype.hasOwnProperty.call(ROW_SYNC_SCHEMAS, tbl));
    };

    const mapCloudKeyToLocalKey = (cloudKey, tableName) => {
        const k = String(cloudKey).toLowerCase();
        if (k.includes('sancha_list') || tableName === 'sancha_list') return 'sancha_items';
        if (k.includes('karigers') || tableName === 'karigers') return 'kariger_list';
        if (tableName === 'job_work_bills' && k.includes('jw_bills_list')) return 'jw_bills_list';
        if (tableName === 'job_work_bills' && k.includes('jw_payments_list')) return 'jw_payments_list';
        if (tableName === 'tani_orders' || k.includes('tani_orders')) return 'tani_orders_list';
        return cloudKey;
    };

    const getTableProgressLabel = (tbl) => {
        switch (tbl) {
            case 'app_store': return 'Session & Settings load ho rahi hain...';
            case 'saree_stock':
            case 'saree_history': return 'Saree Stock & Passbook load ho raha hai...';
            case 'zari_stock':
            case 'zari_history': return 'Zari Stock & Hisab load ho raha hai...';
            case 'bana_stock':
            case 'bana_history': return 'Bana Stock & Hisab load ho raha hai...';
            case 'sancha_list':
            case 'sancha_history': return 'Sancha (Tani & Chukka) load ho raha hai...';
            case 'karigers':
            case 'tani_sheets': return 'Sabhi Karigers & Tani Sheets load ho rahi hain...';
            case 'material_transfers':
            case 'dukan_challans': return 'Transfers & Dukan Challans load ho rahe hain...';
            case 'payments': return 'Payments & Bakaya Hisab (Delta Sync) load ho raha hai...';
            case 'cutting':
            case 'cutting_history':
            case 'embroidery':
            case 'embroidery_history':
            case 'calender':
            case 'calender_history':
            case 'job_work_bills':
            case 'jobwork_workers': return 'Jobwork Workers & Bills load ho rahe hain...';
            case 'tani_orders':
            case 'tani_learned': return 'Tani Orders & Rangai Chart load ho raha hai...';
            case 'info_ledger':
            case 'billing_config': return 'Ledger & Billing Config load ho rahi hai...';
            default: return 'Company Data load ho raha hai...';
        }
    };

    const showSyncStatus = (status) => {
        const badge = document.getElementById('cloud-status-badge');
        if (!badge) return;

        if (typeof window.isBackupPreviewMode !== 'undefined' && window.isBackupPreviewMode) {
            badge.className = 'sync-badge';
            badge.style.background = '#fef08a';
            badge.style.color = '#854d0e';
            badge.innerHTML = '👁️ Preview Mode';
            return;
        }

        switch (status) {
            case 'syncing':
                badge.className = 'sync-badge sync-syncing';
                badge.style.background = '#dbeafe';
                badge.style.color = '#1d4ed8';
                badge.innerHTML = '🔄 Syncing...';
                break;
            case 'offline':
                badge.className = 'sync-badge';
                badge.style.background = '#fff7ed';
                badge.style.color = '#ea580c';
                badge.innerHTML = '🟠 Offline Mode';
                break;
            case 'error':
                badge.className = 'sync-badge';
                badge.style.background = '#fee2e2';
                badge.style.color = '#dc2626';
                badge.innerHTML = '⚠️ Sync Error';
                break;
            case 'online':
            default:
                badge.className = 'sync-badge';
                badge.style.background = '#ecfdf5';
                badge.style.color = '#059669';
                badge.innerHTML = '🟢 Cloud Synced';
                break;
        }
    };

    const runUIRepaintNow = () => {
        if (typeof window.populateNavbarKarkhanaDropdown === 'function') window.populateNavbarKarkhanaDropdown();
        if (typeof window.renderSheetTabs === 'function') window.renderSheetTabs();
        if (typeof window.renderKarigerTable === 'function') window.renderKarigerTable();
        if (typeof window.renderBanaTable === 'function') window.renderBanaTable();
        if (typeof window.renderZariTable === 'function') window.renderZariTable();
        if (typeof window.renderSareeTable === 'function') window.renderSareeTable();
        if (typeof window.renderSanchaTable === 'function') window.renderSanchaTable();
        if (typeof window.renderJobWorkersTable === 'function') window.renderJobWorkersTable();
        if (typeof window.renderJobWorkMovementDaybook === 'function') window.renderJobWorkMovementDaybook();
        if (typeof window.renderJobWorkBillsTable === 'function') window.renderJobWorkBillsTable();
        if (typeof window.updateJobWorkHubBadges === 'function') window.updateJobWorkHubBadges();
        if (typeof window.renderDashboardDayBook === 'function') window.renderDashboardDayBook();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
        if (typeof window.renderTaniOrdersTable === 'function') window.renderTaniOrdersTable();
        if (typeof window.updateTaniOrderBadges === 'function') window.updateTaniOrderBadges();
        if (typeof window.invalidatePaymentCache === 'function') window.invalidatePaymentCache();
        if (typeof window.renderPaymentTable === 'function') window.renderPaymentTable();
        if (typeof window.triggerActiveSectionRefresh === 'function') window.triggerActiveSectionRefresh();
    };

    const triggerSmartUIRepaint = (immediate = false) => {
        if (immediate) {
            if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
            runUIRepaintNow();
            return;
        }

        const activeEl = document.activeElement;
        const isUserTyping = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);
        if (isUserTyping) return;

        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        renderDebounceTimer = setTimeout(runUIRepaintNow, 150);
    };

    const smartApplyRemoteData = (targetKey, rowData) => {
        if (!targetKey || rowData === undefined || rowData === null) return false;

        const uid = getSafeUserId();
        if (!uid) return false;
        const sess = getActiveSessionVal();

        let shortKey = String(targetKey);
        const prefix = `${uid}_${sess}_`;
        if (shortKey.startsWith(prefix)) {
            shortKey = shortKey.replace(prefix, '');
        }

        const fullStorageKey = (typeof window.getStorageKey === 'function')
            ? window.getStorageKey(shortKey)
            : `${uid}_${sess}_${shortKey}`;

        try {
            const newStr = JSON.stringify(rowData);
            let currentStr = null;

            if (window.APP_MEMORY_CACHE && window.APP_MEMORY_CACHE[fullStorageKey] !== undefined) {
                try { currentStr = JSON.stringify(window.APP_MEMORY_CACHE[fullStorageKey]); } catch (_) {}
            }
            if (currentStr === null && isLightweightLocalKey(shortKey)) {
                try { currentStr = localStorage.getItem(fullStorageKey); } catch (_) {}
            }

            if (currentStr === newStr) return false;

            if (window.APP_MEMORY_CACHE) {
                window.APP_MEMORY_CACHE[fullStorageKey] = rowData;
                window.APP_MEMORY_CACHE[shortKey] = rowData;
            }
            if (Array.isArray(rowData) && typeof window.StorageEngine?.updateRowSnapshot === 'function') {
                window.StorageEngine.updateRowSnapshot(fullStorageKey, rowData);
            }
            if (typeof window.idbPut === 'function') {
                window.idbPut(fullStorageKey, rowData);
            }

            // Sirf chhoti keys localStorage me rakhein; 800 karigers ka heavy data sirf IndexedDB me rahega
            if (isLightweightLocalKey(shortKey)) {
                try {
                    localStorage.setItem(fullStorageKey, newStr);
                } catch (_) {}
            }
            return true;
        } catch (_) {
            return false;
        }
    };

    /* ========================================================================
       GENERIC ROW-BY-ROW WRITE ENGINE (UPSERT + SOFT DELETE)
    ======================================================================== */
    const cloudWriteDelta = async (fullKey, upserts = [], deletes = []) => {
        if (!supabaseClient) return false;

        const targetTable = resolveTargetTable(fullKey);
        const schema = ROW_SYNC_SCHEMAS[targetTable];
        if (!targetTable || !schema) return false;

        const uid = getSafeUserId();
        const tid = getSafeTenantId();
        const sess = getActiveSessionVal();
        if (!uid) return false;

        const shortKey = String(fullKey).replace(`${uid}_${sess}_`, '').replace(`${uid}_`, '');
        const sourceKey = schema.resolveSourceKey
            ? schema.resolveSourceKey(shortKey)
            : (schema.defaultSourceKey || shortKey);

        recentSelfWrites[targetTable] = Date.now();
        showSyncStatus('syncing');

        try {
            const ctx = { uid, tid, sess, sourceKey, shortKey };

            // 1. Upsert sirf badli / nayi rows (chunked)
            const validUpserts = (upserts || []).filter((it) => it && it.id !== undefined && it.id !== null);
            for (let i = 0; i < validUpserts.length; i += ROW_WRITE_CHUNK) {
                const chunk = validUpserts.slice(i, i + ROW_WRITE_CHUNK).map((it) => schema.toSqlRow(it, ctx));
                const { error } = await supabaseClient
                    .from(targetTable)
                    .upsert(chunk, { onConflict: 'id' });

                if (error) {
                    console.error(`❌ [Supabase Row Upsert Error in ${targetTable}]:`, error.message);
                    showSyncStatus('error');
                    return false;
                }
            }

            // 2. Soft Delete hataayi gayi rows (is_deleted = true)
            const validDeleteIds = (deletes || [])
                .map((rid) => String(rid || '').trim())
                .filter(Boolean)
                .map((rid) => `${uid}_${sess}_${sourceKey}_${rid}`);

            for (let i = 0; i < validDeleteIds.length; i += ROW_WRITE_CHUNK) {
                const idChunk = validDeleteIds.slice(i, i + ROW_WRITE_CHUNK);
                const { error } = await supabaseClient
                    .from(targetTable)
                    .update({ is_deleted: true })
                    .eq('user_id', uid)
                    .eq('session', sess)
                    .in('id', idChunk);

                if (error) {
                    console.error(`❌ [Supabase Soft Delete Error in ${targetTable}]:`, error.message);
                    showSyncStatus('error');
                    return false;
                }
            }

            recentSelfWrites[targetTable] = Date.now();
            isConnectedToCloud = true;
            showSyncStatus('online');
            return true;
        } catch (err) {
            console.error(`❌ [RowDelta Exception in ${targetTable}]:`, err);
            showSyncStatus('error');
            return false;
        }
    };

    /* ========================================================================
       GENERIC ROW-BY-ROW DELTA PULL ENGINE (updated_at > last_sync)
    ======================================================================== */
    const getDeltaSyncCursorKey = (tbl, uid, sess) => `erp_delta_sync_${tbl}_${uid}_${sess}`;

    const pullRowSyncTable = async (tbl, uid) => {
        const schema = ROW_SYNC_SCHEMAS[tbl];
        if (!schema || !supabaseClient || !uid) return false;

        if (tablePullInFlight[tbl]) return false;
        tablePullInFlight[tbl] = true;

        try {
            const sess = getActiveSessionVal();
            const cursorKey = getDeltaSyncCursorKey(tbl, uid, sess);
            let lastSyncIso = null;
            try { lastSyncIso = localStorage.getItem(cursorKey); } catch (_) {}

            const isInitialPull = !lastSyncIso;
            const fetchedRows = [];
            let from = 0;

            while (true) {
                let query = supabaseClient
                    .from(tbl)
                    .select('*')
                    .eq('user_id', uid)
                    .eq('session', sess);

                if (isInitialPull) {
                    query = query.eq('is_deleted', false);
                } else {
                    query = query.gt('updated_at', lastSyncIso);
                }

                const { data, error } = await query
                    .order('updated_at', { ascending: true })
                    .order('id', { ascending: true })
                    .range(from, from + ROW_PAGE_SIZE - 1);

                if (error) {
                    console.error(`❌ [Delta Pull Error in ${tbl}]:`, error.message);
                    return false;
                }

                if (!Array.isArray(data) || data.length === 0) break;
                fetchedRows.push(...data);

                if (data.length < ROW_PAGE_SIZE) break;
                from += ROW_PAGE_SIZE;
            }

            if (fetchedRows.length === 0) {
                return false;
            }

            let maxUpdatedAt = lastSyncIso || '';
            const groupedBySource = new Map();

            for (let i = 0; i < fetchedRows.length; i++) {
                const row = fetchedRows[i];
                if (!row) continue;
                if (row.updated_at && String(row.updated_at) > maxUpdatedAt) {
                    maxUpdatedAt = String(row.updated_at);
                }
                const sKey = row.source_key || schema.defaultSourceKey;
                if (!groupedBySource.has(sKey)) groupedBySource.set(sKey, []);
                groupedBySource.get(sKey).push(row);
            }

            let hasNewData = false;

            groupedBySource.forEach((rows, sKey) => {
                const fullStorageKey = (typeof window.getStorageKey === 'function')
                    ? window.getStorageKey(sKey)
                    : `${uid}_${sess}_${sKey}`;

                const currentArr = (!isInitialPull && window.APP_MEMORY_CACHE && Array.isArray(window.APP_MEMORY_CACHE[fullStorageKey]))
                    ? window.APP_MEMORY_CACHE[fullStorageKey]
                    : [];

                const mergedMap = new Map();
                for (let i = 0; i < currentArr.length; i++) {
                    const item = currentArr[i];
                    if (item && item.id !== undefined && item.id !== null) {
                        mergedMap.set(String(item.id).trim(), item);
                    }
                }

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rid = String(row.record_id || row.id || '').trim();
                    if (!rid) continue;

                    if (row.is_deleted === true) {
                        mergedMap.delete(rid);
                    } else {
                        mergedMap.set(rid, schema.fromSqlRow(row));
                    }
                }

                const mergedArr = Array.from(mergedMap.values());
                if (smartApplyRemoteData(sKey, mergedArr)) {
                    hasNewData = true;
                }
            });

            if (maxUpdatedAt) {
                try { localStorage.setItem(cursorKey, maxUpdatedAt); } catch (_) {}
            }

            return hasNewData;
        } catch (err) {
            console.error(`❌ [pullRowSyncTable Exception in ${tbl}]:`, err);
            return false;
        } finally {
            tablePullInFlight[tbl] = false;
        }
    };

    const cloudWrite = async (fullKey, data) => {
        if (!supabaseClient) return false;

        const targetTable = resolveTargetTable(fullKey);
        if (!targetTable) return false;

        // Agar kisi caller ne direct cloudWrite call kiya ho Row-Sync table ke liye, toh delta engine me route karein
        if (Object.prototype.hasOwnProperty.call(ROW_SYNC_SCHEMAS, targetTable) && Array.isArray(data)) {
            return await cloudWriteDelta(fullKey, data, []);
        }

        const uid = getSafeUserId();
        const tid = getSafeTenantId();
        const sess = getActiveSessionVal();

        if (!uid) return false;

        if (targetTable === 'KARKHANA_ACTION') {
            await autoPushKarkhanasToSupabase();
            return true;
        }

        showSyncStatus('syncing');

        try {
            // ⭐ 1. WORKERS LIST SYNC (Dedicated jobwork_workers + department tables)
            if (targetTable === 'WORKERS_ACTION') {
                const workersList = Array.isArray(data) ? data : [];
                const nowMs = Date.now();
                recentSelfWrites['jobwork_workers'] = nowMs;
                recentSelfWrites['embroidery'] = nowMs;
                recentSelfWrites['cutting'] = nowMs;
                recentSelfWrites['calender'] = nowMs;

                try {
                    await supabaseClient.from('jobwork_workers').upsert({
                        id: `${uid}_${sess}_jobwork_workers`,
                        user_id: uid, tenant_id: tid, session: sess,
                        data: workersList,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                } catch (_) {}

                try {
                    const embWorkers = workersList.filter(w => String(w?.type || '').toLowerCase() === 'embroidery');
                    await supabaseClient.from('embroidery').upsert({
                        id: `${uid}_${sess}_embroidery_workers`,
                        user_id: uid, tenant_id: tid, session: sess,
                        data: embWorkers,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                } catch (_) {}

                try {
                    const cutWorkers = workersList.filter(w => String(w?.type || '').toLowerCase() === 'cutting');
                    await supabaseClient.from('cutting').upsert({
                        id: `${uid}_${sess}_cutting_workers`,
                        user_id: uid, tenant_id: tid, session: sess,
                        data: cutWorkers,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                } catch (_) {}

                try {
                    const calWorkers = workersList.filter(w => String(w?.type || '').toLowerCase() === 'calender');
                    await supabaseClient.from('calender').upsert({
                        id: `${uid}_${sess}_calender_workers`,
                        user_id: uid, tenant_id: tid, session: sess,
                        data: calWorkers,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                } catch (_) {}

                isConnectedToCloud = true;
                showSyncStatus('online');
                return true;
            }

            const cleanKey = String(fullKey).replace(`${uid}_${sess}_`, '').replace(`${uid}_`, '');
            const recordId = `${uid}_${sess}_${cleanKey}`;
            recentSelfWrites[targetTable] = Date.now();

            if (targetTable === 'app_store') {
                await supabaseClient.from('app_store').delete().eq('id', recordId);
                await supabaseClient.from('app_store').insert({
                    id: recordId,
                    user_id: uid,
                    tenant_id: tid,
                    session: sess,
                    data: data,
                    key: String(fullKey),
                    value: data,
                    updated_at: new Date().toISOString()
                });
                isConnectedToCloud = true;
                showSyncStatus('online');
                return true;
            }

            const payload = {
                id: recordId,
                user_id: uid,
                tenant_id: tid,
                session: sess,
                data: data,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabaseClient
                .from(targetTable)
                .upsert(payload, { onConflict: 'id' });

            if (error) {
                console.error(`❌ [Supabase Error in ${targetTable}]:`, error.message);
                showSyncStatus('error');
                return false;
            }

            // ⭐ 2. PASSBOOK (LEN-DEN) SYNC
            if (targetTable === 'saree_history' && Array.isArray(data)) {
                try {
                    let groupedStock = [];
                    if (typeof window.groupSareeStockByTab === 'function') {
                        groupedStock = window.groupSareeStockByTab(data, 'fresh', 'all') || [];
                    }
                    if (groupedStock.length > 0) {
                        recentSelfWrites['saree_stock'] = Date.now();
                        await supabaseClient.from('saree_stock').upsert({
                            id: `${uid}_${sess}_saree_stock`,
                            user_id: uid, tenant_id: tid, session: sess,
                            data: groupedStock, updated_at: new Date().toISOString()
                        }, { onConflict: 'id' });
                    }
                } catch (_) {}

                try {
                    const embHistory = data.filter(r => {
                        if (!r) return false;
                        const t = String(r.type || '').toLowerCase();
                        const lbl = String(r.typeLabel || '').toLowerCase();
                        const p = String(r.partyName || r.targetWorker || r.note || '').toLowerCase();
                        return t === 'embroidery' || lbl.includes('embroidery') || p.includes('embroidery') || lbl.includes('कढ़ाई');
                    });
                    if (embHistory.length > 0) {
                        recentSelfWrites['embroidery_history'] = Date.now();
                        await supabaseClient.from('embroidery_history').upsert({
                            id: `${uid}_${sess}_embroidery_history`,
                            user_id: uid, tenant_id: tid, session: sess,
                            data: embHistory, updated_at: new Date().toISOString()
                        }, { onConflict: 'id' });
                    }
                } catch (_) {}

                try {
                    const cutHistory = data.filter(r => {
                        if (!r) return false;
                        const t = String(r.type || '').toLowerCase();
                        const lbl = String(r.typeLabel || '').toLowerCase();
                        const p = String(r.partyName || r.targetWorker || r.note || '').toLowerCase();
                        return t === 'cutting' || lbl.includes('cutting') || p.includes('cutting') || lbl.includes('कटिंग');
                    });
                    if (cutHistory.length > 0) {
                        recentSelfWrites['cutting_history'] = Date.now();
                        await supabaseClient.from('cutting_history').upsert({
                            id: `${uid}_${sess}_cutting_history`,
                            user_id: uid, tenant_id: tid, session: sess,
                            data: cutHistory, updated_at: new Date().toISOString()
                        }, { onConflict: 'id' });
                    }
                } catch (_) {}

                try {
                    const calHistory = data.filter(r => {
                        if (!r) return false;
                        const t = String(r.type || '').toLowerCase();
                        const lbl = String(r.typeLabel || '').toLowerCase();
                        const p = String(r.partyName || r.targetWorker || r.note || '').toLowerCase();
                        return t === 'finished' || lbl.includes('calender') || p.includes('calender') || lbl.includes('कैलेंडर');
                    });
                    if (calHistory.length > 0) {
                        recentSelfWrites['calender_history'] = Date.now();
                        await supabaseClient.from('calender_history').upsert({
                            id: `${uid}_${sess}_calender_history`,
                            user_id: uid, tenant_id: tid, session: sess,
                            data: calHistory, updated_at: new Date().toISOString()
                        }, { onConflict: 'id' });
                    }
                } catch (_) {}
            }

            isConnectedToCloud = true;
            showSyncStatus('online');
            return true;
        } catch (err) {
            console.error(`❌ [Supabase Exception]:`, err);
            showSyncStatus('error');
            return false;
        }
    };

    const applyRowsFromTable = (tbl, data, uid) => {
        if (!Array.isArray(data) || data.length === 0) return false;
        let hasNewData = false;
        const sess = getActiveSessionVal();
        const prefix = `${uid}_${sess}_`;

        data.forEach((row) => {
            let localKey = row.id || row.key;
            if (localKey && String(localKey).startsWith(prefix)) {
                localKey = String(localKey).replace(prefix, '');
            }

            // Purane app_store ke stale payment records ko ignore karein
            if (tbl === 'app_store' && localKey && resolveTargetTable(localKey) === 'payments') {
                return;
            }

            const mappedLocalKey = mapCloudKeyToLocalKey(localKey, tbl);
            const rowData = row.data !== undefined ? row.data : (row.value !== undefined ? row.value : row);

            if (mappedLocalKey && rowData !== undefined) {
                if (mappedLocalKey === 'embroidery_workers' || mappedLocalKey === 'cutting_workers' || mappedLocalKey === 'calender_workers') {
                    const existing = (typeof window.getStore === 'function')
                        ? (window.getStore('jobwork_workers') || [])
                        : JSON.parse(localStorage.getItem('jobwork_workers') || '[]');
                    const incomingType = mappedLocalKey.replace('_workers', '');
                    const others = existing.filter(w => String(w?.type || '').toLowerCase() !== incomingType);
                    const merged = [...others, ...(Array.isArray(rowData) ? rowData : [])];
                    if (smartApplyRemoteData('jobwork_workers', merged)) hasNewData = true;
                } else {
                    if (smartApplyRemoteData(mappedLocalKey, rowData)) hasNewData = true;
                }
            }
        });
        return hasNewData;
    };

    const pullSingleTable = async (tbl) => {
        if (!supabaseClient || !navigator.onLine || !tbl) return;
        const uid = getSafeUserId();
        if (!uid) return;

        try {
            if (Object.prototype.hasOwnProperty.call(ROW_SYNC_SCHEMAS, tbl)) {
                const updated = await pullRowSyncTable(tbl, uid);
                if (updated) {
                    triggerSmartUIRepaint();
                }
                return;
            }

            if (tbl === 'karkhanas') {
                const { data: kData } = await supabaseClient.from('karkhanas').select('*').eq('user_id', uid);
                if (Array.isArray(kData) && kData.length > 0) {
                    const kList = kData.map(row => ({
                        id: row.is_default ? 'k_main' : `k_${row.id}`,
                        name: row.karkhana_name,
                        isDefault: Boolean(row.is_default)
                    }));
                    if (smartApplyRemoteData('karkhana_list', kList)) {
                        triggerSmartUIRepaint();
                    }
                }
                return;
            }

            const { data, error } = await supabaseClient
                .from(tbl)
                .select('*')
                .eq('user_id', uid);

            if (!error && data && data.length > 0) {
                if (applyRowsFromTable(tbl, data, uid)) {
                    triggerSmartUIRepaint();
                }
            }
        } catch (_) {}
    };

    const pullAllCloudData = async (silent = true, force = false) => {
        const uid = getSafeUserId();

        if (!supabaseClient || !navigator.onLine) {
            if (!silent && window.ERPLoader) {
                window.ERPLoader.setProgress(100, 'Offline Mode Taiyar Hai ✅', 'Local IndexedDB se chal raha hai');
                window.ERPLoader.hide(350);
            }
            return;
        }
        if (isSyncingInProgress) return;
        if (!uid) {
            if (!silent && window.ERPLoader) window.ERPLoader.hide(0);
            return;
        }

        const now = Date.now();
        if (!force && lastFullPullUid === uid && (now - lastFullPullAt) < PULL_COOLDOWN_MS) {
            if (!silent && window.ERPLoader) {
                window.ERPLoader.setProgress(100, 'Saara Data Taiyar Hai ✅', 'Recent cache loaded');
                window.ERPLoader.hide(300);
            }
            return;
        }

        isSyncingInProgress = true;
        if (!silent) {
            showSyncStatus('syncing');
            if (window.ERPLoader) {
                window.ERPLoader.show('Cloud Data Sync Ho Raha Hai...', 'Godam aur Accounts load ho rahe hain...', 35);
            }
        }

        let hasNewData = false;

        try {
            if (!silent && window.ERPLoader) {
                window.ERPLoader.setProgress(38, 'Godam aur Karkhane load ho rahe hain...', 'Table: karkhanas');
            }
            try {
                const { data: kData } = await supabaseClient.from('karkhanas').select('*').eq('user_id', uid);
                if (Array.isArray(kData) && kData.length > 0) {
                    const kList = kData.map(row => ({
                        id: row.is_default ? 'k_main' : `k_${row.id}`,
                        name: row.karkhana_name,
                        isDefault: Boolean(row.is_default)
                    }));
                    if (smartApplyRemoteData('karkhana_list', kList)) hasNewData = true;
                } else {
                    await autoPushKarkhanasToSupabase();
                }
            } catch (_) {}

            const tables = [
                'app_store',
                'saree_stock', 'saree_history',
                'zari_stock', 'zari_history',
                'bana_stock', 'bana_history',
                'sancha_list', 'sancha_history',
                'karigers', 'tani_sheets',
                'material_transfers', 'dukan_challans',
                'payments',
                'cutting', 'cutting_history',
                'embroidery', 'embroidery_history',
                'calender', 'calender_history',
                'job_work_bills',
                'tani_orders',
                'info_ledger',
                'billing_config',
                'jobwork_workers',
                'tani_learned'
            ];

            for (let i = 0; i < tables.length; i++) {
                const tbl = tables[i];
                if (!silent && window.ERPLoader) {
                    const pct = Math.min(96, 40 + Math.round(((i + 1) / tables.length) * 56));
                    window.ERPLoader.setProgress(pct, getTableProgressLabel(tbl), `Module ${i + 1} / ${tables.length} (${tbl})`);
                }
                try {
                    if (Object.prototype.hasOwnProperty.call(ROW_SYNC_SCHEMAS, tbl)) {
                        if (await pullRowSyncTable(tbl, uid)) {
                            hasNewData = true;
                        }
                        continue;
                    }

                    const { data, error } = await supabaseClient
                        .from(tbl)
                        .select('*')
                        .eq('user_id', uid);

                    if (!error && data && data.length > 0) {
                        if (applyRowsFromTable(tbl, data, uid)) {
                            hasNewData = true;
                        }
                    }
                } catch (_) {}
            }

            lastFullPullAt = Date.now();
            lastFullPullUid = uid;
        } finally {
            isSyncingInProgress = false;

            // Pehle poore Dashboard / Desktop ko 100% data ke saath paint karein
            if (hasNewData || !silent) {
                triggerSmartUIRepaint(!silent);
            }

            showSyncStatus('online');

            // Phir 100% dikha kar loader ko smoothly hata dein
            if (!silent && window.ERPLoader) {
                window.ERPLoader.setProgress(100, 'Saara Data 100% Load Ho Gaya! ✅', 'Simplicity ERP Taiyar Hai');
                window.ERPLoader.hide(400);
            }
        }
    };

    const initSupabaseRealtime = () => {
        if (!supabaseClient) return;
        const uid = getSafeUserId();
        if (!uid) return; // Login se pehle sync mat chalao

        detachSupabaseRealtime();

        try {
            realtimeChannel = supabaseClient.channel(`public_db_realtime_${uid}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public' },
                    (payload) => {
                        if (typeof window.isBackupPreviewMode !== 'undefined' && window.isBackupPreviewMode) return;
                        const row = payload.new || payload.old;
                        if (!row || row.user_id !== uid) return;

                        const tbl = payload.table;
                        const rKey = String(row.key || row.id || '');
                        if (rKey.includes('app_active_session') && payload.new) {
                            const rawVal = payload.new.data !== undefined ? payload.new.data : payload.new.value;
                            const cloudActiveSess = String(rawVal || '').replace(/['"]+/g, '').trim();
                            const currentLocalSess = getActiveSessionVal();

                            if (/^\d{4}-\d{4}$/.test(cloudActiveSess) && cloudActiveSess !== currentLocalSess) {
                                localStorage.setItem(`${uid}_app_active_session`, cloudActiveSess);
                                window.location.reload();
                                return;
                            }
                        }

                        // Apne khud ke abhi-abhi kiye gaye write ka echo skip karein
                        if (tbl && recentSelfWrites[tbl] && (Date.now() - recentSelfWrites[tbl]) < 3000) {
                            return;
                        }

                        // Sirf wahi 1 table refresh karein jisme badlav aaya
                        if (tbl && !isSyncingInProgress) {
                            if (tablePullTimers[tbl]) clearTimeout(tablePullTimers[tbl]);
                            tablePullTimers[tbl] = setTimeout(() => {
                                pullSingleTable(tbl);
                            }, 350);
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        isConnectedToCloud = true;
                        showSyncStatus('online');
                    }
                });

            pullAllCloudData(false, true);
        } catch (err) {
            console.warn('[CloudEngine] Realtime setup:', err);
        }
    };

    const detachSupabaseRealtime = () => {
        try {
            Object.keys(tablePullTimers).forEach((t) => {
                clearTimeout(tablePullTimers[t]);
                delete tablePullTimers[t];
            });
            if (realtimeChannel && supabaseClient) {
                supabaseClient.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
        } catch (_) {}
    };

    const switchSessionListeners = () => { pullAllCloudData(false, true); };

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && navigator.onLine && getSafeUserId()) {
            pullAllCloudData(true, false);
        }
    });

    window.addEventListener('focus', () => {
        if (navigator.onLine && getSafeUserId()) {
            pullAllCloudData(true, false);
        }
    });

    const publicCloudAPI = {
        get db() { return supabaseClient; },
        get supabase() { return supabaseClient; },
        get isConnectedToCloud() { return isConnectedToCloud; },
        ROW_SYNC_SCHEMAS,
        isRowSyncKey,
        showSyncStatus,
        initSupabaseRealtime,
        detachSupabaseRealtime,
        switchSessionListeners,
        cloudWrite,
        cloudWriteDelta,
        pullAllCloudData,
        autoPushKarkhanasToSupabase,
        triggerSmartUIRepaint
    };

    window.db = supabaseClient;
    window.supabaseClient = supabaseClient;
    window.showSyncStatus = showSyncStatus;
    window.initSupabaseRealtime = initSupabaseRealtime;
    window.detachSupabaseRealtime = detachSupabaseRealtime;
    window.CloudEngine = publicCloudAPI;
    window.cloudWrite = cloudWrite;
    window.cloudWriteDelta = cloudWriteDelta;
    window.pullAllCloudData = pullAllCloudData;

    window.addEventListener('online', () => {
        isConnectedToCloud = true;
        showSyncStatus('online');
        if (getSafeUserId()) initSupabaseRealtime();
    });

    window.addEventListener('offline', () => {
        isConnectedToCloud = false;
        showSyncStatus('offline');
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (getSafeUserId()) setTimeout(initSupabaseRealtime, 200);
        });
    } else {
        if (getSafeUserId()) setTimeout(initSupabaseRealtime, 200);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = publicCloudAPI;
    }
})();
