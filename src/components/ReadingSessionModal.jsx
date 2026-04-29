import { useState, useEffect, useRef } from 'react';
import { X, Play, Square, BookOpen, Check, Clock } from 'lucide-react';
import { CloudRain, Waves, TreePine, Flame, Music2, VolumeX, Wind, Droplets } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { collection, addDoc } from 'firebase/firestore';
import toast from '../utils/toast';

const THEME_HEX = { blue: '#3b82f6', purple: '#8b5cf6', orange: '#f97316', teal: '#0d9488' };

const SOUNDS = [
  { id: 'rain',    label: 'Lluvia',   Icon: CloudRain },
  { id: 'ocean',   label: 'Océano',   Icon: Waves     },
  { id: 'forest',  label: 'Bosque',   Icon: TreePine  },
  { id: 'river',   label: 'Río',      Icon: Droplets  },
  { id: 'wind',    label: 'Viento',   Icon: Wind      },
  { id: 'fire',    label: 'Fogata',   Icon: Flame     },
  { id: 'cuencos', label: 'Cuencos',  Icon: Music2    },
  { id: 'none',    label: 'Silencio', Icon: VolumeX   },
];

const TIMER_STEPS = [5,10,15,20,25,30,35,40,45,50,55,60];

// ── Web Audio ambient ─────────────────────────────────────────────────────────

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
        try { master.disconnect(); } catch {};
      }, 2800);
    },
  };
};

// ── Timer clock picker ────────────────────────────────────────────────────────

const SIZE = 220;
const CX = SIZE / 2;
const RING_R = 82;

