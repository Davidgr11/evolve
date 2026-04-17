import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from '../utils/toast';
import ConfirmModal from '../components/ConfirmModal';
import {
  Plus, X, Scale, Trash2, Edit, Sparkles, GripVertical,
  ChevronDown, ChevronUp, RotateCcw, Pill, Check,
  ShoppingCart, Loader2, ChevronRight, Tag,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, TouchSensor
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy
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
  const [h, mins] = next.split(':').map(Number);
  return h * 60 + (mins || 0);
};

const LABEL_GRAY = '#6b7280';

const MEAL_EMOJIS = ['🥙', '🥗', '🍳', '🥑', '🐟', '🍚', '🥦', '🫙', '🥕', '🍜'];

// ─── Plan setup options ────────────────────────────────────────────────────
const GOAL_OPTIONS = [
  { value: 'fat_loss',  emoji: '🔥', label: 'Bajar grasa / peso',            desc: 'Déficit calórico, alta proteína, menos carbohidratos refinados' },
  { value: 'muscle',    emoji: '💪', label: 'Ganar músculo y masa',           desc: 'Superávit moderado, alta proteína, carbohidratos de calidad' },
  { value: 'longevity', emoji: '🥗', label: 'Dieta equilibrada y longevidad', desc: 'Estilo mediterráneo, antiinflamatorio, variado y sostenible' },
];

const LIFESTYLE_OPTIONS = [
  { value: 'home',  emoji: '🏠', label: 'Cocino en casa casi todos los días' },
  { value: 'busy',  emoji: '💼', label: 'Tengo tiempo limitado para cocinar' },
  { value: 'mixed', emoji: '⚡', label: 'Una mezcla de ambos' },
];

// ─── Claude helper ────────────────────────────────────────────────────────
const callClaude = async (prompt, maxTokens = 600) => {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
  if (!apiKey || apiKey === 'your_claude_api_key_here') throw new Error('no key');
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
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).content[0].text.trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
};

