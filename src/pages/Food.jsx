import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from '../utils/toast';
import ConfirmModal from '../components/ConfirmModal';
import {
  Plus, X, Scale, Trash2, Edit, Sparkles, GripVertical,
  ChevronDown, ChevronUp, RotateCcw, Pill, Check
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
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
};

const getWeekDays = (weekStart) => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push(toLocalDateStr(d));
  }
  return days;
};

const addDaysToDateStr = (dateStr, n) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
};

const daysBetween = (from, to) => {
  const a = new Date(from + 'T12:00:00');
  const b = new Date(to + 'T12:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const generateDefaultTimes = (frequencyHours) => {
  const n = Math.max(1, Math.round(24 / Number(frequencyHours)));
  return Array.from({ length: n }, (_, i) => {
    const h = Math.floor((8 + i * Number(frequencyHours)) % 24);
    return `${String(h).padStart(2, '0')}:00`;
  });
};

// Sort priority: active-pending by next dose minutes, all-done-today → 2000, inactive/expired → 3000
const getMedicineSortPriority = (med, todayStr) => {
  const endDate = addDaysToDateStr(med.startDate, med.durationDays);
  const notStarted = todayStr < med.startDate;
  const isCompleted = todayStr >= endDate;
  if (isCompleted || notStarted) return 3000;
  const dosesPerDay = Math.max(1, Math.round(24 / med.frequencyHours));
  const rawLog = med.log?.[todayStr];
  const takenCount = typeof rawLog === 'boolean' ? (rawLog ? dosesPerDay : 0) : (rawLog || 0);
  if (takenCount >= dosesPerDay) return 2000;
  const times = med.doseTimes || [];
  const next = times[takenCount] || '23:59';
  const [h, m] = next.split(':').map(Number);
  return h * 60 + (m || 0);
};

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const RATING_EMOJI = ['😵', '😞', '😐', '🙂', '🥗'];
const RATING_COLOR = (r) =>
  ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-lime-400', 'bg-green-400'][r - 1] || 'bg-gray-200';

const LABEL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b',
];

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
const SortableShoppingItem = ({ item, onToggle, onEdit, onDelete, labelColorMap = {} }) => {
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
          <div className="flex gap-1 mt-1 flex-wrap">
            {[item.label1, item.label2].filter(Boolean).map(l => (
              <span
                key={l}
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: labelColorMap[l] || '#64748b' }}
              >
                {l}
              </span>
            ))}
          </div>
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
  const [deleteMealConfirm, setDeleteMealConfirm] = useState(null); // { slotName, optionIdx }
  const [showAiModal, setShowAiModal] = useState(false);

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
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[4]);
  const [editingLabel, setEditingLabel] = useState(null); // { originalName, name, color }

  // ── Weight
  const [weightHistory, setWeightHistory] = useState([]);
  const [showWeightModal, setShowWeightModal] = useState(false);

  // ── Medicines
  const [medicines, setMedicines] = useState([]);
  const [showMedicines, setShowMedicines] = useState(true);
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [medicineForm, setMedicineForm] = useState({ name: '', dose: '', frequencyHours: '24', durationDays: '7', startDate: '', doseTimes: ['08:00'], note: '' });
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [deleteMedicineConfirm, setDeleteMedicineConfirm] = useState(null);

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
        setMedicines(data.medicines || []);
        const rawLabels = data.availableLabels || [];
        setAvailableLabels(rawLabels.map(l =>
          typeof l === 'string' ? { name: l, color: '#64748b' } : l
        ));
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

    setShowAiModal(false);
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

  // ── Medicine actions
  const openAddMedicine = () => {
    setEditingMedicine(null);
    setMedicineForm({ name: '', dose: '', frequencyHours: '24', durationDays: '7', startDate: toLocalDateStr(new Date()), doseTimes: ['08:00'], note: '' });
    setShowMedicineModal(true);
  };

  const openEditMedicine = (med) => {
    setEditingMedicine(med);
    setMedicineForm({
      name: med.name,
      dose: med.dose,
      frequencyHours: String(med.frequencyHours),
      durationDays: String(med.durationDays),
      startDate: med.startDate,
      doseTimes: med.doseTimes || generateDefaultTimes(med.frequencyHours),
      note: med.note || '',
    });
    setShowMedicineModal(true);
  };

  const handleSaveMedicine = async () => {
    if (!medicineForm.name.trim() || !medicineForm.dose.trim()) return;
    const med = {
      id: editingMedicine?.id || Date.now().toString(),
      name: medicineForm.name.trim(),
      dose: medicineForm.dose.trim(),
      frequencyHours: Number(medicineForm.frequencyHours) || 24,
      durationDays: Number(medicineForm.durationDays) || 1,
      startDate: medicineForm.startDate || toLocalDateStr(new Date()),
      doseTimes: medicineForm.doseTimes,
      note: medicineForm.note.trim(),
      log: editingMedicine?.log || {},
    };
    const updated = editingMedicine
      ? medicines.map(m => m.id === editingMedicine.id ? med : m)
      : [...medicines, med];
    setMedicines(updated);
    await save({ medicines: updated });
    setShowMedicineModal(false);
    setEditingMedicine(null);
    toast.success(editingMedicine ? 'Actualizado' : 'Medicamento agregado');
  };

  const handleToggleMedicineTaken = async (medId) => {
    const todayStr = toLocalDateStr(new Date());
    const updated = medicines.map(m => {
      if (m.id !== medId) return m;
      const dosesPerDay = Math.max(1, Math.round(24 / m.frequencyHours));
      const rawLog = m.log?.[todayStr];
      const current = typeof rawLog === 'boolean' ? (rawLog ? dosesPerDay : 0) : (rawLog || 0);
      const next = current >= dosesPerDay ? 0 : current + 1;
      return { ...m, log: { ...m.log, [todayStr]: next } };
    });
    setMedicines(updated);
    await save({ medicines: updated });
  };

  const handleDeleteMedicine = async (medId) => {
    const updated = medicines.filter(m => m.id !== medId);
    setMedicines(updated);
    await save({ medicines: updated });
    setDeleteMedicineConfirm(null);
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
    if (!t || availableLabels.some(l => l.name === t)) return;
    const updated = [...availableLabels, { name: t, color: newLabelColor }];
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
    setNewLabelInput('');
    setNewLabelColor(LABEL_COLORS[4]);
  };

  const handleSaveLabelEdit = async () => {
    if (!editingLabel || !editingLabel.name.trim()) return;
    const updated = availableLabels.map(l =>
      l.name === editingLabel.originalName
        ? { name: editingLabel.name.trim(), color: editingLabel.color }
        : l
    );
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
    setEditingLabel(null);
  };

  const handleDeleteLabel = async (labelName) => {
    const updated = availableLabels.filter(l => l.name !== labelName);
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
  };

  // ── derived
  const labelColorMap = Object.fromEntries(availableLabels.map(l => [l.name, l.color]));
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
                  <span className={`text-xs font-bold uppercase ${isToday ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}>
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

        {/* ── Meal Plan ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Meal Plan</p>
            <button
              onClick={() => setShowAiModal(true)}
              disabled={mealLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-60 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {mealLoading ? 'Generating...' : 'Get AI help'}
            </button>
          </div>

          {mealPlan && (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              {mealSections.map(({ name, options }) =>
                options.length > 0 ? (
                  <div
                    key={name}
                    className="flex-shrink-0 w-48 px-3 py-3 bg-white/60 dark:bg-gray-800/60 rounded-2xl border border-white/60 dark:border-gray-700/60"
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
                            className="flex items-center gap-1 text-xs px-2 py-1.5 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg"
                          >
                            <span className="flex-1 leading-tight">{opt}</span>
                            <button
                              onClick={() => { setEditingMealOption({ slotName: name, optionIdx: i }); setEditingMealText(opt); }}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteMealConfirm({ slotName: name, optionIdx: i })}
                              className="text-gray-400 hover:text-red-400 flex-shrink-0 p-1"
                            >
                              <X className="w-4 h-4" />
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
                  {availableLabels.map(label => {
                    const selected = quickAddLabels.includes(label.name);
                    return (
                      <button
                        key={label.name}
                        onClick={() => toggleQuickAddLabel(label.name)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium transition-all text-white"
                        style={{
                          backgroundColor: label.color,
                          opacity: selected ? 1 : 0.45,
                          outline: selected ? `2px solid ${label.color}` : 'none',
                          outlineOffset: '2px',
                        }}
                      >
                        {label.name}
                      </button>
                    );
                  })}
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
                          labelColorMap={labelColorMap}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </div>

        {/* ── Medicines ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowMedicines(v => !v)}
              className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
            >
              {showMedicines ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Medicamentos
              {medicines.length > 0 && (
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 normal-case tracking-normal">
                  {medicines.filter(m => toLocalDateStr(new Date()) < addDaysToDateStr(m.startDate, m.durationDays)).length} activos
                </span>
              )}
            </button>
            {showMedicines && (
              <button
                onClick={openAddMedicine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 text-xs font-medium transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </button>
            )}
          </div>

          {showMedicines && (
            <div className="space-y-3">
              {medicines.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  Sin medicamentos activos.
                </p>
              ) : (
                [...medicines]
                  .sort((a, b) => {
                    const t = toLocalDateStr(new Date());
                    return getMedicineSortPriority(a, t) - getMedicineSortPriority(b, t);
                  })
                  .map(med => {
                    const todayStr = toLocalDateStr(new Date());
                    const endDate = addDaysToDateStr(med.startDate, med.durationDays);
                    const notStarted = todayStr < med.startDate;
                    const isActive = !notStarted && todayStr < endDate;
                    const isCompleted = todayStr >= endDate;
                    const dayNumber = isActive ? daysBetween(med.startDate, todayStr) + 1 : 0;
                    const dosesPerDay = Math.max(1, Math.round(24 / med.frequencyHours));
                    const rawLog = med.log?.[todayStr];
                    const takenCount = typeof rawLog === 'boolean' ? (rawLog ? dosesPerDay : 0) : (rawLog || 0);
                    const fullTaken = takenCount >= dosesPerDay;
                    const freqLabel = med.frequencyHours === 24
                      ? '1 vez al día'
                      : med.frequencyHours > 24
                      ? `cada ${med.frequencyHours}h`
                      : `${dosesPerDay} veces al día`;
                    const times = med.doseTimes || generateDefaultTimes(med.frequencyHours);

                    return (
                      <div
                        key={med.id}
                        className={`p-4 rounded-xl border transition-colors ${
                          isActive && fullTaken
                            ? 'bg-green-50/70 dark:bg-green-900/10 border-green-200/60 dark:border-green-700/40'
                            : isActive
                            ? 'bg-white/70 dark:bg-gray-800/70 border-white/60 dark:border-gray-700/60'
                            : 'bg-white/30 dark:bg-gray-800/30 border-white/40 dark:border-gray-700/40 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isActive && fullTaken ? 'bg-green-100 dark:bg-green-900/30'
                            : isActive ? 'bg-blue-100 dark:bg-blue-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                          }`}>
                            <Pill className={`w-4 h-4 ${
                              isActive && fullTaken ? 'text-green-500'
                              : isActive ? 'text-blue-500'
                              : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{med.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{med.dose} · {freqLabel}</p>
                            {isActive && (
                              <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                                Día {dayNumber} de {med.durationDays}
                              </p>
                            )}
                            {isCompleted && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tratamiento completado</p>
                            )}
                            {isActive && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {times.map((t, i) => (
                                  <span
                                    key={i}
                                    className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                                      i < takenCount
                                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 line-through opacity-60'
                                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                    }`}
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            {isActive && fullTaken && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">✓ Completado por hoy</p>
                            )}
                            {med.note ? (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{med.note}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isActive && (
                              <button
                                onClick={() => handleToggleMedicineTaken(med.id)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-xs font-bold ${
                                  fullTaken
                                    ? 'bg-green-500 text-white'
                                    : takenCount > 0
                                    ? 'bg-amber-400 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                                }`}
                                title={`${takenCount}/${dosesPerDay} dosis`}
                              >
                                {fullTaken || dosesPerDay === 1 ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  takenCount > 0 ? `${takenCount}/${dosesPerDay}` : <Check className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => openEditMedicine(med)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteMedicineConfirm(med.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
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
                      {availableLabels.map(label => {
                        const selected = selectedLabels.includes(label.name);
                        const isEditing = editingLabel?.originalName === label.name;
                        return isEditing ? (
                          <div key={label.name} className="w-full space-y-1.5 p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                            <div className="flex gap-1.5">
                              {LABEL_COLORS.map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditingLabel(prev => ({ ...prev, color: c }))}
                                  className="w-5 h-5 rounded-full flex-shrink-0 transition-transform"
                                  style={{
                                    backgroundColor: c,
                                    outline: editingLabel.color === c ? `2px solid ${c}` : 'none',
                                    outlineOffset: '2px',
                                    transform: editingLabel.color === c ? 'scale(1.2)' : 'scale(1)',
                                  }}
                                />
                              ))}
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={editingLabel.name}
                                onChange={e => setEditingLabel(prev => ({ ...prev, name: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveLabelEdit(); } if (e.key === 'Escape') setEditingLabel(null); }}
                                className="flex-1 px-2 py-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-300"
                                autoFocus
                              />
                              <button type="button" onClick={handleSaveLabelEdit} className="px-2 py-1 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: editingLabel.color }}>✓</button>
                              <button type="button" onClick={() => setEditingLabel(null)} className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                          </div>
                        ) : (
                          <div key={label.name} className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleToggleLabel(label.name)}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-all text-white flex items-center gap-1"
                              style={{
                                backgroundColor: label.color,
                                opacity: selected ? 1 : 0.45,
                                outline: selected ? `2px solid ${label.color}` : 'none',
                                outlineOffset: '2px',
                              }}
                            >
                              {label.name}
                              {selected && <span>✓</span>}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLabel({ originalName: label.name, name: label.name, color: label.color })}
                              className="text-gray-300 hover:text-gray-500 p-0.5"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLabel(label.name)}
                              className="text-gray-300 hover:text-red-400 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Inline add label */}
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      {LABEL_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewLabelColor(c)}
                          className="w-5 h-5 rounded-full flex-shrink-0 transition-transform"
                          style={{
                            backgroundColor: c,
                            outline: newLabelColor === c ? `2px solid ${c}` : 'none',
                            outlineOffset: '2px',
                            transform: newLabelColor === c ? 'scale(1.2)' : 'scale(1)',
                          }}
                        />
                      ))}
                    </div>
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
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                        style={{ backgroundColor: newLabelColor }}
                      >
                        Add
                      </button>
                    </div>
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

      {/* AI modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">AI Meal Plan</h3>
              <button onClick={() => setShowAiModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={mealPrompt}
              onChange={e => setMealPrompt(e.target.value)}
              placeholder="Ingredients, goals, restrictions... e.g. chicken, rice, eggs · lose weight · no gluten"
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-4"
              autoFocus
            />
            <button
              onClick={handleGenerateMeal}
              disabled={!mealPrompt.trim()}
              className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              Generate plan
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteMealConfirm}
        onClose={() => setDeleteMealConfirm(null)}
        onConfirm={() => removeMealOption(deleteMealConfirm.slotName, deleteMealConfirm.optionIdx)}
        title="Remove option"
        message="Are you sure you want to remove this meal option?"
        confirmText="Remove"
      />

      {/* ── Medicine Modal ── */}
      {showMedicineModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShowMedicineModal(false)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  {editingMedicine ? 'Editar medicamento' : 'Nuevo medicamento'}
                </h3>
                <button onClick={() => setShowMedicineModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="label">Nombre *</label>
                  <input
                    className="input-field"
                    placeholder="ej. Ibuprofeno"
                    value={medicineForm.name}
                    onChange={e => setMedicineForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Dosis *</label>
                  <input
                    className="input-field"
                    placeholder="ej. 1 pastilla, 5ml"
                    value={medicineForm.dose}
                    onChange={e => setMedicineForm(f => ({ ...f, dose: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Cada cuántas horas</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="ej. 8 → 3 veces/día · 24 → 1 vez/día"
                    value={medicineForm.frequencyHours}
                    onChange={e => {
                      const fh = e.target.value;
                      setMedicineForm(f => ({
                        ...f,
                        frequencyHours: fh,
                        doseTimes: fh && Number(fh) > 0 ? generateDefaultTimes(fh) : f.doseTimes,
                      }));
                    }}
                    min="1"
                  />
                  {medicineForm.frequencyHours && Number(medicineForm.frequencyHours) > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {Number(medicineForm.frequencyHours) === 24
                        ? '1 vez al día'
                        : Number(medicineForm.frequencyHours) > 24
                        ? `cada ${medicineForm.frequencyHours}h`
                        : `${Math.round(24 / Number(medicineForm.frequencyHours))} veces al día`}
                    </p>
                  )}
                </div>
                {medicineForm.doseTimes.length > 0 && (
                  <div>
                    <label className="label">Horarios de dosis</label>
                    <div className="space-y-2">
                      {medicineForm.doseTimes.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-16 flex-shrink-0">Dosis {i + 1}</span>
                          <input
                            type="time"
                            className="input-field flex-1"
                            value={t}
                            onChange={e => {
                              const newTimes = [...medicineForm.doseTimes];
                              newTimes[i] = e.target.value;
                              setMedicineForm(f => ({ ...f, doseTimes: newTimes }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="label">Duración (días)</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="ej. 7"
                    value={medicineForm.durationDays}
                    onChange={e => setMedicineForm(f => ({ ...f, durationDays: e.target.value }))}
                    min="1"
                  />
                </div>
                <div>
                  <label className="label">Fecha de inicio</label>
                  <input
                    type="date"
                    className="input-field"
                    value={medicineForm.startDate}
                    onChange={e => setMedicineForm(f => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Nota</label>
                  <input
                    className="input-field"
                    placeholder="ej. Tomar con comida"
                    value={medicineForm.note}
                    onChange={e => setMedicineForm(f => ({ ...f, note: e.target.value }))}
                  />
                </div>
                <button
                  onClick={handleSaveMedicine}
                  disabled={!medicineForm.name.trim() || !medicineForm.dose.trim()}
                  className="btn-primary w-full"
                >
                  {editingMedicine ? 'Guardar cambios' : 'Agregar medicamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteMedicineConfirm}
        onClose={() => setDeleteMedicineConfirm(null)}
        onConfirm={() => handleDeleteMedicine(deleteMedicineConfirm)}
        title="Eliminar medicamento"
        message="¿Seguro que quieres eliminar este medicamento?"
        confirmText="Eliminar"
      />
    </>
  );
};

export default Food;
