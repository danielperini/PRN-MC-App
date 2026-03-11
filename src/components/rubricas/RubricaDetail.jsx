import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function RubricaDetail({ rubrica, onClose, onRefresh }) {
  const [isAdding, setIsAdding] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [form, setForm] = useState({ valor: '', descricao: '', observacao: '', justificativa: '' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', rubrica.id],
    queryFn: () => base44.entities.LancamentoRubrica.filter({ rubrica_id: rubrica.id }, '-created_date', 200),
    enabled: !!rubrica.id,
  });

  const handleAddLancamento = async () => {
    const valor = parseFloat(form.valor);
    
    if (!form.valor || !form.descricao) {
      toast.error('Preencha valor e descrição');
      return;
    }

    if (valor < 0) {
      toast.error('Use o botão "Ajuste manual" para valores negativos');
      return;
    }

    if ((rubrica.saldo || 0) - valor < 0) {
      const confirm = window.confirm('Saldo insuficiente! Confirma mesmo assim?');
      if (!confirm) return;
    }

    setSaving(true);
    try {
      const user = await base44.auth.me();

      await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubrica.id,
        data_lancamento: new Date().toISOString().split('T')[0],
        origem_lancamento: 'manual_usuario',
        descricao: form.descricao,
        valor,
        observacao: form.observacao,
        criado_por: user?.email,
      });

      const novoUtilizado = (rubrica.valor_utilizado || 0) + valor;
      const novoSaldo = rubrica.valor_rubrica - novoUtilizado;
      const novoPercentual = (novoUtilizado / rubrica.valor_rubrica) * 100;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: novoUtilizado,
        saldo: novoSaldo,
        percentual_utilizado: novoPercentual,
      });

      toast.success('✅ Lançamento adicionado!');
      setForm({ valor: '', descricao: '', observacao: '', justificativa: '' });
      setIsAdding(false);
      onRefresh();
    } catch (e) {
      toast.error('❌ Erro: ' + e.message);
    }
    setSaving(false);
  };

  const handleAddAdjustment = async () => {
    const valor = parseFloat(form.valor);
    
    if (!form.valor || !form.descricao || !form.justificativa) {
      toast.error('Preencha todos os campos (incluindo justificativa)');
      return;
    }

    setSaving(true);
    try {
      const user = await base44.auth.me();

      await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubrica.id,
        data_lancamento: new Date().toISOString().split('T')[0],
        origem_lancamento: 'manual_usuario',
        descricao: form.descricao,
        valor,
        observacao: form.observacao,
        justificativa_ajuste: form.justificativa,
        criado_por: user?.email,
      });

      const novoUtilizado = (rubrica.valor_utilizado || 0) + valor;
      const novoSaldo = rubrica.valor_rubrica - novoUtilizado;
      const novoPercentual = novoSaldo > 0 ? (novoUtilizado / rubrica.valor_rubrica) * 100 : 100;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: Math.max(0, novoUtilizado),
        saldo: novoSaldo,
        percentual_utilizado: novoPercentual,
      });

      toast.success('✅ Ajuste registrado com histórico!');
      setForm({ valor: '', descricao: '', observacao: '', justificativa: '' });
      setIsAdjusting(false);
      onRefresh();
    } catch (e) {
      toast.error('❌ Erro: ' + e.message);
    }
    setSaving(false);
  };

  const getStatusClass = (percent) => {
    if (percent >= 100) return 'bg-red-50 border-red-200';
    if (percent >= 80) return 'bg-amber-50 border-amber-200';
    return 'bg-green-50 border-green-200';
  };

  const getAlertMessage = (percent) => {
    if (percent >= 100) return '⚠️ Rubrica excedida!';
    if (percent >= 80) return '⚠️ Atenção: 80% utilizado';
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-black">{rubrica.rubrica}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-6">
          {/* Alertas */}
          {getAlertMessage(rubrica.percentual_utilizado || 0) && (
            <div className={`p-4 rounded-lg border flex items-start gap-3 ${getStatusClass(rubrica.percentual_utilizado)}`}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">{getAlertMessage(rubrica.percentual_utilizado)}</p>
                <p className="text-xs mt-1 opacity-70">
                  {(rubrica.percentual_utilizado || 0).toFixed(2)}% da rubrica já foi utilizado
                </p>
              </div>
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Valor Total</span>
              <p className="text-lg font-bold text-black mt-1">
                R$ {(rubrica.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`border rounded-lg p-4 ${getStatusClass(rubrica.percentual_utilizado || 0)}`}>
              <span className="text-xs text-gray-600 font-semibold">Utilizado</span>
              <p className="text-lg font-bold text-black mt-1">
                R$ {(rubrica.valor_utilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`border rounded-lg p-4 ${(rubrica.saldo || 0) < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <span className="text-xs text-gray-600 font-semibold">Saldo</span>
              <p className={`text-lg font-bold mt-1 ${(rubrica.saldo || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
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
          <div className="grid grid-cols-2 gap-4 pb-4 border-b">
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
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-xs text-gray-600 font-semibold">Observações</span>
              <p className="text-sm text-black mt-1">{rubrica.observacao_uso}</p>
            </div>
          )}

          {/* Lançamentos */}
          <div className="space-y-4">
            <h3 className="font-semibold text-black">Lançamentos Registrados</h3>
            
            <div className="flex gap-2">
              {!isAdding && !isAdjusting && (
                <>
                  <Button className="bg-black hover:bg-gray-800 text-white" onClick={() => setIsAdding(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Lançamento
                  </Button>
                  <Button variant="outline" onClick={() => setIsAdjusting(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajuste Manual
                  </Button>
                </>
              )}
            </div>

            {isAdding && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <Input
                  type="number"
                  placeholder="Valor"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                />
                <Input
                  placeholder="Descrição"
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                />
                <Textarea
                  placeholder="Observação (opcional)"
                  rows={2}
                  value={form.observacao}
                  onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleAddLancamento} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Confirmar
                  </Button>
                  <Button variant="outline" onClick={() => { setIsAdding(false); setForm({ valor: '', descricao: '', observacao: '', justificativa: '' }); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {isAdjusting && (
              <div className="border border-amber-200 rounded-lg p-4 space-y-3 bg-amber-50">
                <p className="text-xs text-amber-700 font-semibold">Ajuste Manual (pode ser positivo ou negativo)</p>
                <Input
                  type="number"
                  placeholder="Valor (positivo ou negativo)"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                />
                <Input
                  placeholder="Descrição"
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                />
                <Textarea
                  placeholder="Justificativa (obrigatória)"
                  rows={2}
                  value={form.justificativa}
                  onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))}
                />
                <Textarea
                  placeholder="Observação adicional"
                  rows={1}
                  value={form.observacao}
                  onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleAddAdjustment} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Registrar Ajuste
                  </Button>
                  <Button variant="outline" onClick={() => { setIsAdjusting(false); setForm({ valor: '', descricao: '', observacao: '', justificativa: '' }); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Histórico */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {lancamentos.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum lançamento registrado</p>
              ) : (
                lancamentos.map(l => (
                  <div key={l.id} className={`text-xs border rounded p-3 ${l.valor < 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1">
                        <p className="font-semibold text-black">{l.descricao}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {l.data_lancamento} • {l.origem_lancamento === 'automatico_compras' ? '🔄 Automático' : '✋ Manual'} • {l.criado_por}
                        </p>
                      </div>
                      <span className={`font-bold ml-2 ${l.valor < 0 ? 'text-red-600' : 'text-black'}`}>
                        {l.valor < 0 ? '-' : '+'} R$ {Math.abs(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {l.observacao && <p className="text-gray-600 text-xs mt-1">📝 {l.observacao}</p>}
                    {l.justificativa_ajuste && <p className="text-amber-700 text-xs mt-1">⚖️ {l.justificativa_ajuste}</p>}
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