import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import {
  ChevronLeft, Loader2, Play, Square,
  CloudRain, Waves, TreePine, Flame, Sparkles, VolumeX, Wind, Droplets,
} from 'lucide-react';
import { callClaude, ttsSpeak } from '../utils/cloudApi';
import { THEME_GROUPS, COMPLETION_QUOTES } from '../constants/phrases';
import toast from '../utils/toast';

// ── Helpers ────────────────────────────────────────────────────────────────────

const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SOUNDS = [
  { id: 'rain',   label: 'Lluvia',  Icon: CloudRain, from: '#5a7fa0', to: '#8ab0c8' },
  { id: 'ocean',  label: 'Océano',  Icon: Waves,     from: '#1a6080', to: '#3a9aba' },
  { id: 'forest', label: 'Bosque',  Icon: TreePine,  from: '#2a6040', to: '#4a9a68' },
  { id: 'river',  label: 'Río',     Icon: Droplets,  from: '#2e7090', to: '#5aa8c8' },
  { id: 'wind',   label: 'Viento',  Icon: Wind,      from: '#607890', to: '#90aac0' },
  { id: 'fire',   label: 'Fogata',  Icon: Flame,     from: '#a03010', to: '#d86030' },
  { id: 'space',  label: 'Espacio', Icon: Sparkles,  from: '#1a1060', to: '#3a2890' },
  { id: 'none',   label: 'Silencio',Icon: VolumeX,   from: '#4a5060', to: '#7a8090' },
];

const DURATIONS = [
  { mins: 3,  label: '3 min',  secs: 180 },
  { mins: 5,  label: '5 min',  secs: 300 },
  { mins: 10, label: '10 min', secs: 600 },
];

// ── Phrase selection ───────────────────────────────────────────────────────────

const selectPhraseIndices = (phrases, durationMins) => {
  const count = durationMins <= 3 ? 4 : durationMins <= 5 ? 7 : 12;
  if (phrases.length <= count) return phrases.map((_, i) => i);
  const step = (phrases.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
};

const selectPhrases = (phrases, durationMins) => {
  return selectPhraseIndices(phrases, durationMins).map(i => phrases[i]);
};

const phraseTimes = (totalSecs, count) => {
  if (!count) return [];
  const a = Math.floor(totalSecs * 0.08);
  const b = Math.floor(totalSecs * 0.88);
  if (count === 1) return [a];
  return Array.from({ length: count }, (_, i) => Math.floor(a + i * (b - a) / (count - 1)));
};

const findTheme = (id) => {
  for (const g of THEME_GROUPS) {
    const t = g.themes.find(t => t.id === id);
    if (t) return t;
  }
  return null;
};

// ── Audio synthesis ────────────────────────────────────────────────────────────

const buildNoiseBuf = (ctx, pink = false) => {
  const sr = ctx.sampleRate, len = sr * 5;
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)/8; b6=w*0.115926;
      } else { d[i] = w; }
    }
  }
  return buf;
};

const makeSource = (ctx, pink = false) => {
  const src = ctx.createBufferSource();
  src.buffer = buildNoiseBuf(ctx, pink);
  src.loop = true;
  return src;
};

