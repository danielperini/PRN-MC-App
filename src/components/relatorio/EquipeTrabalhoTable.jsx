import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Sparkles, Trash2, Users } from 'lucide-react';

const COLUNAS = [
  { key: 'nome',             label: 'Nome',                   width: 'min-w-[160px]', placeholder: 'Ex: Maria Silva' },
  { key: 'cargo',            label: 'Cargo / Função',         width: 'min-w-[150px]', placeholder: 'Ex: Educadora' },
  { key: 'tipo_contratacao', label: 'Contratação',            width: 'min-w-[150px]', placeholder: 'Ex: CLT / RPA / PJ' },
  { key: 'atribuicoes',      label: 'Atribuições',            width: 'min-w-[200px]', placeholder: 'Descreva as funções' },
  { key: 'periodo',          label: 'Período',                width: 'min-w-[140px]', placeholder: 'Ex: Fev–Jun/2026' },
  { key: 'carga_horaria',    label: 'Carga Horária Semanal',  width: 'min-w-[130px]', placeholder: 'Ex: 40h' },
  { key: 'valor',            label: 'Valor Mensal Bruto (R$)', width: 'min-w-[140px]', placeholder: '0,00', tipo: 'number' },
];

function linhaVazia() {
  return { nome: '', cargo: '', tipo_contratacao: '', atribuicoes: '', periodo: '', carga_horaria: '', valor: '' };
}

function normalizarEquipe(equipeRaw) {
  if (Array.isArray(equipeRaw) && equipeRaw.length > 0) {
    return equipeRaw.map(p => ({ ...linhaVazia(), ...p }));
  }
  return [];
}

export default function EquipeTrabalhoTable({ relatorioId, equipe: equipeInicial, form, onAtualizar }) {
  const [profissionais, setProfissionais] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [gerandoIA, setGerandoIA] = useState(false);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    const normalizada = normalizarEquipe(equipeInicial);
    setProfissionais(normalizada.length > 0 ? normalizada : []);
    setAlterado(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(equipeInicial)]);

  function atualizar(idx, campo, valor) {
    setProfissionais(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p));
    setAlterado(true);
  }

  function adicionarLinha() {
    setProfissionais(prev => [...prev, linhaVazia()]);
    setAlterado(true);
  }

  function removerLinha(idx) {
    setProfissionais(prev => prev.filter((_, i) => i !== idx));
    setAlterado(true);
  }

  async function salvar() {
    if (!relatorioId) return;
    setSalvando(true);
    try {
      const equipeParaSalvar = profissionais.filter(p => p.nome?.trim() || p.cargo?.trim());
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
        equipe_trabalho: equipeParaSalvar,
      });
      toast.success('Equipe de trabalho salva.');
      setAlterado(false);
      await onAtualizar?.();
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (45s)')), 45000)),
      ]);
      await onAtualizar?.();
      toast.success('Equipe preenchida pela IA — revise os dados e salve.');
    } catch (error) {
      toast.error('Erro ao gerar com IA: ' + (error?.message || String(error)));
    } finally {
      setGerandoIA(false);
    }
  }

  const temDados = profissionais.length > 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Users className="w-3.5 h-3.5" />
          <span>{profissionais.length} profissional(is) cadastrado(s)</span>
          {alterado && <span className="text-amber-600 font-medium ml-2">• alterações não salvas</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={gerarComIA} disabled={gerandoIA}>
            {gerandoIA
              ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Gerando...</>
              : <><Sparkles className="w-3.5 h-3.5 mr-1 text-purple-500" />Preencher com IA</>
            }
          </Button>
          <Button size="sm" variant="outline" onClick={adicionarLinha}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Adicionar profissional
          </Button>
          <Button
            size="sm"
            onClick={salvar}
            disabled={salvando || !alterado}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {salvando
              ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Salvando...</>
              : <><Save className="w-3.5 h-3.5 mr-1" />Salvar equipe</>
            }
          </Button>
        </div>
      </div>

      {/* Tabela */}
      {temDados ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                {COLUNAS.map(col => (
                  <th
                    key={col.key}
                    className={`${col.width} px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-8 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {profissionais.map((p, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-blue-50/30 transition-colors">
                  {COLUNAS.map(col => (
                    <td key={col.key} className={`${col.width} px-1 py-1`}>
                      <input
                        type={col.tipo === 'number' ? 'number' : 'text'}
                        value={p[col.key] ?? ''}
                        onChange={e => atualizar(idx, col.key, e.target.value)}
                        placeholder={col.placeholder}
                        className="w-full px-2 py-1.5 text-xs border border-transparent rounded hover:border-slate-300 focus:border-blue-400 focus:outline-none bg-transparent focus:bg-white transition-all"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    <button
                      onClick={() => removerLinha(idx)}
                      className="text-slate-300 hover:text-red-500 p-1 rounded transition-colors"
                      title="Remover linha"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Estado vazio */
        <div className="rounded-lg border-2 border-dashed border-slate-200 py-10 text-center space-y-3">
          <Users className="w-8 h-8 text-slate-300 mx-auto" />
          <div>
            <p className="text-sm font-medium text-slate-500">Nenhum profissional cadastrado</p>
            <p className="text-xs text-slate-400 mt-1">Use "Preencher com IA" para importar dados dos contratos,<br />ou adicione manualmente clicando em "+ Adicionar profissional".</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={gerarComIA} disabled={gerandoIA}>
              {gerandoIA
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Gerando...</>
                : <><Sparkles className="w-3.5 h-3.5 mr-1 text-purple-500" />Preencher com IA</>
              }
            </Button>
            <Button size="sm" variant="outline" onClick={adicionarLinha}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Adicionar profissional
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}