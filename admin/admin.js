/* ============================================================================
   SIMPLICITY ERP - LIVE ADMIN CONTROL & REALTIME USER APPROVAL
   File: admin/admin.js • Developed by Farhan Jawed
   Architecture: Supabase PostgreSQL Realtime Engine • Modern Slate UI
============================================================================ */

(() => {
    'use strict';

    window.adminUsersData = [];
    let supabaseAdminChannel = null;
    let currentAdminFilter = 'all';
    let currentAdminSearch = '';

    const getSupabaseAdmin = () => {
        return window.supabaseClient || (window.CloudEngine && window.CloudEngine.supabase) || null;
    };

    const esc = (s) => {
        if (typeof window.sanitizeHTML === 'function') return window.sanitizeHTML(s);
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    const formatDate = (d) => {
        if (typeof window.formatDateDisplay === 'function') return window.formatDateDisplay(d);
        if (!d) return '-';
        const p = String(d).split('-');
        return (p.length === 3 && p[0].length === 4) ? `${p[2]}-${p[1]}-${p[0]}` : d;
    };

    const buildModernAdminShell = () => {
        const adminSec = document.getElementById('admin-section');
        if (!adminSec || adminSec.dataset.modernBuilt === 'true') return;

        adminSec.dataset.modernBuilt = 'true';
        adminSec.innerHTML = `
            <style>
                .adm-wrap { font-family: sans-serif; max-width: 1150px; margin: 0 auto; }
                .adm-topbar {
                    background: #0f172a; color: #ffffff; padding: 14px 18px; border-radius: 14px;
                    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
                    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25); margin-bottom: 14px;
                }
                .adm-stats {
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 10px; margin-bottom: 14px;
                }
                .adm-stat-card {
                    background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px;
                    padding: 12px 14px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
                }
                .adm-stat-card small { font-size: 11px; font-weight: 700; display: block; margin-bottom: 4px; }
                .adm-stat-card h3 { margin: 0; font-size: 22px; font-weight: 900; }
                .adm-toolbar {
                    background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px;
                    padding: 10px 12px; margin-bottom: 14px; display: flex;
                    justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
                }
                .adm-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
                .adm-tab-btn {
                    background: #ffffff; color: #334155; border: 1px solid #cbd5e1;
                    padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
                }
                .adm-tab-btn.active {
                    background: #0f172a; color: #ffffff; border-color: #0f172a;
                }
                .adm-search {
                    padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;
                    font-size: 13px; min-width: 220px; flex: 1; max-width: 320px; box-sizing: border-box;
                }
                .adm-table-card {
                    background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px;
                    overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
                }
                .adm-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
                .adm-table thead tr { background: #0f172a; color: #ffffff; text-align: left; }
                .adm-table th { padding: 11px 10px; font-weight: 700; font-size: 12px; white-space: nowrap; }
                .adm-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
                .adm-table tbody tr:hover { background: #f8fafc; }
                @media (max-width: 640px) {
                    .adm-topbar { padding: 12px 14px; }
                    .adm-search { max-width: 100%; width: 100%; }
                }
            </style>

            <div class="adm-wrap">
                <div class="adm-topbar">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <button type="button" onclick="backToDashboard()" style="background:#1e293b; color:#ffffff; border:1px solid #334155; padding:7px 12px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer;">← Dashboard</button>
                        <div>
                            <h2 style="margin:0; font-size:17px; font-weight:800; color:#ffffff;">👑 Master Admin Control</h2>
                            <div style="font-size:11.5px; color:#94a3b8;">Users Approval, Validity & Security Panel</div>
                        </div>
                    </div>
                    <button type="button" id="admin-refresh-users-btn" onclick="refreshAdminUsersList()" style="background:#0f766e; color:#ffffff; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer;">🔄 Refresh List</button>
                </div>

                <div class="adm-stats">
                    <div class="adm-stat-card">
                        <small style="color:#64748b;">👥 Kul Users</small>
                        <h3 id="adm-stat-total" style="color:#0f172a;">0</h3>
                    </div>
                    <div class="adm-stat-card" style="background:#ecfdf5; border-color:#a7f3d0;">
                        <small style="color:#047857;">🟢 Active</small>
                        <h3 id="adm-stat-active" style="color:#047857;">0</h3>
                    </div>
                    <div class="adm-stat-card" style="background:#fffbeb; border-color:#fde68a;">
                        <small style="color:#b45309;">⏳ Approval Pending</small>
                        <h3 id="adm-stat-pending" style="color:#b45309;">0</h3>
                    </div>
                    <div class="adm-stat-card" style="background:#fef2f2; border-color:#fecaca;">
                        <small style="color:#b91c1c;">⛔ Blocked / Expired</small>
                        <h3 id="adm-stat-blocked" style="color:#b91c1c;">0</h3>
                    </div>
                </div>

                <div id="admin-pending-approval-banner" style="display:none;"></div>

                <div class="adm-toolbar">
                    <div class="adm-tabs">
                        <button type="button" class="adm-tab-btn active" id="adm-tab-all" onclick="setAdminUsersFilter('all')">Sabhi</button>
                        <button type="button" class="adm-tab-btn" id="adm-tab-pending" onclick="setAdminUsersFilter('pending')">⏳ Pending</button>
                        <button type="button" class="adm-tab-btn" id="adm-tab-active" onclick="setAdminUsersFilter('active')">🟢 Active</button>
                        <button type="button" class="adm-tab-btn" id="adm-tab-blocked" onclick="setAdminUsersFilter('blocked')">⛔ Blocked / Expired</button>
                    </div>
                    <input type="text" id="admin-search-input" class="adm-search" placeholder="🔍 Naam, User ID ya Mobile search..." oninput="handleAdminUserSearch(this.value)">
                </div>

                <div class="adm-table-card">
                    <div class="table-responsive" style="overflow-x:auto;">
                        <table class="adm-table">
                            <thead>
                                <tr>
                                    <th style="width:40px; text-align:center;">#</th>
                                    <th>Karkhana / Naam</th>
                                    <th>Mobile & ID</th>
                                    <th>Password</th>
                                    <th>Join & Validity</th>
                                    <th>Status</th>
                                    <th style="text-align:center;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="admin-users-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    };

    // 👑 1. ADMIN PANEL OPEN
    function openAdminModule() {
        const uid = String(window.currentUserId || localStorage.getItem('app_current_user_id') || '').trim().toLowerCase();
        const role = String(window.currentUserRole || '').trim().toLowerCase();

        if (role !== 'admin' && uid !== 'farhan') {
            return alert('⛔ Sirf Master Admin (Farhan) is panel ko access kar sakte hain!');
        }

        if (typeof window.hideAllSections === 'function') {
            window.hideAllSections();
        } else {
            document.querySelectorAll('.module-section').forEach((s) => { s.style.display = 'none'; });
            const dView = document.getElementById('dashboard-view');
            if (dView) dView.style.display = 'none';
        }

        const adminSec = document.getElementById('admin-section');
        if (adminSec) adminSec.style.display = 'block';

        buildModernAdminShell();
        renderAdminUsersTable();
        fetchAndListenAdminUsers();
    }

    // 🌐 2. SUPABASE REALTIME LISTENER & FETCH
    async function fetchAndListenAdminUsers(callback) {
        const sb = getSupabaseAdmin();
        if (!sb) {
            if (typeof callback === 'function') callback(false, 'Supabase DB not connected');
            return;
        }

        try {
            const { data, error } = await sb
                .from('karkhana_users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const arr = [];
            if (data && Array.isArray(data)) {
                data.forEach((row) => {
                    arr.push({
                        id: row.user_id,
                        name: row.full_name || row.user_id,
                        mobile: row.mobile || '-',
                        email: row.email || '',
                        pass: row.password || '-',
                        pin: row.pin || '',
                        role: row.role || 'owner',
                        status: row.status || 'active',
                        date: row.created_at ? row.created_at.split('T')[0] : '-',
                        expiryDate: row.validity_date || ''
                    });
                });
            }

            window.adminUsersData = arr;
            renderAdminUsersTable();
            if (typeof callback === 'function') callback(true, arr);

            if (!supabaseAdminChannel) {
                supabaseAdminChannel = sb.channel('admin-users-live')
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'karkhana_users' },
                        () => {
                            const sec = document.getElementById('admin-section');
                            if (sec && sec.style.display !== 'none') {
                                fetchAndListenAdminUsers();
                            }
                        }
                    )
                    .subscribe();
            }
        } catch (err) {
            console.error('[Admin] Supabase fetch error:', err);
            if (typeof callback === 'function') callback(false, err.message);
        }
    }

    function setAdminUsersFilter(tab) {
        currentAdminFilter = tab || 'all';
        ['all', 'pending', 'active', 'blocked'].forEach((t) => {
            const btn = document.getElementById(`adm-tab-${t}`);
            if (btn) btn.classList.toggle('active', t === currentAdminFilter);
        });
        renderAdminUsersTable();
    }

    function handleAdminUserSearch(val) {
        currentAdminSearch = String(val || '').trim().toLowerCase();
        renderAdminUsersTable();
    }

    function toggleAdminRowPass(btn) {
        if (!btn) return;
        const wrap = btn.parentElement;
        const span = wrap ? wrap.querySelector('.adm-pass-val') : null;
        if (!span) return;
        const isHidden = span.dataset.shown !== 'true';
        if (isHidden) {
            span.textContent = decodeURIComponent(span.dataset.raw || '');
            span.dataset.shown = 'true';
            btn.textContent = '🙈';
        } else {
            span.textContent = '••••••';
            span.dataset.shown = 'false';
            btn.textContent = '👁️';
        }
    }

    // 📊 3. TABLE & APPROVAL BANNER RENDERER
    function renderAdminUsersTable() {
        buildModernAdminShell();

        const users = Array.isArray(window.adminUsersData) ? window.adminUsersData : [];
        const tbody = document.getElementById('admin-users-table-body');
        if (!tbody) return;

        let tot = 0, act = 0, blk = 0, pnd = 0;
        const pendingUsersList = [];
        const todayIso = new Date().toISOString().split('T')[0];

        const enriched = users.filter(Boolean).map((u) => {
            const uIdStr = String(u.id || '').trim();
            const isOwner = (uIdStr.toLowerCase() === 'farhan' || String(u.role || '').toLowerCase() === 'admin');
            const st = String(u.status || '').toLowerCase().trim();
            const isPending = !isOwner && (st === 'pending' || st === 'pending_approval' || st === 'waiting');
            const isBlocked = !isOwner && (st === 'blocked');
            const isExpired = !isOwner && Boolean(u.expiryDate && u.expiryDate < todayIso);

            tot++;
            if (isPending) {
                pnd++;
                pendingUsersList.push(u);
            } else if (isBlocked || isExpired) {
                blk++;
            } else {
                act++;
            }

            return { u, uIdStr, isOwner, isPending, isBlocked, isExpired };
        });

        const elTot = document.getElementById('adm-stat-total');
        const elAct = document.getElementById('adm-stat-active');
        const elPnd = document.getElementById('adm-stat-pending');
        const elBlk = document.getElementById('adm-stat-blocked');
        if (elTot) elTot.textContent = tot;
        if (elAct) elAct.textContent = act;
        if (elPnd) elPnd.textContent = pnd;
        if (elBlk) elBlk.textContent = blk;

        const filtered = enriched.filter((item) => {
            if (currentAdminFilter === 'pending' && !item.isPending) return false;
            if (currentAdminFilter === 'active' && (item.isPending || item.isBlocked || item.isExpired)) return false;
            if (currentAdminFilter === 'blocked' && !(item.isBlocked || item.isExpired)) return false;
            if (currentAdminSearch) {
                const hay = `${item.u.name || ''} ${item.uIdStr} ${item.u.mobile || ''} ${item.u.email || ''}`.toLowerCase();
                if (!hay.includes(currentAdminSearch)) return false;
            }
            return true;
        });

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b; font-weight:600;">${users.length ? 'Koi user filter se match nahi hua.' : 'Users load ho rahe hain ya koi user nahi mila...'}</td></tr>`;
        } else {
            let rowsHtml = '';
            filtered.forEach((item, idx) => {
                const { u, uIdStr, isOwner, isPending, isBlocked, isExpired } = item;
                const safeIdAttr = esc(uIdStr);

                let stBadge = '';
                if (isOwner) {
                    stBadge = `<span style="background:#0f172a; color:#38bdf8; padding:4px 10px; border-radius:20px; font-weight:800; font-size:11px; white-space:nowrap;">👑 Owner</span>`;
                } else if (isPending) {
                    stBadge = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:4px 10px; border-radius:20px; font-weight:800; font-size:11px; white-space:nowrap;">⏳ Pending</span>`;
                } else if (isBlocked) {
                    stBadge = `<span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:20px; font-weight:800; font-size:11px; white-space:nowrap;">⛔ Blocked</span>`;
                } else if (isExpired) {
                    stBadge = `<span style="background:#ffedd5; color:#c2410c; padding:4px 10px; border-radius:20px; font-weight:800; font-size:11px; white-space:nowrap;">⌛ Expired</span>`;
                } else {
                    stBadge = `<span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:20px; font-weight:800; font-size:11px; white-space:nowrap;">🟢 Active</span>`;
                }

                let actionBtns = '';
                if (isPending) {
                    actionBtns = `
                        <button type="button" onclick="approveUserByAdmin('${safeIdAttr}')" style="background:#0f766e; color:#fff; border:none; font-weight:700; padding:6px 10px; border-radius:6px; font-size:11.5px; cursor:pointer;">✅ Approve</button>
                        <button type="button" onclick="deleteUserByAdmin('${safeIdAttr}')" style="background:#dc2626; color:#fff; border:none; font-weight:700; padding:6px 10px; border-radius:6px; font-size:11.5px; cursor:pointer;">🗑️ Reject</button>
                    `;
                } else if (!isOwner) {
                    actionBtns = `
                        <button type="button" onclick="toggleUserBlockStatus('${safeIdAttr}')" style="background:${isBlocked ? '#0f766e' : '#f59e0b'}; color:#fff; border:none; font-weight:700; padding:5px 9px; border-radius:6px; font-size:11px; cursor:pointer;">${isBlocked ? 'Unblock' : 'Block'}</button>
                        <button type="button" onclick="resetUserPasswordByAdmin('${safeIdAttr}')" style="background:#0284c7; color:#fff; border:none; font-weight:700; padding:5px 9px; border-radius:6px; font-size:11px; cursor:pointer;">🔑 Pass</button>
                        <button type="button" onclick="deleteUserByAdmin('${safeIdAttr}')" style="background:#dc2626; color:#fff; border:none; font-weight:700; padding:5px 8px; border-radius:6px; font-size:11px; cursor:pointer;">🗑️</button>
                    `;
                } else {
                    actionBtns = `<span style="color:#0f766e; font-weight:800; font-size:11.5px;">Full Control</span>`;
                }

                let expiryDisplay = '';
                if (isOwner) {
                    expiryDisplay = `<div style="font-size:11px; color:#64748b;">Join: ${esc(formatDate(u.date))}</div><strong style="color:#0f766e; font-size:12px;">Lifetime</strong>`;
                } else if (isPending) {
                    expiryDisplay = `<div style="font-size:11px; color:#64748b;">Req: ${esc(formatDate(u.date))}</div><span style="color:#b45309; font-weight:700; font-size:11.5px;">Approval Ka Intezar</span>`;
                } else {
                    expiryDisplay = `
                        <div style="font-size:11px; color:#64748b; margin-bottom:3px;">Join: ${esc(formatDate(u.date))}</div>
                        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                            <input type="date" value="${esc(u.expiryDate || '')}" onchange="updateUserExpiryDate('${safeIdAttr}', this.value)" style="padding:3px 5px; font-size:11px; border-radius:5px; border:1px solid #cbd5e1;">
                            <button type="button" onclick="extendValidity('${safeIdAttr}', 30)" style="padding:4px 7px; font-size:10.5px; font-weight:700; border-radius:5px; border:none; background:#2563eb; color:#fff; cursor:pointer;">+30D</button>
                        </div>
                    `;
                }

                const encodedPass = encodeURIComponent(String(u.pass || '-'));

                rowsHtml += `
                    <tr>
                        <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
                        <td>
                            <strong style="color:#0f172a; font-size:13px;">${esc(u.name || '-')}</strong>
                            ${u.email ? `<div style="font-size:11px; color:#64748b;">${esc(u.email)}</div>` : ''}
                        </td>
                        <td>
                            <div style="font-weight:600; color:#334155;">📞 ${esc(u.mobile || '-')}</div>
                            <code style="background:#f1f5f9; color:#1e3a8a; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700;">ID: ${esc(uIdStr)}</code>
                        </td>
                        <td>
                            <div style="display:inline-flex; align-items:center; gap:6px; background:#f8fafc; border:1px solid #e2e8f0; padding:3px 8px; border-radius:6px;">
                                <span class="adm-pass-val" data-raw="${encodedPass}" data-shown="false" style="font-weight:800; color:#1e3a8a; letter-spacing:1px;">••••••</span>
                                <button type="button" onclick="toggleAdminRowPass(this)" style="background:transparent; border:none; cursor:pointer; font-size:13px; padding:0;" title="Show/Hide Password">👁️</button>
                            </div>
                        </td>
                        <td>${expiryDisplay}</td>
                        <td>${stBadge}</td>
                        <td style="text-align:center; white-space:nowrap;">${actionBtns}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = rowsHtml;
        }

        const pendingBanner = document.getElementById('admin-pending-approval-banner');
        if (pendingBanner) {
            if (pendingUsersList.length > 0) {
                let pHtml = `
                    <div style="background:#fffbeb; border:1.5px solid #f59e0b; border-radius:12px; padding:14px; margin-bottom:14px;">
                        <div style="color:#b45309; font-size:14px; font-weight:800; margin-bottom:10px;">🔔 Naye Account Approval Requests (${pendingUsersList.length}):</div>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                `;
                pendingUsersList.forEach((pu) => {
                    const pId = esc(String(pu.id || '').trim());
                    pHtml += `
                        <div style="background:#ffffff; border:1px solid #fde68a; border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                            <div>
                                <strong style="color:#0f172a; font-size:13.5px;">👤 ${esc(pu.name || '-')}</strong>
                                &bull; <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">ID: ${pId}</code>
                                &bull; <span style="font-size:12.5px;">📞 ${esc(pu.mobile || '-')}</span>
                                <div style="font-size:11px; color:#64748b; margin-top:2px;">Request Date: ${esc(formatDate(pu.date))}</div>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button type="button" onclick="approveUserByAdmin('${pId}')" style="background:#0f766e; color:#fff; border:none; font-weight:800; padding:8px 14px; border-radius:8px; font-size:12px; cursor:pointer;">✅ Approve Karein</button>
                                <button type="button" onclick="deleteUserByAdmin('${pId}')" style="background:#dc2626; color:#fff; border:none; font-weight:800; padding:8px 12px; border-radius:8px; font-size:12px; cursor:pointer;">🗑️ Reject</button>
                            </div>
                        </div>
                    `;
                });
                pHtml += `</div></div>`;
                pendingBanner.innerHTML = pHtml;
                pendingBanner.style.display = 'block';
            } else {
                pendingBanner.style.display = 'none';
            }
        }
    }

    // 🔄 4. REFRESH BUTTON (SUPABASE)
    async function refreshAdminUsersList() {
        const btn = document.getElementById('admin-refresh-users-btn');
        if (btn) btn.textContent = '⏳ Syncing...';

        const sb = getSupabaseAdmin();
        if (!sb) {
            if (btn) btn.textContent = '🔄 Refresh List';
            return alert('⚠️ Supabase connect nahi hai!');
        }

        try {
            const { data, error } = await sb
                .from('karkhana_users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const arr = [];
            let pendingCount = 0;

            if (data && Array.isArray(data)) {
                data.forEach((row) => {
                    const st = String(row.status || '').toLowerCase().trim();
                    if (st === 'pending' || st === 'pending_approval' || st === 'waiting') {
                        pendingCount++;
                    }
                    arr.push({
                        id: row.user_id,
                        name: row.full_name || row.user_id,
                        mobile: row.mobile || '-',
                        email: row.email || '',
                        pass: row.password || '-',
                        pin: row.pin || '',
                        role: row.role || 'owner',
                        status: row.status || 'active',
                        date: row.created_at ? row.created_at.split('T')[0] : '-',
                        expiryDate: row.validity_date || ''
                    });
                });
            }

            window.adminUsersData = arr;
            renderAdminUsersTable();
            if (btn) btn.textContent = '🔄 Refresh List';

            alert(`✅ Refresh Ho Gaya!\n\n📊 Kul Users: ${arr.length}\n⏳ Approval Pending: ${pendingCount}\n🟢 Active/Others: ${arr.length - pendingCount}`);
        } catch (err) {
            if (btn) btn.textContent = '🔄 Refresh List';
            alert('❌ Refresh Error: ' + err.message);
        }
    }

    // ✅ 5. ADMIN ACTIONS (SUPABASE POSTGRESQL MUTATIONS)
    async function approveUserByAdmin(uid) {
        const exp = new Date();
        exp.setDate(exp.getDate() + 30);
        const formattedExp = exp.toISOString().split('T')[0];

        const sb = getSupabaseAdmin();
        if (!sb) return alert('Supabase connect nahi hai!');

        try {
            const { error } = await sb
                .from('karkhana_users')
                .update({
                    status: 'active',
                    validity_date: formattedExp
                })
                .eq('user_id', uid);

            if (error) throw error;

            alert(`🎉 User '${uid}' APPROVE ho gaya!\nAb wo turant login kar sakta hai.`);
            refreshAdminUsersList();
        } catch (err) {
            alert('Approve error: ' + err.message);
        }
    }

    async function updateUserExpiryDate(uid, dateVal) {
        const sb = getSupabaseAdmin();
        if (!sb) return;

        try {
            const { error } = await sb
                .from('karkhana_users')
                .update({ validity_date: dateVal })
                .eq('user_id', uid);
            if (error) throw error;
        } catch (err) {
            console.error('Expiry update error:', err);
        }
    }

    async function extendValidity(uid, days) {
        const u = (window.adminUsersData || []).find((x) => String(x.id) === String(uid));
        const base = (u && u.expiryDate && new Date(u.expiryDate) > new Date()) ? new Date(u.expiryDate) : new Date();
        base.setDate(base.getDate() + days);
        const formatted = base.toISOString().split('T')[0];

        const sb = getSupabaseAdmin();
        if (!sb) return alert('Supabase connect nahi hai!');

        try {
            const { error } = await sb
                .from('karkhana_users')
                .update({
                    validity_date: formatted,
                    status: 'active'
                })
                .eq('user_id', uid);

            if (error) throw error;

            alert(`✅ Validity ${days} din badh gayi!`);
            refreshAdminUsersList();
        } catch (err) {
            alert('Validity update error: ' + err.message);
        }
    }

    async function resetUserPasswordByAdmin(uid) {
        const newPass = prompt('Naya password daalein:', Math.floor(100000 + Math.random() * 900000).toString());
        if (!newPass || !newPass.trim()) return;

        const sb = getSupabaseAdmin();
        if (!sb) return alert('Supabase connect nahi hai!');

        try {
            const { error } = await sb
                .from('karkhana_users')
                .update({ password: newPass.trim() })
                .eq('user_id', uid);

            if (error) throw error;

            alert('✅ Password update ho gaya!');
            refreshAdminUsersList();
        } catch (err) {
            alert('Password reset error: ' + err.message);
        }
    }

    async function toggleUserBlockStatus(uid) {
        if (String(uid).toLowerCase() === 'farhan') return alert('⛔ Master Admin block nahi ho sakta!');
        const u = (window.adminUsersData || []).find((x) => String(x.id) === String(uid));
        const nextStatus = (u && u.status === 'blocked') ? 'active' : 'blocked';

        const sb = getSupabaseAdmin();
        if (!sb) return alert('Supabase connect nahi hai!');

        try {
            const { error } = await sb
                .from('karkhana_users')
                .update({ status: nextStatus })
                .eq('user_id', uid);

            if (error) throw error;

            refreshAdminUsersList();
        } catch (err) {
            alert('Block/Unblock error: ' + err.message);
        }
    }

    async function deleteUserByAdmin(uid) {
        if (String(uid).toLowerCase() === 'farhan') return alert('⛔ Master Admin delete nahi ho sakta!');
        if (!confirm('Kya aap sach me is User ko delete/reject karna chahte hain?')) return;

        const sb = getSupabaseAdmin();
        if (!sb) return alert('Supabase connect nahi hai!');

        try {
            const { error } = await sb
                .from('karkhana_users')
                .delete()
                .eq('user_id', uid);

            if (error) throw error;

            alert('🗑️ User delete ho gaya!');
            refreshAdminUsersList();
        } catch (err) {
            alert('Delete error: ' + err.message);
        }
    }

    // Window bindings
    window.openAdminModule = openAdminModule;
    window.renderAdminUsersTable = renderAdminUsersTable;
    window.approveUserByAdmin = approveUserByAdmin;
    window.updateUserExpiryDate = updateUserExpiryDate;
    window.extendValidity = extendValidity;
    window.resetUserPasswordByAdmin = resetUserPasswordByAdmin;
    window.toggleUserBlockStatus = toggleUserBlockStatus;
    window.deleteUserByAdmin = deleteUserByAdmin;
    window.refreshAdminUsersList = refreshAdminUsersList;
    window.setAdminUsersFilter = setAdminUsersFilter;
    window.handleAdminUserSearch = handleAdminUserSearch;
    window.toggleAdminRowPass = toggleAdminRowPass;
})();
