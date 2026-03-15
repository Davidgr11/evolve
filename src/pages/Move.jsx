import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import {
  Plus, Play, Edit, Trash2, Activity, Flame, Route,
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

const getStatusBorder = (routine) => {
  if (!routine.lastRun) return 'border-l-gray-200 dark:border-l-gray-700';
  const days = Math.floor((Date.now() - new Date(routine.lastRun)) / 86400000);
  if (days <= 7)  return 'border-l-green-400';
  if (days <= 14) return 'border-l-yellow-400';
  return 'border-l-red-400';
};

const formatLastRun = (routine) => {
  if (!routine.lastRun) return null; // no data yet — don't show
  const days = Math.floor((Date.now() - new Date(routine.lastRun)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
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
    month: { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 },
    year:  { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 }
  });
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeAnalysis, setClaudeAnalysis] = useState('');

  const now = new Date();
  const currentMonthName = now.toLocaleString('en-US', { month: 'long' });
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
    } catch { toast.error('Failed to load routines'); }
    finally { setLoading(false); }
  };

  const loadStats = async () => {
    try {
      const curMonth = now.getMonth() + 1;
      const snapshot = await getDocs(collection(db, `users/${user.uid}/statistics/move/${currentYear}`));
      let m = { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 };
      let y = { stretch: 0, workout: 0, running: 0, sports: 0, effort: [], calories: 0, km: 0 };
      snapshot.forEach((d) => {
        const data = d.data();
        const month = parseInt(d.id);
        if (month === curMonth) m = data;
        y.stretch  += data.stretch  || 0;
        y.workout  += data.workout  || 0;
        y.running  += data.running  || 0;
        y.sports   += data.sports   || 0;
        y.effort    = [...y.effort, ...(data.effort || [])];
        y.calories += data.calories || 0;
        y.km       += data.km       || 0;
      });
      setStats({ month: m, year: y });
    } catch (err) { console.error(err); }
  };

  const avgEffort = (arr) => {
    if (!arr?.length) return '—';
    return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
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
      const prompt = `Exercise data for ${currentMonthName} ${currentYear}:
- Sessions: ${totalMonth} (stretch ${stats.month.stretch}, workout ${stats.month.workout}, running ${stats.month.running}, sports ${stats.month.sports})
- Calories: ${stats.month.calories} kcal, Distance: ${(stats.month.km || 0).toFixed(1)} km, Avg effort: ${avgEffort(stats.month.effort)}/5
Year to date (${monthsElapsed}/12 months): ${totalYear} sessions, ${stats.year.calories} kcal, ${(stats.year.km || 0).toFixed(1)} km

Reply in plain text only — no markdown, no asterisks, no headers. Be concise: 1 sentence on what stands out, 1 sentence with the single most useful action to take right now.`;

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
        toast.success('Routine updated');
      } else {
        await addDoc(collection(db, `users/${user.uid}/routines`), {
          ...routineData, createdAt: new Date().toISOString()
        });
        toast.success('Routine created');
      }
      setShowModal(false);
      loadRoutines();
    } catch { toast.error('Failed to save routine'); }
  };

  const handleDeleteRoutine = async (routine) => {
    try {
      for (const ex of routine.exercises) {
        if (ex.imagePath) { try { await deleteObject(ref(storage, ex.imagePath)); } catch {} }
      }
      await deleteDoc(doc(db, `users/${user.uid}/routines`, routine.id));
      toast.success('Routine deleted');
      loadRoutines();
    } catch { toast.error('Failed to delete routine'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500">Loading...</div>
    </div>
  );

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-1">
            {currentYear}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
            Exercise
          </h1>
        </div>
        <button
          onClick={() => { setEditingRoutine(null); setShowModal(true); }}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> New Routine
        </button>
      </div>

      {/* Year stats — liquid glass circles */}
      <div>
        <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-4 text-center">
          {currentYear} Annual
        </p>
        <div className="flex justify-around">
          {[
            { icon: Flame,    iconColor: 'text-orange-400', value: stats.year.calories.toLocaleString(), unit: 'kcal' },
            { icon: Route,    iconColor: 'text-blue-400',   value: (stats.year.km || 0).toFixed(1),      unit: 'km'   },
            { icon: Activity, iconColor: 'text-purple-400', value: avgEffort(stats.year.effort),         unit: 'effort avg' },
          ].map(({ icon: Icon, iconColor, value, unit }) => (
            <div key={unit} className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full flex flex-col items-center justify-center gap-0.5 bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 shadow-sm">
                <Icon className={`w-5 h-5 ${iconColor}`} />
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none mt-1">{value}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium leading-none mt-0.5">{unit}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Month — AI analyze only */}
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
            {claudeLoading ? 'Analyzing...' : 'Analyze current month'}
          </button>
        </div>

        {claudeAnalysis && (
          <div className="px-4 py-3 bg-white/60 dark:bg-gray-800/60 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-sm">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{claudeAnalysis}</p>
          </div>
        )}
      </div>

      {/* Routines */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
          My Routines
        </p>

        {routines.length === 0 ? (
          <div className="text-center py-16">
            <Dumbbell className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No routines yet</p>
            <button onClick={() => { setEditingRoutine(null); setShowModal(true); }} className="btn-primary">
              Create Routine
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {routines.map((routine) => {
              const cfg = TYPE_CONFIG[routine.type] || TYPE_CONFIG.workout;
              const TypeIcon = cfg.icon;
              const lastRun = formatLastRun(routine);
              const statusBorder = getStatusBorder(routine);

              return (
                <div
                  key={routine.id}
                  className={`relative overflow-hidden rounded-2xl border-l-4 ${statusBorder} bg-gradient-to-br ${cfg.gradient} backdrop-blur-sm border border-r border-t border-b ${cfg.border} shadow-sm hover:shadow-md transition-shadow`}
                >
                  {/* Faint type icon watermark */}
                  <TypeIcon
                    className="absolute top-3 right-3 opacity-10 dark:opacity-[0.07]"
                    style={{ width: 56, height: 56 }}
                  />

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
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {routine.exercises?.length || 0} exercises · {routine.series} series
                    </p>

                    {/* Last run + sessions */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4">
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
                          {routine.totalRuns} session{routine.totalRuns !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/routine/${routine.id}`)}
                        className="flex-1 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors"
                      >
                        <Play className="w-4 h-4" /> Start
                      </button>
                      <button
                        onClick={() => { setEditingRoutine(routine); setShowModal(true); }}
                        className="bg-white/50 dark:bg-gray-700/50 hover:bg-white/80 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 py-2 px-3 rounded-xl transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ isOpen: true, routine })}
                        className="bg-white/50 dark:bg-gray-700/50 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 py-2 px-3 rounded-xl transition-colors"
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
