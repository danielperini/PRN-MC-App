import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import {
  Loader2,
  Send,
  Trash2,
  RefreshCw,
  Save,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

function parseValorBR(value) {
  const raw = String(value || '').replace(/\./g, '').replace(',', '.');
  return Number(raw) || 0;
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    nf_numero: intake?.nf_numero || '',
    nf_valor_total: intake?.nf_valor_total || '',
    nf_emitente_nome: intake?.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: intake?.nf_emitente_cpf_cnpj || '',
    descricao_servico: intake?.descricao_servico || '',
    tipo_gasto: intake?.tipo_gasto || 'Serviço',
    centro_custo: intake?.centro_custo || 'Atuação Geral',
    rubrica_id: intake?.rubrica_id || '',
  });

  useEffect(() => {
    async function load() {
      const r = await base44.entities.Rubrica.list('', 2000);
      setRubricas(r || []);
    }
    load();
  }, []);

  function validar() {
    const erros = [];

    if (!form.nf_numero) erros.push('Número NF');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Valor');
    if (!form.nf_emitente_nome) erros.push('Emitente');
    if (!form.descricao_servico) erros.push('Descrição');
    if (!form.rubrica_id) erros.push('Rubrica');

    return erros;
  }

  async function handleEnviar(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (sending) return;

    const erros = validar();

    if (erros.length) {
      toast.error(`Preencha: ${erros.join(', ')}`);
      return;
    }

    setSending(true);

    try {
      const response = await base44.functions.invoke('enviarNotaParaAprovacao', {
        intakeId: intake.id,
        form: {
          ...form,
          nf_valor_total: parseValorBR(form.nf_valor_total),
        },
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Erro ao enviar');
      }

      toast.success(
        result.destino === 'equipe'
          ? '✅ Nota enviada para Pagamentos da Equipe'
          : '✅ Solicitação enviada para Aprovação',
        {
          description:
            result.destino === 'equipe'
              ? 'Disponível em Compras → Pagamentos da Equipe'
              : 'Disponível em Compras → Solicitações',
        }
      );

      await onSaved?.();
      onClose?.();

    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!intake?.id) return;

    await base44.entities.DocumentIntake.delete(intake.id);
    toast.success('Documento deletado');
    onSaved?.();
    onClose?.();
  }

  async function handleReprocessar() {
    await base44.entities.DocumentIntake.update(intake.id, {
      status_processamento: 'ANALISANDO_IA',
    });

    toast.success('Reprocessamento iniciado');
    onSaved?.();
    onClose?.();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <FileText className="h-5 w-5" />
            Conferência de Nota Fiscal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          <Input
            placeholder="Número NF"
            value={form.nf_numero}
            onChange={(e) => setForm({ ...form, nf_numero: e.target.value })}
          />

          <Input
            placeholder="Valor"
            value={form.nf_valor_total}
            onChange={(e) => setForm({ ...form, nf_valor_total: e.target.value })}
          />

          <Input
            placeholder="Emitente"
            value={form.nf_emitente_nome}
            onChange={(e) => setForm({ ...form, nf_emitente_nome: e.target.value })}
          />

          <Input
            placeholder="CNPJ / CPF"
            value={form.nf_emitente_cpf_cnpj}
            onChange={(e) => setForm({ ...form, nf_emitente_cpf_cnpj: e.target.value })}
          />

          <Textarea
            placeholder="Descrição"
            value={form.descricao_servico}
            onChange={(e) => setForm({ ...form, descricao_servico: e.target.value })}
          />

          <Select
            value={form.rubrica_id}
            onValueChange={(v) => setForm({ ...form, rubrica_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rubrica" />
            </SelectTrigger>
            <SelectContent>
              {rubricas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.rubrica || r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2 justify-end pt-4 border-t">

            <button onClick={handleDelete} className="bg-red-500 text-white px-3 py-2 rounded">
              <Trash2 className="h-4 w-4 inline mr-1" />
              Deletar
            </button>

            <button onClick={handleReprocessar} className="border px-3 py-2 rounded">
              <RefreshCw className="h-4 w-4 inline mr-1" />
              Reprocessar
            </button>

            <button
              onClick={handleEnviar}
              className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Enviando...' : 'Enviar'}
            </button>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
