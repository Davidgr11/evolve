import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Play, Pause, X, Check, ChevronRight } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const RoutineExecution = () => {
  const { routineId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSeries, setCurrentSeries] = useState(1);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const timerRef = useRef(null);

  const { register, handleSubmit, formState: { errors } } = useForm();

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
        toast.error('Routine not found');
        navigate('/move');
      }
    } catch (error) {
      toast.error('Failed to load routine');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleComplete = () => {
    const isLastExercise = currentExerciseIndex === routine.exercises.length - 1;
    const isLastSeries = currentSeries === routine.series;

    if (isLastExercise && isLastSeries) {
      // Finished all exercises
      if (routine.type !== 'stretch') {
        setShowStatsModal(true);
      } else {
        saveStatistics();
      }
    } else if (isLastExercise) {
      // Move to next series
      setCurrentSeries(prev => prev + 1);
      setCurrentExerciseIndex(0);
    } else {
      // Move to next exercise
      setCurrentExerciseIndex(prev => prev + 1);
    }
  };

  const handleExit = () => {
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    toast.success('Routine exited');
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
          stretch: 0,
          workout: 0,
          running: 0,
          sports: 0,
          effort: [],
          calories: 0,
          km: 0
        };

        newStats[routine.type] = 1;
        if (statsData.effort) {
          newStats.effort = [parseInt(statsData.effort)];
        }
        if (statsData.calories) {
          newStats.calories = parseInt(statsData.calories);
        }
        if (statsData.km) {
          newStats.km = parseFloat(statsData.km);
        }

        await setDoc(statsRef, newStats);
      }

      toast.success('Routine completed successfully!');
      navigate('/move');
    } catch (error) {
      toast.error('Failed to save statistics');
      console.error(error);
    }
  };

  const onSubmitStats = (data) => {
    saveStatistics(data);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading routine...</div>
      </div>
    );
  }

  if (!routine) return null;

  const currentExercise = routine.exercises[currentExerciseIndex];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{routine.name}</h1>
          <button onClick={handleExit} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Timer */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 text-center shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-5xl font-mono font-bold mb-2 text-gray-900 dark:text-gray-100">{formatTime(elapsedTime)}</div>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2 mx-auto"
          >
            {isPaused ? (
              <>
                <Play className="w-5 h-5" /> Resume
              </>
            ) : (
              <>
                <Pause className="w-5 h-5" /> Pause
              </>
            )}
          </button>
        </div>

        {/* Progress */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>
              Exercise {currentExerciseIndex + 1} of {routine.exercises.length}
            </span>
            <span>
              Series {currentSeries} of {routine.series}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-500 dark:bg-primary-400 h-2 rounded-full transition-all"
              style={{
                width: `${
                  ((currentSeries - 1) * routine.exercises.length +
                    currentExerciseIndex +
                    1) /
                  (routine.series * routine.exercises.length) *
                  100
                }%`
              }}
            />
          </div>
        </div>

        {/* Current Exercise */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{currentExercise.name}</h2>

          {currentExercise.imageUrl && (
            <img
              src={currentExercise.imageUrl}
              alt={currentExercise.name}
              className="w-full h-64 object-cover rounded-lg mb-4"
            />
          )}

          {currentExercise.repetitions && (
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{currentExercise.repetitions}</p>
            </div>
          )}
        </div>

        {/* Complete Button */}
        <button
          onClick={handleComplete}
          className="w-full bg-primary-500 hover:bg-primary-600 text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Check className="w-6 h-6" />
          Complete Exercise
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Statistics Modal */}
      {showStatsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Workout Complete!</h2>

            <form onSubmit={handleSubmit(onSubmitStats)} className="space-y-4">
              <div>
                <label className="label">Effort (1-5) *</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  className="input-field"
                  {...register('effort', {
                    required: 'Effort is required',
                    min: { value: 1, message: 'Minimum 1' },
                    max: { value: 5, message: 'Maximum 5' }
                  })}
                />
                {errors.effort && (
                  <p className="text-red-500 text-sm mt-1">{errors.effort.message}</p>
                )}
              </div>

              <div>
                <label className="label">Calories (optional)</label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  {...register('calories')}
                />
              </div>

              <div>
                <label className="label">Kilometers (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="input-field"
                  {...register('km')}
                />
              </div>

              <button type="submit" className="btn-primary w-full">
                Save & Complete
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      <ConfirmModal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={confirmExit}
        title="Exit Routine"
        message="Are you sure you want to exit without saving your progress?"
        confirmText="Exit"
        cancelText="Continue"
        confirmColor="red"
      />
    </div>
  );
};

export default RoutineExecution;
