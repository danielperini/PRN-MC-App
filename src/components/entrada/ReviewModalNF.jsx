import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

function parseValorBR(value) {
  const clean = String(value || '')
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(clean) || 0;
}

function normalizeDate(value) {
  if (!value) return '';

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return raw;
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const ia = intake?.resultado_ia || {};

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || '',
    nf_data_emissao: normalizeDate(
      ia.nf_data_emissao ||
      ia.data_emissao ||
      ia.dataEmissao ||
      ia.emissao ||
      ''
    ),
    nf_emitente_nome: ia.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
    descricao_servico: ia.descricao_servico || '',
    centro_custo: ia.centro_custo_sugerido || intake?.centro_custo || '',
    rubrica_id: intake?.rubrica_id_sugerida || '',
  });

  useEffect(() => {
    async function loadRubricas() {
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch (e) {
        console.error('Erro ao carregar rubricas:', e);
      }
    }

    loadRubricas();
  }, []);

  function validar() {
    const erros = [];

    if (!form.nf_numero) erros.push('Informe o número da NF.');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Informe o valor da NF.');
    if (!form.nf_data_emissao) erros.push('Informe a data de emissão.');
    if (!form.nf_emitente_nome) erros.push('Informe o emitente.');
    if (!form.descricao_servico) erros.push('Informe a descrição do serviço.');
    if (!form.centro_custo) erros.push('Selecione o centro de custo.');
    if (!form.rubrica_id) erros.push('Selecione a rubrica.');

    return erros;
  }

  function getRubricaNome(rubricaId) {
    const r = rubricas.find((item) => item.id === rubricaId);
    return r?.rubrica || r?.nome || r?.descricao || '';
  }

  async function criarPurchaseRequest() {
    const valor = parseValorBR(form.nf_valor_total);
    const rubricaNome = getRubricaNome(form.rubrica_id);

    const purchase = await base44.entities.PurchaseRequest.create({
      descricao_item: form.descricao_servico || form.nf_emitente_nome,
      fornecedor_nome: form.nf_emitente_nome,
      fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
      valor_solicitado: valor,
      centro_custo: form.centro_custo,
      rubrica_id: form.rubrica_id,
      rubrica_nome: rubricaNome,
      categoria: 'Nota Fiscal',
      tipo_gasto: 'Serviço',
      status: 'SOLICITADO',
      observacoes: `NF ${form.nf_numero} - ${form.nf_emitente_nome}`,
      nf_numero: form.nf_numero,
      nf_data_emissao: form.nf_data_emissao,
    });

    await base44.entities.Attachment.create({
      report_id: '',
      file_name: intake?.file_name_final || intake?.file_name_original || `NF ${form.nf_numero}`,
      file_type: intake?.mime_type || 'application/pdf',
      file_url: intake?.arquivo_original_url || '',
      description: 'Entrada Única - Nota Fiscal',
      nf_categoria: 'nota_fiscal',
      nf_numero: form.nf_numero,
      nf_valor_total: valor,
      nf_data_emissao: form.nf_data_emissao,
      nf_emitente_nome: form.nf_emitente_nome,
      nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
      nf_tipo_documento: intake?.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
      nf_nome_original: intake?.file_name_original || '',
      nf_nome_renomeado: intake?.file_name_final || intake?.file_name_original || '',
      nf_status_leitura: 'lido_com_sucesso',
      nf_revisado: true,
      rubrica_id: form.rubrica_id,
      rubrica_nome: rubricaNome,
    });

    await base44.entities.DocumentIntake.update(intake.id, {
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: purchase.id,
      status_processamento: 'ENVIADO_APROVACAO',
      centro_custo: form.centro_custo,
      rubrica_id_sugerida: form.rubrica_id,
      rubrica_nome_sugerida: rubricaNome,
      revisado_pelo_usuario: true,
      resultado_ia: {
        ...ia,
        ...form,
        nf_data_emissao: form.nf_data_emissao,
        nf_valor_total: valor,
      },
    });

    return purchase;
  }

  async function handleProcessarNota(aprovar = false) {
    const erros = validar();

    if (erros.length > 0) {
      toast({
        title: 'Campos obrigatórios pendentes',
        description: erros.join(' | '),
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setSending(true);

    try {
      const purchase = await criarPurchaseRequest();

      if (aprovar) {
        const resp = await base44.functions.invoke('purchaseActions', {
          action: 'aprovar',
          purchaseId: purchase.id,
        });

        await base44.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'APROVADO',
          team_payment_id: resp?.team_payment_id || null,
        });
      }

      toast({
        title: aprovar
          ? '✅ Nota aprovada com sucesso.'
          : '✅ Nota enviada para aprovação.',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Erro ao processar nota:', e);

      toast({
        title: 'Erro ao processar nota',
        description: e?.message || 'Falha ao aprovar/enviar nota.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  }

  const rubricasOrdenadas = [...rubricas].sort((a, b) => {
    const nomeA = String(a.rubrica || a.nome || a.descricao || '');
    const nomeB = String(b.rubrica || b.nome || b.descricao || '');
    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Número da NF"
            value={form.nf_numero}
            onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))}
          />

          <Input
            placeholder="Valor Total"
            value={form.nf_valor_total}
            onChange={(e) => setForm((f) => ({ ...f, nf_valor_total: e.target.value }))}
          />

          <Input
            type="date"
            value={form.nf_data_emissao}
            onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))}
          />

          <Input
            placeholder="Fornecedor / Emitente"
            value={form.nf_emitente_nome}
            onChange={(e) => setForm((f) => ({ ...f, nf_emitente_nome: e.target.value }))}
          />

          <Textarea
            placeholder="Descrição do Serviço / Item"
            value={form.descricao_servico}
            onChange={(e) => setForm((f) => ({ ...f, descricao_servico: e.target.value }))}
          />

          <Select
            value={form.centro_custo}
            onValueChange={(v) => setForm((f) => ({ ...f, centro_custo: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Centro de Custo" />
            </SelectTrigger>
            <SelectContent>
              {CENTROS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={form.rubrica_id}
            onValueChange={(v) => setForm((f) => ({ ...f, rubrica_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rubrica Orçamentária" />
            </SelectTrigger>
            <SelectContent>
              {rubricasOrdenadas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {(r.grupo ? `${r.grupo} — ` : '')}
                  {r.rubrica || r.nome || r.descricao || 'Rubrica sem nome'}
                  {r.centro_custo ? ` — ${r.centro_custo}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={() => handleProcessarNota(true)}
              disabled={sending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Aprovar
            </Button>

            <Button
              type="button"
              onClick={() => handleProcessarNota(false)}
              disabled={sending}
            >
              {sending ? (
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
