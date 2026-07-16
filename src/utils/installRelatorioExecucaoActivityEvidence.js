import { base44 } from '@/api/base44Client';

const STATUS_APROVADO = new Set(['approved', 'aprovado', 'aprovado_coord', 'aprovado_admin', 'publicado', 'finalizado', 'concluido']);
const FOTO_CAMPOS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url', 'drive_url', 'gallery_url'];
const PUBLICO_CAMPOS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes'];

const texto = (valor) => String(valor ?? '').trim();
const lista = (valor) => Array.isArray(valor) ? valor : [];
const normalizar = (valor) => texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function unico(itens, chaveFn) {
  const mapa = new Map();
  for (const item of itens || []) {
    const chave = chaveFn(item);
    if (chave && !mapa.has(chave)) mapa.set(chave, item);
  }
  return [...mapa.values()];
}

async function listarSeguro(nome, limite = 10000) {
  try {
    const entidade = base44?.entities?.[nome];
    if (!entidade?.list) return [];
    const retorno = await entidade.list('-created_date', limite);
    return Array.isArray(retorno) ? retorno : [];
  } catch (erro) {
    const status = Number(erro?.response?.status || erro?.status || 0);
    if (status !== 403 && status !== 404) console.warn(`[Relatório de execução] Falha ao consultar ${nome}.`, erro);
    return [];
  }
}

function aprovado(relatorio = {}) {
  const status = normalizar(relatorio.status || relatorio.situacao || relatorio.estado || relatorio.review_status).replace(/\s+/g, '_');
  return STATUS_APROVADO.has(status);
}

function idAtividade(item = {}) {
  return texto(item.id || item.activity_id || item.atividade_id || item.agenda_id || item.evento_id || item.programacao_id);
}

function tituloAtividade(item = {}) {
  return texto(item.titulo || item.nome_acao || item.nome || item.atividade || item.descricao || item.description || item.relato || item.resumo);
}

function dataAtividade(item = {}) {
  return texto(item.data || item.data_atividade || item.data_inicio || item.start_date || item.created_date);
}

function publicoAtividade(item = {}) {
  for (const campo of PUBLICO_CAMPOS) {
    const valor = item?.[campo];
    if (Array.isArray(valor)) return valor.length;
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) return numero;
  }
  return lista(item.lista_presenca).length || lista(item.participantes_lista).length || 0;
}

function urlFoto(item = {}) {
  for (const campo of FOTO_CAMPOS) if (texto(item?.[campo])) return texto(item[campo]);
  return '';
}

function atividadesRelatorio(relatorio = {}) {
  return [
    relatorio.atividades,
    relatorio.activities,
    relatorio.atividades_realizadas,
    relatorio.descricao_acoes?.atividades,
    relatorio.tabelas_estruturadas?.atividades,
  ].flatMap(lista).map((atividade, indice) => ({
    ...atividade,
    id: atividade?.id || `${relatorio.id}-atividade-${indice}`,
    report_id: relatorio.id,
    museu: atividade?.museu || relatorio.museu,
    origem: 'Relatório mensal',
  }));
}

function fotosRelatorio(relatorio = {}) {
  return [relatorio.fotos, relatorio.photos, relatorio.anexos_evidencias, relatorio.anexos_fotograficos, relatorio.galeria_fotos]
    .flatMap(lista)
    .map((foto) => ({ ...foto, report_id: relatorio.id }));
}

function fotoDaAtividade(foto, atividade) {
  const vinculo = texto(foto.activity_id || foto.atividade_id || foto.agenda_id || foto.evento_id || foto.programacao_id);
  if (vinculo && vinculo === idAtividade(atividade)) return true;
  const legenda = normalizar(`${foto.atividade_nome || ''} ${foto.legenda || ''} ${foto.titulo || ''} ${foto.descricao || ''}`);
  const titulo = normalizar(tituloAtividade(atividade));
  return titulo.length >= 6 && legenda.includes(titulo);
}

export function installRelatorioExecucaoActivityEvidence() {
  if (typeof window === 'undefined' || window.__relatorioExecucaoActivityEvidenceInstalled) return;
  window.__relatorioExecucaoActivityEvidenceInstalled = true;

  const entidade = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entidade?.update || entidade.__activityEvidenceWrapped) return;

  const atualizarOriginal = entidade.update.bind(entidade);
  entidade.update = async (id, payload = {}) => {
    // O integrador completo, instalado depois deste helper, já entrega o contexto final.
    // Não sobrescrever nem duplicar dados quando esse marcador estiver presente.
    if (payload?.fontes_ia_relatorio_execucao?.integracao === 'relatorios_atividades_completos') {
      return atualizarOriginal(id, payload);
    }

    const [relatorios, fotosExternas] = await Promise.all([
      listarSeguro('Report'),
      listarSeguro('ReportPhoto'),
    ]);
    const aprovados = relatorios.filter(aprovado);
    const atividades = unico(aprovados.flatMap(atividadesRelatorio), (item) => idAtividade(item) || `${dataAtividade(item)}|${normalizar(tituloAtividade(item))}`);
    const fotos = unico([
      ...aprovados.flatMap(fotosRelatorio),
      ...fotosExternas,
    ].filter((item) => urlFoto(item)), (item) => urlFoto(item).split('?')[0]);

    const tabela = atividades.map((atividade) => {
      const vinculadas = fotos.filter((foto) => fotoDaAtividade(foto, atividade));
      return {
        atividade_id: idAtividade(atividade),
        relatorio_id: texto(atividade.report_id),
        meta_id: texto(atividade.meta_id || atividade.project_meta_id || atividade.meta_codigo || atividade.codigo_meta),
        atividade: tituloAtividade(atividade) || 'Atividade registrada',
        data: dataAtividade(atividade) || 'Data não informada',
        museu: texto(atividade.museu || atividade.local) || 'Não informado',
        publico_total: publicoAtividade(atividade),
        origem: atividade.origem || 'Relatório mensal',
        fotos_total: vinculadas.length,
        fotos: vinculadas.map((foto, indice) => ({
          titulo: texto(foto.legenda || foto.titulo || foto.atividade_nome) || `Registro fotográfico ${indice + 1}`,
          url: urlFoto(foto),
        })),
      };
    });

    return atualizarOriginal(id, {
      ...payload,
      tabela_atividades_evidencias: tabela,
      contexto_ia_atividades: tabela,
      resumo_atividades_ia: {
        total_atividades: tabela.length,
        publico_total: tabela.reduce((soma, item) => soma + Number(item.publico_total || 0), 0),
        fotos_total: tabela.reduce((soma, item) => soma + Number(item.fotos_total || 0), 0),
      },
      fontes_ia_relatorio_execucao: {
        integracao: 'activity_evidence_fallback',
        entidades: ['Report', 'ReportPhoto'],
        relatorios_aprovados_ids: aprovados.map((item) => item.id).filter(Boolean),
        atualizado_em: new Date().toISOString(),
      },
    });
  };

  entidade.__activityEvidenceWrapped = true;
}
