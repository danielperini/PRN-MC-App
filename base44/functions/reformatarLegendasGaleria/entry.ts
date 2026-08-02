import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function mesNumParaNome(mesStr) {
  const n = parseInt(mesStr, 10);
  if (n >= 1 && n <= 12) return MESES[n - 1];
  return mesStr;
}

function normalizarMuseu(codigo = '') {
  const c = codigo.toUpperCase().trim();
  if (c === 'MISBH' || c === 'MIS BH') return 'MIS';
  return c;
}

function titleCase(str = '') {
  const minusculas = new Set(['de','da','do','das','dos','e','em','a','o','as','os','por','para','com','que','um','uma']);
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i === 0 || !minusculas.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ');
}

// Tenta parsear o padrão: "Foto de Registro — 2026-MM-MUSEU-NOME_ATIVIDADE"
// Regex: /(20\d{2})-(\d{2})-(MHAB|MISBH|MIS BH|MUMO|MIS)-(.+?)(?:\s*-\s.*|$)/i
function parsearLegendaBruta(legenda = '') {
  if (!legenda) return null;
  const regex = /(20\d{2})-(\d{2})-(MHAB|MISBH|MIS\s*BH|MUMO|MIS)-(.+?)(?:\s+-\s+.*)?$/i;
  const match = legenda.match(regex);
  if (!match) return null;
  const ano = match[1];
  const mesNum = match[2];
  const museuRaw = match[3];
  const nomeAtividade = match[4].replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    ano,
    mes: mesNumParaNome(mesNum),
    museu: normalizarMuseu(museuRaw),
    nomeAtividade: titleCase(nomeAtividade),
  };
}

function montarNovaLegenda(parsed) {
  // Formato: "Nome Atividade — MUSEU — Mês/ANO"
  return `${parsed.nomeAtividade} — ${parsed.museu} — ${parsed.mes}/${parsed.ano}`;
}

function legendaFallback(foto, report) {
  const museu = foto.museu || report?.museu || '';
  const mes = foto.mes_referencia || report?.mes_referencia || '';
  const ano = foto.ano || report?.ano || '';
  const partes = [museu, mes, ano].filter(Boolean);
  if (partes.length === 0) return null;
  return partes.join(' — ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { skip = 0, limit = 50, dry_run = false } = body;

    // Buscar lote de ReportPhotos com paginação
    const allPhotos = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000);
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500);

    const reportById = new Map();
    for (const r of (reports || [])) reportById.set(r.id, r);

    const lote = (allPhotos || []).slice(skip, skip + limit);
    const totalGeral = (allPhotos || []).length;

    let atualizadas = 0;
    let semMudanca = 0;
    let erros = 0;

    for (const foto of lote) {
      try {
        const report = foto.report_id ? reportById.get(foto.report_id) : null;
        const legendaBruta = foto.legenda || foto.caption || '';

        let novaLegenda = null;

        // Tentar parse do padrão bruto
        const parsed = parsearLegendaBruta(legendaBruta);
        if (parsed) {
          novaLegenda = montarNovaLegenda(parsed);
        } else {
          // Fallback: usar campos estruturados
          novaLegenda = legendaFallback(foto, report);
        }

        if (!novaLegenda) {
          semMudanca++;
          continue;
        }

        const legendaAtual = foto.legenda || '';
        const captionAtual = foto.caption || '';

        if (novaLegenda === legendaAtual && novaLegenda === captionAtual) {
          semMudanca++;
          continue;
        }

        if (!dry_run) {
          await base44.asServiceRole.entities.ReportPhoto.update(foto.id, {
            legenda: novaLegenda,
            caption: novaLegenda,
          });
        }
        atualizadas++;
      } catch (e) {
        erros++;
      }
    }

    const proximoSkip = skip + limit;
    const hasMore = proximoSkip < totalGeral;

    return Response.json({
      success: true,
      atualizadas,
      sem_mudanca: semMudanca,
      erros,
      total_lote: lote.length,
      total_geral: totalGeral,
      proximo_skip: proximoSkip,
      has_more: hasMore,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});