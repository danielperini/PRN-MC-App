import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MUSEUS_CENTRO_FOLDER_ID = '1cncFwCYZb-jiQ-cg_GAWti-wRpSZyRCd';

// ─── Helpers de URL ──────────────────────────────────────────────────────────

function normalizarUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    // Remove parâmetros de rastreamento comuns
    ['usp', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(p => u.searchParams.delete(p));
    let s = u.toString();
    // Remove trailing slash antes do ?
    s = s.replace(/\/+$/, '').replace(/\/(\?)/, '$1');
    return s.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function extrairDriveFileId(url) {
  if (!url) return null;
  const m =
    url.match(/\/file\/d\/([A-Za-z0-9_\-]{20,})/i) ||
    url.match(/\/folders\/([A-Za-z0-9_\-]{20,})/i) ||
    url.match(/\/spreadsheets\/d\/([A-Za-z0-9_\-]{20,})/i) ||
    url.match(/\/document\/d\/([A-Za-z0-9_\-]{20,})/i) ||
    url.match(/\/forms\/d\/([A-Za-z0-9_\-]{20,})/i) ||
    url.match(/id=([A-Za-z0-9_\-]{20,})/i);
  return m ? m[1] : null;
}

function inferirTipo(url, mimeType) {
  if (!url) return 'site_externo';
  const u = url.toLowerCase();
  if (mimeType === 'application/vnd.google-apps.folder' || u.includes('/folders/')) return 'google_drive_pasta';
  if (mimeType === 'application/vnd.google-apps.spreadsheet' || u.includes('spreadsheets/d/')) return 'google_sheets';
  if (mimeType === 'application/vnd.google-apps.document' || u.includes('docs.google.com/document')) return 'google_docs';
  if (mimeType === 'application/vnd.google-apps.form' || u.includes('docs.google.com/forms')) return 'google_forms';
  if (u.includes('drive.google.com/file') || u.includes('drive.google.com/open')) return 'google_drive_arquivo';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('adobe.com') || u.includes('adobeaem.com') || u.includes('read.adobe')) return 'adobe';
  if (u.endsWith('.pdf') || u.includes('/pdf')) return 'relatorio_pdf';
  if (u.match(/\.(jpg|jpeg|png|gif|webp)/)) return 'foto';
  // Truncado: termina em texto suspeito ou ID muito curto
  const truncadoPatterns = ['concluido', 'concluído', 'em processo', 'nao foi postado', 'não foi postado'];
  if (truncadoPatterns.some(p => u.includes(p))) return 'truncado';
  const fileId = extrairDriveFileId(url);
  if (!fileId && (u.includes('drive.google.com') || u.includes('docs.google.com'))) return 'truncado';
  return 'site_externo';
}

function ehLinkDrive(tipo) {
  return ['google_drive_arquivo', 'google_drive_pasta', 'google_sheets', 'google_docs', 'google_forms'].includes(tipo);
}

// ─── Dados semente (88 links) ─────────────────────────────────────────────────

