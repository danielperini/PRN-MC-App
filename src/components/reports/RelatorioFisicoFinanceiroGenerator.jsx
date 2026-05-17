import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];
const MESES = [
  { label: 'Janeiro', value: '01' },
  { label: 'Fevereiro', value: '02' },
  { label: 'Março', value: '03' },
  { label: 'Abril', value: '04' },
  { label: 'Maio', value: '05' },
  { label: 'Junho', value: '06' },
  { label: 'Julho', value: '07' },
  { label: 'Agosto', value: '08' },
  { label: 'Setembro', value: '09' },
  { label: 'Outubro', value: '10' },
  { label: 'Novembro', value: '11' },
  { label: 'Dezembro', value: '12' },
];
const ANOS = ['2025', '2026'];

export default function RelatorioFisicoFinanceiroGenerator() {
  const [museu, setMuseu] = useState('Todos');
  const [mesInicio, setMesInicio] = useState('02');
  const [mesFim, setMesFim] = useState('04');
  const [ano, setAno] = useState('2026');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  const handleGerar = async () => {
    setLoading(true);
    setResultado(null);
    setErro(null);

    try {
      const dateFrom = `${ano}-${mesInicio}-01`;
      const lastDay = new Date(Number(ano), Number(mesFim), 0).getDate();
      const dateTo = `${ano}-${mesFim}-${lastDay}`;

      const response = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
        dateFrom,
        dateTo,
        museu: museu === 'Todos' ? null : museu,
      });

      setResultado(response.data);
      toast.success('Relatório gerado com sucesso!');
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Erro ao gerar relatório';
      setErro(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadHTML = () => {
    if (!resultado?.html) return;
    const blob = new Blob([resultado.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-fisico-financeiro-${ano}-${mesInicio}-${mesFim}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gerar Relatório Físico-Financeiro</h2>
          <p className="text-sm text-slate-500">Selecione o período e museu para geração automática</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-slate-600">Museu</Label>
          <Select value={museu} onValueChange={setMuseu}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MUSEUS.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium text-slate-600">Mês início</Label>
          <Select value={mesInicio} onValueChange={setMesInicio}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium text-slate-600">Mês fim</Label>
          <Select value={mesFim} onValueChange={setMesFim}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium text-slate-600">Ano</Label>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={handleGerar}
        disabled={loading}
        className="w-full bg-slate-900 hover:bg-slate-800 text-white h-10"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Gerando relatório...
          </>
        ) : (
          <>
            <FileText className="w-4 h-4 mr-2" />
            Gerar Relatório
          </>
        )}
      </Button>

      {loading && (
        <div className="mt-4 bg-slate-50 rounded-xl p-4 text-sm text-slate-600 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
          Consolidando dados do sistema, gerando análises e estruturando o relatório...
          <br />
          <span className="text-xs text-slate-400">Isso pode levar alguns minutos.</span>
        </div>
      )}

      {erro && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Erro ao gerar relatório</p>
            <p className="text-xs text-red-600 mt-1">{erro}</p>
          </div>
        </div>
      )}

      {resultado && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Relatório gerado com sucesso!</p>
              {resultado.estatisticas && (
                <div className="flex gap-4 mt-2 text-xs text-green-700">
                  {resultado.estatisticas.total_relatorios != null && (
                    <span>{resultado.estatisticas.total_relatorios} relatórios</span>
                  )}
                  {resultado.estatisticas.total_atividades != null && (
                    <span>{resultado.estatisticas.total_atividades} atividades</span>
                  )}
                  {resultado.estatisticas.total_publico != null && (
                    <span>{resultado.estatisticas.total_publico.toLocaleString('pt-BR')} público</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {resultado.html && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadHTML}
              className="border-green-300 text-green-700 hover:bg-green-100"
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar HTML do Relatório
            </Button>
          )}
        </div>
      )}
    </div>
  );
}