import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileCheck } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function TeamPaymentSubmit({ userEmail }) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    mes_referencia: '',
    ano: new Date().getFullYear(),
    numero_nf: '',
    valor_nf: 0,
    nota_fiscal_url: ''
  });

  const queryClient = useQueryClient();

  const { data: teamMember } = useQuery({
    queryKey: ['team-member', userEmail],
    queryFn: () => base44.entities.TeamMember.filter({ user_email: userEmail }),
    select: (data) => data?.[0]
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments', userEmail],
    queryFn: () => base44.entities.TeamPayment.filter({ user_email: userEmail }, '-created_date', 50)
  });

  const handleUploadNF = async (file) => {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, nota_fiscal_url: file_url }));
      toast.success('Nota fiscal anexada');
    } catch (error) {
      toast.error('Erro ao enviar: ' + error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!teamMember) {
      toast.error('Você não está cadastrado como membro da equipe');
      return;
    }

    setLoading(true);
    try {
      // Verificar se já existe pagamento para este mês
      const existing = payments.find(p => 
        p.mes_referencia === form.mes_referencia && 
        p.ano === form.ano &&
        p.status !== 'RECUSADO'
      );

      if (existing) {
        toast.error('Você já enviou pagamento para este mês');
        setLoading(false);
        return;
      }

      // Criar registro de pagamento
      await base44.entities.TeamPayment.create({
        team_member_id: teamMember.id,
        user_email: userEmail,
        mes_referencia: form.mes_referencia,
        ano: form.ano,
        numero_nf: form.numero_nf,
        valor_nf: form.valor_nf,
        nota_fiscal_url: form.nota_fiscal_url,
        numero_parcela: (teamMember.parcelas_pagas || 0) + 1,
        status: 'AGUARDANDO_APROVACAO'
      });

      // Notificar coordenadores
      await base44.functions.invoke('notifyTeamPaymentSubmitted', {
        team_member_name: teamMember.user_name,
        mes: form.mes_referencia,
        ano: form.ano,
        valor: form.valor_nf
      });

      toast.success('Nota fiscal enviada para aprovação');
      setForm({ mes_referencia: '', ano: new Date().getFullYear(), numero_nf: '', valor_nf: 0, nota_fiscal_url: '' });
      setShowForm(false);
      queryClient.invalidateQueries(['team-payments']);
    } catch (error) {
      toast.error('Erro ao enviar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!teamMember) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
        Você não está cadastrado como membro da equipe. Contate o coordenador.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-black">Envio de Notas Fiscais</h2>
          <p className="text-xs text-gray-500 mt-1">
            Parcela {(teamMember.parcelas_pagas || 0) + 1} de {teamMember.numero_parcelas}
          </p>
        </div>
        <Button className="bg-black hover:bg-gray-800" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />Enviar Nota Fiscal
        </Button>
      </div>

      {/* Histórico de Pagamentos */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Histórico</h3>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma nota fiscal enviada</p>
        ) : (
          payments.map(payment => (
            <div key={payment.id} className="p-3 border border-gray-200 rounded-lg text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{payment.mes_referencia} / {payment.ano}</span>
                <Badge className={statusBadge(payment.status)}>
                  {payment.status}
                </Badge>
              </div>
              <p className="text-gray-600">NF: {payment.numero_nf} • R$ {payment.valor_nf?.toFixed(2)}</p>
              {payment.observacoes && (
                <p className="text-amber-700 mt-2 italic">Obs: {payment.observacoes}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar Nota Fiscal - Parcela {(teamMember.parcelas_pagas || 0) + 1}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mês e Ano */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mês *</Label>
                <Select value={form.mes_referencia} onValueChange={v => setForm({ ...form, mes_referencia: v })}>
                  <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano *</Label>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={e => setForm({ ...form, ano: parseInt(e.target.value) })}
                  min={2026}
                />
              </div>
            </div>

            {/* NF */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número da NF *</Label>
                <Input
                  value={form.numero_nf}
                  onChange={e => setForm({ ...form, numero_nf: e.target.value })}
                  placeholder="Ex: 001234"
                  required
                />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  value={form.valor_nf}
                  onChange={e => setForm({ ...form, valor_nf: parseFloat(e.target.value) })}
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>

            {/* Upload Nota Fiscal */}
            <div>
              <Label>Nota Fiscal em PDF *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                {form.nota_fiscal_url ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <FileCheck className="w-5 h-5" />
                    <span>Arquivo enviado</span>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-600">Clique para enviar PDF</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={e => handleUploadNF(e.target.files[0])}
                      className="hidden"
                      disabled={loading}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-black hover:bg-gray-800" disabled={loading || !form.nota_fiscal_url}>
                {loading ? 'Enviando...' : 'Enviar para Aprovação'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusBadge(status) {
  const config = {
    RASCUNHO: 'bg-gray-100 text-gray-800',
    AGUARDANDO_APROVACAO: 'bg-blue-100 text-blue-800',
    APROVADO: 'bg-green-100 text-green-800',
    REVISAO: 'bg-yellow-100 text-yellow-800',
    PAGO: 'bg-emerald-100 text-emerald-800',
    RECUSADO: 'bg-red-100 text-red-800'
  };
  return config[status] || config.RASCUNHO;
}