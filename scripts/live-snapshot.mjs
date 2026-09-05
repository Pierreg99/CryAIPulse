/**
 * Shared builder for data/live.json hot snapshot.
 * Used by publish-live.mjs and append-pulse.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

const REF_TOKENS = 100000;
const TAIL_MAX = 30;

const NODE_KEYS = [
  'L0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'Build', 'Sense',
];

function intensityFromTokens(totalTokens) {
  const t = Math.max(0, Number(totalTokens) || 0);
  return Math.min(1, Math.sqrt(t / REF_TOKENS));
}

function derive(totalTokens) {
  const u = intensityFromTokens(totalTokens);
  return {
    u,
    neuralHz: Math.round((6 + u * 14) * 10) / 10,
    meshBpm: Math.round(55 + u * 50),
    brain: Math.round(u * 1000) / 1000,
    heart: Math.round(u * 1000) / 1000,
  };
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round3(n) {
  return Math.round(clamp01(n) * 1000) / 1000;
}

/** Parse NODE_ACTIVITY JSON env or NODE_<KEY> floats. */
function parseNodeHints(env = process.env) {
  const out = {};
  if (env.NODE_ACTIVITY) {
    try {
      const parsed = JSON.parse(env.NODE_ACTIVITY);
      if (parsed && typeof parsed === 'object') {
        for (const k of NODE_KEYS) {
          if (parsed[k] != null) out[k] = clamp01(parsed[k]);
        }
      }
    } catch {
      // ignore bad JSON
    }
  }
  for (const k of NODE_KEYS) {
    const envKey = 'NODE_' + k.toUpperCase().replace(/-/g, '_');
    if (env[envKey] != null && env[envKey] !== '') {
      out[k] = clamp01(env[envKey]);
    }
  }
  return out;
}

/**
 * Derive per-node activity 0..1 from overall intensity + optional hints.
 * Slight role bias so the mesh looks alive, not uniform.
 */
function buildNodeActivities(u, hints = {}) {
  const bias = {
    L0: 1.0,
    S1: 0.92,
    S2: 0.88,
    S3: 0.95,
    S4: 0.82,
    S5: 0.78,
    S6: 0.8,
    S7: 0.85,
    S8: 0.75,
    Build: 0.9,
    Sense: 0.86,
  };
  const nodes = {};
  for (const k of NODE_KEYS) {
    if (hints[k] != null) {
      nodes[k] = { activity: round3(hints[k]) };
    } else {
      // Mild hash-ish variation so nodes aren't identical every publish
      const wobble = 0.85 + ((k.charCodeAt(0) + k.length * 7) % 11) / 50;
      nodes[k] = { activity: round3(u * (bias[k] || 0.8) * wobble) };
    }
  }
  return nodes;
}

