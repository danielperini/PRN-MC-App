import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES_CAP = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\?.*$/, '').replace(/\/$/, '').toLowerCase();
}

function normalizeDriveId(id) {
  if (!id) return '';
  return String(id).trim().toLowerCase();
}

function parseContexto(raw) {
  if (!raw) return { pastaOrigem: '', caminho: '' };
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      pastaOrigem: String(obj?.pasta_origem || ''),
      caminho: String(obj?.caminho || ''),
    };
  } catch {
    return { pastaOrigem: '', caminho: String(raw || '') };
  }
}

function extrairPeriodoDoNome(fileName) {
  const match = (fileName || '').match(/_(\d{2})_(\d{4})_/);
  if (match) {
    const mesNum = Number(match[1]);
    const ano = Number(match[2]);
    if (mesNum >= 1 && mesNum <= 12) {
      return `${MESES_CAP[mesNum - 1]}/${ano}`;
    }
  }
  return '';
}

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

async function buildEvidenceMap(base44) {
  const map = new Map();

  const activities = await base44.asServiceRole.entities.Activity.list('-updated_date', 2000).catch(() => []);
  for (const act of activities) {
    if (!Array.isArray(act.fotos)) continue;
    for (const foto of act.fotos) {
      if (!foto?.file_url) continue;
      const key = normalizeUrl(foto.file_url);
      const driveKey = normalizeDriveId(foto.drive_file_id || foto.google_drive_file_id);
      const ctx = {
        titulo: act.titulo || '',
        descricao: act.descricao || '',
        museu: act.museu || '',
        mes: act.mes_referencia || '',
        ano: act.ano || '',
        autor: act.equipe_responsavel || act.usuario_responsavel_id || '',
        tipo_equipe: act.tipo_equipe || '',
        classificacao: act.classificacao || '',
        meta_codigo: act.meta_codigo || '',
        resultado_alcancado: act.resultado_alcancado || '',
        data_realizacao: act.data_realizacao || act.data_inicio || '',
        fonte: 'Activity',
      };
      if (key) map.set(key, ctx);
      if (driveKey) map.set(`drive:${driveKey}`, ctx);
    }
  }

  const reports = await base44.asServiceRole.entities.Report.list('-updated_date', 2000).catch(() => []);
  for (const report of reports) {
    const reportCtx = {
      museu: report.museu || '',
      mes: report.mes_referencia || '',
      ano: report.ano || report.ano_referencia || '',
      autor: report.author_name || '',
      equipe: report.equipe || '',
      funcao: report.funcao || '',
      fonte: 'Report',
    };
    if (Array.isArray(report.fotos)) {
      for (const foto of report.fotos) {
        if (!foto?.file_url) continue;
        const key = normalizeUrl(foto.file_url);
        const driveKey = normalizeDriveId(foto.drive_file_id);
        const ctx = { ...reportCtx, titulo: foto.legenda || foto.titulo || '', descricao: '', tipo_equipe: '', classificacao: '', meta_codigo: '', resultado_alcancado: '', data_realizacao: '' };
        if (key) map.set(key, ctx);
        if (driveKey) map.set(`drive:${driveKey}`, ctx);
      }
    }
    if (Array.isArray(report.atividades)) {
      for (const atv of report.atividades) {
        if (!Array.isArray(atv?.fotos)) continue;
        for (const foto of atv.fotos) {
          if (!foto?.file_url) continue;
          const key = normalizeUrl(foto.file_url);
          const driveKey = normalizeDriveId(foto.drive_file_id);
          const ctx = {
            ...reportCtx,
            titulo: atv.titulo || foto.legenda || '',
            descricao: atv.descricao || '',
            tipo_equipe: atv.tipo_equipe || '',
            classificacao: atv.classificacao || '',
            meta_codigo: atv.meta_codigo || '',
            resultado_alcancado: atv.resultado_alcancado || '',
            data_realizacao: atv.data_realizacao || atv.data_inicio || '',
            fonte: 'Report.Activity',
          };
          if (key) map.set(key, ctx);
          if (driveKey) map.set(`drive:${driveKey}`, ctx);
        }
      }
    }
  }

  return map;
}

