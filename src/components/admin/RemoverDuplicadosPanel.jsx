import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, ShieldCheck, Search, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function RemoverDuplicadosPanel() {
  const [step, setStep] = useState('idle'); // idle | scanning | review | removing | done
  const [duplicados, setDuplicados] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [selecionados, setSelecionados] = useState({}); // id -> bool (marcar para excluir)

  const handleScan = async () => {
    setStep('scanning');
    setDuplicados([]);
    setResultado(null);

    try {
      // Busca todos os relatórios
      const todos = await base44.entities.Report.list('-created_date', 500);

      // Agrupa por chave de duplicação: author_name + mes_referencia + ano + museu
      const grupos = {};
      for (const r of todos) {
        const chave = [
          String(r.author_name || '').trim().toLowerCase(),
          String(r.mes_referencia || '').trim().toLowerCase(),
          String(r.ano || ''),
          String(r.museu || '').trim().toLowerCase(),
        ].join('|');

        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(r);
      }

      // Filtra apenas grupos com mais de 1 relatório
      const grupos_dup = Object.values(grupos).filter((g) => g.length > 1);

      // Para cada grupo, ordena pelo created_date (mais antigo = original)
      const lista = [];
      for (const grupo of grupos_dup) {
        const sorted = [...grupo].sort(
          (a, b) => new Date(a.created_date) - new Date(b.created_date)
        );
        const original = sorted[0];
        const copias = sorted.slice(1);
        lista.push({ original, copias, chave: `${original.author_name} / ${original.mes_referencia} ${original.ano}` });
      }

      setDuplicados(lista);

      // Pré-seleciona todas as cópias para exclusão
      const sel = {};
      for (const g of lista) {
        for (const c of g.copias) sel[c.id] = true;
      }
      setSelecionados(sel);

      setStep('review');

      if (lista.length === 0) {
        toast.success('Nenhum relatório duplicado encontrado!');
        setStep('idle');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao escanear relatórios: ' + (e?.message || 'erro desconhecido'));
      setStep('idle');
    }
  };

  const handleRemover = async () => {
    const idsParaRemover = Object.entries(selecionados)
      .filter(([, sel]) => sel)
      .map(([id]) => id);

    if (idsParaRemover.length === 0) {
      toast.warning('Nenhum item selecionado para remoção.');
      return;
    }

    setStep('removing');

    let removidos = 0;
    let erros = 0;

    try {
      // Backup: registra no AuditLog antes de remover
      const user = await base44.auth.me();
      await base44.entities.AuditLog.create({
        action: 'DELETE',
        entity_type: 'REPORT',
        entity_id: 'BULK_DUPLICATE_REMOVAL',
        actor_email: user?.email || 'sistema',
        actor_name: user?.full_name || 'Sistema',
        details: `Remoção de ${idsParaRemover.length} relatórios duplicados identificados automaticamente. IDs: ${idsParaRemover.join(', ')}`,
      });

      // Remove cada duplicado
      for (const id of idsParaRemover) {
        try {
          await base44.entities.Report.delete(id);
          removidos++;
        } catch (e) {
          console.error('Erro ao remover relatório:', id, e);
          erros++;
        }
      }

      setResultado({ removidos, erros, total: idsParaRemover.length });
      setStep('done');

      toast.success(`${removidos} duplicado(s) removido(s) com sucesso!`);
    } catch (e) {
      console.error(e);
      toast.error('Erro durante a remoção: ' + (e?.message || 'erro'));
      setStep('review');
    }
  };

  const toggleSelecionado = (id) => {
    setSelecionados((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalSelecionados = Object.values(selecionados).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Trash2 className="w-5 h-5 text-red-500" />
        <h3 className="font-semibold text-base text-gray-900">
          Remover Relatórios Duplicados
        </h3>
      </div>

      {/* Aviso de segurança */}
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-semibold mb-0.5">Esta ação remove apenas duplicados e preserva os arquivos originais.</p>
          <p className="text-xs text-amber-700">
            A detecção é feita com base em: autor, mês/ano de referência e museu. O relatório mais antigo de cada grupo é mantido. Um registro de auditoria é criado antes de qualquer exclusão.
          </p>
        </div>
      </div>

      {/* Etapa: idle */}
      {step === 'idle' && (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-4">
            Clique em "Escanear" para identificar relatórios duplicados no sistema.
          </p>
          <Button onClick={handleScan} className="gap-2">
            <Search className="w-4 h-4" />
            Escanear Relatórios
          </Button>
        </div>
      )}

      {/* Etapa: scanning */}
      {step === 'scanning' && (
        <div className="text-center py-8">
          <Loader2 className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500 text-sm">Analisando relatórios...</p>
        </div>
      )}

      {/* Etapa: review */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {duplicados.length} grupo(s) de duplicatas encontrado(s)
              </p>
              <p className="text-xs text-gray-500">
                {totalSelecionados} relatório(s) selecionado(s) para exclusão
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('idle')}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
                onClick={handleRemover}
                disabled={totalSelecionados === 0}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover {totalSelecionados} duplicado(s)
              </Button>
            </div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {duplicados.map((grupo, gi) => (
              <div key={gi} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-700">{grupo.chave}</p>
                </div>

                {/* Original */}
                <div className="px-4 py-2 bg-green-50 border-b border-gray-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded mr-2">
                      ORIGINAL — mantido
                    </span>
                    <span className="text-xs text-gray-700">{grupo.original.author_name}</span>
                    <span className="text-xs text-gray-400 ml-2">criado: {fmt(grupo.original.created_date)}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
                    {grupo.original.status}
                  </Badge>
                </div>

                {/* Cópias */}
                {grupo.copias.map((copia) => (
                  <div
                    key={copia.id}
                    className={`px-4 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      selecionados[copia.id] ? 'bg-red-50' : 'bg-white hover:bg-gray-50'
                    }`}
                    onClick={() => toggleSelecionado(copia.id)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selecionados[copia.id]}
                        onChange={() => toggleSelecionado(copia.id)}
                        className="rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded mr-2">
                          CÓPIA
                        </span>
                        <span className="text-xs text-gray-700">{copia.author_name}</span>
                        <span className="text-xs text-gray-400 ml-2">criado: {fmt(copia.created_date)}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {copia.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Etapa: removing */}
      {step === 'removing' && (
        <div className="text-center py-8">
          <Loader2 className="w-10 h-10 text-red-500 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500 text-sm">Removendo duplicatas e registrando auditoria...</p>
        </div>
      )}

      {/* Etapa: done */}
      {step === 'done' && resultado && (
        <div className="space-y-4">
          <div className="text-center py-6 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-green-800 mb-1">
              {resultado.removidos} duplicado(s) removido(s)
            </p>
            {resultado.erros > 0 && (
              <p className="text-sm text-red-600">{resultado.erros} erro(s) durante a remoção.</p>
            )}
            <p className="text-xs text-green-700 mt-1">
              A ação foi registrada no log de auditoria do sistema.
            </p>
          </div>
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => { setStep('idle'); setDuplicados([]); setResultado(null); }}>
              Nova Verificação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}