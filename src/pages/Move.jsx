import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const THEME_HEX = { blue: '#3b82f6', purple: '#8b5cf6', orange: '#f97316', teal: '#0d9488' };
import { db, storage } from '../utils/firebase';
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { callClaude } from '../utils/cloudApi';
import { ref, deleteObject } from 'firebase/storage';
import toast from '../utils/toast';
import {
  Plus, Play, Edit, Trash2, Flame, Route,
  Dumbbell, Sparkles, Trophy, Zap, Wind, PersonStanding, Swords, GripVertical
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

const getStatusColor = (routine) => {
  if (!routine.lastRun) return '#9ca3af';
  const days = Math.floor((Date.now() - new Date(routine.lastRun)) / 86400000);
  if (days <= 7)  return '#4ade80';
  if (days <= 14) return '#facc15';
  return '#f87171';
};

const formatLastRun = (routine) => {
  if (!routine.lastRun) return null;
  const days = Math.floor((Date.now() - new Date(routine.lastRun)) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `hace ${days}d`;
};

// ── SortableRoutineCard ───────────────────────────────────────────────────────
const SortableRoutineCard = ({ routine, colorTheme, onStart, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: routine.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const statusColor = getStatusColor(routine);
  const themeHex = THEME_HEX[colorTheme] ?? '#3b82f6';
  const lastRun = formatLastRun(routine);
  const weeklyDone = getWeeklyDone(routine);
  const weeklyGoal = routine.weeklyGoal || 0;
  const onTrack = weeklyGoal > 0 && weeklyDone >= weeklyGoal;
  const exerciseLabel = routine.youtubeUrl
    ? 'YouTube'
    : `${routine.exercises?.length || 0} ej.`;

  return (
    <div ref={setNodeRef} style={style} className="liquid-glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Drag handle */}
        <div
          {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-gray-300 dark:text-gray-600 flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Status dot */}
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
              {routine.name}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{ backgroundColor: themeHex + '18', color: themeHex }}
            >
              {routine.type}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-gray-500">{exerciseLabel}</span>
            {lastRun && (
              <>
                <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{lastRun}</span>
              </>
            )}
            {weeklyGoal > 0 && (
              <>
                <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
                <span className="text-xs font-medium" style={{ color: onTrack ? themeHex : undefined }}>
                  {weeklyDone}/{weeklyGoal}{onTrack ? ' ✓' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onEdit} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onStart}
            className="ml-1 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white active:opacity-80 transition-opacity"
            style={{ backgroundColor: themeHex }}
          >
            <Play className="w-3 h-3" fill="currentColor" /> Iniciar
          </button>
        </div>
      </div>

      {/* Weekly progress bar */}
      {weeklyGoal > 0 && (
        <div className="flex gap-1 px-4 pb-2.5 ml-9">
          {Array.from({ length: weeklyGoal }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i >= weeklyDone ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
              style={i < weeklyDone ? { backgroundColor: themeHex } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Move = () => {
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();
  const [routines, setRoutines] = useState([]);
  const [routineOrder, setRoutineOrder] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, routine: null });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );
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
      const loaded = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRoutines(loaded);
      try {
        const stored = JSON.parse(localStorage.getItem('routineOrder') || '[]');
        const loadedIds = loaded.map(r => r.id);
        const validStored = stored.filter(id => loadedIds.includes(id));
        const missing = loadedIds.filter(id => !validStored.includes(id));
        setRoutineOrder([...validStored, ...missing]);
      } catch {
        setRoutineOrder(loaded.map(r => r.id));
      }
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
    setClaudeLoading(true);
    setClaudeAnalysis('');
    try {
      const totalYear = stats.year.stretch + stats.year.workout + stats.year.running + stats.year.sports;
      const prompt = `Datos de ejercicio de ${currentMonthName} ${currentYear}:
- Sesiones: ${totalMonth} (estiramiento ${stats.month.stretch}, entrenamiento ${stats.month.workout}, correr ${stats.month.running}, deportes ${stats.month.sports})
- Calorías: ${stats.month.calories} kcal, Distancia: ${(stats.month.km || 0).toFixed(1)} km
Acumulado del año (${monthsElapsed}/12 meses): ${totalYear} sesiones, ${stats.year.calories} kcal, ${(stats.year.km || 0).toFixed(1)} km

Responde solo en texto plano — sin markdown, sin asteriscos, sin encabezados. Sé conciso: 1 oración sobre lo que más destaca, 1 oración con la acción más útil que puedo tomar ahora mismo. Responde en español.`;

      const text = await callClaude(prompt, 120);
      setClaudeAnalysis(text);
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

  const handleDragEndRoutines = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = routineOrder.indexOf(active.id);
    const newIdx = routineOrder.indexOf(over.id);
    const newOrder = arrayMove(routineOrder, oldIdx, newIdx);
    setRoutineOrder(newOrder);
    localStorage.setItem('routineOrder', JSON.stringify(newOrder));
  };

  const sortedRoutines = routineOrder
    .map(id => routines.find(r => r.id === id))
    .filter(Boolean);

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
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
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">
                {stats.year.calories.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">kcal</p>
            </div>
            <div className="w-px bg-gray-100 dark:bg-gray-700 mx-4" />
            <div className="flex-1 flex flex-col items-center gap-1">
              <Route className="w-5 h-5 text-blue-400 mb-0.5" />
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">
                {(stats.year.km || 0).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">km</p>
            </div>
            <div className="w-px bg-gray-100 dark:bg-gray-700 mx-4" />
            <div className="flex-1 flex flex-col items-center gap-1">
              <Dumbbell className="w-5 h-5 text-purple-400 mb-0.5" />
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">
                {(stats.year.stretch || 0) + (stats.year.workout || 0) + (stats.year.running || 0) + (stats.year.sports || 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">rutinas</p>
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

        {sortedRoutines.length === 0 ? (
          <div className="text-center py-16">
            <Dumbbell className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">Sin rutinas aún</p>
            <button onClick={() => { setEditingRoutine(null); setShowModal(true); }} className="btn-primary">
              Crear rutina
            </button>
          </div>
        ) : (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndRoutines}>
            <SortableContext items={routineOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {sortedRoutines.map((routine) => (
                  <SortableRoutineCard
                    key={routine.id}
                    routine={routine}
                    colorTheme={colorTheme}
                    onStart={() => navigate(`/routine/${routine.id}`)}
                    onEdit={() => { setEditingRoutine(routine); setShowModal(true); }}
                    onDelete={() => setDeleteConfirm({ isOpen: true, routine })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
