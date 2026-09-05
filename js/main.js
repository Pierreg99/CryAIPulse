/**
 * CryAIPulse — orchestration
 * Loads mesh + token pulse history / pulse-state, mounts Brain / Heart / Mesh,
 * drives immersive intensity from token usage, respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel) { return document.querySelector(sel); }

  function formatNum(n, digits) {
    return n.toFixed(digits);
  }

  async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  function renderLegend(nodes) {
    const el = $('#legend');
    if (!el) return;
    el.innerHTML = nodes.map((n) => {
      const hue = n.hue || 'cyan';
      const dotClass = n.ring === 'core' ? 'core' : hue;
      const roomClass = n.ring === 'rooms' ? ' room' : '';
      return (
        '<div class="legend-item' + roomClass + '" data-id="' + n.id + '">' +
          '<span class="legend-dot ' + dotClass + '"></span>' +
          '<span><span class="lid">' + n.id + '</span> ' + n.role + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function applyPulseState(brain, heart, mesh, state) {
    if (!state) return;
    const brainU = prefersReduced ? Math.min(0.25, Number(state.brain) || 0) : Number(state.brain) || 0;
    const heartU = prefersReduced ? Math.min(0.25, Number(state.heart) || 0) : Number(state.heart) || 0;
    const meshU = prefersReduced
      ? Math.min(0.25, (brainU + heartU) / 2)
      : (brainU + heartU) / 2;

    if (brain && brain.setIntensity) brain.setIntensity(brainU, state.neuralHz);
    if (heart && heart.setIntensity) heart.setIntensity(heartU, state.meshBpm);
    if (mesh && mesh.setIntensity) mesh.setIntensity(meshU);

    const tokEl = $('#token-total');
    if (tokEl && state.lastTotalTokens != null) {
      tokEl.textContent = String(state.lastTotalTokens);
    }
    const srcEl = $('#pulse-updated');
    if (srcEl && state.updatedAt) {
      try {
        srcEl.textContent = new Date(state.updatedAt).toLocaleString();
      } catch (_) {
        srcEl.textContent = state.updatedAt;
      }
    }
  }

  function boot() {
    const brainCanvas = $('#brain-canvas');
    const heartCanvas = $('#heart-canvas');
    const meshCanvas = $('#mesh-canvas');
    const tip = $('#mesh-tooltip');
    const hzEl = $('#neural-hz');
    const bpmEl = $('#cardiac-bpm');

    const brain = new CryAIPulseBrain(brainCanvas, { reduced: prefersReduced });
    const heart = new CryAIPulseHeart(heartCanvas, { reduced: prefersReduced });
    brain.mount();
    heart.mount();

    function updateCounters() {
      if (hzEl) hzEl.textContent = formatNum(brain.getHz(), 1);
      if (bpmEl) bpmEl.textContent = formatNum(heart.getBpm(), 0);
      requestAnimationFrame(updateCounters);
    }
    updateCounters();

    Promise.all([
      loadJson('data/mesh.json'),
      loadJson('data/pulse-state.json').catch(() => null),
      loadJson('data/history.json').catch(() => []),
    ])
      .then(([meshData, pulseState, history]) => {
        renderLegend(meshData.nodes);
        const mesh = new CryAIPulseMesh(meshCanvas, tip, { reduced: prefersReduced });
        mesh.mount(meshData);

        // Prefer live pulse-state; fall back to latest history event
        let state = pulseState;
        if ((!state || state.brain == null) && Array.isArray(history) && history.length) {
          const last = history[history.length - 1];
          state = {
            updatedAt: last.ts,
            brain: Math.min(1, Math.sqrt((last.totalTokens || 0) / 100000)),
            heart: Math.min(1, Math.sqrt((last.totalTokens || 0) / 100000)),
            neuralHz: last.neuralHz,
            meshBpm: last.meshBpm,
            lastTotalTokens: last.totalTokens,
          };
        }
        applyPulseState(brain, heart, mesh, state);

        const histEl = $('#history-count');
        if (histEl && Array.isArray(history)) {
          histEl.textContent = String(history.length);
        }

        window.__cryaipulse = { brain, heart, mesh, data: meshData, pulseState: state, history };
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
