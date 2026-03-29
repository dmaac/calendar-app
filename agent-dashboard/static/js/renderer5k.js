// ═══════════════════════════════════════════════════════════════
// RENDERER 5K — Canvas2D renderer for 5,000+ agent nodes at 60fps
// Replaces SVG when node count exceeds threshold
// ═══════════════════════════════════════════════════════════════
(function() {
"use strict";

let canvas, ctx, W, H, dpr;
let nodes = [], edges = [], teams = {};
let camX = 0, camY = 0, camScale = 0.4;
let targetCamX = 0, targetCamY = 0, targetCamScale = 0.4;
let dragging = false, dragStartX = 0, dragStartY = 0;
let hoveredNode = null, selectedNode = null;
let animId = null;
let _ready = false;
let _tooltip = null;

// Team color palette
const TEAM_COLORS = {};
let _colorIdx = 0;
const PALETTE = [
    '#6366f1','#22c55e','#f97316','#8b5cf6','#06b6d4','#ec4899',
    '#eab308','#ef4444','#14b8a6','#f43f5e','#a855f7','#84cc16',
    '#0ea5e9','#d946ef','#f59e0b','#10b981','#e11d48','#7c3aed',
    '#059669','#dc2626','#2563eb','#c026d3','#65a30d','#0891b2'
];

function teamColor(team) {
    if (!TEAM_COLORS[team]) {
        TEAM_COLORS[team] = PALETTE[_colorIdx % PALETTE.length];
        _colorIdx++;
    }
    return TEAM_COLORS[team];
}

const STATE_COLORS = {
    idle: null, active: '#22c55e', thinking: '#8b5cf6',
    delegating: '#f97316', reviewing: '#06b6d4', spawning: '#f59e0b',
    waiting: '#eab308', completed: '#6366f1', error: '#ef4444'
};

function isActive(s) {
    return s && s !== 'idle';
}

// ── Simple force layout (Barnes-Hut inspired) ─────────────
function layoutNodes() {
    if (!nodes.length) return;

    // Group by team, arrange teams in circle, agents around team center
    const teamList = Object.keys(teams);
    const cx = W / 2 / camScale, cy = H / 2 / camScale;
    const R = Math.min(W, H) * 0.8;

    teamList.forEach((t, ti) => {
        const angle = (ti / teamList.length) * Math.PI * 2 - Math.PI / 2;
        const tx = cx + Math.cos(angle) * R;
        const ty = cy + Math.sin(angle) * R;
        teams[t].x = tx;
        teams[t].y = ty;

        const members = teams[t].members;
        const count = members.length;
        const innerR = Math.sqrt(count) * 12;

        members.forEach((n, ni) => {
            const a2 = (ni / count) * Math.PI * 2;
            const layer = Math.floor(ni / 12);
            const r = innerR * 0.3 + layer * 18;
            n.x = tx + Math.cos(a2) * r + (Math.random() - 0.5) * 5;
            n.y = ty + Math.sin(a2) * r + (Math.random() - 0.5) * 5;
        });
    });
}

// ── Simple repulsion pass (optional, runs once) ───────────
function relaxLayout(iterations) {
    for (let iter = 0; iter < iterations; iter++) {
        // Push overlapping nodes apart
        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < Math.min(i + 50, nodes.length); j++) {
                const b = nodes[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < 20) {
                    const force = (20 - dist) * 0.3;
                    const fx = (dx / dist) * force, fy = (dy / dist) * force;
                    a.x -= fx; a.y -= fy;
                    b.x += fx; b.y += fy;
                }
            }
        }
    }
}

// ── Initialize ────────────────────────────────────────────
function init() {
    const container = document.getElementById('graph-container');
    if (!container) return;

    // Hide SVG graph
    const svgEl = document.getElementById('graph-canvas');
    if (svgEl) svgEl.style.display = 'none';

    // Create or reuse canvas
    canvas = document.getElementById('render5k-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'render5k-canvas';
        canvas.style.cssText = 'position:absolute;inset:0;z-index:3;cursor:grab;';
        container.insertBefore(canvas, container.firstChild.nextSibling);
    }

    ctx = canvas.getContext('2d');
    _tooltip = document.getElementById('tooltip');

    resize();
    window.addEventListener('resize', resize);

    // Mouse events
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);

    _ready = true;
}

function resize() {
    if (!canvas) return;
    const container = document.getElementById('graph-container');
    W = container.clientWidth;
    H = container.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
}

