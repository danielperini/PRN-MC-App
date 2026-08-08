import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const DRIVE_FOLDER_ID = '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ';
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

async function listFolderContents(accessToken, folderId) {
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,createdTime,modifiedTime,size)';
  let allFiles = [];
  let pageToken = null;
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    allFiles = allFiles.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return allFiles;
}

async function listAllFilesRecursive(accessToken, folderId, depth = 0) {
  if (depth > 10) return []; // safety limit
  const items = await listFolderContents(accessToken, folderId);
  let allFiles = [];
  const subfolders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  allFiles = allFiles.concat(files);
  // Recurse into subfolders in parallel (batched to avoid rate limits)
  const BATCH = 5;
  for (let i = 0; i < subfolders.length; i += BATCH) {
    const batch = subfolders.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(sf => listAllFilesRecursive(accessToken, sf.id, depth + 1)));
    for (const r of results) allFiles = allFiles.concat(r);
  }
  return allFiles;
}

async function getFileDownloadUrl(accessToken, fileId) {
  // Returns a public-accessible export URL or direct download
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink,webContentLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.webContentLink || data.webViewLink || null;
}

function normalizeMes(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (let i = 0; i < MESES.length; i++) {
    const m = MESES[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (t.includes(m)) return { mes: MESES[i], mesNum: i + 1 };
  }
  // Try numeric
  const match = t.match(/\b(0?[1-9]|1[0-2])\b/);
  if (match) {
    const n = parseInt(match[1]);
    return { mes: MESES[n - 1], mesNum: n };
  }
  return null;
}

function normalizeMuseu(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (t.includes('mis') || t.includes('imagem e som')) return 'MIS';
  if (t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if (t.includes('mumo') || t.includes('moda')) return 'MUMO';
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && !['coordenador','coordinator'].includes(String(user.base_role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const { folder_id } = await req.json().catch(() => ({}));
    const targetFolder = folder_id || DRIVE_FOLDER_ID;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // List all files recursively across all subfolders
    const arquivos = await listAllFilesRecursive(accessToken, targetFolder);
    const pdfs = arquivos.filter(f => f.mimeType === 'application/pdf');
    const imagens = arquivos.filter(f => f.mimeType?.startsWith('image/'));

    // Load existing reports for duplicate check
    const existingReports = await base44.asServiceRole.entities.Report.list('-created_date', 500).catch(() => []);
    const existingUsers = await base44.asServiceRole.entities.User.list().catch(() => []);

    const resultados = [];

    for (const pdf of pdfs) {
      // Get accessible URL for AI
      const downloadUrl = await getFileDownloadUrl(accessToken, pdf.id);
      const fileUrl = downloadUrl || pdf.webViewLink;

      let dadosIA = {};
      let confianca = 0;
      let erroIA = null;

      try {
        dadosIA = await invokeLLM(base44.asServiceRole,{
          prompt: `Você é um especialista em relatórios culturais brasileiros de museus.
Analise este PDF de relatório e extraia TODOS os campos disponíveis em JSON estruturado.

Extraia exatamente:
{
  "nome_profissional": "nome completo do profissional/autor",
  "email_profissional": "email se existir no documento, senão null",
  "funcao": "função/cargo do profissional",
  "museu": "nome ou sigla do museu (MIS, MHAB, MUMO ou nome completo)",
  "mes_referencia": "nome do mês em português (ex: março)",
  "ano": número do ano (ex: 2026),
  "numero_protocolo": "número de protocolo se houver, senão null",
  "status_relatorio": "APROVADO, SUBMETIDO, EM_REVISAO ou RASCUNHO se indicado",
  "resumo_periodo": "resumo do período em texto livre",
  "resumo_executivo": "resumo executivo",
  "comentarios_gerais": "comentários gerais",
  "pontos_positivos": "pontos positivos",
  "desafios": "desafios encontrados",
  "sugestoes": "sugestões",
  "publico_geral": número estimado de público total declarado ou 0,
  "centro_custo": "MIS, MHAB, MUMO, Geral ou null",
  "atividades": [
    {
      "titulo": "título da atividade",
      "descricao": "descrição",
      "data_realizacao": "YYYY-MM-DD ou null",
      "data_inicio": "YYYY-MM-DD ou null",
      "data_fim": "YYYY-MM-DD ou null",
      "publico_estimado": número ou 0,
      "publico_total": número ou 0,
      "classificacao": "META, ROTINA ou EXTRA",
      "meta_vinculada": "código ou descrição da meta ou null",
      "resultado_alcancado": "resultado alcançado ou null",
      "justificativa_tecnica": "justificativa ou null",
      "equipe_responsavel": "equipe ou null",
      "produtos_entregues": ["lista", "de", "produtos"],
      "fotos_citadas": ["nomes ou descrições de fotos associadas"]
    }
  ],
  "fotos": [
    {
      "nome_arquivo": "nome ou referência do arquivo",
      "legenda": "legenda da foto",
      "atividade_relacionada": "título da atividade relacionada ou null"
    }
  ]
}

Retorne APENAS o JSON válido sem explicações.`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              nome_profissional: { type: 'string' },
              email_profissional: { type: 'string' },
              funcao: { type: 'string' },
              museu: { type: 'string' },
              mes_referencia: { type: 'string' },
              ano: { type: 'number' },
              numero_protocolo: { type: 'string' },
              status_relatorio: { type: 'string' },
              resumo_periodo: { type: 'string' },
              resumo_executivo: { type: 'string' },
              comentarios_gerais: { type: 'string' },
              pontos_positivos: { type: 'string' },
              desafios: { type: 'string' },
              sugestoes: { type: 'string' },
              publico_geral: { type: 'number' },
              centro_custo: { type: 'string' },
              atividades: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    titulo: { type: 'string' },
                    descricao: { type: 'string' },
                    data_realizacao: { type: 'string' },
                    data_inicio: { type: 'string' },
                    data_fim: { type: 'string' },
                    publico_estimado: { type: 'number' },
                    publico_total: { type: 'number' },
                    classificacao: { type: 'string' },
                    meta_vinculada: { type: 'string' },
                    resultado_alcancado: { type: 'string' },
                    justificativa_tecnica: { type: 'string' },
                    equipe_responsavel: { type: 'string' },
                    produtos_entregues: { type: 'array', items: { type: 'string' } },
                    fotos_citadas: { type: 'array', items: { type: 'string' } }
                  }
                }
              },
              fotos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nome_arquivo: { type: 'string' },
                    legenda: { type: 'string' },
                    atividade_relacionada: { type: 'string' }
                  }
                }
              }
            }
          },
          model: 'claude_sonnet_4_6'
        });
        confianca = 80;
      } catch (e) {
        erroIA = e.message;
        confianca = 0;
      }

      const mesInfo = normalizeMes(dadosIA.mes_referencia || pdf.name);
      const museuNorm = normalizeMuseu(dadosIA.museu || pdf.name);
      const ano = dadosIA.ano || new Date(pdf.createdTime || Date.now()).getFullYear();

      // Match user
      let usuarioVinculado = null;
      let usuarioStatus = 'nao_localizado';
      if (dadosIA.email_profissional) {
        usuarioVinculado = existingUsers.find(u => u.email?.toLowerCase() === dadosIA.email_profissional?.toLowerCase()) || null;
      }
      if (!usuarioVinculado && dadosIA.nome_profissional) {
        const nomeBusca = String(dadosIA.nome_profissional || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        usuarioVinculado = existingUsers.find(u => {
          const un = String(u.full_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
          return un && nomeBusca && (un.includes(nomeBusca.split(' ')[0]) || nomeBusca.includes(un.split(' ')[0]));
        }) || null;
        if (usuarioVinculado) confianca = Math.max(confianca - 10, 50);
      }
      if (usuarioVinculado) usuarioStatus = 'localizado';

      // Check duplicates
      const isDuplicate = existingReports.some(r => {
        if (r.created_by !== usuarioVinculado?.email && r.created_by_id !== usuarioVinculado?.id) return false;
        if (mesInfo && r.mes_referencia?.toLowerCase() !== mesInfo.mes) return false;
        if (ano && r.ano_referencia && r.ano_referencia !== ano) return false;
        return true;
      });

      // Assess confidence
      if (!dadosIA.nome_profissional) confianca -= 20;
      if (!mesInfo) confianca -= 15;
      if (!museuNorm) confianca -= 10;
      if (!dadosIA.atividades?.length) confianca -= 10;
      confianca = Math.max(0, Math.min(100, confianca));

      const camposAusentes = [];
      if (!dadosIA.nome_profissional) camposAusentes.push('nome_profissional');
      if (!dadosIA.email_profissional) camposAusentes.push('email_profissional');
      if (!mesInfo) camposAusentes.push('mes_referencia');
      if (!museuNorm) camposAusentes.push('museu');
      if (!dadosIA.atividades?.length) camposAusentes.push('atividades');

      // Match fotos from images in folder
      const fotosVinculadas = imagens.filter(img => {
        const imgName = img.name.toLowerCase();
        const museuStr = (museuNorm || '').toLowerCase();
        const nomeStr = (dadosIA.nome_profissional || '').toLowerCase().split(' ')[0];
        return imgName.includes(museuStr) || imgName.includes(nomeStr) ||
          (dadosIA.fotos || []).some(f => imgName.includes((f.nome_arquivo || '').toLowerCase().split('.')[0].slice(0, 8)));
      });

      resultados.push({
        arquivo_id: pdf.id,
        arquivo_nome: pdf.name,
        arquivo_url: pdf.webViewLink,
        dados_ia: dadosIA,
        profissional_nome: dadosIA.nome_profissional || null,
        profissional_email: dadosIA.email_profissional || null,
        usuario_vinculado: usuarioVinculado ? { id: usuarioVinculado.id, email: usuarioVinculado.email, nome: usuarioVinculado.full_name } : null,
        usuario_status: usuarioStatus,
        museu: museuNorm || dadosIA.museu || null,
        mes: mesInfo?.mes || dadosIA.mes_referencia || null,
        mes_num: mesInfo?.mesNum || null,
        ano,
        atividades_count: (dadosIA.atividades || []).length,
        publico_total: dadosIA.publico_geral || 0,
        fotos_count: fotosVinculadas.length,
        fotos_vinculadas: fotosVinculadas.map(f => ({ id: f.id, nome: f.name, url: f.webViewLink, thumbnail: f.thumbnailLink })),
        duplicidade: isDuplicate ? 'provavel' : 'nenhuma',
        campos_ausentes: camposAusentes,
        confianca,
        erro_ia: erroIA,
        selecionado: !isDuplicate && confianca >= 40,
      });
    }

    return Response.json({
      success: true,
      pasta_id: targetFolder,
      total_arquivos: arquivos.length,
      total_pdfs: pdfs.length,
      total_imagens: imagens.length,
      resultados,
      imagens_pasta: imagens.map(f => ({ id: f.id, nome: f.name, url: f.webViewLink, thumbnail: f.thumbnailLink })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});