const startAmbient = (type, ctx) => {
  if (type === 'none') return null;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.setTargetAtTime(0.35, ctx.currentTime, 2);
  const nodes = [];

  const addLFO = (rate, depth, targetParam) => {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = rate; lg.gain.value = depth;
    lfo.connect(lg); lg.connect(targetParam);
    lfo.start(); nodes.push(lfo, lg);
  };

  switch (type) {
    case 'rain': {
      const src = makeSource(ctx, false);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=380; bp.Q.value=1.8;
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=200;
      const src2 = makeSource(ctx, false);
      const bp2 = ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.frequency.value=700; bp2.Q.value=3;
      const g2 = ctx.createGain(); g2.gain.value=0.15;
      src.connect(bp); bp.connect(hp); hp.connect(master);
      src2.connect(bp2); bp2.connect(g2); g2.connect(master);
      addLFO(1.8, 0.06, master.gain);
      src.start(); src2.start(); nodes.push(src, bp, hp, src2, bp2, g2);
      break;
    }
    case 'ocean': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
      addLFO(0.08, 0.22, master.gain);
      addLFO(0.13, 0.1, master.gain);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp);
      break;
    }
    case 'forest': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=750; bp.Q.value=0.6;
      master.gain.setTargetAtTime(0.14, ctx.currentTime, 2);
      addLFO(0.3, 0.04, master.gain);
      src.connect(bp); bp.connect(master); src.start(); nodes.push(src, bp);
      break;
    }
    case 'river': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=600; bp.Q.value=1.2;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1200;
      addLFO(0.6, 0.08, master.gain);
      addLFO(1.1, 0.05, master.gain);
      src.connect(bp); bp.connect(lp); lp.connect(master); src.start(); nodes.push(src, bp, lp);
      break;
    }
    case 'wind': {
      const src = makeSource(ctx, true);
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=400;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2000;
      master.gain.setTargetAtTime(0.2, ctx.currentTime, 2);
      addLFO(0.15, 0.18, master.gain);
      addLFO(0.4, 0.06, master.gain);
      src.connect(hp); hp.connect(lp); lp.connect(master); src.start(); nodes.push(src, hp, lp);
      break;
    }
    case 'fire': {
      const src = makeSource(ctx, false);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220;
      const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      lfo.type='sawtooth'; lfo.frequency.value=3.8; lg.gain.value=0.07;
      lfo.connect(lg); lg.connect(master.gain); lfo.start();
      master.gain.setTargetAtTime(0.22, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp, lfo, lg);
      break;
    }
    case 'space': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=100;
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type='sine'; osc.frequency.value=50; og.gain.value=0.06;
      osc.connect(og); og.connect(master); osc.start();
      master.gain.setTargetAtTime(0.18, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp, osc, og);
      break;
    }
    default: break;
  }

  return {
    fadeOut: () => {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      setTimeout(() => {
        nodes.forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch {} });
        try { master.disconnect(); } catch {}
      }, 2800);
    },
  };
};

// ── TTS ────────────────────────────────────────────────────────────────────────

const speakWebSpeech = (text, onEnd) => {
  if (!window.speechSynthesis) { onEnd?.(); return null; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'es-ES'; utt.rate = 0.78; utt.pitch = 0.92; utt.volume = 1;
  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('es') && v.localService) || voices.find(v => v.lang.startsWith('es'));
    if (v) utt.voice = v;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  };
  if (window.speechSynthesis.getVoices().length) trySpeak();
  else window.speechSynthesis.onvoiceschanged = trySpeak;
  return utt;
};

const decodeBase64Audio = async (ctx, base64) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return ctx.decodeAudioData(bytes.buffer);
};

const playAudioBuffer = (ctx, buffer, onEnd) => {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain(); g.gain.value = 1.0;
  src.connect(g); g.connect(ctx.destination);
  if (onEnd) src.onended = onEnd;
  src.start();
  return src;
};

// ── Breathing ──────────────────────────────────────────────────────────────────

const BREATH = [
  { label: 'Inhala',   secs: 4, scale: 1.38 },
  { label: 'Mantén',   secs: 2, scale: 1.38 },
  { label: 'Exhala',   secs: 4, scale: 1.0  },
  { label: 'Descansa', secs: 2, scale: 1.0  },
];
const BREATH_CYCLE = BREATH.reduce((s, b) => s + b.secs, 0);

const getBreathStep = (elapsed) => {
  const pos = elapsed % BREATH_CYCLE;
  let acc = 0;
  for (const step of BREATH) { acc += step.secs; if (pos < acc) return step; }
  return BREATH[0];
};

// ── Component ──────────────────────────────────────────────────────────────────

