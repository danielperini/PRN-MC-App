import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function mesNumParaNome(mesStr) {
  if (!mesStr) return '';
  const n = parseInt(mesStr, 10);
  if (n >= 1 && n <= 12) return MESES[n - 1];
  return String(mesStr); // já pode ser nome
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

// Fallback: tenta extrair nome de atividade do file_name via regex
function atividadeDoFileNameFallback(fileName = '') {
  if (!fileName) return '';
  // Padrão: "2026-05-MHAB-NOME_ATIVIDADE.jpg" → captura NOME_ATIVIDADE
  const match = fileName.match(/^(?:20\d{2}-\d{2}-(?:MHAB|MISBH|MIS|MUMO)-)?(.+?)\.\w+$/i);
  if (!match) return '';
  return titleCase(match[1].replace(/_+/g, ' ').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim());
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

// Derivar legenda dos dados estruturados: Activity.titulo (prioridade) ou file_name (fallback)
function legendaDosMetadados(foto, report, activityById) {
  // Museu: foto > report
  const museu = normalizarMuseu(foto.museu || report?.museu || '');

  // Período: foto > report
  const mes = mesNumParaNome(foto.mes_referencia || report?.mes_referencia || '');
  const ano = String(foto.ano || report?.ano || '');

  // Atividade — hierarquia estrita:
  // 1) Activity.titulo via activity_id
  // 2) Fallback: file_name regex
  // 3) Omitir
  let atividade = '';
  if (foto.activity_id && activityById && activityById.has(foto.activity_id)) {
    atividade = activityById.get(foto.activity_id).titulo || '';
  } else {
    atividade = atividadeDoFileNameFallback(foto.file_name || '');
  }

  return montarLegenda(atividade, museu, mes, ano);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { skip = 0, limit = 100, dry_run = false } = body;

    // Paginação via list com offset manual (SDK não suporta skip nativo)
    const photos = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', limit + skip);
    const lote = (photos || []).slice(skip, skip + limit);
    const totalGeral = (photos || []).length;

    // Carregar Reports referenciados pelo lote
    const reportIds = [...new Set(lote.map(f => f.report_id).filter(Boolean))];
    const reportById = new Map();
    if (reportIds.length > 0) {
      const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500);
      for (const r of (reports || [])) reportById.set(r.id, r);
    }

    // Carregar Activities referenciadas pelo lote (busca em lote única)
    const activityIds = [...new Set(lote.map(f => f.activity_id).filter(Boolean))];
    const activityById = new Map();
    if (activityIds.length > 0) {
      // Busca todas as atividades referenciadas no lote atual
      const activities = await base44.asServiceRole.entities.Activity.filter(
        { id: { $in: activityIds } }
      );
      for (const a of (activities || [])) activityById.set(a.id, a);
    }

    let atualizadas = 0;
    let semMudanca = 0;
    let erros = 0;

    for (const foto of lote) {
      try {
        const report = foto.report_id ? reportById.get(foto.report_id) : null;
        const novaLegenda = legendaDosMetadados(foto, report, activityById);

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