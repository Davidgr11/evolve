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
  Heart, Plus, ArrowLeft, MapPin, Gift, CheckSquare,
  Settings, Copy, Trash2, Edit, ExternalLink, Calendar,
  X, Check, Users, StickyNote, GripVertical,
} from 'lucide-react';
import { differenceInYears, differenceInDays, addYears, format } from 'date-fns';
import ConfirmModal from '../components/ConfirmModal';
import ImageUpload from '../components/ImageUpload';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── EmptyState ───────────────────────────────────────────────────────────────

const EmptyState = ({ message }) => (
  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
    <p className="text-sm">{message}</p>
  </div>
);

// ─── SortablePlanCard ─────────────────────────────────────────────────────────

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
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(plan.date + 'T12:00:00'), 'd MMM yyyy')}
              </span>
            )}
          </div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">{plan.name}</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {plan.price && (
              <span className="text-sm text-gray-500 dark:text-gray-400">{plan.price}</span>
            )}
            {plan.url && (
              <a
                href={plan.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                Ver link
              </a>
            )}
          </div>
          {plan.notes && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-2">{plan.notes}</p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <Edit className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── ItemCard ─────────────────────────────────────────────────────────────────

const ItemCard = ({ item, onEdit, onDelete }) => (
  <div className="liquid-glass-panel rounded-xl p-4">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">{item.name}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {item.price && (
            <span className="text-sm text-gray-500 dark:text-gray-400">{item.price}</span>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Ver link
            </a>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-2">{item.notes}</p>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <Edit className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
);

// ─── SetupScreen ──────────────────────────────────────────────────────────────

const SetupScreen = ({ onCreated, onJoined }) => {
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
        members: [user.uid],
        inviteCode,
        anniversaryDate: '',
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, 'coupleInvites', inviteCode), {
        coupleId,
        createdBy: user.uid,
      });

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
      if (!inviteSnap.exists()) {
        toast.error('Código inválido');
        return;
      }

      const { coupleId } = inviteSnap.data();

      // Non-members can update via arrayUnion (rule allows joining a 1-member couple)
      await updateDoc(doc(db, 'couples', coupleId), {
        members: arrayUnion(user.uid),
      });

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
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="mb-8">
        <div className="w-20 h-20 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center mx-auto mb-4">
          <Heart className="w-10 h-10 text-pink-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Together</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Tu espacio compartido de pareja</p>
      </div>

      {mode === 'choose' && (
        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Crear espacio
          </button>
          <button
            onClick={() => setMode('join')}
            className="btn-secondary w-full py-3 flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" />
            Unirse con código
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="w-full max-w-xs space-y-3">
          <input
            className="input-field text-center text-xl tracking-widest font-mono uppercase"
            placeholder="CÓDIGO"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={loading || !code.trim()}
            className="btn-primary w-full py-3"
          >
            {loading ? 'Buscando...' : 'Unirme'}
          </button>
          <button
            onClick={() => setMode('choose')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            ← Volver
          </button>
        </div>
      )}
    </div>
  );
};

