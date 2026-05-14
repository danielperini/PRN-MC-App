import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Download, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];
const SEÇÕES_DISPONÍVEIS = [
  ['capa', 'Capa'],
  ['introducao', 'Introdução'],
  ['painel_executivo', 'Painel Executivo'],
  ['agenda_programacao', 'Agenda e Programação'],
  ['atividades_consolidadas', 'Atividades Consolidadas'],
  ['relatorios_completos', 'Relatórios Completos'],
  ['comunicacao', 'Comunicação'],
  ['fotos', 'Fotos e Registros'],
  ['financeiro', 'Execução Financeira'],
  ['notas_fiscais', 'Documentação Fiscal'],
  ['rubricas', 'Rubricas Orçamentárias'],
  ['compras', 'Compras e Pagamentos'],
  ['equipe', 'Equipe'],
  ['prestacao_integral', 'Prestação de Contas'],
  ['conclusao', 'Conclusão'],
];

export default function RelatorioFisicoFinanceiroGenerator() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [museu, setMuseu] = useState('');
  const [secoes, setSecoes] = useState(SEÇÕES_DISPONÍVEIS.map(s => s[0]));
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [metricas, setMetricas] = useState(null);
  const [html, setHtml] = useState(null);
  const [introIA, setIntroIA] = useState(true);
  const [modoEntrega, setModoEntrega] = useState(false);

  const toggleSecao = (id) => {
    setSecoes(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handlePreview = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Informe datas');
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
        dateFrom,
        dateTo,
        museu: museu || null,
        secoes,
        modo: 'previa',
        introIA,
        modoEntrega,
      });

      if (res.data?.error) {
        toast.error('Erro: ' + res.data.error);
      } else {
        setMetricas(res.data);
        setPreview(true);
        toast.success('Métricas carregadas');
      }
    } catch (err) {
      toast.error('Erro ao carregar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarCompleto = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Informe datas');
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
        dateFrom,
        dateTo,
        museu: museu || null,
        secoes,
        modo: 'completo',
        introIA,
        modoEntrega,
      });

      if (res.data?.error) {
        toast.error('Erro: ' + res.data.error);
      } else if (res.data?.html) {
        setHtml(res.data.html);
        toast.success('Relatório gerado com sucesso');
      }
    } catch (err) {
      toast.error('Erro ao gerar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportarPDF = async () => {
    if (!html) {
      toast.error('Gere o relatório antes de exportar');
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('exportarRelatorioFisicoFinanceiroPDF', {
        html,
        dateFrom,
        dateTo,
        museu: museu || 'Consolidado',
        formato: 'ambos',
      });

      if (res.data?.error) {
        toast.error('Erro: ' + res.data.error);
      } else {
        toast.success('Relatório exportado e armazenado no Drive');
      }
    } catch (err) {
      toast.error('Erro ao exportar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-6">Gerar Relatório Físico-Financeiro</h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Data Inicial</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Data Final</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Museu (opcional)</label>
          <select 
            value={museu}
            onChange={(e) => setMuseu(e.target.value)}
            disabled={loading}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Todos</option>
            {MUSEUS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="mb-6 space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={introIA}
              onChange={(e) => setIntroIA(e.target.checked)}
              disabled={loading}
            />
            <span className="text-sm">Gerar introdução com IA</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={modoEntrega}
              onChange={(e) => setModoEntrega(e.target.checked)}
              disabled={loading}
            />
            <span className="text-sm">Modo entrega (sem edições)</span>
          </label>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold mb-3">Seções do Relatório</h3>
          <div className="grid grid-cols-2 gap-3">
            {SEÇÕES_DISPONÍVEIS.map(([id, label]) => (
              <label key={id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={secoes.includes(id)}
                  onChange={() => toggleSecao(id)}
                  disabled={loading}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handlePreview}
            disabled={loading || !dateFrom || !dateTo}
            variant="outline"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Carregar Métricas
          </Button>
          <Button
            onClick={handleGerarCompleto}
            disabled={loading || !dateFrom || !dateTo}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Gerar Relatório
          </Button>
          {html && (
            <Button
              onClick={handleExportarPDF}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          )}
        </div>
      </Card>

      {metricas && (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Métricas Carregadas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['Relatórios', metricas.total_relatorios],
              ['Atividades', metricas.total_atividades],
              ['Público', metricas.publico_total?.toLocaleString?.('pt-BR')],
              ['Execução', metricas.percentual + '%'],
              ['Compras', metricas.total_compras],
              ['Notas Fiscais', metricas.total_nf],
              ['Programações', metricas.total_programacoes],
              ['Releases', metricas.total_releases],
            ].map(([label, value]) => (
              <div key={label} className="bg-blue-50 p-4 rounded">
                <div className="text-sm text-gray-600">{label}</div>
                <div className="text-2xl font-bold">{value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {html && (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Relatório Gerado
          </h3>
          <div className="space-y-2 text-sm">
            <p><strong>Status:</strong> Pronto para exportação</p>
            <p><strong>Formato:</strong> HTML + PDF (via Drive)</p>
            <p><strong>Backup:</strong> Automático no Google Drive</p>
            <Button 
              variant="outline" 
              onClick={() => {
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `relatorio-${new Date().toISOString().split('T')[0]}.html`;
                a.click();
              }}
              className="w-full"
            >
              <FileText className="w-4 h-4 mr-2" />
              Baixar HTML
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}