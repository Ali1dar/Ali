// src/utils/ThemeContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const lightTheme = {
  bg: '#f0f4f8', cardBg: '#ffffff', text: '#333333', subText: '#666666',
  primary: '#00796b', border: '#e0e0e0', accent: '#ff9800', chatBg: '#e5ddd5',
};
export const darkTheme = {
  bg: '#121212', cardBg: '#1e1e1e', text: '#e0e0e0', subText: '#a0a0a0',
  primary: '#14b8a6', border: '#333333', accent: '#ff9800', chatBg: '#111b21',
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('theme').then(v => { if (v === 'dark') setIsDark(true); });
  }, []);
  const toggle = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem('theme', next ? 'dark' : 'light');
  };
  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
