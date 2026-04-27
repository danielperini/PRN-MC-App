import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [rubricas, setRubricas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const ia = intake.resultado_ia || {};

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || '',
    nf_data_emissao: ia.nf_data_emissao || '',
    nf_emitente_nome: ia.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
    nf_destinatario_nome: ia.nf_destinatario_nome || '',
    descricao_servico: ia.descricao_servico || '',
    municipio: ia.municipio || '',
    competencia: ia.competencia || '',
    centro_custo: intake.centro_custo || '',
    rubrica_id: intake.rubrica_id_sugerida || '',
    file_name_final: intake.file_name_final || intake.file_name_original,
  });

  useEffect(() => {
    async function loadRubricas() {
      try {
        const list = await base44.entities.Rubrica.list('', 200);
        setRubricas((list || []).filter(r => r.ativo !== false));
      } catch (e) {
        console.error(e);
      }
    }
    loadRubricas();
  }, []);

  const rubricaSelecionada = rubricas.find(r => r.id === form.rubrica_id);

  async function handleSalvarRascunho() {
    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'RASCUNHO',
        resultado_ia: { ...ia, ...form },
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        revisado_pelo_usuario: true,
      });
      toast({ title: 'Rascunho salvo com sucesso.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao salvar rascunho', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleEnviarAprovacao() {
    if (!form.rubrica_id) {
      toast({ title: 'Selecione uma rubrica antes de enviar.', variant: 'destructive' });
      return;
    }
    if (!form.centro_custo) {
      toast({ title: 'Selecione o centro de custo antes de enviar.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      // Cria o PurchaseRequest reutilizando entidade existente
      const pr = await base44.entities.PurchaseRequest.create({
        descricao: form.descricao_servico || form.nf_emitente_nome,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        valor_total: parseFloat(form.nf_valor_total) || 0,
        data_emissao: form.nf_data_emissao,
        numero_nf: form.nf_numero,
        centro_custo: form.centro_custo,
        rubrica_id: form.rubrica_id,
        municipio: form.municipio,
        competencia: form.competencia,
        status: 'PENDENTE',
        observacoes: `Criado via Entrada Única de Documentos. Arquivo: ${form.file_name_final}`,
      });

      // Vincula o attachment ao PurchaseRequest
      await base44.entities.Attachment.create({
        report_id: '',
        file_name: form.file_name_final,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: `NF ${form.nf_numero} - ${form.nf_emitente_nome}`,
        nf_numero: form.nf_numero,
        nf_valor_total: parseFloat(form.nf_valor_total) || 0,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
        nf_nome_original: intake.file_name_original,
        nf_nome_renomeado: form.file_name_final,
        nf_status_leitura: 'lido_com_sucesso',
        nf_revisado: true,
      });

      // Atualiza o intake
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: pr.id,
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        resultado_ia: { ...ia, ...form },
        revisado_pelo_usuario: true,
      });

      toast({
        title: 'Documento salvo e disponível em Compras.',
        description: 'Revise os dados na área de Compras antes de enviar para aprovação.',
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Conferência de Nota Fiscal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status IA */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Documento analisado. Revise as informações antes de enviar.
          </div>

          {/* Inconsistências — remove falsos positivos de "data futura" */}
          {(() => {
            const hoje = new Date();
            const errosFiltrados = (intake.erros_validacao || []).filter(e => {
              const txt = String(e).toLowerCase();
              // Remove qualquer aviso de "data futura" que seja na verdade data passada/presente
              if (txt.includes('futura') || txt.includes('future')) {
                const match = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (match) {
                  const dataDoc = new Date(`${match[3]}-${match[2]}-${match[1]}`);
                  if (dataDoc <= hoje) return false; // é passada/presente — falso positivo
                }
                // Sem data identificável — mantém por precaução
              }
              return true;
            });
            return errosFiltrados.length > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
                <p className="font-medium flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Inconsistências detectadas:</p>
                {errosFiltrados.map((e, i) => <p key={i}>• {e}</p>)}
              </div>
            ) : null;
          })()}

          {/* Nome do arquivo */}
          <div className="space-y-1">
            <Label>Nome padronizado do arquivo</Label>
            <Input value={form.file_name_final} onChange={e => setForm(f => ({ ...f, file_name_final: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Número da NF</Label>
              <Input value={form.nf_numero} onChange={e => setForm(f => ({ ...f, nf_numero: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Valor Total (R$)</Label>
              <Input value={form.nf_valor_total} onChange={e => setForm(f => ({ ...f, nf_valor_total: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data de Emissão</Label>
              <Input type="date" value={form.nf_data_emissao} onChange={e => setForm(f => ({ ...f, nf_data_emissao: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Competência</Label>
              <Input value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} placeholder="Ex: Março/2026" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Fornecedor / Emitente</Label>
            <Input value={form.nf_emitente_nome} onChange={e => setForm(f => ({ ...f, nf_emitente_nome: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>CNPJ / CPF do Emitente</Label>
              <Input value={form.nf_emitente_cpf_cnpj} onChange={e => setForm(f => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Município</Label>
              <Input value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrição do Serviço / Item</Label>
            <Input value={form.descricao_servico} onChange={e => setForm(f => ({ ...f, descricao_servico: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Centro de Custo */}
            <div className="space-y-1">
              <Label>Centro de Custo <span className="text-red-500">*</span></Label>
              <Select value={form.centro_custo} onValueChange={v => setForm(f => ({ ...f, centro_custo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Rubrica */}
            <div className="space-y-1">
              <Label>Rubrica <span className="text-red-500">*</span></Label>
              <Select value={form.rubrica_id} onValueChange={v => setForm(f => ({ ...f, rubrica_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar rubrica" /></SelectTrigger>
                <SelectContent>
                  {rubricas.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.rubrica || r.nome || r.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {intake.rubrica_justificativa && (
            <p className="text-xs text-slate-500 italic">
              💡 Sugestão IA: {intake.rubrica_justificativa}
            </p>
          )}

          {/* Aviso financeiro */}
          <div className="p-3 bg-slate-50 border rounded-lg text-xs text-slate-500">
            ℹ️ O valor só será abatido da rubrica após aprovação da coordenação, conforme fluxo financeiro existente.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="outline" onClick={handleSalvarRascunho} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Rascunho
            </Button>
            <Button onClick={handleEnviarAprovacao} disabled={sending || !form.rubrica_id || !form.centro_custo}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar para Aprovação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}