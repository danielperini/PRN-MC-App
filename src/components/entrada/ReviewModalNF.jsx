// 🔴 FULL ENTERPRISE + VALIDAÇÃO IA + BLOQUEIO INTELIGENTE + TEAM PAYMENT

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function normalizeDate(dateStr) {
  if (!dateStr) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/');
    return `${y}-${m}-${d}`;
  }

  const d = new Date(dateStr);
  if (!isNaN(d)) return d.toISOString().split('T')[0];

  return '';
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const ia = intake?.resultado_ia || {};

  const [loading, setLoading] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    nf_numero: ia?.nf_numero || '',
    nf_valor_total: ia?.nf_valor_total || '',
    nf_data_emissao: normalizeDate(
      ia?.nf_data_emissao ||
      ia?.data_emissao ||
      ia?.dataEmissao ||
      ia?.emissao
    ),
    nf_emitente_nome: ia?.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia?.nf_emitente_cpf_cnpj || '',
    descricao_servico: ia?.descricao_servico || '',
    centro_custo: intake?.centro_custo || '',
    rubrica_id: intake?.rubrica_id_sugerida || '',
  });

  // 🔴 RUBRICAS
  useEffect(() => {
    async function loadRubricas() {
      const list = await base44.entities.Rubrica.list('', 2000);
      setRubricas(list || []);
    }
    loadRubricas();
  }, []);

  // 🔴 VALIDAÇÃO IA + BLOQUEIO
  function validarAntesDeEnviar() {
    const erros = [];

    if (!form.rubrica_id) erros.push('Rubrica obrigatória');
    if (!form.nf_valor_total || Number(form.nf_valor_total) <= 0)
      erros.push('Valor inválido');

    if (!form.nf_emitente_nome)
      erros.push('Emitente não identificado');

    if (!form.nf_data_emissao)
      erros.push('Data de emissão inválida');

    // 🔴 divergência IA (controle inteligente)
    if (ia?.nf_valor_total && Number(ia.nf_valor_total) !== Number(form.nf_valor_total)) {
      erros.push('Valor divergente da leitura da IA');
    }

    return erros;
  }

  async function handleEnviar() {
    const erros = validarAntesDeEnviar();

    if (erros.length > 0) {
      toast({
        title: 'Envio bloqueado',
        description: erros.join(' | '),
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      // 🔥 cria compra
      const purchase = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: Number(form.nf_valor_total),
        centro_custo: form.centro_custo,
        rubrica_id: form.rubrica_id,
        status: 'SOLICITADO',
        observacoes: `NF ${form.nf_numero}`,
      });

      // 🔥 chama backend → cria TeamPayment automaticamente
      await base44.functions.invoke('purchaseActions', {
        action: 'aprovar',
        purchaseId: purchase.id
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
        status_processamento: 'APROVADO'
      });

      toast({
        title: '✅ Nota aprovada e pagamento gerado automaticamente'
      });

      onSaved();
      onClose();

    } catch (e) {
      toast({
        title: 'Erro',
        description: e.message,
        variant: 'destructive'
      });
    }

    setLoading(false);
  }

  const rubricasOrdenadas = [...rubricas].sort((a, b) =>
    String(a.rubrica || '').localeCompare(String(b.rubrica || ''), 'pt-BR')
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">

        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ALERTA IA */}
          {ia?.nf_numero && (
            <div className="flex gap-2 p-2 bg-yellow-50 border text-xs">
              <AlertCircle className="w-4 h-4" />
              Dados sugeridos pela IA — revise antes de enviar
            </div>
          )}

          <Input
            placeholder="Número NF"
            value={form.nf_numero}
            onChange={e => setForm(f => ({ ...f, nf_numero: e.target.value }))}
          />

          <Input
            placeholder="Valor"
            value={form.nf_valor_total}
            onChange={e => setForm(f => ({ ...f, nf_valor_total: e.target.value }))}
          />

          <Input
            type="date"
            value={form.nf_data_emissao}
            onChange={e => setForm(f => ({ ...f, nf_data_emissao: e.target.value }))}
          />

          <Input
            placeholder="Emitente"
            value={form.nf_emitente_nome}
            onChange={e => setForm(f => ({ ...f, nf_emitente_nome: e.target.value }))}
          />

          <Textarea
            placeholder="Descrição"
            value={form.descricao_servico}
            onChange={e => setForm(f => ({ ...f, descricao_servico: e.target.value }))}
          />

          <Select
            value={form.rubrica_id}
            onValueChange={v => setForm(f => ({ ...f, rubrica_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rubrica" />
            </SelectTrigger>
            <SelectContent>
              {rubricasOrdenadas.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.grupo ? `${r.grupo} — ` : ''}{r.rubrica}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button onClick={handleEnviar} disabled={loading}>
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Send className="w-4 h-4 mr-2" />
              }
              Aprovar e Gerar Pagamento
            </Button>
          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
