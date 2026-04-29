import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    nf_numero: '',
    nf_valor_total: '',
    nf_emitente_nome: '',
    rubrica_id: '',
    rubrica_nome: '',
    tipo_pagamento: '',
    tipo_gasto: '',
    descricao_servico: '',
    centro_custo: ''
  });

  useEffect(() => {
    if (!intake) return;

    setForm((f) => ({
      ...f,
      nf_numero: intake?.nf_numero || '',
      nf_valor_total: intake?.nf_valor_total || '',
      nf_emitente_nome: intake?.nf_emitente_nome || '',
      rubrica_id: intake?.rubrica_id || '',
      rubrica_nome: intake?.rubrica_nome || '',
      tipo_pagamento: intake?.tipo_pagamento || '',
      tipo_gasto: intake?.tipo_gasto || '',
      descricao_servico: intake?.descricao_servico || '',
      centro_custo: intake?.centro_custo || ''
    }));
  }, [intake]);

  function parseValor(v) {
    if (!v) return 0;

    const clean = String(v)
      .replace('R$', '')
      .replace(/\./g, '')
      .replace(',', '.');

    return Number(clean) || 0;
  }

  function isEquipe() {
    return (
      form.tipo_pagamento === 'equipe' ||
      String(form.tipo_gasto).toLowerCase() === 'equipe'
    );
  }

  async function handleEnviar() {
    if (sending) return;

    console.log('🚀 CLICK ENVIAR NF');

    setSending(true);

    try {
      const valor = parseValor(form.nf_valor_total);

      toast({
        title: 'Enviando...',
        description: 'Aguarde',
      });

      const response = await base44.functions.invoke(
        'enviarNotaParaAprovacao',
        {
          intakeId: intake.id,
          form: {
            ...form,
            nf_valor_total: valor,
            valor,
            valor_total: valor,
            tipo_pagamento: isEquipe() ? 'equipe' : 'compra'
          }
        }
      );

      console.log('📥 RESPONSE enviarNotaParaAprovacao:', response);

      const result = response?.data || response;

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Erro ao enviar');
      }

      toast({
        title: '✅ Enviado com sucesso',
        description: isEquipe()
          ? 'Pagamento enviado para equipe'
          : 'Solicitação enviada',
      });

      await onSaved?.();
      onClose?.();

    } catch (e) {
      console.error(e);

      toast({
        title: 'Erro ao enviar',
        description: e.message,
        variant: 'destructive'
      });

    } finally {
      setSending(false);
    }
  }

  return (
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
        placeholder="Descrição"
        value={form.descricao_servico}
        onChange={(e) => setForm({ ...form, descricao_servico: e.target.value })}
      />

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>

        <Button onClick={handleEnviar} disabled={sending}>
          {sending ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
