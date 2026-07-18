import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';

const COLUNAS = [
  { key: 'nome',              label: 'Nome',                        width: 'min-w-[160px]' },
  { key: 'cargo',             label: 'Cargo',                       width: 'min-w-[140px]' },
  { key: 'tipo_contratacao',  label: 'Forma de Contratação',        width: 'min-w-[160px]' },
  { key: 'atribuicoes',       label: 'Atribuições',                 width: 'min-w-[200px]' },
  { key: 'periodo',           label: 'Período',                     width: 'min-w-[140px]' },
  { key: 'carga_horaria',     label: 'Carga Horária Semanal',       width: 'min-w-[140px]' },
  { key: 'valor',             label: 'Valor Mensal Bruto (R$)',      width: 'min-w-[140px]' },
];

function linhaVazia() {
  return { nome: '', cargo: '', tipo_contratacao: '', atribuicoes: '', periodo: '', carga_horaria: '', valor: '' };
}

export default function EquipeTrabalhoTable({ relatorioId, equipe: equipeInicial, form, onAtualizar }) {
  const [profissionais, setProfissionais] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [gerandoIA, setGerandoIA] = useState(false);

  useEffect(() => {
    const lista = Array.isArray(equipeInicial) && equipeInicial.length > 0
      ? equipeInicial.map(p => ({ ...linhaVazia(), ...p }))
      : [linhaVazia()];
    setProfissionais(lista);
  }, [equipeInicial]);

  function atualizar(idx, campo, valor) {
    setProfissionais(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p));
  }

  function adicionarLinha() {
    setProfissionais(prev => [...prev, linhaVazia()]);
  }

  function removerLinha(idx) {
    setProfissionais(prev => prev.filter((_, i) => i !== idx));
  }

  async function salvar() {
    if (!relatorioId) return;
    setSalvando(true);
    try {
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
        equipe_trabalho: profissionais.filter(p => p.nome || p.cargo),
      });
      toast.success('Equipe de trabalho salva.');
      onAtualizar?.();
    } catch (error) {
      toast.error('Erro ao salvar equipe: ' + (error?.message || String(error)));
    } finally {
      setSalvando(false);
    }
  }

  async function gerarComIA() {
    if (!relatorioId) return;
    setGerandoIA(true);
    try {
      await Promise.race([
        base44.functions.invoke('gerarSecaoRelatorioExecucao', {
          relatorio_id: relatorioId,
          secao: 'equipe_trabalho',
          data_inicio: form?.data_inicio,
          data_fim: form?.data_fim,
          filtro_museu: form?.filtro_museu,
          filtro_versao: form?.filtro_versao,
          filtro_meta_ids: form?.filtro_meta_ids,
          aditivos_permitidos: [3, 4],
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 45000)),
      ]);
      await onAtualizar?.();
      toast.success('Equipe atualizada pela IA.');
    } catch (error) {
      toast.error('Erro ao gerar com IA: ' + (error?.message || String(error)));
    } finally {
      setGerandoIA(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              {COLUNAS.map(col => (
                <th key={col.key} className={`${col.width} px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap`}>
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-2 border-b border-slate-200 w-8" />
            </tr>
          </thead>
          <tbody>
            {profissionais.map((p, idx) => (
              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                {COLUNAS.map(col => (
                  <td key={col.key} className={`${col.width} px-1 py-1`}>
                    <input
                      type={col.key === 'valor' ? 'number' : 'text'}
                      value={p[col.key] ?? ''}
                      onChange={e => atualizar(idx, col.key, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-transparent rounded hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent focus:bg-white transition-colors"
                      placeholder={col.label}
                    />
                  </td>
                ))}
                <td className="px-1 py-1 text-center">
                  <button
                    onClick={() => removerLinha(idx)}
                    className="text-red-400 hover:text-red-600 p-1 rounded"
                    title="Remover profissional"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {profissionais.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length + 1} className="text-center py-6 text-slate-400 italic text-xs">
                  Nenhum profissional cadastrado. Clique em "+ Adicionar profissional".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={adicionarLinha}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Adicionar profissional
        </Button>
        <Button size="sm" onClick={salvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700 text-white">
          {salvando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          Salvar equipe
        </Button>
        <Button size="sm" variant="outline" onClick={gerarComIA} disabled={gerandoIA}>
          {gerandoIA ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
          Gerar com IA
        </Button>
      </div>
    </div>
  );
}