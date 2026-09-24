import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Send } from 'lucide-react';
import { METAS_PROJETO_FALLBACK as METAS_PROJETO } from '@/lib/metasProjeto';

const centros = ['MHAB', 'MIS', 'MUMO', 'Atuacao Geral', 'Geral', 'Noturno nos Museus 2026', 'Noturno Pampulha', 'Terceiro Simpósio do Patrimônio de BH', 'Publicacoes'];
const nrm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = v => { const s = String(v || '0').replace(/\s/g, ''); return /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) || 0 : Number(s.replace(',', '.')) || 0; };
const clean = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

function parseName(name) {
  const base = String(name || '').replace(/\.(pdf|xml)$/i, '').trim();
  const match = base.match(/^\s*\d{2}\s+NF\s+([^\s]+)\s+(.+?)\s+-\s+(.+?)\s+-\s+MUSEUS\s+CENTRO\s+-\s+R?\$?\s*([\d.]+,\d{2}|\d+(?:,\d{2})?)\s*$/i);
  return match ? { nf_numero: match[1], descricao_servico: clean(match[2]), nf_emitente_nome: clean(match[3]), nf_valor_total: match[4] } : {};
}

function guessMeta(text) {
  const value = nrm(text);
  if (value.includes('simposio')) return 'META 24';
  if (value.includes('noturno')) return 'MC3A-10';
  if (value.includes('publica') || value.includes('impress')) return 'MC3A-11';
  if (value.includes('aliment') || value.includes('lanche') || value.includes('material')) return 'MC3A-12';
  if (value.includes('consult')) return 'MC3A-13';
  if (['transporte', 'contador', 'energia', 'jurid'].some(token => value.includes(token))) return 'MC3A-CUSTOS-GERAIS';
  if (value.includes('educador')) return 'MC3A-07';
  if (value.includes('mostra') || value.includes('expos')) return 'MC3A-09';
  if (['comunic', 'designer', 'fotografo'].some(token => value.includes(token))) return 'MC3A-02';
  return 'MC3A-01';
}

