/**
 * CryAIPulse — Agents Playground
 * Interactive spektrum landscapes (L0 + S1–S8). Pan/zoom, click-to-travel,
 * hover tooltips, mini-dialogue; live.json tints weather / zone intensity.
 */
(function (global) {
  'use strict';

  const CYAN = '#00e5ff';
  const MINT = '#00ffa3';
  const ICE = '#e0f7fa';
  const ROSE = '#ff4d8d';

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function clamp01(n) {
    return clamp(Number(n) || 0, 0, 1);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function nodeAct(nodes, key) {
    if (!nodes) return 0;
    const e = nodes[key];
    if (e == null) return 0;
    return typeof e === 'number' ? clamp01(e) : clamp01(e.activity);
  }

  function hexRgb(hex) {
    const h = String(hex || '#00e5ff').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** Map live avatar / lounge ids onto landscape agentIds */
  const LIVE_ID_MAP = {
    cryoomega: 'cryoomega',
    strategist: 'strategist',
    architect: 'architect',
    coder: 'coder',
    researcher: 'researcher',
    writer: 'writer',
    critic: 'critic',
    domain: 'domain',
    ethicist: 'ethicist',
  };

  function CryAIPulsePlayground(root, opts) {
    this.root = root;
    this.opts = opts || {};
    this.reduced = !!this.opts.reduced;
    this.comfort = !!this.opts.comfort;
    this.canvas = root.querySelector('#playground-canvas');
    this.tip = root.querySelector('#pg-tooltip');
    this.focusRole = root.querySelector('#pg-focus-role');
    this.focusBiome = root.querySelector('#pg-focus-biome');
    this.focusDesc = root.querySelector('#pg-focus-desc');
    this.statAct = root.querySelector('#pg-stat-act');
    this.statWeather = root.querySelector('#pg-stat-weather');
    this.zoneList = root.querySelector('#pg-zone-list');
    this.bubbleFrom = root.querySelector('#pg-bubble-from');
    this.bubbleText = root.querySelector('#pg-bubble-text');
    this.metaEl = root.querySelector('#pg-meta');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.zones = [];
    this.paths = [];
    this.world = { width: 2400, height: 1600 };
    this.cam = { x: 1200, y: 800, zoom: 0.55 };
    this.targetCam = { x: 1200, y: 800, zoom: 0.55 };
    this.focusId = 'L0';
    this.hoverId = null;
    this.activity = {};
    this.t = 0;
    this._raf = null;
    this._running = false;
    this._dpr = 1;
    this._drag = null;
    this._pinch = null;
    this._dialogueIdx = 0;
    this._dialogueTimer = 0;
    this._mounted = false;
    this._visible = false;
  }

  CryAIPulsePlayground.prototype.mount = function (data) {
    if (!this.canvas || !this.ctx || !data) return;
    this.world = data.world || this.world;
    this.zones = (data.zones || []).slice();
    this.paths = (data.paths || []).slice();
    this._buildZoneList();
    this._bind();
    this.resize();
    this.focusZone('L0', true);
    this._mounted = true;
    this.setVisible(true);
  };

  CryAIPulsePlayground.prototype.setVisible = function (on) {
    this._visible = !!on;
    if (on) {
      this.resize();
      this._start();
    } else {
      this._stop();
    }
  };

  CryAIPulsePlayground.prototype.setComfort = function (on) {
    this.comfort = !!on;
  };

  CryAIPulsePlayground.prototype.applyLive = function (live) {
    if (!live) return;
    const nodes = live.nodes || {};
    const next = {};
    this.zones.forEach((z) => {
      next[z.id] = nodeAct(nodes, z.id);
    });
    this.activity = next;

    // Optional energy from avatars[]
    if (Array.isArray(live.avatars)) {
      live.avatars.forEach((a) => {
        const aid = LIVE_ID_MAP[a.id] || a.id;
        const zone = this.zones.find((z) => z.agentId === aid);
        if (zone && a.energy != null) {
          this.activity[zone.id] = clamp01(
            (this.activity[zone.id] || 0) * 0.55 + clamp01(a.energy) * 0.45
          );
        }
      });
    }

    this._refreshZoneListActs();
    this._updateFocusChrome();
  };

  CryAIPulsePlayground.prototype.focusZone = function (id, instant) {
    const z = this.zones.find((x) => x.id === id);
    if (!z) return;
    this.focusId = id;
    this.targetCam.x = z.x;
    this.targetCam.y = z.y;
    this.targetCam.zoom = clamp(this.targetCam.zoom, 0.7, 1.35);
    if (this.targetCam.zoom < 0.75) this.targetCam.zoom = 0.85;
    if (instant) {
      this.cam.x = z.x;
      this.cam.y = z.y;
      this.cam.zoom = this.targetCam.zoom;
    }
    this._dialogueIdx = 0;
    this._dialogueTimer = 0;
    this._updateFocusChrome();
    this._refreshZoneListActs();
    this._showDialogue(z);
  };

  CryAIPulsePlayground.prototype._buildZoneList = function () {
    if (!this.zoneList) return;
    this.zoneList.innerHTML = this.zones.map((z) => {
      return (
        '<li><button type="button" data-zone="' + z.id + '">' +
          '<span class="zid">' + z.id + '</span>' +
          '<span class="zlabel">' + z.role + '</span>' +
          '<span class="zact">—</span>' +
        '</button></li>'
      );
    }).join('');
    this.zoneList.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.focusZone(btn.getAttribute('data-zone'), false);
      });
    });
  };

  CryAIPulsePlayground.prototype._refreshZoneListActs = function () {
    if (!this.zoneList) return;
    this.zoneList.querySelectorAll('button').forEach((btn) => {
      const id = btn.getAttribute('data-zone');
      const a = this.activity[id] || 0;
      const actEl = btn.querySelector('.zact');
      if (actEl) actEl.textContent = Math.round(a * 100) + '%';
      btn.classList.toggle('is-active', id === this.focusId);
      btn.classList.toggle('is-hot', a >= 0.65);
    });
  };

  CryAIPulsePlayground.prototype._updateFocusChrome = function () {
    const z = this.zones.find((x) => x.id === this.focusId);
    if (!z) return;
    const act = this.activity[z.id] || 0;
    if (this.focusRole) this.focusRole.textContent = z.role;
    if (this.focusBiome) this.focusBiome.textContent = z.label;
    if (this.focusDesc) this.focusDesc.textContent = z.desc;
    if (this.statAct) this.statAct.textContent = Math.round(act * 100) + '%';
    if (this.statWeather) {
      const w = this._weatherLabel(z, act);
      this.statWeather.textContent = w;
    }
    if (this.metaEl) {
      this.metaEl.textContent =
        z.id + ' · ' + z.biome + ' · zoom ' + this.cam.zoom.toFixed(2);
    }
  };

  CryAIPulsePlayground.prototype._weatherLabel = function (z, act) {
    const base = z.weather || 'clear';
    if (act >= 0.75) {
      if (base === 'clear') return 'pulse storm';
      if (base === 'mist') return 'thick mist';
      if (base === 'aurora') return 'bright aurora';
      if (base === 'neon') return 'neon surge';
      if (base === 'storm') return 'ridge gale';
      if (base === 'crystal') return 'crystal flare';
      if (base === 'ice') return 'ice bloom';
    }
    if (act < 0.3) return 'calm ' + base;
    return base;
  };

  CryAIPulsePlayground.prototype._showDialogue = function (z) {
    const lines = z.dialogue || [];
    if (!lines.length) {
      if (this.bubbleFrom) this.bubbleFrom.textContent = z.role;
      if (this.bubbleText) this.bubbleText.textContent = z.subtitle || z.label;
      return;
    }
    const line = lines[this._dialogueIdx % lines.length];
    if (this.bubbleFrom) this.bubbleFrom.textContent = z.role;
    if (this.bubbleText) this.bubbleText.textContent = line;
  };

  CryAIPulsePlayground.prototype._bind = function () {
    const c = this.canvas;
    if (!c || c._pgBound) return;
    c._pgBound = true;

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this._drag = {
        pid: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        ox: this.targetCam.x,
        oy: this.targetCam.y,
        moved: false,
      };
    });

    c.addEventListener('pointermove', (e) => {
      if (this._drag && this._drag.pid === e.pointerId) {
        const dx = e.clientX - this._drag.sx;
        const dy = e.clientY - this._drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) this._drag.moved = true;
        const inv = 1 / this.cam.zoom;
        this.targetCam.x = this._drag.ox - dx * inv;
        this.targetCam.y = this._drag.oy - dy * inv;
        this._clampCam();
      } else {
        this._hoverAt(e.clientX, e.clientY);
      }
    });

    const endDrag = (e) => {
      if (!this._drag || this._drag.pid !== e.pointerId) return;
      const moved = this._drag.moved;
      this._drag = null;
      if (!moved) {
        const world = this._screenToWorld(e.clientX, e.clientY);
        const hit = this._hitZone(world.x, world.y);
        if (hit) this.focusZone(hit.id, false);
      }
    };
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', endDrag);

    c.addEventListener('pointerleave', () => {
      this.hoverId = null;
      this._hideTip();
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const before = this._screenToWorld(e.clientX, e.clientY);
      this.targetCam.zoom = clamp(this.targetCam.zoom * factor, 0.28, 1.8);
      // Keep point under cursor stable after zoom settle approx
      this.cam.zoom = lerp(this.cam.zoom, this.targetCam.zoom, 0.5);
      const after = this._screenToWorld(e.clientX, e.clientY);
      this.targetCam.x += before.x - after.x;
      this.targetCam.y += before.y - after.y;
      this._clampCam();
    }, { passive: false });

    // Touch pinch via two pointers tracked simply on wheel-less devices
    let pointers = new Map();
    c.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this._pinch = { dist: dist, zoom: this.targetCam.zoom };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && this._pinch) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = dist / Math.max(1, this._pinch.dist);
        this.targetCam.zoom = clamp(this._pinch.zoom * ratio, 0.28, 1.8);
      }
    });
    const clearPtr = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) this._pinch = null;
    };
    c.addEventListener('pointerup', clearPtr);
    c.addEventListener('pointercancel', clearPtr);

    window.addEventListener('resize', () => {
      if (this._visible) this.resize();
    });

    const resetBtn = this.root.querySelector('#pg-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.targetCam.zoom = 0.55;
        this.focusZone('L0', false);
      });
    }
    const zoomIn = this.root.querySelector('#pg-zoom-in');
    const zoomOut = this.root.querySelector('#pg-zoom-out');
    if (zoomIn) {
      zoomIn.addEventListener('click', () => {
        this.targetCam.zoom = clamp(this.targetCam.zoom * 1.15, 0.28, 1.8);
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', () => {
        this.targetCam.zoom = clamp(this.targetCam.zoom * 0.87, 0.28, 1.8);
      });
    }
  };

  CryAIPulsePlayground.prototype._clampCam = function () {
    const pad = 200;
    this.targetCam.x = clamp(this.targetCam.x, pad, this.world.width - pad);
    this.targetCam.y = clamp(this.targetCam.y, pad, this.world.height - pad);
  };

  CryAIPulsePlayground.prototype.resize = function () {
    if (!this.canvas || !this.ctx) return;
    const wrap = this.canvas.parentElement;
    const rect = wrap ? wrap.getBoundingClientRect() : null;
    const cssW = Math.max(280, Math.floor((rect && rect.width) || this.canvas.clientWidth || 800));
    const cssH = Math.max(280, Math.floor(this.canvas.clientHeight || (rect && rect.height) || 480));
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(cssW * this._dpr);
    this.canvas.height = Math.floor(cssH * this._dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.w = cssW;
    this.h = cssH;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  };

  CryAIPulsePlayground.prototype._screenToWorld = function (clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - this.w / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.h / 2) / this.cam.zoom + this.cam.y,
    };
  };

  CryAIPulsePlayground.prototype._hitZone = function (wx, wy) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const d = Math.hypot(wx - z.x, wy - z.y);
      const r = (z.radius || 100) * 1.15;
      if (d < r && d < bestD) {
        best = z;
        bestD = d;
      }
    }
    return best;
  };

  CryAIPulsePlayground.prototype._hoverAt = function (clientX, clientY) {
    const world = this._screenToWorld(clientX, clientY);
    const hit = this._hitZone(world.x, world.y);
    this.hoverId = hit ? hit.id : null;
    if (hit) {
      this._showTip(hit, clientX, clientY);
    } else {
      this._hideTip();
    }
  };

  CryAIPulsePlayground.prototype._showTip = function (z, clientX, clientY) {
    if (!this.tip) return;
    const act = this.activity[z.id] || 0;
    this.tip.innerHTML =
      '<div class="t-id">' + z.id + ' · ' + z.biome + '</div>' +
      '<div class="t-role">' + z.role + '</div>' +
      '<div class="t-desc">' + z.label + ' — ' + (z.subtitle || '') + '</div>' +
      '<div class="t-act">activity ' + Math.round(act * 100) + '% · ' +
        this._weatherLabel(z, act) + '</div>';
    const wrap = this.canvas.parentElement.getBoundingClientRect();
    let left = clientX - wrap.left + 14;
    let top = clientY - wrap.top + 14;
    if (left > wrap.width - 220) left = clientX - wrap.left - 200;
    if (top > wrap.height - 100) top = clientY - wrap.top - 90;
    this.tip.style.left = left + 'px';
    this.tip.style.top = top + 'px';
    this.tip.classList.add('visible');
  };

  CryAIPulsePlayground.prototype._hideTip = function () {
    if (this.tip) this.tip.classList.remove('visible');
  };

  CryAIPulsePlayground.prototype._start = function () {
    if (this._running) return;
    this._running = true;
    let prev = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      this._tick(dt);
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };

  CryAIPulsePlayground.prototype._stop = function () {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  CryAIPulsePlayground.prototype._tick = function (dt) {
    this.t += dt;
    const ease = this.reduced ? 0.28 : 0.12;
    this.cam.x = lerp(this.cam.x, this.targetCam.x, ease);
    this.cam.y = lerp(this.cam.y, this.targetCam.y, ease);
    this.cam.zoom = lerp(this.cam.zoom, this.targetCam.zoom, ease);

    this._dialogueTimer += dt;
    if (this._dialogueTimer > (this.comfort || this.reduced ? 8 : 5.5)) {
      this._dialogueTimer = 0;
      const z = this.zones.find((x) => x.id === this.focusId);
      if (z && z.dialogue && z.dialogue.length > 1) {
        this._dialogueIdx = (this._dialogueIdx + 1) % z.dialogue.length;
        this._showDialogue(z);
      }
    }

    if (this.metaEl && Math.floor(this.t * 4) % 2 === 0) {
      this._updateFocusChrome();
    }
  };

  CryAIPulsePlayground.prototype._draw = function () {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    // Backdrop
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#0a1428');
    bg.addColorStop(1, '#020510');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    this._drawWorldGrid(ctx);
    this._drawPaths(ctx);
    // Draw non-focus zones first, focus last
    const ordered = this.zones.slice().sort((a, b) => {
      if (a.id === this.focusId) return 1;
      if (b.id === this.focusId) return -1;
      return a.y - b.y;
    });
    ordered.forEach((z) => this._drawZone(ctx, z));

    ctx.restore();

    // HUD vignette
    if (!this.comfort) {
      const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
      vig.addColorStop(0, 'rgba(2,5,16,0)');
      vig.addColorStop(1, 'rgba(2,5,16,0.45)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }
  };

  CryAIPulsePlayground.prototype._drawWorldGrid = function (ctx) {
    const step = 80;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.world.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.world.height);
    }
    for (let y = 0; y <= this.world.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.world.width, y);
    }
    ctx.stroke();
  };

  CryAIPulsePlayground.prototype._drawPaths = function (ctx) {
    const byId = {};
    this.zones.forEach((z) => { byId[z.id] = z; });
    ctx.lineWidth = 2;
    this.paths.forEach((p) => {
      const a = byId[p.from];
      const b = byId[p.to];
      if (!a || !b) return;
      const fromCore = p.from === 'L0' || p.to === 'L0';
      ctx.strokeStyle = fromCore
        ? 'rgba(0, 229, 255, 0.22)'
        : 'rgba(0, 255, 163, 0.14)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 40;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();

      // Soft pulse along dendrite when activity high
      const act = ((this.activity[a.id] || 0) + (this.activity[b.id] || 0)) / 2;
      if (act > 0.45 && !this.reduced && !this.comfort) {
        const u = (Math.sin(this.t * 2 + a.x * 0.01) + 1) * 0.5;
        const px = lerp(a.x, b.x, u);
        const py = lerp(a.y, b.y, u) - 40 * Math.sin(Math.PI * u);
        ctx.fillStyle = 'rgba(0, 229, 255, ' + (0.25 + act * 0.4) + ')';
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  CryAIPulsePlayground.prototype._drawZone = function (ctx, z) {
    const act = this.activity[z.id] || 0;
    const focused = z.id === this.focusId;
    const hovered = z.id === this.hoverId;
    const r = z.radius || 100;
    const [pr, pg, pb] = hexRgb(z.palette && z.palette[0]);
    const glowMul = this.comfort ? 0.4 : 1;
    const pulse = this.reduced ? 0 : Math.sin(this.t * (1.5 + act * 2)) * 0.5 + 0.5;

    // Ground plate
    ctx.save();
    ctx.translate(z.x, z.y);

    const ground = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.35);
    ground.addColorStop(0, 'rgba(' + pr + ',' + pg + ',' + pb + ',' + (0.18 + act * 0.22) + ')');
    ground.addColorStop(0.55, 'rgba(' + pr + ',' + pg + ',' + pb + ',' + (0.06 + act * 0.08) + ')');
    ground.addColorStop(1, 'rgba(' + pr + ',' + pg + ',' + pb + ',0)');
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.ellipse(0, 18, r * 1.25, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // Biome silhouette
    this._drawBiome(ctx, z, act, pulse);

    // Selection ring
    if (focused || hovered) {
      ctx.strokeStyle = focused ? CYAN : ICE;
      ctx.lineWidth = focused ? 2.4 : 1.4;
      ctx.globalAlpha = focused ? 0.85 : 0.55;
      ctx.setLineDash(focused ? [] : [6, 5]);
      ctx.beginPath();
      ctx.ellipse(0, 18, r * 1.05 + pulse * 4, r * 0.62 + pulse * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Chibi agent
    this._drawChibi(ctx, z, act, focused);

    // Label
    ctx.textAlign = 'center';
    ctx.font = '600 13px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = ICE;
    ctx.globalAlpha = 0.95;
    ctx.fillText(z.role, 0, r * 0.78);
    ctx.font = '11px SF Mono, Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.globalAlpha = 0.8;
    ctx.fillText(z.id + ' · ' + z.label, 0, r * 0.78 + 16);
    ctx.globalAlpha = 1;

    // Activity arc
    ctx.strokeStyle = 'rgba(' + pr + ',' + pg + ',' + pb + ',0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-r * 0.75, -r * 0.35, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = MINT;
    ctx.globalAlpha = 0.55 + act * 0.45;
    ctx.beginPath();
    ctx.arc(-r * 0.75, -r * 0.35, 10, -Math.PI / 2, -Math.PI / 2 + act * Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Weather particles
    if (!this.reduced && !this.comfort && act > 0.2) {
      this._drawWeather(ctx, z, act, pulse, glowMul);
    }

    ctx.restore();
  };

  CryAIPulsePlayground.prototype._drawBiome = function (ctx, z, act, pulse) {
    const biome = z.biome;
    const [pr, pg, pb] = hexRgb(z.palette && z.palette[0]);
    ctx.save();

    if (biome === 'nexus-core') {
      for (let i = 3; i >= 1; i--) {
        ctx.strokeStyle = 'rgba(0,229,255,' + (0.12 + act * 0.1) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 28 + i * 18 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,229,255,' + (0.2 + act * 0.25) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, 16 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (biome === 'strategy-overlook') {
      ctx.fillStyle = 'rgba(92,225,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(-70, 30);
      ctx.lineTo(-20, -50);
      ctx.lineTo(10, -20);
      ctx.lineTo(55, -55);
      ctx.lineTo(80, 30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(126,200,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Path markers
      ctx.strokeStyle = CYAN;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-40, 20);
      ctx.quadraticCurveTo(0, -10, 40, 15);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (biome === 'grid-mesa') {
      ctx.strokeStyle = 'rgba(196,181,253,0.45)';
      ctx.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 18 - 10, 35);
        ctx.lineTo(i * 18 + 10, -40);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(167,139,250,0.2)';
      ctx.fillRect(-36, -48, 28, 55);
      ctx.fillRect(8, -62, 22, 70);
      ctx.strokeStyle = '#c4b5fd';
      ctx.strokeRect(-36, -48, 28, 55);
      ctx.strokeRect(8, -62, 22, 70);
    } else if (biome === 'neon-canyon') {
      ctx.fillStyle = 'rgba(0,255,163,0.12)';
      ctx.fillRect(-55, -70, 28, 100);
      ctx.fillRect(25, -85, 32, 115);
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + act * 0.4;
      ctx.strokeRect(-55, -70, 28, 100);
      ctx.strokeRect(25, -85, 32, 115);
      ctx.beginPath();
      ctx.moveTo(-27, -20);
      ctx.lineTo(25, -10);
      ctx.moveTo(-20, 10);
      ctx.lineTo(30, 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Bracket glyphs
      ctx.font = '16px SF Mono, monospace';
      ctx.fillStyle = MINT;
      ctx.fillText('{', -70, -30);
      ctx.fillText('}', 62, -30);
    } else if (biome === 'aurora-field') {
      for (let i = 0; i < 4; i++) {
        const ox = -50 + i * 30;
        const wave = Math.sin(this.t * 1.2 + i) * 8;
        ctx.strokeStyle = 'rgba(160,255,224,' + (0.25 + act * 0.3) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ox, 25);
        ctx.bezierCurveTo(ox + 10, -20 + wave, ox + 20, -55 - wave, ox + 35, -30);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(103,232,249,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, 28, 80, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (biome === 'mist-valley') {
      ctx.fillStyle = 'rgba(126,200,255,0.1)';
      ctx.beginPath();
      ctx.ellipse(-30, 10, 50, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(35, 18, 55, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(224,247,250,' + (0.08 + act * 0.12) + ')';
      for (let i = 0; i < 5; i++) {
        const mx = -60 + i * 30 + Math.sin(this.t + i) * 6;
        ctx.beginPath();
        ctx.ellipse(mx, -10 - i * 4, 28, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (biome === 'sharp-ridges') {
      ctx.fillStyle = 'rgba(148,163,184,0.25)';
      ctx.beginPath();
      ctx.moveTo(-75, 35);
      ctx.lineTo(-40, -55);
      ctx.lineTo(-10, 5);
      ctx.lineTo(20, -70);
      ctx.lineTo(50, -15);
      ctx.lineTo(80, 35);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ICE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (biome === 'crystal-caves') {
      const facets = [
        [-30, 20, -10, -50, 15, 10],
        [10, 25, 35, -45, 55, 15],
        [-5, 30, 5, -25, 25, 28],
      ];
      facets.forEach((f, i) => {
        ctx.fillStyle = 'rgba(34,211,238,' + (0.12 + i * 0.05 + act * 0.1) + ')';
        ctx.strokeStyle = 'rgba(103,232,249,0.6)';
        ctx.beginPath();
        ctx.moveTo(f[0], f[1]);
        ctx.lineTo(f[2], f[3]);
        ctx.lineTo(f[4], f[5]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    } else if (biome === 'ice-garden') {
      ctx.strokeStyle = 'rgba(255,77,141,0.35)';
      ctx.fillStyle = 'rgba(253,164,175,0.12)';
      ctx.beginPath();
      ctx.arc(0, 5, 55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + this.t * 0.2;
        const lx = Math.cos(ang) * 40;
        const ly = Math.sin(ang) * 28;
        ctx.fillStyle = ROSE;
        ctx.globalAlpha = 0.35 + act * 0.3;
        ctx.beginPath();
        ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(' + pr + ',' + pg + ',' + pb + ',0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  CryAIPulsePlayground.prototype._drawWeather = function (ctx, z, act, pulse, glowMul) {
    const kind = z.weather || 'clear';
    const n = Math.floor(6 + act * 10);
    for (let i = 0; i < n; i++) {
      const seed = i * 17.3 + z.x * 0.01;
      const px = Math.sin(this.t * (0.7 + act) + seed) * (z.radius * 0.9);
      const py = Math.cos(this.t * 0.5 + seed * 1.3) * (z.radius * 0.5) - 20;
      let alpha = (0.2 + act * 0.35) * glowMul;
      ctx.globalAlpha = alpha;
      if (kind === 'neon') {
        ctx.fillStyle = MINT;
        ctx.fillRect(px, py, 2, 8 + pulse * 4);
      } else if (kind === 'aurora') {
        ctx.fillStyle = '#a0ffe0';
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'mist' || kind === 'ice') {
        ctx.fillStyle = ICE;
        ctx.beginPath();
        ctx.arc(px, py, 3 + act * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'storm') {
        ctx.strokeStyle = ICE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + 4, py + 10);
        ctx.stroke();
      } else if (kind === 'crystal') {
        ctx.fillStyle = CYAN;
        ctx.beginPath();
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px + 3, py);
        ctx.lineTo(px, py + 4);
        ctx.lineTo(px - 3, py);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = CYAN;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  /** Compact chibi matching lounge cast silhouette */
  CryAIPulsePlayground.prototype._drawChibi = function (ctx, z, act, focused) {
    const accent = (z.palette && z.palette[0]) || CYAN;
    const bob = (this.reduced || this.comfort) ? 0 : Math.sin(this.t * (1.3 + act)) * (1 + act);
    ctx.save();
    ctx.translate(0, bob - 8);

    // Glow
    const [r, g, b] = hexRgb(accent);
    const grd = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + ((0.12 + act * 0.2) * (focused ? 1.3 : 1)) + ')');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.25)';
    ctx.beginPath();
    ctx.roundRect(-8, 14, 6, 8, 2);
    ctx.roundRect(2, 14, 6, 8, 2);
    ctx.fill();

    // Torso
    ctx.fillStyle = '#0d2138';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-12, -2, 24, 18, 8);
    ctx.fill();
    ctx.stroke();

    // Heart chevron
    ctx.strokeStyle = MINT;
    ctx.globalAlpha = 0.55 + act * 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, 5);
    ctx.lineTo(0, 9);
    ctx.lineTo(4, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Head
    ctx.fillStyle = '#0a1428';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    if (!this.comfort && !this.reduced) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6 + act * 6;
    }
    ctx.beginPath();
    ctx.arc(0, -16, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Antenna
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -36, 2, 0, Math.PI * 2);
    ctx.fill();

    // Face
    ctx.fillStyle = ICE;
    ctx.beginPath();
    ctx.arc(-4, -17, 1.8, 0, Math.PI * 2);
    ctx.arc(4, -17, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(224,247,250,0.7)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-2, -12);
    ctx.lineTo(2, -12);
    ctx.stroke();

    ctx.restore();
  };

  global.CryAIPulsePlayground = CryAIPulsePlayground;
})(typeof window !== 'undefined' ? window : globalThis);
