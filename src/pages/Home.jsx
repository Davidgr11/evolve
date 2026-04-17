import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { db, storage } from '../utils/firebase';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import {
  Salad, Zap, Moon, Smile, BookOpen,
  ChevronRight, Sparkles, CheckCircle, AlertCircle, X, Loader2, ChevronLeft, Info,
  Plus, Edit, Trash2, TrendingUp, LogOut, Pencil, GripVertical,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import confetti from 'canvas-confetti';
import ImageUpload from '../components/ImageUpload';
import ConfirmModal from '../components/ConfirmModal';
import toast from '../utils/toast';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getLast7Days = () =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return toLocalDateStr(d);
  });

const callClaude = async (prompt, maxTokens = 600) => {
  const k = import.meta.env.VITE_CLAUDE_API_KEY;
  if (!k) throw new Error('no key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': k,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).content[0].text;
};

// ─── Pillar config ─────────────────────────────────────────────────────────────
const PILLARS = [
  { key: 'nutricion',   label: 'Nutrición',   icon: Salad,    color: 'text-green-500',  desc: 'Alimentación e hidratación — qué comes y cuánta agua tomas cada día.'                                   },
  { key: 'ejercicio',   label: 'Actividad',   icon: Zap,      color: 'text-orange-500', desc: 'Actividad física semanal — qué tan seguido cumples tus rutinas de movimiento.'                           },
  { key: 'sueno',       label: 'Sueño',       icon: Moon,     color: 'text-purple-500', desc: 'Calidad del descanso — hábitos antes de dormir, horario regular y no comer tarde.'                       },
  { key: 'emocional',   label: 'Emocional',   icon: Smile,    color: 'text-blue-500',   desc: 'Bienestar mental — presencia y reflexión, socialización y cómo procesas tus emociones del día.'         },
  { key: 'crecimiento', label: 'Crecimiento', icon: BookOpen, color: 'text-amber-500',  desc: 'Aprendizaje continuo — si cada día lees, escuchas un podcast o aprendes algo nuevo (65%), tus temas del año completados (15%) y tu meta de libros (20%).' },
];

const SCORE_COLOR = (s) =>
  s >= 70 ? 'text-green-500' : s >= 40 ? 'text-amber-500' : s > 0 ? 'text-red-400' : 'text-gray-300 dark:text-gray-600';

// Maps user color preference to Tailwind classes + hex for SVG
const THEME_PALETTE = {
  blue:   { text: 'text-blue-500 dark:text-blue-400',     hex: '#3b82f6' },
  purple: { text: 'text-purple-500 dark:text-purple-400', hex: '#8b5cf6' },
  arena:  { text: 'text-amber-800 dark:text-amber-600',   hex: '#9e7b5a' },
  slate:  { text: 'text-slate-500 dark:text-slate-400',   hex: '#64748b' },
};

const COLOR_THEMES = [
  { id: 'blue',   label: 'Azul',    bg: '#3b82f6', appBg: '#c2dce8' },
  { id: 'purple', label: 'Morado',  bg: '#8b5cf6', appBg: '#dcd4f0' },
  { id: 'arena',  label: 'Arena',   bg: '#9e7b5a', appBg: '#ede5d8' },
  { id: 'slate',  label: 'Pizarra', bg: '#64748b', appBg: '#dce0e8' },
];

const RadarTick = ({ x, y, payload, textAnchor }) => (
  <text x={x} y={y} textAnchor={textAnchor} fill="#6b7280" fontSize={12} className="select-none">
    {payload.value}
  </text>
);

// ─── Goal card ─────────────────────────────────────────────────────────────────
const GoalCard = ({ goal, onClick }) => {
  const { colorTheme } = useTheme();
  const themeHex = THEME_PALETTE[colorTheme]?.hex ?? '#3b82f6';

  const isAccomplished = goal.status === 'accomplished';
  const isMeasurable = goal.type === 'measurable';
  const progress = isMeasurable && goal.target > 0
    ? Math.min(100, Math.round((goal.currentValue || 0) / goal.target * 100))
    : isAccomplished ? 100 : 0;

  return (
    <div
      className="relative w-full aspect-square cursor-pointer overflow-hidden rounded-2xl shadow-sm select-none"
      onClick={() => onClick(goal)}
    >
      <img
        src={goal.imageUrl}
        alt={goal.description || 'Meta'}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Theme-color fill from bottom */}
      {isMeasurable && !isAccomplished && progress > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-700"
          style={{ height: `${progress}%`, backgroundColor: themeHex + '80' }}
        />
      )}

      {/* Accomplished full overlay */}
      {isAccomplished && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: themeHex + '59' }}>
          <CheckCircle className="w-10 h-10 text-white drop-shadow-lg" />
        </div>
      )}

      {/* Percentage badge — bottom center */}
      {isMeasurable && !isAccomplished && progress > 0 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
          <span className="text-white font-bold text-sm drop-shadow-lg bg-black/25 px-2 py-0.5 rounded-full">
            {progress}%
          </span>
        </div>
      )}
    </div>
  );
};

const SortableGoalCard = ({ goal, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="relative">
      <GoalCard goal={goal} onClick={isDragging ? undefined : onClick} />
      {/* Drag handle — only this element receives the dnd listeners */}
      <div
        {...listeners}
        className="absolute top-2 left-2 p-1 rounded-lg bg-black/30 cursor-grab touch-none z-10"
      >
        <GripVertical className="w-4 h-4 text-white" />
      </div>
    </div>
  );
};

