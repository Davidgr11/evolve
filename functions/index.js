const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();

const claudeApiKey = defineSecret('CLAUDE_API_KEY');
const googleBooksApiKey = defineSecret('GOOGLE_BOOKS_API_KEY');
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// ── Helpers ───────────────────────────────────────────────────────────────────

const getTodayMX = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

const sendPushToToken = async (token, title, body) => {
  await admin.messaging().send({
    token,
    notification: { title, body },
    webpush: { notification: { icon: '/icon-192x192.png', badge: '/icon-192x192.png' } },
  });
};

const sendPushToUser = async (uid, title, body) => {
  const tokenDoc = await admin.firestore().doc(`fcmTokens/${uid}`).get();
  if (!tokenDoc.exists) return;
  const data = tokenDoc.data();
  // Support both old { token } format and new { tokens: [] } format
  const tokens = data.tokens || (data.token ? [data.token] : []);
  if (tokens.length === 0) return;

  const stale = [];
  await Promise.all(tokens.map(async (t) => {
    try {
      await sendPushToToken(t, title, body);
    } catch (err) {
      if (err.code === 'messaging/registration-token-not-registered') stale.push(t);
    }
  }));

  if (stale.length > 0) {
    const remaining = tokens.filter(t => !stale.includes(t));
    if (remaining.length === 0) {
      await admin.firestore().doc(`fcmTokens/${uid}`).delete();
    } else {
      await admin.firestore().doc(`fcmTokens/${uid}`).update({
        tokens: remaining,
        token: admin.firestore.FieldValue.delete(),
      });
    }
  }
};

const sendSleepReminders = async (message) => {
  const today = getTodayMX();
  const tokensSnap = await admin.firestore().collection('fcmTokens').get();
  for (const tokenDoc of tokensSnap.docs) {
    const uid = tokenDoc.id;
    const wellbeingSnap = await admin.firestore().doc(`users/${uid}/wellbeing/data`).get();
    const sleepFilled = !!wellbeingSnap.data()?.checkIns?.[today]?.sleepFilledAt;
    if (!sleepFilled) await sendPushToUser(uid, '🌙 Registro de sueño', message);
  }
};

const sendEveningReminders = async (message) => {
  const today = getTodayMX();
  const tokensSnap = await admin.firestore().collection('fcmTokens').get();
  for (const tokenDoc of tokensSnap.docs) {
    const uid = tokenDoc.id;
    const wellbeingSnap = await admin.firestore().doc(`users/${uid}/wellbeing/data`).get();
    const eveningFilled = !!wellbeingSnap.data()?.checkIns?.[today]?.savedAt;
    if (!eveningFilled) await sendPushToUser(uid, '✨ Check-in pendiente', message);
  }
};

// ── Morning sleep reminders ───────────────────────────────────────────────────

exports.sleepReminder7am = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendSleepReminders('¿Cómo dormiste anoche? Regístralo antes de las 12pm')
);

exports.sleepReminder8am = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendSleepReminders('Aún puedes registrar tu sueño de anoche')
);

exports.sleepReminder9am = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendSleepReminders('Último aviso — registra tu sueño antes de las 12pm')
);

// ── Evening check-in reminders ────────────────────────────────────────────────

exports.checkinReminder7pm = onSchedule(
  { schedule: '0 19 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendEveningReminders('¿Cómo fue tu día? Completa tu check-in')
);

exports.checkinReminder8pm = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendEveningReminders('Tu check-in de hoy sigue pendiente')
);

exports.checkinReminder9pm = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendEveningReminders('Último recordatorio — completa tu check-in antes de dormir')
);

// ── Test notification ─────────────────────────────────────────────────────────

exports.sendTestNotification = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const tokenDoc = await admin.firestore().doc(`fcmTokens/${request.auth.uid}`).get();
  if (!tokenDoc.exists) {
    throw new HttpsError('not-found', 'No tienes notificaciones activadas en este dispositivo');
  }
  await sendPushToUser(
    request.auth.uid,
    '✅ ¡Notificaciones activas!',
    'Las notificaciones de Evolve están funcionando correctamente'
  );
  return { success: true };
});

// ── Claude API proxy ──────────────────────────────────────────────────────────

exports.callClaude = onCall(
  { secrets: [claudeApiKey], region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { prompt, maxTokens = 400 } = request.data;
    if (!prompt || typeof prompt !== 'string') {
      throw new HttpsError('invalid-argument', 'prompt must be a non-empty string');
    }
    const client = new Anthropic({ apiKey: claudeApiKey.value() });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return { text: msg.content[0].text };
  }
);

// ── OpenAI Text-to-Speech proxy ───────────────────────────────────────────────

exports.ttsSpeak = onCall(
  { secrets: [openaiApiKey], region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { text, voice = 'nova' } = request.data;
    if (!text || typeof text !== 'string') throw new HttpsError('invalid-argument', 'text required');
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpsError('internal', `OpenAI TTS error: ${err}`);
    }
    const buf = await res.arrayBuffer();
    return { audioBase64: Buffer.from(buf).toString('base64') };
  }
);

// ── Google Books proxy ────────────────────────────────────────────────────────

// ── Google Cloud Text-to-Speech ───────────────────────────────────────────────

exports.ttsGCloud = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { text, voice = 'es-US-Journey-F' } = request.data;
    if (!text || typeof text !== 'string') throw new HttpsError('invalid-argument', 'text required');

    const textToSpeech = require('@google-cloud/text-to-speech');
    const client = new textToSpeech.TextToSpeechClient();

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'es-US', name: voice },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.88,
        pitch: -1.0,
      },
    });

    return { audioBase64: Buffer.from(response.audioContent).toString('base64') };
  }
);

exports.searchBooks = onCall(
  { secrets: [googleBooksApiKey], region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { query } = request.data;
    if (!query || typeof query !== 'string') {
      throw new HttpsError('invalid-argument', 'query must be a non-empty string');
    }
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&fields=items(id,volumeInfo(title,authors,categories,imageLinks))&key=${googleBooksApiKey.value()}`;
    const res = await fetch(url);
    if (!res.ok) return { results: [] };
    const data = await res.json();
    const results = (data.items || []).map(item => ({
      googleId: item.id,
      title: item.volumeInfo?.title || '',
      author: item.volumeInfo?.authors?.[0] || '',
      category: item.volumeInfo?.categories?.[0] || '',
      coverUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace('http://', 'https://') || '',
    }));
    return { results };
  }
);
