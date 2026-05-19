import { getActivityDescription, getActivityTitle, normalizeText } from './semanticActivityMatcher';

export const PUBLIC_ACTIVITY_NATURES = new Set([
  'PUBLICA_EDUCATIVA',
  'VISITA_MEDIADA',
  'PROGRAMACAO_CULTURAL',
]);

export const OPERATIONAL_ACTIVITY_NATURES = new Set([
  'COMUNICACAO',
  'PRODUCAO',
  'GESTAO_REUNIAO',
  'MANUTENCAO_INFRA',
  'DOCUMENTACAO_RELATORIO',
  'VISITA_TECNICA_USO_ESPACO',
  'ROTINA_INTERNA',
]);

function activityText(activity = {}) {
  return normalizeText([
    getActivityTitle(activity),
    getActivityDescription(activity),
    activity.tipo,
    activity.tipo_atividade,
    activity.classificacao,
    activity.categoria,
    activity.categoria_label,
    activity.eixo,
    activity.meta,
  ].join(' '));
}

export function classifyAuditActivityNature(activity = {}) {
  const text = activityText(activity);

  if (/\b(reuniao|ritual de gestao|alinhamento|contato|trello|pauta|prestacao de contas|contratacao|consultoria|apresentacao)\b/.test(text)) {
    return 'GESTAO_REUNIAO';
  }

  if (/\b(manutencao|lampada|vidracaria|infraestrutura|orcamentacao|conserto|reparo)\b/.test(text)) {
    return 'MANUTENCAO_INFRA';
  }

  if (/\b(fechamento do relatorio|relatorio mensal|documentacao de relatorio)\b/.test(text)) {
    return 'DOCUMENTACAO_RELATORIO';
  }

  if (/\b(comunicacao|cobertura|coberturas|clipping|rede social|redes sociais|postagem|feed|story|stories|png|card|cards|roteiro|tbt|peca digital|audiovisual|edicao|video|entrevista|libras|material de divulgacao|modelo de referencia)\b/.test(text)) {
    return 'COMUNICACAO';
  }

  if (/\b(producao|apoio|montagem|organizacao|recepcao|bastidor|acompanhamento das filmagens|filmagem)\b/.test(text)) {
    return 'PRODUCAO';
  }

  if (/\b(visita tecnica|uso do espaco|vitral podcast)\b/.test(text)) {
    return 'VISITA_TECNICA_USO_ESPACO';
  }

  if (/\b(visita mediada|visitas mediadas|visita agendada|visitas agendadas|grupo agendado|mediacao|educativo aberto)\b/.test(text)) {
    return 'VISITA_MEDIADA';
  }

  if (/\b(oficina|laboratorio|minicurso|curso|formacao|intervencao educativa|estudio aberto|educativo)\b/.test(text)) {
    return 'PUBLICA_EDUCATIVA';
  }

  if (/\b(sarau|prosas|mostra|exposicao|abertura da exposicao|evento cultural|show|apresentacao cultural|publico espontaneo|memorias em libras)\b/.test(text)) {
    return 'PROGRAMACAO_CULTURAL';
  }

  if (/\b(rotina|interno|administrativo)\b/.test(text)) {
    return 'ROTINA_INTERNA';
  }

  return 'PROGRAMACAO_CULTURAL';
}

export function isPublicActivityForAudit(activity = {}) {
  return PUBLIC_ACTIVITY_NATURES.has(activity._activityNature || classifyAuditActivityNature(activity));
}

export function isOperationalActivityForAudit(activity = {}) {
  return OPERATIONAL_ACTIVITY_NATURES.has(activity._activityNature || classifyAuditActivityNature(activity));
}

export function getExplicitActivityMeta(activity = {}) {
  return String(
    activity._meta ||
      activity.meta ||
      activity.meta_aditivo ||
      activity.meta_relacionada ||
      activity.meta_id ||
      activity.metaId ||
      activity.codigo_meta ||
      ''
  ).trim();
}

export function inferActivityMetaForAudit(activity = {}) {
  const text = activityText(activity);
  const nature = activity._activityNature || classifyAuditActivityNature(activity);

  if (nature === 'COMUNICACAO' || /\b(comunicacao|rede social|postagem|feed|story|png|card|cobertura|video|edicao|roteiro|material de divulgacao)\b/.test(text)) {
    return 'META 16';
  }

  if (nature === 'PUBLICA_EDUCATIVA' || nature === 'VISITA_MEDIADA' || /\b(oficina|laboratorio|educativo|visita mediada|mediacao|curso|formacao)\b/.test(text)) {
    return 'META 05';
  }

  if (/\b(exposicao|mostra|abertura da exposicao)\b/.test(text)) {
    return 'META 12';
  }

  if (nature === 'PROGRAMACAO_CULTURAL' || /\b(prosas|sarau|evento cultural|memorias em libras|publico espontaneo)\b/.test(text)) {
    return 'META 17';
  }

  return '';
}

export function getActivityMetaForAudit(activity = {}) {
  return getExplicitActivityMeta(activity) || inferActivityMetaForAudit(activity);
}

export function shouldRequireMeta(activity = {}) {
  if (activity._isInternal || isOperationalActivityForAudit(activity)) return false;
  return isPublicActivityForAudit(activity);
}

export function shouldEmitDuplicateActivityIssue(item = {}) {
  const duplicate = item.duplicate || {};
  const kept = item.kept || {};
  const nature = duplicate._activityNature || kept._activityNature || classifyAuditActivityNature(duplicate) || classifyAuditActivityNature(kept);

  if (OPERATIONAL_ACTIVITY_NATURES.has(nature)) return false;

  const title = normalizeText(getActivityTitle(duplicate) || getActivityTitle(kept) || item.key);
  if (/\b(reuniao|contato|prestacao de contas|ritual de gestao|trello|pauta|conferencia material|acompanhamento das filmagens)\b/.test(title)) {
    return false;
  }

  return true;
}
