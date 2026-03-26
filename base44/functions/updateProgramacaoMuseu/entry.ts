import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function extractMonthYear(value: any) {
  const text = String(value || '').trim();

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
    };
  }

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;

    return {
      year,
      month: Number(br[2]),
    };
  }

  return null;
}

function buildMonthKey(value: any) {
  const parsed = extractMonthYear(value);
  if (!parsed) return '';
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

function isMonthLocked(monthKey: string, lockedMonths: string[]) {
  return lockedMonths.includes(monthKey);
}

function sanitizePayload(data: any) {
  const nome = String(data?.nome || data?.titulo || data?.nome_acao || '').trim();
  const dataRaw = String(data?.data || data?.data_inicio || '').trim();
  const museu = String(data?.museu || data?.equipamento || 'Externo').trim();
  const horario = String(data?.horario || '').trim();
  const vagas = String(data?.vagas || '').trim();
  const inscricao = String(
    data?.inscricao || data?.link_inscricao || data?.inscricao_acesso || ''
  ).trim();
  const descricao = String(data?.descricao || data?.sinopse || '').trim();
  const linkImagens = String(data?.link_imagens || data?.link || '').trim();
  const tipo = String(data?.tipo || data?.tipo_atividade || '').trim();
  const local = String(data?.local || '').trim();
  const endereco = String(data?.endereco || '').trim();

  return {
    id: data?.id || '',
    nome,
    titulo: nome,
    nome_acao: nome,
    data: dataRaw,
    data_inicio: dataRaw,
    museu,
    equipamento: museu,
    horario,
    vagas,
    inscricao,
    link_inscricao: inscricao,
    descricao,
    sinopse: descricao,
    link_imagens: linkImagens,
    tipo,
    tipo_atividade: tipo,
    local,
    endereco,
    origem: String(data?.origem || 'manual').trim(),
    ativo: data?.ativo === false ? false : true,
  };
}

function buildProgramacaoEntity(data: any, monthKey: string) {
  return {
    nome_acao: data.nome_acao,
    titulo: data.titulo,
    data: data.data,
    data_inicio: data.data_inicio || null,
    horario: data.horario,
    museu: data.museu,
    equipamento: data.equipamento,
    vagas: data.vagas,
    inscricao: data.inscricao,
    link_inscricao: data.link_inscricao,
    descricao: data.descricao,
    sinopse: data.sinopse,
    link_imagens: data.link_imagens,
    tipo: data.tipo,
    tipo_atividade: data.tipo_atividade,
    local: data.local,
    endereco: data.endereco,
    origem: data.origem,
    ativo: data.ativo,
    status: 'CONFIRMADA',
    month_key: monthKey,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const data = sanitizePayload(body?.args?.data || body?.data || {});
    const action = String(
      body?.args?.action || body?.action || (data?.id ? 'update' : 'create')
    ).trim();

    if (!data.nome) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Nome da atividade é obrigatório.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    if (!data.data) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Data da atividade é obrigatória.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const monthKey = buildMonthKey(data.data);

    if (!monthKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Não foi possível identificar o mês da atividade.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const lockedMonths: string[] = [
      // exemplo futuro:
      // '2026-01',
      // '2026-02'
    ];

    if (isMonthLocked(monthKey, lockedMonths)) {
      return new Response(
        JSON.stringify({
          ok: false,
          locked: true,
          month_key: monthKey,
          message: 'Este mês já está bloqueado para edição.',
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const entityPayload = buildProgramacaoEntity(data, monthKey);

    let savedItem: any = null;

    if (action === 'update' && data.id) {
      try {
        savedItem = await base44.entities.Programacao.update(data.id, entityPayload);
      } catch {
        savedItem = await base44.entities.Programacao.create(entityPayload);
      }
    } else {
      savedItem = await base44.entities.Programacao.create(entityPayload);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved: true,
        synced: true,
        action,
        month_key: monthKey,
        message: 'Salvo e sincronizado com sucesso',
        item: savedItem || {
          ...entityPayload,
          id: data.id || '',
        },
        integration: 'programacao_entity',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao salvar programação.',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
});
