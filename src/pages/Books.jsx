import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../utils/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, setDoc, getDoc,
} from 'firebase/firestore';
import toast from '../utils/toast';
import {
  Plus, X, BookOpen, Search, Sparkles, Star,
  Loader2, RefreshCw, Trash2, Edit, ChevronDown, ChevronUp,
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const LEARNING_EMOJIS = ['💡', '🎯', '📖', '🔬', '🎨', '💻', '🌍', '⚡', '🔑', '🧠', '🚀', '🎵'];
const getItemEmoji = (id) => LEARNING_EMOJIS[Number(id.slice(-3)) % LEARNING_EMOJIS.length];

const THEME_HEX = { blue: '#3b82f6', purple: '#8b5cf6', arena: '#9e7b5a', slate: '#64748b' };
const THEME_BG  = {
  blue:   'bg-blue-500   border-blue-500',
  purple: 'bg-purple-500 border-purple-500',
  arena:  'bg-amber-700  border-amber-700',
  slate:  'bg-slate-500  border-slate-500',
};

const STATUS_LABEL_ES = {
  reading:    'Leyendo',
  read:       'Leídos',
  'to read':  'Por leer',
  interested: 'Interesado',
};

// ─── Google Books API ─────────────────────────────────────────────────────────
const gbCache = {};

const searchGoogleBooks = async (query, retries = 3) => {
  if (!query.trim()) return [];
  const key = query.trim().toLowerCase();
  if (gbCache[key]) return gbCache[key];

  const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  const keyParam = apiKey ? `&key=${apiKey}` : '';
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&fields=items(id,volumeInfo(title,authors,categories,imageLinks))${keyParam}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      return [];
    }
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.items || []).map(item => ({
      googleId: item.id,
      title: item.volumeInfo?.title || '',
      author: item.volumeInfo?.authors?.[0] || '',
      category: item.volumeInfo?.categories?.[0] || '',
      coverUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace('http://', 'https://') || '',
    }));
    gbCache[key] = results;
    return results;
  }
  return [];
};

const fetchCoverForBook = async (book) => {
  try {
    const results = await searchGoogleBooks([book.title, book.author].filter(Boolean).join(' '));
    return results[0]?.coverUrl || null;
  } catch { return null; }
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  read:       'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300',
  reading:    'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300',
  'to read':  'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300',
  interested: 'bg-gray-100   text-gray-600   dark:bg-gray-700      dark:text-gray-300',
};

const STATUS_DESC = {
  reading:    'Libros que estás leyendo actualmente',
  read:       'Libros que ya terminaste',
  'to read':  'Libros que tienes en cola para leer',
  interested: 'Libros que llamaron tu atención — en tu radar',
};

