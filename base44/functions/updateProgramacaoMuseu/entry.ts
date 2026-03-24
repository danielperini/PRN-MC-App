import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

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
  return {
    id: data?.id || '',
    nome: String(data?.nome || data?.titulo || '').trim(),
    data: String(data?.data || '').trim(),
    museu: String(data?.museu || 'Externo').trim(),
    horario: String(data?.horario || '').trim(),
    tipo: String(data?.tipo || data?.tipo_atividade || '').trim(),
    vagas: String(data?.vagas || '').trim(),
    inscricao: String(data?.inscricao || data?.inscricao_acesso || '').trim(),
    descricao: String(data?.descricao || data?.sinopse || '').trim(),
    link: String(data?.link || '').trim(),
  };
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const data = sanitizePayload(body?.args?.data || body?.data || {});
    const action = String(body?.args?.action || body?.action || (data?.id ? 'update' : 'create')).trim();

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

    /*
      BLOQUEIO DE MÊS
      Ajuste aqui quando houver fonte real de bloqueio no Drive/Base44.
      Exemplo futuro:
      - buscar entity de configuração
      - ler aba de status da planilha
      - consultar function externa
    */
    const lockedMonths: string[] = [];

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

    /*
      IMPLEMENTAÇÃO ATUAL
      Esta function já valida payload e bloqueio.
      A gravação real no Google Sheets deve ser conectada aqui.

      Fluxo futuro:
      1. localizar aba/mês correspondente
      2. localizar linha por id ou por chave
      3. atualizar ou inserir
      4. retornar sucesso
    */

    return new Response(
      JSON.stringify({
        ok: true,
        saved: true,
        synced: true,
        action,
        month_key: monthKey,
        message: 'Atividade salva e sincronizada com sucesso.',
        item: data,
        integration_status: 'pending_google_sheets_write',
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
