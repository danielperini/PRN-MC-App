import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { base44 } from '@/api/base44Client'
import { CheckCircle2, RotateCcw, Trash2, Paperclip, X, FileText, Upload } from 'lucide-react'
import { useSmartToast } from '@/lib/useSmartToast'
import { findDuplicatePurchaseRequest } from '@/lib/purchaseDuplicateGuard'
import DuplicatePurchaseDetectedModal from './DuplicatePurchaseDetectedModal'
import { notifyPurchaseApproved, notifyPurchaseCreated, notifyPurchaseReturned } from '@/services/notifications/purchaseNotifications'

const CENTROS = ['MUMO','MIS','MHAB','Noturno nos Museus 2026','Publicações','Geral']

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

  const exact = metas.find((m) => m?.id === metaId || m?.nome === metaId)

  if (exact?.nome) return exact.nome

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
    base44.entities.Rubrica.list('ordem_exibicao', 500)
      .then((d) => setRubricas((d || []).filter((r) => r?.ativo !== false)))
      .catch(() => {})

    base44.entities.ProjectMeta.list('ordem', 100)
      .then((d) => {
        const ativos = (d || []).filter((m) => m?.ativo !== false)
        setMetas(ativos)
      })
      .catch(() => setMetas([]))
  }, [])

  useEffect(() => {
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

      const nfNumero =
        firstFilled(
          prefill.nf_numero,
          ia.nf_numero
        )

      const nfData =
        firstFilled(
          prefill.nf_data_emissao,
          ia.nf_data_emissao,
          ia.data_emissao
        )

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

      setForm({
        descricao_item: descricao,
        fornecedor_nome: fornecedorNome,
        fornecedor_cnpj: fornecedorCnpj,
        fornecedor_contato: prefill.fornecedor_contato || '',
        centro_custo: firstFilled(prefill.centro_custo, ia.centro_custo_sugerido, ia.centro_custo),
        rubrica_id: firstFilled(prefill.rubrica_id, ia.rubrica_id, ia.rubrica_id_sugerida),
        rubrica_nome: firstFilled(prefill.rubrica_nome, ia.rubrica_nome_sugerida, ia.rubrica_nome),
        meta_id: normalizeMetaValue(firstFilled(prefill.meta_id, ia.meta_id, ia.meta_sugerida), metas),
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
  }, [prefill, metas])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
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
      origem: form.origem || 'EntradaUnica'
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

  async function handleApprove() {
    const rubricaId = form.rubrica_id || prefill?.rubrica_id
    if (!rubricaId) {
      smartToast.error('Vincule uma rubrica antes de aprovar.')
      return
    }

    setApproving(true)

    try {
      // Salva metadados da aprovação primeiro
      await base44.entities.PurchaseRequest.update(prefill.id, {
        ...buildPayload('APROVADO_COORD'),
        aprov_coord_nome: currentUser?.full_name || currentUser?.email,
        aprov_coord_data: new Date().toISOString().split('T')[0]
      })

      // Usa purchaseActions para aprovar — trata troca de rubrica corretamente
      const novaRubricaId = form.rubrica_id !== prefill?.rubrica_id ? form.rubrica_id : undefined
      await base44.functions.invoke('purchaseActions', {
        action: 'aprovar',
        purchaseId: prefill.id,
        novaRubricaId: novaRubricaId || undefined,
        aprovadorEmail: currentUser?.email || '',
        aprovadorNome: currentUser?.full_name || currentUser?.email || '',
      })

      await notifyPurchaseApproved({
        ...prefill,
        ...buildPayload('APROVADO_COORD'),
        status: 'APROVADO_COORD',
      }, currentUser).catch((error) => {
        console.warn('Falha ao notificar aprovação de compra:', error)
      })

      smartToast.success('Solicitação aprovada.')
      onSuccess?.()
    } catch (err) {
      smartToast.error('Erro ao aprovar', err.message)
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEditing ? 'Editar Solicitação' : 'Nova Solicitação'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

              <Select
                value={form.meta_id}
                onValueChange={(v) => {
                  setField('meta_id', v)

                  if (v !== 'MC3A-EXTRA') {
                    setField('meta_extra_descricao', '')
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {metas.map((m) => (
                    <SelectItem key={m.id} value={m.nome}>
                      {m.nome}
                    </SelectItem>
                  ))}

                  {form.meta_id && !metas.some((m) => m.nome === form.meta_id) && (
                    <SelectItem value={form.meta_id}>
                      {form.meta_id}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
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

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Centro de custo
              </label>

              <Select value={form.centro_custo} onValueChange={(v) => setField('centro_custo', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {CENTROS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}

                  {form.centro_custo && !CENTROS.includes(form.centro_custo) && (
                    <SelectItem value={form.centro_custo}>
                      {form.centro_custo}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Rubrica
              </label>

              <Select value={form.rubrica_id} onValueChange={(v) => setField('rubrica_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {rubricas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.rubrica || r.nome}
                    </SelectItem>
                  ))}

                  {form.rubrica_id && !rubricas.some((r) => r.id === form.rubrica_id) && (
                    <SelectItem value={form.rubrica_id}>
                      {form.rubrica_nome || form.rubrica_id}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
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

          {(form.nf_numero || form.nf_data_emissao) && (
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
          )}

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
                disabled={approving}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {approving ? 'Aprovando...' : 'Aprovar'}
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
    </>
  )
}
