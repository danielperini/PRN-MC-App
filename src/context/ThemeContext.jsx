import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'museu_centro_tema';

export const THEMES = {
  atual: {
    id: 'atual',
    nome: 'Viaduto das Artes',
    descricao: 'Paleta institucional escura do Viaduto das Artes.',
    vars: {
      '--cor-primaria': '#1A1A1A',
      '--cor-secundaria': '#6B1F2B',
      '--cor-sucesso': '#3F7D58',
      '--cor-alerta': '#A94442',
      '--cor-fundo': '#F3F0EB',
      '--cor-fundo-secundario': '#ECE6DE',
      '--cor-texto': '#111111',
      '--cor-texto-secundario': '#3F3F46',
      '--cor-card': '#FFFDF9',
      '--cor-card-secundario': '#F5EFE7',
      '--cor-destaque': '#6B1F2B',
      '--cor-borda': '#CFC5B8',
      '--cor-borda-clara': '#DDD2C4',
      '--cor-nav': '#111111',
      '--cor-nav-texto': '#FFFFFF',
      '--cor-btn-primario': '#6B1F2B',
      '--cor-btn-primario-texto': '#FFFFFF',
      '--cor-btn-primario-hover': '#521720',
      '--cor-accent': '#8B2332',
    },
    preview: ['#111111', '#6B1F2B', '#F3F0EB', '#FFFDF9'],
  },
  museubh: {
    id: 'museubh',
    nome: 'Museus Centro',
    descricao: 'Paleta institucional com sidebar vinho e fundo bege.',
    vars: {
      '--cor-primaria': '#7A1E2C',
      '--cor-secundaria': '#2E6F95',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#FF5C5C',
      '--cor-fundo': '#E8DDC8',
      '--cor-fundo-secundario': '#F2E8D6',
      '--cor-texto': '#111827',
      '--cor-texto-secundario': '#374151',
      '--cor-card': '#FFF9EE',
      '--cor-card-secundario': '#F6EFE3',
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
    preview: ['#7A1E2C', '#E8DDC8', '#FFF9EE', '#2E6F95'],
  },
  miro: {
    id: 'miro',
    nome: 'Museus BH',
    descricao: 'Paleta azul clara com textos pretos e sidebar escura.',
    vars: {
      '--cor-primaria': '#0B1F3A',
      '--cor-secundaria': '#5B9BE6',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#D72638',
      '--cor-fundo': '#D7EBFF',
      '--cor-fundo-secundario': '#EAF4FF',
      '--cor-texto': '#000000',
      '--cor-texto-secundario': '#1F2937',
      '--cor-card': '#F8FBFF',
      '--cor-card-secundario': '#EEF6FF',
      '--cor-destaque': '#0B1F3A',
      '--cor-borda': '#A9CAE8',
      '--cor-borda-clara': '#CFE2F5',
      '--cor-nav': '#0B1F3A',
      '--cor-nav-texto': '#FFFFFF',
      '--cor-btn-primario': '#0B1F3A',
      '--cor-btn-primario-texto': '#FFFFFF',
      '--cor-btn-primario-hover': '#08172C',
      '--cor-accent': '#5B9BE6',
    },
    preview: ['#0B1F3A', '#D7EBFF', '#5B9BE6', '#FFFFFF'],
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
