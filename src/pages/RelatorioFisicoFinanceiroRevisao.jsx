import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Download, FileText, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import RelatorioFisicoFinanceiroRevisor from '@/components/reports/RelatorioFisicoFinanceiroRevisor';

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

export default function RelatorioFisicoFinanceiroRevisao() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [museu, setMuseu] = useState('');
  const [loading, setLoading] = useState(false);
  const [textosIA, setTextosIA] = useState({});
  const [fotosIA, setFotosIA] = useState([]);
  const [emRevisao, setEmRevisao] = useState(false);
  const [revision, setRevision] = useState(null);

  const handleCarregarRevisao = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Informe as datas');
      return;
    }

    setLoading(true);
    try {
      // Carregar dados brutos de revisão
      const periodo_from = new Date(dateFrom).toISOString().split('T')[0];
      const periodo_to = new Date(dateTo).toISOString().split('T')[0];
      const museuFiltro = museu || 'todos';

      const revisoes = await base44.entities.ReportRevision.filter({
        periodo_from,
        periodo_to,
        museu: museuFiltro,
      });

      if (revisoes.length > 0) {
        setRevision(revisoes[0]);
        setTextosIA(revisoes[0].conteudo_texto || {});
        setFotosIA(revisoes[0].conteudo_imagens || []);
        setEmRevisao(true);
        toast.success('Revisão carregada');
      } else {
        // Gerar nova prévia
        const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
          dateFrom,
          dateTo,
          museu: museu || null,
          modo: 'previa',
        });

        if (res.data?.error) {
          toast.error('Erro: ' + res.data.error);
        } else {
          setTextosIA(res.data?.textos || {});
          setFotosIA(res.data?.fotos || []);
          setEmRevisao(true);
          toast.success('Prévia carregada para revisão');
        }
      }
    } catch (err) {
      console.warn('Relatório físico-financeiro indisponível no carregamento inicial.', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRevision = async (revisedData) => {
    try {
      setLoading(true);

      // Gerar PDF final com dados revisados
      const res = await base44.functions.invoke('exportarRelatorioFisicoFinanceiroPDF', {
        html: revisedData.html || '',
        conteudo_texto: revisedData.conteudo_texto,
        conteudo_imagens: revisedData.conteudo_imagens,
        dateFrom,
        dateTo,
        museu: museu || 'Consolidado',
        revision_id: revisedData.id,
        formato: 'ambos',
      });

      if (res.data?.error) {
        toast.error('Erro ao exportar: ' + res.data.error);
      } else {
        toast.success('Relatório aprovado e exportado com sucesso!');
        setEmRevisao(false);
        setRevision(null);
      }
    } catch (err) {
      toast.error('Erro ao exportar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (emRevisao) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setEmRevisao(false)}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold">
            Revisar Relatório Físico-Financeiro
          </h1>
        </div>

        <RelatorioFisicoFinanceiroRevisor
          dateFrom={dateFrom}
          dateTo={dateTo}
          museu={museu}
          textosIA={textosIA}
          fotosIA={fotosIA}
          onApprove={handleApproveRevision}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-6">
          Relatório Físico-Financeiro com Revisão Editável
        </h2>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900">
            <strong>💡 Como usar:</strong> Defina o período e museu, carregue a prévia,
            edite os textos e imagens conforme necessário, e aprove para exportação.
          </p>
        </div>

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
          <label className="block text-sm font-medium mb-2">
            Museu (opcional)
          </label>
          <select
            value={museu}
            onChange={(e) => setMuseu(e.target.value)}
            disabled={loading}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Todos</option>
            {MUSEUS.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <Button
          onClick={handleCarregarRevisao}
          disabled={loading || !dateFrom || !dateTo}
          className="bg-blue-600 hover:bg-blue-700 gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Carregar para Revisão
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Fluxo de Revisão</h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-bold text-sm">
              1
            </div>
            <div>
              <p className="font-medium">Carregar Prévia</p>
              <p className="text-sm text-slate-600">
                Carregue a prévia gerada pela IA para revisão editável
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-bold text-sm">
              2
            </div>
            <div>
              <p className="font-medium">Editar Textos</p>
              <p className="text-sm text-slate-600">
                Revise cada seção, corrija textos gerados ou restaure a versão original
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-bold text-sm">
              3
            </div>
            <div>
              <p className="font-medium">Substituir Imagens</p>
              <p className="text-sm text-slate-600">
                Escolha imagens do repositório (Atividades, Relatórios, Comunicação, Galeria)
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-bold text-sm">
              4
            </div>
            <div>
              <p className="font-medium">Aprovação Final</p>
              <p className="text-sm text-slate-600">
                Aprove para exportação e gere o PDF final com todas as alterações
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Capacidades de Revisão</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg p-3">
            <p className="font-medium text-sm mb-1">✏️ Edição de Texto</p>
            <p className="text-xs text-slate-600">
              Edite manualmente cada seção do relatório
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="font-medium text-sm mb-1">🖼️ Substituir Imagens</p>
            <p className="text-xs text-slate-600">
              Escolha imagens do repositório do app
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="font-medium text-sm mb-1">↩️ Restaurar IA</p>
            <p className="text-xs text-slate-600">
              Volte ao texto original gerado pela IA
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="font-medium text-sm mb-1">📊 Histórico</p>
            <p className="text-xs text-slate-600">
              Acompanhe todas as alterações realizadas
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="font-medium text-sm mb-1">🔄 Regenerar</p>
            <p className="text-xs text-slate-600">
              Regenere trechos com IA se necessário
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="font-medium text-sm mb-1">💾 Persistência</p>
            <p className="text-xs text-slate-600">
              Alterações salvas até aprovação final
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
