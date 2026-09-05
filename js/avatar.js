/**
 * CryAIPulse — AvatarCast: multi chibi lounge (L0 + spektrum roles).
 * States: sleep | wake | read | code | draw | check
 * Driven by live.json avatars[] (or derived from nodes).
 */
(function (global) {
  'use strict';

  const CYAN = '#00e5ff';
  const MINT = '#00ffa3';
  const ICE = '#e0f7fa';
  const ROSE = '#ff4d8d';
  const BG = '#0a1428';

  const LABELS = {
    sleep: 'Sleeping',
    wake: 'Waking',
    read: 'Reading',
    code: 'Coding',
    draw: 'Drawing',
    check: 'Checking',
  };

  const VALID = Object.keys(LABELS);

  /** Public cast — public role names only */
  const CAST_ROSTER = [
    { id: 'cryoomega', role: 'Cryoomega', node: 'L0', accent: CYAN, tint: [0, 229, 255] },
    { id: 'coder', role: 'Coder', node: 'S3', accent: MINT, tint: [0, 255, 163] },
    { id: 'critic', role: 'Critic', node: 'S6', accent: ICE, tint: [224, 247, 250] },
    { id: 'writer', role: 'Writer', node: 'S5', accent: '#7ec8ff', tint: [126, 200, 255] },
    { id: 'researcher', role: 'Researcher', node: 'S4', accent: '#a0ffe0', tint: [160, 255, 224] },
    { id: 'architect', role: 'Architect', node: 'S2', accent: '#c4b5fd', tint: [196, 181, 253] },
  ];

  const ROLE_STATE = {
    cryoomega: 'wake',
    coder: 'code',
    critic: 'check',
    writer: 'draw',
    researcher: 'read',
    architect: 'code',
  };

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  function nodeAct(nodes, key) {
    if (!nodes) return 0;
    const e = nodes[key];
    if (e == null) return 0;
    return typeof e === 'number' ? clamp01(e) : clamp01(e.activity);
  }

  /** Derive single avatar when live omits avatar (legacy). */
  function deriveAvatarFromLive(live) {
    if (!live) return { state: 'sleep', energy: 0.1, label: LABELS.sleep };
    if (live.avatar && live.avatar.state && VALID.indexOf(live.avatar.state) >= 0) {
      const st = live.avatar.state;
      return {
        state: st,
        energy: clamp01(live.avatar.energy != null ? live.avatar.energy : 0.5),
        label: live.avatar.label || LABELS[st] || st,
      };
    }
    const cast = deriveAvatarsFromLive(live);
    const lead = cast[0] || { state: 'sleep', energy: 0.1, label: LABELS.sleep };
    return { state: lead.state, energy: lead.energy, label: lead.label };
  }

  /**
   * Build avatars[] from live.avatars or node activity + roster.
   */
  function deriveAvatarsFromLive(live) {
    if (live && Array.isArray(live.avatars) && live.avatars.length) {
      return live.avatars.map((a) => {
        const id = a.id || 'cryoomega';
        const roster = CAST_ROSTER.find((r) => r.id === id) || CAST_ROSTER[0];
        const st = VALID.indexOf(a.state) >= 0 ? a.state : (ROLE_STATE[id] || 'wake');
        return {
          id: id,
          role: a.role || roster.role,
          state: st,
          energy: clamp01(a.energy != null ? a.energy : 0.5),
          label: a.label || LABELS[st] || st,
          node: roster.node,
          accent: roster.accent,
          tint: roster.tint,
        };
      });
    }

    const pulse = (live && live.pulse) || {};
    const brain = clamp01(pulse.brain);
    const heart = clamp01(pulse.heart);
    const baseEnergy = clamp01((brain + heart) / 2);
    const nodes = (live && live.nodes) || {};
    const sources = ((live && live.sources) || []).map((s) => String(s).toLowerCase());
    const has = (frag) => sources.some((s) => s.indexOf(frag) >= 0);

    return CAST_ROSTER.map((r) => {
      const act = nodeAct(nodes, r.node);
      const energy = clamp01(act > 0 ? act * 0.55 + baseEnergy * 0.45 : baseEnergy * 0.7);
      let state = ROLE_STATE[r.id] || 'wake';

      if (energy < 0.16) state = 'sleep';
      else if (energy < 0.26) state = 'wake';
      else if (r.id === 'coder' || r.node === 'S3') {
        state = has('cod') || act >= 0.45 ? 'code' : 'wake';
      } else if (r.id === 'researcher' || r.node === 'S4') {
        state = 'read';
      } else if (r.id === 'writer' || r.node === 'S5') {
        state = 'draw';
      } else if (r.id === 'critic' || r.node === 'S6') {
        state = 'check';
      } else if (r.id === 'architect' || r.node === 'S2') {
        state = act >= 0.5 ? 'code' : 'read';
      } else if (r.id === 'cryoomega') {
        if (energy >= 0.55) state = 'wake';
        else if (energy >= 0.35) state = 'read';
        else state = 'wake';
      }

      if (energy < 0.16) state = 'sleep';

      return {
        id: r.id,
        role: r.role,
        state: state,
        energy: energy,
        label: LABELS[state],
        node: r.node,
        accent: r.accent,
        tint: r.tint,
      };
    });
  }

  // —— Single chibi painter ——
  function AvatarPainter(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.reduced = !!(opts && opts.reduced);
    this.comfort = !!(opts && opts.comfort);
    this.accent = (opts && opts.accent) || CYAN;
    this.tint = (opts && opts.tint) || [0, 229, 255];
    this.state = 'sleep';
    this.energy = 0.2;
    this.label = LABELS.sleep;
    this.role = (opts && opts.role) || 'Agent';
    this.id = (opts && opts.id) || 'agent';
    this.t = Math.random() * 10;
    this._raf = null;
    this._dpr = 1;
    this._size = 88;
    this._blink = 0;
    this._nextBlink = 2 + Math.random() * 3;
    this._prevTs = 0;
    this._running = false;
    this.focused = false;
    this.speaking = false;
  }

  AvatarPainter.prototype.resize = function () {
    const frame = this.canvas.parentElement;
    const rect = frame ? frame.getBoundingClientRect() : null;
    const css = Math.round((rect && rect.width) ? rect.width : this._size);
    this._size = css;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(css * this._dpr);
    this.canvas.height = Math.floor(css * this._dpr);
    this.canvas.style.width = css + 'px';
    this.canvas.style.height = css + 'px';
    this.w = css;
    this.h = css;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  };

  AvatarPainter.prototype.setState = function (state, label) {
    if (VALID.indexOf(state) < 0) return;
    this.state = state;
    this.label = label || LABELS[state] || state;
  };

  AvatarPainter.prototype.setEnergy = function (energy) {
    this.energy = clamp01(energy);
  };

  AvatarPainter.prototype.setComfort = function (on) {
    this.comfort = !!on;
  };

  AvatarPainter.prototype.tick = function (dt) {
    this.t += dt;
    if (!this.reduced && !this.comfort) {
      this._nextBlink -= dt;
      if (this._nextBlink <= 0) {
        this._blink = 0.12;
        this._nextBlink = 2.2 + Math.random() * 3.5;
      }
      if (this._blink > 0) this._blink = Math.max(0, this._blink - dt);
    }
  };

  AvatarPainter.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    const [tr, tg, tb] = this.tint;
    const accent = this.accent;
    const cx = w * 0.5;
    const anim = this.reduced || this.comfort;
    const bob = anim ? 0 : Math.sin(this.t * (1.2 + this.energy)) * (1.0 + this.energy * 1.2);
    const cy = h * 0.52 + bob;
    const glowMul = this.comfort ? 0.45 : 1;
    const focusBoost = this.focused ? 1.25 : 1;
    const speakBoost = this.speaking ? 1.15 : 1;

    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 44);
    g.addColorStop(0, 'rgba(' + tr + ',' + tg + ',' + tb + ',' + ((0.1 + this.energy * 0.16) * glowMul * focusBoost) + ')');
    g.addColorStop(1, 'rgba(' + tr + ',' + tg + ',' + tb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fill();

    if (this.state === 'sleep') this._drawPillow(ctx, cx, cy + 24);
    if (this.state === 'code') this._drawLaptop(ctx, cx, cy + 16);
    if (this.state === 'read') this._drawBook(ctx, cx + 18, cy + 6);
    if (this.state === 'draw') this._drawTablet(ctx, cx + 16, cy + 8);
    if (this.state === 'check') this._drawClipboard(ctx, cx + 20, cy + 2);

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = 'rgba(' + tr + ',' + tg + ',' + tb + ',0.22)';
    ctx.beginPath();
    ctx.roundRect(-9, 16, 7, 9, 3);
    ctx.roundRect(2, 16, 7, 9, 3);
    ctx.fill();

    const torsoGrad = ctx.createLinearGradient(0, -6, 0, 20);
    torsoGrad.addColorStop(0, '#0d2138');
    torsoGrad.addColorStop(1, '#071018');
    ctx.fillStyle = torsoGrad;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-14, -4, 28, 22, 9);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = MINT;
    ctx.globalAlpha = 0.5 + this.energy * 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, 5);
    ctx.lineTo(0, 10);
    ctx.lineTo(5, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    this._drawArms(ctx);

    const headY = -20;
    ctx.fillStyle = BG;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    const blur = (this.reduced || this.comfort) ? 0 : (6 + this.energy * 5) * speakBoost;
    ctx.shadowColor = accent;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.arc(0, headY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, headY - 14);
    ctx.lineTo(0, headY - 21);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, headY - 23, 2.2, 0, Math.PI * 2);
    ctx.fill();

    this._drawFace(ctx, 0, headY);

    if (this.state === 'sleep') this._drawZzz(ctx, 12, headY - 16);

    if (this.state === 'wake' && !this.reduced && !this.comfort) {
      const spark = (Math.sin(this.t * 5) + 1) * 0.5;
      ctx.fillStyle = 'rgba(0, 255, 163, ' + (0.35 + spark * 0.45) + ')';
      ctx.beginPath();
      ctx.arc(12, headY - 9, 1.8, 0, Math.PI * 2);
      ctx.arc(-10, headY - 12, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    if (this.state === 'code' && !this.reduced && !this.comfort) {
      this._drawTypingDots(ctx, cx, cy + 20);
    }
  };

  AvatarPainter.prototype._drawFace = function (ctx, x, y) {
    const closed = this.state === 'sleep' || this._blink > 0;
    ctx.strokeStyle = ICE;
    ctx.fillStyle = ICE;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';

    if (closed) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 1);
      ctx.quadraticCurveTo(x - 3.5, y + 1.5, x - 1, y - 1);
      ctx.moveTo(x + 1, y - 1);
      ctx.quadraticCurveTo(x + 3.5, y + 1.5, x + 6, y - 1);
      ctx.stroke();
    } else {
      const look = this.state === 'check' ? Math.sin(this.t * 2) * 1.0 : 0;
      ctx.beginPath();
      ctx.arc(x - 4.5 + look, y - 1, 2, 0, Math.PI * 2);
      ctx.arc(x + 4.5 + look, y - 1, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = MINT;
      ctx.beginPath();
      ctx.arc(x - 4 + look, y - 1.4, 0.6, 0, Math.PI * 2);
      ctx.arc(x + 5 + look, y - 1.4, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(224, 247, 250, 0.7)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (this.state === 'sleep') {
      ctx.arc(x, y + 4.5, 2.5, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (this.state === 'wake') {
      ctx.arc(x, y + 3.5, 3, 0.1 * Math.PI, 0.9 * Math.PI);
    } else if (this.state === 'check') {
      const nod = this.reduced ? 0 : Math.sin(this.t * 3) * 0.6;
      ctx.arc(x, y + 4.5 + nod, 2.2, 0.2 * Math.PI, 0.8 * Math.PI);
    } else {
      ctx.moveTo(x - 2.5, y + 4.5);
      ctx.lineTo(x + 2.5, y + 4.5);
    }
    ctx.stroke();

    if (this.energy > 0.4 && this.state !== 'sleep') {
      ctx.fillStyle = 'rgba(255, 77, 141, 0.2)';
      ctx.beginPath();
      ctx.ellipse(x - 8, y + 2.5, 2.5, 1.3, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 8, y + 2.5, 2.5, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  AvatarPainter.prototype._drawArms = function (ctx) {
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    const phase = (this.reduced || this.comfort) ? 0 : this.t;

    if (this.state === 'code') {
      const tap = Math.sin(phase * 10) * 1.6;
      ctx.beginPath();
      ctx.moveTo(-12, 3);
      ctx.quadraticCurveTo(-19, 9 + tap, -7, 14);
      ctx.moveTo(12, 3);
      ctx.quadraticCurveTo(19, 9 - tap, 7, 14);
      ctx.stroke();
    } else if (this.state === 'draw') {
      const stroke = Math.sin(phase * 4) * 3.5;
      ctx.beginPath();
      ctx.moveTo(-10, 3);
      ctx.lineTo(-15, 12);
      ctx.moveTo(10, 3);
      ctx.quadraticCurveTo(17 + stroke, 7, 15, 14);
      ctx.stroke();
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(14, 12);
      ctx.lineTo(19 + stroke * 0.3, 17);
      ctx.stroke();
      ctx.fillStyle = ROSE;
      ctx.beginPath();
      ctx.arc(19 + stroke * 0.3, 17, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state === 'read') {
      ctx.beginPath();
      ctx.moveTo(-12, 3);
      ctx.lineTo(-7, 10);
      ctx.moveTo(12, 3);
      ctx.lineTo(8, 10);
      ctx.stroke();
    } else if (this.state === 'check') {
      const nod = Math.sin(phase * 3) * 1.6;
      ctx.beginPath();
      ctx.moveTo(-12, 3);
      ctx.lineTo(-15, 10 + nod);
      ctx.moveTo(12, 3);
      ctx.lineTo(17, 7);
      ctx.stroke();
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(19, 5 + nod * 0.3, 4.2, 0, Math.PI * 2);
      ctx.moveTo(22, 8);
      ctx.lineTo(25, 12);
      ctx.stroke();
    } else if (this.state === 'sleep') {
      ctx.beginPath();
      ctx.moveTo(-12, 5);
      ctx.quadraticCurveTo(-17, 10, -8, 14);
      ctx.moveTo(12, 5);
      ctx.quadraticCurveTo(17, 10, 8, 14);
      ctx.stroke();
    } else {
      const stretch = Math.sin(phase * 2) * 2.5;
      ctx.beginPath();
      ctx.moveTo(-12, 1);
      ctx.lineTo(-15, -7 - stretch);
      ctx.moveTo(12, 1);
      ctx.lineTo(15, -5 - stretch * 0.5);
      ctx.stroke();
    }
  };

  AvatarPainter.prototype._drawPillow = function (ctx, cx, cy) {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.1)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  AvatarPainter.prototype._drawLaptop = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#071018';
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-15, -12, 30, 15, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.fillRect(-12, -9, 24, 8);
    ctx.strokeStyle = MINT;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(3, -6);
    ctx.moveTo(-10, -3);
    ctx.lineTo(6, -3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a1428';
    ctx.strokeStyle = this.accent;
    ctx.beginPath();
    ctx.moveTo(-18, 3);
    ctx.lineTo(18, 3);
    ctx.lineTo(15, 7);
    ctx.lineTo(-15, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  AvatarPainter.prototype._drawBook = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#0d2138';
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-8, -10, 16, 20, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = this.accent;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  };

  AvatarPainter.prototype._drawTablet = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.2);
    ctx.fillStyle = '#071018';
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-10, -12, 20, 24, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.45)';
    ctx.beginPath();
    ctx.moveTo(-5, -3);
    ctx.quadraticCurveTo(0, 2, 5, -1);
    ctx.quadraticCurveTo(2, 5, -3, 7);
    ctx.stroke();
    ctx.restore();
  };

  AvatarPainter.prototype._drawClipboard = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0d2138';
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-8, -12, 16, 24, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = MINT;
    ctx.fillRect(-3, -14, 6, 3);
    ctx.strokeStyle = 'rgba(224, 247, 250, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, -5);
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.moveTo(-5, 5);
    ctx.lineTo(3, 5);
    ctx.stroke();
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-3, 9);
    ctx.lineTo(-1, 11);
    ctx.lineTo(4, 6);
    ctx.stroke();
    ctx.restore();
  };

  AvatarPainter.prototype._drawZzz = function (ctx, x, y) {
    const drift = (this.reduced || this.comfort) ? 0 : Math.sin(this.t * 1.5) * 1.5;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.fillText('z', x + drift, y);
    ctx.globalAlpha = 0.5;
    ctx.font = 'bold 6px ui-monospace, monospace';
    ctx.fillText('z', x + 5 + drift * 0.5, y - 7);
    ctx.globalAlpha = 1;
  };

  AvatarPainter.prototype._drawTypingDots = function (ctx, cx, cy) {
    const n = Math.floor(this.t * 4) % 3;
    ctx.fillStyle = MINT;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i === n ? 0.85 : 0.22;
      ctx.beginPath();
      ctx.arc(cx - 5 + i * 5, cy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // —— AvatarCast lounge ——
  function AvatarCast(root, opts) {
    this.root = root;
    this.reduced = !!(opts && opts.reduced);
    this.comfort = !!(opts && opts.comfort);
    this.onPin = (opts && opts.onPin) || null;
    this.painters = [];
    this.slots = [];
    this.pinnedId = null;
    this.speakingId = null;
    this._raf = null;
    this._prevTs = 0;
    this._pulse = 0.35;
    this._onResize = this.resize.bind(this);
  }

  AvatarCast.prototype.mount = function () {
    if (!this.root) return;
    this.root.classList.add('avatar-lounge');
    this.root.innerHTML =
      '<div class="lounge-rail" role="list"></div>' +
      '<div class="lounge-chrome"></div>';
    this.rail = this.root.querySelector('.lounge-rail');
    this.chrome = this.root.querySelector('.lounge-chrome');

    CAST_ROSTER.forEach((r) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'avatar-slot';
      slot.setAttribute('role', 'listitem');
      slot.dataset.id = r.id;
      slot.setAttribute('aria-label', r.role + ' — click to focus');
      slot.innerHTML =
        '<div class="avatar-frame">' +
          '<canvas width="88" height="88" aria-hidden="true"></canvas>' +
        '</div>' +
        '<span class="avatar-role">' + r.role + '</span>' +
        '<span class="avatar-label">' + LABELS.sleep + '</span>';
      this.rail.appendChild(slot);

      const canvas = slot.querySelector('canvas');
      const painter = new AvatarPainter(canvas, {
        reduced: this.reduced,
        comfort: this.comfort,
        accent: r.accent,
        tint: r.tint,
        role: r.role,
        id: r.id,
      });
      painter.resize();
      this.painters.push(painter);
      this.slots.push(slot);

      slot.addEventListener('click', () => this.pin(r.id));
    });

    window.addEventListener('resize', this._onResize);
    this._prevTs = performance.now();
    this.loop(this._prevTs);
  };

  AvatarCast.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  };

  AvatarCast.prototype.resize = function () {
    this.painters.forEach((p) => p.resize());
  };

  AvatarCast.prototype.setComfort = function (on) {
    this.comfort = !!on;
    this.painters.forEach((p) => p.setComfort(on));
    this.root.classList.toggle('comfort', this.comfort);
  };

  AvatarCast.prototype.setPulse = function (u) {
    this._pulse = clamp01(u);
    this.root.style.setProperty('--lounge-pulse', String(this._pulse));
  };

  AvatarCast.prototype.pin = function (id) {
    if (this.pinnedId === id) {
      this.pinnedId = null;
    } else {
      this.pinnedId = id;
    }
    this.painters.forEach((p) => {
      p.focused = p.id === this.pinnedId;
    });
    this.slots.forEach((s) => {
      s.classList.toggle('pinned', s.dataset.id === this.pinnedId);
    });
    const painter = this.painters.find((p) => p.id === this.pinnedId);
    const status = painter
      ? painter.role + ' · ' + painter.label + ' · energy ' + Math.round(painter.energy * 100) + '%'
      : '';
    if (this.onPin) this.onPin(this.pinnedId, status, painter || null);
  };

  AvatarCast.prototype.setSpeaking = function (id) {
    this.speakingId = id || null;
    this.painters.forEach((p) => {
      p.speaking = p.id === this.speakingId;
    });
    this.slots.forEach((s) => {
      s.classList.toggle('speaking', s.dataset.id === this.speakingId);
    });
  };

  AvatarCast.prototype.applyLive = function (live) {
    const list = deriveAvatarsFromLive(live);
    list.forEach((a) => {
      const painter = this.painters.find((p) => p.id === a.id);
      const slot = this.slots.find((s) => s.dataset.id === a.id);
      if (!painter) return;
      painter.setState(a.state, a.label);
      painter.setEnergy(a.energy);
      if (slot) {
        const lab = slot.querySelector('.avatar-label');
        if (lab) lab.textContent = a.label;
        slot.title = a.role + ': ' + a.label;
        slot.setAttribute('aria-label', a.role + ' — ' + a.label + '. Click to focus');
      }
    });
    if (live && live.pulse) {
      this.setPulse((clamp01(live.pulse.brain) + clamp01(live.pulse.heart)) / 2);
    }
  };

  AvatarCast.prototype.getCastIds = function () {
    return CAST_ROSTER.map((r) => r.id);
  };

  AvatarCast.prototype.getPinnedStatus = function () {
    const painter = this.painters.find((p) => p.id === this.pinnedId);
    if (!painter) return '';
    return painter.role + ' · ' + painter.label + ' · energy ' + Math.round(painter.energy * 100) + '%';
  };

  AvatarCast.prototype.loop = function (now) {
    const dt = Math.min(0.05, (now - this._prevTs) / 1000 || 0.016);
    this._prevTs = now;
    this.painters.forEach((p) => {
      p.tick(dt);
      p.draw();
    });
    this._raf = requestAnimationFrame(this.loop.bind(this));
  };

  // roundRect polyfill
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = typeof r === 'number' ? r : 4;
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  // Legacy single-avatar shim (keeps older callers from breaking)
  function Avatar(canvas, opts) {
    this.canvas = canvas;
    this._painter = new AvatarPainter(canvas, opts);
    this.labelEl = (opts && opts.labelEl) || null;
    this.state = 'sleep';
    this.energy = 0.2;
    this.label = LABELS.sleep;
    this._onResize = () => this._painter.resize();
  }
  Avatar.prototype.mount = function () {
    this._painter.resize();
    window.addEventListener('resize', this._onResize);
    this._prevTs = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this._prevTs) / 1000 || 0.016);
      this._prevTs = now;
      this._painter.tick(dt);
      this._painter.draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };
  Avatar.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  };
  Avatar.prototype.setState = function (s, l) {
    this.state = s;
    this.label = l || LABELS[s];
    this._painter.setState(s, l);
    if (this.labelEl) this.labelEl.textContent = this.label;
  };
  Avatar.prototype.setEnergy = function (e) {
    this.energy = e;
    this._painter.setEnergy(e);
  };
  Avatar.prototype.applyLive = function (live) {
    const a = deriveAvatarFromLive(live);
    this.setState(a.state, a.label);
    this.setEnergy(a.energy);
  };

  global.CryAIPulseAvatar = Avatar;
  global.CryAIPulseAvatarCast = AvatarCast;
  global.CryAIPulseAvatarDerive = deriveAvatarFromLive;
  global.CryAIPulseAvatarsDerive = deriveAvatarsFromLive;
  global.CryAIPulseAvatarLabels = LABELS;
  global.CryAIPulseCastRoster = CAST_ROSTER;
})(typeof window !== 'undefined' ? window : globalThis);
