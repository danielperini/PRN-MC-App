import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '@/components/common/ConfirmDialog';

export default function GastoRubricaForm({ rubricaId, rubrica, isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState({
    fornecedor_nome: '',
    categoria: '',
    descricao: '',
    valor: '',
    data_gasto: new Date().toISOString().split('T')[0],
    tipo_pagamento: 'transferencia',
  });
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  // Detecta tipo de rubrica pela unidade ou descrição
  const isEquipeRubrica = rubrica?.unidade === 'mês' || rubrica?.descricao?.toLowerCase().includes('equipe');
  const isProdutoRubrica = rubrica?.unidade === 'un' || rubrica?.descricao?.toLowerCase().includes('produto');

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fornecedores'],
    queryFn: () => base44.entities.Fornecedor.list('nome', 100),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list('user_name', 100),
    enabled: isEquipeRubrica,
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos'],
    queryFn: () => base44.entities.Product.list('nome', 100),
    enabled: isProdutoRubrica,
  });

  const handleSubmit = async () => {
    if (!form.fornecedor_nome || !form.valor || !form.data_gasto) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setSaving(true);
    try {
      let fornecedor = null;
      let categoria = form.categoria;

      if (isEquipeRubrica) {
        fornecedor = teamMembers.find(t => t.user_name === form.fornecedor_nome);
        categoria = 'equipe';
      } else if (isProdutoRubrica) {
        fornecedor = produtos.find(p => p.nome === form.fornecedor_nome);
        categoria = 'produto';
      } else {
        fornecedor = fornecedores.find(f => f.nome === form.fornecedor_nome);
        categoria = form.categoria || fornecedor?.categoria || '';
      }
      
      console.log('Criando gasto com dados:', {
        rubrica_id: rubricaId,
        fornecedor_id: fornecedor?.id,
        fornecedor_nome: form.fornecedor_nome,
        categoria: categoria,
        valor: parseFloat(form.valor),
        data_gasto: form.data_gasto,
      });

      const result = await base44.entities.GastoRubrica.create({
        rubrica_id: rubricaId,
        fornecedor_id: fornecedor?.id || '',
        fornecedor_nome: form.fornecedor_nome,
        categoria: categoria,
        descricao: form.descricao,
        valor: parseFloat(form.valor),
        data_gasto: form.data_gasto,
        mes_referencia: form.data_gasto.substring(0, 7),
        tipo_pagamento: form.tipo_pagamento,
        status: 'pago',
      });

      console.log('Gasto criado com sucesso:', result);

      toast.success(`Gasto de R$ ${parseFloat(form.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} adicionado!`, {
        description: `${form.fornecedor_nome} - ${form.data_gasto}`,
      });

      queryClient.invalidateQueries(['gastos-rubrica', rubricaId]);
      setShowConfirm(false);
      setForm({
        fornecedor_nome: '',
        categoria: '',
        descricao: '',
        valor: '',
        data_gasto: new Date().toISOString().split('T')[0],
        tipo_pagamento: 'transferencia',
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('Erro ao criar gasto:', e);
      toast.error('Erro ao adicionar gasto: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Adicionar Gasto {isEquipeRubrica ? '(Equipe)' : isProdutoRubrica ? '(Produto)' : '(Fornecedor)'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              {isEquipeRubrica ? 'Membro da Equipe' : isProdutoRubrica ? 'Produto' : 'Fornecedor'} *
            </label>
            <Select value={form.fornecedor_nome} onValueChange={v => {
              setForm(p => ({ ...p, fornecedor_nome: v }));
            }}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {isEquipeRubrica ? (
                  teamMembers.map(t => (
                    <SelectItem key={t.id} value={t.user_name}>{t.user_name}</SelectItem>
                  ))
                ) : isProdutoRubrica ? (
                  produtos.map(p => (
                    <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                  ))
                ) : (
                  fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Descrição</label>
            <Input
              className="text-sm"
              placeholder="Ex: Pagamento mensal contabilidade"
              value={form.descricao}
              onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Valor (R$) *</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.valor}
                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data *</label>
              <Input
                type="date"
                value={form.data_gasto}
                onChange={e => setForm(p => ({ ...p, data_gasto: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo Pagamento</label>
            <Select value={form.tipo_pagamento} onValueChange={v => setForm(p => ({ ...p, tipo_pagamento: v }))}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-black text-white" onClick={handleSubmit} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmar adição de gasto"
        description={`Adicionar R$ ${parseFloat(form.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de ${form.fornecedor_nome} em ${form.data_gasto}?`}
        confirmText="Adicionar Gasto"
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirm(false)}
        isLoading={saving}
      />
    </Dialog>
  );
}