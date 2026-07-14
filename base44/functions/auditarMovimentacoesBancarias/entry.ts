import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function n(value: any) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalize(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeType(value: any) {
  const type = normalize(value);
  if (type.includes('rend')) return 'rendimento';
  if (type.includes('cred') || type.includes('entrada')) return 'credito';
  if (type.includes('deb') || type.includes('saida') || type.includes('pagamento')) return 'debito';
  return type;
}

// ─── Transferências internas — não são débitos operacionais ───────────────────
function isTransferenciaInterna(item: any): boolean {
  const desc = normalize([item.descricao, item.historico, item.detalhe, item.categoria_fluxo].filter(Boolean).join(' '));
  if (/\bresgate\b/.test(desc)) return true;
  if (/\baplicacao\b/.test(desc) && /\b(automatica|financeira|cdb|fundo|saldo)\b/.test(desc)) return true;
  const termos = [
    'resgate automat', 'aplicacao automatica', 'aplicacao financeira', 'aplicacao cdb',
    'resgate cdb', 'resgate fundo', 'transferencia entre contas', 'transf entre contas',
    'conta investimento', 'conta corrente para investimento', 'investimento para conta corrente',
    'movimentacao interna', 'saldo aplicado', 'aporte aplicacao', 'baixa aplicacao',
    'resgate de investimento', 'transferencia para aplicacao', 'transferencia da aplicacao',
    'transferencia da conta para aplicacao', 'transferencia da aplicacao para conta',
  ];
  return termos.some(t => desc.includes(t));
}

// ─── Deduplicação segura: chave inclui drive_file_id + saldo + posição ─────────
// Dois pagamentos legítimos de mesmo valor/data/descrição (saldos diferentes)
// NÃO são eliminados.
function launchFingerprint(item: any, fileId: string, conta: string, posicao: number): string {
  return [
    fileId,
    conta,
    normalize(item.data),
    normalize(item.descricao || ''),
    normalizeType(item.tipo),
    Math.abs(n(item.valor)).toFixed(2),
    item.saldo != null ? n(item.saldo).toFixed(2) : `idx${posicao}`,
  ].join('|');
}

function auditRecord(record: any) {
  const fileId = String(record.drive_file_id || record.id || '');
  const conta = String(record.conta || record.banco || '').replace(/\D/g, '');
  const seen = new Set<string>();

  const launches = (Array.isArray(record.lancamentos) ? record.lancamentos : [])
    .map((item: any, posicao: number) => ({
      ...item,
      tipo: normalizeType(item.tipo),
      valor: Math.abs(n(item.valor)),
      saldo: item.saldo == null ? null : n(item.saldo),
      _transferencia_interna: isTransferenciaInterna(item),
      _posicao: posicao,
    }))
    .filter((item: any) => {
      const fingerprint = launchFingerprint(item, fileId, conta, item._posicao);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });

  const operacionais = launches.filter((item: any) =>
    item.tipo === 'debito' && !item._transferencia_interna
  );
  const transferencias = launches.filter((item: any) =>
    item._transferencia_interna
  );

  const totalCreditos = launches.filter((item: any) => item.tipo === 'credito').reduce((sum: number, item: any) => sum + item.valor, 0);
  const totalDebitosOperacionais = operacionais.reduce((sum: number, item: any) => sum + item.valor, 0);
  const totalTransferencias = transferencias.reduce((sum: number, item: any) => sum + item.valor, 0);
  const totalDebitosBrutos = launches.filter((item: any) => item.tipo === 'debito').reduce((sum: number, item: any) => sum + item.valor, 0);
  const totalRendimento = launches.filter((item: any) => item.tipo === 'rendimento').reduce((sum: number, item: any) => sum + item.valor, 0);
  const withBalance = launches.filter((item: any) => item.saldo != null);
  const saldoFinal = withBalance.length ? n(withBalance[withBalance.length - 1].saldo) : n(record.saldo_final);
  const hasLaunches = launches.length > 0;

  // Remove campos internos antes de salvar
  const launchesToSave = launches.map(({ _transferencia_interna, _posicao, ...rest }: any) => rest);

  const next = {
    lancamentos: launchesToSave,
    total_creditos: hasLaunches ? totalCreditos : n(record.total_creditos),
    total_debitos: hasLaunches ? totalDebitosOperacionais : n(record.total_debitos),
    total_debitos_brutos: totalDebitosBrutos,
    total_transferencias_internas: totalTransferencias,
    total_rendimento: hasLaunches && record.tipo === 'extrato_rendimento'
      ? (totalRendimento || Math.max(0, saldoFinal - n(record.saldo_inicial)))
      : n(record.total_rendimento),
    saldo_final: saldoFinal,
  };

  const discrepancies = {
    total_creditos: Math.abs(n(record.total_creditos) - next.total_creditos),
    total_debitos: Math.abs(n(record.total_debitos) - next.total_debitos),
    total_rendimento: Math.abs(n(record.total_rendimento) - next.total_rendimento),
    saldo_final: Math.abs(n(record.saldo_final) - next.saldo_final),
    lancamentos_duplicados: Math.max(0, (record.lancamentos || []).length - launchesToSave.length),
    transferencias_internas: totalTransferencias,
  };
  const changed = Object.entries(discrepancies).some(([key, value]) =>
    key === 'lancamentos_duplicados' ? (value as number) > 0 : (value as number) > 0.01
  );
  return { next, discrepancies, changed, totalDebitosOperacionais, totalTransferencias };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Autenticação obrigatória
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({
        success: false,
        error: 'Não autenticado. Faça login novamente.',
        etapa: 'autenticacao',
        acao_recomendada: 'Recarregue a página e faça login.'
      }, { status: 401 });
    }

    const role = normalize(user.role);
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({
        success: false,
        error: 'Apenas administradores ou coordenadores podem auditar extratos.',
        etapa: 'autorizacao',
        acao_recomendada: 'Solicite acesso de administrador ao responsável pelo sistema.'
      }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const year = Number(body.ano || 2026);
    const month = Number(body.mes_num || 0);

    // Usa entities com token do usuário autenticado (sem asServiceRole)
    let records: any[] = [];
    try {
      records = await base44.entities.MovimentacaoBancaria.list('-created_date', 2000);
    } catch (err: any) {
      return Response.json({
        success: false,
        error: `Erro ao buscar registros: ${err?.message || err}`,
        etapa: 'busca_registros',
        acao_recomendada: 'Verifique se a entidade MovimentacaoBancaria possui permissão de leitura para o seu perfil.'
      }, { status: 500 });
    }

    const selected = records.filter((record: any) =>
      Number(record.ano) === year && (!month || Number(record.mes_num) === month)
    );

    // Duplicidades por drive_file_id
    const duplicateDriveIds = new Map<string, any[]>();
    selected.forEach((record: any) => {
      if (!record.drive_file_id) return;
      const list = duplicateDriveIds.get(record.drive_file_id) || [];
      list.push(record);
      duplicateDriveIds.set(record.drive_file_id, list);
    });

    const duplicates = Array.from(duplicateDriveIds.entries())
      .filter(([, list]) => list.length > 1)
      .map(([drive_file_id, list]) => ({
        drive_file_id,
        registros: list.map((item: any) => ({ id: item.id, arquivo: item.drive_file_name, mes: item.mes, ano: item.ano })),
      }));

    const corrected: any[] = [];
    const unchanged: any[] = [];
    const errors: any[] = [];

    for (const record of selected) {
      try {
        const audit = auditRecord(record);
        if (!audit.changed) {
          unchanged.push(record.id);
          continue;
        }
        const auditText = `Auditoria ${new Date().toISOString()} por ${user.email}: operacionais=${audit.next.total_debitos.toFixed(2)}, transf_internas=${audit.totalTransferencias.toFixed(2)}, créditos=${audit.next.total_creditos.toFixed(2)}, rendimentos=${audit.next.total_rendimento.toFixed(2)}, saldo=${audit.next.saldo_final.toFixed(2)}.`;

        // NOTA: IA/auditoria nunca altera status de documentos. Apenas recalcula totais financeiros.
        await base44.entities.MovimentacaoBancaria.update(record.id, {
          ...audit.next,
          resumo_ia: [record.resumo_ia, auditText].filter(Boolean).join(' | ').slice(-4000),
        });
        corrected.push({
          id: record.id,
          arquivo: record.drive_file_name,
          mes_num: record.mes_num,
          ano: record.ano,
          discrepancias: audit.discrepancies,
          debitos_operacionais: audit.totalDebitosOperacionais,
          transferencias_internas: audit.totalTransferencias,
        });
      } catch (error: any) {
        errors.push({ id: record.id, arquivo: record.drive_file_name, erro: String(error?.message || error) });
      }
    }

    // Resumo por mês com separação operacional vs interno
    const monthly = new Map<string, any>();
    selected.forEach((record: any) => {
      const key = `${record.ano}-${String(record.mes_num || 0).padStart(2, '0')}`;
      if (!monthly.has(key)) monthly.set(key, {
        key, ano: record.ano, mes_num: record.mes_num,
        documentos: 0, creditos: 0,
        debitos_operacionais: 0, transferencias_internas: 0, debitos_brutos: 0,
        rendimentos: 0, lancamentos_total: 0, duplicados_removidos: 0, saldo_final: 0,
      });
      const target = monthly.get(key);
      const audit = auditRecord(record);
      target.documentos += 1;
      target.creditos += audit.next.total_creditos;
      target.debitos_operacionais += audit.next.total_debitos;
      target.transferencias_internas += audit.totalTransferencias;
      target.debitos_brutos += audit.next.total_debitos_brutos;
      target.rendimentos += audit.next.total_rendimento;
      target.lancamentos_total += (audit.next.lancamentos || []).length;
      target.duplicados_removidos += audit.discrepancies.lancamentos_duplicados;
      target.saldo_final = audit.next.saldo_final; // último documento do mês
    });

    return Response.json({
      success: true,
      resumo: {
        registros_analisados: selected.length,
        registros_corrigidos: corrected.length,
        registros_sem_alteracao: unchanged.length,
        duplicidades_drive_detectadas: duplicates.length,
        erros: errors.length,
        nota: 'IA não altera status de documentos. Reprovação somente por ação humana identificada.',
      },
      meses: Array.from(monthly.values()).sort((a, b) => a.key.localeCompare(b.key)),
      corrigidos: corrected,
      duplicidades: duplicates,
      erros: errors,
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: String(error?.message || error),
      etapa: 'execucao_geral',
      acao_recomendada: 'Verifique os logs da função e tente novamente.'
    }, { status: 500 });
  }
});