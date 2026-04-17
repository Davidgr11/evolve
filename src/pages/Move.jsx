import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import toast from '../utils/toast';
import {
  Plus, Play, Edit, Trash2, Flame, Route,
  Dumbbell, Sparkles, Trophy, Zap, Wind, PersonStanding, Swords
} from 'lucide-react';
import RoutineModal from '../components/RoutineModal';
import ConfirmModal from '../components/ConfirmModal';

// Type config: icon, gradient, text color
const TYPE_CONFIG = {
  stretch: {
    icon: Wind,
    gradient: 'from-violet-400/20 to-purple-300/10',
    border: 'border-violet-200 dark:border-violet-800',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
    pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    dot: '#a78bfa',
  },
  workout: {
    icon: Dumbbell,
    gradient: 'from-orange-400/20 to-red-300/10',
    border: 'border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    pill: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    dot: '#f97316',
  },
  running: {
    icon: Zap,
    gradient: 'from-green-400/20 to-emerald-300/10',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    pill: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    dot: '#4ade80',
  },
  sports: {
    icon: Swords,
    gradient: 'from-purple-400/20 to-violet-300/10',
    border: 'border-purple-200 dark:border-purple-800',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    pill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    dot: '#a78bfa',
  },
};

const getWeeklyDone = (routine) => {
  if (!routine.runDates?.length) return 0;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split('T')[0];
  return routine.runDates.filter(d => d >= mondayStr).length;
};

const getStatusBorder = (routine) => {
  if (!routine.lastRun) return 'border-l-gray-200 dark:border-l-gray-700';
  const days = Math.floor((Date.now() - new Date(routine.lastRun)) / 86400000);
  if (days <= 7)  return 'border-l-green-400';
  if (days <= 14) return 'border-l-yellow-400';
  return 'border-l-red-400';
};

