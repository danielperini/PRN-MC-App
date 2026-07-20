import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown, Layers, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { buscarTodasAtividadesComFotos, gerarPDFRelatorioCompleto } from '@/utils/gerarRelatorioCompleto';

export default function RelatorioCompletoDialog({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [grupos, setGrupos] = useState([]);
  const [totalFotos, setTotalFotos] = useState(0);
  const [fetched, setFetched] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [pct, setPct] = useState(0);

  const controlesBloqueados = loading || gerando;

  async function buscarDados() {
    setLoading(true);
    setFetched(false);
    setGrupos([]);
    setTotalFotos(0);
    setPct(2);
    try {
      const resultado = await buscarTodasAtividadesComFotos({
        onProgresso: (p, t) => { setPct(p); setProgresso(t); },
      });
      setGrupos(resultado);
      const total = resultado.reduce((s, g) => s + g.atividades.reduce((s2, a) => s2 + a.fotos.length, 0), 0);
      setTotalFotos(total);
      setFetched(true);
      setProgresso('');
      setPct(0);
      if (resultado.length === 0) {
        toast.info('Nenhuma atividade com fotos encontrada.');
      } else {
        toast.success(`${total} fotos em ${resultado.length} grupo(s) museu/equipe.`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao buscar dados: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
      setPct(0);
    }
  }

  async function gerarPDF() {
    if (grupos.length === 0) return;
    setGerando(true);
    setPct(2);
    try {
      const resultado = await gerarPDFRelatorioCompleto(grupos, {
        returnBlob: true,
        onProgresso: (p, t) => { setPct(p); setProgresso(t); },
      });
      if (resultado?.blob) {
        const url = URL.createObjectURL(resultado.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = resultado.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success(`PDF gerado! ${resultado.totalFotos} fotos em ${resultado.totalGrupos} grupo(s).`);
      } else {
        toast.warning('Não foi possível gerar o PDF.');
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setGerando(false);
      setProgresso('');
      setPct(0);
    }
  }

  function handleClose() {
    if (controlesBloqueados) return;
    setGrupos([]);
    setTotalFotos(0);
    setFetched(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Relatório Executivo Consolidado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!fetched && !loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
              <FileDown className="mx-auto mb-3 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-800">Relatório completo por Museu e Equipe</p>
              <p className="mt-1 text-xs text-gray-500">
                Consolida todas as atividades registradas e fotos importadas, agrupadas por museu e equipe, prontas para exportação em PDF.
              </p>
            </div>
          )}

          {(loading || gerando) && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                <span className="text-xs">{progresso || 'Processando...'}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{Math.round(pct)}%</p>
            </div>
          )}

          {fetched && !gerando && (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-medium text-green-900">
                    {totalFotos} fotos em {grupos.length} grupo(s)
                  </p>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {grupos.map((grupo, i) => {
                  const totalAtvs = grupo.atividades.length;
                  const totalFts = grupo.atividades.reduce((s, a) => s + a.fotos.length, 0);
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                      {totalFts > 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="font-medium text-gray-700">{grupo.museuKey}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600">{grupo.equipe}</span>
                      <span className="ml-auto text-gray-400">
                        {totalAtvs} atv · {totalFts} fotos
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={handleClose} disabled={controlesBloqueados}>
            Fechar
          </Button>
          {!fetched ? (
            <Button onClick={buscarDados} disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Buscando...</> : 'Buscar dados'}
            </Button>
          ) : (
            <Button onClick={gerarPDF} disabled={gerando || totalFotos === 0}>
              {gerando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Gerando...</> : <><FileDown className="h-4 w-4 mr-1" />Gerar PDF</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}