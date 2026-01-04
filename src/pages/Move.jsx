import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import { Plus, Play, Edit, Trash2, X, Activity, Flame, Route, Dumbbell } from 'lucide-react';
import RoutineModal from '../components/RoutineModal';
import ConfirmModal from '../components/ConfirmModal';

const Move = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, routine: null });
  const [stats, setStats] = useState({
    month: { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 },
    year: { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 }
  });

  useEffect(() => {
    loadRoutines();
    loadStats();
  }, [user]);

  const loadRoutines = async () => {
    try {
      const routinesRef = collection(db, `users/${user.uid}/routines`);
      const snapshot = await getDocs(routinesRef);
      const routinesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRoutines(routinesData);
    } catch (error) {
      toast.error('Failed to load routines');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const monthDoc = await getDocs(collection(db, `users/${user.uid}/statistics/move/${currentYear}`));

      let monthStats = { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 };
      let yearStats = { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 };

      monthDoc.forEach((doc) => {
        const data = doc.data();
        const month = parseInt(doc.id);

        if (month === currentMonth) {
          monthStats = data;
        }

        yearStats.stretch += data.stretch || 0;
        yearStats.workout += data.workout || 0;
        yearStats.running += data.running || 0;
        yearStats.sports += data.sports || 0;
        yearStats.effort = [...yearStats.effort, ...(data.effort || [])];
        yearStats.calories += data.calories || 0;
        yearStats.km += data.km || 0;
      });

      setStats({ month: monthStats, year: yearStats });
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const calculateAvgEffort = (effortArray) => {
    if (!effortArray || effortArray.length === 0) return 0;
    const sum = effortArray.reduce((acc, val) => acc + val, 0);
    return (sum / effortArray.length).toFixed(1);
  };

  const handleCreateRoutine = () => {
    setEditingRoutine(null);
    setShowModal(true);
  };

  const handleEditRoutine = (routine) => {
    setEditingRoutine(routine);
    setShowModal(true);
  };

  const handleDeleteRoutine = async (routine) => {
    try {
      // Delete exercise images from storage
      for (const exercise of routine.exercises) {
        if (exercise.imageUrl && exercise.imagePath) {
          try {
            const imageRef = ref(storage, exercise.imagePath);
            await deleteObject(imageRef);
          } catch (error) {
            console.error('Error deleting image:', error);
          }
        }
      }

      // Delete routine document
      await deleteDoc(doc(db, `users/${user.uid}/routines`, routine.id));
      toast.success('Routine deleted');
      loadRoutines();
    } catch (error) {
      toast.error('Failed to delete routine');
      console.error(error);
    }
  };

  const handleSaveRoutine = async (routineData) => {
    try {
      if (editingRoutine) {
        // Update existing routine
        await updateDoc(doc(db, `users/${user.uid}/routines`, editingRoutine.id), routineData);
        toast.success('Routine updated successfully');
      } else {
        // Create new routine
        await addDoc(collection(db, `users/${user.uid}/routines`), {
          ...routineData,
          createdAt: new Date().toISOString()
        });
        toast.success('Routine created successfully');
      }
      setShowModal(false);
      loadRoutines();
    } catch (error) {
      toast.error('Failed to save routine');
      console.error(error);
    }
  };

  const getTypeColor = (type) => {
    const colors = {
      stretch: 'bg-blue-100 text-blue-800',
      workout: 'bg-red-100 text-red-800',
      running: 'bg-green-100 text-green-800',
      sports: 'bg-purple-100 text-purple-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading routines...</div>
      </div>
    );
  }

  const now = new Date();
  const currentMonth = now.toLocaleString('en-US', { month: 'short' });
  const currentYear = now.getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Exercise</h1>
        <img
          src="/Evolve.svg"
          alt="Evolve"
          className="w-8 h-8"
        />
      </div>

      {/* Exercise Statistics */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Statistics</h2>

        {/* Current Month Row */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-lg font-semibold text-gray-700 dark:text-gray-300 min-w-[50px]">{currentMonth}</span>
            <div className="grid grid-cols-4 gap-2 flex-1">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.month.stretch}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Stretch</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.month.workout}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Workout</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.month.running}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Running</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.month.sports}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Sports</span>
              </div>
            </div>
          </div>
        </div>

        {/* Current Year Row */}
        <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-700 dark:text-gray-300 min-w-[50px]">{currentYear}</span>
            <div className="grid grid-cols-4 gap-2 flex-1">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.year.stretch}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Stretch</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.year.workout}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Workout</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.year.running}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Running</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-1 border-2 border-gray-200 dark:border-gray-600">
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.year.sports}</span>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Sports</span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Stats with Icons */}
        <div className="grid grid-cols-3 gap-4">
          {/* Effort */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Effort</span>
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {calculateAvgEffort(stats.month.effort)}/5
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {calculateAvgEffort(stats.year.effort)}/5 yearly
            </div>
          </div>

          {/* Calories */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-accent-100 dark:bg-accent-900 flex items-center justify-center">
                <Flame className="w-4 h-4 text-accent-600 dark:text-accent-400" />
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calories</span>
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {stats.month.calories}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {stats.year.calories} yearly
            </div>
          </div>

          {/* Distance */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                <Route className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Distance</span>
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {stats.month.km.toFixed(1)} km
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {stats.year.km.toFixed(1)} km yearly
            </div>
          </div>
        </div>
      </div>

      {/* My Routines */}
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Routines</h2>
          <button
            onClick={handleCreateRoutine}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Routine
          </button>
        </div>

      {routines.length === 0 ? (
        <div className="text-center py-12">
          <Dumbbell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No routines yet</h3>
          <p className="text-gray-500 mb-4">Create your first routine to get started</p>
          <button onClick={handleCreateRoutine} className="btn-primary">
            Create Routine
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {routines.map((routine) => (
            <div key={routine.id} className="bg-white dark:bg-gray-700 rounded-lg shadow-md dark:shadow-gray-900/50 p-4 border border-transparent dark:border-gray-600 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-1">
                    {routine.name}
                  </h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(routine.type)}`}>
                    {routine.type}
                  </span>
                </div>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                <p>{routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}</p>
                <p>{routine.series} series</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/routine/${routine.id}`)}
                  className="flex-1 bg-primary-500 hover:bg-primary-600 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Start
                </button>
                <button
                  onClick={() => handleEditRoutine(routine)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-3 rounded-lg transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirm({ isOpen: true, routine })}
                  className="bg-red-100 hover:bg-red-200 text-red-700 py-2 px-3 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
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
        title="Delete Routine"
        message="Are you sure you want to delete this routine? All exercise images will also be deleted."
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />
    </div>
  );
};

export default Move;
