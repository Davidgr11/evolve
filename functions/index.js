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

const sendMeditationReminders = async () => {
  const today = getTodayMX();
  const tokensSnap = await admin.firestore().collection('fcmTokens').get();
  for (const tokenDoc of tokensSnap.docs) {
    const uid = tokenDoc.id;
    const wellbeingSnap = await admin.firestore().doc(`users/${uid}/wellbeing/data`).get();
    const todayMeds = wellbeingSnap.data()?.meditations?.[today] || [];
    if (todayMeds.length === 0) {
      await sendPushToUser(uid, '🧘 Hora de meditar', 'Todavía no has meditado hoy — unos minutos pueden hacer la diferencia.');
    }
  }
};

// ── Morning sleep reminders ───────────────────────────────────────────────────

// 7am every day
exports.sleepReminder7am = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendSleepReminders('¿Cómo dormiste anoche? Tómate un momento para registrarlo')
);

// 8:30am weekdays (Mon–Fri)
exports.sleepReminder8_30amWeekdays = onSchedule(
  { schedule: '30 8 * * 1-5', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendSleepReminders('Recuerda registrar tu sueño de anoche')
);

// 9am weekends (Sat–Sun)
exports.sleepReminder9amWeekends = onSchedule(
  { schedule: '0 9 * * 0,6', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendSleepReminders('Recuerda registrar tu sueño de anoche')
);

// ── Evening check-in reminders ────────────────────────────────────────────────

exports.checkinReminder8pm = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendEveningReminders('¿Cómo fue tu día? Completa tu check-in de hoy')
);

exports.checkinReminder9_30pm = onSchedule(
  { schedule: '30 21 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendEveningReminders('Último recordatorio — completa tu check-in antes de dormir')
);

// ── Nutrition reminders ───────────────────────────────────────────────────────

// Sunday 3pm — reading reminder
exports.readingReminder3pmSunday = onSchedule(
  { schedule: '0 15 * * 0', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => {
    const tokensSnap = await admin.firestore().collection('fcmTokens').get();
    for (const tokenDoc of tokensSnap.docs) {
      await sendPushToUser(tokenDoc.id, '📚 Hora de leer', 'Dedica unos minutos a tu libro de hoy — cada página cuenta.');
    }
  }
);

// Sunday 10am — shopping list
exports.nutritionSundayReminder = onSchedule(
  { schedule: '0 10 * * 0', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => {
    const tokensSnap = await admin.firestore().collection('fcmTokens').get();
    for (const tokenDoc of tokensSnap.docs) {
      await sendPushToUser(tokenDoc.id, '🛒 Lista del súper', 'Es domingo — revisa tu lista y prepárate para comer bien toda la semana.');
    }
  }
);

// 1st of every month 9am — log weight + validate plan
exports.nutritionMonthlyReminder = onSchedule(
  { schedule: '0 9 1 * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => {
    const tokensSnap = await admin.firestore().collection('fcmTokens').get();
    for (const tokenDoc of tokensSnap.docs) {
      await sendPushToUser(tokenDoc.id, '📊 Nuevo mes', 'Recuerda registrar tu peso y validar si tu plan de alimentación sigue vigente.');
    }
  }
);

// ── Activity reminder ─────────────────────────────────────────────────────────

// Saturday 8am
exports.activitySaturdayReminder = onSchedule(
  { schedule: '0 8 * * 6', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => {
    const tokensSnap = await admin.firestore().collection('fcmTokens').get();
    for (const tokenDoc of tokensSnap.docs) {
      await sendPushToUser(tokenDoc.id, '💪 ¡Sábado activo!', 'Es un buen día para mover el cuerpo. ¿Qué rutina harás hoy?');
    }
  }
);

// ── Meditation reminder ───────────────────────────────────────────────────────

// 6pm daily — only if user hasn't meditated today
exports.meditationReminder6pm = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'America/Mexico_City', region: 'us-central1' },
  async () => sendMeditationReminders()
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
        model: 'tts-1',
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
