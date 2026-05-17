import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

function getStoredHtml() {
  try {
    return sessionStorage.getItem('relatorio_fisico_financeiro_html') || '';
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function parsePtDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);

  if (!match) return null;

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getReportPeriodFromHtml(html) {
  const match = String(html || '').match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);

  return {
    from: parsePtDate(match?.[1]) || '2026-02-02',
    to: parsePtDate(match?.[2]) || '2026-04-30',
  };
}

function filterByPeriod(items, dateFrom, dateTo) {
  if (!Array.isArray(items)) return [];

  return items.filter((item) => {
    const rawDate =
      item?.submitted_at ||
      item?.data_inicio ||
      item?.data_realizacao ||
      item?.data ||
      item?.created_date ||
      item?.updated_date ||
      '';

    const date = String(rawDate).slice(0, 10);

    if (!date) return true;
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;

    return true;
  });
}

function getPublicoAtividade(atividade) {
  const direto = toNumber(
    atividade?.publico_total ??
      atividade?.publico_estimado ??
      atividade?.publico ??
      0
  );

  if (direto > 0) return direto;

  const medio = toNumber(
    atividade?.publico_medio_por_sessao ??
      atividade?.publico_medio ??
      0
  );

  const vezes = Math.max(
    1,
    Math.round(
      toNumber(
        atividade?.quantas_vezes_ocorreu ??
          atividade?.ocorrencias ??
          1
      )
    )
  );

  return medio * vezes;
}

function getReportAuthor(report) {
  return (
    report?.author_name ||
    report?.user_name ||
    report?.created_by ||
    report?.email ||
    'Profissional não identificado'
  );
}

function getReportPeriodLabel(report) {
  return [
    report?.mes_referencia || report?.mes || '',
    report?.ano || '',
  ]
    .filter(Boolean)
    .join('/');
}

function getActivityTitle(activity, index) {
  return (
    activity?.titulo ||
    activity?.nome ||
    activity?.nome_atividade ||
    activity?.atividade ||
    `Atividade ${index + 1}`
  );
}

