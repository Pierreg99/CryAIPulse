#!/usr/bin/env node
/**
 * Rebuild data/live.json from history.json + optional env overrides.
 *
 * Env (all optional):
 *   TOKEN_IN / TOKEN_OUT  – override latest event token counts for pulse math
 *   NODE_ACTIVITY         – JSON map of node → activity 0..1
 *                           keys: L0,S1..S8,Build,Sense
 *   NODE_L0, NODE_S3, …   – individual activity overrides
 *   SOURCES               – comma-separated source labels to merge
 *   STATUS                – default "live"
 *   AVATAR_STATE          – sleep|wake|read|code|draw|check (optional override)
 *   AVATAR_ENERGY         – 0..1 optional
 *   AVATAR_LABEL          – optional display label
 *   PULSE_ROOT            – repo root (default: parent of scripts/)
 *
 * Usage:
 *   node scripts/publish-live.mjs
 *   TOKEN_IN=28000 TOKEN_OUT=21500 node scripts/publish-live.mjs
 *   NODE_ACTIVITY='{"L0":0.9,"S3":0.85,"Build":0.7}' node scripts/publish-live.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLiveJson, parseNodeHints } from './live-snapshot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.PULSE_ROOT
  ? path.resolve(process.env.PULSE_ROOT)
  : path.resolve(__dirname, '..');

function optInt(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    console.error(`${name} must be a non-negative integer, got: ${raw}`);
    process.exit(1);
  }
  return n;
}

const tokensIn = optInt('TOKEN_IN');
const tokensOut = optInt('TOKEN_OUT');
const nodeHints = parseNodeHints(process.env);
const sources = process.env.SOURCES
  ? process.env.SOURCES.split(',').map((s) => s.trim()).filter(Boolean)
  : undefined;
const status = process.env.STATUS || 'live';
const avatarState = process.env.AVATAR_STATE || undefined;
const avatarEnergy = process.env.AVATAR_ENERGY != null && process.env.AVATAR_ENERGY !== ''
  ? Number(process.env.AVATAR_ENERGY)
  : undefined;
const avatarLabel = process.env.AVATAR_LABEL || undefined;

const live = writeLiveJson(root, {
  tokensIn,
  tokensOut,
  nodeHints,
  sources,
  status,
  avatarState,
  avatarEnergy,
  avatarLabel,
});

console.log(JSON.stringify({
  ok: true,
  path: 'data/live.json',
  updatedAt: live.updatedAt,
  tokens: live.tokens,
  pulse: live.pulse,
  status: live.status,
  historyTail: live.historyTail.length,
  avatar: live.avatar,
}, null, 2));
