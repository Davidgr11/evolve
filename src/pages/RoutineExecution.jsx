import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import toast from '../utils/toast';
import { Play, Pause, X, Check, ChevronRight } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const THEME_HEX = { blue: '#3b82f6', purple: '#8b5cf6', orange: '#f97316', teal: '#0d9488' };

const TYPE_LABEL = { stretch: 'Estiramiento', workout: 'Entrenamiento', running: 'Correr', sports: 'Deporte' };

const RoutineExecution = () => {
  const { routineId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSeries, setCurrentSeries] = useState(1);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const timerRef = useRef(null);

  const { register, handleSubmit } = useForm();

  const themeHex = THEME_HEX[colorTheme] ?? '#3b82f6';

  useEffect(() => {
    loadRoutine();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [routineId, user]);

  useEffect(() => {
    if (!isPaused && routine) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, routine]);

  const loadRoutine = async () => {
    try {
      const routineDoc = await getDoc(doc(db, `users/${user.uid}/routines`, routineId));
      if (routineDoc.exists()) {
        setRoutine({ id: routineDoc.id, ...routineDoc.data() });
      } else {
        toast.error('Rutina no encontrada');
        navigate('/move');
      }
    } catch (error) {
      toast.error('Error al cargar la rutina');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleComplete = () => {
    const isLastExercise = currentExerciseIndex === routine.exercises.length - 1;
    const isLastSeries = currentSeries === routine.series;

    if (isLastExercise && isLastSeries) {
      if (routine.type !== 'stretch') {
        setShowStatsModal(true);
      } else {
        saveStatistics();
      }
    } else if (isLastExercise) {
      setCurrentSeries(prev => prev + 1);
      setCurrentExerciseIndex(0);
    } else {
      setCurrentExerciseIndex(prev => prev + 1);
    }
  };

  const handleExit = () => {
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    navigate('/move');
  };

  const saveStatistics = async (statsData = {}) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const statsRef = doc(db, `users/${user.uid}/statistics/move/${year}/${month}`);
      const statsDoc = await getDoc(statsRef);

      if (statsDoc.exists()) {
        const updates = {
          [routine.type]: increment(1)
        };

        if (statsData.effort) {
          const currentEffort = statsDoc.data().effort || [];
          updates.effort = [...currentEffort, parseInt(statsData.effort)];
        }

        if (statsData.calories) {
          updates.calories = increment(parseInt(statsData.calories));
        }

        if (statsData.km) {
          updates.km = increment(parseFloat(statsData.km));
        }

        await updateDoc(statsRef, updates);
      } else {
        const newStats = {
          stretch: 0, workout: 0, running: 0, sports: 0,
          effort: [], calories: 0, km: 0
        };

        newStats[routine.type] = 1;
        if (statsData.effort) newStats.effort = [parseInt(statsData.effort)];
        if (statsData.calories) newStats.calories = parseInt(statsData.calories);
        if (statsData.km) newStats.km = parseFloat(statsData.km);

        await setDoc(statsRef, newStats);
      }

      const todayStr = new Date().toISOString().split('T')[0];
      await updateDoc(doc(db, `users/${user.uid}/routines`, routineId), {
        lastRun: new Date().toISOString(),
        totalRuns: increment(1),
        runDates: arrayUnion(todayStr),
      });

      toast.success('¡Rutina completada!');
      navigate('/move');
    } catch (error) {
      toast.error('Error al guardar estadísticas');
      console.error(error);
    }
  };

  const onSubmitStats = (data) => {
    saveStatistics(data);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen app-bg">
        <div className="text-gray-500 dark:text-gray-400">Cargando rutina...</div>
      </div>
    );
  }

  if (!routine) return null;

  const currentExercise = routine.exercises[currentExerciseIndex];
  const isLastExercise = currentExerciseIndex === routine.exercises.length - 1;
  const isLastSeries = currentSeries === routine.series;
  const totalSteps = routine.series * routine.exercises.length;
  const completedSteps = (currentSeries - 1) * routine.exercises.length + currentExerciseIndex;
  const progressPct = Math.round(completedSteps / totalSteps * 100);

  const btnLabel = isLastExercise && isLastSeries
    ? 'Completar rutina'
    : isLastExercise
    ? `Siguiente ronda (${currentSeries + 1}/${routine.series})`
    : 'Siguiente ejercicio';

  return (
    <div
      className="min-h-screen app-bg flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Top bar */}
      <div className="flex justify-between items-center px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {TYPE_LABEL[routine.type] ?? routine.type}
          </p>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">
            {routine.name}
          </h1>
        </div>
        <button
          onClick={handleExit}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/60 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Timer + progress */}
      <div className="liquid-glass-panel mx-4 rounded-2xl p-5 mb-4">
        <div
          className="text-6xl font-mono font-bold text-center leading-none mb-4"
          style={{ color: themeHex }}
        >
          {formatTime(elapsedTime)}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, backgroundColor: themeHex }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Ronda <span className="font-semibold text-gray-700 dark:text-gray-300">{currentSeries}</span>/{routine.series}
          </span>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors"
            style={{ color: themeHex, backgroundColor: themeHex + '15' }}
          >
            {isPaused
              ? <><Play className="w-3.5 h-3.5" /> Reanudar</>
              : <><Pause className="w-3.5 h-3.5" /> Pausar</>}
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{currentExerciseIndex + 1}</span>/{routine.exercises.length}
          </span>
        </div>
      </div>

      {/* Exercise card */}
      <div className="mx-4 liquid-glass-panel rounded-2xl overflow-hidden mb-4">
        {currentExercise.imageUrl && (
          <div className="pt-2.5 px-2.5">
            <div className="w-full aspect-square rounded-2xl overflow-hidden">
              <img
                src={currentExercise.imageUrl}
                alt={currentExercise.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        <div className="p-5">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight mb-3">
            {currentExercise.name}
          </h2>

          {currentExercise.repetitions && (
            <div
              className="inline-flex items-center px-4 py-2 rounded-xl mb-3 self-start"
              style={{ backgroundColor: themeHex + '15', color: themeHex }}
            >
              <span className="text-base font-semibold">{currentExercise.repetitions}</span>
            </div>
          )}

          {currentExercise.instructions && (
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {currentExercise.instructions}
            </p>
          )}
        </div>
      </div>

      {/* Complete button */}
      <div
        className="px-4"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleComplete}
          className="w-full text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-opacity active:opacity-80"
          style={{ backgroundColor: themeHex }}
        >
          {isLastExercise && isLastSeries
            ? <Check className="w-5 h-5" />
            : <ChevronRight className="w-5 h-5" />}
          {btnLabel}
        </button>
      </div>

      {/* Statistics Modal */}
      {showStatsModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-gray-100">¡Rutina completada!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Registra los datos de tu sesión (opcional)</p>

              <form onSubmit={handleSubmit(onSubmitStats)} className="space-y-4">
                <div>
                  <label className="label">Calorías</label>
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    placeholder="kcal quemadas"
                    {...register('calories')}
                  />
                </div>

                <div>
                  <label className="label">Kilómetros</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="input-field"
                    placeholder="km recorridos"
                    {...register('km')}
                  />
                </div>

                <button type="submit" className="btn-primary w-full">
                  Guardar y completar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={confirmExit}
        title="Salir de la rutina"
        message="¿Seguro que quieres salir sin guardar tu progreso?"
        confirmText="Salir"
        cancelText="Continuar"
        confirmColor="red"
      />
    </div>
  );
};

export default RoutineExecution;
