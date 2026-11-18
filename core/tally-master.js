/* ============================================================================
   SIMPLICITY ERP - TALLYPRIME DASHBOARD, GATEWAY, STOCK SUMMARY & CREATE/ALTER
   File: core/tally-master.js • Developed by Farhan Jawed
   Note: Uses existing kariger_list & jobwork_workers stores (100% Supabase-safe)
============================================================================ */

(() => {
    'use strict';

    /* ========================================================================
       1. LOGIN PASSWORD TOGGLE & PROMO SLIDESHOW
    ======================================================================== */
    window.slToggleLoginPass = function () {
        const p = document.getElementById('login-pass');
        if (p) p.type = p.type === 'password' ? 'text' : 'password';
    };

    const slSlides = [
        {
            icon: '🧵',
            title: 'Kariger Mobile Portal',
            desc: 'Ab har kariger apne mobile par 4-digit PIN se apna Loom Progress, Bana, Zari aur Baki Mazdoori 24×7 live dekh sakta hai.',
            link: 'landing.html#kariger_portal',
            cta: 'Get more'
        },
        {
            icon: '📜',
            title: 'Auto Tani & Rangai Order',
            desc: 'Parchi banate hi automatic Sancha aur phir Rangai wale ke mobile par chali jaati hai. Ready hone par hi Loom sheet khulti hai.',
            link: 'landing.html#tani_order',
            cta: 'Explore'
        },
        {
            icon: '⚡',
            title: 'Zero-Mouse Express Counter',
            desc: 'Baithak aur mandi ke rush mein sirf Enter dabakar Saree, Bana, Zari, Rokad entry aur A6 thermal parchi 1 second mein print karein.',
            link: 'landing.html#express',
            cta: 'Dekhein'
        },
        {
            icon: '🔄',
            title: '1-Click Year Closing & Sync',
            desc: 'Offline PWA speed ke saath 1 click mein pichla balance naye saal mein shift karein aur multi-device live cloud sync payein.',
            link: 'landing.html#closing_backup',
            cta: 'Learn more'
        }
    ];

    let slCurrentSlide = 0;
    window.slSetSlide = function (idx) {
        slCurrentSlide = idx;
        const card = document.getElementById('slPromoCard');
        const item = slSlides[idx];
        if (!card || !item) return;

        card.classList.add('sl-fade');
        setTimeout(() => {
            const iconEl = document.getElementById('slPromoIcon');
            const titleEl = document.getElementById('slPromoTitle');
            const descEl = document.getElementById('slPromoDesc');
            const btnEl = document.getElementById('slPromoBtn');
            if (iconEl) iconEl.textContent = item.icon;
            if (titleEl) titleEl.textContent = item.title;
            if (descEl) descEl.textContent = item.desc;
            if (btnEl) {
                btnEl.href = item.link;
                btnEl.textContent = item.cta;
            }
            card.classList.remove('sl-fade');
        }, 160);

        document.querySelectorAll('#login-wrapper .sl-dot').forEach((d, i) => {
            d.classList.toggle('active', i === idx);
        });
    };

    setInterval(() => {
        const wrap = document.getElementById('login-wrapper');
        if (wrap && wrap.style.display !== 'none') {
            window.slSetSlide((slCurrentSlide + 1) % slSlides.length);
        }
    }, 4500);

    /* ========================================================================
       2. GATEWAY SELECTION & DASHBOARD LIVE 4-CARD SYNC
    ======================================================================== */
    window.slGwClick = function (btn, fn) {
        document.querySelectorAll('#dashboard-view .gw-item').forEach((el) => el.classList.remove('active'));
        if (btn) btn.classList.add('active');
        if (typeof fn === 'function') fn();
    };

    const slParseNum = (str, regex) => {
        if (!str) return 0;
        const m = String(str).match(regex || /[-+]?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) || 0 : 0;
    };

    const slSyncStockSummaryValues = (banaVal, zariVal, taniVal, chukkaVal, sareeVal) => {
        const gwValEl = document.getElementById('btn-total-stock-summary');
        if (gwValEl) {
            const fmtShort = (n) => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
            gwValEl.textContent = `${fmtShort(banaVal + zariVal)} Kg · ${Math.round(sareeVal)} Pc`;
        }

        const ssBana = document.getElementById('ss-val-bana');
        const ssZari = document.getElementById('ss-val-zari');
        const ssSancha = document.getElementById('ss-val-sancha');
        const ssSaree = document.getElementById('ss-val-saree');

        if (ssBana) ssBana.textContent = `Bacha: ${banaVal.toFixed(2)} Kg`;
        if (ssZari) ssZari.textContent = `Bacha: ${zariVal.toFixed(2)} Kg`;
        if (ssSancha) ssSancha.textContent = `Tani: ${taniVal.toFixed(1)} Kg · Chukka: ${chukkaVal.toFixed(1)} Kg`;
        if (ssSaree) ssSaree.textContent = `Stock: ${Math.round(sareeVal)} Pcs`;
    };

    window.slSyncDashboardCharts = function () {
        const todayEl = document.getElementById('sl-today-date');
        if (todayEl) {
            try {
                todayEl.textContent = new Date().toLocaleDateString('en-IN', {
                    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                });
            } catch (_) {}
        }

        const sesSel = document.getElementById('app-session-select');
        const perEl = document.getElementById('sl-period-label');
        if (sesSel && perEl && sesSel.value) {
            perEl.textContent = 'Session ' + sesSel.value;
        }

        // Card 1: Live Stock 5-Bars
        const banaTxt = document.getElementById('btn-total-bana')?.textContent || '';
        const zariTxt = document.getElementById('btn-total-zari')?.textContent || '';
        const sanchaTxt = document.getElementById('btn-total-sancha')?.textContent || '';
        const sareeTxt = document.getElementById('btn-total-saree')?.textContent || '';

        const banaVal = slParseNum(banaTxt);
        const zariVal = slParseNum(zariTxt);

        let taniVal = 0;
        let chukkaVal = 0;
        const taniM = sanchaTxt.match(/Tani:\s*([-+]?\d+(?:\.\d+)?)/i);
        const chukkaM = sanchaTxt.match(/Chukka:\s*([-+]?\d+(?:\.\d+)?)/i);
        if (taniM || chukkaM) {
            taniVal = taniM ? parseFloat(taniM[1]) || 0 : 0;
            chukkaVal = chukkaM ? parseFloat(chukkaM[1]) || 0 : 0;
        } else {
            taniVal = slParseNum(sanchaTxt);
        }
        const sareeVal = slParseNum(sareeTxt);

        slSyncStockSummaryValues(banaVal, zariVal, taniVal, chukkaVal, sareeVal);

        const fmtKg = (n) => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
        const setBar = (idVal, idH, label, pct) => {
            const vEl = document.getElementById(idVal);
            const hEl = document.getElementById(idH);
            if (vEl) vEl.textContent = label;
            if (hEl) hEl.style.height = Math.max(14, Math.min(92, pct)) + '%';
        };

        const maxKg = Math.max(banaVal, zariVal, taniVal, chukkaVal, 1);
        setBar('sl-bar-val-bana', 'sl-bar-h-bana', fmtKg(banaVal), (banaVal / maxKg) * 88);
        setBar('sl-bar-val-zari', 'sl-bar-h-zari', fmtKg(zariVal), (zariVal / maxKg) * 88);
        setBar('sl-bar-val-tani', 'sl-bar-h-tani', fmtKg(taniVal), (taniVal / maxKg) * 88);
        setBar('sl-bar-val-chukka', 'sl-bar-h-chukka', fmtKg(chukkaVal), (chukkaVal / maxKg) * 88);
        setBar(
            'sl-bar-val-saree',
            'sl-bar-h-saree',
            Math.round(sareeVal) + ' Pc',
            sareeVal > 0 ? Math.max(22, Math.min(82, (sareeVal / Math.max(sareeVal, 100)) * 88)) : 14
        );

        // Card 2: Tani Order Ring
        let readyC = 0, rangaiC = 0, sanchaC = 0, totalC = 0;
        try {
            if (typeof window.getStore === 'function') {
                const list = window.getStore('tani_orders_list');
                if (Array.isArray(list)) {
                    list.forEach((o) => {
                        if (!o) return;
                        const st = String(o.status || '').toLowerCase();
                        if (st === 'ready') readyC++;
                        else if (st === 'rangai') rangaiC++;
                        else sanchaC++;
                    });
                    totalC = list.length;
                }
            }
        } catch (_) {}

        if (totalC === 0) {
            const taniOrdTxt = document.getElementById('btn-total-tani-orders')?.textContent || '';
            const rM = taniOrdTxt.match(/(\d+)\s*Ready/i);
            const rgM = taniOrdTxt.match(/(\d+)\s*Rangai/i);
            const sM = taniOrdTxt.match(/(\d+)\s*Sancha/i);
            if (rM) readyC = parseInt(rM[1], 10) || 0;
            if (rgM) rangaiC = parseInt(rgM[1], 10) || 0;
            if (sM) sanchaC = parseInt(sM[1], 10) || 0;
            totalC = readyC + rangaiC + sanchaC;
        }

        const circ = 238.76;
        const readyDash = totalC > 0 ? (readyC / totalC) * circ : 0;
        const rangaiDash = totalC > 0 ? (rangaiC / totalC) * circ : 0;
        const pct = totalC > 0 ? Math.round((readyC / totalC) * 100) : 0;

        const ringReady = document.getElementById('sl-ring-ready');
        const ringRangai = document.getElementById('sl-ring-rangai');
        if (ringReady) ringReady.setAttribute('stroke-dasharray', `${readyDash.toFixed(1)} ${circ}`);
        if (ringRangai) {
            ringRangai.setAttribute('stroke-dasharray', `${rangaiDash.toFixed(1)} ${circ}`);
            ringRangai.setAttribute('stroke-dashoffset', `-${readyDash.toFixed(1)}`);
        }

        const elPct = document.getElementById('sl-ring-pct');
        const elTot = document.getElementById('sl-tani-total-lbl');
        const elLR = document.getElementById('sl-leg-ready');
        const elLRg = document.getElementById('sl-leg-rangai');
        const elLS = document.getElementById('sl-leg-sancha');
        if (elPct) elPct.textContent = pct + '%';
        if (elTot) elTot.textContent = totalC + ' Parchi';
        if (elLR) elLR.textContent = String(readyC);
        if (elLRg) elLRg.textContent = String(rangaiC);
        if (elLS) elLS.textContent = String(sanchaC);

        // Card 3: Kariger Master
        const karTxt = document.getElementById('btn-total-kariger')?.textContent || '';
        const karCount = Math.max(0, Math.round(slParseNum(karTxt)));
        const karCountEl = document.getElementById('sl-kariger-count');
        if (karCountEl) karCountEl.textContent = String(karCount);

        const kSel = document.getElementById('app-karkhana-select');
        const karUnitEl = document.getElementById('sl-kariger-unit');
        if (kSel && karUnitEl && kSel.selectedIndex >= 0) {
            karUnitEl.textContent = kSel.options[kSel.selectedIndex].textContent.replace(/^[\s🌐🏢🏭]+/, '').trim() || 'Sabhi Karkhane';
        }

        // Card 4: Payments (Kul Dena, Diya, Baki)
        const payTxt = document.getElementById('btn-total-payment')?.textContent || '';
        const diyaM = payTxt.match(/Diya:\s*₹?\s*([-+]?\d+(?:,\d+)*(?:\.\d+)?)/i);
        const bakiM = payTxt.match(/Baki:\s*₹?\s*([-+]?\d+(?:,\d+)*(?:\.\d+)?)/i);
        const diyaVal = diyaM ? (parseFloat(diyaM[1].replace(/,/g, '')) || 0) : 0;
        const bakiVal = bakiM ? (parseFloat(bakiM[1].replace(/,/g, '')) || 0) : 0;
        const kulDena = diyaVal + Math.max(0, bakiVal);
        const payPct = kulDena > 0 ? Math.max(0, Math.min(100, Math.round((diyaVal / kulDena) * 100))) : 0;

        const fmtInr = (n) => '₹ ' + Math.round(n).toLocaleString('en-IN');
        const elPayHero = document.getElementById('sl-pay-baki-hero');
        const elPayTot = document.getElementById('sl-pay-total');
        const elPayPaid = document.getElementById('sl-pay-paid');
        const elPayBaki = document.getElementById('sl-pay-baki');
        const elPayPill = document.getElementById('sl-pay-pct-pill');
        const elPayFill = document.getElementById('sl-pay-bar-fill');
        if (elPayHero) elPayHero.textContent = fmtInr(bakiVal);
        if (elPayTot) elPayTot.textContent = fmtInr(kulDena);
        if (elPayPaid) elPayPaid.textContent = fmtInr(diyaVal);
        if (elPayBaki) elPayBaki.textContent = fmtInr(bakiVal);
        if (elPayPill) elPayPill.textContent = payPct + '% Paid';
        if (elPayFill) elPayFill.style.width = payPct + '%';
    };

    const slInitBadgeObserver = () => {
        const watchIds = [
            'btn-total-bana', 'btn-total-zari', 'btn-total-sancha', 'btn-total-saree',
            'btn-total-tani-orders', 'btn-total-kariger', 'btn-total-payment'
        ];
        const obs = new MutationObserver(() => window.slSyncDashboardCharts());
        watchIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
        });
        window.slSyncDashboardCharts();
    };

    /* ========================================================================
       3. TALLY STOCK SUMMARY HUB (BANA / ZARI / SANCHA / SAREE DRILL-DOWN)
    ======================================================================== */
    let ssActiveIdx = 0;

    const ensureStockSummaryStyles = () => {
        if (document.getElementById('ss-tally-styles')) return;
        const style = document.createElement('style');
        style.id = 'ss-tally-styles';
        style.textContent = `
            .ss-wrap { padding: 16px 20px; }
            .ss-table { width: 100%; border-collapse: collapse; border: 1px solid #e5d5a7; border-radius: 6px; overflow: hidden; background: #ffffff; }
            .ss-table th {
                background: #fdf6e2; color: #1f2937; font-size: 12px; font-weight: 800;
                padding: 10px 14px; text-align: left; border-bottom: 1.5px solid #e5d5a7;
            }
            .ss-row {
                cursor: pointer; border-bottom: 1px solid #f3f4f6;
                transition: background 0.1s ease;
            }
            .ss-row:hover { background: #fef9ea; }
            .ss-row.active { background: #f2b71d !important; color: #1f2937; }
            .ss-row td { padding: 12px 14px; font-size: 13.5px; color: #1f2937; }
            .ss-row.active td { font-weight: 700; }
            .ss-key-badge {
                display: inline-block; min-width: 22px; text-align: center;
                padding: 2px 7px; border-radius: 4px; font-size: 11.5px; font-weight: 800;
                background: #fdf6e2; border: 1px solid #d9b86c; color: #92400e;
            }
            .ss-row.active .ss-key-badge { background: #ffffff; color: #1f2937; border-color: #b47d00; }
            .ss-val-cell { font-weight: 800; color: #b47d00; text-align: right; font-variant-numeric: tabular-nums; }
            .ss-row.active .ss-val-cell { color: #1f2937; }
        `;
        document.head.appendChild(style);
    };

    const ensureStockSummaryDOM = () => {
        ensureStockSummaryStyles();
        const sec = document.getElementById('stock-summary-section');
        if (!sec || sec.dataset.ssInitialized === '1') return;

        sec.innerHTML = `
            <div class="tm-topbar">
                <div class="tm-topbar-left">
                    <h2>Stock Summary (Tally Style)</h2>
                    <span class="tm-grp-pill" id="ss-godown-badge">Sabhi Karkhane</span>
                </div>
                <button type="button" class="tm-esc-btn" onclick="backToDashboard()">← [Esc] Dashboard</button>
            </div>

            <div class="ss-wrap">
                <table class="ss-table">
                    <thead>
                        <tr>
                            <th style="width:55px;">#</th>
                            <th>Stock Group (Particulars)</th>
                            <th style="width:100px; text-align:center;">Key</th>
                            <th style="text-align:right;">Available Stock (Closing)</th>
                            <th style="width:110px; text-align:right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="ss-row active" data-ss-idx="0" onclick="ssOpenStockGroup(0)">
                            <td>1</td>
                            <td><strong>Bana Stock</strong> <small style="color:#6b7280; display:block; font-size:11.5px;">Raw Bana Yarn &amp; Kariger Issue Register</small></td>
                            <td style="text-align:center;"><span class="ss-key-badge">B</span></td>
                            <td class="ss-val-cell" id="ss-val-bana">Bacha: 0.00 Kg</td>
                            <td style="text-align:right; font-weight:700; font-size:12px;">Open →</td>
                        </tr>
                        <tr class="ss-row" data-ss-idx="1" onclick="ssOpenStockGroup(1)">
                            <td>2</td>
                            <td><strong>Zari Stock</strong> <small style="color:#6b7280; display:block; font-size:11.5px;">Zari &amp; Metallic Thread Register</small></td>
                            <td style="text-align:center;"><span class="ss-key-badge">Z</span></td>
                            <td class="ss-val-cell" id="ss-val-zari">Bacha: 0.00 Kg</td>
                            <td style="text-align:right; font-weight:700; font-size:12px;">Open →</td>
                        </tr>
                        <tr class="ss-row" data-ss-idx="2" onclick="ssOpenStockGroup(2)">
                            <td>3</td>
                            <td><strong>Sancha (Tani &amp; Chukka)</strong> <small style="color:#6b7280; display:block; font-size:11.5px;">Tani &amp; Chukka Warp Stock Register</small></td>
                            <td style="text-align:center;"><span class="ss-key-badge">N</span></td>
                            <td class="ss-val-cell" id="ss-val-sancha">Tani: 0.0 Kg · Chukka: 0.0 Kg</td>
                            <td style="text-align:right; font-weight:700; font-size:12px;">Open →</td>
                        </tr>
                        <tr class="ss-row" data-ss-idx="3" onclick="ssOpenStockGroup(3)">
                            <td>4</td>
                            <td><strong>Saree Stock</strong> <small style="color:#6b7280; display:block; font-size:11.5px;">Fresh, Cutting, Embroidery, Finished &amp; Lott</small></td>
                            <td style="text-align:center;"><span class="ss-key-badge">E</span></td>
                            <td class="ss-val-cell" id="ss-val-saree">Stock: 0 Pcs</td>
                            <td style="text-align:right; font-weight:700; font-size:12px;">Open →</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="tm-status-strip">
                <span class="tm-toast">[↑ ↓] Group Chunein · [Enter] ya [B / Z / N / E] se Stock Kholein · [Esc] Dashboard</span>
                <span>4 Stock Groups</span>
            </div>
        `;
        sec.dataset.ssInitialized = '1';
    };

    const ssHighlightRow = (idx) => {
        const rows = Array.from(document.querySelectorAll('#stock-summary-section .ss-row'));
        if (!rows.length) return;
        ssActiveIdx = ((idx % rows.length) + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle('active', i === ssActiveIdx));
    };

    window.ssOpenStockGroup = function (idx) {
        ssHighlightRow(idx);
        window.__slReturnToStockSummary = true;
        const sec = document.getElementById('stock-summary-section');
        if (sec) sec.style.display = 'none';

        if (idx === 0 && typeof window.openBanaModule === 'function') window.openBanaModule();
        else if (idx === 1 && typeof window.openZariModule === 'function') window.openZariModule();
        else if (idx === 2 && typeof window.openSanchaModule === 'function') window.openSanchaModule();
        else if (idx === 3 && typeof window.openSareeModule === 'function') window.openSareeModule();
    };

    window.openStockSummaryModule = function () {
        ensureStockSummaryDOM();
        document.querySelectorAll('.module-section').forEach((s) => s.style.display = 'none');
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';
        const sec = document.getElementById('stock-summary-section');
        if (sec) sec.style.display = 'block';

        const kSel = document.getElementById('app-karkhana-select');
        const badgeEl = document.getElementById('ss-godown-badge');
        if (kSel && badgeEl && kSel.selectedIndex >= 0) {
            badgeEl.textContent = kSel.options[kSel.selectedIndex].textContent.replace(/^[\s🌐🏢🏭]+/, '').trim() || 'Sabhi Karkhane';
        }

        ssHighlightRow(ssActiveIdx);
        window.slSyncDashboardCharts();
    };

    /* ========================================================================
       4. TALLY MASTER CREATE & ALTER MODULE (SELF-INJECTED HTML + ENGINE)
    ======================================================================== */
    let tmMode = 'create'; // 'create' | 'alter-list' | 'alter-edit'
    let tmSelectedGroup = 'kariger';
    let tmAlterFilter = 'all';
    let tmAlterActiveIdx = 0;

    const tmGetToday = () => (typeof window.getTodayDate === 'function')
        ? window.getTodayDate()
        : new Date().toISOString().split('T')[0];

    const tmGetKarigers = () => {
        if (typeof window.sanitizeKarigerList === 'function') return window.sanitizeKarigerList();
        const raw = (typeof window.getStore === 'function') ? window.getStore('kariger_list') : [];
        return Array.isArray(raw) ? raw.filter((k) => k && k.name) : [];
    };

    const tmGetJobWorkers = () => {
        if (typeof window.getJobWorkers === 'function') return window.getJobWorkers();
        const raw = (typeof window.getStore === 'function') ? window.getStore('jobwork_workers') : [];
        return Array.isArray(raw) ? raw.filter((w) => w && w.name) : [];
    };

    const ensureTallyMasterDOM = () => {
        const sec = document.getElementById('tally-master-section');
        if (!sec || sec.dataset.tmInitialized === '1') return;

        sec.innerHTML = `
            <div class="tm-topbar">
                <div class="tm-topbar-left">
                    <h2 id="tm-screen-title">Profile Creation (Tally Style)</h2>
                    <div class="tm-mode-tabs">
                        <button type="button" class="tm-tab-btn active" id="tm-tab-create" onclick="openTallyCreateModule()">+ Create</button>
                        <button type="button" class="tm-tab-btn" id="tm-tab-alter" onclick="openTallyAlterModule()">✏️ Alter (Search &amp; Edit)</button>
                    </div>
                </div>
                <button type="button" class="tm-esc-btn" onclick="tmHandleEscKey()">← [Esc] Back</button>
            </div>

            <div id="tm-alter-view" class="tm-alter-wrap" style="display:none;">
                <div class="tm-alter-controls">
                    <input type="text" id="tm-alter-search" class="tm-alter-search" placeholder="🔍 Naam, Mobile ya Mohalla type karke search karein..." autocomplete="off">
                    <div class="tm-alter-pills">
                        <button type="button" class="tm-tab-btn active" data-tm-filter="all" onclick="tmSetAlterFilter('all')">Sabhi</button>
                        <button type="button" class="tm-tab-btn" data-tm-filter="kariger" onclick="tmSetAlterFilter('kariger')">Kariger</button>
                        <button type="button" class="tm-tab-btn" data-tm-filter="cutting" onclick="tmSetAlterFilter('cutting')">Cutting</button>
                        <button type="button" class="tm-tab-btn" data-tm-filter="embroidery" onclick="tmSetAlterFilter('embroidery')">Embroidery</button>
                        <button type="button" class="tm-tab-btn" data-tm-filter="calender" onclick="tmSetAlterFilter('calender')">Calender</button>
                    </div>
                </div>
                <div class="tm-alter-list" id="tm-alter-list"></div>
            </div>

            <div id="tm-form-view">
                <div class="tm-form-grid">
                    <div class="tm-left-pane">
                        <input type="hidden" id="tm-edit-id">
                        <input type="hidden" id="tm-edit-source">

                        <div class="tm-row">
                            <label for="tm-name">Name :</label>
                            <input type="text" id="tm-name" placeholder="Jaise: FARHAN" autocomplete="off">
                        </div>

                        <div class="tm-row">
                            <label for="tm-group">Under (Group) :</label>
                            <input type="text" id="tm-group" placeholder="Type karein ya right list chunein..." autocomplete="off">
                        </div>

                        <div id="tm-kariger-fields" class="tm-divider">
                            <div class="tm-sec-lbl">Kariger Master Details (Auto-Save: Kariger List)</div>
                            <div class="tm-row">
                                <label for="tm-karkhana">Karkhana :</label>
                                <select id="tm-karkhana"></select>
                            </div>
                            <div class="tm-row">
                                <label for="tm-saree">Saree Design :</label>
                                <input type="text" id="tm-saree" placeholder="Jaise: Banarasi Katan">
                            </div>
                        </div>

                        <div id="tm-jobwork-fields" class="tm-divider" style="display:none;">
                            <div class="tm-sec-lbl" id="tm-jw-sec-lbl">JobWork Details (Auto-Save: JobWork)</div>
                            <div style="font-size:12px; color:#6b7280; background:#fffbeb; border:1px solid #fde68a; padding:8px 10px; border-radius:6px;">
                                Save karte hi ye worker seedha <strong id="tm-jw-target-txt">JobWork → Cutting</strong> list me aur Supabase me sync ho jayega.
                            </div>
                        </div>

                        <div class="tm-divider">
                            <div class="tm-sec-lbl">Contact &amp; Mailing Details</div>
                            <div class="tm-row">
                                <label for="tm-mobile">Mobile No. :</label>
                                <input type="tel" id="tm-mobile" maxlength="12" placeholder="10-digit Mobile">
                            </div>
                            <div class="tm-row">
                                <label for="tm-address">Address / Mohalla :</label>
                                <input type="text" id="tm-address" placeholder="Mohalla / City">
                            </div>
                            <div class="tm-row">
                                <label for="tm-date">Join Date :</label>
                                <input type="date" id="tm-date">
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; gap:10px;">
                            <button type="button" class="tm-esc-btn" id="tm-back-to-alter-btn" style="display:none;" onclick="openTallyAlterModule()">← Alter List</button>
                            <div style="margin-left:auto; display:flex; gap:8px;">
                                <button type="button" class="tm-btn-yes" onclick="tmAskAccept()">Save [Enter]</button>
                            </div>
                        </div>
                    </div>

                    <div class="tm-right-pane">
                        <div class="tm-group-box" id="tm-group-list-box">
                            <div class="tm-group-head">List of Groups</div>
                            <div id="tm-group-list">
                                <div class="tm-group-opt selected" data-grp="kariger" data-label="Kariger" onclick="tmPickGroup('kariger', true)"><span>Kariger (Weaver)</span><small>Kariger Master</small></div>
                                <div class="tm-group-opt" data-grp="cutting" data-label="Cutting" onclick="tmPickGroup('cutting', true)"><span>Cutting</span><small>JobWork</small></div>
                                <div class="tm-group-opt" data-grp="embroidery" data-label="Embroidery" onclick="tmPickGroup('embroidery', true)"><span>Embroidery</span><small>JobWork</small></div>
                                <div class="tm-group-opt" data-grp="calender" data-label="Calender" onclick="tmPickGroup('calender', true)"><span>Calender</span><small>JobWork</small></div>
                            </div>
                        </div>

                        <div class="tm-group-box" id="tm-alter-info-box" style="display:none;">
                            <div class="tm-group-head">Alteration Safety Info</div>
                            <div style="padding:12px; font-size:12.5px; color:#4b5563; line-height:1.6;">
                                <div><strong>Group:</strong> <span id="tm-alter-grp-label">-</span></div>
                                <div><strong>ID:</strong> <span id="tm-alter-id-label" style="font-size:11px; color:#9ca3af;">-</span></div>
                                <div style="margin-top:6px; font-size:11.5px; color:#92400e;">Purani Tani / JobWork sheets aur Supabase sync surakshit rakhne ke liye Group lock hai.</div>
                            </div>
                        </div>

                        <div class="tm-accept-box" id="tm-accept-box">
                            <strong id="tm-accept-title">Accept?</strong>
                            <div style="display:flex; gap:8px; justify-content:center;">
                                <button type="button" class="tm-btn-yes" id="tm-btn-yes" onclick="tmSaveProfile()">Yes (Y)</button>
                                <button type="button" class="tm-btn-no" onclick="tmCancelAccept()">No (N)</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tm-status-strip">
                <span class="tm-toast" id="tm-toast-msg">Tally Master Ready — Enter se aage badhein, Esc se wapas jayein.</span>
                <span id="tm-live-counts">Kariger: 0 · Cutting: 0 · Embroidery: 0 · Calender: 0</span>
            </div>
        `;
        sec.dataset.tmInitialized = '1';

        const grpInput = document.getElementById('tm-group');
        if (grpInput) {
            grpInput.addEventListener('input', function () {
                if (tmMode !== 'create') return;
                const q = this.value.trim().toLowerCase();
                const opts = Array.from(document.querySelectorAll('#tm-group-list .tm-group-opt'));
                let firstMatch = null;
                opts.forEach((el) => {
                    const match = !q || el.dataset.grp.includes(q) || el.dataset.label.toLowerCase().includes(q);
                    el.style.display = match ? 'flex' : 'none';
                    if (match && !firstMatch) firstMatch = el;
                });
                if (firstMatch) {
                    opts.forEach((o) => o.classList.remove('selected'));
                    firstMatch.classList.add('selected');
                    tmSelectedGroup = firstMatch.dataset.grp;
                }
            });
        }

        const alterSearch = document.getElementById('tm-alter-search');
        if (alterSearch) {
            alterSearch.addEventListener('input', () => {
                tmAlterActiveIdx = 0;
                tmRenderAlterList();
            });
        }
    };

    const tmPopulateKarkhanaDropdown = (selectedId) => {
        const sel = document.getElementById('tm-karkhana');
        if (!sel) return;
        sel.innerHTML = '';
        let list = (typeof window.getKarkhanasSafe === 'function')
            ? window.getKarkhanasSafe()
            : ((typeof window.getStore === 'function') ? window.getStore('karkhana_list') : []);
        if (!Array.isArray(list) || !list.length) {
            list = [{ id: 'k_main', name: 'Main Godown', isDefault: true }];
        }
        list.forEach((k) => {
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = (k.id === 'k_main' || k.isDefault ? '🏢 ' : '🏭 ') + k.name;
            if (selectedId && String(k.id) === String(selectedId)) opt.selected = true;
            sel.appendChild(opt);
        });
        if (!selectedId && sel.options.length > 0) {
            const navKid = document.getElementById('app-karkhana-select')?.value;
            if (navKid && navKid !== 'all') sel.value = navKid;
        }
    };

    const tmUpdateCountsBar = () => {
        const kars = tmGetKarigers();
        const jws = tmGetJobWorkers();
        const cutC = jws.filter((w) => String(w.type || '').toLowerCase() === 'cutting').length;
        const embC = jws.filter((w) => String(w.type || '').toLowerCase() === 'embroidery').length;
        const calC = jws.filter((w) => String(w.type || '').toLowerCase() === 'calender').length;
        const el = document.getElementById('tm-live-counts');
        if (el) el.textContent = `Kariger: ${kars.length} · Cutting: ${cutC} · Embroidery: ${embC} · Calender: ${calC}`;
    };

    const tmSetToast = (msg) => {
        const el = document.getElementById('tm-toast-msg');
        if (el) el.textContent = msg;
    };

    window.tmPickGroup = function (grp, moveFocus) {
        tmSelectedGroup = grp || 'kariger';
        const labelMap = { kariger: 'Kariger', cutting: 'Cutting', embroidery: 'Embroidery', calender: 'Calender' };
        const grpInput = document.getElementById('tm-group');
        if (grpInput) grpInput.value = labelMap[tmSelectedGroup] || 'Kariger';

        document.querySelectorAll('#tm-group-list .tm-group-opt').forEach((el) => {
            el.classList.toggle('selected', el.dataset.grp === tmSelectedGroup);
            el.style.display = 'flex';
        });

        const isKar = (tmSelectedGroup === 'kariger');
        const karBox = document.getElementById('tm-kariger-fields');
        const jwBox = document.getElementById('tm-jobwork-fields');
        if (karBox) karBox.style.display = isKar ? 'block' : 'none';
        if (jwBox) jwBox.style.display = isKar ? 'none' : 'block';
        if (!isKar) {
            const lbl = labelMap[tmSelectedGroup] || 'Cutting';
            const sLbl = document.getElementById('tm-jw-sec-lbl');
            const tTxt = document.getElementById('tm-jw-target-txt');
            if (sLbl) sLbl.textContent = `JobWork Details (Auto-Save: ${lbl})`;
            if (tTxt) tTxt.textContent = `JobWork → ${lbl}`;
        }

        if (moveFocus) {
            document.getElementById(isKar ? 'tm-karkhana' : 'tm-mobile')?.focus();
        }
    };

    window.openTallyCreateModule = function () {
        ensureTallyMasterDOM();
        document.querySelectorAll('.module-section').forEach((s) => s.style.display = 'none');
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';
        const sec = document.getElementById('tally-master-section');
        if (sec) sec.style.display = 'block';

        tmMode = 'create';
        document.getElementById('tm-screen-title').textContent = 'Profile Creation (Tally Style)';
        document.getElementById('tm-tab-create').classList.add('active');
        document.getElementById('tm-tab-alter').classList.remove('active');
        document.getElementById('tm-alter-view').style.display = 'none';
        document.getElementById('tm-form-view').style.display = 'block';
        document.getElementById('tm-back-to-alter-btn').style.display = 'none';
        document.getElementById('tm-group-list-box').style.display = 'block';
        document.getElementById('tm-alter-info-box').style.display = 'none';
        document.getElementById('tm-accept-box').style.display = 'none';

        const grpInp = document.getElementById('tm-group');
        if (grpInp) grpInp.readOnly = false;

        document.getElementById('tm-edit-id').value = '';
        document.getElementById('tm-edit-source').value = '';
        document.getElementById('tm-name').value = '';
        document.getElementById('tm-saree').value = '';
        document.getElementById('tm-mobile').value = '';
        document.getElementById('tm-address').value = '';
        document.getElementById('tm-date').value = tmGetToday();

        tmPopulateKarkhanaDropdown();
        window.tmPickGroup('kariger', false);
        tmUpdateCountsBar();
        tmSetToast('Nayi Profile Banayein — Enter se aage badhein, Esc se Dashboard.');
        setTimeout(() => document.getElementById('tm-name')?.focus(), 40);
    };

    window.openTallyAlterModule = function () {
        ensureTallyMasterDOM();
        document.querySelectorAll('.module-section').forEach((s) => s.style.display = 'none');
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';
        const sec = document.getElementById('tally-master-section');
        if (sec) sec.style.display = 'block';

        tmMode = 'alter-list';
        document.getElementById('tm-screen-title').textContent = 'Master Alteration (Search & Edit Profile)';
        document.getElementById('tm-tab-create').classList.remove('active');
        document.getElementById('tm-tab-alter').classList.add('active');
        document.getElementById('tm-alter-view').style.display = 'block';
        document.getElementById('tm-form-view').style.display = 'none';
        document.getElementById('tm-accept-box').style.display = 'none';

        tmAlterActiveIdx = 0;
        const sInp = document.getElementById('tm-alter-search');
        if (sInp) sInp.value = '';
        tmRenderAlterList();
        tmUpdateCountsBar();
        tmSetToast('Naam search karein · ↑ ↓ Arrow se chunein · Enter se Edit karein.');
        setTimeout(() => sInp?.focus(), 40);
    };

    window.tmSetAlterFilter = function (filterVal) {
        tmAlterFilter = filterVal || 'all';
        tmAlterActiveIdx = 0;
        document.querySelectorAll('#tm-alter-view [data-tm-filter]').forEach((b) => {
            b.classList.toggle('active', b.dataset.tmFilter === tmAlterFilter);
        });
        tmRenderAlterList();
    };

    const tmGetCombinedProfiles = () => {
        const list = [];
        tmGetKarigers().forEach((k) => {
            list.push({
                id: k.id,
                source: 'kariger_list',
                group: 'kariger',
                groupLabel: 'Kariger',
                name: k.name || '',
                mobile: k.mobile || '',
                address: k.mohalla || k.address || '',
                saree: k.saree || '',
                karkhanaId: k.karkhanaId || 'k_main',
                karkhanaName: k.karkhanaName || 'Main Godown',
                date: k.date || ''
            });
        });
        tmGetJobWorkers().forEach((w) => {
            const t = String(w.type || 'cutting').toLowerCase();
            const lbl = t === 'embroidery' ? 'Embroidery' : (t === 'calender' ? 'Calender' : 'Cutting');
            list.push({
                id: w.id,
                source: 'jobwork_workers',
                group: t,
                groupLabel: lbl,
                name: w.name || '',
                mobile: w.mobile || '',
                address: w.address || '',
                saree: '',
                karkhanaId: '',
                karkhanaName: '',
                date: w.date || ''
            });
        });
        return list;
    };

    const tmRenderAlterList = () => {
        const container = document.getElementById('tm-alter-list');
        if (!container) return;
        const q = (document.getElementById('tm-alter-search')?.value || '').trim().toLowerCase();

        const items = tmGetCombinedProfiles().filter((p) => {
            if (tmAlterFilter !== 'all' && p.group !== tmAlterFilter) return false;
            if (!q) return true;
            return `${p.name} ${p.groupLabel} ${p.mobile} ${p.address} ${p.saree} ${p.karkhanaName}`.toLowerCase().includes(q);
        });

        if (!items.length) {
            container.innerHTML = '<div style="padding:24px; text-align:center; color:#9ca3af; font-size:13px;">Koi profile nahi mili.</div>';
            return;
        }
        if (tmAlterActiveIdx >= items.length) tmAlterActiveIdx = 0;

        const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        container.innerHTML = items.map((p, idx) => {
            const meta = p.group === 'kariger'
                ? `${escHtml(p.karkhanaName)}${p.saree ? ' · ' + escHtml(p.saree) : ''}${p.address ? ' · ' + escHtml(p.address) : ''}`
                : `${escHtml(p.address || '-')}${p.mobile ? ' · ' + escHtml(p.mobile) : ''}`;
            return `
                <div class="tm-alter-row ${idx === tmAlterActiveIdx ? 'active' : ''}" data-idx="${idx}" onclick="tmOpenAlterEdit('${escHtml(p.id)}', '${escHtml(p.source)}')">
                    <div><strong>${escHtml(p.name)}</strong>${p.mobile ? ` <small style="color:#6b7280;">(${escHtml(p.mobile)})</small>` : ''}</div>
                    <div><span class="tm-grp-pill">${escHtml(p.groupLabel)}</span></div>
                    <div class="tm-alter-hide-sm"><small style="color:#6b7280;">${meta || '-'}</small></div>
                    <div style="text-align:right; font-weight:700; font-size:12px;">Edit →</div>
                </div>`;
        }).join('');
    };

    window.tmOpenAlterEdit = function (id, source) {
        const found = tmGetCombinedProfiles().find((p) => String(p.id) === String(id) && p.source === source);
        if (!found) return;

        tmMode = 'alter-edit';
        document.getElementById('tm-screen-title').textContent = `Alter Profile: ${found.name}`;
        document.getElementById('tm-alter-view').style.display = 'none';
        document.getElementById('tm-form-view').style.display = 'block';
        document.getElementById('tm-back-to-alter-btn').style.display = 'inline-block';
        document.getElementById('tm-group-list-box').style.display = 'none';
        document.getElementById('tm-alter-info-box').style.display = 'block';
        document.getElementById('tm-accept-box').style.display = 'none';

        document.getElementById('tm-edit-id').value = found.id;
        document.getElementById('tm-edit-source').value = found.source;
        document.getElementById('tm-name').value = found.name;
        document.getElementById('tm-mobile').value = found.mobile;
        document.getElementById('tm-address').value = found.address;
        document.getElementById('tm-date').value = found.date || tmGetToday();

        const grpInp = document.getElementById('tm-group');
        if (grpInp) grpInp.readOnly = true;

        tmPopulateKarkhanaDropdown(found.karkhanaId);
        document.getElementById('tm-saree').value = found.saree || '';
        window.tmPickGroup(found.group, false);

        document.getElementById('tm-alter-grp-label').textContent = found.groupLabel;
        document.getElementById('tm-alter-id-label').textContent = found.id;
        tmSetToast(`Editing [${found.name}] — Badlav karke Enter dabayein.`);
        setTimeout(() => document.getElementById('tm-name')?.focus(), 40);
    };

    window.tmAskAccept = function () {
        const name = (document.getElementById('tm-name')?.value || '').trim();
        if (!name) {
            alert('Pehle Name bharein!');
            document.getElementById('tm-name')?.focus();
            return;
        }
        const box = document.getElementById('tm-accept-box');
        const title = document.getElementById('tm-accept-title');
        if (title) title.textContent = (tmMode === 'alter-edit') ? 'Update Profile? (Accept)' : 'Accept?';
        if (box) box.style.display = 'block';
        document.getElementById('tm-btn-yes')?.focus();
    };

    window.tmCancelAccept = function () {
        const box = document.getElementById('tm-accept-box');
        if (box) box.style.display = 'none';
        document.getElementById('tm-address')?.focus();
    };

    window.tmSaveProfile = function () {
        const editId = (document.getElementById('tm-edit-id')?.value || '').trim();
        const editSource = (document.getElementById('tm-edit-source')?.value || '').trim();
        const name = (document.getElementById('tm-name')?.value || '').trim().toUpperCase();
        const mobile = (document.getElementById('tm-mobile')?.value || '').trim();
        const address = (document.getElementById('tm-address')?.value || '').trim();
        const dateVal = (document.getElementById('tm-date')?.value || '').trim() || tmGetToday();

        if (!name) return;

        if (tmSelectedGroup === 'kariger' || editSource === 'kariger_list') {
            const kSel = document.getElementById('tm-karkhana');
            const kId = kSel ? (kSel.value || 'k_main') : 'k_main';
            const kName = (typeof window.getKarkhanaNameById === 'function') ? window.getKarkhanaNameById(kId) : 'Main Godown';
            const saree = (document.getElementById('tm-saree')?.value || '').trim();

            const list = tmGetKarigers();
            if (editId) {
                const it = list.find((x) => String(x.id) === String(editId));
                if (it) {
                    it.name = name;
                    it.saree = saree;
                    it.mobile = mobile;
                    it.mohalla = address;
                    it.date = dateVal;
                    it.karkhanaId = kId;
                    it.karkhanaName = kName;
                }
            } else {
                list.push({
                    id: `kar_${Date.now()}`,
                    name: name,
                    saree: saree,
                    mobile: mobile,
                    mohalla: address,
                    date: dateVal,
                    karkhanaId: kId,
                    karkhanaName: kName
                });
            }
            if (typeof window.setStore === 'function') window.setStore('kariger_list', list);
        } else {
            const jwList = [...tmGetJobWorkers()];
            if (editId) {
                const it = jwList.find((x) => String(x.id) === String(editId));
                if (it) {
                    it.name = name;
                    it.address = address;
                    it.mobile = mobile;
                    it.date = dateVal;
                }
            } else {
                jwList.push({
                    id: `jw_${Date.now()}`,
                    type: tmSelectedGroup,
                    date: dateVal,
                    name: name,
                    address: address,
                    mobile: mobile
                });
            }
            if (typeof window.saveJobWorkers === 'function') {
                window.saveJobWorkers(jwList);
            } else if (typeof window.setStore === 'function') {
                window.setStore('jobwork_workers', jwList);
            }
            if (typeof window.invalidateJobWorkCache === 'function') window.invalidateJobWorkCache(editId || null);
            if (typeof window.updateJobWorkHubBadges === 'function') window.updateJobWorkHubBadges();
        }

        if (typeof window.populateKarigersDatalist === 'function') window.populateKarigersDatalist();
        if (typeof window.updateDashboardBadgeTotals === 'function') window.updateDashboardBadgeTotals();
        window.slSyncDashboardCharts();
        tmUpdateCountsBar();

        document.getElementById('tm-accept-box').style.display = 'none';

        if (tmMode === 'alter-edit') {
            window.openTallyAlterModule();
            tmSetToast(`✅ [${name}] ki profile update ho gayi!`);
        } else {
            document.getElementById('tm-name').value = '';
            document.getElementById('tm-saree').value = '';
            document.getElementById('tm-mobile').value = '';
            document.getElementById('tm-address').value = '';
            tmSetToast(`✅ [${name}] (${tmSelectedGroup.toUpperCase()}) save ho gaya! Agli entry karein.`);
            document.getElementById('tm-name')?.focus();
        }
    };

    window.tmHandleEscKey = function () {
        const acc = document.getElementById('tm-accept-box');
        if (acc && acc.style.display === 'block') {
            window.tmCancelAccept();
            return;
        }
        if (tmMode === 'alter-edit') {
            window.openTallyAlterModule();
            return;
        }
        window.backToDashboard();
    };

    /* ========================================================================
       5. GLOBAL KEYBOARD SHORTCUTS (STOCK SUMMARY + CREATE/ALTER + GATEWAY)
    ======================================================================== */
    document.addEventListener('keydown', (e) => {
        const desk = document.getElementById('desktop-screen');
        if (!desk || desk.style.display === 'none') return;

        const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some((m) => m.style.display && m.style.display !== 'none');
        if (anyModalOpen) return;

        // 0. Inside Stock Summary Hub screen
        const ssSec = document.getElementById('stock-summary-section');
        if (ssSec && ssSec.style.display !== 'none') {
            if (e.key === 'Escape') {
                e.preventDefault();
                window.backToDashboard();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                ssHighlightRow(ssActiveIdx + 1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                ssHighlightRow(ssActiveIdx - 1);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                window.ssOpenStockGroup(ssActiveIdx);
                return;
            }
            if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
                const k = e.key.toLowerCase();
                if (k === 'b') { e.preventDefault(); window.ssOpenStockGroup(0); return; }
                if (k === 'z') { e.preventDefault(); window.ssOpenStockGroup(1); return; }
                if (k === 'n') { e.preventDefault(); window.ssOpenStockGroup(2); return; }
                if (k === 'e') { e.preventDefault(); window.ssOpenStockGroup(3); return; }
            }
            return;
        }

        // 1. Inside Tally Create / Alter screen
        const tmSec = document.getElementById('tally-master-section');
        if (tmSec && tmSec.style.display !== 'none') {
            if (e.key === 'Escape') {
                e.preventDefault();
                window.tmHandleEscKey();
                return;
            }

            if (tmMode === 'alter-list') {
                const rows = Array.from(document.querySelectorAll('#tm-alter-list .tm-alter-row'));
                if (!rows.length) return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    rows[tmAlterActiveIdx]?.classList.remove('active');
                    tmAlterActiveIdx = (tmAlterActiveIdx + 1) % rows.length;
                    rows[tmAlterActiveIdx]?.classList.add('active');
                    rows[tmAlterActiveIdx]?.scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    rows[tmAlterActiveIdx]?.classList.remove('active');
                    tmAlterActiveIdx = (tmAlterActiveIdx - 1 + rows.length) % rows.length;
                    rows[tmAlterActiveIdx]?.classList.add('active');
                    rows[tmAlterActiveIdx]?.scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    rows[tmAlterActiveIdx]?.click();
                }
                return;
            }

            const accBox = document.getElementById('tm-accept-box');
            if (accBox && accBox.style.display === 'block') {
                if (e.key.toLowerCase() === 'y' || e.key === 'Enter') {
                    e.preventDefault();
                    window.tmSaveProfile();
                } else if (e.key.toLowerCase() === 'n') {
                    e.preventDefault();
                    window.tmCancelAccept();
                }
                return;
            }

            const activeId = document.activeElement?.id || '';
            if (activeId === 'tm-group' && tmMode === 'create' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                const visible = Array.from(document.querySelectorAll('#tm-group-list .tm-group-opt')).filter((x) => x.style.display !== 'none');
                if (!visible.length) return;
                let gIdx = visible.findIndex((x) => x.classList.contains('selected'));
                gIdx = (e.key === 'ArrowDown') ? (gIdx + 1) % visible.length : (gIdx - 1 + visible.length) % visible.length;
                visible.forEach((x) => x.classList.remove('selected'));
                visible[gIdx].classList.add('selected');
                tmSelectedGroup = visible[gIdx].dataset.grp;
                document.getElementById('tm-group').value = visible[gIdx].dataset.label;
                return;
            }

            if (e.key === 'Enter') {
                const order = (tmSelectedGroup === 'kariger')
                    ? (tmMode === 'alter-edit' ? ['tm-name', 'tm-karkhana', 'tm-saree', 'tm-mobile', 'tm-address', 'tm-date'] : ['tm-name', 'tm-group', 'tm-karkhana', 'tm-saree', 'tm-mobile', 'tm-address', 'tm-date'])
                    : (tmMode === 'alter-edit' ? ['tm-name', 'tm-mobile', 'tm-address', 'tm-date'] : ['tm-name', 'tm-group', 'tm-mobile', 'tm-address', 'tm-date']);
                const curIdx = order.indexOf(activeId);
                if (curIdx >= 0) {
                    e.preventDefault();
                    if (activeId === 'tm-group') {
                        window.tmPickGroup(tmSelectedGroup, true);
                        return;
                    }
                    if (curIdx < order.length - 1) {
                        document.getElementById(order[curIdx + 1])?.focus();
                    } else {
                        window.tmAskAccept();
                    }
                }
            }
            return;
        }

        // 2. Dashboard Gateway Arrow + Letter Shortcuts
        const dash = document.getElementById('dashboard-view');
        if (!dash || dash.style.display === 'none') return;

        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        const items = Array.from(document.querySelectorAll('#dashboard-view .gw-item'));
        if (!items.length) return;
        let idx = items.findIndex((el) => el.classList.contains('active'));
        if (idx < 0) idx = 0;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[idx].classList.remove('active');
            items[(idx + 1) % items.length].classList.add('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[idx].classList.remove('active');
            items[(idx - 1 + items.length) % items.length].classList.add('active');
        } else if (e.key === 'Enter' && !document.activeElement.classList.contains('gw-item') && tag !== 'BUTTON') {
            e.preventDefault();
            items[idx].click();
        } else if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
            const k = e.key.toLowerCase();
            const targetBtn = items.find((el) => el.dataset.gwKey === k);
            if (targetBtn) {
                e.preventDefault();
                targetBtn.click();
                return;
            }
            // Direct background stock shortcuts (B/Z/N/E) remain active for power speed
            if (k === 'b' && typeof window.openBanaModule === 'function') { e.preventDefault(); window.__slReturnToStockSummary = false; window.openBanaModule(); }
            else if (k === 'z' && typeof window.openZariModule === 'function') { e.preventDefault(); window.__slReturnToStockSummary = false; window.openZariModule(); }
            else if (k === 'n' && typeof window.openSanchaModule === 'function') { e.preventDefault(); window.__slReturnToStockSummary = false; window.openSanchaModule(); }
            else if (k === 'e' && typeof window.openSareeModule === 'function') { e.preventDefault(); window.__slReturnToStockSummary = false; window.openSareeModule(); }
        }
    });

    /* ========================================================================
       6. NAVBAR KARKHANA DROPDOWN & GLOBAL MODULE NAVIGATION
    ======================================================================== */
    window.populateNavbarKarkhanaDropdown = function () {
        const sel = document.getElementById('app-karkhana-select');
        if (!sel) return;
        sel.innerHTML = '';

        const list = (typeof window.getKarkhanasSafe === 'function') ? window.getKarkhanasSafe() : [];
        const activeKid = (typeof window.getActiveKarkhanaId === 'function') ? window.getActiveKarkhanaId() : 'all';

        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = '🌐 Sabhi Karkhane';
        if (activeKid === 'all') optAll.selected = true;
        sel.appendChild(optAll);

        list.forEach((k) => {
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = (k.id === 'k_main' || k.isDefault ? '🏢 ' : '🏭 ') + k.name;
            if (String(k.id) === String(activeKid)) opt.selected = true;
            sel.appendChild(opt);
        });
    };

    window.handleNavbarKarkhanaChange = function (val) {
        if (typeof window.setActiveKarkhanaId === 'function') {
            window.setActiveKarkhanaId(val, () => {
                if (typeof window.switchDashboardKarkhanaTab === 'function') {
                    window.switchDashboardKarkhanaTab(val);
                }
                if (typeof window.triggerActiveSectionRefresh === 'function') {
                    window.triggerActiveSectionRefresh();
                }
                window.slSyncDashboardCharts();
            });
        }
    };

    window.openDayBookModule = function () {
        document.querySelectorAll('.module-section').forEach((s) => s.style.display = 'none');
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';
        const dbSec = document.getElementById('daybook-section');
        if (dbSec) dbSec.style.display = 'block';
        if (typeof window.renderDashboardDayBook === 'function') {
            window.renderDashboardDayBook();
        }
    };

    window.openTaniOrderModule = function () {
        document.querySelectorAll('.module-section').forEach((s) => s.style.display = 'none');
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = 'none';
        const taniSec = document.getElementById('tani-order-section');
        if (taniSec) taniSec.style.display = 'block';
        if (window.TaniOrderEngine && typeof window.TaniOrderEngine.initTaniOrderView === 'function') {
            window.TaniOrderEngine.initTaniOrderView();
        }
    };

    window.backToDashboard = function () {
        window.__slReturnToStockSummary = false;
        document.querySelectorAll('.module-section').forEach((s) => s.style.display = 'none');
        const dView = document.getElementById('dashboard-view');
        if (dView) dView.style.display = window.innerWidth <= 860 ? 'block' : 'flex';
        if (typeof window.updateDashboardBadgeTotals === 'function') {
            window.updateDashboardBadgeTotals();
        }
        window.slSyncDashboardCharts();
    };

    /* ========================================================================
       7. PWA SERVICE WORKER & APP BOOTSTRAP
    ======================================================================== */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js?v=3.4')
                .then(() => console.log('✅ [PWA] Service Worker Active v3.4.'))
                .catch((err) => console.warn('⚠️ [PWA] SW Registration failed:', err));
        });
    }

    const initAppShell = () => {
        ensureTallyMasterDOM();
        ensureStockSummaryDOM();
        window.populateNavbarKarkhanaDropdown();
        slInitBadgeObserver();
        if (typeof window.checkAutoLogin === 'function') {
            window.checkAutoLogin();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAppShell);
    } else {
        initAppShell();
    }
})();
