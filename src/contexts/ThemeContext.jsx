import { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage immediately to prevent flash
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'light';
  });

  // Apply theme class to document on mount and when theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Save to localStorage
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load theme from Firestore when user logs in
  useEffect(() => {
    if (user) {
      loadThemeFromFirestore();
    }
  }, [user]);

  const loadThemeFromFirestore = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, `users/${user.uid}/settings`, 'profile'));
      if (settingsDoc.exists() && settingsDoc.data().theme) {
        const firestoreTheme = settingsDoc.data().theme;
        // Only update if different from current theme
        if (firestoreTheme !== theme) {
          setTheme(firestoreTheme);
        }
      }
    } catch (error) {
      console.error('Failed to load theme from Firestore:', error);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);

    // Save to Firestore if user is logged in
    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/settings`, 'profile'), {
          theme: newTheme
        }, { merge: true });
      } catch (error) {
        console.error('Failed to save theme to Firestore:', error);
      }
    }
  };

  const value = {
    theme,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