function bestRubrica(list, text) {
  const tokens = nrm(text).split(' ').filter(token => token.length > 3);
  let best = null, bestScore = 0;
  for (const rubrica of list || []) {
    const name = nrm([rubrica.grupo, rubrica.rubrica, rubrica.nome, rubrica.descricao].filter(Boolean).join(' '));
    let score = tokens.reduce((sum, token) => sum + (name.includes(token) ? 2 : 0), 0);
    if (nrm(text).includes('analista administrativo financeiro') && name.includes('analista') && name.includes('financeira')) score += 80;
    if (score > bestScore) { best = rubrica; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

export default function ReviewModalNFStable({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const ia = intake?.resultado_ia || {};
  const parsed = parseName(intake?.file_name_final || intake?.file_name_original);
  const [rubricas, setRubricas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => {
    const text = [intake?.file_name_final, intake?.file_name_original, ia.descricao_servico, ia.rubrica_nome_sugerida].join(' ');
    return {
      nf_numero: ia.nf_numero || parsed.nf_numero || '',
      nf_valor_total: ia.nf_valor_total || parsed.nf_valor_total || '',
      nf_emitente_nome: ia.nf_emitente_nome || parsed.nf_emitente_nome || '',
      nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
      descricao_servico: ia.descricao_servico || parsed.descricao_servico || '',
      centro_custo: ia.centro_custo_sugerido || intake?.centro_custo || 'Atuacao Geral',
      rubrica_id: intake?.rubrica_id_sugerida || ia.rubrica_id || '',
      meta_id: ia.meta_sugerida || ia.meta_id || guessMeta(text),
      tipo_gasto: ia.tipo_gasto || 'Serviço',
    };
  });
  useEffect(() => {
    base44.entities.Rubrica.list('', 2000).then(list => {
      const active = (Array.isArray(list) ? list : []).filter(r => r?.ativo !== false);
      setRubricas(active);
      const text = [form.descricao_servico, intake?.file_name_final, intake?.file_name_original, ia.rubrica_nome_sugerida].join(' ');
      const suggested = bestRubrica(active, text);
      if (suggested) setForm(previous => ({ ...previous, rubrica_id: previous.rubrica_id || suggested.id }));
    }).catch(() => {});
  }, []);
  const fileName = useMemo(() => `01 NF ${clean(form.nf_numero) || 'SEM NUM'} ${clean(form.descricao_servico) || 'NOTA FISCAL'} - ${clean(form.nf_emitente_nome) || 'FORNECEDOR'} - MUSEUS CENTRO - ${num(form.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.pdf`, [form]);
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const isSimposio = form.centro_custo === 'Terceiro Simpósio do Patrimônio de BH';
  const selectableRubricas = isSimposio ? rubricas.filter(r => r.centro_custo === form.centro_custo) : rubricas;

  async function enviar() {
    if (busy) return;
    const valor = num(form.nf_valor_total);
    const rubrica = rubricas.find(r => r.id === form.rubrica_id);
    if (!rubrica || (isSimposio && rubrica.centro_custo !== form.centro_custo)) return toast({ title: 'Selecione uma rubrica válida', variant: 'destructive' });
    if (!valor) return toast({ title: 'Valor inválido', variant: 'destructive' });
    setBusy(true);
    try {
      const rubricaNome = rubrica.rubrica || rubrica.nome || rubrica.descricao || '';
      const request = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico || `NF ${form.nf_numero}`,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: valor, valor_total: valor, nf_valor_total: valor,
        rubrica_id: form.rubrica_id, rubrica_nome: rubricaNome, budgetline_id: form.rubrica_id,
        centro_custo: form.centro_custo, status: 'SOLICITADO', meta_id: form.meta_id,
        categoria: 'Nota Fiscal', tipo_gasto: form.tipo_gasto, nf_numero: form.nf_numero,
        observacoes: `Origem: EntradaUnica | intake_id: ${intake.id}`,
      });
      const attachment = await base44.entities.Attachment.create({
        purchase_request_id: request.id, file_name: fileName,
        file_type: intake?.mime_type || 'application/pdf', file_url: intake?.arquivo_original_url || '',
        description: 'Entrada Unica - Nota Fiscal', nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero, nf_valor_total: valor,
        nf_emitente_nome: form.nf_emitente_nome, nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: 'pdf_nf', nf_nome_original: intake?.file_name_original || '',
        nf_nome_renomeado: fileName, nf_revisado: true,
        rubrica_id: form.rubrica_id, rubrica_nome: rubricaNome,
      });
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO', ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest', entidade_destino_id: request.id,
        attachment_id: attachment?.id || '', centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id, rubrica_nome_sugerida: rubricaNome,
        file_name_final: fileName, revisado_pelo_usuario: true,
        resultado_ia: { ...ia, ...form, purchase_request_id: request.id, attachment_id: attachment?.id || '', file_name_final: fileName },
      });
      toast({ title: 'Enviado para aprovação', description: 'Solicitação criada em Compras.' });
      await onSaved?.();
      onClose?.();
    } catch (error) {
      toast({ title: 'Erro ao enviar', description: error?.message || 'Falha ao criar solicitação', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Conferência de Nota Fiscal</DialogTitle><DialogDescription>Revise os dados extraídos da nota fiscal antes de enviá-la para aprovação.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <Input value={fileName} readOnly />
      <div className="grid grid-cols-2 gap-3"><div><Label>Número NF</Label><Input value={form.nf_numero} onChange={e => set('nf_numero', e.target.value)} /></div><div><Label>Valor</Label><Input value={form.nf_valor_total} onChange={e => set('nf_valor_total', e.target.value)} /></div></div>
      <div><Label>Fornecedor</Label><Input value={form.nf_emitente_nome} onChange={e => set('nf_emitente_nome', e.target.value)} /></div>
      <div><Label>Descrição</Label><Textarea value={form.descricao_servico} onChange={e => set('descricao_servico', e.target.value)} /></div>
      <div><Label>Meta</Label><Select value={form.meta_id} onValueChange={value => set('meta_id', value)}><SelectTrigger><SelectValue placeholder="Selecionar meta" /></SelectTrigger><SelectContent>{METAS_PROJETO.map(meta => <SelectItem key={meta.id} value={meta.id}>{meta.label}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Centro</Label><Select value={form.centro_custo} onValueChange={value => { setForm(previous => ({ ...previous, centro_custo: value, rubrica_id: '' })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{centros.map(centro => <SelectItem key={centro} value={centro}>{centro}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Rubrica</Label><Select value={form.rubrica_id} onValueChange={value => set('rubrica_id', value)}><SelectTrigger><SelectValue placeholder="Selecionar rubrica" /></SelectTrigger><SelectContent>{selectableRubricas.map(r => <SelectItem key={r.id} value={r.id}>{r.grupo ? `${r.grupo} - ` : ''}{r.rubrica || r.nome || r.descricao || 'Rubrica'}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={enviar} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}Enviar para aprovação</Button></div>
    </div>
  </DialogContent></Dialog>;
}
