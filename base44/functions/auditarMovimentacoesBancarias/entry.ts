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

function launchFingerprint(item: any) {
  return [
    normalize(item.data),
    normalize(item.descricao),
    normalizeType(item.tipo),
    Math.abs(n(item.valor)).toFixed(2),
    item.saldo == null ? '' : n(item.saldo).toFixed(2),
  ].join('|');
}

function auditRecord(record: any) {
  const seen = new Set<string>();
  const launches = (Array.isArray(record.lancamentos) ? record.lancamentos : [])
    .map((item: any) => ({
      ...item,
      tipo: normalizeType(item.tipo),
      valor: Math.abs(n(item.valor)),
      saldo: item.saldo == null ? null : n(item.saldo),
    }))
    .filter((item: any) => {
      const fingerprint = launchFingerprint(item);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });

  const totalCreditos = launches.filter((item: any) => item.tipo === 'credito').reduce((sum: number, item: any) => sum + item.valor, 0);
  const totalDebitos = launches.filter((item: any) => item.tipo === 'debito').reduce((sum: number, item: any) => sum + item.valor, 0);
  const totalRendimento = launches.filter((item: any) => item.tipo === 'rendimento').reduce((sum: number, item: any) => sum + item.valor, 0);
  const withBalance = launches.filter((item: any) => item.saldo != null);
  const saldoFinal = withBalance.length ? n(withBalance[withBalance.length - 1].saldo) : n(record.saldo_final);
  const hasLaunches = launches.length > 0;

  const next = {
    lancamentos: launches,
    total_creditos: hasLaunches ? totalCreditos : n(record.total_creditos),
    total_debitos: hasLaunches ? totalDebitos : n(record.total_debitos),
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
    lancamentos_duplicados: Math.max(0, (record.lancamentos || []).length - launches.length),
  };
  const changed = Object.entries(discrepancies).some(([key, value]) => key === 'lancamentos_duplicados' ? value > 0 : value > 0.01);
  return { next, discrepancies, changed };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const role = normalize(user.role);
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({ success: false, error: 'Apenas administradores ou coordenadores podem auditar os extratos.' }, { status: 403 });
    }

    const year = Number(body.ano || 2026);
    const month = Number(body.mes_num || 0);
    const records = await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date', 2000);
    const selected = records.filter((record: any) => Number(record.ano) === year && (!month || Number(record.mes_num) === month));

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
        const auditText = `Auditoria determinística ${new Date().toISOString()}: créditos=${audit.next.total_creditos.toFixed(2)}, débitos=${audit.next.total_debitos.toFixed(2)}, rendimentos=${audit.next.total_rendimento.toFixed(2)}, saldo=${audit.next.saldo_final.toFixed(2)}.`;
        await base44.asServiceRole.entities.MovimentacaoBancaria.update(record.id, {
          ...audit.next,
          resumo_ia: [record.resumo_ia, auditText].filter(Boolean).join(' | ').slice(-4000),
        });
        corrected.push({ id: record.id, arquivo: record.drive_file_name, mes_num: record.mes_num, discrepancias: audit.discrepancies });
      } catch (error: any) {
        errors.push({ id: record.id, arquivo: record.drive_file_name, erro: String(error?.message || error) });
      }
    }

    const monthly = new Map<string, any>();
    selected.forEach((record: any) => {
      const key = `${record.ano}-${String(record.mes_num || 0).padStart(2, '0')}`;
      if (!monthly.has(key)) monthly.set(key, { key, ano: record.ano, mes_num: record.mes_num, documentos: 0, creditos: 0, debitos: 0, rendimentos: 0 });
      const target = monthly.get(key);
      const audit = auditRecord(record);
      target.documentos += 1;
      target.creditos += audit.next.total_creditos;
      target.debitos += audit.next.total_debitos;
      target.rendimentos += audit.next.total_rendimento;
    });

    return Response.json({
      success: true,
      resumo: {
        registros_analisados: selected.length,
        registros_corrigidos: corrected.length,
        registros_sem_alteracao: unchanged.length,
        duplicidades_drive_detectadas: duplicates.length,
        erros: errors.length,
      },
      meses: Array.from(monthly.values()).sort((a, b) => a.key.localeCompare(b.key)),
      corrigidos: corrected,
      duplicidades: duplicates,
      erros: errors,
    });
  } catch (error: any) {
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
});
