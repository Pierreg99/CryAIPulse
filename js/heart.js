/**
 * CryAIPulse — ECG / heart pulse monitor
 * QRS complex waveform + rose/magenta aesthetic.
 */
(function (global) {
  'use strict';

  const ROSE = '#ff4d8d';
  const MAGENTA = '#e040a0';
  const ICE = '#e0f7fa';

  function HeartPulse(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.reduced = !!(opts && opts.reduced);
    this.bpm = 72;
    this.intensity = 0.35; // 0..1 from token pulse-state (heart)
    this.ampScale = 1;
    this.t = 0;
    this.phase = 0;
    this.trace = [];
    this.maxSamples = 400;
    this._raf = null;
    this._dpr = 1;
    this._beatFlash = 0;
    this._onResize = this.resize.bind(this);
  }

  HeartPulse.prototype.mount = function () {
    this.resize();
    window.addEventListener('resize', this._onResize);
    this.loop(performance.now());
  };

  HeartPulse.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  };

  HeartPulse.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this._dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this._dpr));
    this.w = rect.width;
    this.h = rect.height;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.maxSamples = Math.max(200, Math.floor(this.w * 1.2));
  };

  HeartPulse.prototype.getBpm = function () {
    return this.bpm;
  };

  /** Token-driven immersion — stronger ECG amplitude as tokens rise. */
  HeartPulse.prototype.setIntensity = function (u, meshBpm) {
    this.intensity = Math.max(0, Math.min(1, Number(u) || 0));
    // Amplitude scale: 0.85 (calm) → 1.55 (high token load); muted if reduced-motion
    this.ampScale = this.reduced
      ? 1
      : 0.85 + this.intensity * 0.7;
    if (meshBpm != null && Number.isFinite(Number(meshBpm))) {
      this.bpm = Number(meshBpm);
    }
  };

  HeartPulse.prototype.tickBpm = function () {
    const base = this.bpm;
    const band = 1.5 + this.intensity * 3;
    this.bpm += (Math.sin(this.t * 0.25) * 0.04) + (Math.random() - 0.5) * 0.08;
    const lo = Math.max(55, base - band);
    const hi = Math.min(110, base + band);
    this.bpm = Math.max(lo, Math.min(hi, this.bpm));
  };

  /** Classic ECG: P → QRS → T, normalized -1..1 around baseline */
  HeartPulse.prototype.ecgSample = function (beatPhase) {
    // beatPhase 0..1 within one cardiac cycle
    const p = beatPhase;
    let v = 0;
    // P wave
    if (p > 0.08 && p < 0.18) {
      const t = (p - 0.08) / 0.1;
      v += Math.sin(t * Math.PI) * 0.18;
    }
    // Q
    if (p > 0.28 && p < 0.32) {
      const t = (p - 0.28) / 0.04;
      v -= Math.sin(t * Math.PI) * 0.22;
    }
    // R
    if (p > 0.32 && p < 0.38) {
      const t = (p - 0.32) / 0.06;
      v += Math.sin(t * Math.PI) * 1.0;
    }
    // S
    if (p > 0.38 && p < 0.44) {
      const t = (p - 0.38) / 0.06;
      v -= Math.sin(t * Math.PI) * 0.35;
    }
    // T
    if (p > 0.52 && p < 0.72) {
      const t = (p - 0.52) / 0.2;
      v += Math.sin(t * Math.PI) * 0.28;
    }
    // micro noise
    if (!this.reduced) v += (Math.random() - 0.5) * 0.015;
    return v;
  };

  HeartPulse.prototype.loop = function (now) {
    const dt = Math.min(32, now - (this._last || now)) / 1000;
    this._last = now;
    this.t += dt;
    this.tickBpm();

    const cycle = 60 / this.bpm;
    const prevPhase = this.phase;
    this.phase = (this.phase + dt / cycle) % 1;

    // Beat flash on R peak crossing
    if (prevPhase < 0.35 && this.phase >= 0.35) {
      this._beatFlash = this.reduced ? 0.35 : 0.7 + this.intensity * 0.5;
    }
    this._beatFlash = Math.max(0, this._beatFlash - dt * (2.2 - this.intensity * 0.6));

    const sample = this.ecgSample(this.phase);
    this.trace.push(sample);
    while (this.trace.length > this.maxSamples) this.trace.shift();

    this.draw();
    this._raf = requestAnimationFrame(this.loop.bind(this));
  };

  HeartPulse.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255, 77, 141, 0.08)';
    ctx.lineWidth = 1;
    const step = 20;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Heart icon glow (left)
    const hx = 48;
    const hy = h * 0.5;
    const pulseScale = 1 + this._beatFlash * 0.25;
    this.drawHeart(ctx, hx, hy, 16 * pulseScale, this._beatFlash);

    // Baseline
    const mid = h * 0.52;
    const amp = h * 0.28 * (this.ampScale || 1);
    ctx.strokeStyle = 'rgba(255, 77, 141, 0.2)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(90, mid);
    ctx.lineTo(w - 16, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    // ECG trace
    if (this.trace.length > 1) {
      const startX = 90;
      const usable = w - startX - 16;
      ctx.beginPath();
      for (let i = 0; i < this.trace.length; i++) {
        const x = startX + (i / (this.maxSamples - 1)) * usable;
        const y = mid - this.trace[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ROSE;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = ROSE;
      ctx.shadowBlur = 8 + this._beatFlash * 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Glow fill under recent segment
      const last = this.trace[this.trace.length - 1];
      const lx = startX + ((this.trace.length - 1) / (this.maxSamples - 1)) * usable;
      const ly = mid - last * amp;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5 + this._beatFlash * 2, 0, Math.PI * 2);
      ctx.fillStyle = ICE;
      ctx.shadowColor = MAGENTA;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // BPM badge
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255, 77, 141, 0.85)';
    ctx.textAlign = 'right';
    ctx.fillText('LEAD II  ·  QRS LIVE', w - 18, 22);
  };

  HeartPulse.prototype.drawHeart = function (ctx, x, y, size, flash) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 16, size / 16);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-8, -4, -16, 2, 0, 14);
    ctx.bezierCurveTo(16, 2, 8, -4, 0, 4);
    ctx.closePath();
    const alpha = 0.55 + flash * 0.4;
    ctx.fillStyle = `rgba(255, 77, 141, ${alpha})`;
    ctx.shadowColor = ROSE;
    ctx.shadowBlur = 12 + flash * 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  global.CryAIPulseHeart = HeartPulse;
})(typeof window !== 'undefined' ? window : globalThis);