// ─── Check-in modal ────────────────────────────────────────────────────────────
const GROWTH_OPTIONS = [
  { value: 'book',    emoji: '📚', label: 'Leí',                accent: 'border-amber-400 bg-amber-50/60 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' },
  { value: 'podcast', emoji: '🎧', label: 'Podcast de valor',   accent: 'border-teal-400 bg-teal-50/60 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300' },
  { value: 'tech',    emoji: '💻', label: 'Aprendí algo nuevo', accent: 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300' },
  { value: 'none',    emoji: '😴', label: 'No hoy',             accent: 'border-gray-400 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300' },
];

const SLEEP_HABITS = [
  { key: 'noDevices',      emoji: '📵', label: 'Sin dispositivos antes de dormir'            },
  { key: 'fixedSchedule',  emoji: '🕙', label: 'Me fui a dormir y me desperté en mi horario' },
  { key: 'noEatingBefore', emoji: '🚫', label: 'No comí 2-3h antes de dormir'               },
];

const MEAL_OPTIONS = [
  { value: 'bad',      emoji: '😓', label: 'Comí mal o me mal pasé', accent: 'border-gray-400 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300'      },
  { value: 'partial',  emoji: '⚖️',  label: 'Comí más o menos',       accent: 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'       },
  { value: 'followed', emoji: '🥗', label: 'Comí acorde a mi plan',   accent: 'border-green-400 bg-green-50/60 dark:bg-green-900/20 text-green-800 dark:text-green-300'  },
];

const WATER_OPTIONS = [
  { value: 'none',    emoji: '🏜️', label: 'No tomé agua',          accent: 'border-gray-400 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300'   },
  { value: 'little',  emoji: '💧', label: 'Tomé poca agua',         accent: 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'    },
  { value: 'regular', emoji: '🌊', label: 'Tomé agua regularmente', accent: 'border-green-400 bg-green-50/60 dark:bg-green-900/20 text-green-800 dark:text-green-300'},
];

const PRESENCE_OPTIONS = [
  { value: 0, emoji: '😶', label: 'No',      accent: 'border-gray-400 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300'   },
  { value: 1, emoji: '🧘', label: 'Una vez', accent: 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'    },
  { value: 2, emoji: '✨', label: '2 o más', accent: 'border-green-400 bg-green-50/60 dark:bg-green-900/20 text-green-800 dark:text-green-300'},
];

const SOCIAL_OPTIONS = [
  { value: 0, emoji: '😶', label: 'No socialicé hoy',                                             accent: 'border-gray-400 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300'   },
  { value: 1, emoji: '😊', label: 'Con personas con las que me siento cómodo',                     accent: 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'    },
  { value: 2, emoji: '🌱', label: 'Hice algún esfuerzo extra, saliendo de mi zona de confort',     accent: 'border-green-400 bg-green-50/60 dark:bg-green-900/20 text-green-800 dark:text-green-300'},
];

const CheckinModal = ({ existing, onSave, onClose }) => {
  const alreadyDone = !!existing?.savedAt;

  const [step, setStep]                 = useState(1);
  const [mealAdherence, setMeal]        = useState(existing?.mealAdherence ?? null);
  const [waterIntake, setWater]         = useState(existing?.waterIntake ?? null);
  const [presenceLevel, setPresence]    = useState(existing?.presenceLevel ?? null);
  const [communityLevel, setCommunity]  = useState(existing?.communityLevel ?? null);
  const [emotionText, setEmotionText]   = useState('');
  const [sleepHabits, setSleepHabits]   = useState(existing?.sleepHabits ?? { noDevices: false, fixedSchedule: false, noEatingBefore: false });
  const [growth, setGrowth]             = useState(existing?.growth ?? null);
  const [coachResponse, setCoachResponse] = useState(existing?.aiResponse ?? '');
  const [saving, setSaving]             = useState(false);

  const buildEntry = (extra = {}) => ({
    mealAdherence, waterIntake,
    presenceLevel, communityLevel,
    growth,
    emotionText: extra.emotionText ?? '',
    emotionScore: extra.emotionScore ?? null,
    sleepHabits,
    aiResponse: extra.aiResponse ?? '',
    savedAt: new Date().toISOString(),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!emotionText.trim()) {
        onSave(buildEntry());
        onClose();
        return;
      }
      const presLabel   = presenceLevel === 2 ? '2+ veces' : presenceLevel === 1 ? 'una vez' : 'no';
      const socialLabel = SOCIAL_OPTIONS.find(o => o.value === communityLevel)?.label ?? 'no indicó';
      const prompt = `El usuario describe cómo se sintió hoy y cómo manejó sus emociones.

TEXTO: "${emotionText.trim()}"
CONTEXTO: presencia/reflexión ${presLabel} · socialización: ${socialLabel}

Devuelve SOLO JSON:
{"score": <0-100>, "response": "<2-3 oraciones empáticas en español, conectando con algo específico de su texto>"}

Criterios para el score:
90-100: Identifica emociones específicas Y tomó acción concreta (habló, reflexionó, buscó solución)
70-89: Reconoció emociones con algo de procesamiento
40-69: Mencionó cómo se sintió con poca reflexión
10-39: Vago, sin autoconciencia
0-9: Suprimió o ignoró totalmente`;

      const rawText = await callClaude(prompt, 400);
      const cleaned = rawText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      const entry = buildEntry({ emotionText: emotionText.trim(), emotionScore: parsed.score ?? null, aiResponse: parsed.response ?? '' });
      setCoachResponse(parsed.response ?? '');
      onSave(entry);
    } catch {
      onSave(buildEntry({ emotionText: emotionText.trim() }));
      toast.error('No se pudo generar el feedback');
    } finally {
      setSaving(false);
    }
  };

  const TOTAL_STEPS = 4;
  const canGoBack = step > 1 && !saving && !coachResponse;

  return (
    <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={onClose}>
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div
          className="liquid-glass-panel rounded-2xl w-full max-w-lg flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(90vh - 80px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
            {!alreadyDone && canGoBack
              ? <button onClick={() => setStep(s => s - 1)} className="p-1 text-gray-400 hover:text-gray-600"><ChevronLeft className="w-5 h-5" /></button>
              : <div className="w-7" />
            }
            {!alreadyDone && (
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(d => (
                  <div key={d} className={`h-1.5 rounded-full transition-all ${d === step ? 'w-6 bg-primary-500' : d < step ? 'w-1.5 bg-primary-300' : 'w-1.5 bg-gray-200 dark:bg-gray-700'}`} />
                ))}
              </div>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-5">

            {/* ── Already done ── */}
            {alreadyDone && (
              <>
                <div className="text-center pt-2">
                  <CheckCircle className="w-11 h-11 text-green-500 mx-auto mb-2" />
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Check-in de hoy completado</h3>
                </div>
                {coachResponse && (
                  <div className="liquid-glass-panel rounded-xl p-4 border border-primary-200/60 dark:border-primary-700/40">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary-500" />
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Tu coach de bienestar</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line text-justify">{coachResponse}</p>
                  </div>
                )}
                <button onClick={onClose} className="btn-secondary w-full py-2.5">Cerrar</button>
              </>
            )}

            {/* ── Step 1: Nutrición ── */}
            {!alreadyDone && step === 1 && (
              <>
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Nutrición</h3>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alimentación</p>
                  <div className="grid grid-cols-3 gap-2">
                    {MEAL_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setMeal(o.value)}
                        className={`py-3 rounded-xl flex flex-col items-center gap-1 transition-all border-2 ${mealAdherence === o.value ? `${o.accent} border-transparent` : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        <span className="text-xl">{o.emoji}</span>
                        <span className="text-xs font-medium text-center leading-tight">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agua</p>
                  <div className="grid grid-cols-3 gap-2">
                    {WATER_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setWater(o.value)}
                        className={`py-3 rounded-xl flex flex-col items-center gap-1 transition-all border-2 ${waterIntake === o.value ? `${o.accent} border-transparent` : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        <span className="text-xl">{o.emoji}</span>
                        <span className="text-xs font-medium text-center leading-tight">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setStep(2)} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* ── Step 2: Sueño ── */}
            {!alreadyDone && step === 2 && (
              <>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Sueño de anoche</h3>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Marca lo que aplique</p>
                </div>
                <div className="space-y-2">
                  {SLEEP_HABITS.map(h => (
                    <button key={h.key} onClick={() => setSleepHabits(s => ({ ...s, [h.key]: !s[h.key] }))}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${sleepHabits[h.key] ? 'border-purple-400 bg-purple-50/60 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'}`}>
                      <span className="text-xl flex-shrink-0">{h.emoji}</span>
                      <span className={`text-sm font-medium flex-1 ${sleepHabits[h.key] ? 'text-purple-800 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>{h.label}</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${sleepHabits[h.key] ? 'bg-purple-500 border-purple-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {sleepHabits[h.key] && <span className="text-white text-xs leading-none">✓</span>}
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep(3)} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* ── Step 3: Crecimiento ── */}
            {!alreadyDone && step === 3 && (
              <>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Crecimiento</h3>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">¿Hoy dedicaste tiempo a aprender algo?</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {GROWTH_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setGrowth(o.value)}
                      className={`py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all border-2 ${growth === o.value ? `${o.accent} border-transparent` : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                      <span className="text-2xl">{o.emoji}</span>
                      <span className="text-xs font-medium text-center leading-tight">{o.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep(4)} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* ── Step 4: Emocional ── */}
            {!alreadyDone && step === 4 && (
              <>
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Emocional</h3>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Presencia y reflexión</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">¿Te diste un espacio para respirar, meditar, agradecer o reflexionar?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESENCE_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setPresence(o.value)}
                        className={`py-3 rounded-xl flex flex-col items-center gap-1 transition-all border-2 ${presenceLevel === o.value ? `${o.accent} border-transparent` : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        <span className="text-xl">{o.emoji}</span>
                        <span className="text-xs font-medium">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Socialización</p>
                  <div className="space-y-2">
                    {SOCIAL_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setCommunity(o.value)}
                        className={`w-full py-2.5 px-3 rounded-xl text-sm text-left transition-all border-2 flex items-center gap-3 ${communityLevel === o.value ? `${o.accent} border-transparent` : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                        <span className="text-lg flex-shrink-0">{o.emoji}</span>
                        <span className="font-medium">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Explica cómo te sentiste hoy, qué emociones tuviste y cómo las manejaste <span className="normal-case font-normal text-gray-400">(opcional)</span>
                  </p>
                  <textarea
                    className="input-field resize-none"
                    rows={4}
                    placeholder="Hoy me sentí..."
                    value={emotionText}
                    onChange={e => setEmotionText(e.target.value)}
                  />
                </div>

                {saving ? (
                  <div className="flex flex-col items-center py-6 gap-3">
                    <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />
                    <p className="text-sm text-gray-400">Guardando{emotionText.trim() ? ' y analizando tu día...' : '...'}</p>
                  </div>
                ) : coachResponse ? (
                  <>
                    <div className="liquid-glass-panel rounded-xl p-4 border border-primary-200/60 dark:border-primary-700/40">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-primary-500" />
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Tu coach de bienestar</span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line text-justify">{coachResponse}</p>
                    </div>
                    <button onClick={onClose} className="btn-secondary w-full py-2.5">Cerrar</button>
                  </>
                ) : (
                  <button onClick={handleSave} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {emotionText.trim() ? <><Sparkles className="w-4 h-4" /> Guardar y obtener feedback</> : 'Guardar check-in'}
                  </button>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Home page ────────────────────────────────────────────────────────────────
const Home = () => {
  const { user, logout } = useAuth();
  const { colorTheme, setColorTheme } = useTheme();

  // ── Settings / profile ──
  const [profilePhoto, setProfilePhoto]   = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [phrase, setPhrase]               = useState('');
  const [showPhraseModal, setShowPhraseModal] = useState(false);
  const [phraseInput, setPhraseInput]     = useState('');

  // ── Pillars ──
  const [scores, setScores] = useState({ nutricion: 0, ejercicio: 0, sueno: 0, emocional: 0, crecimiento: 0 });
  const [openInfo, setOpenInfo]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [allData, setAllData]             = useState({});

  // ── Check-in ──
  const [todayCheckin, setTodayCheckin]   = useState(null);
  const [checkIns, setCheckIns]           = useState({});
  const [showCheckin, setShowCheckin]     = useState(false);

  // ── Analysis ──
  const [showAnalysis, setShowAnalysis]   = useState(false);
  const [analysisText, setAnalysisText]   = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // ── Goals ──
  const [goals, setGoals]                 = useState([]);
  const [loadingGoals, setLoadingGoals]   = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal]     = useState(null);
  const [goalType, setGoalType]           = useState('binary');
  const [uploading, setUploading]         = useState(false);
  const [selectedGoal, setSelectedGoal]   = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, goal: null });
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeRec, setClaudeRec]         = useState('');
  const [progressInput, setProgressInput] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm();

  const todayStr = toLocalDateStr(new Date());
  const firstName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';

  useEffect(() => {
    if (user) {
      loadSettings();
      loadData();
      loadGoals();
    }
  }, [user]);

  // Reset Claude rec when switching goal
  useEffect(() => {
    setClaudeRec('');
    if (selectedGoal) setProgressInput(String(selectedGoal.currentValue || 0));
  }, [selectedGoal?.id]);

  // ── Loaders ──────────────────────────────────────────────────────────────────
  const loadSettings = async () => {
    try {
      const [profileSnap, quoteSnap] = await Promise.all([
        getDoc(doc(db, `users/${user.uid}/settings`, 'profile')),
        getDoc(doc(db, `users/${user.uid}/settings`, 'motivationalQuote')),
      ]);
      if (profileSnap.exists() && profileSnap.data().photoUrl) setProfilePhoto(profileSnap.data().photoUrl);
      if (quoteSnap.exists()) setPhrase(quoteSnap.data().quote || '');
    } catch {}
  };

  const loadData = async () => {
    const last7    = getLast7Days();
    const weekStart = last7[0];

    try {
      const [foodSnap, routinesSnap, wellbeingSnap, booksSnap, menteSnap, booksGoalSnap] = await Promise.all([
        getDoc(doc(db, `users/${user.uid}/food`, 'data')),
        getDocs(collection(db, `users/${user.uid}/routines`)),
        getDoc(doc(db, `users/${user.uid}/wellbeing`, 'data')),
        getDocs(collection(db, `users/${user.uid}/books`)),
        getDoc(doc(db, `users/${user.uid}/mente`, 'data')),
        getDoc(doc(db, `users/${user.uid}/data`, 'books')),
      ]);

      // ── Nutrición
      let nutricion = 0;
      const ciData = wellbeingSnap.exists() ? (wellbeingSnap.data().checkIns || {}) : {};
      const mealMap  = { followed: 100, partial: 60, bad: 20 };
      const waterMap = { regular: 100, little: 50, none: 0 };
      const nutritionWeek = last7.map(d => {
        const ci = ciData[d];
        if (!ci) return null;
        if (ci.mealAdherence != null && ci.waterIntake != null)
          return ((mealMap[ci.mealAdherence] ?? 60) + (waterMap[ci.waterIntake] ?? 50)) / 2;
        if (ci.nutritionAdherence) return { followed: 100, partial: 60, skip: 20 }[ci.nutritionAdherence] ?? null;
        return null;
      }).filter(v => v !== null);

      if (nutritionWeek.length) {
        nutricion = Math.round(nutritionWeek.reduce((a, b) => a + b, 0) / nutritionWeek.length);
      }

      // ── Ejercicio
      let ejercicio = 0;
      if (!routinesSnap.empty) {
        const routines = routinesSnap.docs.map(d => d.data());
        const routinesWithGoal = routines.filter(r => r.weeklyGoal > 0);
        if (routinesWithGoal.length > 0) {
          const now = Date.now();
          const rScores = routinesWithGoal.map(r => {
            if (!r.lastRun) return 0;
            const daysSince = (now - new Date(r.lastRun).getTime()) / (1000 * 60 * 60 * 24);
            const expectedGap = 7 / r.weeklyGoal;
            return Math.max(0, 1 - Math.max(0, daysSince - expectedGap) / (2 * expectedGap));
          });
          ejercicio = Math.min(100, Math.round(rScores.reduce((a, b) => a + b, 0) / rScores.length * 100));
        } else {
          const cutoff = new Date(weekStart + 'T00:00:00').getTime();
          const thisWeekRuns = routinesSnap.docs.filter(d => {
            const { lastRun } = d.data();
            return lastRun && new Date(lastRun).getTime() >= cutoff;
          }).length;
          ejercicio = Math.min(100, thisWeekRuns * 25);
        }
      }

      // ── Sueño, Emocional
      let sueno = 0, emocional = 0;
      let todayCI = null;
      if (wellbeingSnap.exists()) {
        const cis = wellbeingSnap.data().checkIns || {};
        todayCI = cis[todayStr] || null;
        setCheckIns(cis);

        const sleepScores = last7.map(d => {
          const h = cis[d]?.sleepHabits;
          if (!h) return null;
          return (h.noDevices ? 1 : 0) + (h.fixedSchedule ? 1 : 0) + (h.noEatingBefore ? 1 : 0);
        }).filter(v => v !== null);
        if (sleepScores.length) sueno = Math.round(sleepScores.reduce((a, b) => a + b, 0) / (sleepScores.length * 3) * 100);

        const emocionalDays = last7.map(d => {
          const ci = cis[d];
          if (!ci) return null;
          const emotionScore = ci.emotionScore != null ? ci.emotionScore
            : (ci.journal?.trim().length > 0 ? 60 : null);
          const pl = ci.presenceLevel ?? ci.meditationLevel;
          const presenceScore = pl === 2 ? 90 : pl === 1 ? 70 : (ci.meditated === true ? 90 : 0);
          const cl = ci.communityLevel;
          const socialScore = cl === 2 ? 100 : cl === 1 ? 65 : cl === 0 ? 0
            : Math.min(100, (ci.community || 0) * 20);
          if (emotionScore == null) return (presenceScore + socialScore) / 2;
          return (emotionScore + presenceScore + socialScore) / 3;
        }).filter(v => v !== null);
        if (emocionalDays.length) emocional = Math.round(emocionalDays.reduce((a, b) => a + b, 0) / emocionalDays.length);
      }

      // ── Crecimiento (65% daily learning · 15% learning items · 20% books goal)
      let crecimiento = 0;
      {
        // 65%: 7-day check-in growth avg
        const growthDays = last7.map(d => {
          const ci = ciData[d];
          if (!ci || ci.growth == null) return null;
          return ci.growth !== 'none' ? 100 : 0;
        }).filter(v => v !== null);
        const dailyLearning = growthDays.length
          ? Math.round(growthDays.reduce((a, b) => a + b, 0) / growthDays.length)
          : 0;

        // 15%: learning items completion
        const menteData = menteSnap.exists() ? menteSnap.data() : {};
        const items = menteData.learningItems || [];
        const learningScore = items.length
          ? Math.round(items.filter(i => i.completed).length / items.length * 100)
          : 0;

        // 20%: books read this year vs annual goal
        const booksGoal = booksGoalSnap.exists() ? (booksGoalSnap.data().annualGoal || 12) : 12;
        const booksThisYear = booksSnap.docs.filter(d => {
          const b = d.data();
          return b.status === 'read' && b.finishedDate &&
            new Date(b.finishedDate).getFullYear() === new Date().getFullYear();
        }).length;
        const booksScore = Math.min(100, Math.round(booksThisYear / booksGoal * 100));

        crecimiento = Math.round(0.65 * dailyLearning + 0.15 * learningScore + 0.20 * booksScore);
      }

      const computed = { nutricion, ejercicio, sueno, emocional, crecimiento };
      setScores(computed);
      setTodayCheckin(todayCI);

      setAllData({
        scores: computed,
        checkIns: ciData,
        routines: routinesSnap.docs.map(d => d.data()),
        foodData: foodSnap.exists() ? foodSnap.data() : null,
        books: booksSnap.docs.map(d => d.data()),
        last7,
        todayStr,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async () => {
    setLoadingGoals(true);
    try {
      const snapshot = await getDocs(collection(db, `users/${user.uid}/goals`));
      const goalsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      goalsData.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });
      setGoals(goalsData);
    } catch (err) {
      console.error('Failed to load goals:', err);
    } finally {
      setLoadingGoals(false);
    }
  };

  // ── Phrase ───────────────────────────────────────────────────────────────────
  const handleSavePhrase = async () => {
    const trimmed = phraseInput.trim();
    setPhrase(trimmed);
    setShowPhraseModal(false);
    try {
      await setDoc(doc(db, `users/${user.uid}/settings`, 'motivationalQuote'), { quote: trimmed });
    } catch { toast.error('Error al guardar'); }
  };

  // ── Check-in ─────────────────────────────────────────────────────────────────
  const handleSaveCheckin = async (entry) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cleaned = Object.fromEntries(
        Object.entries({ ...checkIns, [todayStr]: entry })
          .filter(([d]) => new Date(d) >= cutoff)
      );
      await setDoc(doc(db, `users/${user.uid}/wellbeing`, 'data'), { checkIns: cleaned }, { merge: true });
      await loadData();
    } catch { toast.error('Error al guardar'); }
  };

  // ── AI Analysis ──────────────────────────────────────────────────────────────
  const handleAiAnalysis = async () => {
    setShowAnalysis(true);
    if (analysisText) return;
    setAnalysisLoading(true);
    try {
      const { scores: sc, checkIns: cis, routines, books, last7 } = allData;
      const weekSummary = last7.map(d => {
        const ci = cis[d];
        if (!ci) return null;
        const sh = ci.sleepHabits ? Object.values(ci.sleepHabits).filter(Boolean).length : 0;
        return `${d}: sueño_hábitos=${sh}/3`;
      }).filter(Boolean);

      const now = Date.now();
      const exerciseSummary = (routines || [])
        .filter(r => r.weeklyGoal > 0 || r.lastRun)
        .map(r => {
          const daysSince = r.lastRun ? Math.floor((now - new Date(r.lastRun).getTime()) / 86400000) : null;
          const goalStr = r.weeklyGoal > 0 ? `meta ${r.weeklyGoal}x/sem` : 'sin meta';
          const lastStr = daysSince == null ? 'nunca' : daysSince === 0 ? 'hoy' : `hace ${daysSince}d`;
          return `${r.name} (${r.type}): última vez ${lastStr}, ${goalStr}`;
        }).join('\n') || 'Sin actividad registrada';

      const readingBooks = (books || []).filter(b => b.status === 'reading').map(b => b.title).join(', ');

      const sortedPillars = PILLARS.map(p => ({ label: p.label, score: sc[p.key] ?? 0 }))
        .sort((a, b) => a.score - b.score);
      const weakTwo = sortedPillars.slice(0, 2);

      const prompt = `Eres un coach de longevidad. Sé directo y concreto — el usuario ya conoce sus números, no los repitas.

PUNTUACIONES (0-100): ${PILLARS.map(p => `${p.label} ${sc[p.key] ?? 0}`).join(' · ')}
REGISTRO: ${weekSummary.length ? weekSummary.join(' | ') : 'sin registros'}
EJERCICIO: ${exerciseSummary}
LIBROS: ${readingBooks || 'ninguno'}

Los 2 pilares más débiles son: ${weakTwo.map(p => p.label).join(' y ')}.
Da exactamente 2 sugerencias — UNA por cada pilar débil, en ese orden. Cada sugerencia: 1 oración con la acción concreta. Luego 1 oración final sobre algo que va bien.

Plain text, sin markdown, en español.`;

      const text = await callClaude(prompt, 700);
      setAnalysisText(text);
    } catch { toast.error('Error al analizar'); }
    finally { setAnalysisLoading(false); }
  };

  // ── Goals drag-and-drop ───────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = goals.findIndex(g => g.id === active.id);
    const newIndex = goals.findIndex(g => g.id === over.id);
    const reordered = arrayMove(goals, oldIndex, newIndex);
    setGoals(reordered);
    // Persist new order
    try {
      await Promise.all(
        reordered.map((g, i) => updateDoc(doc(db, `users/${user.uid}/goals`, g.id), { order: i }))
      );
    } catch { toast.error('Error al guardar el orden'); }
  };

  // ── Goals CRUD ───────────────────────────────────────────────────────────────
  const triggerConfetti = () => {
    const end = Date.now() + 3000;
    const iv = setInterval(() => {
      if (Date.now() > end) return clearInterval(iv);
      const t = (end - Date.now()) / 3000;
      confetti({ startVelocity: 30, spread: 360, ticks: 60, particleCount: 50 * t, origin: { x: Math.random(), y: Math.random() - 0.2 } });
    }, 250);
  };

  const handleSaveGoal = async (data) => {
    const fileInput = document.getElementById('goal-image-input');
    const file = fileInput?.files?.[0];

    if (editingGoal) {
      try {
        setUploading(true);
        const wasExpecting = editingGoal.status === 'expecting';
        let imageUrl = editingGoal.imageUrl;
        let imagePath = editingGoal.imagePath;

        if (file) {
          if (file.size > 2 * 1024 * 1024) { toast.error('La imagen debe ser < 2MB'); return; }
          const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true });
          const ts = Date.now();
          const newPath = `users/${user.uid}/goals/${ts}_${file.name}`;
          await uploadBytes(ref(storage, newPath), compressed);
          imageUrl = await getDownloadURL(ref(storage, newPath));
          if (editingGoal.imagePath) { try { await deleteObject(ref(storage, editingGoal.imagePath)); } catch {} }
          imagePath = newPath;
        }

        const isMeasurable = goalType === 'measurable';
        await updateDoc(doc(db, `users/${user.uid}/goals`, editingGoal.id), {
          description: data.description,
          status: data.status,
          type: goalType,
          imageUrl,
          imagePath,
          ...(isMeasurable && { target: Number(data.target) || 0, unit: data.unit || '' }),
        });

        if (wasExpecting && data.status === 'accomplished') { triggerConfetti(); toast.success('¡Meta lograda! 🎉'); }
        else toast.success('Meta actualizada');
        closeGoalModal();
        loadGoals();
      } catch (err) {
        toast.error('Error al actualizar la meta');
        console.error(err);
      } finally { setUploading(false); }
      return;
    }

    // Create new
    if (!file) { toast.error('Selecciona una imagen'); return; }
    if (goals.length >= 20) { toast.error('Máximo 20 metas'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen debe ser < 2MB'); return; }

    setUploading(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true });
      const ts = Date.now();
      const imagePath = `users/${user.uid}/goals/${ts}_${file.name}`;
      await uploadBytes(ref(storage, imagePath), compressed);
      const imageUrl = await getDownloadURL(ref(storage, imagePath));

      const isMeasurable = goalType === 'measurable';
      await setDoc(doc(db, `users/${user.uid}/goals`, `${ts}`), {
        imageUrl,
        imagePath,
        description: data.description || '',
        status: 'expecting',
        type: goalType,
        currentValue: 0,
        createdAt: new Date().toISOString(),
        order: goals.length,
        ...(isMeasurable && { target: Number(data.target) || 0, unit: data.unit || '' }),
      });

      toast.success('¡Meta añadida!');
      closeGoalModal();
      loadGoals();
    } catch (err) {
      toast.error('Error al añadir la meta');
      console.error(err);
    } finally { setUploading(false); }
  };

  const handleDeleteGoal = async (goal) => {
    try {
      if (goal.imagePath) { try { await deleteObject(ref(storage, goal.imagePath)); } catch {} }
      await deleteDoc(doc(db, `users/${user.uid}/goals`, goal.id));
      toast.success('Meta eliminada');
      setSelectedGoal(null);
      loadGoals();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleMarkDone = async (goal) => {
    const newStatus = goal.status === 'accomplished' ? 'expecting' : 'accomplished';
    try {
      await updateDoc(doc(db, `users/${user.uid}/goals`, goal.id), { status: newStatus });
      if (newStatus === 'accomplished') { triggerConfetti(); toast.success('¡Meta lograda! 🎉'); }
      else toast.success('Marcada como pendiente');
      const updated = { ...goal, status: newStatus };
      setSelectedGoal(updated);
      setGoals(prev => prev.map(g => g.id === goal.id ? updated : g));
    } catch { toast.error('Error al actualizar'); }
  };

  const handleSaveProgress = async () => {
    if (!selectedGoal) return;
    const value = parseFloat(progressInput);
    if (isNaN(value) || value < 0) { toast.error('Ingresa un número válido'); return; }
    setSavingProgress(true);
    try {
      const isNowDone = value >= (selectedGoal.target || 0);
      const updateData = { currentValue: value, ...(isNowDone && { status: 'accomplished' }) };
      await updateDoc(doc(db, `users/${user.uid}/goals`, selectedGoal.id), updateData);
      const updated = { ...selectedGoal, currentValue: value, ...(isNowDone && { status: 'accomplished' }) };
      setSelectedGoal(updated);
      setGoals(prev => prev.map(g => g.id === selectedGoal.id ? updated : g));
      if (isNowDone) { triggerConfetti(); toast.success('¡Meta alcanzada! 🎉'); }
      else toast.success('Progreso guardado');
    } catch { toast.error('Error al guardar el progreso'); }
    finally { setSavingProgress(false); }
  };

  const handleGetRecommendation = async (goal) => {
    setClaudeLoading(true);
    setClaudeRec('');
    try {
      const isMeasurable = goal.type === 'measurable';
      const progress = isMeasurable && goal.target > 0
        ? Math.round((goal.currentValue || 0) / goal.target * 100)
        : null;
      const prompt = isMeasurable
        ? `Mi meta: "${goal.description}". Objetivo: ${goal.target} ${goal.unit || ''}. Actual: ${goal.currentValue || 0} ${goal.unit || ''} (${progress}%). Dame UNA recomendación específica y accionable para avanzar más rápido. Sé directo — máx 3 oraciones en español.`
        : `Mi meta: "${goal.description}". Aún no la he logrado. Dame UN primer paso específico y accionable para lograrlo. Sé directo — máx 3 oraciones en español.`;
      const text = await callClaude(prompt, 150);
      setClaudeRec(text);
    } catch { toast.error('No se pudo obtener recomendación'); }
    finally { setClaudeLoading(false); }
  };

  const openEditModal = (goal) => {
    setEditingGoal(goal);
    const type = goal.type || 'binary';
    setGoalType(type);
    reset({ description: goal.description || '', status: goal.status, goalType: type, target: goal.target || '', unit: goal.unit || '' });
    setSelectedGoal(null);
    setShowGoalModal(true);
  };

  const handleAddNewGoal = () => {
    setEditingGoal(null);
    setGoalType('binary');
    reset({ description: '', status: 'expecting', goalType: 'binary', target: '', unit: '' });
    setShowGoalModal(true);
  };

  const closeGoalModal = () => {
    setShowGoalModal(false);
    setEditingGoal(null);
    setGoalType('binary');
    reset();
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const radarData = PILLARS.map(p => ({ pilar: p.label, score: scores[p.key], fullMark: 100 }));
  const overallScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / PILLARS.length);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Inicio</h1>
        </div>
        <button
          onClick={() => setShowProfileModal(true)}
          className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white/70 dark:ring-gray-700 hover:ring-primary-300 transition-all shadow-sm"
        >
          {profilePhoto ? (
            <img src={profilePhoto} alt="Perfil" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/70 dark:bg-gray-800/70 flex items-center justify-center">
              <span className="text-base font-bold text-gray-700 dark:text-gray-300">
                {(user?.displayName || user?.email || '?')[0].toUpperCase()}
              </span>
            </div>
          )}
        </button>
      </div>

      {/* ── Personal phrase ── */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={() => { setPhraseInput(phrase); setShowPhraseModal(true); }}
          className="flex-1 text-left flex items-center gap-2 group"
        >
          <span className={`text-lg italic flex-1 leading-snug ${phrase ? (THEME_PALETTE[colorTheme]?.text ?? 'text-blue-500') : 'text-gray-300 dark:text-gray-600'}`}>
            {phrase ? `"${phrase}"` : 'Añade una frase para ti mismo...'}
          </span>
          <Pencil className={`w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity ${THEME_PALETTE[colorTheme]?.text ?? 'text-blue-500'}`} />
        </button>
      </div>

      {/* ── Section: Check in ── */}
      {(() => {
        const isAfterCheckinTime = new Date().getHours() >= 19;
        return (
          <>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Check in</p>

            {!isAfterCheckinTime && !todayCheckin ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl liquid-glass-panel">
                <span className="text-2xl">🌙</span>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Vuelve más tarde</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Podrás llenar tu check in a partir de las 7pm</p>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowCheckin(true)}
                  className={`w-full rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.99] ${
                    todayCheckin
                      ? 'bg-green-50/80 dark:bg-green-900/20 border border-green-200 dark:border-green-700/50'
                      : 'liquid-glass-panel'
                  }`}
                >
                  {todayCheckin
                    ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    : <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                  }
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {todayCheckin ? 'Check-in listo' : 'Check-in de hoy'}
                    </p>
                    <p className="text-sm text-gray-400 truncate">
                      {todayCheckin ? 'Toca para ver tu feedback' : 'Nutrición · sueño · crecimiento · emocional'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
                </button>
              </>
            )}
          </>
        );
      })()}

      {/* ── Section: Mis Pilares ── */}
      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Mis Pilares</p>

      <div className="liquid-glass-panel rounded-2xl p-4">
        {/* Top row: global score + analyze button */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold ${THEME_PALETTE[colorTheme]?.text ?? 'text-blue-500'}`}>{overallScore}</span>
            <span className="text-sm text-gray-400">/ 100</span>
          </div>
          <button
            onClick={handleAiAnalysis}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/50 text-primary-600 dark:text-primary-400 text-sm font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Analizar mis pilares
          </button>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={radarData} margin={{ top: 10, right: 22, bottom: 10, left: 22 }}>
            <PolarGrid stroke="rgba(107,114,128,0.15)" />
            <PolarAngleAxis dataKey="pilar" tick={<RadarTick />} />
            <Radar dataKey="score" stroke={THEME_PALETTE[colorTheme]?.hex ?? '#3b82f6'} fill={THEME_PALETTE[colorTheme]?.hex ?? '#3b82f6'} fillOpacity={0.22} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>

        {/* Score list */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-2 px-1">
          {PILLARS.map(p => {
            const Icon = p.icon;
            const score = scores[p.key];
            return (
              <div key={p.key} className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500 dark:text-gray-400 flex-1">{p.label}</span>
                <button
                  onClick={() => setOpenInfo(openInfo === p.key ? null : p.key)}
                  className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500 transition-colors mr-0.5"
                  aria-label={`Qué es ${p.label}`}
                >
                  <Info className="w-3 h-3" />
                </button>
                <span className={`text-sm font-bold ${THEME_PALETTE[colorTheme]?.text ?? 'text-blue-500'}`}>{score}</span>
              </div>
            );
          })}
        </div>

        {/* Info tooltip */}
        {openInfo && (() => {
          const p = PILLARS.find(pl => pl.key === openInfo);
          return p ? (
            <div className="mt-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50">
              <div className="flex items-center gap-1.5 mb-1">
                <p.icon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{p.label}</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{p.desc}</p>
            </div>
          ) : null;
        })()}
      </div>

      {/* ── Section: Metas ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Metas</p>
        {goals.length < 20 && (
          <button
            onClick={handleAddNewGoal}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/50 text-primary-600 dark:text-primary-400 text-sm font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir
          </button>
        )}
      </div>

      {loadingGoals ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      ) : goals.length === 0 ? (
        <div className="liquid-glass-panel rounded-2xl text-center py-10 px-4">
          <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="w-8 h-8 text-primary-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Sin metas aún</p>
          <p className="text-sm text-gray-400 mb-4">Añade tu primera meta para empezar a darle seguimiento</p>
          <button onClick={handleAddNewGoal} className="btn-primary text-sm px-5">
            Añadir meta
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={goals.map(g => g.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-2">
              {goals.map((goal) => (
                <SortableGoalCard key={goal.id} goal={goal} onClick={setSelectedGoal} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ── Check-in modal ── */}
      {showCheckin && (
        <CheckinModal
          existing={todayCheckin}
          onSave={handleSaveCheckin}
          onClose={() => setShowCheckin(false)}
        />
      )}

      {/* ── Analysis modal ── */}
      {showAnalysis && (
        <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={() => setShowAnalysis(false)}>
          <div className="flex items-center justify-center h-full px-4 pb-20">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: 'calc(80vh - 5rem)' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary-500" />
                  <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">Análisis de longevidad</h3>
                </div>
                <button onClick={() => setShowAnalysis(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {analysisLoading ? (
                  <div className="flex flex-col items-center py-10 gap-3">
                    <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />
                    <p className="text-sm text-gray-400 text-center">Analizando tus métricas de la semana...</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{analysisText}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Goal detail panel ── */}
      {selectedGoal && (
        <div
          className="fixed z-50 flex items-end justify-center liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setSelectedGoal(null)}
        >
          <div
            className="liquid-glass-panel w-full max-w-lg rounded-t-2xl p-5 overflow-y-auto mb-20"
            style={{ maxHeight: 'calc(85vh - 80px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="relative z-10">
              <div className="w-10 h-1 bg-white/60 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(selectedGoal)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-sm font-medium transition-colors"
                  >
                    <Edit className="w-4 h-4" /> Editar
                  </button>
                  <button
                    onClick={() => { setSelectedGoal(null); setDeleteConfirm({ isOpen: true, goal: selectedGoal }); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                </div>
                <button onClick={() => setSelectedGoal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-start gap-4 mb-5">
                <img
                  src={selectedGoal.imageUrl}
                  alt={selectedGoal.description || 'Meta'}
                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0 shadow"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                    {selectedGoal.description || 'Sin descripción'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      selectedGoal.status === 'accomplished'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {selectedGoal.status === 'accomplished' ? 'Lograda' : 'En progreso'}
                    </span>
                    <span className="text-sm text-gray-400 capitalize">
                      {selectedGoal.type === 'measurable' ? 'Medible' : 'Binaria'}
                    </span>
                  </div>
                </div>
              </div>

              {selectedGoal.type === 'measurable' && (selectedGoal.target || 0) > 0 && (
                <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">Progreso</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {selectedGoal.currentValue || 0} / {selectedGoal.target} {selectedGoal.unit || ''}
                    </span>
                  </div>
                  <div className="h-2.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-primary-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, Math.round((selectedGoal.currentValue || 0) / selectedGoal.target * 100))}%` }}
                    />
                  </div>
                  {selectedGoal.status !== 'accomplished' && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        className="input-field flex-1"
                        placeholder={`Valor actual${selectedGoal.unit ? ` (${selectedGoal.unit})` : ''}`}
                        value={progressInput}
                        onChange={e => setProgressInput(e.target.value)}
                      />
                      <button onClick={handleSaveProgress} disabled={savingProgress} className="btn-primary px-5 whitespace-nowrap">
                        {savingProgress ? '...' : 'Guardar'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(selectedGoal.type || 'binary') === 'binary' && (
                <div className="mb-5">
                  <button
                    onClick={() => handleMarkDone(selectedGoal)}
                    className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
                      selectedGoal.status === 'accomplished'
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                        : 'btn-primary shadow'
                    }`}
                  >
                    {selectedGoal.status === 'accomplished' ? 'Marcar como pendiente' : '✓ Marcar como lograda'}
                  </button>
                </div>
              )}

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mb-4">
                <button
                  onClick={() => handleGetRecommendation(selectedGoal)}
                  disabled={claudeLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-primary-50 dark:from-blue-900/20 dark:to-primary-900/20 border border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:from-blue-100 font-medium text-sm disabled:opacity-60 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  {claudeLoading ? 'Obteniendo recomendación...' : 'Obtener recomendación de IA'}
                </button>
                {claudeRec && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-primary-50 dark:from-blue-900/20 dark:to-primary-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed text-justify">{claudeRec}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Goal add/edit modal ── */}
      {showGoalModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={closeGoalModal}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="relative z-10 flex justify-between items-center px-6 pt-6 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingGoal ? 'Editar meta' : 'Nueva meta'}
                </h3>
                <button onClick={closeGoalModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="relative z-10 overflow-y-auto px-6 py-4">
                <form onSubmit={handleSubmit(handleSaveGoal)} className="space-y-4">
                  <div>
                    <label className="label">Tipo de meta</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'binary',     label: 'Sí / No',  desc: 'Un logro único' },
                        { value: 'measurable', label: 'Progreso', desc: 'Seguimiento numérico' },
                      ].map(opt => (
                        <label
                          key={opt.value}
                          className={`cursor-pointer p-3 rounded-xl border-2 text-center transition-colors ${
                            goalType === opt.value
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            value={opt.value}
                            className="sr-only"
                            onChange={() => { setGoalType(opt.value); setValue('goalType', opt.value); }}
                            checked={goalType === opt.value}
                            readOnly
                          />
                          <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{opt.label}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                        </label>
                      ))}
                    </div>
                  </div>

                  {goalType === 'measurable' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Objetivo *</label>
                        <input type="number" className="input-field" placeholder="100"
                          {...register('target', { required: goalType === 'measurable' })} />
                      </div>
                      <div>
                        <label className="label">Unidad</label>
                        <input type="text" className="input-field" placeholder="km, libros, $…" {...register('unit')} />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Imagen{!editingGoal && ' *'} (máx 2MB)</label>
                    <ImageUpload
                      id="goal-image-input"
                      disabled={uploading}
                      label={editingGoal ? 'Cambiar imagen (opcional)' : 'Subir imagen de la meta'}
                      existingImageUrl={editingGoal?.imageUrl}
                    />
                    {!editingGoal && (
                      <p className="text-sm text-gray-400 mt-1">{20 - goals.length} espacios restantes</p>
                    )}
                  </div>

                  <div>
                    <label className="label">Descripción</label>
                    <textarea className="input-field" rows="2" placeholder="¿Qué significa esta meta para ti?"
                      {...register('description')} disabled={uploading} />
                  </div>

                  {editingGoal && (
                    <div>
                      <label className="label">Estado</label>
                      <select className="input-field" {...register('status')} disabled={uploading}>
                        <option value="expecting">En progreso</option>
                        <option value="accomplished">Lograda</option>
                      </select>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1 pb-2">
                    <button type="button" onClick={closeGoalModal} className="btn-secondary flex-1" disabled={uploading}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn-primary flex-1" disabled={uploading}>
                      {uploading ? 'Subiendo...' : editingGoal ? 'Actualizar' : 'Añadir meta'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, goal: null })}
        onConfirm={() => {
          handleDeleteGoal(deleteConfirm.goal);
          setDeleteConfirm({ isOpen: false, goal: null });
        }}
        title="Eliminar meta"
        message="¿Seguro que deseas eliminar esta meta? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmColor="red"
      />

      {/* ── Profile modal ── */}
      {/* ── Phrase modal ── */}
      {showPhraseModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShowPhraseModal(false)}
        >
          <div className="flex items-center justify-center h-full px-4 pb-20">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Tu frase personal</h3>
                <button onClick={() => setShowPhraseModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Una frase que te inspire o te represente
              </p>
              <textarea
                autoFocus
                className="input-field resize-none mb-4"
                rows={3}
                maxLength={150}
                placeholder="Escribe tu frase aquí..."
                value={phraseInput}
                onChange={e => setPhraseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSavePhrase(); } }}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowPhraseModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSavePhrase} className="btn-primary flex-1">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center liquid-glass-overlay px-4"
          onClick={() => setShowProfileModal(false)}
        >
          <div className="liquid-glass-panel rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="relative z-10">
              <button
                onClick={() => setShowProfileModal(false)}
                className="absolute top-0 right-0 text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center gap-2 mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/70 dark:ring-gray-700 shadow-md">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Perfil" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/70 dark:bg-gray-800/70 flex items-center justify-center">
                      <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                        {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                {user?.displayName && (
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{user.displayName}</p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>

              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
                  Color del tema
                </p>
                <div className="flex gap-3 justify-center">
                  {COLOR_THEMES.map(t => (
                    <button key={t.id} onClick={() => setColorTheme(t.id)} className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-10 h-10 rounded-full shadow-md transition-all ${
                          colorTheme === t.id ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${t.appBg} 40%, ${t.bg} 100%)` }}
                      />
                      <span className={`text-xs font-medium ${colorTheme === t.id ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { logout(); setShowProfileModal(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 font-medium text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
