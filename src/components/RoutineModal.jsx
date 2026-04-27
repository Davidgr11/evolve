import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import toast from '../utils/toast';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Youtube, GripVertical } from 'lucide-react';
import ImageUpload from './ImageUpload';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const extractYoutubeId = (url) => {
  const match = url?.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
};

const ROUTINE_TYPES = [
  { id: 'fuerza',       label: 'Fuerza',       emoji: '🏋️' },
  { id: 'hiit',         label: 'HIIT',          emoji: '⚡' },
  { id: 'cardio',       label: 'Cardio',        emoji: '🏃' },
  { id: 'yoga',         label: 'Yoga',          emoji: '🧘' },
  { id: 'pilates',      label: 'Pilates',       emoji: '🤸' },
  { id: 'movilidad',    label: 'Movilidad',     emoji: '🌀' },
  { id: 'estiramiento', label: 'Estiramiento',  emoji: '🦵' },
  { id: 'running',      label: 'Running',       emoji: '👟' },
  { id: 'ciclismo',     label: 'Ciclismo',      emoji: '🚴' },
  { id: 'natacion',     label: 'Natación',      emoji: '🏊' },
  { id: 'deportes',     label: 'Deportes',      emoji: '⚽' },
  { id: 'funcional',    label: 'Funcional',     emoji: '🤜' },
  { id: 'core',         label: 'Core',          emoji: '💪' },
  { id: 'boxeo',        label: 'Boxeo',         emoji: '🥊' },
  { id: 'crossfit',     label: 'CrossFit',      emoji: '🔥' },
  { id: 'caminata',     label: 'Caminata',      emoji: '🚶' },
  { id: 'otro',         label: 'Otro',          emoji: '✏️' },
];

const findTypeId = (typeName) => {
  if (!typeName) return null;
  const match = ROUTINE_TYPES.find(
    t => t.id !== 'otro' && t.label.toLowerCase() === typeName.toLowerCase()
  );
  return match ? match.id : 'otro';
};