const ClockPicker = ({ value, onChange, themeHex }) => {
  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      {/* Background circle track */}
      <svg width={SIZE} height={SIZE} className="absolute inset-0">
        <circle cx={CX} cy={CX} r={RING_R} fill="none" stroke="currentColor"
          className="text-gray-100 dark:text-gray-700" strokeWidth="2" />
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-4xl font-bold text-gray-900 dark:text-gray-100 leading-none" style={{ color: themeHex }}>
          {value}
        </span>
        <span className="text-sm text-gray-400 dark:text-gray-500 mt-1">min</span>
      </div>

      {/* 12 touch targets */}
      {TIMER_STEPS.map((mins, i) => {
        const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
        const x = CX + RING_R * Math.cos(angle);
        const y = CX + RING_R * Math.sin(angle);
        const selected = value === mins;
        return (
          <button
            key={mins}
            onClick={() => onChange(mins)}
            className="absolute flex items-center justify-center rounded-full transition-all"
            style={{
              width: 34,
              height: 34,
              left: x - 17,
              top: y - 17,
              backgroundColor: selected ? themeHex : undefined,
              border: selected ? 'none' : undefined,
            }}
          >
            <span
              className={`text-xs font-semibold ${selected ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {mins}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ── Countdown ring ────────────────────────────────────────────────────────────

const RING_RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const CountdownRing = ({ totalSecs, remainingSecs, themeHex, book }) => {
  const progress = remainingSecs / totalSecs;
  const offset = CIRCUMFERENCE * (1 - progress);
  const mins = Math.floor(remainingSecs / 60);
  const secs = remainingSecs % 60;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: 200, height: 200 }}>
        <svg width={200} height={200} className="rotate-[-90deg]">
          <circle cx={100} cy={100} r={RING_RADIUS} fill="none"
            stroke="currentColor" strokeWidth="6"
            className="text-gray-100 dark:text-gray-700" />
          <circle cx={100} cy={100} r={RING_RADIUS} fill="none"
            stroke={themeHex} strokeWidth="6"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
          </span>
          {book && (
            <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center px-4 leading-tight max-w-[140px]">
              {book.title}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ReadingSessionModal = ({ onClose, readingBooks }) => {
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const themeHex = THEME_HEX[colorTheme] ?? '#3b82f6';

  const [view, setView] = useState('setup'); // setup | active | done
  const [selectedMins, setSelectedMins] = useState(20);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedSound, setSelectedSound] = useState('none');

  const [remainingSecs, setRemainingSecs] = useState(0);
  const [elapsedMins, setElapsedMins] = useState(0);

  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientRef = useRef(null);

  const stopAmbient = () => {
    ambientRef.current?.fadeOut();
    ambientRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      stopAmbient();
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  const handleStart = () => {
    const totalSecs = selectedMins * 60;
    setRemainingSecs(totalSecs);
    setView('active');

    // Start ambient audio
    if (selectedSound !== 'none') {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        ambientRef.current = startAmbient(selectedSound, ctx);
      } catch {}
    }

    // Start countdown
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = totalSecs - elapsed;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        const actualMins = Math.round(elapsed / 60) || selectedMins;
        handleComplete(actualMins);
      } else {
        setRemainingSecs(remaining);
      }
    }, 1000);
  };

  const handleEndEarly = () => {
    clearInterval(timerRef.current);
    const totalSecs = selectedMins * 60;
    const done = totalSecs - remainingSecs;
    const actualMins = Math.max(1, Math.round(done / 60));
    handleComplete(actualMins);
  };

  const handleComplete = async (mins) => {
    stopAmbient();
    try { audioCtxRef.current?.close(); } catch {}
    setElapsedMins(mins);
    setView('done');

    // Save to Firestore
    try {
      const now = new Date();
      await addDoc(collection(db, `users/${user.uid}/readingSessions`), {
        minutes: mins,
        bookId: selectedBook?.id || null,
        bookTitle: selectedBook?.title || null,
        date: now.toISOString().split('T')[0],
        completedAt: now.toISOString(),
      });
    } catch (err) { console.error('Error saving session', err); }
  };

  const handleActiveSound = (soundId) => {
    ambientRef.current?.fadeOut();
    ambientRef.current = null;
    setSelectedSound(soundId);
    if (soundId === 'none') return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      ambientRef.current = startAmbient(soundId, audioCtxRef.current);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-20">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => {
        if (view === 'active') return;
        onClose();
      }} />
      <div className="relative liquid-glass-panel rounded-3xl w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" style={{ color: themeHex }} />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {view === 'setup' ? 'Sesión de lectura' : view === 'active' ? 'Leyendo...' : '¡Sesión completada!'}
            </h2>
          </div>
          {view !== 'active' && (
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-6">

          {/* ── SETUP ── */}
          {view === 'setup' && (
            <div className="space-y-6 pt-3">

              {/* Timer picker */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 text-center">
                  Duración
                </p>
                <ClockPicker value={selectedMins} onChange={setSelectedMins} themeHex={themeHex} />
              </div>

              {/* Book selector */}
              {readingBooks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    ¿Qué estás leyendo? <span className="font-normal normal-case">(opcional)</span>
                  </p>
                  <div className="space-y-2">
                    {readingBooks.map(book => (
                      <button
                        key={book.id}
                        onClick={() => setSelectedBook(selectedBook?.id === book.id ? null : book)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                          selectedBook?.id === book.id
                            ? 'border-transparent'
                            : 'border-gray-100 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80'
                        }`}
                        style={selectedBook?.id === book.id ? {
                          backgroundColor: themeHex + '15',
                          borderColor: themeHex + '60',
                        } : undefined}
                      >
                        {book.coverUrl ? (
                          <img src={book.coverUrl} alt="" className="w-8 h-12 object-cover rounded-lg flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-12 rounded-lg flex-shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            <span className="text-sm font-bold text-gray-400">{book.title.charAt(0)}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{book.title}</p>
                          {book.author && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{book.author}</p>}
                        </div>
                        {selectedBook?.id === book.id && (
                          <Check className="w-4 h-4 flex-shrink-0" style={{ color: themeHex }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Start */}
              <button
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-semibold text-base transition-opacity active:opacity-80"
                style={{ backgroundColor: themeHex }}
              >
                <Play className="w-5 h-5" fill="currentColor" />
                Iniciar — {selectedMins} min
              </button>
            </div>
          )}

          {/* ── ACTIVE ── */}
          {view === 'active' && (
            <div className="flex flex-col items-center gap-5 pt-4">
              <CountdownRing
                totalSecs={selectedMins * 60}
                remainingSecs={remainingSecs}
                themeHex={themeHex}
                book={selectedBook}
              />

              {/* Sound picker */}
              <div className="w-full">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 text-center">
                  Sonido de fondo
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {SOUNDS.map(({ id, label, Icon }) => {
                    const active = selectedSound === id;
                    return (
                      <button
                        key={id}
                        onClick={() => handleActiveSound(id)}
                        className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-colors ${
                          active ? 'border-transparent' : 'border-gray-100 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                        }`}
                        style={active ? { backgroundColor: themeHex + '18', borderColor: themeHex + '50' } : undefined}
                      >
                        <Icon className="w-4 h-4" style={active ? { color: themeHex } : { color: '#9ca3af' }} />
                        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleEndEarly}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                <Square className="w-4 h-4" />
                Terminar sesión
              </button>
            </div>
          )}

          {/* ── DONE ── */}
          {view === 'done' && (
            <div className="flex flex-col items-center gap-5 pt-4 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: themeHex + '20' }}>
                <Check className="w-8 h-8" style={{ color: themeHex }} />
              </div>

              <div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">{elapsedMins} min</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">de tiempo de lectura registrados</p>
              </div>

              {selectedBook && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl"
                  style={{ backgroundColor: themeHex + '12' }}>
                  {selectedBook.coverUrl ? (
                    <img src={selectedBook.coverUrl} alt="" className="w-8 h-11 object-cover rounded" />
                  ) : (
                    <BookOpen className="w-5 h-5" style={{ color: themeHex }} />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedBook.title}</p>
                    {selectedBook.author && <p className="text-xs text-gray-400">{selectedBook.author}</p>}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-3.5 rounded-2xl text-white font-semibold text-base"
                style={{ backgroundColor: themeHex }}
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReadingSessionModal;
