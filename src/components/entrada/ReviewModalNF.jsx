import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

function parseValorBR(value) {
  const clean = String(value || '')
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(clean) || 0;
}

function normalizeDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return raw;
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const ia = intake?.resultado_ia || {};

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || '',
    nf_data_emissao: normalizeDate(
      ia.nf_data_emissao ||
      ia.data_emissao ||
      ia.dataEmissao ||
      ia.emissao ||
      ''
    ),
    nf_emitente_nome: ia.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
    descricao_servico: ia.descricao_servico || '',
    centro_custo: ia.centro_custo_sugerido || intake?.centro_custo || '',
    rubrica_id: intake?.rubrica_id_sugerida || '',
  });

  useEffect(() => {
    async function loadRubricas() {
      const list = await base44.entities.Rubrica.list('', 2000);
      setRubricas(list || []);
    }
    loadRubricas();
  }, []);

  function validar() {
    const erros = [];

    if (!form.nf_numero) erros.push('Número NF');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Valor');
    if (!form.nf_data_emissao) erros.push('Data');
    if (!form.nf_emitente_nome) erros.push('Emitente');
    if (!form.descricao_servico) erros.push('Descrição');
    if (!form.centro_custo) erros.push('Centro de custo');
    if (!form.rubrica_id) erros.push('Rubrica');

    return erros;
  }

  function getRubricaNome(id) {
    const r = rubricas.find((item) => item.id === id);
    return r?.rubrica || r?.nome || r?.descricao || '';
  }

  async function criarPurchaseRequest() {
    const valor = parseValorBR(form.nf_valor_total);

    return await base44.entities.PurchaseRequest.create({
      descricao_item: form.descricao_servico,
      fornecedor_nome: form.nf_emitente_nome,
      fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
      valor_solicitado: valor,
      centro_custo: form.centro_custo,
      rubrica_id: form.rubrica_id,
      rubrica_nome: getRubricaNome(form.rubrica_id),
      categoria: 'Nota Fiscal',
      tipo_gasto: 'Serviço',
      status: 'SOLICITADO',
      observacoes: `NF ${form.nf_numero}`,
      nf_numero: form.nf_numero,
      nf_data_emissao: form.nf_data_emissao,
    });
  }

  async function handleAprovar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    const erros = validar();

    if (erros.length) {
      toast({
        title: 'Preencha campos obrigatórios',
        description: erros.join(', '),
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setSending(true);

    try {
      toast({ title: 'Processando aprovação...', duration: 1500 });

      const purchase = await criarPurchaseRequest();

      const response = await base44.functions.invoke('purchaseActions', {
        action: 'aprovar',
        purchaseId: purchase.id,
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao aprovar nota.');
      }

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
        team_payment_id: result?.team_payment_id || null,
      });

      toast({
        title: '✅ Nota aprovada com sucesso',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Erro ao aprovar NF:', e);

      toast({
        title: 'Erro ao aprovar',
        description: e?.message || 'Falha ao aprovar nota fiscal.',
        variant: 'destructive',
        duration: 6000,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleEnviar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    const erros = validar();

    if (erros.length) {
      toast({
        title: 'Preencha campos obrigatórios',
        description: erros.join(', '),
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setSending(true);

    try {
      const purchase = await criarPurchaseRequest();

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
      });

      toast({
        title: '📩 Enviado para aprovação',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      toast({
        title: 'Erro ao enviar',
        description: e?.message || 'Falha ao enviar nota.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  }

  const rubricasOrdenadas = [...rubricas].sort((a, b) => {
    const nomeA = String(a.rubrica || a.nome || a.descricao || '');
    const nomeB = String(b.rubrica || b.nome || b.descricao || '');
    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Número NF"
            value={form.nf_numero}
            onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))}
          />

          <Input
            placeholder="Valor"
            value={form.nf_valor_total}
            onChange={(e) => setForm((f) => ({ ...f, nf_valor_total: e.target.value }))}
          />

          <Input
            type="date"
            value={form.nf_data_emissao}
            onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))}
          />

          <Input
            placeholder="Emitente"
            value={form.nf_emitente_nome}
            onChange={(e) => setForm((f) => ({ ...f, nf_emitente_nome: e.target.value }))}
          />

          <Textarea
            placeholder="Descrição"
            value={form.descricao_servico}
            onChange={(e) => setForm((f) => ({ ...f, descricao_servico: e.target.value }))}
          />

          <Select
            value={form.centro_custo}
            onValueChange={(v) => setForm((f) => ({ ...f, centro_custo: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Centro de custo" />
            </SelectTrigger>
            <SelectContent>
              {CENTROS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={form.rubrica_id}
            onValueChange={(v) => setForm((f) => ({ ...f, rubrica_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rubrica" />
            </SelectTrigger>
            <SelectContent>
              {rubricasOrdenadas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {(r.grupo ? `${r.grupo} — ` : '')}
                  {r.rubrica || r.nome || r.descricao || 'Rubrica sem nome'}
                  {r.centro_custo ? ` — ${r.centro_custo}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleAprovar}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Aprovar
            </button>

            <button
              type="button"
              onClick={handleEnviar}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
