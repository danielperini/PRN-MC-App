import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function mesNumParaNome(mesStr) {
  const n = parseInt(mesStr, 10);
  if (n >= 1 && n <= 12) return MESES[n - 1];
  // Já pode ser nome
  return mesStr;
}

function normalizarMuseu(codigo = '') {
  const c = codigo.toUpperCase().trim();
  if (c === 'MISBH' || c === 'MIS BH' || c === 'MIS-BH') return 'MIS';
  return c;
}

function titleCase(str = '') {
  const minusculas = new Set(['de','da','do','das','dos','e','em','a','o','as','os','por','para','com','que','um','uma','no','na','nos','nas']);
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i === 0 || !minusculas.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ');
}

// Tenta parsear padrão bruto: "2026-05-MHAB-NOME_ATIVIDADE" (pode ter prefixo)
function parsearLegendaBruta(legenda = '') {
  if (!legenda) return null;
  const regex = /(20\d{2})-(\d{2})-(MHAB|MISBH|MIS\s*BH|MUMO|MIS)-(.+?)(?:\s+-\s+.*)?$/i;
  const match = legenda.match(regex);
  if (!match) return null;
  const ano = match[1];
  const mesNum = match[2];
  const museuRaw = match[3].replace(/\s+/g, '');
  const nomeAtividade = match[4].replace(/_+/g, ' ').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    ano,
    mes: mesNumParaNome(mesNum),
    museu: normalizarMuseu(museuRaw),
    nomeAtividade: titleCase(nomeAtividade),
  };
}

// Gera legenda no padrão "Atividade — Museu — Mês/Ano"
function montarLegenda(atividade, museu, mes, ano) {
  const partes = [];
  if (atividade) partes.push(atividade);
  if (museu) partes.push(normalizarMuseu(museu));
  if (mes || ano) partes.push([mes, ano].filter(Boolean).join('/'));
  if (partes.length === 0) return null;
  return partes.join(' — ');
}

// Derivar legenda totalmente dos campos estruturados de foto + relatório
function legendaDosMetadados(foto, report) {
  // 1. Tentar parsear legenda/caption bruta existente
  const bruta = foto.legenda || foto.caption || foto.file_name || '';
  const parsed = parsearLegendaBruta(bruta);
  if (parsed) {
    return montarLegenda(parsed.nomeAtividade, parsed.museu, parsed.mes, parsed.ano);
  }

  // 2. Campos estruturados do registro de foto
  const museu = normalizarMuseu(foto.museu || report?.museu || '');
  const mes = mesNumParaNome(foto.mes_referencia || report?.mes_referencia || '');
  const ano = foto.ano || report?.ano || '';

  // Atividade: extrair do file_name ou caption se tiver padrão legível
  let atividade = '';
  const fnMatch = (foto.file_name || '').match(/(?:20\d{2}-\d{2}-\w+-)?(.+?)\.\w+$/i);
  if (fnMatch) {
    atividade = titleCase(fnMatch[1].replace(/_+/g, ' ').replace(/-+/g, ' ').trim());
  }

  return montarLegenda(atividade, museu, mes, String(ano));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { skip = 0, limit = 100, dry_run = false } = body;

    // Paginação real no banco — sem carregar tudo de uma vez
    const photos = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', limit + skip);
    const lote = (photos || []).slice(skip, skip + limit);
    const totalGeral = (photos || []).length;

    // Carregar relatórios referenciados apenas pelo lote atual
    const reportIds = [...new Set(lote.map(f => f.report_id).filter(Boolean))];
    const reportById = new Map();
    if (reportIds.length > 0) {
      const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500);
      for (const r of (reports || [])) reportById.set(r.id, r);
    }

    let atualizadas = 0;
    let semMudanca = 0;
    let erros = 0;

    for (const foto of lote) {
      try {
        const report = foto.report_id ? reportById.get(foto.report_id) : null;
        const novaLegenda = legendaDosMetadados(foto, report);

        if (!novaLegenda) {
          semMudanca++;
          continue;
        }

        const jaOk = novaLegenda === foto.legenda && novaLegenda === foto.caption;
        if (jaOk) {
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
      } catch (_e) {
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