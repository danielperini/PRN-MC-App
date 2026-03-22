import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
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
import { Textarea } from '@/components/ui/textarea';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = {
  user_email: '',
  user_name: '',
  email_pessoal: '',
  telefone: '',
  tipo_pessoa: 'PF',
  cpf: '',
  cnpj: '',
  funcao: '',
  empresa_nome: '',
  empresa_endereco: '',
  representante_legal_nome: '',
  representante_legal_cpf: '',
  cargo_representante: '',
  budgetline_id: '',
  budget_line_id: '',
  rubrica_id: '',
  contrato_url: '',
  descricao_contrato: '',
  objeto_contrato: '',
  data_inicio_contrato: '',
  data_fim_contrato: '',
  valor_total: 0,
  numero_parcelas: 1,
  parcelas_pagas: 0,
  valor_parcela: 0,
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: 'Corrente',
  pix_key: '',
  status: 'ATIVO',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeForm(data) {
  const vinculoId =
    data?.budgetline_id ||
    data?.budget_line_id ||
    data?.rubrica_id ||
    '';

  const valorTotal = toNumber(data?.valor_total);
  const numeroParcelas = Math.max(1, parseInt(data?.numero_parcelas, 10) || 1);
  const valorParcela =
    toNumber(data?.valor_parcela) ||
    (valorTotal && numeroParcelas ? valorTotal / numeroParcelas : 0);

  return {
    ...EMPTY_FORM,
    ...(data || {}),
    budgetline_id: vinculoId,
    budget_line_id: vinculoId,
    rubrica_id: data?.rubrica_id || vinculoId,
    valor_total: valorTotal,
    numero_parcelas: numeroParcelas,
    valor_parcela: valorParcela,
    parcelas_pagas: toNumber(data?.parcelas_pagas),
  };
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-black border-b pb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
  editingMember,
  budgetLines = [],
}) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState(normalizeForm(editingMember || EMPTY_FORM));

  useEffect(() => {
    if (isOpen) {
      setForm(normalizeForm(editingMember || EMPTY_FORM));
    }
  }, [isOpen, editingMember]);

  const set = (field, value) => {
    setForm((prev) => {
      if (field === 'budgetline_id') {
        return {
          ...prev,
          budgetline_id: value,
          budget_line_id: value,
          rubrica_id: value,
        };
      }

      const next = { ...prev, [field]: value };

      if (field === 'valor_total' || field === 'numero_parcelas') {
        const total = toNumber(field === 'valor_total' ? value : next.valor_total);
        const parcelas = Math.max(
          1,
          parseInt(field === 'numero_parcelas' ? value : next.numero_parcelas, 10) || 1
        );
        next.valor_parcela = total && parcelas ? total / parcelas : 0;
      }

      return next;
    });
  };

  const budgetOptions = useMemo(() => {
    return (budgetLines || []).map((b) => ({
      id: b.id,
      label: `${b.codigo || '—'} - ${b.descricao || 'Sem descrição'}`,
    }));
  }, [budgetLines]);

  const processContratoIA = async (file_url) => {
    try {
      const resumo = await base44.integrations.Core.InvokeLLM({
        prompt:
          'Leia este contrato e gere um resumo curto com objeto, vigência, valor total, parcelas e dados bancários.',
        file_urls: [file_url],
      });

      const extracted = await base44.integrations.Core.InvokeLLM({
        prompt:
          'Extraia do contrato os campos: data_inicio, data_fim, valor_total, numero_parcelas, banco, agencia, conta, tipo_conta, pix_key, objeto_contrato.',
        file_urls: [file_url],
      });

      const numeroParcelas = Math.max(1, parseInt(extracted?.numero_parcelas, 10) || 1);
      const valorTotal = toNumber(extracted?.valor_total);

      setForm((prev) => ({
        ...prev,
        descricao_contrato:
          resumo || prev.descricao_contrato,
        objeto_contrato:
          extracted?.objeto_contrato || prev.objeto_contrato,
        data_inicio_contrato:
          extracted?.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato:
          extracted?.data_fim || prev.data_fim_contrato,
        valor_total: valorTotal || prev.valor_total,
        numero_parcelas: numeroParcelas,
        valor_parcela:
          valorTotal && numeroParcelas
            ? valorTotal / numeroParcelas
            : prev.valor_parcela,
        banco: extracted?.banco || prev.banco,
        agencia: extracted?.agencia || prev.agencia,
        conta: extracted?.conta || prev.conta,
        tipo_conta: extracted?.tipo_conta || prev.tipo_conta,
        pix_key: extracted?.pix_key || prev.pix_key,
      }));

      toast.success('Contrato preenchido com IA');
    } catch (e) {
      toast.error('Erro na leitura automática do contrato');
    }
  };

  const handleContratoUpload = async (file) => {
    if (!file) return;

    setAiLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setForm((prev) => ({
        ...prev,
        contrato_url: file_url,
      }));

      await processContratoIA(file_url);
    } catch (error) {
      toast.error('Erro upload: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.user_name || !form.user_email) {
      toast.error('Preencha pelo menos nome e e-mail.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...form,
        budgetline_id:
          form.budgetline_id ||
          form.budget_line_id ||
          form.rubrica_id ||
          '',
        budget_line_id:
          form.budgetline_id ||
          form.budget_line_id ||
          form.rubrica_id ||
          '',
        rubrica_id:
          form.rubrica_id ||
          form.budgetline_id ||
          form.budget_line_id ||
          '',
        valor_total: toNumber(form.valor_total),
        numero_parcelas: Math.max(1, parseInt(form.numero_parcelas, 10) || 1),
        parcelas_pagas: toNumber(form.parcelas_pagas),
        valor_parcela: toNumber(form.valor_parcela),
      };

      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, payload);
      } else {
        await base44.entities.TeamMember.create(payload);
      }

      toast.success('Salvo com sucesso');
      onSuccess?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingMember?.id ? 'Editar membro da equipe' : 'Novo membro da equipe'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Dados pessoais">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={form.user_name}
                  onChange={(e) => set('user_name', e.target.value)}
                />
              </div>

              <div>
                <Label>E-mail institucional</Label>
                <Input
                  value={form.user_email}
                  onChange={(e) => set('user_email', e.target.value)}
                />
              </div>

              <div>
                <Label>E-mail pessoal</Label>
                <Input
                  value={form.email_pessoal}
                  onChange={(e) => set('email_pessoal', e.target.value)}
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => set('telefone', e.target.value)}
                />
              </div>

              <div>
                <Label>Tipo de pessoa</Label>
                <Select
                  value={form.tipo_pessoa}
                  onValueChange={(v) => set('tipo_pessoa', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Função</Label>
                <Input
                  value={form.funcao}
                  onChange={(e) => set('funcao', e.target.value)}
                />
              </div>

              <div>
                <Label>CPF</Label>
                <Input
                  value={form.cpf}
                  onChange={(e) => set('cpf', e.target.value)}
                />
              </div>

              <div>
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => set('cnpj', e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section title="Dados da empresa / representação">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Empresa</Label>
                <Input
                  value={form.empresa_nome}
                  onChange={(e) => set('empresa_nome', e.target.value)}
                />
              </div>

              <div>
                <Label>Endereço da empresa</Label>
                <Input
                  value={form.empresa_endereco}
                  onChange={(e) => set('empresa_endereco', e.target.value)}
                />
              </div>

              <div>
                <Label>Representante legal</Label>
                <Input
                  value={form.representante_legal_nome}
                  onChange={(e) => set('representante_legal_nome', e.target.value)}
                />
              </div>

              <div>
                <Label>CPF do representante</Label>
                <Input
                  value={form.representante_legal_cpf}
                  onChange={(e) => set('representante_legal_cpf', e.target.value)}
                />
              </div>

              <div>
                <Label>Cargo do representante</Label>
                <Input
                  value={form.cargo_representante}
                  onChange={(e) => set('cargo_representante', e.target.value)}
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => set('status', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="INATIVO">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section title="Rubrica / linha orçamentária">
            <div>
              <Label>Rubrica / Linha</Label>
              <Select
                value={form.budgetline_id || ''}
                onValueChange={(v) => set('budgetline_id', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {budgetOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section title="Contrato">
            <div className="space-y-3">
              <div>
                <Label>Upload do contrato</Label>
                <div className="mt-1">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => handleContratoUpload(e.target.files?.[0])}
                  />
                </div>
                {aiLoading && (
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Processando contrato com IA...
                  </p>
                )}
              </div>

              <div>
                <Label>URL do contrato</Label>
                <Input
                  value={form.contrato_url}
                  onChange={(e) => set('contrato_url', e.target.value)}
                />
              </div>

              <div>
                <Label>Resumo / descrição do contrato</Label>
                <Textarea
                  value={form.descricao_contrato}
                  onChange={(e) => set('descricao_contrato', e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <Label>Objeto do contrato</Label>
                <Textarea
                  value={form.objeto_contrato}
                  onChange={(e) => set('objeto_contrato', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Início do contrato</Label>
                  <Input
                    type="date"
                    value={form.data_inicio_contrato}
                    onChange={(e) => set('data_inicio_contrato', e.target.value)}
                  />
                </div>

                <div>
                  <Label>Fim do contrato</Label>
                  <Input
                    type="date"
                    value={form.data_fim_contrato}
                    onChange={(e) => set('data_fim_contrato', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Financeiro do contrato">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label>Valor total</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_total}
                  onChange={(e) => set('valor_total', e.target.value)}
                />
              </div>

              <div>
                <Label>Número de parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.numero_parcelas}
                  onChange={(e) => set('numero_parcelas', e.target.value)}
                />
              </div>

              <div>
                <Label>Parcelas pagas</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.parcelas_pagas}
                  onChange={(e) => set('parcelas_pagas', e.target.value)}
                />
              </div>

              <div>
                <Label>Valor por parcela</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_parcela}
                  onChange={(e) => set('valor_parcela', e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section title="Dados bancários">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Banco</Label>
                <Input
                  value={form.banco}
                  onChange={(e) => set('banco', e.target.value)}
                />
              </div>

              <div>
                <Label>Agência</Label>
                <Input
                  value={form.agencia}
                  onChange={(e) => set('agencia', e.target.value)}
                />
              </div>

              <div>
                <Label>Conta</Label>
                <Input
                  value={form.conta}
                  onChange={(e) => set('conta', e.target.value)}
                />
              </div>

              <div>
                <Label>Tipo de conta</Label>
                <Select
                  value={form.tipo_conta}
                  onValueChange={(v) => set('tipo_conta', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corrente">Corrente</SelectItem>
                    <SelectItem value="Poupança">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>PIX</Label>
                <Input
                  value={form.pix_key}
                  onChange={(e) => set('pix_key', e.target.value)}
                />
              </div>
            </div>
          </Section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button type="submit" disabled={loading} onClick={handleSubmit}>
              {loading ? (
                <Loader2 className="animate-spin w-4 h-4 mr-2" />
              ) : null}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
