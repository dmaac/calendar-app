// ═══════════════════════════════════════════════════════════════════════
// EVOLUTION VIEWS — 10 Canvas2D visualization views for agent evolution
// Renders on a canvas overlay with zoom/pan, dark theme, Inter/JetBrains Mono
// ═══════════════════════════════════════════════════════════════════════
(function () {
    "use strict";

    // ── State ─────────────────────────────────────────────────────────
    let canvas = null;
    let ctx = null;
    let W = 0;
    let H = 0;
    let dpr = 1;

    let camX = 0;
    let camY = 0;
    let camScale = 1;
    let targetCamX = 0;
    let targetCamY = 0;
    let targetCamScale = 1;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    let animFrameId = null;
    let activeView = null;
    let viewData = null;
    let loadingState = false;
    let errorMessage = null;

    let hoveredItem = null;
    let tooltipEl = null;

    // For force-directed views (interaction-network, mentorship-graph)
    let forceNodes = [];
    let forceEdges = [];

    // ── Theme constants ───────────────────────────────────────────────
    const BG_PRIMARY = "#0a0a1a";
    const BG_SECONDARY = "#030310";
    const TEXT_PRIMARY = "#e5e5e5";
    const TEXT_DIM = "#737373";
    const TEXT_ACCENT = "#6366f1";
    const BORDER_COLOR = "#1a1a2e";
    const FONT_SANS = "Inter, -apple-system, sans-serif";
    const FONT_MONO = "'JetBrains Mono', monospace";

    // ── Maturity color palette ────────────────────────────────────────
    const MATURITY_COLORS = {
        embryo: "#555555",
        infant: "#7a8b99",
        juvenile: "#4a90d9",
        apprentice: "#22c55e",
        journeyman: "#8b5cf6",
        expert: "#f97316",
        master: "#ec4899",
        sage: "#fbbf24",
    };

    function maturityColor(level) {
        return MATURITY_COLORS[(level || "embryo").toLowerCase()] || MATURITY_COLORS.embryo;
    }

    // ── Team color palette (consistent hash) ──────────────────────────
    const TEAM_PALETTE = [
        "#6366f1", "#22c55e", "#f97316", "#8b5cf6", "#06b6d4", "#ec4899",
        "#eab308", "#ef4444", "#14b8a6", "#f43f5e", "#a855f7", "#84cc16",
        "#0ea5e9", "#d946ef", "#f59e0b", "#10b981", "#e11d48", "#7c3aed",
        "#059669", "#dc2626", "#2563eb", "#c026d3", "#65a30d", "#0891b2",
    ];
    const _teamColorCache = {};
    let _teamColorIdx = 0;

    function teamColor(teamName) {
        if (!teamName) return "#6366f1";
        if (!_teamColorCache[teamName]) {
            _teamColorCache[teamName] = TEAM_PALETTE[_teamColorIdx % TEAM_PALETTE.length];
            _teamColorIdx++;
        }
        return _teamColorCache[teamName];
    }

    // ── Utility ───────────────────────────────────────────────────────
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function formatNum(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
        return String(Math.round(n) || 0);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }

    function screenToWorld(sx, sy) {
        return {
            x: (sx - W / 2) / camScale + camX,
            y: (sy - H / 2) / camScale + camY,
        };
    }

    function worldToScreen(wx, wy) {
        return {
            x: (wx - camX) * camScale + W / 2,
            y: (wy - camY) * camScale + H / 2,
        };
    }

    // ── Canvas setup ──────────────────────────────────────────────────
    function ensureCanvas() {
        if (canvas) return;

        var container = document.getElementById("graph-container");
        if (!container) return;

        canvas = document.createElement("canvas");
        canvas.id = "evo-canvas";
        canvas.style.cssText = "position:absolute;inset:0;z-index:50;cursor:grab;display:none;";
        container.appendChild(canvas);

        ctx = canvas.getContext("2d");
        tooltipEl = document.getElementById("tooltip");

        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        canvas.addEventListener("wheel", onWheel, { passive: false });
        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("mouseleave", onMouseLeave);
        canvas.addEventListener("dblclick", onDblClick);
    }

    function resizeCanvas() {
        if (!canvas) return;
        var container = document.getElementById("graph-container");
        if (!container) return;
        W = container.clientWidth;
        H = container.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
    }

    // ── Mouse / zoom / pan handlers ──────────────────────────────────
    function onWheel(e) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? 0.9 : 1.1;
        targetCamScale = clamp(targetCamScale * delta, 0.02, 12);

        var wp = screenToWorld(e.offsetX, e.offsetY);
        targetCamX += (wp.x - targetCamX) * (1 - 1 / delta) * 0.3;
        targetCamY += (wp.y - targetCamY) * (1 - 1 / delta) * 0.3;
    }

    function onMouseDown(e) {
        dragging = true;
        dragStartX = e.offsetX;
        dragStartY = e.offsetY;
        canvas.style.cursor = "grabbing";
    }

    function onMouseMove(e) {
        if (dragging) {
            var dx = e.offsetX - dragStartX;
            var dy = e.offsetY - dragStartY;
            targetCamX -= dx / camScale;
            targetCamY -= dy / camScale;
            dragStartX = e.offsetX;
            dragStartY = e.offsetY;
            hoveredItem = null;
            hideTooltip();
        }
    }

    function onMouseUp() {
        dragging = false;
        if (canvas) canvas.style.cursor = "grab";
    }

    function onMouseLeave() {
        dragging = false;
        if (canvas) canvas.style.cursor = "grab";
        hoveredItem = null;
        hideTooltip();
    }

    function onDblClick(e) {
        var wp = screenToWorld(e.offsetX, e.offsetY);
        targetCamX = wp.x;
        targetCamY = wp.y;
        targetCamScale = clamp(camScale * 2.5, 0.02, 12);
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.classList.remove("visible");
    }

    // ── Camera helpers ────────────────────────────────────────────────
    function resetCamera() {
        camX = 0;
        camY = 0;
        camScale = 1;
        targetCamX = 0;
        targetCamY = 0;
        targetCamScale = 1;
    }

    function smoothCamera() {
        camX += (targetCamX - camX) * 0.12;
        camY += (targetCamY - camY) * 0.12;
        camScale += (targetCamScale - camScale) * 0.12;
    }

    // ── Background ────────────────────────────────────────────────────
    function drawBackground() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
        grad.addColorStop(0, BG_PRIMARY);
        grad.addColorStop(1, BG_SECONDARY);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // ── HUD overlay (title, stats, instructions) ──────────────────────
    function drawHUD(title, stats, extraLines) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;

        // Background panel
        var panelW = 340;
        var lineHeight = 18;
        var lines = stats ? stats.length : 0;
        var extraCount = extraLines ? extraLines.length : 0;
        var panelH = 40 + lines * lineHeight + extraCount * lineHeight + 20;

        ctx.fillStyle = "rgba(10, 10, 26, 0.85)";
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = 1;
        roundRect(ctx, 12, 12, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();

        // Title
        ctx.fillStyle = TEXT_ACCENT;
        ctx.font = "700 14px " + FONT_SANS;
        ctx.textAlign = "left";
        ctx.fillText(title, 24, 36);

        // Stats
        if (stats) {
            ctx.font = "500 11px " + FONT_MONO;
            for (var i = 0; i < stats.length; i++) {
                ctx.fillStyle = TEXT_DIM;
                ctx.fillText(stats[i].label + ":", 24, 58 + i * lineHeight);
                ctx.fillStyle = TEXT_PRIMARY;
                ctx.fillText(String(stats[i].value), 180, 58 + i * lineHeight);
            }
        }

        // Extra lines (instructions, etc.)
        if (extraLines) {
            ctx.font = "400 10px " + FONT_SANS;
            ctx.fillStyle = TEXT_DIM;
            var yOff = 58 + lines * lineHeight + 8;
            for (var j = 0; j < extraLines.length; j++) {
                ctx.fillText(extraLines[j], 24, yOff + j * lineHeight);
            }
        }
    }

    function roundRect(context, x, y, w, h, r) {
        context.beginPath();
        context.moveTo(x + r, y);
        context.lineTo(x + w - r, y);
        context.arcTo(x + w, y, x + w, y + r, r);
        context.lineTo(x + w, y + h - r);
        context.arcTo(x + w, y + h, x + w - r, y + h, r);
        context.lineTo(x + r, y + h);
        context.arcTo(x, y + h, x, y + h - r, r);
        context.lineTo(x, y + r);
        context.arcTo(x, y, x + r, y, r);
        context.closePath();
    }

    // ── Loading / error / empty states ────────────────────────────────
    function drawLoading() {
        drawBackground();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "600 16px " + FONT_SANS;
        ctx.textAlign = "center";
        ctx.fillText("Loading data...", W / 2, H / 2);

        // Spinning arc
        var t = Date.now() / 600;
        ctx.strokeStyle = TEXT_ACCENT;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(W / 2, H / 2 - 40, 18, t, t + Math.PI * 1.2);
        ctx.stroke();
    }

    function drawError(msg) {
        drawBackground();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#ef4444";
        ctx.font = "600 15px " + FONT_SANS;
        ctx.textAlign = "center";
        ctx.fillText("Error loading data", W / 2, H / 2 - 14);
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "400 12px " + FONT_MONO;
        ctx.fillText(msg || "Unknown error", W / 2, H / 2 + 10);
    }

    function drawEmpty(viewTitle) {
        drawBackground();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "600 16px " + FONT_SANS;
        ctx.textAlign = "center";
        ctx.fillText("No data available", W / 2, H / 2 - 10);
        ctx.font = "400 12px " + FONT_SANS;
        ctx.fillText("Run evolution cycles to populate " + viewTitle, W / 2, H / 2 + 14);
    }

    // ── Data fetcher ──────────────────────────────────────────────────
    function fetchViewData(endpoint, callback) {
        loadingState = true;
        errorMessage = null;
        viewData = null;

        fetch("/api/viz/" + endpoint)
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function (data) {
                loadingState = false;
                viewData = data;
                if (callback) callback(data);
            })
            .catch(function (err) {
                loadingState = false;
                errorMessage = err.message || "Fetch failed";
            });
    }

    // ══════════════════════════════════════════════════════════════════
    // VIEW RENDERERS
    // Each view: { init(data), render(time), hasData() }
    // ══════════════════════════════════════════════════════════════════

    var views = {};

    // ── 1. EVOLUTION TREE ─────────────────────────────────────────────
    views["evolution-tree"] = {
        endpoint: "evolution-tree",
        title: "Generational Tree",
        _nodes: [],
        _edges: [],
        _genLabels: [],

        init: function (data) {
            this._nodes = [];
            this._edges = [];
            this._genLabels = [];

            if (!data || !data.nodes || data.nodes.length === 0) return;

            var nodes = data.nodes;
            var edges = data.edges || [];

            // Group by generation
            var genGroups = {};
            var maxGen = 0;
            for (var i = 0; i < nodes.length; i++) {
                var gen = nodes[i].generation || 1;
                if (gen > maxGen) maxGen = gen;
                if (!genGroups[gen]) genGroups[gen] = [];
                genGroups[gen].push(nodes[i]);
            }

            // Layout: each generation is a row, centered horizontally
            var rowSpacing = 120;
            var nodeSpacing = 30;
            var nodeMap = {};

            for (var g = 1; g <= maxGen; g++) {
                var group = genGroups[g];
                if (!group) continue;
                var totalWidth = (group.length - 1) * nodeSpacing;
                var startX = -totalWidth / 2;
                var y = (g - 1) * rowSpacing;

                this._genLabels.push({ text: "Gen " + g, x: -totalWidth / 2 - 60, y: y, count: group.length });

                for (var j = 0; j < group.length; j++) {
                    var agent = group[j];
                    var node = {
                        name: agent.name || agent.agent_name,
                        x: startX + j * nodeSpacing,
                        y: y,
                        gen: g,
                        maturity: agent.maturity_level || "embryo",
                        fitness: agent.fitness_score || 0,
                        r: 4 + (agent.fitness_score || 0) * 6,
                    };
                    this._nodes.push(node);
                    nodeMap[node.name] = node;
                }
            }

            // Build edges from lineage data
            for (var e = 0; e < edges.length; e++) {
                var edge = edges[e];
                var fromNode = nodeMap[edge.parent || edge.from];
                var toNode = nodeMap[edge.child || edge.to];
                if (fromNode && toNode) {
                    this._edges.push({ from: fromNode, to: toNode });
                }
            }

            // Center camera on the tree
            if (this._nodes.length > 0) {
                var bounds = getBounds(this._nodes);
                targetCamX = (bounds.minX + bounds.maxX) / 2;
                targetCamY = (bounds.minY + bounds.maxY) / 2;
                targetCamScale = Math.min(W / ((bounds.maxX - bounds.minX) || 1), H / ((bounds.maxY - bounds.minY) || 1)) * 0.7;
                targetCamScale = clamp(targetCamScale, 0.1, 4);
            }
        },

        hasData: function () {
            return this._nodes.length > 0;
        },

        render: function (t) {
            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.scale(camScale, camScale);
            ctx.translate(-camX, -camY);

            // Draw edges
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 1 / camScale;
            for (var i = 0; i < this._edges.length; i++) {
                var e = this._edges[i];
                ctx.strokeStyle = maturityColor(e.from.maturity);
                ctx.beginPath();
                ctx.moveTo(e.from.x, e.from.y);
                // Curved line for visual clarity
                var midY = (e.from.y + e.to.y) / 2;
                ctx.bezierCurveTo(e.from.x, midY, e.to.x, midY, e.to.x, e.to.y);
                ctx.stroke();
            }

            // Draw generation labels
            ctx.globalAlpha = 0.5;
            var labelSize = clamp(12 / camScale, 6, 30);
            ctx.font = "700 " + labelSize + "px " + FONT_SANS;
            ctx.textAlign = "right";
            for (var g = 0; g < this._genLabels.length; g++) {
                var lbl = this._genLabels[g];
                ctx.fillStyle = TEXT_ACCENT;
                ctx.fillText(lbl.text, lbl.x - 10, lbl.y + labelSize * 0.35);
                ctx.fillStyle = TEXT_DIM;
                ctx.font = "400 " + (labelSize * 0.7) + "px " + FONT_MONO;
                ctx.fillText("(" + lbl.count + ")", lbl.x - 10, lbl.y + labelSize * 0.35 + labelSize);
                ctx.font = "700 " + labelSize + "px " + FONT_SANS;
            }

            // Draw nodes
            ctx.globalAlpha = 1;
            for (var n = 0; n < this._nodes.length; n++) {
                var node = this._nodes[n];
                var col = maturityColor(node.maturity);

                // Glow for high fitness
                if (node.fitness > 0.7) {
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = col;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.r * 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }

                ctx.fillStyle = hexToRgba(col, 0.6);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5 / camScale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            ctx.restore();

            // HUD
            var gens = this._genLabels.length;
            drawHUD("Generational Tree", [
                { label: "Total Agents", value: formatNum(this._nodes.length) },
                { label: "Generations", value: gens },
                { label: "Lineage Links", value: formatNum(this._edges.length) },
            ], ["Scroll to zoom, drag to pan", "Double-click to zoom in"]);
        },
    };

    // ── 2. FITNESS LANDSCAPE ──────────────────────────────────────────
    views["fitness-landscape"] = {
        endpoint: "fitness-landscape",
        title: "Fitness Landscape",
        _points: [],

        init: function (data) {
            this._points = [];
            if (!data || !data.agents || data.agents.length === 0) return;

            for (var i = 0; i < data.agents.length; i++) {
                var a = data.agents[i];
                this._points.push({
                    name: a.name || a.agent_name,
                    x: (a.specialization || a.specialization_depth || Math.random()) * 600,
                    y: (1 - (a.adaptability || a.collaboration_score || Math.random())) * 400,
                    fitness: a.fitness_score || 0,
                    maturity: a.maturity_level || "embryo",
                    r: 3 + (a.fitness_score || 0) * 12,
                });
            }

            var bounds = getBounds(this._points);
            targetCamX = (bounds.minX + bounds.maxX) / 2;
            targetCamY = (bounds.minY + bounds.maxY) / 2;
            targetCamScale = Math.min(W / ((bounds.maxX - bounds.minX) || 1), H / ((bounds.maxY - bounds.minY) || 1)) * 0.7;
            targetCamScale = clamp(targetCamScale, 0.1, 4);
        },

        hasData: function () {
            return this._points.length > 0;
        },

        render: function (t) {
            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.scale(camScale, camScale);
            ctx.translate(-camX, -camY);

            // Axis labels (in world space)
            var fontSize = clamp(12 / camScale, 5, 24);
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = TEXT_DIM;
            ctx.font = "500 " + fontSize + "px " + FONT_SANS;
            ctx.textAlign = "center";
            ctx.fillText("Specialization -->", 300, 420);
            ctx.save();
            ctx.translate(-30, 200);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText("Adaptability -->", 0, 0);
            ctx.restore();

            // Grid
            ctx.strokeStyle = "rgba(99,102,241,0.08)";
            ctx.lineWidth = 0.5 / camScale;
            for (var gx = 0; gx <= 600; gx += 60) {
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                ctx.lineTo(gx, 400);
                ctx.stroke();
            }
            for (var gy = 0; gy <= 400; gy += 40) {
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(600, gy);
                ctx.stroke();
            }

            // Draw points
            ctx.globalAlpha = 1;
            for (var i = 0; i < this._points.length; i++) {
                var p = this._points[i];
                var f = p.fitness;

                // Color: red(low) to green(high)
                var r = Math.round(lerp(180, 30, f));
                var g = Math.round(lerp(40, 200, f));
                var b = Math.round(lerp(40, 80, f));
                var col = "rgb(" + r + "," + g + "," + b + ")";

                // Glow
                ctx.globalAlpha = 0.1 + f * 0.15;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
                ctx.fill();

                // Node
                ctx.globalAlpha = 0.4 + f * 0.6;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "rgba(255,255,255,0.2)";
                ctx.lineWidth = 0.5 / camScale;
                ctx.stroke();
            }

            ctx.restore();

            // Stats
            var avgFitness = 0;
            for (var s = 0; s < this._points.length; s++) avgFitness += this._points[s].fitness;
            avgFitness = this._points.length > 0 ? (avgFitness / this._points.length) : 0;

            drawHUD("Fitness Landscape", [
                { label: "Agents", value: formatNum(this._points.length) },
                { label: "Avg Fitness", value: avgFitness.toFixed(4) },
                { label: "X-axis", value: "Specialization" },
                { label: "Y-axis", value: "Adaptability" },
            ], ["Size + brightness = fitness score", "Green = high, Red = low"]);
        },
    };

    // ── 3. MATURITY TIMELINE ──────────────────────────────────────────
    views["maturity-timeline"] = {
        endpoint: "maturity-timeline",
        title: "Maturity Timeline",
        _buckets: [],
        _levels: [],
        _maxY: 0,

        init: function (data) {
            this._buckets = [];
            this._levels = [];
            this._maxY = 0;

            if (!data || !data.buckets || data.buckets.length === 0) return;

            this._buckets = data.buckets;
            this._levels = data.levels || Object.keys(MATURITY_COLORS);

            // Find max stacked value
            for (var i = 0; i < this._buckets.length; i++) {
                var sum = 0;
                var b = this._buckets[i];
                for (var l = 0; l < this._levels.length; l++) {
                    sum += (b[this._levels[l]] || 0);
                }
                if (sum > this._maxY) this._maxY = sum;
            }
        },

        hasData: function () {
            return this._buckets.length > 0;
        },

        render: function (t) {
            // This view is a stacked area chart, drawn in screen space (no world-space zoom)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var margin = { top: 80, right: 40, bottom: 60, left: 70 };
            var chartW = W - margin.left - margin.right;
            var chartH = H - margin.top - margin.bottom;
            if (chartW < 100 || chartH < 50) return;

            var buckets = this._buckets;
            var levels = this._levels;
            var maxY = this._maxY || 1;
            var n = buckets.length;

            // Axes
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, margin.top + chartH);
            ctx.lineTo(margin.left + chartW, margin.top + chartH);
            ctx.stroke();

            // Y-axis labels
            ctx.fillStyle = TEXT_DIM;
            ctx.font = "400 10px " + FONT_MONO;
            ctx.textAlign = "right";
            for (var yi = 0; yi <= 4; yi++) {
                var yVal = Math.round((maxY / 4) * yi);
                var yPos = margin.top + chartH - (chartH * yi / 4);
                ctx.fillText(String(yVal), margin.left - 8, yPos + 3);
                ctx.strokeStyle = "rgba(255,255,255,0.04)";
                ctx.beginPath();
                ctx.moveTo(margin.left, yPos);
                ctx.lineTo(margin.left + chartW, yPos);
                ctx.stroke();
            }

            // X-axis labels
            ctx.textAlign = "center";
            var step = Math.max(1, Math.floor(n / 10));
            for (var xi = 0; xi < n; xi += step) {
                var xPos = margin.left + (xi / (n - 1 || 1)) * chartW;
                var label = buckets[xi].label || buckets[xi].time || ("T" + xi);
                ctx.fillText(label, xPos, margin.top + chartH + 20);
            }

            // Draw stacked areas (bottom to top)
            for (var li = 0; li < levels.length; li++) {
                var level = levels[li];
                var col = maturityColor(level);

                ctx.fillStyle = hexToRgba(col, 0.35);
                ctx.strokeStyle = hexToRgba(col, 0.7);
                ctx.lineWidth = 1.5;
                ctx.beginPath();

                // Top edge
                for (var bi = 0; bi < n; bi++) {
                    var stackSum = 0;
                    for (var sl = 0; sl <= li; sl++) {
                        stackSum += (buckets[bi][levels[sl]] || 0);
                    }
                    var px = margin.left + (bi / (n - 1 || 1)) * chartW;
                    var py = margin.top + chartH - (stackSum / maxY) * chartH;
                    if (bi === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }

                // Bottom edge (previous stack level, or baseline)
                for (var bj = n - 1; bj >= 0; bj--) {
                    var stackBase = 0;
                    for (var sl2 = 0; sl2 < li; sl2++) {
                        stackBase += (buckets[bj][levels[sl2]] || 0);
                    }
                    var px2 = margin.left + (bj / (n - 1 || 1)) * chartW;
                    var py2 = margin.top + chartH - (stackBase / maxY) * chartH;
                    ctx.lineTo(px2, py2);
                }

                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            // Legend
            ctx.textAlign = "left";
            ctx.font = "500 10px " + FONT_SANS;
            var legendX = margin.left + chartW - levels.length * 90;
            for (var ll = 0; ll < levels.length; ll++) {
                var lx = legendX + ll * 90;
                ctx.fillStyle = maturityColor(levels[ll]);
                ctx.fillRect(lx, margin.top - 24, 10, 10);
                ctx.fillStyle = TEXT_PRIMARY;
                ctx.fillText(levels[ll], lx + 14, margin.top - 15);
            }

            // HUD
            drawHUD("Maturity Timeline", [
                { label: "Time Buckets", value: n },
                { label: "Levels Tracked", value: levels.length },
                { label: "Peak Count", value: this._maxY },
            ], ["Stacked area chart of maturity transitions"]);
        },
    };

    // ── 4. WISDOM MAP ─────────────────────────────────────────────────
    views["wisdom-map"] = {
        endpoint: "wisdom-map",
        title: "Wisdom Map",
        _bubbles: [],

        init: function (data) {
            this._bubbles = [];
            if (!data || !data.agents || data.agents.length === 0) return;

            for (var i = 0; i < data.agents.length; i++) {
                var a = data.agents[i];
                this._bubbles.push({
                    name: a.name || a.agent_name,
                    x: (a.experience_years || 0) * 8,
                    y: (1 - (a.wisdom_score || 0)) * 500,
                    r: 5 + (a.knowledge_depth || 0.1) * 40,
                    maturity: a.maturity_level || "embryo",
                    wisdom: a.wisdom_score || 0,
                    experience: a.experience_years || 0,
                    knowledge: a.knowledge_depth || 0,
                });
            }

            var bounds = getBounds(this._bubbles);
            targetCamX = (bounds.minX + bounds.maxX) / 2;
            targetCamY = (bounds.minY + bounds.maxY) / 2;
            targetCamScale = Math.min(W / ((bounds.maxX - bounds.minX) || 1), H / ((bounds.maxY - bounds.minY) || 1)) * 0.6;
            targetCamScale = clamp(targetCamScale, 0.1, 4);
        },

        hasData: function () {
            return this._bubbles.length > 0;
        },

        render: function (t) {
            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.scale(camScale, camScale);
            ctx.translate(-camX, -camY);

            // Draw bubbles (back to front by radius)
            var sorted = this._bubbles.slice().sort(function (a, b) { return b.r - a.r; });

            for (var i = 0; i < sorted.length; i++) {
                var b = sorted[i];
                var col = maturityColor(b.maturity);

                // Outer glow
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r * 1.8, 0, Math.PI * 2);
                ctx.fill();

                // Bubble
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fill();

                ctx.globalAlpha = 0.7;
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5 / camScale;
                ctx.stroke();

                // Label for large bubbles
                if (b.r * camScale > 12) {
                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = TEXT_PRIMARY;
                    var fontSize = clamp(b.r * 0.35, 4, 14);
                    ctx.font = "600 " + fontSize + "px " + FONT_SANS;
                    ctx.textAlign = "center";
                    ctx.fillText(b.name.slice(0, 20), b.x, b.y + fontSize * 0.35);
                }
            }

            // Axis labels
            ctx.globalAlpha = 0.4;
            var axFont = clamp(12 / camScale, 5, 24);
            ctx.font = "500 " + axFont + "px " + FONT_SANS;
            ctx.fillStyle = TEXT_DIM;
            ctx.textAlign = "center";
            ctx.fillText("Experience (years) -->", 300, 530);
            ctx.save();
            ctx.translate(-50, 250);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText("Wisdom Score -->", 0, 0);
            ctx.restore();

            ctx.restore();

            // Stats
            var maxWisdom = 0;
            var maxExp = 0;
            for (var s = 0; s < this._bubbles.length; s++) {
                if (this._bubbles[s].wisdom > maxWisdom) maxWisdom = this._bubbles[s].wisdom;
                if (this._bubbles[s].experience > maxExp) maxExp = this._bubbles[s].experience;
            }

            drawHUD("Wisdom Map", [
                { label: "Agents", value: formatNum(this._bubbles.length) },
                { label: "Max Wisdom", value: maxWisdom.toFixed(4) },
                { label: "Max Experience", value: maxExp.toFixed(1) + "y" },
                { label: "Bubble size", value: "knowledge_depth" },
            ], ["Color = maturity level", "Gold = sage, Gray = embryo"]);
        },
    };

    // ── 5. INTERACTION NETWORK (force-directed, animated) ─────────────
    views["interaction-network"] = {
        endpoint: "interaction-network",
        title: "Interaction Network",
        _nodes: [],
        _edges: [],
        _nodeMap: {},
        _settled: false,

        init: function (data) {
            this._nodes = [];
            this._edges = [];
            this._nodeMap = {};
            this._settled = false;

            if (!data || !data.interactions || data.interactions.length === 0) return;

            var interactions = data.interactions;
            var nodeSet = {};

            // Extract unique agents
            for (var i = 0; i < interactions.length; i++) {
                var inter = interactions[i];
                if (!nodeSet[inter.from_agent]) {
                    nodeSet[inter.from_agent] = {
                        name: inter.from_agent,
                        x: (Math.random() - 0.5) * 600,
                        y: (Math.random() - 0.5) * 600,
                        vx: 0,
                        vy: 0,
                        connections: 0,
                        maturity: inter.from_maturity || "embryo",
                    };
                }
                if (!nodeSet[inter.to_agent]) {
                    nodeSet[inter.to_agent] = {
                        name: inter.to_agent,
                        x: (Math.random() - 0.5) * 600,
                        y: (Math.random() - 0.5) * 600,
                        vx: 0,
                        vy: 0,
                        connections: 0,
                        maturity: inter.to_maturity || "embryo",
                    };
                }
                nodeSet[inter.from_agent].connections++;
                nodeSet[inter.to_agent].connections++;
            }

            var nodeNames = Object.keys(nodeSet);
            for (var k = 0; k < nodeNames.length; k++) {
                this._nodes.push(nodeSet[nodeNames[k]]);
                this._nodeMap[nodeNames[k]] = nodeSet[nodeNames[k]];
            }

            for (var e = 0; e < interactions.length; e++) {
                var edge = interactions[e];
                this._edges.push({
                    from: this._nodeMap[edge.from_agent],
                    to: this._nodeMap[edge.to_agent],
                    strength: edge.coupling_strength || 0.5,
                    type: edge.interaction_type || "unknown",
                });
            }

            targetCamX = 0;
            targetCamY = 0;
            targetCamScale = 0.8;
        },

        hasData: function () {
            return this._nodes.length > 0;
        },

        _simulate: function () {
            if (this._settled) return;

            var nodes = this._nodes;
            var edges = this._edges;
            var damping = 0.92;
            var repulsion = 800;
            var springLen = 80;
            var springK = 0.02;

            // Repulsion (limited comparisons for performance)
            for (var i = 0; i < nodes.length; i++) {
                var a = nodes[i];
                var limit = Math.min(nodes.length, i + 80);
                for (var j = i + 1; j < limit; j++) {
                    var b = nodes[j];
                    var dx = b.x - a.x;
                    var dy = b.y - a.y;
                    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    var force = repulsion / (dist * dist);
                    force = Math.min(force, 5);
                    var fx = (dx / dist) * force;
                    var fy = (dy / dist) * force;
                    a.vx -= fx;
                    a.vy -= fy;
                    b.vx += fx;
                    b.vy += fy;
                }
            }

            // Spring attraction along edges
            for (var e = 0; e < edges.length; e++) {
                var edge = edges[e];
                var fa = edge.from;
                var fb = edge.to;
                if (!fa || !fb) continue;
                var edx = fb.x - fa.x;
                var edy = fb.y - fa.y;
                var eDist = Math.sqrt(edx * edx + edy * edy) || 1;
                var displacement = eDist - springLen;
                var sf = springK * displacement * (edge.strength || 0.5);
                var sfx = (edx / eDist) * sf;
                var sfy = (edy / eDist) * sf;
                fa.vx += sfx;
                fa.vy += sfy;
                fb.vx -= sfx;
                fb.vy -= sfy;
            }

            // Apply velocity + damping
            var totalMovement = 0;
            for (var n = 0; n < nodes.length; n++) {
                var node = nodes[n];
                node.vx *= damping;
                node.vy *= damping;
                node.x += node.vx;
                node.y += node.vy;
                totalMovement += Math.abs(node.vx) + Math.abs(node.vy);
            }

            if (totalMovement < 0.5) this._settled = true;
        },

        render: function (t) {
            // Run physics steps
            for (var step = 0; step < 3; step++) {
                this._simulate();
            }

            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.scale(camScale, camScale);
            ctx.translate(-camX, -camY);

            // Draw edges
            for (var e = 0; e < this._edges.length; e++) {
                var edge = this._edges[e];
                if (!edge.from || !edge.to) continue;
                ctx.globalAlpha = 0.15 + edge.strength * 0.35;
                ctx.strokeStyle = maturityColor(edge.from.maturity);
                ctx.lineWidth = (0.5 + edge.strength * 3) / camScale;
                ctx.beginPath();
                ctx.moveTo(edge.from.x, edge.from.y);
                ctx.lineTo(edge.to.x, edge.to.y);
                ctx.stroke();
            }

            // Draw nodes
            ctx.globalAlpha = 1;
            for (var n = 0; n < this._nodes.length; n++) {
                var node = this._nodes[n];
                var col = maturityColor(node.maturity);
                var r = 4 + Math.min(12, Math.sqrt(node.connections) * 3);

                // Pulsing glow
                ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 2 + n);
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.globalAlpha = 0.8;
                ctx.fillStyle = hexToRgba(col, 0.5);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5 / camScale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Labels for connected nodes
                if (node.connections > 2 && camScale > 0.4) {
                    ctx.globalAlpha = 0.7;
                    ctx.fillStyle = TEXT_PRIMARY;
                    var fs = clamp(8 / camScale, 4, 14);
                    ctx.font = "500 " + fs + "px " + FONT_SANS;
                    ctx.textAlign = "center";
                    ctx.fillText(node.name.slice(0, 18), node.x, node.y + r + fs + 2);
                }
            }

            ctx.restore();

            drawHUD("Interaction Network", [
                { label: "Agents", value: this._nodes.length },
                { label: "Interactions", value: this._edges.length },
                { label: "Physics", value: this._settled ? "settled" : "simulating" },
            ], ["Force-directed layout with spring physics", "Line thickness = coupling strength"]);
        },
    };

    // ── 6. TEAM EVOLUTION (bar race chart) ────────────────────────────
    views["team-evolution"] = {
        endpoint: "team-evolution",
        title: "Team Evolution",
        _teams: [],
        _maxFitness: 0,

        init: function (data) {
            this._teams = [];
            this._maxFitness = 0;

            if (!data || !data.teams || data.teams.length === 0) return;

            this._teams = data.teams.slice().sort(function (a, b) {
                return (b.avg_fitness || 0) - (a.avg_fitness || 0);
            });

            for (var i = 0; i < this._teams.length; i++) {
                if ((this._teams[i].avg_fitness || 0) > this._maxFitness) {
                    this._maxFitness = this._teams[i].avg_fitness;
                }
            }
        },

        hasData: function () {
            return this._teams.length > 0;
        },

        render: function (t) {
            // Screen space: horizontal bars
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var margin = { top: 80, right: 120, bottom: 40, left: 200 };
            var chartW = W - margin.left - margin.right;
            var chartH = H - margin.top - margin.bottom;
            var teams = this._teams;
            var maxBars = Math.min(teams.length, Math.floor(chartH / 28));
            var barH = Math.min(24, (chartH / maxBars) - 4);
            var maxFit = this._maxFitness || 1;

            for (var i = 0; i < maxBars; i++) {
                var team = teams[i];
                var fitness = team.avg_fitness || 0;
                var barW = (fitness / maxFit) * chartW;
                var y = margin.top + i * (barH + 4);
                var col = team.color || teamColor(team.name || team.team);

                // Bar background
                ctx.fillStyle = "rgba(255,255,255,0.03)";
                roundRect(ctx, margin.left, y, chartW, barH, 4);
                ctx.fill();

                // Filled bar with animated width
                var animatedW = barW * Math.min(1, t * 0.5 - i * 0.02);
                animatedW = Math.max(0, animatedW);
                if (animatedW > 2) {
                    ctx.fillStyle = hexToRgba(col, 0.6);
                    roundRect(ctx, margin.left, y, animatedW, barH, 4);
                    ctx.fill();

                    // Bright edge
                    ctx.strokeStyle = col;
                    ctx.lineWidth = 1.5;
                    roundRect(ctx, margin.left, y, animatedW, barH, 4);
                    ctx.stroke();
                }

                // Team name
                ctx.fillStyle = TEXT_PRIMARY;
                ctx.font = "600 11px " + FONT_SANS;
                ctx.textAlign = "right";
                var displayName = (team.name || team.team || "Unknown");
                if (displayName.length > 24) displayName = displayName.slice(0, 22) + "..";
                ctx.fillText(displayName, margin.left - 10, y + barH * 0.65);

                // Stats on bar
                ctx.textAlign = "left";
                ctx.fillStyle = TEXT_DIM;
                ctx.font = "400 10px " + FONT_MONO;
                var statsText = fitness.toFixed(4) + "  |  " + (team.agent_count || team.count || "?") + " agents";
                ctx.fillText(statsText, margin.left + animatedW + 8, y + barH * 0.65);
            }

            // Column header
            ctx.fillStyle = TEXT_ACCENT;
            ctx.font = "700 11px " + FONT_SANS;
            ctx.textAlign = "left";
            ctx.fillText("AVG FITNESS", margin.left, margin.top - 10);
            ctx.textAlign = "right";
            ctx.fillText("TEAM", margin.left - 10, margin.top - 10);

            drawHUD("Team Evolution", [
                { label: "Teams", value: teams.length },
                { label: "Top Fitness", value: maxFit.toFixed(4) },
                { label: "Showing", value: maxBars + " / " + teams.length },
            ], ["Sorted by average fitness score"]);
        },
    };

    // ── 7. GENERATION STATS (radar/comparison) ────────────────────────
    views["generation-stats"] = {
        endpoint: "generation-stats",
        title: "Generation Comparison",
        _generations: [],
        _metrics: ["avg_fitness", "avg_wisdom", "avg_experience", "count"],

        init: function (data) {
            this._generations = [];
            if (!data || !data.generations || data.generations.length === 0) return;
            this._generations = data.generations;
            if (data.metrics) this._metrics = data.metrics;
        },

        hasData: function () {
            return this._generations.length > 0;
        },

        render: function (t) {
            // Overlapping area chart (radar-like polygon) in screen space
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var cx = W / 2;
            var cy = H / 2 + 20;
            var R = Math.min(W, H) * 0.3;
            var metrics = this._metrics;
            var gens = this._generations;
            var numAxes = metrics.length;
            var angleStep = (Math.PI * 2) / numAxes;

            // Find max values per metric for normalization
            var maxVals = {};
            for (var m = 0; m < metrics.length; m++) {
                maxVals[metrics[m]] = 0;
                for (var g = 0; g < gens.length; g++) {
                    var val = gens[g][metrics[m]] || 0;
                    if (val > maxVals[metrics[m]]) maxVals[metrics[m]] = val;
                }
            }

            // Draw axis lines and labels
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.lineWidth = 1;
            ctx.fillStyle = TEXT_DIM;
            ctx.font = "500 11px " + FONT_SANS;
            ctx.textAlign = "center";

            for (var a = 0; a < numAxes; a++) {
                var angle = a * angleStep - Math.PI / 2;
                var ax = cx + Math.cos(angle) * R;
                var ay = cy + Math.sin(angle) * R;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(ax, ay);
                ctx.stroke();

                // Label
                var lx = cx + Math.cos(angle) * (R + 24);
                var ly = cy + Math.sin(angle) * (R + 24);
                ctx.fillStyle = TEXT_PRIMARY;
                ctx.fillText(metrics[a].replace("avg_", "").replace("_", " "), lx, ly + 4);
            }

            // Concentric rings
            for (var ring = 1; ring <= 4; ring++) {
                ctx.beginPath();
                for (var ra = 0; ra <= numAxes; ra++) {
                    var rAngle = ra * angleStep - Math.PI / 2;
                    var rx = cx + Math.cos(rAngle) * (R * ring / 4);
                    var ry = cy + Math.sin(rAngle) * (R * ring / 4);
                    if (ra === 0) ctx.moveTo(rx, ry);
                    else ctx.lineTo(rx, ry);
                }
                ctx.closePath();
                ctx.strokeStyle = "rgba(255,255,255,0.06)";
                ctx.stroke();
            }

            // Draw generation polygons
            var genColors = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#ef4444", "#8b5cf6"];
            for (var gi = 0; gi < gens.length; gi++) {
                var gen = gens[gi];
                var col = genColors[gi % genColors.length];

                ctx.beginPath();
                for (var mi = 0; mi < numAxes; mi++) {
                    var mAngle = mi * angleStep - Math.PI / 2;
                    var normalized = maxVals[metrics[mi]] > 0 ? (gen[metrics[mi]] || 0) / maxVals[metrics[mi]] : 0;
                    var px = cx + Math.cos(mAngle) * R * normalized;
                    var py = cy + Math.sin(mAngle) * R * normalized;
                    if (mi === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = hexToRgba(col, 0.12);
                ctx.fill();
                ctx.strokeStyle = hexToRgba(col, 0.7);
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Legend
            ctx.textAlign = "left";
            ctx.font = "500 10px " + FONT_SANS;
            var legX = W - 160;
            var legY = 80;
            for (var lg = 0; lg < gens.length; lg++) {
                var lgCol = genColors[lg % genColors.length];
                ctx.fillStyle = lgCol;
                ctx.fillRect(legX, legY + lg * 18, 10, 10);
                ctx.fillStyle = TEXT_PRIMARY;
                ctx.fillText("Gen " + (gens[lg].generation || lg + 1), legX + 16, legY + lg * 18 + 9);
            }

            drawHUD("Generation Comparison", [
                { label: "Generations", value: gens.length },
                { label: "Metrics", value: numAxes },
            ], ["Overlapping radar polygons", "Each color = one generation"]);
        },
    };

    // ── 8. DNA RADAR (top 20 agents) ──────────────────────────────────
    views["dna-radar"] = {
        endpoint: "dna-radar",
        title: "DNA Trait Radar",
        _agents: [],
        _traits: ["fitness", "specialization", "adaptability", "speed", "accuracy", "collaboration", "creativity", "reliability"],
        _selectedIdx: 0,

        init: function (data) {
            this._agents = [];
            this._selectedIdx = 0;
            if (!data || !data.agents || data.agents.length === 0) return;

            var agents = data.agents.slice(0, 20);
            for (var i = 0; i < agents.length; i++) {
                var a = agents[i];
                this._agents.push({
                    name: a.name || a.agent_name,
                    maturity: a.maturity_level || "embryo",
                    fitness: a.fitness_score || 0,
                    specialization: a.specialization_depth || 0,
                    adaptability: a.collaboration_score || 0,
                    speed: a.speed_score || 0,
                    accuracy: a.accuracy_score || 0,
                    collaboration: a.collaboration_score || 0,
                    creativity: a.creativity_score || 0,
                    reliability: a.reliability_score || 0,
                });
            }
        },

        hasData: function () {
            return this._agents.length > 0;
        },

        render: function (t) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var agents = this._agents;
            var traits = this._traits;
            var numTraits = traits.length;
            var angleStep = (Math.PI * 2) / numTraits;

            // Grid: show up to 4 agents per row
            var cols = Math.min(4, agents.length);
            var rows = Math.ceil(agents.length / cols);
            var cellW = (W - 60) / cols;
            var cellH = (H - 100) / rows;
            var R = Math.min(cellW, cellH) * 0.32;

            for (var ai = 0; ai < agents.length; ai++) {
                var agent = agents[ai];
                var col = Math.floor(ai % cols);
                var row = Math.floor(ai / cols);
                var cx = 30 + col * cellW + cellW / 2;
                var cy = 80 + row * cellH + cellH / 2;

                // Axis lines
                ctx.strokeStyle = "rgba(255,255,255,0.08)";
                ctx.lineWidth = 0.5;
                for (var ti = 0; ti < numTraits; ti++) {
                    var angle = ti * angleStep - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
                    ctx.stroke();
                }

                // Concentric rings
                for (var ring = 1; ring <= 3; ring++) {
                    ctx.beginPath();
                    for (var ri = 0; ri <= numTraits; ri++) {
                        var rAngle = ri * angleStep - Math.PI / 2;
                        var rx = cx + Math.cos(rAngle) * (R * ring / 3);
                        var ry = cy + Math.sin(rAngle) * (R * ring / 3);
                        if (ri === 0) ctx.moveTo(rx, ry);
                        else ctx.lineTo(rx, ry);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }

                // Agent polygon
                var matCol = maturityColor(agent.maturity);
                ctx.beginPath();
                for (var pi = 0; pi < numTraits; pi++) {
                    var pAngle = pi * angleStep - Math.PI / 2;
                    var val = clamp(agent[traits[pi]] || 0, 0, 1);
                    var px = cx + Math.cos(pAngle) * R * val;
                    var py = cy + Math.sin(pAngle) * R * val;
                    if (pi === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = hexToRgba(matCol, 0.2);
                ctx.fill();
                ctx.strokeStyle = hexToRgba(matCol, 0.8);
                ctx.lineWidth = 2;
                ctx.stroke();

                // Trait labels
                ctx.fillStyle = TEXT_DIM;
                ctx.font = "400 8px " + FONT_SANS;
                ctx.textAlign = "center";
                for (var li = 0; li < numTraits; li++) {
                    var lAngle = li * angleStep - Math.PI / 2;
                    var lx = cx + Math.cos(lAngle) * (R + 14);
                    var ly = cy + Math.sin(lAngle) * (R + 14);
                    ctx.fillText(traits[li].slice(0, 5), lx, ly + 3);
                }

                // Agent name
                ctx.fillStyle = matCol;
                ctx.font = "600 10px " + FONT_SANS;
                ctx.fillText(agent.name.slice(0, 22), cx, cy - R - 14);

                // Fitness badge
                ctx.fillStyle = TEXT_DIM;
                ctx.font = "400 9px " + FONT_MONO;
                ctx.fillText("f:" + agent.fitness.toFixed(3), cx, cy + R + 16);
            }

            drawHUD("DNA Trait Radar", [
                { label: "Agents Shown", value: agents.length },
                { label: "Traits", value: numTraits },
            ], ["Top agents by fitness, 8 DNA traits each"]);
        },
    };

    // ── 9. SYSTEM TIMELINE ────────────────────────────────────────────
    views["system-timeline"] = {
        endpoint: "system-timeline",
        title: "System Health Timeline",
        _snapshots: [],
        _series: ["total_agents", "active_agents", "total_events", "total_tokens"],
        _maxVals: {},

        init: function (data) {
            this._snapshots = [];
            this._maxVals = {};

            if (!data || !data.snapshots || data.snapshots.length === 0) return;

            this._snapshots = data.snapshots;
            if (data.series) this._series = data.series;

            // Find max for each series
            for (var s = 0; s < this._series.length; s++) {
                var key = this._series[s];
                this._maxVals[key] = 0;
                for (var i = 0; i < this._snapshots.length; i++) {
                    var val = this._snapshots[i][key] || 0;
                    if (val > this._maxVals[key]) this._maxVals[key] = val;
                }
            }
        },

        hasData: function () {
            return this._snapshots.length > 0;
        },

        render: function (t) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var margin = { top: 80, right: 40, bottom: 60, left: 80 };
            var chartW = W - margin.left - margin.right;
            var chartH = H - margin.top - margin.bottom;
            if (chartW < 100 || chartH < 50) return;

            var snaps = this._snapshots;
            var series = this._series;
            var n = snaps.length;
            var lineColors = ["#6366f1", "#22c55e", "#f97316", "#ec4899"];

            // Axes
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, margin.top + chartH);
            ctx.lineTo(margin.left + chartW, margin.top + chartH);
            ctx.stroke();

            // Grid
            for (var gy = 0; gy <= 4; gy++) {
                var yPos = margin.top + chartH - (chartH * gy / 4);
                ctx.strokeStyle = "rgba(255,255,255,0.04)";
                ctx.beginPath();
                ctx.moveTo(margin.left, yPos);
                ctx.lineTo(margin.left + chartW, yPos);
                ctx.stroke();
            }

            // X-axis labels
            ctx.fillStyle = TEXT_DIM;
            ctx.font = "400 9px " + FONT_MONO;
            ctx.textAlign = "center";
            var xStep = Math.max(1, Math.floor(n / 8));
            for (var xi = 0; xi < n; xi += xStep) {
                var xp = margin.left + (xi / (n - 1 || 1)) * chartW;
                var xLabel = snaps[xi].time || snaps[xi].label || ("T" + xi);
                ctx.fillText(xLabel, xp, margin.top + chartH + 18);
            }

            // Draw each series as a line
            for (var si = 0; si < series.length; si++) {
                var key = series[si];
                var maxV = this._maxVals[key] || 1;
                var col = lineColors[si % lineColors.length];

                // Area fill
                ctx.fillStyle = hexToRgba(col, 0.08);
                ctx.beginPath();
                ctx.moveTo(margin.left, margin.top + chartH);
                for (var pi = 0; pi < n; pi++) {
                    var px = margin.left + (pi / (n - 1 || 1)) * chartW;
                    var py = margin.top + chartH - ((snaps[pi][key] || 0) / maxV) * chartH;
                    ctx.lineTo(px, py);
                }
                ctx.lineTo(margin.left + chartW, margin.top + chartH);
                ctx.closePath();
                ctx.fill();

                // Line
                ctx.strokeStyle = col;
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (var li = 0; li < n; li++) {
                    var lx = margin.left + (li / (n - 1 || 1)) * chartW;
                    var ly = margin.top + chartH - ((snaps[li][key] || 0) / maxV) * chartH;
                    if (li === 0) ctx.moveTo(lx, ly);
                    else ctx.lineTo(lx, ly);
                }
                ctx.stroke();

                // Dots at data points (if few enough)
                if (n <= 50) {
                    ctx.fillStyle = col;
                    for (var di = 0; di < n; di++) {
                        var dx = margin.left + (di / (n - 1 || 1)) * chartW;
                        var dy = margin.top + chartH - ((snaps[di][key] || 0) / maxV) * chartH;
                        ctx.beginPath();
                        ctx.arc(dx, dy, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // Legend
            ctx.textAlign = "left";
            ctx.font = "500 10px " + FONT_SANS;
            var legX = margin.left + 10;
            for (var lg = 0; lg < series.length; lg++) {
                var lgCol = lineColors[lg % lineColors.length];
                var lgy = margin.top + 10 + lg * 18;
                ctx.fillStyle = lgCol;
                ctx.fillRect(legX, lgy, 12, 3);
                ctx.fillStyle = TEXT_PRIMARY;
                ctx.fillText(series[lg].replace(/_/g, " "), legX + 18, lgy + 4);
            }

            drawHUD("System Health Timeline", [
                { label: "Snapshots", value: n },
                { label: "Series", value: series.length },
            ], ["Multi-line chart of system metrics over time"]);
        },
    };

    // ── 10. MENTORSHIP GRAPH (directed, animated) ─────────────────────
    views["mentorship-graph"] = {
        endpoint: "mentorship-graph",
        title: "Mentorship Network",
        _nodes: [],
        _edges: [],
        _nodeMap: {},
        _settled: false,

        init: function (data) {
            this._nodes = [];
            this._edges = [];
            this._nodeMap = {};
            this._settled = false;

            if (!data || !data.mentorships || data.mentorships.length === 0) return;

            var mentorships = data.mentorships;
            var nodeSet = {};

            for (var i = 0; i < mentorships.length; i++) {
                var m = mentorships[i];
                var mentorName = m.mentor || m.from_agent;
                var menteeName = m.mentee || m.to_agent;

                if (!nodeSet[mentorName]) {
                    nodeSet[mentorName] = {
                        name: mentorName,
                        x: (Math.random() - 0.5) * 500,
                        y: (Math.random() - 0.5) * 500,
                        vx: 0,
                        vy: 0,
                        mentorships_given: 0,
                        mentorships_received: 0,
                        maturity: m.mentor_maturity || "embryo",
                    };
                }
                if (!nodeSet[menteeName]) {
                    nodeSet[menteeName] = {
                        name: menteeName,
                        x: (Math.random() - 0.5) * 500,
                        y: (Math.random() - 0.5) * 500,
                        vx: 0,
                        vy: 0,
                        mentorships_given: 0,
                        mentorships_received: 0,
                        maturity: m.mentee_maturity || "embryo",
                    };
                }
                nodeSet[mentorName].mentorships_given++;
                nodeSet[menteeName].mentorships_received++;
            }

            var keys = Object.keys(nodeSet);
            for (var k = 0; k < keys.length; k++) {
                this._nodes.push(nodeSet[keys[k]]);
                this._nodeMap[keys[k]] = nodeSet[keys[k]];
            }

            for (var e = 0; e < mentorships.length; e++) {
                var edge = mentorships[e];
                this._edges.push({
                    from: this._nodeMap[edge.mentor || edge.from_agent],
                    to: this._nodeMap[edge.mentee || edge.to_agent],
                    strength: edge.coupling_strength || 0.5,
                });
            }

            targetCamX = 0;
            targetCamY = 0;
            targetCamScale = 0.8;
        },

        hasData: function () {
            return this._nodes.length > 0;
        },

        _simulate: function () {
            if (this._settled) return;

            var nodes = this._nodes;
            var edges = this._edges;
            var damping = 0.9;
            var repulsion = 600;
            var springLen = 100;
            var springK = 0.015;

            for (var i = 0; i < nodes.length; i++) {
                var a = nodes[i];
                var limit = Math.min(nodes.length, i + 60);
                for (var j = i + 1; j < limit; j++) {
                    var b = nodes[j];
                    var dx = b.x - a.x;
                    var dy = b.y - a.y;
                    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    var force = repulsion / (dist * dist);
                    force = Math.min(force, 4);
                    var fx = (dx / dist) * force;
                    var fy = (dy / dist) * force;
                    a.vx -= fx;
                    a.vy -= fy;
                    b.vx += fx;
                    b.vy += fy;
                }
            }

            for (var e = 0; e < edges.length; e++) {
                var edge = edges[e];
                if (!edge.from || !edge.to) continue;
                var edx = edge.to.x - edge.from.x;
                var edy = edge.to.y - edge.from.y;
                var eDist = Math.sqrt(edx * edx + edy * edy) || 1;
                var disp = eDist - springLen;
                var sf = springK * disp;
                var sfx = (edx / eDist) * sf;
                var sfy = (edy / eDist) * sf;
                edge.from.vx += sfx;
                edge.from.vy += sfy;
                edge.to.vx -= sfx;
                edge.to.vy -= sfy;
            }

            var totalMovement = 0;
            for (var n = 0; n < nodes.length; n++) {
                var node = nodes[n];
                node.vx *= damping;
                node.vy *= damping;
                node.x += node.vx;
                node.y += node.vy;
                totalMovement += Math.abs(node.vx) + Math.abs(node.vy);
            }

            if (totalMovement < 0.5) this._settled = true;
        },

        render: function (t) {
            for (var step = 0; step < 3; step++) {
                this._simulate();
            }

            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.scale(camScale, camScale);
            ctx.translate(-camX, -camY);

            // Draw directed edges (with arrowheads)
            for (var e = 0; e < this._edges.length; e++) {
                var edge = this._edges[e];
                if (!edge.from || !edge.to) continue;
                var fromCol = maturityColor(edge.from.maturity);

                ctx.globalAlpha = 0.2 + (edge.strength || 0.5) * 0.3;
                ctx.strokeStyle = fromCol;
                ctx.lineWidth = (1 + (edge.strength || 0.5) * 2) / camScale;
                ctx.beginPath();
                ctx.moveTo(edge.from.x, edge.from.y);
                ctx.lineTo(edge.to.x, edge.to.y);
                ctx.stroke();

                // Arrowhead
                var adx = edge.to.x - edge.from.x;
                var ady = edge.to.y - edge.from.y;
                var aDist = Math.sqrt(adx * adx + ady * ady) || 1;
                var nx = adx / aDist;
                var ny = ady / aDist;
                var arrowLen = 8 / camScale;
                var toR = 4 + Math.min(12, Math.sqrt(edge.to.mentorships_given + edge.to.mentorships_received) * 3);
                var tipX = edge.to.x - nx * (toR + 2);
                var tipY = edge.to.y - ny * (toR + 2);

                ctx.fillStyle = fromCol;
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX - nx * arrowLen - ny * arrowLen * 0.4, tipY - ny * arrowLen + nx * arrowLen * 0.4);
                ctx.lineTo(tipX - nx * arrowLen + ny * arrowLen * 0.4, tipY - ny * arrowLen - nx * arrowLen * 0.4);
                ctx.closePath();
                ctx.fill();
            }

            // Draw nodes
            ctx.globalAlpha = 1;
            for (var n = 0; n < this._nodes.length; n++) {
                var node = this._nodes[n];
                var col = maturityColor(node.maturity);
                var r = 4 + Math.min(12, Math.sqrt(node.mentorships_given + 1) * 3);

                // Pulsing glow for mentors
                if (node.mentorships_given > 0) {
                    ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t * 1.5 + n);
                    ctx.fillStyle = col;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r * 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.globalAlpha = 0.8;
                ctx.fillStyle = hexToRgba(col, 0.5);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5 / camScale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Mentor badge
                if (node.mentorships_given > 0 && camScale > 0.3) {
                    ctx.globalAlpha = 0.9;
                    ctx.fillStyle = "#fbbf24";
                    var badgeR = clamp(5 / camScale, 2, 8);
                    ctx.beginPath();
                    ctx.arc(node.x + r * 0.8, node.y - r * 0.8, badgeR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = "#0a0a1a";
                    ctx.font = "700 " + clamp(badgeR * 1.2, 2, 10) + "px " + FONT_MONO;
                    ctx.textAlign = "center";
                    ctx.fillText(String(node.mentorships_given), node.x + r * 0.8, node.y - r * 0.8 + badgeR * 0.4);
                }

                // Name label for larger nodes
                if (r * camScale > 8 && camScale > 0.3) {
                    ctx.globalAlpha = 0.7;
                    ctx.fillStyle = TEXT_PRIMARY;
                    var fs = clamp(7 / camScale, 3, 12);
                    ctx.font = "500 " + fs + "px " + FONT_SANS;
                    ctx.textAlign = "center";
                    ctx.fillText(node.name.slice(0, 18), node.x, node.y + r + fs + 3);
                }
            }

            ctx.restore();

            var totalMentorships = 0;
            for (var ms = 0; ms < this._nodes.length; ms++) {
                totalMentorships += this._nodes[ms].mentorships_given;
            }

            drawHUD("Mentorship Network", [
                { label: "Agents", value: this._nodes.length },
                { label: "Mentorship Links", value: this._edges.length },
                { label: "Total Given", value: totalMentorships },
                { label: "Physics", value: this._settled ? "settled" : "simulating" },
            ], ["Directed arrows: mentor --> mentee", "Node size = mentorship_given", "Gold badge = mentor count"]);
        },
    };

    // ══════════════════════════════════════════════════════════════════
    // BOUNDS HELPER
    // ══════════════════════════════════════════════════════════════════
    function getBounds(items) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.x < minX) minX = item.x;
            if (item.y < minY) minY = item.y;
            if (item.x > maxX) maxX = item.x;
            if (item.y > maxY) maxY = item.y;
        }
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    // ══════════════════════════════════════════════════════════════════
    // MAIN ANIMATION LOOP
    // ══════════════════════════════════════════════════════════════════
    var _time0 = Date.now();

    function mainLoop() {
        if (!activeView || !canvas) return;

        var t = (Date.now() - _time0) / 1000;
        smoothCamera();
        drawBackground();

        if (loadingState) {
            drawLoading();
            animFrameId = requestAnimationFrame(mainLoop);
            return;
        }

        if (errorMessage) {
            drawError(errorMessage);
            animFrameId = requestAnimationFrame(mainLoop);
            return;
        }

        var view = views[activeView];
        if (!view || !view.hasData()) {
            drawEmpty(view ? view.title : activeView);
            animFrameId = requestAnimationFrame(mainLoop);
            return;
        }

        // Set transform for world-space views (non-chart views do it themselves)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        view.render(t);

        // Zoom indicator (bottom-right)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "400 10px " + FONT_MONO;
        ctx.textAlign = "right";
        ctx.fillText("zoom: " + camScale.toFixed(2), W - 12, H - 12);

        // Close button hint (top-right)
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "400 10px " + FONT_SANS;
        ctx.fillText("ESC to close", W - 12, 28);

        animFrameId = requestAnimationFrame(mainLoop);
    }

    // ══════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════
    function show(viewName) {
        if (!views[viewName]) {
            console.warn("[EvoViews] Unknown view: " + viewName);
            return;
        }

        // Clean up previous animation
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        ensureCanvas();
        if (!canvas) return;

        activeView = viewName;
        viewData = null;
        loadingState = true;
        errorMessage = null;

        // Reset camera for new view
        resetCamera();

        // Show canvas
        canvas.style.display = "block";
        resizeCanvas();

        // Start render loop immediately (shows loading spinner)
        _time0 = Date.now();
        animFrameId = requestAnimationFrame(mainLoop);

        // Fetch data
        var view = views[viewName];
        fetchViewData(view.endpoint, function (data) {
            view.init(data);
        });

        // Listen for ESC to close
        document.addEventListener("keydown", _escHandler);
    }

    function hide() {
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        activeView = null;
        viewData = null;
        loadingState = false;
        errorMessage = null;

        if (canvas) {
            canvas.style.display = "none";
        }

        hideTooltip();
        document.removeEventListener("keydown", _escHandler);
    }

    function _escHandler(e) {
        if (e.key === "Escape") {
            hide();
        }
    }

    function list() {
        var result = [];
        var names = Object.keys(views);
        for (var i = 0; i < names.length; i++) {
            result.push({
                name: names[i],
                title: views[names[i]].title,
                endpoint: views[names[i]].endpoint,
            });
        }
        return result;
    }

    function isActive() {
        return activeView !== null;
    }

    function current() {
        return activeView;
    }

    // ── Expose public API ─────────────────────────────────────────────
    window.EvoViews = {
        show: show,
        hide: hide,
        list: list,
        isActive: isActive,
        current: current,
    };

})();
