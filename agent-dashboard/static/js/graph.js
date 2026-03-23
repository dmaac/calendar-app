// ── FITSIA IA Agent Command Center — D3.js v3 ────────────────────────
// Mission Control UI with delegation edges, active filtering, real-time, sounds, command panel
(function () {
    "use strict";

    let agents = [], events = [], activeTasks = [], allTasks = [];
    let selectedAgent = null, selectedTask = null, activeTab = "agents", showOnlyActive = false, searchQuery = "";
    let activeCategories = null; // Will be populated from API on init
    let simulation, svg, g, linkGroup, taskLinkGroup, nodeGroup, allNodesData = [];
    let ws, _statsTimer;
    let commandOutput = {};  // task_id -> output string
    let activeCommandId = null;
    let debugMode = false;
    let isDark = true;
    let currentView = "btn-view-organic"; // Track active view

    // ── Performance: batch WebSocket events ──────────────
    let _eventBatch = [];
    let _batchTimer = null;
    function queueEvent(data) {
        _eventBatch.push(data);
        if (!_batchTimer) {
            // Adaptive batch interval: more agents active = longer batch window
            const activeCount = agents.filter(a=>a.status!=='idle').length;
            const interval = activeCount > 100 ? 2000 : activeCount > 50 ? 1000 : 500;
            _batchTimer = setTimeout(() => {
                processBatch();
                _batchTimer = null;
            }, interval);
        }
    }
    // Agent lookup index for O(1) instead of O(n)
    let _agentIndex = {};
    function rebuildAgentIndex() { _agentIndex = {}; agents.forEach((a,i) => { _agentIndex[a.name] = i; }); }

    function processBatch() {
        if (!_eventBatch.length) return;
        const batch = _eventBatch.splice(0);
        if (!Object.keys(_agentIndex).length) rebuildAgentIndex();
        // Apply all agent updates at once using index
        for (const data of batch) {
            if (data.type === "agent_event") {
                const idx = _agentIndex[data.event.agent_name];
                if (idx !== undefined && data.agent) agents[idx] = data.agent;
                events.unshift(data.event);
            }
        }
        if (events.length > 200) events.length = 200;
        // Minimal update — only nodes, skip expensive operations
        updateNodes();
        debouncedUpdateStats();
        // Defer sidebar and tasks to next idle frame
        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => { renderSidebar(); renderStatsBar(); });
        } else {
            setTimeout(() => { renderSidebar(); renderStatsBar(); }, 100);
        }
    }

    // ── Performance: lazy sidebar rendering ──────────────
    let _sidebarDirty = true;

    function esc(s) { if (!s) return ""; const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    function formatNum(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+"M"; if (n >= 1e3) return (n/1e3).toFixed(1)+"K"; return String(n||0); }
    function formatTime(ts) { if (!ts) return ""; return new Date(ts).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }
    function roleColor(role) { return role==="decisor"?"#ef4444":role==="coordinador"||role==="orquestador"?"#f97316":role==="security"?"#ec4899":role==="inspector"||role==="reviewer"?"#06b6d4":role==="lead"?"#8b5cf6":role==="support"?"#22c55e":"#22c55e"; }

    // ── Theme Toggle ──────────────────────────────────────
    function toggleTheme() {
        isDark = !isDark;
        const root = document.documentElement;
        if (isDark) {
            root.style.setProperty('--bg', '#0a0a0a');
            root.style.setProperty('--bg2', '#141414');
            root.style.setProperty('--bg3', '#1a1a1a');
            root.style.setProperty('--border', '#222222');
            root.style.setProperty('--text', '#e5e5e5');
            root.style.setProperty('--text-dim', '#737373');
        } else {
            root.style.setProperty('--bg', '#f5f5f5');
            root.style.setProperty('--bg2', '#ffffff');
            root.style.setProperty('--bg3', '#eeeeee');
            root.style.setProperty('--border', '#d4d4d4');
            root.style.setProperty('--text', '#171717');
            root.style.setProperty('--text-dim', '#737373');
        }
        document.getElementById("theme-toggle").textContent = isDark ? "◐" : "◑";
    }

    // ── Agent States ─────────────────────────────────────
    const STATE_CONFIG = {
        idle:       { color: null,      icon: "○", label: "IDLE",       glow: false },
        spawning:   { color: "#f59e0b", icon: "◉", label: "SPAWNING",  glow: true  },
        active:     { color: "#22c55e", icon: "●", label: "ACTIVE",    glow: true  },
        thinking:   { color: "#8b5cf6", icon: "◆", label: "THINKING",  glow: true  },
        delegating: { color: "#f97316", icon: "▶", label: "DELEGATING",glow: true  },
        reviewing:  { color: "#06b6d4", icon: "◈", label: "REVIEWING", glow: true  },
        waiting:    { color: "#eab308", icon: "◇", label: "WAITING",   glow: false },
        completed:  { color: "#6366f1", icon: "✓", label: "COMPLETED", glow: false },
        error:      { color: "#ef4444", icon: "✗", label: "ERROR",     glow: true  },
    };

    function isWorking(status) {
        return ["spawning","active","thinking","delegating","reviewing","waiting"].includes(status);
    }

    function isInActiveTask(name) {
        return activeTasks.some(t => t.agents && t.agents.some(a => a.agent_name === name && a.status === "active"));
    }

    function isActiveAgent(a) {
        return isWorking(a.status) || isInActiveTask(a.name);
    }

    function stateColor(status) {
        return STATE_CONFIG[status]?.color || null;
    }

    // ── Web Audio — Sound System ──────────────────────────
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        return audioCtx;
    }
    // Resume audio on first user interaction (browser autoplay policy)
    document.addEventListener("click", () => { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }, { once: false });
    document.addEventListener("keydown", () => { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }, { once: false });

    function playTone(freq, duration, type, volume, detune) {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type || "sine";
            osc.frequency.value = freq;
            if (detune) osc.detune.value = detune;
            gain.gain.setValueAtTime(volume || 0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (duration || 0.3));
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + (duration || 0.3));
        } catch(e) {}
    }

    function playChord(freqs, duration, type, volume) {
        freqs.forEach((f, i) => playTone(f, duration, type, volume, i * 5));
    }

    const SOUNDS = {
        spawned: () => {
            // Rising arpeggio — agent coming online
            playTone(440, 0.12, "sine", 0.06);
            setTimeout(() => playTone(554, 0.12, "sine", 0.06), 80);
            setTimeout(() => playTone(659, 0.15, "sine", 0.08), 160);
        },
        thinking: () => {
            // Soft pulsing hum — deliberation
            playTone(330, 0.4, "sine", 0.04);
            setTimeout(() => playTone(349, 0.3, "sine", 0.03), 200);
        },
        delegating: () => {
            // Handoff: two-tone descending
            playTone(587, 0.1, "triangle", 0.07);
            setTimeout(() => playTone(440, 0.15, "triangle", 0.05), 100);
        },
        reviewing: () => {
            // Scanning sweep
            playTone(523, 0.2, "sawtooth", 0.03);
            setTimeout(() => playTone(587, 0.2, "sawtooth", 0.03), 120);
            setTimeout(() => playTone(523, 0.15, "sawtooth", 0.02), 240);
        },
        waiting: () => {
            // Gentle ping
            playTone(392, 0.25, "sine", 0.03);
        },
        active: () => {
            // Steady work tone
            playTone(440, 0.15, "square", 0.03);
            setTimeout(() => playTone(523, 0.12, "square", 0.03), 80);
        },
        completed: () => {
            // Success chord — major triad
            playChord([523, 659, 784], 0.35, "sine", 0.06);
        },
        error: () => {
            // Dissonant alert
            playTone(220, 0.15, "sawtooth", 0.08);
            setTimeout(() => playTone(207, 0.2, "sawtooth", 0.06), 100);
        },
        task_created: () => {
            // Command dispatch — dramatic rising
            playTone(330, 0.08, "triangle", 0.06);
            setTimeout(() => playTone(440, 0.08, "triangle", 0.06), 70);
            setTimeout(() => playTone(554, 0.08, "triangle", 0.07), 140);
            setTimeout(() => playTone(659, 0.15, "triangle", 0.08), 210);
        },
        task_completed: () => {
            // Full resolution — bright major chord + octave
            setTimeout(() => playChord([523, 659, 784, 1047], 0.5, "sine", 0.06), 0);
        },
        command_sent: () => {
            // UI confirmation
            playTone(880, 0.08, "sine", 0.05);
            setTimeout(() => playTone(1047, 0.12, "sine", 0.06), 60);
        },
    };

    function playSound(name) {
        if (SOUNDS[name]) SOUNDS[name]();
    }

    // ── Clock ─────────────────────────────────────────────
    setInterval(() => { document.getElementById("clock").textContent = new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }, 1000);

    // ── Init ──────────────────────────────────────────────
    async function init() {
        try {
            const [a, e, t, h, s] = await Promise.all([
                fetch("/api/agents").then(r=>r.ok?r.json():[]),
                fetch("/api/events?limit=50").then(r=>r.ok?r.json():[]),
                fetch("/api/tasks/active").then(r=>r.ok?r.json():[]),
                fetch("/api/tasks/history?limit=50").then(r=>r.ok?r.json():[]),
                fetch("/api/stats").then(r=>r.ok?r.json():{}),
            ]);
            agents=a; events=e; activeTasks=t; allTasks=h; rebuildAgentIndex();
            // Build activeCategories from ALL categories in the data
            activeCategories = new Set(agents.map(ag=>ag.category));
            updateStats(s);
        } catch(err) { console.error("Init failed:",err); }
        if (!activeCategories) activeCategories = new Set();
        renderCategoryFilters();
        renderToolbar();
        renderSidebar();
        initGraph();
        connectWebSocket();
        bindSearch();
        // Inject theme toggle button
        document.querySelector(".header-right").insertAdjacentHTML("afterbegin",
            '<button class="theme-toggle" id="theme-toggle" title="Toggle theme">◐</button>');
        document.getElementById("theme-toggle").onclick = toggleTheme;

        // Mobile sidebar toggle
        const menuBtn = document.getElementById("mobile-menu-btn");
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        if (menuBtn && sidebar && overlay) {
            menuBtn.onclick = () => {
                sidebar.classList.toggle("open");
                overlay.classList.toggle("visible");
            };
            overlay.onclick = () => {
                sidebar.classList.remove("open");
                overlay.classList.remove("visible");
            };
            // Close sidebar when a tab is clicked on mobile
            sidebar.querySelectorAll(".sidebar-tab").forEach(tab => {
                tab.addEventListener("click", () => {
                    if (window.innerWidth <= 768) {
                        setTimeout(() => {
                            sidebar.classList.remove("open");
                            overlay.classList.remove("visible");
                        }, 200);
                    }
                });
            });
        }
    }

    // ── WebSocket ─────────────────────────────────────────
    function connectWebSocket() {
        const proto = location.protocol==="https:"?"wss:":"ws:";
        ws = new WebSocket(`${proto}//${location.host}/ws`);
        ws.onopen = () => { document.getElementById("ws-dot").classList.add("connected"); document.getElementById("ws-label").textContent="LIVE"; };
        ws.onclose = () => { document.getElementById("ws-dot").classList.remove("connected"); document.getElementById("ws-label").textContent="OFFLINE"; if(!ws._retryDelay) ws._retryDelay=1000; setTimeout(()=>{ws._retryDelay=Math.min(ws._retryDelay*1.5,30000);connectWebSocket();},ws._retryDelay); };
        ws.onmessage = (msg) => {
            let data; try { data=JSON.parse(msg.data); } catch(e) { return; }
            if (data.type==="agent_event") queueEvent(data);
            else if (data.type==="event_batch") {
                // Handle batched events from server-side throttling
                for (const evt of (data.events || [])) {
                    if (evt.type === "agent_event") queueEvent(evt);
                }
            }
            else if (data.type==="task_created") {
                playSound("task_created");
                Promise.all([
                    fetch("/api/agents").then(r=>r.json()),
                    fetch("/api/tasks/active").then(r=>r.json()),
                    fetch("/api/tasks/history?limit=50").then(r=>r.json()),
                ]).then(([a,t,h])=>{ agents=a; activeTasks=t; allTasks=h; rebuildAgentIndex(); updateNodes(); renderTaskEdges(); renderSidebar(); renderStatsBar(); });
            } else if (data.type==="task_completed") {
                playSound("task_completed");
                Promise.all([
                    fetch("/api/agents").then(r=>r.json()),
                    fetch("/api/tasks/active").then(r=>r.json()),
                    fetch("/api/tasks/history?limit=50").then(r=>r.json()),
                ]).then(([a,t,h])=>{ agents=a; activeTasks=t; allTasks=h; rebuildAgentIndex(); updateNodes(); renderTaskEdges(); renderSidebar(); renderStatsBar(); });
            } else if (data.type==="command_output") {
                // Streaming output from Claude CLI
                if (!commandOutput[data.task_id]) commandOutput[data.task_id] = "";
                commandOutput[data.task_id] += data.chunk;
                updateCommandOutput(data.task_id);
            } else if (data.type==="command_result") {
                // Final result from Claude CLI
                commandOutput[data.task_id] = data.output;
                activeCommandId = null;
                updateCommandOutput(data.task_id);
                if (activeTab === "command") renderSidebar();
            }
        };
    }

    function handleAgentEvent(data) {
        const idx = agents.findIndex(a=>a.name===data.event.agent_name);
        if (idx>=0 && data.agent) agents[idx]=data.agent;
        events.unshift(data.event); if (events.length>200) events.pop();
        // Always just update nodes — never rebuild (preserves current view)
        updateNodes();
        renderSidebar();
        renderTaskEdges();
        // Refresh tasks in background to stay in sync
        fetch("/api/tasks/active").then(r=>r.json()).then(t=>{ activeTasks=t; renderStatsBar(); renderTaskEdges(); }).catch(()=>{});
        debouncedUpdateStats();
        flashNode(data.event.agent_name, data.event.event_type);
        renderStatsBar();
        playSound(data.event.event_type);
    }

    function flashNode(name, type) {
        const sc = STATE_CONFIG[type] || STATE_CONFIG.active;
        const color = sc.color || "#fff";
        const node = d3.select(`[data-agent="${name}"]`);
        if (node.empty()) return;
        node.select(".node-circle")
            .transition().duration(150).attr("r",20).attr("stroke",color).attr("stroke-width",5)
            .transition().duration(800).attr("r",d=>nodeR(d)).attr("stroke",d=>isWorking(d.status)?stateColor(d.status)||d.color:d.color).attr("stroke-width",d=>isWorking(d.status)?3:1.5);
    }

    // ── Stats ─────────────────────────────────────────────
    function debouncedUpdateStats() { clearTimeout(_statsTimer); _statsTimer=setTimeout(()=>updateStats(null),200); }
    async function updateStats(s) {
        if (!s) try { s = await fetch("/api/stats").then(r=>r.json()); } catch(e) { return; }
        // Use local JS state for active count (more accurate than DB which may lag)
        const localActive = agents.filter(a=>isActiveAgent(a)).length;
        document.getElementById("stat-total").textContent=agents.length||s.total_agents||0;
        document.getElementById("stat-active").textContent=localActive||s.active_agents||0;
        document.getElementById("stat-events").textContent=s.total_events||0;
        document.getElementById("stat-tokens").textContent=formatNum(s.total_tokens);
        document.getElementById("stat-tasks").textContent=activeTasks.length;
        // Highlight active card when agents are active
        const activeCard = document.querySelector(".active-card");
        if (activeCard) {
            if (localActive > 0) activeCard.classList.add("has-active");
            else activeCard.classList.remove("has-active");
        }
        renderStatsBar(s);
    }

    function renderStatsBar(s) {
        const bar = document.getElementById("stats-bar");
        // Use isActiveAgent which checks both status AND task participation
        const activeAgents = agents.filter(a=>isActiveAgent(a));
        const activeNames = activeAgents.slice(0,4).map(a=>`<span style="color:${stateColor(a.status)||'var(--green)'}">${esc(a.display_name)}</span>`).join(", ") + (activeAgents.length>4?` +${activeAgents.length-4}`:"");
        const topAgent = agents.reduce((best,a)=>(a.total_invocations||0)>(best.total_invocations||0)?a:best, agents[0]||{});
        // State breakdown — include task-active agents
        const stateCounts = {};
        agents.forEach(a => {
            if (isWorking(a.status)) {
                stateCounts[a.status] = (stateCounts[a.status]||0) + 1;
            } else if (isInActiveTask(a.name)) {
                stateCounts["active"] = (stateCounts["active"]||0) + 1;
            }
        });
        const stateBreakdown = Object.entries(stateCounts).map(([st,ct]) => {
            const cfg = STATE_CONFIG[st] || STATE_CONFIG.active;
            return `<span style="color:${cfg.color}">${cfg.icon}${ct}</span>`;
        }).join(" ");

        bar.innerHTML = `
            <div class="stats-bar-item"><span class="stats-bar-label">Active Now</span><span class="stats-bar-value" style="color:var(--green)">${activeAgents.length}</span><span class="dim" style="font-size:10px;margin-left:4px">${activeNames||'none'}</span></div>
            <div class="stats-bar-divider"></div>
            ${stateBreakdown ? `<div class="stats-bar-item"><span class="stats-bar-label">States</span><span class="stats-bar-value" style="font-size:11px;display:flex;gap:6px;">${stateBreakdown}</span></div><div class="stats-bar-divider"></div>` : ''}
            <div class="stats-bar-item"><span class="stats-bar-label">Active Tasks</span><span class="stats-bar-value" style="color:var(--cyan)">${activeTasks.length}</span></div>
            <div class="stats-bar-divider"></div>
            <div class="stats-bar-item"><span class="stats-bar-label">Top Agent</span><span class="stats-bar-value">${esc(topAgent.display_name||'—')}</span><span class="dim" style="font-size:10px;margin-left:3px">(${topAgent.total_invocations||0})</span></div>
            <div class="stats-bar-divider"></div>
            <div class="stats-bar-item"><span class="stats-bar-label">Last Event</span><span class="stats-bar-value" style="font-size:11px">${events.length?esc(events[0].agent_name)+" → "+esc(events[0].event_type):'—'}</span></div>
        `;
    }

    // ── Category Filters ──────────────────────────────────
    let _filterOpen = false;

    function renderCategoryFilters() {
        const catLabels = {
            "fitsia":"Fitsia IA","specialist":"Especialistas","enterprise":"Empresa",
            "fitness":"Fitness","equipment":"Equipamiento","nutrition":"Nutricion",
            "engineering":"Ingenieria","business":"Negocio","system":"Sistema",
            "development":"Desarrollo","support":"Soporte","testing":"Testing",
            "qa-testing":"QA Testing","devops":"DevOps","dashboard":"Dashboard",
            "eng-leadership":"Liderazgo","eng-backend":"Backend","eng-frontend":"Frontend",
            "eng-mobile":"Mobile","eng-ai":"AI/ML","eng-data":"Data","eng-devops":"DevOps Sq",
            "eng-security":"Security","eng-qa":"QA Sq","eng-product":"Product",
            "eng-integration":"Integracion","eng-advanced":"Avanzado","eng-specialist":"Especialista Sq",
            "sys-maturana":"Maturana"
        };
        const allCats = [...new Set(agents.map(a=>a.category))].sort((a,b)=>{
            const order=["fitsia","enterprise","specialist","engineering","development","support","testing","qa-testing","devops","dashboard","eng-leadership","eng-backend","eng-frontend","eng-mobile","eng-ai","eng-data","eng-devops","eng-security","eng-qa","eng-product","eng-integration","eng-advanced","eng-specialist","sys-maturana","fitness","equipment","nutrition","business","system"];
            return (order.indexOf(a)===-1?99:order.indexOf(a))-(order.indexOf(b)===-1?99:order.indexOf(b));
        });
        const cats = allCats.map(id=>({id, label: catLabels[id]||id}));

        // Group categories dynamically
        const hierarchyGrp = cats.filter(c=>["fitsia","orchestrator","demon","board","c-suite","vp","coordinator","noc","enterprise","system"].includes(c.id));
        const engSquads = cats.filter(c=>c.id.startsWith("eng-"));
        const techGrp = cats.filter(c=>["engineering","development","support","devops","dashboard","specialist"].includes(c.id));
        const qaGrp = cats.filter(c=>["testing","qa-testing"].includes(c.id));
        const domain = cats.filter(c=>["fitness","equipment","nutrition","business","sys-maturana"].includes(c.id));
        // Catch any uncategorized
        const allGrouped = new Set([...hierarchyGrp,...engSquads,...techGrp,...qaGrp,...domain].map(x=>x.id));
        const otherGrp = cats.filter(c=>!allGrouped.has(c.id));

        const activeCount = activeCategories ? activeCategories.size : 0;
        const totalCount = cats.length;

        const renderGroup = (label, items) => items.length === 0 ? "" : `
            <div style="margin-bottom:6px;">
                <div class="filter-group-label">${label}</div>
                <div class="filter-row">${items.map(x=>`<button class="cat-btn ${activeCategories.has(x.id)?'active':''}" data-cat="${x.id}">${x.label}</button>`).join("")}</div>
            </div>`;

        const c = document.getElementById("category-filters");
        c.innerHTML = `
            <div class="filter-row">
                <button class="cat-btn active-only-btn ${showOnlyActive?'active':''}" id="btn-active">${showOnlyActive?'●':'○'} Activos</button>
                <button class="cat-btn" id="btn-all">Todos</button>
                <button class="cat-btn" id="btn-none">Ninguno</button>
                <button class="filter-toggle" id="btn-filter-toggle">${activeCount}/${totalCount} filtros ${_filterOpen?'▲':'▼'}</button>
            </div>
            <div class="filter-dropdown ${_filterOpen?'open':''}" id="filter-dropdown">
                ${renderGroup("Fitsia Hierarchy", hierarchyGrp)}
                ${renderGroup("Tecnologia", techGrp)}
                ${renderGroup("Ing. Squads", engSquads)}
                ${renderGroup("QA / Testing", qaGrp)}
                ${renderGroup("Dominio", domain)}
                ${renderGroup("Otros", otherGrp)}
            </div>
        `;
        document.getElementById("btn-active").onclick=()=>{ showOnlyActive=!showOnlyActive; rebuildGraph(); renderCategoryFilters(); };
        document.getElementById("btn-all").onclick=()=>{ cats.forEach(x=>activeCategories.add(x.id)); rebuildGraph(); renderCategoryFilters(); };
        document.getElementById("btn-none").onclick=()=>{ activeCategories.clear(); rebuildGraph(); renderCategoryFilters(); };
        document.getElementById("btn-filter-toggle").onclick=()=>{ _filterOpen=!_filterOpen; renderCategoryFilters(); };
        c.querySelectorAll("[data-cat]").forEach(b=>{ b.onclick=()=>{ const cat=b.dataset.cat; if(activeCategories.has(cat)) activeCategories.delete(cat); else activeCategories.add(cat); rebuildGraph(); renderCategoryFilters(); }; });
    }

    // ── Search ────────────────────────────────────────────
    function bindSearch() {
        const input = document.getElementById("search-input");
        input.addEventListener("input", () => { searchQuery = input.value.toLowerCase(); renderSidebar(); });
    }

    // ── Toolbar (Teams, Actions, Views) ───────────────────
    let activeTeamFilter = null;

    function renderToolbar() {
        const tb = document.getElementById("toolbar");
        if (!tb) return;

        // Team filter buttons
        const teams = [...new Set(agents.map(a=>a.team))].sort();
        const teamBtns = teams.slice(0,12).map(t =>
            `<button class="tb-btn ${activeTeamFilter===t?'active':''}" data-team="${t}">${esc(t)}</button>`
        ).join("");

        // Action buttons
        const actionBtns = `
            <button class="tb-btn" id="btn-simulate">Simular</button>
            <button class="tb-btn" id="btn-reset-states">Reset</button>
            <button class="tb-btn" id="btn-export-log">Exportar</button>
            <button class="tb-btn danger" id="btn-reseed">Re-seed</button>
            <button class="tb-btn ${debugMode?'active':''}" id="btn-debug">Debug</button>
        `;

        // View buttons
        const viewBtns = `
            <button class="tb-btn active" id="btn-view-organic">Organica</button>
            <button class="tb-btn" id="btn-view-pyramid">Piramide</button>
            <button class="tb-btn" id="btn-view-team">Equipos</button>
            <button class="tb-btn" id="btn-view-departments">Departamentos</button>
            <button class="tb-btn" id="btn-view-grid">Grid</button>
            <button class="tb-btn" id="btn-view-radial">Radial</button>
        `;

        tb.innerHTML = `
            <div class="toolbar-group">
                <span class="toolbar-group-label">Acciones</span>
                ${actionBtns}
            </div>
            <div class="toolbar-group">
                <span class="toolbar-group-label">Vista</span>
                ${viewBtns}
            </div>
        `;

        // Action handlers
        const simBtn = document.getElementById("btn-simulate");
        if (simBtn) simBtn.onclick = () => {
            const name = selectedAgent || "fitsia-orchestrator";
            fetch(`/api/simulate/${name}`, {method:"POST"}).then(()=>{ });
        };

        const resetBtn = document.getElementById("btn-reset-states");
        if (resetBtn) resetBtn.onclick = async () => {
            const working = agents.filter(a=>isWorking(a.status));
            for (const a of working) {
                await fetch("/api/event", {method:"POST", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({agent_name:a.name,event_type:"completed",detail:"Manual reset"})});
            }
        };

        const exportBtn = document.getElementById("btn-export-log");
        if (exportBtn) exportBtn.onclick = async () => {
            const evts = await fetch("/api/events?limit=500").then(r=>r.json());
            const blob = new Blob([JSON.stringify(evts,null,2)], {type:"application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download="agent_events.json"; a.click();
            URL.revokeObjectURL(url);
        };

        const reseedBtn = document.getElementById("btn-reseed");
        if (reseedBtn) reseedBtn.onclick = async () => {
            const a = await fetch("/api/agents").then(r=>r.json());
            agents = a;
            rebuildGraph();
            renderSidebar();
        };

        // View handlers
        const viewBtnsAll = tb.querySelectorAll("[id^='btn-view-']");
        // Restore active state from currentView
        viewBtnsAll.forEach(x => { x.classList.toggle("active", x.id === currentView); });
        viewBtnsAll.forEach(b => {
            b.onclick = () => {
                viewBtnsAll.forEach(x => x.classList.remove("active"));
                b.classList.add("active");
                currentView = b.id; // Save current view
                applyView(b.id);
            };
        });
    function applyView(viewId) {
        if (!simulation) return;
        const ct=document.getElementById("graph-container"), w=ct.clientWidth, h=ct.clientHeight;
                // Clear fixed positions and restore visibility from pyramid view
                _pyramidLevels = {};
                allNodesData.forEach(d => { d.fx = null; d.fy = null; });
                if (nodeGroup) nodeGroup.selectAll("g").attr("visibility", "visible");
                if (linkGroup) linkGroup.selectAll("*").attr("visibility", "visible");
                if (viewId === "btn-view-organic") {
                    simulation.force("charge").strength(-120);
                    simulation.force("x", d3.forceX(d=>d.tx||w/2).strength(d=>d.isTeam?0.15:0.03));
                    simulation.force("y", d3.forceY(d=>d.ty||h/2).strength(d=>d.isTeam?0.15:0.03));
                    simulation.alpha(0.5).restart();
                } else if (viewId === "btn-view-pyramid") {
                    // ═══════════════════════════════════════════════════════════
                    // CORPORATE PYRAMID v4 — ALL 1,299 NODES GET fx/fy
                    // NO forces. Every single node gets a computed fixed position.
                    // Hierarchy at top (pyramid shape), specialists at bottom (grid).
                    // ═══════════════════════════════════════════════════════════

                    // ── Step 1: Map ALL teams to tiers ──
                    // Tiers 0-8 = leadership pyramid (top)
                    // Tier 9 = specialist base (bottom)
                    const teamToTier = {
                        "Supreme Orchestrator": 0,
                        "Control Demons": 1,
                        "Board of Directors": 2,
                        "C-Suite": 3,
                        "Vice Presidents": 4,
                        "Coordinators": 5,
                        "NoC Evolution": 5,
                        "Directors": 6,
                        "Tech Leads": 7,
                        "Eng Managers": 7,
                        "Platform Leadership": 8,
                        "AI Leadership": 8,
                        "Growth Leadership": 8,
                    };
                    const SPEC_TIER = 9;

                    // ── Step 2: Bucket ALL agents ──
                    const tierBuckets = {};
                    _pyramidLevels = {};
                    const specByTeam = {}; // team → [names]
                    agents.forEach(a => {
                        if (a.isTeam) return;
                        const tier = teamToTier[a.team];
                        if (tier !== undefined) {
                            if (!tierBuckets[tier]) tierBuckets[tier] = [];
                            tierBuckets[tier].push(a.name);
                            _pyramidLevels[a.name] = tier;
                        } else {
                            // Specialist — group by team
                            if (!specByTeam[a.team]) specByTeam[a.team] = [];
                            specByTeam[a.team].push(a.name);
                            _pyramidLevels[a.name] = SPEC_TIER;
                        }
                    });

                    // ── Step 3: Compute positions for HIERARCHY tiers ──
                    const fixedPos = {};
                    const tiers = Object.keys(tierBuckets).map(Number).sort((a, b) => a - b);
                    const tierCount = tiers.length;

                    // Layout constants — use FULL canvas width, account for padding
                    const pad = 20;
                    const usableW = w - pad * 2;

                    // Hierarchy = top 35% of canvas (more room for labels)
                    const hierTop = pad + 20;
                    const hierBottom = h * 0.34;
                    const tierSpacing = (hierBottom - hierTop) / Math.max(tierCount - 1, 1);
                    const MAX_PER_ROW = 30;

                    tiers.forEach((tier, ti) => {
                        const names = tierBuckets[tier];
                        const baseY = hierTop + ti * tierSpacing;
                        // Pyramid width: 8% at top → 96% at bottom
                        const widthPct = 0.08 + (ti / Math.max(tierCount - 1, 1)) * 0.88;
                        const totalW = usableW * widthPct;
                        const startX = pad + (usableW - totalW) / 2;

                        if (names.length <= MAX_PER_ROW) {
                            const gap = totalW / Math.max(names.length, 1);
                            names.forEach((name, ni) => {
                                fixedPos[name] = { x: startX + (ni + 0.5) * gap, y: baseY };
                            });
                        } else {
                            const rows = Math.ceil(names.length / MAX_PER_ROW);
                            const rowH = Math.min(tierSpacing * 0.4 / rows, 24);
                            names.forEach((name, ni) => {
                                const row = Math.floor(ni / MAX_PER_ROW);
                                const col = ni % MAX_PER_ROW;
                                const inRow = Math.min(MAX_PER_ROW, names.length - row * MAX_PER_ROW);
                                const gap = totalW / Math.max(inRow, 1);
                                fixedPos[name] = { x: startX + (col + 0.5) * gap, y: baseY + row * rowH };
                            });
                        }
                    });

                    // ── Step 4: Compute positions for ALL SPECIALISTS ──
                    // Distribute across FULL canvas width in team blocks
                    const specTeamNames = Object.keys(specByTeam).sort();
                    const specStartY = h * 0.38;
                    const specEndY = h - pad;
                    const specH = specEndY - specStartY;

                    // Layout: 5 columns of teams, teams wrap vertically
                    const gridCols = 5;
                    const teamBlockW = usableW / gridCols;
                    const teamBlockH = specH / Math.ceil(specTeamNames.length / gridCols);
                    const sp = 28; // node spacing within team block

                    specTeamNames.forEach((team, ti) => {
                        const names = specByTeam[team];
                        const gridCol = ti % gridCols;
                        const gridRow = Math.floor(ti / gridCols);

                        // Block position
                        const blockX = pad + gridCol * teamBlockW;
                        const blockY = specStartY + gridRow * teamBlockH;
                        const blockCenterX = blockX + teamBlockW / 2;

                        // Lay agents in a compact grid within their block
                        const perRow = Math.ceil(Math.sqrt(names.length * (teamBlockW / teamBlockH)));
                        const clampedPerRow = Math.max(perRow, 3);

                        names.forEach((name, ni) => {
                            const c = ni % clampedPerRow;
                            const r = Math.floor(ni / clampedPerRow);
                            fixedPos[name] = {
                                x: blockCenterX + (c - clampedPerRow / 2) * sp,
                                y: blockY + 8 + r * sp
                            };
                        });
                    });

                    // ── Step 5: LOCK ALL nodes with fx/fy ──
                    // EVERY node gets a position. Nothing floats.
                    let unpositioned = 0;
                    allNodesData.forEach(d => {
                        const pos = fixedPos[d.name || d.id];
                        if (pos) {
                            d.fx = pos.x;
                            d.fy = pos.y;
                        } else {
                            // Catch-all: anything without a position (including orphans)
                            const fallbackCol = unpositioned % 20;
                            const fallbackRow = Math.floor(unpositioned / 20);
                            d.fx = pad + 30 + fallbackCol * 28;
                            d.fy = specStartY + specH * 0.85 + fallbackRow * 28;
                            unpositioned++;
                        }
                    });

                    // ── Step 6: Hide team bubble nodes AND links ──
                    // Hide team bubble nodes but keep task delegation links visible
                    nodeGroup.selectAll("g").each(function(d) {
                        d3.select(this).attr("visibility", (d && d.isTeam) ? "hidden" : "visible");
                    });
                    // Hide member links (agent→team) but keep task links visible for arrows
                    linkGroup.selectAll("line.member-link").attr("visibility", "hidden");
                    linkGroup.selectAll("line.team-link").attr("visibility", "hidden");
                    // Task delegation edges (arrows) remain visible via taskLinkGroup

                    // ── Step 7: Disable ALL forces (everything is fixed) ──
                    simulation.force("charge").strength(0);
                    simulation.force("x", d3.forceX(0).strength(0));
                    simulation.force("y", d3.forceY(0).strength(0));
                    simulation.alpha(0.3).restart();
                } else if (viewId === "btn-view-team") {
                    simulation.force("charge").strength(-40);
                    simulation.force("x", d3.forceX(d => {
                        const teams=[...new Set(agents.map(a=>a.team))].sort();
                        const idx=teams.indexOf(d.team);
                        const cols=4;
                        return (idx%cols)*(w/cols)+w/(cols*2);
                    }).strength(0.3));
                    simulation.force("y", d3.forceY(d => {
                        const teams=[...new Set(agents.map(a=>a.team))].sort();
                        const idx=teams.indexOf(d.team);
                        const cols=4;
                        return Math.floor(idx/cols)*(h/3)+h/6;
                    }).strength(0.3));
                    simulation.alpha(1).restart();
                } else if (viewId === "btn-view-departments") {
                    // Department view: C-Suite execs as gravity centers, teams orbit around them
                    const deptCenters = [
                        {name:"fitsia-orchestrator", label:"Orchestrator", x:w*0.5, y:h*0.08},
                        {name:"ceo-fitsi", label:"CEO", x:w*0.5, y:h*0.2},
                        {name:"chief-technology-officer", label:"CTO", x:w*0.3, y:h*0.35},
                        {name:"cpo-fitsi", label:"CPO", x:w*0.7, y:h*0.35},
                        {name:"cdao-fitsi", label:"CDAO (AI/Data)", x:w*0.5, y:h*0.5},
                        {name:"cgo-fitsi", label:"CGO (Growth)", x:w*0.85, y:h*0.5},
                        {name:"coo-fitsi", label:"COO", x:w*0.15, y:h*0.5},
                        {name:"cfo-fitsi", label:"CFO", x:w*0.15, y:h*0.7},
                        {name:"ciso-fitsi", label:"CISO", x:w*0.35, y:h*0.7},
                        {name:"chro-fitsi", label:"CHRO", x:w*0.55, y:h*0.7},
                        {name:"vp-of-engineering", label:"VP Engineering", x:w*0.2, y:h*0.85},
                        {name:"vp-of-ai-systems", label:"VP AI", x:w*0.5, y:h*0.85},
                        {name:"head-of-marketing", label:"Head Marketing", x:w*0.8, y:h*0.85},
                    ];
                    // Map teams to their executive gravity center
                    const categoryToDept = {
                        "orchestrator":"fitsia-orchestrator",
                        "demon":"fitsia-orchestrator",
                        "board":"ceo-fitsi",
                        "c-suite":"ceo-fitsi",
                        "vp":"ceo-fitsi",
                        "coordinator":"ceo-fitsi",
                        "noc":"cdao-fitsi",
                    };
                    const teamToDept = {
                        "Supreme Orchestrator":"fitsia-orchestrator",
                        "Control Demons":"fitsia-orchestrator",
                        "Board of Directors":"ceo-fitsi",
                        "C-Suite":"ceo-fitsi",
                        "Vice Presidents":"ceo-fitsi",
                        "Coordinators":"ceo-fitsi",
                        "NoC Evolution":"cdao-fitsi",
                        "Backend Engineering":"chief-technology-officer",
                        "Engineering":"chief-technology-officer",
                        "Architecture":"chief-technology-officer",
                        "CTO Office":"chief-technology-officer",
                        "Infrastructure":"coo-fitsi",
                        "Platform Leadership":"coo-fitsi",
                        "AI Engineering":"cdao-fitsi",
                        "AI Leadership":"cdao-fitsi",
                        "Data Engineering":"cdao-fitsi",
                        "Teoria de Sistemas":"cdao-fitsi",
                        "Mobile Core":"chief-technology-officer",
                        "Fitsia Core":"cpo-fitsi",
                        "Product Engineering":"cpo-fitsi",
                        "Specialized":"cpo-fitsi",
                        "Specialists":"cpo-fitsi",
                        "Growth Leadership":"cgo-fitsi",
                        "Quality Engineering":"vp-of-engineering",
                        "QA Testing":"vp-of-engineering",
                        "Security":"ciso-fitsi",
                        "Tech Leads":"chief-technology-officer",
                        "Eng Managers":"chief-technology-officer",
                        "Heads":"ceo-fitsi",
                        "Directors":"ceo-fitsi",
                        "VP Layer":"ceo-fitsi",
                        "Dashboard":"coo-fitsi",
                    };
                    const centerMap = {};
                    deptCenters.forEach(dc => { centerMap[dc.name] = dc; });

                    simulation.force("charge").strength(d => {
                        if (centerMap[d.name || d.id]) return -600;
                        return -15;
                    });
                    simulation.force("x", d3.forceX(d => {
                        const dc = centerMap[d.name || d.id];
                        if (dc) return dc.x;
                        const deptName = teamToDept[d.team] || categoryToDept[d.category] || "chief-technology-officer";
                        const deptCenter = centerMap[deptName];
                        if (deptCenter) return deptCenter.x + (Math.random()-0.5)*90;
                        return w/2;
                    }).strength(d => centerMap[d.name||d.id] ? 0.8 : 0.12));
                    simulation.force("y", d3.forceY(d => {
                        const dc = centerMap[d.name || d.id];
                        if (dc) return dc.y;
                        const deptName = teamToDept[d.team] || categoryToDept[d.category] || "chief-technology-officer";
                        const deptCenter = centerMap[deptName];
                        if (deptCenter) return deptCenter.y + (Math.random()-0.5)*90;
                        return h/2;
                    }).strength(d => centerMap[d.name||d.id] ? 0.8 : 0.12));
                    simulation.alpha(1).restart();
                } else if (viewId === "btn-view-grid") {
                    // Grid: all agents in a uniform grid layout
                    const visible = getVisible().filter(d=>!d.isTeam);
                    const cols = Math.ceil(Math.sqrt(visible.length));
                    const cellW = w / (cols + 1);
                    const cellH = h / (Math.ceil(visible.length/cols) + 1);
                    const nameToGrid = {};
                    visible.forEach((a, i) => {
                        nameToGrid[a.name || a.id] = {
                            x: (i % cols + 1) * cellW,
                            y: (Math.floor(i / cols) + 1) * cellH,
                        };
                    });
                    simulation.force("charge").strength(-15);
                    simulation.force("x", d3.forceX(d => {
                        if (d.isTeam) return -200; // Push teams off-screen
                        const pos = nameToGrid[d.name||d.id];
                        return pos ? pos.x : w/2;
                    }).strength(0.6));
                    simulation.force("y", d3.forceY(d => {
                        if (d.isTeam) return -200;
                        const pos = nameToGrid[d.name||d.id];
                        return pos ? pos.y : h/2;
                    }).strength(0.6));
                    simulation.alpha(1).restart();
                } else if (viewId === "btn-view-radial") {
                    // Radial: Orchestrator at center, 7 layers radiate outward
                    const layerRadius = [0, 60, 130, 200, 280, 370, 480];
                    const layers = {
                        0: ["fitsia-orchestrator"],
                        1: ["demon-decision","demon-performance","demon-intelligence","demon-security","demon-data","demon-growth","demon-experimentation","demon-operations","demon-evolution","demon-crisis"],
                        2: ["board-chairman","board-advisor-growth","board-advisor-finance","board-advisor-people","board-advisor-tech"],
                        3: ["ceo-fitsi","coo-fitsi","chief-technology-officer","cpo-fitsi","cfo-fitsi","cdao-fitsi","cgo-fitsi","ciso-fitsi","chro-fitsi"],
                        4: ["vp-of-engineering","vp-of-mobile-engineering","chief-software-architect","vp-of-platform","vp-of-ai-systems","vp-of-product","head-of-ux-research","head-of-marketing","head-of-growth-engineering","head-of-operations","head-of-partnerships","head-of-revenue","head-of-compliance","head-of-talent"],
                        5: ["fitsia-feature-coordinator","fitsia-frontend-coordinator","fitsia-backend-coordinator","fitsia-ai-coordinator","fitsia-science-coordinator","fitsia-devops-coordinator","fitsia-qa-coordinator","fitsia-marketing-coordinator","fitsia-content-coordinator","fitsia-equipment-coordinator"],
                    };
                    const nameToRadial = {};
                    for (const [layer, names] of Object.entries(layers)) {
                        const r = layerRadius[parseInt(layer)] || 500;
                        names.forEach((n, i) => {
                            const angle = (i / names.length) * Math.PI * 2 - Math.PI/2;
                            nameToRadial[n] = { x: w/2 + Math.cos(angle)*r, y: h/2 + Math.sin(angle)*r };
                        });
                    }
                    simulation.force("charge").strength(d => nameToRadial[d.name||d.id] ? -300 : -10);
                    simulation.force("x", d3.forceX(d => {
                        const pos = nameToRadial[d.name||d.id];
                        if (pos) return pos.x;
                        if (d.isTeam) return -200;
                        // L6 specialists: outer ring distributed by team
                        const teams=[...new Set(agents.filter(a=>!nameToRadial[a.name]).map(a=>a.team))].sort();
                        const idx=teams.indexOf(d.team);
                        const angle=(idx/teams.length)*Math.PI*2-Math.PI/2;
                        return w/2+Math.cos(angle)*(layerRadius[6]||480);
                    }).strength(d => nameToRadial[d.name||d.id] ? 0.85 : 0.08));
                    simulation.force("y", d3.forceY(d => {
                        const pos = nameToRadial[d.name||d.id];
                        if (pos) return pos.y;
                        if (d.isTeam) return -200;
                        const teams=[...new Set(agents.filter(a=>!nameToRadial[a.name]).map(a=>a.team))].sort();
                        const idx=teams.indexOf(d.team);
                        const angle=(idx/teams.length)*Math.PI*2-Math.PI/2;
                        return h/2+Math.sin(angle)*(layerRadius[6]||480);
                    }).strength(d => nameToRadial[d.name||d.id] ? 0.85 : 0.08));
                    simulation.alpha(1).restart();
                }
    } // end applyView

        // (Team buttons removed from toolbar — now in category filters)

        // Debug button handler
        const debugBtn = document.getElementById("btn-debug");
        if (debugBtn) debugBtn.onclick = () => {
            debugMode = !debugMode;
            debugBtn.classList.toggle("active", debugMode);
            updateNodes();
        };
    }

    // ── Sidebar (lazy rendering — skip if document hidden) ─
    function renderSidebar() {
        _sidebarDirty = true;
        if (!document.hidden) _renderSidebarNow();
    }
    function _renderSidebarNow() {
        if (!_sidebarDirty) return;
        _sidebarDirty = false;
        const c = document.getElementById("sidebar-content");
        if (activeTab==="agents") renderAgentList(c);
        else if (activeTab==="command") renderCommandPanel(c);
        else if (activeTab==="tasks") renderTaskList(c);
        else if (activeTab==="metrics") renderMetricsPanel(c);
        else if (activeTab==="executive") renderExecutivePanel(c);
        else if (activeTab==="brain") renderBrainPanel(c);
        else renderEventLog(c);
    }
    // Render when tab becomes visible again
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && _sidebarDirty) _renderSidebarNow();
    });

    function getAgentTask(name) {
        if (selectedTask) {
            const tasks = allTasks.length ? allTasks : activeTasks;
            const st = tasks.find(t=>t.task_id===selectedTask);
            if (st) { const a=st.agents.find(x=>x.agent_name===name); if(a) return {task:st,role:a.role}; }
        }
        for (const t of activeTasks) { const a=t.agents.find(x=>x.agent_name===name); if(a) return {task:t,role:a.role}; }
        if (allTasks.length) { for (const t of allTasks) { const a=t.agents.find(x=>x.agent_name===name); if(a) return {task:t,role:a.role}; } }
        return null;
    }

    function renderAgentList(c) {
        let filtered = agents.filter(a=>activeCategories.has(a.category));
        if (showOnlyActive) filtered=filtered.filter(a=>isActiveAgent(a));
        if (searchQuery) filtered=filtered.filter(a=>a.display_name.toLowerCase().includes(searchQuery)||a.name.includes(searchQuery)||a.team.toLowerCase().includes(searchQuery));
        const byTeam={}; filtered.forEach(a=>{ if(!byTeam[a.team]) byTeam[a.team]=[]; byTeam[a.team].push(a); });
        let html="";
        for (const [team,members] of Object.entries(byTeam)) {
            html+=`<div class="team-header">${esc(team)} <span style="opacity:0.4">(${members.length})</span></div>`;
            for (const a of members) {
                const sc = STATE_CONFIG[a.status] || STATE_CONFIG.idle;
                const dotClass = isWorking(a.status) ? "active" : a.status==="error" ? "error" : "";
                const at = getAgentTask(a.name);
                const statusBadge = a.status !== "idle" ? `<span class="agent-status-badge" style="color:${sc.color||'var(--text-dim)'}">${sc.icon} ${sc.label}</span>` : '';
                html+=`<div class="agent-item ${selectedAgent===a.name?'selected':''} ${isWorking(a.status)?'is-active':''}" data-name="${a.name}">
                    <span class="agent-dot ${dotClass}" style="background:${sc.color||a.color}"></span>
                    <span class="agent-name">${esc(a.display_name)}${statusBadge}${at?`<br><span class="agent-task-label">${esc(at.role)} → ${esc(at.task.task_name)}</span>`:''}</span>
                    <span class="agent-count">${a.total_invocations||0}</span>
                </div>`;
            }
        }
        c.innerHTML=html||'<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">No agents match</div>';
        c.querySelectorAll(".agent-item").forEach(el=>{ el.onclick=()=>showDetail(el.dataset.name); });
    }

    // ── Command Output Live Update ──────────────────────
    function updateCommandOutput(taskId) {
        const el = document.getElementById("command-live-output");
        if (!el) return;
        const text = commandOutput[taskId] || "";
        el.textContent = text.slice(-3000); // last 3000 chars
        el.scrollTop = el.scrollHeight;
    }

    // ── Command Panel ─────────────────────────────────────
    function renderCommandPanel(c) {
        const hasActive = activeCommandId && commandOutput[activeCommandId];
        c.innerHTML = `
            <div class="command-panel">
                <div class="command-title">COMMAND CENTER <span style="color:var(--green);font-size:9px;">LIVE CLI</span></div>
                <div class="command-subtitle">Ejecuta tareas reales via Claude CLI. El output aparece en tiempo real abajo.</div>
                <textarea id="command-input" class="command-input" placeholder="Describe la tarea... Ej: 'Auditar seguridad del backend en /apps/fitsi', 'Revisar el codigo del sync de Odoo'" rows="3"></textarea>
                <div style="display:flex;gap:6px;">
                    <button id="command-send" class="command-send-btn" style="flex:1;">EXECUTE</button>
                    ${activeCommandId ? `<button id="command-cancel" class="command-cancel-btn">CANCEL</button>` : ''}
                </div>
                <div id="command-preview" class="command-preview"></div>
                ${hasActive || Object.keys(commandOutput).length ? `
                    <div class="command-output-title">${activeCommandId ? 'LIVE OUTPUT' : 'LAST OUTPUT'} <span class="mono" style="font-size:9px;color:var(--text-dim);">${activeCommandId || Object.keys(commandOutput).pop() || ''}</span></div>
                    <pre id="command-live-output" class="command-live-output">${esc(commandOutput[activeCommandId || Object.keys(commandOutput).pop()] || '').slice(-3000)}</pre>
                ` : ''}
                <div id="command-history" class="command-history">
                    <div class="command-history-title">RECENT COMMANDS</div>
                    ${allTasks.slice(0,6).map(t => {
                        const isActive = t.status === 'active';
                        return `<div class="command-history-item ${isActive?'active':''}">
                            <span class="command-history-dot" style="background:${isActive?'var(--green)':'#444'}"></span>
                            <span class="command-history-text">${esc(t.task_name)}</span>
                            <span class="command-history-status">${isActive?'ACTIVE':'DONE'}</span>
                        </div>`;
                    }).join("") || '<div style="color:var(--text-dim);font-size:10px;padding:4px;">No commands yet</div>'}
                </div>
            </div>
        `;

        const input = document.getElementById("command-input");
        const preview = document.getElementById("command-preview");
        let previewTimer = null;

        // Live preview of routing
        input.addEventListener("input", () => {
            clearTimeout(previewTimer);
            const val = input.value.trim();
            if (val.length < 3) { preview.innerHTML = ""; return; }
            previewTimer = setTimeout(async () => {
                try {
                    const r = await fetch(`/api/route?prompt=${encodeURIComponent(val)}`).then(r=>r.json());
                    preview.innerHTML = `
                        <div class="route-preview">
                            <div class="route-label">ROUTE: <span style="color:var(--accent);font-weight:700;">${esc(r.route.toUpperCase())}</span></div>
                            <div class="route-agents">
                                ${r.agents.map(a => {
                                    const ag = agents.find(x=>x.name===a.name);
                                    return `<div class="route-agent">
                                        <span style="color:${roleColor(a.role)};font-weight:700;font-size:9px;text-transform:uppercase;min-width:60px;display:inline-block;">${esc(a.role)}</span>
                                        <span>${esc(ag?.display_name || a.name)}</span>
                                    </div>`;
                                }).join("")}
                            </div>
                        </div>
                    `;
                } catch(e) { preview.innerHTML = ""; }
            }, 300);
        });

        // Ctrl+Enter to send
        input.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                document.getElementById("command-send")?.click();
            }
        });

        document.getElementById("command-send").onclick = async () => {
            const val = input.value.trim();
            if (!val) return;
            playSound("command_sent");
            const btn = document.getElementById("command-send");
            btn.textContent = "EXECUTING...";
            btn.disabled = true;
            try {
                const r = await fetch("/api/command", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ prompt: val }),
                }).then(r=>r.json());
                activeCommandId = r.task_id;
                commandOutput[r.task_id] = "";
                input.value = "";
                preview.innerHTML = `<div style="color:var(--green);font-size:11px;padding:6px;">Dispatched: ${esc(r.task_id)} via ${esc(r.route)} — Claude CLI running...</div>`;
                // Re-render to show live output and cancel button
                setTimeout(() => renderSidebar(), 500);
            } catch(e) {
                preview.innerHTML = '<div style="color:var(--red);font-size:11px;padding:6px;">Error dispatching</div>';
            }
            btn.textContent = "EXECUTE";
            btn.disabled = false;
        };

        // Cancel button
        const cancelBtn = document.getElementById("command-cancel");
        if (cancelBtn) {
            cancelBtn.onclick = async () => {
                if (!activeCommandId) return;
                await fetch(`/api/command/cancel/${activeCommandId}`, { method: "POST" });
                activeCommandId = null;
                renderSidebar();
            };
        }
    }

    function renderTaskList(c) {
        const tasks = allTasks.length ? allTasks : activeTasks;
        if (!tasks.length) { c.innerHTML='<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">No tasks yet</div>'; return; }
        c.innerHTML=tasks.map(t=>{
            const isActive = t.status==='active';
            const isSelected = selectedTask===t.task_id;
            const borderColor = isActive ? 'var(--green)' : '#333';
            const selectedBg = isSelected ? 'rgba(99,102,241,0.1)' : 'var(--bg)';
            const priorityColors = {critical:'#ef4444',high:'#f97316',medium:'#eab308',low:'#666'};
            const prioColor = priorityColors[t.priority] || '#666';
            const statusBadge = isActive
                ? '<span style="background:#22c55e;color:#000;font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px;">ACTIVE</span>'
                : '<span style="background:#222;color:#666;font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px;">DONE</span>';
            const completedAt = t.completed_at ? `<div style="font-size:9px;color:var(--text-dim);margin-top:4px;">Completed: ${formatTime(t.completed_at)}</div>` : '';

            // Group agents by role for cleaner display
            const roleGroups = {};
            (t.agents||[]).forEach(a => {
                if (!roleGroups[a.role]) roleGroups[a.role]=[];
                roleGroups[a.role].push(a);
            });

            const agentsHtml = Object.entries(roleGroups).map(([role, agentList]) => {
                const roleItems = agentList.map(a => {
                    const agData = agents.find(x=>x.name===a.agent_name);
                    const sc = STATE_CONFIG[agData?.status] || STATE_CONFIG.idle;
                    const isWorking_ = isActive && agData && isWorking(agData.status);
                    const displayName = agData?.display_name || a.agent_name;
                    return `<div style="display:flex;align-items:center;gap:4px;padding:2px 0;">
                        <span style="width:5px;height:5px;border-radius:50%;background:${isWorking_?sc.color||'#22c55e':'#333'};flex-shrink:0;"></span>
                        <span style="font-size:10px;color:${isWorking_?'#fff':'var(--text)'};">${esc(displayName)}</span>
                        ${isWorking_?`<span style="color:${sc.color};font-size:7px;font-weight:700;">${sc.label}</span>`:''}
                    </div>`;
                }).join("");
                return `<div style="margin-top:6px;">
                    <div style="color:${roleColor(role)};font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;padding-left:2px;">${esc(role)}</div>
                    <div style="padding-left:10px;border-left:2px solid ${roleColor(role)}30;">${roleItems}</div>
                </div>`;
            }).join("");

            return `
            <div class="task-item" data-task-id="${esc(t.task_id)}" style="background:${selectedBg};border-radius:6px;padding:10px;margin-bottom:8px;border-left:3px solid ${borderColor};cursor:pointer;transition:background 0.15s;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    ${statusBadge}
                    ${t.priority?`<span style="color:${prioColor};font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${esc(t.priority)}</span>`:''}
                </div>
                <div style="font-weight:700;font-size:11px;line-height:1.3;margin-bottom:4px;">${esc(t.task_name)}</div>
                <div style="font-size:9px;color:var(--text-dim);font-family:'JetBrains Mono',mono;margin-bottom:2px;">${esc(t.task_id)}</div>
                <div style="font-size:9px;color:var(--text-dim);">${(t.agents||[]).length} agentes</div>
                ${completedAt}
                ${agentsHtml}
            </div>`;
        }).join("");
        c.querySelectorAll(".task-item").forEach(el=>{
            el.onclick=()=>selectTask(el.dataset.taskId);
        });
    }

    function selectTask(taskId) {
        if (selectedTask===taskId) { selectedTask=null; unhighlightChain(); renderSidebar(); renderTaskEdges(); return; }
        selectedTask=taskId;
        const task=(allTasks.length?allTasks:activeTasks).find(t=>t.task_id===taskId);
        if (!task) return;
        renderSidebar();
        const chainNames=new Set();
        task.agents.forEach(a=>{ chainNames.add(a.agent_name); if(a.delegated_by) chainNames.add(a.delegated_by); });
        nodeGroup.selectAll("g").attr("opacity",d=>chainNames.has(d.id)||d.isTeam?1:0.12);
        renderTaskEdgesForTask(task);
    }

    function renderTaskEdgesForTask(task) {
        taskLinkGroup.selectAll("*").remove();
        for (const ag of (task.agents||[])) {
            if (!ag.delegated_by) continue;
            const arrowColors={"#22c55e":0,"#ef4444":1,"#f97316":2,"#06b6d4":3,"#ec4899":4};
            const color=roleColor(ag.role);
            const arrowIdx=arrowColors[color]||0;
            const isCompleted=task.status==='completed';
            taskLinkGroup.append("path")
                .attr("class","task-edge task-edge-active")
                .attr("fill","none")
                .attr("stroke",color)
                .attr("stroke-width",isCompleted?1.5:2)
                .attr("stroke-opacity",isCompleted?0.5:0.7)
                .attr("stroke-dasharray",ag.role==="security"?"8,4":"10,5")
                .attr("marker-end",`url(#arrow-${arrowIdx})`)
                .attr("data-from",ag.delegated_by)
                .attr("data-to",ag.agent_name);
            taskLinkGroup.append("text")
                .attr("class","edge-label")
                .attr("fill",color)
                .attr("text-anchor","middle")
                .attr("dy",-5)
                .attr("font-size","9px")
                .attr("data-from",ag.delegated_by)
                .attr("data-to",ag.agent_name)
                .attr("data-type","label")
                .text(ag.role);
        }
    }

    // ── Executive Dashboard Panel ─────────────────────────
    let _execRefreshTimer = null;

    function renderExecutivePanel(c) {
        c.innerHTML = '<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">Loading executive data...</div>';

        if (_execRefreshTimer) { clearInterval(_execRefreshTimer); _execRefreshTimer = null; }

        async function fetchAndRender() {
            let stats = {}, leaderboard = [], health = {};
            try {
                const [sRes, lRes, hRes] = await Promise.all([
                    fetch("/api/stats").then(r => r.ok ? r.json() : {}),
                    fetch("/api/leaderboard").then(r => r.ok ? r.json() : []),
                    fetch("/api/health").then(r => r.ok ? r.json() : {}),
                ]);
                stats = sRes; leaderboard = lRes; health = hRes;
            } catch(e) {}

            if (activeTab !== "executive") return;

            const localActive = agents.filter(a => isActiveAgent(a)).length;
            const totalAgents = agents.length || stats.total_agents || 0;
            const totalEvents = stats.total_events || 0;
            const totalTokens = stats.total_tokens || 0;

            let topAgents = leaderboard.slice(0, 3);
            if (!topAgents.length && agents.length) {
                topAgents = agents.filter(a => a.total_invocations > 0)
                    .sort((a, b) => (b.total_invocations || 0) - (a.total_invocations || 0))
                    .slice(0, 3)
                    .map(a => ({ display_name: a.display_name, name: a.name, score: 0, tasks_completed: a.total_invocations || 0 }));
            }

            const mostUsed = agents.reduce((best, a) => (a.total_invocations || 0) > (best.total_invocations || 0) ? a : best, agents[0] || {});

            const errorAgents = agents.filter(a => a.status === "error");
            const now = Date.now();
            const idleAgents = agents.filter(a => {
                if (!a.last_active) return true;
                return (now - new Date(a.last_active).getTime()) > 86400000;
            });

            const uptime = health.uptime_seconds ? (health.uptime_seconds / 3600).toFixed(1) + "h" : (health.status === "ok" ? "OK" : "--");

            const recentEvents = events.slice(0, 5);

            let html = '';

            html += `<div class="exec-card">
                <div class="exec-card-title">SISTEMA</div>
                <div class="exec-card-grid">
                    <div class="exec-kpi"><span class="exec-kpi-val">${totalAgents}</span><span class="exec-kpi-label">Agentes</span></div>
                    <div class="exec-kpi"><span class="exec-kpi-val highlight">${localActive}</span><span class="exec-kpi-label">Activos</span></div>
                    <div class="exec-kpi"><span class="exec-kpi-val">${activeTasks.length}</span><span class="exec-kpi-label">Tasks Activas</span></div>
                    <div class="exec-kpi"><span class="exec-kpi-val">${formatNum(totalEvents)}</span><span class="exec-kpi-label">Eventos</span></div>
                </div>
            </div>`;

            const topHtml = topAgents.map((a, i) => {
                const rank = i === 0 ? "gold" : i === 1 ? "silver" : "bronze";
                const label = a.display_name || a.name;
                const scoreVal = a.score != null ? a.score : a.tasks_completed || 0;
                return `<div style="display:flex;align-items:center;gap:6px;font-size:10px;padding:2px 0;">
                    <span class="leaderboard-rank ${rank}" style="font-size:11px;min-width:18px;">#${i + 1}</span>
                    <span style="flex:1;font-weight:500;">${esc(label)}</span>
                    <span class="mono" style="font-size:10px;color:var(--accent);">${scoreVal}</span>
                </div>`;
            }).join("");

            html += `<div class="exec-card">
                <div class="exec-card-title">RENDIMIENTO</div>
                <div style="margin-bottom:6px;">${topHtml || '<div style="font-size:10px;color:var(--text-dim);">Sin datos</div>'}</div>
                <div class="exec-card-grid">
                    <div class="exec-kpi"><span class="exec-kpi-val" style="font-size:12px;">${esc(mostUsed.display_name || '--')}</span><span class="exec-kpi-label">Mas Usado</span></div>
                    <div class="exec-kpi"><span class="exec-kpi-val">${formatNum(totalTokens)}</span><span class="exec-kpi-label">Tokens</span></div>
                </div>
            </div>`;

            const errorClass = errorAgents.length > 0 ? "danger" : "";
            const idleClass = idleAgents.length > 5 ? "warn" : "";

            html += `<div class="exec-card">
                <div class="exec-card-title">SALUD</div>
                <div class="exec-card-grid">
                    <div class="exec-kpi"><span class="exec-kpi-val ${errorClass}">${errorAgents.length}</span><span class="exec-kpi-label">En Error</span></div>
                    <div class="exec-kpi"><span class="exec-kpi-val ${idleClass}">${idleAgents.length}</span><span class="exec-kpi-label">Idle &gt;24h</span></div>
                    <div class="exec-kpi" style="grid-column:span 2;"><span class="exec-kpi-val highlight">${esc(uptime)}</span><span class="exec-kpi-label">Uptime</span></div>
                </div>
            </div>`;

            const eventsHtml = recentEvents.map(e => {
                const sc = STATE_CONFIG[e.event_type] || STATE_CONFIG.active;
                const detail = e.detail ? (e.detail.length > 100 ? e.detail.slice(0, 100) + "..." : e.detail) : "";
                return `<div class="event-item ${e.event_type}" style="margin-bottom:4px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="color:${sc.color || 'var(--accent)'};font-weight:700;">${sc.icon}</span>
                        <span class="event-agent" style="font-size:10px;">${esc(e.agent_name)}</span>
                        <span style="color:${sc.color || 'var(--text-dim)'};font-size:8px;font-weight:700;padding:1px 4px;background:${sc.color || 'var(--accent)'}20;border-radius:3px;">${sc.label}</span>
                    </div>
                    ${detail ? `<div class="event-detail">${esc(detail)}</div>` : ''}
                    <div class="event-time">${formatTime(e.timestamp)}</div>
                </div>`;
            }).join("");

            html += `<div class="exec-card">
                <div class="exec-card-title">ACTIVIDAD RECIENTE</div>
                ${eventsHtml || '<div style="font-size:10px;color:var(--text-dim);padding:4px;">Sin eventos recientes</div>'}
            </div>`;

            c.innerHTML = html;
        }

        fetchAndRender();
        _execRefreshTimer = setInterval(() => {
            if (activeTab !== "executive") { clearInterval(_execRefreshTimer); _execRefreshTimer = null; return; }
            fetchAndRender();
        }, 10000);
    }

    // ── Brain Panel (Central Brain Visualization) ────────────
    let _brainRefreshTimer = null;

    function renderBrainPanel(c) {
        c.innerHTML = '<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">Loading brain data...</div>';

        if (_brainRefreshTimer) { clearInterval(_brainRefreshTimer); _brainRefreshTimer = null; }

        async function fetchAndRender() {
            // Section 1: System State
            let systemState = null;
            try {
                const res = await fetch("/api/system/state");
                if (res.ok) systemState = await res.json();
            } catch(e) {}

            // Section 2: Shared Memory
            let memories = null;
            try {
                const res = await fetch("/api/memory/recent?limit=10");
                if (res.ok) memories = await res.json();
            } catch(e) {}

            if (activeTab !== "brain") return;

            let html = '';

            // ── Section 1: System State ──
            html += '<div class="brain-section">';
            html += '<div class="brain-section-title">System State</div>';

            if (systemState) {
                const healthStatus = (systemState.health || "UNKNOWN").toUpperCase();
                const healthClass = healthStatus === "HEALTHY" ? "healthy" : healthStatus === "DEGRADED" ? "degraded" : healthStatus === "CRITICAL" ? "critical" : "";
                const activeCount = systemState.active || 0;
                const totalCount = systemState.total || agents.length || 0;
                const tokensConsumed = systemState.tokens_consumed || 0;
                const costEstimate = systemState.cost_estimate_usd || 0;
                const topPerformers = systemState.top_performers || [];
                const bottomPerformers = systemState.bottom_performers || [];

                html += `<div class="brain-health ${healthClass}">${esc(healthStatus)}</div>`;
                html += `<div class="exec-card-grid" style="margin-bottom:8px;">`;
                html += `<div class="exec-kpi"><span class="exec-kpi-val">${activeCount}/${totalCount}</span><span class="exec-kpi-label">Active / Total</span></div>`;
                html += `<div class="exec-kpi"><span class="exec-kpi-val">${formatNum(tokensConsumed)}</span><span class="exec-kpi-label">Tokens</span></div>`;
                html += `<div class="exec-kpi" style="grid-column:span 2;"><span class="exec-kpi-val" style="color:var(--green);">$${costEstimate.toFixed(4)}</span><span class="exec-kpi-label">Cost Estimate USD</span></div>`;
                html += `</div>`;

                if (topPerformers.length) {
                    html += '<div style="font-size:8px;font-weight:700;color:var(--green);letter-spacing:0.5px;margin-bottom:4px;text-transform:uppercase;">Top Performers</div>';
                    topPerformers.slice(0, 3).forEach((p, i) => {
                        html += `<div class="performer-item"><span class="performer-rank" style="color:var(--green);">#${i + 1}</span><span style="flex:1;">${esc(p.name || p.display_name || '--')}</span><span class="mono" style="color:var(--accent);font-size:10px;">${p.score || p.invocations || 0}</span></div>`;
                    });
                }

                if (bottomPerformers.length) {
                    html += '<div style="font-size:8px;font-weight:700;color:var(--red);letter-spacing:0.5px;margin:6px 0 4px;text-transform:uppercase;">Bottom Performers</div>';
                    bottomPerformers.slice(0, 3).forEach((p, i) => {
                        html += `<div class="performer-item"><span class="performer-rank" style="color:var(--red);">#${i + 1}</span><span style="flex:1;">${esc(p.name || p.display_name || '--')}</span><span class="mono" style="color:var(--text-dim);font-size:10px;">${p.score || p.invocations || 0}</span></div>`;
                    });
                }
            } else {
                // Fallback: use local data
                const localActive = agents.filter(a => isActiveAgent(a)).length;
                const totalCount = agents.length;
                const healthStatus = localActive > 0 ? "HEALTHY" : totalCount > 0 ? "DEGRADED" : "CRITICAL";
                const healthClass = healthStatus === "HEALTHY" ? "healthy" : healthStatus === "DEGRADED" ? "degraded" : "critical";

                html += `<div class="brain-health ${healthClass}">${healthStatus}</div>`;
                html += `<div class="exec-card-grid" style="margin-bottom:8px;">`;
                html += `<div class="exec-kpi"><span class="exec-kpi-val">${localActive}/${totalCount}</span><span class="exec-kpi-label">Active / Total</span></div>`;
                html += `<div class="exec-kpi"><span class="exec-kpi-val">--</span><span class="exec-kpi-label">Tokens</span></div>`;
                html += `<div class="exec-kpi" style="grid-column:span 2;"><span class="exec-kpi-val" style="color:var(--text-dim);">--</span><span class="exec-kpi-label">Cost Estimate USD</span></div>`;
                html += `</div>`;

                // Top 3 performers from local data
                const sorted = [...agents].filter(a => a.total_invocations > 0).sort((a, b) => (b.total_invocations || 0) - (a.total_invocations || 0));
                if (sorted.length) {
                    html += '<div style="font-size:8px;font-weight:700;color:var(--green);letter-spacing:0.5px;margin-bottom:4px;text-transform:uppercase;">Top Performers</div>';
                    sorted.slice(0, 3).forEach((a, i) => {
                        html += `<div class="performer-item"><span class="performer-rank" style="color:var(--green);">#${i + 1}</span><span style="flex:1;">${esc(a.display_name)}</span><span class="mono" style="color:var(--accent);font-size:10px;">${a.total_invocations || 0}</span></div>`;
                    });
                }

                // Bottom 3 performers
                const bottom = [...agents].filter(a => a.total_invocations != null).sort((a, b) => (a.total_invocations || 0) - (b.total_invocations || 0));
                if (bottom.length) {
                    html += '<div style="font-size:8px;font-weight:700;color:var(--red);letter-spacing:0.5px;margin:6px 0 4px;text-transform:uppercase;">Bottom Performers</div>';
                    bottom.slice(0, 3).forEach((a, i) => {
                        html += `<div class="performer-item"><span class="performer-rank" style="color:var(--red);">#${i + 1}</span><span style="flex:1;">${esc(a.display_name)}</span><span class="mono" style="color:var(--text-dim);font-size:10px;">${a.total_invocations || 0}</span></div>`;
                    });
                }
            }
            html += '</div>';

            // ── Section 2: Shared Memory ──
            html += '<div class="brain-section">';
            html += '<div class="brain-section-title">Shared Memory</div>';

            if (memories && Array.isArray(memories) && memories.length) {
                const typeColors = { learning: "learning", warning: "warning", pattern: "pattern", optimization: "optimization" };
                memories.forEach(m => {
                    const typeClass = typeColors[m.type] || "";
                    const agentName = m.agent_name || m.agent || "--";
                    const content = m.content || m.insight || m.message || "";
                    html += `<div class="memory-card" style="border-left-color:${m.type === 'learning' ? 'var(--green)' : m.type === 'warning' ? 'var(--yellow)' : m.type === 'pattern' ? 'var(--purple)' : m.type === 'optimization' ? 'var(--cyan)' : 'var(--accent)'};">`;
                    html += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">`;
                    html += `<span style="font-weight:600;font-size:10px;">${esc(agentName)}</span>`;
                    html += `<span class="memory-type ${typeClass}">${esc(m.type || 'info')}</span>`;
                    html += `</div>`;
                    html += `<div style="color:var(--text-dim);line-height:1.4;">${esc(content.length > 200 ? content.slice(0, 200) + '...' : content)}</div>`;
                    html += `</div>`;
                });
            } else {
                html += '<div style="font-size:10px;color:var(--text-dim);padding:8px;text-align:center;background:var(--bg);border-radius:5px;">No shared memory entries yet. Memory insights will appear here as agents learn and share patterns.</div>';
            }
            html += '</div>';

            // ── Section 3: Agent Feedback ──
            html += '<div class="brain-section">';
            html += '<div class="brain-section-title">Agent Feedback</div>';

            // Most Active (top 5 by total_invocations)
            const mostActive = [...agents].filter(a => a.total_invocations > 0).sort((a, b) => (b.total_invocations || 0) - (a.total_invocations || 0)).slice(0, 5);
            if (mostActive.length) {
                html += '<div style="font-size:8px;font-weight:700;color:var(--cyan);letter-spacing:0.5px;margin-bottom:4px;text-transform:uppercase;">Most Active</div>';
                const maxInv = mostActive[0].total_invocations || 1;
                mostActive.forEach((a, i) => {
                    const pct = Math.round(((a.total_invocations || 0) / maxInv) * 100);
                    const sc = STATE_CONFIG[a.status] || STATE_CONFIG.idle;
                    html += `<div class="performer-item">`;
                    html += `<span class="performer-rank" style="color:var(--cyan);">#${i + 1}</span>`;
                    html += `<span style="flex:1;">${esc(a.display_name)} <span style="color:${sc.color || 'var(--text-dim)'};font-size:7px;font-weight:700;">${sc.icon}</span></span>`;
                    html += `<div class="leaderboard-bar"><div class="leaderboard-bar-fill" style="width:${pct}%;background:var(--cyan);"></div></div>`;
                    html += `<span class="mono" style="color:var(--accent);font-size:10px;min-width:30px;text-align:right;">${a.total_invocations || 0}</span>`;
                    html += `</div>`;
                });
            }

            // Needs Attention (agents with error status)
            const errorAgents = agents.filter(a => a.status === "error");
            if (errorAgents.length) {
                html += '<div style="font-size:8px;font-weight:700;color:var(--red);letter-spacing:0.5px;margin:8px 0 4px;text-transform:uppercase;">Needs Attention</div>';
                errorAgents.forEach(a => {
                    html += `<div class="performer-item" style="border-left:2px solid var(--red);padding-left:6px;">`;
                    html += `<span style="color:var(--red);font-weight:700;font-size:11px;">&#x2717;</span>`;
                    html += `<span style="flex:1;">${esc(a.display_name)}</span>`;
                    html += `<span style="color:var(--red);font-size:8px;font-weight:700;">ERROR</span>`;
                    html += `</div>`;
                });
            } else {
                html += '<div style="font-size:10px;color:var(--green);padding:4px 0;margin-top:6px;">All agents operational</div>';
            }

            html += '</div>';

            c.innerHTML = html;
        }

        fetchAndRender();
        _brainRefreshTimer = setInterval(() => {
            if (activeTab !== "brain") { clearInterval(_brainRefreshTimer); _brainRefreshTimer = null; return; }
            fetchAndRender();
        }, 15000);
    }

    // ── Audit Event Log (Enhanced) ──────────────────────────
    let _auditFilter = null;

    function renderEventLog(c) {
        if (!events.length) { c.innerHTML='<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">No events yet</div>'; return; }

        const filterTypes = [
            {type:"spawned", label:"SPAWNED", color:"#f59e0b"},
            {type:"active", label:"ACTIVE", color:"#22c55e"},
            {type:"thinking", label:"THINKING", color:"#8b5cf6"},
            {type:"delegating", label:"DELEGATING", color:"#f97316"},
            {type:"completed", label:"COMPLETED", color:"#6366f1"},
            {type:"error", label:"ERROR", color:"#ef4444"},
        ];

        const filtered = _auditFilter
            ? events.filter(e => e.event_type === _auditFilter)
            : events;

        const filterHtml = `<div class="audit-filters">
            <button class="audit-filter-btn ${!_auditFilter ? 'active' : ''}" data-audit-filter="all">ALL</button>
            ${filterTypes.map(f =>
                `<button class="audit-filter-btn ${_auditFilter === f.type ? 'active' : ''}" data-audit-filter="${f.type}" style="${_auditFilter === f.type ? '' : 'border-color:' + f.color + '40;'}">${f.label}</button>`
            ).join("")}
        </div>`;

        const exportHtml = `<button class="audit-export-btn" id="audit-export-btn">Export JSON</button>`;

        const eventsHtml = filtered.slice(0, 100).map((e,i) => {
            const sc = STATE_CONFIG[e.event_type] || STATE_CONFIG.active;
            const detail = e.detail || "";
            const shortDetail = detail.length > 100 ? detail.slice(0, 100) + "..." : detail;
            return `<div class="event-item ${e.event_type}" data-event-idx="${i}" data-event-agent="${esc(e.agent_name)}" style="cursor:pointer;">
                <div style="display:flex;align-items:center;gap:4px;">
                    <span style="color:${sc.color || 'var(--accent)'};font-weight:700;">${sc.icon}</span>
                    <span class="event-agent">${esc(e.agent_name)}</span>
                    <span style="color:${sc.color || 'var(--text-dim)'};font-size:8px;font-weight:700;padding:1px 5px;background:${sc.color || 'var(--accent)'}20;border-radius:3px;margin-left:auto;">${sc.label}</span>
                </div>
                ${shortDetail ? `<div class="event-detail">${esc(shortDetail)}</div>` : ''}
                <div class="event-time">${formatTime(e.timestamp)}</div>
                <div class="event-expanded" id="event-expand-${i}" style="display:none;margin-top:6px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);font-size:10px;">
                    <div style="margin-bottom:4px;"><strong>Agent:</strong> ${esc(e.agent_name)}</div>
                    <div style="margin-bottom:4px;"><strong>Event:</strong> <span style="color:${sc.color}">${esc(e.event_type)}</span></div>
                    <div style="margin-bottom:4px;"><strong>Time:</strong> ${esc(e.timestamp||'')}</div>
                    ${e.tokens_used?`<div style="margin-bottom:4px;"><strong>Tokens:</strong> ${e.tokens_used}</div>`:''}
                    ${e.duration_ms?`<div style="margin-bottom:4px;"><strong>Duration:</strong> ${e.duration_ms}ms</div>`:''}
                    <div style="margin-bottom:6px;"><strong>Detail:</strong></div>
                    <pre style="white-space:pre-wrap;word-break:break-all;color:var(--text-dim);font-family:'JetBrains Mono',monospace;font-size:9px;max-height:150px;overflow-y:auto;background:var(--bg);padding:6px;border-radius:4px;">${esc(detail)}</pre>
                    <button class="audit-filter-btn" style="margin-top:6px;" data-view-agent="${esc(e.agent_name)}">Ver agente</button>
                </div>
            </div>`;
        }).join("");

        c.innerHTML = filterHtml + exportHtml + eventsHtml;

        // Event click → expand/collapse detail
        c.querySelectorAll(".event-item[data-event-idx]").forEach(el => {
            el.onclick = (ev) => {
                if (ev.target.closest("[data-view-agent]")) return; // Don't toggle if clicking "Ver agente"
                const idx = el.dataset.eventIdx;
                const expanded = document.getElementById(`event-expand-${idx}`);
                if (expanded) expanded.style.display = expanded.style.display === "none" ? "block" : "none";
            };
        });

        // "Ver agente" button → open agent detail panel
        c.querySelectorAll("[data-view-agent]").forEach(btn => {
            btn.onclick = (ev) => {
                ev.stopPropagation();
                showDetail(btn.dataset.viewAgent);
            };
        });

        c.querySelectorAll(".audit-filter-btn[data-audit-filter]").forEach(btn => {
            btn.onclick = (ev) => {
                ev.stopPropagation();
                const val = btn.dataset.auditFilter;
                _auditFilter = val === "all" ? null : val;
                renderEventLog(c);
            };
        });

        const exportBtn = document.getElementById("audit-export-btn");
        if (exportBtn) {
            exportBtn.onclick = () => {
                const dataToExport = _auditFilter
                    ? events.filter(e => e.event_type === _auditFilter)
                    : events;
                const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `audit_events${_auditFilter ? '_' + _auditFilter : ''}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };
        }
    }

    // ── Metrics / Leaderboard Panel ─────────────────────
    function scoreBarColor(score) { return score > 80 ? "var(--green)" : score > 50 ? "var(--yellow)" : "var(--red)"; }
    function rankClass(i) { return i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : ""; }

    async function renderMetricsPanel(c) {
        c.innerHTML = '<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">Loading metrics...</div>';
        let leaderboard = [];
        try {
            const res = await fetch("/api/leaderboard");
            if (res.ok) leaderboard = await res.json();
        } catch(e) {}

        // Fallback: build leaderboard from local agent data if endpoint is unavailable
        if (!leaderboard.length && agents.length) {
            leaderboard = agents.filter(a => a.total_invocations > 0).sort((a, b) => (b.total_invocations || 0) - (a.total_invocations || 0)).map(a => ({
                name: a.name,
                display_name: a.display_name,
                score: Math.min(100, Math.round((a.total_invocations || 0) / Math.max(1, agents.reduce((m, x) => Math.max(m, x.total_invocations || 0), 1)) * 100)),
                success_rate: a.status === "error" ? 75 : 95,
                tasks_completed: a.total_invocations || 0,
                avg_response_time: null,
            }));
        }

        if (!leaderboard.length) {
            c.innerHTML = '<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:12px;">No metrics data available</div>';
            return;
        }

        let html = '<div style="padding:4px 8px;font-size:10px;font-weight:700;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:4px;">LEADERBOARD</div>';
        leaderboard.forEach((entry, i) => {
            const score = entry.score || 0;
            const barColor = scoreBarColor(score);
            const rate = entry.success_rate != null ? entry.success_rate + "%" : "--";
            const completed = entry.tasks_completed != null ? entry.tasks_completed : "--";
            const avgTime = entry.avg_response_time != null ? (entry.avg_response_time / 1000).toFixed(1) + "s" : "--";
            html += `<div class="leaderboard-item" data-name="${esc(entry.name)}">
                <span class="leaderboard-rank ${rankClass(i)}">#${i + 1}</span>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${esc(entry.display_name || entry.name)}</div>
                    <div class="leaderboard-stats">${rate} success &middot; ${completed} tasks &middot; ${avgTime}</div>
                </div>
                <div class="leaderboard-bar">
                    <div class="leaderboard-bar-fill" style="width:${score}%;background:${barColor};box-shadow:0 0 6px ${barColor};"></div>
                </div>
            </div>`;
        });
        c.innerHTML = html;
        c.querySelectorAll(".leaderboard-item").forEach(el => {
            el.onclick = () => showDetail(el.dataset.name);
        });
    }

    document.querySelectorAll(".sidebar-tab").forEach(tab=>{
        tab.onclick=()=>{ document.querySelectorAll(".sidebar-tab").forEach(t=>t.classList.remove("active")); tab.classList.add("active"); activeTab=tab.dataset.tab; renderSidebar(); };
    });

    // ── Detail Panel ──────────────────────────────────────
    async function showDetail(name) {
        selectedAgent=name;
        let data; try { data=await fetch(`/api/agents/${name}`).then(r=>r.json()); } catch(e) { return; }
        if (data.error) return;
        const a=data.agent, at=getAgentTask(name);
        const sc = STATE_CONFIG[a.status] || STATE_CONFIG.idle;
        document.getElementById("detail-content").innerHTML=`
            <h2>${esc(a.display_name)}</h2>
            <div class="detail-team">${esc(a.team)} / ${esc(a.category)}${at?` — <span style="color:var(--green);font-weight:600;">${esc(at.role)}</span>`:''}</div>
            ${at?`<div style="background:var(--bg);border-radius:6px;padding:10px;margin-bottom:12px;border:1px solid var(--border);font-size:11px;">
                <div style="font-weight:700;margin-bottom:8px;font-size:12px;">Active Task</div>
                <div style="color:var(--green);font-weight:600;margin-bottom:8px;">${esc(at.task.task_name)}</div>
                <div style="font-size:9px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Delegation Chain</div>
                ${at.task.agents.map(x=>{
                    const isCurrent = x.agent_name===name;
                    const agD = agents.find(ag=>ag.name===x.agent_name);
                    const displayName = agD?.display_name || x.agent_name;
                    const indent = x.delegated_by ? 'padding-left:12px;border-left:2px solid #333;' : '';
                    return `<div style="${indent}padding:4px 8px;margin-bottom:2px;border-radius:4px;${isCurrent?'background:var(--accent)15;border:1px solid var(--accent)40;':''}">
                        <span style="color:${roleColor(x.role)};font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;">${esc(x.role)}</span>
                        <span style="color:${isCurrent?'#fff':'var(--text)'};font-weight:${isCurrent?'700':'500'};font-size:11px;margin-left:6px;">${esc(displayName)}</span>
                    </div>`;
                }).join("")}
            </div>`:''}
            <div class="detail-stats">
                <div class="detail-stat-card"><div class="val">${a.total_invocations}</div><div class="label">INVOCATIONS</div></div>
                <div class="detail-stat-card"><div class="val">${formatNum(a.total_tokens)}</div><div class="label">TOKENS</div></div>
                <div class="detail-stat-card"><div class="val" style="color:${sc.color||'var(--text-dim)'}">${sc.icon} ${sc.label}</div><div class="label">STATUS</div></div>
                <div class="detail-stat-card"><div class="val" style="font-size:12px">${a.last_active?formatTime(a.last_active):'—'}</div><div class="label">LAST ACTIVE</div></div>
            </div>
            <div class="detail-events-title">RECENT EVENTS</div>
            ${!data.events.length?'<div style="color:var(--text-dim);font-size:11px;">No events</div>':
              data.events.slice(0,15).map(e=>{
                const esc2 = STATE_CONFIG[e.event_type] || STATE_CONFIG.active;
                const detailText = e.detail ? (e.detail.length > 80 ? e.detail.slice(0,80)+'...' : e.detail) : '';
                return `<div class="event-item ${e.event_type}" style="padding:6px 8px;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span style="color:${esc2.color||'var(--accent)'};font-size:12px;">${esc2.icon}</span>
                    <span style="color:${esc2.color||'var(--accent)'};font-size:9px;font-weight:700;text-transform:uppercase;">${esc(e.event_type)}</span>
                    <span style="margin-left:auto;font-size:9px;color:var(--text-dim);font-family:'JetBrains Mono',mono;">${formatTime(e.timestamp)}</span>
                </div>
                ${detailText?`<div style="font-size:10px;color:var(--text-dim);line-height:1.4;padding-left:18px;">${esc(detailText)}</div>`:''}
                ${e.tokens_used||e.duration_ms?`<div style="display:flex;gap:10px;padding-left:18px;margin-top:3px;">
                    ${e.tokens_used?`<span style="font-size:9px;color:var(--text-dim);font-family:'JetBrains Mono',mono;">${formatNum(e.tokens_used)} tokens</span>`:''}
                    ${e.duration_ms?`<span style="font-size:9px;color:var(--text-dim);font-family:'JetBrains Mono',mono;">${(e.duration_ms/1000).toFixed(1)}s</span>`:''}
                </div>`:''}
              </div>`;}).join("")}`;
        document.getElementById("detail-panel").classList.add("open");
        renderSidebar();
        highlightChain(name);

        // Fetch and render agent metrics below existing detail content
        renderDetailMetrics(name);
    }

    async function renderDetailMetrics(name) {
        const container = document.getElementById("detail-content");
        if (!container) return;
        let metrics = null;
        try {
            const res = await fetch(`/api/agents/${encodeURIComponent(name)}/metrics`);
            if (res.ok) metrics = await res.json();
        } catch(e) {}

        // Fallback: derive basic metrics from local agent data
        if (!metrics) {
            const ag = agents.find(a => a.name === name);
            if (!ag) return;
            const agentEvents = events.filter(e => e.agent_name === name);
            const errorCount = agentEvents.filter(e => e.event_type === "error").length;
            const totalEvents = agentEvents.length || 1;
            metrics = {
                score: Math.min(100, Math.round((ag.total_invocations || 0) / Math.max(1, agents.reduce((m, x) => Math.max(m, x.total_invocations || 0), 1)) * 100)),
                success_rate: Math.round(((totalEvents - errorCount) / totalEvents) * 100),
                avg_response_time: null,
                total_errors: errorCount,
            };
        }

        const score = metrics.score || 0;
        const scoreClass = score > 80 ? "score-high" : score > 50 ? "score-mid" : "score-low";
        const successRate = metrics.success_rate != null ? metrics.success_rate : "--";
        const avgTime = metrics.avg_response_time != null ? (metrics.avg_response_time / 1000).toFixed(1) + "s" : "--";
        const totalErrors = metrics.total_errors != null ? metrics.total_errors : "--";
        const successBarColor = successRate !== "--" ? scoreBarColor(successRate) : "var(--text-dim)";
        const successBarWidth = successRate !== "--" ? successRate : 0;

        const metricsHtml = `
            <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px;">
                <div class="detail-events-title">PERFORMANCE METRICS</div>
                <div class="score-gauge ${scoreClass}">${score}</div>
                <div style="text-align:center;font-size:9px;color:var(--text-dim);margin-top:-6px;margin-bottom:10px;letter-spacing:0.5px;">SCORE</div>
                <div style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
                        <span style="color:var(--text-dim);">Success Rate</span>
                        <span class="mono" style="font-weight:600;">${successRate !== "--" ? successRate + "%" : "--"}</span>
                    </div>
                    <div class="leaderboard-bar" style="width:100%;height:6px;">
                        <div class="leaderboard-bar-fill" style="width:${successBarWidth}%;background:${successBarColor};box-shadow:0 0 6px ${successBarColor};"></div>
                    </div>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Avg Response Time</span>
                    <span class="metric-value">${avgTime}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Total Errors</span>
                    <span class="metric-value" style="color:${totalErrors > 0 ? 'var(--red)' : 'var(--text)'}">${totalErrors}</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML("beforeend", metricsHtml);
    }

    document.getElementById("detail-close").onclick=()=>{
        document.getElementById("detail-panel").classList.remove("open");
        selectedAgent=null; renderSidebar(); unhighlightChain();
    };

    // ── Chain highlighting ─────────────────────────────────
    function highlightChain(name) {
        const chainNames = new Set();
        for (const t of activeTasks) {
            if (t.agents.some(a=>a.agent_name===name)) {
                t.agents.forEach(a=>chainNames.add(a.agent_name));
            }
        }
        if (chainNames.size===0) return;
        nodeGroup.selectAll("g").attr("opacity", d=>chainNames.has(d.id)||d.isTeam?1:0.12);
        taskLinkGroup.selectAll(".task-edge").attr("stroke-opacity", function() {
            return chainNames.has(d3.select(this).attr("data-to"))?0.9:0.08;
        });
    }

    function unhighlightChain() {
        selectedTask=null;
        nodeGroup.selectAll("g").attr("opacity",1);
        renderTaskEdges();
        taskLinkGroup.selectAll(".task-edge").attr("stroke-opacity",0.7);
    }

    // ── D3 Graph ──────────────────────────────────────────
    function getVisible() {
        let f=agents.filter(a=>activeCategories.has(a.category));
        if (activeTeamFilter) f=f.filter(a=>a.team===activeTeamFilter);
        if (showOnlyActive) f=f.filter(a=>isActiveAgent(a));
        return f;
    }

    const DEPT_CENTERS = new Set([
        // Supreme Orchestrator
        "fitsia-orchestrator",
        // Control Demons
        "demon-decision","demon-performance","demon-intelligence","demon-security","demon-data",
        "demon-growth","demon-experimentation","demon-operations","demon-evolution","demon-crisis",
        // Board of Directors
        "board-chairman","board-advisor-growth","board-advisor-finance","board-advisor-people","board-advisor-tech",
        // C-Suite
        "ceo-fitsi","coo-fitsi","chief-technology-officer","cpo-fitsi","cfo-fitsi",
        "cdao-fitsi","cgo-fitsi","ciso-fitsi","chro-fitsi",
        // Vice Presidents & Heads
        "vp-of-engineering","vp-of-mobile-engineering","chief-software-architect","vp-of-platform",
        "vp-of-ai-systems","vp-of-product","head-of-ux-research","head-of-marketing",
        "head-of-growth-engineering","head-of-operations","head-of-partnerships","head-of-revenue",
        "head-of-compliance","head-of-talent","vp-of-finance","head-of-financial-planning",
        "head-of-culture","head-of-design","head-of-product-analytics",
        // Coordinators
        "fitsia-feature-coordinator","fitsia-frontend-coordinator","fitsia-backend-coordinator",
        "fitsia-ai-coordinator","fitsia-science-coordinator","fitsia-devops-coordinator",
        "fitsia-qa-coordinator","fitsia-marketing-coordinator","fitsia-content-coordinator",
        "fitsia-equipment-coordinator",
    ]);

    // Pyramid layer lookup for node sizing (populated on pyramid view)
    let _pyramidLevels = {};

    function nodeR(d) {
        if (d.isTeam) return 20;
        if (DEPT_CENTERS.has(d.name||d.id)) return 14;
        // Pyramid view: scale node size by hierarchy tier (bigger at top)
        const pyramidTier = _pyramidLevels[d.name||d.id];
        if (pyramidTier !== undefined) {
            // Tier 0=24px (orchestrator) down to tier 5=9px (leads), default 6px for specialists
            const tierSizes = {0: 24, 1: 15, 2: 14, 3: 13, 4: 11, 5: 9};
            return tierSizes[pyramidTier] || 6;
        }
        const base=7, log=Math.log2(1+(d.total_invocations||0))*3.5, active=isWorking(d.status)?5:0;
        return base+log+active;
    }

    function initGraph() {
        const ct=document.getElementById("graph-container"), w=ct.clientWidth, h=ct.clientHeight;
        svg=d3.select("#graph-canvas").attr("width",w).attr("height",h);

        const defs=svg.append("defs");
        // Glow filters per state
        ["glow","glow-thinking","glow-delegating","glow-reviewing","glow-error","glow-spawning"].forEach((id,i) => {
            const colors = [null, "#8b5cf6", "#f97316", "#06b6d4", "#ef4444", "#f59e0b"];
            const f = defs.append("filter").attr("id",id).attr("x","-50%").attr("y","-50%").attr("width","200%").attr("height","200%");
            f.append("feGaussianBlur").attr("stdDeviation",i===0?6:8).attr("result","b");
            if (colors[i]) {
                f.append("feFlood").attr("flood-color",colors[i]).attr("flood-opacity",0.3).attr("result","c");
                f.append("feComposite").attr("in","c").attr("in2","b").attr("operator","in").attr("result","d");
                const m = f.append("feMerge"); m.append("feMergeNode").attr("in","d"); m.append("feMergeNode").attr("in","SourceGraphic");
            } else {
                const m = f.append("feMerge"); m.append("feMergeNode").attr("in","b"); m.append("feMergeNode").attr("in","SourceGraphic");
            }
        });

        // Arrow markers by role color
        ["#22c55e","#ef4444","#f97316","#06b6d4","#ec4899","#8b5cf6"].forEach((color,i)=>{
            defs.append("marker").attr("id",`arrow-${i}`).attr("viewBox","0 0 8 6").attr("refX",8).attr("refY",3)
                .attr("markerWidth",8).attr("markerHeight",6).attr("orient","auto")
                .append("path").attr("d","M0,0 L8,3 L0,6 Z").attr("fill",color);
        });

        svg.call(d3.zoom().scaleExtent([0.1,6]).on("zoom",e=>g.attr("transform",e.transform)));
        g=svg.append("g");
        linkGroup=g.append("g");
        taskLinkGroup=g.append("g");
        nodeGroup=g.append("g");

        buildGraph(w,h);
    }

    function getGlowFilter(status) {
        // Disable expensive SVG filters when many agents are active (performance)
        const activeCount = agents.filter(a=>a.status!=='idle').length;
        if (activeCount > 50) return "none";
        const map = { active: "url(#glow)", thinking: "url(#glow-thinking)", delegating: "url(#glow-delegating)", reviewing: "url(#glow-reviewing)", error: "url(#glow-error)", spawning: "url(#glow-spawning)" };
        return map[status] || "none";
    }

    function buildGraph(w,h) {
        const visible=getVisible();
        const teams=[...new Set(visible.map(a=>a.team))];
        const teamAngle=(i)=>i*(2*Math.PI/teams.length)-Math.PI/2;
        const radius=Math.min(w,h)*0.28;

        const teamNodes=teams.map((t,i)=>({
            id:`team_${t}`, name:t, display_name:t, isTeam:true, color:"#333", team:t, category:"",
            total_invocations:0, total_tokens:0, status:"idle",
            fx: null, fy: null,
            tx: w/2+Math.cos(teamAngle(i))*radius,
            ty: h/2+Math.sin(teamAngle(i))*radius,
        }));

        allNodesData=[...teamNodes,...visible.map(a=>({...a,id:a.name}))];
        const links=visible.map(a=>({source:`team_${a.team}`,target:a.name,type:"member"}));

        // Build inter-team links based on organizational hierarchy
        const teamRelations = [
            // Corporate chain of command
            ["Supreme Orchestrator","Control Demons"],
            ["Supreme Orchestrator","Board of Directors"],
            ["Board of Directors","C-Suite"],
            ["C-Suite","Vice Presidents"],
            ["Vice Presidents","Coordinators"],
            ["Vice Presidents","Directors"],
            ["Directors","Tech Leads"],
            ["Directors","Eng Managers"],
            // C-Suite → operational divisions
            ["C-Suite","Engineering"],["C-Suite","AI Engineering"],
            ["C-Suite","Infrastructure"],["C-Suite","Security"],
            // VPs → teams
            ["Vice Presidents","Backend Engineering"],["Vice Presidents","Mobile Core"],
            ["Vice Presidents","AI Leadership"],["Vice Presidents","Platform Leadership"],
            ["Vice Presidents","Growth Leadership"],
            // Coordinators → execution teams
            ["Coordinators","Engineering"],["Coordinators","Backend Engineering"],
            ["Coordinators","Mobile Core"],["Coordinators","AI Engineering"],
            ["Coordinators","Data Engineering"],["Coordinators","QA Testing"],
            ["Coordinators","Product Engineering"],
            // Cross-functional
            ["Backend Engineering","Engineering"],["Mobile Core","Engineering"],
            ["AI Engineering","AI Leadership"],["AI Engineering","Data Engineering"],
            ["Quality Engineering","QA Testing"],
            ["Infrastructure","Security"],
            ["Architecture","Backend Engineering"],["Architecture","Mobile Core"],
            ["Product Engineering","Specialized"],["Product Engineering","Specialists"],
            // Fitsia Core connections
            ["Fitsia Core","Mobile Core"],["Fitsia Core","Backend Engineering"],
            ["Fitsia Core","AI Engineering"],
            // Evolution & Systems Theory
            ["NoC Evolution","AI Engineering"],
            ["NoC Evolution","Teoria de Sistemas"],
            ["Teoria de Sistemas","Architecture"],
            // Management hierarchy
            ["Eng Managers","Backend Engineering"],["Eng Managers","Mobile Core"],
            ["Eng Managers","Infrastructure"],
            ["Tech Leads","Engineering"],["Tech Leads","AI Engineering"],
        ];
        const existingTeams = new Set(teams);
        for (const [from, to] of teamRelations) {
            if (existingTeams.has(from) && existingTeams.has(to)) {
                links.push({source:`team_${from}`,target:`team_${to}`,type:"relation"});
            }
        }

        simulation=d3.forceSimulation(allNodesData)
            .force("link",d3.forceLink(links).id(d=>d.id).distance(d=>d.type==="relation"?180:65).strength(d=>d.type==="relation"?0.05:0.4))
            .force("charge",d3.forceManyBody().strength(d=>d.isTeam?-350:-60))
            .force("collision",d3.forceCollide().radius(d=>d.isTeam?35:nodeR(d)+5))
            .force("x",d3.forceX(d=>d.tx||w/2).strength(d=>d.isTeam?0.15:0.03))
            .force("y",d3.forceY(d=>d.ty||h/2).strength(d=>d.isTeam?0.15:0.03));

        // Performance: reduce visual complexity for large node counts
        if (visible.length > 200) {
            simulation.force("charge").strength(-30); // Weaker forces = fewer calculations
            simulation.alphaDecay(0.05); // Settle faster
        }

        // Member links (agent → team)
        linkGroup.selectAll("line.member-link").data(links.filter(l=>l.type==="member")).join("line")
            .attr("class","member-link").attr("stroke","#111128").attr("stroke-width",1).attr("stroke-opacity",0.4);
        // Inter-team relation links (team ↔ team) — subtle curved lines
        linkGroup.selectAll("line.team-link").data(links.filter(l=>l.type==="relation")).join("line")
            .attr("class","team-link").attr("stroke","#ffffff").attr("stroke-width",0.5).attr("stroke-opacity",0.06).attr("stroke-dasharray","8,6");

        // Nodes
        const nodeEl=nodeGroup.selectAll("g.node").data(allNodesData,d=>d.id).join(
            enter=>{
                const g=enter.append("g").attr("class","node").attr("data-agent",d=>d.id).attr("cursor","pointer")
                    .call(d3.drag().on("start",dragS).on("drag",dragD).on("end",dragE));
                g.append("circle").attr("class","node-circle")
                    .attr("r",d=>nodeR(d))
                    .attr("fill",d=>d.isTeam?"#080818":isWorking(d.status)?(stateColor(d.status)||d.color)+"40":d.color+"20")
                    .attr("stroke",d=>{
                        if (isWorking(d.status)&&!d.isTeam) return stateColor(d.status)||"#22c55e";
                        if (d.status==="error") return "#ef4444";
                        if (d.isTeam) {
                            const firstAgent = visible.find(a=>a.team===d.team && !a.isTeam);
                            return firstAgent ? firstAgent.color : "#333";
                        }
                        return d.color;
                    })
                    .attr("stroke-width",d=>isWorking(d.status)&&!d.isTeam?3:d.isTeam?1.5:1.5)
                    .attr("stroke-dasharray",d=>d.isTeam?"5,5":d.status==="waiting"?"4,3":"none")
                    .attr("filter",d=>!d.isTeam?getGlowFilter(d.status):"none");
                // Pulse ring for working agents
                g.filter(d=>isWorking(d.status)&&!d.isTeam).append("circle").attr("class","pulse-ring")
                    .attr("r",d=>nodeR(d)+6).attr("fill","none").attr("stroke",d=>stateColor(d.status)||"#22c55e").attr("stroke-width",1).attr("stroke-opacity",0);
                // Label — multi-line with tspan word-wrap
                g.each(function(d) {
                    const tier = _pyramidLevels[d.name || d.id];
                    // Font sizing: C-Suite/top tiers get larger text, specialists get smallest
                    let fontSize = d.isTeam ? 10 : 8;
                    let maxWordsPerLine = 3;
                    if (tier !== undefined && !d.isTeam) {
                        if (tier <= 3) { fontSize = 11; maxWordsPerLine = 2; }       // C-Suite and above
                        else if (tier <= 8) { fontSize = 9; maxWordsPerLine = 2; }   // Hierarchy
                        else { fontSize = 7; maxWordsPerLine = 2; }                  // Specialists (tier 9)
                    }
                    const fill = d.isTeam ? "#555" : isWorking(d.status) ? "#ddd" : "#777";
                    const weight = (d.isTeam || isWorking(d.status)) ? "700" : "500";
                    const textEl = d3.select(this).append("text")
                        .attr("text-anchor", "middle")
                        .attr("fill", fill)
                        .attr("font-size", fontSize + "px")
                        .attr("font-weight", weight);
                    // Split display_name into lines of maxWordsPerLine words each
                    const words = (d.display_name || "").split(/\s+/);
                    const lines = [];
                    for (let i = 0; i < words.length; i += maxWordsPerLine) {
                        lines.push(words.slice(i, i + maxWordsPerLine).join(" "));
                    }
                    const baseOffset = nodeR(d) + 10;
                    const lineH = fontSize + 2;
                    lines.forEach((line, li) => {
                        textEl.append("tspan")
                            .attr("x", 0)
                            .attr("dy", li === 0 ? baseOffset : lineH)
                            .text(line);
                    });
                });
                // Agent count label under team nodes
                g.filter(d=>d.isTeam).append("text").attr("class","team-count-label")
                    .attr("dy",d=>nodeR(d)+22).attr("text-anchor","middle")
                    .attr("fill","#555").attr("font-size","7px")
                    .text(d => {
                        const count = visible.filter(a=>a.team===d.team && !a.isTeam).length;
                        return count + " agent" + (count !== 1 ? "s" : "");
                    });
                // State indicator text
                g.filter(d=>isWorking(d.status)&&!d.isTeam).append("text").attr("class","state-label")
                    .attr("dy",d=>-(nodeR(d)+4)).attr("text-anchor","middle")
                    .attr("fill",d=>stateColor(d.status)).attr("font-size","7px").attr("font-weight","700")
                    .text(d=>(STATE_CONFIG[d.status]||{}).label||"");
                // Events
                g.filter(d=>!d.isTeam).on("mouseover",(ev,d)=>showTooltip(ev,d)).on("mouseout",hideTooltip).on("click",(ev,d)=>showDetail(d.name));
                g.filter(d=>d.isTeam)
                    .on("mouseover",(ev,d)=>{
                        showTooltip(ev,d);
                        highlightTeamLinks(d.id, true);
                    })
                    .on("mouseout",(ev,d)=>{
                        hideTooltip();
                        highlightTeamLinks(d.id, false);
                    })
                    .on("click",(ev,d)=>zoomToTeam(d));
                return g;
            },
            update=>update,
            exit=>exit.transition().duration(300).attr("opacity",0).remove()
        );

        // Throttle tick to 30fps max for performance with many nodes
        let _lastTick = 0;
        simulation.on("tick",()=>{
            const now = performance.now();
            if (now - _lastTick < 33) return; // Skip if <33ms (30fps cap)
            _lastTick = now;
            linkGroup.selectAll("line").attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
            nodeEl.attr("transform",d=>`translate(${d.x},${d.y})`);
            updateTaskEdgesPosition();
        });

        // Performance: disable pulse animations when many nodes
        if (visible.length > 200) {
            nodeGroup.selectAll(".pulse-ring").remove();
        }
        startPulse();
        renderTaskEdges();
    }

    function rebuildGraph() {
        linkGroup.selectAll("*").remove(); taskLinkGroup.selectAll("*").remove(); nodeGroup.selectAll("*").remove();
        if (simulation) simulation.stop();
        const ct=document.getElementById("graph-container");
        buildGraph(ct.clientWidth,ct.clientHeight);
        // Re-apply current view after rebuild
        if (currentView && currentView !== "btn-view-organic") {
            setTimeout(() => applyView(currentView), 100);
        }
        renderSidebar();
    }

    function updateNodes() {
        if (!Object.keys(_agentIndex).length) rebuildAgentIndex();
        nodeGroup.selectAll("g.node").each(function(d) {
            const idx = _agentIndex[d.id];
            const a = idx !== undefined ? agents[idx] : null;
            if (!a) return;
            d.status=a.status; d.total_invocations=a.total_invocations; d.total_tokens=a.total_tokens;
            const c=d3.select(this).select(".node-circle");
            const sc = stateColor(a.status);
            c.attr("r",nodeR(d))
             .attr("fill",isWorking(a.status)?(sc||a.color)+"40":a.color+"20")
             .attr("stroke",isWorking(a.status)?sc||"#22c55e":a.status==="error"?"#ef4444":a.color)
             .attr("stroke-width",isWorking(a.status)?3:1.5)
             .attr("stroke-dasharray",a.status==="waiting"?"4,3":"none")
             .attr("filter",getGlowFilter(a.status));

            // Update or add pulse ring
            const existing = d3.select(this).select(".pulse-ring");
            if (isWorking(a.status) && !d.isTeam) {
                if (existing.empty()) {
                    d3.select(this).insert("circle",".node-circle + *").attr("class","pulse-ring")
                        .attr("r",nodeR(d)+6).attr("fill","none").attr("stroke",sc||"#22c55e").attr("stroke-width",1).attr("stroke-opacity",0);
                } else {
                    existing.attr("stroke",sc||"#22c55e");
                }
            } else {
                existing.remove();
            }

            // Update state label
            const stLabel = d3.select(this).select(".state-label");
            if (isWorking(a.status) && !d.isTeam) {
                const cfg = STATE_CONFIG[a.status];
                if (stLabel.empty()) {
                    d3.select(this).append("text").attr("class","state-label")
                        .attr("dy",-(nodeR(d)+4)).attr("text-anchor","middle")
                        .attr("fill",sc).attr("font-size","7px").attr("font-weight","700")
                        .text(cfg?.label||"");
                } else {
                    stLabel.attr("fill",sc).text(cfg?.label||"");
                }
            } else {
                stLabel.remove();
            }

            // Debug labels
            d3.select(this).selectAll(".debug-label").remove();
            if (debugMode && !d.isTeam) {
                d3.select(this).append("text").attr("class","debug-label")
                    .attr("dy",nodeR(d)+22).attr("text-anchor","middle")
                    .attr("fill","#555").attr("font-size","6px")
                    .text(`${d.name} [${d.status}] inv:${d.total_invocations||0}`);
            }
        });
    }

    // ── Zoom to team ──────────────────────────────────────
    function zoomToTeam(d) {
        const ct=document.getElementById("graph-container");
        const transform=d3.zoomIdentity.translate(ct.clientWidth/2-d.x*2,ct.clientHeight/2-d.y*2).scale(2);
        svg.transition().duration(750).call(d3.zoom().scaleExtent([0.1,6]).on("zoom",e=>g.attr("transform",e.transform)).transform,transform);
    }

    // ── Pulse animation ───────────────────────────────────
    function startPulse() {
        function pulse() {
            const rings=d3.selectAll(".pulse-ring");
            if (rings.size()===0) { setTimeout(pulse,1000); return; }
            rings.attr("r",function(){const d=d3.select(this.parentNode).datum();return nodeR(d)+4;}).attr("stroke-opacity",0.5)
                .transition().duration(1200).ease(d3.easeSinOut)
                .attr("r",function(){const d=d3.select(this.parentNode).datum();return nodeR(d)+18;}).attr("stroke-opacity",0)
                .on("end",pulse);
        }
        pulse();
    }

    // ── Task Delegation Edges ─────────────────────────────
    function renderTaskEdges() {
        if (selectedTask) {
            const tasks = allTasks.length ? allTasks : activeTasks;
            const task = tasks.find(t=>t.task_id===selectedTask);
            if (task) { renderTaskEdgesForTask(task); return; }
        }
        taskLinkGroup.selectAll("*").remove();
        for (const task of activeTasks) {
            for (const ag of (task.agents||[])) {
                if (!ag.delegated_by) continue;
                const arrowColors={"#22c55e":0,"#ef4444":1,"#f97316":2,"#06b6d4":3,"#ec4899":4,"#8b5cf6":5};
                const color=roleColor(ag.role);
                const arrowIdx=arrowColors[color]||0;

                taskLinkGroup.append("path")
                    .attr("class","task-edge task-edge-active")
                    .attr("fill","none")
                    .attr("stroke",color)
                    .attr("stroke-width",2)
                    .attr("stroke-opacity",0.7)
                    .attr("stroke-dasharray",ag.role==="security"?"8,4":"10,5")
                    .attr("marker-end",`url(#arrow-${arrowIdx})`)
                    .attr("data-from",ag.delegated_by)
                    .attr("data-to",ag.agent_name);

                taskLinkGroup.append("text")
                    .attr("class","edge-label")
                    .attr("fill",color)
                    .attr("text-anchor","middle")
                    .attr("dy",-5)
                    .attr("data-from",ag.delegated_by)
                    .attr("data-to",ag.agent_name)
                    .attr("data-type","label")
                    .text(ag.role);
            }
        }
    }

    function updateTaskEdgesPosition() {
        taskLinkGroup.selectAll(".task-edge").each(function() {
            const el=d3.select(this), fromId=el.attr("data-from"), toId=el.attr("data-to");
            const fromN=allNodesData.find(d=>d.id===fromId), toN=allNodesData.find(d=>d.id===toId);
            if (!fromN||!toN||!fromN.x||!toN.x) return;
            const dx=toN.x-fromN.x, dy=toN.y-fromN.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
            const r=nodeR(toN)+6;
            const mx=(fromN.x+toN.x)/2, my=(fromN.y+toN.y)/2;
            const nx=-dy/dist*20, ny=dx/dist*20;
            const cx=mx+nx, cy=my+ny;
            el.attr("d",`M${fromN.x},${fromN.y} Q${cx},${cy} ${toN.x-(dx/dist)*r},${toN.y-(dy/dist)*r}`);
        });

        taskLinkGroup.selectAll("[data-type='label']").each(function() {
            const el=d3.select(this), fromId=el.attr("data-from"), toId=el.attr("data-to");
            const fromN=allNodesData.find(d=>d.id===fromId), toN=allNodesData.find(d=>d.id===toId);
            if (!fromN||!toN||!fromN.x||!toN.x) return;
            const dx=toN.x-fromN.x, dy=toN.y-fromN.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
            const nx=-dy/dist*20, ny=dx/dist*20;
            el.attr("x",(fromN.x+toN.x)/2+nx*0.6).attr("y",(fromN.y+toN.y)/2+ny*0.6);
        });
    }

    // ── Tooltip ───────────────────────────────────────────
    function highlightTeamLinks(teamId, highlight) {
        // Highlight all links (team-link and member-link) connected to this team node
        linkGroup.selectAll("line").each(function(l) {
            const sourceId = typeof l.source === "object" ? l.source.id : l.source;
            const targetId = typeof l.target === "object" ? l.target.id : l.target;
            if (sourceId === teamId || targetId === teamId) {
                d3.select(this).classed("highlighted", highlight);
            }
        });
    }

    function showTooltip(ev,d) {
        const tip=document.getElementById("tooltip");
        if (d.isTeam) {
            // Team node tooltip
            const teamAgents = agents.filter(a=>a.team===d.team);
            const totalAgents = teamAgents.length;
            const activeAgents = teamAgents.filter(a=>isActiveAgent(a));
            const totalInvocations = teamAgents.reduce((s,a)=>s+(a.total_invocations||0),0);
            const totalTokens = teamAgents.reduce((s,a)=>s+(a.total_tokens||0),0);
            const activeList = activeAgents.length > 0
                ? activeAgents.map(a=>{
                    const sc = STATE_CONFIG[a.status] || STATE_CONFIG.active;
                    return `<span style="color:${sc.color||'var(--green)'}">${sc.icon} ${esc(a.display_name)}</span>`;
                }).join(", ")
                : '<span style="color:var(--text-dim)">none</span>';
            tip.innerHTML=`
                <h3>${esc(d.display_name)}</h3>
                <div class="team">Team</div>
                <div class="stats">
                    <div class="stat"><div class="stat-val">${totalAgents}</div><div class="stat-label">Agents</div></div>
                    <div class="stat"><div class="stat-val" style="color:var(--green)">${activeAgents.length}</div><div class="stat-label">Active</div></div>
                    <div class="stat"><div class="stat-val">${totalInvocations}</div><div class="stat-label">Invocations</div></div>
                    <div class="stat"><div class="stat-val">${formatNum(totalTokens)}</div><div class="stat-label">Tokens</div></div>
                </div>
                ${activeAgents.length > 0 ? `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;font-size:10px;">
                    <span style="color:var(--text-dim);font-weight:700;font-size:9px;">ACTIVE:</span> ${activeList}
                </div>` : ''}`;
        } else {
            // Agent node tooltip
            const at=getAgentTask(d.name);
            const sc = STATE_CONFIG[d.status] || STATE_CONFIG.idle;
            tip.innerHTML=`
                <h3>${esc(d.display_name)}</h3>
                <div class="team">${esc(d.team)} / ${esc(d.category)}</div>
                <div class="stats">
                    <div class="stat"><div class="stat-val">${d.total_invocations||0}</div><div class="stat-label">Invocations</div></div>
                    <div class="stat"><div class="stat-val">${formatNum(d.total_tokens||0)}</div><div class="stat-label">Tokens</div></div>
                    <div class="stat"><div class="stat-val" style="color:${sc.color||'var(--text-dim)'}">${sc.icon} ${sc.label}</div><div class="stat-label">Status</div></div>
                </div>
                ${at?`<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;font-size:10px;">
                    <span style="color:${roleColor(at.role)};font-weight:700;">${esc(at.role)}</span> in <strong>${esc(at.task.task_name)}</strong>
                </div>`:''}`;
        }
        const x=Math.min(ev.pageX+12,window.innerWidth-320), y=Math.min(ev.pageY-12,window.innerHeight-tip.offsetHeight-20);
        tip.style.left=x+"px"; tip.style.top=y+"px";
        tip.classList.add("visible");
    }

    function hideTooltip() { document.getElementById("tooltip").classList.remove("visible"); }

    // ── Drag ──────────────────────────────────────────────
    function dragS(ev,d) { if(!ev.active) simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; }
    function dragD(ev,d) { d.fx=ev.x; d.fy=ev.y; }
    function dragE(ev,d) { if(!ev.active) simulation.alphaTarget(0); d.fx=null; d.fy=null; }

    // ── Resize ────────────────────────────────────────────
    let _resizeTimer;
    window.addEventListener("resize",()=>{
        clearTimeout(_resizeTimer);
        _resizeTimer=setTimeout(()=>{
            const ct=document.getElementById("graph-container");
            svg.attr("width",ct.clientWidth).attr("height",ct.clientHeight);
            if(simulation){simulation.force("x",d3.forceX(d=>d.tx||ct.clientWidth/2).strength(d=>d.isTeam?0.15:0.03));simulation.force("y",d3.forceY(d=>d.ty||ct.clientHeight/2).strength(d=>d.isTeam?0.15:0.03));simulation.alpha(0.3).restart();}
        },250);
    });

    init();
})();