const formatLastRun = (routine) => {
  if (!routine.lastRun) return null;
  const days = Math.floor((Date.now() - new Date(routine.lastRun)) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `hace ${days}d`;
};

const Move = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, routine: null });
  const [stats, setStats] = useState({
    month: { stretch: 0, workout: 0, running: 0, sports: 0, calories: 0, km: 0 },
    year:  { stretch: 0, workout: 0, running: 0, sports: 0, calories: 0, km: 0 }
  });
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeAnalysis, setClaudeAnalysis] = useState('');

  const now = new Date();
  const currentMonthName = now.toLocaleString('es-MX', { month: 'long' }).replace(/^\w/, c => c.toUpperCase());
  const currentYear = now.getFullYear();
  const monthsElapsed = now.getMonth() + 1;

  useEffect(() => {
    loadRoutines();
    loadStats();
  }, [user]);

  const loadRoutines = async () => {
    try {
      const snapshot = await getDocs(collection(db, `users/${user.uid}/routines`));
      setRoutines(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error('Error al cargar las rutinas'); }
    finally { setLoading(false); }
  };

  const loadStats = async () => {
    try {
      const curMonth = now.getMonth() + 1;
      const snapshot = await getDocs(collection(db, `users/${user.uid}/statistics/move/${currentYear}`));
      let m = { stretch: 0, workout: 0, running: 0, sports: 0, calories: 0, km: 0 };
      let y = { stretch: 0, workout: 0, running: 0, sports: 0, calories: 0, km: 0 };
      snapshot.forEach((d) => {
        const data = d.data();
        const month = parseInt(d.id);
        if (month === curMonth) m = data;
        y.stretch  += data.stretch  || 0;
        y.workout  += data.workout  || 0;
        y.running  += data.running  || 0;
        y.sports   += data.sports   || 0;
        y.calories += data.calories || 0;
        y.km       += data.km       || 0;
      });
      setStats({ month: m, year: y });
    } catch (err) { console.error(err); }
  };

  const totalMonth = (stats.month.stretch || 0) + (stats.month.workout || 0) +
    (stats.month.running || 0) + (stats.month.sports || 0);

  const handleAnalyze = async () => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!apiKey || apiKey === 'your_claude_api_key_here') {
      toast.error('Add your Claude API key to the .env file');
      return;
    }
    setClaudeLoading(true);
    setClaudeAnalysis('');
    try {
      const totalYear = stats.year.stretch + stats.year.workout + stats.year.running + stats.year.sports;
      const prompt = `Datos de ejercicio de ${currentMonthName} ${currentYear}:
- Sesiones: ${totalMonth} (estiramiento ${stats.month.stretch}, entrenamiento ${stats.month.workout}, correr ${stats.month.running}, deportes ${stats.month.sports})
- Calorías: ${stats.month.calories} kcal, Distancia: ${(stats.month.km || 0).toFixed(1)} km
Acumulado del año (${monthsElapsed}/12 meses): ${totalYear} sesiones, ${stats.year.calories} kcal, ${(stats.year.km || 0).toFixed(1)} km

Responde solo en texto plano — sin markdown, sin asteriscos, sin encabezados. Sé conciso: 1 oración sobre lo que más destaca, 1 oración con la acción más útil que puedo tomar ahora mismo. Responde en español.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 120,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setClaudeAnalysis(data.content[0].text);
    } catch (err) {
      toast.error('Failed to get analysis');
      console.error(err);
    } finally { setClaudeLoading(false); }
  };

  const handleSaveRoutine = async (routineData) => {
    try {
      if (editingRoutine) {
        await updateDoc(doc(db, `users/${user.uid}/routines`, editingRoutine.id), routineData);
        toast.success('Rutina actualizada');
      } else {
        await addDoc(collection(db, `users/${user.uid}/routines`), {
          ...routineData, createdAt: new Date().toISOString()
        });
        toast.success('Rutina creada');
      }
      setShowModal(false);
      loadRoutines();
    } catch { toast.error('Error al guardar la rutina'); }
  };

  const handleDeleteRoutine = async (routine) => {
    try {
      for (const ex of routine.exercises) {
        if (ex.imagePath) { try { await deleteObject(ref(storage, ex.imagePath)); } catch {} }
      }
      await deleteDoc(doc(db, `users/${user.uid}/routines`, routine.id));
      toast.success('Rutina eliminada');
      loadRoutines();
    } catch { toast.error('Error al eliminar la rutina'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500">Cargando...</div>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
            Actividad
          </h1>
        </div>
        <button
          onClick={() => { setEditingRoutine(null); setShowModal(true); }}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> Nueva Rutina
        </button>
      </div>

      {/* Annual stats */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
          {currentYear}
        </p>
        <div className="liquid-glass-panel rounded-2xl p-5">
          <div className="flex items-stretch">
            <div className="flex-1 flex flex-col items-center gap-1">
              <Flame className="w-5 h-5 text-orange-400 mb-0.5" />
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">
                {stats.year.calories.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">kcal</p>
            </div>
            <div className="w-px bg-gray-100 dark:bg-gray-700 mx-4" />
            <div className="flex-1 flex flex-col items-center gap-1">
              <Route className="w-5 h-5 text-blue-400 mb-0.5" />
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">
                {(stats.year.km || 0).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">km</p>
            </div>
          </div>
        </div>
      </div>

      {/* Month — AI analyze */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            {currentMonthName}
          </p>
          <button
            onClick={handleAnalyze}
            disabled={claudeLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-60 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {claudeLoading ? 'Analizando...' : 'Analizar mes'}
          </button>
        </div>

        {claudeAnalysis && (
          <div className="px-4 py-3 liquid-glass-panel rounded-2xl">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed text-justify">{claudeAnalysis}</p>
          </div>
        )}
      </div>

      {/* Routines */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
          Mis Rutinas
        </p>

        {routines.length === 0 ? (
          <div className="text-center py-16">
            <Dumbbell className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">Sin rutinas aún</p>
            <button onClick={() => { setEditingRoutine(null); setShowModal(true); }} className="btn-primary">
              Crear rutina
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {routines.map((routine) => {
              const cfg = TYPE_CONFIG[routine.type] || TYPE_CONFIG.workout;
              const TypeIcon = cfg.icon;
              const lastRun = formatLastRun(routine);
              const statusBorder = getStatusBorder(routine);

              const weeklyDone = getWeeklyDone(routine);
              const weeklyGoal = routine.weeklyGoal || 0;
              const onTrack = weeklyGoal > 0 && weeklyDone >= weeklyGoal;

              return (
                <div
                  key={routine.id}
                  className={`relative overflow-hidden rounded-2xl border-l-4 ${statusBorder} liquid-glass-panel shadow-sm hover:shadow-md transition-shadow`}
                >

                  <div className="relative p-4">
                    {/* Type badge */}
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide mb-2 ${cfg.badge}`}>
                      {routine.type}
                    </span>

                    {/* Name */}
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 leading-tight mb-1">
                      {routine.name}
                    </h3>

                    {/* Meta */}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {routine.exercises?.length || 0} ejercicios · {routine.series} ronda{routine.series !== 1 ? 's' : ''}
                    </p>

                    {/* Weekly goal progress */}
                    {weeklyGoal > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex gap-1">
                          {Array.from({ length: weeklyGoal }, (_, i) => (
                            <div
                              key={i}
                              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                                i < weeklyDone
                                  ? onTrack ? 'bg-green-400' : 'bg-amber-400'
                                  : 'bg-gray-200 dark:bg-gray-600'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {weeklyDone}/{weeklyGoal} esta semana
                          {onTrack && <span className="text-green-500 ml-1">✓</span>}
                        </span>
                      </div>
                    )}

                    {/* Last run + sessions */}
                    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-4">
                      {lastRun && (
                        <span className="flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: cfg.dot }}
                          />
                          {lastRun}
                        </span>
                      )}
                      {(routine.totalRuns || 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Trophy className="w-3 h-3" />
                          {routine.totalRuns} sesión{routine.totalRuns !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/routine/${routine.id}`)}
                        className="flex-1 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors"
                      >
                        <Play className="w-4 h-4" /> Iniciar
                      </button>
                      <button
                        onClick={() => { setEditingRoutine(routine); setShowModal(true); }}
                        className="bg-white/70 dark:bg-gray-700/70 hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 py-2 px-3 rounded-xl border border-white/60 dark:border-gray-600/60 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ isOpen: true, routine })}
                        className="bg-white/70 dark:bg-gray-700/70 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 py-2 px-3 rounded-xl border border-white/60 dark:border-gray-600/60 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <RoutineModal
          routine={editingRoutine}
          onClose={() => setShowModal(false)}
          onSave={handleSaveRoutine}
        />
      )}

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, routine: null })}
        onConfirm={() => handleDeleteRoutine(deleteConfirm.routine)}
        title="Eliminar rutina"
        message="¿Seguro que quieres eliminar esta rutina? Las imágenes de los ejercicios también se eliminarán."
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmColor="red"
      />
    </div>
  );
};

export default Move;
