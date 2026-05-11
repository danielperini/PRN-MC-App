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
    descricao: 'Paleta institucional com azul, vinho, areia e fundos claros de alta leitura.',
    vars: {
      '--cor-primaria': '#2E6F95',
      '--cor-secundaria': '#5FA8D3',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#FF5C5C',
      '--cor-fundo': '#EAF3F8',
      '--cor-fundo-secundario': '#F6EFE3',
      '--cor-texto': '#111827',
      '--cor-texto-secundario': '#374151',
      '--cor-card': '#FFFFFF',
      '--cor-card-secundario': '#FFF8EA',
      '--cor-destaque': '#7A1E2C',
      '--cor-borda': '#D9C6A5',
      '--cor-borda-clara': '#E6D7BC',
      '--cor-nav': '#2E6F95',
      '--cor-nav-texto': '#FFFFFF',
      '--cor-btn-primario': '#2E6F95',
      '--cor-btn-primario-texto': '#FFFFFF',
      '--cor-btn-primario-hover': '#1D5574',
      '--cor-accent': '#D9C6A5',
    },
    preview: ['#2E6F95', '#7A1E2C', '#D9C6A5', '#EAF3F8'],
  },
  miro: {
    id: 'miro',
    nome: 'Museus BH',
    descricao: 'Paleta moderna com azul, amarelo e fundos claros vibrantes com contraste seguro.',
    vars: {
      '--cor-primaria': '#4262FF',
      '--cor-secundaria': '#FFD02F',
      '--cor-sucesso': '#2ECC71',
      '--cor-alerta': '#FF5C5C',
      '--cor-fundo': '#F5F6FA',
      '--cor-fundo-secundario': '#FFF7D6',
      '--cor-texto': '#1F2937',
      '--cor-texto-secundario': '#374151',
      '--cor-card': '#FFFFFF',
      '--cor-card-secundario': '#F0F3FF',
      '--cor-destaque': '#FF5C5C',
      '--cor-borda': '#DDE3FF',
      '--cor-borda-clara': '#E6E8F0',
      '--cor-nav': '#263BC4',
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
