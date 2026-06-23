/**
 * centroCustoDinamico.js
 * Fonte única de verdade para centros de custo do app.
 * Combina lista fixa com centros de custo ativos do banco (via rubricas).
 * Use useCentrosCusto() em qualquer componente para obter a lista dinâmica.
 */

import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Lista base fixa (garante que sempre existam mesmo sem rubricas cadastradas)
export const CENTROS_CUSTO_BASE = [
  'MHAB',
  'MIS BH',
  'MUMO',
  'Geral/Transversal',
  'Coordenação',
  'Comunicação',
  'Educação',
  'Produção',
  'Administrativo-financeiro',
  'Noturno 2026',
  'Noturno Pampulha',
  'Publicações',
  'Consultorias',
  'Despesas Gerais',
];

/**
 * Hook que retorna a lista de centros de custo combinando
 * a lista base com os centros encontrados em rubricas ativas no banco.
 */
export function useCentrosCusto() {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-cc-dinamico'],
    queryFn: () => base44.entities.Rubrica.filter({ ativo: true }),
    staleTime: 5 * 60 * 1000,
  });

  const ccDoBanco = rubricas
    .map(r => r.centro_custo)
    .filter(Boolean);

  const todos = [...new Set([...CENTROS_CUSTO_BASE, ...ccDoBanco])];
  return todos.sort((a, b) => {
    // Mantém MHAB, MIS, MUMO no topo
    const ordem = ['MHAB', 'MIS BH', 'MUMO', 'Noturno 2026', 'Noturno Pampulha'];
    const ia = ordem.indexOf(a);
    const ib = ordem.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
}

/**
 * Retorna grupos/metas únicos ativos do banco.
 */
export function useGruposRubrica() {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-grupos-dinamico'],
    queryFn: () => base44.entities.Rubrica.filter({ ativo: true }),
    staleTime: 5 * 60 * 1000,
  });

  const grupos = rubricas.map(r => r.grupo).filter(Boolean);
  return [...new Set(grupos)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Retorna metas únicas ativas do banco.
 */
export function useMetasRubrica() {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-metas-dinamico'],
    queryFn: () => base44.entities.Rubrica.filter({ ativo: true }),
    staleTime: 5 * 60 * 1000,
  });

  const metas = rubricas.map(r => r.meta).filter(Boolean);
  return [...new Set(metas)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Centros de custo que pertencem aos Museus Pampulha (4º Aditivo).
 */
export const CC_PAMPULHA = ['Noturno Pampulha'];

/**
 * Centros de custo que pertencem ao Noturno nos Museus (3º Aditivo).
 */
export const CC_NOTURNO = ['Noturno 2026'];

/**
 * Centros de custo por museu fixo.
 */
export const CC_POR_MUSEU = {
  MHAB: ['MHAB'],
  MIS: ['MIS BH'],
  MUMO: ['MUMO'],
  NOTURNO: ['Noturno 2026'],
  PAMPULHA: ['Noturno Pampulha'],
};