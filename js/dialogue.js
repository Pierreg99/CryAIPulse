/**
 * CryAIPulse — rotating discussion bubbles between avatar cast members.
 * Loads data/dialogue.json + optional live.dialogue; EN, tight, Pierrefektion.
 */
(function (global) {
  'use strict';

  const DEFAULT_INTERVAL = 4.2; // seconds between speaker handoffs
  const REDUCED_INTERVAL = 7.5;
  const FADE_MS = 420;
  const REDUCED_FADE_MS = 120;

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  function DialogueDirector(opts) {
    this.root = (opts && opts.root) || null;
    this.reduced = !!(opts && opts.reduced);
    this.comfort = !!(opts && opts.comfort);
    this.interval = this.reduced ? REDUCED_INTERVAL : DEFAULT_INTERVAL;
    this.lines = [];
    this.liveLines = [];
    this.idx = 0;
    this.pinnedId = null;
    this._timer = null;
    this._visible = false;
    this._bubble = null;
    this._status = null;
    this._onFocus = (opts && opts.onFocus) || null;
    this._castIds = (opts && opts.castIds) || [];
  }

  DialogueDirector.prototype.mount = function () {
    if (!this.root) return;
    this._ensureChrome();
    this._schedule();
  };

  DialogueDirector.prototype.destroy = function () {
    clearTimeout(this._timer);
    this._timer = null;
  };

  DialogueDirector.prototype.setComfort = function (on) {
    this.comfort = !!on;
    this.interval = this.reduced || this.comfort ? REDUCED_INTERVAL : DEFAULT_INTERVAL;
  };

  DialogueDirector.prototype.setPinned = function (id) {
    this.pinnedId = id || null;
    this._syncStatus();
  };

  DialogueDirector.prototype.setCastIds = function (ids) {
    this._castIds = Array.isArray(ids) ? ids.slice() : [];
  };

  DialogueDirector.prototype.setStatusText = function (text) {
    if (this._status) this._status.textContent = text || '';
  };

  /** Replace seed lines from dialogue.json */
  DialogueDirector.prototype.setSeedLines = function (lines) {
    this.lines = Array.isArray(lines) ? lines.filter((l) => l && l.text) : [];
    this.idx = 0;
  };

  /** Optional live.dialogue override (rotates preferentially when present) */
  DialogueDirector.prototype.applyLive = function (live) {
    if (live && Array.isArray(live.dialogue) && live.dialogue.length) {
      this.liveLines = live.dialogue.filter((l) => l && l.text);
    } else {
      this.liveLines = [];
    }
  };

  DialogueDirector.prototype._pool = function () {
    return this.liveLines.length ? this.liveLines : this.lines;
  };

  DialogueDirector.prototype._ensureChrome = function () {
    let bubble = this.root.querySelector('.dialogue-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'dialogue-bubble';
      bubble.setAttribute('role', 'status');
      bubble.setAttribute('aria-live', 'polite');
      bubble.innerHTML =
        '<span class="dialogue-who"></span>' +
        '<span class="dialogue-text"></span>';
      this.root.appendChild(bubble);
    }
    this._bubble = bubble;
    this._who = bubble.querySelector('.dialogue-who');
    this._text = bubble.querySelector('.dialogue-text');

    let status = this.root.querySelector('.lounge-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'lounge-status';
      status.setAttribute('aria-live', 'polite');
      this.root.appendChild(status);
    }
    this._status = status;
  };

  DialogueDirector.prototype._schedule = function () {
    clearTimeout(this._timer);
    const ms = Math.round(this.interval * 1000);
    this._timer = setTimeout(() => {
      this._advance();
      this._schedule();
    }, ms);
  };

  DialogueDirector.prototype._advance = function () {
    const pool = this._pool();
    if (!pool.length || !this._bubble) return;

    // Prefer lines involving pinned avatar when focused
    let line = null;
    if (this.pinnedId) {
      const matches = pool.filter((l) =>
        l.from === this.pinnedId || l.to === this.pinnedId
      );
      if (matches.length) {
        line = matches[this.idx % matches.length];
      }
    }
    if (!line) {
      line = pool[this.idx % pool.length];
    }
    this.idx += 1;
    this._show(line);
  };

  DialogueDirector.prototype._show = function (line) {
    if (!this._bubble || !line) return;
    const fade = this.reduced || this.comfort ? REDUCED_FADE_MS : FADE_MS;
    const from = line.from || 'cryoomega';
    const to = line.to || '';
    const who = to ? from + ' → ' + to : from;

    this._bubble.classList.remove('visible');
    if (this.reduced) {
      this._who.textContent = who;
      this._text.textContent = line.text;
      this._bubble.dataset.from = from;
      this._bubble.classList.add('visible');
      if (this._onFocus) this._onFocus(from, line);
      return;
    }

    window.setTimeout(() => {
      this._who.textContent = who;
      this._text.textContent = line.text;
      this._bubble.dataset.from = from;
      this._bubble.classList.add('visible');
      if (this._onFocus) this._onFocus(from, line);
    }, Math.min(fade, 180));
  };

  DialogueDirector.prototype._syncStatus = function () {
    // Status line is owned by AvatarCast via setStatusText
  };

  DialogueDirector.prototype.nudge = function () {
    this._advance();
    this._schedule();
  };

  global.CryAIPulseDialogue = DialogueDirector;
})(typeof window !== 'undefined' ? window : globalThis);
