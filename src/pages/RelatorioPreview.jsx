import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function getStoredHtml() {
  try {
    return sessionStorage.getItem('relatorio_fisico_financeiro_html') || '';
  } catch {
    return '';
  }
}

export default function RelatorioPreview() {
  const navigate = useNavigate();
  const [html, setHtml] = useState('');

  useEffect(() => {
    setHtml(getStoredHtml());
  }, []);

  const iframeSrcDoc = useMemo(() => html || '<html><body><p>Prévia não encontrada.</p></body></html>', [html]);

  function handlePrint() {
    const iframe = document.getElementById('relatorio-preview-frame');
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }

    window.print();
  }

  function handleDownloadHtml() {
    const blob = new Blob([html || ''], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `relatorio_fisico_financeiro_${new Date().toISOString().slice(0, 10)}.html`;
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
              Visualização do documento final. Use imprimir para salvar como PDF.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate('/Relatorios')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>

            <Button variant="outline" onClick={handleDownloadHtml} className="gap-2" disabled={!html}>
              <Download className="w-4 h-4" />
              Baixar HTML
            </Button>

            <Button onClick={handlePrint} className="bg-black hover:bg-gray-800 text-white gap-2" disabled={!html}>
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
                  <p className="text-base font-semibold text-black">Nenhuma prévia carregada.</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Gere a prévia pelo botão Relatório Físico-Financeiro em Relatórios.
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

