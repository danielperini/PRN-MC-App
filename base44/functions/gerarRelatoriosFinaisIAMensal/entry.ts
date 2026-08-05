import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// gerarRelatoriosFinaisIAMensal
// Automação mensal (dia 23, 06h BRT): gera os 3 tipos de relatório do
// mês anterior e arquiva no Google Drive em  /Relatórios Finais IA/YYYY-MM - Mês/
//   ├── Execução do Objeto
//   ├── Relatórios Mensais
//   └── Físico-Financeiro
// Invoca o pipeline `gerarRelatorioCompleto` (etapa a etapa) e
// `generateSingleReportPDF` para os relatórios mensais individuais.
// =====================================================================

const ROOT_FOLDER_ID = '1MuP2BxtlYPNBfcaDi6cFRhtAufj0cFWY';
const PASTA_RELATORIOS_FINAIS = 'Relatórios Finais IA';
const PASTA_EXECUCAO = 'Execução do Objeto';
const PASTA_MENSAIS = 'Relatórios Mensais';
const PASTA_FISICO = 'Físico-Financeiro';

const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const ETAPAS_PIPELINE = [
  'contexto',
  'normalizacao_canonica',
  'textos_principais',
  'metas_detalhadas',
  'equipe_financeiro',
  'fotos_evidencias',
  'finalizar',
  'auditoria_factual',
];

// ─── Utilitários de string / datas ────────────────────────────────────────────

function sanitize(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[&/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function calcularPeriodo(body) {
  let ano = Number(body?.ano);
  let mesNum = Number(body?.mes); // 1-12
  if (!ano || !mesNum) {
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    ano = ref.getFullYear();
    mesNum = ref.getMonth() + 1;
  }
  const primeiroDia = new Date(ano, mesNum - 1, 1);
  const ultimoDia = new Date(ano, mesNum, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    ano,
    mesNum,
    mesNome: MESES_PT[mesNum - 1],
    data_inicio: `${ano}-${pad(mesNum)}-01`,
    data_fim: `${ano}-${pad(mesNum)}-${pad(ultimoDia.getDate())}`,
    labelPasta: `${ano}-${pad(mesNum)} - ${MESES_PT[mesNum - 1]}`,
  };
}

function nomeMesCurto(mesNome) {
  // "Julho" -> "Julho" (mantém capitalize); usado no nome do arquivo
  return mesNome || 'Mes';
}

// ─── Drive helpers (mesmo padrão de backupRelatoriosMensaisDrive) ────────────

async function findFolder(token, name, parentId) {
  const safe = String(name).replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files?.[0] || null;
}

async function createFolder(token, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await res.json();
  if (d.error) throw new Error(`Criar pasta "${name}": ${d.error.message}`);
  return d;
}

async function getOrCreateFolder(token, name, parentId) {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;
  return createFolder(token, name, parentId);
}

async function findFileByName(token, fileName, folderId) {
  const safe = String(fileName).replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${safe}' and '${folderId}' in parents and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files?.[0] || null;
}

async function uploadHtmlFile(token, fileName, htmlContent, folderId) {
  const enc = new TextEncoder();
  const htmlBytes = enc.encode(htmlContent);
  const boundary = 'rpt_finais_ia_boundary';
  const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'text/html' });
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const d = await res.json();
  if (d.error) throw new Error(`Upload "${fileName}": ${d.error.message}`);
  return d;
}

// ─── HTML do Relatório de Execução do Objeto ──────────────────────────────────

