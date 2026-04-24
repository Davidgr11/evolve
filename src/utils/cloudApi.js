import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'us-central1');

const _callClaude  = httpsCallable(functions, 'callClaude');
const _searchBooks = httpsCallable(functions, 'searchBooks');
const _ttsSpeak    = httpsCallable(functions, 'ttsSpeak');

const gbCache = {};

export const callClaude = async (prompt, maxTokens = 400) => {
  const { data } = await _callClaude({ prompt, maxTokens });
  return data.text;
};

export const ttsSpeak = async (text, voice = 'nova') => {
  const { data } = await _ttsSpeak({ text, voice });
  return data.audioBase64;
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
