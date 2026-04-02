import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function formatDateBr(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('pt-BR');
}

function buildPhotoGrid(fotos: any[] = []) {
  if (!Array.isArray(fotos) || fotos.length === 0) return '';

  return `
    <div class="section">
      <h2>Fotos do Relatório</h2>
      <div class="photo-grid">
        ${fotos.map((foto) => {
          const url = foto?.url || foto?.file_url || '';
          const caption = foto?.caption || foto?.legenda || foto?.fileName || foto?.file_name || 'Foto';
          if (!url) return '';
          return `
            <div class="photo-card">
              <img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" />
              <div class="photo-caption">${escapeHtml(caption)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function buildActivityPhotos(fotos: any[] = []) {
  if (!Array.isArray(fotos) || fotos.length === 0) return '';

  return `
    <div class="activity-photos">
      ${fotos.map((foto) => {
        const url = foto?.url || foto?.file_url || '';
        const caption = foto?.caption || foto?.legenda || foto?.fileName || foto?.file_name || 'Foto';
        if (!url) return '';
        return `
          <div class="activity-photo-card">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" />
            <div class="activity-photo-caption">${escapeHtml(caption)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildActivities(atividades: any[] = []) {
  if (!Array.isArray(atividades) || atividades.length === 0) {
    return `
      <div class="section">
        <h2>Atividades</h2>
        <p class="muted">Nenhuma atividade vinculada.</p>
      </div>
    `;
  }

  return `
    <div class="section">
      <h2>Atividades</h2>
      ${atividades.map((atividade, index) => {
        const museus = Array.isArray(atividade?.museu_lista)
          ? atividade.museu_lista.join(', ')
          : (atividade?.museu || '');

        const tipos = Array.isArray(atividade?.tipo_acao_lista)
          ? atividade.tipo_acao_lista.join(', ')
          : (atividade?.tipo_acao || '');

        const equipe = Array.isArray(atividade?.equipe_participante_ids)
          ? atividade.equipe_participante_ids.join(', ')
          : (atividade?.equipe_participante_nomes || '');

        const metas = Array.isArray(atividade?.meta_vinculada_ids)
          ? atividade.meta_vinculada_ids.join(', ')
          : (atividade?.meta_vinculada_titulos || '');

        const publicoEstimado = Number(atividade?.publico_estimado) || 0;
        const ocorrencias = Number(atividade?.quantidade_ocorrencias) || 0;
        const totalPublico = publicoEstimado * ocorrencias;
        const qtdProdutos = Number(atividade?.quantidade_produtos_gerados) || 0;
        const totalProdutos = qtdProdutos * ocorrencias;

        return `
          <div class="activity-block">
            <div class="activity-header">
              <span class="activity-index">Atividade ${index + 1}</span>
              <span class="activity-class">${escapeHtml(atividade?.classificacao || '-')}</span>
            </div>

            <div class="activity-title">${escapeHtml(atividade?.nome || atividade?.titulo || 'Sem nome')}</div>

            <div class="grid two">
              <div><strong>Produto realizado:</strong> ${escapeHtml(atividade?.produto_realizado || '-')}</div>
              <div><strong>Programação vinculada:</strong> ${escapeHtml(atividade?.programacao_id || '-')}</div>
              <div><strong>Museu / Local:</strong> ${escapeHtml(museus || '-')}</div>
              <div><strong>Tipo de ação:</strong> ${escapeHtml(tipos || '-')}</div>
              <div><strong>Data de início:</strong> ${escapeHtml(formatDateBr(atividade?.data_inicio) || '-')}</div>
              <div><strong>Data de fim:</strong> ${escapeHtml(formatDateBr(atividade?.data_fim) || '-')}</div>
              <div><strong>Público médio por sessão:</strong> ${publicoEstimado}</div>
              <div><strong>Quantidade de ocorrências:</strong> ${ocorrencias}</div>
              <div><strong>Público total:</strong> ${totalPublico}</div>
              <div><strong>Qtd. produtos por ocorrência:</strong> ${qtdProdutos}</div>
              <div><strong>Total produtos gerados:</strong> ${totalProdutos}</div>
              <div><strong>Total de atividades:</strong> ${escapeHtml(atividade?.total_atividades ?? '-')}</div>
            </div>

            <div class="text-block">
              <strong>Descrição</strong>
              <p>${escapeHtml(atividade?.descricao || '-')}</p>
            </div>

            <div class="text-block">
              <strong>Justificativa técnica</strong>
              <p>${escapeHtml(atividade?.justificativa_tecnica || '-')}</p>
            </div>

            <div class="grid one">
              <div><strong>Equipe participante:</strong> ${escapeHtml(equipe || '-')}</div>
              <div><strong>Metas vinculadas:</strong> ${escapeHtml(metas || '-')}</div>
            </div>

            ${buildActivityPhotos(normalizeArray(atividade?.fotos))}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildHtml(report: any) {
  const atividades = normalizeArray(report?.atividades);
  const fotos = normalizeArray(report?.fotos);
  const author = report?.author_name || 'Profissional';
  const month = report?.mes_referencia || 'Sem mês';
  const year = report?.ano || new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório para Assinatura</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    body { padding: 32px; }
    .page { max-width: 960px; margin: 0 auto; }
    .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
    .title { font-size: 28px; font-weight: 700; margin: 0 0 6px; }
    .subtitle { font-size: 14px; color: #555; margin: 0; }
    .section { margin-top: 28px; page-break-inside: avoid; }
    h2 { font-size: 20px; margin: 0 0 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
    .grid { display: grid; gap: 10px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid.one { grid-template-columns: 1fr; }
    .meta-box { background: #fafafa; border: 1px solid #ddd; padding: 16px; border-radius: 8px; }
    .meta-box strong { color: #111; }
    .text-block { margin-top: 14px; }
    .text-block p { margin: 6px 0 0; white-space: pre-wrap; line-height: 1.5; }
    .activity-block { border: 1px solid #ddd; border-radius: 10px; padding: 16px; margin-bottom: 18px; page-break-inside: avoid; }
    .activity-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .activity-index { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #444; }
    .activity-class { font-size: 12px; border: 1px solid #111; border-radius: 999px; padding: 4px 10px; }
    .activity-title { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
    .muted { color: #666; }
    .photo-grid, .activity-photos {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .photo-card, .activity-photo-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      page-break-inside: avoid;
    }
    .photo-card img, .activity-photo-card img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      display: block;
      background: #f5f5f5;
    }
    .photo-caption, .activity-photo-caption {
      font-size: 12px;
      padding: 8px;
      color: #444;
      text-align: center;
    }
    .signature-area {
      margin-top: 48px;
      page-break-inside: avoid;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 48px;
      margin-top: 70px;
    }
    .signature-line {
      border-top: 1px solid #111;
      padding-top: 8px;
      text-align: center;
      font-size: 13px;
      min-height: 24px;
    }
    .print-tip {
      margin-top: 24px;
      padding: 12px 14px;
      background: #f7f7f7;
      border: 1px dashed #bbb;
      border-radius: 8px;
      font-size: 12px;
      color: #444;
    }
    @media print {
      body { padding: 0; }
      .page { max-width: 100%; }
      .print-tip { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1 class="title">Relatório para Assinatura</h1>
      <p class="subtitle">${escapeHtml(author)} · ${escapeHtml(month)}/${escapeHtml(year)}</p>
    </div>

    <div class="section">
      <div class="meta-box grid two">
        <div><strong>Autor:</strong> ${escapeHtml(report?.author_name || '-')}</div>
        <div><strong>Função:</strong> ${escapeHtml(report?.funcao || '-')}</div>
        <div><strong>Museu:</strong> ${escapeHtml(report?.museu || '-')}</div>
        <div><strong>Equipe:</strong> ${escapeHtml(report?.equipe || '-')}</div>
        <div><strong>Mês de referência:</strong> ${escapeHtml(report?.mes_referencia || '-')}</div>
        <div><strong>Ano:</strong> ${escapeHtml(report?.ano || '-')}</div>
        <div><strong>Protocolo:</strong> ${escapeHtml(report?.numero_protocolo || '-')}</div>
        <div><strong>Status:</strong> ${escapeHtml(report?.status || '-')}</div>
      </div>
    </div>

    <div class="section">
      <h2>Resumo do Relatório</h2>

      <div class="text-block">
        <strong>Resumo do período</strong>
        <p>${escapeHtml(report?.resumo_periodo || '-')}</p>
      </div>

      <div class="text-block">
        <strong>Resumo executivo</strong>
        <p>${escapeHtml(report?.resumo_executivo || '-')}</p>
      </div>

      <div class="text-block">
        <strong>Resumo de oportunidades</strong>
        <p>${escapeHtml(report?.oportunidades_resumo || '-')}</p>
      </div>

      <div class="text-block">
        <strong>Pontos positivos</strong>
        <p>${escapeHtml(report?.avaliacao_pontos_positivos || '-')}</p>
      </div>

      <div class="text-block">
        <strong>Desafios</strong>
        <p>${escapeHtml(report?.avaliacao_desafios || '-')}</p>
      </div>

      <div class="text-block">
        <strong>Sugestões</strong>
        <p>${escapeHtml(report?.avaliacao_sugestoes || '-')}</p>
      </div>

      <div class="text-block">
        <strong>Comentários gerais</strong>
        <p>${escapeHtml(report?.comentarios_gerais || '-')}</p>
      </div>
    </div>

    ${buildActivities(atividades)}

    ${buildPhotoGrid(fotos)}

    <div class="signature-area">
      <h2>Assinaturas</h2>
      <div class="signature-grid">
        <div class="signature-line">Assinatura do responsável pelo relatório</div>
        <div class="signature-line">Assinatura da coordenação</div>
      </div>
    </div>

    <div class="print-tip">
      Ao abrir esta página, use a opção do navegador <strong>Imprimir</strong> e escolha <strong>Salvar como PDF</strong>.
    </div>
  </div>

  <script>
    window.onload = () => {
      window.focus();
    };
  </script>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();

    const body = await req.json().catch(() => ({}));
    const reportId = body?.reportId;
    const mode = body?.mode || 'assinatura';

    if (!reportId) {
      return Response.json({ error: 'reportId é obrigatório' }, { status: 400 });
    }

    const report = await base44.entities.Report.get(reportId);

    if (!report?.id) {
      return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }

    const fileName = `relatorio_assinatura_${String(report?.author_name || 'autor')
      .replaceAll(/\s+/g, '_')
      .replaceAll(/[^\w\-]/g, '')}_${String(report?.mes_referencia || 'mes')
      .replaceAll(/\s+/g, '_')}_${String(report?.ano || new Date().getFullYear())}`;

    const html = buildHtml({
      ...report,
      mode,
    });

    return Response.json({
      success: true,
      mode,
      file_name: fileName,
      html,
    });
  } catch (error) {
    console.error('generateSingleReportPDF error:', error);
    return Response.json(
      { error: error?.message || 'Erro interno ao gerar PDF do relatório' },
      { status: 500 }
    );
  }
});
