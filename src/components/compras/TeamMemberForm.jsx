import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = {
  user_email: '',
  user_name: '',
  funcao: '',
  telefone: '',
  tipo_pessoa: 'PF',
  cpf: '',
  cnpj: '',
  banco: '',
  agencia: '',
  conta: '',
  pix_key: '',
  budgetline_id: '',
  parcelas: '',
  valor_parcela: '',
  data_inicio: '',
  data_fim: '',
  data_assinatura: '',
  objeto: '',
  contrato_url: '',
};

function normalizeForm(data) {
  return {
    ...EMPTY_FORM,
    ...(data || {}),
    tipo_pessoa: data?.tipo_pessoa || 'PF',
    budgetline_id:
      data?.budgetline_id ||
      data?.budget_line_id ||
      '',
  };
}

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
  editingMember,
  budgetLines = [],
}) {
  const [loading, setLoading] = useState(false);
  const [loadingContrato, setLoadingContrato] = useState(false);
  const [form, setForm] = useState(normalizeForm(editingMember));

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => base44.auth.me(),
  });

  const isSelfEdit =
    editingMember?.user_email &&
    currentUser?.email &&
    String(editingMember.user_email).toLowerCase() ===
      String(currentUser.email).toLowerCase();

  const { data: budgetLinesFromDB = [] } = useQuery({
    queryKey: ['team-form-budgetlines'],
    queryFn: () => base44.entities.BudgetLine.list('codigo', 200),
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      setForm(normalizeForm(editingMember));
    }
  }, [isOpen, editingMember]);

  const finalBudgetLines = useMemo(() => {
    if (budgetLines && budgetLines.length > 0) return budgetLines;
    return budgetLinesFromDB;
  }, [budgetLines, budgetLinesFromDB]);

  // 🔥 NOVA INTEGRAÇÃO COM FUNCTION
  const handleUploadContrato = async (file) => {
    if (!file) return;

    setLoadingContrato(true);

    try {
      const upload = await base44.storage.upload(file);

      const response = await fetch('/functions/extractTeamContract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: upload.url }),
      });

      const data = await response.json();

      if (!data?.success) {
        throw new Error(data?.error || 'Erro na extração');
      }

      const result = data.extracted || {};

      setForm(prev => ({
        ...prev,
        contrato_url: upload.url,

        user_name: prev.user_name || result?.user_name,
        funcao: prev.funcao || result?.funcao,

        cpf: prev.cpf || result?.cpf,
        cnpj: prev.cnpj || result?.cnpj,
        tipo_pessoa: result?.tipo_pessoa || prev.tipo_pessoa,

        valor_parcela: prev.valor_parcela || result?.valor_parcela,
        parcelas: prev.parcelas || result?.parcelas,

        data_inicio: prev.data_inicio || result?.data_inicio,
        data_fim: prev.data_fim || result?.data_fim,
        data_assinatura: prev.data_assinatura || result?.data_assinatura,

        banco: prev.banco || result?.banco,
        agencia: prev.agencia || result?.agencia,
        conta: prev.conta || result?.conta,
        pix_key: prev.pix_key || result?.pix_key,

        objeto: prev.objeto || result?.objeto,
      }));

      if (result?.campos_revisao?.length > 0) {
        toast.warning('Contrato lido. Alguns campos precisam revisão.');
      } else {
        toast.success('Contrato analisado. Revise antes de salvar.');
      }

    } catch (e) {
      toast.error('Erro ao ler contrato');
    }

    setLoadingContrato(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.user_name) {
      toast.error('Nome obrigatório');
      return;
    }

    if (!form.budgetline_id && !isSelfEdit) {
      toast.error('Selecione a linha orçamentária');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...form,
        cpf: form.tipo_pessoa === 'PF' ? form.cpf : '',
        cnpj: form.tipo_pessoa === 'PJ' ? form.cnpj : '',
      };

      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, payload);
      } else {
        await base44.entities.TeamMember.create(payload);
      }

      toast.success('Dados atualizados');
      onSuccess?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message);
    }

    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSelfEdit ? 'Editar meu perfil' : editingMember?.id ? 'Editar equipe' : 'Adicionar membro'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <Label>Contrato (PDF)</Label>
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => handleUploadContrato(e.target.files[0])}
            />
            {loadingContrato && (
              <div className="text-xs text-gray-500 flex gap-1 mt-1">
                <Loader2 className="animate-spin w-3 h-3" />
                Lendo contrato...
              </div>
            )}
          </div>

          <Input placeholder="Nome" value={form.user_name} onChange={(e) => setForm({ ...form, user_name: e.target.value })} />
          <Input placeholder="Função" value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} />
          <Input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />

          <Input placeholder="Parcelas" value={form.parcelas} onChange={(e) => setForm({ ...form, parcelas: e.target.value })} />
          <Input placeholder="Valor parcela" value={form.valor_parcela} onChange={(e) => setForm({ ...form, valor_parcela: e.target.value })} />

          <Input placeholder="Data início" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
          <Input placeholder="Data fim" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />

          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Salvar'}
          </Button>

        </form>
      </DialogContent>
    </Dialog>
  );
}
