import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, setDoc, getDoc
} from 'firebase/firestore';
import toast from '../utils/toast';
import {
  Plus, X, BookOpen, Search, Sparkles, Star,
  Loader2, RefreshCw, Trash2, Edit
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

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

// ─── Expertise levels ─────────────────────────────────────────────────────────
const LEVELS = [
  { min: 0,   max: 4,         name: 'Beginner',    icon: '🌱', color: 'text-green-500',  bg: 'bg-green-50  dark:bg-green-900/20'  },
  { min: 5,   max: 9,         name: 'Explorer',    icon: '🗺️',  color: 'text-blue-500',   bg: 'bg-blue-50   dark:bg-blue-900/20'   },
  { min: 10,  max: 19,        name: 'Reader',      icon: '📚', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { min: 20,  max: 34,        name: 'Enthusiast',  icon: '🔥', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  { min: 35,  max: 49,        name: 'Scholar',     icon: '🎓', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  { min: 50,  max: 74,        name: 'Sage',        icon: '🦉', color: 'text-amber-500',  bg: 'bg-amber-50  dark:bg-amber-900/20'  },
  { min: 75,  max: 99,        name: 'Master',      icon: '🏆', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { min: 100, max: Infinity,  name: 'Legend',      icon: '💫', color: 'text-pink-500',   bg: 'bg-pink-50   dark:bg-pink-900/20'   },
];

const getLevel = (count) => {
  const idx = LEVELS.findLastIndex(l => count >= l.min);
  const level = LEVELS[Math.max(0, idx)];
  const next = LEVELS[idx + 1] || null;
  const progress = next ? Math.round(((count - level.min) / (next.min - level.min)) * 100) : 100;
  return { level, levelIndex: idx + 1, next, progress };
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  read:       'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300',
  reading:    'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300',
  'to read':  'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300',
  interested: 'bg-gray-100   text-gray-600   dark:bg-gray-700      dark:text-gray-300',
};

const STATUS_DESC = {
  reading:    'Books you are currently reading',
  read:       'Books you have already finished',
  'to read':  'Books you own or have queued up next',
  interested: 'Books that caught your eye — on your radar',
};

// ─── BookCard ─────────────────────────────────────────────────────────────────
const BookCard = ({ book, onEdit, onDelete, onSummary }) => (
  <div className="group relative flex flex-col rounded-2xl overflow-hidden bg-white/60 dark:bg-gray-800/60 border border-white/60 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-shadow">
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
        <button onClick={() => onEdit(book)} className="p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white transition-colors" title="Edit">
          <Edit className="w-3.5 h-3.5" />
        </button>
        {book.status === 'read' && (
          <button onClick={() => onSummary(book)} className="p-2 rounded-full bg-white/90 text-blue-600 hover:bg-white transition-colors" title="AI Summary">
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => onDelete(book)} className="p-2 rounded-full bg-white/90 text-red-500 hover:bg-white transition-colors" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[book.status] || STATUS_COLOR.interested}`}>
        {book.status}
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

  // Single modal for all AI results
  const [aiModal, setAiModal] = useState(null);
  // null | { type: 'analysis', content: string }
  //       | { type: 'suggestions', items: array }
  //       | { type: 'summary', book: object, content: string, loading: bool }

  useEffect(() => { loadData(); }, [user]);
  useEffect(() => { setCurrentPage(1); }, [filterStatus, searchQuery, sortBy]);

  const loadData = async () => {
    try {
      const snap = await getDocs(collection(db, `users/${user.uid}/books`));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBooks(data);
      setUnmigrated(data.filter(b => !b.coverUrl && !b.coverFetched));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const readBooks = books.filter(b => b.status === 'read');
  const booksThisYear = readBooks.filter(b => b.finishedDate && new Date(b.finishedDate).getFullYear() === currentYear).length;
  const genreCounts = {};
  readBooks.forEach(b => { if (b.category) genreCounts[b.category] = (genreCounts[b.category] || 0) + 1; });
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const levelData = getLevel(readBooks.length);

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
    toast.success('Library updated!');
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
      if (results.length === 0) toast.error('No results found');
    } catch { toast.error('Search failed'); }
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
    if (!bookForm.title.trim()) { toast.error('Title is required'); return; }
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
        toast.success('Updated');
      } else {
        await addDoc(collection(db, `users/${user.uid}/books`), data);
        if (data.status === 'read' && data.finishedDate) await updateBookStats(new Date(data.finishedDate).getFullYear(), 1);
        toast.success('Book added');
      }
      setShowModal(false);
      loadData();
    } catch (err) { toast.error('Failed to save'); console.error(err); }
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
      toast.success('Deleted');
      loadData();
    } catch { toast.error('Failed to delete'); }
  };

  // ── AI ─────────────────────────────────────────────────────────────────────
  const getApiKey = () => {
    const k = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!k || k === 'your_claude_api_key_here') { toast.error('Add your Claude API key'); return null; }
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

  const handleAiSuggestions = async () => {
    if (!getApiKey()) return;
    const topRead = readBooks.filter(b => b.rating && parseInt(b.rating) >= 4).slice(0, 15)
      .map(b => `"${b.title}" by ${b.author || 'unknown'} (${b.category || 'general'}, ${b.rating}★)`);
    if (topRead.length === 0) { toast.error('Rate some read books first (4+ stars)'); return; }

    setAiModal({ type: 'suggestions', items: [], loading: true });
    try {
      const prompt = `Based on these books I loved:\n${topRead.join('\n')}\n\nSuggest 4 books I would likely enjoy. Reply in this exact format (no other text):\nTITLE: <title>\nAUTHOR: <author>\nREASON: <one sentence why I'd enjoy it>\n\nSeparate each book with a blank line.`;
      const text = await callClaude(prompt, 500);
      const items = [];
      for (const block of text.split('\n\n').filter(Boolean)) {
        const title = block.match(/TITLE:\s*(.+)/)?.[1]?.trim();
        const author = block.match(/AUTHOR:\s*(.+)/)?.[1]?.trim();
        const reason = block.match(/REASON:\s*(.+)/)?.[1]?.trim();
        if (title) items.push({ title, author: author || '', reason: reason || '' });
      }
      setAiModal({ type: 'suggestions', items, loading: false });
    } catch { toast.error('Failed to get suggestions'); setAiModal(null); }
  };

  const handleAiAnalysis = async () => {
    if (!getApiKey()) return;
    if (readBooks.length === 0) { toast.error('No read books to analyze'); return; }

    setAiModal({ type: 'analysis', content: '', loading: true });
    try {
      const yearCounts = {};
      readBooks.forEach(b => { if (b.finishedDate) { const y = new Date(b.finishedDate).getFullYear(); yearCounts[y] = (yearCounts[y] || 0) + 1; } });
      const prompt = `My reading stats:\n- Total read: ${readBooks.length}\n- This year (${currentYear}): ${booksThisYear}\n- By year: ${Object.entries(yearCounts).sort().map(([y, c]) => `${y}: ${c}`).join(', ')}\n- Top genres: ${Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, c]) => `${g} (${c})`).join(', ') || 'none'}\n\nGive 2-3 short, specific observations about my reading habits. Plain text only, no markdown.`;
      const text = await callClaude(prompt, 250);
      setAiModal({ type: 'analysis', content: text, loading: false });
    } catch { toast.error('Failed to analyze'); setAiModal(null); }
  };

  const handleAiSummary = async (book) => {
    if (!getApiKey()) return;
    setAiModal({ type: 'summary', book, content: '', loading: true });
    try {
      const prompt = `Give me a concise summary of the key takeaways and "golden keys" from the book "${book.title}"${book.author ? ` by ${book.author}` : ''}. Focus on the most actionable insights and memorable ideas a reader should remember. Structure it as: first a 1-sentence description of what the book is about, then 4-6 key ideas as short bullet points (use • as bullet). Plain text only, no markdown.`;
      const text = await callClaude(prompt, 400);
      setAiModal({ type: 'summary', book, content: text, loading: false });
    } catch { toast.error('Failed to generate summary'); setAiModal(null); }
  };

  const addSuggestionToList = async (suggestion) => {
    try {
      await addDoc(collection(db, `users/${user.uid}/books`), { title: suggestion.title, author: suggestion.author, status: 'interested', category: '', finishedDate: null, rating: null, coverUrl: '', googleBooksId: '' });
      toast.success('Added to library');
      loadData();
    } catch { toast.error('Failed to add'); }
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

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;

  return (
    <>
      <div className="space-y-8">

        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">{currentYear}</p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Books</h1>
          </div>
          <button onClick={openAddModal} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm">
            <Plus className="w-4 h-4" />
            Add book
          </button>
        </div>

        {/* Migration banner */}
        {unmigrated.length > 0 && !migrating && (
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{unmigrated.length} {unmigrated.length === 1 ? 'book' : 'books'} without cover</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Auto-fetch covers from Google Books in one click</p>
            </div>
            <button onClick={handleMigrate} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Fetch covers
            </button>
          </div>
        )}
        {migrating && (
          <div className="px-4 py-3 bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Fetching covers...</p>
              <p className="text-sm text-blue-500">{migrateProgress} / {unmigrated.length}</p>
            </div>
            <div className="h-1.5 bg-blue-100 dark:bg-blue-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${(migrateProgress / unmigrated.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Stats panel */}
        <div className="px-4 py-4 bg-white/60 dark:bg-gray-800/60 rounded-2xl border border-white/60 dark:border-gray-700/60 space-y-4">

          {/* Stats */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">{booksThisYear}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-wide">This year</p>
              </div>
              <div className="w-px bg-gray-100 dark:bg-gray-700" />
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">{readBooks.length}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-wide">Total read</p>
              </div>
            </div>
            {topGenre && (
              <div className="text-center pt-2 border-t border-gray-100 dark:border-gray-700/50">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{topGenre}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wide">Top genre · {genreCounts[topGenre]} books</p>
              </div>
            )}
          </div>

          {/* Reading level path */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Reading level</p>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l, i) => {
                const idx = levelData.levelIndex - 1; // 0-based current index
                const isPast = i < idx;
                const isCurrent = i === idx;
                const isFuture = i > idx;
                return (
                  <div
                    key={l.name}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      isCurrent
                        ? `${l.bg} ${l.color} ring-2 ring-offset-1 ring-current`
                        : isPast
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 line-through'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <span className={isFuture ? 'grayscale opacity-40' : ''}>{l.icon}</span>
                    <span>{l.name}</span>
                    {isPast && <span className="text-green-500 font-bold text-xs">✓</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
              {levelData.next
                ? <>{levelData.next.min - readBooks.length} books to reach <span className="font-semibold text-gray-600 dark:text-gray-300">{levelData.next.name} {levelData.next.icon}</span></>
                : '🎉 Maximum level reached'}
            </p>
          </div>

          {/* AI buttons */}
          <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-700/50">
            <button onClick={handleAiAnalysis} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-700 transition-colors text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Analyze stats
            </button>
            <button onClick={handleAiSuggestions} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-700 transition-colors text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Suggest books
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
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filterStatus === s ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          {STATUS_DESC[filterStatus] && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{STATUS_DESC[filterStatus]}</p>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search title or author..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-white/60 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="recent">Recent</option>
              <option value="title">A–Z</option>
              <option value="rating">Rating</option>
            </select>
          </div>
        </div>

        {/* Books grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">{searchQuery ? 'No books match your search' : 'No books here yet'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {paginated.map(book => (
                <BookCard key={book.id} book={book} onEdit={openEditModal} onDelete={(b) => setDeleteConfirm({ isOpen: true, book: b })} onSummary={handleAiSummary} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-4">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-white dark:hover:bg-gray-800 transition-colors">Prev</button>
                <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-white dark:hover:bg-gray-800 transition-colors">Next</button>
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
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{editingBook ? 'Edit Book' : 'Add Book'}</h3>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>

              {/* Google Books search */}
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">
                  {editingBook ? 'Search to change book' : 'Search book'}
                </label>
                <div className="flex gap-2">
                  <input type="text" value={gbQuery} onChange={e => setGbQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleGbSearch(); }} placeholder="Title or author..." className="flex-1 px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
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
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Title *</label>
                    <input type="text" value={bookForm.title} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} placeholder="Book title" className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Author</label>
                    <input type="text" value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} placeholder="Author name" className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                </div>
              )}

              {/* Status / Date / Rating */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">Status</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {['interested', 'to read', 'reading', 'read'].map(s => (
                      <button key={s} type="button" onClick={() => setBookForm(f => ({ ...f, status: s }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${bookForm.status === s ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {bookForm.status === 'read' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">Finished date</label>
                      <input type="date" value={bookForm.finishedDate} onChange={e => setBookForm(f => ({ ...f, finishedDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">Rating</label>
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
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="button" onClick={handleSaveBook} disabled={saving || !bookForm.title.trim()} className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving...' : 'Save'}</button>
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
                    {aiModal.type === 'summary' ? `Generating summary for "${aiModal.book.title}"...` : aiModal.type === 'suggestions' ? "Finding books you'll love..." : 'Analyzing your reading...'}
                  </p>
                </div>
              )}

              {/* Analysis */}
              {!aiModal.loading && aiModal.type === 'analysis' && (
                <>
                  <div className="flex justify-between items-center px-5 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Reading insights</h3>
                    <button onClick={() => setAiModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{aiModal.content}</p>
                  </div>
                </>
              )}

              {/* Suggestions */}
              {!aiModal.loading && aiModal.type === 'suggestions' && (
                <>
                  <div className="flex justify-between items-center px-5 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Suggested for you</h3>
                    <button onClick={() => setAiModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto space-y-3">
                    {aiModal.items.map((s, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 px-3 py-3 bg-white/50 dark:bg-gray-700/50 rounded-xl border border-white/60 dark:border-gray-600/60">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.title}</p>
                          {s.author && <p className="text-xs text-gray-400 dark:text-gray-500">{s.author}</p>}
                          {s.reason && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">{s.reason}</p>}
                        </div>
                        <button onClick={() => addSuggestionToList(s)} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>
                    ))}
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
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, book: null })}
        onConfirm={() => handleDeleteBook(deleteConfirm.book)}
        title="Delete Book"
        message={`Delete "${deleteConfirm.book?.title}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />
    </>
  );
};

export default Books;
