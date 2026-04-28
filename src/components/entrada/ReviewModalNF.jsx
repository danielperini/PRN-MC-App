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
  ShieldCheck,
  Link as LinkIcon,
  FileText,
  Zap,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const TIPOS_GASTO = ['Serviço', 'Produto', 'Material', 'Equipamento', 'Outro'];

function parseValorBR(value) {
  const clean = String(value || '')
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(clean) || 0;
}

function formatValorBR(value) {
  const number = parseValorBR(value);

  if (!number) return '';

  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeDate(value) {
  if (!value) return '';

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return raw;
}

function getValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const ia = intake?.resultado_ia || {};

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);
  const [metas, setMetas] = useState([]);

  const [form, setForm] = useState({
    nome_padronizado_arquivo: getValue(
      intake?.nome_padronizado_arquivo,
      intake?.nome_arquivo_padronizado,
      ia.nome_padronizado_arquivo,
      ia.nome_arquivo_padronizado,
      intake?.file_name,
      intake?.nome_arquivo
    ),

    nf_numero: getValue(ia.nf_numero, ia.numero_nf, intake?.nf_numero),
    nf_valor_total: getValue(
      ia.nf_valor_total,
      ia.valor_total,
      ia.valor,
      intake?.nf_valor_total,
      intake?.valor_total
    ),
    nf_data_emissao: normalizeDate(
      getValue(
        ia.nf_data_emissao,
        ia.data_emissao,
        ia.dataEmissao,
        ia.emissao,
        intake?.nf_data_emissao
      )
    ),
    nf_competencia: getValue(
      ia.nf_competencia,
      ia.competencia,
      intake?.nf_competencia,
      intake?.competencia
    ),

    nf_emitente_nome: getValue(
      ia.nf_emitente_nome,
      ia.emitente_nome,
      ia.emitente,
      intake?.nf_emitente_nome,
      intake?.emitente
    ),
    nf_emitente_cpf_cnpj: getValue(
      ia.nf_emitente_cpf_cnpj,
      ia.cnpj_cpf_emitente,
      ia.cnpj,
      ia.cpf_cnpj,
      intake?.nf_emitente_cpf_cnpj
    ),
    municipio: getValue(
      ia.municipio,
      ia.municipio_emitente,
      intake?.municipio
    ),

    descricao_servico: getValue(
      ia.descricao_servico,
      ia.descricao,
      ia.descricao_item,
      intake?.descricao_servico,
      intake?.descricao
    ),

    meta_id: getValue(
      intake?.meta_id,
      intake?.meta_id_sugerida,
      ia.meta_id,
      ia.meta_id_sugerida
    ),

    tipo_gasto: getValue(
      intake?.tipo_gasto,
      ia.tipo_gasto,
      ia.tipo_gasto_sugerido,
      'Serviço'
    ),

    centro_custo: getValue(
      ia.centro_custo_sugerido,
      ia.centro_custo,
      intake?.centro_custo,
      'Atuação Geral'
    ),

    rubrica_id: getValue(
      intake?.rubrica_id,
      intake?.rubrica_id_sugerida,
      ia.rubrica_id,
      ia.rubrica_id_sugerida
    ),

    tipo_rateio: getValue(
      intake?.tipo_rateio,
      ia.tipo_rateio,
      'geral'
    ),

    xml_vinculado_id: getValue(
      intake?.xml_vinculado_id,
      intake?.xml_id,
      ia.xml_vinculado_id
    ),

    xml_vinculado_nome: getValue(
      intake?.xml_vinculado_nome,
      intake?.xml_file_name,
      ia.xml_vinculado_nome,
      ia.xml_file_name
    ),
  });

  useEffect(() => {
    async function loadData() {
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch (e) {
        console.error('Erro ao carregar rubricas:', e);
      }

      try {
        if (base44.entities.Meta) {
          const metasList = await base44.entities.Meta.list('', 500);
          setMetas(metasList || []);
        }
      } catch (e) {
        console.warn('Metas não carregadas neste contexto:', e);
      }
    }

    loadData();
  }, []);

  function validar() {
    const erros = [];

    if (!form.nf_numero) erros.push('Número NF');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Valor');
    if (!form.nf_data_emissao) erros.push('Data de emissão');
    if (!form.nf_emitente_nome) erros.push('Emitente');
    if (!form.nf_emitente_cpf_cnpj) erros.push('CNPJ/CPF');
    if (!form.descricao_servico) erros.push('Descrição');
    if (!form.tipo_gasto) erros.push('Tipo de gasto');
    if (!form.centro_custo) erros.push('Centro de custo');
    if (!form.rubrica_id) erros.push('Rubrica');

    return erros;
  }

  function getRubricaNome(id) {
    const r = rubricas.find((item) => item.id === id);
    return r?.rubrica || r?.nome || r?.descricao || '';
  }

  function getMetaNome(id) {
    const meta = metas.find((item) => item.id === id);
    return meta?.nome || meta?.titulo || meta?.meta || meta?.descricao || '';
  }

  async function salvarRascunho() {
    if (sending) return;

    setSending(true);

    try {
      const valor = parseValorBR(form.nf_valor_total);
      const rubricaNome = getRubricaNome(form.rubrica_id);

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'RASCUNHO',
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        rubrica_nome_sugerida: rubricaNome,
        revisado_pelo_usuario: true,
        resultado_ia: {
          ...ia,
          ...form,
          nf_valor_total: valor,
        },
      });

      toast({
        title: 'Rascunho salvo',
        duration: 3000,
      });

      await onSaved?.();
    } catch (e) {
      toast({
        title: 'Erro ao salvar rascunho',
        description: e?.message || 'Falha ao salvar.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  }

  async function criarPurchaseRequest() {
    const valor = parseValorBR(form.nf_valor_total);
    const rubricaNome = getRubricaNome(form.rubrica_id);
    const metaNome = getMetaNome(form.meta_id);

    const purchase = await base44.entities.PurchaseRequest.create({
      descricao_item: form.descricao_servico,
      fornecedor_nome: form.nf_emitente_nome,
      fornecedor_cnpj: form.nf_emitente_cpf_cnpj,

      valor_solicitado: valor,
      valor_total: valor,

      centro_custo: form.centro_custo,
      rubrica_id: form.rubrica_id,
      rubrica_nome: rubricaNome,

      meta_id: form.meta_id || null,
      meta_nome: metaNome || null,

      categoria: 'Nota Fiscal',
      tipo_gasto: form.tipo_gasto,
      status: 'SOLICITADO',

      observacoes: `NF ${form.nf_numero} - ${form.nf_emitente_nome}`,

      nf_numero: form.nf_numero,
      nf_data_emissao: form.nf_data_emissao,
      nf_competencia: form.nf_competencia,
      nf_emitente_nome: form.nf_emitente_nome,
      nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
      municipio: form.municipio,

      documento_intake_id: intake.id,
      xml_vinculado_id: form.xml_vinculado_id || null,
      xml_vinculado_nome: form.xml_vinculado_nome || null,
      tipo_rateio: form.tipo_rateio || 'geral',
    });

    await base44.entities.DocumentIntake.update(intake.id, {
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: purchase.id,
      status_processamento: 'ENVIADO_APROVACAO',

      centro_custo: form.centro_custo,
      rubrica_id_sugerida: form.rubrica_id,
      rubrica_nome_sugerida: rubricaNome,

      meta_id: form.meta_id || null,
      meta_nome: metaNome || null,

      revisado_pelo_usuario: true,

      resultado_ia: {
        ...ia,
        ...form,
        nf_valor_total: valor,
      },
    });

    return purchase;
  }

  async function handleAprovar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    const erros = validar();

    if (erros.length) {
      toast({
        title: 'Preencha campos obrigatórios',
        description: erros.join(', '),
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setSending(true);

    try {
      const purchase = await criarPurchaseRequest();

      const response = await base44.functions.invoke('purchaseActions', {
        action: 'aprovar',
        purchaseId: purchase.id,
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao aprovar nota.');
      }

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
        team_payment_id: result?.teamPaymentId || result?.team_payment_id || null,
        revisado_pelo_usuario: true,
      });

      toast({
        title: '✅ Nota aprovada com sucesso',
        description: 'A solicitação foi aprovada e enviada ao fluxo financeiro.',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Erro ao aprovar NF:', e);

      toast({
        title: 'Erro ao aprovar',
        description: e?.message || 'Falha ao aprovar nota fiscal.',
        variant: 'destructive',
        duration: 6000,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleEnviar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    const erros = validar();

    if (erros.length) {
      toast({
        title: 'Preencha campos obrigatórios',
        description: erros.join(', '),
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setSending(true);

    try {
      const purchase = await criarPurchaseRequest();

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
      });

      toast({
        title: '📩 Enviado para aprovação',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      toast({
        title: 'Erro ao enviar',
        description: e?.message || 'Falha ao enviar nota.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    setSending(true);

    try {
      await base44.entities.DocumentIntake.delete(intake.id);

      toast({
        title: 'Documento deletado',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      toast({
        title: 'Erro ao deletar',
        description: e?.message || 'Falha ao deletar documento.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleReprocessar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    toast({
      title: 'Reprocessamento não executado',
      description: 'Função de reprocessamento não foi alterada neste ajuste.',
      duration: 4000,
    });
  }

  async function handleVincularXml(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    toast({
      title: 'XML vinculado ao PDF',
      description: form.xml_vinculado_nome || 'Vínculo mantido no documento.',
      duration: 3000,
    });
  }

  const rubricasOrdenadas = [...rubricas].sort((a, b) => {
    const nomeA = String(a.rubrica || a.nome || a.descricao || '');
    const nomeB = String(b.rubrica || b.nome || b.descricao || '');
    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  const valorFormatado = formatValorBR(form.nf_valor_total);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Conferência de Nota Fiscal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Documento analisado pela IA. Campos preenchidos automaticamente.</span>
            </div>
          </div>

          {(ia.motivo_classificacao || ia.motivo || ia.justificativa_classificacao) && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
              <div className="font-medium">💡 Motivo da Classificação IA:</div>
              <div className="mt-1 italic">
                {ia.motivo_classificacao || ia.motivo || ia.justificativa_classificacao}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Nome padronizado do arquivo</label>
            <Input
              value={form.nome_padronizado_arquivo}
              onChange={(e) =>
                setForm((f) => ({ ...f, nome_padronizado_arquivo: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Número da NF</label>
              <Input
                value={form.nf_numero}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nf_numero: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Valor Total (R$)</label>
              <Input
                value={form.nf_valor_total}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nf_valor_total: e.target.value }))
                }
                onBlur={() =>
                  setForm((f) => ({
                    ...f,
                    nf_valor_total: valorFormatado || f.nf_valor_total,
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Data de Emissão</label>
              <Input
                type="date"
                value={form.nf_data_emissao}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Competência</label>
              <Input
                value={form.nf_competencia}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nf_competencia: e.target.value }))
                }
                placeholder="MM/AAAA"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Fornecedor / Emitente</label>
            <Input
              value={form.nf_emitente_nome}
              onChange={(e) =>
                setForm((f) => ({ ...f, nf_emitente_nome: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">CNPJ / CPF do Emitente</label>
              <Input
                value={form.nf_emitente_cpf_cnpj}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Município</label>
              <Input
                value={form.municipio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, municipio: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Descrição do Serviço / Item</label>
            <Textarea
              value={form.descricao_servico}
              onChange={(e) =>
                setForm((f) => ({ ...f, descricao_servico: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Meta do 3º Aditivo *</label>
            <Select
              value={form.meta_id}
              onValueChange={(v) => setForm((f) => ({ ...f, meta_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar meta" />
              </SelectTrigger>
              <SelectContent>
                {metas.length === 0 && (
                  <SelectItem value="sem_meta_disponivel" disabled>
                    Nenhuma meta carregada
                  </SelectItem>
                )}

                {metas.map((meta) => (
                  <SelectItem key={meta.id} value={meta.id}>
                    {meta.nome || meta.titulo || meta.meta || meta.descricao || 'Meta sem nome'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Tipo de Gasto *</label>
            <Select
              value={form.tipo_gasto}
              onValueChange={(v) => setForm((f) => ({ ...f, tipo_gasto: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo de gasto" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_GASTO.map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>
                    {tipo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Rubrica *</label>
            <Select
              value={form.rubrica_id}
              onValueChange={(v) => setForm((f) => ({ ...f, rubrica_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar rubrica" />
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
          </div>

          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <LinkIcon className="h-4 w-4 text-blue-600" />
              Vincular XML existente a este PDF
            </div>

            <Input
              value={form.xml_vinculado_nome}
              onChange={(e) =>
                setForm((f) => ({ ...f, xml_vinculado_nome: e.target.value }))
              }
              placeholder="XML vinculado"
            />

            <button
              type="button"
              onClick={handleVincularXml}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
            >
              <LinkIcon className="h-4 w-4" />
              Vincular XML ao PDF
            </button>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="mb-3 text-sm font-medium text-slate-700">
              Rateamento da Rubrica
            </div>

            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={form.tipo_rateio === 'geral'}
                onChange={() => setForm((f) => ({ ...f, tipo_rateio: 'geral' }))}
              />
              Pago pela verba geral (sem rateio entre museus)
            </label>

            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={form.tipo_rateio === 'dividido'}
                onChange={() => setForm((f) => ({ ...f, tipo_rateio: 'dividido' }))}
              />
              Dividir entre museus
            </label>

            <div>
              <label className="mb-1 block text-sm font-medium">Centro de Custo *</label>
              <Select
                value={form.centro_custo}
                onValueChange={(v) => setForm((f) => ({ ...f, centro_custo: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  {CENTROS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>
                Ao enviar, o valor será debitado imediatamente da(s) rubrica(s)
                correspondente(s), atualizando o valor realizado e o saldo disponível.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Deletar
            </button>

            <button
              type="button"
              onClick={handleReprocessar}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reprocessar
            </button>

            <button
              type="button"
              onClick={salvarRascunho}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Salvar Rascunho
            </button>

            <button
              type="button"
              onClick={handleAprovar}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Aprovar Direto (Coordenador)
            </button>

            <button
              type="button"
              onClick={handleAprovar}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Aprovar
            </button>

            <button
              type="button"
              onClick={handleEnviar}
              disabled={sending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar para Aprovação
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