// ── Sortable exercise item ─────────────────────────────────────────────────────
const SortableExerciseItem = ({ ex, idx, isEdit, isOpen, onToggle, onRemove, onUpdate, onImageSelect, pendingImages }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/60 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        onClick={() => onToggle(ex._id)}
      >
        {/* Drag handle — only shown in edit mode */}
        {isEdit && (
          <div
            className="text-gray-300 dark:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        {ex.imageUrl ? (
          <img src={ex.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-200 dark:bg-gray-600" onError={() => onUpdate(ex._id, 'imageUrl', '')} />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {ex.name || <span className="text-gray-400 italic">Sin nombre</span>}
          </p>
          {ex.repetitions && <p className="text-sm text-gray-400">{ex.repetitions}</p>}
        </div>
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => onRemove(ex._id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="p-1.5 text-gray-400" onClick={() => onToggle(ex._id)}>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
          <div>
            <label className="label">Nombre</label>
            <input className="input-field" value={ex.name} onChange={e => onUpdate(ex._id, 'name', e.target.value)} placeholder="ej. Sentadilla, Push-up, Plancha" autoFocus={!ex.name} />
          </div>
          <div>
            <label className="label">Reps / duración</label>
            <input className="input-field" value={ex.repetitions} onChange={e => onUpdate(ex._id, 'repetitions', e.target.value)} placeholder="ej. 12 reps · 45 seg · hasta el fallo" />
          </div>
          {ex.instructions && (
            <div className="bg-blue-50/60 dark:bg-blue-900/10 rounded-xl p-3 border border-blue-200/50 dark:border-blue-700/30">
              <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-1">Cómo hacerlo</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{ex.instructions}</p>
            </div>
          )}
          <div>
            <label className="label">Imagen</label>
            {ex.imageUrl && !pendingImages[ex._id] && (
              <div className="mb-2">
                <img src={ex.imageUrl} alt="" className="w-full max-h-36 object-contain rounded-xl bg-gray-100 dark:bg-gray-700" onError={() => onUpdate(ex._id, 'imageUrl', '')} />
                <button type="button" onClick={() => onUpdate(ex._id, 'imageUrl', '')} className="text-sm text-gray-400 hover:text-red-400 mt-1 block">Quitar imagen</button>
              </div>
            )}
            <ImageUpload
              id={`img-${ex._id}`}
              label="Subir imagen propia"
              existingImageUrl={pendingImages[ex._id]?.preview}
              onChange={e => { const f = e.target.files?.[0]; if (f) onImageSelect(ex._id, f); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const RoutineModal = ({ routine, onClose, onSave }) => {
  const { user } = useAuth();

  const isEdit = !!routine;
  const [step, setStep] = useState(1); // new mode: 1=name+type, 2=mode+content, 3=meta
  const [editTab, setEditTab] = useState(0); // 0=Detalles, 1=Ejercicios, 2=Meta

  // ── Detalles state ────────────────────────────────────────────────────────
  const [name, setName] = useState(routine?.name || '');
  const initialTypeId = findTypeId(routine?.type);
  const [selectedTypeId, setSelectedTypeId] = useState(initialTypeId);
  const [type, setType] = useState(routine?.type || '');
  const [weeklyGoal, setWeeklyGoal] = useState(routine?.weeklyGoal ?? 2);

  // ── Ejercicios state ──────────────────────────────────────────────────────
  const [routineMode, setRoutineMode] = useState(routine?.youtubeUrl ? 'youtube' : (isEdit ? 'normal' : null));
  const [youtubeUrl, setYoutubeUrl] = useState(routine?.youtubeUrl || '');
  const [exercises, setExercises] = useState(
    (routine?.exercises || []).map(ex => ({ ...ex, _id: Math.random().toString(36).slice(2) }))
  );
  const [expandedId, setExpandedId] = useState(null);
  const [pendingImages, setPendingImages] = useState({});
  const [uploading, setUploading] = useState(false);

  // ── DnD sensors ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setExercises(prev => {
        const oldIdx = prev.findIndex(e => e._id === active.id);
        const newIdx = prev.findIndex(e => e._id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  // ── Type helpers ──────────────────────────────────────────────────────────
  const effectiveType = () => {
    if (!selectedTypeId) return type;
    if (selectedTypeId === 'otro') return type;
    return ROUTINE_TYPES.find(t => t.id === selectedTypeId)?.label ?? type;
  };

  const handleTypeSelect = (id) => {
    setSelectedTypeId(id);
    if (id !== 'otro') {
      const found = ROUTINE_TYPES.find(t => t.id === id);
      if (found) setType(found.label);
    }
  };

  // ── Exercise helpers ──────────────────────────────────────────────────────
  const addManual = () => {
    const _id = Math.random().toString(36).slice(2);
    setExercises(prev => [...prev, { _id, name: '', repetitions: '', instructions: '', imageUrl: '', imagePath: '' }]);
    setExpandedId(_id);
  };

  const updateExercise = (_id, field, value) =>
    setExercises(prev => prev.map(ex => ex._id === _id ? { ...ex, [field]: value } : ex));

  const removeExercise = (_id) => {
    setExercises(prev => prev.filter(ex => ex._id !== _id));
    setPendingImages(prev => { const n = { ...prev }; delete n[_id]; return n; });
    if (expandedId === _id) setExpandedId(null);
  };

  const handleImageSelect = (_id, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setPendingImages(prev => ({ ...prev, [_id]: { preview: reader.result, file } }));
      updateExercise(_id, 'imageUrl', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file, oldImagePath) => {
    try {
      setUploading(true);
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true });
      const imagePath = `users/${user.uid}/exercises/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, compressed);
      if (oldImagePath) { try { await deleteObject(ref(storage, oldImagePath)); } catch {} }
      return { imageUrl: await getDownloadURL(storageRef), imagePath };
    } catch { return null; }
    finally { setUploading(false); }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { toast.error('La rutina necesita un nombre'); return; }
    const finalType = effectiveType().trim() || 'general';

    if (routineMode === 'youtube') {
      if (!youtubeUrl.trim()) { toast.error('Ingresa la URL de YouTube'); return; }
      onSave({ name: name.trim(), type: finalType, weeklyGoal, youtubeUrl: youtubeUrl.trim(), exercises: [], series: 1 });
      return;
    }

    if (exercises.length === 0) { toast.error('Agrega al menos un ejercicio'); return; }

    const processed = await Promise.all(
      exercises.map(async (ex) => {
        const pending = pendingImages[ex._id];
        if (pending?.file) {
          const up = await uploadImage(pending.file, ex.imagePath || '');
          return { name: ex.name, repetitions: ex.repetitions, instructions: ex.instructions || '', imageUrl: up?.imageUrl || ex.imageUrl, imagePath: up?.imagePath || '' };
        }
        return { name: ex.name, repetitions: ex.repetitions, instructions: ex.instructions || '', imageUrl: ex.imageUrl || '', imagePath: ex.imagePath || '' };
      })
    );

    onSave({ name: name.trim(), type: finalType, weeklyGoal, exercises: processed, series: 1 });
  };

  // ── Panels ────────────────────────────────────────────────────────────────
  const DetallesPanel = () => (
    <div className="p-5 space-y-4">
      <div>
        <label className="label">Nombre de la rutina</label>
        <input
          className="input-field"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="ej. Full Body, Piernas Fuego"
          autoFocus
        />
      </div>

      <div>
        <label className="label">Tipo de rutina</label>
        <div className="grid grid-cols-3 gap-2">
          {ROUTINE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTypeSelect(t.id)}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${
                selectedTypeId === t.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300'
              }`}
            >
              <span className="text-xl leading-none">{t.emoji}</span>
              <span className="text-sm font-medium text-center leading-tight text-gray-700 dark:text-gray-300">{t.label}</span>
            </button>
          ))}
        </div>
        {selectedTypeId === 'otro' && (
          <input
            className="input-field mt-2"
            value={type}
            onChange={e => setType(e.target.value)}
            placeholder="Describe el tipo de rutina"
            autoFocus
          />
        )}
      </div>
    </div>
  );

  // Step 2 in new mode: mode picker → then content for chosen mode
  const ModeContentPanel = () => {
    const ytId = extractYoutubeId(youtubeUrl);
    return (
      <div className="p-5 space-y-4">
        {/* Mode picker — only shown before a mode is chosen */}
        {routineMode === null && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRoutineMode('normal')}
              className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 hover:border-primary-500 transition-all"
            >
              <span className="text-3xl">🏃</span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ejercicios</span>
              <span className="text-xs text-gray-400 text-center">Agrega ejercicios manualmente</span>
            </button>
            <button
              type="button"
              onClick={() => setRoutineMode('youtube')}
              className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 hover:border-red-400 transition-all"
            >
              <Youtube className="w-8 h-8 text-red-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">YouTube</span>
              <span className="text-xs text-gray-400 text-center">Enlaza un video de YouTube</span>
            </button>
          </div>
        )}

        {/* YouTube form */}
        {routineMode === 'youtube' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Youtube className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Video de YouTube</span>
            </div>
            <div>
              <label className="label">URL del video</label>
              <input
                className="input-field"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
              />
            </div>
            {ytId && (
              <div className="rounded-xl overflow-hidden">
                <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="Vista previa" className="w-full aspect-video object-cover rounded-xl" />
              </div>
            )}
            {youtubeUrl && !ytId && (
              <p className="text-sm text-red-500 dark:text-red-400">URL no válida — pega una URL de YouTube</p>
            )}
          </div>
        )}

        {/* Exercises form */}
        {routineMode === 'normal' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">🏃 Ejercicios</span>
              <button
                type="button"
                onClick={addManual}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar
              </button>
            </div>

            {exercises.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">
                Usa el botón de arriba para añadir ejercicios
              </p>
            )}

            <div className="space-y-2">
              {exercises.map((ex, idx) => (
                <SortableExerciseItem
                  key={ex._id}
                  ex={ex}
                  idx={idx}
                  isEdit={false}
                  isOpen={expandedId === ex._id}
                  onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                  onRemove={removeExercise}
                  onUpdate={updateExercise}
                  onImageSelect={handleImageSelect}
                  pendingImages={pendingImages}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Edit mode ejercicios tab (with DnD)
  const EjerciciosEditPanel = () => {
    const ytId = extractYoutubeId(youtubeUrl);
    return (
      <div className="p-5 space-y-4">
        {routineMode === 'youtube' ? (
          <div className="space-y-3">
            <div>
              <label className="label">URL del video de YouTube</label>
              <input
                className="input-field"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            {ytId && (
              <div className="rounded-xl overflow-hidden">
                <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="Vista previa" className="w-full aspect-video object-cover rounded-xl" />
              </div>
            )}
            {youtubeUrl && !ytId && (
              <p className="text-sm text-red-500 dark:text-red-400">URL no válida</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ejercicios</span>
              <button type="button" onClick={addManual} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                <Plus className="w-4 h-4" />
                Agregar
              </button>
            </div>

            {exercises.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">Sin ejercicios aún</p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={exercises.map(e => e._id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {exercises.map((ex, idx) => (
                    <SortableExerciseItem
                      key={ex._id}
                      ex={ex}
                      idx={idx}
                      isEdit={true}
                      isOpen={expandedId === ex._id}
                      onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                      onRemove={removeExercise}
                      onUpdate={updateExercise}
                      onImageSelect={handleImageSelect}
                      pendingImages={pendingImages}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    );
  };

  const MetaPanel = () => (
    <div className="p-5 space-y-4">
      <div>
        <label className="label">Meta semanal</label>
        <div className="flex items-center gap-3">
          <input type="range" min="0" max="7" step="1" className="flex-1 accent-primary-500"
            value={weeklyGoal} onChange={e => setWeeklyGoal(Number(e.target.value))} />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-20 text-right">
            {weeklyGoal === 0 ? 'Sin meta' : `${weeklyGoal}x / sem`}
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          {weeklyGoal === 0 ? 'No se evaluará en el radar de longevidad' : `Evaluado en el home: cada ${Math.round(7 / weeklyGoal)} días aprox.`}
        </p>
      </div>
    </div>
  );

  // Step indicator title for new mode
  const stepTitle = step === 1 ? 'Nueva rutina' : step === 2 ? (routineMode === null ? 'Tipo de contenido' : routineMode === 'youtube' ? 'Video YouTube' : 'Ejercicios') : 'Meta semanal';

  return (
    <div
      className="fixed z-50 liquid-glass-overlay"
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
      onClick={onClose}
    >
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div
          className="liquid-glass-panel rounded-2xl w-full max-w-lg flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(90vh - 80px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-white/30 dark:border-white/10 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {isEdit ? 'Editar rutina' : stepTitle}
              </h2>
              {!isEdit && (
                <div className="flex gap-1 mt-1.5">
                  {[1, 2, 3].map(s => (
                    <div key={s} className={`h-1 rounded-full transition-all ${s === step ? 'w-6 bg-primary-500' : s < step ? 'w-3 bg-primary-300' : 'w-3 bg-gray-200 dark:bg-gray-700'}`} />
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          {/* Edit mode: tabs */}
          {isEdit && (
            <div className="flex border-b border-white/30 dark:border-white/10 flex-shrink-0">
              {['Detalles', 'Ejercicios', 'Meta'].map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setEditTab(i)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                    editTab === i
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* New mode steps */}
            {!isEdit && step === 1 && <DetallesPanel />}
            {!isEdit && step === 2 && <ModeContentPanel />}
            {!isEdit && step === 3 && <MetaPanel />}

            {/* Edit mode tabs */}
            {isEdit && editTab === 0 && <DetallesPanel />}
            {isEdit && editTab === 1 && <EjerciciosEditPanel />}
            {isEdit && editTab === 2 && <MetaPanel />}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t border-white/30 dark:border-white/10 flex-shrink-0">
            {/* New mode step 1 */}
            {!isEdit && step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!name.trim()}
                className="w-full btn-primary py-3 disabled:opacity-60"
              >
                Continuar
              </button>
            )}

            {/* New mode step 2 */}
            {!isEdit && step === 2 && (
              <div className="flex gap-2">
                <button type="button" onClick={() => { setStep(1); setRoutineMode(null); }} className="btn-secondary px-4">
                  ← Atrás
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={
                    routineMode === null ||
                    (routineMode === 'youtube' && !extractYoutubeId(youtubeUrl)) ||
                    (routineMode === 'normal' && exercises.length === 0)
                  }
                  className="flex-1 btn-primary py-3 disabled:opacity-60"
                >
                  Continuar
                </button>
              </div>
            )}

            {/* New mode step 3 */}
            {!isEdit && step === 3 && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="btn-secondary px-4">
                  ← Atrás
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={uploading}
                  className="flex-1 btn-primary py-3 disabled:opacity-60"
                >
                  {uploading ? 'Guardando...' : 'Crear rutina'}
                </button>
              </div>
            )}

            {/* Edit mode */}
            {isEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={uploading}
                className="w-full btn-primary py-3 disabled:opacity-60"
              >
                {uploading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoutineModal;
