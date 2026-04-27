import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../utils/firebase';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, arrayUnion,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import toast from '../utils/toast';
import {
  Heart, Plus, MapPin, Gift, CheckSquare,
  Settings, Copy, Trash2, Edit, ExternalLink, Calendar,
  X, Check, Users, StickyNote, GripVertical, ChevronDown, ChevronUp, ChevronRight,
} from 'lucide-react';
import { differenceInYears, differenceInDays, addYears, format } from 'date-fns';
import ConfirmModal from './ConfirmModal';
import ImageUpload from './ImageUpload';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Helpers ───────────────────────────────────────────────────────────────────

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const parseDate = (str) => new Date(str + 'T12:00:00');

const computeAnniversary = (dateStr) => {
  if (!dateStr) return null;
  const start = parseDate(dateStr);
  const now = new Date();
  const years = differenceInYears(now, start);
  const totalDays = differenceInDays(now, start);
  const nextAnniv = addYears(start, years + 1);
  const daysUntilNext = differenceInDays(nextAnniv, now);
  return { years, totalDays, daysUntilNext };
};

const getDaysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = parseDate(dateStr);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return differenceInDays(d, now);
};

const IDEA_TYPES = [
  { id: 'restaurant', label: 'Restaurante', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { id: 'experience', label: 'Experiencia', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { id: 'event',      label: 'Evento',      color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { id: 'other',      label: 'Otro',        color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
];

const getIdeaTypeConfig = (id) => IDEA_TYPES.find((t) => t.id === id) || IDEA_TYPES[3];

// ── Shared small components ───────────────────────────────────────────────────

const EmptyState = ({ message }) => (
  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
    <p className="text-sm">{message}</p>
  </div>
);

const SortablePlanCard = ({ plan, onEdit, onDelete, showDrag }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plan.id });
  const typeConfig = getIdeaTypeConfig(plan.type);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="liquid-glass-panel rounded-xl p-4"
    >
      <div className="flex items-start gap-2">
        {showDrag && (
          <div {...attributes} {...listeners} className="cursor-grab touch-none text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            {plan.date && (
              <span className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(plan.date + 'T12:00:00'), 'd MMM yyyy')}
              </span>
            )}
          </div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">{plan.name}</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {plan.price && <span className="text-sm text-gray-500 dark:text-gray-400">{plan.price}</span>}
            {plan.url && (
              <a href={plan.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="w-3 h-3" /> Ver link
              </a>
            )}
          </div>
          {plan.notes && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-2">{plan.notes}</p>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Edit className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};

const ItemCard = ({ item, onEdit, onDelete }) => (
  <div className="liquid-glass-panel rounded-xl p-4">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">{item.name}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {item.price && <span className="text-sm text-gray-500 dark:text-gray-400">{item.price}</span>}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="w-3 h-3" /> Ver link
            </a>
          )}
        </div>
        {item.notes && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-2">{item.notes}</p>}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Edit className="w-4 h-4" /></button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  </div>
);

const SortableItemCard = ({ item, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="liquid-glass-panel rounded-xl p-4"
    >
      <div className="flex items-start gap-2">
        <div {...attributes} {...listeners} className="cursor-grab touch-none text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">{item.name}</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {item.price && <span className="text-sm text-gray-500 dark:text-gray-400">{item.price}</span>}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="w-3 h-3" /> Ver link
              </a>
            )}
          </div>
          {item.notes && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-2">{item.notes}</p>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Edit className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};

// ── CoupleSetup ───────────────────────────────────────────────────────────────

const CoupleSetup = ({ onCreated, onJoined }) => {
  const { user } = useAuth();
  const [mode, setMode] = useState('choose');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const coupleId = `couple_${user.uid}_${Date.now()}`;
      const inviteCode = genCode();
      await setDoc(doc(db, 'couples', coupleId), {
        members: [user.uid], inviteCode, anniversaryDate: '',
        createdBy: user.uid, createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'coupleInvites', inviteCode), { coupleId, createdBy: user.uid });
      await setDoc(doc(db, `users/${user.uid}/settings/together`), { coupleId });
      onCreated(coupleId);
      toast.success('¡Espacio creado! Comparte el código con tu pareja.');
    } catch (err) {
      console.error(err);
      toast.error('Error al crear el espacio');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const inviteSnap = await getDoc(doc(db, 'coupleInvites', code.trim().toUpperCase()));
      if (!inviteSnap.exists()) { toast.error('Código inválido'); return; }
      const { coupleId } = inviteSnap.data();
      await updateDoc(doc(db, 'couples', coupleId), { members: arrayUnion(user.uid) });
      await setDoc(doc(db, `users/${user.uid}/settings/together`), { coupleId });
      onJoined(coupleId);
      toast.success('¡Te uniste al espacio!');
    } catch (err) {
      console.error(err);
      toast.error('Error al unirse al espacio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="liquid-glass-panel rounded-2xl p-5 text-center">
      <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center mx-auto mb-3">
        <Heart className="w-5 h-5 text-pink-500" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Tu espacio compartido de pareja</p>
      {mode === 'choose' && (
        <div className="space-y-2">
          <button onClick={handleCreate} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Crear espacio
          </button>
          <button onClick={() => setMode('join')} className="btn-secondary w-full flex items-center justify-center gap-2">
            <Users className="w-4 h-4" /> Unirse con código
          </button>
        </div>
      )}
      {mode === 'join' && (
        <div className="space-y-3">
          <input
            className="input-field text-center text-xl tracking-widest font-mono uppercase"
            placeholder="CÓDIGO" value={code} onChange={(e) => setCode(e.target.value)}
            maxLength={6} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin} disabled={loading || !code.trim()} className="btn-primary w-full">
            {loading ? 'Buscando...' : 'Unirme'}
          </button>
          <button onClick={() => setMode('choose')} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            ← Volver
          </button>
        </div>
      )}
    </div>
  );
};

// ── SettingsModal ─────────────────────────────────────────────────────────────

const SettingsModal = ({ isOpen, onClose, couple, coupleId }) => {
  const [anniversaryDate, setAnniversaryDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (couple) setAnniversaryDate(couple.anniversaryDate || '');
  }, [couple, isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'couples', coupleId), { anniversaryDate });
      toast.success('Guardado');
      onClose();
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(couple?.inviteCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={onClose}>
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: 'calc(84vh - 80px)' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Configuración de pareja</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">¿Desde cuándo están juntos?</label>
              <input type="date" className="input-field" value={anniversaryDate} onChange={(e) => setAnniversaryDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Código de invitación</label>
              <div className="flex gap-2">
                <div className="input-field font-mono tracking-widest text-center flex-1 select-all cursor-text">
                  {couple?.inviteCode || '------'}
                </div>
                <button onClick={copyCode} className="btn-secondary px-3 flex items-center gap-1">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Comparte este código con tu pareja para que se una</p>
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── EventFormModal ────────────────────────────────────────────────────────────

const EventFormModal = ({ isOpen, onClose, onSave, editingEvent, coupleId }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingEvent) { setName(editingEvent.name || ''); setDate(editingEvent.date || ''); setNotes(editingEvent.notes || ''); }
    else { setName(''); setDate(''); setNotes(''); }
  }, [editingEvent, isOpen]);

  const handleSubmit = async () => {
    if (!name.trim() || !date) { toast.error('Nombre y fecha son requeridos'); return; }
    const fileInput = document.getElementById('couple-event-cover-input');
    const file = fileInput?.files?.[0];
    let coverPhotoUrl = editingEvent?.coverPhotoUrl || '';
    if (file) {
      try {
        setUploading(true);
        const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1200 });
        const storageRef = ref(storage, `couples/${coupleId}/events/${Date.now()}_cover`);
        await uploadBytes(storageRef, compressed);
        coverPhotoUrl = await getDownloadURL(storageRef);
        if (editingEvent?.coverPhotoUrl) {
          try { await deleteObject(ref(storage, editingEvent.coverPhotoUrl)); } catch {}
        }
      } catch { toast.error('Error al subir la imagen'); setUploading(false); return; }
      finally { setUploading(false); }
    }
    await onSave({ name: name.trim(), date, notes: notes.trim(), coverPhotoUrl });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={onClose}>
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: 'calc(84vh - 80px)' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {editingEvent ? 'Editar evento' : 'Nuevo evento'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Nombre *</label>
              <input className="input-field" placeholder="ej. Aniversario 2025" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">Fecha *</label>
              <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Foto de portada</label>
              <ImageUpload id="couple-event-cover-input" label="Seleccionar foto" existingImageUrl={editingEvent?.coverPhotoUrl} disabled={uploading} />
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea className="input-field min-h-[80px] resize-none" placeholder="Notas generales del evento..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button onClick={handleSubmit} disabled={uploading || !name.trim() || !date} className="btn-primary w-full">
              {uploading ? 'Guardando...' : editingEvent ? 'Guardar cambios' : 'Crear evento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── ItemFormModal ─────────────────────────────────────────────────────────────

const ItemFormModal = ({ isOpen, onClose, onSave, editingItem, type, hideDate = false }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [ideaType, setIdeaType] = useState('restaurant');
  const [planDate, setPlanDate] = useState('');
  const [todoText, setTodoText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      if (type === 'todo') { setTodoText(editingItem.text || ''); }
      else {
        setName(editingItem.name || ''); setPrice(editingItem.price || ''); setUrl(editingItem.url || ''); setNotes(editingItem.notes || '');
        if (type === 'global-idea') { setIdeaType(editingItem.type || 'restaurant'); setPlanDate(editingItem.date || ''); }
      }
    } else {
      setName(''); setPrice(''); setUrl(''); setNotes(''); setTodoText(''); setIdeaType('restaurant'); setPlanDate('');
    }
  }, [editingItem, isOpen, type]);

  const handleSubmit = async () => {
    if (type === 'todo') {
      if (!todoText.trim()) return;
      await onSave({ text: todoText.trim(), completed: editingItem?.completed ?? false });
    } else {
      if (!name.trim()) { toast.error('El nombre es requerido'); return; }
      const data = { name: name.trim(), price: price.trim(), url: url.trim(), notes: notes.trim() };
      if (type === 'global-idea') { data.type = ideaType; data.date = planDate; }
      await onSave(data);
    }
    onClose();
  };

  if (!isOpen) return null;

  const titles = {
    place: editingItem ? 'Editar lugar' : 'Nuevo lugar',
    'event-idea': editingItem ? 'Editar idea' : 'Nueva idea / regalo',
    todo: editingItem ? 'Editar to-do' : 'Nuevo to-do',
    'global-idea': editingItem ? 'Editar plan' : 'Nuevo plan',
  };

  return (
    <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={onClose}>
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: 'calc(84vh - 80px)' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{titles[type]}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {type === 'todo' ? (
              <div>
                <label className="label">Tarea</label>
                <input className="input-field" placeholder="ej. Reservar restaurante" value={todoText} onChange={(e) => setTodoText(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
              </div>
            ) : (
              <>
                {type === 'global-idea' && (
                  <div>
                    <label className="label">Tipo</label>
                    <div className="flex gap-2 flex-wrap">
                      {IDEA_TYPES.map((t) => (
                        <button key={t.id} type="button" onClick={() => setIdeaType(t.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${ideaType === t.id ? t.color : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="label">Nombre *</label>
                  <input className="input-field" placeholder={type === 'place' ? 'ej. Restaurante Nicos' : type === 'event-idea' ? 'ej. Auriculares inalámbricos' : 'ej. Salida al cine'} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                {type !== 'event-idea' && (
                  <div>
                    <label className="label">Precio estimado</label>
                    <input className="input-field" placeholder="ej. $500 MXN" value={price} onChange={(e) => setPrice(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="label">URL / Link</label>
                  <input className="input-field" type="text" inputMode="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
                {type === 'global-idea' && !hideDate && (
                  <div>
                    <label className="label">Fecha</label>
                    <input type="date" className="input-field" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="label">Notas</label>
                  <textarea className="input-field resize-none min-h-[60px]" placeholder="Detalles adicionales..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            )}
            <button onClick={handleSubmit} disabled={type === 'todo' ? !todoText.trim() : !name.trim()} className="btn-primary w-full">
              {editingItem ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── PlansModal ────────────────────────────────────────────────────────────────

const PlansModal = ({ isOpen, onClose, coupleId, ideas, setIdeas }) => {
  const [ideaTypeFilter, setIdeaTypeFilter] = useState('all');
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [deleteIdeaConfirm, setDeleteIdeaConfirm] = useState({ isOpen: false, idea: null });

  const planSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSaveIdea = async (data) => {
    if (editingIdea) {
      await updateDoc(doc(db, `couples/${coupleId}/ideas`, editingIdea.id), data);
      toast.success('Actualizado');
    } else {
      await addDoc(collection(db, `couples/${coupleId}/ideas`), { ...data, order: ideas.length, createdAt: new Date().toISOString() });
      toast.success('Agregado');
    }
    setEditingIdea(null);
  };

  const handleDeleteIdea = async () => {
    await deleteDoc(doc(db, `couples/${coupleId}/ideas`, deleteIdeaConfirm.idea.id));
    toast.success('Eliminado');
  };

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = ideas.findIndex((i) => i.id === active.id);
    const newIndex = ideas.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(ideas, oldIndex, newIndex);
    setIdeas(reordered);
    await Promise.all(reordered.map((idea, idx) => updateDoc(doc(db, `couples/${coupleId}/ideas`, idea.id), { order: idx })));
  };

  const filteredIdeas = ideaTypeFilter === 'all' ? ideas : ideas.filter((i) => i.type === ideaTypeFilter);

  if (!isOpen) return null;

  return (
    <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={onClose}>
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: 'calc(84vh - 80px)' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Planes</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditingIdea(null); setShowIdeaModal(true); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/50 text-primary-600 dark:text-primary-400 text-sm font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              <button onClick={() => setIdeaTypeFilter('all')} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${ideaTypeFilter === 'all' ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                Todos
              </button>
              {IDEA_TYPES.map((t) => (
                <button key={t.id} onClick={() => setIdeaTypeFilter(t.id)} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${ideaTypeFilter === t.id ? t.color : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {filteredIdeas.length === 0 ? (
              <EmptyState message="Sin planes aún" />
            ) : (
              <DndContext sensors={planSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={ideas.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {filteredIdeas.map((plan) => (
                      <SortablePlanCard
                        key={plan.id} plan={plan} showDrag={ideaTypeFilter === 'all'}
                        onEdit={() => { setEditingIdea(plan); setShowIdeaModal(true); }}
                        onDelete={() => setDeleteIdeaConfirm({ isOpen: true, idea: plan })}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>
      {/* Sub-modals - stop propagation so backdrop click doesn't close PlansModal */}
      <div onClick={(e) => e.stopPropagation()}>
        <ItemFormModal
          isOpen={showIdeaModal}
          onClose={() => { setShowIdeaModal(false); setEditingIdea(null); }}
          onSave={handleSaveIdea}
          editingItem={editingIdea}
          type="global-idea"
        />
        <ConfirmModal
          isOpen={deleteIdeaConfirm.isOpen}
          onClose={() => setDeleteIdeaConfirm({ isOpen: false, idea: null })}
          onConfirm={handleDeleteIdea}
          title="Eliminar plan"
          message="¿Seguro que quieres eliminar este plan?"
          confirmText="Eliminar"
        />
      </div>
    </div>
  );
};

// ── EventDetailModal ──────────────────────────────────────────────────────────

const EventDetailModal = ({ isOpen, onClose, event, coupleId, onEventDeleted }) => {
  const [reminders, setReminders] = useState([]);
  const [eventIdeas, setEventIdeas] = useState([]);
  const [eventPlans, setEventPlans] = useState([]);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [planesOpen, setPlanesOpen] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [deleteItemConfirm, setDeleteItemConfirm] = useState({ isOpen: false, item: null, col: '' });
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDeleteEvent, setShowDeleteEvent] = useState(false);

  const basePath = event ? `couples/${coupleId}/events/${event.id}` : null;

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!isOpen || !event) return;
    const sortByOrder = (docs) => {
      const items = docs.map((d) => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    };
    const unsubs = [
      onSnapshot(collection(db, `${basePath}/todos`), (snap) => {
        setReminders(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
      }),
      onSnapshot(collection(db, `${basePath}/ideas`), (snap) => {
        setEventIdeas(sortByOrder(snap.docs));
      }),
      onSnapshot(collection(db, `${basePath}/places`), (snap) => {
        setEventPlans(sortByOrder(snap.docs));
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [isOpen, basePath, event]);

  const handleAddReminder = async () => {
    if (!reminderText.trim()) return;
    await addDoc(collection(db, `${basePath}/todos`), { text: reminderText.trim(), completed: false, dueDate: reminderDate || null, createdAt: new Date().toISOString() });
    setReminderText(''); setReminderDate(''); setShowAddReminder(false);
    toast.success('Recordatorio añadido');
  };

  const handleToggleReminder = async (rem) => {
    await updateDoc(doc(db, `${basePath}/todos`, rem.id), { completed: !rem.completed });
  };

  const handleDeleteReminder = async (rem) => {
    await deleteDoc(doc(db, `${basePath}/todos`, rem.id));
  };

  const handleSaveIdea = async (data) => {
    if (editingIdea) { await updateDoc(doc(db, `${basePath}/ideas`, editingIdea.id), data); toast.success('Actualizado'); }
    else { await addDoc(collection(db, `${basePath}/ideas`), { ...data, order: eventIdeas.length, createdAt: new Date().toISOString() }); toast.success('Añadido'); }
    setEditingIdea(null);
  };

  const handleSavePlan = async (data) => {
    if (editingPlan) { await updateDoc(doc(db, `${basePath}/places`, editingPlan.id), data); toast.success('Actualizado'); }
    else { await addDoc(collection(db, `${basePath}/places`), { ...data, order: eventPlans.length, createdAt: new Date().toISOString() }); toast.success('Añadido'); }
    setEditingPlan(null);
  };

  const handleIdeasDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = eventIdeas.findIndex((i) => i.id === active.id);
    const newIndex = eventIdeas.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(eventIdeas, oldIndex, newIndex);
    setEventIdeas(reordered);
    await Promise.all(reordered.map((item, idx) => updateDoc(doc(db, `${basePath}/ideas`, item.id), { order: idx })));
  };

  const handlePlacesDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = eventPlans.findIndex((i) => i.id === active.id);
    const newIndex = eventPlans.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(eventPlans, oldIndex, newIndex);
    setEventPlans(reordered);
    await Promise.all(reordered.map((item, idx) => updateDoc(doc(db, `${basePath}/places`, item.id), { order: idx })));
  };

  const handleDeleteItem = async () => {
    const { item, col } = deleteItemConfirm;
    await deleteDoc(doc(db, `${basePath}/${col}`, item.id));
    toast.success('Eliminado');
  };

  const handleSaveEvent = async (data) => {
    await updateDoc(doc(db, 'couples', coupleId, 'events', event.id), data);
    toast.success('Evento actualizado');
  };

  const handleDeleteEvent = async () => {
    await deleteDoc(doc(db, 'couples', coupleId, 'events', event.id));
    if (event.coverPhotoUrl) { try { await deleteObject(ref(storage, event.coverPhotoUrl)); } catch {} }
    toast.success('Evento eliminado');
    onEventDeleted();
  };

  if (!isOpen || !event) return null;

  const daysUntil = getDaysUntil(event.date);
  const isFuture = daysUntil !== null && daysUntil > 0;
  const isToday = daysUntil === 0;
  const completedReminders = reminders.filter((r) => r.completed).length;

  return (
    <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={onClose}>
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: 'calc(84vh - 80px)' }} onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          {event.coverPhotoUrl ? (
            <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ aspectRatio: '16/7' }}>
              <img src={event.coverPhotoUrl} alt={event.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <button onClick={onClose} className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-white p-1.5 rounded-full">
                <X className="w-4 h-4" />
              </button>
              <div className="absolute top-3 left-3 flex gap-2">
                <button onClick={() => setShowEventModal(true)} className="bg-black/40 backdrop-blur-md text-white p-1.5 rounded-full"><Edit className="w-4 h-4" /></button>
                <button onClick={() => setShowDeleteEvent(true)} className="bg-black/40 backdrop-blur-md text-white p-1.5 rounded-full"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="absolute bottom-3 left-4 right-4">
                <h2 className="text-lg font-bold text-white">{event.name}</h2>
                {event.date && <p className="text-white/80 text-sm">{format(parseDate(event.date), 'd MMM yyyy')}</p>}
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-start px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
              <div className="flex-1 min-w-0 pr-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{event.name}</h2>
                {event.date && <p className="text-sm text-gray-500 dark:text-gray-400">{format(parseDate(event.date), 'd MMM yyyy')}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setShowEventModal(true)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Edit className="w-4 h-4" /></button>
                <button onClick={() => setShowDeleteEvent(true)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* Scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {/* Countdown chip */}
            {daysUntil !== null && (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${isToday ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : isFuture ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                <Calendar className="w-3.5 h-3.5" />
                {isToday ? '¡Hoy es el día!' : isFuture ? `Faltan ${daysUntil} día${daysUntil !== 1 ? 's' : ''}` : `Fue hace ${Math.abs(daysUntil)} día${Math.abs(daysUntil) !== 1 ? 's' : ''}`}
              </div>
            )}

            {/* Notes */}
            {event.notes && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800/40">
                <div className="flex items-start gap-2">
                  <StickyNote className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap">{event.notes}</p>
                </div>
              </div>
            )}

            {/* Reminders */}
            <div className="liquid-glass-panel rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary-500" />
                  Recordatorios
                  {reminders.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">{completedReminders}/{reminders.length}</span>}
                </h3>
                <button onClick={() => setShowAddReminder(v => !v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-xs font-semibold hover:bg-primary-100 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Añadir
                </button>
              </div>

              {reminders.length === 0 ? (
                <EmptyState message="Sin recordatorios aún" />
              ) : (
                <div className="space-y-2">
                  {reminders.map((rem) => (
                    <div key={rem.id} className="flex items-center gap-3">
                      <button onClick={() => handleToggleReminder(rem)} className="flex-shrink-0">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${rem.completed ? 'bg-primary-500 border-primary-500' : 'border-gray-300 dark:border-gray-500'}`}>
                          {rem.completed && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${rem.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>{rem.text}</span>
                        {rem.dueDate && (
                          <span className="ml-2 text-xs text-blue-500 dark:text-blue-400 inline-flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />{format(new Date(rem.dueDate + 'T12:00:00'), 'd MMM')}
                          </span>
                        )}
                      </div>
                      <button onClick={() => handleDeleteReminder(rem)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-400 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Planes del evento (collapsible) */}
            <div className="liquid-glass-panel rounded-2xl overflow-hidden">
              <button onClick={() => setPlanesOpen(v => !v)} className="w-full flex items-center justify-between p-4 text-left">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  Planes
                  {eventPlans.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">{eventPlans.length}</span>}
                </h3>
                {planesOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {planesOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex justify-end">
                    <button onClick={() => { setEditingPlan(null); setShowPlanModal(true); }} className="btn-primary flex items-center gap-1.5 py-1.5 px-3 text-sm">
                      <Plus className="w-4 h-4" /> Añadir plan
                    </button>
                  </div>
                  {eventPlans.length === 0 ? <EmptyState message="Sin planes aún" /> : (
                    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handlePlacesDragEnd}>
                      <SortableContext items={eventPlans.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {eventPlans.map((plan) => (
                            <SortableItemCard key={plan.id} item={plan}
                              onEdit={() => { setEditingPlan(plan); setShowPlanModal(true); }}
                              onDelete={() => setDeleteItemConfirm({ isOpen: true, item: plan, col: 'places' })}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </div>

            {/* Ideas de regalo (collapsible) */}
            <div className="liquid-glass-panel rounded-2xl overflow-hidden">
              <button onClick={() => setIdeasOpen(v => !v)} className="w-full flex items-center justify-between p-4 text-left">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-pink-500" />
                  Ideas de regalo
                  {eventIdeas.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">{eventIdeas.length}</span>}
                </h3>
                {ideasOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {ideasOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex justify-end">
                    <button onClick={() => { setEditingIdea(null); setShowIdeaModal(true); }} className="btn-primary flex items-center gap-1.5 py-1.5 px-3 text-sm">
                      <Plus className="w-4 h-4" /> Añadir idea
                    </button>
                  </div>
                  {eventIdeas.length === 0 ? <EmptyState message="Sin ideas de regalo aún" /> : (
                    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleIdeasDragEnd}>
                      <SortableContext items={eventIdeas.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {eventIdeas.map((item) => (
                            <SortableItemCard key={item.id} item={item}
                              onEdit={() => { setEditingIdea(item); setShowIdeaModal(true); }}
                              onDelete={() => setDeleteItemConfirm({ isOpen: true, item, col: 'ideas' })}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modals - stop propagation so backdrop click doesn't close EventDetailModal */}
      <div onClick={(e) => e.stopPropagation()}>
        {showAddReminder && (
          <div className="fixed z-[60] liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={() => { setShowAddReminder(false); setReminderText(''); setReminderDate(''); }}>
            <div className="flex items-center justify-center h-full px-4 pb-20">
              <div className="liquid-glass-panel rounded-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Nuevo recordatorio</h3>
                  <button onClick={() => { setShowAddReminder(false); setReminderText(''); setReminderDate(''); }}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Una tarea o cosa que no quieres olvidar</p>
                <input autoFocus type="text" className="input-field mb-3" placeholder="Ej. Comprar regalo..." value={reminderText} onChange={e => setReminderText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddReminder()} />
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">Fecha límite (opcional)</label>
                <input type="date" className="input-field mb-4" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => { setShowAddReminder(false); setReminderText(''); setReminderDate(''); }} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleAddReminder} disabled={!reminderText.trim()} className="btn-primary flex-1 disabled:opacity-50">Añadir</button>
                </div>
              </div>
            </div>
          </div>
        )}
        <ItemFormModal
          isOpen={showIdeaModal}
          onClose={() => { setShowIdeaModal(false); setEditingIdea(null); }}
          onSave={handleSaveIdea}
          editingItem={editingIdea}
          type="event-idea"
        />
        <ItemFormModal
          isOpen={showPlanModal}
          onClose={() => { setShowPlanModal(false); setEditingPlan(null); }}
          onSave={handleSavePlan}
          editingItem={editingPlan}
          type="global-idea"
          hideDate
        />
        <EventFormModal
          isOpen={showEventModal}
          onClose={() => setShowEventModal(false)}
          onSave={handleSaveEvent}
          editingEvent={event}
          coupleId={coupleId}
        />
        <ConfirmModal
          isOpen={deleteItemConfirm.isOpen}
          onClose={() => setDeleteItemConfirm({ isOpen: false, item: null, col: '' })}
          onConfirm={handleDeleteItem}
          title="Eliminar"
          message="¿Seguro que quieres eliminar esto?"
          confirmText="Eliminar"
        />
        <ConfirmModal
          isOpen={showDeleteEvent}
          onClose={() => setShowDeleteEvent(false)}
          onConfirm={handleDeleteEvent}
          title="Eliminar evento"
          message={`¿Eliminar "${event.name}"? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
        />
      </div>
    </div>
  );
};

// ── CoupleSection ─────────────────────────────────────────────────────────────

const CoupleSection = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [coupleId, setCoupleId] = useState(null);
  const [couple, setCouple] = useState(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deleteEventConfirm, setDeleteEventConfirm] = useState({ isOpen: false, event: null });

  // Load coupleId only on first open
  useEffect(() => {
    if (!isOpen || !user || initialized) return;
    setInitialized(true);
    setLoading(true);
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}/settings/together`));
        if (snap.exists() && snap.data().coupleId) setCoupleId(snap.data().coupleId);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [isOpen, user, initialized]);

  // Realtime subscriptions only while section is open
  useEffect(() => {
    if (!isOpen || !coupleId) return;
    return onSnapshot(doc(db, 'couples', coupleId), (snap) => {
      if (snap.exists()) setCouple({ id: snap.id, ...snap.data() });
    });
  }, [isOpen, coupleId]);

  useEffect(() => {
    if (!isOpen || !coupleId) return;
    return onSnapshot(collection(db, `couples/${coupleId}/events`), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setEvents(data);
    });
  }, [isOpen, coupleId]);

  useEffect(() => {
    if (!isOpen || !coupleId) return;
    return onSnapshot(collection(db, `couples/${coupleId}/ideas`), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
      setIdeas(data);
    });
  }, [isOpen, coupleId]);

  const handleSaveEvent = async (data) => {
    if (editingEvent) {
      await updateDoc(doc(db, `couples/${coupleId}/events`, editingEvent.id), data);
      toast.success('Evento actualizado');
    } else {
      await addDoc(collection(db, `couples/${coupleId}/events`), { ...data, createdAt: new Date().toISOString() });
      toast.success('Evento creado');
    }
  };

  const handleDeleteEvent = async () => {
    const ev = deleteEventConfirm.event;
    await deleteDoc(doc(db, `couples/${coupleId}/events`, ev.id));
    if (ev.coverPhotoUrl) { try { await deleteObject(ref(storage, ev.coverPhotoUrl)); } catch {} }
    toast.success('Evento eliminado');
  };

  const anniversary = computeAnniversary(couple?.anniversaryDate);
  const selectedEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) ?? null : null;

  return (
    <div className="space-y-3">
      {/* Section header — always visible */}
      <div className="flex items-center justify-between">
        <button onClick={() => setIsOpen(v => !v)} className="flex items-center gap-2">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Pareja</p>
          {isOpen
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {isOpen && coupleId && (
          <button onClick={() => setShowSettings(true)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg">
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <>
          {loading ? (
            <div className="flex justify-center py-6">
              <Heart className="w-5 h-5 text-pink-400 animate-pulse" />
            </div>
          ) : !coupleId ? (
            <CoupleSetup onCreated={(id) => setCoupleId(id)} onJoined={(id) => setCoupleId(id)} />
          ) : (
            <>
              {/* Anniversary block */}
              {anniversary && (
                <div className="liquid-glass-panel rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-pink-100 dark:bg-pink-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                    <Heart className="w-5 h-5 text-pink-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {anniversary.years > 0
                        ? `${anniversary.years} año${anniversary.years !== 1 ? 's' : ''} juntos`
                        : `${anniversary.totalDays} días juntos`}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {anniversary.daysUntilNext === 0
                        ? '🎉 ¡Hoy es su aniversario!'
                        : `${anniversary.daysUntilNext} días para el próximo aniversario`}
                    </p>
                  </div>
                </div>
              )}

              {/* Planes button */}
              <button
                onClick={() => setShowPlans(true)}
                className="w-full flex items-center justify-between px-4 py-3 liquid-glass-panel rounded-2xl text-left"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">Planes</span>
                  {ideas.length > 0 && <span className="text-sm text-gray-400 dark:text-gray-500">{ideas.length}</span>}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              {/* Eventos especiales */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Eventos especiales</p>
                <button
                  onClick={() => { setEditingEvent(null); setShowEventModal(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/50 text-primary-600 dark:text-primary-400 text-sm font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Nuevo
                </button>
              </div>

              {events.length === 0 ? (
                <div className="liquid-glass-panel rounded-2xl text-center py-6 px-4">
                  <p className="text-sm text-gray-400 dark:text-gray-500">Sin eventos especiales aún</p>
                  <button onClick={() => { setEditingEvent(null); setShowEventModal(true); }} className="btn-primary text-sm px-4 mt-3">
                    Crear evento
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {events.map((event) => {
                    const daysUntil = getDaysUntil(event.date);
                    const isFuture = daysUntil !== null && daysUntil > 0;
                    const isToday = daysUntil === 0;
                    return (
                      <div
                        key={event.id}
                        className="relative rounded-2xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity aspect-square"
                        onClick={() => setSelectedEventId(event.id)}
                      >
                        {event.coverPhotoUrl ? (
                          <img src={event.coverPhotoUrl} alt={event.name} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 liquid-glass-panel rounded-2xl flex items-center justify-center">
                            <Calendar className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
                        {daysUntil !== null && (
                          <span className="absolute top-2.5 right-2.5 text-xs font-medium px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white">
                            {isToday ? '¡Hoy!' : isFuture ? `en ${daysUntil}d` : `hace ${Math.abs(daysUntil)}d`}
                          </span>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <h3 className="font-semibold text-sm text-white truncate">{event.name}</h3>
                          {event.date && <p className="text-xs text-white/70 mt-0.5">{format(parseDate(event.date), 'd MMM yyyy')}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Modals */}
          <PlansModal
            isOpen={showPlans}
            onClose={() => setShowPlans(false)}
            coupleId={coupleId}
            ideas={ideas}
            setIdeas={setIdeas}
          />

          <EventDetailModal
            key={selectedEventId ?? 'none'}
            isOpen={!!selectedEventId && !!selectedEvent}
            onClose={() => setSelectedEventId(null)}
            event={selectedEvent}
            coupleId={coupleId}
            onEventDeleted={() => setSelectedEventId(null)}
          />

          <SettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            couple={couple}
            coupleId={coupleId}
          />

          <EventFormModal
            isOpen={showEventModal}
            onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
            onSave={handleSaveEvent}
            editingEvent={editingEvent}
            coupleId={coupleId}
          />

          <ConfirmModal
            isOpen={deleteEventConfirm.isOpen}
            onClose={() => setDeleteEventConfirm({ isOpen: false, event: null })}
            onConfirm={handleDeleteEvent}
            title="Eliminar evento"
            message={`¿Eliminar "${deleteEventConfirm.event?.name}"?`}
            confirmText="Eliminar"
          />
        </>
      )}
    </div>
  );
};

export default CoupleSection;