// ─── SortableShoppingItem ─────────────────────────────────────────────────
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
          <div className="flex gap-1 mt-1 flex-wrap">
            {[item.label1, item.label2].filter(Boolean).map(l => (
              <span
                key={l}
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: LABEL_GRAY }}
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

// ─── Food ─────────────────────────────────────────────────────────────────
const Food = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Weight
  const [weightHistory, setWeightHistory] = useState([]);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showAddWeightModal, setShowAddWeightModal] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState('');
  const [newWeightDate, setNewWeightDate] = useState(toLocalDateStr(new Date()));
  const [savingWeight, setSavingWeight] = useState(false);

  // Shopping
  const [shoppingList, setShoppingList] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [shoppingItemModal, setShoppingItemModal] = useState(null); // null | 'add' | item
  const [shoppingForm, setShoppingForm] = useState({ title: '' });
  const [selectedLabels, setSelectedLabels] = useState([]);
  // Labels modal
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [labelEditingName, setLabelEditingName] = useState(null);
  const [labelEditInput, setLabelEditInput] = useState('');
  const [newLabelModalInput, setNewLabelModalInput] = useState('');

  // Meal Plan
  const [mealPlan, setMealPlan] = useState(null);
  const [showPlanSetupModal, setShowPlanSetupModal] = useState(false);
  const [planSetupForm, setPlanSetupForm] = useState({ goal: '', lifestyle: '', restrictions: '' });
  const [mealLoading, setMealLoading] = useState(false);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalResult, setEvalResult] = useState('');
  const [evalLoading, setEvalLoading] = useState(false);
  const [selectedMealOption, setSelectedMealOption] = useState(null); // { slotName, option, idx }
  const [mealOptionForm, setMealOptionForm] = useState({ name: '', description: '' });
  const [addingMealToSlot, setAddingMealToSlot] = useState(null);
  const [addMealForm, setAddMealForm] = useState({ name: '', description: '' });
  const [expandedMealOption, setExpandedMealOption] = useState(null); // `${slotName}-${idx}`
  const [addedSuggestions, setAddedSuggestions] = useState(new Set());

  // Medicines
  const [medicines, setMedicines] = useState([]);
  const [showMedicines, setShowMedicines] = useState(true);
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [medicineForm, setMedicineForm] = useState({ name: '', dose: '', frequencyHours: '24', durationDays: '7', startDate: '', doseTimes: ['08:00'], note: '' });
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [deleteMedicineConfirm, setDeleteMedicineConfirm] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/food`, 'data'));
      if (snap.exists()) {
        const data = snap.data();
        setShoppingList(data.shoppingList || []);
        setWeightHistory(data.weightHistory || []);
        setMedicines(data.medicines || []);
        const rawLabels = data.availableLabels || [];
        setAvailableLabels(rawLabels.map(l =>
          typeof l === 'string' ? { name: l } : { name: l.name }
        ));
        if (data.mealPlanV2) setMealPlan(data.mealPlanV2);
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
      toast.error('Error al guardar');
      console.error(err);
    }
  };

  // ── Weight ──────────────────────────────────────────────────────────────
  const handleAddWeight = async () => {
    if (!newWeightInput) return;
    setSavingWeight(true);
    try {
      const entry = { date: newWeightDate, weight: parseFloat(newWeightInput), id: Date.now().toString() };
      const updated = [...weightHistory.filter(w => w.date !== newWeightDate), entry]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setWeightHistory(updated);
      await save({ weightHistory: updated });
      setNewWeightInput('');
      setNewWeightDate(toLocalDateStr(new Date()));
      setShowAddWeightModal(false);
      toast.success('Registro guardado');
    } finally {
      setSavingWeight(false);
    }
  };

  const handleDeleteWeight = async (id) => {
    const updated = weightHistory.filter(w => w.id !== id);
    setWeightHistory(updated);
    await save({ weightHistory: updated });
  };

  // ── Shopping ─────────────────────────────────────────────────────────────
  const handleTogglePurchased = async (id) => {
    const updated = shoppingList.map(i => i.id === id ? { ...i, purchased: !i.purchased } : i);
    setShoppingList(updated);
    await save({ shoppingList: updated });
  };

  const handleClearPurchased = async () => {
    const updated = shoppingList.map(i => ({ ...i, purchased: false }));
    setShoppingList(updated);
    await save({ shoppingList: updated });
    toast.success('Lista reiniciada');
  };

  const handleSaveShoppingItem = async () => {
    if (!shoppingForm.title.trim()) return;
    const editing = typeof shoppingItemModal === 'object' ? shoppingItemModal : null;
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
    setShoppingItemModal(null);
    toast.success(editing ? 'Actualizado' : 'Agregado');
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
    setShoppingItemModal(item);
  };

  const handleToggleLabel = (label) => {
    if (selectedLabels.includes(label)) {
      setSelectedLabels(selectedLabels.filter(l => l !== label));
    } else if (selectedLabels.length < 2) {
      setSelectedLabels([...selectedLabels, label]);
    } else {
      toast.error('Máximo 2 etiquetas');
    }
  };


  const handleDeleteLabel = async (labelName) => {
    const updated = availableLabels.filter(l => l.name !== labelName);
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
  };

  const handleStartEditLabel = (name) => { setLabelEditingName(name); setLabelEditInput(name); };

  const handleSaveEditLabel = async () => {
    const newName = labelEditInput.trim();
    if (!newName || newName === labelEditingName) { setLabelEditingName(null); return; }
    if (availableLabels.some(l => l.name === newName)) { toast.error('Ya existe esa etiqueta'); return; }
    const updatedLabels = availableLabels.map(l => l.name === labelEditingName ? { name: newName } : l);
    const updatedList = shoppingList.map(i => ({
      ...i,
      label1: i.label1 === labelEditingName ? newName : i.label1,
      label2: i.label2 === labelEditingName ? newName : i.label2,
    }));
    setAvailableLabels(updatedLabels);
    setShoppingList(updatedList);
    await save({ availableLabels: updatedLabels, shoppingList: updatedList });
    setLabelEditingName(null);
    toast.success('Etiqueta actualizada');
  };

  const handleAddLabelInModal = async () => {
    const t = newLabelModalInput.trim();
    if (!t || availableLabels.some(l => l.name === t)) return;
    const updated = [...availableLabels, { name: t }];
    setAvailableLabels(updated);
    await save({ availableLabels: updated });
    setNewLabelModalInput('');
  };

  // ── Meal Plan ──────────────────────────────────────────────────────────────
  const handleGeneratePlan = async () => {
    if (!planSetupForm.goal || !planSetupForm.lifestyle) {
      toast.error('Selecciona tu objetivo y estilo de vida');
      return;
    }
    const goalLabel = GOAL_OPTIONS.find(g => g.value === planSetupForm.goal)?.label || '';
    const lifestyleLabel = LIFESTYLE_OPTIONS.find(l => l.value === planSetupForm.lifestyle)?.label || '';

    setMealLoading(true);
    try {
      const prompt = `Eres un nutricionista experto en longevidad y alimentación saludable para personas mexicanas. Genera un plan de alimentación semanal personalizado.

