import { useState, useEffect, useRef } from 'react';
import { X, Play, Square, BookOpen, Check } from 'lucide-react';
import { CloudRain, Waves, TreePine, Flame, Music2, VolumeX, Wind, Droplets } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

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
    const lfo = ctx.createOscillator(); const lg = ctx.createGain();
    lfo.frequency.value = rate; lg.gain.value = depth;
    lfo.connect(lg); lg.connect(targetParam); lfo.start(); nodes.push(lfo, lg);
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
      addLFO(1.8, 0.06, master.gain); src.start(); src2.start(); nodes.push(src,bp,hp,src2,bp2,g2); break;
    }
    case 'ocean': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
      addLFO(0.08, 0.22, master.gain); addLFO(0.13, 0.1, master.gain);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp); break;
    }
    case 'forest': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=750; bp.Q.value=0.6;
      master.gain.setTargetAtTime(0.14, ctx.currentTime, 2); addLFO(0.3, 0.04, master.gain);
      src.connect(bp); bp.connect(master); src.start(); nodes.push(src, bp); break;
    }
    case 'river': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=600; bp.Q.value=1.2;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1200;
      addLFO(0.6, 0.08, master.gain); addLFO(1.1, 0.05, master.gain);
      src.connect(bp); bp.connect(lp); lp.connect(master); src.start(); nodes.push(src,bp,lp); break;
    }
    case 'wind': {
      const src = makeSource(ctx, true);
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=400;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2000;
      master.gain.setTargetAtTime(0.2, ctx.currentTime, 2);
      addLFO(0.15, 0.18, master.gain); addLFO(0.4, 0.06, master.gain);
      src.connect(hp); hp.connect(lp); lp.connect(master); src.start(); nodes.push(src,hp,lp); break;
    }
    case 'fire': {
      const src = makeSource(ctx, false);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220;
      const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      lfo.type='sawtooth'; lfo.frequency.value=3.8; lg.gain.value=0.07;
      lfo.connect(lg); lg.connect(master.gain); lfo.start();
      master.gain.setTargetAtTime(0.22, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src,lp,lfo,lg); break;
    }
    case 'cuencos': {
      [432,528,720].forEach((freq,i) => {
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        const lfo = ctx.createOscillator(); const lg = ctx.createGain();
        osc.type='sine'; osc.frequency.value=freq; og.gain.value=0.10;
        lfo.type='sine'; lfo.frequency.value=0.25+i*0.08; lg.gain.value=0.05;
        lfo.connect(lg); lg.connect(og.gain); osc.connect(og); og.connect(master);
        osc.start(); lfo.start(); nodes.push(osc,og,lfo,lg);
      });
      master.gain.setTargetAtTime(0.28, ctx.currentTime, 3); break;
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

// ── Clock picker ──────────────────────────────────────────────────────────────

const SIZE = 240, CX = 120, RING_R = 90;

const ClockPicker = ({ value, onChange }) => (
  <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
    <svg width={SIZE} height={SIZE} className="absolute inset-0">
      <circle cx={CX} cy={CX} r={RING_R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <span className="text-5xl font-bold text-white leading-none">{value}</span>
      <span className="text-sm text-white/50 mt-1">min</span>
    </div>
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
            width: 36, height: 36,
            left: x - 18, top: y - 18,
            backgroundColor: selected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.1)',
          }}
        >
          <span className={`text-xs font-bold ${selected ? 'text-stone-900' : 'text-white/70'}`}>
            {mins}
          </span>
        </button>
      );
    })}
  </div>
);

// ── Countdown ring ────────────────────────────────────────────────────────────

const CIRC_R = 100, CIRCUMFERENCE = 2 * Math.PI * CIRC_R;

