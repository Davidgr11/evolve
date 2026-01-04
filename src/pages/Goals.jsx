import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { Plus, Edit, Trash2, X, Target, GripVertical } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';
import ConfirmModal from '../components/ConfirmModal';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Goal Item Component
const SortableGoalItem = ({ goal, index, editMode, onEdit, onDelete, isEditMode }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: goal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  // Dynamic grid pattern: creates a collage effect with variety on mobile and desktop
  const getGridClass = () => {
    const pattern = index % 6;
    switch (pattern) {
      case 0:
        return 'col-span-1 row-span-1'; // Normal
      case 1:
        return 'col-span-2 row-span-1'; // Wide (both mobile and desktop)
      case 2:
        return 'col-span-1 row-span-1'; // Normal
      case 3:
        return 'col-span-1 row-span-2'; // Tall (both mobile and desktop)
      case 4:
        return 'col-span-1 row-span-1'; // Normal
      case 5:
        return 'col-span-2 row-span-2'; // Large (both mobile and desktop)
      default:
        return 'col-span-1 row-span-1';
    }
  };

  const heightClass = () => {
    const pattern = index % 6;
    if (pattern === 3 || pattern === 5) {
      return 'h-full'; // Tall items fill the grid cell
    }
    return 'h-40';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${getGridClass()}`}
    >
      <div className="relative h-full">
        <img
          src={goal.imageUrl}
          alt={goal.description || 'Goal image'}
          className={`w-full ${heightClass()} object-cover rounded-lg ${
            goal.status === 'accomplished' ? 'opacity-75' : ''
          }`}
        />
        {goal.status === 'accomplished' && (
          <div className="absolute inset-0 bg-green-500 bg-opacity-30 dark:bg-green-600 dark:bg-opacity-40 rounded-lg"></div>
        )}

        {/* Drag Handle - Visible in edit mode */}
        {editMode && (
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 bg-gray-800 dark:bg-gray-700 bg-opacity-75 text-white p-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-opacity-90 transition-opacity touch-none"
          >
            <GripVertical className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Description on hover */}
      {goal.description && !editMode && (
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-75 transition-all rounded-lg flex items-center justify-center p-2">
          <p className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity text-center">
            {goal.description}
          </p>
        </div>
      )}

      {/* Edit buttons */}
      {editMode && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={() => onEdit(goal)}
            className="bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-full shadow-lg"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(goal)}
            className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const Goals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, goal: null });
  const [yearlyVersion, setYearlyVersion] = useState('');
  const [showYearlyVersionModal, setShowYearlyVersionModal] = useState(false);
  const [allYearlyVersions, setAllYearlyVersions] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [deleteVersionConfirm, setDeleteVersionConfirm] = useState({ isOpen: false, year: null });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const { register: registerVersion, handleSubmit: handleSubmitVersion, reset: resetVersion } = useForm();

  // Drag and drop sensors with mobile support
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    loadGoals();
    loadYearlyVersion();
    loadAllYearlyVersions();
  }, [user]);

  const loadGoals = async () => {
    try {
      const goalsRef = collection(db, `users/${user.uid}/goals`);
      const snapshot = await getDocs(goalsRef);
      const goalsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by order field (if it exists), otherwise by creation date
      goalsData.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });

      setGoals(goalsData);

      // Count completed goals
      const completed = goalsData.filter(g => g.status === 'accomplished').length;
      setCompletedCount(completed);
    } catch (error) {
      console.error('Failed to load goals:', error);
    }
  };

  const loadYearlyVersion = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const versionDoc = await getDoc(doc(db, `users/${user.uid}/yearlyVersions`, currentYear.toString()));
      if (versionDoc.exists()) {
        setYearlyVersion(versionDoc.data().versionText || '');
      }
    } catch (error) {
      console.error('Failed to load yearly version:', error);
    }
  };

  const loadAllYearlyVersions = async () => {
    try {
      const versionsRef = collection(db, `users/${user.uid}/yearlyVersions`);
      const snapshot = await getDocs(versionsRef);
      const versionsData = snapshot.docs.map(doc => ({
        year: doc.id,
        versionText: doc.data().versionText
      })).sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Sort by year descending
      setAllYearlyVersions(versionsData);
    } catch (error) {
      console.error('Failed to load all yearly versions:', error);
    }
  };

  const handleSaveYearlyVersion = async (data) => {
    try {
      const year = data.year || new Date().getFullYear().toString();
      await setDoc(doc(db, `users/${user.uid}/yearlyVersions`, year), {
        versionText: data.versionText,
        updatedAt: new Date().toISOString()
      });

      // If it's the current year, update the state
      if (year === new Date().getFullYear().toString()) {
        setYearlyVersion(data.versionText);
      }

      toast.success('Yearly version saved');
      setShowYearlyVersionModal(false);
      loadAllYearlyVersions(); // Reload all versions
    } catch (error) {
      toast.error('Failed to save yearly version');
      console.error(error);
    }
  };

  const handleDeleteYearlyVersion = async (year) => {
    try {
      await deleteDoc(doc(db, `users/${user.uid}/yearlyVersions`, year));

      // If it's the current year, clear the state
      if (year === new Date().getFullYear().toString()) {
        setYearlyVersion('');
      }

      toast.success('Yearly version deleted');
      loadAllYearlyVersions(); // Reload all versions
      setDeleteVersionConfirm({ isOpen: false, year: null });
    } catch (error) {
      toast.error('Failed to delete yearly version');
      console.error(error);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = goals.findIndex(goal => goal.id === active.id);
      const newIndex = goals.findIndex(goal => goal.id === over.id);

      const reorderedGoals = arrayMove(goals, oldIndex, newIndex);
      setGoals(reorderedGoals);

      // Update order in Firestore
      try {
        const batch = writeBatch(db);
        reorderedGoals.forEach((goal, index) => {
          const goalRef = doc(db, `users/${user.uid}/goals`, goal.id);
          batch.update(goalRef, { order: index });
        });
        await batch.commit();
      } catch (error) {
        console.error('Failed to update goal order:', error);
        toast.error('Failed to save new order');
        loadGoals(); // Reload to restore original order
      }
    }
  };

  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti(Object.assign({}, defaults, {
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      }));
      confetti(Object.assign({}, defaults, {
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      }));
    }, 250);
  };

  const handleSaveGoal = async (data) => {
    const fileInput = document.getElementById('goal-image-input');
    const file = fileInput?.files?.[0];

    if (editingGoal) {
      // Update existing goal
      try {
        setUploading(true);
        const wasExpecting = editingGoal.status === 'expecting';
        const isNowAccomplished = data.status === 'accomplished';

        let imageUrl = editingGoal.imageUrl;
        let imagePath = editingGoal.imagePath;

        // Check if user uploaded a new image
        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB');
            setUploading(false);
            return;
          }

          // Compress new image
          const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1024,
            useWebWorker: true
          };
          const compressedFile = await imageCompression(file, options);

          // Upload new image to Firebase Storage
          const timestamp = Date.now();
          const newImagePath = `users/${user.uid}/goals/${timestamp}_${file.name}`;
          const storageRef = ref(storage, newImagePath);
          await uploadBytes(storageRef, compressedFile);
          const newImageUrl = await getDownloadURL(storageRef);

          // Delete old image from storage
          if (editingGoal.imagePath) {
            try {
              const oldImageRef = ref(storage, editingGoal.imagePath);
              await deleteObject(oldImageRef);
            } catch (error) {
              console.error('Failed to delete old image:', error);
              // Continue anyway, don't block the update
            }
          }

          imageUrl = newImageUrl;
          imagePath = newImagePath;
        }

        await updateDoc(doc(db, `users/${user.uid}/goals`, editingGoal.id), {
          description: data.description,
          status: data.status,
          imageUrl,
          imagePath
        });

        // Trigger confetti if changed from expecting to accomplished
        if (wasExpecting && isNowAccomplished) {
          triggerConfetti();
          toast.success('Goal accomplished! 🎉');
        } else {
          toast.success('Goal updated');
        }

        loadGoals();
        setShowGoalModal(false);
        setEditingGoal(null);
        reset();
      } catch (error) {
        toast.error('Failed to update goal');
        console.error(error);
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!file) {
      toast.error('Please select an image');
      return;
    }

    if (goals.length >= 20) {
      toast.error('Maximum 20 goals allowed');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploading(true);

    try {
      // Compress image
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);

      // Upload to Firebase Storage
      const timestamp = Date.now();
      const imagePath = `users/${user.uid}/goals/${timestamp}_${file.name}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, compressedFile);
      const imageUrl = await getDownloadURL(storageRef);

      // Save to Firestore
      const goalDoc = doc(db, `users/${user.uid}/goals`, `${timestamp}`);
      await setDoc(goalDoc, {
        imageUrl,
        imagePath,
        description: data.description || '',
        status: data.status || 'expecting',
        createdAt: new Date().toISOString(),
        order: goals.length // Add to end of list
      });

      toast.success('Goal added successfully');
      loadGoals();
      setShowGoalModal(false);
      reset();
    } catch (error) {
      toast.error('Failed to add goal');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteGoal = async (goal) => {
    try {
      // Delete from storage
      const imageRef = ref(storage, goal.imagePath);
      await deleteObject(imageRef);

      // Delete from Firestore
      await deleteDoc(doc(db, `users/${user.uid}/goals`, goal.id));

      toast.success('Goal deleted');
      loadGoals();
    } catch (error) {
      toast.error('Failed to delete goal');
      console.error(error);
    }
  };

  const handleEditGoalDescription = (goal) => {
    setEditingGoal(goal);
    reset({ description: goal.description || '', status: goal.status });
    setShowGoalModal(true);
  };

  const handleAddNewGoal = () => {
    setEditingGoal(null);
    reset({ description: '', status: 'expecting' });
    setShowGoalModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Goals & Progress</h1>
        <img
          src="/Evolve.svg"
          alt="Evolve"
          className="w-8 h-8"
        />
      </div>

      {/* Yearly Version Section */}
      <div className="card">
        {completedCount > 0 && (
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/30 p-4 rounded-lg mb-4 border border-green-100 dark:border-green-800">
            <Target className="w-8 h-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{completedCount}</p>
              <p className="text-sm text-green-600 dark:text-green-300">Goal{completedCount !== 1 ? 's' : ''} Accomplished</p>
            </div>
          </div>
        )}

        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {new Date().getFullYear()} Version of Me
            </h3>
            <div className="flex gap-2">
              {!yearlyVersion && (
                <button
                  onClick={() => {
                    resetVersion({
                      versionText: '',
                      year: new Date().getFullYear().toString()
                    });
                    setShowYearlyVersionModal(true);
                  }}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
                >
                  <Edit className="w-4 h-4 inline mr-1" />
                  Add
                </button>
              )}
              {allYearlyVersions.length > 0 && (
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
                >
                  History
                </button>
              )}
            </div>
          </div>

          {yearlyVersion ? (
            <div className="bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30 p-6 rounded-lg border border-primary-100 dark:border-primary-800">
              <Target className="w-6 h-6 text-primary-600 dark:text-primary-400 mb-2" />
              <p className="text-lg font-medium text-gray-800 dark:text-gray-200 italic">"{yearlyVersion}"</p>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg text-center border border-gray-200 dark:border-gray-600">
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                Define who you want to become this year
              </p>
              <button
                onClick={() => {
                  resetVersion({
                    versionText: '',
                    year: new Date().getFullYear().toString()
                  });
                  setShowYearlyVersionModal(true);
                }}
                className="btn-primary text-sm"
              >
                Add {new Date().getFullYear()} Version
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Goals */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            My {new Date().getFullYear()} Goals
          </h2>
          {goals.length > 0 && (
            <button
              onClick={() => setEditMode(!editMode)}
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
            >
              {editMode ? 'Done' : 'Edit'}
            </button>
          )}
        </div>

        {goals.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No goals yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add images that represent your goals and dreams
            </p>
            <button
              onClick={handleAddNewGoal}
              className="btn-primary"
            >
              Add Goal
            </button>
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={goals.map(goal => goal.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[160px] gap-4 mb-4 grid-flow-dense">
                  {goals.map((goal, index) => (
                    <SortableGoalItem
                      key={goal.id}
                      goal={goal}
                      index={index}
                      editMode={editMode}
                      onEdit={handleEditGoalDescription}
                      onDelete={(goal) => setDeleteConfirm({ isOpen: true, goal })}
                      isEditMode={false}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {goals.length < 20 && (
              <button
                onClick={handleAddNewGoal}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Goal
              </button>
            )}
          </>
        )}
      </div>

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingGoal ? 'Edit Goal' : 'Add Goal'}
              </h3>
              <button
                onClick={() => {
                  setShowGoalModal(false);
                  setEditingGoal(null);
                  reset();
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(handleSaveGoal)} className="space-y-4">
              <div>
                <label className="label">Goal Image (max 2MB) {!editingGoal && '*'}</label>
                <ImageUpload
                  id="goal-image-input"
                  disabled={uploading}
                  label={editingGoal ? "Replace goal image (optional)" : "Upload your goal image"}
                  existingImageUrl={editingGoal?.imageUrl}
                />
                {!editingGoal && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {20 - goals.length} slots remaining
                  </p>
                )}
              </div>

              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  placeholder="What does this goal represent for you?"
                  {...register('description')}
                  disabled={uploading}
                />
              </div>

              <div>
                <label className="label">Status</label>
                <select
                  className="input-field"
                  {...register('status')}
                  disabled={uploading}
                >
                  <option value="expecting">Expecting</option>
                  <option value="accomplished">Accomplished</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowGoalModal(false);
                    setEditingGoal(null);
                    reset();
                  }}
                  className="btn-secondary flex-1"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : (editingGoal ? 'Update' : 'Add Goal')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Yearly Version Modal */}
      {showYearlyVersionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Your Yearly Vision
              </h3>
              <button
                onClick={() => setShowYearlyVersionModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitVersion(handleSaveYearlyVersion)} className="space-y-4">
              <div>
                <label className="label">Year</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="2026"
                  min="2020"
                  max="2050"
                  {...registerVersion('year', { required: true })}
                />
              </div>

              <div>
                <label className="label">Version of You</label>
                <textarea
                  className="input-field"
                  rows="3"
                  placeholder="E.g., 'Confident, healthy, and thriving' or 'The best version of myself'"
                  {...registerVersion('versionText', { required: true })}
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Describe who you want to become this year in a short phrase
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowYearlyVersionModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Yearly Versions History
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <button
              onClick={() => {
                resetVersion({
                  versionText: '',
                  year: (new Date().getFullYear() + 1).toString()
                });
                setShowHistoryModal(false);
                setShowYearlyVersionModal(true);
              }}
              className="btn-primary w-full mb-4 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add New Year
            </button>

            <div className="space-y-3">
              {allYearlyVersions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No yearly versions yet</p>
                </div>
              ) : (
                allYearlyVersions.map((version) => (
                  <div
                    key={version.year}
                    className={`p-4 rounded-lg border ${
                      version.year === new Date().getFullYear().toString()
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            {version.year}
                          </p>
                          {version.year === new Date().getFullYear().toString() && (
                            <span className="text-xs px-2 py-1 rounded-full bg-primary-600 dark:bg-primary-500 text-white font-medium">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-base font-medium text-gray-800 dark:text-gray-200 italic">
                          "{version.versionText}"
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            resetVersion({
                              versionText: version.versionText,
                              year: version.year
                            });
                            setShowHistoryModal(false);
                            setShowYearlyVersionModal(true);
                          }}
                          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 p-2"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setShowHistoryModal(false);
                            setDeleteVersionConfirm({ isOpen: true, year: version.year });
                          }}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-2"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="btn-secondary w-full"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Version Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteVersionConfirm.isOpen}
        onClose={() => setDeleteVersionConfirm({ isOpen: false, year: null })}
        onConfirm={() => handleDeleteYearlyVersion(deleteVersionConfirm.year)}
        title="Delete Yearly Version"
        message={`Are you sure you want to delete the ${deleteVersionConfirm.year} version? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />

      {/* Delete Goal Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, goal: null })}
        onConfirm={() => handleDeleteGoal(deleteConfirm.goal)}
        title="Delete Goal"
        message="Are you sure you want to delete this goal? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />
    </div>
  );
};

export default Goals;
