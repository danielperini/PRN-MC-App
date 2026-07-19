/**
 * METAS OFICIAIS DO PROJETO — 3º ADITIVO
 * Fonte de verdade única para todos os formulários da plataforma.
 * IDs são os IDs reais da entidade ProjectMeta no banco.
 *
 * Use loadMetasProjeto() para buscar do banco em tempo de execução.
 * O METAS_PROJETO_FALLBACK é usado enquanto carrega ou em caso de erro.
 */

export const METAS_PROJETO_FALLBACK = [
  { id: '6a32aead6201158ef021b368', label: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação' },
  { id: '6a32aead6201158ef021b369', label: '3 - Realizar manutenção de rotina nas exposições dos três museus: MUMO, MIS e MHAB' },
  { id: '6a3b2138ef98002fd208a1a3', label: '5 - Realizar no mínimo 60 ações educativas' },
  { id: '6a3b2138c4f755b4bd2dbfbb', label: '6 - Realizar no mínimo 36 ações culturais' },
  { id: '6a3b2139320bc81bec765070', label: '9 - Realizar uma exposição e evento de abertura no MIS' },
  { id: '6a32aead6201158ef021b36b', label: '10 - Realizar 18 mostras de baixa ou média complexidade nos museus' },
  { id: '6a32aead6201158ef021b36c', label: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus' },
  { id: '6a3b2139f2e7a20d401b0e49', label: '12 - Contratação de pesquisa, identidade visual, projeto curatorial e expográfico para MHAB' },
  { id: '6a3b213add810104d6080f35', label: '13 - Contratação de pesquisa, identidade visual, projeto curatorial e expográfico para MUMO' },
  { id: '6a32aead6201158ef021b36d', label: '14 - Dispositivos acessíveis' },
  { id: '6a32aead6201158ef021b36e', label: '16 - 101 diárias de educador' },
  { id: '6a32aead6201158ef021b36f', label: '17 - Publicações' },
  { id: '6a32aead6201158ef021b370', label: '18 - Custeios para atividades educativas contínuas' },
  { id: '6a3b213a42e432b90cbcafc7', label: '19 - Realizar a atividade "Presente de Iemanjá"' },
  { id: '6a32aead6201158ef021b371', label: '20 - Realizar 30 ações educativas e/ou culturais' },
  { id: '6a32aead6201158ef021b372', label: '21 - Realizar uma exposição e evento de abertura no Museu da Moda' },
  { id: '6a32aead6201158ef021b373', label: '22 - Contratar serviços de consultoria para a execução do projeto' },
  { id: '6a32aead6201158ef021b374', label: '23 - Despesas Gerais' },
  { id: '6a32aead6201158ef021b375', label: '24 - Emenda Parlamentar' },
  { id: '6a32aead6201158ef021b376', label: '25 - Outras Ações' },
  { id: '6a32aead6201158ef021b377', label: 'Meta de comunicação institucional' },
  { id: '6a32aead6201158ef021b378', label: 'Rotina' },
  { id: '6a32aead6201158ef021b379', label: 'Extra' },
  { id: '6a32aead6201158ef021b37a', label: 'Formação/Diversidade' },
  { id: '6a3c0b9bfa079f5914d83253', label: '11A - Noturno 2026' },
  { id: '6a3c0b9bfa079f5914d83254', label: '11B - Noturno Pampulha' },
];

// Para compatibilidade com código existente
export const METAS_PROJETO = METAS_PROJETO_FALLBACK;
export const METAS_IDS = METAS_PROJETO_FALLBACK.map((m) => m.id);
export const SET_METAS_OFICIAIS = new Set(METAS_IDS);

/** Retorna o label legível para um id de meta */
export function getMetaLabel(metaId) {
  const meta = METAS_PROJETO_FALLBACK.find((m) => m.id === metaId);
  return meta?.label ?? metaId ?? '';
}