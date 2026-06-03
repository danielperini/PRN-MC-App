import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const ano = new Date().getFullYear();

    // Busca todos os termos do ano atual para calcular próximo número sequencial
    // A numeração é baseada no campo numero_tc_sequencial que armazenamos
    const todosTermos = await base44.asServiceRole.entities.TermoCompromisso.list();

    // Filtra termos do ano atual com numeração TC-MC-AAAA-NNN
    const termoAno = todosTermos.filter((t) => {
      const num = t.numero_tc || t.numero_termo || '';
      return num.startsWith(`TC-MC-${ano}-`);
    });

    // Extrai o maior sequencial
    let maxSeq = 0;
    for (const t of termoAno) {
      const num = t.numero_tc || t.numero_termo || '';
      const match = num.match(/TC-MC-\d{4}-(\d+)/);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }

    const proximoSeq = maxSeq + 1;
    const numeroTC = `TC-MC-${ano}-${String(proximoSeq).padStart(3, '0')}`;

    return Response.json({ success: true, numero_tc: numeroTC, sequencial: proximoSeq, ano });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});