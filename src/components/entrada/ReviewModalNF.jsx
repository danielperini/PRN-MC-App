import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2, Send, Trash2 } from 'lucide-react';
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
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch (e) {
        console.error('Erro ao carregar rubricas:', e);
      }
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
    const rubricaNome = getRubricaNome(form.rubrica_id);

    const purchase = await base44.entities.PurchaseRequest.create({
      descricao_item: form.descricao_servico,
      fornecedor_nome: form.nf_emitente_nome,
      fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
      valor_solicitado: valor,
      centro_custo: form.centro_custo,
      rubrica_id: form.rubrica_id,
      rubrica_nome: rubricaNome,
      categoria: 'Nota Fiscal',
      tipo_gasto: 'Serviço',
      status: 'SOLICITADO',
      observacoes: `NF ${form.nf_numero} - ${form.nf_emitente_nome}`,
      nf_numero: form.nf_numero,
      nf_data_emissao: form.nf_data_emissao,
    });

    await base44.entities.DocumentIntake.update(intake.id, {
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: purchase.id,
      status_processamento: 'ENVIADO_APROVACAO',
      centro_custo: form.centro_custo,
      rubrica_id_sugerida: form.rubrica_id,
      rubrica_nome_sugerida: rubricaNome,
      revisado_pelo_usuario: true,
      resultado_ia: {
        ...ia,
        ...form,
        nf_valor_total: valor,
      },
    });

    return purchase;
  }

  async function handleAprovar(e) {
    e.preventDefault();
    e.stopPropagation();

    if (sending) return;

    const erros = validar();
    if (erros.length) {
      toast({ title: 'Preencha campos obrigatórios', description: erros.join(', '), variant: 'destructive' });
      return;
    }

    setSending(true);

    try {
      const purchase = await criarPurchaseRequest();

      const response = await base44.functions.invoke('purchaseActions', {
        action: 'aprovar',
        purchaseId: purchase.id,
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao aprovar');
      }

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        entidade_destino_id: purchase.id,
        team_payment_id: result?.team_payment_id || null,
      });

      toast({ title: 'Aprovado com sucesso' });

      onSaved?.();
      onClose?.();
    } catch (e) {
      toast({ title: 'Erro ao aprovar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  async function handleEnviar(e) {
    e.preventDefault();
    e.stopPropagation();

    if (sending) return;

    const erros = validar();
    if (erros.length) {
      toast({ title: 'Preencha campos obrigatórios', description: erros.join(', '), variant: 'destructive' });
      return;
    }

    setSending(true);

    try {
      await criarPurchaseRequest();

      toast({ title: 'Enviado para aprovação' });

      onSaved?.();
      onClose?.();
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (sending) return;

    setSending(true);

    try {
      await base44.entities.DocumentIntake.delete(intake.id);

      toast({ title: 'Documento deletado' });

      onSaved?.();
      onClose?.();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Número NF" value={form.nf_numero} onChange={(e) => setForm(f => ({ ...f, nf_numero: e.target.value }))} />
          <Input placeholder="Valor" value={form.nf_valor_total} onChange={(e) => setForm(f => ({ ...f, nf_valor_total: e.target.value }))} />
          <Input type="date" value={form.nf_data_emissao} onChange={(e) => setForm(f => ({ ...f, nf_data_emissao: e.target.value }))} />
          <Input placeholder="Emitente" value={form.nf_emitente_nome} onChange={(e) => setForm(f => ({ ...f, nf_emitente_nome: e.target.value }))} />
          <Textarea placeholder="Descrição" value={form.descricao_servico} onChange={(e) => setForm(f => ({ ...f, descricao_servico: e.target.value }))} />

          <Select value={form.centro_custo} onValueChange={(v) => setForm(f => ({ ...f, centro_custo: v }))}>
            <SelectTrigger><SelectValue placeholder="Centro de custo" /></SelectTrigger>
            <SelectContent>
              {CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={form.rubrica_id} onValueChange={(v) => setForm(f => ({ ...f, rubrica_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Rubrica" /></SelectTrigger>
            <SelectContent>
              {rubricas.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.grupo ? `${r.grupo} — ` : ''}{r.rubrica || r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="border px-4 py-2">Cancelar</button>

            <button onClick={handleDelete} className="bg-red-500 text-white px-4 py-2 flex items-center gap-2">
              <Trash2 size={16}/> Deletar
            </button>

            <button onClick={handleAprovar} className="bg-blue-600 text-white px-4 py-2 flex items-center gap-2">
              <CheckCircle2 size={16}/> Aprovar
            </button>

            <button onClick={handleEnviar} className="border px-4 py-2 flex items-center gap-2">
              <Send size={16}/> Enviar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