const RING_R    = 16;
const RING_CIRC = 2 * Math.PI * RING_R;

const Meditate = () => {
  const { user } = useAuth();

  // step: 'setup' | 'session' | 'complete'
  const [step, setStep]               = useState('setup');
  const [showThemes, setShowThemes]    = useState(false);
  const [themeMode, setThemeMode]      = useState('preset'); // 'preset' | 'custom'
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sound, setSound]             = useState('rain');
  const [duration, setDuration]       = useState(DURATIONS[1]);
  const [themeId, setThemeId]         = useState(null);
  const [customText, setCustomText]   = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [previewId, setPreviewId]     = useState(null);
  const [previewProgress, setPreviewProgress] = useState(0);

  const [todayCount, setTodayCount]   = useState(0);

  const [elapsed, setElapsed]         = useState(0);
  const [totalSecs, setTotalSecs]     = useState(0);
  const [phrase, setPhrase]           = useState('');
  const [phraseOn, setPhraseOn]       = useState(false);
  const [completionQuote, setCompletionQuote] = useState('');
  const [completedMeta, setCompletedMeta]     = useState(null);

  const audioCtxRef     = useRef(null);
  const ambientRef      = useRef(null);
  const previewCtxRef   = useRef(null);
  const previewRef      = useRef(null);
  const previewTimerRef = useRef(null);
  const previewProgRef  = useRef(null);
  const intervalRef     = useRef(null);
  const phrasesRef      = useRef([]);
  const timesRef        = useRef([]);
  const spokenRef       = useRef(new Set());
  const audioBuffsRef   = useRef([]);
  const ttsSrcRef       = useRef(null);

  const breathStep = step === 'session' ? getBreathStep(elapsed) : BREATH[0];

  useEffect(() => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    getDoc(doc(db, `users/${user.uid}/wellbeing`, 'data')).then(snap => {
      if (snap.exists()) setTodayCount((snap.data().meditations?.[todayStr] || []).length);
    });
  }, [user]);

  // ── Sound preview ──
  const startPreview = useCallback((id) => {
    if (previewRef.current) { previewRef.current.fadeOut(); previewRef.current = null; }
    if (previewCtxRef.current) { setTimeout(() => { try { previewCtxRef.current?.close(); } catch {} previewCtxRef.current = null; }, 3000); }
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);

    if (id === 'none') { setPreviewId(null); setPreviewProgress(0); return; }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume(); // required on iOS Safari — context starts suspended
    previewCtxRef.current = ctx;
    previewRef.current = startAmbient(id, ctx);
    setPreviewId(id);
    setPreviewProgress(0);

    let prog = 0;
    previewProgRef.current = setInterval(() => {
      prog += 1;
      setPreviewProgress(prog);
      if (prog >= 100) clearInterval(previewProgRef.current);
    }, 50);

    previewTimerRef.current = setTimeout(() => {
      previewRef.current?.fadeOut(); previewRef.current = null;
      setTimeout(() => { try { ctx.close(); } catch {} previewCtxRef.current = null; }, 3000);
      clearInterval(previewProgRef.current);
      setPreviewId(null);
      setPreviewProgress(0);
    }, 5000);
  }, []);

  const stopPreview = useCallback(() => {
    previewRef.current?.fadeOut(); previewRef.current = null;
    setTimeout(() => { try { previewCtxRef.current?.close(); } catch {} previewCtxRef.current = null; }, 3000);
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);
    setPreviewId(null);
    setPreviewProgress(0);
  }, []);

  // ── Show phrase ──
  const showPhrase = useCallback((text, buffer, ctx) => {
    if (ttsSrcRef.current) { try { ttsSrcRef.current.stop(); } catch {} ttsSrcRef.current = null; }
    setPhraseOn(false);
    setTimeout(() => {
      setPhrase(text);
      setPhraseOn(true);
      const onEnd = () => setTimeout(() => setPhraseOn(false), 1800);
      if (buffer && ctx) {
        ttsSrcRef.current = playAudioBuffer(ctx, buffer, onEnd);
      } else {
        speakWebSpeech(text, onEnd);
      }
    }, 350);
  }, []);

  // ── Stop session ──
  const stopSession = useCallback((completed = false) => {
    clearInterval(intervalRef.current);
    window.speechSynthesis?.cancel();
    if (ttsSrcRef.current) { try { ttsSrcRef.current.stop(); } catch {} ttsSrcRef.current = null; }
    ambientRef.current?.fadeOut(); ambientRef.current = null;
    if (audioCtxRef.current) {
      setTimeout(() => { try { audioCtxRef.current?.close(); } catch {} audioCtxRef.current = null; }, 3200);
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    if (!completed) {
      setStep('setup'); setShowThemes(false); setElapsed(0); setPhrase(''); setPhraseOn(false);
      spokenRef.current = new Set(); audioBuffsRef.current = [];
    }
  }, []);

  // ── Save meditation (only on natural completion) ──
  const saveMeditation = useCallback(async (themeLabel, durationMins, tid) => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    try {
      const ref = doc(db, `users/${user.uid}/wellbeing`, 'data');
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().meditations || {}) : {};
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cleaned = Object.fromEntries(
        Object.entries(existing).filter(([d]) => new Date(d) >= cutoff)
      );
      const todayMeds = cleaned[todayStr] || [];
      cleaned[todayStr] = [...todayMeds, { at: new Date().toISOString(), mins: durationMins, themeId: tid, themeLabel }];
      await setDoc(ref, { meditations: cleaned }, { merge: true });
      setTodayCount(c => c + 1);
    } catch { /* non-critical */ }
  }, [user]);

  // ── Begin session ──
  const beginSession = useCallback((phrases, secs, buffers, ctx, onComplete) => {
    phrasesRef.current    = phrases;
    timesRef.current      = phraseTimes(secs, phrases.length);
    spokenRef.current     = new Set();
    audioBuffsRef.current = buffers || [];

    // ctx already created + resumed synchronously in the user gesture handler
    audioCtxRef.current = ctx;
    ambientRef.current  = startAmbient(sound, ctx);

    setTotalSecs(secs); setElapsed(0); setStep('session');

    if (phrases.length) {
      const buf = audioBuffsRef.current[0] || null;
      setTimeout(() => { showPhrase(phrases[0], buf, ctx); spokenRef.current.add(0); }, 2800);
    }

    intervalRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        timesRef.current.forEach((t, i) => {
          if (i > 0 && !spokenRef.current.has(i) && next >= t) {
            spokenRef.current.add(i);
            showPhrase(phrasesRef.current[i], audioBuffsRef.current[i] || null, audioCtxRef.current);
          }
        });
        if (next >= secs) {
          clearInterval(intervalRef.current);
          setTimeout(() => {
            stopSession(true);
            onComplete?.();
            setCompletionQuote(COMPLETION_QUOTES[Math.floor(Math.random() * COMPLETION_QUOTES.length)]);
            setStep('complete');
          }, 500);
        }
        return next;
      });
    }, 1000);
  }, [sound, showPhrase, stopSession]);

  // ── Handle start ──
  const handleStart = async () => {
    const isCustom = themeMode === 'custom';
    if (!isCustom && !themeId) { toast.error('Selecciona una temática'); return; }
    if (isCustom && !customText.trim()) { toast.error('Escribe sobre qué quieres meditar'); return; }

    // Create and unlock AudioContext synchronously HERE, inside the user gesture,
    // before any await. iOS Safari suspends any context created after an await.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();

    // Declare as media playback so iOS uses media volume (not ringer switch)
    // and interrupts other audio (music/podcasts) correctly.
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Meditación guiada',
        artist: 'Evolve',
      });
      navigator.mediaSession.playbackState = 'playing';
    }

    setIsLoading(true);
    let rawPhrases = [];
    let themeLabel = 'Personalizado';
    const tid = isCustom ? 'custom' : themeId;

    try {
      let buffers;

      if (isCustom) {
        const count = duration.mins <= 3 ? 4 : duration.mins <= 5 ? 7 : 12;
        const txt = await callClaude(
          `You are an expert and compassionate meditation guide. Generate exactly ${count} short phrases for a ${duration.mins}-minute guided meditation session on: "${customText.trim()}". Each phrase is 1-2 sentences max. In English, second person singular, calming and progressive (opening → depth → closing). Reply ONLY with the phrases, one per line, no numbering or bullets.`,
          520,
        );
        rawPhrases = txt.split('\n').map(l => l.trim()).filter(Boolean).slice(0, count);

        // Custom: generate TTS via API (phrases are unique each time)
        buffers = await Promise.all(rawPhrases.map(async (text) => {
          try {
            const b64 = await ttsSpeak(text);
            return await decodeBase64Audio(ctx, b64);
          } catch { return null; }
        }));
      } else {
        const theme = findTheme(themeId);
        if (!theme) { toast.error('Selecciona una temática'); ctx.close(); setIsLoading(false); return; }
        const indices = selectPhraseIndices(theme.phrases, duration.mins);
        rawPhrases = indices.map(i => theme.phrases[i]);
        themeLabel = theme.label;

        // Predefined: fetch pre-generated static MP3s — no API cost
        buffers = await Promise.all(indices.map(async (origIndex) => {
          try {
            const res = await fetch(`/audio/${themeId}_${origIndex}.mp3`);
            if (!res.ok) throw new Error('not found');
            return await ctx.decodeAudioData(await res.arrayBuffer());
          } catch { return null; }
        }));
      }

      setIsLoading(false);
      setCompletedMeta({ mins: duration.mins, themeLabel });
      beginSession(rawPhrases, duration.secs, buffers, ctx, () => saveMeditation(themeLabel, duration.mins, tid));
    } catch {
      ctx.close();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      setIsLoading(false);
      toast.error('Error al iniciar la sesión');
    }
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);
    window.speechSynthesis?.cancel();
    try { audioCtxRef.current?.close(); } catch {}
    try { previewCtxRef.current?.close(); } catch {}
  }, []);

  const progress  = totalSecs ? elapsed / totalSecs : 0;
  const remaining = step === 'session' ? totalSecs - elapsed : duration.secs;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  // ── Active session ──────────────────────────────────────────────────────────
  if (step === 'session') {
    return (
      <div className="fixed inset-0 z-[100] meditation-bg flex flex-col items-center justify-center select-none">
        <div className="absolute left-0 right-0 h-0.5 bg-white/30" style={{ top: 'env(safe-area-inset-top)' }}>
          <div className="h-full bg-emerald-500/70 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
        <button
          onClick={() => stopSession(false)}
          className="absolute left-5 flex items-center gap-2 text-white/65 hover:text-white/95 transition-colors"
          style={{ top: 'calc(env(safe-area-inset-top) + 20px)' }}
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-base font-medium">Salir</span>
        </button>
        <p
          className="absolute right-5 text-white/50 text-base font-mono tracking-wider"
          style={{ top: 'calc(env(safe-area-inset-top) + 20px)' }}
        >{mm}:{ss}</p>

        <div className="flex flex-col items-center gap-10">
          <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
            <div className="absolute rounded-full transition-all ease-in-out" style={{ width: 280, height: 280, background: 'rgba(110,231,183,0.08)', transform: `scale(${breathStep.scale})`, transitionDuration: `${breathStep.secs * 1000}ms` }} />
            <div className="absolute rounded-full transition-all ease-in-out" style={{ width: 230, height: 230, background: 'rgba(110,231,183,0.12)', transform: `scale(${breathStep.scale})`, transitionDuration: `${breathStep.secs * 1000}ms`, transitionDelay: '60ms' }} />
            <div
              className="absolute rounded-full transition-all ease-in-out flex items-center justify-center"
              style={{
                width: 160, height: 160,
                background: 'radial-gradient(circle at 38% 32%, rgba(167,243,208,0.85), rgba(52,211,153,0.70))',
                border: '1px solid rgba(167,243,208,0.5)',
                boxShadow: '0 0 70px rgba(52,211,153,0.35), 0 0 120px rgba(52,211,153,0.15), inset 0 1px 0 rgba(255,255,255,0.4)',
                transform: `scale(${breathStep.scale})`,
                transitionDuration: `${breathStep.secs * 1000}ms`,
                transitionDelay: '30ms',
              }}
            >
              <Wind className="w-9 h-9 text-white/70" />
            </div>
          </div>

          <p className="text-white/75 text-lg font-light tracking-[0.3em] uppercase">
            {breathStep.label}
          </p>

          <div className="px-10 text-center transition-all duration-700" style={{ opacity: phraseOn ? 1 : 0, transform: phraseOn ? 'translateY(0)' : 'translateY(10px)', minHeight: 72 }}>
            <p className="text-white/65 text-[15px] font-light leading-relaxed italic">"{phrase}"</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Completion ──────────────────────────────────────────────────────────────
  if (step === 'complete') {
    return (
      <div className="fixed inset-0 z-[100] meditation-bg flex flex-col items-center justify-center px-8 select-none">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(167,243,208,0.9), rgba(52,211,153,0.75))', boxShadow: '0 0 60px rgba(52,211,153,0.4)' }}>
            <span className="text-3xl">🧘</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Meditación completada</h2>
            {completedMeta && (
              <p className="text-sm text-white/60 mt-1">{completedMeta.mins} min · {completedMeta.themeLabel}</p>
            )}
          </div>
          <div className="liquid-glass-panel rounded-2xl px-6 py-5">
            <p className="text-violet-900/80 text-[15px] font-light leading-relaxed italic">"{completionQuote}"</p>
          </div>
          <button
            onClick={() => {
              setStep('setup'); setShowThemes(false); setElapsed(0);
              setPhrase(''); setPhraseOn(false);
              spokenRef.current = new Set(); audioBuffsRef.current = [];
            }}
            className="btn-primary px-8 py-3 rounded-xl text-sm font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: 30 }}>Meditación</h1>
        {todayCount > 0 && (
          <div className="flex items-center gap-3 mt-3 px-4 py-3 rounded-2xl bg-violet-50/80 dark:bg-violet-900/20 border border-violet-200/70 dark:border-violet-800/50">
            <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0 text-lg">🧘</div>
            <div>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                {todayCount === 1 ? '1 sesión completada hoy' : `${todayCount} sesiones hoy`}
              </p>
              <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
                {todayCount >= 2 ? '¡Excelente práctica!' : 'Sigue construyendo el hábito'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── AV section (hidden when showThemes) ── */}
      <div style={{ display: showThemes ? 'none' : 'block' }} className="space-y-6">
        {/* Duration */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Duración</p>
          <div className="flex gap-2">
            {DURATIONS.map(d => (
              <button key={d.mins} onClick={() => setDuration(d)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  duration.mins === d.mins
                    ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sound */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Sonido ambiente</p>
          <div className="grid grid-cols-2 gap-2">
            {SOUNDS.map(s => {
              const isPreviewing  = previewId === s.id;
              const isSelected    = sound === s.id;
              const anyPreviewing = !!previewId;
              return (
                <div key={s.id} onClick={() => setSound(s.id)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSound(s.id)}
                  className={`relative rounded-2xl overflow-hidden transition-all border-2 cursor-pointer ${
                    isSelected ? 'border-emerald-400 ring-2 ring-emerald-300/50' : 'border-transparent'
                  }`}
                  style={{ height: 80 }}>
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} />
                  <div className="absolute inset-0 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2.5">
                      <s.Icon className="w-5 h-5 text-white/90" />
                      <span className="text-sm font-semibold text-white">{s.label}</span>
                    </div>
                    {s.id !== 'none' && (
                      <div className="relative w-9 h-9 flex-shrink-0">
                        {isPreviewing && (
                          <svg
                            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                            viewBox="0 0 36 36"
                          >
                            <circle cx="18" cy="18" r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r={RING_R} fill="none"
                              stroke="white" strokeWidth="2.5" strokeLinecap="round"
                              strokeDasharray={RING_CIRC}
                              strokeDashoffset={RING_CIRC - (previewProgress / 100) * RING_CIRC}
                            />
                          </svg>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); isPreviewing ? stopPreview() : startPreview(s.id); }}
                          disabled={anyPreviewing && !isPreviewing}
                          className="absolute inset-0 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition-colors disabled:opacity-40"
                        >
                          {isPreviewing
                            ? <Square className="w-3 h-3 text-white fill-white" />
                            : <Play  className="w-3 h-3 text-white fill-white" />
                          }
                        </button>
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white/50" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => { setShowThemes(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2"
        >
          Continuar →
        </button>
      </div>

      {/* ── Theme section (hidden when !showThemes) ── */}
      <div style={{ display: showThemes ? 'block' : 'none' }} className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowThemes(false)} className="p-1 text-gray-400 hover:text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Escoge la temática</p>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          <button
            onClick={() => { setThemeMode('preset'); setThemeId(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              themeMode === 'preset'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Prediseñadas
          </button>
          <button
            onClick={() => { setThemeMode('custom'); setThemeId(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              themeMode === 'custom'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Personalizada
          </button>
        </div>

        {themeMode === 'preset' && (
          <div className="space-y-3">
            {/* Group grid */}
            <div className="grid grid-cols-2 gap-2">
              {THEME_GROUPS.map(group => (
                <button
                  key={group.id}
                  onClick={() => { setSelectedGroup(g => g === group.id ? null : group.id); setThemeId(null); }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    selectedGroup === group.id
                      ? 'border-violet-400 bg-violet-50/70 dark:bg-violet-900/20 opacity-100'
                      : selectedGroup
                        ? 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 opacity-40'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                  }`}
                >
                  <span className="text-2xl block mb-1">{group.emoji}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-snug">{group.label}</span>
                </button>
              ))}
            </div>

            {/* Sub-themes */}
            {selectedGroup && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Elige un tema</p>
                {THEME_GROUPS.find(g => g.id === selectedGroup)?.themes.map(t => (
                  <button key={t.id} onClick={() => setThemeId(t.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      themeId === t.id
                        ? 'border-violet-400 bg-violet-50/60 dark:bg-violet-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                    }`}>
                    <span className={`text-sm font-medium flex-1 ${themeId === t.id ? 'text-violet-800 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>{t.label}</span>
                    {themeId === t.id && <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {themeMode === 'custom' && (
          <textarea
            className="input-field resize-none w-full"
            rows={4}
            placeholder="Ej. Quiero meditar sobre una discusión que tuve con mi pareja acerca de..."
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            autoFocus
          />
        )}

        <div className="px-4 py-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-center space-y-1">
          <p className="text-2xl">🎧</p>
          <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-200">La voz guía está en inglés</p>
          <p className="text-[13px] text-amber-600 dark:text-amber-400 italic">"Para una experiencia de audio más natural y relajante"</p>
        </div>

        <button
          onClick={handleStart}
          disabled={isLoading || (themeMode === 'preset' && !themeId) || (themeMode === 'custom' && !customText.trim())}
          className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50 sticky bottom-4"
        >
          {isLoading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparando sesión...</>
            : <><Wind className="w-5 h-5" /> Comenzar meditación</>
          }
        </button>
      </div>
    </div>
  );
};

export default Meditate;
