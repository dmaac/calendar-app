// ── Fitsi IA — Agent Dashboard v2 ──────────────────────────────────────
(function () {
    "use strict";

    // ── State ──────────────────────────────────────────
    let agents = [], events = [], activeTasks = [], allTasks = [];
    let stats = {};
    let currentView = "overview";
    let galaxyLoaded = false;
    let ws, _statsTimer;

    // Matrix state
    let mxSort = { col: "display_name", dir: "asc" };
    let mxSearch = "";
    let mxPage = 0;
    const MX_PER_PAGE = 60;

    // Timeline state
    let tlFilter = "all";

    // Hierarchy state
    let hiSearch = "";

    // ASCII state
    let _asciiBuilt = false;
    const _asciiMap = {};
    const _asciiPrevStates = {};
    let _asciiTip = null;

    // ── Agent States ──────────────────────────────────
    const STATE = {
        idle:       { color: null,      label: "IDLE" },
        spawning:   { color: "#f59e0b", label: "SPAWNING" },
        active:     { color: "#22c55e", label: "ACTIVE" },
        thinking:   { color: "#8b5cf6", label: "THINKING" },
        delegating: { color: "#f97316", label: "DELEGATING" },
        reviewing:  { color: "#06b6d4", label: "REVIEWING" },
        waiting:    { color: "#eab308", label: "WAITING" },
        completed:  { color: "#6366f1", label: "DONE" },
        error:      { color: "#ef4444", label: "ERROR" },
    };

    function isWorking(s) {
        return ["spawning", "active", "thinking", "delegating", "reviewing", "waiting"].includes(s);
    }

    function stateColor(s) { return STATE[s]?.color || null; }

    // ── Utilities ─────────────────────────────────────
    function esc(s) {
        if (!s) return "";
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    function fmtNum(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
        return String(n || 0);
    }

    function fmtTime(ts) {
        if (!ts) return "";
        return new Date(ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    // ── Clock ─────────────────────────────────────────
    setInterval(() => {
        const el = document.getElementById("clock");
        if (el) el.textContent = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }, 1000);

    // ── Init ──────────────────────────────────────────
    async function init() {
        try {
            const [a, e, t, h, s] = await Promise.all([
                fetch("/api/agents").then(r => r.ok ? r.json() : []),
                fetch("/api/events?limit=100").then(r => r.ok ? r.json() : []),
                fetch("/api/tasks/active").then(r => r.ok ? r.json() : []),
                fetch("/api/tasks/history?limit=50").then(r => r.ok ? r.json() : []),
                fetch("/api/stats").then(r => r.ok ? r.json() : {}),
            ]);
            agents = a;
            events = e;
            activeTasks = t;
            allTasks = h;
            stats = s;
        } catch (err) { console.warn("Init fetch failed:", err); }

        updateMetrics();
        renderCurrentView();
        connectWS();
        bindViewNav();
        bindMatrixSort();
        bindMatrixSearch();
        bindTimelineFilters();
        bindHierarchyControls();
        bindKeyboard();
    }

    // ── WebSocket ─────────────────────────────────────
    let _eventBatch = [], _batchTimer = null;

    function connectWS() {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${location.host}/ws`);

        ws.onopen = () => {
            document.getElementById("conn-dot").className = "conn-dot live";
            document.getElementById("conn-text").textContent = "Live";
        };

        ws.onclose = () => {
            document.getElementById("conn-dot").className = "conn-dot offline";
            document.getElementById("conn-text").textContent = "Offline";
            if (!ws._rd) ws._rd = 1000;
            setTimeout(() => { ws._rd = Math.min(ws._rd * 1.5, 30000); connectWS(); }, ws._rd);
        };

        ws.onmessage = (msg) => {
            let data;
            try { data = JSON.parse(msg.data); } catch (e) { return; }

            if (data.type === "agent_event") {
                _eventBatch.push(data);
                scheduleBatch();
            } else if (data.type === "event_batch") {
                for (const evt of (data.events || [])) {
                    if (evt.type === "agent_event") _eventBatch.push(evt);
                }
                scheduleBatch();
            } else if (data.type === "task_created" || data.type === "task_completed") {
                refreshTasks();
            }
        };
    }

    function scheduleBatch() {
        if (!_batchTimer) {
            _batchTimer = setTimeout(() => {
                processBatch();
                _batchTimer = null;
            }, 500);
        }
    }

    function processBatch() {
        if (!_eventBatch.length) return;
        const batch = _eventBatch.splice(0);

        const agentMap = {};
        agents.forEach((a, i) => { agentMap[a.name] = i; });

        for (const data of batch) {
            if (data.event) {
                const idx = agentMap[data.event.agent_name];
                if (idx !== undefined && data.agent) agents[idx] = data.agent;
                events.unshift(data.event);
            }
        }
        if (events.length > 500) events.length = 500;

        debouncedUpdateMetrics();
        renderCurrentView();
    }

    async function refreshTasks() {
        try {
            const [a, t, h] = await Promise.all([
                fetch("/api/agents").then(r => r.json()),
                fetch("/api/tasks/active").then(r => r.json()),
                fetch("/api/tasks/history?limit=50").then(r => r.json()),
            ]);
            agents = a;
            activeTasks = t;
            allTasks = h;
            debouncedUpdateMetrics();
            renderCurrentView();
        } catch (e) { /* silent */ }
    }

    // ── Metrics ───────────────────────────────────────
    function debouncedUpdateMetrics() {
        clearTimeout(_statsTimer);
        _statsTimer = setTimeout(async () => {
            try { stats = await fetch("/api/stats").then(r => r.json()); } catch (e) {}
            updateMetrics();
        }, 300);
    }

    function updateMetrics() {
        const activeCount = agents.filter(a => isWorking(a.status)).length;
        const teamCount = new Set(agents.map(a => a.team)).size;

        document.getElementById("m-total").textContent = agents.length || stats.total_agents || 0;
        document.getElementById("m-active").textContent = activeCount || stats.active_agents || 0;
        document.getElementById("m-events").textContent = fmtNum(stats.total_events || events.length);
        document.getElementById("m-tokens").textContent = fmtNum(stats.total_tokens || 0);
        document.getElementById("m-tasks").textContent = activeTasks.length;

        const el = document.getElementById("m-active");
        el.style.color = activeCount > 0 ? "var(--green)" : "var(--accent)";
    }

    // ── View Navigation ───────────────────────────────
    function bindViewNav() {
        document.querySelectorAll(".view-btn").forEach(btn => {
            btn.onclick = () => switchView(btn.dataset.view);
        });
    }

    function switchView(viewId) {
        currentView = viewId;

        document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
        document.querySelector(`.view-btn[data-view="${viewId}"]`)?.classList.add("active");

        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        document.getElementById(`view-${viewId}`)?.classList.add("active");

        // ASCII polling
        if (viewId === "ascii") startAsciiPolling();
        else stopAsciiPolling();

        // Lazy-load galaxy iframe
        if (viewId === "galaxy" && !galaxyLoaded) {
            const frame = document.getElementById("galaxy-frame");
            frame.src = "/v1";
            frame.onload = () => {
                frame.classList.add("loaded");
                document.getElementById("galaxy-placeholder").classList.add("hidden");
            };
            galaxyLoaded = true;
        }

        renderCurrentView();
    }

    function renderCurrentView() {
        switch (currentView) {
            case "overview": renderOverview(); break;
            case "ascii": renderAscii(); break;
            case "matrix": renderMatrix(); break;
            case "hierarchy": renderHierarchy(); break;
            case "timeline": renderTimeline(); break;
        }
    }

    // ── Keyboard ──────────────────────────────────────
    function bindKeyboard() {
        document.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            const views = ["overview", "ascii", "galaxy", "matrix", "hierarchy", "timeline"];
            if (e.key >= "1" && e.key <= "6") {
                e.preventDefault();
                switchView(views[parseInt(e.key) - 1]);
            }
        });
    }

    // ══════════════════════════════════════════════════
    // OVERVIEW
    // ══════════════════════════════════════════════════
    function renderOverview() {
        renderStatCards();
        renderTeamBars();
        renderTopAgents();
        renderFeed();
    }

    function renderStatCards() {
        const activeCount = agents.filter(a => isWorking(a.status)).length;
        const teamCount = new Set(agents.map(a => a.team)).size;
        const errorCount = agents.filter(a => a.status === "error").length;
        const totalTokens = agents.reduce((s, a) => s + (a.total_tokens || 0), 0);

        const cards = [
            { val: agents.length, lbl: "Total Agents", color: "var(--text)", sub: teamCount + " teams" },
            { val: activeCount, lbl: "Active Now", color: "var(--green)", sub: errorCount ? errorCount + " errors" : "all healthy" },
            { val: fmtNum(stats.total_events || 0), lbl: "Total Events", color: "var(--accent)", sub: events.length + " recent" },
            { val: fmtNum(totalTokens), lbl: "Tokens Used", color: "var(--purple)", sub: "" },
            { val: activeTasks.length, lbl: "Active Tasks", color: "var(--cyan)", sub: allTasks.length + " total" },
            { val: teamCount, lbl: "Teams", color: "var(--orange)", sub: "" },
        ];

        document.getElementById("ov-cards").innerHTML = cards.map(c =>
            `<div class="ov-card">
                <div class="ov-card-val" style="color:${c.color}">${c.val}</div>
                <div class="ov-card-lbl">${c.lbl}</div>
                ${c.sub ? `<div class="ov-card-sub">${c.sub}</div>` : ""}
            </div>`
        ).join("");
    }

    // Team color palette
    const TEAM_COLORS = [
        "#6366f1","#22c55e","#f97316","#8b5cf6","#06b6d4","#ec4899",
        "#eab308","#ef4444","#14b8a6","#f43f5e","#a855f7","#84cc16",
        "#0ea5e9","#d946ef","#f59e0b","#10b981","#e11d48","#7c3aed",
        "#059669","#dc2626","#2563eb","#c026d3","#65a30d","#0891b2"
    ];
    const _teamColorMap = {};
    let _tci = 0;
    function teamColor(team) {
        if (!_teamColorMap[team]) {
            _teamColorMap[team] = TEAM_COLORS[_tci % TEAM_COLORS.length];
            _tci++;
        }
        return _teamColorMap[team];
    }

    function renderTeamBars() {
        const teams = {};
        agents.forEach(a => { teams[a.team] = (teams[a.team] || 0) + 1; });
        const sorted = Object.entries(teams).sort((a, b) => b[1] - a[1]);
        const max = sorted[0]?.[1] || 1;

        document.getElementById("team-count").textContent = sorted.length + " teams";
        document.getElementById("team-bars").innerHTML = sorted.map(([name, count]) => {
            const pct = (count / max * 100).toFixed(1);
            const color = teamColor(name);
            return `<div class="team-bar">
                <span class="team-bar-name" title="${esc(name)}">${esc(name)}</span>
                <div class="team-bar-track">
                    <div class="team-bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
                <span class="team-bar-num">${count}</span>
            </div>`;
        }).join("");
    }

    function renderTopAgents() {
        const sorted = [...agents]
            .sort((a, b) => (b.total_invocations || 0) - (a.total_invocations || 0))
            .slice(0, 20);

        document.getElementById("top-agents").innerHTML = sorted.map((a, i) => {
            const sc = stateColor(a.status);
            const dotColor = sc || a.color || "#6366f1";
            return `<div class="top-agent">
                <span class="top-rank">${i + 1}</span>
                <span class="top-dot" style="background:${dotColor}"></span>
                <span class="top-name">${esc(a.display_name)}</span>
                <span class="top-team">${esc(a.team)}</span>
                <span class="top-inv">${a.total_invocations || 0}</span>
            </div>`;
        }).join("");
    }

    function renderFeed() {
        const recent = events.slice(0, 30);
        document.getElementById("feed-count").textContent = events.length;

        document.getElementById("feed-list").innerHTML = recent.length
            ? recent.map(e => {
                const st = STATE[e.event_type] || STATE.active;
                const color = st.color || "var(--accent)";
                const detail = e.detail ? (e.detail.length > 100 ? e.detail.slice(0, 100) + "..." : e.detail) : "";
                return `<div class="feed-row" style="border-left-color:${color}">
                    <span class="feed-time">${fmtTime(e.timestamp)}</span>
                    <span class="feed-agent" style="color:${color}">${esc(e.agent_name)}</span>
                    <span class="feed-badge" style="color:${color};background:${color}15">${st.label}</span>
                    ${detail ? `<span class="feed-detail">${esc(detail)}</span>` : ""}
                </div>`;
            }).join("")
            : '<div class="empty">No events yet</div>';
    }

    // ══════════════════════════════════════════════════
    // MATRIX
    // ══════════════════════════════════════════════════
    function bindMatrixSort() {
        document.querySelectorAll(".mx-th.sortable").forEach(th => {
            th.onclick = () => {
                const col = th.dataset.col;
                if (mxSort.col === col) {
                    mxSort.dir = mxSort.dir === "asc" ? "desc" : "asc";
                } else {
                    mxSort.col = col;
                    mxSort.dir = "asc";
                }
                document.querySelectorAll(".mx-th").forEach(t => t.classList.remove("sorted-asc", "sorted-desc"));
                th.classList.add(mxSort.dir === "asc" ? "sorted-asc" : "sorted-desc");
                mxPage = 0;
                renderMatrix();
            };
        });
    }

    function bindMatrixSearch() {
        const el = document.getElementById("mx-search");
        if (!el) return;
        el.oninput = () => {
            mxSearch = el.value.toLowerCase().trim();
            mxPage = 0;
            renderMatrix();
        };
    }

    function renderMatrix() {
        let filtered = [...agents];

        if (mxSearch) {
            filtered = filtered.filter(a =>
                a.display_name.toLowerCase().includes(mxSearch) ||
                a.name.includes(mxSearch) ||
                a.team.toLowerCase().includes(mxSearch) ||
                a.category.toLowerCase().includes(mxSearch)
            );
        }

        // Sort
        filtered.sort((a, b) => {
            let va = a[mxSort.col], vb = b[mxSort.col];
            if (mxSort.col === "status") {
                va = isWorking(a.status) ? 1 : a.status === "error" ? 2 : 0;
                vb = isWorking(b.status) ? 1 : b.status === "error" ? 2 : 0;
            }
            if (typeof va === "number" && typeof vb === "number") {
                return mxSort.dir === "asc" ? va - vb : vb - va;
            }
            va = String(va || "").toLowerCase();
            vb = String(vb || "").toLowerCase();
            return mxSort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        });

        const total = filtered.length;
        const totalPages = Math.ceil(total / MX_PER_PAGE);
        if (mxPage >= totalPages) mxPage = Math.max(0, totalPages - 1);
        const start = mxPage * MX_PER_PAGE;
        const page = filtered.slice(start, start + MX_PER_PAGE);

        document.getElementById("mx-info").textContent = `${start + 1}-${Math.min(start + MX_PER_PAGE, total)} of ${total}`;

        document.getElementById("mx-body").innerHTML = page.map(a => {
            const st = STATE[a.status] || STATE.idle;
            const working = isWorking(a.status);
            const dotColor = working ? (st.color || "#22c55e") : (a.status === "error" ? "#ef4444" : a.color || "#6366f1");
            return `<tr>
                <td>
                    <span class="mx-status">
                        <span class="mx-dot ${working ? 'pulse' : ''}" style="background:${dotColor};color:${dotColor}"></span>
                        <span class="mx-status-text" style="color:${st.color || 'var(--text3)'}">${st.label}</span>
                    </span>
                </td>
                <td><span class="mx-agent-name">${esc(a.display_name)}</span></td>
                <td><span class="mx-team-badge">${esc(a.team)}</span></td>
                <td><span class="mx-cat-badge">${esc(a.category)}</span></td>
                <td class="num">${fmtNum(a.total_invocations || 0)}</td>
                <td class="num">${fmtNum(a.total_tokens || 0)}</td>
                <td style="font-size:10px;color:var(--text3)">${a.last_active ? fmtTime(a.last_active) : "--"}</td>
            </tr>`;
        }).join("");

        // Pagination
        let pagerHtml = "";
        if (totalPages > 1) {
            pagerHtml += `<button class="mx-page-btn" onclick="window._mxPage(0)" ${mxPage === 0 ? 'disabled' : ''}>&laquo;</button>`;
            pagerHtml += `<button class="mx-page-btn" onclick="window._mxPage(${mxPage - 1})" ${mxPage === 0 ? 'disabled' : ''}>&lsaquo;</button>`;

            const start = Math.max(0, mxPage - 3);
            const end = Math.min(totalPages, start + 7);
            for (let i = start; i < end; i++) {
                pagerHtml += `<button class="mx-page-btn ${i === mxPage ? 'active' : ''}" onclick="window._mxPage(${i})">${i + 1}</button>`;
            }

            pagerHtml += `<button class="mx-page-btn" onclick="window._mxPage(${mxPage + 1})" ${mxPage >= totalPages - 1 ? 'disabled' : ''}>&rsaquo;</button>`;
            pagerHtml += `<button class="mx-page-btn" onclick="window._mxPage(${totalPages - 1})" ${mxPage >= totalPages - 1 ? 'disabled' : ''}>&raquo;</button>`;
        }
        document.getElementById("mx-pager").innerHTML = pagerHtml;
    }

    window._mxPage = function (p) {
        mxPage = Math.max(0, p);
        renderMatrix();
    };

    // ══════════════════════════════════════════════════
    // HIERARCHY
    // ══════════════════════════════════════════════════
    const LEVEL_ORDER = [
        "Supreme Orchestrator",
        "Control Demons",
        "Board of Directors",
        "C-Suite",
        "Vice Presidents",
        "Coordinators",
        "Directors",
        "Tech Leads",
        "Eng Managers",
    ];

    const LEVEL_TAGS = {
        "Supreme Orchestrator": "L0",
        "Control Demons": "L1",
        "Board of Directors": "L2",
        "C-Suite": "L3",
        "Vice Presidents": "L4",
        "Coordinators": "L5",
        "Directors": "L6",
        "Tech Leads": "L7",
        "Eng Managers": "L7",
    };

    const LEVEL_COLORS = {
        "Supreme Orchestrator": "#fbbf24",
        "Control Demons": "#ef4444",
        "Board of Directors": "#8b5cf6",
        "C-Suite": "#ec4899",
        "Vice Presidents": "#f97316",
        "Coordinators": "#06b6d4",
        "Directors": "#22c55e",
        "Tech Leads": "#6366f1",
        "Eng Managers": "#a855f7",
    };

    function bindHierarchyControls() {
        const searchEl = document.getElementById("hi-search");
        if (searchEl) {
            searchEl.oninput = () => {
                hiSearch = searchEl.value.toLowerCase().trim();
                renderHierarchy();
            };
        }
        document.getElementById("hi-expand-all")?.addEventListener("click", () => {
            document.querySelectorAll(".hi-level").forEach(el => el.classList.remove("collapsed"));
        });
        document.getElementById("hi-collapse-all")?.addEventListener("click", () => {
            document.querySelectorAll(".hi-level").forEach(el => el.classList.add("collapsed"));
        });
    }

    function renderHierarchy() {
        const byTeam = {};
        agents.forEach(a => {
            if (!byTeam[a.team]) byTeam[a.team] = [];
            byTeam[a.team].push(a);
        });

        // Sort teams: known levels first, then alphabetical
        const teamNames = Object.keys(byTeam);
        const knownOrder = LEVEL_ORDER.filter(t => byTeam[t]);
        const unknown = teamNames.filter(t => !LEVEL_ORDER.includes(t)).sort();

        const orderedTeams = [...knownOrder, ...unknown];

        let html = "";
        for (const team of orderedTeams) {
            let members = byTeam[team];
            const tag = LEVEL_TAGS[team] || "L8+";
            const color = LEVEL_COLORS[team] || teamColor(team);

            if (hiSearch) {
                members = members.filter(a =>
                    a.display_name.toLowerCase().includes(hiSearch) ||
                    a.name.includes(hiSearch)
                );
                if (!members.length && !team.toLowerCase().includes(hiSearch)) continue;
            }

            members.sort((a, b) => a.display_name.localeCompare(b.display_name));

            const isLeadership = LEVEL_ORDER.includes(team);
            const collapsed = !isLeadership && !hiSearch ? "collapsed" : "";

            html += `<div class="hi-level ${collapsed}">
                <div class="hi-level-head" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="hi-arrow">&#9660;</span>
                    <span class="hi-level-name">${esc(team)}</span>
                    <span class="hi-level-tag" style="color:${color};background:${color}15">${tag}</span>
                    <span class="hi-level-count">${members.length}</span>
                </div>
                <div class="hi-members" style="max-height:${members.length * 30 + 10}px">
                    ${members.map(a => {
                        const sc = stateColor(a.status);
                        const dotColor = sc || a.color || "#6366f1";
                        return `<div class="hi-agent">
                            <span class="hi-agent-dot" style="background:${dotColor}"></span>
                            <span class="hi-agent-name">${esc(a.display_name)}</span>
                            <span class="hi-agent-cat">${esc(a.category)}</span>
                            <span class="hi-agent-inv">${a.total_invocations || 0}</span>
                        </div>`;
                    }).join("")}
                </div>
            </div>`;
        }

        document.getElementById("hi-tree").innerHTML = html || '<div class="empty">No agents found</div>';
    }

    // ══════════════════════════════════════════════════
    // TIMELINE
    // ══════════════════════════════════════════════════
    function bindTimelineFilters() {
        document.querySelectorAll(".tl-filter").forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll(".tl-filter").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                tlFilter = btn.dataset.type;
                renderTimeline();
            };
        });
    }

    function renderTimeline() {
        let filtered = events;
        if (tlFilter !== "all") {
            filtered = events.filter(e => e.event_type === tlFilter);
        }

        const display = filtered.slice(0, 100);

        document.getElementById("tl-list").innerHTML = display.length
            ? display.map(e => {
                const st = STATE[e.event_type] || STATE.active;
                const color = st.color || "var(--accent)";
                const detail = e.detail ? (e.detail.length > 120 ? e.detail.slice(0, 120) + "..." : e.detail) : "";
                return `<div class="tl-row" style="border-left-color:${color}">
                    <span class="tl-time">${fmtTime(e.timestamp)}</span>
                    <span class="tl-agent" style="color:${color}">${esc(e.agent_name)}</span>
                    <span class="tl-badge" style="color:${color};background:${color}15">${st.label}</span>
                    <span class="tl-detail">${esc(detail)}</span>
                </div>`;
            }).join("")
            : '<div class="empty">No events match this filter</div>';
    }

    // ══════════════════════════════════════════════════
    // ASCII ART — Evolution-aware agent visualization
    // ══════════════════════════════════════════════════

    // Maturity → Symbol mapping (evolutionary journey)
    const MAT_CHAR = {
        embryo:     '.',       // barely visible seed
        infant:     '\u2591',  // ░ light shade — just born
        child:      '\u2592',  // ▒ medium shade — growing
        adolescent: '\u2593',  // ▓ dark shade — forming
        adult:      '\u2588',  // █ full block — mature
        elder:      '\u2588',  // █ full block
        master:     '\u2605',  // ★ star — mastery
        sage:       '\u2605',  // ★ star — wisdom
    };

    // Idle color by maturity (evolutionary gradient)
    const MAT_IDLE_COLOR = {
        embryo:     '#0c0c18',
        infant:     '#161630',
        child:      '#1e2848',
        adolescent: '#2a3460',
        adult:      '#384878',
        elder:      '#485a88',
        master:     '#6a5a30',
        sage:       '#7a6a20',
    };

    // Maturity bar character for team stats
    const MAT_LABEL = {
        embryo: 'E', infant: 'I', child: 'C', adolescent: 'A',
        adult: 'M', elder: 'L', master: 'X', sage: 'S',
    };

    const ASCII_LEVEL_ORDER = [
        "Supreme Orchestrator", "Control Demons", "Board of Directors",
        "C-Suite", "Vice Presidents", "Coordinators", "Directors",
        "Tech Leads", "Eng Managers",
    ];

    const ASCII_LEVEL_COLORS = {
        "Supreme Orchestrator": "#fbbf24", "Control Demons": "#ef4444",
        "Board of Directors": "#8b5cf6", "C-Suite": "#ec4899",
        "Vice Presidents": "#f97316", "Coordinators": "#06b6d4",
        "Directors": "#22c55e", "Tech Leads": "#6366f1", "Eng Managers": "#a855f7",
    };

    // DNA cache — merged once, then status polled
    let _dnaCache = {};
    let _asciiPollTimer = null;
    let _lastAgentCount = 0;
    let _enrichedLoaded = false;

    function startAsciiPolling() {
        if (_asciiPollTimer) return;
        pollAsciiNow();
        _asciiPollTimer = setInterval(pollAsciiNow, 2000);
    }

    function stopAsciiPolling() {
        if (_asciiPollTimer) { clearInterval(_asciiPollTimer); _asciiPollTimer = null; }
    }

    async function loadEnrichedData() {
        try {
            const enriched = await fetch("/api/agents/enriched").then(r => r.json());
            agents = enriched;
            _dnaCache = {};
            for (const a of enriched) {
                _dnaCache[a.name] = {
                    maturity_level: a.maturity_level || 'embryo',
                    fitness_score: a.fitness_score || 0.5,
                    wisdom_score: a.wisdom_score || 0,
                    experience_years: a.experience_years || 0,
                    autonomy_level: a.autonomy_level || 0.1,
                    generation: a.generation || 1,
                    knowledge_depth: a.knowledge_depth || 0.1,
                    specialization_depth: a.specialization_depth || 0.5,
                    creativity_score: a.creativity_score || 0.5,
                    emotional_intelligence: a.emotional_intelligence || 0.1,
                    coupling_score: a.coupling_score || 0.1,
                    resilience: a.resilience || 0.1,
                };
            }
            _enrichedLoaded = true;
            _lastAgentCount = agents.length;
            _asciiBuilt = false;
        } catch (e) { console.warn("enriched fetch failed", e); }
    }

    async function pollAsciiNow() {
        try {
            if (!_enrichedLoaded) {
                await loadEnrichedData();
            } else {
                const fresh = await fetch("/api/agents").then(r => r.json());
                // Merge DNA cache into fresh data
                agents = fresh.map(a => {
                    const dna = _dnaCache[a.name];
                    return dna ? { ...a, ...dna } : a;
                });
                if (agents.length !== _lastAgentCount) {
                    await loadEnrichedData();
                }
            }
            renderAscii();
            updateMetrics();
        } catch (e) { /* silent */ }
    }

    function renderAscii() {
        if (!_asciiBuilt) {
            buildAsciiGrid();
            _asciiBuilt = true;
        }
        updateAsciiHud();
        updateAsciiStates();
    }

    function maturityStats() {
        const m = {};
        agents.forEach(a => {
            const ml = a.maturity_level || 'embryo';
            m[ml] = (m[ml] || 0) + 1;
        });
        return m;
    }

    function updateAsciiHud() {
        const el = document.getElementById("ascii-hud");
        if (!el) return;
        const activeCount = agents.filter(a => isWorking(a.status)).length;
        const errorCount = agents.filter(a => a.status === "error").length;
        const ms = maturityStats();
        const sages = ms.sage || ms.master || 0;
        const avgFit = agents.length
            ? (agents.reduce((s, a) => s + (a.fitness_score || 0), 0) / agents.length).toFixed(2)
            : '0';

        el.innerHTML =
            `<span class="ascii-hud-prompt">\u2588\u2588</span>`
            + `<span class="ascii-hud-dim">FITSI EVOLUTION MONITOR</span>`
            + `<span class="ascii-hud-sep">\u2502</span>`
            + `<span class="ascii-hud-val">${agents.length}</span><span class="ascii-hud-dim"> pop</span>`
            + `<span class="ascii-hud-sep">\u2502</span>`
            + `<span class="ascii-hud-active">${activeCount}</span><span class="ascii-hud-dim"> active</span>`
            + (errorCount ? `<span class="ascii-hud-sep">\u2502</span><span class="ascii-hud-error">${errorCount} err</span>` : '')
            + `<span class="ascii-hud-sep">\u2502</span>`
            + `<span style="color:#fbbf24">\u2605${sages}</span><span class="ascii-hud-dim"> sages</span>`
            + `<span class="ascii-hud-sep">\u2502</span>`
            + `<span class="ascii-hud-dim">fit:</span><span class="ascii-hud-val">${avgFit}</span>`
            + `<span class="ascii-hud-sep">\u2502</span>`
            + `<span class="ascii-hud-live">\u25CF LIVE</span>`;
    }

    function getAgentChar(a) {
        return MAT_CHAR[a.maturity_level] || MAT_CHAR.embryo;
    }

    function getAgentColor(a) {
        // Active state overrides idle color
        if (isWorking(a.status) || a.status === 'error') {
            return STATE[a.status]?.color || '#22c55e';
        }
        // Idle: color by maturity + fitness brightness
        const mat = a.maturity_level || 'embryo';
        if (mat === 'sage' || mat === 'master') return '#fbbf24'; // gold sages
        const base = MAT_IDLE_COLOR[mat] || '#0c0c18';
        return base;
    }

    function getAgentClasses(a) {
        const cls = ['ac'];
        const mat = a.maturity_level || 'embryo';
        cls.push('ac-' + mat);
        if (isWorking(a.status)) cls.push('ac-active');
        if (a.status === 'error') cls.push('ac-error');
        if ((mat === 'sage' || mat === 'master') && !isWorking(a.status)) cls.push('ac-sage');
        if (a.fitness_score > 0.8) cls.push('ac-elite');
        return cls.join(' ');
    }

    function buildAsciiGrid() {
        const grid = document.getElementById("ascii-grid");
        if (!grid) return;

        Object.keys(_asciiMap).forEach(k => delete _asciiMap[k]);
        Object.keys(_asciiPrevStates).forEach(k => delete _asciiPrevStates[k]);

        const byTeam = {};
        agents.forEach(a => {
            if (!byTeam[a.team]) byTeam[a.team] = [];
            byTeam[a.team].push(a);
        });

        const known = ASCII_LEVEL_ORDER.filter(t => byTeam[t]);
        const other = Object.keys(byTeam).filter(t => !ASCII_LEVEL_ORDER.includes(t))
            .sort((a, b) => (byTeam[b]?.length || 0) - (byTeam[a]?.length || 0));
        const ordered = [...known, ...other];

        const frag = document.createDocumentFragment();

        for (const team of ordered) {
            const members = byTeam[team];
            // Sort: sages first, then by maturity desc, then active first
            const matOrder = { sage: 7, master: 6, elder: 5, adult: 4, adolescent: 3, child: 2, infant: 1, embryo: 0 };
            members.sort((a, b) => {
                const ma = matOrder[a.maturity_level] || 0;
                const mb = matOrder[b.maturity_level] || 0;
                if (ma !== mb) return mb - ma;
                const wa = isWorking(a.status) ? 1 : 0;
                const wb = isWorking(b.status) ? 1 : 0;
                return wb - wa;
            });
            const color = ASCII_LEVEL_COLORS[team] || teamColor(team);
            const activeInTeam = members.filter(a => isWorking(a.status)).length;

            // Maturity breakdown for this team
            const tms = {};
            members.forEach(a => { const m = a.maturity_level || 'embryo'; tms[m] = (tms[m] || 0) + 1; });
            const matBar = ['sage','master','adult','adolescent','child','infant','embryo']
                .filter(m => tms[m])
                .map(m => `<span style="color:${MAT_IDLE_COLOR[m] === '#0c0c18' ? '#3f3f56' : (m === 'sage' || m === 'master' ? '#fbbf24' : color)}">${MAT_LABEL[m]}${tms[m]}</span>`)
                .join(' ');

            const section = document.createElement("div");
            section.className = "ascii-section";

            const head = document.createElement("div");
            head.className = "ascii-team-head";
            head.style.color = color;
            head.innerHTML =
                `<span class="ascii-team-marker">\u2590</span>`
                + `<span class="ascii-team-name">${esc(team)}</span>`
                + `<span class="ascii-team-line"></span>`
                + (activeInTeam ? `<span class="ascii-team-active">${activeInTeam}</span>` : '')
                + `<span class="ascii-team-mat">${matBar}</span>`
                + `<span class="ascii-team-count">${members.length}</span>`;
            section.appendChild(head);

            const agentsDiv = document.createElement("div");
            agentsDiv.className = "ascii-agents";

            for (const a of members) {
                const ch = getAgentChar(a);
                const charColor = getAgentColor(a);

                const span = document.createElement("span");
                span.className = getAgentClasses(a);
                span.textContent = ch;
                span.style.color = charColor;
                span.dataset.agent = a.name;

                span.addEventListener("mouseenter", (e) => showAsciiTip(e, a.name));
                span.addEventListener("mouseleave", hideAsciiTip);

                _asciiMap[a.name] = span;
                _asciiPrevStates[a.name] = a.status + '|' + (a.maturity_level || '');
                agentsDiv.appendChild(span);
            }

            section.appendChild(agentsDiv);
            frag.appendChild(section);
        }

        grid.innerHTML = "";
        grid.appendChild(frag);
    }

    function updateAsciiStates() {
        let changed = 0;
        for (const a of agents) {
            const span = _asciiMap[a.name];
            if (!span) continue;
            const key = a.status + '|' + (a.maturity_level || '');
            if (_asciiPrevStates[a.name] === key) continue;

            span.textContent = getAgentChar(a);
            span.style.color = getAgentColor(a);
            span.className = getAgentClasses(a);

            span.classList.remove("ac-flash");
            void span.offsetWidth;
            span.classList.add("ac-flash");

            _asciiPrevStates[a.name] = key;
            changed++;
        }
        return changed;
    }

    function showAsciiTip(e, agentName) {
        const a = agents.find(x => x.name === agentName);
        if (!a) return;

        if (!_asciiTip) {
            _asciiTip = document.createElement("div");
            _asciiTip.className = "ascii-tip";
            document.body.appendChild(_asciiTip);
        }

        const st = STATE[a.status] || STATE.idle;
        const color = st.color || '#52525b';
        const mat = a.maturity_level || 'embryo';
        const ch = getAgentChar(a);
        const fit = (a.fitness_score || 0).toFixed(2);
        const wis = (a.wisdom_score || 0).toFixed(2);
        const exp = (a.experience_years || 0).toFixed(0);
        const gen = a.generation || 1;
        const aut = ((a.autonomy_level || 0) * 100).toFixed(0);

        // Fitness bar
        const fitPct = Math.round((a.fitness_score || 0) * 20);
        const fitBar = '\u2588'.repeat(fitPct) + '\u2591'.repeat(20 - fitPct);

        _asciiTip.innerHTML =
            `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">`
            + `<span style="color:${getAgentColor(a)};font-size:22px">${ch}</span>`
            + `<div><strong>${esc(a.display_name)}</strong><br>`
            + `<span style="color:#3f3f56;font-size:9px">${esc(a.team)}</span></div></div>`
            + `<div style="display:grid;grid-template-columns:60px 1fr;gap:2px 8px;font-size:10px">`
            + `<span style="color:#3f3f56">STATUS</span><span style="color:${color};font-weight:700">${st.label}</span>`
            + `<span style="color:#3f3f56">MATURITY</span><span style="color:${mat === 'sage' ? '#fbbf24' : '#a1a1aa'}">${mat.toUpperCase()}</span>`
            + `<span style="color:#3f3f56">GEN</span><span>${gen}</span>`
            + `<span style="color:#3f3f56">EXP</span><span>${exp} yrs</span>`
            + `<span style="color:#3f3f56">WISDOM</span><span style="color:#fbbf24">${wis}</span>`
            + `<span style="color:#3f3f56">AUTONOMY</span><span>${aut}%</span>`
            + `<span style="color:#3f3f56">FITNESS</span><span style="color:#22c55e;font-size:8px;letter-spacing:-1px">${fitBar}</span>`
            + `</div>`;

        _asciiTip.style.left = Math.min(e.clientX + 14, window.innerWidth - 320) + "px";
        _asciiTip.style.top = Math.min(e.clientY - 10, window.innerHeight - 180) + "px";
        _asciiTip.style.opacity = "1";
    }

    function hideAsciiTip() {
        if (_asciiTip) _asciiTip.style.opacity = "0";
    }

    // ── Start ─────────────────────────────────────────
    init();

})();
