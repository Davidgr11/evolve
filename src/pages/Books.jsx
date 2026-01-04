import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, X, BookOpen, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ConfirmModal from '../components/ConfirmModal';

const Books = () => {
  const { user } = useAuth();
  const [books, setBooks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [filterStatus, setFilterStatus] = useState('reading');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const [statsYearOffset, setStatsYearOffset] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, book: null });
  const [saving, setSaving] = useState(false);
  const booksPerPage = 10;

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const watchStatus = watch('status');

  useEffect(() => {
    loadBooks();
    loadStats();
  }, [user]);

  const loadBooks = async () => {
    try {
      const booksRef = collection(db, `users/${user.uid}/books`);
      const snapshot = await getDocs(booksRef);
      const booksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBooks(booksData);
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsRef = collection(db, `users/${user.uid}/bookStats`);
      const snapshot = await getDocs(statsRef);
      const statsData = {};
      snapshot.docs.forEach(doc => {
        statsData[doc.id] = doc.data().count || 0;
      });
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const handleAddBook = () => {
    setEditingBook(null);
    reset({
      title: '',
      author: '',
      category: '',
      status: 'interested',
      finishedDate: '',
      rating: ''
    });
    setShowModal(true);
  };

  const handleEditBook = (book) => {
    setEditingBook(book);
    reset({
      title: book.title,
      author: book.author || '',
      category: book.category || '',
      status: book.status,
      finishedDate: book.finishedDate || '',
      rating: book.rating || ''
    });
    setShowModal(true);
  };

  const handleSaveBook = async (data) => {
    if (saving) return;
    setSaving(true);
    try {
      const bookData = {
        ...data,
        finishedDate: data.status === 'read' ? data.finishedDate : null,
        rating: data.status === 'read' ? data.rating : null
      };

      if (editingBook) {
        // Check if status changed from non-read to read
        const wasNotRead = editingBook.status !== 'read';
        const isNowRead = data.status === 'read';

        await updateDoc(doc(db, `users/${user.uid}/books`, editingBook.id), bookData);

        // Update statistics if status changed to read
        if (wasNotRead && isNowRead && data.finishedDate) {
          const year = new Date(data.finishedDate).getFullYear();
          await updateBookStats(year, 1);
        } else if (!wasNotRead && !isNowRead && editingBook.finishedDate) {
          // Decrement if changed from read to something else
          const year = new Date(editingBook.finishedDate).getFullYear();
          await updateBookStats(year, -1);
        }

        toast.success('Book updated');
      } else {
        const newBookRef = await addDoc(collection(db, `users/${user.uid}/books`), bookData);

        // Update statistics if new book is marked as read
        if (data.status === 'read' && data.finishedDate) {
          const year = new Date(data.finishedDate).getFullYear();
          await updateBookStats(year, 1);
        }

        toast.success('Book added');
      }

      setShowModal(false);
      loadBooks();
      loadStats();
    } catch (error) {
      toast.error('Failed to save book');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const updateBookStats = async (year, increment) => {
    const statsRef = doc(db, `users/${user.uid}/bookStats`, year.toString());
    const statsDoc = await getDocs(collection(db, `users/${user.uid}/bookStats`));
    const yearDoc = statsDoc.docs.find(d => d.id === year.toString());

    if (yearDoc) {
      const currentCount = yearDoc.data().count || 0;
      await updateDoc(statsRef, { count: Math.max(0, currentCount + increment) });
    } else {
      await setDoc(statsRef, { count: Math.max(0, increment) });
    }
  };

  const handleDeleteBook = async (book) => {
    try {
      // Update statistics if deleting a read book
      if (book.status === 'read' && book.finishedDate) {
        const year = new Date(book.finishedDate).getFullYear();
        await updateBookStats(year, -1);
      }

      await deleteDoc(doc(db, `users/${user.uid}/books`, book.id));
      toast.success('Book deleted');
      loadBooks();
      loadStats();
    } catch (error) {
      toast.error('Failed to delete book');
      console.error(error);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      read: 'bg-green-100 text-green-800',
      reading: 'bg-blue-100 text-blue-800',
      'to read': 'bg-yellow-100 text-yellow-800',
      interested: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const currentYear = new Date().getFullYear();
  const booksReadThisYear = stats[currentYear] || 0;

  // Prepare chart data with navigation
  const chartData = [];
  const baseYear = currentYear - statsYearOffset;
  for (let i = 4; i >= 0; i--) {
    const year = baseYear - i;
    chartData.push({
      year: year.toString(),
      count: stats[year] || 0
    });
  }

  // Check if there are stats in previous years
  const hasOlderStats = Object.keys(stats).some(year => parseInt(year) < baseYear - 4);
  const hasNewerStats = statsYearOffset > 0;

  // Filter, search and sort books
  let filteredBooks = filterStatus === 'all'
    ? books
    : books.filter(book => book.status === filterStatus);

  // Apply search filter
  if (searchQuery) {
    filteredBooks = filteredBooks.filter(book =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (book.author && book.author.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }

  // Apply sorting
  filteredBooks.sort((a, b) => {
    if (sortBy === 'recent') {
      const dateA = a.finishedDate ? new Date(a.finishedDate) : new Date(0);
      const dateB = b.finishedDate ? new Date(b.finishedDate) : new Date(0);
      return dateB - dateA;
    } else if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    } else if (sortBy === 'rating') {
      const ratingA = a.rating ? parseInt(a.rating) : 0;
      const ratingB = b.rating ? parseInt(b.rating) : 0;
      return ratingB - ratingA;
    }
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(filteredBooks.length / booksPerPage);
  const startIndex = (currentPage - 1) * booksPerPage;
  const paginatedBooks = filteredBooks.slice(startIndex, startIndex + booksPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchQuery, sortBy]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading books...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Books</h1>
        <div className="flex items-center gap-4">
          <img
            src="/Evolve.svg"
            alt="Evolve"
            className="w-8 h-8"
          />
          <button onClick={handleAddBook} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Book
          </button>
        </div>
      </div>

      {/* Annual Statistics */}
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Books read in {currentYear}: <span className="text-primary-600 dark:text-primary-400">{booksReadThisYear}</span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setStatsYearOffset(prev => prev + 5)}
              disabled={!hasOlderStats}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title="View older years"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setStatsYearOffset(prev => Math.max(0, prev - 5))}
              disabled={!hasNewerStats}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title="View newer years"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {chartData.some(d => d.count > 0) && (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#14b8a6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {statsYearOffset > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Showing {baseYear - 4} - {baseYear}
          </p>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'read', 'reading', 'to read', 'interested'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filterStatus === status
                ? 'bg-primary-500 dark:bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="input-field sm:w-48"
        >
          <option value="recent">Most Recent</option>
          <option value="title">Title (A-Z)</option>
          <option value="rating">Highest Rating</option>
        </select>
      </div>

      {/* Books List */}
      {filteredBooks.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
            {searchQuery ? 'No books found' : 'No books yet'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {searchQuery ? 'Try a different search term' : 'Start tracking your reading journey'}
          </p>
          {!searchQuery && (
            <button onClick={handleAddBook} className="btn-primary">
              Add Book
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {startIndex + 1}-{Math.min(startIndex + booksPerPage, filteredBooks.length)} of {filteredBooks.length} books
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {paginatedBooks.map((book) => (
            <div key={book.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-1">
                    {book.title}
                  </h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(book.status)}`}>
                    {book.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditBook(book)}
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ isOpen: true, book })}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {book.author && (
                <p className="text-gray-700 dark:text-gray-300 text-sm mb-1">
                  <span className="font-medium">Author:</span> {book.author}
                </p>
              )}

              {book.category && (
                <p className="text-gray-700 dark:text-gray-300 text-sm mb-2">
                  <span className="font-medium">Category:</span> {book.category}
                </p>
              )}

              {book.finishedDate && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Finished: {new Date(book.finishedDate).toLocaleDateString()}
                </p>
              )}

              {book.rating && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Rating: {'⭐'.repeat(parseInt(book.rating))}
                </p>
              )}
            </div>
          ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Book Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingBook ? 'Edit Book' : 'Add Book'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(handleSaveBook)} className="space-y-4">
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  className="input-field"
                  {...register('title', { required: 'Title is required' })}
                />
                {errors.title && (
                  <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="label">Author</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter author name"
                  {...register('author')}
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  className="input-field"
                  {...register('category')}
                >
                  <option value="">Select a category</option>
                  <option value="Fiction">Fiction</option>
                  <option value="Non-Fiction">Non-Fiction</option>
                  <option value="Science Fiction & Fantasy">Science Fiction & Fantasy</option>
                  <option value="Mystery & Thriller">Mystery & Thriller</option>
                  <option value="Romance">Romance</option>
                  <option value="Biography & Memoir">Biography & Memoir</option>
                  <option value="Self-Help & Personal Development">Self-Help & Personal Development</option>
                  <option value="History">History</option>
                  <option value="Science & Technology">Science & Technology</option>
                  <option value="Business & Economics">Business & Economics</option>
                  <option value="Philosophy">Philosophy</option>
                  <option value="Psychology">Psychology</option>
                  <option value="Religion & Spirituality">Religion & Spirituality</option>
                  <option value="Health & Fitness">Health & Fitness</option>
                  <option value="Cookbooks & Food">Cookbooks & Food</option>
                  <option value="Travel">Travel</option>
                  <option value="Art & Photography">Art & Photography</option>
                  <option value="Poetry">Poetry</option>
                  <option value="True Crime">True Crime</option>
                  <option value="Sports">Sports</option>
                  <option value="Politics & Social Sciences">Politics & Social Sciences</option>
                  <option value="Horror">Horror</option>
                  <option value="Adventure">Adventure</option>
                  <option value="Children & Young Adult">Children & Young Adult</option>
                  <option value="Comics & Graphic Novels">Comics & Graphic Novels</option>
                </select>
              </div>

              <div>
                <label className="label">Status *</label>
                <select
                  className="input-field"
                  {...register('status', { required: true })}
                >
                  <option value="interested">Interested</option>
                  <option value="to read">To Read</option>
                  <option value="reading">Reading</option>
                  <option value="read">Read</option>
                </select>
              </div>

              {watchStatus === 'read' && (
                <>
                  <div>
                    <label className="label">Finished Date *</label>
                    <input
                      type="date"
                      className="input-field"
                      {...register('finishedDate', {
                        required: watchStatus === 'read' ? 'Date is required for read books' : false
                      })}
                    />
                    {errors.finishedDate && (
                      <p className="text-red-500 text-sm mt-1">{errors.finishedDate.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="label">Rating *</label>
                    <select
                      className="input-field"
                      {...register('rating', {
                        required: watchStatus === 'read' ? 'Rating is required for read books' : false
                      })}
                    >
                      <option value="">Select rating</option>
                      <option value="1">⭐ 1 - Poor</option>
                      <option value="2">⭐⭐ 2 - Fair</option>
                      <option value="3">⭐⭐⭐ 3 - Good</option>
                      <option value="4">⭐⭐⭐⭐ 4 - Very Good</option>
                      <option value="5">⭐⭐⭐⭐⭐ 5 - Excellent</option>
                    </select>
                    {errors.rating && (
                      <p className="text-red-500 text-sm mt-1">{errors.rating.message}</p>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, book: null })}
        onConfirm={() => handleDeleteBook(deleteConfirm.book)}
        title="Delete Book"
        message={`Are you sure you want to delete "${deleteConfirm.book?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />
    </div>
  );
};

export default Books;
