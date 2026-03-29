// ── Fitsi IA — Agent Dashboard (Minimal) ─────────────────────────────
(function () {
    "use strict";

    let agents = [], events = [], activeTasks = [], allTasks = [];
    let selectedAgent = null, activeTab = "agents", searchQuery = "";
    let activeCategories = null;
    let simulation, svg, g, linkGroup, taskLinkGroup, nodeGroup, allNodesData = [];
    let ws, _statsTimer;

    // ── Performance: batch WebSocket events ──────────────
    let _eventBatch = [], _batchTimer = null;
    function queueEvent(data) {
        _eventBatch.push(data);
        if (!_batchTimer) {
            const activeCount = agents.filter(a => a.status !== "idle").length;
            const interval = activeCount > 100 ? 2000 : activeCount > 50 ? 1000 : 500;
            _batchTimer = setTimeout(() => { processBatch(); _batchTimer = null; }, interval);
        }
    }

    let _agentIndex = {};
    function rebuildAgentIndex() { _agentIndex = {}; agents.forEach((a, i) => { _agentIndex[a.name] = i; }); }

    function processBatch() {
        if (!_eventBatch.length) return;
        const batch = _eventBatch.splice(0);
        if (!Object.keys(_agentIndex).length) rebuildAgentIndex();
        for (const data of batch) {
            if (data.type === "agent_event") {
                const idx = _agentIndex[data.event.agent_name];
                if (idx !== undefined && data.agent) agents[idx] = data.agent;
                events.unshift(data.event);
            }
        }
        if (events.length > 200) events.length = 200;
        updateNodes();
        debouncedUpdateStats();
        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => renderSidebar());
        } else {
            setTimeout(() => renderSidebar(), 100);
        }
    }

    // ── Utilities ─────────────────────────────────────────
    function esc(s) { if (!s) return ""; const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    function formatNum(n) { if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(n || 0); }
    function formatTime(ts) { if (!ts) return ""; return new Date(ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

    // ── Agent States ──────────────────────────────────────
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

    function isWorking(status) {
        return ["spawning", "active", "thinking", "delegating", "reviewing", "waiting"].includes(status);
    }

    function isInActiveTask(name) {
        return activeTasks.some(t => t.agents && t.agents.some(a => a.agent_name === name && a.status === "active"));
    }

    function isActiveAgent(a) { return isWorking(a.status) || isInActiveTask(a.name); }
    function stateColor(status) { return STATE[status]?.color || null; }

    function roleColor(role) {
        return role === "decisor" ? "#ef4444" : role === "coordinador" || role === "orquestador" ? "#f97316" :
               role === "security" ? "#ec4899" : role === "inspector" || role === "reviewer" ? "#06b6d4" :
               role === "lead" ? "#8b5cf6" : "#22c55e";
    }

    // ── Clock ─────────────────────────────────────────────
    setInterval(() => {
        document.getElementById("clock").textContent = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }, 1000);

    // ── Init ──────────────────────────────────────────────
    async function init() {
        try {
            const [a, e, t, h, s] = await Promise.all([
                fetch("/api/agents").then(r => r.ok ? r.json() : []),
                fetch("/api/events?limit=50").then(r => r.ok ? r.json() : []),
                fetch("/api/tasks/active").then(r => r.ok ? r.json() : []),
                fetch("/api/tasks/history?limit=50").then(r => r.ok ? r.json() : []),
                fetch("/api/stats").then(r => r.ok ? r.json() : {}),
            ]);
            agents = a; events = e; activeTasks = t; allTasks = h;
            rebuildAgentIndex();
            activeCategories = new Set(agents.map(ag => ag.category));
            updateStats(s);
        } catch (err) { /* silent */ }
        if (!activeCategories) activeCategories = new Set();
        renderSidebar();
        initGraph();
        connectWS();
        bindTabs();
        bindSearch();
    }

    // ── WebSocket ─────────────────────────────────────────
    function connectWS() {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${location.host}/ws`);

        ws.onopen = () => {
            document.getElementById("conn-dot").className = "conn-dot live";
            document.getElementById("conn-label").textContent = "Live";
        };

        ws.onclose = () => {
            document.getElementById("conn-dot").className = "conn-dot offline";
            document.getElementById("conn-label").textContent = "Offline";
            if (!ws._rd) ws._rd = 1000;
            setTimeout(() => { ws._rd = Math.min(ws._rd * 1.5, 30000); connectWS(); }, ws._rd);
        };

        ws.onmessage = (msg) => {
            let data;
            try { data = JSON.parse(msg.data); } catch (e) { return; }

            if (data.type === "agent_event") {
                queueEvent(data);
            } else if (data.type === "event_batch") {
                for (const evt of (data.events || [])) {
                    if (evt.type === "agent_event") queueEvent(evt);
                }
            } else if (data.type === "task_created" || data.type === "task_completed") {
                Promise.all([
                    fetch("/api/agents").then(r => r.json()),
                    fetch("/api/tasks/active").then(r => r.json()),
                    fetch("/api/tasks/history?limit=50").then(r => r.json()),
                ]).then(([a, t, h]) => {
                    agents = a; activeTasks = t; allTasks = h;
                    rebuildAgentIndex();
                    updateNodes();
                    renderTaskEdges();
                    renderSidebar();
                    debouncedUpdateStats();
                });
            }
        };
    }

    // ── Stats ─────────────────────────────────────────────
    function debouncedUpdateStats() { clearTimeout(_statsTimer); _statsTimer = setTimeout(() => updateStats(null), 200); }

    async function updateStats(s) {
        if (!s) try { s = await fetch("/api/stats").then(r => r.json()); } catch (e) { return; }
        const localActive = agents.filter(a => isActiveAgent(a)).length;
        document.getElementById("m-total").textContent = agents.length || s.total_agents || 0;
        document.getElementById("m-active").textContent = localActive || s.active_agents || 0;
        document.getElementById("m-events").textContent = formatNum(s.total_events || 0);
        document.getElementById("m-tokens").textContent = formatNum(s.total_tokens || 0);
        document.getElementById("m-tasks").textContent = activeTasks.length;

        // Highlight active metric
        const el = document.getElementById("m-active");
        if (localActive > 0) el.style.color = "var(--green)";
        else el.style.color = "var(--accent)";
    }

    // ── Tabs ──────────────────────────────────────────────
    function bindTabs() {
        document.querySelectorAll(".tab").forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                activeTab = tab.dataset.tab;
                renderSidebar();
            };
        });
    }

    // ── Search ────────────────────────────────────────────
    function bindSearch() {
        const el = document.getElementById("search");
        if (!el) return;
        el.oninput = () => { searchQuery = el.value.toLowerCase().trim(); renderSidebar(); };
    }

    // ── Sidebar Rendering ─────────────────────────────────
    let _sidebarDirty = true;

    function renderSidebar() {
        _sidebarDirty = true;
        if (!document.hidden) _renderNow();
    }

    function _renderNow() {
        if (!_sidebarDirty) return;
        _sidebarDirty = false;
        const c = document.getElementById("sidebar-list");
        if (activeTab === "agents") renderAgentList(c);
        else if (activeTab === "events") renderEventList(c);
        else if (activeTab === "tasks") renderTaskList(c);
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && _sidebarDirty) _renderNow();
    });

    // ── Agent List ────────────────────────────────────────
    const MAX_SIDEBAR = 250;

    function renderAgentList(c) {
        let filtered = agents.filter(a => activeCategories.has(a.category));
        if (searchQuery) {
            filtered = filtered.filter(a =>
                a.display_name.toLowerCase().includes(searchQuery) ||
                a.name.includes(searchQuery) ||
                a.team.toLowerCase().includes(searchQuery)
            );
        }

        // Sort: active first, then by invocations
        filtered.sort((a, b) => {
            const aa = isActiveAgent(a) ? 1 : 0;
            const bb = isActiveAgent(b) ? 1 : 0;
            if (aa !== bb) return bb - aa;
            return (b.total_invocations || 0) - (a.total_invocations || 0);
        });

        if (filtered.length > MAX_SIDEBAR && !searchQuery) {
            filtered = filtered.slice(0, MAX_SIDEBAR);
        }

        const byTeam = {};
        filtered.forEach(a => { if (!byTeam[a.team]) byTeam[a.team] = []; byTeam[a.team].push(a); });

        let html = "";
        for (const [team, members] of Object.entries(byTeam)) {
            html += `<div class="team-label">${esc(team)} <span style="opacity:.4">(${members.length})</span></div>`;
            for (const a of members) {
                const st = STATE[a.status] || STATE.idle;
                const working = isWorking(a.status);
                const dotColor = working ? (st.color || "#22c55e") : (a.status === "error" ? "#ef4444" : a.color);
                const badgeHtml = a.status !== "idle"
                    ? `<span class="badge" style="color:${st.color || 'var(--text3)'};background:${(st.color || 'var(--text3)') + '15'}">${st.label}</span>`
                    : "";
                html += `<div class="agent-row ${selectedAgent === a.name ? 'selected' : ''}" data-name="${a.name}">
                    <span class="dot ${working ? 'pulse' : ''}" style="background:${dotColor}"></span>
                    <span class="name">${esc(a.display_name)}</span>
                    ${badgeHtml}
                    <span class="invocations">${a.total_invocations || 0}</span>
                </div>`;
            }
        }

        c.innerHTML = html || '<div class="empty">No agents match</div>';
        c.querySelectorAll(".agent-row").forEach(el => {
            el.onclick = () => showDetail(el.dataset.name);
        });
    }

    // ── Event List ────────────────────────────────────────
    function renderEventList(c) {
        if (!events.length) { c.innerHTML = '<div class="empty">No events yet</div>'; return; }

        const html = events.slice(0, 80).map(e => {
            const st = STATE[e.event_type] || STATE.active;
            const detail = e.detail ? (e.detail.length > 80 ? e.detail.slice(0, 80) + "..." : e.detail) : "";
            return `<div class="event-row" style="border-left-color:${st.color || 'var(--accent)'}">
                <div class="event-header">
                    <span class="event-agent" style="color:${st.color || 'var(--text)'}">${esc(e.agent_name)}</span>
                    <span class="badge" style="color:${st.color || 'var(--text3)'};background:${(st.color || 'var(--accent)') + '15'};font-size:8px">${st.label}</span>
                    <span class="event-time">${formatTime(e.timestamp)}</span>
                </div>
                ${detail ? `<div class="event-detail">${esc(detail)}</div>` : ""}
            </div>`;
        }).join("");

        c.innerHTML = html;
    }

    // ── Task List ─────────────────────────────────────────
    function renderTaskList(c) {
        const tasks = activeTasks.length ? activeTasks : allTasks.slice(0, 20);
        if (!tasks.length) { c.innerHTML = '<div class="empty">No tasks</div>'; return; }

        const html = tasks.map(t => {
            const agentChips = (t.agents || []).map(a => {
                const color = roleColor(a.role);
                return `<span class="task-agent-chip" style="border-color:${color}40;color:${color}">${esc(a.agent_name)}</span>`;
            }).join("");
            const statusColor = t.status === "completed" ? "var(--green)" : t.status === "failed" ? "var(--red)" : "var(--accent)";
            return `<div class="task-row">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <span class="task-name" style="flex:1">${esc(t.task_name)}</span>
                    <span class="badge" style="color:${statusColor};background:${statusColor}15">${esc(t.status || "active")}</span>
                </div>
                ${agentChips ? `<div class="task-agents">${agentChips}</div>` : ""}
            </div>`;
        }).join("");

        c.innerHTML = html;
    }

    // ── Detail Panel ──────────────────────────────────────
    function getAgentTask(name) {
        for (const t of activeTasks) { const a = t.agents.find(x => x.agent_name === name); if (a) return { task: t, role: a.role }; }
        if (allTasks.length) { for (const t of allTasks) { const a = t.agents.find(x => x.agent_name === name); if (a) return { task: t, role: a.role }; } }
        return null;
    }

    async function showDetail(name) {
        selectedAgent = name;
        let data;
        try { data = await fetch(`/api/agents/${name}`).then(r => r.json()); } catch (e) { return; }
        if (data.error) return;

        const a = data.agent;
        const st = STATE[a.status] || STATE.idle;
        const at = getAgentTask(name);

        document.getElementById("detail-body").innerHTML = `
            <h2>${esc(a.display_name)}</h2>
            <div class="detail-sub">${esc(a.team)} / ${esc(a.category)}</div>
            <div class="detail-grid">
                <div class="detail-card">
                    <div class="val" style="color:${st.color || 'var(--text3)'}">${st.label}</div>
                    <div class="lbl">Status</div>
                </div>
                <div class="detail-card">
                    <div class="val">${a.total_invocations}</div>
                    <div class="lbl">Invocations</div>
                </div>
                <div class="detail-card">
                    <div class="val">${formatNum(a.total_tokens)}</div>
                    <div class="lbl">Tokens</div>
                </div>
                <div class="detail-card">
                    <div class="val" style="font-size:12px">${a.last_active ? formatTime(a.last_active) : "--"}</div>
                    <div class="lbl">Last Active</div>
                </div>
            </div>
            ${at ? `<div style="margin-bottom:16px">
                <div class="detail-section-title">Current Task</div>
                <div class="task-row">
                    <div class="task-name">${esc(at.task.task_name)}</div>
                    <span class="badge" style="color:${roleColor(at.role)};background:${roleColor(at.role)}15">${esc(at.role)}</span>
                </div>
            </div>` : ""}
            <div class="detail-section-title">Recent Events</div>
            ${!data.events.length ? '<div class="empty">No events</div>' :
              data.events.slice(0, 12).map(e => {
                  const sc = STATE[e.event_type] || STATE.active;
                  const det = e.detail ? (e.detail.length > 60 ? e.detail.slice(0, 60) + "..." : e.detail) : "";
                  return `<div class="detail-event" style="border-left-color:${sc.color || 'var(--accent)'}">
                      <div class="detail-event-head">
                          <span style="color:${sc.color || 'var(--accent)'};font-weight:600;font-size:9px">${sc.label}</span>
                          <span class="detail-event-time">${formatTime(e.timestamp)}</span>
                      </div>
                      ${det ? `<div class="detail-event-detail">${esc(det)}</div>` : ""}
                  </div>`;
              }).join("")}`;

        document.getElementById("detail").classList.add("open");
        renderSidebar();
        highlightChain(name);
    }

    document.getElementById("detail-close").onclick = () => {
        document.getElementById("detail").classList.remove("open");
        selectedAgent = null;
        renderSidebar();
        unhighlightChain();
    };

    // ── Chain highlighting ─────────────────────────────────
    function highlightChain(name) {
        const chainNames = new Set();
        for (const t of activeTasks) {
            if (t.agents.some(a => a.agent_name === name)) {
                t.agents.forEach(a => chainNames.add(a.agent_name));
            }
        }
        if (chainNames.size === 0) return;
        nodeGroup.selectAll("g").attr("opacity", d => chainNames.has(d.id) || d.isTeam ? 1 : 0.12);
    }

    function unhighlightChain() {
        nodeGroup.selectAll("g").attr("opacity", 1);
        renderTaskEdges();
    }

    // ── D3 Graph ──────────────────────────────────────────
    const DEPT_CENTERS = new Set([
        "fitsia-orchestrator",
        "demon-decision", "demon-performance", "demon-intelligence", "demon-security", "demon-data",
        "demon-growth", "demon-experimentation", "demon-operations", "demon-evolution", "demon-crisis",
        "board-chairman", "board-advisor-growth", "board-advisor-finance", "board-advisor-people", "board-advisor-tech",
        "ceo-fitsi", "coo-fitsi", "chief-technology-officer", "cpo-fitsi", "cfo-fitsi",
        "cdao-fitsi", "cgo-fitsi", "ciso-fitsi", "chro-fitsi",
        "vp-of-engineering", "vp-of-mobile-engineering", "chief-software-architect", "vp-of-platform",
        "vp-of-ai-systems", "vp-of-product", "head-of-ux-research", "head-of-marketing",
        "head-of-growth-engineering", "head-of-operations", "head-of-partnerships", "head-of-revenue",
        "head-of-compliance", "head-of-talent", "vp-of-finance", "head-of-financial-planning",
        "head-of-culture", "head-of-design", "head-of-product-analytics",
        "fitsia-feature-coordinator", "fitsia-frontend-coordinator", "fitsia-backend-coordinator",
        "fitsia-ai-coordinator", "fitsia-science-coordinator", "fitsia-devops-coordinator",
        "fitsia-qa-coordinator", "fitsia-marketing-coordinator", "fitsia-content-coordinator",
        "fitsia-equipment-coordinator",
    ]);

    function nodeR(d) {
        if (d.isTeam) return 16;
        if (DEPT_CENTERS.has(d.name || d.id)) return 7;
        return isWorking(d.status) ? 5 : 2;
    }

    function getVisible() {
        return agents.filter(a => activeCategories.has(a.category));
    }

    const MAX_NODES = 6000;

    function initGraph() {
        const ct = document.getElementById("canvas-area");
        const w = ct.clientWidth, h = ct.clientHeight;
        svg = d3.select("#graph").attr("width", w).attr("height", h);

        const defs = svg.append("defs");
        ["#22c55e", "#ef4444", "#f97316", "#06b6d4", "#ec4899", "#8b5cf6"].forEach((color, i) => {
            defs.append("marker").attr("id", `arrow-${i}`).attr("viewBox", "0 0 8 6").attr("refX", 8).attr("refY", 3)
                .attr("markerWidth", 8).attr("markerHeight", 6).attr("orient", "auto")
                .append("path").attr("d", "M0,0 L8,3 L0,6 Z").attr("fill", color);
        });

        svg.call(d3.zoom().scaleExtent([0.1, 6]).on("zoom", e => g.attr("transform", e.transform)));
        g = svg.append("g");
        linkGroup = g.append("g");
        taskLinkGroup = g.append("g");
        nodeGroup = g.append("g");

        buildGraph(w, h);
    }

    function buildGraph(w, h) {
        let visible = getVisible();

        if (visible.length > MAX_NODES) {
            const hierarchy = [], active = [], rest = [];
            visible.forEach(a => {
                if (DEPT_CENTERS.has(a.name)) hierarchy.push(a);
                else if (isActiveAgent(a)) active.push(a);
                else rest.push(a);
            });
            rest.sort((a, b) => (b.total_invocations || 0) - (a.total_invocations || 0));
            const budget = MAX_NODES - hierarchy.length - active.length;
            visible = [...hierarchy, ...active, ...rest.slice(0, Math.max(0, budget))];
        }

        const teams = [...new Set(visible.map(a => a.team))];
        const teamAngle = i => i * (2 * Math.PI / teams.length) - Math.PI / 2;
        const radius = Math.min(w, h) * 0.28;

        const teamNodes = teams.map((t, i) => ({
            id: `team_${t}`, name: t, display_name: t, isTeam: true, color: "#333", team: t,
            category: "", total_invocations: 0, total_tokens: 0, status: "idle",
            fx: null, fy: null,
            tx: w / 2 + Math.cos(teamAngle(i)) * radius,
            ty: h / 2 + Math.sin(teamAngle(i)) * radius,
        }));

        allNodesData = [...teamNodes, ...visible.map(a => ({ ...a, id: a.name }))];
        const links = visible.map(a => ({ source: `team_${a.team}`, target: a.name, type: "member" }));

        const teamRelations = [
            ["Supreme Orchestrator", "Control Demons"],
            ["Supreme Orchestrator", "Board of Directors"],
            ["Board of Directors", "C-Suite"],
            ["C-Suite", "Vice Presidents"],
            ["Vice Presidents", "Coordinators"],
            ["Vice Presidents", "Directors"],
            ["Directors", "Tech Leads"],
            ["Directors", "Eng Managers"],
            ["C-Suite", "Engineering"], ["C-Suite", "AI Engineering"],
            ["C-Suite", "Infrastructure"], ["C-Suite", "Security"],
            ["Vice Presidents", "Backend Engineering"], ["Vice Presidents", "Mobile Core"],
            ["Vice Presidents", "AI Leadership"], ["Vice Presidents", "Platform Leadership"],
            ["Coordinators", "Engineering"], ["Coordinators", "Backend Engineering"],
            ["Coordinators", "Mobile Core"], ["Coordinators", "AI Engineering"],
            ["Coordinators", "Data Engineering"], ["Coordinators", "QA Testing"],
            ["Backend Engineering", "Engineering"], ["Mobile Core", "Engineering"],
            ["AI Engineering", "AI Leadership"], ["AI Engineering", "Data Engineering"],
            ["Quality Engineering", "QA Testing"],
            ["Infrastructure", "Security"],
            ["Architecture", "Backend Engineering"], ["Architecture", "Mobile Core"],
            ["Fitsia Core", "Mobile Core"], ["Fitsia Core", "Backend Engineering"],
            ["Fitsia Core", "AI Engineering"],
        ];

        const existingTeams = new Set(teams);
        for (const [from, to] of teamRelations) {
            if (existingTeams.has(from) && existingTeams.has(to)) {
                links.push({ source: `team_${from}`, target: `team_${to}`, type: "relation" });
            }
        }

        simulation = d3.forceSimulation(allNodesData)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.type === "relation" ? 100 : 20).strength(d => d.type === "relation" ? 0.06 : 0.5))
            .force("charge", d3.forceManyBody().strength(d => d.isTeam ? -200 : -8))
            .force("collision", d3.forceCollide().radius(d => d.isTeam ? 20 : nodeR(d) + 1))
            .force("x", d3.forceX(w / 2).strength(0.06))
            .force("y", d3.forceY(h / 2).strength(0.06))
            .alphaDecay(0.02);

        const showLinks = visible.length < 800;
        linkGroup.selectAll("line.member-link").data(showLinks ? links.filter(l => l.type === "member") : []).join("line")
            .attr("class", "member-link").attr("stroke", "#18181b").attr("stroke-width", 0.4).attr("stroke-opacity", 0.12);

        linkGroup.selectAll("line.team-link").data(links.filter(l => l.type === "relation")).join("line")
            .attr("class", "team-link").attr("stroke", "#ffffff").attr("stroke-width", 0.4).attr("stroke-opacity", 0.04).attr("stroke-dasharray", "8,6");

        const _teamCounts = {}, _teamFirstColor = {};
        visible.forEach(a => {
            if (!a.isTeam) {
                _teamCounts[a.team] = (_teamCounts[a.team] || 0) + 1;
                if (!_teamFirstColor[a.team]) _teamFirstColor[a.team] = a.color;
            }
        });

        const nodeEl = nodeGroup.selectAll("g.node").data(allNodesData, d => d.id).join(
            enter => {
                const ng = enter.append("g").attr("class", "node").attr("data-agent", d => d.id).attr("cursor", "pointer")
                    .call(d3.drag().on("start", dragS).on("drag", dragD).on("end", dragE));

                ng.append("circle").attr("class", "node-circle")
                    .attr("r", d => nodeR(d))
                    .attr("fill", d => {
                        if (d.isTeam) return "#09090b";
                        if (isWorking(d.status)) return (stateColor(d.status) || "#22c55e") + "30";
                        return (d.color || "#6366f1") + "20";
                    })
                    .attr("stroke", d => {
                        if (d.isTeam) return (_teamFirstColor[d.team] || "#333") + "60";
                        if (isWorking(d.status)) return stateColor(d.status) || "#22c55e";
                        return "none";
                    })
                    .attr("stroke-width", d => d.isTeam ? 1 : isWorking(d.status) ? 1.5 : 0);

                // Team labels
                ng.filter(d => d.isTeam).append("text")
                    .attr("text-anchor", "middle").attr("fill", "#52525b")
                    .attr("font-size", "8px").attr("font-weight", "600")
                    .attr("dy", d => nodeR(d) + 12).text(d => d.display_name);
                ng.filter(d => d.isTeam).append("text")
                    .attr("text-anchor", "middle").attr("fill", "#3f3f46")
                    .attr("font-size", "7px").attr("dy", d => nodeR(d) + 20)
                    .text(d => (_teamCounts[d.team] || 0));

                ng.filter(d => !d.isTeam)
                    .on("mouseover", (ev, d) => showTooltip(ev, d))
                    .on("mouseout", hideTooltip)
                    .on("click", (ev, d) => showDetail(d.name));

                ng.filter(d => d.isTeam)
                    .on("mouseover", (ev, d) => showTooltip(ev, d))
                    .on("mouseout", hideTooltip)
                    .on("click", (ev, d) => zoomToTeam(d));

                return ng;
            },
            update => update,
            exit => exit.transition().duration(200).attr("opacity", 0).remove()
        );

        let _lastTick = 0, _tickCount = 0, _autoZoomed = false;
        simulation.on("tick", () => {
            const now = performance.now();
            if (now - _lastTick < 50) return;
            _lastTick = now;
            _tickCount++;

            linkGroup.selectAll("line").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
            nodeEl.attr("transform", d => `translate(${d.x},${d.y})`);
            updateTaskEdgesPosition();

            if (_tickCount === 100 && !_autoZoomed) {
                _autoZoomed = true;
                autoZoom();
            }
        });

        renderTaskEdges();
    }

    function autoZoom() {
        const ct = document.getElementById("canvas-area");
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        allNodesData.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x;
            if (n.y > maxY) maxY = n.y;
        });
        const pad = 60;
        const bw = (maxX - minX) + pad * 2;
        const bh = (maxY - minY) + pad * 2;
        const scale = Math.min(ct.clientWidth / bw, ct.clientHeight / bh, 1.5);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const tx = ct.clientWidth / 2 - cx * scale;
        const ty = ct.clientHeight / 2 - cy * scale;
        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.transition().duration(800).call(
            d3.zoom().scaleExtent([0.1, 6]).on("zoom", e => g.attr("transform", e.transform)).transform,
            transform
        );
    }

    function updateNodes() {
        if (!Object.keys(_agentIndex).length) rebuildAgentIndex();
        nodeGroup.selectAll("g.node").each(function (d) {
            const idx = _agentIndex[d.id];
            const a = idx !== undefined ? agents[idx] : null;
            if (!a) return;
            d.status = a.status;
            d.total_invocations = a.total_invocations;
            d.total_tokens = a.total_tokens;

            const c = d3.select(this).select(".node-circle");
            const sc = stateColor(a.status);
            c.attr("r", nodeR(d))
                .attr("fill", isWorking(a.status) ? (sc || a.color) + "30" : (a.color || "#6366f1") + "12")
                .attr("stroke", isWorking(a.status) ? sc || "#22c55e" : a.status === "error" ? "#ef4444" : "none")
                .attr("stroke-width", isWorking(a.status) ? 2 : a.status === "error" ? 1.5 : 0);
        });
    }

    // ── Task Edges ────────────────────────────────────────
    function renderTaskEdges() {
        taskLinkGroup.selectAll("*").remove();
        for (const task of activeTasks) {
            for (const ag of (task.agents || [])) {
                if (!ag.delegated_by) continue;
                const color = roleColor(ag.role);
                const arrowColors = { "#22c55e": 0, "#ef4444": 1, "#f97316": 2, "#06b6d4": 3, "#ec4899": 4, "#8b5cf6": 5 };
                const arrowIdx = arrowColors[color] || 0;

                taskLinkGroup.append("path")
                    .attr("class", "task-edge")
                    .attr("fill", "none")
                    .attr("stroke", color)
                    .attr("stroke-width", 1.5)
                    .attr("stroke-opacity", 0.5)
                    .attr("stroke-dasharray", "8,4")
                    .attr("marker-end", `url(#arrow-${arrowIdx})`)
                    .attr("data-from", ag.delegated_by)
                    .attr("data-to", ag.agent_name);
            }
        }
    }

    function updateTaskEdgesPosition() {
        taskLinkGroup.selectAll(".task-edge").each(function () {
            const el = d3.select(this), fromId = el.attr("data-from"), toId = el.attr("data-to");
            const fromN = allNodesData.find(d => d.id === fromId);
            const toN = allNodesData.find(d => d.id === toId);
            if (!fromN || !toN || !fromN.x || !toN.x) return;
            const dx = toN.x - fromN.x, dy = toN.y - fromN.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const r = nodeR(toN) + 4;
            const mx = (fromN.x + toN.x) / 2, my = (fromN.y + toN.y) / 2;
            const nx = -dy / dist * 15, ny = dx / dist * 15;
            el.attr("d", `M${fromN.x},${fromN.y} Q${mx + nx},${my + ny} ${toN.x - (dx / dist) * r},${toN.y - (dy / dist) * r}`);
        });
    }

    // ── Tooltip ───────────────────────────────────────────
    // Minimal tooltip — reuse detail panel approach, create tooltip el on demand
    let _tooltip = null;
    function ensureTooltip() {
        if (_tooltip) return _tooltip;
        _tooltip = document.createElement("div");
        _tooltip.className = "tip";
        _tooltip.style.cssText = "position:fixed;pointer-events:none;background:#18181b;border:1px solid #27272a;border-radius:8px;padding:10px 12px;font-size:11px;max-width:260px;z-index:200;opacity:0;transition:opacity .12s;color:#fafafa;box-shadow:0 4px 16px rgba(0,0,0,.5)";
        document.body.appendChild(_tooltip);
        return _tooltip;
    }

    function showTooltip(ev, d) {
        const tip = ensureTooltip();
        if (d.isTeam) {
            const teamAgents = agents.filter(a => a.team === d.team);
            const act = teamAgents.filter(a => isActiveAgent(a)).length;
            tip.innerHTML = `<strong>${esc(d.display_name)}</strong><br>
                <span style="color:#a1a1aa">${teamAgents.length} agents</span>
                ${act ? `<span style="color:#22c55e;margin-left:6px">${act} active</span>` : ""}`;
        } else {
            const st = STATE[d.status] || STATE.idle;
            tip.innerHTML = `<strong>${esc(d.display_name)}</strong><br>
                <span style="color:#a1a1aa">${esc(d.team)}</span><br>
                <span style="color:${st.color || '#a1a1aa'}">${st.label}</span>
                <span style="color:#a1a1aa;margin-left:8px">${d.total_invocations || 0} inv</span>`;
        }
        tip.style.left = Math.min(ev.clientX + 12, window.innerWidth - 280) + "px";
        tip.style.top = Math.min(ev.clientY - 8, window.innerHeight - 80) + "px";
        tip.style.opacity = "1";
    }

    function hideTooltip() {
        if (_tooltip) _tooltip.style.opacity = "0";
    }

    // ── Zoom to team ──────────────────────────────────────
    function zoomToTeam(d) {
        const ct = document.getElementById("canvas-area");
        const transform = d3.zoomIdentity.translate(ct.clientWidth / 2 - d.x * 2, ct.clientHeight / 2 - d.y * 2).scale(2);
        svg.transition().duration(600).call(
            d3.zoom().scaleExtent([0.1, 6]).on("zoom", e => g.attr("transform", e.transform)).transform,
            transform
        );
    }

    // ── Drag ──────────────────────────────────────────────
    function dragS(ev, d) { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragD(ev, d) { d.fx = ev.x; d.fy = ev.y; }
    function dragE(ev, d) { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

    // ── Resize ────────────────────────────────────────────
    let _resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            const ct = document.getElementById("canvas-area");
            svg.attr("width", ct.clientWidth).attr("height", ct.clientHeight);
            if (simulation) {
                simulation.force("x", d3.forceX(ct.clientWidth / 2).strength(0.06));
                simulation.force("y", d3.forceY(ct.clientHeight / 2).strength(0.06));
                simulation.alpha(0.3).restart();
            }
        }, 250);
    });

    // ── Start ─────────────────────────────────────────────
    init();

})();
