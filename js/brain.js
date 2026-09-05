/**
 * CryAIPulse — neural brain canvas
 * Dendrite propagation from L0 Cryoomega, synaptic gaps, cryo flicker.
 */
(function (global) {
  'use strict';

  const CYAN = '#00e5ff';
  const MINT = '#00ffa3';
  const ICE = '#e0f7fa';

  function BrainPulse(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.reduced = !!(opts && opts.reduced);
    this.hz = 8 + Math.random() * 4;
    this.intensity = 0.35; // 0..1 from token pulse-state (brain)
    this.t = 0;
    this.nodes = [];
    this.edges = [];
    this.pulses = [];
    this.hover = -1;
    this._raf = null;
    this._dpr = 1;
    this._onResize = this.resize.bind(this);
    this._onMove = this.onPointer.bind(this);
    this._onLeave = () => { this.hover = -1; };
  }

  BrainPulse.prototype.mount = function () {
    this.resize();
    this.buildGraph();
    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    this.loop(performance.now());
  };

  BrainPulse.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
  };

  BrainPulse.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this._dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this._dpr));
    this.w = rect.width;
    this.h = rect.height;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    if (this.nodes.length) this.layout();
  };

  BrainPulse.prototype.buildGraph = function () {
    // Organic brain-ish node layout (relative), L0 at center-left nucleus
    const defs = [
      { id: 'L0', label: 'Cryoomega', r: 14, core: true },
      { id: 'n1', label: '', r: 5 }, { id: 'n2', label: '', r: 4 },
      { id: 'n3', label: '', r: 6 }, { id: 'n4', label: '', r: 4 },
      { id: 'n5', label: '', r: 5 }, { id: 'n6', label: '', r: 4 },
      { id: 'n7', label: '', r: 5 }, { id: 'n8', label: '', r: 4 },
      { id: 'n9', label: '', r: 5 }, { id: 'n10', label: '', r: 4 },
      { id: 'n11', label: '', r: 6 }, { id: 'n12', label: '', r: 4 },
      { id: 'n13', label: '', r: 5 }, { id: 'n14', label: '', r: 4 },
      { id: 'n15', label: '', r: 5 }, { id: 'n16', label: '', r: 3 },
      { id: 'n17', label: '', r: 4 }, { id: 'n18', label: '', r: 5 },
      { id: 'n19', label: '', r: 3 }, { id: 'n20', label: '', r: 4 }
    ];
    this.nodes = defs.map((d, i) => Object.assign({ i }, d, { x: 0, y: 0, phase: Math.random() * Math.PI * 2 }));
    this.layout();

    // Dendrites from L0 + lateral synapses
    this.edges = [];
    for (let i = 1; i < this.nodes.length; i++) {
      this.edges.push({ a: 0, b: i, kind: 'dendrite', delay: i * 0.12 });
    }
    const laterals = [[1,3],[2,5],[3,7],[4,8],[5,9],[6,11],[7,12],[8,14],[9,15],[10,16],[11,17],[12,18],[13,19],[14,20],[3,11],[5,15],[8,17]];
    laterals.forEach(([a, b], i) => {
      if (a < this.nodes.length && b < this.nodes.length) {
        this.edges.push({ a, b, kind: 'synapse', delay: 0.5 + i * 0.08 });
      }
    });
  };

  BrainPulse.prototype.layout = function () {
    const cx = this.w * 0.42;
    const cy = this.h * 0.5;
    const rx = Math.min(this.w, this.h) * 0.38;
    const ry = Math.min(this.w, this.h) * 0.32;

    this.nodes.forEach((n, i) => {
      if (i === 0) {
        n.x = cx - rx * 0.15;
        n.y = cy;
        return;
      }
      // Brain hemisphere scatter
      const a = ((i - 1) / (this.nodes.length - 1)) * Math.PI * 1.6 - Math.PI * 0.3;
      const jitter = 0.55 + (Math.sin(i * 2.7) * 0.5 + 0.5) * 0.45;
      const lobe = i % 3 === 0 ? 1.12 : i % 2 === 0 ? 0.88 : 1.0;
      n.x = cx + Math.cos(a) * rx * jitter * lobe;
      n.y = cy + Math.sin(a) * ry * jitter * (0.85 + (i % 5) * 0.04);
    });
  };

  BrainPulse.prototype.onPointer = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = -1;
    let bestD = 18;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD + n.r) { bestD = d; best = i; }
    }
    this.hover = best;
    this.canvas.style.cursor = best >= 0 ? 'pointer' : 'crosshair';
  };

  BrainPulse.prototype.getHz = function () {
    return this.hz;
  };

  /** Token-driven immersion 0..1 — denser sparks / faster pulses as tokens rise. */
  BrainPulse.prototype.setIntensity = function (u, neuralHz) {
    this.intensity = Math.max(0, Math.min(1, Number(u) || 0));
    if (neuralHz != null && Number.isFinite(Number(neuralHz))) {
      this.hz = Number(neuralHz);
    }
  };

  BrainPulse.prototype.tickHz = function () {
    // Drift around token-derived base Hz; higher intensity → slightly wider band
    const base = this.hz;
    const band = 0.4 + this.intensity * 0.8;
    this.hz += (Math.sin(this.t * 0.4) * 0.02) + (Math.random() - 0.5) * 0.05;
    const lo = Math.max(6, base - band);
    const hi = Math.min(20, base + band);
    this.hz = Math.max(lo, Math.min(hi, this.hz));
  };

  BrainPulse.prototype.spawnPulse = function () {
    if (this.reduced) return;
    const edge = this.edges[Math.floor(Math.random() * this.edges.length)];
    if (!edge) return;
    const boost = 1 + this.intensity * 1.4;
    this.pulses.push({
      a: edge.a, b: edge.b, p: 0,
      speed: (edge.kind === 'dendrite' ? 0.012 + Math.random() * 0.01 : 0.018 + Math.random() * 0.012) * boost,
      kind: edge.kind
    });
    const cap = 40 + Math.floor(this.intensity * 40);
    if (this.pulses.length > cap) this.pulses.shift();
  };

  BrainPulse.prototype.loop = function (now) {
    const dt = Math.min(32, now - (this._last || now));
    this._last = now;
    this.t += dt / 1000;
    this.tickHz();
    // Spawn rate rises with token intensity (denser neural sparks)
    const spawnChance = this.reduced ? 0 : 0.06 + this.intensity * 0.22;
    if (Math.random() < spawnChance) this.spawnPulse();
    this.draw();
    this._raf = requestAnimationFrame(this.loop.bind(this));
  };

  BrainPulse.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    // Soft brain silhouette glow
    const g = ctx.createRadialGradient(w * 0.42, h * 0.5, 10, w * 0.45, h * 0.5, Math.min(w, h) * 0.45);
    g.addColorStop(0, 'rgba(0, 229, 255, 0.07)');
    g.addColorStop(0.55, 'rgba(0, 255, 163, 0.03)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Edges
    this.edges.forEach((e) => {
      const a = this.nodes[e.a];
      const b = this.nodes[e.b];
      const flick = this.reduced ? 0.35 : 0.25 + 0.15 * Math.sin(this.t * 3 + e.delay);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2 + Math.sin(this.t + e.delay) * (e.kind === 'synapse' ? 4 : 2);
      const my = (a.y + b.y) / 2 + Math.cos(this.t * 0.8 + e.delay) * 3;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = e.kind === 'dendrite'
        ? `rgba(0, 229, 255, ${flick})`
        : `rgba(0, 255, 163, ${flick * 0.85})`;
      ctx.lineWidth = e.kind === 'dendrite' ? 1.2 : 0.9;
      ctx.stroke();

      // Synaptic gap spark
      if (e.kind === 'synapse' && !this.reduced) {
        const sparkRate = 8 + this.intensity * 10;
        const spark = (Math.sin(this.t * sparkRate + e.delay * 10) + 1) * 0.5;
        const thresh = 0.88 - this.intensity * 0.25;
        if (spark > thresh) {
          ctx.beginPath();
          ctx.arc(mx, my, 2.2 + this.intensity * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(224, 247, 250, ${Math.min(1, spark)})`;
          ctx.fill();
        }
      }
    });

    // Traveling pulses
    this.pulses = this.pulses.filter((p) => {
      p.p += p.speed;
      if (p.p >= 1) return false;
      const a = this.nodes[p.a];
      const b = this.nodes[p.b];
      const x = a.x + (b.x - a.x) * p.p;
      const y = a.y + (b.y - a.y) * p.p;
      ctx.beginPath();
      ctx.arc(x, y, p.kind === 'dendrite' ? 3 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = p.kind === 'dendrite' ? CYAN : MINT;
      ctx.shadowColor = p.kind === 'dendrite' ? CYAN : MINT;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      return true;
    });

    // Nodes
    this.nodes.forEach((n, i) => {
      const breath = this.reduced ? 1 : 1 + Math.sin(this.t * 2 + n.phase) * 0.08;
      const r = n.r * breath;
      const isHover = i === this.hover;

      if (n.core) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        const cg = ctx.createRadialGradient(n.x - 2, n.y - 2, 1, n.x, n.y, r);
        cg.addColorStop(0, ICE);
        cg.addColorStop(0.4, CYAN);
        cg.addColorStop(1, 'rgba(0, 229, 255, 0.3)');
        ctx.fillStyle = cg;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = isHover ? 22 : 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = ICE;
        ctx.textAlign = 'center';
        ctx.fillText('L0', n.x, n.y + r + 14);
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + (isHover ? 2 : 0), 0, Math.PI * 2);
        ctx.fillStyle = isHover ? MINT : CYAN;
        ctx.globalAlpha = isHover ? 1 : 0.75;
        ctx.shadowColor = isHover ? MINT : CYAN;
        ctx.shadowBlur = isHover ? 12 : 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    });
  };

  global.CryAIPulseBrain = BrainPulse;
})(typeof window !== 'undefined' ? window : globalThis);
