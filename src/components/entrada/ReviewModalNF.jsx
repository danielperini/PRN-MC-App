import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import {
  CheckCircle2,
  Loader2,
  Send,
  Trash2,
  RefreshCw,
  Save,
  Link as LinkIcon,
  FileText,
  Zap,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

/* ================= HELPERS ================= */

function parseValorBR(value) {
  const original = String(value || '').trim();

  if (/^\d{5,}$/.test(original)) return Number(original) / 100;

  const clean = original
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(clean) || 0;
}

function isPagamentoEquipe(form, intake) {
  return (
    String(form?.tipo_gasto || '').toLowerCase() === 'equipe' ||
    String(form?.tipo_pagamento || '').toLowerCase() === 'equipe'
  );
}

/* ================= COMPONENT ================= */

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);
  const [form, setForm] = useState(intake || {});

  /* ================= LOAD ================= */

  useEffect(() => {
    async function load() {
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  /* ================= VALIDAR ================= */

  function validarEnvio() {
    const erros = [];

    if (!form.nf_numero) erros.push('Número NF');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Valor');
    if (!form.nf_emitente_nome) erros.push('Emitente');
    if (!form.descricao_servico) erros.push('Descrição');
    if (!form.rubrica_id) erros.push('Rubrica');

    return erros;
  }

  function getRubricaNome(id) {
    return rubricas.find((r) => r.id === id)?.rubrica || '';
  }

  /* ================= FIX PRINCIPAL ================= */

  async function handleEnviar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    const erros = validarEnvio();

    if (erros.length) {
      toast({
        title: 'Preencha campos obrigatórios',
        description: erros.join(', '),
        variant: 'destructive',
      });
      return;
    }

    setSending(true);

    try {
      const valor = parseValorBR(form.nf_valor_total);
      const destinoEquipe = isPagamentoEquipe(form, intake);

      const payload = {
        intakeId: intake.id,
        form: {
          ...form,
          nf_valor_total: valor,
          valor,
          valor_total: valor,
          tipo_pagamento: destinoEquipe ? 'equipe' : 'compra',
          rubrica_nome: getRubricaNome(form.rubrica_id),
        },
      };

      toast({ title: 'Enviando...', duration: 2000 });

      // 🔴 FIX: TIMEOUT + GARANTIA DE RESPOSTA
      const response = await Promise.race([
        base44.functions.invoke('enviarNotaParaAprovacao', payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao enviar')), 12000)
        ),
      ]);

      const result = response?.data || response;

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Erro ao enviar');
      }

      toast({
        title: '✅ Enviado com sucesso',
        description: destinoEquipe
          ? 'Pagamento enviado para equipe'
          : 'Solicitação enviada',
      });

      await onSaved?.();
      onClose?.();

    } catch (err) {
      console.error('ERRO ENVIO:', err);

      toast({
        title: 'Erro ao enviar',
        description: err.message,
        variant: 'destructive',
      });

    } finally {
      setSending(false); // 🔴 garante destravar botão
    }
  }

  /* ================= UI ORIGINAL ================= */

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          <Input
            placeholder="Número NF"
            value={form.nf_numero || ''}
            onChange={(e) => setForm({ ...form, nf_numero: e.target.value })}
          />

          <Input
            placeholder="Valor"
            value={form.nf_valor_total || ''}
            onChange={(e) => setForm({ ...form, nf_valor_total: e.target.value })}
          />

          <Input
            placeholder="Emitente"
            value={form.nf_emitente_nome || ''}
            onChange={(e) => setForm({ ...form, nf_emitente_nome: e.target.value })}
          />

          <Textarea
            placeholder="Descrição"
            value={form.descricao_servico || ''}
            onChange={(e) => setForm({ ...form, descricao_servico: e.target.value })}
          />

          <Select
            value={form.rubrica_id || ''}
            onValueChange={(v) => setForm({ ...form, rubrica_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rubrica" />
            </SelectTrigger>
            <SelectContent>
              {rubricas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.rubrica}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button onClick={onClose}>Cancelar</button>

            <button
              onClick={handleEnviar}
              disabled={sending}
              className="bg-black text-white px-4 py-2 flex items-center gap-2"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
