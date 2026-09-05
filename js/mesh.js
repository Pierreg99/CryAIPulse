/**
 * CryAIPulse — agentic mesh topology
 * L0 core → S1–S8 agents → Build/Sense outer rooms
 * Resonance ripples + hover tooltips.
 */
(function (global) {
  'use strict';

  const COLORS = {
    cyan: '#00e5ff',
    mint: '#00ffa3',
    ice: '#e0f7fa',
    rose: '#ff4d8d'
  };

  function MeshPulse(canvas, tooltipEl, opts) {
    this.canvas = canvas;
    this.tooltip = tooltipEl;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.reduced = !!(opts && opts.reduced);
    this.intensity = 0.35; // 0..1 token immersion (avg of brain/heart)
    this.data = null;
    this.nodes = [];
    this.edges = [];
    this.pulses = [];
    this.ripples = [];
    this.hover = null;
    this.t = 0;
    this._raf = null;
    this._dpr = 1;
    this._onResize = this.resize.bind(this);
    this._onMove = this.onPointer.bind(this);
    this._onLeave = () => { this.hover = null; this.hideTip(); };
  }

  MeshPulse.prototype.mount = function (data) {
    this.data = data;
    this.build();
    this.resize();
    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    this.loop(performance.now());
  };

  MeshPulse.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
  };

  MeshPulse.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this._dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this._dpr));
    this.w = rect.width;
    this.h = rect.height;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.layout();
  };

  MeshPulse.prototype.build = function () {
    if (!this.data) return;
    const byId = {};
    this.nodes = this.data.nodes.map((n) => {
      const node = {
        id: n.id,
        role: n.role,
        ring: n.ring,
        desc: n.desc,
        hue: n.hue || 'cyan',
        x: 0, y: 0,
        r: n.ring === 'core' ? 18 : n.ring === 'rooms' ? 14 : 11,
        phase: Math.random() * Math.PI * 2,
        activity: 0.35,
        activityTarget: 0.35
      };
      byId[n.id] = node;
      return node;
    });
    this.byId = byId;
    this.edges = this.data.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      delay: Math.random() * Math.PI * 2
    }));
  };

  MeshPulse.prototype.layout = function () {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const rAgents = Math.min(this.w, this.h) * 0.28;
    const rRooms = Math.min(this.w, this.h) * 0.42;

    const agents = this.nodes.filter((n) => n.ring === 'agents');
    const rooms = this.nodes.filter((n) => n.ring === 'rooms');

    this.nodes.forEach((n) => {
      if (n.ring === 'core') {
        n.x = cx;
        n.y = cy;
      }
    });

    agents.forEach((n, i) => {
      const a = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      n.x = cx + Math.cos(a) * rAgents;
      n.y = cy + Math.sin(a) * rAgents;
    });

    rooms.forEach((n, i) => {
      // Place Build left-upper arc, Sense right-lower arc feel — opposite sides
      const a = i === 0 ? -Math.PI * 0.75 : Math.PI * 0.25;
      n.x = cx + Math.cos(a) * rRooms;
      n.y = cy + Math.sin(a) * rRooms;
    });
  };

  MeshPulse.prototype.color = function (hue) {
    return COLORS[hue] || COLORS.cyan;
  };

  MeshPulse.prototype.onPointer = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    let bestD = 22;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD + n.r) { bestD = d; best = n; }
    }
    this.hover = best;
    this.canvas.style.cursor = best ? 'pointer' : 'grab';
    if (best) this.showTip(best, e.clientX - rect.left, e.clientY - rect.top);
    else this.hideTip();
  };

  MeshPulse.prototype.showTip = function (n, x, y) {
    if (!this.tooltip) return;
    this.tooltip.classList.toggle('rose-tip', n.hue === 'rose' || n.ring === 'rooms' && n.role === 'Sense');
    const actPct = n.activity != null ? Math.round(n.activity * 100) + '%' : '—';
    this.tooltip.innerHTML =
      '<div class="t-id">' + n.id + ' · ' + n.ring + '</div>' +
      '<div class="t-role">' + n.role + ' · act ' + actPct + '</div>' +
      '<div class="t-desc">' + n.desc + '</div>';
    const tw = 200;
    let left = x + 14;
    let top = y + 14;
    if (left + tw > this.w) left = x - tw - 8;
    if (top + 80 > this.h) top = y - 70;
    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
    this.tooltip.classList.add('visible');
  };

  MeshPulse.prototype.hideTip = function () {
    if (this.tooltip) this.tooltip.classList.remove('visible');
  };

  /** Token-driven immersion — faster / denser mesh ripples as tokens rise. */
  MeshPulse.prototype.setIntensity = function (u) {
    this.intensity = Math.max(0, Math.min(1, Number(u) || 0));
  };

  /**
   * Live per-node activity map.
   * Accepts live.json keys (L0,S1..S8,Build,Sense) and mesh ids (R-BUILD,R-SENSE).
   */
  MeshPulse.prototype.setNodeActivity = function (map) {
    if (!map || typeof map !== 'object') return;
    const alias = {
      Build: 'R-BUILD',
      Sense: 'R-SENSE',
      'R-BUILD': 'R-BUILD',
      'R-SENSE': 'R-SENSE'
    };
    for (const n of this.nodes) {
      let entry = map[n.id];
      if (!entry && n.role === 'Build') entry = map.Build;
      if (!entry && n.role === 'Sense') entry = map.Sense;
      if (!entry && alias[n.id]) entry = map[alias[n.id]];
      if (!entry) continue;
      const a = typeof entry === 'number' ? entry : entry.activity;
      if (a == null || !Number.isFinite(Number(a))) continue;
      n.activityTarget = Math.max(0, Math.min(1, Number(a)));
    }
  };

  MeshPulse.prototype.lerpActivities = function (alpha) {
    const a = Math.max(0, Math.min(1, alpha == null ? 0.12 : alpha));
    for (const n of this.nodes) {
      const t = n.activityTarget != null ? n.activityTarget : n.activity;
      n.activity += (t - n.activity) * a;
    }
  };

  MeshPulse.prototype.spawnPulse = function () {
    if (this.reduced || !this.edges.length) return;
    const e = this.edges[Math.floor(Math.random() * this.edges.length)];
    const boost = 1 + this.intensity * 1.6;
    this.pulses.push({
      from: e.from, to: e.to, p: 0,
      speed: (0.01 + Math.random() * 0.015) * boost,
      kind: e.kind
    });
    const cap = 28 + Math.floor(this.intensity * 24);
    if (this.pulses.length > cap) this.pulses.shift();
  };

  MeshPulse.prototype.spawnRipple = function () {
    if (this.reduced) return;
    const core = this.byId && this.byId.L0;
    if (!core) return;
    const speed = 1.6 + this.intensity * 2.4;
    this.ripples.push({
      x: core.x, y: core.y, r: 8,
      life: 0.4 + this.intensity * 0.25,
      max: Math.min(this.w, this.h) * 0.48,
      speed
    });
    const cap = 6 + Math.floor(this.intensity * 6);
    if (this.ripples.length > cap) this.ripples.shift();
  };

  MeshPulse.prototype.loop = function (now) {
    const dt = Math.min(32, now - (this._last || now));
    this._last = now;
    this.t += dt / 1000;
    this.lerpActivities(this.reduced ? 0.2 : 0.1);
    if (!this.reduced) {
      const pulseChance = 0.08 + this.intensity * 0.18;
      const rippleChance = 0.01 + this.intensity * 0.045;
      if (Math.random() < pulseChance) this.spawnPulse();
      if (Math.random() < rippleChance) this.spawnRipple();
    }
    this.draw();
    this._raf = requestAnimationFrame(this.loop.bind(this));
  };

  MeshPulse.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    // Outer room rings guide
    const cx = w * 0.5;
    const cy = h * 0.5;
    [0.28, 0.42].forEach((f, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * f, 0, Math.PI * 2);
      ctx.strokeStyle = i === 0 ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0, 255, 163, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Resonance ripples
    this.ripples = this.ripples.filter((r) => {
      r.r += this.reduced ? 0 : (r.speed || 1.8);
      r.life -= 0.008;
      if (r.life <= 0 || r.r > r.max) return false;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 229, 255, ${r.life * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return true;
    });

    // Edges
    this.edges.forEach((e) => {
      const a = this.byId[e.from];
      const b = this.byId[e.to];
      if (!a || !b) return;
      const flick = this.reduced ? 0.3 : 0.2 + 0.12 * Math.sin(this.t * 2.5 + e.delay);
      let col = 'rgba(0, 229, 255,';
      if (e.kind === 'synapse') col = 'rgba(0, 255, 163,';
      if (e.kind === 'room') col = 'rgba(224, 247, 250,';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = col + flick + ')';
      ctx.lineWidth = e.kind === 'dendrite' ? 1.4 : 1;
      ctx.stroke();
    });

    // Pulses along edges
    this.pulses = this.pulses.filter((p) => {
      p.p += p.speed;
      if (p.p >= 1) return false;
      const a = this.byId[p.from];
      const b = this.byId[p.to];
      if (!a || !b) return false;
      const x = a.x + (b.x - a.x) * p.p;
      const y = a.y + (b.y - a.y) * p.p;
      const c = p.kind === 'room' ? COLORS.ice : p.kind === 'synapse' ? COLORS.mint : COLORS.cyan;
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      return true;
    });

    // Nodes
    this.nodes.forEach((n) => {
      const act = n.activity != null ? n.activity : this.intensity;
      const breath = this.reduced ? 1 : 1 + Math.sin(this.t * (2.2 + act * 1.5) + n.phase) * (0.04 + act * 0.08);
      const r = n.r * breath * (0.92 + act * 0.18);
      const col = this.color(n.hue);
      const isHover = this.hover && this.hover.id === n.id;

      if (n.ring === 'core' || act > 0.15) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * (1.5 + act * 0.9), 0, Math.PI * 2);
        const glowA = (n.ring === 'core' ? 0.1 : 0.04) + act * 0.18;
        ctx.fillStyle = n.hue === 'rose'
          ? `rgba(255, 77, 141, ${glowA})`
          : n.hue === 'mint'
            ? `rgba(0, 255, 163, ${glowA})`
            : `rgba(0, 229, 255, ${glowA})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r + (isHover ? 3 : 0), 0, Math.PI * 2);
      if (n.ring === 'core') {
        const g = ctx.createRadialGradient(n.x - 3, n.y - 3, 2, n.x, n.y, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, COLORS.cyan);
        g.addColorStop(1, 'rgba(0, 229, 255, 0.25)');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = col;
        ctx.globalAlpha = isHover ? 1 : 0.55 + act * 0.45;
      }
      ctx.shadowColor = col;
      ctx.shadowBlur = isHover ? 18 : (n.ring === 'core' ? 16 : 6) + act * 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Labels
      ctx.font = (n.ring === 'core' ? '700 ' : '600 ') + (n.ring === 'rooms' ? '12px' : '11px') + ' system-ui, sans-serif';
      ctx.fillStyle = COLORS.ice;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = n.ring === 'core' ? 'L0 Cryoomega' : (n.ring === 'rooms' ? n.role : n.id + ' ' + n.role);
      ctx.globalAlpha = 0.9;
      ctx.fillText(label, n.x, n.y + r + 6);
      ctx.globalAlpha = 1;
    });
  };

  global.CryAIPulseMesh = MeshPulse;
})(typeof window !== 'undefined' ? window : globalThis);