function stripEditorialMarkers(html) {
  return String(html || '')
    .replace(
      /<p>\s*(?:\*\*)?Par[áa]grafo\s+\d+\s*[—-][^:<]*:?\s*(?:\*\*)?\s*<\/p>/gi,
      ''
    )
    .replace(
      /<p>\s*(?:\*\*)?Par[áa]grafo\s+\d+\s*:?\s*(?:\*\*)?\s*<\/p>/gi,
      ''
    )
    .replace(
      /(<p>\s*)(?:\*\*)?Par[áa]grafo\s+\d+\s*[—-][^:<]*:?\s*(?:\*\*)?\s*/gi,
      '$1'
    )
    .replace(
      /(<p>\s*)(?:\*\*)?Par[áa]grafo\s+\d+\s*:?\s*(?:\*\*)?\s*/gi,
      '$1'
    )
    .replace(/<p>\s*#{1,6}\s*([^<]+)<\/p>/g, '<h3>$1</h3>')
    .replace(/<p>\s*---\s*<\/p>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function renderTextBlock(label, value) {
  if (!value) return '';

  return `
    <div class="anexo-text-block">
      <strong>${escapeHtml(label)}:</strong>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function renderActivityFiles(activity) {
  const files = [];

  const fotos = Array.isArray(activity?.fotos)
    ? activity.fotos
    : [];

  const anexos = Array.isArray(activity?.anexos)
    ? activity.anexos
    : [];

  const arquivos = Array.isArray(activity?.arquivos)
    ? activity.arquivos
    : [];

  [...fotos, ...anexos, ...arquivos].forEach((file, index) => {
    const url =
      file?.file_url ||
      file?.drive_url ||
      file?.url ||
      file?.arquivo_url ||
      '';

    if (!url) return;

    const label =
      file?.legenda ||
      file?.nome ||
      file?.name ||
      `Arquivo ${index + 1}`;

    files.push(`
      <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        ${escapeHtml(label)}
      </a>
    `);
  });

  if (!files.length) return '';

  return `
    <div class="anexo-files">
      <strong>Arquivos e evidências:</strong>
      ${files.join('')}
    </div>
  `;
}

function buildRelatoriosAnexosHtml(reports = []) {
  if (!reports.length) return '';

  const anexos = reports
    .map((report, reportIndex) => {
      const atividades = Array.isArray(report?.atividades)
        ? report.atividades
        : [];

      const author = getReportAuthor(report);

      const periodo =
        getReportPeriodLabel(report) ||
        'Período não informado';

      const publicoDeclarado = toNumber(
        report?.publico_geral_declarado ??
          report?.publico_total ??
          0
      );

      const atividadesHtml = atividades.length
        ? atividades
            .map((activity, index) => {
              return `
                <article class="anexo-atividade">
                  <h4>
                    ${String(index + 1).padStart(2, '0')} ·
                    ${escapeHtml(
                      getActivityTitle(activity, index)
                    )}
                  </h4>

                  <div class="anexo-meta-line">
                    <span>
                      <strong>Data:</strong>
                      ${escapeHtml(
                        activity?.data_realizacao ||
                          activity?.data_inicio ||
                          activity?.data ||
                          '—'
                      )}
                    </span>

                    <span>
                      <strong>Tipo:</strong>
                      ${escapeHtml(
                        activity?.classificacao ||
                          activity?.tipo ||
                          '—'
                      )}
                    </span>

                    <span>
                      <strong>Público:</strong>
                      ${formatInt(
                        getPublicoAtividade(activity)
                      )}
                    </span>
                  </div>

                  ${renderTextBlock(
                    'Objetivo',
                    activity?.objetivo
                  )}

                  ${renderTextBlock(
                    'Descrição do executado',
                    activity?.descricao_executado ||
                      activity?.descricao ||
                      activity?.relato
                  )}

                  ${renderTextBlock(
                    'Resultados e impactos',
                    activity?.resultados_impactos ||
                      activity?.impactos ||
                      activity?.resultado
                  )}

                  ${renderTextBlock(
                    'Problemas',
                    activity?.problemas
                  )}

                  ${renderTextBlock(
                    'Soluções',
                    activity?.solucoes
                  )}

                  ${renderTextBlock(
                    'Depoimentos ou fatos marcantes',
                    activity?.depoimento_participantes ||
                      activity?.depoimentos ||
                      activity?.fatos_marcantes
                  )}

                  ${renderActivityFiles(activity)}
                </article>
              `;
            })
            .join('')
        : '<p>Nenhuma atividade detalhada vinculada a este relatório.</p>';

      return `
        <section class="anexo-relatorio">
          <div class="mini-capa-anexo">
            <div class="anexo-eyebrow">
              ANEXO ${String(reportIndex + 1).padStart(
                2,
                '0'
              )} · Relatório individual da equipe
            </div>

            <h2>${escapeHtml(author)}</h2>

            <p>
              ${escapeHtml(
                report?.funcao ||
                  report?.role ||
                  'Função não informada'
              )}
              ·
              ${escapeHtml(
                report?.museu ||
                  'Museu/atuação não informado'
              )}
              ·
              ${escapeHtml(periodo)}
            </p>
          </div>

          <div class="anexo-resumo-grid">
            <div>
              <span>Atividades</span>
              <strong>${formatInt(
                atividades.length
              )}</strong>
            </div>

            <div>
              <span>Público declarado</span>
              <strong>${formatInt(
                publicoDeclarado
              )}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>${escapeHtml(
                report?.status || '—'
              )}</strong>
            </div>
          </div>

          ${renderTextBlock(
            'Resumo executivo',
            report?.resumo_executivo
          )}

          ${renderTextBlock(
            'Resumo do período',
            report?.resumo_periodo
          )}

          ${renderTextBlock(
            'Pontos positivos',
            report?.avaliacao_pontos_positivos
          )}

          ${renderTextBlock(
            'Desafios',
            report?.avaliacao_desafios ||
              report?.desafios
          )}

          ${renderTextBlock(
            'Encaminhamentos',
            report?.encaminhamentos ||
              report?.proximos_passos
          )}

          <h3>Atividades detalhadas do relatório</h3>

          ${atividadesHtml}
        </section>
      `;
    })
    .join('');

  return `
    <section class="secao anexos-equipe-section">
      <h2>Anexos — Relatórios Individuais das Equipes</h2>

      <p>
        Esta seção reúne, um a um, os relatórios individuais aprovados
        que fundamentam a síntese institucional do período.
      </p>

      ${anexos}
    </section>
  `;
}

function getAnexosCss() {
  return `
    .anexos-equipe-section {
      page-break-before: always;
    }

    .anexo-relatorio {
      page-break-before: always;
      break-inside: avoid;
    }

    .mini-capa-anexo {
      border: 2px solid #111;
      border-radius: 14px;
      padding: 24px;
      margin: 22px 0 18px;
      background: linear-gradient(
        135deg,
        #f7f7f7 0%,
        #ffffff 100%
      );
    }

    .mini-capa-anexo h2 {
      border-bottom: 0;
      margin: 8px 0 6px;
      padding: 0;
      font-size: 24px;
    }

    .mini-capa-anexo p {
      margin: 0;
      color: #555;
      font-size: 12px;
    }

    .anexo-eyebrow {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .16em;
      color: #777;
      font-weight: 700;
    }

    .anexo-resumo-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 14px 0 18px;
    }

    .anexo-resumo-grid div {
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 10px;
      background: #fafafa;
    }

    .anexo-resumo-grid span {
      display: block;
      font-size: 8.5px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: .1em;
    }

    .anexo-resumo-grid strong {
      font-size: 15px;
    }

    .anexo-text-block {
      margin: 10px 0;
      break-inside: avoid;
    }

    .anexo-text-block strong {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .anexo-text-block p {
      margin: 3px 0 0;
    }

    .anexo-atividade {
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 14px;
      margin: 12px 0;
      background: #fff;
      break-inside: avoid;
    }

    .anexo-atividade h4 {
      margin: 0 0 8px;
      font-size: 13px;
    }

    .anexo-meta-line {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      font-size: 9.5px;
      color: #555;
      margin-bottom: 8px;
    }

    .anexo-files {
      margin-top: 8px;
      font-size: 10px;
    }

    .anexo-files strong {
      display: block;
      margin-bottom: 4px;
    }

    .anexo-files a {
      display: inline-block;
      margin: 0 6px 6px 0;
      padding: 3px 7px;
      border-radius: 999px;
      background: #f3f3f3;
      color: #111;
      text-decoration: none;
      border: 1px solid #e0e0e0;
    }
  `;
}

function addAnexosCss(html) {
  if (!html || html.includes('.anexo-relatorio')) {
    return html;
  }

  return html.replace(
    '</style>',
    `${getAnexosCss()}</style>`
  );
}

function addAnexosToSummary(html) {
  if (
    !html ||
    html.includes('Anexos — Relatórios Individuais')
  ) {
    return html;
  }

  const item = `
    <li>
      <span class="num">AN</span>
      <span class="titulo-item">
        Anexos — Relatórios Individuais
      </span>
    </li>
  `;

  return html.replace('</ol>', `${item}</ol>`);
}

function prepareFinalHtml(rawHtml, reports = []) {
  let finalHtml = stripEditorialMarkers(rawHtml);

  finalHtml = addAnexosCss(finalHtml);
  finalHtml = addAnexosToSummary(finalHtml);

  const anexosHtml =
    buildRelatoriosAnexosHtml(reports);

  if (
    anexosHtml &&
    !finalHtml.includes('anexos-equipe-section')
  ) {
    finalHtml = finalHtml.replace(
      '</body>',
      `${anexosHtml}</body>`
    );
  }

  try {
    sessionStorage.setItem(
      'relatorio_fisico_financeiro_html',
      finalHtml
    );
  } catch {}

  return finalHtml;
}

async function loadReportsForHtml(html) {
  try {
    const { from, to } =
      getReportPeriodFromHtml(html);

    const reportsRaw = await base44.entities.Report.list(
      '-updated_date',
      1000
    );

    return filterByPeriod(
      reportsRaw,
      from,
      to
    ).filter(
      (report) =>
        !report?.status ||
        report.status === 'APPROVED' ||
        report.status === 'APROVADO'
    );
  } catch (error) {
    console.warn(
      'Falha ao carregar anexos individuais dos relatórios:',
      error
    );

    return [];
  }
}

export default function RelatorioPreview() {
  const navigate = useNavigate();
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const stored = getStoredHtml();

      const reports =
        await loadReportsForHtml(stored);

      const finalHtml = prepareFinalHtml(
        stored,
        reports
      );

      if (!cancelled) {
        setHtml(finalHtml);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const iframeSrcDoc = useMemo(
    () =>
      html ||
      '<html><body><p>Prévia não encontrada.</p></body></html>',
    [html]
  );

  function handlePrint() {
    const iframe = document.getElementById(
      'relatorio-preview-frame'
    );

    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }

    window.print();
  }

  function handleDownloadHtml() {
    const blob = new Blob([html || ''], {
      type: 'text/html;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `relatorio_fisico_financeiro_${new Date()
      .toISOString()
      .slice(0, 10)}.html`;

    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-black tracking-tight">
              Prévia do Relatório Físico-Financeiro
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              Visualização do documento final.
              Use imprimir para salvar como PDF.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => navigate('/Relatorios')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>

            <Button
              variant="outline"
              onClick={handleDownloadHtml}
              className="gap-2"
              disabled={!html}
            >
              <Download className="w-4 h-4" />
              Baixar HTML
            </Button>

            <Button
              onClick={handlePrint}
              className="bg-black hover:bg-gray-800 text-white gap-2"
              disabled={!html}
            >
              <Printer className="w-4 h-4" />
              Salvar como PDF
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border-gray-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {html ? (
              <iframe
                id="relatorio-preview-frame"
                title="Prévia do relatório físico-financeiro"
                srcDoc={iframeSrcDoc}
                className="w-full h-[calc(100vh-180px)] bg-gray-100"
              />
            ) : (
              <div className="min-h-[420px] flex items-center justify-center text-center p-8">
                <div>
                  <p className="text-base font-semibold text-black">
                    Nenhuma prévia carregada.
                  </p>

                  <p className="text-sm text-gray-500 mt-1">
                    Gere a prévia pelo botão
                    Relatório Físico-Financeiro
                    em Relatórios.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
