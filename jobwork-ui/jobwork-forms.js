/* ============================================================================
   SIMPLICITY ERP - JOB WORK HUB TALLYPRIME UI & FORMS INJECTOR
   File: jobwork-ui/jobwork-forms.js • Developed for Farhan Jawed
   Theme: Pure White & Gold TallyPrime Standard (Scoped CSS, Zero Row Clutter)
   Views: Gateway Hub | Workers | Khata Batch Voucher | Dukan Batch Voucher |
          Bills & Inline Payment Ledger | Tracking Day-Book
============================================================================ */

(() => {
    'use strict';

    const injectStyles = () => {
        const old = document.getElementById('jw-forms-injected-style');
        if (old) old.remove();

        const st = document.createElement('style');
        st.id = 'jw-forms-injected-style';
        st.textContent = `
            /* ================================================================
               SCOPED TALLYPRIME WHITE & GOLD THEME (#jobwork-section)
            ================================================================ */
            #jobwork-section,
            #jw-batch-modal,
            #jw-pay-modal {
                font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
                color: #1f2937;
                box-sizing: border-box;
            }
            #jobwork-section *,
            #jw-batch-modal *,
            #jw-pay-modal * {
                box-sizing: border-box;
            }
            #jobwork-section .module-header {
                background: #fdf6e2;
                border: 1.5px solid #e5d5a7;
                border-radius: 6px;
                padding: 10px 14px;
                margin-bottom: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
            }
            #jobwork-section .module-header h2 {
                margin: 0;
                font-size: 17px;
                font-weight: 800;
                color: #1f2937 !important;
            }

            /* Global Table Override */
            #jobwork-section table,
            #jw-batch-modal table,
            #jw-pay-modal table {
                min-width: 0 !important;
                width: 100% !important;
                border-collapse: collapse;
                font-size: 12.5px;
                background: #ffffff;
            }
            #jobwork-section .table-responsive {
                border: 1px solid #e5d5a7;
                border-radius: 6px;
                overflow-x: auto;
                background: #ffffff;
            }
            #jobwork-section th,
            #jw-batch-modal th {
                background: #fdf6e2 !important;
                color: #1f2937 !important;
                font-weight: 800;
                font-size: 11.5px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                padding: 8px 10px;
                border-bottom: 1.5px solid #e5d5a7;
                text-align: left;
            }
            #jobwork-section td,
            #jw-batch-modal td {
                padding: 8px 10px;
                border-bottom: 1px solid #f3f4f6;
                color: #1f2937;
                vertical-align: middle;
            }

            /* Interactive Clickable / Arrow-Navigable Rows */
            #jobwork-section tbody tr.jw-nav-row {
                cursor: pointer;
                transition: background 0.1s ease;
            }
            #jobwork-section tbody tr.jw-nav-row:hover {
                background: #fef9ea;
            }
            #jobwork-section tbody tr.jw-nav-row.jw-row-active {
                background: #fdf6e2 !important;
                outline: 1.5px solid #f2b71d;
            }
            #jobwork-section .jw-open-ind {
                color: #b47d00;
                font-weight: 800;
                font-size: 12px;
                white-space: nowrap;
            }

            /* Buttons */
            #jobwork-section .jw-btn-gold,
            #jobwork-section .add-btn,
            #jw-pay-modal .jw-btn-gold {
                background: #f2b71d !important;
                color: #1f2937 !important;
                border: 1px solid #d9a425 !important;
                border-radius: 5px;
                padding: 7px 14px;
                font-size: 12.5px;
                font-weight: 800;
                cursor: pointer;
                white-space: nowrap;
            }
            #jobwork-section .jw-btn-gold:hover,
            #jobwork-section .add-btn:hover {
                background: #e5aa12 !important;
            }
            #jobwork-section .jw-btn-sec,
            #jobwork-section .back-btn,
            #jw-pay-modal .jw-btn-sec {
                background: #ffffff !important;
                color: #1f2937 !important;
                border: 1px solid #d1d5db !important;
                border-radius: 5px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
            }
            #jobwork-section .jw-btn-sec:hover,
            #jobwork-section .back-btn:hover {
                border-color: #d9a425 !important;
                background: #fef9ea !important;
            }
            #jobwork-section .jw-btn-del {
                background: #ffffff;
                color: #92400e;
                border: 1px solid #e5d5a7;
                border-radius: 4px;
                padding: 4px 10px;
                font-size: 11.5px;
                font-weight: 700;
                cursor: pointer;
            }
            #jobwork-section .jw-btn-del:hover {
                background: #fdf6e2;
                border-color: #d9a425;
            }

            /* Tabs */
            #jobwork-section .sheet-tabs-bar {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                align-items: center;
                margin-bottom: 10px;
            }
            #jobwork-section .sheet-tab,
            #jobwork-section .daybook-tab-btn {
                background: #ffffff !important;
                color: #374151 !important;
                border: 1px solid #d1d5db !important;
                border-radius: 5px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: none !important;
            }
            #jobwork-section .sheet-tab.active,
            #jobwork-section .daybook-tab-btn.active {
                background: #f2b71d !important;
                color: #1f2937 !important;
                border-color: #d9a425 !important;
                font-weight: 800;
            }
            #jobwork-section .daybook-tab-btn {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 2px;
                flex: 1;
                min-width: 140px;
                padding: 8px 12px;
            }
            #jobwork-section .day-title { font-size: 13px; font-weight: 800; color: #1f2937; }
            #jobwork-section .day-sub { font-size: 11px; font-weight: 600; color: #6b7280; }
            #jobwork-section .daybook-tab-btn.active .day-sub { color: #1f2937; }

            /* Gateway Hub Row List */
            #jobwork-section .jw-gw-wrap {
                max-width: 720px;
                margin: 0 auto;
                background: #ffffff;
                border: 1.5px solid #d9b86c;
                border-radius: 8px;
                overflow: hidden;
            }
            #jobwork-section .jw-gw-head {
                background: #fdf6e2;
                border-bottom: 1.5px solid #e5d5a7;
                padding: 10px 16px;
                font-size: 13.5px;
                font-weight: 800;
                color: #1f2937;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #jobwork-section .jw-gw-list {
                padding: 6px 0;
            }
            #jobwork-section .jw-hub-row {
                width: 100%;
                background: #ffffff;
                border: none;
                border-bottom: 1px solid #f3f4f6;
                padding: 11px 18px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                text-align: left;
                font-size: 13.5px;
                font-weight: 700;
                color: #1f2937;
                transition: background 0.1s ease;
            }
            #jobwork-section .jw-hub-row:last-child { border-bottom: none; }
            #jobwork-section .jw-hub-row:hover { background: #fef9ea; }
            #jobwork-section .jw-hub-row.active {
                background: #f2b71d;
                color: #1f2937;
                font-weight: 800;
            }
            #jobwork-section .jw-hub-key {
                display: inline-block;
                min-width: 22px;
                font-weight: 800;
                color: #b47d00;
            }
            #jobwork-section .jw-hub-row.active .jw-hub-key { color: #1f2937; }
            #jobwork-section .jw-hub-badge {
                font-size: 12px;
                font-weight: 700;
                color: #6b7280;
                background: #fdfcf7;
                border: 1px solid #e5d5a7;
                padding: 2px 10px;
                border-radius: 4px;
            }
            #jobwork-section .jw-hub-row.active .jw-hub-badge {
                background: #ffffff;
                color: #1f2937;
                border-color: #d9a425;
            }
            #jobwork-section .jw-gw-foot {
                background: #fdf6e2;
                border-top: 1px solid #e5d5a7;
                padding: 7px 16px;
                font-size: 11.5px;
                font-weight: 700;
                color: #92400e;
            }

            /* KPI Stat Strips */
            #jobwork-section .jw-card-grid-3 {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 8px;
                margin-bottom: 12px;
            }
            #jobwork-section .jw-card-grid-5 {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                gap: 8px;
                margin-bottom: 12px;
            }
            #jobwork-section .jw-stat-box {
                background: #fdfcf7;
                border: 1px solid #e5d5a7;
                border-radius: 6px;
                padding: 8px 12px;
                text-align: center;
            }
            #jobwork-section .jw-stat-box small {
                display: block;
                font-size: 11px;
                font-weight: 700;
                color: #6b7280;
                text-transform: uppercase;
            }
            #jobwork-section .jw-stat-box h4 {
                margin: 3px 0 0;
                font-size: 16px;
                font-weight: 800;
                color: #1f2937;
            }
            #jobwork-section .jw-stat-box.gold h4 { color: #b47d00; }

            /* Filter Panel */
            #jobwork-section .filter-panel {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 10px;
                align-items: center;
            }
            #jobwork-section .search-box {
                flex: 1;
                min-width: 180px;
                padding: 7px 10px;
                border: 1px solid #d1d5db;
                border-radius: 5px;
                font-size: 13px;
                font-weight: 600;
                background: #ffffff;
                color: #1f2937;
                outline: none;
            }
            #jobwork-section .search-box:focus {
                border-color: #d9a425;
                background: #fffdf5;
            }

            /* Tally 1-Field-Per-Row Forms & Top Split Voucher Anatomy */
            #jobwork-section .jw-panel-card {
                background: #ffffff;
                border: 1.5px solid #d9b86c;
                border-radius: 8px;
                padding: 14px 16px;
                margin-bottom: 14px;
            }
            #jobwork-section .jw-top-grid {
                display: grid;
                grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
                gap: 16px;
                align-items: stretch;
                min-width: 0;
            }
            @media (max-width: 840px) {
                #jobwork-section .jw-top-grid { grid-template-columns: minmax(0, 1fr); }
            }
            #jobwork-section .jw-left-col,
            #jobwork-section .jw-right-col {
                min-width: 0;
            }
            #jobwork-section .jw-right-col {
                display: flex;
                flex-direction: column;
            }
            #jobwork-section .jw-sec-title {
                font-size: 11px;
                font-weight: 800;
                color: #92400e;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-bottom: 1px solid #eadab0;
                padding-bottom: 3px;
                margin: 8px 0 7px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #jobwork-section .jw-row {
                display: grid;
                grid-template-columns: 145px minmax(0, 1fr);
                align-items: center;
                gap: 10px;
                margin-bottom: 6px;
                min-width: 0;
            }
            @media (max-width: 520px) {
                #jobwork-section .jw-row { grid-template-columns: 115px minmax(0, 1fr); gap: 8px; }
            }
            #jobwork-section .jw-lbl {
                font-size: 12.5px;
                font-weight: 600;
                color: #374151;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #jobwork-section .jw-inp,
            #jw-pay-modal .jw-inp {
                width: 100%;
                min-width: 0;
                max-width: 100%;
                padding: 6px 10px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 700;
                color: #111827;
                background: #ffffff;
                outline: none;
                transition: border-color 0.12s, background 0.12s;
            }
            #jobwork-section .jw-inp:focus,
            #jw-pay-modal .jw-inp:focus {
                border-color: #d9a425 !important;
                background: #fffdf5 !important;
                box-shadow: 0 0 0 2px rgba(242, 183, 29, 0.22);
            }
            #jobwork-section .jw-inp-num {
                text-align: right;
                font-variant-numeric: tabular-nums;
            }

            /* Right-Side Tally Contextual Picker */
            #jobwork-section .jw-right-panel {
                border: 1px solid #e5d5a7;
                border-radius: 6px;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                min-width: 0;
                flex: 1;
            }
            #jobwork-section .jw-right-head {
                background: #fdf6e2;
                border-bottom: 1px solid #e5d5a7;
                padding: 7px 12px;
                font-size: 12px;
                font-weight: 800;
                color: #1f2937;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
            }
            #jobwork-section .jw-picker-list {
                overflow-y: auto;
                flex: 1;
                min-height: 190px;
                max-height: 270px;
            }
            #jobwork-section .jw-picker-item {
                padding: 7px 12px;
                font-size: 12.5px;
                font-weight: 600;
                color: #1f2937;
                border-bottom: 1px solid #f3f4f6;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
            }
            #jobwork-section .jw-picker-item:hover { background: #fef9ea; }
            #jobwork-section .jw-picker-item.active {
                background: #f2b71d;
                color: #1f2937;
                font-weight: 800;
            }
            #jobwork-section .jw-picker-sub {
                font-size: 11px;
                color: #6b7280;
                font-weight: 600;
                white-space: nowrap;
            }
            #jobwork-section .jw-picker-item.active .jw-picker-sub { color: #1f2937; }

            /* Batch Panel & Accept Strip */
            #jobwork-section .jw-batch-panel {
                border: 1px solid #e5d5a7;
                border-radius: 6px;
                background: #ffffff;
                overflow: hidden;
                margin-top: 12px;
            }
            #jobwork-section .jw-accept-bar {
                background: #fdf6e2;
                border: 1.5px solid #d9a425;
                border-radius: 5px;
                padding: 8px 14px;
                margin-top: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            /* Inline Detail / Ledger Drawers */
            #jobwork-section .jw-inline-drawer {
                background: #fdfcf7;
                border: 1.5px solid #d9b86c;
                border-radius: 8px;
                padding: 14px 16px;
                margin-top: 12px;
                margin-bottom: 14px;
            }
            #jobwork-section .jw-inline-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                border-bottom: 1px solid #e5d5a7;
                padding-bottom: 8px;
                margin-bottom: 10px;
            }
            #jobwork-section .jw-status-pill {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 700;
                border: 1px solid #e5d5a7;
                background: #fdf6e2;
                color: #92400e;
            }
            #jobwork-section .jw-status-pill.absent {
                background: #fffdf5;
                border-color: #d9a425;
                color: #b47d00;
            }
            #jobwork-section .jw-foot-bar {
                background: #fdf6e2;
                border: 1px solid #e5d5a7;
                border-radius: 5px;
                padding: 7px 12px;
                margin-top: 10px;
                font-size: 11.5px;
                font-weight: 700;
                color: #92400e;
                display: flex;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
            }
        `;
        document.head.appendChild(st);
    };

    const JOBWORK_SECTION_HTML = `
        <div class="module-header">
            <button type="button" class="back-btn" onclick="backToDashboard()">&larr; Dashboard [Esc]</button>
            <h2>Job Work Hub</h2>
            <span id="jw-header-context-lbl" style="font-size:12px; font-weight:700; color:#92400e;">TallyPrime White &amp; Gold</span>
        </div>

        <!-- ================================================================
             1. GATEWAY HUB VIEW (CLEAN TALLY ROW LIST)
        ================================================================ -->
        <div id="jw-hub-view">
            <div class="jw-gw-wrap">
                <div class="jw-gw-head">
                    <span>Job Work Gateway</span>
                    <span style="font-size:11.5px; color:#92400e;">[1-6] Ya &uarr;&darr; + Enter</span>
                </div>
                <div class="jw-gw-list" id="jw-hub-list">
                    <button type="button" class="jw-hub-row active" data-jw-mode="cutting" data-jw-key="1" onclick="openJobWorkSubSection('cutting')">
                        <span><span class="jw-hub-key">1.</span> Booti Cutting</span>
                        <span class="jw-hub-badge" id="jw-hub-badge-cutting">0 Kariger</span>
                    </button>
                    <button type="button" class="jw-hub-row" data-jw-mode="embroidery" data-jw-key="2" onclick="openJobWorkSubSection('embroidery')">
                        <span><span class="jw-hub-key">2.</span> Embroidery</span>
                        <span class="jw-hub-badge" id="jw-hub-badge-embroidery">0 Kariger</span>
                    </button>
                    <button type="button" class="jw-hub-row" data-jw-mode="calender" data-jw-key="3" onclick="openJobWorkSubSection('calender')">
                        <span><span class="jw-hub-key">3.</span> Calender</span>
                        <span class="jw-hub-badge" id="jw-hub-badge-calender">0 Kariger</span>
                    </button>
                    <button type="button" class="jw-hub-row" data-jw-mode="dukan" data-jw-key="4" onclick="openJobWorkSubSection('dukan')">
                        <span><span class="jw-hub-key">4.</span> Dukan Bheja</span>
                        <span class="jw-hub-badge" id="jw-hub-badge-dukan">0 Pcs Bheje</span>
                    </button>
                    <button type="button" class="jw-hub-row" data-jw-mode="billing" data-jw-key="5" onclick="openJobWorkSubSection('billing')">
                        <span><span class="jw-hub-key">5.</span> Bills &amp; Hisab</span>
                        <span class="jw-hub-badge" id="jw-hub-badge-billing">Baki: ₹ 0</span>
                    </button>
                    <button type="button" class="jw-hub-row" data-jw-mode="movement" data-jw-key="6" onclick="openJobWorkSubSection('movement')">
                        <span><span class="jw-hub-key">6.</span> Tracking Day-Book</span>
                        <span class="jw-hub-badge">Live Day-Book</span>
                    </button>
                </div>
                <div class="jw-gw-foot">
                    [1-6] Direct Open &middot; &uarr; &darr; Arrow &middot; [Enter] Kholein &middot; [Esc] Dashboard
                </div>
            </div>
        </div>

        <!-- ================================================================
             2. WORKERS DIRECTORY VIEW (CUTTING / EMBROIDERY / CALENDER)
        ================================================================ -->
        <div id="jw-workers-view" style="display:none;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center; flex-wrap:wrap; gap:8px;">
                <button type="button" class="back-btn" onclick="showJobWorkHub()">&larr; Hub Menu [Esc]</button>
                <h3 id="jw-workers-title" style="color:#1f2937; margin:0; font-size:16px; font-weight:800;">Workers Directory</h3>
                <button type="button" class="add-btn" onclick="toggleJobWorkerForm()"><span id="jw-add-worker-btn-text">+ Naya Kariger [Alt+N]</span></button>
            </div>

            <div class="jw-card-grid-3">
                <div class="jw-stat-box">
                    <small>Kul Saree Gayi</small>
                    <h4 id="jw-stat-total-gayi">0 Pcs</h4>
                </div>
                <div class="jw-stat-box gold">
                    <small>Kul Wapas Aayi</small>
                    <h4 id="jw-stat-total-aayi">0 Pcs</h4>
                </div>
                <div class="jw-stat-box">
                    <small>Kul Damage</small>
                    <h4 id="jw-stat-total-damage">0 Pcs</h4>
                </div>
            </div>

            <div class="filter-panel">
                <input type="text" id="jw-search-worker-input" class="search-box" placeholder="Search Kariger Naam, Pata, Mobile...">
                <select id="jw-absent-filter" class="search-box" style="max-width:190px;" onchange="if(window.JobWorkEngine) JobWorkEngine.filterJobWorkWorkers()">
                    <option value="0">Sabhi Kariger</option>
                    <option value="15">15 Din se Absent</option>
                    <option value="20">20 Din se Absent</option>
                    <option value="30">30 Din se Absent</option>
                    <option value="40">40 Din se Absent</option>
                </select>
            </div>

            <!-- Inline 1-Field-Per-Row Add/Edit Worker Form -->
            <div id="add-jw-worker-form" class="jw-panel-card" style="display:none; max-width:560px;">
                <div class="jw-sec-title" style="margin-top:0;">Kariger Profile</div>
                <input type="hidden" id="jw-worker-edit-id">
                <div class="jw-row"><label class="jw-lbl">Tarikh :</label><input type="date" id="jw-worker-date" class="jw-inp"></div>
                <div class="jw-row"><label class="jw-lbl">Kariger Naam :</label><input type="text" id="jw-worker-name" class="jw-inp" placeholder="Kariger ka naam..."></div>
                <div class="jw-row"><label class="jw-lbl">Pata / Mohalla :</label><input type="text" id="jw-worker-address" class="jw-inp" placeholder="Address..."></div>
                <div class="jw-row"><label class="jw-lbl">Mobile :</label><input type="tel" id="jw-worker-mobile" class="jw-inp" maxlength="10" placeholder="10-digit Mobile"></div>

                <div id="jw-worker-accept-bar" class="jw-accept-bar" style="display:none;">
                    <span style="font-size:12.5px; font-weight:800;">Accept? Kariger Save Karein?</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="jw-worker-accept-yes" class="jw-btn-gold" style="padding:5px 14px;" onclick="saveNewJobWorker()">Yes [Y / Enter]</button>
                        <button type="button" id="jw-worker-accept-no" class="jw-btn-sec" style="padding:5px 14px;" onclick="toggleJobWorkerForm()">No [N / Esc]</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                    <button type="button" id="jw-worker-cancel-btn" class="jw-btn-sec" style="display:none;" onclick="cancelJobWorkerEdit()">Cancel Edit</button>
                    <button type="button" class="jw-btn-sec" onclick="toggleJobWorkerForm()">Band Karein [Esc]</button>
                    <button type="button" id="jw-worker-save-btn" class="jw-btn-gold" onclick="saveNewJobWorker()">Save Kariger</button>
                </div>
            </div>

            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Tarikh</th>
                            <th>Kariger Naam</th>
                            <th>Pata / Mohalla</th>
                            <th>Mobile</th>
                            <th>Status</th>
                            <th style="text-align:right;">Open</th>
                        </tr>
                    </thead>
                    <tbody id="jw-workers-table-body"></tbody>
                </table>
            </div>

            <div class="jw-foot-bar">
                <span>&uarr; &darr; Select &middot; [Enter] Khata Sheet Kholein &middot; [Alt+N] Naya Kariger &middot; [E] Edit &middot; [W] Tagada &middot; [Del] Delete</span>
                <span>[Esc] Hub Menu</span>
            </div>
        </div>

        <!-- ================================================================
             3. WORKER MONTHLY KHATA SHEET + BATCH VOUCHER VIEW
        ================================================================ -->
        <div id="jw-sheet-view" style="display:none;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center; flex-wrap:wrap; gap:8px;">
                <button type="button" class="back-btn" onclick="closeJobWorkerSheet()">&larr; Workers List [Esc]</button>
                <div style="text-align:center;">
                    <h3 id="jw-sheet-banner-name" style="color:#1f2937; margin:0; font-size:16px; font-weight:800;">Worker Khata Sheet</h3>
                    <small id="jw-sheet-active-badge" style="color:#b47d00; font-weight:700;">Month 1</small>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="jw-btn-sec" onclick="if(window.JobWorkEngine) JobWorkEngine.editActiveSheetWorker()">[E] Edit Profile</button>
                    <button type="button" class="jw-btn-sec" onclick="shareJobWorkOnWhatsApp()">[W] WhatsApp</button>
                    <button type="button" class="jw-btn-sec" onclick="if(window.JobWorkEngine) JobWorkEngine.printJobWorkSheetReport()">[Alt+P] Print</button>
                    <button type="button" class="jw-btn-gold" onclick="addNewJobWorkerMonthlySheet()">+ Naya Mahina [F7]</button>
                </div>
            </div>

            <div id="jw-month-tabs-container" class="sheet-tabs-bar"></div>

            <!-- Slim 5-Box KPI Strip -->
            <div class="jw-card-grid-5">
                <div class="jw-stat-box">
                    <small>Pichli Baki Saree</small>
                    <input type="number" id="jw-top-pichli-saree" value="0" onchange="saveJobWorkSheetConfig()" class="jw-inp jw-inp-num" style="width:92px; margin:4px auto 0; text-align:center; padding:3px 6px;">
                </div>
                <div class="jw-stat-box">
                    <small>Gayi Saree</small>
                    <h4 id="jw-card-total-gayi">0 Pcs</h4>
                </div>
                <div class="jw-stat-box">
                    <small>Wapas Aayi</small>
                    <h4 id="jw-card-total-aayi">0 Pcs</h4>
                </div>
                <div class="jw-stat-box">
                    <small>Damage</small>
                    <h4 id="jw-card-total-lott">0 Pcs</h4>
                </div>
                <div class="jw-stat-box gold">
                    <small>Abhi Baki</small>
                    <h4 id="jw-calc-baki-saree-display">0 Pcs Baki</h4>
                </div>
            </div>

            <!-- EXACT JOBWORK-EXPRESS STYLE BATCH VOUCHER -->
            <div id="jw-sheet-voucher-box" class="jw-panel-card">
                <div class="jw-top-grid">
                    <!-- LEFT: 1 FIELD PER ROW -->
                    <div class="jw-left-col">
                        <div class="jw-sec-title" style="margin-top:0;">
                            <span>1. Batch Entry (Gatthi)</span>
                            <span id="jw-sh-live-stock-hint" style="color:#b47d00; font-size:11px; text-transform:none;"></span>
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Len-Den [F5] :</label>
                            <input type="text" id="jw-sh-movement-input" value="Saree Gayi (Bheja)" readonly class="jw-inp" style="border-color:#d9a425; cursor:pointer;">
                        </div>

                        <div class="jw-row" id="jw-sh-source-row">
                            <label class="jw-lbl">Stock Source [F6] :</label>
                            <div>
                                <input type="text" id="jw-sh-source-input" value="Fresh Godown Stock" readonly class="jw-inp" style="display:none; cursor:pointer;">
                                <span id="jw-sh-source-locked" style="display:block; width:100%; padding:6px 10px; background:#fdfcf7; border:1px solid #eadab0; border-radius:4px; font-size:12.5px; font-weight:700; color:#6b7280;">Fresh Godown Stock [Locked]</span>
                            </div>
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Date :</label>
                            <input type="date" id="jw-sh-date" class="jw-inp">
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Maker (Bunne Wala) :</label>
                            <input type="text" id="jw-sh-maker-input" placeholder="1-2 letter likhein ya ↑↓ chunein..." autocomplete="off" class="jw-inp" style="border-color:#d9a425;">
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Saree Qty (Pcs) :</label>
                            <div style="display:flex; gap:8px; align-items:center; min-width:0;">
                                <div id="jw-sh-naap-container" style="display:none; width:84px; flex-shrink:0;">
                                    <input type="text" id="jw-sh-naap-input" value="3.60" placeholder="Naap" title="Embroidery Naap" class="jw-inp jw-inp-num">
                                </div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="jw-sh-qty-input" placeholder="0 Pcs" class="jw-inp jw-inp-num" style="flex:1; min-width:60px; border-color:#d9a425;">
                                <button type="button" tabindex="-1" id="jw-sh-add-row-btn" class="jw-btn-gold" style="padding:6px 12px; font-size:12px;" onclick="if(window.JobWorkEngine) JobWorkEngine.addSheetBatchRow()">+ Jodein</button>
                            </div>
                        </div>

                        <div class="jw-sec-title">2. Damage / Kaat (Optional)</div>
                        <div class="jw-row">
                            <label class="jw-lbl">Damage &amp; Fine :</label>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; min-width:0;">
                                <input type="text" inputmode="numeric" id="jw-form-damage-pcs" placeholder="Damage Pcs (0)" class="jw-inp jw-inp-num">
                                <input type="text" inputmode="decimal" id="jw-form-damage-amt" placeholder="Fine ₹ (0.00)" class="jw-inp jw-inp-num">
                            </div>
                        </div>
                    </div>

                    <!-- RIGHT: FULL-HEIGHT TALLY PICKER -->
                    <div class="jw-right-col">
                        <div class="jw-right-panel">
                            <div class="jw-right-head">
                                <span id="jw-sh-right-title">List of Makers</span>
                                <span id="jw-sh-right-hint" style="font-size:11px; color:#6b7280;">&uarr;&darr; + Enter</span>
                            </div>
                            <div id="jw-sh-right-picker" class="jw-picker-list"></div>
                        </div>
                    </div>
                </div>

                <!-- CURRENT GATTHI / BATCH LIST -->
                <div class="jw-batch-panel">
                    <div class="jw-right-head">
                        <span>Current Gatthi / Batch List</span>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span id="jw-sh-batch-count-badge" style="color:#6b7280;">0 Items</span>
                            <span>Total: <strong id="jw-sh-live-batch-total" style="color:#b47d00; font-size:13.5px;">0 Pcs</strong></span>
                        </div>
                    </div>
                    <div style="overflow-y:auto; max-height:150px;">
                        <table>
                            <thead>
                                <tr>
                                    <th style="width:45px;">#</th>
                                    <th>Maker (Bunne Wala)</th>
                                    <th>Saree Design</th>
                                    <th style="width:85px; text-align:center;">Naap</th>
                                    <th style="width:100px; text-align:right;">Qty (Pcs)</th>
                                    <th style="width:55px; text-align:center;">Del</th>
                                </tr>
                            </thead>
                            <tbody id="jw-sh-batch-body"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Tally Accept? (Yes / No) -->
                <div id="jw-sh-accept-strip" class="jw-accept-bar" style="display:none;">
                    <span style="font-size:13px; font-weight:800;">Accept? Batch Save Karein?</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="jw-sh-accept-yes-print" class="jw-btn-gold" style="padding:5px 14px;" onclick="if(window.JobWorkEngine) JobWorkEngine.saveJobWorkBatchLine(true)">Save &amp; A6 Challan [P]</button>
                        <button type="button" id="jw-sh-accept-yes" class="jw-btn-gold" style="padding:5px 14px;" onclick="if(window.JobWorkEngine) JobWorkEngine.saveJobWorkBatchLine(false)">Only Save [Y / Enter]</button>
                        <button type="button" id="jw-sh-accept-no" class="jw-btn-sec" style="padding:5px 14px;" onclick="if(window.JobWorkEngine) JobWorkEngine.cancelSheetAccept()">No [N / Esc]</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; gap:10px; flex-wrap:wrap;">
                    <span id="jw-sh-live-batch-summary" style="font-size:12px; color:#6b7280; font-weight:600;">Batch khali hai</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="jw-btn-sec" onclick="if(window.JobWorkEngine) JobWorkEngine.printLastSheetChallan()">Last A6 Challan</button>
                        <button type="button" id="jw-sh-save-btn" class="jw-btn-gold" onclick="if(window.JobWorkEngine) JobWorkEngine.saveJobWorkBatchLine(false)">Save Batch [Ctrl+Enter]</button>
                    </div>
                </div>
            </div>

            <!-- SAVED MONTHLY REGISTER TABLE -->
            <div style="font-size:12px; font-weight:800; color:#92400e; text-transform:uppercase; margin:8px 0 6px;">Monthly Khata Register (Row Click / Enter = Detail &amp; Edit)</div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Tarikh</th>
                            <th>Gayi Saree</th>
                            <th>Wapas Aayi</th>
                            <th>Damage</th>
                            <th>Fine (₹)</th>
                            <th style="text-align:right;">Detail</th>
                        </tr>
                    </thead>
                    <tbody id="jw-sheet-rows-body"></tbody>
                </table>
            </div>

            <!-- INLINE BATCH BREAKDOWN DRAWER (NO MODAL POPUP) -->
            <div id="jw-inline-batch-panel" class="jw-inline-drawer" style="display:none;"></div>
        </div>

        <!-- ================================================================
             4. DUKAN BHEJA VIEW (EXACT JOBWORK-EXPRESS BATCH VOUCHER + REGISTER)
        ================================================================ -->
        <div id="jw-dukan-view" style="display:none;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center; flex-wrap:wrap; gap:8px;">
                <button type="button" class="back-btn" onclick="showJobWorkHub()">&larr; Hub Menu [Esc]</button>
                <h3 style="color:#1f2937; margin:0; font-size:16px; font-weight:800;">Dukan Bheja (Final Out Register)</h3>
                <button type="button" class="jw-btn-sec" onclick="if(window.printDukanStatementReport) printDukanStatementReport()">[Alt+P] A6 Statement</button>
            </div>

            <div class="jw-card-grid-3">
                <div class="jw-stat-box">
                    <small>Calender Finished</small>
                    <h4 id="jw-stat-calender-finished">0 Pcs</h4>
                </div>
                <div class="jw-stat-box">
                    <small>Kul Dukan Bheji</small>
                    <h4 id="jw-stat-dukan-sent">0 Pcs</h4>
                </div>
                <div class="jw-stat-box gold">
                    <small>Karkhana Bacha</small>
                    <h4 id="jw-stat-karkhana-bacha">0 Pcs</h4>
                </div>
            </div>

            <!-- DUKAN BATCH VOUCHER (TOP SPLIT + GATTHI BATCH LIST) -->
            <div id="jw-dukan-voucher-box" class="jw-panel-card">
                <div class="jw-top-grid">
                    <!-- LEFT: 1 FIELD PER ROW -->
                    <div class="jw-left-col">
                        <div class="jw-sec-title" style="margin-top:0;">
                            <span>1. Dukan Dispatch Voucher</span>
                            <span id="jw-dukan-live-stock-hint" style="color:#b47d00; font-size:11px; text-transform:none;"></span>
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Dukan / Receiver :</label>
                            <input type="text" id="jw-dukan-receiver-input" value="Apni Main Dukan" readonly class="jw-inp" style="border-color:#d9a425; cursor:pointer;">
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Note / Party :</label>
                            <input type="text" id="jw-dukan-note" placeholder="Apni Dukan / Party naam..." class="jw-inp">
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Date :</label>
                            <input type="date" id="jw-dukan-date" class="jw-inp">
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Maker (Bunne Wala) :</label>
                            <input type="text" id="jw-dukan-maker-input" placeholder="1-2 letter likhein ya ↑↓ chunein..." autocomplete="off" class="jw-inp" style="border-color:#d9a425;">
                        </div>

                        <div class="jw-row">
                            <label class="jw-lbl">Saree Qty (Pcs) :</label>
                            <div style="display:flex; gap:8px; align-items:center; min-width:0;">
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="jw-dukan-pcs" placeholder="0 Pcs" class="jw-inp jw-inp-num" style="flex:1; border-color:#d9a425;">
                                <button type="button" tabindex="-1" id="jw-dukan-add-btn" class="jw-btn-gold" style="padding:6px 12px; font-size:12px;" onclick="if(window.DukanEngine) DukanEngine.addDukanBatchRow()">+ Jodein</button>
                            </div>
                        </div>
                    </div>

                    <!-- RIGHT: FINISHED STOCK MAKERS PICKER -->
                    <div class="jw-right-col">
                        <div class="jw-right-panel">
                            <div class="jw-right-head">
                                <span id="jw-dukan-right-title">List of Makers (FINISHED Stock)</span>
                                <span id="jw-dukan-right-hint" style="font-size:11px; color:#6b7280;">&uarr;&darr; + Enter</span>
                            </div>
                            <div id="jw-dukan-right-picker" class="jw-picker-list"></div>
                        </div>
                    </div>
                </div>

                <!-- CURRENT DUKAN GATTHI / BATCH LIST -->
                <div class="jw-batch-panel">
                    <div class="jw-right-head">
                        <span>Dukan Dispatch Batch List</span>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span id="jw-dukan-batch-count-badge" style="color:#6b7280;">0 Items</span>
                            <span>Total: <strong id="jw-dukan-live-batch-total" style="color:#b47d00; font-size:13.5px;">0 Pcs</strong></span>
                        </div>
                    </div>
                    <div style="overflow-y:auto; max-height:145px;">
                        <table>
                            <thead>
                                <tr>
                                    <th style="width:45px;">#</th>
                                    <th>Maker (Bunne Wala)</th>
                                    <th>Saree Design</th>
                                    <th style="width:100px; text-align:right;">Qty (Pcs)</th>
                                    <th style="width:55px; text-align:center;">Del</th>
                                </tr>
                            </thead>
                            <tbody id="jw-dukan-batch-body"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Tally Accept? (Yes / No) -->
                <div id="jw-dukan-accept-strip" class="jw-accept-bar" style="display:none;">
                    <span style="font-size:13px; font-weight:800;">Accept? Dukan Challan Save &amp; Print Karein?</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="jw-dukan-accept-yes-print" class="jw-btn-gold" style="padding:5px 14px;" onclick="addDukanTransferEntry(true)">Save &amp; A6 Print [P]</button>
                        <button type="button" id="jw-dukan-accept-yes" class="jw-btn-gold" style="padding:5px 14px;" onclick="addDukanTransferEntry(false)">Only Save [Y / Enter]</button>
                        <button type="button" id="jw-dukan-accept-no" class="jw-btn-sec" style="padding:5px 14px;" onclick="if(window.DukanEngine) DukanEngine.cancelDukanAccept()">No [N / Esc]</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; gap:10px; flex-wrap:wrap;">
                    <span id="jw-dukan-live-batch-summary" style="font-size:12px; color:#6b7280; font-weight:600;">Batch khali hai</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="jw-dukan-cancel-edit-btn" class="jw-btn-sec" style="display:none;" onclick="cancelDukanEdit()">Cancel Edit</button>
                        <button type="button" class="jw-btn-sec" onclick="if(window.DukanEngine) DukanEngine.printLastDukanBatch()">Last A6 Challan</button>
                        <button type="button" id="jw-dukan-save-btn" class="add-btn" onclick="addDukanTransferEntry(true)">Save &amp; A6 Challan [Ctrl+Enter]</button>
                    </div>
                </div>
            </div>

            <!-- DUKAN REGISTER FILTER & TABLE -->
            <div id="jw-dukan-filter-panel" class="filter-panel" style="background:#fdfcf7; border:1px solid #e5d5a7; padding:8px 12px; border-radius:6px;">
                <input type="date" id="jw-dukan-from-date" onchange="renderDukanTransferTable()" class="jw-inp" style="width:140px;">
                <input type="date" id="jw-dukan-to-date" onchange="renderDukanTransferTable()" class="jw-inp" style="width:140px;">
                <input type="text" id="jw-dukan-search-input" class="search-box" placeholder="Search Saree, Kariger, Receiver..." oninput="renderDukanTransferTable()">
                <button type="button" class="jw-btn-sec" onclick="resetDukanFilter()">Reset</button>
            </div>

            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Tarikh</th>
                            <th>Saree Design</th>
                            <th>Kariger (Maker)</th>
                            <th style="text-align:right;">Pcs Bheje</th>
                            <th>Note / Receiver</th>
                            <th style="text-align:right;">Open</th>
                        </tr>
                    </thead>
                    <tbody id="jw-dukan-table-body"></tbody>
                </table>
            </div>
            <div id="jw-dukan-pagination-controls" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; flex-wrap:wrap; gap:8px;"></div>

            <!-- INLINE DUKAN ENTRY DETAIL / EDIT PANEL -->
            <div id="jw-dukan-inline-detail" class="jw-inline-drawer" style="display:none;"></div>
        </div>

        <!-- ================================================================
             5. BILLS & HISAB VIEW
        ================================================================ -->
        <div id="jw-billing-view" style="display:none;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center; flex-wrap:wrap; gap:8px;">
                <button type="button" class="back-btn" onclick="showJobWorkHub()">&larr; Hub Menu [Esc]</button>
                <h3 style="color:#1f2937; margin:0; font-size:16px; font-weight:800;">Job Work Bills &amp; Hisab</h3>
                <button type="button" class="add-btn" onclick="toggleAddJwBillForm()">+ Naya Bill [Alt+N]</button>
            </div>

            <div class="jw-card-grid-3">
                <div class="jw-stat-box">
                    <small>Kul Bill Amount</small>
                    <h4 id="jw-bill-stat-total">₹ 0.00</h4>
                </div>
                <div class="jw-stat-box">
                    <small>Kul Paid</small>
                    <h4 id="jw-bill-stat-paid">₹ 0.00</h4>
                </div>
                <div class="jw-stat-box gold">
                    <small>Dena Baki</small>
                    <h4 id="jw-bill-stat-pending">₹ 0.00</h4>
                </div>
            </div>

            <div class="sheet-tabs-bar">
                <button type="button" class="sheet-tab active" id="btn-jw-bill-pending" onclick="switchJwBillTab('pending')">Baki Bills</button>
                <button type="button" class="sheet-tab" id="btn-jw-bill-paid" onclick="switchJwBillTab('paid')">Paid / Clear Bills</button>
            </div>

            <div class="filter-panel">
                <input type="text" id="jw-search-bill-input" class="search-box" placeholder="Search Worker, Bill No, Tarikh...">
            </div>

            <!-- Inline 2-Col Naya Bill Form with Right-Side Worker Picker -->
            <div id="add-jw-bill-form" class="jw-panel-card" style="display:none;">
                <div class="jw-top-grid">
                    <div class="jw-left-col">
                        <div class="jw-sec-title" style="margin-top:0;">Naya Bill Entry</div>
                        <div class="jw-row"><label class="jw-lbl">Tarikh :</label><input type="date" id="jw-bill-input-date" class="jw-inp"></div>
                        <div class="jw-row">
                            <label class="jw-lbl">Job Worker :</label>
                            <div>
                                <input type="text" id="jw-bill-input-worker-text" class="jw-inp" placeholder="Worker naam likhein ya ↑↓ chunein..." autocomplete="off" style="border-color:#d9a425;">
                                <select id="jw-bill-input-worker" style="display:none;"></select>
                            </div>
                        </div>
                        <div class="jw-row"><label class="jw-lbl">Bill No. :</label><input type="text" id="jw-bill-input-no" class="jw-inp" placeholder="jaise: 101"></div>
                        <div class="jw-row"><label class="jw-lbl">Saree Pcs :</label><input type="text" inputmode="numeric" id="jw-bill-input-pcs" class="jw-inp jw-inp-num" placeholder="0"></div>
                        <div class="jw-row"><label class="jw-lbl">Total Amount (₹) :</label><input type="text" inputmode="decimal" id="jw-bill-input-amt" class="jw-inp jw-inp-num" placeholder="0.00"></div>
                        <div class="jw-row"><label class="jw-lbl">Note :</label><input type="text" id="jw-bill-input-note" class="jw-inp" placeholder="Bill detail..."></div>
                    </div>
                    <div class="jw-right-col">
                        <div class="jw-right-panel">
                            <div class="jw-right-head">
                                <span>List of Job Workers</span>
                                <span style="font-size:11px; color:#6b7280;">&uarr;&darr; + Enter</span>
                            </div>
                            <div id="jw-bill-worker-picker" class="jw-picker-list"></div>
                        </div>
                    </div>
                </div>

                <div id="jw-bill-accept-bar" class="jw-accept-bar" style="display:none;">
                    <span style="font-size:12.5px; font-weight:800;">Accept? Bill Save Karein?</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="jw-bill-accept-yes" class="jw-btn-gold" style="padding:5px 14px;" onclick="saveJobWorkNewBill()">Yes [Y / Enter]</button>
                        <button type="button" id="jw-bill-accept-no" class="jw-btn-sec" style="padding:5px 14px;" onclick="toggleAddJwBillForm()">No [N / Esc]</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                    <button type="button" class="jw-btn-sec" onclick="toggleAddJwBillForm()">Cancel [Esc]</button>
                    <button type="button" class="jw-btn-gold" onclick="saveJobWorkNewBill()">Save Bill</button>
                </div>
            </div>

            <div class="table-responsive">
                <table>
                    <thead id="jw-bills-table-thead"></thead>
                    <tbody id="jw-bills-table-tbody"></tbody>
                </table>
            </div>

            <!-- INLINE BILL LEDGER & PAYMENT DRAWER -->
            <div id="jw-bill-inline-ledger" class="jw-inline-drawer" style="display:none;"></div>
        </div>

        <!-- ================================================================
             6. TRACKING DAY-BOOK VIEW
        ================================================================ -->
        <div id="jw-movement-view" style="display:none;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center; flex-wrap:wrap; gap:8px;">
                <button type="button" class="back-btn" onclick="showJobWorkHub()">&larr; Hub Menu [Esc]</button>
                <h3 style="color:#1f2937; margin:0; font-size:16px; font-weight:800;">Job Work Tracking Day-Book</h3>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="date" id="jw-mov-date" onchange="renderJwMovementDaybook()" class="jw-inp" style="width:145px;">
                    <button type="button" class="jw-btn-gold" onclick="setJwMovementToday()">Aaj</button>
                    <button type="button" class="jw-btn-sec" onclick="if(window.JobWorkEngine) JobWorkEngine.printJwMovementDaybook()">[Alt+P] Print</button>
                </div>
            </div>

            <div class="daybook-btn-grid" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                <button type="button" class="daybook-tab-btn active" id="btn-jw-mov-cutting" onclick="switchJwMovementTab('cutting')">
                    <div class="day-title">1. Cutting</div><div class="day-sub" id="sub-jw-mov-cutting">-</div>
                </button>
                <button type="button" class="daybook-tab-btn" id="btn-jw-mov-embroidery" onclick="switchJwMovementTab('embroidery')">
                    <div class="day-title">2. Embroidery</div><div class="day-sub" id="sub-jw-mov-embroidery">-</div>
                </button>
                <button type="button" class="daybook-tab-btn" id="btn-jw-mov-calender" onclick="switchJwMovementTab('calender')">
                    <div class="day-title">3. Calender</div><div class="day-sub" id="sub-jw-mov-calender">-</div>
                </button>
                <button type="button" class="daybook-tab-btn" id="btn-jw-mov-payment" onclick="switchJwMovementTab('payment')">
                    <div class="day-title">4. Payment</div><div class="day-sub" id="sub-jw-mov-payment">-</div>
                </button>
            </div>

            <div class="filter-panel">
                <input type="text" id="jw-mov-search" class="search-box" placeholder="Search Worker, Sheet, Bill No...">
            </div>

            <div class="table-responsive">
                <table>
                    <thead id="jw-mov-table-thead"></thead>
                    <tbody id="jw-mov-table-tbody"></tbody>
                    <tfoot id="jw-mov-table-tfoot"></tfoot>
                </table>
            </div>
        </div>
    `;

    const MODALS_HTML = `
        <!-- LIGHTWEIGHT FALLBACK MODALS (PURE WHITE & GOLD) -->
        <div id="jw-batch-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true">
            <div class="modal-card" style="max-width:560px; background:#ffffff; border:1.5px solid #d9b86c; border-radius:8px; overflow:hidden;">
                <div class="modal-header" style="background:#fdf6e2; border-bottom:1px solid #e5d5a7; padding:10px 16px;">
                    <div>
                        <h3 id="jw-batch-modal-title" style="margin:0; font-size:15px; font-weight:800; color:#1f2937;">Batch Breakdown</h3>
                        <small id="jw-batch-modal-subtitle" style="color:#92400e; font-weight:700;"></small>
                    </div>
                    <button type="button" class="close-modal-btn" onclick="closeJwBatchModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding:14px 16px;">
                    <div class="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th><th>Kariger</th><th>Qty</th><th style="text-align:center;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="jw-batch-modal-tbody"></tbody>
                            <tfoot id="jw-batch-modal-tfoot"></tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div id="jw-pay-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true">
            <div class="modal-card" style="max-width:440px; background:#ffffff; border:1.5px solid #d9b86c; border-radius:8px; overflow:hidden;">
                <div class="modal-header" style="background:#fdf6e2; border-bottom:1px solid #e5d5a7; padding:10px 16px;">
                    <div>
                        <h3 style="margin:0; font-size:15px; font-weight:800; color:#1f2937;">Bill Payment</h3>
                        <small id="jw-pay-modal-worker-text" style="color:#92400e; font-weight:700;"></small>
                    </div>
                    <button type="button" class="close-modal-btn" onclick="closeJwPayModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding:14px 16px;">
                    <input type="hidden" id="jw-pay-bill-id">
                    <div id="jw-pay-modal-baki-text" style="background:#fdf6e2; border:1px solid #e5d5a7; color:#b47d00; font-weight:800; padding:8px 12px; border-radius:5px; margin-bottom:12px;"></div>
                    <div style="margin-bottom:8px;"><label style="font-size:12px; font-weight:700; display:block; margin-bottom:3px;">Tarikh</label><input type="date" id="jw-pay-date" class="jw-inp"></div>
                    <div style="margin-bottom:8px;"><label style="font-size:12px; font-weight:700; display:block; margin-bottom:3px;">Payment Amount (₹)</label><input type="text" inputmode="decimal" id="jw-pay-amount" class="jw-inp"></div>
                    <div style="margin-bottom:8px;">
                        <label style="font-size:12px; font-weight:700; display:block; margin-bottom:3px;">Mode</label>
                        <select id="jw-pay-mode" class="jw-inp">
                            <option value="Cash">Cash</option>
                            <option value="UPI / Online">UPI / Online</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div style="margin-bottom:12px;"><label style="font-size:12px; font-weight:700; display:block; margin-bottom:3px;">Note</label><input type="text" id="jw-pay-note" class="jw-inp"></div>
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" class="jw-btn-sec" onclick="closeJwPayModal()">Cancel</button>
                        <button type="button" class="jw-btn-gold" onclick="saveJobWorkPayment()">Save Payment</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const initJobWorkFormsUI = () => {
        injectStyles();
        const sec = document.getElementById('jobwork-section');
        if (sec) {
            sec.innerHTML = JOBWORK_SECTION_HTML;
        }
        if (!document.getElementById('jw-batch-modal')) {
            document.body.insertAdjacentHTML('beforeend', MODALS_HTML);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJobWorkFormsUI);
    } else {
        initJobWorkFormsUI();
    }
})();
