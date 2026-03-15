import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
  Plus, X, Scale, Trash2, Edit, Sparkles, GripVertical,
  ChevronDown, ChevronUp, RotateCcw
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, TouchSensor
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';

// ─── helpers ────────────────────────────────────────────────────────────────
const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
};

const getWeekDays = (weekStart) => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const RATING_EMOJI = ['😵', '😞', '😐', '🙂', '🥗'];
const RATING_COLOR = (r) =>
  ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-green-600'][r - 1] || 'bg-gray-200';

const MEAL_SLOTS = ['Breakfast', 'Snack AM', 'Lunch', 'Snack PM', 'Dinner'];

const parseTextToSlots = (text) => {
  if (!text) return [];
  return MEAL_SLOTS.map(slot => {
    const regex = new RegExp(`${slot}:\\s*(.+?)(?=\\n|$)`, 'i');
    const match = text.match(regex);
    return { name: slot, options: match ? match[1].split('/').map(s => s.trim()).filter(Boolean) : [] };
  });
};

// ─── SortableShoppingItem ────────────────────────────────────────────────────
const SortableShoppingItem = ({ item, onToggle, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors
        ${item.purchased
          ? 'bg-white/30 dark:bg-gray-800/30 border-white/40 dark:border-gray-700/40'
          : 'bg-white/70 dark:bg-gray-800/70 border-white/60 dark:border-gray-700/60'}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab touch-none text-gray-300 dark:text-gray-600">
        <GripVertical className="w-4 h-4" />
      </div>
      <input
        type="checkbox"
        checked={item.purchased}
        onChange={() => onToggle(item.id)}
        className="w-4 h-4 accent-blue-500 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.purchased ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {item.title}
        </p>
        {(item.label1 || item.label2) && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {[item.label1, item.label2].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <button onClick={() => onEdit(item)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
        <Edit className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-600 p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ─── Food page ───────────────────────────────────────────────────────────────
const Food = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const thisWeekStart = getWeekStart();

  // ── Check-in
  const [currentWeek, setCurrentWeek] = useState({ weekStart: thisWeekStart, days: {} });
  const [previousWeek, setPreviousWeek] = useState(null);
  const [checkinModal, setCheckinModal] = useState(null); // date string
  const [checkinForm, setCheckinForm] = useState({ rating: 3, note: '', weight: '' });
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeInsight, setClaudeInsight] = useState('');

  // ── Meal plan
  const [mealPrompt, setMealPrompt] = useState('');
  const [mealPlan, setMealPlan] = useState(null); // { slots:[{name,options[]}], mealPrompt, generatedAt }
  const [showMealPlan, setShowMealPlan] = useState(true);
  const [mealLoading, setMealLoading] = useState(false);
  const [editingMealOption, setEditingMealOption] = useState(null); // { slotName, optionIdx }
  const [editingMealText, setEditingMealText] = useState('');

  // ── Shopping
  const [shoppingList, setShoppingList] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddLabels, setQuickAddLabels] = useState([]);
  const [shoppingModal, setShoppingModal] = useState(null); // null | 'add' | item object
  const [shoppingForm, setShoppingForm] = useState({ title: '' });
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [newLabelInput, setNewLabelInput] = useState('');

  // ── Weight
  const [weightHistory, setWeightHistory] = useState([]);
  const [showWeightModal, setShowWeightModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/food`, 'data'));
      if (snap.exists()) {
        const data = snap.data();

        // Week rotation: if saved week ≠ current week, move it to previousWeek
        const savedWeek = data.currentWeek;
        if (savedWeek && savedWeek.weekStart !== thisWeekStart) {
          const fresh = { weekStart: thisWeekStart, days: {} };
          setPreviousWeek(savedWeek);
          setCurrentWeek(fresh);
          await setDoc(
            doc(db, `users/${user.uid}/food`, 'data'),
            { ...data, currentWeek: fresh, previousWeek: savedWeek },
            { merge: true }
          );
        } else {
          setCurrentWeek(savedWeek || { weekStart: thisWeekStart, days: {} });
          setPreviousWeek(data.previousWeek || null);
        }

        setShoppingList(data.shoppingList || []);
        setWeightHistory(data.weightHistory || []);
        setAvailableLabels(data.availableLabels || []);
        // Support both old (suggestions string) and new (slots array) format
        const mp = data.mealPlan || null;
        if (mp) {
          if (mp.suggestions && !mp.slots) {
            setMealPlan({ ...mp, slots: parseTextToSlots(mp.suggestions) });
          } else {
            setMealPlan(mp);
          }
          }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const save = async (updates) => {
    try {
      await setDoc(doc(db, `users/${user.uid}/food`, 'data'), updates, { merge: true });
    } catch (err) {
      toast.error('Failed to save');
      console.error(err);
    }
  };

  // ── Check-in actions
  const openCheckin = (date) => {
    const existing = currentWeek.days[date];
    setCheckinForm({ rating: existing?.rating ?? 3, note: existing?.note ?? '', weight: existing?.weight ?? '' });
    setCheckinModal(date);
  };

  const saveCheckin = async () => {
    const entry = {
      rating: checkinForm.rating,
      note: checkinForm.note,
      ...(checkinForm.weight ? { weight: parseFloat(checkinForm.weight) } : {}),
    };
    const updated = { ...currentWeek, days: { ...currentWeek.days, [checkinModal]: entry } };
    setCurrentWeek(updated);

    let newWeightHistory = weightHistory;
    if (checkinForm.weight) {
      const we = { date: checkinModal, weight: parseFloat(checkinForm.weight), id: Date.now().toString() };
      newWeightHistory = [...weightHistory.filter(w => w.date !== checkinModal), we]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setWeightHistory(newWeightHistory);
    }

    await save({ currentWeek: updated, weightHistory: newWeightHistory });
    setCheckinModal(null);
    toast.success('Saved');
  };

  const handleInsight = async () => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!apiKey || apiKey === 'your_claude_api_key_here') { toast.error('Add your Claude API key'); return; }

    const days = getWeekDays(currentWeek.weekStart);
    const cur = days.map((d, i) => {
      const e = currentWeek.days[d];
      return e ? `${DAY_LABELS[i]}:${e.rating}/5${e.note ? `(${e.note})` : ''}` : null;
    }).filter(Boolean);

    if (!cur.length) { toast.error('No check-ins this week yet'); return; }

    const prev = previousWeek
      ? getWeekDays(previousWeek.weekStart).map((d, i) => {
          const e = previousWeek.days[d];
          return e ? `${DAY_LABELS[i]}:${e.rating}/5` : null;
        }).filter(Boolean)
      : [];

    setClaudeLoading(true);
    setClaudeInsight('');
    try {
      const prompt = `Nutrition check-ins this week: ${cur.join(', ')}${prev.length ? `. Last week: ${prev.join(', ')}` : ''}. Scale 1-5.
Reply in plain text only, no markdown, no asterisks. 1 sentence on what the pattern shows, 1 concrete suggestion.`;

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
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setClaudeInsight(data.content[0].text);
    } catch (err) {
      toast.error('Failed to get insight');
      console.error(err);
    } finally {
      setClaudeLoading(false); }
  };

  // ── Meal plan actions
  const handleGenerateMeal = async () => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!apiKey || apiKey === 'your_claude_api_key_here') { toast.error('Add your Claude API key'); return; }
    if (!mealPrompt.trim()) { toast.error('Enter ingredients or instructions first'); return; }

    setMealLoading(true);
    try {
      const prompt = `You are a nutrition assistant creating a weekly meal rotation.
Instructions/context: ${mealPrompt.trim()}

IMPORTANT: Detect the language of the instructions/context above and reply in that same language.

Rules:
- Breakfast, Lunch, and Dinner MUST be completely different meals — no shared proteins or base ingredients between them.
- Snack AM and Snack PM should be light, quick options.
- Vary cooking methods (grilled, boiled, raw, etc.) across the day.
- Keep options short (3-5 words max each).
- Give 2-3 options per slot separated by " / ".

Reply ONLY in this exact format with no extra text:
Breakfast: option1 / option2 / option3
Snack AM: option1 / option2
Lunch: option1 / option2 / option3
Snack PM: option1 / option2
Dinner: option1 / option2 / option3`;

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
          max_tokens: 350,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const slots = parseTextToSlots(data.content[0].text);
      const plan = {
        slots,
        mealPrompt: mealPrompt.trim(),
        generatedAt: new Date().toISOString(),
      };
      setMealPlan(plan);
      setShowMealPlan(true);
      setMealPrompt('');
      await save({ mealPlan: plan });
      toast.success('Meal plan generated!');
    } catch (err) {
      toast.error('Failed to generate');
      console.error(err);
    } finally {
      setMealLoading(false);
    }
  };

  const saveMealOptionEdit = async () => {
    if (!editingMealOption || !editingMealText.trim()) { setEditingMealOption(null); return; }
    const { slotName, optionIdx } = editingMealOption;
    const updated = {
      ...mealPlan,
      slots: mealPlan.slots.map(s =>
        s.name === slotName
          ? { ...s, options: s.options.map((o, i) => i === optionIdx ? editingMealText.trim() : o) }
          : s
      ),
    };
    setMealPlan(updated);
    setEditingMealOption(null);
    await save({ mealPlan: updated });
  };

  const removeMealOption = async (slotName, optionIdx) => {
    const updated = {
      ...mealPlan,
      slots: mealPlan.slots.map(s =>
        s.name === slotName
          ? { ...s, options: s.options.filter((_, i) => i !== optionIdx) }
          : s
      ),
    };
    setMealPlan(updated);
    await save({ mealPlan: updated });
  };

  // ── Shopping actions
  const handleQuickAdd = async (e) => {
    if (e.key !== 'Enter' || !quickAddText.trim()) return;
    const item = {
      id: Date.now().toString(),
      title: quickAddText.trim(),
      purchased: false,
      label1: quickAddLabels[0] || '',
      label2: quickAddLabels[1] || '',
    };
    const updated = [...shoppingList, item];
    setShoppingList(updated);
    await save({ shoppingList: updated });
    setQuickAddText('');
    setQuickAddLabels([]);
  };

  const toggleQuickAddLabel = (label) => {
    if (quickAddLabels.includes(label)) {
      setQuickAddLabels(quickAddLabels.filter(l => l !== label));
    } else if (quickAddLabels.length < 2) {
      setQuickAddLabels([...quickAddLabels, label]);
    }
  };

  const handleTogglePurchased = async (id) => {
    const updated = shoppingList.map(i => i.id === id ? { ...i, purchased: !i.purchased } : i);
    setShoppingList(updated);
    await save({ shoppingList: updated });
  };

  const handleClearPurchased = async () => {
    const updated = shoppingList.filter(i => !i.purchased);
    setShoppingList(updated);
    await save({ shoppingList: updated });
    toast.success('Cleared');
  };

  const handleSaveShoppingItem = async () => {
    if (!shoppingForm.title.trim()) return;
    const editing = typeof shoppingModal === 'object' ? shoppingModal : null;
    const item = {
      id: editing?.id || Date.now().toString(),
      title: shoppingForm.title.trim(),
      purchased: editing?.purchased || false,
      label1: selectedLabels[0] || '',
      label2: selectedLabels[1] || '',
    };
    const updated = editing
      ? shoppingList.map(i => i.id === editing.id ? item : i)
      : [...shoppingList, item];
    setShoppingList(updated);
    await save({ shoppingList: updated });
    setShoppingModal(null);
    toast.success(editing ? 'Updated' : 'Added');
  };

  const handleDeleteShoppingItem = async (id) => {
    const updated = shoppingList.filter(i => i.id !== id);
    setShoppingList(updated);
    await save({ shoppingList: updated });
  };

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const updated = arrayMove(
      shoppingList,
      shoppingList.findIndex(i => i.id === active.id),
      shoppingList.findIndex(i => i.id === over.id)
    );
    setShoppingList(updated);
    await save({ shoppingList: updated });
  };

  const openEditItem = (item) => {
    setShoppingForm({ title: item.title });
    setSelectedLabels([item.label1, item.label2].filter(Boolean));
    setShoppingModal(item);
  };

  const handleToggleLabel = (label) => {
    if (selectedLabels.includes(label)) {
      setSelectedLabels(selectedLabels.filter(l => l !== label));
    } else if (selectedLabels.length < 2) {
      setSelectedLabels([...selectedLabels, label]);
    } else {
      toast.error('Max 2 labels');
    }
  };

  const handleAddLabel = async () => {
    const t = newLabelInput.trim();
    if (!t || availableLabels.includes(t)) return;
    const updated = [...availableLabels, t];
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
    setNewLabelInput('');
  };

  const handleDeleteLabel = async (label) => {
    const updated = availableLabels.filter(l => l !== label);
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
  };

  // ── derived
  const weekDays = getWeekDays(currentWeek.weekStart);
  const today = new Date().toISOString().split('T')[0];
  const purchasedCount = shoppingList.filter(i => i.purchased).length;
  const mealSections = mealPlan?.slots || [];
  const chartData = [...weightHistory]
    .filter(e => e.date)
    .reverse()
    .map(e => ({
      date: format(parseISO(e.date), 'MMM d'),
      weight: e.weight,
    }));

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;

  return (
    <>
      <div className="space-y-8">

        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">
              {new Date().getFullYear()}
            </p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Nutrition</h1>
          </div>
          <button
            onClick={() => setShowWeightModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm shadow-sm"
          >
            <Scale className="w-4 h-4" />
            Weight
          </button>
        </div>

        {/* ── Weekly Check-in ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">This Week</p>
            <button
              onClick={handleInsight}
              disabled={claudeLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-60 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {claudeLoading ? 'Analyzing...' : 'Analyze week'}
            </button>
          </div>

          <div className="flex gap-2 justify-between">
            {weekDays.map((date, i) => {
              const entry = currentWeek.days[date];
              const isToday = date === today;
              const isPast = date <= today;
              return (
                <div key={date} className="flex flex-col items-center gap-1.5 flex-1">
                  <button
                    onClick={() => isPast && openCheckin(date)}
                    disabled={!isPast}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center text-lg transition-all
                      ${entry
                        ? RATING_COLOR(entry.rating)
                        : isToday
                          ? 'bg-white/70 dark:bg-gray-700/70 border-2 border-dashed border-blue-400'
                          : 'bg-white/40 dark:bg-gray-800/40'}
                      ${isPast ? 'cursor-pointer hover:scale-105 active:scale-95' : 'opacity-25 cursor-default'}
                    `}
                  >
                    {entry ? RATING_EMOJI[entry.rating - 1] : isToday ? '＋' : ''}
                  </button>
                  <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    {DAY_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>

          {claudeInsight && (
            <div className="mt-4 px-4 py-3 bg-white/60 dark:bg-gray-800/60 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-sm">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{claudeInsight}</p>
            </div>
          )}
        </div>

        {/* ── Meal Ideas ── */}
        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">Meal Plan</p>

          <div className="flex gap-2 mb-3">
            <textarea
              value={mealPrompt}
              onChange={e => setMealPrompt(e.target.value)}
              placeholder="Ingredients, goals, restrictions... e.g. chicken, rice, eggs · lose weight · no gluten"
              rows={2}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
            <button
              onClick={handleGenerateMeal}
              disabled={mealLoading || !mealPrompt.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-60 shadow-sm whitespace-nowrap self-start"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {mealLoading ? '...' : 'Generate plan'}
            </button>
          </div>

          {mealPlan && (
            <>
              <button
                onClick={() => setShowMealPlan(!showMealPlan)}
                className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-3"
              >
                {showMealPlan ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showMealPlan ? 'Hide plan' : 'View plan'}
                <span className="text-gray-400 dark:text-gray-500 text-xs">
                  {mealPlan.generatedAt ? `· ${format(parseISO(mealPlan.generatedAt), 'MMM d')}` : ''}
                </span>
              </button>

              {showMealPlan && (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                  {mealSections.map(({ name, options }) =>
                    options.length > 0 ? (
                      <div
                        key={name}
                        className="flex-shrink-0 w-36 px-3 py-3 bg-white/60 dark:bg-gray-800/60 rounded-2xl border border-white/60 dark:border-gray-700/60"
                      >
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                          {name}
                        </p>
                        <div className="space-y-1.5">
                          {options.map((opt, i) => {
                            const isEditing = editingMealOption?.slotName === name && editingMealOption?.optionIdx === i;
                            return isEditing ? (
                              <div key={i} className="flex gap-1">
                                <input
                                  autoFocus
                                  value={editingMealText}
                                  onChange={e => setEditingMealText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveMealOptionEdit();
                                    if (e.key === 'Escape') setEditingMealOption(null);
                                  }}
                                  className="flex-1 min-w-0 text-xs px-2 py-1 rounded-lg bg-white dark:bg-gray-700 border border-blue-300 text-gray-900 dark:text-gray-100 focus:outline-none"
                                />
                                <button onClick={saveMealOptionEdit} className="text-blue-500 text-xs font-bold px-1 flex-shrink-0">✓</button>
                              </div>
                            ) : (
                              <div
                                key={i}
                                className="flex items-center gap-1 group text-xs px-2 py-1.5 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg"
                              >
                                <span className="flex-1 leading-tight">{opt}</span>
                                <button
                                  onClick={() => { setEditingMealOption({ slotName: name, optionIdx: i }); setEditingMealText(opt); }}
                                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 transition-opacity flex-shrink-0"
                                >
                                  <Edit className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  onClick={() => removeMealOption(name, i)}
                                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-400 transition-opacity flex-shrink-0"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Shopping List ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowShoppingList(v => !v)}
              className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
            >
              {showShoppingList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Shopping List
              {shoppingList.length > 0 && (
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 normal-case tracking-normal">
                  {shoppingList.length} items
                </span>
              )}
            </button>
            {showShoppingList && purchasedCount > 0 && (
              <button
                onClick={handleClearPurchased}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 text-xs font-medium transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Clear {purchasedCount}
              </button>
            )}
          </div>

          {showShoppingList && (
            <>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={quickAddText}
                  onChange={e => setQuickAddText(e.target.value)}
                  onKeyDown={handleQuickAdd}
                  placeholder="Quick add — press Enter"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={() => {
                    setShoppingForm({ title: '' });
                    setSelectedLabels([]);
                    setShoppingModal('add');
                  }}
                  className="p-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {availableLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {availableLabels.map(label => (
                    <button
                      key={label}
                      onClick={() => toggleQuickAddLabel(label)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        quickAddLabels.includes(label)
                          ? 'bg-blue-500 text-white'
                          : 'bg-white/60 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {shoppingList.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  Empty list. Quick add above or tap +
                </p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={shoppingList.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {shoppingList.map(item => (
                        <SortableShoppingItem
                          key={item.id}
                          item={item}
                          onToggle={handleTogglePurchased}
                          onEdit={openEditItem}
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

      </div>

      {/* ── Check-in Modal ── */}
      {checkinModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setCheckinModal(null)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  {format(parseISO(checkinModal), 'EEEE, MMM d')}
                </h3>
                <button onClick={() => setCheckinModal(null)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">How did you eat today?</p>
              <div className="flex gap-2 justify-between mb-5">
                {[1, 2, 3, 4, 5].map(r => (
                  <button
                    key={r}
                    onClick={() => setCheckinForm(f => ({ ...f, rating: r }))}
                    className={`flex-1 py-3 rounded-xl text-xl transition-all ${
                      checkinForm.rating === r
                        ? RATING_COLOR(r) + ' scale-105 shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}
                  >
                    {RATING_EMOJI[r - 1]}
                  </button>
                ))}
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={checkinForm.note}
                  onChange={e => setCheckinForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="What did you eat? Any notes..."
                  className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="mb-6">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Weight kg (optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={checkinForm.weight}
                  onChange={e => setCheckinForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="e.g. 75.5"
                  className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <button onClick={saveCheckin} className="btn-primary w-full">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Weight History Modal ── */}
      {showWeightModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShowWeightModal(false)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Weight History</h3>
                <button onClick={() => setShowWeightModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {weightHistory.length > 0 ? (
                <>
                  <div className="text-center mb-5">
                    <p className="text-4xl font-bold text-blue-500">{weightHistory[0].weight} kg</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Last recorded · {format(parseISO(weightHistory[0].date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {chartData.length > 1 && (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                  <div className="mt-4 max-h-40 overflow-y-auto space-y-1">
                    {weightHistory.slice(0, 15).map(e => (
                      <div
                        key={e.id}
                        className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                      >
                        <span className="text-gray-500">{format(parseISO(e.date), 'MMM d, yyyy')}</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{e.weight} kg</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">
                  No weight data yet. Log it optionally during your daily check-in.
                </p>
              )}

              <button onClick={() => setShowWeightModal(false)} className="btn-secondary w-full mt-5">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shopping Item Modal ── */}
      {shoppingModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShoppingModal(null)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  {typeof shoppingModal === 'object' ? 'Edit Item' : 'Add Item'}
                </h3>
                <button onClick={() => setShoppingModal(null)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Name *</label>
                  <input
                    type="text"
                    value={shoppingForm.title}
                    onChange={e => setShoppingForm(f => ({ ...f, title: e.target.value }))}
                    className="input-field"
                    placeholder="Item name"
                    autoFocus
                  />
                </div>

                {/* Labels */}
                <div>
                  <label className="label">Labels (up to 2)</label>
                  {availableLabels.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {availableLabels.map(label => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => handleToggleLabel(label)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                            selectedLabels.includes(label)
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {label}
                          {selectedLabels.includes(label) && (
                            <span className="text-white/70">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Inline add label */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newLabelInput}
                      onChange={e => setNewLabelInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel(); } }}
                      placeholder="New label..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                    <button
                      type="button"
                      onClick={handleAddLabel}
                      disabled={!newLabelInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium disabled:opacity-40"
                    >
                      Add
                    </button>
                    {availableLabels.map(label => (
                      <button
                        key={`del-${label}`}
                        type="button"
                        onClick={() => handleDeleteLabel(label)}
                        className="hidden"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShoppingModal(null)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveShoppingItem}
                    disabled={!shoppingForm.title.trim()}
                    className="btn-primary flex-1"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Food;
