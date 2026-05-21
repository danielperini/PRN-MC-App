import { getReportSummaryChapters } from '@/config/reportChapters';
import { buildDocumentsChapterData } from '@/utils/reportDocumentsChapter';

const TOTAL_OFICIAL = 1320000;

const memoriaRedacional = new Set();

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
}

function fmtInt(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function fmtPublico(value) {
  if (value === null || value === undefined || value === 'N/A') return 'N/A';
  const n = inteiro(value);
  return n > 0 ? n.toLocaleString('pt-BR') : 'N/A';
}

function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripVisibleMarkup(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n')
    .replace(/&lt;\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^&]*&gt;/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;[^&]*&gt;/g, ' ');
}

function normalizarTexto(value) {
  return stripVisibleMarkup(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assinaturaParagrafo(value) {
  return normalizarTexto(value)
    .split(' ')
    .filter((word) => word.length > 3)
    .slice(0, 28)
    .join(' ');
}

function similaridadeTexto(a, b) {
  const wa = new Set(normalizarTexto(a).split(' ').filter((w) => w.length > 4));
  const wb = new Set(normalizarTexto(b).split(' ').filter((w) => w.length > 4));
  if (wa.size === 0 || wb.size === 0) return 0;
  let comum = 0;
  wa.forEach((w) => { if (wb.has(w)) comum += 1; });
  return comum / Math.min(wa.size, wb.size);
}

function paragrafoJaUsado(paragrafo) {
  const assinatura = assinaturaParagrafo(paragrafo);
  if (!assinatura || assinatura.length < 24) return false;
  if (memoriaRedacional.has(assinatura)) return true;
  for (const item of memoriaRedacional) {
    if (similaridadeTexto(assinatura, item) >= 0.82) return true;
  }
  memoriaRedacional.add(assinatura);
  return false;
}

function paragraphize(text) {
  const raw = stripVisibleMarkup(text).trim();
  if (!raw) return '<p class="empty-section">Texto não disponível para esta seção.</p>';
  const paragrafos = raw
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !paragrafoJaUsado(p));
  if (paragrafos.length === 0) return '';
  return paragrafos.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

function renderReportPdfInstitutionalHeader() {
  return `
    <div class="report-pdf-institutional-header">
      <div class="report-pdf-institutional-logo-wrap">
        <img src="/logo.png" alt="Logo institucional" class="report-pdf-institutional-logo" />
      </div>
      <div class="report-pdf-institutional-text">
        <div>Viaduto das Artes – Fundado em 16 de junho de 2015</div>
        <div>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</div>
        <div>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</div>
      </div>
    </div>
  `;
}

function legacyHasSection(secoesSelecionadas, id) {
  return Array.isArray(secoesSelecionadas) && secoesSelecionadas.includes(id);
}

function hasSection() {
  return false;
}

function categoriaLabel(categoria) {
  const map = {
    gestao_governanca: 'Gestão e Governança',
    producao_operacao: 'Produção e Operações',
    comunicacao_produtos: 'Comunicação',
    atividade_publico: 'Atividades com Público',
  };
  return map[categoria] || 'Eixo Institucional';
}

function categoriaColor(categoria) {
  const map = {
    gestao_governanca: '#1a1a2e',
    producao_operacao: '#16213e',
    comunicacao_produtos: '#0f3460',
    atividade_publico: '#533483',
  };
  return map[categoria] || '#111111';
}

function categoriaBadgeColor(categoria) {
  const map = {
    gestao_governanca: '#e8f4f8',
    producao_operacao: '#f0f7f4',
    comunicacao_produtos: '#f5f0ff',
    atividade_publico: '#fff5e6',
  };
  return map[categoria] || '#f4f4f5';
}

function categoriaBadgeText(categoria) {
  const map = {
    gestao_governanca: '#1a4a6e',
    producao_operacao: '#1a5c3a',
    comunicacao_produtos: '#3d1a8a',
    atividade_publico: '#7a3600',
  };
  return map[categoria] || '#333333';
}

// ===== CURADORIA DE FOTOS =====
// Prioriza fotos com presença humana/ação e descarta duplicatas

function scoreImagem(foto, atividadeNome = '') {
  let score = 50;
  const url = String(foto?.url || foto?.file_url || '').toLowerCase();
  const caption = String(foto?.caption || foto?.legenda || foto?.fileName || '').toLowerCase();
  const ativNorm = atividadeNome.toLowerCase();

  // Penalizar formatos ruins
  if (url.includes('thumb') || url.includes('_s.') || url.includes('_xs.')) score -= 20;
  if (url.includes('placeholder') || url.includes('generic') || url.includes('stock')) score -= 50;

  // Beneficiar fotos vinculadas à atividade
  if (caption.includes(ativNorm.slice(0, 10)) && ativNorm.length > 5) score += 20;

  // Beneficiar fotos de origem mais específica
  if (foto?.origem === 'activity.fotos') score += 30;
  if (foto?.origem === 'activity.attachments') score += 20;
  if (foto?.origem === 'Attachment') score += 15;
  if (foto?.origem === 'report.fotos') score += 10;

  // Beneficiar palavras-chave editoriais na legenda
  const keywords = ['oficina', 'público', 'publico', 'atividade', 'evento', 'artista',
    'mediação', 'mediacao', 'performance', 'exposição', 'exposicao', 'museu', 'arte', 'cultura',
    'noturno', 'viaduto', 'formação', 'formacao', 'criança', 'crianca', 'escola', 'educativo'];
  keywords.forEach(kw => { if (caption.includes(kw)) score += 5; });

  return score;
}

function selecionarFotosCuradas(fotos, atividadeNome = '', max = 4) {
  if (!Array.isArray(fotos) || fotos.length === 0) return [];
  const fotosValidas = fotos.filter(f => {
    const url = f?.url || f?.file_url || '';
    return url && url.startsWith('http');
  });
  const scored = fotosValidas.map(f => ({ ...f, _score: scoreImagem(f, atividadeNome) }));
  scored.sort((a, b) => b._score - a._score);
  // Desduplicar por URL
  const seen = new Set();
  return scored.filter(f => {
    const url = f?.url || f?.file_url || '';
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, max);
}

function selecionarFotoCapa(todasFotos) {
  if (!Array.isArray(todasFotos) || todasFotos.length === 0) return null;
  const validas = todasFotos.filter(f => {
    const url = f?.url || f?.file_url || '';
    return url && url.startsWith('http');
  });
  if (validas.length === 0) return null;
  const scored = validas.map(f => ({
    ...f,
    _score: scoreImagem(f, '') + (f?.origem === 'activity.fotos' ? 40 : 0),
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored[0];
}

// ===== RENDER COMPONENTS =====

function renderFotosAtividade(atividade) {
  const todasFotos = [
    ...(Array.isArray(atividade?.fotos_destaque) ? atividade.fotos_destaque : []),
    ...(Array.isArray(atividade?.fotos_demais) ? atividade.fotos_demais : []),
  ];

  const selecionadas = selecionarFotosCuradas(todasFotos, atividade?.nome || '', 4);
  const demais = selecionarFotosCuradas(todasFotos, atividade?.nome || '', 8).slice(4);

  if (selecionadas.length === 0 && demais.length === 0) {
    return '<p class="no-photo">Registros fotográficos não vinculados.</p>';
  }

  const getUrl = f => escapeHtml(f?.url || f?.file_url || '');
  const getCaption = f => escapeHtml(f?.caption || f?.legenda || f?.fileName || atividade?.nome || 'Registro fotográfico');

  let html = '';

  if (selecionadas.length === 1) {
    html = `<div class="photo-single">
      <figure>
        <img src="${getUrl(selecionadas[0])}" alt="${getCaption(selecionadas[0])}" loading="lazy" />
        <figcaption>${getCaption(selecionadas[0])}</figcaption>
      </figure>
    </div>`;
  } else if (selecionadas.length === 2) {
    html = `<div class="photo-duo">
      ${selecionadas.map(f => `<figure><img src="${getUrl(f)}" alt="${getCaption(f)}" loading="lazy" /><figcaption>${getCaption(f)}</figcaption></figure>`).join('')}
    </div>`;
  } else if (selecionadas.length >= 3) {
    const [first, ...rest] = selecionadas;
    html = `<div class="photo-grid-editorial">
      <figure class="photo-main"><img src="${getUrl(first)}" alt="${getCaption(first)}" loading="lazy" /><figcaption>${getCaption(first)}</figcaption></figure>
      <div class="photo-side">
        ${rest.map(f => `<figure><img src="${getUrl(f)}" alt="${getCaption(f)}" loading="lazy" /><figcaption>${getCaption(f)}</figcaption></figure>`).join('')}
      </div>
    </div>`;
  }

  if (demais.length > 0) {
    html += `<div class="more-photos">
      <p class="more-label">Demais registros</p>
      <div class="photo-strip">
        ${demais.map(f => `<a href="${getUrl(f)}" target="_blank" rel="noopener noreferrer" class="strip-item">
          <img src="${getUrl(f)}" alt="${getCaption(f)}" loading="lazy" />
        </a>`).join('')}
      </div>
    </div>`;
  }

  return html;
}

function cleanText(value) {
  return stripVisibleMarkup(value).replace(/\s+/g, ' ').trim();
}

function getOriginalActivityText(atividade = {}) {
  return cleanText(
    atividade.descricao_original ||
    atividade.descricao ||
    atividade.relato ||
    atividade.observacoes ||
    atividade.resultados ||
    atividade.resultado ||
    atividade.sintese ||
    atividade.sinopse ||
    ''
  );
}

function getDescricaoAtividade(textos, atividade, index) {
  const descricoes = Array.isArray(textos?.atividades_descricoes) ? textos.atividades_descricoes : [];
  const byIndex = descricoes.find((item) => Number(item?.indice) === index + 1) || descricoes[index];
  const generated = cleanText(byIndex?.descricao);
  const original = getOriginalActivityText(atividade);
  if (generated) return generated;
  if (original) return original;
  const partes = [
    atividade?.nome
      ? `A atividade "${atividade.nome}" foi realizada no período consolidado.`
      : 'Atividade consolidada a partir dos relatórios aprovados.',
    atividade?.publico && atividade.publico !== 'N/A'
      ? `O público registrado foi de ${fmtPublico(atividade.publico)} participantes.`
      : '',
    atividade?.local ? `Local de realização: ${atividade.local}.` : '',
  ].filter(Boolean);
  return partes.join(' ');
}

function renderAtividadesPorCategoria(contexto, textos, categoria) {
  const atividades = contexto?.atividades_por_categoria?.[categoria] || [];
  if (!Array.isArray(atividades) || atividades.length === 0) {
    return '<p class="empty-section">Nenhum registro localizado para este eixo no período consolidado.</p>';
  }

  const cor = categoriaColor(categoria);
  const badgeBg = categoriaBadgeColor(categoria);
  const badgeTxt = categoriaBadgeText(categoria);

  return atividades.map((atividade) => {
    const globalIndex = (contexto.atividades || []).findIndex((a) => a.id === atividade.id);
    const index = globalIndex >= 0 ? globalIndex : 0;
    const descricao = getDescricaoAtividade(textos, atividade, index);
    const temPublico = atividade.publico && atividade.publico !== 'N/A';
    const temData = atividade.data || atividade.mes;
    const temLocal = atividade.local;

    return `
      <article class="activity-card" style="--cat-color: ${cor}; --badge-bg: ${badgeBg}; --badge-txt: ${badgeTxt};">
        <div class="activity-card-inner">
          <div class="activity-card-content">
            <div class="activity-eyebrow">
              <span class="cat-badge">${escapeHtml(categoriaLabel(atividade.categoria_editorial))}</span>
              ${atividade.museu ? `<span class="museu-badge">${escapeHtml(atividade.museu)}</span>` : ''}
            </div>

            <h3 class="activity-title">${escapeHtml(atividade.nome || 'Atividade sem título')}</h3>

            ${(temData || temLocal) ? `
            <div class="activity-meta-tags">
              ${atividade.mes ? `<span>${escapeHtml(atividade.mes)}${atividade.ano ? `/${atividade.ano}` : ''}</span>` : ''}
              ${atividade.data ? `<span>${escapeHtml(String(atividade.data).slice(0, 10))}</span>` : ''}
              ${temLocal ? `<span>${escapeHtml(atividade.local)}</span>` : ''}
              ${atividade.classificacao ? `<span>${escapeHtml(atividade.classificacao)}</span>` : ''}
              ${atividade.equipe ? `<span>${escapeHtml(atividade.equipe)}</span>` : ''}
            </div>` : ''}

            <div class="activity-desc">${paragraphize(descricao)}</div>
          </div>

          ${temPublico ? `
          <aside class="activity-kpi-aside">
            <div class="kpi-bubble">
              <span class="kpi-label">Público</span>
              <span class="kpi-value">${fmtPublico(atividade.publico)}</span>
              <span class="kpi-sub">participantes</span>
            </div>
          </aside>` : ''}
        </div>

        <div class="activity-photos">
          ${renderFotosAtividade(atividade)}
        </div>
      </article>
    `;
  }).join('');
}

function renderQuadroSintetico(contexto) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  if (atividades.length === 0) return '<p class="empty-section">Nenhuma atividade encontrada no período.</p>';

  const rows = atividades.map((a) => `
    <tr>
      <td class="act-name">${escapeHtml(a.nome || 'Atividade')}</td>
      <td><span class="table-badge">${escapeHtml(categoriaLabel(a.categoria_editorial))}</span></td>
      <td>${escapeHtml(a.museu || '—')}</td>
      <td>${escapeHtml(a.mes || '—')}</td>
      <td class="num">${fmtPublico(a.publico)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-scroll">
      <table class="editorial-table">
        <thead>
          <tr>
            <th>Atividade</th>
            <th>Eixo</th>
            <th>Museu</th>
            <th>Mês</th>
            <th class="num">Público</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderPorMuseu(porMuseu) {
  const museus = Object.values(porMuseu || {});
  if (museus.length === 0) return '';

  const items = museus.map(m => `
    <div class="museu-stat">
      <div class="museu-sigla">${escapeHtml(m.museu || '?')}</div>
      <div class="museu-nums">
        <div class="museu-num-item"><strong>${fmtInt(m.atividades)}</strong><small>atividades</small></div>
        ${m.publico > 0 ? `<div class="museu-num-item"><strong>${fmtInt(m.publico)}</strong><small>público</small></div>` : ''}
      </div>
    </div>
  `).join('');

  return `<div class="museu-stats-grid">${items}</div>`;
}

function renderCompras(compras) {
  if (!Array.isArray(compras) || compras.length === 0) {
    return '<p class="empty-section">Nenhuma transação registrada no período.</p>';
  }

  const rows = compras.slice(0, 30).map(c => `
    <tr>
      <td class="act-name">${escapeHtml(c.descricao || '—')}</td>
      <td>${escapeHtml(c.fornecedor || '—')}</td>
      <td>${escapeHtml(c.rubrica || '—')}</td>
      <td><span class="status-badge status-${escapeHtml(String(c.status || '').toLowerCase())}">${escapeHtml(c.status || '—')}</span></td>
      <td class="num">${fmtBRL(c.valor)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-scroll">
      <table class="editorial-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Fornecedor</th>
            <th>Rubrica</th>
            <th>Status</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function formatDateBR(value) {
  if (!value) return '—';
  const raw = String(value);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  return raw.slice(0, 10);
}

function renderDocumentLinkHtml(url, label) {
  if (!url) return '<span>Link indisponível</span>';
  return `<a class="document-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderDocumentsChapterHTML(contexto = {}) {
  const docs = buildDocumentsChapterData(contexto);
  const contracts = Array.isArray(docs.contracts) ? docs.contracts : [];
  const fiscalDocuments = Array.isArray(docs.fiscalDocuments) ? docs.fiscalDocuments : [];
  const limitations = Array.isArray(docs.limitations) ? docs.limitations : [];

  const contractRows = contracts.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.fileName || 'Arquivo sem nome')}</td>
      <td>${escapeHtml(item.personSupplier || '-')}</td>
      <td>${escapeHtml(item.entityLabel || '-')}</td>
      <td>${escapeHtml(formatDateBR(item.date))}</td>
      <td>${escapeHtml(item.tipo || 'Contrato')}</td>
      <td>${renderDocumentLinkHtml(item.url, 'Abrir contrato')}</td>
    </tr>
  `).join('');

  const fiscalRows = fiscalDocuments.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.fileName || 'Arquivo sem nome')}</td>
      <td>${escapeHtml(item.personSupplier || '-')}</td>
      <td>${escapeHtml(item.invoiceNumber || '-')}</td>
      <td class="num">${item.value > 0 ? fmtBRL(item.value) : '-'}</td>
      <td>${escapeHtml(formatDateBR(item.date))}</td>
      <td>${escapeHtml(item.tipo || 'Documento fiscal')}</td>
      <td>${escapeHtml(item.entityLabel || '-')}</td>
      <td>${renderDocumentLinkHtml(item.url, 'Abrir arquivo')}</td>
    </tr>
  `).join('');

  return `
    <div class="secao">
      <h2>Notas fiscais e contratos</h2>
      <p>Este capítulo reúne os arquivos documentais utilizados para sustentar a prestação de contas do período, organizando contratos e documentos fiscais a partir dos registros disponíveis no app. A listagem considera os documentos vinculados à Gestão Documental, à Entrada Única, às solicitações de compras, aos pagamentos de equipe e aos anexos relacionados. Os links são apresentados para facilitar a rastreabilidade entre execução operacional, documentação fiscal e comprovação institucional.</p>

      <div class="destaque-box">
        <p><strong>Como os documentos foram obtidos</strong></p>
        <p>Os arquivos listados foram identificados a partir dos registros disponíveis no app, considerando documentos enviados pela Entrada Única, anexos da Gestão Documental, vínculos com solicitações financeiras, pagamentos de equipe e campos específicos de contratos, notas fiscais, XMLs, recibos e comprovantes. Quando um mesmo arquivo aparece em mais de uma origem, a listagem consolida o documento uma única vez para evitar duplicidade.</p>
      </div>

      ${limitations.length > 0 ? `
      <div class="destaque-box">
        <p><strong>Limitações da listagem</strong></p>
        <ul>
          ${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <h3>Contratos em PDF</h3>
      <p>Lista de contratos localizados nos documentos do app para o período ou vinculados à equipe, fornecedores, solicitações ou registros documentais.</p>
      ${contracts.length === 0 ? `
        <p class="empty-section">Não foram localizados contratos em PDF vinculados ao período ou aos registros documentais disponíveis no app.</p>
      ` : `
        <div class="table-scroll">
          <table class="editorial-table documents-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nome do arquivo</th>
                <th>Pessoa/fornecedor/equipe</th>
                <th>Vínculo no app</th>
                <th>Data de envio ou criação</th>
                <th>Tipo</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>${contractRows}</tbody>
          </table>
        </div>
      `}

      <h3>Notas fiscais e documentos fiscais</h3>
      <p>Lista de notas fiscais, XMLs, recibos e comprovantes localizados nos documentos do app e vinculados às solicitações financeiras, pagamentos de equipe ou registros da Entrada Única.</p>
      ${fiscalDocuments.length === 0 ? `
        <p class="empty-section">Não foram localizadas notas fiscais ou documentos fiscais vinculados ao período ou aos registros documentais disponíveis no app.</p>
      ` : `
        <div class="table-scroll">
          <table class="editorial-table documents-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nome do arquivo</th>
                <th>Fornecedor/emissor</th>
                <th>Nº da NF</th>
                <th>Valor</th>
                <th>Data de emissão ou envio</th>
                <th>Tipo</th>
                <th>Vínculo no app</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>${fiscalRows}</tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderLegacySumario(secoesSelecionadas) {
  const items = getReportSummaryChapters(secoesSelecionadas).map((chapter) => [chapter.id, chapter.title]);

  if (!items.length) return '';

  return `
    <div class="sumario secao">
      <h2 style="counter-increment:none;">Sumário</h2>
      <ol>
        ${items.map(([, label], index) => `
          <li>
            <span class="num">${String(index + 1).padStart(2, '0')}</span>
            <span class="titulo-item">${escapeHtml(label)}</span>
          </li>
        `).join('')}
      </ol>
    </div>
  `;
}

function renderLegacyKpis(contexto, percentualExecucao) {
  const items = [
    ['Relatórios', fmtInt(contexto.total_relatorios), true],
    ['Público', fmtInt(contexto.publico_total)],
    ['Atividades', fmtInt(contexto.total_atividades)],
    ['Execução', `${percentualExecucao}%`],
    ['Programação', fmtInt(contexto.programacao_total)],
    ['Equipe', fmtInt(contexto.equipe_total || 0)],
  ];

  return `
    <div class="kpi-grid">
      ${items.map(([label, value, dark]) => `
        <div class="kpi ${dark ? 'dark' : ''}">
          <span class="val">${value}</span>
          <span class="lbl">${escapeHtml(label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTabelaPorMuseu(porMuseu) {
  const museus = Object.values(porMuseu || {});
  if (!museus.length) return '<p class="empty-section">Nenhum dado por museu encontrado.</p>';

  return `
    <table>
      <thead>
        <tr>
          <th>Museu / atuação</th>
          <th class="num">Atividades</th>
          <th class="num">Público</th>
        </tr>
      </thead>
      <tbody>
        ${museus.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.museu || 'Atuação geral')}</strong></td>
            <td class="num">${fmtInt(item.atividades)}</td>
            <td class="num">${fmtInt(item.publico)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderTabelaEixos(totalPorEixo) {
  return `
    <table>
      <thead>
        <tr>
          <th>Eixo institucional</th>
          <th class="num">Atividades</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(totalPorEixo).map(([key, value]) => `
          <tr>
            <td>${escapeHtml(categoriaLabel(key))}</td>
            <td class="num">${fmtInt(value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderProgramacaoDetalhada(programacao = []) {
  if (!Array.isArray(programacao) || programacao.length === 0) {
    return '<p class="empty-section">Nenhuma programação detalhada localizada no período.</p>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Museu</th>
          <th>Atividade</th>
          <th>Tipo</th>
          <th>Síntese</th>
        </tr>
      </thead>
      <tbody>
        ${programacao.map((item) => `
          <tr>
            <td>${escapeHtml(formatDateBR(item.data))}</td>
            <td>${escapeHtml(item.museu || '—')}</td>
            <td><strong>${escapeHtml(item.titulo || 'Programação')}</strong></td>
            <td>${escapeHtml(item.tipo || item.status || '—')}</td>
            <td>${escapeHtml(item.sinopse || item.local || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRubricasDetalhadas(rubricas = []) {
  if (!Array.isArray(rubricas) || rubricas.length === 0) {
    return '<p class="empty-section">Nenhuma rubrica detalhada localizada.</p>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Rubrica</th>
          <th>Grupo</th>
          <th class="num">Previsto</th>
          <th class="num">Utilizado</th>
          <th class="num">Saldo</th>
          <th class="num">%</th>
        </tr>
      </thead>
      <tbody>
        ${rubricas.map((item) => `
          <tr>
            <td>${escapeHtml(item.codigo || '—')}</td>
            <td><strong>${escapeHtml(item.nome || 'Rubrica')}</strong></td>
            <td>${escapeHtml(item.grupo || '—')}</td>
            <td class="num">${fmtBRL(item.previsto)}</td>
            <td class="num">${fmtBRL(item.utilizado)}</td>
            <td class="num">${fmtBRL(item.saldo)}</td>
            <td class="num">${toNumber(item.percentual).toFixed(1).replace('.', ',')}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderGaleriaGeral(fotos = [], max = 24) {
  const selecionadas = selecionarFotosCuradas(fotos, '', max);
  if (!selecionadas.length) return '<p class="empty-section">Nenhuma foto do app localizada para a galeria geral.</p>';

  return `
    <div class="foto-grid">
      ${selecionadas.map((foto) => {
        const url = escapeHtml(foto?.url || foto?.file_url || '');
        const caption = escapeHtml(foto?.caption || foto?.legenda || foto?.fileName || 'Registro fotográfico do app');
        return `
          <figure class="foto-item">
            <img class="foto" src="${url}" alt="${caption}" loading="lazy" />
            <figcaption class="foto-legenda">${caption}</figcaption>
          </figure>
        `;
      }).join('')}
    </div>
  `;
}

function renderRelatoriosEquipeTabela(relatorios = []) {
  if (!Array.isArray(relatorios) || relatorios.length === 0) {
    return '<p class="empty-section">Nenhum relatório individual aprovado localizado no período.</p>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Profissional</th>
          <th>Função</th>
          <th>Museu</th>
          <th>Período</th>
          <th class="num">Atividades</th>
          <th class="num">Público</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${relatorios.map((report) => `
          <tr>
            <td><strong>${escapeHtml(report.autor)}</strong></td>
            <td>${escapeHtml(report.funcao || '—')}</td>
            <td>${escapeHtml(report.museu || '—')}</td>
            <td>${escapeHtml([report.mes, report.ano].filter(Boolean).join('/'))}</td>
            <td class="num">${fmtInt(report.atividades_count)}</td>
            <td class="num">${fmtInt(report.publico)}</td>
            <td><span class="badge green">${escapeHtml(report.status || 'Aprovado')}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRelatoriosEquipeDetalhados(relatorios = []) {
  if (!Array.isArray(relatorios) || relatorios.length === 0) return '';

  return relatorios.map((report, index) => {
    const atividades = Array.isArray(report.atividades) ? report.atividades : [];
    const textos = [
      ['Resumo executivo', report.resumo_executivo],
      ['Resumo do período', report.resumo_periodo],
      ['Pontos positivos', report.pontos_positivos],
      ['Desafios', report.desafios],
      ['Encaminhamentos', report.encaminhamentos],
      ['Comentários', report.comentarios],
    ].filter(([, value]) => String(value || '').trim());

    return `
      <article class="team-report">
        <h3>${String(index + 1).padStart(2, '0')} · ${escapeHtml(report.autor)}</h3>
        <div class="meta-line">
          ${escapeHtml(report.funcao || 'Função não informada')} ·
          ${escapeHtml(report.museu || 'Atuação geral')} ·
          ${escapeHtml([report.mes, report.ano].filter(Boolean).join('/') || 'Período não informado')}
        </div>

        ${textos.map(([label, value]) => `
          <div class="analise-ia">
            <strong>${escapeHtml(label)}:</strong>
            ${paragraphize(value)}
          </div>
        `).join('')}

        ${atividades.length ? `
          <h3>Atividades vinculadas</h3>
          <table>
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Data</th>
                <th>Eixo</th>
                <th class="num">Público</th>
              </tr>
            </thead>
            <tbody>
              ${atividades.map((atividade) => `
                <tr>
                  <td><strong>${escapeHtml(atividade.nome || 'Atividade')}</strong></td>
                  <td>${escapeHtml(formatDateBR(atividade.data))}</td>
                  <td>${escapeHtml(categoriaLabel(atividade.categoria_editorial))}</td>
                  <td class="num">${fmtPublico(atividade.publico)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="empty-section">Relatório sem atividades detalhadas vinculadas.</p>'}

        ${renderGaleriaGeral([
          ...(Array.isArray(report.fotos) ? report.fotos : []),
          ...atividades.flatMap((atividade) => atividade.fotos_destaque || []),
        ], 6)}
      </article>
    `;
  }).join('');
}

// ===== MAIN TEMPLATE =====

export function montarHtmlRelatorioFisicoFinanceiro({
  contexto = {},
  textos = {},
  secoesSelecionadas = [],
  filtros = {},
} = {}) {
  memoriaRedacional.clear();

  const periodo = escapeHtml(contexto.periodo_extenso || '2 de fevereiro a 30 de abril de 2026');
  const museu = escapeHtml(filtros.museu || contexto.museu || 'Todos os museus');
  const percentualExecucao = toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',');
  const todasFotos = Array.isArray(contexto.fotos) ? contexto.fotos : [];
  const fotoCapa = selecionarFotoCapa(todasFotos);
  const fotoCovUrl = fotoCapa ? escapeHtml(fotoCapa?.url || fotoCapa?.file_url || '') : '';
  const relatoriosEquipe = Array.isArray(contexto.relatorios_equipe) ? contexto.relatorios_equipe : [];
  const programacao = Array.isArray(contexto.programacao) ? contexto.programacao : [];
  const rubricas = Array.isArray(contexto.rubricas) ? contexto.rubricas : [];
  const dataGeracao = new Date().toLocaleString('pt-BR');

  // Totais por eixo
  const atividadesPorCat = contexto.atividades_por_categoria || {};
  const totalPorEixo = {
    gestao_governanca: (atividadesPorCat.gestao_governanca || []).length,
    producao_operacao: (atividadesPorCat.producao_operacao || []).length,
    comunicacao_produtos: (atividadesPorCat.comunicacao_produtos || []).length,
    atividade_publico: (atividadesPorCat.atividade_publico || []).length,
  };

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Museus Centro — Relatório Institucional 2026</title>
<style>
  /* ============================
     TOKENS & RESET
  ============================= */
  :root {
    --ink: #111111;
    --ink-light: #444444;
    --muted: #777777;
    --muted-light: #aaaaaa;
    --line: #e4e4e7;
    --line-strong: #d1d5db;
    --paper: #ffffff;
    --page-bg: #ffffff;
    --accent: #111111;
    --accent-warm: #c8a96e;
    --cover-dark: rgba(10,10,20,0.55);
    --radius: 16px;
    --radius-sm: 10px;
    --radius-xs: 6px;
    --font-main: 'Georgia', 'Times New Roman', serif;
    --font-ui: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--font-ui);
    color: var(--ink);
    background: var(--page-bg);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    padding: 24px 16px 48px;
  }

  .report-pdf-institutional-header {
    display: none;
  }

  .report-pdf-institutional-logo-wrap {
    width: 16mm;
    height: 16mm;
    flex: 0 0 16mm;
  }

  .report-pdf-institutional-logo {
    width: 16mm;
    height: 16mm;
    display: block;
    object-fit: contain;
  }

  .report-pdf-institutional-text {
    flex: 1;
    margin-left: 0;
    padding-top: 0;
    text-align: right;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.32;
    color: #777777;
    font-family: Arial, Helvetica, sans-serif;
  }

  /* ============================
     ACTIONS BAR
  ============================= */
  .actions-bar {
    max-width: 1080px;
    margin: 0 auto 20px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
  }

  .btn {
    border: 0;
    padding: 10px 18px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font-ui);
    letter-spacing: .02em;
    transition: opacity .15s;
  }
  .btn:hover { opacity: .8; }
  .btn-primary { background: var(--ink); color: white; }
  .btn-secondary { background: white; color: var(--ink); border: 1.5px solid var(--line-strong); }

  /* ============================
     PAGE WRAPPER
  ============================= */
  .page {
    background: var(--paper);
    max-width: 1080px;
    margin: 0 auto 28px;
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 8px 48px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04);
  }

  .page-inner {
    padding: 56px 64px;
  }

  /* ============================
     COVER
  ============================= */
  .cover-page {
    min-height: 680px;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    overflow: hidden;
    background: #0a0a12;
  }

  .cover-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .cover-bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(5,5,15,0.2) 0%,
      rgba(5,5,15,0.35) 40%,
      rgba(5,5,15,0.72) 70%,
      rgba(5,5,15,0.90) 100%
    );
    z-index: 1;
  }

  .cover-content {
    position: relative;
    z-index: 2;
    padding: 56px 64px;
  }

  .cover-eyebrow {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .22em;
    color: rgba(255,255,255,.55);
    margin-bottom: 20px;
  }

  .cover-title {
    font-family: var(--font-main);
    font-size: 52px;
    line-height: 1.05;
    letter-spacing: -.03em;
    color: #ffffff;
    margin-bottom: 12px;
    max-width: 680px;
  }

  .cover-subtitle {
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.65;
    color: rgba(255,255,255,.72);
    max-width: 560px;
    margin-bottom: 36px;
  }

  .cover-kpis {
    display: flex;
    gap: 0;
    flex-wrap: wrap;
    border-top: 1px solid rgba(255,255,255,.15);
    padding-top: 28px;
    margin-bottom: 28px;
  }

  .cover-kpi {
    padding: 0 32px 0 0;
    margin-right: 32px;
    border-right: 1px solid rgba(255,255,255,.12);
  }
  .cover-kpi:last-child { border-right: 0; }

  .cover-kpi-label {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: rgba(255,255,255,.45);
    display: block;
    margin-bottom: 6px;
  }

  .cover-kpi-value {
    font-family: var(--font-main);
    font-size: 26px;
    font-weight: normal;
    color: #ffffff;
    display: block;
    line-height: 1;
  }

  .cover-footer-line {
    font-family: var(--font-ui);
    font-size: 10px;
    letter-spacing: .15em;
    text-transform: uppercase;
    color: rgba(255,255,255,.35);
    border-top: 1px solid rgba(255,255,255,.1);
    padding-top: 16px;
  }

  /* ============================
     SECTION OPENER
  ============================= */
  .section-opener {
    padding: 48px 64px 32px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 40px;
  }

  .section-number {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: var(--muted);
    display: block;
    margin-bottom: 12px;
  }

  .section-title {
    font-family: var(--font-main);
    font-size: 36px;
    line-height: 1.1;
    letter-spacing: -.025em;
    color: var(--ink);
    margin-bottom: 14px;
  }

  .section-lead {
    font-family: var(--font-main);
    font-size: 16px;
    line-height: 1.75;
    color: var(--ink-light);
    max-width: 680px;
  }

  /* ============================
     TYPOGRAPHY
  ============================= */
  h2 {
    font-family: var(--font-main);
    font-size: 26px;
    font-weight: normal;
    letter-spacing: -.02em;
    line-height: 1.2;
    color: var(--ink);
    margin: 52px 0 18px;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--ink);
  }

  h3 {
    font-family: var(--font-main);
    font-size: 20px;
    font-weight: normal;
    letter-spacing: -.015em;
    line-height: 1.3;
    color: var(--ink);
    margin: 0 0 10px;
  }

  p {
    font-family: var(--font-ui);
    font-size: 14.5px;
    line-height: 1.8;
    color: #333333;
    margin: 0 0 16px;
  }

  a {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    word-break: break-word;
  }

  .empty-section {
    font-style: italic;
    color: var(--muted);
    font-size: 13px;
    padding: 16px 0;
  }

  /* ============================
     KPI GRID — INTRO
  ============================= */
  .kpis-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin: 36px 0;
  }

  .kpi-card {
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 20px 18px;
  }

  .kpi-card.kpi-dark {
    background: var(--ink);
    border-color: var(--ink);
    color: white;
  }

  .kpi-card-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: var(--muted);
    display: block;
    margin-bottom: 10px;
  }
  .kpi-card.kpi-dark .kpi-card-label { color: rgba(255,255,255,.5); }

  .kpi-card-value {
    font-family: var(--font-main);
    font-size: 28px;
    line-height: 1;
    display: block;
    color: var(--ink);
  }
  .kpi-card.kpi-dark .kpi-card-value { color: white; }

  /* ============================
     MUSEU STATS
  ============================= */
  .museu-stats-grid {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin: 24px 0;
  }

  .museu-stat {
    flex: 1;
    min-width: 140px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 20px;
    text-align: center;
  }

  .museu-sigla {
    font-family: var(--font-main);
    font-size: 22px;
    font-weight: normal;
    color: var(--ink);
    letter-spacing: .05em;
    margin-bottom: 12px;
  }

  .museu-nums { display: flex; gap: 16px; justify-content: center; }

  .museu-num-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .museu-num-item strong {
    font-family: var(--font-main);
    font-size: 20px;
    font-weight: normal;
  }

  .museu-num-item small {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    font-weight: 700;
  }

  /* ============================
     ACTIVITY CARDS
  ============================= */
  .activity-card {
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    margin: 0 0 28px;
    page-break-inside: avoid;
    transition: border-color .2s;
  }

  .activity-card:hover { border-color: var(--line-strong); }

  .activity-card-inner {
    display: flex;
    gap: 0;
    align-items: stretch;
  }

  .activity-card-content {
    flex: 1;
    padding: 28px 28px 24px;
    min-width: 0;
  }

  .activity-eyebrow {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    align-items: center;
  }

  .cat-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--badge-bg);
    color: var(--badge-txt);
  }

  .museu-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    padding: 4px 10px;
    border-radius: 999px;
    background: #f4f4f5;
    color: #555;
    border: 1px solid var(--line);
  }

  .activity-title {
    font-family: var(--font-main);
    font-size: 19px;
    font-weight: normal;
    line-height: 1.3;
    margin: 0 0 12px;
    color: var(--ink);
  }

  .activity-meta-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .activity-meta-tags span {
    font-size: 10.5px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 10px;
    color: var(--ink-light);
  }

  .activity-desc p {
    font-size: 13.5px;
    line-height: 1.75;
    color: #444;
  }

  .activity-kpi-aside {
    min-width: 110px;
    background: var(--page-bg);
    border-left: 1.5px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }

  .kpi-bubble {
    text-align: center;
  }

  .kpi-label {
    display: block;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .kpi-value {
    display: block;
    font-family: var(--font-main);
    font-size: 26px;
    line-height: 1;
    color: var(--ink);
    margin-bottom: 5px;
  }

  .kpi-sub {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted-light);
  }

  .activity-photos {
    border-top: 1.5px solid var(--line);
    padding: 20px 28px;
    background: #fafafa;
  }

  /* ============================
     PHOTO LAYOUTS
  ============================= */
  .photo-single figure {
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #f3f4f6;
    border: 1px solid var(--line);
  }

  .photo-single img {
    width: 100%;
    height: 320px;
    object-fit: cover;
    display: block;
  }

  .photo-duo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .photo-duo figure {
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--line);
    background: #f3f4f6;
  }

  .photo-duo figure img {
    width: 100%;
    height: 220px;
    object-fit: cover;
    display: block;
  }

  .photo-grid-editorial {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 14px;
    align-items: stretch;
  }

  .photo-main {
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--line);
    background: #f3f4f6;
  }

  .photo-main img {
    width: 100%;
    height: 280px;
    object-fit: cover;
    display: block;
  }

  .photo-side {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .photo-side figure {
    flex: 1;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--line);
    background: #f3f4f6;
  }

  .photo-side figure img {
    width: 100%;
    height: 130px;
    object-fit: cover;
    display: block;
  }

  figure figcaption {
    padding: 8px 12px;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.4;
    font-style: italic;
  }

  .more-photos {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .more-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .photo-strip {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .strip-item {
    display: block;
    width: 80px;
    height: 60px;
    border-radius: var(--radius-xs);
    overflow: hidden;
    border: 1px solid var(--line);
    flex-shrink: 0;
  }

  .strip-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform .3s;
  }

  .strip-item:hover img { transform: scale(1.05); }

  .no-photo {
    font-size: 11.5px;
    color: var(--muted);
    font-style: italic;
    padding: 8px 0;
  }

  /* ============================
     TABLES
  ============================= */
  .table-scroll { overflow-x: auto; margin: 16px 0 28px; }

  .editorial-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }

  .editorial-table th {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid var(--ink);
    white-space: nowrap;
  }

  .editorial-table td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    color: var(--ink-light);
  }

  .editorial-table tr:last-child td { border-bottom: 0; }
  .editorial-table tr:hover td { background: #fafafa; }
  .documents-table {
    width: 100%;
    max-width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  .documents-table th,
  .documents-table td {
    word-break: break-word;
    overflow-wrap: anywhere;
    vertical-align: top;
  }
  .document-link {
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .act-name { font-weight: 600; color: var(--ink); }

  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

  .table-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 3px 8px;
    border-radius: 999px;
    background: #f4f4f5;
    color: #444;
    white-space: nowrap;
  }

  .status-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 3px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .status-aprovado_coord, .status-aprovado_admin, .status-aprovado, .status-pago {
    background: #d1fae5;
    color: #065f46;
  }

  .status-solicitado {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-recusado, .status-cancelado {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-devolvido, .status-rascunho {
    background: #fef9c3;
    color: #854d0e;
  }

  /* ============================
     FINANCIAL SECTION
  ============================= */
  .financial-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 24px 0 32px;
  }

  .fin-row {
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 20px;
  }

  .fin-row.fin-dark {
    background: var(--ink);
    border-color: var(--ink);
    color: white;
  }

  .fin-row.fin-full { grid-column: 1 / -1; }

  .fin-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: var(--muted);
    display: block;
    margin-bottom: 10px;
  }

  .fin-row.fin-dark .fin-label { color: rgba(255,255,255,.5); }

  .fin-value {
    font-family: var(--font-main);
    font-size: 22px;
    line-height: 1;
    display: block;
    overflow-wrap: anywhere;
  }

  .fin-row.fin-dark .fin-value { color: white; }

  /* ============================
     EIXOS SUMMARY
  ============================= */
  .eixos-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 28px 0;
  }

  .eixo-card {
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 18px;
    text-align: center;
  }

  .eixo-num {
    font-family: var(--font-main);
    font-size: 28px;
    color: var(--ink);
    line-height: 1;
    margin-bottom: 8px;
  }

  .eixo-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    line-height: 1.4;
  }

  /* ============================
     DIVIDER / BREATH PAGES
  ============================= */
  .divider-line {
    border: none;
    border-top: 1px solid var(--line);
    margin: 48px 0;
  }

  .divider-heavy {
    border: none;
    border-top: 2px solid var(--ink);
    margin: 52px 0;
  }

  .breath-block {
    background: var(--page-bg);
    border-radius: var(--radius);
    padding: 40px 48px;
    margin: 32px 0;
  }

  .breath-quote {
    font-family: var(--font-main);
    font-size: 20px;
    line-height: 1.65;
    color: var(--ink-light);
    font-style: italic;
    border-left: 3px solid var(--ink);
    padding-left: 24px;
    margin: 0;
  }

  /* ============================
     FOOTER
  ============================= */
  .report-footer {
    padding: 32px 64px 40px;
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
  }

  .footer-brand {
    font-family: var(--font-main);
    font-size: 15px;
    color: var(--ink);
    letter-spacing: -.01em;
  }

  .footer-meta {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.6;
    text-align: right;
  }

  /* ============================
     PRINT
  ============================= */
  @media print {
    body { background: white; padding: 0; }
    .actions-bar { display: none; }
    .page {
      box-shadow: none;
      margin: 0;
      max-width: none;
      border-radius: 0;
      page-break-after: always;
    }
    .page-inner { padding: 40px 48px; }
    .cover-content { padding: 40px 48px; }
    .activity-card, figure, .editorial-table { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }

  /* ============================
     FORMATO ANTERIOR / RELATORIO ABRANGENTE
  ============================= */
  @page {
    size: A4;
    margin: 2cm 2cm 3cm;
    @bottom-center {
      content: counter(page) ' / ' counter(pages);
      font-size: 9pt;
      color: #aaa;
    }
  }

  body {
    background: #fff;
    color: #1a1a1a;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 11.5px;
    line-height: 1.7;
    padding: 0;
    counter-reset: section;
  }

  h1 {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 12px;
    letter-spacing: -0.5px;
  }

  h2 {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 17px;
    font-weight: 700;
    border-bottom: 2.5px solid #111;
    padding-bottom: 7px;
    margin: 48px 0 18px;
    page-break-after: avoid;
    letter-spacing: -0.2px;
    counter-increment: section;
  }

  h2::before {
    content: counter(section, decimal-leading-zero) ". ";
    color: #777;
    font-size: 12px;
    font-weight: 400;
  }

  h3 {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    font-weight: 600;
    margin: 22px 0 8px;
    color: #222;
  }

  p {
    font-size: 11.5px;
    line-height: 1.7;
    margin: 0 0 14px;
    text-align: justify;
    hyphens: auto;
  }

  table,
  .editorial-table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 10px;
  }

  th,
  .editorial-table th {
    background: #111;
    color: #fff;
    padding: 6px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 9.5px;
    letter-spacing: 0.3px;
    text-transform: none;
    border-bottom: 0;
  }

  td,
  .editorial-table td {
    padding: 5px 10px;
    border-bottom: 1px solid #ebebeb;
    vertical-align: top;
    color: #333;
  }

  tr:nth-child(even) td,
  .editorial-table tr:nth-child(even) td {
    background: #fafafa;
  }

  .actions-bar {
    max-width: 960px;
    margin: 12px auto;
  }

  .capa {
    min-height: 300px;
    padding: 80px 40px 60px;
    background: linear-gradient(135deg, #0a0a14 0%, #1a1040 50%, #0a0a12 100%);
    color: white;
    text-align: center;
    page-break-after: always;
    position: relative;
    z-index: 5;
    overflow: hidden;
  }

  .capa-img-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.35;
  }

  .capa-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(10,10,20,0.5) 0%, rgba(10,10,20,0.85) 100%);
  }

  .capa-content {
    position: relative;
    z-index: 2;
  }

  .capa h1 {
    color: white;
    font-size: 38px;
    margin-bottom: 10px;
  }

  .capa .subtitle {
    color: rgba(255,255,255,0.7);
    font-size: 15px;
    margin: 6px 0;
    text-align: center;
  }

  .capa .kpis-capa {
    display: flex;
    gap: 0;
    justify-content: center;
    border-top: 1px solid rgba(255,255,255,0.15);
    padding-top: 24px;
    margin-top: 32px;
    flex-wrap: wrap;
  }

  .capa .kpi-c {
    padding: 0 28px;
    border-right: 1px solid rgba(255,255,255,0.12);
  }

  .capa .kpi-c:last-child {
    border-right: 0;
  }

  .capa .kpi-c .val {
    font-size: 26px;
    font-weight: 700;
    color: white;
    display: block;
    line-height: 1;
  }

  .capa .kpi-c .lbl {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(255,255,255,0.5);
    margin-top: 5px;
    display: block;
  }

  .capa .rodape-capa {
    font-size: 10px;
    color: rgba(255,255,255,0.35);
    margin-top: 28px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .secao {
    page-break-before: always;
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 0;
  }

  .sumario {
    page-break-after: always;
  }

  .sumario h2 {
    counter-increment: none;
  }

  .sumario h2::before {
    content: '';
  }

  .sumario ol {
    list-style: none;
    padding: 0;
  }

  .sumario li {
    padding: 8px 0;
    border-bottom: 1px dotted #ddd;
    font-size: 12px;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .sumario li .num {
    color: #999;
    font-size: 10px;
    min-width: 24px;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 20px 0;
  }

  .kpi {
    background: #f7f7f7;
    border-radius: 6px;
    padding: 14px 16px;
    border: 1px solid #e8e8e8;
  }

  .kpi.dark {
    background: #111;
    color: white;
  }

  .kpi .val {
    font-size: 22px;
    font-weight: 700;
    display: block;
    line-height: 1;
  }

  .kpi .lbl {
    font-size: 9px;
    color: #888;
    margin-top: 4px;
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .kpi.dark .lbl {
    color: rgba(255,255,255,0.5);
  }

  .destaque-box {
    background: #f5f5f5;
    border-left: 3px solid #111;
    padding: 14px 18px;
    margin: 20px 0;
    border-radius: 0 5px 5px 0;
  }

  .destaque-box p {
    margin: 0;
    font-size: 12px;
    font-style: italic;
    color: #444;
  }

  .analise-ia {
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 12px 16px;
    margin: 10px 0;
    font-size: 10px;
    color: #555;
    line-height: 1.5;
  }

  .analise-ia p {
    font-size: 10.5px;
    margin-bottom: 8px;
  }

  .foto-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin: 16px 0;
  }

  .foto-item,
  .photo-single figure,
  .photo-duo figure,
  .photo-grid-editorial figure {
    break-inside: avoid;
    border: 1px solid #eee;
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
  }

  img.foto,
  .photo-single img,
  .photo-duo figure img,
  .photo-main img,
  .photo-side figure img {
    max-width: 100%;
    height: 170px;
    width: 100%;
    object-fit: cover;
    border-radius: 0;
    display: block;
  }

  .photo-single img {
    height: 240px;
  }

  .foto-legenda,
  figure figcaption {
    font-size: 9px;
    color: #777;
    margin: 0;
    padding: 7px 8px;
    line-height: 1.3;
    font-style: italic;
  }

  .photo-duo,
  .photo-grid-editorial {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .photo-side {
    display: grid;
    gap: 14px;
  }

  .activity-card,
  .team-report {
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0 22px;
    break-inside: avoid;
    background: #fff;
  }

  .activity-card-inner {
    display: block;
  }

  .activity-card-content {
    padding: 0;
  }

  .activity-title {
    font-size: 14px;
    margin: 6px 0 8px;
  }

  .activity-desc p {
    font-size: 11px;
  }

  .activity-kpi-aside {
    border-left: 0;
    background: #f7f7f7;
    display: inline-block;
    padding: 8px 12px;
    margin: 8px 0;
  }

  .activity-photos {
    border-top: 1px solid #eee;
    padding-top: 12px;
    margin-top: 12px;
    background: #fff;
  }

  .cat-badge,
  .museu-badge,
  .table-badge,
  .badge {
    display: inline-block;
    background: #111;
    color: #fff;
    border-radius: 3px;
    padding: 2px 7px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .badge.green {
    background: #166534;
  }

  .meta-line {
    color: #777;
    font-size: 10px;
    margin: -2px 0 12px;
  }

  .financial-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 20px 0;
  }

  .fin-row {
    border: 1px solid #e8e8e8;
    border-radius: 6px;
    padding: 14px 16px;
  }

  .fin-row.fin-dark {
    background: #111;
    color: white;
  }

  .fin-label {
    font-size: 9px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    display: block;
  }

  .fin-value {
    font-size: 16px;
    font-weight: 700;
    display: block;
    margin-top: 5px;
    overflow-wrap: anywhere;
  }

  .rodape {
    max-width: 960px;
    font-size: 9px;
    color: #bbb;
    text-align: center;
    margin: 48px auto 0;
    border-top: 1px solid #eee;
    padding: 12px 0 28px;
  }

  @media print {
    body {
      background: white;
      padding: 0;
    }

    .report-pdf-institutional-header {
      position: fixed;
      left: 14mm;
      right: 14mm;
      bottom: -25mm;
      z-index: 1;
      display: grid;
      grid-template-columns: 16mm minmax(0, 1fr);
      column-gap: 10mm;
      align-items: center;
      box-sizing: border-box;
      height: 20mm;
      padding: 3mm 0 0;
      page-break-inside: avoid;
      break-inside: avoid;
      background: #ffffff;
      border-top: 1px solid rgba(23,23,23,.1);
      pointer-events: none;
    }

    .actions-bar {
      display: none;
    }

    .secao {
      page-break-before: always;
    }

    .kpi-grid,
    .foto-item,
    .destaque-box,
    .activity-card,
    .team-report,
    tr {
      page-break-inside: avoid;
    }

    h2,
    h3 {
      page-break-after: avoid;
    }
  }
</style>
</head>
<body>

  <div class="actions-bar">
    <button class="btn btn-secondary" onclick="window.print()">Salvar como PDF</button>
    <button class="btn btn-primary" onclick="window.print()">Imprimir</button>
  </div>

  ${renderReportPdfInstitutionalHeader()}

  ${legacyHasSection(secoesSelecionadas, 'capa') ? `
    <div class="capa">
      ${fotoCovUrl ? `<div class="capa-img-bg" style="background-image:url('${fotoCovUrl}')"></div>` : ''}
      <div class="capa-overlay"></div>
      <div class="capa-content">
        <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:16px;">
          Museus Centro · Relatório Institucional Consolidado · ${new Date().getFullYear()}
        </div>
        <h1>Relatório Físico-Financeiro</h1>
        <div class="subtitle">Projeto Museus Centro</div>
        <div class="subtitle">${periodo}</div>
        <div class="subtitle" style="color:rgba(255,255,255,0.5);font-size:13px;">${museu}</div>

        <div class="kpis-capa">
          <div class="kpi-c"><span class="val">${fmtInt(contexto.total_relatorios)}</span><span class="lbl">Relatórios</span></div>
          <div class="kpi-c"><span class="val">${fmtInt(contexto.publico_total)}</span><span class="lbl">Público</span></div>
          <div class="kpi-c"><span class="val">${fmtInt(contexto.total_atividades)}</span><span class="lbl">Atividades</span></div>
          <div class="kpi-c"><span class="val">${percentualExecucao}%</span><span class="lbl">Execução</span></div>
          <div class="kpi-c"><span class="val">${fmtInt(contexto.programacao_total)}</span><span class="lbl">Prog.</span></div>
          <div class="kpi-c"><span class="val">${fmtInt(contexto.equipe_total || 0)}</span><span class="lbl">Equipe</span></div>
        </div>

        <div class="rodape-capa">MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.25);margin-top:10px;">Gerado em ${dataGeracao}</div>
      </div>
    </div>
  ` : ''}

  ${renderLegacySumario(secoesSelecionadas)}

  ${legacyHasSection(secoesSelecionadas, 'introducao') ? `
    <div class="secao">
      <h2>Introdução Institucional</h2>
      ${paragraphize(textos.introducao)}
      <div class="destaque-box">
        <p>Este relatório consolida dados registrados no Museu Centro APP, articulando entregas físicas, evidências fotográficas, execução financeira e relatórios individuais das equipes em uma única leitura de prestação de contas.</p>
      </div>
      ${renderLegacyKpis(contexto, percentualExecucao)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'territorio') ? `
    <div class="secao">
      <h2>Território e Contexto Cultural</h2>
      ${paragraphize(textos.contexto_territorial || textos.territorio || 'O Projeto Museus Centro articula MIS, MHAB e MUMO como equipamentos complementares de memória, imagem, moda, cidade e mediação cultural no centro de Belo Horizonte. A leitura territorial do período evidencia a importância de integrar programação, comunicação, documentação e execução financeira para sustentar uma política cultural acompanhável, transparente e orientada por evidências.')}
      ${renderTabelaPorMuseu(contexto.por_museu)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'resumo_geral') ? `
    <div class="secao">
      <h2>Resumo Geral e Indicadores</h2>
      ${paragraphize(textos.resumo_geral)}
      ${renderLegacyKpis(contexto, percentualExecucao)}
      <h3>Distribuição por museu</h3>
      ${renderTabelaPorMuseu(contexto.por_museu)}
      <h3>Distribuição por eixo institucional</h3>
      ${renderTabelaEixos(totalPorEixo)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'publico') ? `
    <div class="secao">
      <h2>Público Alcançado</h2>
      ${paragraphize(textos.publico_alcancado)}
      ${renderTabelaPorMuseu(contexto.por_museu)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'metas') ? `
    <div class="secao">
      <h2>Metas do 3º Aditivo</h2>
      ${paragraphize(textos.metas || 'As metas do 3º Aditivo são acompanhadas a partir da relação entre execução física, produção programática, registros das equipes, evidências fotográficas e evolução orçamentária. No período consolidado, a leitura aponta uma etapa de estruturação operacional com base documental suficiente para orientar os ciclos seguintes.')}
      <div class="analise-ia">
        <strong>Leitura de acompanhamento:</strong>
        ${paragraphize('A execução física do projeto aparece nos relatórios mensais, nas atividades registradas e na programação vinculada aos museus. A execução financeira é apresentada nas seções de compras e rubricas, permitindo verificar aderência entre planejamento, contratação, entrega e prestação de contas.')}
      </div>
      ${renderTabelaEixos(totalPorEixo)}
    </div>
  ` : ''}

  ${(legacyHasSection(secoesSelecionadas, 'programacao') || legacyHasSection(secoesSelecionadas, 'agenda_programacao')) ? `
    <div class="secao">
      <h2>Agenda e Programação</h2>
      ${paragraphize(textos.programacao || 'A programação do período reúne atividades públicas, oficinas, visitas mediadas, formações, ações educativas, eventos e processos de preparação operacional. A tabela abaixo recupera os registros disponíveis no app para permitir leitura cronológica e conferência por museu.')}
      ${renderProgramacaoDetalhada(programacao)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'atividades_museu') ? `
    <div class="secao">
      <h2>Atividades por Museu e Eixo</h2>
      <p>As atividades abaixo foram organizadas por eixo institucional, preservando os textos de origem das equipes sempre que disponíveis e incorporando fotos vinculadas no app.</p>
      <h3>Gestão e Governança</h3>
      ${paragraphize(textos.capitulos?.gestao_governanca)}
      ${renderAtividadesPorCategoria(contexto, textos, 'gestao_governanca')}
      <h3>Produção e Operações</h3>
      ${paragraphize(textos.capitulos?.producao_operacao)}
      ${renderAtividadesPorCategoria(contexto, textos, 'producao_operacao')}
      <h3>Comunicação</h3>
      ${paragraphize(textos.capitulos?.comunicacao_produtos)}
      ${renderAtividadesPorCategoria(contexto, textos, 'comunicacao_produtos')}
      <h3>Atividades com Público</h3>
      ${paragraphize(textos.capitulos?.atividade_publico)}
      ${renderAtividadesPorCategoria(contexto, textos, 'atividade_publico')}
      <h3>Quadro sintético das ações</h3>
      ${renderQuadroSintetico(contexto)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'relatorios_completos') ? `
    <div class="secao">
      <h2>Relatórios das Equipes</h2>
      <p>Esta seção resgata os relatórios individuais aprovados no período, permitindo conferir autoria, função, museu de atuação, atividades vinculadas, público declarado e principais textos narrativos de cada integrante da equipe.</p>
      ${renderRelatoriosEquipeTabela(relatoriosEquipe)}
      ${renderRelatoriosEquipeDetalhados(relatoriosEquipe)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'galeria_evidencias') ? `
    <div class="secao">
      <h2>Galeria e Evidências</h2>
      <p>As imagens abaixo são recuperadas dos registros fotográficos vinculados às atividades e relatórios do app, priorizando evidências de ação, presença de público, mediação e operação nos museus.</p>
      ${renderGaleriaGeral(todasFotos, 30)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'comunicacao') ? `
    <div class="secao">
      <h2>Comunicação e Visibilidade</h2>
      ${paragraphize(textos.comunicacao || textos.capitulos?.comunicacao_produtos || 'A comunicação do período foi analisada a partir de atividades registradas, produção de conteúdo, evidências fotográficas e relatos das equipes. O conjunto demonstra a importância de articular cobertura, memória visual, redes sociais e documentação institucional como parte da própria execução do projeto.')}
      ${renderAtividadesPorCategoria(contexto, textos, 'comunicacao_produtos')}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'financeiro') ? `
    <div class="secao">
      <h2>Execução Financeira</h2>
      <div class="financial-summary">
        <div class="fin-row fin-dark">
          <span class="fin-label">Orçamento oficial — 3º Aditivo</span>
          <span class="fin-value">${fmtBRL(TOTAL_OFICIAL)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Valor utilizado</span>
          <span class="fin-value">${fmtBRL(contexto.valor_utilizado)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Saldo disponível</span>
          <span class="fin-value">${fmtBRL(contexto.saldo)}</span>
        </div>
      </div>
      ${paragraphize(textos.financeiro || `A execução financeira consolidada corresponde a ${percentualExecucao}% do orçamento oficial do 3º Aditivo. A leitura deve ser feita em conjunto com as compras do período, o acompanhamento das rubricas e a documentação fiscal anexada ao app.`)}
      <h3>Transações do período</h3>
      ${renderCompras(contexto.compras)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'rubricas') ? `
    <div class="secao">
      <h2>Rubricas Orçamentárias</h2>
      <p>A tabela a seguir apresenta a execução por rubrica orçamentária, com valores previstos, utilizados, saldos e percentuais de execução. Ela funciona como instrumento de auditoria do relatório físico-financeiro e de planejamento para os próximos ciclos.</p>
      ${renderRubricasDetalhadas(rubricas)}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'prestacao') ? `
    <div class="secao">
      <h2>Prestação de Contas</h2>
      ${paragraphize(textos.prestacao)}
      <div class="destaque-box">
        <p>A rastreabilidade do relatório depende da convergência entre relatórios aprovados, fotos, notas fiscais, rubricas, programação e registros de compras mantidos no Museu Centro APP.</p>
      </div>
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'notas-fiscais-contratos') ? `
    ${renderDocumentsChapterHTML(contexto)}
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'app_museu_centro') ? `
    <div class="secao">
      <h2>Museu Centro APP</h2>
      ${paragraphize(textos.app_museu_centro || 'O Museu Centro APP opera como base de gestão, memória institucional e prestação de contas do projeto. A plataforma centraliza relatórios mensais, programação, fotos, anexos, solicitações de compra, notas fiscais, rubricas e base de conhecimento, reduzindo dispersão documental e qualificando a conferência das entregas. Na geração deste relatório, o app funciona como fonte primária: os dados consolidados derivam dos registros aprovados pelas equipes e dos documentos anexados, enquanto a camada editorial organiza esses dados em narrativa institucional, tabelas e evidências visuais.')}
    </div>
  ` : ''}

  ${legacyHasSection(secoesSelecionadas, 'conclusao') ? `
    <div class="secao">
      <h2>Conclusão</h2>
      ${paragraphize(textos.conclusao)}
      <div class="destaque-box">
        <p>O relatório demonstra uma gestão cultural orientada por método, documentação, evidência visual, controle financeiro e leitura integrada das equipes de campo.</p>
      </div>
    </div>
  ` : ''}

  <div class="rodape">
    Relatório Institucional — Projeto Museus Centro — Gerado com Museu Centro APP<br>
    MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus — ${periodo}
  </div>

  <!-- ====== CAPA ====== -->
  ${hasSection(secoesSelecionadas, 'capa') ? `
  <div class="page">
    <div class="cover-page">
      <div class="cover-bg">
        ${fotoCovUrl
          ? `<img src="${fotoCovUrl}" alt="Imagem de capa — Museus Centro" />`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0a0a1a 0%,#1a1040 50%,#0a0a12 100%);"></div>`
        }
      </div>
      <div class="cover-overlay"></div>
      <div class="cover-content">
        <div class="cover-eyebrow">Museus Centro · Relatório Institucional Consolidado · ${new Date().getFullYear()}</div>
        <h1 class="cover-title">Museus Centro<br>Relatório Anual 2026</h1>
        <p class="cover-subtitle">Território, memória, cultura e transformação social no centro de Belo Horizonte. ${museu !== 'Todos os museus' ? `Museu: ${museu}.` : ''} Período: ${periodo}.</p>

        <div class="cover-kpis">
          <div class="cover-kpi">
            <span class="cover-kpi-label">Relatórios</span>
            <span class="cover-kpi-value">${fmtInt(contexto.total_relatorios)}</span>
          </div>
          <div class="cover-kpi">
            <span class="cover-kpi-label">Público</span>
            <span class="cover-kpi-value">${fmtInt(contexto.publico_total)}</span>
          </div>
          <div class="cover-kpi">
            <span class="cover-kpi-label">Atividades</span>
            <span class="cover-kpi-value">${fmtInt(contexto.total_atividades)}</span>
          </div>
          <div class="cover-kpi">
            <span class="cover-kpi-label">Execução</span>
            <span class="cover-kpi-value">${percentualExecucao}%</span>
          </div>
        </div>

        <div class="cover-footer-line">MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus</div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- ====== INTRODUÇÃO ====== -->
  ${hasSection(secoesSelecionadas, 'introducao') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">01 — Apresentação</span>
      <h2 class="section-title">Introdução</h2>
      ${textos.introducao ? `<p class="section-lead">${escapeHtml(String(textos.introducao).slice(0, 300))}...</p>` : ''}
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.introducao)}
      ${textos.contexto_territorial ? `
      <div class="breath-block">
        <blockquote class="breath-quote">${escapeHtml(String(textos.contexto_territorial || '').slice(0, 400))}</blockquote>
      </div>` : ''}
    </div>
  </div>
  ` : ''}

  <!-- ====== RESUMO GERAL ====== -->
  ${hasSection(secoesSelecionadas, 'resumo_geral') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">02 — Período</span>
      <h2 class="section-title">Resumo do período</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.resumo_geral)}

      <div class="kpis-grid">
        <div class="kpi-card kpi-dark">
          <span class="kpi-card-label">Relatórios aprovados</span>
          <span class="kpi-card-value">${fmtInt(contexto.total_relatorios)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card-label">Público total</span>
          <span class="kpi-card-value">${fmtInt(contexto.publico_total)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card-label">Atividades</span>
          <span class="kpi-card-value">${fmtInt(contexto.total_atividades)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card-label">Programação</span>
          <span class="kpi-card-value">${fmtInt(contexto.programacao_total)}</span>
        </div>
      </div>

      ${Object.keys(contexto.por_museu || {}).length > 0 ? `
      <h2>Distribuição por museu</h2>
      ${renderPorMuseu(contexto.por_museu)}` : ''}
    </div>
  </div>
  ` : ''}

  <!-- ====== PÚBLICO ====== -->
  ${hasSection(secoesSelecionadas, 'publico') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">03 — Alcance</span>
      <h2 class="section-title">Público alcançado</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.publico_alcancado)}
    </div>
  </div>
  ` : ''}

  <!-- ====== ATIVIDADES ====== -->
  ${hasSection(secoesSelecionadas, 'atividades') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">04 — Ações e Projetos</span>
      <h2 class="section-title">Atividades realizadas</h2>
      <p class="section-lead">Documentação consolidada das ações executadas no período, organizadas por eixo institucional a partir dos relatórios aprovados pela coordenação.</p>
    </div>
    <div class="page-inner" style="padding-top:0">

      <div class="eixos-summary">
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.gestao_governanca}</div>
          <div class="eixo-label">Gestão e Governança</div>
        </div>
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.producao_operacao}</div>
          <div class="eixo-label">Produção e Operações</div>
        </div>
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.comunicacao_produtos}</div>
          <div class="eixo-label">Comunicação</div>
        </div>
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.atividade_publico}</div>
          <div class="eixo-label">Atividades com Público</div>
        </div>
      </div>

      <hr class="divider-heavy">

      <h2>Gestão e Governança</h2>
      ${textos.capitulos?.gestao_governanca ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.gestao_governanca).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'gestao_governanca')}

      <hr class="divider-line">

      <h2>Produção e Operações</h2>
      ${textos.capitulos?.producao_operacao ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.producao_operacao).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'producao_operacao')}

      <hr class="divider-line">

      <h2>Comunicação</h2>
      ${textos.capitulos?.comunicacao_produtos ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.comunicacao_produtos).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'comunicacao_produtos')}

      <hr class="divider-line">

      <h2>Atividades com Público</h2>
      ${textos.capitulos?.atividade_publico ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.atividade_publico).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'atividade_publico')}

      <hr class="divider-heavy">

      <h2>Quadro sintético das ações</h2>
      ${renderQuadroSintetico(contexto)}
    </div>
  </div>
  ` : ''}

  <!-- ====== FINANCEIRO ====== -->
  ${hasSection(secoesSelecionadas, 'financeiro') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">05 — Execução Financeira</span>
      <h2 class="section-title">Orçamento e execução</h2>
      <p class="section-lead">Síntese da execução orçamentária do 3º Termo Aditivo, com base nos lançamentos aprovados e nas rubricas oficiais do projeto.</p>
    </div>
    <div class="page-inner" style="padding-top:0">

      <div class="financial-summary">
        <div class="fin-row fin-dark">
          <span class="fin-label">Orçamento oficial — 3º Aditivo</span>
          <span class="fin-value">${fmtBRL(TOTAL_OFICIAL)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Valor utilizado</span>
          <span class="fin-value">${fmtBRL(contexto.valor_utilizado)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Saldo disponível</span>
          <span class="fin-value">${fmtBRL(contexto.saldo)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Percentual de execução</span>
          <span class="fin-value">${percentualExecucao}%</span>
        </div>
      </div>

      ${contexto.compras?.length > 0 ? `
      <h2>Transações do período</h2>
      ${renderCompras(contexto.compras)}` : ''}
    </div>
  </div>
  ` : ''}

  <!-- ====== PRESTAÇÃO ====== -->
  ${hasSection(secoesSelecionadas, 'prestacao') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">06 — Prestação de Contas</span>
      <h2 class="section-title">Prestação de contas</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.prestacao)}
    </div>
  </div>
  ` : ''}

  <!-- ====== CONCLUSÃO ====== -->
  ${hasSection(secoesSelecionadas, 'conclusao') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">07 — Encerramento</span>
      <h2 class="section-title">Conclusão</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.conclusao)}
    </div>
    <div class="report-footer">
      <div class="footer-brand">Museus Centro</div>
      <div class="footer-meta">
        MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus<br>
        Plataforma de gestão cultural — ${periodo}<br>
        Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
    </div>
  </div>
  ` : ''}

</body>
</html>`;
}

export default montarHtmlRelatorioFisicoFinanceiro;