Perfil:
- Objetivo: ${goalLabel}
- Estilo de vida: ${lifestyleLabel}
${planSetupForm.restrictions ? `- Restricciones: ${planSetupForm.restrictions}` : ''}

Reglas:
- Aplica principios de longevidad (mediterráneo, antiinflamatorio, alta fibra, proteína de calidad)
- Usa ingredientes accesibles en México; menciona marcas mexicanas si es útil (Lala, Alpura, Costco, etc.)
- Cada opción: nombre corto (3-7 palabras) + descripción práctica con cantidades y contexto (máx 25 palabras)
- Desayuno y Comida: 3 opciones. Snack AM, Snack PM, Cena: 2 opciones.

Responde SOLO con este JSON:
{
  "slots": [
    {"name": "Desayuno", "options": [{"name": "...", "description": "..."}, ...]},
    {"name": "Snack AM", "options": [{"name": "...", "description": "..."}, ...]},
    {"name": "Comida", "options": [{"name": "...", "description": "..."}, ...]},
    {"name": "Snack PM", "options": [{"name": "...", "description": "..."}, ...]},
    {"name": "Cena", "options": [{"name": "...", "description": "..."}, ...]}
  ]
}`;

      const text = await callClaude(prompt, 1400);
      const parsed = JSON.parse(text);
      const plan = {
        slots: parsed.slots,
        setup: planSetupForm,
        generatedAt: new Date().toISOString(),
      };
      setMealPlan(plan);
      await save({ mealPlanV2: plan });
      setShowPlanSetupModal(false);
      toast.success('¡Plan generado!');
    } catch (err) {
      toast.error('Error al generar el plan');
      console.error(err);
    } finally {
      setMealLoading(false);
    }
  };

  const handleEvalPlan = async () => {
    if (!mealPlan?.slots?.length) return;
    setEvalLoading(true);
    setEvalResult('');
    setSuggestionSlotPicker(null);
    try {
      const planText = mealPlan.slots.map(s =>
        `${s.name}:\n${s.options.map(o => `  - ${o.name}`).join('\n')}`
      ).join('\n\n');
      const allFoodNames = mealPlan.slots.flatMap(s => s.options.map(o => o.name));
      const setup = mealPlan.setup || {};
      const goalLabel = GOAL_OPTIONS.find(g => g.value === setup.goal)?.label || '';
      const lifestyleLabel = LIFESTYLE_OPTIONS.find(l => l.value === setup.lifestyle)?.label || '';
      const setupContext = goalLabel
        ? `Perfil del usuario: objetivo = ${goalLabel}${lifestyleLabel ? `, estilo de vida = ${lifestyleLabel}` : ''}${setup.restrictions ? `, restricciones = ${setup.restrictions}` : ''}`
        : '';
      const text = await callClaude(
        `Evalúa este plan de alimentación desde la perspectiva de la longevidad y salud. Sé directo y útil. Responde en español, plain text, sin markdown.
${setupContext ? `\n${setupContext}\n` : ''}
PLAN:
${planText}