function buildExecucaoHtml(rel, periodo) {
  const txt = (campo) => esc(campo?.texto_editado || campo?.texto_ia || '-');
  const pa = rel.publico_alvo || {};
  const cron = Array.isArray(rel.cronograma_metas) ? rel.cronograma_metas : [];
  const equipe = Array.isArray(rel.equipe_trabalho) ? rel.equipe_trabalho : [];
  const anexos = Array.isArray(rel.anexos_evidencias) ? rel.anexos_evidencias : [];
  const ident = rel.identificacao_projeto || {};

  const cronRows = cron.map((m) => `
    <tr>
      <td>${esc(m.meta_nome || '-')}</td>
      <td>${esc(m.status_meta || '-')}</td>
      <td>${Number(m.percentual_execucao || 0)}%</td>
      <td>${esc(m.resultado_alcancado || '-')}</td>
    </tr>`).join('');

  const equipeRows = equipe.map((e) => `
    <tr>
      <td>${esc(e.nome || '-')}</td>
      <td>${esc(e.cargo || '-')}</td>
      <td>${esc(e.tipo_contratacao || '-')}</td>
      <td>${e.valor != null ? Number(e.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}</td>
      <td>${esc(e.periodo || '-')}</td>
    </tr>`).join('');

  const fotoGrid = anexos.slice(0, 30).map((a) => a.foto_url ? `
    <figure>
      <img src="${esc(a.foto_url)}" alt="${esc(a.legenda_ia || a.legenda_editada || 'Foto')}" />
      <figcaption>${esc(a.legenda_ia || a.legenda_editada || a.atividade_nome || '')}</figcaption>
    </figure>` : '').join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Relatório de Execução do Objeto — ${esc(periodo.mesNome)} ${periodo.ano}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:36px;color:#111;background:#fff}
  h1{font-size:24px;border-bottom:2px solid #111;padding-bottom:8px}
  h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f5f5f5;padding:16px;border-radius:6px;margin-bottom:16px;font-size:13px}
  .block{margin-top:12px;white-space:pre-wrap;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
  th{background:#f5f5f5}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
  figure{margin:0;border:1px solid #ddd;border-radius:8px;overflow:hidden}
  img{width:100%;height:160px;object-fit:cover;display:block;background:#f5f5f5}
  figcaption{font-size:11px;padding:6px;color:#444;text-align:center}
  footer{margin-top:48px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#888}
</style></head><body>
<h1>Relatório de Execução do Objeto — ${esc(periodo.mesNome)} ${periodo.ano}</h1>
<div class="meta">
  <span><b>Organização:</b> ${esc(ident.organizacao || 'Viaduto das Artes')}</span>
  <span><b>Projeto:</b> ${esc(ident.projeto || 'Museus Centro')}</span>
  <span><b>Tipo:</b> ${esc(rel.tipo || 'parcial')}</span>
  <span><b>Período:</b> ${esc(periodo.data_inicio)} a ${esc(periodo.data_fim)}</span>
  <span><b>Responsável:</b> ${esc(ident.responsavel || '-')}</span>
  <span><b>Status:</b> ${esc(rel.status || '-')}</span>
</div>

<h2>Identificação do Projeto</h2>
<div class="block"><p>Instrumento jurídico: ${esc(ident.instrumento_juridico || '-')}</p>
<p>Processo administrativo: ${esc(ident.processo_administrativo || '-')}</p>
<p>Vigência: ${esc(ident.vigencia_inicio || '-')} a ${esc(ident.vigencia_fim || '-')}</p></div>

<h2>Endereço de Execução</h2><div class="block"><p>${txt(rel.endereco_execucao)}</p></div>
<h2>Divulgação e Parceria</h2><div class="block"><p>${txt(rel.divulgacao_parceria)}</p></div>
<h2>Descrição das Ações</h2><div class="block"><p>${txt(rel.descricao_acoes)}</p></div>

<h2>Público-Alvo</h2>
<div class="meta">
  <span><b>Previsto direto:</b> ${Number(pa.previsto_direto || 0)}</span>
  <span><b>Previsto indireto:</b> ${Number(pa.previsto_indireto || 0)}</span>
  <span><b>Realizado direto:</b> ${Number(pa.realizado_direto || 0)}</span>
  <span><b>Realizado indireto:</b> ${Number(pa.realizado_indireto || 0)}</span>
</div>
<div class="block"><p>${esc(pa.texto_interpretativo_editado || pa.texto_interpretativo_ia || '-')}</p></div>

<h2>Cronograma de Metas</h2>
<table><thead><tr><th>Meta</th><th>Status</th><th>% Exec.</th><th>Resultado alcançado</th></tr></thead>
<tbody>${cronRows || '<tr><td colspan="4">Sem metas registradas.</td></tr>'}</tbody></table>

<h2>Equipe de Trabalho</h2>
<table><thead><tr><th>Nome</th><th>Cargo</th><th>Contratação</th><th>Valor</th><th>Período</th></tr></thead>
<tbody>${equipeRows || '<tr><td colspan="5">Sem equipe registrada.</td></tr>'}</tbody></table>

<h2>Impactos Econômicos e Sociais</h2><div class="block"><p>${txt(rel.impactos_economicos_sociais)}</p></div>
<h2>Sustentabilidade</h2><div class="block"><p>${txt(rel.sustentabilidade)}</p></div>
<h2>Avaliação da Parceria</h2><div class="block"><p>${txt(rel.avaliacao_parceria)}</p></div>

${fotoGrid ? `<h2>Fotos de Evidência</h2><div class="grid">${fotoGrid}</div>` : ''}

<footer>Gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | Museus Centro — Viaduto das Artes</footer>
</body></html>`;
}

// ─── HTML do Relatório Físico-Financeiro consolidado ──────────────────────────

function buildFisicoFinanceiroHtml(periodo, dados) {
  const { reports, activities, purchases, rubricas } = dados;
  const totalPublico = activities.reduce((s, a) => s + (Number(a.publico_total) || 0), 0);
  const totalGasto = purchases
    .filter((p) => p.incluir_no_somatorio !== false)
    .reduce((s, p) => {
      const v = p.valor_aprovado_admin ?? p.valor_pago ?? p.valor_solicitado ?? 0;
      return s + (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0);
    }, 0);
  const totalPrevisto = rubricas.reduce((s, r) => s + (r.valor_rubrica || r.valor_total || 0), 0);
  const pct = totalPrevisto > 0 ? ((totalGasto / totalPrevisto) * 100).toFixed(1) : '0.0';

  const relRows = (reports || []).slice(0, 60).map((r) => `
    <tr>
      <td>${esc(r.author_name || '-')}</td>
      <td>${esc(r.museu || '-')}</td>
      <td>${esc(r.funcao || '-')}</td>
      <td>${esc(r.status || '-')}</td>
      <td>${(r.atividades || []).length}</td>
    </tr>`).join('');

  const atvRows = (activities || []).slice(0, 60).map((a) => `
    <tr>
      <td>${esc(a.titulo || '-')}</td>
      <td>${esc(a.classificacao || '-')}</td>
      <td>${esc(a.museu || a.centro_custo || '-')}</td>
      <td>${Number(a.publico_total || 0)}</td>
    </tr>`).join('');

  const rubRows = (rubricas || []).slice(0, 60).map((r) => `
    <tr>
      <td>${esc(r.grupo || '-')}</td>
      <td>${esc(r.rubrica || r.nome || '-')}</td>
      <td>${Number(r.valor_rubrica || r.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
      <td>${Number(r.valor_utilizado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Relatório Físico-Financeiro — ${esc(periodo.mesNome)} ${periodo.ano}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:36px;color:#111;background:#fff}
  h1{font-size:24px;border-bottom:2px solid #111;padding-bottom:8px}
  h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0}
  .kpi{background:#f5f5f5;border-radius:8px;padding:16px;text-align:center}
  .kpi .v{font-size:26px;font-weight:700}
  .kpi .l{font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
  th{background:#f5f5f5}
  footer{margin-top:48px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#888}
</style></head><body>
<h1>Relatório Físico-Financeiro — ${esc(periodo.mesNome)} ${periodo.ano}</h1>
<p><b>Projeto:</b> Museus Centro · Viaduto das Artes — Período: ${esc(periodo.data_inicio)} a ${esc(periodo.data_fim)}</p>

<div class="kpis">
  <div class="kpi"><div class="v">${(reports || []).length}</div><div class="l">Relatórios</div></div>
  <div class="kpi"><div class="v">${totalPublico.toLocaleString('pt-BR')}</div><div class="l">Público</div></div>
  <div class="kpi"><div class="v">${pct}%</div><div class="l">Execução Orçamentária</div></div>
</div>

<p>Execução financeira do período: <b>${totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b> de <b>${totalPrevisto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b> previstos no orçamento consolidado das rubricas ativas do projeto.</p>

<h2>Relatórios Mensais do Período</h2>
<table><thead><tr><th>Profissional</th><th>Museu</th><th>Função</th><th>Status</th><th>Atividades</th></tr></thead>
<tbody>${relRows || '<tr><td colspan="5">Nenhum relatório.</td></tr>'}</tbody></table>

<h2>Atividades Executadas</h2>
<table><thead><tr><th>Atividade</th><th>Classificação</th><th>Museu</th><th>Público</th></tr></thead>
<tbody>${atvRows || '<tr><td colspan="4">Nenhuma atividade.</td></tr>'}</tbody></table>

<h2>Rubricas Orçamentárias</h2>
<table><thead><tr><th>Grupo</th><th>Rubrica</th><th>Previsto</th><th>Utilizado</th></tr></thead>
<tbody>${rubRows || '<tr><td colspan="4">Nenhuma rubrica.</td></tr>'}</tbody></table>

<footer>Gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | Museus Centro — Viaduto das Artes</footer>
</body></html>`;
}

// ─── Bloco: Relatório de Execução do Objeto ────────────────────────────────────

async function gerarExecucaoObjeto(srv, token, folderMesId, periodo, resumo) {
  const subPasta = await getOrCreateFolder(token, PASTA_EXECUCAO, folderMesId);
  const fileName = `RelatorioExecucao_${sanitize(nomeMesCurto(periodo.mesNome))}${periodo.ano}.html`;

  // Idempotência: se já existe na pasta, apenas registra o link e pula o reprocessamento.
  const existente = await findFileByName(token, fileName, subPasta.id);
  if (existente) {
    resumo.execucao = { status: 'pulado', link: existente.webViewLink };
    resumo.pulados += 1;
    return;
  }

  // Localizar ou criar o RelatorioExecucaoObjeto para o período.
  let relatorioId = null;
  try {
    const candidatos = await srv.entities.RelatorioExecucaoObjeto.filter(
      { data_inicio: periodo.data_inicio, data_fim: periodo.data_fim },
      '-created_date',
      20,
    );
    const parcial = (candidatos || []).find(
      (r) => r.tipo === 'parcial' && (r.filtro_museu === 'todos' || !r.filtro_museu),
    );
    if (parcial) relatorioId = parcial.id;
  } catch (e) {
    resumo.erros.push(`Execução/consulta: ${e.message}`);
  }

  if (!relatorioId) {
    try {
      const novo = await srv.entities.RelatorioExecucaoObjeto.create({
        tipo: 'parcial',
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
        filtro_museu: 'todos',
        filtro_meta_ids: [],
        filtro_versao: 'consolidado',
        status: 'rascunho',
        gerado_por_email: 'automacao@museuscentro.app',
        gerado_por_nome: 'Automação Mensal IA',
        identificacao_projeto: {
          organizacao: 'Viaduto das Artes',
          projeto: 'Museus Centro',
        },
      });
      relatorioId = novo.id;
    } catch (e) {
      resumo.erros.push(`Execução/criação: ${e.message}`);
      resumo.execucao = { status: 'erro', error: e.message };
      return;
    }
  }

  // Rodar o pipeline gerarRelatorioCompleto etapa a etapa.
  const falhasEtapa = [];
  for (const etapa of ETAPAS_PIPELINE) {
    try {
      const raw = await srv.functions.invoke('gerarRelatorioCompleto', {
        relatorio_id: relatorioId,
        etapa,
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
        filtro_museu: 'todos',
        filtro_meta_ids: [],
      });
      const r = raw?.data ?? raw;
      if (r?.error) {
        falhasEtapa.push(`${etapa}: ${r.error}`);
      }
    } catch (e) {
      falhasEtapa.push(`${etapa}: ${e.message}`);
    }
  }
  if (falhasEtapa.length > 0) {
    resumo.erros.push(`Execução/etapas: ${falhasEtapa.join(' | ')}`);
  }

  // Snapshot do relatório gerado e upload.
  try {
    const rel = await srv.entities.RelatorioExecucaoObjeto.get(relatorioId);
    const html = buildExecucaoHtml(rel, periodo);
    const up = await uploadHtmlFile(token, fileName, html, subPasta.id);
    const link = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
    await srv.entities.RelatorioExecucaoObjeto.update(relatorioId, {
      drive_backup_url: link,
      drive_backup_id: up.id,
      drive_backup_status: 'concluido',
      drive_backup_at: new Date().toISOString(),
    });
    resumo.execucao = { status: 'ok', link, relatorio_id: relatorioId, etapas_com_erro: falhasEtapa.length };
    resumo.sucessos += 1;
  } catch (e) {
    resumo.erros.push(`Execução/upload: ${e.message}`);
    resumo.execucao = { status: 'erro', relatorio_id: relatorioId, error: e.message };
  }
}

// ─── Bloco: Relatórios Mensais Individuais (Report) ──────────────────────────

async function gerarRelatoriosMensais(srv, token, folderMesId, periodo, resumo) {
  const subPasta = await getOrCreateFolder(token, PASTA_MENSAIS, folderMesId);
  let reports = [];
  try {
    const todos = await srv.entities.Report.filter({ mes_referencia: periodo.mesNome }, '-updated_date', 200);
    reports = (todos || []).filter(
      (r) => Number(r.ano) === periodo.ano && r.status !== 'DRAFT' && (r.tipo === 'mensal' || !r.tipo),
    );
  } catch (e) {
    resumo.erros.push(`Mensais/consulta: ${e.message}`);
    resumo.mensais = { status: 'erro', error: e.message };
    return;
  }

  resumo.mensais = { total: reports.length, ok: 0, pulados: 0, erros: [] };
  for (const report of reports) {
    const autor = sanitize(report.author_name || 'SemAutor');
    const fileName = `RelatorioMensal_${autor}_${sanitize(nomeMesCurto(periodo.mesNome))}${periodo.ano}.html`;
    try {
      const existente = await findFileByName(token, fileName, subPasta.id);
      if (existente) {
        await srv.entities.Report.update(report.id, {
          drive_backup_relatorio_url: existente.webViewLink,
          drive_backup_relatorio_id: existente.id,
          drive_backup_status: 'concluido',
          drive_backup_at: new Date().toISOString(),
        }).catch(() => null);
        resumo.mensais.pulados += 1;
        resumo.pulados += 1;
        continue;
      }

      // Reutiliza generateSingleReportPDF (retorna HTML pronto para o relatório).
      let html = '';
      try {
        const raw = await srv.functions.invoke('generateSingleReportPDF', { reportId: report.id, mode: 'assinatura' });
        const r = raw?.data ?? raw;
        html = r?.html || '';
        if (!html && r?.error) throw new Error(r.error);
      } catch (e) {
        resumo.mensais.erros.push(`${report.numero_protocolo || report.id}: ${e.message}`);
      }
      if (!html) continue; // não há conteúdo para subir; registra no resumo e segue

      const up = await uploadHtmlFile(token, fileName, html, subPasta.id);
      const link = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
      await srv.entities.Report.update(report.id, {
        drive_backup_relatorio_url: link,
        drive_backup_relatorio_id: up.id,
        drive_backup_status: 'concluido',
        drive_backup_at: new Date().toISOString(),
      });
      resumo.mensais.ok += 1;
      resumo.sucessos += 1;
    } catch (e) {
      resumo.mensais.erros.push(`${report.numero_protocolo || report.id}: ${e.message}`);
      resumo.erros.push(`Mensais/${report.numero_protocolo || report.id}: ${e.message}`);
      try {
        await srv.entities.Report.update(report.id, {
          drive_backup_status: 'erro',
          drive_backup_at: new Date().toISOString(),
        });
      } catch (_) {}
    }
  }
}

// ─── Bloco: Relatório Físico-Financeiro ───────────────────────────────────────

async function gerarFisicoFinanceiro(srv, token, folderMesId, periodo, resumo) {
  const subPasta = await getOrCreateFolder(token, PASTA_FISICO, folderMesId);
  const fileName = `FisicoFinanceiro_${sanitize(nomeMesCurto(periodo.mesNome))}${periodo.ano}.html`;

  const existente = await findFileByName(token, fileName, subPasta.id);
  if (existente) {
    resumo.fisico = { status: 'pulado', link: existente.webViewLink };
    resumo.pulados += 1;
    return;
  }

  try {
    const [reports, activities, purchases, rubricas] = await Promise.all([
      srv.entities.Report.filter({ mes_referencia: periodo.mesNome }, '-updated_date', 200).catch(() => []),
      srv.entities.Activity.filter({ data_realizacao: { $gte: periodo.data_inicio, $lte: periodo.data_fim } }, '-data_realizacao', 500).catch(() => []),
      srv.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_ADMIN', 'PAGO'] }, incluir_no_somatorio: { $ne: false } }, '-created_date', 500).catch(() => []),
      srv.entities.Rubrica.filter({ ativo: true }).catch(() => []),
    ]);

    const reportsDoPeriodo = (reports || []).filter((r) => Number(r.ano) === periodo.ano && r.status !== 'DRAFT');
    const html = buildFisicoFinanceiroHtml(periodo, {
      reports: reportsDoPeriodo,
      activities: activities || [],
      purchases: purchases || [],
      rubricas: rubricas || [],
    });

    const up = await uploadHtmlFile(token, fileName, html, subPasta.id);
    const link = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
    resumo.fisico = { status: 'ok', link };
    resumo.sucessos += 1;
  } catch (e) {
    resumo.fisico = { status: 'erro', error: e.message };
    resumo.erros.push(`Físico-Financeiro: ${e.message}`);
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const srv = base44.asServiceRole;
    if (!srv) return Response.json({ error: 'Service role indisponível' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const periodo = calcularPeriodo(body);

    let accessToken;
    try {
      const conn = await srv.connectors.getConnection('googledrive');
      accessToken = conn.accessToken;
    } catch (e) {
      return Response.json({ error: 'Google Drive não autorizado', detail: e.message }, { status: 502 });
    }

    const resumo = {
      periodo: { mes: periodo.mesNome, ano: periodo.ano, data_inicio: periodo.data_inicio, data_fim: periodo.data_fim, pasta: periodo.labelPasta },
      sucessos: 0,
      pulados: 0,
      erros: [],
      execucao: null,
      mensais: null,
      fisico: null,
    };

    // Estrutura de pastas: ROOT / Relatórios Finais IA / YYYY-MM - Mês
    const pastaFinais = await getOrCreateFolder(accessToken, PASTA_RELATORIOS_FINAIS, ROOT_FOLDER_ID);
    const folderMesId = (await getOrCreateFolder(accessToken, periodo.labelPasta, pastaFinais.id)).id;

    // Cada bloco é independente: erro em um não bloqueia os outros.
    await gerarExecucaoObjeto(srv, accessToken, folderMesId, periodo, resumo).catch((e) => {
      resumo.execucao = { status: 'erro', error: e.message };
      resumo.erros.push(`Execução (bloco): ${e.message}`);
    });

    await gerarRelatoriosMensais(srv, accessToken, folderMesId, periodo, resumo).catch((e) => {
      resumo.mensais = resumo.mensais || { status: 'erro' };
      resumo.mensais.erro_bloco = e.message;
      resumo.erros.push(`Mensais (bloco): ${e.message}`);
    });

    await gerarFisicoFinanceiro(srv, accessToken, folderMesId, periodo, resumo).catch((e) => {
      resumo.fisico = { status: 'erro', error: e.message };
      resumo.erros.push(`Físico-Financeiro (bloco): ${e.message}`);
    });

    resumo.pasta_drive = `https://drive.google.com/drive/folders/${folderMesId}`;

    return Response.json({
      success: true,
      ...resumo,
      message: `Geração mensal IA (${periodo.mesNome}/${periodo.ano}): ${resumo.sucessos} sucessos, ${resumo.pulados} pulados, ${resumo.erros.length} erros.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});