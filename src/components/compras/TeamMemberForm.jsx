import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export default function TeamMemberForm({ isOpen, onClose, onSuccess, editingMember, budgetLines = [] }) {
  const [loading, setLoading] = useState(false);
  const [contrato, setContrato] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => base44.entities.User.list(),
    enabled: isOpen && !editingMember,
  });

  const [form, setForm] = useState(editingMember || {
    user_email: '',
    user_name: '',
    funcao: '',
    budgetline_id: '',
    contrato_url: '',
    valor_total: 0,
    numero_parcelas: 1,
    banco: '',
    agencia: '',
    conta: '',
    tipo_conta: 'Corrente',
    pix_key: ''
  });

  const handleContratoUpload = async (file) => {
    if (file.type !== 'application/pdf') {
      toast.error('Apenas PDFs são aceitos');
      return;
    }

    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Extrair dados do contrato com IA
      const extracted = await base44.integrations.Core.InvokeLLM({
        prompt: `Você recebeu um contrato em PDF. Extraia os seguintes dados:
- Valor total do contrato (número)
- Número de parcelas
- Nome completo do beneficiário
- Função/cargo

Retorne em JSON: {"valor_total": 0, "numero_parcelas": 0, "nome": "", "funcao": ""}`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            valor_total: { type: 'number' },
            numero_parcelas: { type: 'number' },
            nome: { type: 'string' },
            funcao: { type: 'string' }
          }
        }
      });

      setForm(prev => ({
        ...prev,
        contrato_url: file_url,
        valor_total: extracted?.valor_total || 0,
        numero_parcelas: extracted?.numero_parcelas || 1,
        user_name: extracted?.nome || prev.user_name,
        funcao: extracted?.funcao || prev.funcao,
        valor_parcela: (extracted?.valor_total || 0) / (extracted?.numero_parcelas || 1)
      }));
      
      toast.success('Contrato importado com sucesso');
    } catch (error) {
      toast.error('Erro ao processar contrato: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, form);
        toast.success('Membro atualizado');
      } else {
        await base44.entities.TeamMember.create({
          ...form,
          valor_parcela: form.valor_total / form.numero_parcelas,
          data_criacao: new Date().toISOString().split('T')[0],
          status: 'ATIVO'
        });
        toast.success('Membro adicionado à equipe');
      }
      onSuccess();
      onClose();
    } catch (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingMember ? 'Editar Membro' : 'Adicionar Membro à Equipe'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email do Usuário */}
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.user_email}
              onChange={e => setForm({ ...form, user_email: e.target.value })}
              placeholder="usuario@exemplo.com"
              required
            />
          </div>

          {/* Nome */}
          <div>
            <Label>Nome Completo *</Label>
            <Input
              value={form.user_name}
              onChange={e => setForm({ ...form, user_name: e.target.value })}
              placeholder="Nome completo"
              required
            />
          </div>

          {/* Função */}
          <div>
            <Label>Função/Cargo</Label>
            <Input
              value={form.funcao}
              onChange={e => setForm({ ...form, funcao: e.target.value })}
              placeholder="Ex: Designer, Produtor"
            />
          </div>

          {/* Rubrica */}
          {budgetLines.length > 0 && (
            <div>
              <Label>Rubrica Orçamentária Correspondente</Label>
              <Select value={form.budgetline_id || ''} onValueChange={v => setForm({ ...form, budgetline_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a rubrica" />
                </SelectTrigger>
                <SelectContent>
                  {budgetLines.map(bl => (
                    <SelectItem key={bl.id} value={bl.id}>
                      {bl.codigo} — {bl.descricao?.substring(0, 50)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Upload Contrato */}
          <div>
            <Label>Contrato em PDF *</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              {form.contrato_url ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-600">✓ Contrato enviado</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, contrato_url: '' })}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Clique para enviar contrato</p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => handleContratoUpload(e.target.files[0])}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Valor e Parcelas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor Total (R$) *</Label>
              <Input
                type="number"
                value={form.valor_total}
                onChange={e => setForm({
                  ...form,
                  valor_total: parseFloat(e.target.value),
                  valor_parcela: parseFloat(e.target.value) / form.numero_parcelas
                })}
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <Label>Número de Parcelas *</Label>
              <Input
                type="number"
                value={form.numero_parcelas}
                onChange={e => setForm({
                  ...form,
                  numero_parcelas: parseInt(e.target.value),
                  valor_parcela: form.valor_total / parseInt(e.target.value)
                })}
                min="1"
              />
            </div>
          </div>

          {form.valor_parcela > 0 && (
            <p className="text-sm text-gray-600">Valor por parcela: <strong>R$ {form.valor_parcela.toFixed(2)}</strong></p>
          )}

          {/* Dados Bancários */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Dados Bancários</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Banco</Label>
                <Input
                  value={form.banco}
                  onChange={e => setForm({ ...form, banco: e.target.value })}
                  placeholder="Ex: Caixa Econômica"
                />
              </div>
              <div>
                <Label>Agência</Label>
                <Input
                  value={form.agencia}
                  onChange={e => setForm({ ...form, agencia: e.target.value })}
                  placeholder="Ex: 0001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <Label>Conta</Label>
                <Input
                  value={form.conta}
                  onChange={e => setForm({ ...form, conta: e.target.value })}
                  placeholder="Número da conta"
                />
              </div>
              <div>
                <Label>Tipo de Conta</Label>
                <Select value={form.tipo_conta} onValueChange={v => setForm({ ...form, tipo_conta: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corrente">Corrente</SelectItem>
                    <SelectItem value="Poupança">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4">
              <Label>Chave PIX (opcional)</Label>
              <Input
                value={form.pix_key}
                onChange={e => setForm({ ...form, pix_key: e.target.value })}
                placeholder="CPF, Email, Telefone ou Aleatória"
              />
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-2 justify-end border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="bg-black hover:bg-gray-800" disabled={loading}>
              {loading ? 'Processando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}