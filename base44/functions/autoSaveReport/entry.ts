import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toInt(value: unknown, fallback = 0): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
}

function normalizeAtividade(atividade: any = {}) {
  const quantasRepeticoesRaw = atividade.quantas_repeticoes;
  const quantidadeProdutoRaw = atividade.quantidade_produto;
  const publicoEstimadoRaw = atividade.publico_estimado;

  const quantasRepeticoes =
    quantasRepeticoesRaw === '' || quantasRepeticoesRaw === null || quantasRepeticoesRaw === undefined
      ? ''
      : toInt(quantasRepeticoesRaw, 0);

  const quantidadeProduto =
    quantidadeProdutoRaw === '' || quantidadeProdutoRaw === null || quantidadeProdutoRaw === undefined
      ? ''
      : toInt(quantidadeProdutoRaw, 0);

  const publicoEstimado =
    publicoEstimadoRaw === '' || publicoEstimadoRaw === null || publicoEstimadoRaw === undefined
      ? ''
      : toInt(publicoEstimadoRaw, 0);

  const repeticoesNum = quantasRepeticoes === '' ? 0 : toInt(quantasRepeticoes, 0);
  const quantidadeProdutoNum = quantidadeProduto === '' ? 0 : toInt(quantidadeProduto, 0);

  return {
    ...atividade,
    publico_estimado: publicoEstimado,
    quantas_repeticoes: quantasRepeticoes,
    quantidade_produto: quantidadeProduto,
    atividades_total: repeticoesNum,
    produtos_total: repeticoesNum * quantidadeProdutoNum,
  };
}

function normalizePayload(formData: any = {}) {
  return {
    ...formData,
    atividades: Array.isArray(formData?.atividades)
      ? formData.atividades.map((atividade: any) => normalizeAtividade(atividade))
      : [],
    oportunidades: Array.isArray(formData?.oportunidades)
      ? formData.oportunidades.map((item: any) => ({ ...item }))
      : [],
    momentos: Array.isArray(formData?.momentos)
      ? formData.momentos.map((item: any) => ({ ...item }))
      : [],
  };
}

function stableStringify(value: any): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }

  if (value && typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = sortDeep(value[key]);
    }
    return result;
  }

  return value;
}

function stripSystemFields(report: any = {}) {
  const {
    id,
    created_date,
    updated_date,
    created_by,
    _metadata,
    ...rest
  } = report || {};
  return rest;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, formData } = await req.json();

    if (!reportId || !formData) {
      return Response.json(
        { error: 'Parâmetros obrigatórios: reportId, formData' },
        { status: 400 }
      );
    }

    const normalizedFormData = normalizePayload(formData);

    const reportVersions = await base44.asServiceRole.entities.ReportVersion.filter(
      { report_id: reportId },
      '-version_number',
      1
    );

    const lastVersion = reportVersions?.[0];
    const newVersionNumber = (lastVersion?.version_number || 0) + 1;

    const currentReport = await base44.asServiceRole.entities.Report.get(reportId);

    const currentComparable = normalizePayload(stripSystemFields(currentReport || {}));
    const incomingComparable = normalizePayload(stripSystemFields(normalizedFormData || {}));
    const lastSnapshotComparable = normalizePayload(
      stripSystemFields(lastVersion?.data_snapshot || {})
    );

    const hasConflict =
      !!lastVersion &&
      stableStringify(lastSnapshotComparable) !== stableStringify(currentComparable);

    const hasRealChange =
      stableStringify(currentComparable) !== stableStringify(incomingComparable);

    if (!hasRealChange) {
      return Response.json({
        success: true,
        versionNumber: lastVersion?.version_number || 0,
        hasConflict,
        conflictMessage: hasConflict
          ? 'Conflito detectado: outro usuário editou este relatório. Verifique as mudanças antes de continuar.'
          : null,
        skipped: true,
      });
    }

    await base44.asServiceRole.entities.ReportVersion.create({
      report_id: reportId,
      version_number: newVersionNumber,
      data_snapshot: normalizedFormData,
      changed_by_email: user.email,
      changed_by_name: user.full_name,
      change_description: 'Auto-save',
      last_update_timestamp: new Date().toISOString(),
    });

    const { id, created_date, updated_date, created_by, ...payload } = normalizedFormData;

    await base44.asServiceRole.entities.Report.update(reportId, payload);

    return Response.json({
      success: true,
      versionNumber: newVersionNumber,
      hasConflict,
      conflictMessage: hasConflict
        ? 'Conflito detectado: outro usuário editou este relatório. Suas alterações foram mantidas, mas revise o conteúdo.'
        : null,
      skipped: false,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
});
