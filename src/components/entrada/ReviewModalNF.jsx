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

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MUSEUS_RATEIO = ['MIS', 'MHAB', 'MUMO'];
const TIPOS_GASTO = ['Serviço', 'Produto', 'Material', 'Equipamento', 'Equipe', 'Outro'];

const METAS_3_ADITIVO = [
  { id: 'MC3A-01', nome: 'Meta 1 — Contratação da equipe principal' },
  { id: 'MC3A-02', nome: 'Meta 2 — Plano de Comunicação Nacional' },
  { id: 'MC3A-03', nome: 'Meta 3 — Manutenção das 04 exposições' },
  { id: 'MC3A-04', nome: 'Meta 4 — Alteração de 2 núcleos expositivos' },
  { id: 'MC3A-05', nome: 'Meta 5 — 60 ações educativas' },
  { id: 'MC3A-06', nome: 'Meta 6 — 36 ações culturais' },
  { id: 'MC3A-07', nome: 'Meta 7 — Educadores fixos MIS / MUMO / MHAB' },
  { id: 'MC3A-08', nome: 'Meta 8 — Exposição no Casarão do MHAB' },
  { id: 'MC3A-09', nome: 'Meta 9 — Exposição no MIS' },
  { id: 'MC3A-10', nome: 'Meta 10 — 18 mostras nos museus' },
  { id: 'MC3A-11', nome: 'Meta 11 — Noturno nos Museus' },
  { id: 'MC3A-12', nome: 'Meta 12 — Projeto curatorial galeria do MHAB' },
  { id: 'MC3A-13', nome: 'Meta 13 — Projeto curatorial MUMO' },
  { id: 'MC3A-14', nome: 'Meta 14 — Inscrição em leis de incentivo' },
  { id: 'MC3A-15', nome: 'Meta 15 — Dispositivos acessíveis' },
  { id: 'MC3A-16', nome: 'Meta 16 — 101 diárias de educador' },
  { id: 'MC3A-17', nome: 'Meta 17 — Publicações / catálogos' },
  { id: 'MC3A-18', nome: 'Meta 18 — Custeio de atividades educativas contínuas' },
  { id: 'MC3A-19', nome: 'Meta 19 — Presente de Iemanjá' },
  { id: 'MC3A-20', nome: 'Meta 20 — 30 ações educativas/culturais finais' },
  { id: 'MC3A-21', nome: 'Meta 21 — Exposição no MUMO' },
  { id: 'MC3A-22', nome: 'Meta 22 — Comunicação e divulgação' },
  { id: 'MC3A-23', nome: 'Meta 23 — Consultorias para execução do projeto' },
  { id: 'MC3A-24', nome: 'Meta 24 — Emenda Parlamentar' },
  { id: 'MC3A-25', nome: 'Meta 25 — Outras ações' },
  { id: 'MC3A-EXTRA', nome: 'MC3A-EXTRA — Ações extras' },
];

function parseValorBR(value) {
  const original = String(value || '').trim();

  if (/^\d{5,}$/.test(original)) {
    return Number(original) / 100;
  }

  const clean = original
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

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
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

function limparNomeArquivo(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function gerarNomePadronizadoArquivo(form, intake) {
  const numero = limparNomeArquivo(form.nf_numero || 'SEM NF');
  const tipo = limparNomeArquivo(form.tipo_gasto || 'NOTA FISCAL');
  const emitente = limparNomeArquivo(form.nf_emitente_nome || 'FORNECEDOR');
  const centro = limparNomeArquivo(form.centro_custo || 'GERAL');
  const valor = parseValorBR(form.nf_valor_total);

  const extensao =
    String(intake?.file_name || intake?.nome_arquivo || intake?.file_name_original || '')
      .split('.')
      .pop()
      ?.toLowerCase() || 'pdf';

  const valorTexto = valor
    ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'R$ 0,00';

  return `${numero} ${tipo} - ${emitente} - MUSEUS CENTRO - ${centro} - ${valorTexto}.${extensao}`;
}

function normalizarMuseusRateio(value) {
  if (Array.isArray(value)) return value.filter((item) => MUSEUS_RATEIO.includes(item));

  if (typeof value === 'string' && value) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => MUSEUS_RATEIO.includes(item));
  }

  return [];
}

