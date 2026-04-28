// 🔴 RESTAURADO DO ZIP ANTIGO + AJUSTES:
// - formulário completo
// - data automática robusta
// - rubricas SEM filtro

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// 🔴 DATA NORMALIZADA
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

  const [loading, setLoading] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const ia = intake?.resultado_ia || {};

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
    competencia: ia?.competencia || '',
    centro_custo: intake?.centro_custo || '',
    rubrica_id: intake?.rubrica_id_sugerida || '',
  });

  // 🔴 GARANTE DATA
  useEffect(() => {
    if (!form.nf_data_emissao && ia) {
      setForm(f => ({
        ...f,
        nf_data_emissao: normalizeDate(
          ia.nf_data_emissao ||
          ia.data_emissao ||
          ia.dataEmissao ||
          ia.emissao
        )
      }));
    }
  }, [ia]);

  // 🔴 RUBRICAS COMPLETAS
  useEffect(() => {
    async function loadRubricas() {
      const list = await base44.entities.Rubrica.list('', 2000);
      setRubricas(list || []);
    }
    loadRubricas();
  }, []);

  async function handleEnviar() {
    setLoading(true);

    try {
      await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: Number(form.nf_valor_total || 0),
        rubrica_id: form.rubrica_id,
        centro_custo: form.centro_custo,
        status: 'SOLICITADO',
        observacoes: `NF ${form.nf_numero}`
      });

      toast({
        title: 'Enviado para aprovação',
        duration: 3000
      });

      onSaved();
      onClose();

    } catch (e) {
      toast({
        title: 'Erro ao enviar',
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

          <div>
            <Label>Número da NF</Label>
            <Input
              value={form.nf_numero}
              onChange={(e) => setForm(f => ({ ...f, nf_numero: e.target.value }))}
            />
          </div>

          <div>
            <Label>Valor</Label>
            <Input
              value={form.nf_valor_total}
              onChange={(e) => setForm(f => ({ ...f, nf_valor_total: e.target.value }))}
            />
          </div>

          <div>
            <Label>Data de Emissão</Label>
            <Input
              type="date"
              value={form.nf_data_emissao}
              onChange={(e) => setForm(f => ({ ...f, nf_data_emissao: e.target.value }))}
            />
          </div>

          <div>
            <Label>Emitente</Label>
            <Input
              value={form.nf_emitente_nome}
              onChange={(e) => setForm(f => ({ ...f, nf_emitente_nome: e.target.value }))}
            />
          </div>

          <div>
            <Label>CNPJ / CPF</Label>
            <Input
              value={form.nf_emitente_cpf_cnpj}
              onChange={(e) => setForm(f => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))}
            />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={form.descricao_servico}
              onChange={(e) => setForm(f => ({ ...f, descricao_servico: e.target.value }))}
            />
          </div>

          <div>
            <Label>Competência</Label>
            <Input
              value={form.competencia}
              onChange={(e) => setForm(f => ({ ...f, competencia: e.target.value }))}
            />
          </div>

          <div>
            <Label>Centro de Custo</Label>
            <Input
              value={form.centro_custo}
              onChange={(e) => setForm(f => ({ ...f, centro_custo: e.target.value }))}
            />
          </div>

          <div>
            <Label>Rubrica</Label>
            <Select
              value={form.rubrica_id}
              onValueChange={(v) => setForm(f => ({ ...f, rubrica_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar rubrica" />
              </SelectTrigger>
              <SelectContent>
                {rubricasOrdenadas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.grupo ? `${r.grupo} — ` : ''}
                    {r.rubrica || r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button
              onClick={handleEnviar}
              disabled={loading || !form.rubrica_id}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Enviar
            </Button>
          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
