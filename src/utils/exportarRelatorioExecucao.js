/**
 * Utilitário unificado de exportação do Relatório de Execução do Objeto.
 * Usado por RelatorioExecucaoObjeto.jsx e RevisaoFinalDialog.jsx.
 *
 * Garante:
 * - Preparação de fotos com limites (máx 2/atividade, 5/seção)
 * - Deduplicação por URL
 * - Validação de URLs antes de inserir no jsPDF
 * - Geração sequencial das 3 partes com delay entre elas
 * - Event loop liberado entre partes
 * - Progresso granular via callback
 * - Sem valores hardcoded de público
 */

import { base44 } from '@/api/base44Client';
import { exportarRelatorioExecucaoPDF } from '@/components/relatorio/ExportarRelatorioExecucaoPDF';

const MAX_FOTOS_POR_ATIVIDADE = 2;
const MAX_FOTOS_POR_SECAO = 5;
const MAX_FOTOS_GALERIA = 60;
const DELAY_ENTRE_PARTES_MS = 400;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function urlValida(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 10) return false;
  if (!url.startsWith('http')) return false;
  return true;
}

function deduplicarFotos(fotos) {
  const vistas = new Set();
  return fotos.filter(f => {
    const url = f.file_url || f.url || '';
    const base = url.split('?')[0];
    if (!base || vistas.has(base)) return false;
    vistas.add(base);
    return true;
  });
}

/**
 * Prepara o objeto de relatório com fotos filtradas e deduplicadas.
 * Não busca 300 fotos indiscriminadamente — filtra por período e museu.
 */
export async function prepararRelatorioParaExportacao(relatorio, form = {}) {
  const dataInicio = form.data_inicio || relatorio.data_inicio || '';
  const dataFim = form.data_fim || relatorio.data_fim || '';
  const filtroMuseu = form.filtro_museu || relatorio.filtro_museu || 'todos';

  let fotosGaleria = Array.isArray(relatorio._fotos_galeria) ? [...relatorio._fotos_galeria] : [];
  let atividadesComFotos = Array.isArray(relatorio._atividades_com_fotos) ? [...relatorio._atividades_com_fotos] : [];

  // Só busca fotos extras se estiver muito escasso
  if (fotosGaleria.length < 5) {
    try {
      const query = { galeria_oculta: false };
      if (filtroMuseu && filtroMuseu !== 'todos') query.museu = filtroMuseu;

      const reportPhotos = await base44.entities.ReportPhoto.filter(query, '-created_date', 80);
      const urlsExistentes = new Set(fotosGaleria.map(f => (f.file_url || f.url || '').split('?')[0]));

      const novas = (reportPhotos || [])
        .filter(p => urlValida(p.file_url) && !urlsExistentes.has(p.file_url.split('?')[0]))
        .map(p => ({
          file_url: p.file_url,
          url: p.file_url,
          legenda: p.legenda || p.caption || p.file_name || '',
          autor: p.author || p.autor || 'Registro do Período',
          atividade_nome: p.museu || 'Registro do Período',
          museu: p.museu || '',
          created_date: p.created_date,
        }));

      fotosGaleria = [...fotosGaleria, ...novas];
    } catch (_) {}
  }

  // Busca atividades do período se não vieram pré-carregadas
  if (atividadesComFotos.length === 0 && dataInicio && dataFim) {
    try {
      const query = { data_realizacao: { $gte: dataInicio, $lte: dataFim } };
      const ativs = await base44.entities.Activity.filter(query, '-data_realizacao', 50);
      atividadesComFotos = (ativs || [])
        .filter(a => Array.isArray(a.fotos) && a.fotos.some(f => urlValida(f.file_url || f.url)))
        .map(a => ({
          id: a.id,
          titulo: a.titulo || '',
          data: a.data_realizacao || a.data_inicio || '',
          museu: a.museu || a.centro_custo || '',
          // Máx 2 fotos por atividade
          fotos: (a.fotos || [])
            .filter(f => urlValida(f.file_url || f.url))
            .slice(0, MAX_FOTOS_POR_ATIVIDADE)
            .map(f => ({
              url: f.file_url || f.url || '',
              legenda: f.legenda || f.caption || a.titulo || '',
              autor: f.autor || 'Registro do Período',
              data: a.data_realizacao,
            })),
        }))
        .filter(a => a.fotos.length > 0);
    } catch (_) {}
  } else {
    // Limitar fotos das atividades já carregadas
    atividadesComFotos = atividadesComFotos.map(a => ({
      ...a,
      fotos: (a.fotos || [])
        .filter(f => urlValida(f.url || f.file_url))
        .slice(0, MAX_FOTOS_POR_ATIVIDADE),
    }));
  }

  // Deduplicar e limitar galeria
  fotosGaleria = deduplicarFotos(
    fotosGaleria.filter(f => urlValida(f.file_url || f.url))
  ).slice(0, MAX_FOTOS_GALERIA);

  // Limitar anexos_evidencias
  const anexosLimitados = (relatorio.anexos_evidencias || [])
    .filter(a => urlValida(a.foto_url || a.url))
    .slice(0, MAX_FOTOS_POR_SECAO);

  return {
    ...relatorio,
    _fotos_galeria: fotosGaleria,
    _atividades_com_fotos: atividadesComFotos,
    anexos_evidencias: anexosLimitados,
  };
}

/**
 * Função unificada de exportação.
 * Usada por RelatorioExecucaoObjeto e RevisaoFinalDialog.
 *
 * @param {object} relatorio - objeto do relatório
 * @param {string} modo - 'parte1' | 'parte2' | 'parte3' | 'galeria' | 'completo'
 * @param {object} form - filtros de período/museu
 * @param {function} onProgresso - callback(texto) para exibir progresso
 */
export async function prepararEExportarRelatorioExecucao(relatorio, modo = 'completo', form = {}, onProgresso = () => {}) {
  if (!relatorio) throw new Error('Relatório não informado.');

  onProgresso('Preparando dados e fotos...');
  const relatorioPreparado = await prepararRelatorioParaExportacao(relatorio, form);

  if (modo === 'parte1') {
    onProgresso('Gerando Parte 1/3...');
    await exportarRelatorioExecucaoPDF(relatorioPreparado, 'parte1');
    return;
  }

  if (modo === 'parte2') {
    onProgresso('Gerando Parte 2/3...');
    await exportarRelatorioExecucaoPDF(relatorioPreparado, 'parte2');
    return;
  }

  if (modo === 'parte3') {
    onProgresso('Gerando Parte 3/3...');
    await exportarRelatorioExecucaoPDF(relatorioPreparado, 'parte3');
    return;
  }

  if (modo === 'galeria') {
    onProgresso('Gerando galeria de fotos...');
    await exportarRelatorioExecucaoPDF(relatorioPreparado, 'galeria');
    return;
  }

  // Modo completo — gera sequencialmente com delay
  onProgresso('Gerando Parte 1/3 — Identificação e Público...');
  await exportarRelatorioExecucaoPDF(relatorioPreparado, 'parte1');
  await delay(DELAY_ENTRE_PARTES_MS);

  onProgresso('Gerando Parte 2/3 — Metas e Equipe...');
  await exportarRelatorioExecucaoPDF(relatorioPreparado, 'parte2');
  await delay(DELAY_ENTRE_PARTES_MS);

  onProgresso('Gerando Parte 3/3 — Impactos, Assinatura e Anexos...');
  await exportarRelatorioExecucaoPDF(relatorioPreparado, 'parte3');
}