import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import toast from '../utils/toast';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react';
import ImageUpload from './ImageUpload';

// ── free-exercise-db image lookup (GitHub-hosted, no API key) ────────────────
// Repo: https://github.com/yuhonas/free-exercise-db  (~873 exercises)
const EXERCISE_DB_JSON = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const EXERCISE_DB_IMG  = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
let _exerciseDb = null;

const loadExerciseDb = async () => {
  if (_exerciseDb) return _exerciseDb;
  try {
    const r = await fetch(EXERCISE_DB_JSON, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return (_exerciseDb = []);
    _exerciseDb = await r.json();
    return _exerciseDb;
  } catch {
    return (_exerciseDb = []);
  }
};

const fetchExerciseImage = async (exerciseName) => {
  try {
    const db = await loadExerciseDb();
    if (!db.length) return null;

    const needle = exerciseName.toLowerCase().trim();
    const words  = needle.split(' ');

    // 1. Exact match
    let match = db.find(ex => ex.name?.toLowerCase() === needle);
    // 2. DB name contains full query
    if (!match) match = db.find(ex => ex.name?.toLowerCase().includes(needle));
    // 3. Query contains DB name
    if (!match) match = db.find(ex => needle.includes(ex.name?.toLowerCase() || '~~'));
    // 4. First two words of query appear in DB name
    if (!match && words.length >= 2) {
      const prefix = words.slice(0, 2).join(' ');
      match = db.find(ex => ex.name?.toLowerCase().includes(prefix));
    }
    // 5. First word alone
    if (!match) match = db.find(ex => ex.name?.toLowerCase().includes(words[0]));

    if (!match || !match.images?.length) return null;
    return `${EXERCISE_DB_IMG}/${match.images[0]}`;
  } catch {
    return null;
  }
};

// ── Claude helper ─────────────────────────────────────────────────────────────
const callClaude = async (prompt, maxTokens = 300) => {
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
  return (await res.json()).content[0].text
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
};

// ── Main component ────────────────────────────────────────────────────────────
const RoutineModal = ({ routine, onClose, onSave }) => {
  const { user } = useAuth();

  // Step 0 = describe (new only) · 1 = name/type/rounds · 2 = exercises
  const [step, setStep] = useState(routine ? 1 : 0);

  const [description, setDescription]     = useState('');
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const [name, setName]           = useState(routine?.name || '');
  const [type, setType]           = useState(routine?.type || '');
  const [rounds, setRounds]       = useState(routine?.series ?? 3);
  const [weeklyGoal, setWeeklyGoal] = useState(routine?.weeklyGoal ?? 2);

  const [exercises, setExercises] = useState(
    (routine?.exercises || []).map(ex => ({ ...ex, _id: Math.random().toString(36).slice(2) }))
  );
  const [expandedId, setExpandedId] = useState(null);
  const [pendingImages, setPendingImages] = useState({});
  const [suggesting, setSuggesting]       = useState(false);
  const [uploading, setUploading]         = useState(false);

  // ── Step 0: AI classify description ──────────────────────────────────────
  const handleAnalyze = async () => {
    if (!description.trim()) { toast.error('Describe tu rutina primero'); return; }
    setAnalyzeLoading(true);
    try {
      const text = await callClaude(
        `A user wants to create a workout routine. Description: "${description.trim()}"

Return ONLY a JSON object (no markdown, no extra text):
{"name": "short creative routine name (same language as description)", "type": "category e.g. Fuerza, HIIT, Yoga, Pilates, Cardio, Estiramiento, Running, Deportes, Movilidad, Funcional — same language"}

Be specific and creative with the name.`
      );
      const parsed = JSON.parse(text);
      setName(parsed.name || '');
      setType(parsed.type || '');
      setStep(1);
    } catch (err) {
      toast.error('No se pudo analizar la descripción');
      console.error(err);
    } finally {
      setAnalyzeLoading(false);
    }
  };

  // ── Step 2: suggest 3 exercises ───────────────────────────────────────────
  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const existing = exercises.map(e => e.name).filter(Boolean);
      const skip = existing.length ? ` Already has: ${existing.join(', ')}. Do NOT repeat any.` : '';
      const text = await callClaude(
        `Suggest 3 exercises for a "${type || 'general'}" routine named "${name}".${skip}
Return ONLY a JSON array:
[{"name": "Standard English name", "reps": "e.g. 12 reps or 45 seconds", "instructions": "1-2 sentences: how to perform the exercise, key form cues"}]
- Use common English names (needed for image search).
- "reps" = reps OR duration per round — do NOT include set counts like "3x12", just "12 reps".
- "instructions" must be in the same language as the routine name ("${name}").`,
        400
      );

      const suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) throw new Error('bad format');

      // Fetch images concurrently (non-blocking — exercises added even without image)
      const withImages = await Promise.all(
        suggestions.map(async (ex) => ({
          _id: Math.random().toString(36).slice(2),
          name: ex.name || '',
          repetitions: ex.reps || '',
          instructions: ex.instructions || '',
          imageUrl: (await fetchExerciseImage(ex.name)) || '',
          imagePath: '',
        }))
      );
      setExercises(prev => [...prev, ...withImages]);
      if (withImages.length) setExpandedId(withImages[0]._id);
    } catch (err) {
      toast.error('Error al obtener sugerencias');
      console.error(err);
    } finally {
      setSuggesting(false);
    }
  };

  const addManual = () => {
    const _id = Math.random().toString(36).slice(2);
    setExercises(prev => [...prev, { _id, name: '', repetitions: '', instructions: '', imageUrl: '', imagePath: '' }]);
    setExpandedId(_id);
  };

  const updateExercise = (_id, field, value) => {
    setExercises(prev => prev.map(ex => ex._id === _id ? { ...ex, [field]: value } : ex));
  };

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

  const uploadImage = async (file) => {
    try {
      setUploading(true);
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true });
      const imagePath = `users/${user.uid}/exercises/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, compressed);
      return { imageUrl: await getDownloadURL(storageRef), imagePath };
    } catch { return null; }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('La rutina necesita un nombre'); return; }
    if (exercises.length === 0) { toast.error('Agrega al menos un ejercicio'); return; }

    const processed = await Promise.all(
      exercises.map(async (ex) => {
        const pending = pendingImages[ex._id];
        if (pending?.file) {
          const up = await uploadImage(pending.file);
          return { name: ex.name, repetitions: ex.repetitions, instructions: ex.instructions || '', imageUrl: up?.imageUrl || ex.imageUrl, imagePath: up?.imagePath || '' };
        }
        return { name: ex.name, repetitions: ex.repetitions, instructions: ex.instructions || '', imageUrl: ex.imageUrl || '', imagePath: ex.imagePath || '' };
      })
    );

    onSave({ name: name.trim(), type: type.trim() || 'general', series: rounds, weeklyGoal, exercises: processed });
  };

  // ─────────────────────────────────────────────────────────────────────────
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
          <div className="flex justify-between items-center px-5 pt-5 pb-4 border-b border-white/30 dark:border-white/10 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {routine ? 'Editar rutina' : ['Describe tu rutina', 'Detalles', 'Ejercicios'][step]}
              </h2>
              {!routine && (
                <div className="flex gap-1 mt-1.5">
                  {[0, 1, 2].map(s => (
                    <div key={s} className={`h-1 rounded-full transition-all ${s === step ? 'w-6 bg-primary-500' : s < step ? 'w-3 bg-primary-300' : 'w-3 bg-gray-200 dark:bg-gray-700'}`} />
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">

            {/* ── Step 0: Describe ── */}
            {step === 0 && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-400">
                  Describe qué quieres trabajar, tus objetivos, nivel, tiempo disponible... La IA le pondrá nombre y la categorizará.
                </p>
                <textarea
                  className="input-field resize-none"
                  rows={5}
                  placeholder="ej. Quiero trabajar piernas y glúteos en 20 minutos, sin equipo, intensidad media, para tonificar..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={handleAnalyze}
                  disabled={analyzeLoading || !description.trim()}
                  className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {analyzeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzeLoading ? 'Analizando...' : 'Crear con IA'}
                </button>
              </div>
            )}

            {/* ── Step 1: Name / type / rounds / goal ── */}
            {step === 1 && (
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
                  <label className="label">Tipo / Categoría</label>
                  <input
                    className="input-field"
                    value={type}
                    onChange={e => setType(e.target.value)}
                    placeholder="ej. Fuerza, HIIT, Yoga, Cardio"
                  />
                </div>
                <div>
                  <label className="label">Rondas</label>
                  <p className="text-sm text-gray-400 mb-2">La lista completa de ejercicios se repite este número de veces</p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setRounds(r => Math.max(1, r - 1))}
                      className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 font-bold text-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center">−</button>
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 w-8 text-center">{rounds}</span>
                    <button type="button" onClick={() => setRounds(r => r + 1)}
                      className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 font-bold text-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center">+</button>
                    <span className="text-sm text-gray-400">
                      {rounds === 1 ? '1 ronda' : `${rounds} rondas`}
                    </span>
                  </div>
                </div>
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
                <button
                  onClick={() => setStep(2)}
                  disabled={!name.trim()}
                  className="w-full btn-primary py-3 disabled:opacity-60"
                >
                  Continuar → Agregar ejercicios
                </button>
              </div>
            )}

            {/* ── Step 2: Exercises ── */}
            {step === 2 && (
              <div className="p-5 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 text-sm font-medium hover:bg-primary-100 transition-colors disabled:opacity-60"
                  >
                    {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {suggesting ? 'Buscando...' : exercises.length === 0 ? 'Sugerir ejercicios' : '+ 3 más con IA'}
                  </button>
                  <button
                    type="button"
                    onClick={addManual}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar manual
                  </button>
                </div>

                {exercises.length === 0 && !suggesting && (
                  <p className="text-center text-sm text-gray-400 py-8">
                    Usa los botones de arriba para añadir ejercicios
                  </p>
                )}

                <div className="space-y-2">
                  {exercises.map((ex, idx) => {
                    const isOpen = expandedId === ex._id;
                    return (
                      <div key={ex._id} className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                        {/* Row summary */}
                        <div
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/60 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => setExpandedId(isOpen ? null : ex._id)}
                        >
                          {ex.imageUrl ? (
                            <img
                              src={ex.imageUrl}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-200 dark:bg-gray-600"
                              onError={() => updateExercise(ex._id, 'imageUrl', '')}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {ex.name || <span className="text-gray-400 italic">Sin nombre</span>}
                            </p>
                            {ex.repetitions && (
                              <p className="text-sm text-gray-400">{ex.repetitions}</p>
                            )}
                            {!ex.imageUrl && ex.instructions && (
                              <p className="text-sm text-gray-400 italic truncate">{ex.instructions}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => removeExercise(ex._id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div
                              className="p-1.5 text-gray-400"
                              onClick={() => setExpandedId(isOpen ? null : ex._id)}
                            >
                              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Expanded edit */}
                        {isOpen && (
                          <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                            <div>
                              <label className="label">Nombre</label>
                              <input
                                className="input-field"
                                value={ex.name}
                                onChange={e => updateExercise(ex._id, 'name', e.target.value)}
                                placeholder="ej. Sentadilla, Push-up, Plancha"
                                autoFocus={!ex.name}
                              />
                            </div>
                            <div>
                              <label className="label">Reps / duración por ronda</label>
                              <input
                                className="input-field"
                                value={ex.repetitions}
                                onChange={e => updateExercise(ex._id, 'repetitions', e.target.value)}
                                placeholder="ej. 12 reps · 45 seg · hasta el fallo"
                              />
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
                                  <img
                                    src={ex.imageUrl}
                                    alt=""
                                    className="w-full max-h-36 object-contain rounded-xl bg-gray-100 dark:bg-gray-700"
                                    onError={() => updateExercise(ex._id, 'imageUrl', '')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateExercise(ex._id, 'imageUrl', '')}
                                    className="text-sm text-gray-400 hover:text-red-400 mt-1 block"
                                  >
                                    Quitar imagen
                                  </button>
                                </div>
                              )}
                              <ImageUpload
                                id={`img-${ex._id}`}
                                label="Subir imagen propia"
                                existingImageUrl={pendingImages[ex._id]?.preview}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(ex._id, f); }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex gap-2">
                  {!routine && (
                    <button type="button" onClick={() => setStep(1)} className="btn-secondary px-4">
                      ← Atrás
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={uploading || exercises.length === 0}
                    className="flex-1 btn-primary py-3 disabled:opacity-60"
                  >
                    {uploading ? 'Guardando...' : routine ? 'Guardar cambios' : 'Crear rutina'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default RoutineModal;
