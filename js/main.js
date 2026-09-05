/**
 * CryAIPulse — orchestration
 * Polls data/live.json and drives brain / heart / mesh / counters / legend /
 * history sparkline from live snapshot. Smooth lerp; reduced-motion aware.
 */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const POLL_MS = prefersReduced ? 12000 : 6000; // 5–8s nominal; softer when reduced
  const LERP = prefersReduced ? 0.2 : 0.1;

  function $(sel) { return document.querySelector(sel); }

  function formatNum(n, digits) {
    return Number(n).toFixed(digits);
  }

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  function liveUrl() {
    return 'data/live.json?t=' + Date.now();
  }

  /** Map pulse-state.json → live-like shape for one-shot fallback. */
  function fromPulseState(state, history) {
    if (!state) return null;
    const brain = clamp01(state.brain);
    const heart = clamp01(state.heart);
    const u = (brain + heart) / 2;
    const nodes = {};
    ['L0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'Build', 'Sense'].forEach((k, i) => {
      nodes[k] = { activity: clamp01(u * (0.75 + (i % 5) * 0.05)) };
    });
    const hist = Array.isArray(history) ? history : [];
    const last = hist.length ? hist[hist.length - 1] : null;
    return {
      updatedAt: state.updatedAt,
      tokens: {
        in: last ? last.tokensIn : 0,
        out: last ? last.tokensOut : 0,
        total: state.lastTotalTokens != null ? state.lastTotalTokens : (last ? last.totalTokens : 0),
        sessionTotal: hist.reduce((s, e) => s + (e.totalTokens || 0), 0),
      },
      pulse: {
        brain: brain,
        heart: heart,
        neuralHz: state.neuralHz != null ? state.neuralHz : 6 + u * 14,
        meshBpm: state.meshBpm != null ? state.meshBpm : 55 + u * 50,
      },
      nodes: nodes,
      historyTail: hist.slice(-30).map((e) => ({
        ts: e.ts,
        totalTokens: e.totalTokens,
        neuralHz: e.neuralHz,
        meshBpm: e.meshBpm,
      })),
      sources: [...new Set(hist.map((e) => e.source).filter(Boolean))],
      status: 'fallback',
    };
  }

  function renderLegend(nodes) {
    const el = $('#legend');
    if (!el) return;
    el.innerHTML = nodes.map((n) => {
      const hue = n.hue || 'cyan';
      const dotClass = n.ring === 'core' ? 'core' : hue;
      const roomClass = n.ring === 'rooms' ? ' room' : '';
      const liveKey = n.ring === 'rooms' ? n.role : n.id;
      return (
        '<div class="legend-item' + roomClass + '" data-id="' + n.id + '" data-live-key="' + liveKey + '">' +
          '<span class="legend-dot ' + dotClass + '"></span>' +
          '<span><span class="lid">' + n.id + '</span> ' + n.role + '</span>' +
          '<span class="legend-act" aria-hidden="true"></span>' +
        '</div>'
      );
    }).join('');
  }

  function updateLegendActivity(nodeMap) {
    if (!nodeMap) return;
    document.querySelectorAll('.legend-item').forEach((el) => {
      const key = el.getAttribute('data-live-key');
      const id = el.getAttribute('data-id');
      let entry = nodeMap[key] || nodeMap[id];
      if (!entry && id === 'R-BUILD') entry = nodeMap.Build;
      if (!entry && id === 'R-SENSE') entry = nodeMap.Sense;
      const act = entry
        ? (typeof entry === 'number' ? entry : entry.activity)
        : 0;
      const a = clamp01(act);
      el.style.setProperty('--act', String(a));
      el.classList.toggle('active', a >= 0.45);
      el.classList.toggle('hot', a >= 0.72);
      const actEl = el.querySelector('.legend-act');
      if (actEl) actEl.textContent = Math.round(a * 100) + '%';
    });
  }

  function drawSparkline(canvas, tail) {
    if (!canvas || !tail || !tail.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 220;
    const cssH = canvas.clientHeight || 40;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const vals = tail.map((e) => Number(e.totalTokens) || 0);
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = Math.max(1, max - min);
    const pad = 3;

    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = pad + (i / Math.max(1, vals.length - 1)) * (cssW - pad * 2);
      const y = cssH - pad - ((v - min) / span) * (cssH - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = prefersReduced ? 0 : 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // BPM secondary path (scaled into same band, dashed)
    const bpms = tail.map((e) => Number(e.meshBpm) || 55);
    const bMin = Math.min.apply(null, bpms);
    const bMax = Math.max.apply(null, bpms);
    const bSpan = Math.max(1, bMax - bMin);
    ctx.beginPath();
    bpms.forEach((v, i) => {
      const x = pad + (i / Math.max(1, bpms.length - 1)) * (cssW - pad * 2);
      const y = cssH - pad - ((v - bMin) / bSpan) * (cssH - pad * 2) * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(255, 77, 141, 0.75)';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function setStatusChrome(status, ok) {
    const badge = $('#live-status');
    if (!badge) return;
    badge.textContent = ok ? (status || 'live') : 'retry';
    badge.dataset.state = ok ? (status || 'live') : 'error';
    badge.title = ok
      ? 'Polling data/live.json'
      : 'live.json unavailable — retrying';
  }

  function boot() {
    const brainCanvas = $('#brain-canvas');
    const heartCanvas = $('#heart-canvas');
    const meshCanvas = $('#mesh-canvas');
    const tip = $('#mesh-tooltip');
    const hzEl = $('#neural-hz');
    const bpmEl = $('#cardiac-bpm');
    const spark = $('#history-spark');

    const brain = new CryAIPulseBrain(brainCanvas, { reduced: prefersReduced });
    const heart = new CryAIPulseHeart(heartCanvas, { reduced: prefersReduced });
    brain.mount();
    heart.mount();

    const targets = {
      brain: 0.35,
      heart: 0.35,
      mesh: 0.35,
      neuralHz: 12,
      meshBpm: 72,
    };
    const current = {
      brain: 0.35,
      heart: 0.35,
      mesh: 0.35,
    };

    let mesh = null;
    let lastLive = null;
    let usedPulseFallback = false;
    let pollTimer = null;
    let historyCache = [];

    function applyTargetsFromLive(live) {
      if (!live || !live.pulse) return;
      let brainU = clamp01(live.pulse.brain);
      let heartU = clamp01(live.pulse.heart);
      if (prefersReduced) {
        brainU = Math.min(0.25, brainU);
        heartU = Math.min(0.25, heartU);
      }
      targets.brain = brainU;
      targets.heart = heartU;
      targets.mesh = prefersReduced
        ? Math.min(0.25, (brainU + heartU) / 2)
        : (brainU + heartU) / 2;
      if (live.pulse.neuralHz != null) targets.neuralHz = Number(live.pulse.neuralHz);
      if (live.pulse.meshBpm != null) targets.meshBpm = Number(live.pulse.meshBpm);

      if (mesh && live.nodes) mesh.setNodeActivity(live.nodes);
      updateLegendActivity(live.nodes);

      const tokEl = $('#token-total');
      if (tokEl && live.tokens) {
        const show = live.tokens.total != null ? live.tokens.total : live.tokens.sessionTotal;
        tokEl.textContent = String(show);
      }
      const inEl = $('#token-in');
      const outEl = $('#token-out');
      if (inEl && live.tokens) inEl.textContent = String(live.tokens.in ?? '—');
      if (outEl && live.tokens) outEl.textContent = String(live.tokens.out ?? '—');

      const srcEl = $('#pulse-updated');
      if (srcEl && live.updatedAt) {
        try {
          srcEl.textContent = new Date(live.updatedAt).toLocaleString();
        } catch (_) {
          srcEl.textContent = live.updatedAt;
        }
      }
      const histEl = $('#history-count');
      if (histEl) {
        const n = live.historyTail ? live.historyTail.length : 0;
        histEl.textContent = String(n);
      }
      const sourcesEl = $('#live-sources');
      if (sourcesEl && Array.isArray(live.sources)) {
        sourcesEl.textContent = live.sources.join(' · ') || '—';
      }

      drawSparkline(spark, live.historyTail || []);
      setStatusChrome(live.status || 'live', true);
      lastLive = live;
    }

    function tickLerp() {
      current.brain = lerp(current.brain, targets.brain, LERP);
      current.heart = lerp(current.heart, targets.heart, LERP);
      current.mesh = lerp(current.mesh, targets.mesh, LERP);

      if (brain && brain.setIntensity) brain.setIntensity(current.brain, targets.neuralHz);
      if (heart && heart.setIntensity) heart.setIntensity(current.heart, targets.meshBpm);
      if (mesh && mesh.setIntensity) mesh.setIntensity(current.mesh);

      if (hzEl) hzEl.textContent = formatNum(brain.getHz(), 1);
      if (bpmEl) bpmEl.textContent = formatNum(heart.getBpm(), 0);
      requestAnimationFrame(tickLerp);
    }
    tickLerp();

    async function pollLive() {
      if (document.hidden) return;
      try {
        const live = await loadJson(liveUrl());
        usedPulseFallback = false;
        applyTargetsFromLive(live);
      } catch (err) {
        console.warn('live.json poll failed', err);
        setStatusChrome('retry', false);
        if (!usedPulseFallback) {
          usedPulseFallback = true;
          try {
            const state = await loadJson('data/pulse-state.json?t=' + Date.now());
            const fallback = fromPulseState(state, historyCache);
            if (fallback) applyTargetsFromLive(fallback);
          } catch (e2) {
            console.warn('pulse-state fallback failed', e2);
          }
        }
      }
    }

    function schedulePoll() {
      clearInterval(pollTimer);
      if (document.hidden) return;
      pollTimer = setInterval(pollLive, POLL_MS);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollTimer);
        pollTimer = null;
      } else {
        pollLive();
        schedulePoll();
      }
    });

    Promise.all([
      loadJson('data/mesh.json'),
      loadJson(liveUrl()).catch(() => null),
      loadJson('data/pulse-state.json').catch(() => null),
      loadJson('data/history.json').catch(() => []),
    ])
      .then(([meshData, liveData, pulseState, history]) => {
        historyCache = Array.isArray(history) ? history : [];
        renderLegend(meshData.nodes);
        mesh = new CryAIPulseMesh(meshCanvas, tip, { reduced: prefersReduced });
        mesh.mount(meshData);

        let initial = liveData;
        if (!initial) {
          usedPulseFallback = true;
          initial = fromPulseState(pulseState, historyCache);
        }
        if (!initial && historyCache.length) {
          const last = historyCache[historyCache.length - 1];
          const u = Math.min(1, Math.sqrt((last.totalTokens || 0) / 100000));
          initial = fromPulseState({
            updatedAt: last.ts,
            brain: u,
            heart: u,
            neuralHz: last.neuralHz,
            meshBpm: last.meshBpm,
            lastTotalTokens: last.totalTokens,
          }, historyCache);
        }
        if (initial) applyTargetsFromLive(initial);

        window.__cryaipulse = {
          brain, heart, mesh,
          data: meshData,
          live: lastLive,
          pollMs: POLL_MS,
        };

        pollLive();
        schedulePoll();
      })
      .catch((err) => {
        console.error(err);
        const head = $('#mesh-fallback');
        if (head) head.textContent = 'Mesh data unavailable — check data/mesh.json';
      });

    if (prefersReduced) {
      document.documentElement.classList.add('reduced-motion');
      const note = $('#motion-note');
      if (note) note.hidden = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
