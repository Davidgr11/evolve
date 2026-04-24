import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'us-central1');

const _callClaude  = httpsCallable(functions, 'callClaude');
const _searchBooks = httpsCallable(functions, 'searchBooks');
const _ttsSpeak    = httpsCallable(functions, 'ttsSpeak');
const _ttsGCloud   = httpsCallable(functions, 'ttsGCloud');

const gbCache  = {};
const ttsMemCache = {};
const TTS_LS_PREFIX = 'tts_v2_';

const ttsLsGet = (key) => {
  try { return localStorage.getItem(TTS_LS_PREFIX + key) || null; } catch { return null; }
};

const ttsLsSet = (key, b64) => {
  try {
    localStorage.setItem(TTS_LS_PREFIX + key, b64);
  } catch {
    // Quota full — clear all cached TTS entries and retry once
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(TTS_LS_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(TTS_LS_PREFIX + key, b64);
    } catch {}
  }
};

const ttsCacheKey = (text, voice) => {
  let hash = 0;
  const s = voice + '|' + text;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

export const callClaude = async (prompt, maxTokens = 400) => {
  const { data } = await _callClaude({ prompt, maxTokens });
  return data.text;
};

export const ttsSpeak = async (text, voice = 'shimmer') => {
  const key = ttsCacheKey(text, voice);
  if (ttsMemCache[key]) return ttsMemCache[key];
  const persisted = ttsLsGet(key);
  if (persisted) { ttsMemCache[key] = persisted; return persisted; }
  const { data } = await _ttsSpeak({ text, voice });
  const b64 = data.audioBase64;
  ttsMemCache[key] = b64;
  ttsLsSet(key, b64);
  return b64;
};

export const ttsGCloud = async (text, voice = 'es-MX-Neural2-A') => {
  const key = ttsCacheKey(text, voice);
  if (ttsMemCache[key]) return ttsMemCache[key];
  const persisted = ttsLsGet(key);
  if (persisted) { ttsMemCache[key] = persisted; return persisted; }
  const { data } = await _ttsGCloud({ text, voice });
  const b64 = data.audioBase64;
  ttsMemCache[key] = b64;
  ttsLsSet(key, b64);
  return b64;
};

export const sendTestNotification = async () => {
  const { data } = await httpsCallable(functions, 'sendTestNotification')({});
  return data;
};

export const searchGoogleBooks = async (query) => {
  if (!query?.trim()) return [];
  const key = query.trim().toLowerCase();
  if (gbCache[key]) return gbCache[key];
  const { data } = await _searchBooks({ query });
  gbCache[key] = data.results;
  return data.results;
};
