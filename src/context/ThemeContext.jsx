import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'museu_centro_tema';

export const THEMES = {
  atual: {
    id: 'atual',
    nome: 'Tema Atual',
    descricao: 'Esquema de cores minimalista original do sistema.',
    vars: {
      '--cor-primaria': '#111111',
      '--cor-secundaria': '#6b7280',
      '--cor-fundo': '#f8fafc',
      '--cor-texto': '#0f172a',
      '--cor-card': '#ffffff',
      '--cor-destaque': '#1e293b',
      '--cor-borda': '#e2e8f0',
      '--cor-nav': '#ffffff',
      '--cor-nav-texto': '#1e293b',
      '--cor-btn-primario': '#111111',
      '--cor-btn-primario-texto': '#ffffff',
      '--cor-btn-primario-hover': '#374151',
      '--cor-accent': '#3b82f6',
    },
    preview: ['#111111', '#6b7280', '#ffffff', '#f8fafc'],
  },
  museubh: {
    id: 'museubh',
    nome: 'Tema Museu BH',
    descricao: 'Paleta inspirada na Pampulha, Museu da Moda e MHAB.',
    vars: {
      '--cor-primaria': '#2E6F95',
      '--cor-secundaria': '#5FA8D3',
      '--cor-fundo': '#F5F5F5',
      '--cor-texto': '#111111',
      '--cor-card': '#ffffff',
      '--cor-destaque': '#7A1E2C',
      '--cor-borda': '#D9C6A5',
      '--cor-nav': '#2E6F95',
      '--cor-nav-texto': '#F5F5F5',
      '--cor-btn-primario': '#2E6F95',
      '--cor-btn-primario-texto': '#ffffff',
      '--cor-btn-primario-hover': '#1d5a7a',
      '--cor-accent': '#5FA8D3',
    },
    preview: ['#2E6F95', '#7A1E2C', '#D9C6A5', '#5FA8D3'],
  },
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem(THEME_KEY) || 'atual';
  });

  const applyTheme = (id) => {
    const theme = THEMES[id] || THEMES.atual;
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    // Mark body with theme class for CSS overrides
    document.body.setAttribute('data-theme', id);
  };

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const setTheme = (id) => {
    if (!THEMES[id]) return;
    localStorage.setItem(THEME_KEY, id);
    setThemeId(id);
  };

  return (
    <ThemeContext.Provider value={{ themeId, setTheme, themes: THEMES, currentTheme: THEMES[themeId] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}