// ─── SettingsModal ────────────────────────────────────────────────────────────

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
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(couple?.inviteCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 liquid-glass-overlay"
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
      onClick={onClose}
    >
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div
          className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col"
          style={{ maxHeight: 'calc(90vh - 80px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Configuración</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">¿Desde cuándo están juntos?</label>
              <input
                type="date"
                className="input-field"
                value={anniversaryDate}
                onChange={(e) => setAnniversaryDate(e.target.value)}
              />
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
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Comparte este código con tu pareja para que se una
              </p>
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

// ─── EventFormModal ───────────────────────────────────────────────────────────

const EventFormModal = ({ isOpen, onClose, onSave, editingEvent, coupleId }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingEvent) {
      setName(editingEvent.name || '');
      setDate(editingEvent.date || '');
      setNotes(editingEvent.notes || '');
    } else {
      setName('');
      setDate('');
      setNotes('');
    }
  }, [editingEvent, isOpen]);

  const handleSubmit = async () => {
    if (!name.trim() || !date) {
      toast.error('Nombre y fecha son requeridos');
      return;
    }

    const fileInput = document.getElementById('event-cover-input');
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
      } catch {
        toast.error('Error al subir la imagen');
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    await onSave({ name: name.trim(), date, notes: notes.trim(), coverPhotoUrl });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 liquid-glass-overlay"
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
      onClick={onClose}
    >
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div
          className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col"
          style={{ maxHeight: 'calc(90vh - 80px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {editingEvent ? 'Editar evento' : 'Nuevo evento'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Nombre *</label>
              <input
                className="input-field"
                placeholder="ej. Aniversario 2025"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Fecha *</label>
              <input
                type="date"
                className="input-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Foto de portada</label>
              <ImageUpload
                id="event-cover-input"
                label="Seleccionar foto"
                existingImageUrl={editingEvent?.coverPhotoUrl}
                disabled={uploading}
              />
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea
                className="input-field min-h-[80px] resize-none"
                placeholder="Notas generales del evento..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={uploading || !name.trim() || !date}
              className="btn-primary w-full"
            >
              {uploading ? 'Guardando...' : editingEvent ? 'Guardar cambios' : 'Crear evento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ItemFormModal ────────────────────────────────────────────────────────────
// type: 'place' | 'event-idea' | 'todo' | 'global-idea'

const ItemFormModal = ({ isOpen, onClose, onSave, editingItem, type }) => {
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
      if (type === 'todo') {
        setTodoText(editingItem.text || '');
      } else {
        setName(editingItem.name || '');
        setPrice(editingItem.price || '');
        setUrl(editingItem.url || '');
        setNotes(editingItem.notes || '');
        if (type === 'global-idea') {
          setIdeaType(editingItem.type || 'restaurant');
          setPlanDate(editingItem.date || '');
        }
      }
    } else {
      setName(''); setPrice(''); setUrl(''); setNotes('');
      setTodoText(''); setIdeaType('restaurant'); setPlanDate('');
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
    <div
      className="fixed z-50 liquid-glass-overlay"
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
      onClick={onClose}
    >
      <div className="flex items-center justify-center h-full pb-20 px-4">
        <div
          className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col"
          style={{ maxHeight: 'calc(90vh - 80px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0 border-b border-white/30 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{titles[type]}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {type === 'todo' ? (
              <div>
                <label className="label">Tarea</label>
                <input
                  className="input-field"
                  placeholder="ej. Reservar restaurante"
                  value={todoText}
                  onChange={(e) => setTodoText(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>
            ) : (
              <>
                {type === 'global-idea' && (
                  <div>
                    <label className="label">Tipo</label>
                    <div className="flex gap-2 flex-wrap">
                      {IDEA_TYPES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setIdeaType(t.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            ideaType === t.id
                              ? t.color
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="label">Nombre *</label>
                  <input
                    className="input-field"
                    placeholder={type === 'place' ? 'ej. Restaurante Nicos' : 'ej. Airpods Pro'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                {type !== 'event-idea' && (
                  <div>
                    <label className="label">Precio estimado</label>
                    <input
                      className="input-field"
                      placeholder="ej. $500 MXN"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="label">URL / Link</label>
                  <input
                    className="input-field"
                    type="text"
                  inputMode="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                {type === 'global-idea' && (
                  <div>
                    <label className="label">Fecha</label>
                    <input
                      type="date"
                      className="input-field"
                      value={planDate}
                      onChange={(e) => setPlanDate(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="label">Notas</label>
                  <textarea
                    className="input-field resize-none min-h-[60px]"
                    placeholder="Detalles adicionales..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            )}
            <button
              onClick={handleSubmit}
              disabled={type === 'todo' ? !todoText.trim() : !name.trim()}
              className="btn-primary w-full"
            >
              {editingItem ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── EventDetailView ──────────────────────────────────────────────────────────

const EventDetailView = ({ event, coupleId, onBack, onEventDeleted }) => {
  const [subTab, setSubTab] = useState('places');
  const [places, setPlaces] = useState([]);
  const [eventIdeas, setEventIdeas] = useState([]);
  const [todos, setTodos] = useState([]);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemType, setItemType] = useState('place');
  const [deleteItemConfirm, setDeleteItemConfirm] = useState({ isOpen: false, item: null, col: '' });

  const [showEventModal, setShowEventModal] = useState(false);
  const [showDeleteEvent, setShowDeleteEvent] = useState(false);

  const basePath = `couples/${coupleId}/events/${event.id}`;

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, `${basePath}/places`), (snap) => {
        setPlaces(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        );
      }),
      onSnapshot(collection(db, `${basePath}/ideas`), (snap) => {
        setEventIdeas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        );
      }),
      onSnapshot(collection(db, `${basePath}/todos`), (snap) => {
        setTodos(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        );
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [basePath]);

  const handleSaveItem = async (data) => {
    const col = subTab === 'places' ? 'places' : subTab === 'ideas' ? 'ideas' : 'todos';
    if (editingItem) {
      await updateDoc(doc(db, `${basePath}/${col}`, editingItem.id), data);
    } else {
      await addDoc(collection(db, `${basePath}/${col}`), { ...data, createdAt: new Date().toISOString() });
    }
    toast.success(editingItem ? 'Actualizado' : 'Agregado');
  };

  const handleDeleteItem = async () => {
    const { item, col } = deleteItemConfirm;
    await deleteDoc(doc(db, `${basePath}/${col}`, item.id));
    toast.success('Eliminado');
  };

  const handleToggleTodo = async (todo) => {
    await updateDoc(doc(db, `${basePath}/todos`, todo.id), { completed: !todo.completed });
  };

  const handleSaveEvent = async (data) => {
    await updateDoc(doc(db, 'couples', coupleId, 'events', event.id), data);
    toast.success('Evento actualizado');
  };

  const handleDeleteEvent = async () => {
    await deleteDoc(doc(db, 'couples', coupleId, 'events', event.id));
    if (event.coverPhotoUrl) {
      try { await deleteObject(ref(storage, event.coverPhotoUrl)); } catch {}
    }
    toast.success('Evento eliminado');
    onEventDeleted();
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemType(subTab === 'places' ? 'place' : subTab === 'ideas' ? 'event-idea' : 'todo');
    setShowItemModal(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setItemType(subTab === 'places' ? 'place' : subTab === 'ideas' ? 'event-idea' : 'todo');
    setShowItemModal(true);
  };

  const daysUntil = getDaysUntil(event.date);
  const isFuture = daysUntil !== null && daysUntil > 0;
  const isToday = daysUntil === 0;
  const completedTodos = todos.filter((t) => t.completed).length;

  return (
    <>
      {/* Header */}
      {event.coverPhotoUrl ? (
        <div className="relative aspect-square -mx-4 -mt-6 mb-4 overflow-hidden">
          <img src={event.coverPhotoUrl} alt={event.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <button
            onClick={onBack}
            className="absolute top-4 left-4 bg-black/40 backdrop-blur-md text-white p-2 rounded-full shadow-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={() => setShowEventModal(true)}
              className="bg-black/40 backdrop-blur-md text-white p-2 rounded-full shadow-lg"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDeleteEvent(true)}
              className="bg-black/40 backdrop-blur-md text-white p-2 rounded-full shadow-lg"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-xl font-bold text-white">{event.name}</h1>
            {event.date && (
              <p className="text-white/80 text-sm mt-0.5">
                {format(parseDate(event.date), 'd MMM yyyy')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-1 -ml-1 text-gray-600 dark:text-gray-300">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{event.name}</h1>
            {event.date && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {format(parseDate(event.date), 'd MMM yyyy')}
              </p>
            )}
          </div>
          <button onClick={() => setShowEventModal(true)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <Edit className="w-4 h-4" />
          </button>
          <button onClick={() => setShowDeleteEvent(true)} className="p-2 text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Countdown chip */}
      {daysUntil !== null && (
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium mb-4 ${
            isToday
              ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
              : isFuture
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          {isToday
            ? '¡Hoy es el día!'
            : isFuture
            ? `Faltan ${daysUntil} día${daysUntil !== 1 ? 's' : ''}`
            : `Fue hace ${Math.abs(daysUntil)} día${Math.abs(daysUntil) !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Notes */}
      {event.notes && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800/40">
          <div className="flex items-start gap-2">
            <StickyNote className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap">{event.notes}</p>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-4">
        {[
          { id: 'places', label: 'Lugares', icon: MapPin },
          { id: 'ideas', label: 'Ideas', icon: Gift },
          { id: 'todos', label: 'To-dos', icon: CheckSquare },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
              subTab === id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {id === 'todos' && todos.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {completedTodos}/{todos.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="flex justify-end mb-3">
        <button onClick={openAddItem} className="btn-primary flex items-center gap-1.5 py-2 px-3 text-sm">
          <Plus className="w-4 h-4" />
          {subTab === 'places' ? 'Lugar' : subTab === 'ideas' ? 'Idea' : 'To-do'}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-3 pb-4">
        {subTab === 'todos' ? (
          todos.length === 0 ? (
            <EmptyState message="Sin to-dos aún" />
          ) : (
            todos.map((todo) => (
              <div key={todo.id} className="liquid-glass-panel rounded-xl p-3 flex items-center gap-3">
                <button onClick={() => handleToggleTodo(todo)} className="flex-shrink-0">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      todo.completed
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-gray-300 dark:border-gray-500'
                    }`}
                  >
                    {todo.completed && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
                <span
                  className={`flex-1 text-sm ${
                    todo.completed
                      ? 'line-through text-gray-400 dark:text-gray-500'
                      : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {todo.text}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEditItem(todo)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteItemConfirm({ isOpen: true, item: todo, col: 'todos' })}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )
        ) : (subTab === 'places' ? places : eventIdeas).length === 0 ? (
          <EmptyState message={`Sin ${subTab === 'places' ? 'lugares' : 'ideas'} aún`} />
        ) : (
          (subTab === 'places' ? places : eventIdeas).map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={() => openEditItem(item)}
              onDelete={() =>
                setDeleteItemConfirm({
                  isOpen: true,
                  item,
                  col: subTab === 'places' ? 'places' : 'ideas',
                })
              }
            />
          ))
        )}
      </div>

      {/* Modals */}
      <ItemFormModal
        isOpen={showItemModal}
        onClose={() => { setShowItemModal(false); setEditingItem(null); }}
        onSave={handleSaveItem}
        editingItem={editingItem}
        type={itemType}
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
    </>
  );
};

// ─── Together (main) ──────────────────────────────────────────────────────────

const Together = () => {
  const { user } = useAuth();
  const [coupleId, setCoupleId] = useState(null);
  const [couple, setCouple] = useState(null);
  const [loading, setLoading] = useState(true);

  const planSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeTab, setActiveTab] = useState('events');
  const [view, setView] = useState('main'); // 'main' | 'event-detail'
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Events
  const [events, setEvents] = useState([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deleteEventConfirm, setDeleteEventConfirm] = useState({ isOpen: false, event: null });

  // Ideas
  const [ideas, setIdeas] = useState([]);
  const [ideaTypeFilter, setIdeaTypeFilter] = useState('all');
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [deleteIdeaConfirm, setDeleteIdeaConfirm] = useState({ isOpen: false, idea: null });

  const [showSettings, setShowSettings] = useState(false);

  // Load couple ID from user settings
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}/settings/together`));
        if (snap.exists() && snap.data().coupleId) {
          setCoupleId(snap.data().coupleId);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // Listen to couple doc
  useEffect(() => {
    if (!coupleId) return;
    const unsub = onSnapshot(doc(db, 'couples', coupleId), (snap) => {
      if (snap.exists()) setCouple({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [coupleId]);

  // Listen to events
  useEffect(() => {
    if (!coupleId) return;
    const unsub = onSnapshot(collection(db, `couples/${coupleId}/events`), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setEvents(data);
    });
    return unsub;
  }, [coupleId]);

  // Listen to global ideas
  useEffect(() => {
    if (!coupleId) return;
    const unsub = onSnapshot(collection(db, `couples/${coupleId}/ideas`), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
      setIdeas(data);
    });
    return unsub;
  }, [coupleId]);

  // If selected event is deleted by the other user, go back to main
  useEffect(() => {
    if (view === 'event-detail' && selectedEventId && !events.find((e) => e.id === selectedEventId)) {
      setView('main');
      setSelectedEventId(null);
    }
  }, [events, selectedEventId, view]);

  const handleSaveEvent = async (data) => {
    if (editingEvent) {
      await updateDoc(doc(db, `couples/${coupleId}/events`, editingEvent.id), data);
      toast.success('Evento actualizado');
    } else {
      await addDoc(collection(db, `couples/${coupleId}/events`), {
        ...data,
        createdAt: new Date().toISOString(),
      });
      toast.success('Evento creado');
    }
  };

  const handleDeleteEvent = async () => {
    const ev = deleteEventConfirm.event;
    await deleteDoc(doc(db, `couples/${coupleId}/events`, ev.id));
    if (ev.coverPhotoUrl) {
      try { await deleteObject(ref(storage, ev.coverPhotoUrl)); } catch {}
    }
    toast.success('Evento eliminado');
  };

  const handleSaveIdea = async (data) => {
    if (editingIdea) {
      await updateDoc(doc(db, `couples/${coupleId}/ideas`, editingIdea.id), data);
      toast.success('Actualizado');
    } else {
      await addDoc(collection(db, `couples/${coupleId}/ideas`), {
        ...data,
        order: ideas.length,
        createdAt: new Date().toISOString(),
      });
      toast.success('Agregado');
    }
  };

  const handleDeleteIdea = async () => {
    await deleteDoc(doc(db, `couples/${coupleId}/ideas`, deleteIdeaConfirm.idea.id));
    toast.success('Eliminado');
  };

  const handleDragEndPlans = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = ideas.findIndex((i) => i.id === active.id);
    const newIndex = ideas.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(ideas, oldIndex, newIndex);
    setIdeas(reordered);
    await Promise.all(
      reordered.map((idea, idx) =>
        updateDoc(doc(db, `couples/${coupleId}/ideas`, idea.id), { order: idx })
      )
    );
  };

  const anniversary = computeAnniversary(couple?.anniversaryDate);
  const filteredIdeas = ideaTypeFilter === 'all' ? ideas : ideas.filter((i) => i.type === ideaTypeFilter);
  const selectedEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) ?? null : null;

  // ── Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Heart className="w-8 h-8 text-pink-400 animate-pulse" />
      </div>
    );
  }

  // ── Setup
  if (!coupleId) {
    return (
      <SetupScreen
        onCreated={(id) => setCoupleId(id)}
        onJoined={(id) => setCoupleId(id)}
      />
    );
  }

  // ── Event detail view
  if (view === 'event-detail' && selectedEvent) {
    return (
      <EventDetailView
        event={selectedEvent}
        coupleId={coupleId}
        onBack={() => { setView('main'); setSelectedEventId(null); }}
        onEventDeleted={() => { setView('main'); setSelectedEventId(null); }}
      />
    );
  }

  // ── Main view
  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Together</h1>
          {anniversary && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {anniversary.years > 0
                ? `${anniversary.years} año${anniversary.years !== 1 ? 's' : ''} y ${anniversary.totalDays % 365} días`
                : `${anniversary.totalDays} días`}{' '}
              juntos
            </p>
          )}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Anniversary card */}
      {anniversary && (
        <div className="liquid-glass-panel rounded-2xl p-4 mb-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <Heart className="w-6 h-6 text-pink-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">
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

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-5">
        {[
          { id: 'events', label: 'Eventos' },
          { id: 'planes', label: 'Planes' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Events tab */}
      {activeTab === 'events' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Eventos especiales</h2>
            <button
              onClick={() => { setEditingEvent(null); setShowEventModal(true); }}
              className="btn-primary flex items-center gap-1.5 py-2 px-3 text-sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo
            </button>
          </div>

          {events.length === 0 ? (
            <EmptyState message="Sin eventos aún. ¡Crea el primero!" />
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const daysUntil = getDaysUntil(event.date);
                const isFuture = daysUntil !== null && daysUntil > 0;
                const isToday = daysUntil === 0;

                return (
                  <div
                    key={event.id}
                    className="relative rounded-2xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity aspect-video"
                    onClick={() => { setSelectedEventId(event.id); setView('event-detail'); }}
                  >
                    {/* Background */}
                    {event.coverPhotoUrl ? (
                      <img
                        src={event.coverPhotoUrl}
                        alt={event.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 liquid-glass-panel rounded-2xl flex items-center justify-center">
                        <Calendar className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                    {/* Gradient — bottom only, behind name and date */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
                    {/* Countdown badge — top right */}
                    {daysUntil !== null && (
                      <span className="absolute top-2.5 right-2.5 text-xs font-medium px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white">
                        {isToday ? '¡Hoy!' : isFuture ? `en ${daysUntil}d` : `hace ${Math.abs(daysUntil)}d`}
                      </span>
                    )}
                    {/* Name and date — bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="font-semibold text-sm text-white truncate">{event.name}</h3>
                      {event.date && (
                        <p className="text-xs text-white/70 mt-0.5">
                          {format(parseDate(event.date), 'd MMM yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Planes tab */}
      {activeTab === 'planes' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Planes</h2>
            <button
              onClick={() => { setEditingIdea(null); setShowIdeaModal(true); }}
              className="btn-primary flex items-center gap-1.5 py-2 px-3 text-sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo
            </button>
          </div>

          {/* Type filter */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setIdeaTypeFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                ideaTypeFilter === 'all'
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              Todos
            </button>
            {IDEA_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setIdeaTypeFilter(t.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  ideaTypeFilter === t.id
                    ? t.color
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {filteredIdeas.length === 0 ? (
            <EmptyState message="Sin planes aún" />
          ) : (
            <DndContext sensors={planSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPlans}>
              <SortableContext items={ideas.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {filteredIdeas.map((plan) => (
                    <SortablePlanCard
                      key={plan.id}
                      plan={plan}
                      showDrag={ideaTypeFilter === 'all'}
                      onEdit={() => { setEditingIdea(plan); setShowIdeaModal(true); }}
                      onDelete={() => setDeleteIdeaConfirm({ isOpen: true, idea: plan })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {/* Modals */}
      <EventFormModal
        isOpen={showEventModal}
        onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
        onSave={handleSaveEvent}
        editingEvent={editingEvent}
        coupleId={coupleId}
      />

      <ItemFormModal
        isOpen={showIdeaModal}
        onClose={() => { setShowIdeaModal(false); setEditingIdea(null); }}
        onSave={handleSaveIdea}
        editingItem={editingIdea}
        type="global-idea"
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        couple={couple}
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

      <ConfirmModal
        isOpen={deleteIdeaConfirm.isOpen}
        onClose={() => setDeleteIdeaConfirm({ isOpen: false, idea: null })}
        onConfirm={handleDeleteIdea}
        title="Eliminar plan"
        message="¿Seguro que quieres eliminar este plan?"
        confirmText="Eliminar"
      />
    </>
  );
};

export default Together;
