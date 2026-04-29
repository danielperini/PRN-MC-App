import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { base44 } from '@/api/base44Client'

export default function PurchaseFormDialog({ open, onClose, prefill }) {
  const [form, setForm] = useState({
    descricao_item: '',
    fornecedor_nome: '',
    fornecedor_cnpj: '',
    centro_custo: '',
    rubrica_id: '',
    valor: '',
    observacao: ''
  })

  const [rubricas, setRubricas] = useState([])

  useEffect(() => {
    if (prefill) {
      setForm({
        descricao_item: prefill.descricao_item || '',
        fornecedor_nome: prefill.fornecedor_nome || '',
        fornecedor_cnpj: prefill.fornecedor_cnpj || '',
        centro_custo: prefill.centro_custo || '',
        rubrica_id: prefill.rubrica_id || '',
        valor: prefill.valor || '',
        observacao: prefill.observacao || ''
      })
    }
  }, [prefill])

  useEffect(() => {
    const fetchRubricas = async () => {
      const data = await base44.entities.Rubrica.list()
      setRubricas(data || [])
    }
    fetchRubricas()
  }, [])

  const handleSubmit = async () => {
    await base44.entities.PurchaseRequest.update(prefill.id, form)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prefill?.id ? 'Editar compra' : 'Nova compra'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Descrição */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Descrição do item
            </label>
            <Textarea
              value={form.descricao_item}
              onChange={(e) => setForm({ ...form, descricao_item: e.target.value })}
            />
          </div>

          {/* Nome */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Nome / Razão Social
            </label>
            <Input
              value={form.fornecedor_nome}
              onChange={(e) => setForm({ ...form, fornecedor_nome: e.target.value })}
            />
          </div>

          {/* Documento */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              CPF / CNPJ
            </label>
            <Input
              value={form.fornecedor_cnpj}
              onChange={(e) => setForm({ ...form, fornecedor_cnpj: e.target.value })}
            />
          </div>

          {/* Centro de custo */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Centro de custo
            </label>
            <Select
              value={form.centro_custo}
              onValueChange={(value) => setForm({ ...form, centro_custo: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MIS">MIS</SelectItem>
                <SelectItem value="MHAB">MHAB</SelectItem>
                <SelectItem value="MUMO">MUMO</SelectItem>
                <SelectItem value="GERAL">GERAL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rubrica */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Rubrica
            </label>
            <Select
              value={form.rubrica_id}
              onValueChange={(value) => setForm({ ...form, rubrica_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a rubrica" />
              </SelectTrigger>
              <SelectContent>
                {rubricas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.grupo} | {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Valor (R$)
            </label>
            <Input
              type="number"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
          </div>

          {/* Observação */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Observações / Nota fiscal
            </label>
            <Textarea
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>

        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}