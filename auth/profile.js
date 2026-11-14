/* ============================================================================
   SIMPLICITY ERP - SECURE USER PROFILE, STORAGE & RENEWAL PAYMENT ENGINE
   File: auth/profile.js • Developed by Farhan Jawed
   Features:
   - Hidden Password + Requires Old Password to set New Password
   - Live Cloud Storage Usage (KB / MB / GB) via Supabase RPC
   - Client Renewal / Payment Modal (Admin QR + UPI + Bank Details + WhatsApp)
============================================================================ */

(() => {
    'use strict';

    const BILLING_CONFIG_ID = 'farhan_global_billing_config';
    const DEFAULT_BILLING_CONFIG = Object.freeze({
        planPrice: '299',
        accountHolder: 'FARHAN JAWED',
        bankName: 'State Bank of India',
        accountNumber: '',
        ifscCode: '',
        upiId: 'farhan275101-2@oksbi',
        whatsappNo: '917065572191',
        qrImageBase64: '',
        note: 'Payment karne ke baad screenshot WhatsApp par bhej dein.'
    });

    /* ========================================================================
       1. INPUT SANITIZATION & HELPERS
       ------------------------------------------------------------------------
    ======================================================================== */
    const sanitizeText = (val) => String(val || '').trim();
    const sanitizeMobile = (mob) => String(mob || '').trim().replace(/[^0-9]/g, '');
    const sanitizePin = (pin) => String(pin || '').trim().replace(/[^0-9]/g, '').slice(0, 4);

    const esc = (s) => {
        if (typeof window.sanitizeHTML === 'function') return window.sanitizeHTML(s);
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    const getSupabase = () => {
        return window.supabaseClient || (window.CloudEngine && window.CloudEngine.supabase) || null;
    };

    const _setDisplay = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.setProperty('display', val, 'important');
        }
    };

    const formatBytes = (bytes) => {
        const b = Number(bytes) || 0;
        if (b <= 0) return '0 KB';
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
        return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const formatDateDisp = (d) => {
        if (typeof window.formatDateDisplay === 'function') return window.formatDateDisplay(d);
        if (!d) return '-';
        const p = String(d).split('-');
        return (p.length === 3 && p[0].length === 4) ? `${p[2]}-${p[1]}-${p[0]}` : d;
    };

    const getActiveUid = () => {
        if (window.currentUserId && String(window.currentUserId).trim()) {
            return String(window.currentUserId).trim();
        }
        const saved = localStorage.getItem('app_current_user_id');
        if (saved && saved.trim()) return saved.trim();
        return null;
    };

    const getCurrentUserRecord = async () => {
        const uid = getActiveUid();
        if (!uid) return null;

        if (window.AuthEngine && typeof window.AuthEngine.fetchUserByIdentifier === 'function') {
            const user = await window.AuthEngine.fetchUserByIdentifier(uid);
            if (user) return user;
        }

        try {
            const sessionRaw = localStorage.getItem('app_active_session_auth');
            if (sessionRaw) {
                return JSON.parse(sessionRaw);
            }
        } catch (_) {}

        return null;
    };

    const estimateLocalStorageBytes = (uid) => {
        let total = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(`${uid}_`)) {
                    total += (localStorage.getItem(k) || '').length;
                }
            }
        } catch (_) {}
        return total;
    };

    const fetchUserCloudStorageBytes = async (uid) => {
        if (!uid) return 0;
        const sb = getSupabase();
        if (sb && navigator.onLine) {
            try {
                const { data, error } = await sb.rpc('get_single_user_storage_usage', { p_uid: uid });
                if (!error && data !== null && data !== undefined) {
                    return Number(data) || 0;
                }
            } catch (_) {}
        }
        return estimateLocalStorageBytes(uid);
    };

    const fetchBillingConfigForClient = async () => {
        let cfg = { ...DEFAULT_BILLING_CONFIG };
        try {
            const localRaw = localStorage.getItem('app_global_billing_config');
            if (localRaw) cfg = { ...cfg, ...JSON.parse(localRaw) };
        } catch (_) {}

        const sb = getSupabase();
        if (sb && navigator.onLine) {
            try {
                const { data } = await sb
                    .from('app_store')
                    .select('data, value')
                    .eq('id', BILLING_CONFIG_ID)
                    .limit(1);
                if (data && data.length > 0) {
                    const cloudObj = data[0].data || data[0].value;
                    if (cloudObj && typeof cloudObj === 'object') {
                        cfg = { ...cfg, ...cloudObj };
                        try { localStorage.setItem('app_global_billing_config', JSON.stringify(cfg)); } catch (_) {}
                    }
                }
            } catch (_) {}
        }
        return cfg;
    };

    const copyTextWithFeedback = (text, btnEl, origText) => {
        if (!text) return;
        const done = () => {
            if (btnEl) {
                btnEl.textContent = '✅ Copied!';
                setTimeout(() => { btnEl.textContent = origText; }, 1500);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => prompt('Copy karein:', text));
        } else {
            prompt('Copy karein:', text);
        }
    };

    /* ========================================================================
       2. ENSURE PROFILE MODAL & FIELDS EXIST
       ------------------------------------------------------------------------
    ======================================================================== */
    const ensureProfileModalAndFields = () => {
        let modal = document.getElementById('profile-modal');

        if (!modal) {
            const modalHtml = `
            <div id="profile-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.75); z-index:999999; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;">
                <div style="background:#ffffff; width:100%; max-width:450px; border-radius:14px; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4); font-family:sans-serif; max-height:94vh; display:flex; flex-direction:column;">
                    <div style="background:#0f172a; color:#ffffff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; font-size:16px; font-weight:800;">👤 User Profile & Security</h3>
                        <button type="button" onclick="closeProfileModal()" style="background:transparent; border:none; color:#fff; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                    </div>
                    <div style="padding:16px 18px; overflow-y:auto; flex:1;">

                        <!-- Storage & Validity Strip -->
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:9px 10px;">
                                <div style="font-size:10.5px; font-weight:700; color:#1d4ed8;">💾 Cloud Storage Used</div>
                                <div id="prof-storage-val" style="font-size:15px; font-weight:900; color:#0f172a; margin-top:2px;">Checking...</div>
                            </div>
                            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:9px 10px;">
                                <div style="font-size:10.5px; font-weight:700; color:#15803d;">📅 Plan Validity</div>
                                <div id="prof-validity-val" style="font-size:13px; font-weight:900; color:#0f172a; margin-top:2px;">-</div>
                            </div>
                        </div>

                        <button type="button" onclick="openClientPaymentModal()" style="width:100%; background:linear-gradient(135deg, #2563eb, #0f766e); color:#fff; border:none; padding:10px; border-radius:9px; font-size:13px; font-weight:800; cursor:pointer; margin-bottom:14px;">
                            💳 Plan Renew / QR Code & Bank Details Dekhein
                        </button>

                        <div style="margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Poora Naam / Karkhana:</label>
                            <input type="text" id="prof-name" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box;">
                        </div>
                        <div style="margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">User ID (Locked):</label>
                            <input type="text" id="prof-id" readonly style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box; background:#f3f4f6;">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Mobile Number:</label>
                                <input type="tel" id="prof-mobile" maxlength="10" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">4-Digit Security PIN:</label>
                                <input type="password" id="prof-pin" maxlength="4" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box;">
                            </div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Email (Optional):</label>
                            <input type="email" id="prof-email" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box;">
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:14px;">
                            <div style="font-size:12px; font-weight:800; color:#0f172a; margin-bottom:8px;">🔐 Password Badlein (Optional)</div>
                            <div id="prof-old-pass-wrap" style="margin-bottom:8px;">
                                <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">Purana Password (Sirf badalne ke liye):</label>
                                <input type="password" id="prof-old-pass" autocomplete="off" placeholder="Purana password daalein" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">Naya Password (Khali chhodein agar nahi badalna):</label>
                                <input type="password" id="prof-pass" autocomplete="new-password" placeholder="Naya password daalein" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:7px; font-size:13px; box-sizing:border-box;">
                            </div>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <button type="button" id="prof-save-btn" onclick="saveProfileSettings()" style="flex:1; background:#0f766e; color:#fff; border:none; padding:11px; border-radius:8px; font-size:14px; font-weight:800; cursor:pointer;">Settings Save Karein</button>
                            <button type="button" onclick="closeProfileModal()" style="background:#e2e8f0; color:#334155; border:none; padding:11px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">Close</button>
                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('profile-modal');
        }
        return modal;
    };

    /* ========================================================================
       3. CLIENT PAYMENT / QR CODE MODAL (FOR RENEWALS)
       ------------------------------------------------------------------------
    ======================================================================== */
    const openClientPaymentModal = async (customUser = null) => {
        closeClientPaymentModal();

        const user = customUser || (await getCurrentUserRecord()) || {
            id: getActiveUid() || 'User',
            name: 'Karkhana Client',
            expiryDate: ''
        };

        const loadingHtml = `
        <div id="client-payment-modal" style="position:fixed; inset:0; background:rgba(15,23,42,0.82); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;">
            <div style="background:#fff; padding:24px 30px; border-radius:14px; font-family:sans-serif; font-weight:700; color:#0f172a;">
                Payment QR Load Ho Raha Hai... ⏳
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', loadingHtml);

        const cfg = await fetchBillingConfigForClient();
        closeClientPaymentModal();

        const price = cfg.planPrice || '299';
        const upiId = cfg.upiId || 'farhan275101-2@oksbi';
        const holder = cfg.accountHolder || 'FARHAN JAWED';
        const bank = cfg.bankName || 'State Bank of India';
        const acNo = cfg.accountNumber || '';
        const ifsc = cfg.ifscCode || '';
        const waNo = (cfg.whatsappNo || '917065572191').replace(/[^0-9]/g, '');

        const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(holder)}${price ? `&am=${encodeURIComponent(price)}` : ''}&cu=INR&tn=${encodeURIComponent('Simplicity ERP ' + (user.id || ''))}`;
        const qrSrc = cfg.qrImageBase64
            ? cfg.qrImageBase64
            : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiDeepLink)}`;

        const waMsg = `Hello Farhan Bhai, maine Simplicity ERP ka payment kar diya hai.\n` +
            `• User ID: ${user.id || '-'}\n` +
            `• Naam: ${user.name || '-'}\n` +
            `• Amount: ₹${price}\n` +
            `(Screenshot saath bhej raha hoon, kripya validity badha dein)`;

        const html = `
        <div id="client-payment-modal" style="position:fixed; inset:0; background:rgba(15,23,42,0.82); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;">
            <div style="background:#ffffff; width:100%; max-width:420px; border-radius:16px; overflow:hidden; box-shadow:0 25px 50px rgba(0,0,0,0.45); font-family:sans-serif; max-height:95vh; display:flex; flex-direction:column;">
                <div style="background:#0f172a; color:#ffffff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:16px; font-weight:800;">💳 Plan Renewal & Payment</h3>
                        <div style="font-size:11.5px; color:#94a3b8;">User ID: ${esc(user.id || '-')} • Monthly: ₹${esc(price)}</div>
                    </div>
                    <button type="button" onclick="closeClientPaymentModal()" style="background:transparent; border:none; color:#fff; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                </div>

                <div style="padding:16px 18px; overflow-y:auto; flex:1; text-align:center;">
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:8px 12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                        <span style="color:#166534; font-weight:700;">Monthly Charge:</span>
                        <strong style="color:#0f766e; font-size:16px;">₹ ${esc(price)}</strong>
                    </div>

                    <!-- QR Code Box -->
                    <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px; padding:14px; margin-bottom:12px;">
                        <div style="font-size:12px; font-weight:800; color:#0f172a; margin-bottom:8px;">Scan QR Code (GPay / PhonePe / Paytm)</div>
                        <img src="${qrSrc}" alt="Payment QR Code" style="width:190px; height:190px; object-fit:contain; border-radius:10px; border:1px solid #cbd5e1; background:#ffffff; padding:6px;">
                        <div style="margin-top:10px; display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap;">
                            <code id="cl-pay-upi-text" style="background:#eff6ff; color:#1d4ed8; padding:5px 10px; border-radius:6px; font-size:12.5px; font-weight:800; border:1px solid #bfdbfe;">${esc(upiId)}</code>
                            <button type="button" id="cl-copy-upi-btn" style="background:#0f172a; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">📋 Copy UPI</button>
                        </div>
                        <a href="${upiDeepLink}" style="display:inline-block; margin-top:10px; width:100%; box-sizing:border-box; background:#2563eb; color:#ffffff; padding:10px; border-radius:8px; font-size:13px; font-weight:800; text-decoration:none;">
                            ⚡ UPI App Se Pay Karein (GPay / PhonePe)
                        </a>
                    </div>

                    <!-- Bank Details Box -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; text-align:left; font-size:12px; margin-bottom:12px;">
                        <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">🏦 Bank Account Details:</div>
                        <div style="margin-bottom:3px;"><strong>Name:</strong> ${esc(holder)}</div>
                        <div style="margin-bottom:3px;"><strong>Bank:</strong> ${esc(bank)}</div>
                        ${acNo ? `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;"><span><strong>A/C No:</strong> ${esc(acNo)}</span><button type="button" id="cl-copy-ac-btn" style="background:#e2e8f0; border:none; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:700; cursor:pointer;">Copy</button></div>` : ''}
                        ${ifsc ? `<div><strong>IFSC:</strong> ${esc(ifsc)}</div>` : ''}
                    </div>

                    <div style="font-size:11.5px; color:#475569; margin-bottom:10px; font-weight:600;">
                        ${esc(cfg.note || 'Payment karne ke baad screenshot WhatsApp par bhej dein.')}
                    </div>

                    <a href="https://wa.me/${waNo}?text=${encodeURIComponent(waMsg)}" target="_blank" style="display:block; width:100%; box-sizing:border-box; background:#16a34a; color:#ffffff; padding:11px; border-radius:9px; font-size:13.5px; font-weight:800; text-decoration:none; margin-bottom:8px;">
                        📲 Payment Screenshot WhatsApp Karein
                    </a>
                    <button type="button" onclick="closeClientPaymentModal()" style="width:100%; background:#e2e8f0; color:#334155; border:none; padding:9px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer;">Close</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);

        const copyUpiBtn = document.getElementById('cl-copy-upi-btn');
        if (copyUpiBtn) {
            copyUpiBtn.onclick = () => copyTextWithFeedback(upiId, copyUpiBtn, '📋 Copy UPI');
        }
        const copyAcBtn = document.getElementById('cl-copy-ac-btn');
        if (copyAcBtn && acNo) {
            copyAcBtn.onclick = () => copyTextWithFeedback(acNo, copyAcBtn, 'Copy');
        }
    };

    const closeClientPaymentModal = () => {
        const m = document.getElementById('client-payment-modal');
        if (m) m.remove();
    };

    /* ========================================================================
       4. MODAL CONTROLLERS (OPEN & CLOSE PROFILE)
       ------------------------------------------------------------------------
    ======================================================================== */
    const openProfileModal = async () => {
        try {
            const uid = getActiveUid();
            if (!uid) {
                alert('Pehle kripya login karein!');
                return;
            }
            window.currentUserId = uid;

            ensureProfileModalAndFields();

            const user = await getCurrentUserRecord();
            if (!user) {
                alert('User profile fetch nahi ho saki. Kripya login check karein!');
                return;
            }

            const nameEl = document.getElementById('prof-name');
            const idEl = document.getElementById('prof-id');
            const mobEl = document.getElementById('prof-mobile');
            const pinEl = document.getElementById('prof-pin');
            const oldPassEl = document.getElementById('prof-old-pass');
            const passEl = document.getElementById('prof-pass');
            const emailEl = document.getElementById('prof-email');

            if (nameEl) nameEl.value = user.name || '';
            if (idEl) {
                idEl.value = user.id || uid;
                idEl.setAttribute('readonly', 'true');
                idEl.style.backgroundColor = '#f3f4f6';
                idEl.style.cursor = 'not-allowed';
            }
            if (mobEl) mobEl.value = user.mobile || '';
            if (pinEl) pinEl.value = user.pin || '1234';
            if (emailEl) emailEl.value = user.email || '';

            if (oldPassEl) oldPassEl.value = '';
            if (passEl) {
                passEl.type = 'password';
                passEl.value = '';
            }

            // Validity Display
            const valEl = document.getElementById('prof-validity-val');
            if (valEl) {
                const isAdmin = (String(user.role || '').toLowerCase() === 'admin' || String(uid).toLowerCase() === 'farhan');
                if (isAdmin || !user.expiryDate) {
                    valEl.textContent = isAdmin ? '👑 Lifetime' : 'Active';
                    valEl.style.color = '#0f766e';
                } else {
                    const today = new Date();
                    const exp = new Date(user.expiryDate);
                    const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                    valEl.textContent = `${formatDateDisp(user.expiryDate)} (${daysLeft > 0 ? `${daysLeft}d left` : 'Expired'})`;
                    valEl.style.color = daysLeft <= 5 ? '#dc2626' : '#0f766e';
                }
            }

            // Storage Display (live from Supabase RPC)
            const stgEl = document.getElementById('prof-storage-val');
            if (stgEl) {
                stgEl.textContent = 'Checking...';
                fetchUserCloudStorageBytes(uid).then((bytes) => {
                    const el = document.getElementById('prof-storage-val');
                    if (el) el.textContent = formatBytes(bytes);
                });
            }

            const saveBtn = document.getElementById('prof-save-btn') || document.querySelector('#profile-modal button[onclick*="saveProfileSettings"]');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Settings Save Karein';
            }

            _setDisplay('profile-modal', 'flex');
        } catch (err) {
            console.error('[ProfileEngine:openProfileModal] Error:', err);
            alert('Profile open karne me takneeki khata aayi.');
        }
    };

    const closeProfileModal = () => {
        const oldPassEl = document.getElementById('prof-old-pass');
        const passEl = document.getElementById('prof-pass');
        if (oldPassEl) oldPassEl.value = '';
        if (passEl) passEl.value = '';
        _setDisplay('profile-modal', 'none');
    };

    /* ========================================================================
       5. SAVE PROFILE SETTINGS (WITH OLD PASSWORD CHECK)
       ------------------------------------------------------------------------
    ======================================================================== */
    const saveProfileSettings = async () => {
        const uid = getActiveUid();
        if (!uid) {
            alert('Aap logged in nahi hain!');
            return;
        }

        const nameEl = document.getElementById('prof-name');
        const mobEl = document.getElementById('prof-mobile');
        const pinEl = document.getElementById('prof-pin');
        const oldPassEl = document.getElementById('prof-old-pass');
        const passEl = document.getElementById('prof-pass');
        const emailEl = document.getElementById('prof-email');
        const saveBtn = document.getElementById('prof-save-btn') || document.querySelector('#profile-modal button[onclick*="saveProfileSettings"]');

        const name = sanitizeText(nameEl?.value);
        const mobile = sanitizeMobile(mobEl?.value);
        const pin = sanitizePin(pinEl?.value);
        const oldPassInput = sanitizeText(oldPassEl?.value);
        const newPassInput = sanitizeText(passEl?.value);
        const email = sanitizeText(emailEl?.value).toLowerCase();

        if (!name || name.length < 2) {
            alert('Kripya valid naam darj karein (kam se kam 2 akshar)!');
            if (nameEl) nameEl.focus();
            return;
        }

        if (mobile.length !== 10) {
            alert('Kripya 10-digit ka valid mobile number darj karein!');
            if (mobEl) mobEl.focus();
            return;
        }

        if (pin.length !== 4) {
            alert('Security PIN strictly 4-digits ka hona chahiye!');
            if (pinEl) pinEl.focus();
            return;
        }

        const cleanNameLower = name.toLowerCase().replace(/\s+/g, '');
        if (String(uid).toLowerCase() !== 'farhan' && cleanNameLower.includes('farhan')) {
            alert('⛔ Farhan naam rakhna strictly block hai!');
            if (nameEl) nameEl.focus();
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving Settings... ⏳';
        }

        try {
            const currentUser = await getCurrentUserRecord();
            if (!currentUser) {
                alert('Current user verify nahi ho saka. Dobara login karein!');
                return;
            }

            let finalPass = String(currentUser.pass || '').trim();
            let wantsPasswordChange = false;

            if (newPassInput.length > 0) {
                if (newPassInput.length < 4) {
                    alert('Naya Password kam se kam 4 characters ka hona chahiye!');
                    if (passEl) passEl.focus();
                    return;
                }
                if (!oldPassInput) {
                    alert('⛔ Password badalne ke liye pehle apna Purana Password daalein!');
                    if (oldPassEl) oldPassEl.focus();
                    return;
                }
                if (oldPassInput !== finalPass) {
                    alert('⛔ Purana Password galat hai! Sahi purana password daalein.');
                    if (oldPassEl) oldPassEl.focus();
                    return;
                }
                finalPass = newPassInput;
                wantsPasswordChange = true;
            }

            const sb = getSupabase();

            if (sb && navigator.onLine) {
                const [nameRes, mobRes, emailRes, pinRes] = await Promise.all([
                    sb.from('karkhana_users').select('user_id').neq('user_id', uid).ilike('full_name', name).limit(1),
                    sb.from('karkhana_users').select('user_id').neq('user_id', uid).eq('mobile', mobile).limit(1),
                    email ? sb.from('karkhana_users').select('user_id').neq('user_id', uid).ilike('email', email).limit(1) : Promise.resolve({ data: [] }),
                    sb.from('karkhana_users').select('user_id').neq('user_id', uid).eq('pin', pin).limit(1)
                ]);

                if (nameRes.error) throw nameRes.error;
                if (mobRes.error) throw mobRes.error;
                if (emailRes.error) throw emailRes.error;
                if (pinRes.error) throw pinRes.error;

                if (nameRes.data && nameRes.data.length > 0) {
                    alert('⚠️ Koi aur name select karein');
                    if (nameEl) nameEl.focus();
                    return;
                }
                if (mobRes.data && mobRes.data.length > 0) {
                    alert('⚠️ Koi aur mobile number select karein');
                    if (mobEl) mobEl.focus();
                    return;
                }
                if (email && emailRes.data && emailRes.data.length > 0) {
                    alert('⚠️ Koi aur gmail select karein');
                    if (emailEl) emailEl.focus();
                    return;
                }
                if (pinRes.data && pinRes.data.length > 0) {
                    alert('⚠️ Koi aur secret PIN select karein');
                    if (pinEl) pinEl.focus();
                    return;
                }
            }

            const updatedProfile = {
                id: uid,
                name: name,
                mobile: mobile,
                email: email || '',
                pin: pin,
                pass: finalPass,
                role: currentUser.role || window.currentUserRole || 'owner',
                status: currentUser.status || 'active',
                expiryDate: currentUser.expiryDate || '',
                updatedAt: new Date().toISOString()
            };

            const activeSessionAuth = {
                id: uid,
                name: name,
                mobile: mobile,
                email: email || '',
                pass: finalPass,
                pin: pin,
                role: updatedProfile.role,
                status: updatedProfile.status,
                expiryDate: updatedProfile.expiryDate
            };

            localStorage.setItem('app_active_session_auth', JSON.stringify(activeSessionAuth));

            try {
                localStorage.setItem(`app_user_${uid}`, JSON.stringify(updatedProfile));
            } catch (_) {}

            if (typeof window.APP_MEMORY_CACHE !== 'undefined') {
                window.APP_MEMORY_CACHE[`app_user_${uid}`] = updatedProfile;
            }

            if (typeof window.idbPut === 'function') {
                window.idbPut(`app_user_${uid}`, updatedProfile);
            }

            if (sb) {
                if (typeof window.showSyncStatus === 'function') window.showSyncStatus('syncing');

                const updateFields = {
                    full_name: name,
                    mobile: mobile,
                    email: email || null,
                    pin: pin
                };
                if (wantsPasswordChange) {
                    updateFields.password = finalPass;
                }

                const { error: updateErr } = await sb
                    .from('karkhana_users')
                    .update(updateFields)
                    .eq('user_id', uid);

                if (updateErr) throw updateErr;

                if (typeof window.showSyncStatus === 'function') window.showSyncStatus('online');
            }

            const welcomeEl = document.getElementById('welcome-text');
            if (welcomeEl) {
                welcomeEl.textContent = (window.currentUserRole === 'admin')
                    ? `👑 Swagat hai Admin, ${name}!`
                    : `Swagat hai, ${name}!`;
            }

            closeProfileModal();
            alert(wantsPasswordChange
                ? '✅ Profile settings aur Naya Password successfully save ho gaye!'
                : '✅ Profile settings successfully save ho gaye!');

        } catch (saveErr) {
            console.error('[ProfileEngine:saveProfileSettings] Save failure:', saveErr);
            alert('Settings update karte waqt takleef aayi: ' + (saveErr.message || 'Kripya connection check karein!'));
            if (typeof window.showSyncStatus === 'function') window.showSyncStatus('error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Settings Save Karein';
            }
        }
    };

    /* ========================================================================
       6. NAVBAR PAY BUTTON INJECTION & EXPORTS
       ------------------------------------------------------------------------
    ======================================================================== */
    const injectNavbarPayAndBindings = () => {
        const profBtn = document.querySelector('.navbar-user-area .profile-btn');
        if (profBtn && profBtn.parentElement && !document.getElementById('nav-pay-renew-btn')) {
            const payBtn = document.createElement('button');
            payBtn.id = 'nav-pay-renew-btn';
            payBtn.type = 'button';
            payBtn.textContent = '💳 Plan & Pay';
            payBtn.style.cssText = 'background:#0f766e; color:#fff; border:none; padding:6px 11px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;';
            payBtn.onclick = () => openClientPaymentModal();
            profBtn.parentElement.insertBefore(payBtn, profBtn);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectNavbarPayAndBindings);
    } else {
        injectNavbarPayAndBindings();
    }

    const profileAPI = {
        openProfileModal,
        closeProfileModal,
        saveProfileSettings,
        openClientPaymentModal,
        closeClientPaymentModal
    };

    window.openProfileModal = openProfileModal;
    window.openProfile = openProfileModal;
    window.showProfileModal = openProfileModal;
    window.closeProfileModal = closeProfileModal;
    window.saveProfileSettings = saveProfileSettings;
    window.openClientPaymentModal = openClientPaymentModal;
    window.closeClientPaymentModal = closeClientPaymentModal;
    window.ProfileEngine = profileAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = profileAPI;
    }
})();
