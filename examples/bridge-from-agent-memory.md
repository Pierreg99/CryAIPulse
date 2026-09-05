# Bridge: agent-memory token windows → CryAIPulse

Conceptual sync only. **Do not commit secrets, API keys, private repo names, or real conversation text.**

[`agent-memory`](https://github.com/Pierreg99/agent-memory) exposes token-aware context windowing (`WindowResult.used_tokens`, message `token_count`). CryAIPulse turns those counts into public cosmetic Neural Hz / Mesh BPM immersion.

## Minimal flow

1. After a turn (or window apply), obtain input/output token counts from your agent runtime.
2. Call CryAIPulse’s append script with env vars only (no payloads):

```bash
# From a CryAIPulse checkout (public data only)
TOKEN_IN=4200 TOKEN_OUT=3100 SOURCE=agent-memory \
  node scripts/append-pulse.mjs
```

3. Commit/push `data/history.json` + `data/pulse-state.json` if you want GitHub Pages to update.

## Example mapping (pseudocode)

```python
# Illustrative — run in your private agent loop, never publish secrets.
from agent_memory import AgentMemory  # public library

mem = AgentMemory.from_config()
# ... add messages, prepare pack ...
pack = mem.prepare("user question", system_prompt="...")

# Prefer real provider usage when available; else estimate from window:
tokens_in = getattr(pack, "used_tokens", None) or sum(
    (m.token_count or 0) for m in pack.messages
)
tokens_out = 0  # fill from LLM response usage when you have it

# Then shell out (or write JSON yourself using the same formula):
# TOKEN_IN=... TOKEN_OUT=... SOURCE=agent-memory node scripts/append-pulse.mjs
```

## Formula (must rise with tokens)

```
REF_TOKENS = 100000
u = min(1, sqrt(totalTokens / REF_TOKENS))   # intensity 0..1
neuralHz = 6 + u * 14                       # Hz
meshBpm  = 55 + u * 50                      # BPM
```

Higher token load → higher Hz/BPM → denser neural sparks, stronger ECG amplitude, faster mesh ripples (softened when `prefers-reduced-motion`).

## Safety

- Public Pages should only contain aggregate integers (`tokensIn`, `tokensOut`, derived Hz/BPM).
- Never mirror private thread IDs, user content, or credentials into CryAIPulse.
