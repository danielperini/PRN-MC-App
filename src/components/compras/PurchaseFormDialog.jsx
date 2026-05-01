import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { base44 } from '@/api/base44Client'
import { CheckCircle2, RotateCcw, Trash2, Paperclip, X, FileText, Upload } from 'lucide-react'
import { useSmartToast } from '@/lib/useSmartToast'

const METAS_FALLBACK = ['MC3A-20','MC3A-21','MC3A-22','MC3A-23','MC3A-24','MC3A-25','MC3A-EXTRA']
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
const STATUS_APROVADOS = new Set(['APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO'])

function toNumber(v) {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export default function PurchaseFormDialog({ currentUser, prefill, onClose, onSuccess }) {
  const smartToast = useSmartToast()
  const fileInputRef = useRef(null)

  const isCoordenador = ['admin','ADMIN','COORDENADOR','COORD_COMUNICACAO','COORD_ADMINISTRATIVA','COORD_PRODUCAO'].includes(currentUser?.role)

  const emptyForm = {
    descricao_item: '',
    fornecedor_nome: '',
    fornecedor_cnpj: '',
    fornecedor_contato: '',
    centro_custo: '',
    rubrica_id: '',
    meta_id: '',
    meta_extra_descricao: '',
    categoria: '',
    tipo_gasto: '',
    valor_solicitado: '',
    meio_pagamento: '',
    detalhe_pagamento: '',
    observacoes: '',
    link_proposta: ''
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

  const isEditing = !!prefill?.id
  const statusKey = String(prefill?.status || '').trim().toUpperCase()
  const isApproved = STATUS_APROVADOS.has(statusKey)
  const BLOCKED_STATUSES = new Set(['CANCELADO', 'RECUSADO'])
  const canApproveOrReturn = isCoordenador && isEditing && !isApproved && !BLOCKED_STATUSES.has(statusKey)

  // Carregar rubricas e metas
  useEffect(() => {
    base44.entities.Rubrica.list('ordem_exibicao', 200)
      .then(d => setRubricas((d || []).filter(r => r?.ativo !== false)))
      .catch(() => {})

    base44.entities.ProjectMeta.list('nome', 100)
      .then(d => {
        const ativos = (d || []).filter(m => m?.ativo !== false)
        setMetas(ativos.length > 0 ? ativos : [])
      })
      .catch(() => setMetas([]))
  }, [])

  // Carregar prefill
  useEffect(() => {
    if (prefill) {
      setForm({
        descricao_item: prefill.descricao_item || '',
        fornecedor_nome: prefill.fornecedor_nome || prefill.nf_emitente_nome || '',
        fornecedor_cnpj: prefill.fornecedor_cnpj || prefill.fornecedor_cpf_cnpj || '',
        fornecedor_contato: prefill.fornecedor_contato || '',
        centro_custo: prefill.centro_custo || '',
        rubrica_id: prefill.rubrica_id || '',
        meta_id: prefill.meta_id || '',
        meta_extra_descricao: prefill.meta_extra_descricao || '',
        categoria: prefill.categoria || '',
        tipo_gasto: prefill.tipo_gasto || '',
        valor_solicitado: prefill.valor_solicitado || prefill.valor || '',
        meio_pagamento: prefill.meio_pagamento || '',
        detalhe_pagamento: prefill.detalhe_pagamento || '',
        observacoes: prefill.observacoes || '',
        link_proposta: prefill.link_proposta || ''
      })
    } else {
      setForm(emptyForm)
    }
    setReturnComment('')
    setShowReturnInput(false)
    setAttachedFile(null)
  }, [prefill])

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.descricao_item?.trim()) { smartToast.error('Informe a descrição do item.'); return }
    if (!form.valor_solicitado) { smartToast.error('Informe o valor.'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        valor_solicitado: toNumber(form.valor_solicitado)
      }

      if (isEditing) {
        await base44.entities.PurchaseRequest.update(prefill.id, payload)
        smartToast.success('Solicitação atualizada.')
      } else {
        await base44.entities.PurchaseRequest.create({
          ...payload,
          status: 'RASCUNHO',
          created_by: currentUser?.email
        })
        smartToast.success('Solicitação criada.')
      }
      onSuccess?.()
    } catch (err) {
      smartToast.error('Erro ao salvar', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove() {
    if (!prefill?.rubrica_id && !form.rubrica_id) {
      smartToast.error('Vincule uma rubrica antes de aprovar.')
      return
    }
    setApproving(true)
    try {
      // Salvar edições primeiro
      await base44.entities.PurchaseRequest.update(prefill.id, {
        ...form,
        valor_solicitado: toNumber(form.valor_solicitado),
        status: 'APROVADO_COORD',
        aprov_coord_nome: currentUser?.full_name || currentUser?.email,
        aprov_coord_data: new Date().toISOString().split('T')[0]
      })

      // Debitar rubrica
      const rubricaId = form.rubrica_id || prefill.rubrica_id
      if (rubricaId) {
        try {
          const rubrica = await base44.entities.Rubrica.get(rubricaId)
          if (rubrica) {
            const valor = toNumber(form.valor_solicitado || prefill.valor_solicitado)
            const utilizado = toNumber(rubrica.valor_utilizado) + valor
            const saldo = toNumber(rubrica.valor_rubrica) - utilizado
            await base44.entities.Rubrica.update(rubricaId, {
              valor_utilizado: utilizado,
              saldo,
              percentual_utilizado: rubrica.valor_rubrica > 0 ? (utilizado / toNumber(rubrica.valor_rubrica)) * 100 : 0
            })
          }
        } catch (_) {}
      }

      smartToast.success('Solicitação aprovada.')
      onSuccess?.()
    } catch (err) {
      smartToast.error('Erro ao aprovar', err.message)
    } finally {
      setApproving(false)
    }
  }

  async function handleReturn() {
    if (!returnComment.trim()) { smartToast.error('Informe o motivo da devolução.'); return }
    setReturning(true)
    try {
      await base44.entities.PurchaseRequest.update(prefill.id, {
        status: 'DEVOLVIDO',
        comentario_devolucao: returnComment,
        aprov_coord_comentario: returnComment
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
      const { file_url } = await base44.integrations.Core.UploadFile({ file })
      setAttachedFile({ name: file.name, url: file_url })

      if (isEditing) {
        await base44.entities.PurchaseRequest.update(prefill.id, {
          nota_fiscal_url: file_url,
          orcamento_url: file_url
        })
        smartToast.success('Arquivo anexado.')
      } else {
        smartToast.success('Arquivo carregado. Será salvo junto com a solicitação.')
        setField('nota_fiscal_url', file_url)
        setField('orcamento_url', file_url)
      }
    } catch (err) {
      smartToast.error('Erro ao enviar arquivo', err.message)
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const existingFileUrl = prefill?.nota_fiscal_url || prefill?.orcamento_url || prefill?.comprovante_url || prefill?.link_proposta

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEditing ? 'Editar Solicitação' : 'Nova Solicitação'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status badge */}
          {isEditing && prefill?.status && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Status atual:</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isApproved ? 'bg-green-100 text-green-700' :
                statusKey === 'RECUSADO' ? 'bg-red-100 text-red-700' :
                statusKey === 'DEVOLVIDO' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {prefill.status}
              </span>
            </div>
          )}

          {/* Descrição */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Descrição do item *</label>
            <Textarea rows={2} value={form.descricao_item} onChange={e => setField('descricao_item', e.target.value)} placeholder="Descreva o item ou serviço..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Meta */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Meta</label>
              <Select value={form.meta_id} onValueChange={v => { setField('meta_id', v); if (v !== 'MC3A-EXTRA') setField('meta_extra_descricao', ''); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {metas.length > 0
                    ? metas.map(m => <SelectItem key={m.id} value={m.nome}>{m.nome}</SelectItem>)
                    : METAS_FALLBACK.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Categoria</label>
              <Select value={form.categoria} onValueChange={v => setField('categoria', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Centro de custo */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Centro de custo</label>
              <Select value={form.centro_custo} onValueChange={v => setField('centro_custo', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Rubrica */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Rubrica</label>
              <Select value={form.rubrica_id} onValueChange={v => setField('rubrica_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {rubricas.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.rubrica || r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição da Meta Extra */}
          {form.meta_id === 'MC3A-EXTRA' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nome da Meta <span className="text-red-500">*</span></label>
              <Input
                value={form.meta_extra_descricao}
                onChange={e => setField('meta_extra_descricao', e.target.value)}
                placeholder="Descreva o nome ou título da meta extra..."
              />
              <p className="text-xs text-gray-400">Este nome será exibido no lugar de "MC3A-EXTRA" em toda a plataforma.</p>
            </div>
          )}

          {/* Fornecedor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Fornecedor / Nome</label>
              <Input value={form.fornecedor_nome} onChange={e => setField('fornecedor_nome', e.target.value)} placeholder="Nome ou razão social" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">CPF / CNPJ</label>
              <Input value={form.fornecedor_cnpj} onChange={e => setField('fornecedor_cnpj', e.target.value)} placeholder="Somente dígitos" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Valor */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Valor solicitado (R$) *</label>
              <Input type="number" value={form.valor_solicitado} onChange={e => setField('valor_solicitado', e.target.value)} placeholder="0,00" />
            </div>

            {/* Meio de pagamento */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Meio de pagamento</label>
              <Select value={form.meio_pagamento} onValueChange={v => setField('meio_pagamento', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{MEIOS_PAGAMENTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Dados pagamento */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Dados bancários / Chave PIX</label>
            <Input value={form.detalhe_pagamento} onChange={e => setField('detalhe_pagamento', e.target.value)} placeholder="Banco, agência, conta ou chave PIX" />
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Observações</label>
            <Textarea rows={2} value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} placeholder="Informações adicionais..." />
          </div>

          {/* Arquivo */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Arquivo (PDF, XML, proposta)</label>
            <div className="flex items-center gap-3">
              <input ref={fileInputRef} type="file" accept=".pdf,.xml,.doc,.docx,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                {uploadingFile ? <><Upload className="h-3.5 w-3.5 animate-pulse" />Enviando...</> : <><Paperclip className="h-3.5 w-3.5" />Anexar arquivo</>}
              </Button>
              {attachedFile && (
                <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 text-xs text-green-700">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="max-w-[160px] truncate">{attachedFile.name}</span>
                  <button onClick={() => setAttachedFile(null)} className="ml-1 text-green-500 hover:text-green-700"><X className="h-3 w-3" /></button>
                </div>
              )}
              {!attachedFile && existingFileUrl && (
                <a href={existingFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-700 underline">
                  <FileText className="h-3.5 w-3.5" />Arquivo existente
                </a>
              )}
            </div>
          </div>

          {/* Devolução input */}
          {showReturnInput && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <label className="text-sm font-medium text-amber-800">Motivo da devolução *</label>
              <Textarea rows={2} value={returnComment} onChange={e => setReturnComment(e.target.value)} placeholder="Informe o motivo..." className="border-amber-300 bg-white" />
              <div className="flex gap-2">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5" onClick={handleReturn} disabled={returning}>
                  <RotateCcw className="h-3.5 w-3.5" />{returning ? 'Devolvendo...' : 'Confirmar devolução'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowReturnInput(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer de ações */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div className="flex gap-2">
            {/* Deletar */}
            {isEditing && isCoordenador && (
              <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" />{deleting ? 'Deletando...' : 'Deletar'}
              </Button>
            )}

            {/* Devolver */}
            {canApproveOrReturn && !showReturnInput && (
              <Button size="sm" variant="outline" className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setShowReturnInput(true)}>
                <RotateCcw className="h-3.5 w-3.5" />Devolver
              </Button>
            )}

            {/* Aprovar */}
            {canApproveOrReturn && (
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove} disabled={approving}>
                <CheckCircle2 className="h-3.5 w-3.5" />{approving ? 'Aprovando...' : 'Aprovar'}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar solicitação'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}