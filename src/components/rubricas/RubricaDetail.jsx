import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar,
  User,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';

export default function RubricaDetail({ rubrica, onClose }) {
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [formData, setFormData] = useState({
    valor: '',
    data_lancamento: new Date().toISOString().split('T')[0],
    descricao: '',
    observacao: '',
    justificativa_ajuste: '',
  });
  const queryClient = useQueryClient();

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos-rubrica', rubrica.id],
    queryFn: () => base44.entities.LancamentoRubrica.filter({
      rubrica_id: rubrica.id,
    }, '-created_date', 100),
  });

  const handleAddLancamento = async () => {
    if (!formData.valor) {
      toast.error('Valor é obrigatório');
      return;
    }

    const valor = parseFloat(formData.valor);

    if (valor < 0 && !formData.justificativa_ajuste) {
      toast.error('Justificativa é obrigatória para ajustes negativos');
      return;
    }

    try {
      const user = await base44.auth.me();

      await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubrica.id,
        data_lancamento: formData.data_lancamento,
        origem_lancamento: 'manual_usuario',
        descricao: formData.descricao,
        valor: valor,
        observacao: formData.observacao,
        justificativa_ajuste: formData.justificativa_ajuste,
        criado_por: user?.email,
      });

      // Recalcular rubrica
      await base44.functions.invoke('recalculateRubrica', {
        rubricaId: rubrica.id,
      });

      toast.success('✅ Lançamento adicionado!');
      setFormData({
        valor: '',
        data_lancamento: new Date().toISOString().split('T')[0],
        descricao: '',
        observacao: '',
        justificativa_ajuste: '',
      });
      setShowManualEntry(false);
      queryClient.invalidateQueries({ queryKey: ['lancamentos-rubrica', rubrica.id] });
      queryClient.invalidateQueries({ queryKey: ['rubricas'] });
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  const handleDeleteLancamento = async (lancamentoId) => {
    if (!window.confirm('Tem certeza que deseja remover este lançamento?')) return;

    try {
      await base44.entities.LancamentoRubrica.delete(lancamentoId);

      // Recalcular rubrica
      await base44.functions.invoke('recalculateRubrica', {
        rubricaId: rubrica.id,
      });

      toast.success('✅ Lançamento removido!');
      queryClient.invalidateQueries({ queryKey: ['lancamentos-rubrica', rubrica.id] });
      queryClient.invalidateQueries({ queryKey: ['rubricas'] });
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  const getStatusIcon = (percentual) => {
    if (percentual >= 100) return <AlertCircle className="w-5 h-5 text-red-600" />;
    if (percentual >= 80) return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    return null;
  };

  const getStatusClass = (percentual) => {
    if (percentual >= 100) return 'bg-red-50 border-red-200';
    if (percentual >= 80) return 'bg-yellow-50 border-yellow-200';
    return 'bg-white border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Card Principal */}
      <div className={`border rounded-lg p-6 ${getStatusClass(rubrica.percentual_utilizado || 0)}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-black">{rubrica.rubrica}</h2>
              {getStatusIcon(rubrica.percentual_utilizado || 0)}
            </div>
            <p className="text-sm text-gray-600">{rubrica.grupo}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-black">
              {(rubrica.percentual_utilizado || 0).toFixed(2)}%
            </p>
            <p className="text-xs text-gray-600">Utilizado</p>
          </div>
        </div>

        {/* Dados da Rubrica */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div>
            <span className="text-xs text-gray-600 font-semibold">Nº de Parcelas</span>
            <p className="text-sm font-semibold text-black mt-1">{rubrica.numero_parcelas_unidades}</p>
          </div>
          <div>
            <span className="text-xs text-gray-600 font-semibold">Valor Rubrica</span>
            <p className="text-sm font-semibold text-black mt-1">
              R$ {(rubrica.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-600 font-semibold">Valor Utilizado</span>
            <p className="text-sm font-semibold text-blue-700 mt-1">
              R$ {(rubrica.valor_utilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-600 font-semibold">Saldo</span>
            <p className="text-sm font-semibold text-green-700 mt-1">
              R$ {(rubrica.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {rubrica.observacao_uso && (
          <div className="mt-4 p-3 bg-white/50 rounded text-sm text-gray-700 italic">
            📝 {rubrica.observacao_uso}
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-2">
        <Button
          onClick={() => setShowManualEntry(!showManualEntry)}
          className="bg-black hover:bg-gray-800 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          {showManualEntry ? 'Fechar' : 'Adicionar Lançamento Manual'}
        </Button>
      </div>

      {/* Formulário de Entrada Manual */}
      {showManualEntry && (
        <div className="border border-gray-200 rounded-lg p-6 space-y-4 bg-gray-50">
          <h3 className="font-semibold text-black">Novo Lançamento Manual</h3>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">Data *</label>
            <Input
              type="date"
              value={formData.data_lancamento}
              onChange={e => setFormData(f => ({ ...f, data_lancamento: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">Valor (R$) *</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.valor}
              onChange={e => setFormData(f => ({ ...f, valor: e.target.value }))}
            />
            {formData.valor && parseFloat(formData.valor) < 0 && (
              <p className="text-xs text-orange-600 mt-1">⚠️ Valor negativo - justificativa obrigatória</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">Descrição</label>
            <Input
              placeholder="Ex: Pagamento de consultor"
              value={formData.descricao}
              onChange={e => setFormData(f => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">Observação</label>
            <Textarea
              placeholder="Anotações adicionais..."
              rows={2}
              value={formData.observacao}
              onChange={e => setFormData(f => ({ ...f, observacao: e.target.value }))}
            />
          </div>

          {formData.valor && parseFloat(formData.valor) < 0 && (
            <div>
              <label className="text-sm font-semibold text-black block mb-2">Justificativa (obrigatória) *</label>
              <Textarea
                placeholder="Motivo do ajuste negativo..."
                rows={2}
                value={formData.justificativa_ajuste}
                onChange={e => setFormData(f => ({ ...f, justificativa_ajuste: e.target.value }))}
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setShowManualEntry(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleAddLancamento}
            >
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Histórico de Lançamentos */}
      <div>
        <h3 className="text-lg font-semibold text-black mb-4">📜 Histórico de Lançamentos</h3>
        
        {lancamentos.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
            Nenhum lançamento registrado
          </div>
        ) : (
          <div className="space-y-3">
            {lancamentos.map(lancamento => (
              <div key={lancamento.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {lancamento.origem_lancamento === 'automatico_compras' ? '🔄 Automático' : '📝 Manual'}
                      </span>
                      {lancamento.valor < 0 && (
                        <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-1 rounded">
                          Ajuste
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-black">{lancamento.descricao}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-600">
                      {lancamento.data_lancamento && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(lancamento.data_lancamento).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {lancamento.fornecedor && <span>📦 {lancamento.fornecedor}</span>}
                      {lancamento.criado_por && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {lancamento.criado_por}
                        </span>
                      )}
                    </div>
                    {lancamento.observacao && (
                      <p className="text-xs text-gray-600 italic mt-2">💬 {lancamento.observacao}</p>
                    )}
                    {lancamento.justificativa_ajuste && (
                      <p className="text-xs text-orange-700 italic mt-2">⚖️ {lancamento.justificativa_ajuste}</p>
                    )}
                  </div>

                  <div className="text-right flex items-start gap-2">
                    <div>
                      <p className={`text-lg font-bold ${lancamento.valor < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {lancamento.valor < 0 ? '-' : '+'}R$ {Math.abs(lancamento.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    {lancamento.origem_lancamento === 'manual_usuario' && (
                      <button
                        onClick={() => handleDeleteLancamento(lancamento.id)}
                        className="p-1 hover:bg-red-100 text-red-600 rounded transition"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}