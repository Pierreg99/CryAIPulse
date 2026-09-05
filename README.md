# CryAIPulse

**Brain & heart pulse of the agentic mesh**

Public visualization for the **Cryo Omega / AGI-3** agentic mesh — neural dendrite propagation from L0 Cryoomega, ECG QRS heartbeat, synaptic gap pulses, mesh resonance ripples, and outer rings **Build** + **Sense**.

> **SafeMode:** Visualization only. No API keys, no `.env`, no private repo names or internal paths. Cosmetic Neural Hz / Mesh BPM counters.

## Live

- **GitHub Pages:** https://pierreg99.github.io/CryAIPulse/
- **Repository:** https://github.com/Pierreg99/CryAIPulse

## Mesh roles (public)

| ID | Role | Ring |
|----|------|------|
| L0 | Cryoomega | core |
| S1 | Strategist | agents |
| S2 | Architect | agents |
| S3 | Coder | agents |
| S4 | Researcher | agents |
| S5 | Writer | agents |
| S6 | Critic | agents |
| S7 | DomainExpert | agents |
| S8 | Ethicist | agents |
| R-BUILD | Build | rooms |
| R-SENSE | Sense | rooms |

## Structure

```
index.html      Immersive landing (Brain | Heart + Mesh)
css/pulse.css   Cryo palette & layout
js/brain.js     Canvas neural brain / dendrites
js/heart.js     ECG QRS heart monitor
js/mesh.js      Agentic mesh topology pulses
js/main.js      Orchestration + prefers-reduced-motion
data/mesh.json  Public node/edge metadata only
favicon.svg     Brand mark
```

## Design

- Palette: `#020510` · `#0a1428` · `#00e5ff` · `#00ffa3` · `#e0f7fa` · rose/magenta heart accent
- Dark cryo aesthetic, premium, no emoji fluff
- 60fps-friendly canvas, responsive, hover tooltips on mesh nodes

## Local preview

Open `index.html` via any static server (required for `fetch` of `data/mesh.json`):

```bash
npx --yes serve -l 4173 .
# or: python3 -m http.server 4173
```

## License

MIT — see [LICENSE](LICENSE).