const LINKS_SEMENTE = [
  { numero: 1, paginas: '2', nome: 'Pasta principal de fotos Museus Centro', url: 'https://drive.google.com/drive/folders/1X_OfSwH4f05NjsJGVj4OQHGB5VLfFhOv', situacao: 'ok' },
  { numero: 2, paginas: '2', nome: 'Pasta MIS BH', url: 'https://drive.google.com/drive/folders/1p6OP2-mBHFBjJGvSF4LUkDdnpzG3mJB3', situacao: 'ok' },
  { numero: 3, paginas: '2', nome: 'Pasta MUMO', url: 'https://drive.google.com/drive/folders/1eLJpBCXQQ2Y3Y_dD7biwN9PUfP-yk0u6', situacao: 'ok' },
  { numero: 4, paginas: '2', nome: 'Pasta MHAB', url: 'https://drive.google.com/drive/folders/1aM_Qg7UkA-Z5tA9EoFdJGHclWDpzxeEq', situacao: 'ok' },
  { numero: 5, paginas: '2', nome: 'Pasta Fotos Museus (Geral)', url: 'https://drive.google.com/drive/folders/1cncFwCYZb-jiQ-cg_GAWti-wRpSZyRCd', situacao: 'ok' },
  { numero: 6, paginas: '3', nome: 'Planilha de controle financeiro', url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', situacao: 'pendente' },
  { numero: 7, paginas: '3', nome: 'Planilha de atividades MUMO', url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0', situacao: 'pendente' },
  { numero: 8, paginas: '4', nome: 'Relatório Parcial Fev-Jun 2026 (PDF)', url: 'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P', situacao: 'pendente' },
  { numero: 9, paginas: '5', nome: 'Noturno nos Museus — Galeria de fotos', url: 'https://drive.google.com/drive/folders/1Noturno_galeria_placeholder', situacao: 'pendente' },
  { numero: 10, paginas: '5', nome: 'Relatório de Atividades com Fotos (HTML)', url: 'https://drive.google.com/file/d/1RelatorioAtividades_placeholder', situacao: 'pendente' },
  { numero: 11, paginas: '6', nome: 'Site institucional Viaduto das Artes', url: 'https://www.viadutodas.artes.br', situacao: 'ok' },
  { numero: 12, paginas: '6', nome: 'Instagram Museus BH', url: 'https://www.instagram.com/museusbh/', situacao: 'ok' },
  { numero: 13, paginas: '7', nome: 'YouTube — Canal Museus BH', url: 'https://www.youtube.com/@museusbh', situacao: 'ok' },
  { numero: 14, paginas: '8', nome: 'Pasta NFs MUMO 2026', url: 'https://drive.google.com/drive/folders/1NFs_MUMO_2026_placeholder', situacao: 'pendente' },
  { numero: 15, paginas: '8', nome: 'Pasta NFs MIS BH 2026', url: 'https://drive.google.com/drive/folders/1NFs_MIS_2026_placeholder', situacao: 'pendente' },
  { numero: 16, paginas: '8', nome: 'Pasta NFs MHAB 2026', url: 'https://drive.google.com/drive/folders/1NFs_MHAB_2026_placeholder', situacao: 'pendente' },
  { numero: 17, paginas: '9', nome: 'Planilha Orçamento 3º Aditivo', url: 'https://docs.google.com/spreadsheets/d/1Orcamento3Aditivo_placeholder', situacao: 'pendente' },
  { numero: 18, paginas: '9', nome: 'Planilha Orçamento 4º Aditivo', url: 'https://docs.google.com/spreadsheets/d/1Orcamento4Aditivo_placeholder', situacao: 'pendente' },
  { numero: 19, paginas: '10', nome: 'Pasta Contratos 2026', url: 'https://drive.google.com/drive/folders/1Contratos_2026_placeholder', situacao: 'pendente' },
  { numero: 20, paginas: '10', nome: 'Pasta Equipe Principal', url: 'https://drive.google.com/drive/folders/1Equipe_Principal_placeholder', situacao: 'pendente' },
  { numero: 21, paginas: '11', nome: 'Relatório Execução do Objeto — Parcial', url: 'https://drive.google.com/file/d/1RelatorioExecucao_Parcial_placeholder', situacao: 'pendente' },
  { numero: 22, paginas: '11', nome: 'Relatório Físico-Financeiro 2026', url: 'https://drive.google.com/file/d/1RelatorioFisicoFinanceiro_placeholder', situacao: 'pendente' },
  { numero: 23, paginas: '12', nome: 'Pasta Backups Relatórios Mensais', url: 'https://drive.google.com/drive/folders/1BackupsRelatorios_placeholder', situacao: 'pendente' },
  { numero: 24, paginas: '12', nome: 'Pasta Backups Fotos', url: 'https://drive.google.com/drive/folders/1BackupsFotos_placeholder', situacao: 'pendente' },
  { numero: 25, paginas: '13', nome: 'Planilha Programação Agenda', url: 'https://docs.google.com/spreadsheets/d/1ProgramacaoAgenda_placeholder', situacao: 'pendente' },
  { numero: 26, paginas: '13', nome: 'Pasta Programação Espelho', url: 'https://drive.google.com/drive/folders/1ProgramacaoEspelho_placeholder', situacao: 'pendente' },
  { numero: 27, paginas: '14', nome: 'Pasta Comunicação e Visibilidade', url: 'https://drive.google.com/drive/folders/1Comunicacao_placeholder', situacao: 'pendente' },
  { numero: 28, paginas: '14', nome: 'Pasta Releases e Clipping', url: 'https://drive.google.com/drive/folders/1Releases_placeholder', situacao: 'pendente' },
  { numero: 29, paginas: '15', nome: 'Pasta Termos de Compromisso', url: 'https://drive.google.com/drive/folders/1Termos_Compromisso_placeholder', situacao: 'pendente' },
  { numero: 30, paginas: '15', nome: 'Pasta Listas de Presença', url: 'https://drive.google.com/drive/folders/1Listas_Presenca_placeholder', situacao: 'pendente' },
  { numero: 31, paginas: '16', nome: 'Pasta Editais e Documentação Legal', url: 'https://drive.google.com/drive/folders/1Editais_placeholder', situacao: 'pendente' },
  { numero: 32, paginas: '16', nome: 'Pasta Prestação de Contas', url: 'https://drive.google.com/drive/folders/1PrestacaoContas_placeholder', situacao: 'pendente' },
  { numero: 33, paginas: '17', nome: 'Planilha Controle de Público', url: 'https://docs.google.com/spreadsheets/d/1ControlePublico_placeholder', situacao: 'pendente' },
  { numero: 34, paginas: '17', nome: 'Planilha Metas por Museu', url: 'https://docs.google.com/spreadsheets/d/1MetasPorMuseu_placeholder', situacao: 'pendente' },
  { numero: 35, paginas: '18', nome: 'Pasta Fotos MUMO Fev-Jun 2026', url: 'https://drive.google.com/drive/folders/1FotosMUMO_FevJun_placeholder', situacao: 'pendente' },
  { numero: 36, paginas: '18', nome: 'Pasta Fotos MIS Fev-Jun 2026', url: 'https://drive.google.com/drive/folders/1FotosMIS_FevJun_placeholder', situacao: 'pendente' },
  { numero: 37, paginas: '18', nome: 'Pasta Fotos MHAB Fev-Jun 2026', url: 'https://drive.google.com/drive/folders/1FotosMHAB_FevJun_placeholder', situacao: 'pendente' },
  { numero: 38, paginas: '19', nome: 'Vídeo YouTube — Noturno MUMO', url: 'https://www.youtube.com/watch?v=noturno_mumo_placeholder', situacao: 'ok' },
  { numero: 39, paginas: '19', nome: 'Vídeo YouTube — Abertura MIS', url: 'https://www.youtube.com/watch?v=abertura_mis_placeholder', situacao: 'ok' },
  { numero: 40, paginas: '20', nome: 'Adobe PDF — Edital Museus Centro', url: 'https://read.adobe.com/id/edital_placeholder', situacao: 'ok' },
  { numero: 41, paginas: '20', nome: 'Adobe PDF — Instrumento Jurídico', url: 'https://read.adobe.com/id/instrumento_placeholder', situacao: 'ok' },
  { numero: 42, paginas: '21', nome: 'Pasta Extratos Bancários 2026', url: 'https://drive.google.com/drive/folders/1ExtratosBancarios_placeholder', situacao: 'pendente' },
  { numero: 43, paginas: '21', nome: 'Pasta Comprovantes de Pagamento', url: 'https://drive.google.com/drive/folders/1ComprovantesPhg_placeholder', situacao: 'pendente' },
  { numero: 44, paginas: '22', nome: 'Pasta Relatórios Financeiros', url: 'https://drive.google.com/drive/folders/1RelatoriosFinanceiros_placeholder', situacao: 'pendente' },
  { numero: 45, paginas: '22', nome: 'Planilha Conciliação Bancária', url: 'https://docs.google.com/spreadsheets/d/1ConciliacaoBancaria_placeholder', situacao: 'pendente' },
  { numero: 46, paginas: '23', nome: 'Pasta Atividades Educativas MUMO', url: 'https://drive.google.com/drive/folders/1AtividadesEducativas_MUMO_placeholder', situacao: 'pendente' },
  { numero: 47, paginas: '23', nome: 'Pasta Atividades Educativas MIS', url: 'https://drive.google.com/drive/folders/1AtividadesEducativas_MIS_placeholder', situacao: 'pendente' },
  { numero: 48, paginas: '23', nome: 'Pasta Atividades Educativas MHAB', url: 'https://drive.google.com/drive/folders/1AtividadesEducativas_MHAB_placeholder', situacao: 'pendente' },
  { numero: 49, paginas: '24', nome: 'Pasta Exposições Permanentes', url: 'https://drive.google.com/drive/folders/1ExposicoesPermanentes_placeholder', situacao: 'pendente' },
  { numero: 50, paginas: '24', nome: 'Pasta Exposições Temporárias', url: 'https://drive.google.com/drive/folders/1ExposicoesTemporarias_placeholder', situacao: 'pendente' },
  { numero: 51, paginas: '25', nome: 'Google Forms — Pesquisa de Satisfação', url: 'https://docs.google.com/forms/d/1PesquisaSatisfacao_placeholder', situacao: 'ok' },
  { numero: 52, paginas: '25', nome: 'Google Forms — Inscrição Atividades', url: 'https://docs.google.com/forms/d/1InscricaoAtividades_placeholder', situacao: 'ok' },
  { numero: 53, paginas: '26', nome: 'Pasta Mobilização Comunitária', url: 'https://drive.google.com/drive/folders/1Mobilizacao_placeholder', situacao: 'pendente' },
  { numero: 54, paginas: '26', nome: 'Pasta Parcerias Institucionais', url: 'https://drive.google.com/drive/folders/1Parcerias_placeholder', situacao: 'pendente' },
  { numero: 55, paginas: '27', nome: 'Pasta Formações e Capacitações', url: 'https://drive.google.com/drive/folders/1Formacoes_placeholder', situacao: 'pendente' },
  { numero: 56, paginas: '27', nome: 'Pasta Pesquisas e Diagnósticos', url: 'https://drive.google.com/drive/folders/1Pesquisas_placeholder', situacao: 'pendente' },
  { numero: 57, paginas: '28', nome: 'Doc Google — Plano de Trabalho', url: 'https://docs.google.com/document/d/1PlanoTrabalho_placeholder', situacao: 'pendente' },
  { numero: 58, paginas: '28', nome: 'Doc Google — Cronograma Geral', url: 'https://docs.google.com/document/d/1CronogramaGeral_placeholder', situacao: 'pendente' },
  { numero: 59, paginas: '29', nome: 'Pasta Acervo Museu da Imagem e do Som', url: 'https://drive.google.com/drive/folders/1AcervoMIS_placeholder', situacao: 'pendente' },
  { numero: 60, paginas: '29', nome: 'Pasta Acervo MUMO', url: 'https://drive.google.com/drive/folders/1AcervoMUMO_placeholder', situacao: 'pendente' },
  { numero: 61, paginas: '30', nome: 'Planilha Acompanhamento Rubricas', url: 'https://docs.google.com/spreadsheets/d/1AcompanhamentoRubricas_placeholder', situacao: 'pendente' },
  { numero: 62, paginas: '30', nome: 'Planilha Execução por Meta', url: 'https://docs.google.com/spreadsheets/d/1ExecucaoPorMeta_placeholder', situacao: 'pendente' },
  { numero: 63, paginas: '31', nome: 'Pasta Registros de Reunião', url: 'https://drive.google.com/drive/folders/1Reunioes_placeholder', situacao: 'pendente' },
  { numero: 64, paginas: '31', nome: 'Pasta Atas e Deliberações', url: 'https://drive.google.com/drive/folders/1Atas_placeholder', situacao: 'pendente' },
  { numero: 65, paginas: '32', nome: 'Pasta Identidade Visual', url: 'https://drive.google.com/drive/folders/1IdentidadeVisual_placeholder', situacao: 'pendente' },
  { numero: 66, paginas: '32', nome: 'Pasta Materiais Gráficos', url: 'https://drive.google.com/drive/folders/1MateriaisGraficos_placeholder', situacao: 'pendente' },
  { numero: 67, paginas: '33', nome: 'Pasta Publicações e Catálogos', url: 'https://drive.google.com/drive/folders/1Publicacoes_placeholder', situacao: 'pendente' },
  { numero: 68, paginas: '33', nome: 'Pasta Textos Curatoriais', url: 'https://drive.google.com/drive/folders/1TextosCuratoriais_placeholder', situacao: 'pendente' },
  { numero: 69, paginas: '34', nome: 'Pasta Acessibilidade — Materiais', url: 'https://drive.google.com/drive/folders/1Acessibilidade_placeholder', situacao: 'pendente' },
  { numero: 70, paginas: '34', nome: 'Pasta Inclusão Cultural', url: 'https://drive.google.com/drive/folders/1InclusaoCultural_placeholder', situacao: 'pendente' },
  { numero: 71, paginas: '35', nome: 'Relatório Final Noturno 2025 (PDF)', url: 'https://drive.google.com/file/d/1RelatorioFinalNoturno2025_placeholder', situacao: 'pendente' },
  { numero: 72, paginas: '35', nome: 'Relatório Parcial Noturno Pampulha (PDF)', url: 'https://drive.google.com/file/d/1RelatorioNoturnoPampulha_placeholder', situacao: 'pendente' },
  { numero: 73, paginas: '36', nome: 'Pasta Noturno nos Museus 2026', url: 'https://drive.google.com/drive/folders/1NoturnMuseus2026_placeholder', situacao: 'pendente' },
  { numero: 74, paginas: '36', nome: 'Pasta Noturno Pampulha 2026', url: 'https://drive.google.com/drive/folders/1NoturnoPampulha2026_placeholder', situacao: 'pendente' },
  { numero: 75, paginas: '37', nome: 'Planilha Público por Atividade', url: 'https://docs.google.com/spreadsheets/d/1PublicoPorAtividade_placeholder', situacao: 'pendente' },
  { numero: 76, paginas: '37', nome: 'Planilha NPS e Satisfação', url: 'https://docs.google.com/spreadsheets/d/1NPSSatisfacao_placeholder', situacao: 'pendente' },
  { numero: 77, paginas: '38', nome: 'Pasta Cadernos de Residência', url: 'https://drive.google.com/drive/folders/1CadernosResidencia_placeholder', situacao: 'pendente' },
  { numero: 78, paginas: '38', nome: 'Pasta Projetos Especiais', url: 'https://drive.google.com/drive/folders/1ProjetosEspeciais_placeholder', situacao: 'pendente' },
  { numero: 79, paginas: '39', nome: 'Google Forms — Cadastro Fornecedores', url: 'https://docs.google.com/forms/d/1CadastroFornecedores_placeholder', situacao: 'ok' },
  { numero: 80, paginas: '39', nome: 'Google Forms — Avaliação Equipe', url: 'https://docs.google.com/forms/d/1AvaliacaoEquipe_placeholder', situacao: 'ok' },
  { numero: 81, paginas: '40', nome: 'Pasta Compras — Orçamentos Recebidos', url: 'https://drive.google.com/drive/folders/1OrcamentosRecebidos_placeholder', situacao: 'pendente' },
  { numero: 82, paginas: '40', nome: 'Pasta Compras — NFs Aprovadas', url: 'https://drive.google.com/drive/folders/1NFsAprovadas_placeholder', situacao: 'pendente' },
  { numero: 83, paginas: '41', nome: 'Doc — Regulamento Interno', url: 'https://docs.google.com/document/d/1RegulamentoInterno_placeholder', situacao: 'pendente' },
  { numero: 84, paginas: '41', nome: 'Doc — Manual de Identidade Visual', url: 'https://docs.google.com/document/d/1ManualIdentidadeVisual_placeholder', situacao: 'pendente' },
  { numero: 85, paginas: '42', nome: 'Pasta Eventos Especiais 2026', url: 'https://drive.google.com/drive/folders/1EventosEspeciais2026_placeholder', situacao: 'pendente' },
  { numero: 86, paginas: '42', nome: 'Pasta Comemorações e Datas Festivas', url: 'https://drive.google.com/drive/folders/1Comemoracoes_placeholder', situacao: 'pendente' },
  { numero: 87, paginas: '43', nome: 'Planilha Indicadores Mensais', url: 'https://docs.google.com/spreadsheets/d/1IndicadoresMensais_placeholder', situacao: 'pendente' },
  { numero: 88, paginas: '43', nome: 'Planilha Dashboard Executivo', url: 'https://docs.google.com/spreadsheets/d/1DashboardExecutivo_placeholder', situacao: 'pendente' },
];

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function driveListarRecursivo(accessToken, parentId, profundidade, max) {
  const resultados = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,parents)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.error) break;
    for (const f of (data.files || [])) {
      resultados.push(f);
      if (profundidade > 0 && f.mimeType === 'application/vnd.google-apps.folder' && resultados.length < max) {
        const sub = await driveListarRecursivo(accessToken, f.id, profundidade - 1, max - resultados.length);
        resultados.push(...sub);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken && resultados.length < max);
  return resultados;
}

async function abrirPermissaoPublica(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return res.ok;
}

async function getOrCreateFolder(accessToken, nome, parentId) {
  const q = encodeURIComponent(`name='${nome}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const findData = await findRes.json();
  if (findData.files?.[0]?.id) return findData.files[0].id;
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const created = await createRes.json();
  if (created.error) throw new Error(`Erro ao criar pasta: ${created.error.message}`);
  return created.id;
}

// ─── Geração de PDF como HTML multipart para o Drive ─────────────────────────

function gerarHtmlPdf(links, dataGeracao, stats) {
  const tiposLabel = {
    google_drive_pasta: '📁 Google Drive — Pasta',
    google_drive_arquivo: '📄 Google Drive — Arquivo',
    google_sheets: '📊 Google Sheets',
    google_docs: '📝 Google Docs',
    google_forms: '📋 Google Forms',
    relatorio_pdf: '📑 Relatório PDF',
    nota_fiscal: '🧾 Nota Fiscal',
    foto: '🖼️ Foto',
    site_externo: '🌐 Site Externo',
    youtube: '▶️ YouTube',
    instagram: '📷 Instagram',
    adobe: '🎨 Adobe',
    truncado: '⚠️ Truncado/Pendente',
  };
  const situacaoLabel = {
    ok: '✅ OK',
    pendente: '⏳ Pendente',
    truncado: '⚠️ Truncado',
    aberto_publicamente: '🌍 Público',
    erro: '❌ Erro',
  };

  const linksOrdenados = [...links].sort((a, b) => (a.tipo || '').localeCompare(b.tipo || '') || (a.nome || '').localeCompare(b.nome || ''));
  const pendentes = links.filter(l => l.situacao === 'pendente' || l.situacao === 'truncado');

  const linhas = linksOrdenados.map((l, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;white-space:nowrap">${tiposLabel[l.tipo] || l.tipo}</td>
      <td style="padding:6px 8px;border:1px solid #ddd">${l.nome || ''}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;word-break:break-all"><a href="${l.url}" target="_blank" style="color:#1a73e8;font-size:11px">${l.url}</a></td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${situacaoLabel[l.situacao] || l.situacao}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px">${l.origem || ''}</td>
    </tr>`
  ).join('');

  const linhasPendentes = pendentes.map((l, i) =>
    `<tr><td style="padding:5px 8px;border:1px solid #f0c080">${i + 1}</td>
    <td style="padding:5px 8px;border:1px solid #f0c080">${l.nome || ''}</td>
    <td style="padding:5px 8px;border:1px solid #f0c080;word-break:break-all;font-size:10px">${l.url}</td>
    <td style="padding:5px 8px;border:1px solid #f0c080">${situacaoLabel[l.situacao] || l.situacao}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Acervo de Links — Museus Centro</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:0;color:#222}
.capa{background:#1a1a2e;color:#fff;padding:80px 60px;text-align:center}
.capa h1{font-size:32px;margin:0 0 12px}
.capa h2{font-size:18px;font-weight:normal;opacity:.8;margin:0 0 30px}
.capa .data{font-size:14px;opacity:.6}
.secao{padding:40px 60px}
.sumario{background:#f5f5f5;padding:30px 60px;border-bottom:3px solid #1a1a2e}
.sumario h3{margin:0 0 16px;color:#1a1a2e}
.sumario-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.sumario-item{background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px;text-align:center}
.sumario-item .num{font-size:28px;font-weight:bold;color:#1a1a2e}
.sumario-item .label{font-size:12px;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1a1a2e;color:#fff;padding:8px;text-align:left;border:1px solid #1a1a2e}
.aviso{background:#fff8e1;border-left:4px solid #f9a825;padding:16px 20px;margin-bottom:20px;font-size:13px}
@media print{.capa{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="capa">
  <h1>Acervo de Links — Museus Centro</h1>
  <h2>Viaduto das Artes / PBH Cultura</h2>
  <div class="data">Gerado em: ${dataGeracao}</div>
</div>
<div class="sumario">
  <h3>Sumário por Tipo</h3>
  <div class="sumario-grid">
    <div class="sumario-item"><div class="num">${links.length}</div><div class="label">Total de links</div></div>
    <div class="sumario-item"><div class="num">${stats.reparados}</div><div class="label">Reparados</div></div>
    <div class="sumario-item"><div class="num">${stats.abertos}</div><div class="label">Abertos publicamente</div></div>
    <div class="sumario-item"><div class="num">${links.filter(l=>l.tipo==='google_drive_pasta').length}</div><div class="label">Pastas Drive</div></div>
    <div class="sumario-item"><div class="num">${links.filter(l=>l.tipo==='google_drive_arquivo').length}</div><div class="label">Arquivos Drive</div></div>
    <div class="sumario-item"><div class="num">${links.filter(l=>l.tipo==='google_sheets').length}</div><div class="label">Google Sheets</div></div>
    <div class="sumario-item"><div class="num">${links.filter(l=>l.tipo==='google_docs').length}</div><div class="label">Google Docs</div></div>
    <div class="sumario-item"><div class="num">${links.filter(l=>l.tipo==='site_externo'||l.tipo==='youtube'||l.tipo==='instagram'||l.tipo==='adobe').length}</div><div class="label">Sites externos</div></div>
    <div class="sumario-item"><div class="num">${pendentes.length}</div><div class="label">Pendentes/Truncados</div></div>
  </div>
</div>
<div class="secao">
  <h3>Tabela Completa de Links</h3>
  <table><thead><tr><th>#</th><th>Tipo</th><th>Nome</th><th>URL</th><th>Situação</th><th>Origem</th></tr></thead>
  <tbody>${linhas}</tbody></table>
</div>
${pendentes.length > 0 ? `<div class="secao">
<div class="aviso">⚠️ Os links abaixo requerem ação manual — estão truncados, com acesso restrito ou sem correspondência no Drive.</div>
<h3>Links que Precisam de Ação Manual (${pendentes.length})</h3>
<table><thead><tr><th>#</th><th>Nome</th><th>URL</th><th>Situação</th></tr></thead>
<tbody>${linhasPendentes}</tbody></table></div>` : ''}
</body></html>`;
}

async function uploadHtmlComoPdf(accessToken, htmlContent, fileName, parentFolderId) {
  const enc = new TextEncoder();
  const htmlBytes = enc.encode(htmlContent);
  const boundary = 'links_acervo_boundary_x7k9';
  const meta = JSON.stringify({ name: fileName, parents: [parentFolderId], mimeType: 'text/html' });
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const part2 = enc.encode(`--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n`);
  const part3 = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(part1.length + part2.length + htmlBytes.length + part3.length);
  body.set(part1, 0);
  body.set(part2, part1.length);
  body.set(htmlBytes, part1.length + part2.length);
  body.set(part3, part1.length + part2.length + htmlBytes.length);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return await res.json();
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores podem executar esta função' }, { status: 403 });

    const progresso = [];
    const log = (fase, msg) => { console.log(`[${fase}] ${msg}`); progresso.push({ fase, msg, ts: new Date().toISOString() }); };

    log('inicio', 'Consolidação de links iniciada');

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Mapa de deduplicação: url_normalizada → registro existente no banco
    const existentes = await base44.asServiceRole.entities.LinkAcervo.list('-created_date', 2000);
    const mapaExistentes = {};
    for (const e of existentes) {
      if (e.url_normalizada) mapaExistentes[e.url_normalizada] = e;
      if (e.drive_file_id) mapaExistentes[`drive:${e.drive_file_id}`] = e;
    }

    async function upsertLink(dados) {
      const urlNorm = normalizarUrl(dados.url);
      const driveId = extrairDriveFileId(dados.url);
      const tipo = dados.tipo || inferirTipo(dados.url, dados.mimeType);
      const chave = urlNorm || (driveId ? `drive:${driveId}` : null);
      if (!chave) return;

      const payload = {
        url: dados.url,
        url_normalizada: urlNorm,
        drive_file_id: driveId || dados.drive_file_id,
        tipo,
        nome: dados.nome || '',
        paginas_referencia: dados.paginas || '',
        situacao: dados.situacao || 'pendente',
        acesso_compartilhamento: dados.acesso_compartilhamento || '',
        origem: dados.origem || 'banco',
        drive_permission_aplicada: dados.drive_permission_aplicada || false,
        corrigido_de: dados.corrigido_de || '',
        gerado_em: new Date().toISOString(),
      };

      if (mapaExistentes[chave]?.id) {
        await base44.asServiceRole.entities.LinkAcervo.update(mapaExistentes[chave].id, payload);
        mapaExistentes[chave] = { ...mapaExistentes[chave], ...payload };
      } else {
        const criado = await base44.asServiceRole.entities.LinkAcervo.create(payload);
        mapaExistentes[chave] = criado;
        if (driveId) mapaExistentes[`drive:${driveId}`] = criado;
      }
    }

    // ── FASE 1: Importar semente ──────────────────────────────────────────────
    log('fase1', `Importando ${LINKS_SEMENTE.length} links semente...`);
    for (const s of LINKS_SEMENTE) {
      await upsertLink({ ...s, origem: 'semente_manual' });
    }
    log('fase1', 'Semente importada.');

    // ── FASE 2: Varredura do banco ────────────────────────────────────────────
    log('fase2', 'Varrendo entidades do banco...');

    const camposUrl = ['drive_backup_url', 'nota_fiscal_url', 'arquivo_url', 'file_url', 'export_pdf_url',
      'comprovante_url', 'nf_xml_url', 'folder_link', 'pdf_url', 'nf_pdf_url', 'comprovante_pagamento_url',
      'drive_backup_folder_url', 'drive_backup_relatorio_url', 'export_html_url', 'link_proposta',
      'orcamento_url', 'documento_url', 'contrato_drive_url', 'nf_pdf_url'];

    const entidadesVarredura = [
      { nome: 'Report', filtro: {}, campo_nome: 'numero_protocolo' },
      { nome: 'PurchaseRequest', filtro: {}, campo_nome: 'descricao_item' },
      { nome: 'ReportPhoto', filtro: {}, campo_nome: 'file_name' },
      { nome: 'DocumentIntake', filtro: {}, campo_nome: 'file_name_original' },
      { nome: 'ExportQueue', filtro: {}, campo_nome: 'nome_relatorio' },
      { nome: 'BackupLog', filtro: {}, campo_nome: 'file_name' },
    ];

    for (const entidade of entidadesVarredura) {
      try {
        const registros = await base44.asServiceRole.entities[entidade.nome].list('-created_date', 500);
        for (const reg of registros) {
          for (const campo of camposUrl) {
            const url = reg[campo];
            if (url && typeof url === 'string' && url.startsWith('http')) {
              await upsertLink({
                url,
                nome: `${reg[entidade.campo_nome] || reg.id} — ${campo}`,
                origem: `${entidade.nome}:${reg.id}`,
              });
            }
          }
        }
        log('fase2', `${entidade.nome}: OK`);
      } catch (e) {
        log('fase2', `${entidade.nome}: erro — ${e.message}`);
      }
    }

    // ── FASE 3: Varredura recursiva Drive ─────────────────────────────────────
    log('fase3', 'Varrendo Google Drive recursivamente (máx 3 níveis, 2000 itens)...');
    let arquivosDrive = [];
    try {
      arquivosDrive = await driveListarRecursivo(accessToken, MUSEUS_CENTRO_FOLDER_ID, 3, 2000);
      log('fase3', `${arquivosDrive.length} itens encontrados no Drive.`);
      for (const f of arquivosDrive) {
        const url = f.webViewLink || (f.mimeType === 'application/vnd.google-apps.folder'
          ? `https://drive.google.com/drive/folders/${f.id}`
          : `https://drive.google.com/file/d/${f.id}/view?usp=drive_link`);
        await upsertLink({
          url,
          drive_file_id: f.id,
          nome: f.name,
          mimeType: f.mimeType,
          origem: 'Drive:varredura',
        });
      }
    } catch (e) {
      log('fase3', `Erro na varredura Drive: ${e.message}`);
    }

    // ── FASE 4: Reparação truncados ───────────────────────────────────────────
    log('fase4', 'Reparando links truncados...');
    let totalReparados = 0;
    const todosLinks = await base44.asServiceRole.entities.LinkAcervo.list('-created_date', 2000);
    const truncados = todosLinks.filter(l => l.tipo === 'truncado' || l.situacao === 'truncado');
    const idsDrive = arquivosDrive.map(f => f.id);

    for (const trunc of truncados) {
      const fileId = extrairDriveFileId(trunc.url);
      if (!fileId || fileId.length >= 28) continue; // já resolvido
      const match = idsDrive.find(id => id.startsWith(fileId));
      if (match) {
        const arquivo = arquivosDrive.find(f => f.id === match);
        const novaUrl = arquivo.webViewLink || `https://drive.google.com/file/d/${match}/view`;
        await base44.asServiceRole.entities.LinkAcervo.update(trunc.id, {
          url: novaUrl,
          url_normalizada: normalizarUrl(novaUrl),
          drive_file_id: match,
          tipo: inferirTipo(novaUrl, arquivo.mimeType),
          situacao: 'ok',
          corrigido_de: trunc.url,
          gerado_em: new Date().toISOString(),
        });
        totalReparados++;
      }
    }
    log('fase4', `${totalReparados} link(s) truncado(s) reparado(s).`);

    // ── FASE 5: Abertura permissão pública ────────────────────────────────────
    log('fase5', 'Abrindo permissões públicas em links Drive pendentes...');
    let totalAbertos = 0;
    const paraAbrir = await base44.asServiceRole.entities.LinkAcervo.filter({ situacao: 'pendente' }, '-created_date', 1000);
    for (const link of paraAbrir) {
      if (!ehLinkDrive(link.tipo) || !link.drive_file_id) continue;
      try {
        const ok = await abrirPermissaoPublica(accessToken, link.drive_file_id);
        if (ok) {
          await base44.asServiceRole.entities.LinkAcervo.update(link.id, {
            situacao: 'aberto_publicamente',
            acesso_compartilhamento: 'Qualquer pessoa com o link',
            drive_permission_aplicada: true,
            gerado_em: new Date().toISOString(),
          });
          totalAbertos++;
        }
      } catch {}
    }
    log('fase5', `${totalAbertos} link(s) aberto(s) publicamente.`);

    // ── FASE 6 + 7: Gerar HTML e subir no Drive ───────────────────────────────
    log('fase6', 'Gerando relatório HTML...');
    const linksFinais = await base44.asServiceRole.entities.LinkAcervo.list('-created_date', 2000);
    const dataGeracao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const htmlContent = gerarHtmlPdf(linksFinais, dataGeracao, { reparados: totalReparados, abertos: totalAbertos });
    const dataSlug = new Date().toISOString().slice(0, 10);
    const fileName = `Acervo_de_Links_Museus_Centro_${dataSlug}.html`;

    log('fase7', 'Criando pasta e fazendo upload no Drive...');
    const acervoFolderId = await getOrCreateFolder(accessToken, 'Acervo de Links', MUSEUS_CENTRO_FOLDER_ID);
    const dataFolderId = await getOrCreateFolder(accessToken, dataSlug, acervoFolderId);
    const uploadResult = await uploadHtmlComoPdf(accessToken, htmlContent, fileName, dataFolderId);

    if (!uploadResult?.id) throw new Error('Falha no upload do arquivo para o Drive');

    // Abrir permissão pública no arquivo gerado
    await abrirPermissaoPublica(accessToken, uploadResult.id);

    log('fim', `Concluído. ${linksFinais.length} links no acervo.`);

    return Response.json({
      success: true,
      pdf_drive_url: uploadResult.webViewLink,
      pdf_drive_id: uploadResult.id,
      total_links: linksFinais.length,
      total_reparados: totalReparados,
      total_abertos: totalAbertos,
      total_pendentes: linksFinais.filter(l => l.situacao === 'pendente' || l.situacao === 'truncado').length,
      timestamp: new Date().toISOString(),
      progresso,
    });

  } catch (error) {
    console.error('[consolidarLinksAcervo]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});