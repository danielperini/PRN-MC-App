import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Extrai nome de atividade do padrão ATI_...__NomeAtividade__timestamp.ext
function extrairAtividadeDoNome(fileName = '') {
  const match = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  if (match) return match[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const match2 = fileName.match(/^ATI_[^_]+_[^_]+__(.+?)__\d+\.\w+$/);
  if (match2) return match2[1].replace(/_/g, ' ').trim();
  return null;
}

function formatDateBR(value = '') {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function gerarLegenda(foto, atividade) {
  const partes = [];
  const nomeAtv = atividade?.titulo || atividade?.nome || extrairAtividadeDoNome(foto.file_name || '') || '';
  if (nomeAtv) partes.push(nomeAtv);
  const local = atividade?.local || atividade?.local_realizacao || foto.museu || foto.local || '';
  if (local) partes.push(local);
  const data = atividade?.data_realizacao || atividade?.data_inicio || foto.created_date || '';
  const dataFmt = formatDateBR(data);
  if (dataFmt) partes.push(dataFmt);
  return partes.length > 0 ? partes.join(' — ') : (foto.file_name || 'Foto');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { dry_run = false, skip = 0, limit = 200 } = body;

    // Buscar fotos — tanto Attachment (imagens de relatórios) quanto ReportPhoto (restauradas)
    const [attachments, reportPhotos, reports] = await Promise.all([
      base44.asServiceRole.entities.Attachment.list('-created_date', 2000),
      base44.asServiceRole.entities.ReportPhoto.list('-created_date', 2000),
      base44.asServiceRole.entities.Report.list('-created_date', 500),
    ]);

    // Índice de relatórios por ID
    const reportById = new Map();
    for (const r of (reports || [])) reportById.set(r.id, r);

    let atualizadas = 0;
    let semMudanca = 0;
    const erros = [];

    // ─── Atualizar Attachments ───────────────────────────────────────────
    const imageExts = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i;
    const fotos = (attachments || []).filter(a =>
      imageExts.test(a.file_name || '') || String(a.file_type || '').startsWith('image/')
    );

    const loteAttachments = fotos.slice(skip, skip + limit);

    for (const foto of loteAttachments) {
      const report = foto.report_id ? reportById.get(foto.report_id) : null;
      const atividades = Array.isArray(report?.atividades) ? report.atividades : [];

      // Tentar vincular atividade pelo activity_id ou pelo nome do arquivo
      let atividade = atividades.find(a => a.id === foto.activity_id);
      if (!atividade) {
        const nomeArq = extrairAtividadeDoNome(foto.file_name || '') || '';
        if (nomeArq) {
          atividade = atividades.find(a => {
            const t = String(a.titulo || a.nome || '').toLowerCase();
            const n = nomeArq.toLowerCase();
            return t && n && (t.includes(n.split(' ')[0]) || n.includes(t.split(' ')[0]));
          });
        }
        if (!atividade && atividades.length === 1) atividade = atividades[0];
      }

      const novaLegenda = gerarLegenda({
        ...foto,
        museu: report?.museu || foto.museu || '',
      }, atividade);

      const legendaAtual = foto.description || foto.legenda || '';

      if (novaLegenda && novaLegenda !== legendaAtual) {
        if (!dry_run) {
          try {
            await base44.asServiceRole.entities.Attachment.update(foto.id, { description: novaLegenda });
            atualizadas++;
          } catch (e) {
            erros.push({ id: foto.id, erro: e.message });
          }
        } else {
          atualizadas++;
        }
      } else {
        semMudanca++;
      }
    }

    // ─── Atualizar ReportPhotos ──────────────────────────────────────────
    const loteReportPhotos = (reportPhotos || []).slice(skip, skip + limit);

    for (const foto of loteReportPhotos) {
      const report = foto.report_id ? reportById.get(foto.report_id) : null;
      const atividades = Array.isArray(report?.atividades) ? report.atividades : [];

      let atividade = atividades.find(a => a.id === foto.activity_id);
      if (!atividade) {
        const nomeArq = extrairAtividadeDoNome(foto.file_name || '') || '';
        if (nomeArq) {
          atividade = atividades.find(a => {
            const t = String(a.titulo || a.nome || '').toLowerCase();
            const n = nomeArq.toLowerCase();
            return t && n && (t.includes(n.split(' ')[0]) || n.includes(t.split(' ')[0]));
          });
        }
        if (!atividade && atividades.length === 1) atividade = atividades[0];
      }

      const novaLegenda = gerarLegenda({
        ...foto,
        museu: foto.museu || report?.museu || '',
      }, atividade);

      const legendaAtual = foto.caption || foto.legenda || '';

      if (novaLegenda && novaLegenda !== legendaAtual) {
        if (!dry_run) {
          try {
            await base44.asServiceRole.entities.ReportPhoto.update(foto.id, { caption: novaLegenda });
            atualizadas++;
          } catch (e) {
            erros.push({ id: foto.id, erro: e.message });
          }
        } else {
          atualizadas++;
        }
      } else {
        semMudanca++;
      }
    }

    return Response.json({
      success: true,
      dry_run,
      total_processadas: loteAttachments.length + loteReportPhotos.length,
      total_geral: Math.max(fotos.length, (reportPhotos || []).length),
      proximo_skip: skip + limit,
      has_more: skip + limit < Math.max(fotos.length, (reportPhotos || []).length),
      atualizadas,
      sem_mudanca: semMudanca,
      erros: erros.length,
      erros_detalhe: erros.slice(0, 10),
      mensagem: dry_run
        ? `Simulação: ${atualizadas} legendas seriam atualizadas.`
        : `${atualizadas} legendas atualizadas com sucesso.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});