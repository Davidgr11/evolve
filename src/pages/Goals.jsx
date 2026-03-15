import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { Plus, Edit, Trash2, X, CheckCircle, TrendingUp, Sparkles, LogOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ImageUpload from '../components/ImageUpload';
import ConfirmModal from '../components/ConfirmModal';

// --- Circular progress ring (SVG) ---
const ProgressRing = ({ size, progress, isAccomplished }) => {
  const sw = 4;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, progress) / 100) * circ;
  const color = isAccomplished ? '#22c55e' : '#60a5fa';

  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ zIndex: 2 }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={sw}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={circ}
        strokeDashoffset={isAccomplished ? 0 : offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
    </svg>
  );
};

// --- Goal Circle ---
const SIZES = [120, 152, 176];

const GoalCircle = ({ goal, index, onClick }) => {
  const size = SIZES[index % 3];
  const imgSize = size - 8;
  const isAccomplished = goal.status === 'accomplished';
  const isMeasurable = goal.type === 'measurable';
  const progress = isMeasurable && goal.target > 0
    ? Math.min(100, Math.round((goal.currentValue || 0) / goal.target * 100))
    : isAccomplished ? 100 : 0;
  const delay = `${(index * 0.55) % 3.5}s`;

  return (
    <div
      className="goal-circle cursor-pointer flex-shrink-0 relative select-none"
      style={{ width: size, height: size, animationDelay: delay }}
      onClick={() => onClick(goal)}
    >
      <ProgressRing size={size} progress={progress} isAccomplished={isAccomplished} />

      <img
        src={goal.imageUrl}
        alt={goal.description || 'Goal'}
        className="absolute rounded-full object-cover shadow-md"
        style={{ top: 4, left: 4, width: imgSize, height: imgSize, zIndex: 1 }}
        draggable={false}
      />

      {isAccomplished && (
        <div
          className="absolute rounded-full bg-green-500/40 flex items-center justify-center"
          style={{ top: 4, left: 4, width: imgSize, height: imgSize, zIndex: 3 }}
        >
          <CheckCircle
            className="text-white drop-shadow"
            style={{ width: size * 0.28, height: size * 0.28 }}
          />
        </div>
      )}

      {isMeasurable && !isAccomplished && progress > 0 && (
        <div
          className="absolute bottom-0 right-0 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold shadow"
          style={{ width: 22, height: 22, fontSize: 8, zIndex: 4 }}
        >
          {progress}%
        </div>
      )}
    </div>
  );
};

// --- Main Goals Page ---
const COLOR_THEMES = [
  { id: 'blue',   label: 'Blue',   bg: '#3b82f6', appBg: '#c2dce8' },
  { id: 'purple', label: 'Purple', bg: '#8b5cf6', appBg: '#dcd4f0' },
  { id: 'green',  label: 'Green',  bg: '#22c55e', appBg: '#c2e8d0' },
];

