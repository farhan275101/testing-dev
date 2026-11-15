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

    const createJobWorkHistorySchema = (defaultSourceKey) => ({
        defaultSourceKey,
        resolveSourceKey: (shortKey) => String(shortKey || '').trim() || defaultSourceKey,
        toSqlRow: (item, ctx) => {
            const known = new Set([
                'id', 'title', 'monthKey', 'closingPendingSaree', 'closingBakiAmt', 'rows'
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
            const matchW = String(ctx.sourceKey || '').match(/(?:jobwork_sheets_|jw_sheet_)(.+)$/i);
            const workerId = matchW ? matchW[1].trim() : '';

            let sheetOrder = 0;
            try {
                const cachedList = ctx.fullKey && window.APP_MEMORY_CACHE ? window.APP_MEMORY_CACHE[ctx.fullKey] : null;
                if (Array.isArray(cachedList)) {
                    const foundIdx = cachedList.findIndex((s) => s && String(s.id) === rid);
                    if (foundIdx >= 0) sheetOrder = foundIdx;
                }
            } catch (_) {}

            return {
                id: `${ctx.uid}_${ctx.sess}_${ctx.sourceKey}_${rid}`,
                record_id: rid,
                worker_id: workerId,
                user_id: ctx.uid,
                tenant_id: ctx.tid,
                session: ctx.sess,
                source_key: ctx.sourceKey,
                sheet_order: sheetOrder,
                title: item.title || rid,
                month_key: item.monthKey || null,
                closing_pending_saree: Number(item.closingPendingSaree) || 0,
                closing_baki_amt: Number(item.closingBakiAmt) || 0,
                rows: Array.isArray(item.rows) ? item.rows : [],
                extra,
                is_deleted: false
            };
        },
        fromSqlRow: (row) => {
            const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                ? row.extra
                : {};
            const obj = {
                ...extraObj,
                id: row.record_id || row.id,
                title: row.title || row.record_id || 'Month 1',
                closingPendingSaree: Number(row.closing_pending_saree) || 0,
                closingBakiAmt: Number(row.closing_baki_amt) || 0,
                rows: Array.isArray(row.rows) ? row.rows : []
            };
            if (row.month_key) obj.monthKey = row.month_key;
            return obj;
        }
    });

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
        },

        karigers: {
            defaultSourceKey: 'kariger_list',
            resolveSourceKey: () => 'kariger_list',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'name', 'saree', 'mobile', 'mohalla',
                    'date', 'karkhanaId', 'karkhanaName'
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
                    name: item.name || '',
                    saree: item.saree || '',
                    mobile: item.mobile || '',
                    mohalla: item.mohalla || item.address || item.pata || '',
                    date: item.date || null,
                    karkhana_id: item.karkhanaId || 'k_main',
                    karkhana_name: item.karkhanaName || '',
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
                    name: row.name || '',
                    saree: row.saree || '',
                    mobile: row.mobile || '',
                    mohalla: row.mohalla || '',
                    date: row.date || '',
                    karkhanaId: row.karkhana_id || 'k_main',
                    karkhanaName: row.karkhana_name || ''
                };
            }
        },

        tani_sheets: {
            defaultSourceKey: 'kariger_sheets_default',
            resolveSourceKey: (shortKey) => String(shortKey || '').trim(),
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'title', 'pichlaBana', 'pichlaZari', 'pichlaBani',
                    'banaWaste', 'zariWaste', 'rateBana', 'rateZari', 'rateBani',
                    'taniPcs', 'chukkaPcs', 'banaItem', 'zariItem',
                    'taniItem', 'taniSancha', 'taniWazan',
                    'chukkaItem', 'chukkaSancha', 'chukkaWazan',
                    'colors', 'linkedTaniOrderId', 'linkedTaniOrderNo', 'note', 'rows'
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
                const matchKar = String(ctx.sourceKey || '').match(/kariger_sheets_(.+)$/i);
                const karigerId = matchKar ? matchKar[1].trim() : '';

                let sheetOrder = 0;
                try {
                    const cachedList = ctx.fullKey && window.APP_MEMORY_CACHE ? window.APP_MEMORY_CACHE[ctx.fullKey] : null;
                    if (Array.isArray(cachedList)) {
                        const foundIdx = cachedList.findIndex((s) => s && String(s.id) === rid);
                        if (foundIdx >= 0) sheetOrder = foundIdx;
                    } else {
                        const numMatch = rid.match(/(\d+)$/);
                        if (numMatch) sheetOrder = parseInt(numMatch[1], 10) || 0;
                    }
                } catch (_) {}

                return {
                    id: `${ctx.uid}_${ctx.sess}_${ctx.sourceKey}_${rid}`,
                    record_id: rid,
                    kariger_id: karigerId,
                    user_id: ctx.uid,
                    tenant_id: ctx.tid,
                    session: ctx.sess,
                    source_key: ctx.sourceKey,
                    sheet_order: sheetOrder,
                    title: item.title || rid,
                    pichla_bana: Number(item.pichlaBana) || 0,
                    pichla_zari: Number(item.pichlaZari) || 0,
                    pichla_bani: Number(item.pichlaBani) || 0,
                    bana_waste: Number(item.banaWaste) || 0,
                    zari_waste: Number(item.zariWaste) || 0,
                    rate_bana: item.rateBana !== undefined && item.rateBana !== null ? Number(item.rateBana) : 0.311,
                    rate_zari: item.rateZari !== undefined && item.rateZari !== null ? Number(item.rateZari) : 0.110,
                    rate_bani: item.rateBani !== undefined && item.rateBani !== null ? Number(item.rateBani) : 240,
                    tani_pcs: item.taniPcs !== undefined && item.taniPcs !== null ? parseInt(item.taniPcs, 10) : 72,
                    chukka_pcs: item.chukkaPcs !== undefined && item.chukkaPcs !== null ? parseInt(item.chukkaPcs, 10) : 72,
                    bana_item: item.banaItem || '',
                    zari_item: item.zariItem || '',
                    tani_item: item.taniItem || '',
                    tani_sancha: item.taniSancha || '',
                    tani_wazan: Number(item.taniWazan) || 0,
                    chukka_item: item.chukkaItem || '',
                    chukka_sancha: item.chukkaSancha || '',
                    chukka_wazan: Number(item.chukkaWazan) || 0,
                    colors: Array.isArray(item.colors) ? item.colors : [],
                    linked_tani_order_id: item.linkedTaniOrderId || null,
                    linked_tani_order_no: item.linkedTaniOrderNo || null,
                    note: item.note || '',
                    rows: Array.isArray(item.rows) ? item.rows : [],
                    extra,
                    is_deleted: false
                };
            },
            fromSqlRow: (row) => {
                const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                    ? row.extra
                    : {};
                const obj = {
                    ...extraObj,
                    id: row.record_id || row.id,
                    title: row.title || row.record_id || 'Tani 1',
                    pichlaBana: Number(row.pichla_bana) || 0,
                    pichlaZari: Number(row.pichla_zari) || 0,
                    pichlaBani: Number(row.pichla_bani) || 0,
                    banaWaste: Number(row.bana_waste) || 0,
                    zariWaste: Number(row.zari_waste) || 0,
                    rateBana: row.rate_bana !== undefined && row.rate_bana !== null ? Number(row.rate_bana) : 0.311,
                    rateZari: row.rate_zari !== undefined && row.rate_zari !== null ? Number(row.rate_zari) : 0.110,
                    rateBani: row.rate_bani !== undefined && row.rate_bani !== null ? Number(row.rate_bani) : 240,
                    taniPcs: row.tani_pcs !== undefined && row.tani_pcs !== null ? Number(row.tani_pcs) : 72,
                    chukkaPcs: row.chukka_pcs !== undefined && row.chukka_pcs !== null ? Number(row.chukka_pcs) : 72,
                    banaItem: row.bana_item || '',
                    zariItem: row.zari_item || '',
                    taniItem: row.tani_item || '',
                    taniSancha: row.tani_sancha || '',
                    taniWazan: Number(row.tani_wazan) || 0,
                    chukkaItem: row.chukka_item || '',
                    chukkaSancha: row.chukka_sancha || '',
                    chukkaWazan: Number(row.chukka_wazan) || 0,
                    colors: Array.isArray(row.colors) ? row.colors : [],
                    note: row.note || '',
                    rows: Array.isArray(row.rows) ? row.rows : []
                };
                if (row.linked_tani_order_id) obj.linkedTaniOrderId = row.linked_tani_order_id;
                if (row.linked_tani_order_no) obj.linkedTaniOrderNo = row.linked_tani_order_no;
                return obj;
            }
        },

        bana_stock: {
            defaultSourceKey: 'bana_stock',
            resolveSourceKey: () => 'bana_stock',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'date', 'name', 'aaya', 'gaya', 'bacha', 'karkhanaId', 'timestamp'
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
                    name: item.name || '',
                    aaya: Number(item.aaya) || 0,
                    gaya: Number(item.gaya) || 0,
                    bacha: Number(item.bacha) || 0,
                    karkhana_id: item.karkhanaId || 'k_main',
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
                    name: row.name || '',
                    aaya: Number(row.aaya) || 0,
                    gaya: Number(row.gaya) || 0,
                    bacha: Number(row.bacha) || 0,
                    karkhanaId: row.karkhana_id || 'k_main',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        bana_history: {
            defaultSourceKey: 'bana_history',
            resolveSourceKey: () => 'bana_history',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'refId', 'date', 'name', 'kariger', 'type',
                    'aaya', 'gaya', 'karkhanaId', 'timestamp'
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
                    ref_id: item.refId || null,
                    date: item.date || null,
                    name: item.name || '',
                    kariger: item.kariger || null,
                    type: item.type || null,
                    aaya: Number(item.aaya) || 0,
                    gaya: Number(item.gaya) || 0,
                    karkhana_id: item.karkhanaId || 'k_main',
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
                    refId: row.ref_id || '',
                    date: row.date || '',
                    name: row.name || '',
                    kariger: row.kariger || '',
                    type: row.type || '',
                    aaya: Number(row.aaya) || 0,
                    gaya: Number(row.gaya) || 0,
                    karkhanaId: row.karkhana_id || 'k_main',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        zari_stock: {
            defaultSourceKey: 'zari_stock',
            resolveSourceKey: () => 'zari_stock',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'date', 'name', 'aaya', 'gaya', 'bacha', 'karkhanaId', 'timestamp'
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
                    name: item.name || '',
                    aaya: Number(item.aaya) || 0,
                    gaya: Number(item.gaya) || 0,
                    bacha: Number(item.bacha) || 0,
                    karkhana_id: item.karkhanaId || 'k_main',
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
                    name: row.name || '',
                    aaya: Number(row.aaya) || 0,
                    gaya: Number(row.gaya) || 0,
                    bacha: Number(row.bacha) || 0,
                    karkhanaId: row.karkhana_id || 'k_main',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        zari_history: {
            defaultSourceKey: 'zari_history',
            resolveSourceKey: () => 'zari_history',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'refId', 'date', 'name', 'kariger', 'type',
                    'aaya', 'gaya', 'karkhanaId', 'timestamp'
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
                    ref_id: item.refId || null,
                    date: item.date || null,
                    name: item.name || '',
                    kariger: item.kariger || null,
                    type: item.type || null,
                    aaya: Number(item.aaya) || 0,
                    gaya: Number(item.gaya) || 0,
                    karkhana_id: item.karkhanaId || 'k_main',
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
                    refId: row.ref_id || '',
                    date: row.date || '',
                    name: row.name || '',
                    kariger: row.kariger || '',
                    type: row.type || '',
                    aaya: Number(row.aaya) || 0,
                    gaya: Number(row.gaya) || 0,
                    karkhanaId: row.karkhana_id || 'k_main',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        saree_history: {
            defaultSourceKey: 'saree_history',
            resolveSourceKey: () => 'saree_history',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'refId', 'date', 'sareeName', 'karigerName',
                    'partyName', 'targetWorker', 'karkhanaId', 'type',
                    'typeLabel', 'aai', 'gai', 'isOut', 'isOpening',
                    'note', 'naap', 'timestamp'
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
                    ref_id: item.refId || null,
                    date: item.date || null,
                    saree_name: item.sareeName || item.name || item.saree || '',
                    kariger_name: item.karigerName || item.kariger || null,
                    party_name: item.partyName || null,
                    target_worker: item.targetWorker || null,
                    karkhana_id: item.karkhanaId || 'k_main',
                    type: item.type || 'fresh',
                    type_label: item.typeLabel || null,
                    aai: Number(item.aai) || 0,
                    gai: Number(item.gai) || 0,
                    is_out: Boolean(item.isOut),
                    is_opening: Boolean(item.isOpening),
                    note: item.note || null,
                    naap: item.naap || null,
                    client_ts: item.timestamp ? Number(item.timestamp) : null,
                    extra,
                    is_deleted: false
                };
            },
            fromSqlRow: (row) => {
                const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                    ? row.extra
                    : {};
                const kName = row.kariger_name || '';
                return {
                    ...extraObj,
                    id: row.record_id || row.id,
                    refId: row.ref_id || '',
                    date: row.date || '',
                    sareeName: row.saree_name || '',
                    karigerName: kName,
                    kariger: extraObj.kariger !== undefined ? extraObj.kariger : kName,
                    partyName: row.party_name || '',
                    targetWorker: row.target_worker || '',
                    karkhanaId: row.karkhana_id || 'k_main',
                    type: row.type || 'fresh',
                    typeLabel: row.type_label || '',
                    aai: Number(row.aai) || 0,
                    gai: Number(row.gai) || 0,
                    isOut: Boolean(row.is_out),
                    isOpening: Boolean(row.is_opening),
                    note: row.note || '',
                    naap: row.naap || '',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        sancha_list: {
            defaultSourceKey: 'sancha_items',
            resolveSourceKey: () => 'sancha_items',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'date', 'name', 'category', 'aaya', 'gaya', 'bacha',
                    'person', 'karkhanaId', 'timestamp'
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
                    name: item.name || '',
                    category: item.category || 'tani',
                    aaya: Number(item.aaya) || 0,
                    gaya: Number(item.gaya) || 0,
                    bacha: Number(item.bacha) || 0,
                    person: item.person || '-',
                    karkhana_id: item.karkhanaId || 'k_main',
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
                    name: row.name || '',
                    category: row.category || 'tani',
                    aaya: Number(row.aaya) || 0,
                    gaya: Number(row.gaya) || 0,
                    bacha: Number(row.bacha) || 0,
                    person: row.person || '-',
                    karkhanaId: row.karkhana_id || 'k_main',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        sancha_history: {
            defaultSourceKey: 'sancha_history',
            resolveSourceKey: () => 'sancha_history',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'refId', 'date', 'name', 'category', 'kariger', 'type',
                    'aaya', 'gaya', 'karkhanaId', 'isOpening', 'timestamp'
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
                    ref_id: item.refId || null,
                    date: item.date || null,
                    name: item.name || '',
                    category: item.category || 'tani',
                    kariger: item.kariger || null,
                    type: item.type || null,
                    aaya: Number(item.aaya) || 0,
                    gaya: Number(item.gaya) || 0,
                    karkhana_id: item.karkhanaId || 'k_main',
                    is_opening: Boolean(item.isOpening),
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
                    refId: row.ref_id || '',
                    date: row.date || '',
                    name: row.name || '',
                    category: row.category || 'tani',
                    kariger: row.kariger || '',
                    type: row.type || '',
                    aaya: Number(row.aaya) || 0,
                    gaya: Number(row.gaya) || 0,
                    karkhanaId: row.karkhana_id || 'k_main',
                    isOpening: Boolean(row.is_opening),
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        tani_orders: {
            defaultSourceKey: 'tani_orders_list',
            resolveSourceKey: () => 'tani_orders_list',
            sortList: (arr) => arr.sort((a, b) =>
                ((Number(b.orderNo) || 0) - (Number(a.orderNo) || 0)) ||
                ((Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
            ),
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'orderNo', 'date', 'sancha', 'kariger', 'mohalla',
                    'paai', 'border', 'bana', 'meter', 'pcs', 'rangi',
                    'matchingTable', 'contrastVal', 'contrastLabel', 'selectedContrasts',
                    'status', 'sanchaPortalStatus', 'rangiPortalStatus', 'sanchaPortalPushed',
                    'statusHistory', 'createdAt', 'updatedAt'
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
                    order_no: item.orderNo ? String(item.orderNo) : '',
                    date: item.date || null,
                    sancha: item.sancha || '',
                    kariger: item.kariger || '',
                    mohalla: item.mohalla || '',
                    paai: item.paai || '',
                    border: item.border || '',
                    bana: item.bana || '',
                    meter: Number(item.meter) || 0,
                    pcs: parseInt(item.pcs || 0, 10) || 0,
                    rangi: item.rangi || '',
                    matching_table: Array.isArray(item.matchingTable) ? item.matchingTable : [],
                    contrast_val: item.contrastVal || '',
                    contrast_label: item.contrastLabel || '',
                    selected_contrasts: Array.isArray(item.selectedContrasts) ? item.selectedContrasts : [],
                    status: item.status || 'sancha',
                    sancha_portal_status: item.sanchaPortalStatus || 'pending',
                    rangi_portal_status: item.rangiPortalStatus || 'waiting',
                    sancha_portal_pushed: Boolean(item.sanchaPortalPushed),
                    status_history: Array.isArray(item.statusHistory) ? item.statusHistory : [],
                    client_created_at: item.createdAt ? Number(item.createdAt) : null,
                    client_updated_at: item.updatedAt ? Number(item.updatedAt) : null,
                    extra,
                    is_deleted: false
                };
            },
            fromSqlRow: (row) => {
                const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                    ? row.extra
                    : {};
                const obj = {
                    ...extraObj,
                    id: row.record_id || row.id,
                    orderNo: row.order_no || '',
                    date: row.date || '',
                    sancha: row.sancha || '',
                    kariger: row.kariger || '',
                    mohalla: row.mohalla || '',
                    paai: row.paai || '',
                    border: row.border || '',
                    bana: row.bana || '',
                    meter: Number(row.meter) || 0,
                    pcs: Number(row.pcs) || 0,
                    rangi: row.rangi || '',
                    matchingTable: Array.isArray(row.matching_table) ? row.matching_table : [],
                    contrastVal: row.contrast_val || '',
                    contrastLabel: row.contrast_label || '',
                    selectedContrasts: Array.isArray(row.selected_contrasts) ? row.selected_contrasts : [],
                    status: row.status || 'sancha',
                    sanchaPortalStatus: row.sancha_portal_status || 'pending',
                    rangiPortalStatus: row.rangi_portal_status || 'waiting',
                    sanchaPortalPushed: Boolean(row.sancha_portal_pushed),
                    statusHistory: Array.isArray(row.status_history) ? row.status_history : []
                };
                if (row.client_created_at) obj.createdAt = Number(row.client_created_at);
                if (row.client_updated_at) obj.updatedAt = Number(row.client_updated_at);
                return obj;
            }
        },

        dukan_challans: {
            defaultSourceKey: 'dukan_transfer_history',
            resolveSourceKey: () => 'dukan_transfer_history',
            sortList: (arr) => arr.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)),
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'date', 'sareeName', 'karigerName', 'pcs', 'note', 'timestamp'
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
                    saree_name: item.sareeName || 'Finished Saree',
                    kariger_name: item.karigerName || '',
                    pcs: parseInt(item.pcs || 0, 10) || 0,
                    note: item.note || 'Apni Dukan',
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
                    sareeName: row.saree_name || 'Finished Saree',
                    karigerName: row.kariger_name || '',
                    pcs: Number(row.pcs) || 0,
                    note: row.note || 'Apni Dukan',
                    timestamp: row.client_ts ? Number(row.client_ts) : Date.now()
                };
            }
        },

        jobwork_workers: {
            defaultSourceKey: 'jobwork_workers',
            resolveSourceKey: () => 'jobwork_workers',
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'type', 'date', 'name', 'address', 'mobile'
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
                    type: String(item.type || 'cutting').toLowerCase(),
                    date: item.date || null,
                    name: item.name || '',
                    address: item.address || '',
                    mobile: item.mobile || '',
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
                    type: row.type || 'cutting',
                    date: row.date || '',
                    name: row.name || '',
                    address: row.address || '',
                    mobile: row.mobile || ''
                };
            }
        },

        cutting_history: createJobWorkHistorySchema('jobwork_sheets_cutting'),
        embroidery_history: createJobWorkHistorySchema('jobwork_sheets_embroidery'),
        calender_history: createJobWorkHistorySchema('jobwork_sheets_calender'),

        job_work_bills: {
            defaultSourceKey: 'jw_bills_list',
            resolveSourceKey: (shortKey) => {
                const k = String(shortKey || '').toLowerCase();
                if (k.includes('jw_payment')) return 'jw_payments_list';
                return 'jw_bills_list';
            },
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'billId', 'billNo', 'date', 'workerId', 'workerName',
                    'workType', 'pcs', 'billAmt', 'paidAmt', 'amount', 'mode', 'note'
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
                    bill_id: item.billId || null,
                    bill_no: item.billNo || null,
                    date: item.date || null,
                    worker_id: item.workerId || null,
                    worker_name: item.workerName || '',
                    work_type: item.workType || null,
                    pcs: parseInt(item.pcs || 0, 10) || 0,
                    bill_amt: Number(item.billAmt) || 0,
                    paid_amt: Number(item.paidAmt) || 0,
                    amount: Number(item.amount) || 0,
                    mode: item.mode || null,
                    note: item.note || '',
                    extra,
                    is_deleted: false
                };
            },
            fromSqlRow: (row) => {
                const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                    ? row.extra
                    : {};
                if (row.source_key === 'jw_payments_list') {
                    return {
                        ...extraObj,
                        id: row.record_id || row.id,
                        billId: row.bill_id || '',
                        billNo: row.bill_no || '-',
                        date: row.date || '',
                        workerName: row.worker_name || '',
                        amount: Number(row.amount) || 0,
                        mode: row.mode || 'Cash',
                        note: row.note || ''
                    };
                }
                return {
                    ...extraObj,
                    id: row.record_id || row.id,
                    billNo: row.bill_no || '-',
                    date: row.date || '',
                    workerId: row.worker_id || '',
                    workerName: row.worker_name || 'Worker',
                    workType: row.work_type || 'Job Work',
                    pcs: Number(row.pcs) || 0,
                    billAmt: Number(row.bill_amt) || 0,
                    paidAmt: Number(row.paid_amt) || 0,
                    note: row.note || ''
                };
            }
        },

        material_transfers: {
            defaultSourceKey: 'material_transfers',
            resolveSourceKey: () => 'material_transfers',
            sortList: (arr) => arr.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)),
            toSqlRow: (item, ctx) => {
                const known = new Set([
                    'id', 'date', 'type', 'itemName',
                    'fromKarkhanaId', 'toKarkhanaId',
                    'qty', 'quantity', 'note', 'timestamp'
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
                const q = Number(item.qty !== undefined && item.qty !== null ? item.qty : (item.quantity || 0)) || 0;
                return {
                    id: `${ctx.uid}_${ctx.sess}_${ctx.sourceKey}_${rid}`,
                    record_id: rid,
                    user_id: ctx.uid,
                    tenant_id: ctx.tid,
                    session: ctx.sess,
                    source_key: ctx.sourceKey,
                    date: item.date || null,
                    type: String(item.type || 'bana').toLowerCase(),
                    item_name: item.itemName || item.name || '',
                    from_karkhana_id: item.fromKarkhanaId || 'k_main',
                    to_karkhana_id: item.toKarkhanaId || '',
                    qty: q,
                    note: item.note || '',
                    client_ts: item.timestamp ? Number(item.timestamp) : null,
                    extra,
                    is_deleted: false
                };
            },
            fromSqlRow: (row) => {
                const extraObj = (row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra))
                    ? row.extra
                    : {};
                const q = Number(row.qty) || 0;
                return {
                    ...extraObj,
                    id: row.record_id || row.id,
                    date: row.date || '',
                    type: row.type || 'bana',
                    itemName: row.item_name || '',
                    fromKarkhanaId: row.from_karkhana_id || 'k_main',
                    toKarkhanaId: row.to_karkhana_id || '',
                    qty: q,
                    quantity: q,
                    note: row.note || '',
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
        // Dukan check ko transfer se pehle rakhein (taaki dukan_transfer_history sahi table me jaye)
        if (k.includes('dukan')) return 'dukan_challans';
        if (k.includes('material_transfer') || k.includes('transfer')) return 'material_transfers';

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
                if (!workers.length && window.APP_MEMORY_CACHE?.jobwork_workers) {
                    workers = window.APP_MEMORY_CACHE.jobwork_workers;
                }
                if (!workers.length) workers = JSON.parse(localStorage.getItem('jobwork_workers') || '[]');
            } catch (_) {}
            const found = workers.find(w => w && String(w.id).toLowerCase() === workerId.toLowerCase());
            const wType = String(found?.type || '').toLowerCase();

            if (wType === 'embroidery') return 'embroidery_history';
            if (wType === 'calender') return 'calender_history';
            return 'cutting_history';
        }

        // WORKERS LIST ➔ ROW-BY-ROW MASTER TABLE
        if (k.includes('jobwork_workers') || k.includes('cutting_workers') || k.includes('calender_workers') || k.includes('embroidery_workers')) {
            return 'jobwork_workers';
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
        if (tableName === 'jobwork_workers' || k.includes('jobwork_workers')) return 'jobwork_workers';
        if (tableName === 'job_work_bills' && k.includes('jw_bills_list')) return 'jw_bills_list';
        if (tableName === 'job_work_bills' && k.includes('jw_payments_list')) return 'jw_payments_list';
        if (tableName === 'tani_orders' || k.includes('tani_orders')) return 'tani_orders_list';
        if (tableName === 'dukan_challans' || k.includes('dukan_transfer')) return 'dukan_transfer_history';
        if (tableName === 'material_transfers' || k.includes('material_transfer')) return 'material_transfers';
        return cloudKey;
    };

    const getTableProgressLabel = (tbl) => {
        switch (tbl) {
            case 'app_store': return 'Session & Settings load ho rahi hain...';
            case 'saree_stock':
            case 'saree_history': return 'Saree Stock & Passbook (Delta Sync) load ho raha hai...';
            case 'zari_stock':
            case 'zari_history': return 'Zari Stock & Hisab (Delta Sync) load ho raha hai...';
            case 'bana_stock':
            case 'bana_history': return 'Bana Stock & Hisab (Delta Sync) load ho raha hai...';
            case 'sancha_list':
            case 'sancha_history': return 'Sancha (Tani & Chukka • Delta Sync) load ho raha hai...';
            case 'karigers':
            case 'tani_sheets': return 'Sabhi Karigers & Tani Sheets (Delta Sync) load ho rahi hain...';
            case 'material_transfers': return 'Material Transfers (Delta Sync) load ho rahe hain...';
            case 'dukan_challans': return 'Dukan Challans (Delta Sync) load ho rahe hain...';
            case 'payments': return 'Payments & Bakaya Hisab (Delta Sync) load ho raha hai...';
            case 'cutting_history':
            case 'embroidery_history':
            case 'calender_history':
            case 'job_work_bills':
            case 'jobwork_workers': return 'Jobwork Workers, Sheets & Bills (Delta Sync) load ho rahe hain...';
            case 'tani_orders': return 'Tani Orders & Rangai Chart (Delta Sync) load ho raha hai...';
            case 'tani_learned': return 'Tani Learned Colors & Rangi load ho raha hai...';
            case 'info_ledger':
            case 'billing_config': return 'Ledger & Billing Config load rahi hai...';
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
        if (typeof window.renderDukanTransferTable === 'function') window.renderDukanTransferTable();
        if (typeof window.invalidateJobWorkCache === 'function') window.invalidateJobWorkCache();
        if (window.currentJobWorkMode === 'embroidery' && typeof window.renderEmbroideryWorkersTable === 'function') {
            window.renderEmbroideryWorkersTable();
        } else if (window.currentJobWorkMode === 'cutting' && typeof window.renderCuttingWorkersTable === 'function') {
            window.renderCuttingWorkersTable();
        } else if (window.currentJobWorkMode === 'calender' && typeof window.renderCalenderWorkersTable === 'function') {
            window.renderCalenderWorkersTable();
        } else if (typeof window.renderJobWorkWorkersTable === 'function') {
            window.renderJobWorkWorkersTable();
        }
        if (typeof window.renderJwMovementDaybook === 'function') window.renderJwMovementDaybook();
        if (typeof window.renderJwBillsTable === 'function') window.renderJwBillsTable();
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
            const ctx = { uid, tid, sess, sourceKey, shortKey, fullKey };

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
                // Sheet order (jaise Tani 1, Tani 2, Month 1, Month 2...) barabar rakhne ke liye sort karein
                if (rows.length > 1 && rows[0] && rows[0].sheet_order !== undefined) {
                    rows.sort((a, b) => (Number(a.sheet_order) || 0) - (Number(b.sheet_order) || 0));
                }

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
                if (typeof schema.sortList === 'function') {
                    schema.sortList(mergedArr);
                }

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

            // Purane JSONB tables (jaise app_store / material_transfers) ke stale records ko ignore karein jo ab Row-by-Row tables me hain
            if (localKey && !Object.prototype.hasOwnProperty.call(ROW_SYNC_SCHEMAS, tbl)) {
                const resolved = resolveTargetTable(localKey);
                if (resolved !== tbl && Object.prototype.hasOwnProperty.call(ROW_SYNC_SCHEMAS, resolved)) {
                    return;
                }
            }

            const mappedLocalKey = mapCloudKeyToLocalKey(localKey, tbl);
            const rowData = row.data !== undefined ? row.data : (row.value !== undefined ? row.value : row);

            if (mappedLocalKey && rowData !== undefined) {
                if (smartApplyRemoteData(mappedLocalKey, rowData)) hasNewData = true;
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
                'jobwork_workers',
                'cutting_history', 'embroidery_history', 'calender_history',
                'job_work_bills',
                'tani_orders',
                'info_ledger',
                'billing_config',
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
