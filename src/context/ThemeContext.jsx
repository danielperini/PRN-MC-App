import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'museu_centro_tema';

export const THEMES = {
  atual: {
    id: 'atual',
    nome: 'Viaduto das Artes',
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
    nome: 'Museus Centro',
    descricao: 'Paleta institucional com sidebar vinho, fundo bege/azul e leitura em alto contraste.',
    vars: {
      '--cor-primaria': '#7A1E2C',
      '--cor-secundaria': '#2E6F95',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#FF5C5C',
      '--cor-fundo': '#F6EFE3',
      '--cor-fundo-secundario': '#EAF3F8',
      '--cor-texto': '#111827',
      '--cor-texto-secundario': '#374151',
      '--cor-card': '#FFFFFF',
      '--cor-card-secundario': '#EAF3F8',
      '--cor-destaque': '#7A1E2C',
      '--cor-borda': '#D9C6A5',
      '--cor-borda-clara': '#E6D7BC',
      '--cor-nav': '#7A1E2C',
      '--cor-nav-texto': '#FFFFFF',
      '--cor-btn-primario': '#7A1E2C',
      '--cor-btn-primario-texto': '#FFFFFF',
      '--cor-btn-primario-hover': '#5E1621',
      '--cor-accent': '#2E6F95',
    },
    preview: ['#7A1E2C', '#F6EFE3', '#EAF3F8', '#2E6F95'],
  },
  miro: {
    id: 'miro',
    nome: 'Museus BH',
    descricao: 'Paleta em preto, branco e tons de azul inspirados na Pampulha, com alto contraste.',
    vars: {
      '--cor-primaria': '#0B1F3A',
      '--cor-secundaria': '#005A9C',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#D72638',
      '--cor-fundo': '#F7FAFC',
      '--cor-fundo-secundario': '#E6F0FA',
      '--cor-texto': '#0B0F14',
      '--cor-texto-secundario': '#334155',
      '--cor-card': '#FFFFFF',
      '--cor-card-secundario': '#EEF6FF',
      '--cor-destaque': '#003B73',
      '--cor-borda': '#B8D4F0',
      '--cor-borda-clara': '#D7E8F8',
      '--cor-nav': '#050505',
      '--cor-nav-texto': '#FFFFFF',
      '--cor-btn-primario': '#003B73',
      '--cor-btn-primario-texto': '#FFFFFF',
      '--cor-btn-primario-hover': '#00284D',
      '--cor-accent': '#3A8DDE',
    },
    preview: ['#050505', '#FFFFFF', '#003B73', '#3A8DDE'],
  },
  nuit: {
    id: 'nuit',
    nome: 'Noturno nos Museus',
    descricao: 'Tema escuro para uso noturno e economia de energia.',
    vars: {
      '--cor-primaria': '#ffffff',
      '--cor-secundaria': '#a1a1aa',
      '--cor-sucesso': '#22c55e',
      '--cor-alerta': '#f59e0b',
      '--cor-fundo': '#050505',
      '--cor-fundo-secundario': '#111111',
      '--cor-texto': '#f5f5f5',
      '--cor-texto-secundario': '#d4d4d8',
      '--cor-card': '#111111',
      '--cor-destaque': '#ffffff',
      '--cor-borda': '#27272a',
      '--cor-borda-clara': '#3f3f46',
      '--cor-nav': '#000000',
      '--cor-nav-texto': '#ffffff',
      '--cor-btn-primario': '#ffffff',
      '--cor-btn-primario-texto': '#000000',
      '--cor-btn-primario-hover': '#d4d4d8',
      '--cor-accent': '#60a5fa',
    },
    preview: ['#050505', '#111111', '#f5f5f5', '#60a5fa'],
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
    root.setAttribute('data-theme', id);
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
