import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import SearchableSelect from '@/components/ui/searchable-select'
import { base44 } from '@/api/base44Client'
import { CheckCircle2, RotateCcw, Trash2, Paperclip, X, FileText, Upload, ExternalLink, FolderOpen, AlertTriangle, ShieldAlert, Sparkles, Mail } from 'lucide-react'
import { useSmartToast } from '@/lib/useSmartToast'
import { toast } from 'sonner'
import { deletePurchaseRequest } from '@/lib/deleteIntegrado'
import { findDuplicatePurchaseRequest } from '@/lib/purchaseDuplicateGuard'
import DuplicatePurchaseDetectedModal from './DuplicatePurchaseDetectedModal'
import NFDuplicateBlockAlert from './NFDuplicateBlockAlert'
import AnalysisSummary from './AnalysisSummary'
import useDocumentAnalysis from '@/hooks/useDocumentAnalysis'
import { notifyPurchaseApproved, notifyPurchaseCreated, notifyPurchaseReturned } from '@/services/notifications/purchaseNotifications'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { METAS_PROJETO_FALLBACK } from '@/lib/metasProjeto'
import { metaOcultaNoTerceiroAditivo } from '@/utils/metasAditivosPermitidos'

const CENTROS = ['MUMO','MIS','MHAB','Noturno nos Museus 2026','Noturno Pampulha','Publicações','Geral']
const MUSEUS_RATEIO = ['MHAB', 'MIS', 'MUMO']
const DEFAULT_RATEIO = MUSEUS_RATEIO.map((m) => ({ museu: m, valor: '' }))

const CATEGORIAS = [
  'Serviços (equipe/coordenação)',
  'Serviços (comunicação: designer, foto, vídeo, imprensa, redes)',
  'Serviços (produção/infraestrutura/expografia)',
  'Serviços (eventos/atrações/artistas)',
  'Serviços (segurança/limpeza)',
  'Logística (transporte/vans)',
  'Alimentação (lanche/café/coffeebreak)',
  'Consultoria / Formação / Acessibilidade',
  'Materiais de consumo',
  'Outros'
]

const MEIOS_PAGAMENTO = ['PIX','TED/Transferência','Boleto','Cartão','Dinheiro']

const STATUS_APROVADOS = new Set([
  'APROVADO',
  'APROVADO_COORD',
  'APROVADO_ADMIN',
  'PAGO'
])

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0

  const raw = String(v ?? '').trim()

  if (!raw) return 0

  const normalized = raw
    .replace(/\s/g, '')
    .replace(/^R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const n = Number(normalized)

  return Number.isFinite(n) ? n : 0
}

function firstFilled(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }

  return ''
}

