import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { db, storage } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { LogOut, User as UserIcon, Mail, Edit, Moon, Sun, X, Sparkles } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';
import ConfirmModal from '../components/ConfirmModal';

const Profile = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [motivationalQuote, setMotivationalQuote] = useState('');
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  const { register: registerQuote, handleSubmit: handleSubmitQuote, reset: resetQuote } = useForm();

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, `users/${user.uid}/settings`, 'profile'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.photoUrl) setProfilePhoto(data.photoUrl);
      }

      const quoteDoc = await getDoc(doc(db, `users/${user.uid}/settings`, 'motivationalQuote'));
      if (quoteDoc.exists()) {
        setMotivationalQuote(quoteDoc.data().quote || '');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleThemeToggle = async () => {
    await toggleTheme();
    toast.success(`Theme changed to ${theme === 'light' ? 'dark' : 'light'} mode`);
  };

  const handleSaveQuote = async (data) => {
    try {
      await setDoc(doc(db, `users/${user.uid}/settings`, 'motivationalQuote'), {
        quote: data.quote
      });
      setMotivationalQuote(data.quote);
      toast.success('Quote saved');
      setShowQuoteModal(false);
    } catch (error) {
      toast.error('Failed to save quote');
      console.error(error);
    }
  };

  const handlePhotoUpload = async () => {
    const fileInput = document.getElementById('profile-photo-input');
    const file = fileInput?.files?.[0];

    if (!file) {
      toast.error('Please select an image');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploading(true);

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);

      const timestamp = Date.now();
      const imagePath = `users/${user.uid}/profile/${timestamp}_${file.name}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, compressedFile);
      const photoUrl = await getDownloadURL(storageRef);

      await setDoc(doc(db, `users/${user.uid}/settings`, 'profile'), {
        photoUrl,
        imagePath
      }, { merge: true });

      setProfilePhoto(photoUrl);
      toast.success('Profile photo updated');
      setShowPhotoModal(false);
    } catch (error) {
      toast.error('Failed to upload photo');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out successfully');
      navigate('/');
    } catch (error) {
      toast.error('Failed to sign out');
      console.error(error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profile</h1>
        <img
          src="/Evolve.svg"
          alt="Evolve"
          className="w-8 h-8"
        />
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
              {profilePhoto || user?.photoURL ? (
                <img
                  src={profilePhoto || user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <UserIcon className="w-10 h-10 text-primary-600 dark:text-primary-400" />
              )}
            </div>
            <button
              onClick={() => setShowPhotoModal(true)}
              className="absolute bottom-0 right-0 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white p-1.5 rounded-full transition-colors"
            >
              <Edit className="w-3 h-3" />
            </button>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {user?.displayName || 'User'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <Mail className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Email</div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{user?.email}</div>
            </div>
          </div>

          {user?.displayName && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
              <UserIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Name</div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{user.displayName}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Motivational Quote</h3>
          <button
            onClick={() => {
              resetQuote({ quote: motivationalQuote });
              setShowQuoteModal(true);
            }}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
          >
            <Edit className="w-4 h-4 inline mr-1" />
            {motivationalQuote ? 'Edit' : 'Add'}
          </button>
        </div>

        {motivationalQuote ? (
          <div className="bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30 p-6 rounded-lg border border-primary-100 dark:border-primary-800">
            <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400 mb-2" />
            <p className="text-lg font-medium text-gray-800 dark:text-gray-200 italic">"{motivationalQuote}"</p>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg text-center border border-gray-200 dark:border-gray-600">
            <p className="text-gray-500 dark:text-gray-400 mb-2">Add a motivational quote to inspire your journey</p>
            <button
              onClick={() => {
                resetQuote({ quote: '' });
                setShowQuoteModal(true);
              }}
              className="btn-primary text-sm"
            >
              Add Quote
            </button>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Preferences</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Theme</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
              </div>
            </div>
          </div>
          <button
            onClick={handleThemeToggle}
            className="btn-secondary text-sm py-2 px-4"
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Account Actions</h3>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>

      <div className="mt-8 text-center text-gray-500 dark:text-gray-400 text-sm">
        <p>Evolve - Build the Life You Envision</p>
        <p className="mt-1">Version 1.19.8</p>
      </div>

      {/* Photo Upload Modal */}
      {showPhotoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Update Profile Photo</h3>
              <button
                onClick={() => setShowPhotoModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Profile Photo (max 2MB)</label>
                <ImageUpload
                  id="profile-photo-input"
                  disabled={uploading}
                  label="Upload your profile photo"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(false)}
                  className="btn-secondary flex-1"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePhotoUpload}
                  className="btn-primary flex-1"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Save Photo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Motivational Quote</h3>
              <button
                onClick={() => setShowQuoteModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitQuote(handleSaveQuote)} className="space-y-4">
              <div>
                <label className="label">Your Quote</label>
                <textarea
                  className="input-field"
                  rows="3"
                  placeholder="Enter a quote that motivates you..."
                  {...registerQuote('quote')}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowQuoteModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmColor="red"
      />
    </div>
  );
};

export default Profile;