Estructura tu respuesta así:
1. Un punto fuerte del plan
2. Un área de mejora
3. Si hay algo importante que falta, sugiere 1 o 2 opciones específicas adaptadas al perfil del usuario. NO repitas ningún alimento que ya está en el plan. Usa el formato exacto:
SUGERENCIA: [nombre corto]: [descripción breve de ingredientes, máx 20 palabras]`,
        500
      );
      setEvalResult(text);
    } catch {
      toast.error('Error al evaluar');
    } finally {
      setEvalLoading(false);
    }
  };

  const parseSuggestions = (text) => {
    const lines = text.split('\n');
    const suggestions = [];
    for (const line of lines) {
      const match = line.match(/SUGERENCIA:\s*([^:]+):\s*(.+)/);
      if (match) suggestions.push({ name: match[1].trim(), description: match[2].trim() });
    }
    return suggestions;
  };

  const evalMainText = evalResult
    ? evalResult.split('\n').filter(l => !l.startsWith('SUGERENCIA:')).join('\n').trim()
    : '';

  const openMealOptionModal = (slotName, option, idx) => {
    setSelectedMealOption({ slotName, option, idx });
    setMealOptionForm({ name: option.name, description: option.description || '' });
  };

  const handleSaveMealOption = async () => {
    if (!mealOptionForm.name.trim()) return;
    const updated = {
      ...mealPlan,
      slots: mealPlan.slots.map(s =>
        s.name === selectedMealOption.slotName
          ? { ...s, options: s.options.map((o, i) => i === selectedMealOption.idx ? { ...o, name: mealOptionForm.name.trim(), description: mealOptionForm.description.trim() } : o) }
          : s
      ),
    };
    setMealPlan(updated);
    await save({ mealPlanV2: updated });
    setSelectedMealOption(null);
    setExpandedMealOption(null);
    toast.success('Opción actualizada');
  };

  const handleDeleteMealOption = async () => {
    const updated = {
      ...mealPlan,
      slots: mealPlan.slots.map(s =>
        s.name === selectedMealOption.slotName
          ? { ...s, options: s.options.filter((_, i) => i !== selectedMealOption.idx) }
          : s
      ),
    };
    setMealPlan(updated);
    await save({ mealPlanV2: updated });
    setSelectedMealOption(null);
    setExpandedMealOption(null);
    toast.success('Opción eliminada');
  };

  const handleAddMealOption = async () => {
    if (!addMealForm.name.trim()) return;
    const updated = {
      ...mealPlan,
      slots: mealPlan.slots.map(s =>
        s.name === addingMealToSlot
          ? { ...s, options: [...s.options, { name: addMealForm.name.trim(), description: addMealForm.description.trim() }] }
          : s
      ),
    };
    setMealPlan(updated);
    await save({ mealPlanV2: updated });
    setAddingMealToSlot(null);
    setAddMealForm({ name: '', description: '' });
    toast.success(`Opción agregada a ${addingMealToSlot}`);
  };

  const [suggestionSlotPicker, setSuggestionSlotPicker] = useState(null); // suggestion index | null

  const handleAddSuggestionToSlot = async (suggestion, slotName) => {
    if (!mealPlan?.slots) return;
    const updated = {
      ...mealPlan,
      slots: mealPlan.slots.map(s =>
        s.name === slotName
          ? { ...s, options: [...s.options, { name: suggestion.name, description: suggestion.description }] }
          : s
      ),
    };
    setMealPlan(updated);
    await save({ mealPlanV2: updated });
    setAddedSuggestions(prev => new Set([...prev, suggestion.name]));
    setSuggestionSlotPicker(null);
    toast.success(`Agregado a ${slotName}`);
  };

  // ── Medicines ──────────────────────────────────────────────────────────────
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

  // Derived
  const chartData = [...weightHistory]
    .filter(e => e.date)
    .reverse()
    .map(e => ({ date: format(parseISO(e.date), 'dd MMM'), weight: e.weight }));

  const purchasedCount = shoppingList.filter(i => i.purchased).length;

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Cargando...</div>;

  return (
    <>
      <div className="space-y-8">

        {/* ── Header ── */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Nutrición</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWeightModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm shadow-sm"
            >
              <Scale className="w-4 h-4" />
              Control de peso
            </button>
            <button
              onClick={() => setShowShoppingModal(true)}
              className="p-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors shadow-sm"
              title="Lista del super"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Medicines (temporarily hidden) ── */}
        {false && <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowMedicines(v => !v)}
              className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
            >
              {showMedicines ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Medicamentos
              {medicines.length > 0 && (
                <span className="text-sm font-medium text-gray-400 dark:text-gray-500 normal-case tracking-normal">
                  {medicines.filter(m => toLocalDateStr(new Date()) < addDaysToDateStr(m.startDate, m.durationDays)).length} activos
                </span>
              )}
            </button>
            {showMedicines && (
              <button
                onClick={openAddMedicine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </button>
            )}
          </div>

          {showMedicines && (
            <div className="space-y-3">
              {medicines.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin medicamentos activos.</p>
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
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{med.dose} · {freqLabel}</p>
                            {isActive && <p className="text-sm text-blue-500 dark:text-blue-400 mt-0.5">Día {dayNumber} de {med.durationDays}</p>}
                            {isCompleted && <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Tratamiento completado</p>}
                            {isActive && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {times.map((t, i) => (
                                  <span key={i} className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                                    i < takenCount
                                      ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 line-through opacity-60'
                                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                  }`}>{t}</span>
                                ))}
                              </div>
                            )}
                            {isActive && fullTaken && <p className="text-sm text-green-600 dark:text-green-400 mt-1 font-medium">✓ Completado por hoy</p>}
                            {med.note ? <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 italic">{med.note}</p> : null}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isActive && (
                              <button
                                onClick={() => handleToggleMedicineTaken(med.id)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-xs font-bold ${
                                  fullTaken ? 'bg-green-500 text-white'
                                  : takenCount > 0 ? 'bg-amber-400 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                                }`}
                                title={`${takenCount}/${dosesPerDay} dosis`}
                              >
                                {fullTaken || dosesPerDay === 1 ? <Check className="w-4 h-4" />
                                  : takenCount > 0 ? `${takenCount}/${dosesPerDay}` : <Check className="w-4 h-4" />}
                              </button>
                            )}
                            <button onClick={() => openEditMedicine(med)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteMedicineConfirm(med.id)} className="p-1.5 text-gray-400 hover:text-red-500">
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
        </div>}

        {/* ── Meal Plan ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Plan de Alimentación</p>
            {mealPlan && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEvalResult(''); setSuggestionSlotPicker(null); setAddedSuggestions(new Set()); setShowEvalModal(true); handleEvalPlan(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Evaluar plan
                </button>
                <button
                  onClick={() => { setPlanSetupForm({ goal: '', lifestyle: '', restrictions: '' }); setShowPlanSetupModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo plan
                </button>
              </div>
            )}
          </div>

          {!mealPlan ? (
            <div className="liquid-glass-panel rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🥗</span>
              </div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin plan de alimentación</p>
              <p className="text-sm text-gray-400 mb-5">Genera un plan personalizado con IA basado en tus objetivos y estilo de vida</p>
              <button onClick={() => setShowPlanSetupModal(true)} className="btn-primary px-8">
                Iniciar con mi plan
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {mealPlan.slots.map((slot) => (
                <div key={slot.name} className="liquid-glass-panel rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{slot.name}</p>
                  </div>
                  <div className="px-2 pb-1">
                    {slot.options.map((option, idx) => {
                      const optKey = `${slot.name}-${idx}`;
                      const isOpen = expandedMealOption === optKey;
                      return (
                        <div key={idx} className="rounded-xl overflow-hidden mb-0.5">
                          <button
                            onClick={() => setExpandedMealOption(isOpen ? null : optKey)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors text-left"
                          >
                            <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200/60 dark:border-gray-600/60">
                              {option.imageUrl ? (
                                <img src={option.imageUrl} alt={option.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-base">{MEAL_EMOJIS[idx % MEAL_EMOJIS.length]}</span>
                              )}
                            </div>
                            <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">{option.name}</p>
                            <button
                              onClick={e => { e.stopPropagation(); openMealOptionModal(slot.name, option, idx); }}
                              className="p-1.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 rounded-lg transition-colors flex-shrink-0"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-3 pt-0.5">
                              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-line">
                                {option.description || <span className="italic">Sin descripción</span>}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => { setAddingMealToSlot(slot.name); setAddMealForm({ name: '', description: '' }); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400 hover:text-primary-500 transition-colors border-t border-white/30 dark:border-gray-700/30 mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar opción
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Weight Modal ── */}
      {showWeightModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShowWeightModal(false)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Control de peso</h3>
                <button onClick={() => setShowWeightModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
                {/* Add new record */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { setNewWeightInput(''); setNewWeightDate(toLocalDateStr(new Date())); setShowAddWeightModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 text-sm font-medium transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar nuevo
                  </button>
                </div>

                {weightHistory.length > 0 ? (
                  <>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-blue-500">{weightHistory[0].weight} kg</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Último registro · {format(parseISO(weightHistory[0].date), 'dd MMM yyyy')}
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
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Historial</p>
                      <div className="max-h-44 overflow-y-auto space-y-1">
                        {weightHistory.slice(0, 20).map(e => (
                          <div key={e.id} className="flex justify-between items-center text-sm py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                            <span className="text-gray-500">{format(parseISO(e.date), 'dd MMM yyyy')}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{e.weight} kg</span>
                              <button onClick={() => handleDeleteWeight(e.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">Sin registros aún.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Weight Sub-Modal ── */}
      {showAddWeightModal && (
        <div
          className="fixed z-[60] liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShowAddWeightModal(false)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Nuevo registro</h3>
                <button onClick={() => setShowAddWeightModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    autoFocus
                    value={newWeightInput}
                    onChange={e => setNewWeightInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newWeightInput) handleAddWeight(); }}
                    placeholder="ej. 75.5"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Fecha</label>
                  <input
                    type="date"
                    value={newWeightDate}
                    onChange={e => setNewWeightDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowAddWeightModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button
                  onClick={handleAddWeight}
                  disabled={savingWeight || !newWeightInput}
                  className="btn-primary flex-1 disabled:opacity-60"
                >
                  {savingWeight ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Shopping Modal ── */}
      {showShoppingModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShowShoppingModal(false)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Lista del super</h3>
                  {shoppingList.length > 0 && (
                    <span className="text-sm text-gray-400">{shoppingList.length} ítems</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {purchasedCount > 0 && (
                    <button
                      onClick={handleClearPurchased}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 text-sm transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reiniciar lista
                    </button>
                  )}
                  <button onClick={() => setShowShoppingModal(false)}>
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShoppingForm({ title: '' }); setSelectedLabels([]); setShoppingItemModal('add'); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl btn-primary text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                  </button>
                  <button
                    onClick={() => setShowLabelsModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    <Tag className="w-4 h-4" />
                    Etiquetas
                  </button>
                </div>

                {/* List */}
                {shoppingList.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                    Lista vacía. Toca "Agregar ítem" para comenzar.
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan Setup Modal ── */}
      {showPlanSetupModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => !mealLoading && setShowPlanSetupModal(false)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Personaliza tu plan</h3>
                {!mealLoading && (
                  <button onClick={() => setShowPlanSetupModal(false)}>
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                {mealLoading ? (
                  <div className="flex flex-col items-center py-16 gap-3">
                    <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                      Generando tu plan personalizado...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Goal */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">¿Cuál es tu objetivo?</p>
                      <div className="space-y-2">
                        {GOAL_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setPlanSetupForm(f => ({ ...f, goal: opt.value }))}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                              planSetupForm.goal === opt.value
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300'
                            }`}
                          >
                            <span className="text-xl flex-shrink-0">{opt.emoji}</span>
                            <div>
                              <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{opt.label}</p>
                              <p className="text-sm text-gray-400 leading-tight">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Lifestyle */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">¿Cómo es tu día a día?</p>
                      <div className="space-y-2">
                        {LIFESTYLE_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setPlanSetupForm(f => ({ ...f, lifestyle: opt.value }))}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                              planSetupForm.lifestyle === opt.value
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300'
                            }`}
                          >
                            <span className="text-xl flex-shrink-0">{opt.emoji}</span>
                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{opt.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Restrictions */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Restricciones o preferencias{' '}
                        <span className="text-gray-400 font-normal">(opcional)</span>
                      </p>
                      <textarea
                        className="input-field resize-none"
                        rows={3}
                        placeholder="ej. Soy vegetariano, no me gusta el pescado, sin gluten..."
                        value={planSetupForm.restrictions}
                        onChange={e => setPlanSetupForm(f => ({ ...f, restrictions: e.target.value }))}
                      />
                    </div>

                    <button
                      onClick={handleGeneratePlan}
                      disabled={!planSetupForm.goal || !planSetupForm.lifestyle}
                      className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <Sparkles className="w-4 h-4" />
                      Generar mi plan
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Eval Modal ── */}
      {showEvalModal && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => { if (!evalLoading) { setShowEvalModal(false); setSuggestionSlotPicker(null); } }}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Evaluación del plan</h3>
                {!evalLoading && (
                  <button onClick={() => { setShowEvalModal(false); setSuggestionSlotPicker(null); }}>
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                {evalLoading ? (
                  <div className="flex flex-col items-center py-16 gap-3">
                    <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Evaluando tu plan...</p>
                  </div>
                ) : evalResult ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line text-justify">{evalMainText}</p>
                    {parseSuggestions(evalResult).filter(s => !addedSuggestions.has(s.name)).length > 0 && (
                      <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Sugerencias para agregar:</p>
                        <div className="space-y-2">
                          {parseSuggestions(evalResult).filter(s => !addedSuggestions.has(s.name)).map((s, i) => (
                            <div key={i} className="p-3 bg-green-50/60 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-800">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{s.description}</p>
                              {suggestionSlotPicker === i ? (
                                <div className="mt-2 space-y-1">
                                  <p className="text-sm text-gray-500 dark:text-gray-400">¿A qué tiempo de comida?</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {mealPlan?.slots?.map(slot => (
                                      <button
                                        key={slot.name}
                                        onClick={() => handleAddSuggestionToSlot(s, slot.name)}
                                        className="px-2.5 py-1 rounded-lg text-sm font-medium bg-white/80 dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                      >
                                        {slot.name}
                                      </button>
                                    ))}
                                    <button
                                      onClick={() => setSuggestionSlotPicker(null)}
                                      className="px-2.5 py-1 rounded-lg text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setSuggestionSlotPicker(i)}
                                  className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium hover:underline"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Agregar al plan
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-10 gap-4">
                    <span className="text-4xl">🔍</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                      Analiza tu plan para ver sus puntos fuertes y áreas de mejora
                    </p>
                    <button
                      onClick={handleEvalPlan}
                      className="btn-primary flex items-center gap-2 px-6"
                    >
                      <Sparkles className="w-4 h-4" />
                      Evaluar ahora
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Meal Option Edit Modal ── */}
      {selectedMealOption && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setSelectedMealOption(null)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-sm flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">{MEAL_EMOJIS[selectedMealOption.idx % MEAL_EMOJIS.length]}</span>
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{selectedMealOption.slotName}</p>
                </div>
                <button onClick={() => setSelectedMealOption(null)} className="flex-shrink-0">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="label">Nombre</label>
                  <input
                    className="input-field"
                    value={mealOptionForm.name}
                    onChange={e => setMealOptionForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Descripción / ingredientes</label>
                  <textarea
                    className="input-field resize-none"
                    rows={4}
                    value={mealOptionForm.description}
                    onChange={e => setMealOptionForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Ingredientes, cantidades, contexto..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleDeleteMealOption} className="p-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-red-200 dark:border-red-800 text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setSelectedMealOption(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleSaveMealOption} disabled={!mealOptionForm.name.trim()} className="btn-primary flex-1 disabled:opacity-60">Guardar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Meal Option Modal ── */}
      {addingMealToSlot && (
        <div
          className="fixed z-50 liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setAddingMealToSlot(null)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-sm p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">{addingMealToSlot}</p>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Agregar opción</h3>
                </div>
                <button onClick={() => setAddingMealToSlot(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label">Nombre *</label>
                  <input
                    className="input-field"
                    value={addMealForm.name}
                    onChange={e => setAddMealForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ej. Avena con plátano"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Descripción / ingredientes</label>
                  <textarea
                    className="input-field resize-none"
                    rows={3}
                    value={addMealForm.description}
                    onChange={e => setAddMealForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Ingredientes, cantidades, contexto..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingMealToSlot(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleAddMealOption} disabled={!addMealForm.name.trim()} className="btn-primary flex-1 disabled:opacity-60">Agregar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Labels Modal ── */}
      {showLabelsModal && (
        <div
          className="fixed z-[70] liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => { setShowLabelsModal(false); setLabelEditingName(null); }}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-sm flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 80px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Gestionar etiquetas</h3>
                <button onClick={() => { setShowLabelsModal(false); setLabelEditingName(null); }}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                {/* Add new */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLabelModalInput}
                    onChange={e => setNewLabelModalInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabelInModal(); } }}
                    placeholder="Nueva etiqueta..."
                    className="flex-1 px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    autoFocus
                  />
                  <button
                    onClick={handleAddLabelInModal}
                    disabled={!newLabelModalInput.trim()}
                    className="px-3 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: LABEL_GRAY }}
                  >
                    Añadir
                  </button>
                </div>

                {availableLabels.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Sin etiquetas. Crea una arriba.</p>
                ) : (
                  <div className="space-y-2">
                    {availableLabels.map(label => (
                      <div key={label.name} className="flex items-center gap-2 p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 border border-white/60 dark:border-gray-700/60">
                        {labelEditingName === label.name ? (
                          <>
                            <input
                              type="text"
                              value={labelEditInput}
                              onChange={e => setLabelEditInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveEditLabel(); if (e.key === 'Escape') setLabelEditingName(null); }}
                              className="flex-1 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-700 border border-blue-300 text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
                              autoFocus
                            />
                            <button onClick={handleSaveEditLabel} className="p-1.5 text-green-500 hover:text-green-600">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setLabelEditingName(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              className="flex-1 text-sm font-medium px-2.5 py-0.5 rounded-full text-white w-fit"
                              style={{ backgroundColor: LABEL_GRAY }}
                            >
                              {label.name}
                            </span>
                            <button onClick={() => handleStartEditLabel(label.name)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteLabel(label.name)} className="p-1.5 text-gray-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Shopping Item Edit Modal ── */}
      {shoppingItemModal && (
        <div
          className="fixed z-[60] liquid-glass-overlay"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={() => setShoppingItemModal(null)}
        >
          <div className="flex items-center justify-center h-full pb-20 px-4">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  {typeof shoppingItemModal === 'object' ? 'Editar ítem' : 'Agregar ítem'}
                </h3>
                <button onClick={() => setShoppingItemModal(null)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label">Nombre *</label>
                  <input
                    type="text"
                    value={shoppingForm.title}
                    onChange={e => setShoppingForm(f => ({ ...f, title: e.target.value }))}
                    className="input-field"
                    placeholder="Nombre del ítem"
                    autoFocus
                  />
                </div>
                {availableLabels.length > 0 && (
                  <div>
                    <label className="label">Etiquetas (máx. 2)</label>
                    <div className="flex flex-wrap gap-2">
                      {availableLabels.map(label => {
                        const selected = selectedLabels.includes(label.name);
                        return (
                          <button
                            key={label.name}
                            type="button"
                            onClick={() => handleToggleLabel(label.name)}
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-white transition-all"
                            style={{
                              backgroundColor: LABEL_GRAY,
                              opacity: selected ? 1 : 0.4,
                              outline: selected ? `2px solid ${LABEL_GRAY}` : 'none',
                              outlineOffset: '2px',
                            }}
                          >
                            {label.name}
                            {selected && <span>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShoppingItemModal(null)} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveShoppingItem}
                    disabled={!shoppingForm.title.trim()}
                    className="btn-primary flex-1"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <input className="input-field" placeholder="ej. Ibuprofeno" value={medicineForm.name}
                    onChange={e => setMedicineForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className="label">Dosis *</label>
                  <input className="input-field" placeholder="ej. 1 pastilla, 5ml" value={medicineForm.dose}
                    onChange={e => setMedicineForm(f => ({ ...f, dose: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Cada cuántas horas</label>
                  <input type="number" className="input-field" placeholder="ej. 8 → 3 veces/día · 24 → 1 vez/día"
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
                    <p className="text-sm text-gray-400 mt-1">
                      {Number(medicineForm.frequencyHours) === 24 ? '1 vez al día'
                        : Number(medicineForm.frequencyHours) > 24 ? `cada ${medicineForm.frequencyHours}h`
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
                          <span className="text-sm text-gray-400 w-16 flex-shrink-0">Dosis {i + 1}</span>
                          <input type="time" className="input-field flex-1" value={t}
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
                  <input type="number" className="input-field" placeholder="ej. 7" value={medicineForm.durationDays}
                    onChange={e => setMedicineForm(f => ({ ...f, durationDays: e.target.value }))} min="1" />
                </div>
                <div>
                  <label className="label">Fecha de inicio</label>
                  <input type="date" className="input-field" value={medicineForm.startDate}
                    onChange={e => setMedicineForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Nota</label>
                  <input className="input-field" placeholder="ej. Tomar con comida" value={medicineForm.note}
                    onChange={e => setMedicineForm(f => ({ ...f, note: e.target.value }))} />
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
