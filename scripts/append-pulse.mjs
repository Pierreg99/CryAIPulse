#!/usr/bin/env node
/**
 * Append a token-usage pulse event to data/history.json and refresh pulse-state.json.
 *
 * Env:
 *   TOKEN_IN   – input tokens (required, integer >= 0)
 *   TOKEN_OUT  – output tokens (required, integer >= 0)
 *   SOURCE     – optional label (default: "cli")
 *   PULSE_ROOT – optional repo root (default: parent of scripts/)
 *
 * Formula (rises with totalTokens = TOKEN_IN + TOKEN_OUT):
 *   REF_TOKENS = 100000
 *   u = min(1, sqrt(totalTokens / REF_TOKENS))
 *   neuralHz = 6 + u * 14
 *   meshBpm  = 55 + u * 50
 *   brain/heart intensity = u
 *
 * Usage:
 *   TOKEN_IN=1200 TOKEN_OUT=800 node scripts/append-pulse.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF_TOKENS = 100000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.PULSE_ROOT
  ? path.resolve(process.env.PULSE_ROOT)
  : path.resolve(__dirname, '..');

function parseNonNegInt(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    console.error(`${name} must be a non-negative integer, got: ${raw}`);
    process.exit(1);
  }
  return n;
}

function intensityFromTokens(totalTokens) {
  const t = Math.max(0, totalTokens);
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

const tokensIn = parseNonNegInt('TOKEN_IN');
const tokensOut = parseNonNegInt('TOKEN_OUT');
const source = (process.env.SOURCE || 'cli').slice(0, 64);
const totalTokens = tokensIn + tokensOut;
const der = derive(totalTokens);
const ts = new Date().toISOString();

const historyPath = path.join(root, 'data', 'history.json');
const statePath = path.join(root, 'data', 'pulse-state.json');

let history = [];
if (fs.existsSync(historyPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    console.error('Warning: could not parse history.json — starting fresh array');
  }
}

const event = {
  ts,
  tokensIn,
  tokensOut,
  totalTokens,
  neuralHz: der.neuralHz,
  meshBpm: der.meshBpm,
  source,
};

history.push(event);
// Keep a bounded public trail (newest retained)
const MAX = 200;
if (history.length > MAX) history = history.slice(-MAX);

const state = {
  updatedAt: ts,
  brain: der.brain,
  heart: der.heart,
  neuralHz: der.neuralHz,
  meshBpm: der.meshBpm,
  lastTotalTokens: totalTokens,
  formula: {
    refTokens: REF_TOKENS,
    intensity: 'u = min(1, sqrt(totalTokens / REF_TOKENS))',
    neuralHz: '6 + u * 14  (Hz; rises with tokens)',
    meshBpm: '55 + u * 50  (BPM; rises with tokens)',
    brainHeart: 'pulse-state brain/heart intensity = u (0..1)',
  },
};

fs.mkdirSync(path.dirname(historyPath), { recursive: true });
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

console.log(JSON.stringify({ ok: true, event, brain: der.brain, heart: der.heart }, null, 2));
