import { getEntityDate } from './temporalFilters';

export function validateProgramacao(programacao = []) {
  const issues = [];
  const active = (Array.isArray(programacao) ? programacao : []).filter((item) => {
    const status = String(item.status || item.situacao || '').toUpperCase();
    return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
  });

  active.forEach((item) => {
    if (!getEntityDate(item)) {
      issues.push({
        type: 'PROGRAMACAO_WITHOUT_DATE',
        severity: 'warning',
        message: `Programação sem data: ${item.nome_acao || item.titulo || item.nome || item.id}`,
        entityId: item.id,
      });
    }
    if (!item.museu && !item.local && !item.equipamento) {
      issues.push({
        type: 'PROGRAMACAO_WITHOUT_MUSEUM',
        severity: 'info',
        message: `Programação sem museu/local definido: ${item.nome_acao || item.titulo || item.id}`,
        entityId: item.id,
      });
    }
  });

  return { activeProgramacao: active, issues };
}