function montarRateioMuseus(valor, museusSelecionados) {
  if (!museusSelecionados.length) return [];

  const valorUnitario = valor / museusSelecionados.length;

  return museusSelecionados.map((museu) => ({
    museu,
    valor: Number(valorUnitario.toFixed(2)),
    percentual: Number((100 / museusSelecionados.length).toFixed(2)),
  }));
}

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const ia = intake?.resultado_ia || {};

  const [sending, setSending] = useState(false);
  const [rubricas, setRubricas] = useState([]);
  const [nomeEditadoManualmente, setNomeEditadoManualmente] = useState(false);

  const [form, setForm] = useState(() => {
    const museusRateioInicial = normalizarMuseusRateio(
      getValue(intake?.museus_rateio, intake?.rateio_museus, ia.museus_rateio, ia.rateio_museus)
    );

    const tipoRateioInicial = getValue(
      intake?.tipo_rateio,
      ia.tipo_rateio,
      museusRateioInicial.length > 0 ? 'dividido' : 'geral'
    );

    const valorInicial = getValue(
      ia.nf_valor_total,
      ia.valor_total,
      ia.valor,
      intake?.nf_valor_total,
      intake?.valor_total
    );

    const baseForm = {
      nome_padronizado_arquivo: getValue(
        intake?.nome_padronizado_arquivo,
        intake?.nome_arquivo_padronizado,
        ia.nome_padronizado_arquivo,
        ia.nome_arquivo_padronizado
      ),
      nf_numero: getValue(ia.nf_numero, ia.numero_nf, intake?.nf_numero),
      nf_valor_total: formatValorBR(valorInicial),
      nf_data_emissao: normalizeDate(getValue(ia.nf_data_emissao, ia.data_emissao, ia.dataEmissao, ia.emissao, intake?.nf_data_emissao)),
      nf_competencia: getValue(ia.nf_competencia, ia.competencia, intake?.nf_competencia, intake?.competencia),
      nf_emitente_nome: getValue(ia.nf_emitente_nome, ia.emitente_nome, ia.emitente, intake?.nf_emitente_nome, intake?.emitente),
      nf_emitente_cpf_cnpj: getValue(ia.nf_emitente_cpf_cnpj, ia.cnpj_cpf_emitente, ia.cnpj, ia.cpf_cnpj, intake?.nf_emitente_cpf_cnpj),
      municipio: getValue(ia.municipio, ia.municipio_emitente, intake?.municipio),
      descricao_servico: getValue(ia.descricao_servico, ia.descricao, ia.descricao_item, intake?.descricao_servico, intake?.descricao),
      meta_id: getValue(intake?.meta_id, intake?.meta_id_sugerida, ia.meta_id, ia.meta_id_sugerida, 'MC3A-20'),
      tipo_gasto: getValue(intake?.tipo_gasto, ia.tipo_gasto, ia.tipo_gasto_sugerido, 'Serviço'),
      centro_custo: getValue(ia.centro_custo_sugerido, ia.centro_custo, intake?.centro_custo, 'Atuação Geral'),
      rubrica_id: getValue(intake?.rubrica_id, intake?.rubrica_id_sugerida, ia.rubrica_id, ia.rubrica_id_sugerida),
      tipo_rateio: tipoRateioInicial,
      museus_rateio: museusRateioInicial,
      xml_vinculado_id: getValue(intake?.xml_vinculado_id, intake?.xml_id, ia.xml_vinculado_id),
      xml_vinculado_nome: getValue(intake?.xml_vinculado_nome, intake?.xml_file_name, ia.xml_vinculado_nome, ia.xml_file_name),
    };

    return {
      ...baseForm,
      nome_padronizado_arquivo: baseForm.nome_padronizado_arquivo || gerarNomePadronizadoArquivo(baseForm, intake),
    };
  });

  useEffect(() => {
    async function loadData() {
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch (e) {
        console.error('Erro ao carregar rubricas:', e);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (nomeEditadoManualmente) return;

    setForm((f) => ({
      ...f,
      nome_padronizado_arquivo: gerarNomePadronizadoArquivo(f, intake),
    }));
  }, [
    form.nf_numero,
    form.nf_valor_total,
    form.nf_emitente_nome,
    form.tipo_gasto,
    form.centro_custo,
    intake,
    nomeEditadoManualmente,
  ]);

  function validarEnvio() {
    const erros = [];

    if (!intake?.id) erros.push('Documento de entrada');
    if (!form.nf_numero) erros.push('Número NF');
    if (!parseValorBR(form.nf_valor_total)) erros.push('Valor da nota');
    if (!form.nf_emitente_nome) erros.push('Emitente');
    if (!form.descricao_servico) erros.push('Descrição');
    if (!form.tipo_gasto) erros.push('Tipo de gasto');
    if (!form.centro_custo) erros.push('Centro de custo');
    if (!form.rubrica_id) erros.push('Rubrica');

    if (form.tipo_rateio === 'dividido' && !form.museus_rateio?.length) {
      erros.push('Museus para rateio');
    }

    return erros;
  }

  function getRubricaNome(id) {
    const r = rubricas.find((item) => item.id === id);
    return r?.rubrica || r?.nome || r?.descricao || '';
  }

  function toggleMuseuRateio(museu) {
    setForm((f) => {
      const atual = Array.isArray(f.museus_rateio) ? f.museus_rateio : [];
      const existe = atual.includes(museu);

      return {
        ...f,
        museus_rateio: existe
          ? atual.filter((item) => item !== museu)
          : [...atual, museu],
      };
    });
  }

  function getRateioCalculado() {
    const valor = parseValorBR(form.nf_valor_total);
    if (form.tipo_rateio !== 'dividido') return [];
    return montarRateioMuseus(valor, form.museus_rateio || []);
  }

  async function safeUpdateDocumentIntake(payload) {
    try {
      if (!intake?.id) return;
      await base44.entities.DocumentIntake.update(intake.id, payload);
    } catch (e) {
      console.warn('DocumentIntake não atualizado:', e);
    }
  }

  async function salvarRascunho(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    setSending(true);

    try {
      const valor = parseValorBR(form.nf_valor_total);
      const rubricaNome = getRubricaNome(form.rubrica_id);
      const rateioCalculado = getRateioCalculado();

      await safeUpdateDocumentIntake({
        status_processamento: 'RASCUNHO',
        nome_padronizado_arquivo: form.nome_padronizado_arquivo,
        nome_arquivo_padronizado: form.nome_padronizado_arquivo,
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        rubrica_nome_sugerida: rubricaNome,
        tipo_rateio: form.tipo_rateio,
        museus_rateio: form.tipo_rateio === 'dividido' ? form.museus_rateio : [],
        rateio_museus: form.tipo_rateio === 'dividido' ? rateioCalculado : [],
        revisado_pelo_usuario: true,
        resultado_ia: {
          ...ia,
          ...form,
          nf_valor_total: valor,
          rateio_museus: form.tipo_rateio === 'dividido' ? rateioCalculado : [],
        },
      });

      toast({ title: 'Rascunho salvo', duration: 3000 });
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

  async function handleEnviar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (sending) return;

    const erros = validarEnvio();

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
      const valor = parseValorBR(form.nf_valor_total);
      const rateioCalculado = getRateioCalculado();

      const response = await base44.functions.invoke('enviarNotaParaAprovacao', {
        intakeId: intake.id,
        form: {
          ...form,
          nf_valor_total: valor,
          rubrica_nome: getRubricaNome(form.rubrica_id),
          rateio_museus: form.tipo_rateio === 'dividido' ? rateioCalculado : [],
        },
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao enviar nota.');
      }

      toast({
        title:
          result.destino === 'equipe'
            ? '📩 Enviado para Pagamentos da Equipe'
            : '📩 Enviado para Solicitações',
        description:
          result.destino === 'equipe'
            ? 'A nota foi encaminhada para Compras → Pagamentos da Equipe.'
            : 'A solicitação foi encaminhada para Compras → Solicitações.',
        duration: 4000,
      });

      await onSaved?.();
      onClose?.();

      return result;
    } catch (e) {
      console.error('Erro ao enviar:', e);

      toast({
        title: 'Erro ao enviar',
        description: e?.message || 'Falha ao enviar para aprovação.',
        variant: 'destructive',
        duration: 7000,
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
      toast({ title: 'Documento deletado', duration: 3000 });
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

    if (sending) return;

    setSending(true);

    try {
      await safeUpdateDocumentIntake({
        status_processamento: 'ANALISANDO_IA',
        resultado_ia: null,
        erros_validacao: [],
        revisado_pelo_usuario: false,
      });

      toast({
        title: 'Documento enviado para reprocessamento',
        description: 'A nota foi marcada para nova análise pela IA.',
        duration: 3000,
      });

      await onSaved?.();
      onClose?.();
    } catch (e) {
      toast({
        title: 'Erro ao reprocessar',
        description: e?.message || 'Falha ao reprocessar documento.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
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
  const rateioCalculado = getRateioCalculado();

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

          <div>
            <label className="mb-1 block text-sm font-medium">Nome padronizado do arquivo</label>
            <Input
              value={form.nome_padronizado_arquivo}
              onChange={(e) => {
                setNomeEditadoManualmente(true);
                setForm((f) => ({ ...f, nome_padronizado_arquivo: e.target.value }));
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Número da NF</label>
              <Input value={form.nf_numero} onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Valor Total da Nota (R$)</label>
              <Input
                value={form.nf_valor_total}
                onChange={(e) => setForm((f) => ({ ...f, nf_valor_total: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, nf_valor_total: valorFormatado || f.nf_valor_total }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Data de Emissão</label>
              <Input type="date" value={form.nf_data_emissao} onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Competência</label>
              <Input placeholder="MM/AAAA" value={form.nf_competencia} onChange={(e) => setForm((f) => ({ ...f, nf_competencia: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Fornecedor / Emitente</label>
            <Input value={form.nf_emitente_nome} onChange={(e) => setForm((f) => ({ ...f, nf_emitente_nome: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">CNPJ / CPF do Emitente</label>
              <Input value={form.nf_emitente_cpf_cnpj} onChange={(e) => setForm((f) => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Município</label>
              <Input value={form.municipio} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Descrição do Serviço / Item</label>
            <Textarea value={form.descricao_servico} onChange={(e) => setForm((f) => ({ ...f, descricao_servico: e.target.value }))} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Meta do 3º Aditivo *</label>
            <Select value={form.meta_id} onValueChange={(v) => setForm((f) => ({ ...f, meta_id: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar meta" />
              </SelectTrigger>
              <SelectContent>
                {METAS_3_ADITIVO.map((meta) => (
                  <SelectItem key={meta.id} value={meta.id}>
                    {meta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Tipo de Gasto *</label>
            <Select value={form.tipo_gasto} onValueChange={(v) => setForm((f) => ({ ...f, tipo_gasto: v }))}>
              <SelectTrigger><SelectValue placeholder="Tipo de gasto" /></SelectTrigger>
              <SelectContent>
                {TIPOS_GASTO.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Rubrica *</label>
            <Select value={form.rubrica_id} onValueChange={(v) => setForm((f) => ({ ...f, rubrica_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar rubrica" /></SelectTrigger>
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

            <Input value={form.xml_vinculado_nome} onChange={(e) => setForm((f) => ({ ...f, xml_vinculado_nome: e.target.value }))} placeholder="XML vinculado" />

            <button type="button" onClick={handleVincularXml} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              <LinkIcon className="h-4 w-4" />
              Vincular XML ao PDF
            </button>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="mb-3 text-sm font-medium text-slate-700">Rateamento da Rubrica</div>

            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="radio" checked={form.tipo_rateio === 'geral'} onChange={() => setForm((f) => ({ ...f, tipo_rateio: 'geral', museus_rateio: [] }))} />
              Pago pela verba geral (sem rateio entre museus)
            </label>

            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={form.tipo_rateio === 'dividido'}
                onChange={() =>
                  setForm((f) => ({
                    ...f,
                    tipo_rateio: 'dividido',
                    museus_rateio: f.museus_rateio?.length ? f.museus_rateio : ['MIS', 'MHAB', 'MUMO'],
                  }))
                }
              />
              Dividir entre museus
            </label>

            {form.tipo_rateio === 'dividido' && (
              <div className="mb-4 rounded-md border bg-white p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">
                  Selecione 1, 2 ou 3 museus para dividir o valor da nota
                </div>

                <div className="flex flex-wrap gap-3">
                  {MUSEUS_RATEIO.map((museu) => (
                    <label key={museu} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.museus_rateio?.includes(museu)} onChange={() => toggleMuseuRateio(museu)} />
                      {museu}
                    </label>
                  ))}
                </div>

                {rateioCalculado.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    {rateioCalculado.map((item) => (
                      <div key={item.museu} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                        <span>{item.museu}</span>
                        <span>{formatMoney(item.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="mb-1 block text-sm font-medium">Centro de Custo *</label>
            <Select value={form.centro_custo} onValueChange={(v) => setForm((f) => ({ ...f, centro_custo: v }))}>
              <SelectTrigger><SelectValue placeholder="Centro de custo" /></SelectTrigger>
              <SelectContent>
                {CENTROS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>Ao enviar, a nota irá para Solicitações ou Pagamentos da Equipe conforme o tipo identificado.</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <button type="button" onClick={onClose} disabled={sending} className="inline-flex h-9 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50">Cancelar</button>

            <button type="button" onClick={handleDelete} disabled={sending} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
              Deletar
            </button>

            <button type="button" onClick={handleReprocessar} disabled={sending} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50">
              <RefreshCw className="h-4 w-4" />
              Reprocessar
            </button>

            <button type="button" onClick={salvarRascunho} disabled={sending} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50">
              <Save className="h-4 w-4" />
              Salvar Rascunho
            </button>

            <button type="button" onClick={handleEnviar} disabled={sending} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
