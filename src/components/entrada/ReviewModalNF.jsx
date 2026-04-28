// 🔴 FULL ENTERPRISE RESTAURADO
// BASE: ZIP ANTIGO COMPLETO
// AJUSTES:
// ✔ data automática robusta
// ✔ rubricas sem filtro
// ✔ nenhum campo removido

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
  RefreshCw,
  LinkIcon
} from 'lucide-react';
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

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

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
    municipio: ia?.municipio || '',
    competencia: ia?.competencia || '',
    centro_custo: intake?.centro_custo || '',
    rubrica_id: intake?.rubrica_id_sugerida || '',
  });

  const [rateio, setRateio] = useState([
    { museu: 'MHAB', valor: '' },
    { museu: 'MIS', valor: '' },
    { museu: 'MUMO', valor: '' }
  ]);

  useEffect(() => {
    async function loadRubricas() {
      const list = await base44.entities.Rubrica.list('', 2000);
      setRubricas(list || []);
    }
    loadRubricas();
  }, []);

  function parseValor(v) {
    return Number(String(v).replace(',', '.')) || 0;
  }

  async function handleSalvar() {
    setLoading(true);

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
        observacoes: `NF ${form.nf_numero}`
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
        status_processamento: 'ENVIADO_APROVACAO'
      });

      toast({ title: 'Enviado para aprovação' });

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
      <DialogContent className="max-w-3xl">

        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Número NF</Label>
              <Input value={form.nf_numero} onChange={e => setForm(f => ({ ...f, nf_numero: e.target.value }))} />
            </div>

            <div>
              <Label>Valor</Label>
              <Input value={form.nf_valor_total} onChange={e => setForm(f => ({ ...f, nf_valor_total: e.target.value }))} />
            </div>

            <div>
              <Label>Data Emissão</Label>
              <Input type="date" value={form.nf_data_emissao} onChange={e => setForm(f => ({ ...f, nf_data_emissao: e.target.value }))} />
            </div>

            <div>
              <Label>Competência</Label>
              <Input value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Emitente</Label>
            <Input value={form.nf_emitente_nome} onChange={e => setForm(f => ({ ...f, nf_emitente_nome: e.target.value }))} />
          </div>

          <div>
            <Label>CNPJ</Label>
            <Input value={form.nf_emitente_cpf_cnpj} onChange={e => setForm(f => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))} />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao_servico} onChange={e => setForm(f => ({ ...f, descricao_servico: e.target.value }))} />
          </div>

          <div>
            <Label>Centro de custo</Label>
            <Select value={form.centro_custo} onValueChange={v => setForm(f => ({ ...f, centro_custo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CENTROS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Rubrica</Label>
            <Select value={form.rubrica_id} onValueChange={v => setForm(f => ({ ...f, rubrica_id: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {rubricasOrdenadas.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.grupo ? `${r.grupo} — ` : ''}{r.rubrica}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border p-3 rounded">
            <div className="flex items-center gap-2 mb-2">
              <SplitSquareHorizontal className="w-4 h-4" />
              <span className="text-sm">Rateio por museu</span>
            </div>

            {rateio.map((r, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="w-16">{r.museu}</span>
                <Input
                  type="number"
                  value={r.valor}
                  onChange={e => {
                    const v = e.target.value;
                    setRateio(prev => prev.map((x, idx) =>
                      idx === i ? { ...x, valor: v } : x
                    ));
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button
              onClick={handleSalvar}
              disabled={loading || !form.rubrica_id}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