// ── Load data ─────────────────────────────────────────────
function setData(agentList) {
    nodes = [];
    teams = {};

    agentList.forEach(a => {
        const node = {
            name: a.name,
            display: a.display_name || a.name,
            team: a.team,
            category: a.category,
            color: a.color || '#6366f1',
            status: a.status || 'idle',
            invocations: a.total_invocations || 0,
            tokens: a.total_tokens || 0,
            x: 0, y: 0,
            r: isActive(a.status) ? 6 : 3 + Math.min(4, Math.log2(1 + (a.total_invocations || 0))),
        };
        nodes.push(node);

        if (!teams[a.team]) {
            teams[a.team] = { name: a.team, x: 0, y: 0, members: [], color: teamColor(a.team) };
        }
        teams[a.team].members.push(node);
    });

    // Build edges (team hub → member)
    edges = [];
    Object.values(teams).forEach(t => {
        t.members.forEach(n => {
            edges.push({ from: t, to: n });
        });
    });

    layoutNodes();
    relaxLayout(3);
    zoomToFit();

    if (!animId) animate();
}

// ── Camera ────────────────────────────────────────────────
function screenToWorld(sx, sy) {
    return { x: (sx - W/2) / camScale + camX, y: (sy - H/2) / camScale + camY };
}

function worldToScreen(wx, wy) {
    return { x: (wx - camX) * camScale + W/2, y: (wy - camY) * camScale + H/2 };
}

function zoomToFit() {
    if (!nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
    });
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    targetCamX = (minX + maxX) / 2;
    targetCamY = (minY + maxY) / 2;
    targetCamScale = Math.min(W / rangeX, H / rangeY) * 0.85;
    targetCamScale = Math.max(0.05, Math.min(4, targetCamScale));
}

// ── Mouse handlers ────────────────────────────────────────
function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    targetCamScale = Math.max(0.02, Math.min(8, targetCamScale * delta));

    // Zoom toward mouse position
    const wp = screenToWorld(e.offsetX, e.offsetY);
    targetCamX += (wp.x - targetCamX) * (1 - 1/delta) * 0.3;
    targetCamY += (wp.y - targetCamY) * (1 - 1/delta) * 0.3;
}

function onMouseDown(e) {
    dragging = true;
    dragStartX = e.offsetX;
    dragStartY = e.offsetY;
    canvas.style.cursor = 'grabbing';
}

function onMouseMove(e) {
    if (dragging) {
        const dx = e.offsetX - dragStartX;
        const dy = e.offsetY - dragStartY;
        targetCamX -= dx / camScale;
        targetCamY -= dy / camScale;
        dragStartX = e.offsetX;
        dragStartY = e.offsetY;
        hoveredNode = null;
        if (_tooltip) _tooltip.classList.remove('visible');
    } else {
        // Hit test
        const wp = screenToWorld(e.offsetX, e.offsetY);
        let closest = null, closestDist = 15 / camScale;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const d = Math.hypot(n.x - wp.x, n.y - wp.y);
            if (d < closestDist) {
                closestDist = d;
                closest = n;
            }
        }
        hoveredNode = closest;
        canvas.style.cursor = closest ? 'pointer' : 'grab';

        // Tooltip
        if (_tooltip && closest) {
            const sp = worldToScreen(closest.x, closest.y);
            _tooltip.innerHTML = `<h3>${closest.display}</h3>
                <div class="team">${closest.team}</div>
                <div class="stats">
                    <div class="stat"><div class="stat-val">${closest.invocations}</div><div class="stat-label">INVOC</div></div>
                    <div class="stat"><div class="stat-val">${closest.tokens}</div><div class="stat-label">TOKENS</div></div>
                    <div class="stat"><div class="stat-val" style="color:${STATE_COLORS[closest.status]||'#666'}">${(closest.status||'idle').toUpperCase()}</div><div class="stat-label">STATUS</div></div>
                </div>`;
            _tooltip.style.left = (sp.x + 15) + 'px';
            _tooltip.style.top = (sp.y - 10) + 'px';
            _tooltip.classList.add('visible');
        } else if (_tooltip) {
            _tooltip.classList.remove('visible');
        }
    }
}

function onMouseUp() {
    dragging = false;
    canvas.style.cursor = 'grab';
}

function onDblClick(e) {
    // Zoom into clicked area
    const wp = screenToWorld(e.offsetX, e.offsetY);
    targetCamX = wp.x;
    targetCamY = wp.y;
    targetCamScale = Math.min(8, camScale * 2.5);
}

