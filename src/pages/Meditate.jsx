import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  ChevronLeft, Loader2, Play, Square,
  CloudRain, Waves, TreePine, Flame, Music2, VolumeX, Wind, Droplets,
  GripVertical, X, Sparkles, Heart,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  { id: 'rain',    label: 'Lluvia',   Icon: CloudRain, from: '#5a7fa0', to: '#8ab0c8' },
  { id: 'ocean',   label: 'Océano',   Icon: Waves,     from: '#1a6080', to: '#3a9aba' },
  { id: 'forest',  label: 'Bosque',   Icon: TreePine,  from: '#2a6040', to: '#4a9a68' },
  { id: 'river',   label: 'Río',      Icon: Droplets,  from: '#2e7090', to: '#5aa8c8' },
  { id: 'wind',    label: 'Viento',   Icon: Wind,      from: '#607890', to: '#90aac0' },
  { id: 'fire',    label: 'Fogata',   Icon: Flame,     from: '#a03010', to: '#d86030' },
  { id: 'cuencos', label: 'Cuencos',  Icon: Music2,    from: '#6b4c20', to: '#c49a50' },
  { id: 'none',    label: 'Silencio', Icon: VolumeX,   from: '#4a5060', to: '#7a8090' },
];

const DURATIONS = [
  { mins: 3,  label: '3 min',  secs: 180 },
  { mins: 5,  label: '5 min',  secs: 300 },
  { mins: 10, label: '10 min', secs: 600 },
];

const GROUP_COLORS = {
  'trabajo':     { from: '#1d4ed8', to: '#3b82f6' },
  'relaciones':  { from: '#9d174d', to: '#db2777' },
  'situaciones': { from: '#4b5563', to: '#6b7280' },
  'emociones':   { from: '#5b21b6', to: '#8b5cf6' },
  'manana':      { from: '#b45309', to: '#f59e0b' },
  'noche':       { from: '#1e3a5f', to: '#3b82f6' },
  'cuerpo':      { from: '#0f766e', to: '#2dd4bf' },
  'movimiento':  { from: '#065f46', to: '#10b981' },
  'pausa':       { from: '#7c3aed', to: '#a78bfa' },
  'estoicismo':  { from: '#78350f', to: '#d97706' },
};

const getThemeColor = (themeId) => {
  for (const g of THEME_GROUPS) {
    if (g.themes.some(t => t.id === themeId)) {
      return GROUP_COLORS[g.id] || { from: '#374151', to: '#6b7280' };
    }
  }
  return { from: '#374151', to: '#6b7280' };
};

// ── Phrase selection ───────────────────────────────────────────────────────────

