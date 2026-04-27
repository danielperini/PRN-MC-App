import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, AlertCircle, CheckCircle2, Send, Trash2, SplitSquareHorizontal, BookOpen, ShieldCheck, RefreshCw, LinkIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MUSEUS_RATEIO = ['MHAB', 'MIS', 'MUMO'];

const DEFAULT_RATEIO = MUSEUS_RATEIO.map((m) => ({ museu: m, valor: '' }));

const COORD_EMAILS = [
  'danielperini.mc@viadutodasartes.org.br',
  'danie@periniprojetos.com.br',
];

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [rubricas, setRubricas] = useState([]);
  const [metas, setMetas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [approvingDirect, setApprovingDirect] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [xmlCandidates, setXmlCandidates] = useState([]);
  const [selectedXmlId, setSelectedXmlId] = useState('');
  const [loadingXmls, setLoadingXmls] = useState(false);
  const [linkingXml, setLinkingXml] = useState(false);

  const ia = intake.resultado_ia || {};

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const [dividirEntreMuseus, setDividirEntreMuseus] = useState(false);
  const [rateio, setRateio] = useState(DEFAULT_RATEIO);

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || '',
    nf_data_emissao: ia.nf_data_emissao || '',
    nf_emitente_nome: ia.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
    nf_destinatario_nome: ia.nf_destinatario_nome || '',
    descricao_servico: ia.descricao_servico || '',
    municipio: ia.municipio || '',
    competencia: ia.competencia || ia.competencia_sugerida || '',
    centro_custo: ia.centro_custo_sugerido || intake.centro_custo || '',
    rubrica_id: intake.rubrica_id_sugerida || '',
    file_name_final: intake.file_name_final || intake.file_name_original,
    meta_id: '',
    categoria: ia.categoria_sugerida || '',
    tipo_gasto: ia.tipo_gasto || 'Serviço',
    budgetline_id: '',
  });

  const [budgetLines, setBudgetLines] = useState([]);

  useEffect(() => {
    async function loadRubricas() {
      try {
        const list = await base44.entities.Rubrica.list('', 200);
        setRubricas((list || []).filter((r) => r.ativo !== false));
      } catch (e) {
        console.error(e);
      }
    }

    async function loadBudgetLines() {
      try {
        const list = await base44.entities.BudgetLine.list('', 200);
        setBudgetLines((list || []).filter((b) => b.ativo !== false));
      } catch (e) {
        console.error(e);
      }
    }

    async function loadMetas() {
      try {
        const list = await base44.entities.ProjectMeta.list('', 200);
        setMetas((list || []).filter((m) => m.ativo !== false));
      } catch (e) {
        console.error(e);
      }
    }

    loadRubricas();
    loadBudgetLines();
    loadMetas();
  }, []);

  function parseValorBR(v) {
    const s = String(v || '0').trim().replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(s.replace(',', '.')) || 0;
  }

  function buildNomePadronizado() {
    const numero = (form.nf_numero || 'SEM-NUM').trim();
    const fornecedor = (form.nf_emitente_nome || 'FORNECEDOR').trim().substring(0, 40).toUpperCase();
    const valorNum = parseValorBR(form.nf_valor_total);
    const valorFormatado = valorNum > 0
      ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';
    const extAtual = (intake.file_name_original || 'arquivo.pdf').split('.').pop()?.toLowerCase() || 'pdf';
    return `${numero} - ${fornecedor} - MUSEUS CENTRO - R$ ${valorFormatado}.${extAtual}`;
  }

  useEffect(() => {
    const sugerirMeta = async () => {
      if (!form.categoria || form.meta_id) return;

      try {
        const metaSugestion = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Baseado na categoria "${form.categoria}" e descrição "${form.descricao_servico}", qual meta do 3º Aditivo é mais adequada?

Opções: MC3A-20, MC3A-21, MC3A-22, MC3A-23, MC3A-24, MC3A-25, MC3A-EXTRA

Responda SOMENTE com o código da meta (ex: MC3A-22)`,
          response_json_schema: {
            type: 'object',
            properties: { meta: { type: 'string' } },
          },
        });

        const metaSug = metaSugestion?.meta?.trim();
        if (
          metaSug &&
          ['MC3A-20', 'MC3A-21', 'MC3A-22', 'MC3A-23', 'MC3A-24', 'MC3A-25', 'MC3A-EXTRA'].includes(metaSug)
        ) {
          setForm((f) => ({ ...f, meta_id: metaSug }));
        }
      } catch (e) {
        console.warn('Erro ao sugerir meta:', e);
      }
    };

    sugerirMeta();
  }, [form.categoria, form.descricao_servico]);

  useEffect(() => {
    setForm((f) => ({ ...f, file_name_final: buildNomePadronizado() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nf_numero, form.nf_emitente_nome, form.nf_valor_total]);

  useEffect(() => {
    async function loadXMLs() {
      if (!form.nf_numero) {
        setXmlCandidates([]);
        setSelectedXmlId('');
        return;
      }

      setLoadingXmls(true);

      try {
        const list = await base44.entities.Attachment.filter(
          {
            nf_numero: form.nf_numero,
            nf_tipo_documento: 'xml_nf',
          },
          '-created_date',
          20
        );

        const unique = [];
        const seen = new Set();

        for (const item of list || []) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          unique.push(item);
        }

        setXmlCandidates(unique);
        setSelectedXmlId(unique[0]?.id || '');
      } catch (e) {
        console.error('Erro ao buscar XML:', e);
      } finally {
        setLoadingXmls(false);
      }
    }

    loadXMLs();
  }, [form.nf_numero]);

  const valorTotal = parseValorBR(form.nf_valor_total);
  const totalRateado = rateio.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);
  const diferencaRateio = Math.abs(valorTotal - totalRateado);
  const rateioValido = dividirEntreMuseus
    ? diferencaRateio < 0.01 && rateio.some((r) => parseFloat(r.valor) > 0)
    : true;

  function handleRateioValor(museu, valor) {
    setRateio((prev) => prev.map((r) => (r.museu === museu ? { ...r, valor } : r)));
  }

  function distribuirIgualmente() {
    const museusSelecionados = rateio.filter((r) => r.museu);
    const valorPorMuseu = (valorTotal / museusSelecionados.length).toFixed(2);
    setRateio(MUSEUS_RATEIO.map((m) => ({ museu: m, valor: valorPorMuseu })));
  }

  function getRateioPayload() {
    if (!dividirEntreMuseus) return null;
    return rateio
      .filter((r) => parseFloat(r.valor) > 0)
      .map((r) => ({ museu: r.museu, valor: parseFloat(r.valor) }));
  }

  async function handleVincularXML() {
    if (!selectedXmlId || !intake.entidade_destino_id) {
      toast({
        title: 'Não foi possível vincular XML',
        description: 'O PDF ainda não possui Attachment associado.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    setLinkingXml(true);

    try {
      const xml = await base44.entities.Attachment.get(selectedXmlId);

      await base44.entities.Attachment.update(intake.entidade_destino_id, {
        nf_xml_attachment_id: xml.id,
        nf_revisado: true,
        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: 'pdf_nf',
        nf_nome_renomeado: form.file_name_final,
      });

      await base44.entities.Attachment.update(xml.id, {
        nf_pdf_attachment_id: intake.entidade_destino_id,
        nf_revisado: true,
        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
      });

      toast({
        title: 'XML vinculado ao PDF com sucesso.',
        duration: 3000,
      });

      onSaved?.();
    } catch (e) {
      toast({
        title: 'Erro ao vincular XML',
        description: e?.message || 'Falha ao vincular XML.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLinkingXml(false);
    }
  }

  async function handleSalvarRascunho() {
    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'RASCUNHO',
        resultado_ia: {
          ...ia,
          ...form,
          rateio_museus: getRateioPayload(),
          dividir_entre_museus: dividirEntreMuseus,
        },
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        revisado_pelo_usuario: true,
      });
      toast({ title: 'Rascunho salvo com sucesso.', duration: 3000 });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao salvar rascunho', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setSaving(false);
    }
  }

  async function atualizarRubrica(rubricaId, valorDebito) {
    const rubrica = await base44.entities.Rubrica.get(rubricaId);
    if (!rubrica) return;

    const valorBase = rubrica.valor_total || rubrica.valor_rubrica || 0;
    const utilizado = (rubrica.valor_utilizado || 0) + valorDebito;
    const comprometido = rubrica.saldo_comprometido || 0;
    const saldo = valorBase - utilizado - comprometido;
    const percentual = valorBase > 0 ? (utilizado / valorBase) * 100 : 0;

    await base44.entities.Rubrica.update(rubricaId, {
      valor_utilizado: utilizado,
      saldo_comprometido: comprometido,
      saldo,
      percentual_utilizado: percentual,
    });
  }

  async function debitarRubricas(rateioPayload) {
    const debitosPorRubrica = {};

    for (const item of rateioPayload) {
      const configs = await base44.entities.RubricaMuseuConfig.filter({
        rubrica_id: form.rubrica_id,
        museu: item.museu,
      });

      const rubricaAlvo = configs && configs.length > 0 ? configs[0].rubrica_id : form.rubrica_id;
      debitosPorRubrica[rubricaAlvo] = (debitosPorRubrica[rubricaAlvo] || 0) + item.valor;
    }

    for (const [rubricaId, valorDebito] of Object.entries(debitosPorRubrica)) {
      try {
        await atualizarRubrica(rubricaId, valorDebito);
      } catch (e) {
        console.error(`Erro ao debitar rubrica ${rubricaId}:`, e);
      }
    }
  }

  async function debitarRubricaSimples(valor) {
    try {
      await atualizarRubrica(form.rubrica_id, valor);
    } catch (e) {
      console.error('Erro ao debitar rubrica:', e);
    }
  }

  async function handleDeletarDocumento() {
    if (!confirm('Tem certeza que deseja deletar este documento? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'DELETADO',
      });
      toast({ title: 'Documento deletado com sucesso.', duration: 3000 });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setDeleting(false);
    }
  }

  async function handleRereprocessar() {
    setReprocessing(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ANALISANDO_IA',
        resultado_ia: null,
        erros_validacao: [],
        revisado_pelo_usuario: false,
      });
      toast({ title: 'Documento enviado para reprocessamento.', duration: 3000 });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao rereprocessar', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setReprocessing(false);
    }
  }

  async function handleAprovacaoDireta() {
    if (!form.meta_id) {
      toast({ title: 'Selecione a meta antes de aprovar.', variant: 'destructive', duration: 3000 });
      return;
    }
    if (!form.categoria) {
      toast({ title: 'Selecione a categoria antes de aprovar.', variant: 'destructive', duration: 3000 });
      return;
    }
    if (!form.budgetline_id) {
      toast({ title: 'Selecione a linha orçamentária antes de aprovar.', variant: 'destructive', duration: 3000 });
      return;
    }
    if (!form.centro_custo && !dividirEntreMuseus) {
      toast({ title: 'Selecione o centro de custo antes de aprovar.', variant: 'destructive', duration: 3000 });
      return;
    }
    if (dividirEntreMuseus && !rateioValido) {
      toast({
        title: `A soma do rateio (R$ ${totalRateado.toFixed(2)}) deve ser igual ao valor total (R$ ${valorTotal.toFixed(2)}).`,
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    setApprovingDirect(true);
    try {
      const rateioPayload = getRateioPayload();

      const pr = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico || form.nf_emitente_nome,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: valorTotal,
        meta_id: form.meta_id,
        categoria: form.categoria,
        tipo_gasto: form.tipo_gasto,
        budgetline_id: form.budgetline_id,
        centro_custo: dividirEntreMuseus ? 'Rateado' : form.centro_custo,
        rubrica_id: form.rubrica_id,
        status: 'APROVADO',
        observacoes: `Aprovado direto via Entrada Única (Coordenador). NF ${form.nf_numero} - ${form.nf_emitente_nome}.`,
      });

      await base44.entities.Attachment.create({
        report_id: '',
        file_name: form.file_name_final,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: 'Entrada Única - Nota Fiscal',
        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
        nf_nome_original: intake.file_name_original,
        nf_nome_renomeado: form.file_name_final,
        nf_status_leitura: 'lido_com_sucesso',
        nf_revisado: true,
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: pr.id,
        centro_custo: dividirEntreMuseus ? 'Rateado' : form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        resultado_ia: {
          ...ia,
          ...form,
          rateio_museus: rateioPayload,
          dividir_entre_museus: dividirEntreMuseus,
        },
        revisado_pelo_usuario: true,
      });

      if (dividirEntreMuseus && rateioPayload && rateioPayload.length > 0) {
        await debitarRubricas(rateioPayload);
      } else {
        await debitarRubricaSimples(valorTotal);
      }

      try {
        await base44.functions.invoke('notifyDocumentSubmissionForApproval', {
          documentIntakeId: intake.id,
          tipoDocumento: 'Nota Fiscal',
          categoriaIdentificada: form.categoria,
          nfNumero: form.nf_numero,
          valor: valorTotal,
          rubricaSugerida: form.rubrica_id ? (rubricas.find((r) => r.id === form.rubrica_id)?.rubrica || form.rubrica_id) : null,
          centroCusto: dividirEntreMuseus ? 'Rateado entre museus' : form.centro_custo,
          nomeArquivo: form.file_name_final,
          aprovadoPeloCoordenador: true,
        });
      } catch (e) {
        console.error('Erro ao notificar:', e);
      }

      toast({
        title: '✅ Documento aprovado direto pela coordenação.',
        description: 'Notificação enviada.',
        duration: 3000,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao aprovar', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setApprovingDirect(false);
    }
  }

  async function handleEnviarAprovacao(forcarEnvio = false) {
    if (!forcarEnvio) {
      if (!form.meta_id) {
        toast({ title: 'Selecione a meta antes de enviar.', variant: 'destructive', duration: 3000 });
        return;
      }
      if (!form.categoria) {
        toast({ title: 'Selecione a categoria antes de enviar.', variant: 'destructive', duration: 3000 });
        return;
      }
      if (!form.budgetline_id) {
        toast({ title: 'Selecione a linha orçamentária antes de enviar.', variant: 'destructive', duration: 3000 });
        return;
      }
      if (!form.centro_custo && !dividirEntreMuseus) {
        toast({ title: 'Selecione o centro de custo antes de enviar.', variant: 'destructive', duration: 3000 });
        return;
      }
      if (dividirEntreMuseus && !rateioValido) {
        toast({
          title: `A soma do rateio (R$ ${totalRateado.toFixed(2)}) deve ser igual ao valor total (R$ ${valorTotal.toFixed(2)}).`,
          variant: 'destructive',
          duration: 3000,
        });
        return;
      }
    }

    setSending(true);
    try {
      const pr = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico || form.nf_emitente_nome,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: valorTotal,
        meta_id: form.meta_id,
        categoria: form.categoria,
        tipo_gasto: form.tipo_gasto,
        budgetline_id: form.budgetline_id,
        centro_custo: dividirEntreMuseus ? 'Rateado' : form.centro_custo,
        rubrica_id: form.rubrica_id,
        status: 'SOLICITADO',
        observacoes: `NF ${form.nf_numero} - ${form.nf_emitente_nome}`,
      });

      await base44.entities.Attachment.create({
        report_id: '',
        file_name: form.file_name_final,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: 'Entrada Única - Nota Fiscal',
        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
        nf_nome_original: intake.file_name_original,
        nf_nome_renomeado: form.file_name_final,
        nf_status_leitura: 'lido_com_sucesso',
        nf_revisado: true,
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: pr.id,
      });

      toast({
        title: 'Enviado com sucesso',
        description: 'Documento enviado para aprovação.',
        duration: 3000,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setSending(false);
    }
  }

  const errosFiltrados = (intake.erros_validacao || []).filter((e) => {
    const txt = String(e).toLowerCase();
    if (txt.includes('futura') || txt.includes('future')) {
      const match = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const hoje = new Date();
        const dataDoc = new Date(`${match[3]}-${match[2]}-${match[1]}`);
        if (dataDoc <= hoje) return false;
      }
    }
    return true;
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              Conferência de Nota Fiscal
            </DialogTitle>
            <a href="/GuiaNotaFiscal" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="text-xs h-8">
                <BookOpen className="w-3 h-3 mr-1" />
                Ver guia
              </Button>
            </a>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Documento analisado pela IA. Campos preenchidos automaticamente.
          </div>

          {ia.classificacao_justificativa && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
              <p className="font-medium mb-1">💡 Motivo da Classificação IA:</p>
              <p className="italic">{ia.classificacao_justificativa}</p>
            </div>
          )}

          {errosFiltrados.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
              <p className="font-medium flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Inconsistências detectadas:
              </p>
              {errosFiltrados.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <Label>Nome padronizado do arquivo</Label>
            <Input value={form.file_name_final} onChange={(e) => setForm((f) => ({ ...f, file_name_final: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Número da NF</Label>
              <Input value={form.nf_numero} onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Valor Total (R$)</Label>
              <Input value={form.nf_valor_total} onChange={(e) => setForm((f) => ({ ...f, nf_valor_total: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data de Emissão</Label>
              <Input type="date" value={form.nf_data_emissao} onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Competência</Label>
              <Input value={form.competencia} onChange={(e) => setForm((f) => ({ ...f, competencia: e.target.value }))} placeholder="Ex: Março/2026" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Fornecedor / Emitente</Label>
            <Input value={form.nf_emitente_nome} onChange={(e) => setForm((f) => ({ ...f, nf_emitente_nome: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>CNPJ / CPF do Emitente</Label>
              <Input value={form.nf_emitente_cpf_cnpj} onChange={(e) => setForm((f) => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Município</Label>
              <Input value={form.municipio} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrição do Serviço / Item</Label>
            <Input value={form.descricao_servico} onChange={(e) => setForm((f) => ({ ...f, descricao_servico: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <Label>
              Meta do 3º Aditivo <span className="text-red-500">*</span>
            </Label>
            <Select value={form.meta_id} onValueChange={(v) => setForm((f) => ({ ...f, meta_id: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar meta" />
              </SelectTrigger>
              <SelectContent>
                {metas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>
              Categoria <span className="text-red-500">*</span>
            </Label>
            <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {[
                  'Serviços (equipe/coordenação)',
                  'Serviços (comunicação: designer, foto, vídeo, imprensa, redes)',
                  'Serviços (produção/infraestrutura/expografia)',
                  'Serviços (eventos/atrações/artistas)',
                  'Serviços (segurança/limpeza)',
                  'Logística (transporte/vans)',
                  'Alimentação (lanche/café/coffeebreak)',
                  'Consultoria / Formação / Acessibilidade',
                  'Materiais de consumo',
                  'Outros',
                ].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>
              Tipo de Gasto <span className="text-red-500">*</span>
            </Label>
            <Select value={form.tipo_gasto} onValueChange={(v) => setForm((f) => ({ ...f, tipo_gasto: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Produto">Produto</SelectItem>
                <SelectItem value="Serviço">Serviço</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>
              Rubrica Orçamentária <span className="text-red-500">*</span>
            </Label>
            <Select value={form.budgetline_id} onValueChange={(v) => setForm((f) => ({ ...f, budgetline_id: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar linha orçamentária" />
              </SelectTrigger>
              <SelectContent>
                {budgetLines.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome || b.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingXmls && (
            <div className="border border-slate-200 rounded-xl p-3 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando XMLs correspondentes...
            </div>
          )}

          {!loadingXmls && xmlCandidates.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Vincular XML existente a este PDF
              </p>

              <div className="space-y-2 max-h-40 overflow-auto">
                {xmlCandidates.map((xml) => (
                  <button
                    key={xml.id}
                    type="button"
                    onClick={() => setSelectedXmlId(xml.id)}
                    className={`w-full text-left p-2 rounded border text-sm ${
                      selectedXmlId === xml.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-medium truncate">{xml.file_name || xml.nf_nome_original || 'XML sem nome'}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {xml.nf_numero ? `NF ${xml.nf_numero}` : 'XML candidato'}
                      {xml.nf_emitente_nome ? ` — ${xml.nf_emitente_nome}` : ''}
                    </p>
                  </button>
                ))}
              </div>

              <Button
                type="button"
                onClick={handleVincularXML}
                disabled={!selectedXmlId || linkingXml}
                className="w-full"
              >
                {linkingXml ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                Vincular XML ao PDF
              </Button>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Rateamento da Rubrica</span>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rateio_tipo" checked={!dividirEntreMuseus} onChange={() => setDividirEntreMuseus(false)} className="accent-slate-700" />
                <span className="text-slate-700">Pago pela verba geral (sem rateio entre museus)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rateio_tipo" checked={dividirEntreMuseus} onChange={() => setDividirEntreMuseus(true)} className="accent-slate-700" />
                <span className="text-slate-700">Dividir entre museus</span>
              </label>
            </div>

            {!dividirEntreMuseus && (
              <div className="space-y-1">
                <Label>
                  Centro de Custo <span className="text-red-500">*</span>
                </Label>
                <Select value={form.centro_custo} onValueChange={(v) => setForm((f) => ({ ...f, centro_custo: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
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
            )}

            {dividirEntreMuseus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Informe o valor de cada museu. A soma deve ser igual ao valor total da NF.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={distribuirIgualmente} className="text-xs h-7">
                    Dividir igualmente
                  </Button>
                </div>

                <div className="space-y-2">
                  {rateio.map((r) => (
                    <div key={r.museu} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium text-slate-700 flex-shrink-0">{r.museu}</span>
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <Input type="number" min="0" step="0.01" placeholder="0,00" value={r.valor} onChange={(e) => handleRateioValor(r.museu, e.target.value)} className="pl-9" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`flex justify-between items-center text-sm font-medium px-1 py-2 rounded-lg border ${rateioValido ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <span>Total rateado:</span>
                  <span>
                    R$ {totalRateado.toFixed(2)} {valorTotal > 0 && `/ R$ ${valorTotal.toFixed(2)}`}
                  </span>
                </div>

                {!rateioValido && valorTotal > 0 && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Diferença de R$ {diferencaRateio.toFixed(2)} — ajuste os valores antes de enviar.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            ⚡ Ao enviar, o valor será debitado imediatamente da(s) rubrica(s) correspondente(s), atualizando o valor realizado e o saldo disponível.
          </div>

          {errosFiltrados.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-2">
              <p className="font-medium">⚠️ Este documento tem inconsistências. Você pode:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Trocar o arquivo e reprocessar</li>
                <li>Deletar este documento</li>
                <li>Enviar mesmo assim (irá para revisão do coordenador)</li>
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button variant="destructive" size="sm" onClick={handleDeletarDocumento} disabled={deleting || saving || sending}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Deletar
            </Button>

            <Button variant="outline" size="sm" onClick={handleRereprocessar} disabled={reprocessing || saving || sending}>
              {reprocessing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Rereprocessar
            </Button>

            <Button variant="outline" onClick={handleSalvarRascunho} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Rascunho
            </Button>

            {user && COORD_EMAILS.includes((user.email || '').toLowerCase().trim()) && (
              <Button
                onClick={handleAprovacaoDireta}
                disabled={approvingDirect}
                className="bg-green-600 hover:bg-green-700"
              >
                {approvingDirect ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Aprovar Direto (Coordenador)
              </Button>
            )}

            <Button
              onClick={() => handleEnviarAprovacao(true)}
              disabled={sending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Aprovar
            </Button>

            <Button
              onClick={() => handleEnviarAprovacao(true)}
              disabled={sending || !form.meta_id || !form.categoria || !form.budgetline_id || (!dividirEntreMuseus && !form.centro_custo) || (dividirEntreMuseus && !rateioValido)}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar para Aprovação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}