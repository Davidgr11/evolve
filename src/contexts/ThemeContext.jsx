import { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

const APP_BG_COLORS = {
  light: { blue: '#c2dce8', purple: '#dcd4f0', arena: '#ede5d8', slate: '#dce0e8' },
  dark:  { blue: '#111827', purple: '#1a1127',  arena: '#1c1812', slate: '#12141a' },
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [colorTheme, setColorThemeState] = useState(() => localStorage.getItem('colorTheme') || 'blue');

  // Apply dark/light class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Apply color theme attribute + status bar meta tag
  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', colorTheme);
    localStorage.setItem('colorTheme', colorTheme);
    const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const color = APP_BG_COLORS[mode]?.[colorTheme] ?? '#c2dce8';
    let meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
  }, [colorTheme, theme]);

  // Load preferences from Firestore when user logs in
  useEffect(() => {
    if (user) loadFromFirestore();
  }, [user]);

  const loadFromFirestore = async () => {
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/settings`, 'profile'));
      if (snap.exists()) {
        const data = snap.data();
        if (data.theme && data.theme !== theme) setTheme(data.theme);
        if (data.colorTheme && data.colorTheme !== colorTheme) setColorThemeState(data.colorTheme);
      }
    } catch (err) {
      console.error('Failed to load theme:', err);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (user) {
      try { await setDoc(doc(db, `users/${user.uid}/settings`, 'profile'), { theme: newTheme }, { merge: true }); } catch {}
    }
  };

  const setColorTheme = async (color) => {
    setColorThemeState(color);
    if (user) {
      try { await setDoc(doc(db, `users/${user.uid}/settings`, 'profile'), { colorTheme: color }, { merge: true }); } catch {}
    }
  };

  const value = { theme, toggleTheme, colorTheme, setColorTheme };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
