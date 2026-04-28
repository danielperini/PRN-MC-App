import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import {
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Send,
  Trash2,
  SplitSquareHorizontal,
  BookOpen,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

function parseValor(v) {
  return Number(String(v || '').replace(',', '.')) || 0;
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const ia = intake?.resultado_ia || {};

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || '',
    nf_data_emissao: ia.nf_data_emissao || '',
    nf_emitente_nome: ia.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
    descricao_servico: ia.descricao_servico || '',
    centro_custo: intake?.centro_custo || '',
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

    if (!form.rubrica_id) erros.push('Selecione a rubrica');
    if (!form.nf_numero) erros.push('Número NF obrigatório');
    if (!form.nf_emitente_nome) erros.push('Emitente obrigatório');
    if (!form.nf_data_emissao) erros.push('Data obrigatória');
    if (!parseValor(form.nf_valor_total)) erros.push('Valor inválido');

    return erros;
  }

  async function handleProcessarNota(aprovar = false) {
    const erros = validar();

    if (erros.length) {
      toast({
        title: 'Erro',
        description: erros.join(' | '),
        variant: 'destructive'
      });
      return;
    }

    setSending(true);

    try {
      const valor = parseValor(form.nf_valor_total);

      const purchase = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: valor,
        centro_custo: form.centro_custo,
        rubrica_id: form.rubrica_id,
        status: 'SOLICITADO',
        observacoes: `NF ${form.nf_numero}`,
      });

      if (aprovar) {
        await base44.functions.invoke('purchaseActions', {
          action: 'aprovar',
          purchaseId: purchase.id
        });
      }

      await base44.entities.DocumentIntake.update(intake.id, {
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
        status_processamento: aprovar ? 'APROVADO' : 'ENVIADO_APROVACAO'
      });

      toast({
        title: aprovar
          ? '✅ Nota aprovada e pagamento gerado'
          : 'Enviado para aprovação'
      });

      onSaved?.();
      onClose?.();

    } catch (e) {
      toast({
        title: 'Erro',
        description: e.message,
        variant: 'destructive'
      });
    }

    setSending(false);
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
            value={form.centro_custo}
            onValueChange={v => setForm(f => ({ ...f, centro_custo: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Centro de custo" />
            </SelectTrigger>
            <SelectContent>
              {CENTROS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

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

            <Button
              onClick={() => handleProcessarNota(true)}
              disabled={sending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <CheckCircle2 className="w-4 h-4 mr-2" />
              }
              Aprovar
            </Button>

            <Button
              onClick={() => handleProcessarNota(false)}
              disabled={sending}
            >
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Send className="w-4 h-4 mr-2" />
              }
              Enviar
            </Button>
          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
