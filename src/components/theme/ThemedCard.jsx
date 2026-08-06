import React from 'react';
import { useTheme } from '@/context/ThemeContext';

/**
 * Wrapper de card que aplica a borda esquerda de destaque (var(--cor-destaque))
 * quando o tema ativo é artístico (mondrian ou giacometti). Em outros temas
 * comporta-se como um div comum, herdando o className informado.
 *
 * O efeito visual é controlado por CSS (.themed-card) em src/index.css, o que
 * evita estilos inline e mantém os raios arredondados intactos.
 */
export default function ThemedCard({ as: Tag = 'div', className = '', children, ...props }) {
  const { themeId } = useTheme();
  const isArtistic = themeId === 'mondrian' || themeId === 'giacometti';
  const merged = isArtistic ? `themed-card ${className}`.trim() : className;
  return (
    <Tag className={merged} {...props}>
      {children}
    </Tag>
  );
}