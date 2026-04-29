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

/* ===================== CONFIG ===================== */

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MUSEUS_RATEIO = ['MIS', 'MHAB', 'MUMO'];
const TIPOS_GASTO = ['Serviço', 'Produto', 'Material', 'Equipamento', 'Equipe', 'Outro'];

/* ===================== HELPERS ===================== */

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

function formatValorBR(value) {
  const number = parseValorBR(value);
  if (!number) return '';
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function isPagamentoEquipe(form) {
  return String(form?.tipo_gasto || '').toLowerCase() === 'equipe';
}

/* ===================== COMPONENT ===================== */

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    nf_numero: '',
    nf_valor_total: '',
    nf_emitente_nome: '',
    descricao_servico: '',
    tipo_gasto: 'Serviço',
    rubrica_id: '',
    centro_custo: 'Atuação Geral',
  });

  /* ===================== LOAD ===================== */

  useEffect(() => {
    async function load() {
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch {}
    }
    load();
  }, []);

  /* ===================== VALIDAR ===================== */

  function validarEnvio() {
    const erros = [];

    if (!form.nf_numero) erros.push('NF');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Valor');
    if (!form.nf_emitente_nome) erros.push('Emitente');
    if (!form.descricao_servico) erros.push('Descrição');
    if (!form.rubrica_id) erros.push('Rubrica');

    return erros;
  }

  function getRubricaNome(id) {
    return rubricas.find((r) => r.id === id)?.rubrica || '';
  }

  /* ===================== ENVIAR ===================== */

  async function handleEnviar(e) {
    e?.preventDefault?.();
    if (sending) return;

    const erros = validarEnvio();

    if (erros.length) {
      toast({
        title: 'Campos obrigatórios',
        description: erros.join(', '),
        variant: 'destructive',
      });
      return;
    }

    setSending(true);

    try {
      const valor = parseValorBR(form.nf_valor_total);
      const equipe = isPagamentoEquipe(form);

      toast({ title: 'Enviando...' });

      const payload = {
        intakeId: intake.id,
        form: {
          ...form,
          valor,
          tipo_pagamento: equipe ? 'equipe' : 'compra',
          rubrica_nome: getRubricaNome(form.rubrica_id),
        },
      };

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout backend')), 12000)
      );

      const response = await Promise.race([
        base44.functions.invoke('enviarNotaParaAprovacao', payload),
        timeout,
      ]);

      const result = response?.data || response;

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Erro');
      }

      toast({
        title: '✅ Enviado com sucesso',
        description: equipe ? 'Pagamento de equipe' : 'Solicitação criada',
      });

      await onSaved?.();
      onClose?.();

    } catch (err) {
      console.error(err);

      toast({
        title: 'Erro ao enviar',
        description: err.message,
        variant: 'destructive',
      });

    } finally {
      setSending(false);
    }
  }

  /* ===================== UI ===================== */

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conferência NF</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">

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

          <Textarea
            placeholder="Descrição"
            value={form.descricao_servico}
            onChange={(e) => setForm({ ...form, descricao_servico: e.target.value })}
          />

          <Select
            value={form.tipo_gasto}
            onValueChange={(v) => setForm({ ...form, tipo_gasto: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_GASTO.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

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
                  {r.rubrica}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2">

            <button onClick={onClose} className="border px-3 py-1">
              Cancelar
            </button>

            <button
              onClick={handleEnviar}
              disabled={sending}
              className="bg-black text-white px-3 py-1 flex items-center gap-2"
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
