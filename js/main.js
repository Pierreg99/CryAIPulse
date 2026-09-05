/**
 * CryAIPulse — orchestration
 * Loads mesh data, mounts Brain / Heart / Mesh, counters, reduced-motion.
 */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel) { return document.querySelector(sel); }

  function formatNum(n, digits) {
    return n.toFixed(digits);
  }

  async function loadMesh() {
    const res = await fetch('data/mesh.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load mesh.json');
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

    // Counter updater (cosmetic)
    function updateCounters() {
      if (hzEl) hzEl.textContent = formatNum(brain.getHz(), 1);
      if (bpmEl) bpmEl.textContent = formatNum(heart.getBpm(), 0);
      requestAnimationFrame(updateCounters);
    }
    updateCounters();

    loadMesh()
      .then((data) => {
        renderLegend(data.nodes);
        const mesh = new CryAIPulseMesh(meshCanvas, tip, { reduced: prefersReduced });
        mesh.mount(data);
        window.__cryaipulse = { brain, heart, mesh, data };
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