// ── Render loop ───────────────────────────────────────────
let _frame = 0;
const _time0 = Date.now();

function animate() {
    _frame++;
    const t = (Date.now() - _time0) / 1000;

    // Smooth camera
    camX += (targetCamX - camX) * 0.12;
    camY += (targetCamY - camY) * 0.12;
    camScale += (targetCamScale - camScale) * 0.12;

    // Clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H));
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(1, '#030310');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Transform to camera
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(camScale, camScale);
    ctx.translate(-camX, -camY);

    // Draw edges (only if zoomed enough)
    if (camScale > 0.15) {
        ctx.globalAlpha = Math.min(0.3, camScale * 0.4);
        ctx.lineWidth = 0.5 / camScale;
        for (let i = 0; i < edges.length; i++) {
            const e = edges[i];
            ctx.strokeStyle = e.from.color || '#222';
            ctx.beginPath();
            ctx.moveTo(e.from.x, e.from.y);
            ctx.lineTo(e.to.x, e.to.y);
            ctx.stroke();
        }
    }

    // Draw nodes
    ctx.globalAlpha = 1;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const active = isActive(n.status);
        const r = n.r * (active ? 1 + 0.3 * Math.sin(t * 3 + i) : 1);
        const isHovered = n === hoveredNode;

        // Glow for active nodes
        if (active) {
            const sc = STATE_COLORS[n.status] || '#22c55e';
            ctx.globalAlpha = 0.15 + 0.1 * Math.sin(t * 2 + i);
            ctx.fillStyle = sc;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Node circle
        ctx.fillStyle = active ? (STATE_COLORS[n.status] || '#22c55e') + '80' : n.color + '30';
        ctx.strokeStyle = active ? (STATE_COLORS[n.status] || '#22c55e') : isHovered ? '#fff' : n.color;
        ctx.lineWidth = active ? 2 : isHovered ? 2 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hovered highlight
        if (isHovered) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // Draw team labels
    ctx.globalAlpha = 0.7;
    const fontSize = Math.max(8, 14 / camScale);
    ctx.font = `700 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    Object.values(teams).forEach(t => {
        ctx.fillStyle = t.color;
        ctx.fillText(t.name, t.x, t.y - Math.sqrt(t.members.length) * 12 - 10);
        // Member count
        ctx.font = `500 ${fontSize * 0.7}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#666';
        ctx.fillText(`(${t.members.length})`, t.x, t.y - Math.sqrt(t.members.length) * 12 - 10 + fontSize);
        ctx.font = `700 ${fontSize}px Inter, sans-serif`;
    });

    // Draw labels for active/hovered nodes
    if (camScale > 0.3) {
        ctx.globalAlpha = 1;
        const labelSize = Math.max(6, 9 / camScale);
        ctx.font = `600 ${labelSize}px Inter, sans-serif`;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!isActive(n.status) && n !== hoveredNode) continue;
            ctx.fillStyle = n === hoveredNode ? '#fff' : '#ccc';
            ctx.fillText(n.display, n.x, n.y + n.r + labelSize + 2);
        }
    }

    ctx.restore();

    // HUD: node count
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#444';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    const activeCount = nodes.filter(n => isActive(n.status)).length;
    ctx.fillText(`${nodes.length} nodes | ${activeCount} active | ${Object.keys(teams).length} teams | zoom: ${camScale.toFixed(2)}`, 10, H - 10);

    animId = requestAnimationFrame(animate);
}

// ── Update statuses without relayout ──────────────────────
function updateStatuses(agentList) {
    const map = {};
    agentList.forEach(a => { map[a.name] = a; });
    nodes.forEach(n => {
        const a = map[n.name];
        if (a) {
            n.status = a.status || 'idle';
            n.invocations = a.total_invocations || 0;
            n.tokens = a.total_tokens || 0;
            n.r = isActive(a.status) ? 6 : 3 + Math.min(4, Math.log2(1 + (a.total_invocations || 0)));
        }
    });
}

// ── Destroy ───────────────────────────────────────────────
function destroy() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (canvas) canvas.remove();
    canvas = null;
    _ready = false;
    // Restore SVG
    const svgEl = document.getElementById('graph-canvas');
    if (svgEl) svgEl.style.display = '';
}

// ── Public API ────────────────────────────────────────────
window.Renderer5K = {
    init: init,
    setData: setData,
    updateStatuses: updateStatuses,
    zoomToFit: zoomToFit,
    destroy: destroy,
    isReady: function() { return _ready; },
    getNodeCount: function() { return nodes.length; },
};

})();
