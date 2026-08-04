import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const TOTAL_ESPERADO = 0; // dinâmico — não predefinir total
const BATCH_SIZE = 5;

export default function Importar6PastasDialog({ open, onClose }) {
  const [etapa, setEtapa] = useState('idle'); // idle | listando | processando | concluido
  const [total, setTotal] = useState(0);
  const [processadas, setProcessadas] = useState(0);
  const [criadas, setCriadas] = useState(0);
  const [erros, setErros] = useState(0);
  const [detail, setDetail] = useState('');

  const reset = () => {
    setEtapa('idle');
    setTotal(0);
    setProcessadas(0);
    setCriadas(0);
    setErros(0);
    setDetail('');
  };

  const handleClose = () => {
    if (etapa === 'processando') return;
    reset();
    onClose();
  };

  const processarTudo = async () => {
    try {
      setEtapa('listando');
      setDetail('Escaneando 6 pastas do Drive (incluindo subpastas, máx 5 por pasta)...');
      const listRes = await base44.functions.invoke('importarFotos6PastasDrive', { modo: 'listar' });
      if (listRes.error) throw new Error(listRes.error);
      const totalFotos = listRes.total || TOTAL_ESPERADO;
      setTotal(totalFotos);
      setEtapa('processando');
      setDetail(`Processando lote 1 de ${Math.ceil(totalFotos / BATCH_SIZE)}...`);

      let offset = 0;
      let totalCriadas = 0;
      let totalErros = 0;
      const startTime = Date.now();

      while (offset < totalFotos) {
        const res = await base44.functions.invoke('importarFotos6PastasDrive', {
          modo: 'processar',
          offset,
        });
        if (res.error) {
          totalErros += BATCH_SIZE;
          offset += BATCH_SIZE;
        } else {
          totalCriadas += res.criadas || 0;
          totalErros += res.erros || 0;
          offset = res.next_offset || offset + BATCH_SIZE;
        }
        setProcessadas(Math.min(offset, totalFotos));
        setCriadas(totalCriadas);
        setErros(totalErros);
        const loteAtual = Math.ceil(offset / BATCH_SIZE);
        const totalLotes = Math.ceil(totalFotos / BATCH_SIZE);
        setDetail(`Processando lote ${loteAtual} de ${totalLotes}... (${totalCriadas} fotos importadas)`);
        if (res.has_more === false) break;
      }

      const tempo = Math.round((Date.now() - startTime) / 1000);
      setEtapa('concluido');
      setDetail(`Concluído em ${tempo}s — ${totalCriadas} fotos importadas, ${totalErros} erros.`);
      toast.success(`${totalCriadas} fotos importadas para a galeria!`);
    } catch (e) {
      console.error('Erro ao importar fotos:', e);
      setEtapa('concluido');
      setDetail(`Erro: ${e.message || e}`);
      toast.error('Erro ao importar fotos: ' + (e.message || e));
    }
  };

  const pct = total > 0 ? Math.round((processadas / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Importar Fotos — 7 Pastas do Drive
          </DialogTitle>
        </DialogHeader>

        {etapa === 'idle' && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              Serão escaneadas <strong>7 pastas do Google Drive recursivamente</strong> (incluindo subpastas),
              importando <strong>100% das fotos</strong> de cada subpasta — sem limite por pasta.
              Fotos já importadas são ignoradas automaticamente (deduplicação por ID do Drive).
            </p>
            <p className="text-xs text-slate-500">
              As fotos serão classificadas por museu, mês e ano com base no nome do arquivo e caminho da pasta.
            </p>
          </div>
        )}

        {etapa === 'listando' && (
          <div className="py-4 text-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-600">{detail}</p>
          </div>
        )}

        {etapa === 'processando' && (
          <div className="space-y-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">{processadas} / {total} fotos</span>
              <span className="font-medium">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-slate-500">{detail}</p>
            <div className="flex gap-4 text-xs">
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {criadas} importadas
              </span>
              {erros > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {erros} erros
                </span>
              )}
            </div>
          </div>
        )}

        {etapa === 'concluido' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium">{detail}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
              <div className="flex justify-between"><span>Fotos processadas:</span><span>{processadas}</span></div>
              <div className="flex justify-between"><span>Fotos importadas:</span><span className="text-green-600 font-medium">{criadas}</span></div>
              {erros > 0 && <div className="flex justify-between"><span>Erros:</span><span className="text-red-600">{erros}</span></div>}
            </div>
          </div>
        )}

        <DialogFooter>
          {etapa === 'idle' && (
            <Button onClick={processarTudo} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Iniciar Importação
            </Button>
          )}
          {etapa === 'processando' && (
            <Button disabled className="w-full">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Processando... Não feche esta janela
            </Button>
          )}
          {etapa === 'concluido' && (
            <Button onClick={handleClose} variant="outline" className="w-full">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}