// ─── BookCard ─────────────────────────────────────────────────────────────────
const BookCard = ({ book, onEdit, onDelete, onSummary, onSynopsis }) => (
  <div className="group flex flex-col rounded-2xl liquid-glass-panel hover:shadow-lg transition-shadow">
    <div className="relative aspect-[2/3] bg-gradient-to-br from-blue-100 to-purple-100 dark:from-gray-700 dark:to-gray-600 overflow-hidden">
      {book.coverUrl ? (
        <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-3xl font-bold text-gray-300 dark:text-gray-500">{book.title.charAt(0).toUpperCase()}</span>
        </div>
      )}
      {/* Hover actions */}
      <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button onClick={() => onEdit(book)} className="p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white transition-colors">
          <Edit className="w-3.5 h-3.5" />
        </button>
        {book.status === 'read' ? (
          <button onClick={() => onSummary(book)} className="p-2 rounded-full bg-white/90 text-blue-600 hover:bg-white transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => onSynopsis(book)} className="p-2 rounded-full bg-white/90 text-amber-500 hover:bg-white transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => onDelete(book)} className="p-2 rounded-full bg-white/90 text-red-500 hover:bg-white transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <span className={`absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[book.status] || STATUS_COLOR.interested}`}>
        {STATUS_LABEL_ES[book.status] || book.status}
      </span>
    </div>
    <div className="p-2 flex flex-col gap-0.5">
      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2">{book.title}</p>
      {book.author && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{book.author}</p>}
      {book.rating && (
        <div className="flex gap-0.5 mt-0.5">
          {[1,2,3,4,5].map(s => (
            <Star key={s} className={`w-2.5 h-2.5 ${parseInt(book.rating) >= s ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-600'}`} />
          ))}
        </div>
      )}
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const Books = () => {
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState('reading');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const booksPerPage = 20;

  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [bookForm, setBookForm] = useState({ title: '', author: '', category: '', status: 'interested', finishedDate: '', rating: '', coverUrl: '', googleBooksId: '' });
  const [saving, setSaving] = useState(false);

  const [gbQuery, setGbQuery] = useState('');
  const [gbResults, setGbResults] = useState([]);
  const [gbLoading, setGbLoading] = useState(false);
  const [gbSelected, setGbSelected] = useState(null);

  const [unmigrated, setUnmigrated] = useState([]);
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState(0);

  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, book: null });

  const [annualGoal, setAnnualGoal]         = useState(12);
  const [showGoalModal, setShowGoalModal]   = useState(false);
  const [goalInput, setGoalInput]           = useState('12');
  const [prevSuggestions, setPrevSuggestions] = useState([]);

  const [learningItems, setLearningItems]         = useState([]);
  const [learningInput, setLearningInput]         = useState('');
  const [learningEmoji, setLearningEmoji]         = useState(LEARNING_EMOJIS[0]);
  const [showAddLearningModal, setShowAddLearningModal] = useState(false);

  // Single modal for all AI results
  const [aiModal, setAiModal] = useState(null);

  useEffect(() => { loadData(); }, [user]);
  useEffect(() => { setCurrentPage(1); }, [filterStatus, searchQuery, sortBy]);

  const loadData = async () => {
    try {
      const [snap, goalSnap, menteSnap] = await Promise.all([
        getDocs(collection(db, `users/${user.uid}/books`)),
        getDoc(doc(db, `users/${user.uid}/data`, 'books')),
        getDoc(doc(db, `users/${user.uid}/mente`, 'data')),
      ]);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBooks(data);
      setUnmigrated(data.filter(b => !b.coverUrl && !b.coverFetched));
      if (goalSnap.exists() && goalSnap.data().annualGoal) {
        const g = goalSnap.data().annualGoal;
        setAnnualGoal(g);
        setGoalInput(String(g));
      }
      if (menteSnap.exists()) {
        setLearningItems(menteSnap.data().learningItems || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const saveLearningItemsToDb = async (items) => {
    try {
      await setDoc(doc(db, `users/${user.uid}/mente`, 'data'), { learningItems: items }, { merge: true });
    } catch { toast.error('Error al guardar'); }
  };

  const handleAddLearningItem = async () => {
    const name = learningInput.trim();
    if (!name) return;
    const newItem = { id: Date.now().toString(), name, emoji: learningEmoji, completed: false, createdAt: new Date().toISOString() };
    const updated = [...learningItems, newItem];
    setLearningItems(updated);
    setLearningInput('');
    setLearningEmoji(LEARNING_EMOJIS[0]);
    setShowAddLearningModal(false);
    await saveLearningItemsToDb(updated);
  };

  const handleToggleLearningItem = async (id) => {
    const updated = learningItems.map(i => i.id === id ? { ...i, completed: !i.completed } : i);
    setLearningItems(updated);
    await saveLearningItemsToDb(updated);
  };

  const handleDeleteLearningItem = async (id) => {
    const updated = learningItems.filter(i => i.id !== id);
    setLearningItems(updated);
    await saveLearningItemsToDb(updated);
  };

  const saveAnnualGoal = async (value) => {
    const n = Math.max(1, parseInt(value) || 12);
    setAnnualGoal(n);
    setGoalInput(String(n));
    setShowGoalModal(false);
    try {
      await setDoc(doc(db, `users/${user.uid}/data`, 'books'), { annualGoal: n }, { merge: true });
    } catch { /* silent */ }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const readBooks = books.filter(b => b.status === 'read');
  const booksThisYear = readBooks.filter(b => b.finishedDate && new Date(b.finishedDate).getFullYear() === currentYear).length;
  const genreCounts = {};
  readBooks.forEach(b => { if (b.category) genreCounts[b.category] = (genreCounts[b.category] || 0) + 1; });
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // ── Migration ─────────────────────────────────────────────────────────────
  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateProgress(0);
    const toMigrate = books.filter(b => !b.coverUrl && !b.coverFetched);
    let done = 0;
    for (const book of toMigrate) {
      const coverUrl = await fetchCoverForBook(book);
      await updateDoc(doc(db, `users/${user.uid}/books`, book.id), coverUrl ? { coverUrl, coverFetched: true } : { coverFetched: true });
      done++;
      setMigrateProgress(done);
      await new Promise(r => setTimeout(r, 1200));
    }
    setMigrating(false);
    toast.success('¡Portadas actualizadas!');
    await loadData();
  };

  // ── Google Books search ───────────────────────────────────────────────────
  const handleGbSearch = async () => {
    if (!gbQuery.trim()) return;
    setGbLoading(true);
    setGbResults([]);
    try {
      const results = await searchGoogleBooks(gbQuery);
      setGbResults(results);
      if (results.length === 0) toast.error('Sin resultados');
    } catch { toast.error('Error en la búsqueda'); }
    finally { setGbLoading(false); }
  };

  const handleSelectGbBook = (result) => {
    setGbSelected(result);
    setBookForm(f => ({ ...f, title: result.title, author: result.author, category: result.category, coverUrl: result.coverUrl, googleBooksId: result.googleId }));
    setGbResults([]);
    setGbQuery('');
  };

  const clearGbSelection = () => {
    setGbSelected(null);
    setBookForm(f => ({ ...f, title: '', author: '', category: '', coverUrl: '', googleBooksId: '' }));
  };

  // ── Add / Edit modal ──────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingBook(null);
    setGbSelected(null);
    setGbQuery('');
    setGbResults([]);
    setBookForm({ title: '', author: '', category: '', status: 'interested', finishedDate: '', rating: '', coverUrl: '', googleBooksId: '' });
    setShowModal(true);
  };

  const openEditModal = (book) => {
    setEditingBook(book);
    setGbSelected(book.title ? { coverUrl: book.coverUrl || '', title: book.title, author: book.author || '' } : null);
    setGbQuery('');
    setGbResults([]);
    setBookForm({
      title: book.title, author: book.author || '', category: book.category || '',
      status: book.status, finishedDate: book.finishedDate || '',
      rating: book.rating ? String(book.rating) : '', coverUrl: book.coverUrl || '', googleBooksId: book.googleBooksId || '',
    });
    setShowModal(true);
  };

  const handleSaveBook = async () => {
    if (!bookForm.title.trim()) { toast.error('El título es obligatorio'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const data = { ...bookForm, finishedDate: bookForm.status === 'read' ? bookForm.finishedDate : null, rating: bookForm.status === 'read' ? bookForm.rating : null };
      if (editingBook) {
        await updateDoc(doc(db, `users/${user.uid}/books`, editingBook.id), data);
        if (editingBook.status !== 'read' && data.status === 'read' && data.finishedDate)
          await updateBookStats(new Date(data.finishedDate).getFullYear(), 1);
        else if (editingBook.status === 'read' && data.status !== 'read' && editingBook.finishedDate)
          await updateBookStats(new Date(editingBook.finishedDate).getFullYear(), -1);
        toast.success('Libro actualizado');
      } else {
        await addDoc(collection(db, `users/${user.uid}/books`), data);
        if (data.status === 'read' && data.finishedDate) await updateBookStats(new Date(data.finishedDate).getFullYear(), 1);
        toast.success('Libro añadido');
      }
      setShowModal(false);
      loadData();
    } catch (err) { toast.error('Error al guardar'); console.error(err); }
    finally { setSaving(false); }
  };

  const updateBookStats = async (year, increment) => {
    const ref = doc(db, `users/${user.uid}/bookStats`, year.toString());
    const snap = await getDoc(ref);
    const current = snap.exists() ? (snap.data().count || 0) : 0;
    await setDoc(ref, { count: Math.max(0, current + increment) }, { merge: true });
  };

  const handleDeleteBook = async (book) => {
    try {
      if (book.status === 'read' && book.finishedDate) await updateBookStats(new Date(book.finishedDate).getFullYear(), -1);
      await deleteDoc(doc(db, `users/${user.uid}/books`, book.id));
      setDeleteConfirm({ isOpen: false, book: null });
      toast.success('Libro eliminado');
      loadData();
    } catch { toast.error('Error al eliminar'); }
  };

  // ── AI ─────────────────────────────────────────────────────────────────────
  const getApiKey = () => {
    const k = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!k || k === 'your_claude_api_key_here') { toast.error('Agrega tu API key de Claude'); return null; }
    return k;
  };

  const callClaude = async (prompt, maxTokens = 400) => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('no key');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.content[0].text;
  };

  const handleAiSuggestions = async (exclude = []) => {
    if (!getApiKey()) return;
    const topRead = readBooks.filter(b => b.rating && parseInt(b.rating) >= 4).slice(0, 15)
      .map(b => `"${b.title}" de ${b.author || 'desconocido'} (${b.category || 'general'}, ${b.rating}★)`);
    if (topRead.length === 0) { toast.error('Califica algunos libros leídos primero (4+ estrellas)'); return; }

    setAiModal({ type: 'suggestions', items: [], loading: true });
    try {
      const excludeStr = exclude.length > 0 ? `\nExcluye estos libros ya sugeridos: ${exclude.map(s => s.title).join(', ')}` : '';
      const prompt = `Basándote en estos libros que me encantaron:\n${topRead.join('\n')}${excludeStr}\n\nSugiere exactamente 4 libros: 2 en español y 2 en inglés. Usa este formato exacto (sin otro texto):\nTITLE: <título>\nAUTHOR: <autor>\nLANG: <ES o EN>\nREASON: <una oración en español de por qué me gustaría>\n\nSepara cada libro con una línea en blanco.`;
      const text = await callClaude(prompt, 600);
      const items = [];
      for (const block of text.split('\n\n').filter(Boolean)) {
        const title  = block.match(/TITLE:\s*(.+)/)?.[1]?.trim();
        const author = block.match(/AUTHOR:\s*(.+)/)?.[1]?.trim();
        const lang   = block.match(/LANG:\s*(.+)/)?.[1]?.trim();
        const reason = block.match(/REASON:\s*(.+)/)?.[1]?.trim();
        if (title) items.push({ title, author: author || '', lang: lang || '', reason: reason || '' });
      }
      setPrevSuggestions(items);
      setAiModal({ type: 'suggestions', items, loading: false });
    } catch { toast.error('Error al obtener sugerencias'); setAiModal(null); }
  };

  const handleGrowthAnalysis = async () => {
    if (!getApiKey()) return;
    setAiModal({ type: 'growth-analysis', content: '', loading: true });
    try {
      const completedItems = learningItems.filter(i => i.completed).map(i => i.name);
      const pendingItems   = learningItems.filter(i => !i.completed).map(i => i.name);
      const prompt = `Analiza mi progreso de crecimiento personal:

LIBROS: ${readBooks.length} leídos en total, ${booksThisYear} este año (meta: ${annualGoal}).
Géneros más leídos: ${Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g,c])=>`${g}(${c})`).join(', ') || 'sin datos'}

APRENDIZAJES: ${learningItems.length} temas totales
Completados: ${completedItems.length > 0 ? completedItems.join(', ') : 'ninguno'}
Pendientes: ${pendingItems.length > 0 ? pendingItems.join(', ') : 'ninguno'}

Responde directamente, sin títulos ni encabezados, en español. Exactamente 3 oraciones seguidas:
1) Qué va bien en mi crecimiento.
2) Qué falla o se estanca (sé específico y directo).
3) La acción concreta más importante que debería hacer esta semana.

Plain text, sin markdown, sin encabezados. Dirígete a mí en segunda persona.`;
      const text = await callClaude(prompt, 250);
      setAiModal({ type: 'growth-analysis', content: text, loading: false });
    } catch { toast.error('Error al analizar'); setAiModal(null); }
  };

  const handleAiSummary = async (book) => {
    if (!getApiKey()) return;
    setAiModal({ type: 'summary', book, content: '', loading: true });
    try {
      const prompt = `Dame un resumen conciso de las ideas clave y "llaves de oro" del libro "${book.title}"${book.author ? ` de ${book.author}` : ''}. Enfócate en los insights más accionables y memorables. Estructura: primero 1 oración sobre de qué trata el libro, luego 4-6 ideas clave como bullets cortos (usa • como bullet). Solo texto plano, sin markdown. IMPORTANTE: responde en el mismo idioma que el título del libro.`;
      const text = await callClaude(prompt, 400);
      setAiModal({ type: 'summary', book, content: text, loading: false });
    } catch { toast.error('Error al generar resumen'); setAiModal(null); }
  };

  const handleAiSynopsis = async (book) => {
    if (!getApiKey()) return;
    setAiModal({ type: 'synopsis', book, content: '', loading: true });
    try {
      const prompt = `Explícame el libro "${book.title}"${book.author ? ` de ${book.author}` : ''} como si lo tuviera en mi lista de lectura pero no recuerdo bien de qué trata. Cubre: de qué trata (su premisa central), algo sobre el autor y por qué es creíble en este tema, y por qué vale la pena leerlo. Máximo 3 párrafos cortos. Solo texto plano, sin markdown. IMPORTANTE: responde en el mismo idioma que el título del libro.`;
      const text = await callClaude(prompt, 350);
      setAiModal({ type: 'synopsis', book, content: text, loading: false });
    } catch { toast.error('Error al obtener sinopsis'); setAiModal(null); }
  };

  const addSuggestionToList = async (suggestion) => {
    try {
      await addDoc(collection(db, `users/${user.uid}/books`), { title: suggestion.title, author: suggestion.author, status: 'interested', category: '', finishedDate: null, rating: null, coverUrl: '', googleBooksId: '' });
      toast.success('Añadido a tu biblioteca');
      loadData();
    } catch { toast.error('Error al añadir'); }
  };

  // ── Filter / sort ─────────────────────────────────────────────────────────
  let filtered = books.filter(b => b.status === filterStatus);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(b => b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q)));
  }
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'recent') return new Date(b.finishedDate || 0) - new Date(a.finishedDate || 0);
    if (sortBy === 'title')  return a.title.localeCompare(b.title);
    if (sortBy === 'rating') return (parseInt(b.rating) || 0) - (parseInt(a.rating) || 0);
    return 0;
  });
  const totalPages = Math.ceil(filtered.length / booksPerPage);
  const paginated = filtered.slice((currentPage - 1) * booksPerPage, currentPage * booksPerPage);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Cargando...</div>;

  return (
    <>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Mente</h1>
          <button
            onClick={handleGrowthAnalysis}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Analizar crecimiento
          </button>
        </div>

        {/* Migration banner */}
        {unmigrated.length > 0 && !migrating && (
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{unmigrated.length} {unmigrated.length === 1 ? 'libro' : 'libros'} sin portada</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">Obtén las portadas automáticamente desde Google Books</p>
            </div>
            <button onClick={handleMigrate} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Obtener portadas
            </button>
          </div>
        )}
        {migrating && (
          <div className="px-4 py-3 bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Obteniendo portadas...</p>
              <p className="text-sm text-blue-500">{migrateProgress} / {unmigrated.length}</p>
            </div>
            <div className="h-1.5 bg-blue-100 dark:bg-blue-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${(migrateProgress / unmigrated.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* ── Aprendizajes ── */}
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Aprendizajes</p>

        <div className="liquid-glass-panel rounded-2xl p-4">
          {/* Header: stat + add button */}
          {(() => {
            const completedCount = learningItems.filter(i => i.completed).length;
            const total = learningItems.length;
            const allDone = total > 0 && completedCount >= total;
            const themeHex = THEME_HEX[colorTheme] ?? '#3b82f6';
            return (
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-4xl font-bold leading-none" style={{ color: themeHex }}>
                      {completedCount}
                    </span>
                    <span className="text-lg text-gray-400 dark:text-gray-500 mb-0.5">
                      / {total} completados
                    </span>
                    {allDone && total > 0 && <span className="text-sm mb-0.5">🎉</span>}
                  </div>
                  {total > 0 && (
                    <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-36">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, completedCount / total * 100)}%`, backgroundColor: themeHex }}
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowAddLearningModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm flex-shrink-0 mt-1"
                >
                  <Plus className="w-4 h-4" />
                  Añadir
                </button>
              </div>
            );
          })()}

          {/* Items list — max 2 visible, scroll for rest */}
          {learningItems.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-1">
              Añade los temas que quieres aprender este año
            </p>
          ) : (
            <div className="max-h-[92px] overflow-y-auto space-y-1 pr-0.5">
              {learningItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                  <span className="text-base leading-none flex-shrink-0">{item.emoji || getItemEmoji(item.id)}</span>
                  <button
                    onClick={() => handleToggleLearningItem(item.id)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      item.completed
                        ? `${THEME_BG[colorTheme] || 'bg-blue-500 border-blue-500'}`
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {item.completed && <span className="text-white text-xs leading-none">✓</span>}
                  </button>
                  <span className={`flex-1 text-sm min-w-0 truncate ${item.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                    {item.name}
                  </span>
                  <button
                    onClick={() => handleDeleteLearningItem(item.id)}
                    className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Libros ── */}
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Libros</p>
          <button onClick={openAddModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm">
            <Plus className="w-4 h-4" />
            Añadir libro
          </button>
        </div>

        {/* Stats panel */}
        <div className="px-4 py-4 liquid-glass-panel rounded-2xl space-y-4">
          <div className="space-y-4">
            {/* Annual goal */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Meta de lectura {currentYear}</span>
                <button onClick={() => { setGoalInput(String(annualGoal)); setShowGoalModal(true); }} className="text-xs text-blue-500 dark:text-blue-400 font-semibold">
                  Editar meta
                </button>
              </div>
              {(() => {
                const hex = THEME_HEX[colorTheme] ?? '#3b82f6';
                return (
                  <>
                    <div className="flex items-end gap-3 mb-2">
                      <span className="text-4xl font-bold leading-none" style={{ color: hex }}>{booksThisYear}</span>
                      <span className="text-lg text-gray-400 dark:text-gray-500 mb-0.5">/ {annualGoal} libros</span>
                      {booksThisYear >= annualGoal && <span className="text-sm mb-0.5">🎉</span>}
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (booksThisYear / annualGoal) * 100)}%`, backgroundColor: hex }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-3 pt-1">
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{readBooks.length}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-wide">Total leídos</p>
              </div>
              {topGenre && (
                <>
                  <div className="w-px bg-gray-100 dark:bg-gray-700" />
                  <div className="flex-1 text-center">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-tight">{topGenre}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-wide">Género top</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* AI suggestions button */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50">
            <button onClick={() => handleAiSuggestions([])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-700 transition-colors text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Sugerencias de libros
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1">
            {['reading', 'read', 'to read', 'interested'].map(s => {
              const count = books.filter(b => b.status === s).length;
              return (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filterStatus === s ? 'bg-blue-500 text-white' : 'bg-white/60 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
                  }`}
                >
                  {STATUS_LABEL_ES[s] || s}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filterStatus === s ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          {STATUS_DESC[filterStatus] && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">{STATUS_DESC[filterStatus]}</p>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar título o autor..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="recent">Reciente</option>
              <option value="title">A–Z</option>
              <option value="rating">Calificación</option>
            </select>
          </div>
        </div>

        {/* Books grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">{searchQuery ? 'Sin resultados para tu búsqueda' : 'Sin libros aquí aún'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {paginated.map(book => (
                <BookCard key={book.id} book={book} onEdit={openEditModal} onDelete={(b) => setDeleteConfirm({ isOpen: true, book: b })} onSummary={handleAiSummary} onSynopsis={handleAiSynopsis} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-4">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-white dark:hover:bg-gray-800 transition-colors">Anterior</button>
                <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-white dark:hover:bg-gray-800 transition-colors">Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={() => setShowModal(false)}>
          <div className="flex items-center justify-center h-full px-4 pb-20">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{editingBook ? 'Editar libro' : 'Añadir libro'}</h3>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>

              {/* Google Books search */}
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">
                  {editingBook ? 'Buscar para cambiar libro' : 'Buscar libro'}
                </label>
                <div className="flex gap-2">
                  <input type="text" value={gbQuery} onChange={e => setGbQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleGbSearch(); }} placeholder="Título o autor..." className="flex-1 px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <button onClick={handleGbSearch} disabled={gbLoading || !gbQuery.trim()} className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500 text-white disabled:opacity-50 flex-shrink-0">
                    {gbLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
                {gbResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-52 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 p-1">
                    {gbResults.map((r, i) => (
                      <button key={i} onClick={() => handleSelectGbBook(r)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors">
                        {r.coverUrl ? (
                          <img src={r.coverUrl} alt="" className="w-8 h-11 object-cover rounded flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-11 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0"><BookOpen className="w-4 h-4 text-gray-300" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</p>
                          <p className="text-xs text-gray-400 truncate">{r.author}</p>
                          {r.category && <p className="text-xs text-gray-300 dark:text-gray-600 truncate">{r.category}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected book or manual fields */}
              {gbSelected ? (
                <div className="flex items-center gap-3 mb-4 px-3 py-2.5 bg-blue-50/60 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  {gbSelected.coverUrl && <img src={gbSelected.coverUrl} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{gbSelected.title}</p>
                    {gbSelected.author && <p className="text-xs text-gray-400">{gbSelected.author}</p>}
                  </div>
                  <button onClick={clearGbSelection} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Título *</label>
                    <input type="text" value={bookForm.title} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} placeholder="Título del libro" className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Autor</label>
                    <input type="text" value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} placeholder="Nombre del autor" className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                </div>
              )}

              {/* Status / Date / Rating */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">Estado</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { value: 'interested', label: 'Interesado' },
                      { value: 'to read',    label: 'Por leer'   },
                      { value: 'reading',    label: 'Leyendo'    },
                      { value: 'read',       label: 'Leído'      },
                    ].map(s => (
                      <button key={s.value} type="button" onClick={() => setBookForm(f => ({ ...f, status: s.value }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${bookForm.status === s.value ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {bookForm.status === 'read' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Fecha de finalización</label>
                      <input type="date" value={bookForm.finishedDate} onChange={e => setBookForm(f => ({ ...f, finishedDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">Calificación</label>
                      <div className="flex gap-2">
                        {[1,2,3,4,5].map(r => (
                          <button key={r} type="button" onClick={() => setBookForm(f => ({ ...f, rating: r.toString() }))} className="transition-transform hover:scale-110 active:scale-95">
                            <Star className={`w-7 h-7 ${parseInt(bookForm.rating) >= r ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-600'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="button" onClick={handleSaveBook} disabled={saving || !bookForm.title.trim()} className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add learning item modal ── */}
      {showAddLearningModal && (
        <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={() => { setShowAddLearningModal(false); setLearningInput(''); setLearningEmoji(LEARNING_EMOJIS[0]); }}>
          <div className="flex items-center justify-center h-full px-4 pb-20">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Nuevo aprendizaje</h3>
                <button onClick={() => { setShowAddLearningModal(false); setLearningInput(''); setLearningEmoji(LEARNING_EMOJIS[0]); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Un tema, habilidad o área que quieres dominar este año
              </p>

              {/* Emoji picker */}
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Ícono</p>
              <div className="grid grid-cols-6 gap-1.5 mb-4">
                {LEARNING_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => setLearningEmoji(e)}
                    className={`text-xl py-1.5 rounded-xl transition-all ${learningEmoji === e ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400 scale-110' : 'bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>

              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Tema</p>
              <input
                type="text"
                autoFocus
                className="input-field mb-4"
                value={learningInput}
                onChange={e => setLearningInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddLearningItem();
                  if (e.key === 'Escape') { setShowAddLearningModal(false); setLearningInput(''); setLearningEmoji(LEARNING_EMOJIS[0]); }
                }}
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowAddLearningModal(false); setLearningInput(''); setLearningEmoji(LEARNING_EMOJIS[0]); }} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleAddLearningItem} disabled={!learningInput.trim()} className="btn-primary flex-1 disabled:opacity-50">Añadir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Modal ── */}
      {aiModal && (
        <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={() => !aiModal.loading && setAiModal(null)}>
          <div className="flex items-center justify-center h-full px-4 pb-20">
            <div
              className="liquid-glass-panel rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(80vh - 5rem)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Loading state */}
              {aiModal.loading && (
                <div className="flex flex-col items-center py-12 gap-3 px-5">
                  <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    {aiModal.type === 'summary' ? `Generando resumen de "${aiModal.book?.title}"...`
                      : aiModal.type === 'synopsis' ? `Buscando información de "${aiModal.book?.title}"...`
                      : aiModal.type === 'suggestions' ? 'Buscando libros que te van a gustar...'
                      : aiModal.type === 'growth-analysis' ? 'Analizando tu crecimiento...'
                      : 'Analizando...'}
                  </p>
                </div>
              )}

              {/* Growth analysis */}
              {!aiModal.loading && aiModal.type === 'growth-analysis' && (
                <>
                  <div className="flex justify-between items-center px-5 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Análisis de crecimiento</h3>
                    <button onClick={() => setAiModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed text-justify">{aiModal.content}</p>
                  </div>
                </>
              )}

              {/* Suggestions */}
              {!aiModal.loading && aiModal.type === 'suggestions' && (
                <>
                  <div className="flex justify-between items-center px-5 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Sugerencias para ti</h3>
                    <button onClick={() => setAiModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto space-y-3">
                    {aiModal.items.map((s, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 px-3 py-3 liquid-glass-panel rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{s.title}</p>
                            {s.lang && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${s.lang === 'ES' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>{s.lang}</span>}
                          </div>
                          {s.author && <p className="text-xs text-gray-400 dark:text-gray-500">{s.author}</p>}
                          {s.reason && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">{s.reason}</p>}
                        </div>
                        <button onClick={() => addSuggestionToList(s)} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                          <Plus className="w-3 h-3" />
                          Añadir
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => handleAiSuggestions(prevSuggestions)}
                      className="w-full py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Otras sugerencias
                    </button>
                  </div>
                </>
              )}

              {/* Summary */}
              {!aiModal.loading && aiModal.type === 'summary' && (
                <>
                  <div className="flex justify-between items-start px-5 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700/50 gap-3">
                    <div className="flex items-start gap-3">
                      {aiModal.book.coverUrl && <img src={aiModal.book.coverUrl} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />}
                      <div>
                        <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight">{aiModal.book.title}</h3>
                        {aiModal.book.author && <p className="text-xs text-gray-400 mt-0.5">{aiModal.book.author}</p>}
                      </div>
                    </div>
                    <button onClick={() => setAiModal(null)} className="flex-shrink-0"><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{aiModal.content}</p>
                  </div>
                </>
              )}

              {/* Synopsis */}
              {!aiModal.loading && aiModal.type === 'synopsis' && (
                <>
                  <div className="flex justify-between items-start px-5 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700/50 gap-3">
                    <div className="flex items-start gap-3">
                      {aiModal.book.coverUrl && <img src={aiModal.book.coverUrl} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />}
                      <div>
                        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">¿De qué trata?</p>
                        <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight">{aiModal.book.title}</h3>
                        {aiModal.book.author && <p className="text-xs text-gray-400 mt-0.5">{aiModal.book.author}</p>}
                      </div>
                    </div>
                    <button onClick={() => setAiModal(null)} className="flex-shrink-0"><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{aiModal.content}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Annual goal modal */}
      {showGoalModal && (
        <div className="fixed z-50 liquid-glass-overlay" style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }} onClick={() => setShowGoalModal(false)}>
          <div className="flex items-center justify-center h-full px-4 pb-20">
            <div className="liquid-glass-panel rounded-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Meta de lectura {currentYear}</h3>
                <button onClick={() => setShowGoalModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">¿Cuántos libros quieres leer este año?</p>
              <input
                type="number"
                className="input-field text-center text-2xl font-bold mb-4"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveAnnualGoal(goalInput)}
                autoFocus
                min="1"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowGoalModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => saveAnnualGoal(goalInput)} className="btn-primary flex-1">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, book: null })}
        onConfirm={() => handleDeleteBook(deleteConfirm.book)}
        title="Eliminar libro"
        message={`¿Eliminar "${deleteConfirm.book?.title}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmColor="red"
      />
    </>
  );
};

export default Books;