const selectPhraseIndices = (phrases, durationMins) => {
  const count = durationMins <= 3 ? 4 : durationMins <= 5 ? 7 : 12;
  if (phrases.length <= count) return phrases.map((_, i) => i);
  const step = (phrases.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
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
    case 'cuencos': {
      const freqs = [432, 528, 720];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        const lfo = ctx.createOscillator(); const lg = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        og.gain.value = 0.10;
        lfo.type = 'sine'; lfo.frequency.value = 0.25 + i * 0.08; lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(og.gain);
        osc.connect(og); og.connect(master);
        osc.start(); lfo.start(); nodes.push(osc, og, lfo, lg);
      });
      master.gain.setTargetAtTime(0.28, ctx.currentTime, 3);
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

// ── Ring constants ─────────────────────────────────────────────────────────────

const RING_R    = 16;
const RING_CIRC = 2 * Math.PI * RING_R;

// ── SortableGroup ──────────────────────────────────────────────────────────────

const ThemeCard = ({ theme, from, to, isFavorite, onPlay, onToggleFavorite }) => (
  <div
    className="flex-shrink-0 w-36 rounded-2xl relative select-none"
    style={{ background: `linear-gradient(140deg, ${from}, ${to})`, minHeight: 88 }}
  >
    <div className="p-3 pt-3 pr-10">
      <p className="text-[13px] font-semibold text-white leading-snug">{theme.label}</p>
    </div>
    <button
      onClick={e => { e.stopPropagation(); onToggleFavorite(theme.id); }}
      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center transition-colors"
    >
      <Heart
        className="w-3.5 h-3.5 transition-all"
        style={{ color: isFavorite ? '#fca5a5' : 'rgba(255,255,255,0.45)', fill: isFavorite ? '#fca5a5' : 'none' }}
      />
    </button>
    <button
      onClick={() => onPlay(theme.id, theme.label)}
      className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 active:bg-white/45 flex items-center justify-center transition-colors"
    >
      <Play className="w-3.5 h-3.5 text-white fill-white" />
    </button>
  </div>
);

const SortableGroup = ({ group, onPlay, favorites, onToggleFavorite }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const { from, to } = GROUP_COLORS[group.id] || { from: '#374151', to: '#6b7280' };

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          {...attributes} {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <span className="text-base">{group.emoji}</span>
        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{group.label}</span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {group.themes.map(t => (
          <ThemeCard
            key={t.id}
            theme={t}
            from={from}
            to={to}
            isFavorite={favorites.includes(t.id)}
            onPlay={onPlay}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────────

const Meditate = () => {
  const { user } = useAuth();

  // step: 'setup' | 'session' | 'complete'
  const [step, setStep] = useState('setup');

  // Persistent preferences (localStorage)
  const [sound, setSound] = useState(() => localStorage.getItem('meditationSound') || 'rain');
  const [groupOrder, setGroupOrder] = useState(() => {
    try {
      const s = localStorage.getItem('meditationGroupOrder');
      const stored = s ? JSON.parse(s) : null;
      const current = THEME_GROUPS.map(g => g.id);
      const valid = stored?.length === current.length && stored.every(id => current.includes(id));
      return valid ? stored : current;
    } catch { return THEME_GROUPS.map(g => g.id); }
  });
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('meditationFavorites') || '[]'); }
    catch { return []; }
  });

  // Modals
  const [soundModal, setSoundModal]       = useState(false);
  const [customModal, setCustomModal]     = useState(false);
  const [durationModal, setDurationModal] = useState(null); // { themeId, themeLabel }
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[1]);

  // Custom meditation
  const [customText, setCustomText] = useState('');

  // Session state
  const [isLoading, setIsLoading]   = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [todayMins, setTodayMins]   = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const [totalSecs, setTotalSecs]   = useState(0);
  const [phrase, setPhrase]         = useState('');
  const [phraseOn, setPhraseOn]     = useState(false);
  const [completionQuote, setCompletionQuote] = useState('');
  const [completedMeta, setCompletedMeta]     = useState(null);

  // Sound preview
  const [previewId, setPreviewId]           = useState(null);
  const [previewProgress, setPreviewProgress] = useState(0);

  // Refs
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
  const orderedGroups = groupOrder
    .map(id => THEME_GROUPS.find(g => g.id === id))
    .filter(Boolean);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setGroupOrder(prev => {
      const oldIdx = prev.indexOf(active.id);
      const newIdx = prev.indexOf(over.id);
      const next = arrayMove(prev, oldIdx, newIdx);
      localStorage.setItem('meditationGroupOrder', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSoundSelect = useCallback((id) => {
    setSound(id);
    localStorage.setItem('meditationSound', id);
  }, []);

  const toggleFavorite = useCallback((themeId) => {
    setFavorites(prev => {
      const next = prev.includes(themeId) ? prev.filter(id => id !== themeId) : [...prev, themeId];
      localStorage.setItem('meditationFavorites', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    getDoc(doc(db, `users/${user.uid}/wellbeing`, 'data')).then(snap => {
      if (snap.exists()) {
        const meds = snap.data().meditations?.[todayStr] || [];
        setTodayCount(meds.length);
        setTodayMins(meds.reduce((s, m) => s + (m.mins || 0), 0));
      }
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
    ctx.resume();
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
      setStep('setup'); setElapsed(0); setPhrase(''); setPhraseOn(false);
      spokenRef.current = new Set(); audioBuffsRef.current = [];
    }
  }, []);

  // ── Save meditation ──
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
      setTodayMins(m => m + durationMins);
    } catch { /* non-critical */ }
  }, [user]);

  // ── Begin session ──
  const beginSession = useCallback((phrases, secs, buffers, ctx, onComplete) => {
    phrasesRef.current    = phrases;
    timesRef.current      = phraseTimes(secs, phrases.length);
    spokenRef.current     = new Set();
    audioBuffsRef.current = buffers || [];

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
  // Called directly from "Comenzar" button onClick — AudioContext must be created
  // synchronously here before any await (iOS Safari requirement).
  const handleStart = async (startThemeId, startDuration) => {
    const isCustom = startThemeId === 'custom';
    if (isCustom && !customText.trim()) { toast.error('Escribe sobre qué quieres meditar'); return; }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();

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
    const tid = isCustom ? 'custom' : startThemeId;

    try {
      let buffers;

      if (isCustom) {
        const count = startDuration.mins <= 3 ? 4 : startDuration.mins <= 5 ? 7 : 12;
        const txt = await callClaude(
          `You are an expert and compassionate meditation guide. Generate exactly ${count} short phrases for a ${startDuration.mins}-minute guided meditation session on: "${customText.trim()}". Each phrase is 1-2 sentences max. In English, second person singular, calming and progressive (opening → depth → closing). Reply ONLY with the phrases, one per line, no numbering or bullets.`,
          520,
        );
        rawPhrases = txt.split('\n').map(l => l.trim()).filter(Boolean).slice(0, count);

        buffers = await Promise.all(rawPhrases.map(async (text) => {
          try {
            const b64 = await ttsSpeak(text);
            return await decodeBase64Audio(ctx, b64);
          } catch { return null; }
        }));
      } else {
        const theme = findTheme(startThemeId);
        if (!theme) { toast.error('Selecciona una temática'); ctx.close(); setIsLoading(false); return; }
        const indices = selectPhraseIndices(theme.phrases, startDuration.mins);
        rawPhrases = indices.map(i => theme.phrases[i]);
        themeLabel = theme.label;

        buffers = await Promise.all(indices.map(async (origIndex) => {
          try {
            const res = await fetch(`/audio/${startThemeId}_${origIndex}.mp3`);
            if (!res.ok) throw new Error('not found');
            return await ctx.decodeAudioData(await res.arrayBuffer());
          } catch { return null; }
        }));
      }

      setIsLoading(false);
      setDurationModal(null);
      setCustomModal(false);
      setCompletedMeta({ mins: startDuration.mins, themeLabel });
      beginSession(rawPhrases, startDuration.secs, buffers, ctx, () => saveMeditation(themeLabel, startDuration.mins, tid));
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
  const remaining = step === 'session' ? totalSecs - elapsed : selectedDuration.secs;
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
              setStep('setup'); setElapsed(0);
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
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: 30 }}>Meditación</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCustomModal(true)}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 transition-colors"
            title="Meditación personalizada"
          >
            <Sparkles className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => setSoundModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 transition-colors"
          >
            <Music2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {SOUNDS.find(s => s.id === sound)?.label ?? 'Sonido'}
            </span>
          </button>
        </div>
      </div>

      {/* Today count */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary-50 dark:bg-gray-800/60 border border-primary-200 dark:border-gray-700">
        <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-lg">🧘</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary-600 dark:text-primary-400">
            {todayCount === 0
              ? 'Sin sesiones hoy'
              : todayCount === 1
              ? '1 sesión completada hoy'
              : `${todayCount} sesiones hoy`}
          </p>
          <p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">
            {todayCount === 0
              ? 'Empieza tu primera sesión del día'
              : `${todayMins} min meditados · ${todayCount >= 3 ? '¡Excelente práctica!' : 'Sigue construyendo el hábito'}`}
          </p>
        </div>
      </div>

      {/* Favorites */}
      {favorites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-0.5">
            ❤️ Favoritos
          </p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {favorites.map(themeId => {
              const theme = findTheme(themeId);
              if (!theme) return null;
              const { from, to } = getThemeColor(themeId);
              return (
                <ThemeCard
                  key={themeId}
                  theme={theme}
                  from={from}
                  to={to}
                  isFavorite
                  onPlay={(id, label) => setDurationModal({ themeId: id, themeLabel: label })}
                  onToggleFavorite={toggleFavorite}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Groups with DnD */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {orderedGroups.map(group => (
              <SortableGroup
                key={group.id}
                group={group}
                onPlay={(themeId, themeLabel) => setDurationModal({ themeId, themeLabel })}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* ── Custom meditation modal ── */}
      {customModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 liquid-glass-overlay"
          onClick={() => { if (!isLoading) setCustomModal(false); }}
        >
          <div className="liquid-glass-panel rounded-3xl p-6 space-y-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Meditación personalizada</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">¿Sobre qué quieres meditar?</p>
                </div>
                <button
                  onClick={() => { if (!isLoading) setCustomModal(false); }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <textarea
                className="input-field resize-none w-full text-sm"
                rows={4}
                placeholder="Ej. Tuve una discusión con mi pareja y quiero calmarme..."
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                autoFocus
              />

              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Duración</p>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d.mins}
                      onClick={() => setSelectedDuration(d)}
                      className={`py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                        selectedDuration.mins === d.mins
                          ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                          : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleStart('custom', selectedDuration)}
                disabled={isLoading || !customText.trim()}
                className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparando sesión...</>
                  : <><Wind className="w-5 h-5" /> Comenzar</>
                }
              </button>
          </div>
        </div>
      )}

      {/* ── Duration picker modal ── */}
      {durationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 liquid-glass-overlay"
          onClick={() => { if (!isLoading) setDurationModal(null); }}
        >
          <div className="liquid-glass-panel rounded-3xl p-6 space-y-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Duración</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{durationModal.themeLabel}</p>
                </div>
                <button
                  onClick={() => { if (!isLoading) setDurationModal(null); }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 mt-0.5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.mins}
                    onClick={() => setSelectedDuration(d)}
                    className={`py-4 rounded-xl text-sm font-semibold transition-all border-2 ${
                      selectedDuration.mins === d.mins
                        ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleStart(durationModal.themeId, selectedDuration)}
                disabled={isLoading}
                className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparando sesión...</>
                  : <><Wind className="w-5 h-5" /> Comenzar</>
                }
              </button>
          </div>
        </div>
      )}

      {/* ── Sound preference modal ── */}
      {soundModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 liquid-glass-overlay"
          onClick={() => { stopPreview(); setSoundModal(false); }}
        >
          <div className="liquid-glass-panel rounded-3xl p-6 space-y-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Sonido ambiente</h3>
                <button
                  onClick={() => { stopPreview(); setSoundModal(false); }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {SOUNDS.map(s => {
                  const isPreviewing  = previewId === s.id;
                  const isSelected    = sound === s.id;
                  const anyPreviewing = !!previewId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSoundSelect(s.id)}
                      role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && handleSoundSelect(s.id)}
                      className={`relative rounded-2xl overflow-hidden transition-all border-2 cursor-pointer ${
                        isSelected ? 'border-emerald-400 ring-2 ring-emerald-300/50' : 'border-transparent'
                      }`}
                      style={{ height: 80 }}
                    >
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
                                : <Play   className="w-3 h-3 text-white fill-white" />
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
        </div>
      )}
    </div>
  );
};

export default Meditate;
