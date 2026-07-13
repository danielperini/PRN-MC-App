import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function normalizeMes(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (let i = 0; i < MESES_NOMES.length; i++) {
    const m = MESES_NOMES[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (t.includes(m)) return { mes: MESES_NOMES[i], mesNum: i + 1 };
  }
  const match = t.match(/\b(0?[1-9]|1[0-2])\b/);
  if (match) { const n = parseInt(match[1]); return { mes: MESES_NOMES[n - 1], mesNum: n }; }
  return null;
}

function normalizeMuseu(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (t.includes('mis') || t.includes('imagem') || t.includes('som')) return 'MIS';
  if (t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if (t.includes('mumo') || t.includes('moda')) return 'MUMO';
  return null;
}

function extrairAtividadeDoNome(fileName) {
  // Padrão: ATI_timestamp_id__NomeAtividade__timestamp.ext
  const match = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  if (match) {
    return match[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Padrão simples: NomeAtividade__timestamp
  const match2 = fileName.match(/^(.+?)__\d{10,}/);
  if (match2) return match2[1].replace(/_/g, ' ').trim();
  return null;
}

function gerarLegenda(fotoNome, atividade, museu, mesNome, ano) {
  const partes = [];
  // Tentar extrair nome da atividade do nome do arquivo se não veio do relatório
  const nomeAtv = atividade?.titulo || atividade?.nome || extrairAtividadeDoNome(fotoNome) || '';
  if (nomeAtv) partes.push(nomeAtv);
  const local = atividade?.local || atividade?.local_realizacao || museu || '';
  if (local) partes.push(local);
  const dataAtv = atividade?.data_realizacao || atividade?.data_inicio || '';
  if (dataAtv) {
    const d = new Date(dataAtv);
    if (!isNaN(d.getTime())) {
      partes.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
    } else {
      partes.push(dataAtv);
    }
  } else if (mesNome && ano) {
    partes.push(`${mesNome}/${ano}`);
  }
  return partes.length > 0 ? partes.join(' — ') : (fotoNome || 'Foto');
}

async function listFolderImages(accessToken, folderId, depth = 0) {
  if (depth > 8) return [];
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,webViewLink,thumbnailLink,createdTime,parents)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  const items = data.files || [];
  const imgs = items.filter(f => f.mimeType?.startsWith('image/'));
  const folders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const BATCH = 5;
  for (let i = 0; i < folders.length; i += BATCH) {
    const batch = folders.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(sf => listFolderImages(accessToken, sf.id, depth + 1)));
    for (const r of results) imgs.push(...r);
  }
  return imgs;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && !['coordenador','coordinator'].includes(String(user.base_role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { folder_id, modo = 'preview' } = body;

    if (!folder_id) return Response.json({ error: 'folder_id obrigatório' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Listar todas as imagens da pasta recursivamente
    const imagens = await listFolderImages(accessToken, folder_id);

    // Carregar relatórios existentes para vincular
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500).catch(() => []);

    // Carregar ReportPhotos existentes para deduplicar
    const fotosExistentes = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 2000).catch(() => []);
    const driveIdsExistentes = new Set(fotosExistentes.map(f => f.drive_file_id).filter(Boolean));

    const resultados = [];

    for (const img of imagens) {
      // Verificar se já foi importada
      const jaExiste = driveIdsExistentes.has(img.id);

      // Detectar museu e mês pelo nome do arquivo / pasta
      const museuDetectado = normalizeMuseu(img.name);
      const mesDetectado = normalizeMes(img.name);
      const ano = img.createdTime ? new Date(img.createdTime).getFullYear() : new Date().getFullYear();

      // Extrair nome de atividade do nome do arquivo
      const atividadeNomeDoArquivo = extrairAtividadeDoNome(img.name);

      // Tentar vincular a um relatório — primeiro pelo museu+mês, depois apenas pelo mês/ano
      let reportVinculado = null;
      if (museuDetectado && mesDetectado) {
        reportVinculado = reports.find(r => {
          const museuOk = normalizeMuseu(r.museu) === museuDetectado;
          const mesOk = String(r.mes_referencia || '').toLowerCase() === mesDetectado.mes;
          const anoOk = !r.ano || r.ano === ano;
          return museuOk && mesOk && anoOk;
        }) || null;
      }
      // Fallback: qualquer relatório do mesmo mês/ano que tenha a atividade
      if (!reportVinculado && mesDetectado && atividadeNomeDoArquivo) {
        const nomeNorm = atividadeNomeDoArquivo.toLowerCase();
        reportVinculado = reports.find(r => {
          const mesOk = String(r.mes_referencia || '').toLowerCase() === mesDetectado.mes;
          const anoOk = !r.ano || r.ano === ano;
          const atividades = Array.isArray(r.atividades) ? r.atividades : [];
          const temAtividade = atividades.some(a => {
            const t = String(a.titulo || a.nome || '').toLowerCase();
            return t && nomeNorm && (t.includes(nomeNorm.split(' ')[0]) || nomeNorm.includes(t.split(' ')[0]));
          });
          return mesOk && anoOk && temAtividade;
        }) || null;
      }

      // Tentar vincular atividade dentro do relatório
      const atividades = Array.isArray(reportVinculado?.atividades) ? reportVinculado.atividades : [];
      const atividadeVinculada = atividades.find((a) => {
        const titulo = String(a.titulo || a.nome || '').toLowerCase();
        const imgNomeLower = img.name.toLowerCase();
        const nomeArquivoNorm = (atividadeNomeDoArquivo || '').toLowerCase();
        return titulo && (
          (nomeArquivoNorm && (nomeArquivoNorm.includes(titulo.split(' ')[0]) || titulo.includes(nomeArquivoNorm.split(' ')[0]))) ||
          imgNomeLower.includes(titulo.split(' ')[0])
        );
      }) || atividades[0] || null;

      // Gerar legenda automática
      const legenda = gerarLegenda(
        img.name,
        atividadeVinculada,
        museuDetectado || (reportVinculado?.museu),
        mesDetectado?.mes || reportVinculado?.mes_referencia,
        ano
      );

      // Nome padronizado
      const museuStr = (museuDetectado || reportVinculado?.museu || 'GERAL').toUpperCase();
      const mesStr = String(mesDetectado?.mesNum || '00').padStart(2, '0');
      const ext = img.name.split('.').pop().toLowerCase();
      const nomePad = `GALERIA_${museuStr}_${mesStr}_${ano}_${img.name.replace(/\s+/g,'_').substring(0, 40)}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');

      const item = {
        drive_file_id: img.id,
        drive_nome_original: img.name,
        drive_url: img.webViewLink,
        thumbnail_url: img.thumbnailLink || img.webViewLink,
        file_name: nomePad,
        legenda,
        museu: museuDetectado || reportVinculado?.museu || null,
        mes: mesDetectado?.mes || reportVinculado?.mes_referencia || null,
        mes_num: mesDetectado?.mesNum || null,
        ano,
        report_id: reportVinculado?.id || null,
        report_autor: reportVinculado?.author_name || null,
        atividade_titulo: atividadeVinculada?.titulo || atividadeVinculada?.nome || null,
        atividade_data: atividadeVinculada?.data_realizacao || atividadeVinculada?.data_inicio || null,
        ja_importada: jaExiste,
        selecionada: !jaExiste,
      };
      resultados.push(item);
    }

    if (modo === 'confirmar') {
      // Importar as selecionadas
      const selecionadas = resultados.filter(r => !r.ja_importada);
      let criadas = 0;
      let erros = 0;

      for (const foto of selecionadas) {
        await base44.asServiceRole.entities.ReportPhoto.create({
          report_id: foto.report_id || '',
          file_name: foto.file_name,
          file_url: foto.drive_url,
          drive_file_id: foto.drive_file_id,
          caption: foto.legenda,
          mes_referencia: foto.mes || '',
          ano: foto.ano,
          author: foto.report_autor || '',
        }).then(() => { criadas++; }).catch(() => { erros++; });
      }

      // Audit log
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'CREATE',
        entity_type: 'REPORT_PHOTO',
        entity_id: 'batch',
        actor_email: user.email,
        actor_name: user.full_name || user.email,
        details: `Restauração galeria Drive: ${criadas} fotos importadas, ${erros} erros. Pasta: ${folder_id}`,
      }).catch(() => {});

      return Response.json({
        success: true,
        modo: 'confirmar',
        total_analisadas: imagens.length,
        total_criadas: criadas,
        total_erros: erros,
        total_ja_existiam: resultados.filter(r => r.ja_importada).length,
      });
    }

    // Modo preview
    return Response.json({
      success: true,
      modo: 'preview',
      total_imagens: imagens.length,
      total_novas: resultados.filter(r => !r.ja_importada).length,
      total_ja_importadas: resultados.filter(r => r.ja_importada).length,
      resultados,
    });

  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});