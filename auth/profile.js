/* ============================================================================
   SIMPLICITY ERP - SECURE USER PROFILE & SETTINGS ENGINE
   File: auth/profile.js • Developed by Farhan Jawed
   Features:
   - Hidden Password (Never reveals current password in Profile UI)
   - Requires Old Password verification to set a New Password
   - Zero-Leak 5-Point Duplicate Checks in Supabase
   - Auto-Builds / Upgrades Profile Modal safely
============================================================================ */

(() => {
    'use strict';

    /* ========================================================================
       1. INPUT SANITIZATION & SECURITY HELPERS
       ------------------------------------------------------------------------
    ======================================================================== */
    const sanitizeText = (val) => String(val || '').trim();
    const sanitizeMobile = (mob) => String(mob || '').trim().replace(/[^0-9]/g, '');
    const sanitizePin = (pin) => String(pin || '').trim().replace(/[^0-9]/g, '').slice(0, 4);

    const getSupabase = () => {
        return window.supabaseClient || (window.CloudEngine && window.CloudEngine.supabase) || null;
    };

    const _setDisplay = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.setProperty('display', val, 'important');
        }
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

    /* ========================================================================
       2. ENSURE PROFILE MODAL & OLD-PASSWORD FIELD EXIST
       ------------------------------------------------------------------------
    ======================================================================== */
    const ensureProfileModalAndFields = () => {
        let modal = document.getElementById('profile-modal');

        // Agar index.html me profile-modal na ho to khud clean modal bana dein
        if (!modal) {
            const modalHtml = `
            <div id="profile-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.75); z-index:999999; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;">
                <div style="background:#ffffff; width:100%; max-width:440px; border-radius:14px; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4); font-family:sans-serif; max-height:94vh; display:flex; flex-direction:column;">
                    <div style="background:#0f172a; color:#ffffff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; font-size:16px; font-weight:800;">👤 User Profile & Security</h3>
                        <button type="button" onclick="closeProfileModal()" style="background:transparent; border:none; color:#fff; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                    </div>
                    <div style="padding:16px 18px; overflow-y:auto; flex:1;">
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
        } else {
            // Agar index.html me profile-modal pehle se hai to usme Purana Password box inject karein aur Naya Password hide karein
            const passEl = document.getElementById('prof-pass');
            if (passEl) {
                passEl.type = 'password';
                passEl.setAttribute('autocomplete', 'new-password');
                passEl.placeholder = 'Naya password (khali chhodein agar nahi badalna)';

                if (!document.getElementById('prof-old-pass')) {
                    const wrap = passEl.closest('div') || passEl.parentElement;
                    if (wrap && wrap.parentElement) {
                        const oldWrap = document.createElement('div');
                        oldWrap.id = 'prof-old-pass-wrap';
                        oldWrap.style.cssText = 'margin-bottom:10px;';
                        oldWrap.innerHTML = `
                            <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:4px;">Purana Password (Sirf password badalne ke liye):</label>
                            <input type="password" id="prof-old-pass" autocomplete="off" placeholder="Purana password daalein" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; box-sizing:border-box;">
                        `;
                        wrap.parentElement.insertBefore(oldWrap, wrap);
                    }
                }
            }
            const pinEl = document.getElementById('prof-pin');
            if (pinEl) {
                pinEl.type = 'password';
            }
        }
        return modal;
    };

    /* ========================================================================
       3. MODAL CONTROLLERS (OPEN & CLOSE)
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

            // Security: Kabhi bhi current password UI me na dikhayein!
            if (oldPassEl) oldPassEl.value = '';
            if (passEl) {
                passEl.type = 'password';
                passEl.value = '';
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
       4. CONCURRENT-SAFE PROFILE SETTINGS UPDATE ENGINE
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

        // 1. Strict Validations
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

        // 🛑 FARHAN STRICT BLOCK
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

            // 2. Password change verification (Purana password check)
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

            // 3. Zero-Leak 4-Point Duplicate Check in Supabase
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

            // 4. Consolidated Profile Object (status aur expiryDate safe rakhein)
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

            // 5. Realtime Cloud Sync with Supabase
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

            // 6. Update Active Header / Welcome Text
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
       5. FALLBACK PROFILE BUTTON AUTO-BINDING & EXPORTS
       ------------------------------------------------------------------------
    ======================================================================== */
    const bindProfileButtonFallback = () => {
        const candidates = document.querySelectorAll('#nav-profile-btn, #profile-btn, button, a');
        candidates.forEach((el) => {
            if (el.dataset.profBound) return;
            const id = (el.id || '').toLowerCase();
            const txt = (el.textContent || '').trim().toLowerCase();
            const hasOnclick = Boolean(el.getAttribute('onclick'));
            if (!hasOnclick && (id === 'nav-profile-btn' || id === 'profile-btn' || txt === 'profile' || txt === '👤 profile')) {
                el.dataset.profBound = 'true';
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    openProfileModal();
                });
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindProfileButtonFallback);
    } else {
        bindProfileButtonFallback();
    }

    const profileAPI = {
        openProfileModal,
        closeProfileModal,
        saveProfileSettings
    };

    window.openProfileModal = openProfileModal;
    window.openProfile = openProfileModal;
    window.showProfileModal = openProfileModal;
    window.closeProfileModal = closeProfileModal;
    window.saveProfileSettings = saveProfileSettings;
    window.ProfileEngine = profileAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = profileAPI;
    }
})();
