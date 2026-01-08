import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useForm } from 'react-hook-form';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, X, Scale, ShoppingCart, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
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
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable shopping list item component
const SortableShoppingItem = ({ item, onTogglePurchased, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg ${
        item.purchased
          ? 'bg-gray-100 dark:bg-gray-700'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <input
        type="checkbox"
        checked={item.purchased}
        onChange={() => onTogglePurchased(item.id)}
        className="w-5 h-5 text-primary-600"
      />
      <div className="flex-1">
        <div className={`font-medium ${item.purchased ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {item.title}
        </div>
        {(item.label1 || item.label2) && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {item.label1} {item.label2}
          </div>
        )}
      </div>
      <button
        onClick={() => onEdit(item)}
        className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
      >
        <Edit className="w-4 h-4" />
      </button>
      <button
        onClick={() => onDelete(item.id)}
        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

const Food = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mealPlan, setMealPlan] = useState({
    breakfast: [],
    snacks: [],
    meal: [],
    dinner: []
  });
  const [shoppingList, setShoppingList] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showWeightHistory, setShowWeightHistory] = useState(false);
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [currentMealType, setCurrentMealType] = useState('breakfast');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [saving, setSaving] = useState(false);

  const { register: registerRecipe, handleSubmit: handleSubmitRecipe, reset: resetRecipe, formState: { errors: recipeErrors } } = useForm();
  const { register: registerWeight, handleSubmit: handleSubmitWeight, reset: resetWeight, formState: { errors: weightErrors } } = useForm();
  const { register: registerItem, handleSubmit: handleSubmitItem, reset: resetItem, formState: { errors: itemErrors } } = useForm();

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
    loadFoodData();
  }, [user]);

  const loadFoodData = async () => {
    try {
      const foodDoc = await getDoc(doc(db, `users/${user.uid}/food`, 'data'));
      if (foodDoc.exists()) {
        const data = foodDoc.data();
        setMealPlan(data.mealPlan || { breakfast: [], snacks: [], meal: [], dinner: [] });
        setShoppingList(data.shoppingList || []);
        setWeightHistory(data.weightHistory || []);
        setAvailableLabels(data.availableLabels || []);
      }
    } catch (error) {
      console.error('Failed to load food data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveFoodData = async (updates) => {
    try {
      await setDoc(doc(db, `users/${user.uid}/food`, 'data'), updates, { merge: true });
    } catch (error) {
      toast.error('Failed to save data');
      console.error(error);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = shoppingList.findIndex(item => item.id === active.id);
      const newIndex = shoppingList.findIndex(item => item.id === over.id);

      const reorderedList = arrayMove(shoppingList, oldIndex, newIndex);
      setShoppingList(reorderedList);
      await saveFoodData({ shoppingList: reorderedList });
    }
  };

  const handleAddRecipe = (mealType) => {
    setCurrentMealType(mealType);
    setEditingRecipe(null);
    resetRecipe({ title: '', description: '' });
    setShowRecipeModal(true);
  };

  const handleEditRecipe = (recipe, mealType, index) => {
    setCurrentMealType(mealType);
    setEditingRecipe({ ...recipe, index });
    resetRecipe({ title: recipe.title, description: recipe.description });
    setShowRecipeModal(true);
  };

  const handleSaveRecipe = async (data) => {
    if (saving) return;
    setSaving(true);

    try {
      const fileInput = document.getElementById('recipe-image');
      const file = fileInput?.files?.[0];

      let imageUrl = editingRecipe?.imageUrl || '';
      let imagePath = editingRecipe?.imagePath || '';

      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          toast.error('Image must be less than 2MB');
          return;
        }

        try {
          const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true };
          const compressedFile = await imageCompression(file, options);
          const timestamp = Date.now();
          imagePath = `users/${user.uid}/recipes/${timestamp}_${file.name}`;
          const storageRef = ref(storage, imagePath);
          await uploadBytes(storageRef, compressedFile);
          imageUrl = await getDownloadURL(storageRef);
        } catch (error) {
          toast.error('Failed to upload image');
          return;
        }
      }

      const recipe = {
        ...data,
        imageUrl,
        imagePath,
        id: editingRecipe?.id || Date.now().toString()
      };

      const updatedMealPlan = { ...mealPlan };

      if (editingRecipe) {
        updatedMealPlan[currentMealType][editingRecipe.index] = recipe;
      } else {
        updatedMealPlan[currentMealType].push(recipe);
      }

      setMealPlan(updatedMealPlan);
      await saveFoodData({ mealPlan: updatedMealPlan });
      toast.success('Recipe saved');
      setShowRecipeModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipe = async (mealType, index) => {
    if (!window.confirm('Delete this recipe?')) return;

    const recipe = mealPlan[mealType][index];
    if (recipe.imagePath) {
      try {
        await deleteObject(ref(storage, recipe.imagePath));
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }

    const updatedMealPlan = { ...mealPlan };
    updatedMealPlan[mealType].splice(index, 1);
    setMealPlan(updatedMealPlan);
    await saveFoodData({ mealPlan: updatedMealPlan });
    toast.success('Recipe deleted');
  };

  const handleAddWeight = async (data) => {
    const newEntry = {
      date: data.date,
      weight: parseFloat(data.weight),
      id: Date.now().toString()
    };

    const updatedHistory = [...weightHistory, newEntry].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    setWeightHistory(updatedHistory);
    await saveFoodData({ weightHistory: updatedHistory });
    toast.success('Weight entry added');
    setShowWeightModal(false);
    resetWeight();
  };

  const handleAddShoppingItem = async (data) => {
    const newItem = {
      title: data.title,
      label1: selectedLabels[0] || '',
      label2: selectedLabels[1] || '',
      purchased: false,
      id: editingItem?.id || Date.now().toString()
    };

    let updatedList;
    if (editingItem) {
      updatedList = shoppingList.map(item =>
        item.id === editingItem.id ? newItem : item
      );
    } else {
      updatedList = [...shoppingList, newItem];
    }

    setShoppingList(updatedList);
    await saveFoodData({ shoppingList: updatedList });
    toast.success(editingItem ? 'Item updated' : 'Item added');
    handleCloseShoppingModal();
  };

  const handleTogglePurchased = async (id) => {
    const updatedList = shoppingList.map(item =>
      item.id === id ? { ...item, purchased: !item.purchased } : item
    );
    setShoppingList(updatedList);
    await saveFoodData({ shoppingList: updatedList });
  };

  const handleDeleteShoppingItem = async (id) => {
    const updatedList = shoppingList.filter(item => item.id !== id);
    setShoppingList(updatedList);
    await saveFoodData({ shoppingList: updatedList });
    toast.success('Item deleted');
  };

  const handleResetShopping = async () => {
    const updatedList = shoppingList.map(item => ({ ...item, purchased: false }));
    setShoppingList(updatedList);
    await saveFoodData({ shoppingList: updatedList });
    toast.success('Shopping list reset');
  };

  const handleCloseShoppingModal = () => {
    setShowShoppingModal(false);
    setEditingItem(null);
    setSelectedLabels([]);
    resetItem({ title: '' });
  };

  const handleAddLabel = async () => {
    const trimmedLabel = newLabelInput.trim();
    if (!trimmedLabel) {
      toast.error('Label name is required');
      return;
    }

    if (availableLabels.includes(trimmedLabel)) {
      toast.error('Label already exists');
      return;
    }

    const updatedLabels = [...availableLabels, trimmedLabel];
    setAvailableLabels(updatedLabels);
    await saveFoodData({ availableLabels: updatedLabels });
    setNewLabelInput('');
    toast.success('Label added');
  };

  const handleDeleteLabel = async (labelToDelete) => {
    const updatedLabels = availableLabels.filter(label => label !== labelToDelete);
    setAvailableLabels(updatedLabels);
    await saveFoodData({ availableLabels: updatedLabels });
    toast.success('Label deleted');
  };

  const handleToggleLabel = (label) => {
    if (selectedLabels.includes(label)) {
      setSelectedLabels(selectedLabels.filter(l => l !== label));
    } else {
      if (selectedLabels.length >= 2) {
        toast.error('You can only select up to 2 labels');
        return;
      }
      setSelectedLabels([...selectedLabels, label]);
    }
  };

  const currentWeight = weightHistory.length > 0 ? weightHistory[0].weight : null;

  const chartData = weightHistory
    .slice()
    .reverse()
    .map(entry => ({
      date: format(parseISO(entry.date), 'MMM dd'),
      weight: entry.weight
    }));

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nutrition</h1>
        <img
          src="/Evolve.svg"
          alt="Evolve"
          className="w-8 h-8"
        />
      </div>

      {/* Weight Tracker */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Weight Tracker</h2>
          <div className="flex gap-2">
            {weightHistory.length > 0 && (
              <button
                onClick={() => setShowWeightHistory(!showWeightHistory)}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium flex items-center gap-1"
              >
                {showWeightHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                History
              </button>
            )}
            <button
              onClick={() => setShowWeightModal(true)}
              className="btn-primary text-sm py-1 px-3"
            >
              Add Weight
            </button>
          </div>
        </div>

        {currentWeight && (
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">{currentWeight} kg</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Current Weight</div>
          </div>
        )}

        {showWeightHistory && weightHistory.length > 1 && (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#14b8a6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Meal Plan */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Meal Plan</h2>

        {['breakfast', 'snacks', 'meal', 'dinner'].map((mealType) => (
          <div key={mealType} className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 capitalize">{mealType}</h3>
              <button
                onClick={() => handleAddRecipe(mealType)}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Recipe
              </button>
            </div>

            {mealPlan[mealType].length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm">No recipes yet</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                {mealPlan[mealType].map((recipe, index) => (
                  <div key={recipe.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600 w-[85vw] sm:w-[320px] md:w-[340px] snap-center flex-shrink-0 flex flex-col">
                    {recipe.imageUrl && (
                      <img
                        src={recipe.imageUrl}
                        alt={recipe.title}
                        className="w-full h-32 object-cover rounded mb-2"
                      />
                    )}
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1 break-words">{recipe.title}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 break-words">{recipe.description}</p>
                    </div>
                    <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <button
                        onClick={() => handleEditRecipe(recipe, mealType, index)}
                        className="flex-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium flex items-center justify-center gap-1 py-1"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRecipe(mealType, index)}
                        className="flex-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium flex items-center justify-center gap-1 py-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Shopping List */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Shopping List</h2>
          <div className="flex gap-2 flex-wrap">
            {shoppingList.length > 0 && (
              <>
                <button
                  onClick={() => setShowShoppingList(!showShoppingList)}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium flex items-center gap-1"
                >
                  {showShoppingList ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      View
                    </>
                  )}
                </button>
                {showShoppingList && (
                  <button
                    onClick={handleResetShopping}
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm"
                  >
                    Reset
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setShowLabelsModal(true)}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium"
            >
              Manage Labels
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setSelectedLabels([]);
                resetItem({ title: '' });
                setShowShoppingModal(true);
              }}
              className="btn-primary text-sm py-1 px-3"
            >
              Add Item
            </button>
          </div>
        </div>

        {showShoppingList && (
          <>
            {shoppingList.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-center py-4">No items in shopping list</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={shoppingList.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {shoppingList.map((item) => (
                      <SortableShoppingItem
                        key={item.id}
                        item={item}
                        onTogglePurchased={handleTogglePurchased}
                        onEdit={(item) => {
                          setEditingItem(item);
                          resetItem({ title: item.title });
                          const labels = [item.label1, item.label2].filter(Boolean);
                          setSelectedLabels(labels);
                          setShowShoppingModal(true);
                        }}
                        onDelete={handleDeleteShoppingItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        )}
      </div>

      {/* Recipe Modal */}
      {showRecipeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
              </h3>
              <button onClick={() => setShowRecipeModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitRecipe(handleSaveRecipe)} className="space-y-4">
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  className="input-field"
                  {...registerRecipe('title', { required: 'Title is required' })}
                />
                {recipeErrors.title && (
                  <p className="text-red-500 text-sm mt-1">{recipeErrors.title.message}</p>
                )}
              </div>

              <div>
                <label className="label">Description *</label>
                <textarea
                  className="input-field"
                  rows="3"
                  {...registerRecipe('description', { required: 'Description is required' })}
                />
                {recipeErrors.description && (
                  <p className="text-red-500 text-sm mt-1">{recipeErrors.description.message}</p>
                )}
              </div>

              <div>
                <label className="label">Image (optional, max 2MB)</label>
                <ImageUpload
                  id="recipe-image"
                  label="Upload recipe image"
                  existingImageUrl={editingRecipe?.imageUrl}
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowRecipeModal(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Weight Modal */}
      {showWeightModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add Weight Entry</h3>
              <button onClick={() => setShowWeightModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitWeight(handleAddWeight)} className="space-y-4">
              <div>
                <label className="label">Date *</label>
                <input
                  type="date"
                  className="input-field"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  {...registerWeight('date', { required: 'Date is required' })}
                />
              </div>

              <div>
                <label className="label">Weight (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  className="input-field"
                  {...registerWeight('weight', { required: 'Weight is required' })}
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowWeightModal(false)} className="btn-secondary flex-1">
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

      {/* Shopping Item Modal */}
      {showShoppingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingItem ? 'Edit Item' : 'Add Item'}
              </h3>
              <button onClick={handleCloseShoppingModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitItem(handleAddShoppingItem)} className="space-y-4">
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  className="input-field"
                  {...registerItem('title', { required: 'Title is required' })}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Labels (select up to 2)</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLabelsModal(true);
                    }}
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-xs font-medium"
                  >
                    Manage Labels
                  </button>
                </div>

                {availableLabels.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No labels available. Click "Manage Labels" to create some.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableLabels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleToggleLabel(label)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          selectedLabels.includes(label)
                            ? 'bg-primary-600 text-white dark:bg-primary-500'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {selectedLabels.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Selected: {selectedLabels.join(', ')}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={handleCloseShoppingModal} className="btn-secondary flex-1">
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

      {/* Labels Management Modal */}
      {showLabelsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Manage Labels</h3>
              <button onClick={() => setShowLabelsModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLabelInput}
                  onChange={(e) => setNewLabelInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLabel();
                    }
                  }}
                  placeholder="Enter label name"
                  className="input-field flex-1"
                />
                <button
                  onClick={handleAddLabel}
                  className="btn-primary px-4"
                >
                  Add
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableLabels.length === 0 ? (
                  <p className="text-gray-400 dark:text-gray-500 text-center py-4">No labels yet</p>
                ) : (
                  availableLabels.map((label) => (
                    <div
                      key={label}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <span className="text-gray-900 dark:text-gray-100">{label}</span>
                      <button
                        onClick={() => handleDeleteLabel(label)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setShowLabelsModal(false)}
                className="btn-secondary w-full"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Food;
