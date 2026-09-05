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
index.html              Immersive landing (Brain | Heart + Mesh)
css/pulse.css           Cryo palette & layout
js/brain.js             Canvas neural brain / dendrites
js/heart.js             ECG QRS heart monitor
js/mesh.js              Agentic mesh topology pulses
js/main.js              Orchestration + pulse-state + reduced-motion
data/mesh.json          Public node/edge metadata only
data/history.json       Token pulse history (public aggregates)
data/pulse-state.json   Current brain/heart intensity 0..1
scripts/append-pulse.mjs  CLI: TOKEN_IN/TOKEN_OUT → history + state
examples/               Bridge notes + demo append
favicon.svg             Brand mark
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


## Token pulse history

CryAIPulse can mirror **aggregate token usage** as living Neural Hz / Mesh BPM immersion.

### Schema — `data/history.json`

Array of events:

| Field | Type | Meaning |
|-------|------|---------|
| `ts` | ISO-8601 string | Event time (UTC) |
| `tokensIn` | int | Input tokens |
| `tokensOut` | int | Output tokens |
| `totalTokens` | int | `tokensIn + tokensOut` |
| `neuralHz` | number | Derived neural frequency (rises with tokens) |
| `meshBpm` | number | Derived mesh BPM (rises with tokens) |
| `source` | string | Short label (`demo`, `cli`, `agent-memory`, …) |

### Schema — `data/pulse-state.json`

Current intensity driving the canvases:

- `brain` / `heart`: **0..1** immersion
- `neuralHz` / `meshBpm`: display targets
- `lastTotalTokens`, `updatedAt`, `formula` (documented copy of the math)

### Formula (Hz / BPM rise with tokens)

```
REF_TOKENS = 100000
u = min(1, sqrt(totalTokens / REF_TOKENS))   # intensity 0..1
neuralHz = 6 + u * 14                       # ~6–20 Hz
meshBpm  = 55 + u * 50                      # ~55–105 BPM
brain = heart = u
```

More tokens → higher `u` → stronger ECG amplitude, denser neural sparks, faster mesh ripples.  
`prefers-reduced-motion: reduce` caps intensity and softens animation.

### Append from a routine

```bash
TOKEN_IN=1200 TOKEN_OUT=800 SOURCE=cli node scripts/append-pulse.mjs
```

Seeds under `data/` keep GitHub Pages looking alive immediately.

## Sync with agent-memory

Conceptual bridge to the public [`agent-memory`](https://github.com/Pierreg99/agent-memory) library:

1. Use its **token-aware window** (`WindowResult.used_tokens` / message `token_count`) after `prepare()` / a completed turn.
2. Map counts to `TOKEN_IN` / `TOKEN_OUT` (never paste prompts, keys, or private paths).
3. Run `scripts/append-pulse.mjs` (or write the same JSON fields) and publish only the aggregate files.

See [examples/bridge-from-agent-memory.md](examples/bridge-from-agent-memory.md) for a short walkthrough. No private repo names or secrets belong in this visualization repo.

## License

MIT — see [LICENSE](LICENSE).