function getFileExtension(fileName = '') {
  const parts = String(fileName || '').split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

function getDocumentKind(fileName = '') {
  const ext = getFileExtension(fileName)

  if (ext === 'xml') return 'xml_nf'
  if (ext === 'pdf') return 'pdf_nf'

  return 'proposta'
}

function getExistingUrl(prefill = {}) {
  return firstFilled(
    prefill.file_url,
    prefill.arquivo_url,
    prefill.nota_fiscal_url,
    prefill.orcamento_url,
    prefill.nf_pdf_url,
    prefill.documento_url,
    prefill.comprovante_url,
    prefill.link_proposta,
    prefill.xml_url,
    prefill.nf_xml_url
  )
}

function normalizeMetaValue(metaId, metas = []) {
  if (!metaId) return ''
  // Aceita tanto ID do banco quanto nome direto
  const exact = metas.find((m) => m?.id === metaId || m?.nome === metaId)
  if (exact?.id) return exact.id
  return metaId
}

export default function PurchaseFormDialog({ currentUser, prefill, onClose, onSuccess }) {
  const smartToast = useSmartToast()
  const fileInputRef = useRef(null)

  const isCoordenador = [
    'admin',
    'ADMIN',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO'
  ].includes(currentUser?.role)

  const emptyForm = {
    descricao_item: '',
    fornecedor_nome: '',
    fornecedor_cnpj: '',
    fornecedor_contato: '',
    centro_custo: '',
    rubrica_id: '',
    rubrica_nome: '',
    meta_id: '',
    meta_extra_descricao: '',
    categoria: '',
    tipo_gasto: '',
    valor_solicitado: '',
    valor_total: '',
    valor: '',
    meio_pagamento: '',
    detalhe_pagamento: '',
    observacoes: '',
    link_proposta: '',
    file_url: '',
    arquivo_url: '',
    nota_fiscal_url: '',
    orcamento_url: '',
    nf_pdf_url: '',
    documento_url: '',
    arquivo_nome: '',
    arquivo_tipo: '',
    nf_numero: '',
    nf_data_emissao: '',
    nf_valor_total: '',
    nf_emitente_nome: '',
    nf_emitente_cpf_cnpj: '',
    rubrica_mes_inicial: '',
    rubrica_mes_final: '',
    intake_id: '',
    documento_intake_id: '',
    entidade_destino_id: '',
    attachment_id: '',
    origem: '',
    tipo_origem: ''
  }

  const [form, setForm] = useState(emptyForm)
  const [rubricas, setRubricas] = useState([])
  const [metas, setMetas] = useState([])
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [returning, setReturning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  const [returnComment, setReturnComment] = useState('')
  const [showReturnInput, setShowReturnInput] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false)
  const [linkedAttachments, setLinkedAttachments] = useState([])
  const [duplicidadeConfirmada, setDuplicidadeConfirmada] = useState(false)
  const [nfDuplicateResult, setNfDuplicateResult] = useState(null)
  const [nfDuplicateBypass, setNfDuplicateBypass] = useState(false)
  const [checkingNfDuplicate, setCheckingNfDuplicate] = useState(false)
  const [deletingDuplicate, setDeletingDuplicate] = useState(false)
  const [aiPreenchido, setAiPreenchido] = useState(false)
  const [dividirEntreMuseus, setDividirEntreMuseus] = useState(false)
  const [rateio, setRateio] = useState(DEFAULT_RATEIO)
  const [showNotificationConfirm, setShowNotificationConfirm] = useState(false)
  const [sendingNotification, setSendingNotification] = useState(false)
  // Flag para garantir que o setForm inicial só roda uma vez por abertura (por prefill.id)
  const initializedForId = useRef(null)

  // Hook unificado de análise de documentos
  const {
    analisando: aiAnalisando,
    dadosAnalise,
    fieldStates,
    analisar: analisarDocumentos,
    confirmarCampo,
    marcarManual,
    reanalisar: reanalisarDocumentos,
  } = useDocumentAnalysis()

  // Carrega attachments vinculados à solicitação (somente em edição)
  useEffect(() => {
    if (!prefill?.id) { setLinkedAttachments([]); return }
    base44.entities.Attachment.filter({ purchase_request_id: prefill.id }, '-created_date', 50)
      .then((d) => setLinkedAttachments(Array.isArray(d) ? d : []))
      .catch(() => setLinkedAttachments([]))
  }, [prefill?.id])

  // Alertas de duplicidade vindos da análise de IA
  const alertasDuplicidade = (() => {
    const ia = prefill?.resultado_ia || {}
    const alertas = Array.isArray(ia.alertas_duplicidade) ? ia.alertas_duplicidade : []
    // Também verifica erros_validacao que possam conter alertas de duplicidade
    const erros = Array.isArray(prefill?.erros_validacao) ? prefill.erros_validacao : []
    const errosDupl = erros.filter(e => String(e).includes('DUPLICIDADE') || String(e).includes('INCONSISTÊNCIA'))
    // Mescla sem duplicar mensagens já presentes
    const mensagensAlertas = new Set(alertas.map(a => a.mensagem))
    const extras = errosDupl.filter(e => !mensagensAlertas.has(e)).map(e => ({ mensagem: e, nivel: 'atencao' }))
    return [...alertas, ...extras]
  })()

  const isEditing = !!prefill?.id
  const statusKey = String(prefill?.status || '').trim().toUpperCase()
  const isApproved = STATUS_APROVADOS.has(statusKey)

  const BLOCKED_STATUSES = new Set(['CANCELADO', 'RECUSADO'])

  const canApproveOrReturn =
    isCoordenador &&
    isEditing &&
    !isApproved &&
    !BLOCKED_STATUSES.has(statusKey)

  useEffect(() => {
    async function loadRubricas() {
      try {
        const res = await base44.functions.invoke('listAllRubricas', {});
        const arr = Array.isArray(res) ? res : Array.isArray(res?.data?.rubricas) ? res.data.rubricas : Array.isArray(res?.rubricas) ? res.rubricas : null;
        if (arr && arr.length > 0) { setRubricas(arr.filter((r) => r?.ativo !== false)); return; }
      } catch (_) {}
      try {
        const d = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
        setRubricas((d || []).filter((r) => r?.ativo !== false));
      } catch (_) {}
    }
    loadRubricas()

    base44.entities.ProjectMeta.list('ordem', 500)
      .then((d) => {
        const ativos = (d || []).filter((m) => m?.ativo !== false && !metaOcultaNoTerceiroAditivo(m))
        // Garante que 11B - Noturno Pampulha está na lista mesmo que não venha do banco
        const ids = new Set(ativos.map(m => m.id))
        const fallbackExtras = METAS_PROJETO_FALLBACK.filter(m => !ids.has(m.id)).map(m => ({ id: m.id, nome: m.label }))
        const final = ativos.length > 0 ? [...ativos, ...fallbackExtras] : METAS_PROJETO_FALLBACK.map(m => ({ id: m.id, nome: m.label }))
        setMetas(final)
      })
      .catch(() => setMetas(METAS_PROJETO_FALLBACK.map(m => ({ id: m.id, nome: m.label }))))
  }, [])

  // Inicializa o form UMA ÚNICA VEZ por abertura (identificada por prefill.id ou ausência de prefill).
  // NÃO depende de `metas` para evitar reset das edições do usuário quando metas carregam.
  useEffect(() => {
    const currentId = prefill?.id ?? '__new__'
    if (initializedForId.current === currentId) return
    initializedForId.current = currentId

    if (prefill) {
      const ia = prefill.resultado_ia || {}
      const existingUrl = getExistingUrl(prefill)

      const valor =
        firstFilled(
          prefill.valor_solicitado,
          prefill.nf_valor_total,
          prefill.valor_total,
          prefill.valor,
          ia.nf_valor_total,
          ia.valor_total,
          ia.valor
        )

      const fornecedorNome =
        firstFilled(
          prefill.fornecedor_nome,
          prefill.nf_emitente_nome,
          ia.nf_emitente_nome,
          ia.fornecedor_nome
        )

      const fornecedorCnpj =
        firstFilled(
          prefill.fornecedor_cnpj,
          prefill.fornecedor_cpf_cnpj,
          prefill.nf_emitente_cpf_cnpj,
          ia.nf_emitente_cpf_cnpj,
          ia.fornecedor_cpf_cnpj
        )

      const descricao =
        firstFilled(
          prefill.descricao_item,
          prefill.descricao_servico,
          prefill.descricao,
          ia.descricao_servico,
          ia.descricao,
          fornecedorNome
        )

      const nfNumero = firstFilled(prefill.nf_numero, ia.nf_numero)
      const nfData = firstFilled(prefill.nf_data_emissao, ia.nf_data_emissao, ia.data_emissao)

      const arquivoNome =
        firstFilled(
          prefill.arquivo_nome,
          prefill.file_name,
          prefill.file_name_final,
          prefill.file_name_original,
          ia.file_name_final,
          ia.file_name_original
        )

      const arquivoTipo =
        firstFilled(
          prefill.arquivo_tipo,
          prefill.nf_tipo_documento,
          getDocumentKind(arquivoNome)
        )

      // meta_id: normaliza com as metas já carregadas (pode ser [] se metas ainda não chegaram —
      // nesse caso o useEffect abaixo vai atualizar apenas esse campo quando metas chegarem)
      const metaIdRaw = firstFilled(prefill.meta_id, ia.meta_id, ia.meta_sugerida)

      setForm({
        descricao_item: descricao,
        fornecedor_nome: fornecedorNome,
        fornecedor_cnpj: fornecedorCnpj,
        fornecedor_contato: prefill.fornecedor_contato || '',
        centro_custo: firstFilled(prefill.centro_custo, ia.centro_custo_sugerido, ia.centro_custo),
        rubrica_id: firstFilled(prefill.rubrica_id, ia.rubrica_id, ia.rubrica_id_sugerida),
        rubrica_nome: firstFilled(prefill.rubrica_nome, ia.rubrica_nome_sugerida, ia.rubrica_nome),
        meta_id: normalizeMetaValue(metaIdRaw, metas),
        meta_extra_descricao: prefill.meta_extra_descricao || '',
        categoria: firstFilled(prefill.categoria, ia.categoria, 'Nota Fiscal'),
        tipo_gasto: firstFilled(prefill.tipo_gasto, ia.tipo_gasto, 'Serviço'),
        valor_solicitado: valor,
        valor_total: valor,
        valor,
        meio_pagamento: prefill.meio_pagamento || '',
        detalhe_pagamento: prefill.detalhe_pagamento || '',
        observacoes: prefill.observacoes || '',
        link_proposta: prefill.link_proposta || existingUrl,
        file_url: prefill.file_url || existingUrl,
        arquivo_url: prefill.arquivo_url || existingUrl,
        nota_fiscal_url: prefill.nota_fiscal_url || existingUrl,
        orcamento_url: prefill.orcamento_url || existingUrl,
        nf_pdf_url: prefill.nf_pdf_url || existingUrl,
        documento_url: prefill.documento_url || existingUrl,
        arquivo_nome: arquivoNome,
        arquivo_tipo: arquivoTipo,
        nf_numero: nfNumero,
        nf_data_emissao: nfData,
        nf_valor_total: valor,
        nf_emitente_nome: fornecedorNome,
        nf_emitente_cpf_cnpj: fornecedorCnpj,
        rubrica_mes_inicial: prefill.rubrica_mes_inicial ?? '',
        rubrica_mes_final: prefill.rubrica_mes_final ?? '',
        intake_id: firstFilled(prefill.intake_id, prefill.documento_intake_id, ia.intake_id),
        documento_intake_id: firstFilled(prefill.documento_intake_id, prefill.intake_id, ia.documento_intake_id),
        entidade_destino_id: prefill.entidade_destino_id || '',
        attachment_id: firstFilled(prefill.attachment_id, ia.attachment_id),
        origem: firstFilled(prefill.origem, ia.origem, 'EntradaUnica'),
        tipo_origem: firstFilled(prefill.tipo_origem, ia.tipo_origem, 'ENTRADA_UNICA')
      })
    } else {
      setForm(emptyForm)
    }

    setReturnComment('')
    setShowReturnInput(false)
    setAttachedFile(null)
    setAiPreenchido(false)
  }, [prefill?.id])

  // Quando metas terminam de carregar, atualiza APENAS o meta_id caso ele ainda não tenha sido
  // normalizado corretamente (não toca em nenhum outro campo do form).
  useEffect(() => {
    if (!metas.length || !prefill) return
    const metaIdRaw = firstFilled(prefill.meta_id, prefill.resultado_ia?.meta_id, prefill.resultado_ia?.meta_sugerida)
    if (!metaIdRaw) return
    const normalized = normalizeMetaValue(metaIdRaw, metas)
    setForm((prev) => {
      // Só atualiza se o campo ainda está no valor bruto (não foi editado pelo usuário)
      if (prev.meta_id === normalized) return prev
      if (prev.meta_id && prev.meta_id !== metaIdRaw) return prev // usuário já editou
      return { ...prev, meta_id: normalized }
    })
  }, [metas, prefill?.id])

  // ── ANÁLISE UNIFICADA DE DOCUMENTOS ──
  const triggerAnalise = useCallback(async () => {
    if (aiPreenchido || aiAnalisando) return;
    setAiPreenchido(true);

    const dados = await analisarDocumentos({
      fileUrls: [],
      contexto: { ...form, ...prefill },
    });

    if (!dados?.campos) return;

    // Auto-preencher campos com alta confiança (>= 85%)
    setForm((prev) => {
      const next = { ...prev };
      for (const [key, campo] of Object.entries(dados.campos)) {
        if (!campo?.valor) continue;
        if ((campo.confianca || 0) < 85 && campo.estado !== 'preenchido_ia') continue;

        const val = campo.valor;
        switch (key) {
          case 'fornecedor_nome':
            if (!prev.fornecedor_nome?.trim() || prev.fornecedor_nome === 'Fornecedor não informado')
              next.fornecedor_nome = String(val);
            break;
          case 'fornecedor_cpf_cnpj':
            if (!prev.fornecedor_cnpj?.trim())
              next.fornecedor_cnpj = String(val);
            break;
          case 'nf_numero':
            if (!prev.nf_numero) next.nf_numero = String(val);
            break;
          case 'nf_valor_liquido':
            // Valor líquido do recibo/XML tem PRIORIDADE sobre valor total
            if (!toNumber(prev.valor_solicitado) || (campo.confianca || 0) >= 80) {
              const v = typeof val === 'number' ? val : toNumber(val);
              if (v > 0) {
                next.valor_solicitado = v;
                next.valor_total = v;
                next.valor = v;
                next.nf_valor_total = v;
              }
            }
            break;
          case 'nf_valor_total':
            // Só preenche com valor total se o líquido não foi definido
            if (!toNumber(prev.valor_solicitado)) {
              const v = typeof val === 'number' ? val : toNumber(val);
              next.valor_solicitado = v;
              next.valor_total = v;
              next.valor = v;
              next.nf_valor_total = v;
            }
            break;
          case 'nf_data_emissao':
            if (!prev.nf_data_emissao) next.nf_data_emissao = String(val).slice(0, 10);
            break;
          case 'descricao_servico':
            if (!prev.descricao_item?.trim() || prev.descricao_item === 'Fornecedor não informado')
              next.descricao_item = String(val);
            break;
          case 'centro_custo':
            if (!prev.centro_custo?.trim())
              next.centro_custo = String(val);
            break;
          case 'categoria':
            if (!prev.categoria?.trim())
              next.categoria = String(val);
            break;
          case 'tipo_gasto':
            if (!prev.tipo_gasto?.trim())
              next.tipo_gasto = String(val);
            break;
          case 'rubrica':
            if (!prev.rubrica_id && val?.id) {
              next.rubrica_id = val.id;
              next.rubrica_nome = val.nome || '';
            }
            break;
          case 'meta':
            if (!prev.meta_id?.trim())
              next.meta_id = String(val);
            break;
          case 'meio_pagamento':
            if (!prev.meio_pagamento?.trim())
              next.meio_pagamento = String(val);
            break;
          case 'dados_bancarios':
            if (!prev.detalhe_pagamento?.trim())
              next.detalhe_pagamento = String(val);
            break;
          case 'chave_pix':
            if (!prev.detalhe_pagamento?.trim())
              next.detalhe_pagamento = String(val);
            break;
          case 'observacoes':
            if (!prev.observacoes?.trim())
              next.observacoes = String(val);
            break;
        }
      }
      return next;
    });

    smartToast.success(`${dados.resumo?.preenchidos || 0} campos preenchidos, ${dados.resumo?.sugeridos || 0} sugeridos para confirmação.`);
  }, [prefill?.id, aiPreenchido, aiAnalisando, form, analisarDocumentos]);

  useEffect(() => {
    if (!prefill?.id) return;
    if (aiPreenchido || aiAnalisando) return;

    const precisaPreencher =
      !form.fornecedor_cnpj?.trim() ||
      !form.fornecedor_nome?.trim() ||
      form.fornecedor_nome === 'Fornecedor não informado' ||
      !toNumber(form.valor_solicitado) ||
      !form.centro_custo?.trim() ||
      !form.rubrica_id?.trim();

    if (!precisaPreencher) return;

    const temArquivo =
      prefill.nf_pdf_url ||
      prefill.nota_fiscal_url ||
      prefill.arquivo_url ||
      prefill.file_url ||
      prefill.documento_url ||
      prefill.orcamento_url ||
      prefill.intake_id ||
      prefill.documento_intake_id;

    if (!temArquivo) return;

    triggerAnalise();
  }, [prefill?.id, form.fornecedor_cnpj, form.fornecedor_nome, form.valor_solicitado, form.centro_custo, form.rubrica_id]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    marcarManual(key)
  }

  const valorNumerico = toNumber(form.valor_solicitado)
  const totalRateado = rateio.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0)
  const diferencaRateio = Math.abs(valorNumerico - totalRateado)
  const rateioValido = dividirEntreMuseus
    ? diferencaRateio < 0.01 && rateio.some((r) => parseFloat(r.valor) > 0)
    : true

  function handleRateioValor(museu, valor) {
    setRateio((prev) => prev.map((r) => (r.museu === museu ? { ...r, valor } : r)))
  }

  function distribuirIgualmente() {
    const valorPorMuseu = (valorNumerico / MUSEUS_RATEIO.length).toFixed(2)
    setRateio(MUSEUS_RATEIO.map((m) => ({ museu: m, valor: valorPorMuseu })))
  }

  function getRateioPayload() {
    if (!dividirEntreMuseus) return null
    return rateio
      .filter((r) => parseFloat(r.valor) > 0)
      .map((r) => ({ museu: r.museu, valor: parseFloat(r.valor) }))
  }

  function buildPayload(statusOverride = null) {
    const fileUrl =
      attachedFile?.url ||
      form.file_url ||
      form.arquivo_url ||
      form.nota_fiscal_url ||
      form.orcamento_url ||
      form.link_proposta ||
      ''

    const fileName =
      attachedFile?.name ||
      form.arquivo_nome ||
      ''

    const fileKind =
      attachedFile?.kind ||
      form.arquivo_tipo ||
      getDocumentKind(fileName)

    const valor = toNumber(form.valor_solicitado)

    return {
      ...form,
      valor_solicitado: valor,
      valor_total: valor,
      valor,
      nf_valor_total: valor,
      fornecedor_cpf_cnpj: form.fornecedor_cnpj,
      nf_emitente_nome: form.fornecedor_nome,
      nf_emitente_cpf_cnpj: form.fornecedor_cnpj,
      status: statusOverride || prefill?.status || 'SOLICITADO',
      file_url: fileUrl,
      arquivo_url: fileUrl,
      documento_url: fileUrl,
      nota_fiscal_url: fileUrl,
      nf_pdf_url: fileKind === 'pdf_nf' ? fileUrl : form.nf_pdf_url || fileUrl,
      orcamento_url: fileUrl,
      link_proposta: form.link_proposta || fileUrl,
      arquivo_nome: fileName,
      arquivo_tipo: fileKind,
      tipo_origem: form.tipo_origem || 'ENTRADA_UNICA',
      origem: form.origem || 'EntradaUnica',
      centro_custo: dividirEntreMuseus ? 'Rateado' : form.centro_custo,
      rateio_museus: getRateioPayload(),
      rubrica_mes_inicial: form.rubrica_mes_inicial !== '' ? Number(form.rubrica_mes_inicial) : undefined,
      rubrica_mes_final: form.rubrica_mes_final !== '' ? Number(form.rubrica_mes_final) : undefined,
    }
  }

  async function createAttachmentForPurchase(purchase, payload) {
    const fileUrl =
      payload.file_url ||
      payload.arquivo_url ||
      payload.nota_fiscal_url ||
      payload.orcamento_url

    if (!purchase?.id || !fileUrl) return

    try {
      await base44.entities.Attachment.create({
        file_url: fileUrl,
        url: fileUrl,
        file_name: payload.arquivo_nome || attachedFile?.name || 'arquivo_solicitacao',
        name: payload.arquivo_nome || attachedFile?.name || 'arquivo_solicitacao',
        description: 'Arquivo anexado em solicitação de compras',
        purchase_id: purchase.id,
        purchase_request_id: purchase.id,
        solicitacao_id: purchase.id,
        document_intake_id: payload.documento_intake_id || payload.intake_id || '',
        nf_categoria: 'nota_fiscal',
        nf_tipo_documento: payload.arquivo_tipo || getDocumentKind(payload.arquivo_nome),
        nf_numero: payload.nf_numero || '',
        nf_valor_total: payload.nf_valor_total || payload.valor_solicitado || 0,
        nf_data_emissao: payload.nf_data_emissao || '',
        nf_emitente_nome: payload.nf_emitente_nome || payload.fornecedor_nome || '',
        nf_emitente_cpf_cnpj: payload.nf_emitente_cpf_cnpj || payload.fornecedor_cpf_cnpj || '',
        rubrica_id: payload.rubrica_id || '',
        rubrica_nome: payload.rubrica_nome || '',
        uploadado_por: currentUser?.email,
        created_by: currentUser?.email
      })
    } catch (error) {
      console.warn('Não foi possível criar Attachment vinculado à solicitação:', error)
    }
  }

  async function tryNotifyPurchaseSubmitted(purchase) {
    if (!purchase?.id) return
    await notifyPurchaseCreated(purchase, currentUser).catch((error) => {
      console.warn('Falha ao notificar solicitação criada:', error)
    })
  }

  async function handleSave() {
    if (!form.descricao_item?.trim()) {
      smartToast.error('Informe a descrição do item.')
      return
    }

    if (!form.valor_solicitado) {
      smartToast.error('Informe o valor.')
      return
    }

    if (!form.rubrica_id?.trim()) {
      smartToast.error('Selecione uma rubrica antes de salvar.')
      return
    }

    if (!form.meta_id?.trim()) {
      smartToast.error('Selecione uma meta orçamentária antes de salvar.')
      return
    }
    if (metaOcultaNoTerceiroAditivo({ id: form.meta_id, nome: form.meta_id })) {
      smartToast.error('A meta selecionada não está disponível no sistema.')
      return
    }

    if (!dividirEntreMuseus && !form.centro_custo?.trim()) {
      smartToast.error('Selecione um centro de custo antes de salvar.')
      return
    }
    if (dividirEntreMuseus && !rateioValido) {
      smartToast.error('Ajuste o rateio entre museus — a soma deve ser igual ao valor total.')
      return
    }

    if (!form.fornecedor_nome?.trim() || form.fornecedor_nome === 'Fornecedor não informado') {
      smartToast.error('Informe o nome do fornecedor antes de salvar.')
      return
    }

    // Validar duplicidade apenas ao criar nova solicitação
    if (!isEditing && !ignoreDuplicate) {
      try {
        const payload = buildPayload('SOLICITADO')
        const duplicate = await findDuplicatePurchaseRequest({
          base44,
          payload,
          currentId: prefill?.id
        })
        if (duplicate) {
          setDuplicateWarning(duplicate)
          return
        }
      } catch (err) {
        console.warn('Erro ao verificar duplicidade:', err)
      }
    }

    setSaving(true)

    try {
      if (isEditing) {
        const payload = buildPayload(prefill?.status || 'SOLICITADO')

        await base44.entities.PurchaseRequest.update(prefill.id, payload)
        await createAttachmentForPurchase({ id: prefill.id }, payload)

        // Se rubrica mudou e já estava debitada, reequilibra os saldos
        const rubricaMudou = form.rubrica_id && form.rubrica_id !== prefill?.rubrica_id
        const jaDebitado = !!prefill?.rubrica_debitada_em
        if (rubricaMudou && jaDebitado && form.rubrica_id) {
          await base44.functions.invoke('purchaseActions', {
            action: 'trocar_rubrica',
            purchaseId: prefill.id,
            novaRubricaId: form.rubrica_id,
            novoValor: toNumber(form.valor_solicitado),
          })
        }

        smartToast.success('Solicitação atualizada.')
      } else {
        const payload = buildPayload('SOLICITADO')

        const created = await base44.entities.PurchaseRequest.create({
          ...payload,
          status: 'SOLICITADO',
          data_solicitacao: new Date().toISOString(),
          solicitante_nome: currentUser?.full_name || currentUser?.name || currentUser?.email || '',
          solicitante_email: currentUser?.email || '',
          requester_email: currentUser?.email || '',
          user_email: currentUser?.email || '',
          created_by: currentUser?.email
        })

        await createAttachmentForPurchase(created, payload)
        await tryNotifyPurchaseSubmitted(created)

        smartToast.success('Solicitação criada e encaminhada para aprovação.')
      }

      onSuccess?.()
    } catch (err) {
      smartToast.error('Erro ao salvar', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function checkNFDuplicate() {
    const cnpj = String(form.fornecedor_cnpj || form.nf_emitente_cpf_cnpj || '').replace(/\D/g, '')
    const nfNum = String(form.nf_numero || '').trim()
    if (!cnpj || !nfNum) return null

    try {
      const res = await base44.functions.invoke('validateNFDuplicate', {
        nf_numero: nfNum,
        nf_emitente_cpf_cnpj: cnpj,
        nf_valor_total: toNumber(form.valor_solicitado),
        nf_data_emissao: form.nf_data_emissao || '',
        exclude_id: prefill?.id || '',
      })
      return res?.data || res || null
    } catch (err) {
      console.warn('Verificação NF duplicidade falhou:', err)
      return null
    }
  }

  async function handleApprove() {
    const rubricaId = form.rubrica_id || prefill?.rubrica_id
    if (!rubricaId) {
      smartToast.error('Vincule uma rubrica antes de aprovar.')
      return
    }

    const metaId = form.meta_id || prefill?.meta_id
    if (!metaId?.trim()) {
      smartToast.error('Selecione uma meta orçamentária antes de aprovar.')
      return
    }
    if (metaOcultaNoTerceiroAditivo({ id: metaId, nome: metaId })) {
      smartToast.error('A meta selecionada não está disponível no sistema.')
      return
    }

    // Verificar duplicidade de NF antes de aprovar (se ainda não foi bypass)
    if (!nfDuplicateBypass) {
      setCheckingNfDuplicate(true)
      const dupResult = await checkNFDuplicate()
      setCheckingNfDuplicate(false)

      if (dupResult?.isDuplicate) {
        setNfDuplicateResult(dupResult)
        // Se bloqueante, não prosseguir — usuário precisa confirmar explicitamente
        if (dupResult.isBlocking) {
          return
        }
        // Se apenas suspeita, mostrar alerta mas pode continuar se confirmar
        if (!nfDuplicateBypass) return
      }
    }

    setApproving(true)

    try {
      // ATUALIZA primeiro os campos do formulário (se houve edição)
      if (form.descricao_item !== prefill?.descricao_item ||
          form.fornecedor_nome !== prefill?.fornecedor_nome ||
          form.rubrica_id !== prefill?.rubrica_id ||
          form.centro_custo !== prefill?.centro_custo ||
          form.meta_id !== prefill?.meta_id) {
        await base44.entities.PurchaseRequest.update(prefill.id, buildPayload(prefill?.status))
      }

      // Usa purchaseActions para aprovar — backend faz TUDO: débito, status, backup, auditoria
      const novaRubricaId = form.rubrica_id !== prefill?.rubrica_id ? form.rubrica_id : undefined
      const approveRes = await base44.functions.invoke('purchaseActions', {
        action: 'aprovar',
        purchaseId: prefill.id,
        novaRubricaId: novaRubricaId || undefined,
        aprovadorEmail: currentUser?.email || '',
        aprovadorNome: currentUser?.full_name || currentUser?.email || '',
        bypass_duplicate_check: nfDuplicateBypass,
      })

      const result = approveRes?.data || approveRes

      // Backend pode ter retornado 409 por duplicidade
      if (result?.blocked_by_duplicate) {
        setNfDuplicateResult(result.duplicate)
        setApproving(false)
        smartToast.error('Aprovação bloqueada: nota fiscal possivelmente duplicada.')
        return
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao aprovar no backend.')
      }

      await notifyPurchaseApproved({
        ...prefill,
        ...buildPayload('APROVADO_COORD'),
        status: 'APROVADO_COORD',
      }, currentUser).catch((error) => {
        console.warn('Falha ao notificar aprovação:', error)
      })

      const rubricaInfo = form.rubrica_nome || prefill?.rubrica_nome || ''
      smartToast.success(`✅ Solicitação aprovada!${rubricaInfo ? ` Valor debitado da rubrica "${rubricaInfo}".` : ''} Backup no Drive iniciado.`)
      onSuccess?.()
    } catch (err) {
      // Checar se o erro é de duplicidade (409)
      if (err?.response?.status === 409 || String(err?.message || '').includes('bloqueada')) {
        smartToast.error('Aprovação bloqueada: ' + (err?.message || 'nota fiscal possivelmente duplicada.'))
      } else {
        smartToast.error('Erro ao aprovar', err.message)
      }
      setApproving(false)
      return
    } finally {
      setApproving(false)
    }
  }

  async function handleReturn() {
    if (!returnComment.trim()) {
      smartToast.error('Informe o motivo da devolução.')
      return
    }

    setReturning(true)

    try {
      await base44.entities.PurchaseRequest.update(prefill.id, {
        status: 'DEVOLVIDO',
        comentario_devolucao: returnComment,
        aprov_coord_comentario: returnComment
      })

      await notifyPurchaseReturned({
        ...prefill,
        status: 'DEVOLVIDO',
        comentario_devolucao: returnComment,
      }, currentUser).catch((error) => {
        console.warn('Falha ao notificar devolução de compra:', error)
      })

      smartToast.success('Solicitação devolvida.')
      onSuccess?.()
    } catch (err) {
      smartToast.error('Erro ao devolver', err.message)
    } finally {
      setReturning(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que deseja deletar esta solicitação? Esta ação é irreversível.')) return

    setDeleting(true)

    try {
      await base44.entities.PurchaseRequest.delete(prefill.id)
      smartToast.success('Solicitação deletada.')
      onSuccess?.()
    } catch (err) {
      smartToast.error('Erro ao deletar', err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSendNotification() {
    if (!prefill?.id) {
      smartToast.error('Solicitação precisa estar salva antes de enviar notificação.')
      return
    }

    setSendingNotification(true)

    try {
      const result = await base44.functions.invoke('enqueuePurchaseNotification', {
        purchaseId: prefill.id
      })

      if (result?.already_queued) {
        smartToast.info('Esta solicitação já está no próximo lote de notificações.')
      } else if (result?.success) {
        const slotDisplay = result.batchSlot === 'manha' ? '09:00' : '16:15'
        const scheduledDate = new Date(result.batchScheduledAt)
        smartToast.success(
          `Solicitação adicionada ao lote de ${result.batchSlot}. Envio agendado para ${scheduledDate.toLocaleDateString('pt-BR')} às ${slotDisplay}.`
        )
      } else {
        smartToast.error('Erro ao adicionar à fila de notificação.')
      }
    } catch (error) {
      smartToast.error('Erro ao enviar notificação: ' + (error?.message || 'desconhecido'))
    } finally {
      setSendingNotification(false)
      setShowNotificationConfirm(false)
    }
  }

  async function handleDeleteDuplicateNF(matches) {
    if (!matches?.length) return;
    if (!window.confirm(`Tem certeza que deseja deletar ${matches.length} solicitação(ões) duplicada(s)? Esta ação é irreversível.`)) return;

    setDeletingDuplicate(true);
    try {
      for (const m of matches) {
        if (!m.id) continue;
        const pr = await base44.entities.PurchaseRequest.get(m.id).catch(() => null);
        if (pr) await deletePurchaseRequest(pr);
        else await base44.entities.PurchaseRequest.delete(m.id).catch(() => {});
      }
      toast.success('Solicitação(ões) duplicada(s) removida(s) com sucesso.');
      setNfDuplicateResult(null);
      setNfDuplicateBypass(false);
      onClose?.();
      onSuccess?.();
    } catch (e) {
      toast.error('Erro ao remover duplicata: ' + (e?.message || 'desconhecido'));
    } finally {
      setDeletingDuplicate(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]

    if (!file) return

    setUploadingFile(true)

    try {
      const result = await base44.integrations.Core.UploadFile({ file })
      const fileUrl = result?.file_url || result?.url || result?.data?.file_url || result?.data?.url || ''

      if (!fileUrl) throw new Error('Upload concluído sem URL de arquivo.')

      const fileKind = getDocumentKind(file.name)

      setAttachedFile({
        name: file.name,
        url: fileUrl,
        kind: fileKind
      })

      setField('file_url', fileUrl)
      setField('arquivo_url', fileUrl)
      setField('documento_url', fileUrl)
      setField('nota_fiscal_url', fileUrl)
      setField('orcamento_url', fileUrl)
      setField('link_proposta', fileUrl)
      setField('arquivo_nome', file.name)
      setField('arquivo_tipo', fileKind)

      if (fileKind === 'pdf_nf') {
        setField('nf_pdf_url', fileUrl)
      }

      if (isEditing) {
        await base44.entities.PurchaseRequest.update(prefill.id, {
          file_url: fileUrl,
          arquivo_url: fileUrl,
          documento_url: fileUrl,
          nota_fiscal_url: fileUrl,
          nf_pdf_url: fileKind === 'pdf_nf' ? fileUrl : fileUrl,
          orcamento_url: fileUrl,
          link_proposta: fileUrl,
          arquivo_nome: file.name,
          arquivo_tipo: fileKind
        })

        await createAttachmentForPurchase({ id: prefill.id }, {
          ...form,
          file_url: fileUrl,
          arquivo_nome: file.name,
          arquivo_tipo: fileKind
        })

        smartToast.success('Arquivo anexado.')
      } else {
        smartToast.success('Arquivo carregado. Será salvo junto com a solicitação.')
      }
    } catch (err) {
      smartToast.error('Erro ao enviar arquivo', err.message)
    } finally {
      setUploadingFile(false)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // ── ITEMS DE META — carregadas do banco (ProjectMeta) ──
  const metaItems = metas.map((m) => ({ value: m.id, label: m.nome || m.label || m.id }));

  // ── RUBRICAS FILTRADAS ──
  const filteredRubricItems = useMemo(() => {
    const ativas = rubricas.filter((r) => r?.ativo !== false && r?.id);
    if (ativas.length === 0) return [];

    // Filtro por meta: não filtra rubricas por meta_id (são códigos diferentes dos grupos)
    const matchMeta = () => true;

    // Filtro por centro de custo
    const matchCentro = (r) => {
      if (!form.centro_custo) return true;
      const cc = String(form.centro_custo).toUpperCase().replace('MAB', 'MHAB').trim();
      const rc = String(r.museu_codigo || '').toUpperCase().replace('MAB', 'MHAB').trim();
      if (cc === 'NOTURNO PAMPULHA') {
        return r.escopo_orcamentario === 'NOTURNO' && String(r.centro_custo || '').toUpperCase() === 'NOTURNO PAMPULHA';
      }
      if (cc === 'NOTURNO NOS MUSEUS 2026' || cc === 'NOTURNO 2026') {
        return r.escopo_orcamentario === 'NOTURNO' && String(r.centro_custo || '').toUpperCase() !== 'NOTURNO PAMPULHA';
      }
      if (['MIS', 'MUMO', 'MHAB'].includes(cc)) return rc === cc;
      return true; // centros genéricos mostram tudo
    };

    let filtradas = ativas.filter(matchMeta).filter(matchCentro);
    if (filtradas.length === 0) filtradas = ativas;

    // Garante que a rubrica atual aparece mesmo fora dos filtros
    const atual = form.rubrica_id ? ativas.find((r) => r.id === form.rubrica_id) : null;
    if (atual && !filtradas.some((r) => r.id === form.rubrica_id)) {
      filtradas = [atual, ...filtradas];
    }

    return filtradas.map((r) => ({
      id: r.id,
      label: r.rubrica || r.nome || r.id,
    }));
  }, [rubricas, form.meta_id, form.centro_custo, form.rubrica_id]);

  const existingFileUrl =
    attachedFile?.url ||
    form.file_url ||
    form.arquivo_url ||
    form.nota_fiscal_url ||
    form.orcamento_url ||
    form.documento_url ||
    form.comprovante_url ||
    form.link_proposta ||
    prefill?.nota_fiscal_url ||
    prefill?.orcamento_url ||
    prefill?.comprovante_url ||
    prefill?.link_proposta

  return (
    <>
      <DuplicatePurchaseDetectedModal
        duplicate={duplicateWarning}
        onClose={() => setDuplicateWarning(null)}
        onIgnore={() => {
          // Ignorar a duplicata: fecha o modal e não cria nova solicitação
          setDuplicateWarning(null);
          setIgnoreDuplicate(true);
          onClose?.();
        }}
        onRemoveDuplicate={async () => {
          // Remove a solicitação duplicada existente e fecha o modal
          if (!duplicateWarning?.id) return;
          try {
            const pr = await base44.entities.PurchaseRequest.get(duplicateWarning.id).catch(() => null);
            if (pr) await deletePurchaseRequest(pr);
            else await base44.entities.PurchaseRequest.delete(duplicateWarning.id).catch(() => {});
            toast.success('Solicitação duplicada removida.');
          } catch (e) {
            toast.error('Erro ao remover duplicata: ' + (e?.message || 'desconhecido'));
          }
          setDuplicateWarning(null);
          setIgnoreDuplicate(true);
          onClose?.();
        }}
        onProceed={() => {
          setIgnoreDuplicate(true)
          setDuplicateWarning(null)
          setSaving(true)
          const payload = buildPayload('SOLICITADO')
          base44.entities.PurchaseRequest.create({
            ...payload,
            status: 'SOLICITADO',
            data_solicitacao: new Date().toISOString(),
            solicitante_nome: currentUser?.full_name || currentUser?.name || currentUser?.email || '',
            solicitante_email: currentUser?.email || '',
            requester_email: currentUser?.email || '',
            user_email: currentUser?.email || '',
            created_by: currentUser?.email
          }).then(async (created) => {
            await createAttachmentForPurchase(created, payload)
            await tryNotifyPurchaseSubmitted(created)
            smartToast.success('Solicitação criada (duplicidade detectada e confirmada).')
            onSuccess?.()
            setSaving(false)
          }).catch((err) => {
            smartToast.error('Erro ao salvar', err.message)
            setSaving(false)
          })
        }}
      />

      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="!max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEditing ? 'Editar Solicitação' : 'Nova Solicitação'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1">
          {/* ── RESUMO DA ANÁLISE UNIFICADA DE DOCUMENTOS ── */}
          {(dadosAnalise || aiAnalisando) && (
            <AnalysisSummary
              dadosAnalise={dadosAnalise}
              analisando={aiAnalisando}
              fieldStates={fieldStates}
              onReanalisar={() => {
                setAiPreenchido(false);
                reanalisarDocumentos({
                  fileUrls: [],
                  contexto: { ...form, ...prefill },
                });
              }}
            />
          )}

          {isEditing && prefill?.status && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                Status atual:
              </span>

              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isApproved
                    ? 'bg-green-100 text-green-700'
                    : statusKey === 'RECUSADO'
                      ? 'bg-red-100 text-red-700'
                      : statusKey === 'DEVOLVIDO'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                }`}
              >
                {prefill.status}
              </span>
            </div>
          )}

          {/* ── ALERTA DE DUPLICIDADE DA IA (do intake original) ── */}
          {alertasDuplicidade.length > 0 && !duplicidadeConfirmada && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-700">Alertas da análise de IA</span>
              </div>
              <div className="space-y-1.5">
                {alertasDuplicidade.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{a.mensagem || String(a)}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDuplicidadeConfirmada(true)}
                className="text-xs text-gray-500 underline hover:text-gray-700"
              >
                Confirmar que não é duplicata
              </button>
            </div>
          )}

          {/* ── ALERTA DE DUPLICIDADE REAL (verificação no banco ao aprovar) ── */}
          {nfDuplicateResult && (
            <NFDuplicateBlockAlert
              result={nfDuplicateResult}
              isCoord={isCoordenador}
              bypassConfirmed={nfDuplicateBypass}
              onConfirmBypass={() => setNfDuplicateBypass(true)}
              onDeleteDuplicate={handleDeleteDuplicateNF}
              deletingDuplicate={deletingDuplicate}
            />
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Descrição do item *
            </label>

            <Textarea
              rows={2}
              value={form.descricao_item}
              onChange={(e) => setField('descricao_item', e.target.value)}
              placeholder="Descreva o item ou serviço..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Meta
              </label>

              <SearchableSelect
                value={form.meta_id}
                onValueChange={(v) => {
                  setField('meta_id', v)
                  setField('rubrica_id', '')
                  setField('rubrica_nome', '')
                  if (v !== 'MC3A-EXTRA') {
                    setField('meta_extra_descricao', '')
                  }
                }}
                items={metaItems}
                placeholder="Selecione"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Categoria
              </label>

              <Select value={form.categoria} onValueChange={(v) => setField('categoria', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}

                  {form.categoria && !CATEGORIAS.includes(form.categoria) && (
                    <SelectItem value={form.categoria}>
                      {form.categoria}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Centro de custo</label>
              <div className="flex flex-col gap-1.5 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="rateio_tipo" checked={!dividirEntreMuseus} onChange={() => setDividirEntreMuseus(false)} className="accent-slate-700" />
                  <span className="text-gray-700">Centro único</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="rateio_tipo" checked={dividirEntreMuseus} onChange={() => setDividirEntreMuseus(true)} className="accent-slate-700" />
                  <span className="text-gray-700">Dividir entre museus (MHAB, MIS, MUMO)</span>
                </label>
              </div>

              {!dividirEntreMuseus && (
                <Select value={form.centro_custo} onValueChange={(v) => setField('centro_custo', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CENTROS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    {form.centro_custo && !CENTROS.includes(form.centro_custo) && (
                      <SelectItem value={form.centro_custo}>{form.centro_custo}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              {dividirEntreMuseus && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">A soma deve ser igual ao valor total da NF.</span>
                    <button type="button" onClick={distribuirIgualmente} className="text-xs text-blue-600 underline hover:text-blue-800">Dividir igualmente</button>
                  </div>
                  {rateio.map((r) => (
                    <div key={r.museu} className="flex items-center gap-2">
                      <span className="w-12 text-sm font-medium text-slate-700 shrink-0">{r.museu}</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <input
                          type="number" min="0" step="0.01" placeholder="0,00"
                          value={r.valor}
                          onChange={(e) => handleRateioValor(r.museu, e.target.value)}
                          className="w-full rounded-md border border-input bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  ))}
                  <div className={`flex justify-between text-sm font-medium px-1 py-1.5 rounded border ${rateioValido ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    <span>Total rateado:</span>
                    <span>R$ {totalRateado.toFixed(2)}{valorNumerico > 0 ? ` / R$ ${valorNumerico.toFixed(2)}` : ''}</span>
                  </div>
                  {!rateioValido && valorNumerico > 0 && (
                    <p className="text-xs text-red-500">Diferença de R$ {diferencaRateio.toFixed(2)} — ajuste antes de salvar.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Rubrica
              </label>

              <SearchableSelect
                value={form.rubrica_id}
                onValueChange={(v) => {
                  const r = rubricas.find((x) => x.id === v)
                  setField('rubrica_id', v)
                  setField('rubrica_nome', r?.rubrica || r?.nome || '')
                  if (r?.museu_codigo && r.museu_codigo !== 'GERAL') {
                    setField('centro_custo', r.museu_codigo === 'MIS' ? 'MIS' : r.museu_codigo === 'MUMO' ? 'MUMO' : r.museu_codigo === 'MHAB' ? 'MHAB' : form.centro_custo)
                  }
                  if (r?.escopo_orcamentario === 'NOTURNO') {
                    const isPampulha = String(r.centro_custo || '').toUpperCase() === 'NOTURNO PAMPULHA';
                    setField('centro_custo', isPampulha ? 'Noturno Pampulha' : 'Noturno nos Museus 2026')
                  }
                  // Sugestão silenciosa de mês inicial/final a partir da rubrica (só se vazio)
                  if (r?.periodo_frequencia && !form.rubrica_mes_inicial) {
                    setField('rubrica_mes_inicial', r.periodo_frequencia)
                  }
                  if (r?.numero_parcelas_unidades && !form.rubrica_mes_final) {
                    const parsed = parseInt(r.numero_parcelas_unidades, 10)
                    if (!isNaN(parsed)) setField('rubrica_mes_final', parsed)
                  }
                  // Não sobrescreve meta_id ao selecionar rubrica (meta usa código próprio)
                }}
                items={filteredRubricItems}
                placeholder="Selecione"
              />
            </div>
          </div>

          {/* ── MÊS INICIAL / MÊS FINAL (Plano de Trabalho) ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Mês Inicial (Plano de Trabalho)</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.rubrica_mes_inicial}
                onChange={(e) => setField('rubrica_mes_inicial', e.target.value)}
                placeholder="19"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Mês Final (Plano de Trabalho)</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.rubrica_mes_final}
                onChange={(e) => setField('rubrica_mes_final', e.target.value)}
                placeholder="28"
              />
            </div>
            <p className="col-span-2 text-xs text-gray-400 -mt-2">Conforme a coluna 'Nº Parcelas/Meses' do Plano de Trabalho oficial.</p>
          </div>

          {form.meta_id === 'MC3A-EXTRA' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Nome da Meta <span className="text-red-500">*</span>
              </label>

              <Input
                value={form.meta_extra_descricao}
                onChange={(e) => setField('meta_extra_descricao', e.target.value)}
                placeholder="Descreva o nome ou título da meta extra..."
              />

              <p className="text-xs text-gray-400">
                Este nome será exibido no lugar de "MC3A-EXTRA" em toda a plataforma.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Fornecedor / Nome
              </label>

              <Input
                value={form.fornecedor_nome}
                onChange={(e) => setField('fornecedor_nome', e.target.value)}
                placeholder="Nome ou razão social"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                CPF / CNPJ
              </label>

              <Input
                value={form.fornecedor_cnpj}
                onChange={(e) => setField('fornecedor_cnpj', e.target.value)}
                placeholder="Somente dígitos"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Número da NF
              </label>

              <Input
                value={form.nf_numero}
                onChange={(e) => setField('nf_numero', e.target.value)}
                placeholder="Número da nota fiscal"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Data de emissão
              </label>

              <Input
                type="date"
                value={form.nf_data_emissao}
                onChange={(e) => setField('nf_data_emissao', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Valor solicitado (R$) *
              </label>

              <Input
                type="number"
                value={form.valor_solicitado}
                onChange={(e) => {
                  setField('valor_solicitado', e.target.value)
                  setField('valor_total', e.target.value)
                  setField('valor', e.target.value)
                  setField('nf_valor_total', e.target.value)
                }}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Meio de pagamento
              </label>

              <Select value={form.meio_pagamento} onValueChange={(v) => setField('meio_pagamento', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {MEIOS_PAGAMENTO.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Dados bancários / Chave PIX
            </label>

            <Input
              value={form.detalhe_pagamento}
              onChange={(e) => setField('detalhe_pagamento', e.target.value)}
              placeholder="Banco, agência, conta ou chave PIX"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Observações
            </label>

            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setField('observacoes', e.target.value)}
              placeholder="Informações adicionais..."
            />
          </div>

          {/* ── ARQUIVOS VINCULADOS (somente consulta) ── */}
          {isEditing && (() => {
            // Coleta todas as URLs disponíveis no prefill + attachments carregados
            const urlsFromPrefill = [
              prefill?.nf_pdf_url && { label: 'PDF da Nota Fiscal', url: prefill.nf_pdf_url, tipo: 'pdf_nf' },
              prefill?.nf_xml_url && { label: 'XML da NF-e', url: prefill.nf_xml_url, tipo: 'xml_nf' },
              prefill?.comprovante_url && { label: 'Comprovante de pagamento', url: prefill.comprovante_url, tipo: 'comprovante' },
              prefill?.orcamento_url && { label: 'Orçamento / Proposta', url: prefill.orcamento_url, tipo: 'orcamento' },
              prefill?.nota_fiscal_url && !prefill?.nf_pdf_url && { label: 'Nota Fiscal', url: prefill.nota_fiscal_url, tipo: 'pdf_nf' },
              prefill?.arquivo_url && !prefill?.nf_pdf_url && !prefill?.nota_fiscal_url && { label: prefill.arquivo_nome || 'Arquivo anexado', url: prefill.arquivo_url, tipo: 'outro' },
              prefill?.file_url && !prefill?.nf_pdf_url && !prefill?.nota_fiscal_url && !prefill?.arquivo_url && { label: prefill.arquivo_nome || 'Arquivo', url: prefill.file_url, tipo: 'outro' },
            ].filter(Boolean)

            const urlsFromAttachments = linkedAttachments.map((a) => ({
              label: a.file_name || a.name || a.nf_nome_renomeado || 'Anexo',
              url: a.file_url || a.url || '',
              tipo: a.nf_tipo_documento || (String(a.file_name || '').endsWith('.xml') ? 'xml_nf' : 'pdf_nf'),
              nf_numero: a.nf_numero,
            })).filter((a) => a.url)

            // Deduplica por URL
            const seen = new Set()
            const allFiles = [...urlsFromPrefill, ...urlsFromAttachments].filter((f) => {
              if (!f.url || seen.has(f.url)) return false
              seen.add(f.url)
              return true
            })

            const badgeColor = (tipo) => {
              if (tipo === 'xml_nf') return 'bg-purple-100 text-purple-700'
              if (tipo === 'pdf_nf') return 'bg-blue-100 text-blue-700'
              if (tipo === 'comprovante') return 'bg-green-100 text-green-700'
              return 'bg-gray-100 text-gray-600'
            }
            const badgeLabel = (tipo) => {
              if (tipo === 'xml_nf') return 'XML'
              if (tipo === 'pdf_nf') return 'PDF'
              if (tipo === 'comprovante') return 'Comprovante'
              return 'Arquivo'
            }

            return (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-800">Arquivos vinculados</span>
                  <span className="text-xs text-blue-400">(somente visualização)</span>
                </div>

                {allFiles.length === 0 ? (
                  <p className="text-xs text-gray-400 pl-1">Nenhum arquivo anexado a esta solicitação.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {allFiles.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                        <span className="flex-1 truncate font-medium">{f.label}</span>
                        {f.nf_numero && <span className="text-gray-400">NF {f.nf_numero}</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeColor(f.tipo)}`}>{badgeLabel(f.tipo)}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── BOTÕES DE IA ── */}
          {(prefill?.id || attachedFile) && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50 text-xs"
                onClick={() => {
                  setAiPreenchido(false);
                  reanalisarDocumentos({
                    fileUrls: [],
                    contexto: { ...form, ...prefill },
                  });
                }}
                disabled={aiAnalisando}
              >
                <Sparkles className="h-3 w-3" />
                {aiAnalisando ? 'Analisando...' : 'Reanalisar documentos'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-200 text-amber-600 hover:bg-amber-50 text-xs"
                onClick={triggerAnalise}
                disabled={aiAnalisando}
              >
                <CheckCircle2 className="h-3 w-3" />
                Preencher campos em falta
              </Button>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
            <label className="text-sm font-medium text-gray-700">
              Arquivo (PDF, XML, proposta)
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xml,.doc,.docx,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileUpload}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 bg-white"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                {uploadingFile ? (
                  <>
                    <Upload className="h-3.5 w-3.5 animate-pulse" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Paperclip className="h-3.5 w-3.5" />
                    Anexar arquivo
                  </>
                )}
              </Button>

              {attachedFile && (
                <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 text-xs text-green-700">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="max-w-[220px] truncate">
                    {attachedFile.name}
                  </span>

                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="ml-1 text-green-500 hover:text-green-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {!attachedFile && existingFileUrl && (
                <a
                  href={existingFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-700 underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Arquivo existente
                </a>
              )}
            </div>

            <p className="text-xs text-gray-400">
              Mesmo padrão da Entrada Única: anexe nota fiscal em PDF, XML, proposta ou documento complementar.
            </p>
          </div>

          {showReturnInput && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <label className="text-sm font-medium text-amber-800">
                Motivo da devolução *
              </label>

              <Textarea
                rows={2}
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                placeholder="Informe o motivo..."
                className="border-amber-300 bg-white"
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                  onClick={handleReturn}
                  disabled={returning}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {returning ? 'Devolvendo...' : 'Confirmar devolução'}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowReturnInput(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div className="flex gap-2">
            {isEditing && isCoordenador && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? 'Deletando...' : 'Deletar'}
              </Button>
            )}

            {canApproveOrReturn && !showReturnInput && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => setShowReturnInput(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Devolver
              </Button>
            )}

            {canApproveOrReturn && (
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                onClick={handleApprove}
                disabled={approving || checkingNfDuplicate}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {checkingNfDuplicate ? 'Verificando NF...' : approving ? 'Aprovando...' : 'Aprovar'}
              </Button>
            )}

            {isEditing && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50"
                onClick={() => setShowNotificationConfirm(true)}
                disabled={sendingNotification}
              >
                <FileText className="h-3.5 w-3.5" />
                {sendingNotification ? 'Enviando...' : 'Enviar Notificação'}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>

            <Button
              size="sm"
              className="bg-black text-white hover:bg-gray-800"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar solicitação'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={showNotificationConfirm}
      onOpenChange={setShowNotificationConfirm}
      title="Adicionar ao lote de notificações?"
      description="Esta solicitação será adicionada ao próximo lote de notificações por e-mail (09:00 ou 16:15). O e-mail não será enviado imediatamente."
      confirmText="Adicionar ao lote"
      cancelText="Cancelar"
      onConfirm={handleSendNotification}
      confirmVariant="blue"
    />
  </>
  )
}