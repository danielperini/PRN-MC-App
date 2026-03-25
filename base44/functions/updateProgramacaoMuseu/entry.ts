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

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeMuseu(value: any) {
  const text = normalizeText(value).toUpperCase();

  if (!text) return 'Externo';
  if (text === 'MAB') return 'MHAB';
  if (text === 'MUMU') return 'MUMO';
  return text;
}

function sanitizePayload(data: any) {
  return {
    id: normalizeText(data?.id),
    nome_acao: normalizeText(
      data?.nome_acao ||
      data?.nome ||
      data?.titulo
    ),
    data: normalizeText(data?.data),
    equipamento: normalizeMuseu(
      data?.equipamento ||
      data?.museu
    ),
    horario: normalizeText(data?.horario),
    vagas: normalizeText(data?.vagas),
    inscricao: normalizeText(
      data?.inscricao ||
      data?.inscricao_acesso
    ),
    sinopse: normalizeText(
      data?.sinopse ||
      data?.descricao
    ),
    link_imagens: normalizeText(
      data?.link_imagens ||
      data?.link
    ),
    tipo_atividade: normalizeText(data?.tipo_atividade),
    formato: normalizeText(data?.formato),
    publico: normalizeText(data?.publico),
    acessibilidade: normalizeText(data?.acessibilidade),
    classificacao: normalizeText(data?.classificacao),
    local: normalizeText(data?.local),
    endereco: normalizeText(data?.endereco),
    minibios: normalizeText(data?.minibios),
    material_divulgacao: data?.material_divulgacao || '',
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();

    if (!user) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Não autenticado.',
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const data = sanitizePayload(body?.args?.data || body?.data || {});
    const action = normalizeText(
      body?.args?.action || body?.action || (data?.id ? 'update' : 'create')
    ) || (data?.id ? 'update' : 'create');

    if (!data.nome_acao) {
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
      // '2026-01',
      // '2026-02',
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

    const entityPayload = {
      nome_acao: data.nome_acao,
      data: data.data,
      equipamento: data.equipamento || 'Externo',
      horario: data.horario,
      vagas: data.vagas,
      inscricao: data.inscricao,
      sinopse: data.sinopse,
      link_imagens: data.link_imagens,
      tipo_atividade: data.tipo_atividade,
      formato: data.formato,
      publico: data.publico,
      acessibilidade: data.acessibilidade,
      classificacao: data.classificacao,
      local: data.local,
      endereco: data.endereco,
      minibios: data.minibios,
      material_divulgacao: data.material_divulgacao,
      ativo: true,
      origem: 'edicao_manual',
      updated_at: new Date().toISOString(),
      month_key: monthKey,
      updated_by_email: user?.email || '',
      updated_by_name: user?.full_name || user?.name || '',
    };

    let saved: any = null;
    let resolvedAction = action;

    if (data.id) {
      try {
        saved = await base44.asServiceRole.entities.Programacao.update(
          data.id,
          entityPayload
        );
        resolvedAction = 'update';
      } catch (error) {
        console.error('Erro ao atualizar Programacao, tentando criar:', error);
      }
    }

    if (!saved) {
      saved = await base44.asServiceRole.entities.Programacao.create({
        ...entityPayload,
        created_by_email: user?.email || '',
        created_by_name: user?.full_name || user?.name || '',
      });
      resolvedAction = 'create';
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved: true,
        synced: true,
        action: resolvedAction,
        month_key: monthKey,
        message: 'Programação salva com sucesso.',
        item: saved,
        integration: 'programacao_entity',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro em updateProgramacaoMuseu:', error);

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
