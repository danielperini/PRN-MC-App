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
    descricao: 'Paleta inspirada na Pampulha, Museu da Moda, MHAB e MIS.',
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
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#FF5C5C',
      '--cor-fundo-secundario': '#F5F5F5',
      '--cor-texto-secundario': '#6b7280',
      '--cor-borda-clara': '#e5e7eb',
    },
    preview: ['#2E6F95', '#7A1E2C', '#D9C6A5', '#5FA8D3'],
  },
  miro: {
    id: 'miro',
    nome: 'Tema Miro',
    descricao: 'Paleta moderna e colorida com azul primario, amarelo destaque e cores vibrantes.',
    vars: {
      '--cor-primaria': '#4262FF',
      '--cor-secundaria': '#FFD02F',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#FF5C5C',
      '--cor-fundo': '#FFFFFF',
      '--cor-fundo-secundario': '#F5F6FA',
      '--cor-texto': '#2B2D42',
      '--cor-texto-secundario': '#4A4D5C',
      '--cor-card': '#FFFFFF',
      '--cor-destaque': '#FF5C5C',
      '--cor-borda': '#E6E8F0',
      '--cor-borda-clara': '#E6E8F0',
      '--cor-nav': '#4262FF',
      '--cor-nav-texto': '#FFFFFF',
      '--cor-btn-primario': '#4262FF',
      '--cor-btn-primario-texto': '#FFFFFF',
      '--cor-btn-primario-hover': '#314BC2',
      '--cor-accent': '#FFD02F',
    },
    preview: ['#4262FF', '#FFD02F', '#2ECC71', '#FF5C5C'],
  },
  nuit: {
    id: 'nuit',
    nome: 'Tema Nuit',
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
