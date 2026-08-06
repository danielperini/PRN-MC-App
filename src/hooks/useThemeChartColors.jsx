import { useTheme } from '@/context/ThemeContext';

// Paletas artísticas para séries de gráficos Recharts.
const PALETAS = {
  mondrian: ['#DD0100', '#FAC901', '#225095', '#1A1A1A', '#FFFFFF'],
  giacometti: ['#C8A96E', '#7A7A78', '#9C6B4A', '#2C2C2A', '#BEB098'],
};

// Paleta neutra usada pelos demais temas.
const NEUTRA = ['#1A1A1A', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'];

/**
 * Hook que retorna as cores de série para gráficos conforme o tema ativo.
 * Temas artísticos (mondrian, giacometti) usam paletas dedicadas; os demais
 * usam paleta neutra. Também expõe cores por papel semântico.
 */
export function useThemeChartColors() {
  const { themeId } = useTheme();
  const isArtistic = themeId === 'mondrian' || themeId === 'giacometti';
  const colors = isArtistic && PALETAS[themeId] ? PALETAS[themeId] : NEUTRA;
  return {
    colors,
    isArtistic,
    primary: colors[0],
    secondary: colors[1],
    tertiary: colors[2],
    quaternary: colors[3],
    neutral: colors[4],
  };
}

export default useThemeChartColors;