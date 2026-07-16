import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { filtrarMetas3e4Aditivos } from '@/utils/metasAditivosPermitidos';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

if (!appId) {
  console.error('VITE_BASE44_APP_ID não configurado.');
}

export const base44 = createClient({
  appId,
  token: token || undefined,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl,
});

const NF_DATE_FIELDS = [
  'nf_data_emissao',
  'data_nf',
  'data_emissao_nf',
  'nota_fiscal_data_emissao',
  'nf_emissao',
];

function isComprasRoute() {
  if (typeof window === 'undefined') return false;
  return /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function normalizeNFDateForLocalComparison(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0];
  if (isoDate) return `${isoDate}T12:00:00`;

  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return `${year}-${month}-${day}T12:00:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T12:00:00`;
}

function getNFDate(purchase) {
  for (const field of NF_DATE_FIELDS) {
    if (purchase?.[field]) return normalizeNFDateForLocalComparison(purchase[field]);
  }
  return null;
}

function dateOnly(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function activityMetaId(item) {
  return String(
    item?.meta_id ||
      item?.project_meta_id ||
      item?.meta_projeto_id ||
      item?.meta_codigo ||
      item?.metaId ||
      item?.meta?.id ||
      ''
  );
}

function normalizeMuseum(value) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (text.includes('MIS') || text.includes('IMAGEM E SOM')) return 'MIS';
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  if (text.includes('MHAB') || text.includes('ABILIO BARRETO')) return 'MHAB';
  return String(value || '').trim();
}

async function enrichDescriptionActionsPayload(payload = {}) {
  if (payload?.secao !== 'descricao_acoes') return payload;

  try {
    const entity = base44.entities?.Programacao;
    if (!entity?.list) return payload;

    const allItems = await entity.list('-data_inicio', 5000);
    const start = String(payload.data_inicio || '');
    const end = String(payload.data_fim || '');
    const selectedMetaIds = new Set((payload.filtro_meta_ids || []).map(String));
    const museumFilter = normalizeMuseum(payload.filtro_museu);

    const agenda = (Array.isArray(allItems) ? allItems : [])
      .filter((item) => {
        const date = dateOnly(item?.data_inicio || item?.data || item?.start_date || item?.created_date);
        if (!date || (start && date < start) || (end && date > end)) return false;

        const museum = normalizeMuseum(item?.museu || item?.unidade || item?.local);
        if (museumFilter && museumFilter !== 'TODOS' && museumFilter !== 'todos' && museum !== museumFilter) return false;

        const metaId = activityMetaId(item);
        if (metaId && selectedMetaIds.size > 0 && !selectedMetaIds.has(metaId)) return false;

        return ['MIS', 'MUMO', 'MHAB'].includes(museum) || museumFilter === 'todos' || museumFilter === 'TODOS';
      })
      .map((item) => ({
        id: item.id,
        data: dateOnly(item?.data_inicio || item?.data || item?.start_date),
        titulo: item?.titulo || item?.nome_acao || item?.nome || 'Atividade sem título',
        descricao: item?.sinopse || item?.descricao || '',
        museu: normalizeMuseum(item?.museu || item?.unidade || item?.local),
        local: item?.local || '',
        publico_alvo: item?.publico_alvo || '',
        meta_id: activityMetaId(item) || null,
        link_imagens: item?.link_imagens || '',
      }));

    if (payload.relatorio_id && agenda.length > 0) {
      await base44.entities.RelatorioExecucaoObjeto.update(payload.relatorio_id, {
        _agenda_periodo: agenda,
        agenda_sincronizada_em: new Date().toISOString(),
      });
    }

    const instruction = [
      payload.instrucao_usuario,
      'Para a seção DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS, use obrigatoriamente os registros reais da Agenda abaixo e as metas selecionadas.',
      'Priorize e organize as ações educativo-culturais realizadas no MIS, MUMO e MHAB, por museu e em ordem cronológica.',
      'Informe título, data, local, síntese da atividade, público-alvo quando registrado e relação com a meta selecionada.',
      'Não crie atividades que não estejam na Agenda ou nos dados já vinculados ao relatório.',
    ].filter(Boolean).join(' ');

    return {
      ...payload,
      usar_agenda: true,
      agenda_periodo: agenda,
      atividades_agenda: agenda,
      foco_descricao_acoes: 'Ações educativo-culturais MIS / MUMO / MHAB',
      instrucao_usuario: instruction,
    };
  } catch (error) {
    console.warn('Não foi possível carregar a Agenda para a descrição das ações.', error);
    return payload;
  }
}

// Regra canônica global: seletores e telas só recebem metas do 3º e 4º aditivos.
for (const entityName of ['ProjectMeta', 'MetaProjeto', 'Meta']) {
  const entity = base44.entities?.[entityName];
  if (!entity) continue;

  if (entity.list) {
    const originalList = entity.list.bind(entity);
    entity.list = async (...args) => filtrarMetas3e4Aditivos(await originalList(...args));
  }

  if (entity.filter) {
    const originalFilter = entity.filter.bind(entity);
    entity.filter = async (...args) => filtrarMetas3e4Aditivos(await originalFilter(...args));
  }
}

// Mantém o filtro da página Compras sem envolver o SDK em Proxy.
const purchaseRequestEntity = base44.entities?.PurchaseRequest;
if (purchaseRequestEntity?.list) {
  const originalPurchaseRequestList = purchaseRequestEntity.list.bind(purchaseRequestEntity);

  purchaseRequestEntity.list = async (...args) => {
    const records = await originalPurchaseRequestList(...args);
    if (!isComprasRoute() || !Array.isArray(records)) return records;

    return records.map((purchase) => ({
      ...purchase,
      __created_date_original: purchase?.created_date || null,
      created_date: getNFDate(purchase),
    }));
  };
}

function isMissingServiceTokenError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Service token is required to use asServiceRole');
}

// Fallback restrito ao preenchimento do relatório, sem Proxy e sem recursão.
const functionsApi = base44.functions;
if (functionsApi?.invoke) {
  const originalInvoke = functionsApi.invoke.bind(functionsApi);

  functionsApi.invoke = async (functionName, payload) => {
    try {
      const enrichedPayload = functionName === 'gerarSecaoRelatorioExecucao'
        ? await enrichDescriptionActionsPayload(payload)
        : payload;
      return await originalInvoke(functionName, enrichedPayload);
    } catch (error) {
      if (functionName === 'preencherRelatorioComDados' && isMissingServiceTokenError(error)) {
        console.warn(
          'preencherRelatorioComDados executado sem service role; usando sincronização autenticada do usuário.'
        );
        return {
          success: true,
          fallback_usuario_autenticado: true,
          resumo: {},
        };
      }

      throw error;
    }
  };
}
