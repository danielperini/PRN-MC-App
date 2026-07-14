import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function normalize(v: any) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function errorMessage(e: any) { return String(e?.message || e || 'Erro desconhecido').slice(0, 800); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    // mes_num e ano opcionais: se fornecidos, limpa só aquele mês; senão, todos
    const mes_num = Number(body.mes_num || 0);
    const ano = Number(body.ano || 2026);

    const todos = await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date', 2000);

    // Agrupar por (mes_num, ano, tipo)
    const grupos = new Map<string, any[]>();
    for (const r of todos) {
      const m = Number(r.mes_num || 0);
      const a = Number(r.ano || 2026);
      // Se filtro de mês foi passado, pular outros meses
      if (mes_num && (m !== mes_num || a !== ano)) continue;
      const key = `${a}-${String(m).padStart(2, '0')}-${r.tipo}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(r);
    }

    const deletados: any[] = [];
    const mantidos: any[] = [];

    for (const [key, registros] of grupos.entries()) {
      // Ordenar: prefere o que tem drive_file_id + mais lançamentos
      const ordenados = [...registros].sort((a, b) => {
        // Prefere quem tem drive_file_id
        const aHasDrive = a.drive_file_id ? 1 : 0;
        const bHasDrive = b.drive_file_id ? 1 : 0;
        if (bHasDrive !== aHasDrive) return bHasDrive - aHasDrive;
        // Prefere quem tem mais lançamentos
        const aLanc = (a.lancamentos || []).length;
        const bLanc = (b.lancamentos || []).length;
        if (bLanc !== aLanc) return bLanc - aLanc;
        // Prefere o mais recente
        return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
      });

      // Manter apenas 1, deletar os demais
      const [manter, ...sobras] = ordenados;
      mantidos.push({ id: manter.id, tipo: manter.tipo, mes: manter.mes, banco: manter.banco });
      for (const sobra of sobras) {
        await base44.asServiceRole.entities.MovimentacaoBancaria.delete(sobra.id);
        deletados.push({ id: sobra.id, tipo: sobra.tipo, mes: sobra.mes, banco: sobra.banco });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        grupos_verificados: grupos.size,
        mantidos: mantidos.length,
        deletados: deletados.length,
      },
      deletados,
      mantidos,
    });
  } catch (e: any) {
    return Response.json({ success: false, error: errorMessage(e) }, { status: 500 });
  }
});