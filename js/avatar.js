/**
 * CryAIPulse — live activity avatar (chibi / geometric agent)
 * Canvas animation driven by live.json avatar.state + energy.
 * States: sleep | wake | read | code | draw | check
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

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  /** Derive avatar fields when live.json omits avatar. */
  function deriveAvatarFromLive(live) {
    if (!live) {
      return { state: 'sleep', energy: 0.1, label: LABELS.sleep };
    }
    if (live.avatar && live.avatar.state && VALID.indexOf(live.avatar.state) >= 0) {
      const st = live.avatar.state;
      return {
        state: st,
        energy: clamp01(live.avatar.energy != null ? live.avatar.energy : 0.5),
        label: live.avatar.label || LABELS[st] || st,
      };
    }

    const pulse = live.pulse || {};
    const brain = clamp01(pulse.brain);
    const heart = clamp01(pulse.heart);
    const energy = clamp01((brain + heart) / 2);
    const nodes = live.nodes || {};
    const act = (k) => {
      const e = nodes[k];
      if (e == null) return 0;
      return typeof e === 'number' ? clamp01(e) : clamp01(e.activity);
    };
    const sources = (live.sources || []).map((s) => String(s).toLowerCase());
    const has = (frag) => sources.some((s) => s.indexOf(frag) >= 0);

    const s3 = act('S3');
    const s4 = act('S4');
    const s2 = act('S2');
    const s5 = act('S5');
    const s6 = act('S6');
    const build = act('Build');

    let state = 'sleep';
    if (energy < 0.18) {
      state = 'sleep';
    } else if (energy < 0.28) {
      state = 'wake';
    } else if (has('cod') || s3 >= 0.62 || (s3 >= energy * 0.9 && s3 >= 0.5)) {
      state = energy >= 0.45 ? 'code' : 'wake';
    } else if (has('research') || has('read') || (s4 >= 0.58 && s4 >= s3 - 0.05)) {
      state = 'read';
    } else if (has('design') || has('draw') || has('creat') || (s2 >= 0.58 && s2 > s4) || (s5 >= 0.6 && s5 > s3)) {
      state = 'draw';
    } else if (has('review') || has('check') || has('critic') || (s6 >= 0.58 && s6 >= s3 - 0.02)) {
      state = 'check';
    } else if (build >= 0.65 || energy >= 0.55) {
      state = 'code';
    } else if (energy >= 0.35) {
      state = 'read';
    } else {
      state = 'wake';
    }

    return { state: state, energy: energy, label: LABELS[state] };
  }

  function Avatar(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.reduced = !!(opts && opts.reduced);
    this.labelEl = (opts && opts.labelEl) || null;
    this.state = 'sleep';
    this.energy = 0.2;
    this.label = LABELS.sleep;
    this.t = 0;
    this._raf = null;
    this._dpr = 1;
    this._size = 112;
    this._blink = 0;
    this._nextBlink = 2 + Math.random() * 3;
    this._onResize = this.resize.bind(this);
    this._prevTs = 0;
  }

  Avatar.prototype.mount = function () {
    this.resize();
    window.addEventListener('resize', this._onResize);
    this._syncLabel();
    this._prevTs = performance.now();
    this.loop(this._prevTs);
  };

  Avatar.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  };

  Avatar.prototype.resize = function () {
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

  Avatar.prototype.setState = function (state, label) {
    if (VALID.indexOf(state) < 0) return;
    this.state = state;
    if (label) this.label = label;
    else this.label = LABELS[state] || state;
    this._syncLabel();
  };

  Avatar.prototype.setEnergy = function (energy) {
    this.energy = clamp01(energy);
  };

  /** Apply live snapshot (uses avatar field or derives). */
  Avatar.prototype.applyLive = function (live) {
    const a = deriveAvatarFromLive(live);
    this.setState(a.state, a.label);
    this.setEnergy(a.energy);
  };

  Avatar.prototype._syncLabel = function () {
    if (this.labelEl) this.labelEl.textContent = this.label;
    if (this.canvas) {
      this.canvas.setAttribute('aria-label', 'Activity avatar: ' + this.label);
      this.canvas.title = this.label;
    }
  };

  Avatar.prototype.tick = function (dt) {
    this.t += dt;
    if (!this.reduced) {
      this._nextBlink -= dt;
      if (this._nextBlink <= 0) {
        this._blink = 0.12;
        this._nextBlink = 2.2 + Math.random() * 3.5;
      }
      if (this._blink > 0) this._blink = Math.max(0, this._blink - dt);
    }
  };

  Avatar.prototype.loop = function (now) {
    const dt = Math.min(0.05, (now - this._prevTs) / 1000 || 0.016);
    this._prevTs = now;
    this.tick(dt);
    this.draw();
    this._raf = requestAnimationFrame(this.loop.bind(this));
  };

  Avatar.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const bob = this.reduced ? 0 : Math.sin(this.t * (1.2 + this.energy)) * (1.2 + this.energy * 1.5);
    const cy = h * 0.52 + bob;
    const scale = 1;

    // Soft glow disc
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 52);
    g.addColorStop(0, 'rgba(0, 229, 255, ' + (0.12 + this.energy * 0.18) + ')');
    g.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fill();

    // Props behind body for some states
    if (this.state === 'sleep') this._drawPillow(ctx, cx, cy + 28);
    if (this.state === 'code') this._drawLaptop(ctx, cx, cy + 18, true);
    if (this.state === 'read') this._drawBook(ctx, cx + 22, cy + 8);
    if (this.state === 'draw') this._drawTablet(ctx, cx + 20, cy + 10);
    if (this.state === 'check') this._drawClipboard(ctx, cx + 24, cy + 4);

    // Body (rounded capsule)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Legs / base
    ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.beginPath();
    ctx.roundRect(-10, 18, 8, 10, 3);
    ctx.roundRect(2, 18, 8, 10, 3);
    ctx.fill();

    // Torso
    const torsoGrad = ctx.createLinearGradient(0, -6, 0, 22);
    torsoGrad.addColorStop(0, '#0d2138');
    torsoGrad.addColorStop(1, '#071018');
    ctx.fillStyle = torsoGrad;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-16, -4, 32, 26, 10);
    ctx.fill();
    ctx.stroke();

    // Chest accent
    ctx.strokeStyle = MINT;
    ctx.globalAlpha = 0.55 + this.energy * 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(0, 12);
    ctx.lineTo(6, 6);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Arms + tool-use
    this._drawArms(ctx);

    // Head
    const headY = -22;
    ctx.fillStyle = BG;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = this.reduced ? 0 : 8 + this.energy * 6;
    ctx.beginPath();
    ctx.arc(0, headY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Antenna / cryo crest
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, headY - 16);
    ctx.lineTo(0, headY - 24);
    ctx.stroke();
    ctx.fillStyle = MINT;
    ctx.beginPath();
    ctx.arc(0, headY - 26, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Face
    this._drawFace(ctx, 0, headY);

    // Zzz for sleep
    if (this.state === 'sleep') this._drawZzz(ctx, 14, headY - 18);

    // Wake sparkles
    if (this.state === 'wake' && !this.reduced) {
      const spark = (Math.sin(this.t * 5) + 1) * 0.5;
      ctx.fillStyle = 'rgba(0, 255, 163, ' + (0.4 + spark * 0.5) + ')';
      ctx.beginPath();
      ctx.arc(14, headY - 10, 2, 0, Math.PI * 2);
      ctx.arc(-12, headY - 14, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Foreground props overlays (typing hands etc. already in arms)
    if (this.state === 'code' && !this.reduced) this._drawTypingDots(ctx, cx, cy + 22);
  };

  Avatar.prototype._drawFace = function (ctx, x, y) {
    const closed = this.state === 'sleep' || this._blink > 0;
    ctx.strokeStyle = ICE;
    ctx.fillStyle = ICE;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';

    if (closed) {
      // Closed eyes
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 1);
      ctx.quadraticCurveTo(x - 4, y + 2, x - 1, y - 1);
      ctx.moveTo(x + 1, y - 1);
      ctx.quadraticCurveTo(x + 4, y + 2, x + 7, y - 1);
      ctx.stroke();
    } else {
      // Eyes
      const look = this.state === 'check' ? Math.sin(this.t * 2) * 1.2 : 0;
      ctx.beginPath();
      ctx.arc(x - 5 + look, y - 1, 2.2, 0, Math.PI * 2);
      ctx.arc(x + 5 + look, y - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Pupils mint highlight
      ctx.fillStyle = MINT;
      ctx.beginPath();
      ctx.arc(x - 4.5 + look, y - 1.5, 0.7, 0, Math.PI * 2);
      ctx.arc(x + 5.5 + look, y - 1.5, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = 'rgba(224, 247, 250, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (this.state === 'sleep') {
      ctx.arc(x, y + 5, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (this.state === 'wake') {
      ctx.arc(x, y + 4, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
    } else if (this.state === 'check') {
      // Nodding mouth — slight smile
      const nod = this.reduced ? 0 : Math.sin(this.t * 3) * 0.8;
      ctx.arc(x, y + 5 + nod, 2.5, 0.2 * Math.PI, 0.8 * Math.PI);
    } else {
      ctx.moveTo(x - 3, y + 5);
      ctx.lineTo(x + 3, y + 5);
    }
    ctx.stroke();

    // Cheek blush when energetic
    if (this.energy > 0.4 && this.state !== 'sleep') {
      ctx.fillStyle = 'rgba(255, 77, 141, 0.22)';
      ctx.beginPath();
      ctx.ellipse(x - 9, y + 3, 3, 1.6, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 9, y + 3, 3, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  Avatar.prototype._drawArms = function (ctx) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const phase = this.reduced ? 0 : this.t;

    if (this.state === 'code') {
      const tap = Math.sin(phase * 10) * 2;
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.quadraticCurveTo(-22, 10 + tap, -8, 16);
      ctx.moveTo(14, 4);
      ctx.quadraticCurveTo(22, 10 - tap, 8, 16);
      ctx.stroke();
    } else if (this.state === 'draw') {
      const stroke = Math.sin(phase * 4) * 4;
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(-18, 14);
      ctx.moveTo(12, 4);
      ctx.quadraticCurveTo(20 + stroke, 8, 18, 16);
      ctx.stroke();
      // Pencil
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(16, 14);
      ctx.lineTo(22 + stroke * 0.3, 20);
      ctx.stroke();
      ctx.fillStyle = ROSE;
      ctx.beginPath();
      ctx.arc(22 + stroke * 0.3, 20, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state === 'read') {
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.lineTo(-8, 12);
      ctx.moveTo(14, 4);
      ctx.lineTo(10, 12);
      ctx.stroke();
    } else if (this.state === 'check') {
      const nod = Math.sin(phase * 3) * 2;
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.lineTo(-18, 12 + nod);
      ctx.moveTo(14, 4);
      ctx.lineTo(20, 8);
      ctx.stroke();
      // Magnifier
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(22, 6 + nod * 0.3, 5, 0, Math.PI * 2);
      ctx.moveTo(25.5, 9.5);
      ctx.lineTo(29, 14);
      ctx.stroke();
    } else if (this.state === 'sleep') {
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.quadraticCurveTo(-20, 12, -10, 16);
      ctx.moveTo(14, 6);
      ctx.quadraticCurveTo(20, 12, 10, 16);
      ctx.stroke();
    } else {
      // wake — stretch
      const stretch = Math.sin(phase * 2) * 3;
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(-18, -8 - stretch);
      ctx.moveTo(14, 2);
      ctx.lineTo(18, -6 - stretch * 0.5);
      ctx.stroke();
    }
  };

  Avatar.prototype._drawPillow = function (ctx, cx, cy) {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  Avatar.prototype._drawLaptop = function (ctx, cx, cy, behind) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#071018';
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.2;
    // Screen
    ctx.beginPath();
    ctx.roundRect(-18, -14, 36, 18, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.fillRect(-14, -10, 28, 10);
    // Code lines
    ctx.strokeStyle = MINT;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, -7);
    ctx.lineTo(4, -7);
    ctx.moveTo(-12, -4);
    ctx.lineTo(8, -4);
    ctx.moveTo(-12, -1);
    ctx.lineTo(0, -1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Base
    ctx.fillStyle = '#0a1428';
    ctx.strokeStyle = CYAN;
    ctx.beginPath();
    ctx.moveTo(-22, 4);
    ctx.lineTo(22, 4);
    ctx.lineTo(18, 8);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  Avatar.prototype._drawBook = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#0d2138';
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-10, -12, 20, 24, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = CYAN;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();
  };

  Avatar.prototype._drawTablet = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.2);
    ctx.fillStyle = '#071018';
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-12, -14, 24, 28, 4);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.5)';
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(0, 2, 6, -2);
    ctx.quadraticCurveTo(2, 6, -4, 8);
    ctx.stroke();
    ctx.restore();
  };

  Avatar.prototype._drawClipboard = function (ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0d2138';
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-10, -14, 20, 28, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = MINT;
    ctx.fillRect(-4, -16, 8, 4);
    ctx.strokeStyle = 'rgba(224, 247, 250, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(6, -6);
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(-6, 6);
    ctx.lineTo(4, 6);
    ctx.stroke();
    // Checkmark
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(-1, 13);
    ctx.lineTo(5, 7);
    ctx.stroke();
    ctx.restore();
  };

  Avatar.prototype._drawZzz = function (ctx, x, y) {
    const drift = this.reduced ? 0 : Math.sin(this.t * 1.5) * 2;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.fillText('z', x + drift, y);
    ctx.globalAlpha = 0.55;
    ctx.font = 'bold 7px ui-monospace, monospace';
    ctx.fillText('z', x + 6 + drift * 0.5, y - 8);
    ctx.globalAlpha = 0.35;
    ctx.font = 'bold 5px ui-monospace, monospace';
    ctx.fillText('z', x + 11, y - 14);
    ctx.globalAlpha = 1;
  };

  Avatar.prototype._drawTypingDots = function (ctx, cx, cy) {
    const n = Math.floor(this.t * 4) % 3;
    ctx.fillStyle = MINT;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i === n ? 0.9 : 0.25;
      ctx.beginPath();
      ctx.arc(cx - 6 + i * 6, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // Polyfill roundRect for older browsers
  if (!CanvasRenderingContext2D.prototype.roundRect) {
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

  global.CryAIPulseAvatar = Avatar;
  global.CryAIPulseAvatarDerive = deriveAvatarFromLive;
  global.CryAIPulseAvatarLabels = LABELS;
})(typeof window !== 'undefined' ? window : globalThis);