function buildContextText(foto, evidenceCtx) {
  const partes = [];

  if (evidenceCtx) {
    if (evidenceCtx.titulo) partes.push(`Atividade: ${evidenceCtx.titulo}`);
    if (evidenceCtx.descricao) partes.push(`Descrição: ${evidenceCtx.descricao}`);
    if (evidenceCtx.museu) partes.push(`Museu: ${evidenceCtx.museu}`);
    if (evidenceCtx.mes) partes.push(`Mês: ${evidenceCtx.mes}${evidenceCtx.ano ? `/${evidenceCtx.ano}` : ''}`);
    if (evidenceCtx.autor) partes.push(`Equipe/Autor: ${evidenceCtx.autor}`);
    if (evidenceCtx.tipo_equipe) partes.push(`Tipo de equipe: ${evidenceCtx.tipo_equipe}`);
    if (evidenceCtx.classificacao) partes.push(`Classificação: ${evidenceCtx.classificacao}`);
    if (evidenceCtx.meta_codigo) partes.push(`Meta: ${evidenceCtx.meta_codigo}`);
    if (evidenceCtx.resultado_alcancado) partes.push(`Resultado: ${evidenceCtx.resultado_alcancado}`);
    if (evidenceCtx.data_realizacao) partes.push(`Data de realização: ${formatDateBR(evidenceCtx.data_realizacao)}`);
    if (evidenceCtx.funcao) partes.push(`Função do autor: ${evidenceCtx.funcao}`);
    partes.push(`Fonte da evidência: ${evidenceCtx.fonte}`);
  }

  const { pastaOrigem, caminho } = parseContexto(foto.contexto_ia);
  if (pastaOrigem) partes.push(`Pasta de origem: ${pastaOrigem}`);
  if (caminho && caminho !== pastaOrigem) partes.push(`Caminho: ${caminho}`);
  if (foto.museu && foto.museu !== 'GERAL') partes.push(`Museu (campo): ${foto.museu}`);
  if (foto.mes_referencia) partes.push(`Mês referência: ${foto.mes_referencia}${foto.ano ? `/${foto.ano}` : ''}`);

  const periodo = extrairPeriodoDoNome(foto.file_name);
  if (periodo) partes.push(`Período (do nome): ${periodo}`);
  if (foto.file_name) partes.push(`Arquivo: ${foto.file_name}`);

  return partes.join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { batch_size = 20, max_batches = 5, apenas_sem_legenda = false, offset = 0 } = body;

    const evidenceMap = await buildEvidenceMap(base44);

    const fotos = await base44.asServiceRole.entities.ReportPhoto.filter({
      fonte_ia: 'drive_sync'
    }).catch(() => []);

    const fotosParaLegenda = (fotos || []).filter((f) => {
      if (!f.file_url) return false;
      const legendaAtual = (f.caption || f.legenda || '').trim();
      if (apenas_sem_legenda && legendaAtual) return false;
      return true;
    });

    const fotosOffset = fotosParaLegenda.slice(offset);
    const totalBatches = Math.min(Math.ceil(fotosOffset.length / batch_size), max_batches);
    const updates = [];
    let processadas = 0;
    let comEvidencia = 0;
    const erros = [];

    for (let b = 0; b < totalBatches; b++) {
      const lote = fotosOffset.slice(b * batch_size, (b + 1) * batch_size);

      const fotosContext = lote.map((foto, idx) => {
        const urlKey = normalizeUrl(foto.file_url);
        const driveKey = normalizeDriveId(foto.drive_file_id);
        const evidenceCtx = evidenceMap.get(urlKey) || evidenceMap.get(`drive:${driveKey}`);
        if (evidenceCtx) comEvidencia++;
        const contextText = buildContextText(foto, evidenceCtx);
        return `FOTO_${idx + 1}:\n${contextText}`;
      }).join('\n\n---\n\n');

      const prompt = `Você é um especialista em documentação cultural do projeto Museus Centro (Viaduto das Artes).
Abaixo estão ${lote.length} fotografias com seus respectivos contextos (extraídos de relatórios e atividades da equipe).
Gere uma legenda profissional e descritiva para CADA foto, aproveitando ao máximo o contexto disponível.

REGRAS:
- Cada legenda deve ter entre 15 e 30 palavras
- Seja específico e informativo (não use "registro fotográfico" ou "foto da atividade")
- Integre museu, atividade, período e resultado quando disponíveis
- Se não houver contexto de evidência, use os metadados disponíveis (pasta, arquivo, museu)
- Formate como JSON: {"legendas": ["legenda1", "legenda2", ...]}

CONTEXTO DAS FOTOS:
${fotosContext}

Gere as ${lote.length} legendas em ordem, correspondendo a FOTO_1, FOTO_2, etc.:`;

      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              legendas: {
                type: 'array',
                items: { type: 'string' },
                description: `Array com ${lote.length} legendas, uma para cada foto, na ordem`,
              },
            },
            required: ['legendas'],
          },
        });

        const legendas = Array.isArray(result?.legendas) ? result.legendas : [];
        for (let i = 0; i < lote.length; i++) {
          const legenda = String(legendas[i] || '').trim();
          if (legenda) {
            updates.push({ id: lote[i].id, caption: legenda, legenda });
          }
        }
        processadas += lote.length;
      } catch (e) {
        erros.push({ batch: b, erro: String(e?.message || e) });
      }
    }

    let atualizadas = 0;
    if (updates.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        try {
          await base44.asServiceRole.entities.ReportPhoto.bulkUpdate(chunk);
          atualizadas += chunk.length;
        } catch (e) {
          erros.push({ chunk: i, erro: String(e?.message || e) });
        }
      }
    }

    return Response.json({
      success: erros.length === 0,
      total_fotos: fotosParaLegenda.length,
      total_evidencias_no_mapa: evidenceMap.size,
      fotos_com_evidencia: comEvidencia,
      batches_processados: totalBatches,
      fotos_processadas: processadas,
      legendas_geradas: atualizadas,
      restantes: Math.max(0, fotosParaLegenda.length - processadas),
      erros: erros.length,
      erros_detalhe: erros.slice(0, 5),
    });
  } catch (error) {
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
});