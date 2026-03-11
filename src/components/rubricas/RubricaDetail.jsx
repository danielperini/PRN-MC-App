import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RubricaDetail({ rubrica, onClose, onRefresh }) {
  const [isAdding, setIsAdding] = useState(false);
  const [novoLancamento, setNovoLancamento] = useState({ valor: '', descricao: '' });
  const [saving, setSaving] = useState(false);

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', rubrica.id],
    queryFn: () => base44.entities.LancamentoRubrica.filter({ rubrica_id: rubrica.id }, '-created_date', 100),
    enabled: !!rubrica.id,
  });

  const handleAddLancamento = async () => {
    if (!novoLancamento.valor || !novoLancamento.descricao) {
      toast.error('Preencha valor e descrição');
      return;
    }

    setSaving(true);
    try {
      const user = await base44.auth.me();
      const valor = parseFloat(novoLancamento.valor);

      await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubrica.id,
        tipo_lancamento: 'manual',
        valor,
        descricao: novoLancamento.descricao,
        origem: 'manual',
        data_lancamento: new Date().toISOString().split('T')[0],
        usuario_lancamento: user?.email,
      });

      // Atualizar rubrica
      const novoUtilizado = (rubrica.valor_utilizado || 0) + valor;
      const novoSaldo = rubrica.valor_rubrica - novoUtilizado;
      const novoPercentual = (novoUtilizado / rubrica.valor_rubrica) * 100;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: novoUtilizado,
        saldo: novoSaldo,
        percentual_utilizado: novoPercentual,
      });

      toast.success('Lançamento adicionado!');
      setNovoLancamento({ valor: '', descricao: '' });
      setIsAdding(false);
      onRefresh();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-black">{rubrica.rubrica}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-6">
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Valor Total</span>
              <p className="text-lg font-bold text-black mt-1">
                R$ {(rubrica.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Utilizado</span>
              <p className="text-lg font-bold text-black mt-1">
                R$ {(rubrica.valor_utilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="border border-green-200 bg-green-50 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Saldo</span>
              <p className={`text-lg font-bold mt-1 ${(rubrica.saldo || 0) < 0 ? 'text-red-600' : 'text-black'}`}>
                R$ {(rubrica.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">% Utilizado</span>
              <p className="text-lg font-bold text-black mt-1">
                {(rubrica.percentual_utilizado || 0).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Informações */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-600 font-semibold">Grupo</span>
              <p className="text-sm text-black mt-1">{rubrica.grupo}</p>
            </div>
            <div>
              <span className="text-xs text-gray-600 font-semibold">Parcelas/Unidades</span>
              <p className="text-sm text-black mt-1">{rubrica.numero_parcelas_unidades || '—'}</p>
            </div>
          </div>

          {rubrica.observacao_uso && (
            <div>
              <span className="text-xs text-gray-600 font-semibold">Observações</span>
              <p className="text-sm text-black mt-1">{rubrica.observacao_uso}</p>
            </div>
          )}

          {/* Novo Lançamento */}
          <div className="border-t pt-6">
            <h3 className="font-semibold text-black mb-4">Lançamento Manual</h3>
            {!isAdding ? (
              <Button className="bg-black hover:bg-gray-800 text-white" onClick={() => setIsAdding(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Lançamento
              </Button>
            ) : (
              <div className="space-y-3">
                <Input
                  type="number"
                  placeholder="Valor"
                  value={novoLancamento.valor}
                  onChange={e => setNovoLancamento(l => ({ ...l, valor: e.target.value }))}
                />
                <Textarea
                  placeholder="Descrição"
                  rows={2}
                  value={novoLancamento.descricao}
                  onChange={e => setNovoLancamento(l => ({ ...l, descricao: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button
                    className="bg-black hover:bg-gray-800 text-white"
                    onClick={handleAddLancamento}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Confirmar
                  </Button>
                  <Button variant="outline" onClick={() => { setIsAdding(false); setNovoLancamento({ valor: '', descricao: '' }); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Histórico */}
          <div className="border-t pt-6">
            <h3 className="font-semibold text-black mb-4">Histórico de Lançamentos</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {lancamentos.length === 0 ? (
                <p className="text-sm text-gray-400">Sem lançamentos</p>
              ) : (
                lancamentos.map(l => (
                  <div key={l.id} className="text-xs border border-gray-100 rounded p-3 flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-black">{l.descricao}</p>
                      <p className="text-gray-500 mt-0.5">
                        {l.data_lancamento} • {l.tipo_lancamento === 'automatico' ? 'Automático' : 'Manual'}
                      </p>
                    </div>
                    <span className="font-bold text-black ml-2">R$ {(l.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}