const Goals = () => {
  const { user, logout } = useAuth();
  const { colorTheme, setColorTheme } = useTheme();
  const [goals, setGoals] = useState([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, goal: null });
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [goalType, setGoalType] = useState('binary');
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeRec, setClaudeRec] = useState('');
  const [progressInput, setProgressInput] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);

  const { register, handleSubmit, reset, setValue } = useForm();

  const completedCount = goals.filter(g => g.status === 'accomplished').length;

  useEffect(() => {
    if (user) {
      loadGoals();
      loadProfilePhoto();
    }
  }, [user]);

  const loadProfilePhoto = async () => {
    try {
      const snap = await getDocs(collection(db, `users/${user.uid}/settings`));
      snap.docs.forEach(d => { if (d.id === 'profile' && d.data().photoUrl) setProfilePhoto(d.data().photoUrl); });
    } catch {}
  };

  // Reset Claude recommendation when switching goal
  useEffect(() => {
    setClaudeRec('');
    if (selectedGoal) {
      setProgressInput(String(selectedGoal.currentValue || 0));
    }
  }, [selectedGoal?.id]);

  const loadGoals = async () => {
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
    }
  };

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
          if (file.size > 2 * 1024 * 1024) { toast.error('Image must be < 2MB'); return; }
          const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true });
          const ts = Date.now();
          const newPath = `users/${user.uid}/goals/${ts}_${file.name}`;
          await uploadBytes(ref(storage, newPath), compressed);
          imageUrl = await getDownloadURL(ref(storage, newPath));
          if (editingGoal.imagePath) {
            try { await deleteObject(ref(storage, editingGoal.imagePath)); } catch {}
          }
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

        if (wasExpecting && data.status === 'accomplished') {
          triggerConfetti();
          toast.success('Goal accomplished! 🎉');
        } else {
          toast.success('Goal updated');
        }
        closeGoalModal();
        loadGoals();
      } catch (err) {
        toast.error('Failed to update goal');
        console.error(err);
      } finally {
        setUploading(false);
      }
      return;
    }

    // Create new
    if (!file) { toast.error('Please select an image'); return; }
    if (goals.length >= 20) { toast.error('Maximum 20 goals'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be < 2MB'); return; }

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

      toast.success('Goal added!');
      closeGoalModal();
      loadGoals();
    } catch (err) {
      toast.error('Failed to add goal');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteGoal = async (goal) => {
    try {
      if (goal.imagePath) {
        try { await deleteObject(ref(storage, goal.imagePath)); } catch {}
      }
      await deleteDoc(doc(db, `users/${user.uid}/goals`, goal.id));
      toast.success('Goal deleted');
      setSelectedGoal(null);
      loadGoals();
    } catch {
      toast.error('Failed to delete goal');
    }
  };

  const handleMarkDone = async (goal) => {
    const newStatus = goal.status === 'accomplished' ? 'expecting' : 'accomplished';
    try {
      await updateDoc(doc(db, `users/${user.uid}/goals`, goal.id), { status: newStatus });
      if (newStatus === 'accomplished') {
        triggerConfetti();
        toast.success('Goal accomplished! 🎉');
      } else {
        toast.success('Marked as in progress');
      }
      const updated = { ...goal, status: newStatus };
      setSelectedGoal(updated);
      setGoals(prev => prev.map(g => g.id === goal.id ? updated : g));
    } catch {
      toast.error('Failed to update goal');
    }
  };

  const handleSaveProgress = async () => {
    if (!selectedGoal) return;
    const value = parseFloat(progressInput);
    if (isNaN(value) || value < 0) { toast.error('Enter a valid number'); return; }
    setSavingProgress(true);
    try {
      const isNowDone = value >= (selectedGoal.target || 0);
      const updateData = { currentValue: value, ...(isNowDone && { status: 'accomplished' }) };
      await updateDoc(doc(db, `users/${user.uid}/goals`, selectedGoal.id), updateData);
      const updated = { ...selectedGoal, currentValue: value, ...(isNowDone && { status: 'accomplished' }) };
      setSelectedGoal(updated);
      setGoals(prev => prev.map(g => g.id === selectedGoal.id ? updated : g));
      if (isNowDone) { triggerConfetti(); toast.success('Goal reached! 🎉'); }
      else toast.success('Progress saved');
    } catch {
      toast.error('Failed to save progress');
    } finally {
      setSavingProgress(false);
    }
  };

  const handleGetRecommendation = async (goal) => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!apiKey || apiKey === 'your_claude_api_key_here') {
      toast.error('Add your Claude API key to the .env file');
      return;
    }
    setClaudeLoading(true);
    setClaudeRec('');
    try {
      const isMeasurable = goal.type === 'measurable';
      const progress = isMeasurable && goal.target > 0
        ? Math.round((goal.currentValue || 0) / goal.target * 100)
        : null;

      const prompt = isMeasurable
        ? `My goal: "${goal.description}". Target: ${goal.target} ${goal.unit || ''}. Current: ${goal.currentValue || 0} ${goal.unit || ''} (${progress}%). Give me ONE specific, actionable recommendation to make faster progress. Be direct — max 3 sentences.`
        : `My goal: "${goal.description}". Not completed yet. Give me ONE specific, actionable first step to accomplish this. Be direct — max 3 sentences.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      setClaudeRec(data.content[0].text);
    } catch (err) {
      toast.error('Failed to get recommendation');
      console.error(err);
    } finally {
      setClaudeLoading(false);
    }
  };

  const openEditModal = (goal) => {
    setEditingGoal(goal);
    const type = goal.type || 'binary';
    setGoalType(type);
    reset({
      description: goal.description || '',
      status: goal.status,
      goalType: type,
      target: goal.target || '',
      unit: goal.unit || '',
    });
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

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-1">
            {new Date().getFullYear()}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
            My Goals
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {goals.length < 20 && (
            <button onClick={handleAddNewGoal} className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4" /> Add Goal
            </button>
          )}
          {/* Avatar */}
          <button
            onClick={() => setShowProfileModal(true)}
            className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white/70 dark:ring-gray-700 hover:ring-blue-300 transition-all shadow-sm"
          >
            {profilePhoto ? (
              <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-300">
                  {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      {goals.length > 0 && (
        <div className="liquid-glass-panel rounded-2xl px-6 py-4">
          <div className="relative z-10 flex items-center justify-around">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{goals.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-0.5">Total</p>
            </div>
            <div className="w-px h-10 bg-gray-200 dark:bg-gray-600" />
            <div className="text-center">
              <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">{completedCount}</p>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-0.5">Accomplished</p>
            </div>
            <div className="w-px h-10 bg-gray-200 dark:bg-gray-600" />
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{goals.length - completedCount}</p>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-0.5">In progress</p>
            </div>
          </div>
        </div>
      )}

      {/* Galaxy canvas */}
      <div>

        {goals.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-10 h-10 text-blue-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No goals yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-5 text-sm">
              Add your first goal to start tracking progress
            </p>
            <button onClick={handleAddNewGoal} className="btn-primary">
              Add First Goal
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-8 justify-center items-end py-6 min-h-[180px]">
            {goals.map((goal, index) => (
              <GoalCircle
                key={goal.id}
                goal={goal}
                index={index}
                onClick={setSelectedGoal}
              />
            ))}
          </div>
        )}
      </div>
    </div>

      {/* Goal Detail Panel (bottom sheet) */}
      {selectedGoal && (
        <div
          className="fixed z-50 flex items-end justify-center liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setSelectedGoal(null)}
        >
          <div
            className="liquid-glass-panel w-full max-w-lg rounded-t-2xl p-5 overflow-y-auto mb-20"
            style={{ maxHeight: 'calc(85vh - 80px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* All content above the ::before specular layer */}
            <div className="relative z-10">

            {/* Handle */}
            <div className="w-10 h-1 bg-white/60 rounded-full mx-auto mb-4" />

            {/* Header row: close + edit + delete */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(selectedGoal)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-sm font-medium transition-colors"
                >
                  <Edit className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => {
                    setSelectedGoal(null);
                    setDeleteConfirm({ isOpen: true, goal: selectedGoal });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
              <button
                onClick={() => setSelectedGoal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Goal image + info */}
            <div className="flex items-start gap-4 mb-5">
              <img
                src={selectedGoal.imageUrl}
                alt={selectedGoal.description || 'Goal'}
                className="w-20 h-20 rounded-full object-cover flex-shrink-0 border-2 border-blue-200 dark:border-blue-700 shadow"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                  {selectedGoal.description || 'No description'}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    selectedGoal.status === 'accomplished'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  }`}>
                    {selectedGoal.status === 'accomplished' ? 'Accomplished' : 'In Progress'}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                    {selectedGoal.type === 'measurable' ? 'Measurable' : 'Binary'}
                  </span>
                </div>
              </div>
            </div>

            {/* Measurable progress section */}
            {selectedGoal.type === 'measurable' && (selectedGoal.target || 0) > 0 && (
              <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400 font-medium">Progress</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {selectedGoal.currentValue || 0} / {selectedGoal.target} {selectedGoal.unit || ''}
                  </span>
                </div>
                <div className="h-2.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-pistachio-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.round((selectedGoal.currentValue || 0) / selectedGoal.target * 100))}%` }}
                  />
                </div>
                {selectedGoal.status !== 'accomplished' && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="input-field flex-1"
                      placeholder={`Current value${selectedGoal.unit ? ` (${selectedGoal.unit})` : ''}`}
                      value={progressInput}
                      onChange={(e) => setProgressInput(e.target.value)}
                    />
                    <button
                      onClick={handleSaveProgress}
                      disabled={savingProgress}
                      className="btn-primary px-5 whitespace-nowrap"
                    >
                      {savingProgress ? '...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Binary toggle */}
            {(selectedGoal.type || 'binary') === 'binary' && (
              <div className="mb-5">
                <button
                  onClick={() => handleMarkDone(selectedGoal)}
                  className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
                    selectedGoal.status === 'accomplished'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      : 'btn-primary shadow'
                  }`}
                >
                  {selectedGoal.status === 'accomplished' ? 'Mark as Pending' : '✓ Mark as Accomplished'}
                </button>
              </div>
            )}

            {/* Claude recommendation */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mb-4">
              <button
                onClick={() => handleGetRecommendation(selectedGoal)}
                disabled={claudeLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-pistachio-50 dark:from-blue-900/20 dark:to-pistachio-900/20 border border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:from-blue-100 hover:to-pistachio-100 dark:hover:from-blue-900/30 dark:hover:to-pistachio-900/30 transition-colors font-medium text-sm disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                {claudeLoading ? 'Getting recommendation...' : 'Get AI Recommendation'}
              </button>
              {claudeRec && (
                <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-pistachio-50 dark:from-blue-900/20 dark:to-pistachio-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{claudeRec}</p>
                </div>
              )}
            </div>

            </div>{/* end relative z-10 */}
          </div>
        </div>
      )}

      {/* Add / Edit Goal Modal */}
      {showGoalModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={closeGoalModal}
        >
          {/* Inner flex container offset upward to center above the navbar */}
          <div className="flex items-center justify-center h-full pb-20 px-4">
          <div
            className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col"
            style={{ maxHeight: 'calc(90vh - 80px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky header */}
            <div className="relative z-10 flex justify-between items-center px-6 pt-6 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingGoal ? 'Edit Goal' : 'New Goal'}
              </h3>
              <button onClick={closeGoalModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="relative z-10 overflow-y-auto px-6 py-4">
            <form onSubmit={handleSubmit(handleSaveGoal)} className="space-y-4">
              {/* Goal type selector */}
              <div>
                <label className="label">Goal Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'binary', label: 'Yes / No', desc: 'A single achievement' },
                    { value: 'measurable', label: 'Progress', desc: 'Track a number' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`cursor-pointer p-3 rounded-xl border-2 text-center transition-colors ${
                        goalType === opt.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
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
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                    </label>
                  ))}
                </div>
              </div>

              {/* Measurable target + unit */}
              {goalType === 'measurable' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Target *</label>
                    <input
                      type="number"
                      className="input-field"
                      placeholder="100"
                      {...register('target', { required: goalType === 'measurable' })}
                    />
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="km, books, $…"
                      {...register('unit')}
                    />
                  </div>
                </div>
              )}

              {/* Image */}
              <div>
                <label className="label">Goal Image (max 2MB){!editingGoal && ' *'}</label>
                <ImageUpload
                  id="goal-image-input"
                  disabled={uploading}
                  label={editingGoal ? 'Replace image (optional)' : 'Upload goal image'}
                  existingImageUrl={editingGoal?.imageUrl}
                />
                {!editingGoal && (
                  <p className="text-xs text-gray-400 mt-1">{20 - goals.length} slots remaining</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input-field"
                  rows="2"
                  placeholder="What does this goal mean to you?"
                  {...register('description')}
                  disabled={uploading}
                />
              </div>

              {/* Status (edit only) */}
              {editingGoal && (
                <div>
                  <label className="label">Status</label>
                  <select className="input-field" {...register('status')} disabled={uploading}>
                    <option value="expecting">In Progress</option>
                    <option value="accomplished">Accomplished</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={closeGoalModal} className="btn-secondary flex-1" disabled={uploading}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={uploading}>
                  {uploading ? 'Uploading...' : editingGoal ? 'Update' : 'Add Goal'}
                </button>
              </div>
            </form>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, goal: null })}
        onConfirm={() => {
          handleDeleteGoal(deleteConfirm.goal);
          setDeleteConfirm({ isOpen: false, goal: null });
        }}
        title="Delete Goal"
        message="Are you sure you want to delete this goal? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />

      {/* Profile Modal */}
      {showProfileModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center liquid-glass-overlay px-4"
          onClick={() => setShowProfileModal(false)}
        >
          <div
            className="liquid-glass-panel rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative z-10">
              {/* Close */}
              <button
                onClick={() => setShowProfileModal(false)}
                className="absolute top-0 right-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Avatar + user info */}
              <div className="flex flex-col items-center gap-2 mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/70 dark:ring-gray-700 shadow-md">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-300">
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

              {/* Color theme picker */}
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
                  Color theme
                </p>
                <div className="flex gap-3 justify-center">
                  {COLOR_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setColorTheme(t.id)}
                      className={`flex flex-col items-center gap-1.5 group`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full shadow-md transition-all ${
                          colorTheme === t.id
                            ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${t.appBg} 40%, ${t.bg} 100%)` }}
                      />
                      <span className={`text-[10px] font-medium ${
                        colorTheme === t.id ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { logout(); setShowProfileModal(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 font-medium text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Goals;
