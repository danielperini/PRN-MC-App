import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Image, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function DeduplicacaoPanel() {
  const [loading, setLoading] = useState(null); // null | 'fotos' | 'nfs' | 'ambos'
  const [resultado, setResultado] = useState(null);

  async function executar(modo) {
    setLoading(modo);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('deduplicarFotosENFs', { modo });
      setResultado(res.data?.resultado);
      const fotos = res.data?.resultado?.fotos;
      const nfs = res.data?.resultado?.nfs;
      const msg = [
        fotos ? `Fotos: ${fotos.deletadas} duplicatas removidas (${fotos.restantes} únicas)` : null,
        nfs   ? `NFs: ${nfs.deletadas} duplicatas removidas (${nfs.restantes} únicas)` : null,
      ].filter(Boolean).join(' | ');
      toast.success(msg || 'Varredura concluída sem duplicatas.');
    } catch (err) {
      toast.error('Erro na varredura: ' + (err?.message || String(err)));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold mb-1">🧹 Varredura de Duplicatas</h2>
        <p className="text-sm text-slate-500">
          Percorre <strong>todos os registros</strong> e remove cópias exatas — mantendo sempre o registro mais antigo (primeira importação) ou o de maior status (NFs).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Fotos */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5 text-blue-600" />
            <span className="font-semibold">Fotos (ReportPhoto)</span>
          </div>
          <p className="text-xs text-slate-500">Deduplicação por <code>file_name</code> — todos os meses.</p>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => executar('fotos')}
            disabled={!!loading}
          >
            {loading === 'fotos' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {loading === 'fotos' ? 'Varrendo...' : 'Limpar fotos duplicadas'}
          </Button>
          {resultado?.fotos && <ResultadoCard r={resultado.fotos} campos={['total_verificadas','grupos_duplicados','deletadas','restantes']} />}
        </div>

        {/* NFs */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-600" />
            <span className="font-semibold">Notas Fiscais</span>
          </div>
          <p className="text-xs text-slate-500">Deduplicação por chave de acesso (44 dígitos) e por número+emitente+valor.</p>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => executar('nfs')}
            disabled={!!loading}
          >
            {loading === 'nfs' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {loading === 'nfs' ? 'Varrendo...' : 'Limpar NFs duplicadas'}
          </Button>
          {resultado?.nfs && <ResultadoCard r={resultado.nfs} campos={['total_verificadas','grupos_por_chave','grupos_por_numero_emitente','deletadas','restantes']} />}
        </div>

        {/* Ambos */}
        <div className="border-2 border-slate-900 rounded-xl p-4 space-y-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="font-semibold">Varredura Completa</span>
          </div>
          <p className="text-xs text-slate-500">Executa fotos + NFs em uma única passagem.</p>
          <Button
            className="w-full bg-slate-900 text-white hover:bg-slate-700"
            onClick={() => executar('ambos')}
            disabled={!!loading}
          >
            {loading === 'ambos' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {loading === 'ambos' ? 'Varrendo tudo...' : 'Varredura completa'}
          </Button>
          {resultado?.fotos && resultado?.nfs && (
            <div className="text-xs text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              Concluída — {resultado.fotos.deletadas + resultado.nfs.deletadas} registros removidos
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultadoCard({ r, campos }) {
  const labels = {
    total_verificadas: 'Verificados',
    grupos_duplicados: 'Grupos duplic.',
    grupos_por_chave: 'Grupos/chave',
    grupos_por_numero_emitente: 'Grupos/nº+emit.',
    deletadas: 'Removidos',
    restantes: 'Únicos restantes',
  };
  return (
    <div className="rounded-lg bg-slate-50 border p-3 space-y-1">
      {campos.map(c => (
        <div key={c} className="flex justify-between text-xs">
          <span className="text-slate-500">{labels[c] || c}</span>
          <Badge variant={c === 'deletadas' && r[c] > 0 ? 'destructive' : 'secondary'} className="text-xs">
            {r[c] ?? '—'}
          </Badge>
        </div>
      ))}
    </div>
  );
}