function readHistory(root) {
  const historyPath = path.join(root, 'data', 'history.json');
  if (!fs.existsSync(historyPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build live snapshot object from history + optional overrides.
 * @param {string} root repo root
 * @param {object} [opts]
 * @param {number} [opts.tokensIn]
 * @param {number} [opts.tokensOut]
 * @param {object} [opts.nodeHints]
 * @param {string[]} [opts.sources]
 * @param {string} [opts.status]
 * @param {string} [opts.updatedAt]
 */
const AVATAR_LABELS = {
  sleep: 'Sleeping',
  wake: 'Waking',
  read: 'Reading',
  code: 'Coding',
  draw: 'Drawing',
  check: 'Checking',
};

/**
 * Derive compact avatar activity state for the live dock character.
 * Prefer opts.avatar / AVATAR_STATE env; else pulse + nodes + sources.
 */
function deriveAvatar(pulse, nodes, sources, opts = {}) {
  if (opts.avatar && opts.avatar.state) {
    const st = String(opts.avatar.state);
    if (AVATAR_LABELS[st]) {
      return {
        state: st,
        energy: round3(opts.avatar.energy != null ? opts.avatar.energy : (pulse.brain + pulse.heart) / 2),
        label: opts.avatar.label || AVATAR_LABELS[st],
      };
    }
  }
  if (opts.avatarState && AVATAR_LABELS[opts.avatarState]) {
    const st = opts.avatarState;
    return {
      state: st,
      energy: round3(opts.avatarEnergy != null ? opts.avatarEnergy : (pulse.brain + pulse.heart) / 2),
      label: opts.avatarLabel || AVATAR_LABELS[st],
    };
  }

  const brain = clamp01(pulse.brain);
  const heart = clamp01(pulse.heart);
  const energy = (brain + heart) / 2;
  const act = (k) => {
    const e = nodes[k];
    if (!e) return 0;
    return clamp01(typeof e === 'number' ? e : e.activity);
  };
  const src = (sources || []).map((s) => String(s).toLowerCase());
  const has = (frag) => src.some((s) => s.includes(frag));

  const s3 = act('S3');
  const s4 = act('S4');
  const s2 = act('S2');
  const s5 = act('S5');
  const s6 = act('S6');
  const build = act('Build');

  let state = 'sleep';
  if (energy < 0.18) state = 'sleep';
  else if (energy < 0.28) state = 'wake';
  else if (has('cod') || s3 >= 0.62 || (s3 >= energy * 0.9 && s3 >= 0.5)) {
    state = energy >= 0.45 ? 'code' : 'wake';
  } else if (has('research') || has('read') || (s4 >= 0.58 && s4 >= s3 - 0.05)) {
    state = 'read';
  } else if (has('design') || has('draw') || has('creat') || (s2 >= 0.58 && s2 > s4) || (s5 >= 0.6 && s5 > s3)) {
    state = 'draw';
  } else if (has('review') || has('check') || has('critic') || (s6 >= 0.58 && s6 >= s3 - 0.02)) {
    state = 'check';
  } else if (build >= 0.65 || energy >= 0.55) state = 'code';
  else if (energy >= 0.35) state = 'read';
  else state = 'wake';

  return {
    state,
    energy: round3(energy),
    label: AVATAR_LABELS[state],
  };
}

export function buildLiveSnapshot(root, opts = {}) {
  const history = readHistory(root);
  const last = history.length ? history[history.length - 1] : null;

  const tokensIn = opts.tokensIn != null
    ? Number(opts.tokensIn)
    : (last ? last.tokensIn : 0);
  const tokensOut = opts.tokensOut != null
    ? Number(opts.tokensOut)
    : (last ? last.tokensOut : 0);
  const total = Math.max(0, (Number(tokensIn) || 0) + (Number(tokensOut) || 0));
  const sessionTotal = history.reduce((s, e) => s + (Number(e.totalTokens) || 0), 0);

  const der = derive(total);
  const brain = opts.brain != null ? clamp01(opts.brain) : der.brain;
  const heart = opts.heart != null ? clamp01(opts.heart) : der.heart;
  const neuralHz = opts.neuralHz != null ? Number(opts.neuralHz) : der.neuralHz;
  const meshBpm = opts.meshBpm != null ? Number(opts.meshBpm) : der.meshBpm;

  const hints = opts.nodeHints || {};
  const nodes = buildNodeActivities((brain + heart) / 2, hints);

  const historyTail = history.slice(-TAIL_MAX).map((e) => ({
    ts: e.ts,
    totalTokens: e.totalTokens,
    neuralHz: e.neuralHz,
    meshBpm: e.meshBpm,
  }));

  const sourceSet = new Set();
  for (const e of history) {
    if (e.source) sourceSet.add(String(e.source).slice(0, 64));
  }
  if (opts.sources && Array.isArray(opts.sources)) {
    for (const s of opts.sources) sourceSet.add(s);
  }
  let sources = [...sourceSet];
  if (!sources.length) sources = ['manual'];

  const pulseObj = {
    brain: Math.round(brain * 1000) / 1000,
    heart: Math.round(heart * 1000) / 1000,
    neuralHz,
    meshBpm,
  };
  const avatar = deriveAvatar(pulseObj, nodes, sources, opts);

  return {
    updatedAt: opts.updatedAt || new Date().toISOString(),
    tokens: {
      in: Number(tokensIn) || 0,
      out: Number(tokensOut) || 0,
      total,
      sessionTotal,
    },
    pulse: pulseObj,
    nodes,
    historyTail,
    sources,
    status: opts.status || 'live',
    avatar,
  };
}

export function writeLiveJson(root, opts = {}) {
  const live = buildLiveSnapshot(root, opts);
  const livePath = path.join(root, 'data', 'live.json');
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  fs.writeFileSync(livePath, JSON.stringify(live, null, 2) + '\n');
  return live;
}

export { REF_TOKENS, NODE_KEYS, parseNodeHints, intensityFromTokens, derive, deriveAvatar, AVATAR_LABELS };
