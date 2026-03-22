import React, { useState, useEffect, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CARGOS_PLANO_TRABALHO } from '@/components/planoTrabalho';

const DEFAULT_START_DATE = '2026-02-02';
const ANA_LUIZA_START_DATE = '2026-03-03';

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
  cronograma_parcelas: [],
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: 'Corrente',
  pix_key: '',
  status: 'ATIVO',
};

function toNumber(value) {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeForm(data) {
  const id =
    data?.budgetline_id || data?.budget_line_id || data?.rubrica_id || '';

  return {
    ...EMPTY_FORM,
    ...(data || {}),
    budgetline_id: id,
    budget_line_id: id,
    rubrica_id: id,
    valor_total: toNumber(data?.valor_total),
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
      return { ...prev, [field]: value };
    });
  };

  // 🔥 IA AUTOMÁTICA AO SUBIR CONTRATO
  const processContratoIA = async (file_url) => {
    try {
      // 1. RESUMO
      const resumo =
        await base44.integrations.Core.InvokeLLM({
          prompt:
            'Leia este contrato e forneça um resumo conciso com objeto, duração, valor e obrigações.',
          file_urls: [file_url],
        });

      // 2. EXTRAÇÃO ESTRUTURADA
      const extracted =
        await base44.integrations.Core.InvokeLLM({
          prompt:
            'Extraia dados estruturados do contrato: data_inicio, data_fim, valor_total, numero_parcelas, banco, agencia, conta, tipo_conta, pix_key, objeto_contrato.',
          file_urls: [file_url],
        });

      const numeroParcelas =
        Math.max(1, parseInt(extracted.numero_parcelas, 10) || 1);
      const valorTotal = toNumber(extracted.valor_total);

      setForm((prev) => ({
        ...prev,
        descricao_contrato: resumo || prev.descricao_contrato,
        objeto_contrato:
          extracted.objeto_contrato || prev.objeto_contrato,
        data_inicio_contrato:
          extracted.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato:
          extracted.data_fim || prev.data_fim_contrato,
        valor_total: valorTotal || prev.valor_total,
        numero_parcelas: numeroParcelas,
        valor_parcela:
          valorTotal && numeroParcelas
            ? valorTotal / numeroParcelas
            : prev.valor_parcela,
        banco: extracted.banco || prev.banco,
        agencia: extracted.agencia || prev.agencia,
        conta: extracted.conta || prev.conta,
        tipo_conta: extracted.tipo_conta || prev.tipo_conta,
        pix_key: extracted.pix_key || prev.pix_key,
      }));

      toast.success('IA preencheu contrato automaticamente');
    } catch (e) {
      toast.error('Erro IA contrato');
    }
  };

  const handleContratoUpload = async (file) => {
    if (!file) return;

    setAiLoading(true);
    try {
      const { file_url } =
        await base44.integrations.Core.UploadFile({ file });

      setForm((prev) => ({
        ...prev,
        contrato_url: file_url,
      }));

      // 🔥 CHAMA IA AUTOMÁTICA
      await processContratoIA(file_url);

    } catch (error) {
      toast.error('Erro upload: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...form,
        budgetline_id:
          form.budgetline_id ||
          form.budget_line_id ||
          form.rubrica_id ||
          '',
      };

      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, data);
      } else {
        await base44.entities.TeamMember.create(data);
      }

      toast.success('Salvo com sucesso');
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Equipe</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">

          <Section title="Contrato">
            <div>
              <Label>Contrato</Label>

              <input
                type="file"
                onChange={(e) =>
                  handleContratoUpload(e.target.files[0])
                }
              />
            </div>

            <Textarea
              value={form.descricao_contrato}
              onChange={(e) =>
                set('descricao_contrato', e.target.value)
              }
            />
          </Section>

          <Button type="submit">
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>

        </form>
      </DialogContent>
    </Dialog>
  );
}
