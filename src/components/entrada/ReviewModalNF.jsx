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

const TIPOS_GASTO = ['Serviço', 'Produto', 'Material', 'Equipamento', 'Equipe', 'Outro'];
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function parseValorBR(value) {
  return Number(
    String(value || '')
      .replace('R$', '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  ) || 0;
}

function isEquipe(form) {
  return String(form?.tipo_gasto || '').toLowerCase() === 'equipe';
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    ...intake,
    tipo_rateio: intake?.tipo_rateio || 'geral',
    museus_rateio: intake?.museus_rateio || [],
  });

  useEffect(() => {
    async function load() {
      const list = await base44.entities.Rubrica.list('', 2000);
      setRubricas(list || []);
    }
    load();
  }, []);

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

  function toggleMuseu(m) {
    const atual = form.museus_rateio || [];
    if (atual.includes(m)) {
      setForm({ ...form, museus_rateio: atual.filter(x => x !== m) });
    } else {
      setForm({ ...form, museus_rateio: [...atual, m] });
    }
  }

  /* ======================= FIX REAL ======================= */

  async function handleEnviar(e) {
    e?.preventDefault?.();

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
      const equipe = isEquipe(form);

      const payload = {
        intakeId: intake.id,
        form: {
          ...form,
          valor,
          valor_total: valor,
          nf_valor_total: valor,
          tipo_pagamento: equipe ? 'equipe' : 'compra',
          rubrica_nome: getRubricaNome(form.rubrica_id),
        },
      };

      toast({ title: 'Enviando...' });

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
        description: equipe
          ? 'Pagamento enviado para equipe'
          : 'Solicitação enviada',
      });

      await onSaved?.();
      onClose?.();

    } catch (err) {
      toast({
        title: 'Erro ao enviar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  /* ======================= UI ORIGINAL ======================= */

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          <div className="bg-blue-50 p-3 rounded text-sm">
            Documento analisado pela IA. Campos preenchidos automaticamente.
          </div>

          <Input value={form.nome_padronizado_arquivo || ''} />

          <Input value={form.nf_numero || ''} onChange={e => setForm({...form, nf_numero: e.target.value})} />

          <Input value={form.nf_valor_total || ''} onChange={e => setForm({...form, nf_valor_total: e.target.value})} />

          <Input value={form.nf_data_emissao || ''} />

          <Input value={form.nf_competencia || ''} />

          <Input value={form.nf_emitente_nome || ''} onChange={e => setForm({...form, nf_emitente_nome: e.target.value})} />

          <Input value={form.nf_emitente_cpf_cnpj || ''} />

          <Input value={form.municipio || ''} />

          <Textarea value={form.descricao_servico || ''} onChange={e => setForm({...form, descricao_servico: e.target.value})} />

          <Select value={form.tipo_gasto || ''} onValueChange={v => setForm({...form, tipo_gasto: v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_GASTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={form.rubrica_id || ''} onValueChange={v => setForm({...form, rubrica_id: v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {rubricas.map(r => <SelectItem key={r.id} value={r.id}>{r.rubrica}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="border p-3 rounded space-y-2">
            <div>Rateamento da Rubrica</div>

            <label>
              <input type="radio"
                checked={form.tipo_rateio === 'geral'}
                onChange={() => setForm({...form, tipo_rateio: 'geral'})}
              />
              Pago pela verba geral
            </label>

            <label>
              <input type="radio"
                checked={form.tipo_rateio === 'dividido'}
                onChange={() => setForm({...form, tipo_rateio: 'dividido'})}
              />
              Dividir entre museus
            </label>

            {form.tipo_rateio === 'dividido' && (
              <div className="flex gap-3">
                {MUSEUS.map(m => (
                  <label key={m}>
                    <input
                      type="checkbox"
                      checked={form.museus_rateio?.includes(m)}
                      onChange={() => toggleMuseu(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="bg-amber-50 p-3 text-sm rounded">
            Ao enviar, a nota irá para Solicitações ou Pagamentos da Equipe conforme o tipo identificado.
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">

            <button onClick={onClose}>Cancelar</button>

            <button>Deletar</button>

            <button>Reprocessar</button>

            <button>Salvar Rascunho</button>

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