const CountdownRing = ({ totalSecs, remainingSecs, book }) => {
  const progress = remainingSecs / totalSecs;
  const offset = CIRCUMFERENCE * (1 - progress);
  const mins = Math.floor(remainingSecs / 60);
  const secs = remainingSecs % 60;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
      <svg width={240} height={240} className="rotate-[-90deg] absolute inset-0">
        <circle cx={120} cy={120} r={CIRC_R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle cx={120} cy={120} r={CIRC_R} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="6"
          strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-5xl font-bold text-white tabular-nums leading-none">
          {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
        </span>
        {book && (
          <span className="text-sm text-white/60 mt-2 text-center px-8 leading-tight">
            {book.title}
          </span>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ReadingSessionModal = ({ onClose, onSessionComplete, readingBooks }) => {
  const { colorTheme } = useTheme();
  const themeHex = THEME_HEX[colorTheme] ?? '#3b82f6';

  const [view, setView] = useState('setup');
  const [selectedMins, setSelectedMins] = useState(20);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedSound, setSelectedSound] = useState('none');
  const [remainingSecs, setRemainingSecs] = useState(0);
  const [elapsedMins, setElapsedMins] = useState(0);

  const timerRef   = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientRef  = useRef(null);

  const stopAmbient = () => { ambientRef.current?.fadeOut(); ambientRef.current = null; };

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      stopAmbient();
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  const handleStart = () => {
    setRemainingSecs(selectedMins * 60);
    setView('active');
    const startedAt = Date.now();
    const totalSecs = selectedMins * 60;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = totalSecs - elapsed;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        finishSession(Math.round(elapsed / 60) || selectedMins);
      } else {
        setRemainingSecs(remaining);
      }
    }, 1000);
  };

  const handleEndEarly = () => {
    clearInterval(timerRef.current);
    const done = selectedMins * 60 - remainingSecs;
    finishSession(Math.max(1, Math.round(done / 60)));
  };

  const finishSession = (mins) => {
    stopAmbient();
    try { audioCtxRef.current?.close(); } catch {}
    setElapsedMins(mins);
    setView('done');
    onSessionComplete?.(mins);
  };

  const handleActiveSound = (soundId) => {
    stopAmbient();
    setSelectedSound(soundId);
    if (soundId === 'none') return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      ambientRef.current = startAmbient(soundId, audioCtxRef.current);
    } catch {}
  };

  const bg = 'linear-gradient(160deg, #120b04 0%, #231407 50%, #120b04 100%)';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col select-none" style={{ background: bg }}>

      {/* ── SETUP ── */}
      {view === 'setup' && (
        <>
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-safe pt-6 pb-4 flex-shrink-0">
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white/80 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-white/70 uppercase tracking-wider">Sesión de lectura</span>
            <div className="w-9" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-8">
            {/* Timer */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Duración</p>
              <ClockPicker value={selectedMins} onChange={setSelectedMins} />
            </div>

            {/* Book selector */}
            {readingBooks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                  ¿Qué estás leyendo? <span className="font-normal normal-case opacity-60">(opcional)</span>
                </p>
                <div className="space-y-2">
                  {readingBooks.map(book => {
                    const sel = selectedBook?.id === book.id;
                    return (
                      <button key={book.id}
                        onClick={() => setSelectedBook(sel ? null : book)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-colors text-left"
                        style={{
                          backgroundColor: sel ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                          borderColor: sel ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        {book.coverUrl
                          ? <img src={book.coverUrl} alt="" className="w-8 h-12 object-cover rounded-lg flex-shrink-0" />
                          : <div className="w-8 h-12 rounded-lg flex-shrink-0 bg-white/10 flex items-center justify-center">
                              <span className="text-sm font-bold text-white/50">{book.title.charAt(0)}</span>
                            </div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white leading-tight">{book.title}</p>
                          {book.author && <p className="text-xs text-white/50 mt-0.5">{book.author}</p>}
                        </div>
                        {sel && <Check className="w-4 h-4 flex-shrink-0 text-white/80" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Start button */}
            <button onClick={handleStart}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-base transition-opacity active:opacity-80"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <Play className="w-5 h-5" fill="currentColor" />
              Iniciar — {selectedMins} min
            </button>
          </div>
        </>
      )}

      {/* ── ACTIVE ── */}
      {view === 'active' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-5 py-8">
          <CountdownRing
            totalSecs={selectedMins * 60}
            remainingSecs={remainingSecs}
            book={selectedBook}
          />

          {/* Sound picker */}
          <div className="w-full max-w-sm">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 text-center">Sonido</p>
            <div className="grid grid-cols-4 gap-2">
              {SOUNDS.map(({ id, label, Icon }) => {
                const active = selectedSound === id;
                return (
                  <button key={id} onClick={() => handleActiveSound(id)}
                    className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                      borderColor: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <Icon className="w-4 h-4" color={active ? 'white' : 'rgba(255,255,255,0.4)'} />
                    <span className="text-[10px] font-medium" style={{ color: active ? 'white' : 'rgba(255,255,255,0.4)' }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={handleEndEarly}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Square className="w-4 h-4" />
            Terminar sesión
          </button>
        </div>
      )}

      {/* ── DONE ── */}
      {view === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: 'radial-gradient(circle, rgba(255,220,150,0.3), rgba(200,140,50,0.2))' }}>
            <BookOpen className="w-9 h-9 text-amber-300" />
          </div>
          <div>
            <p className="text-5xl font-bold text-white leading-none">{elapsedMins}<span className="text-2xl ml-1 text-white/60">min</span></p>
            <p className="text-sm text-white/50 mt-2">de lectura registrados</p>
          </div>
          {selectedBook && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              {selectedBook.coverUrl
                ? <img src={selectedBook.coverUrl} alt="" className="w-8 h-11 object-cover rounded" />
                : <BookOpen className="w-5 h-5 text-amber-300" />
              }
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{selectedBook.title}</p>
                {selectedBook.author && <p className="text-xs text-white/50">{selectedBook.author}</p>}
              </div>
            </div>
          )}
          <button onClick={onClose}
            className="w-full max-w-xs py-4 rounded-2xl font-semibold text-base"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
};

export default ReadingSessionModal;
