import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Edit2, Download, X } from 'lucide-react';

export default function TermoReviewModal({ formData, numeroTC, projetoAtual, onConfirm, onEdit, onClose, isGenerating }) {
  const formatarValor = (v) => {
    const n = parseFloat(v || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  };

  const secoes = [
    {
      titulo: 'Identificação',
      itens: [
        { label: 'Número do Termo', value: numeroTC },
        { label: 'Projeto', value: projetoAtual?.nome_projeto },
        { label: 'Termo de Colaboração', value: projetoAtual?.termo_colaboracao },
      ],
    },
    {
      titulo: 'Contratado',
      itens: [
        { label: 'Nome / Razão Social', value: formData.contratado_nome },
        { label: 'CPF / CNPJ', value: formData.contratado_cpf_cnpj },
        { label: 'Função', value: formData.funcao_projeto },
        { label: 'Endereço', value: formData.contratado_endereco },
        { label: 'Telefone', value: formData.contratado_telefone },
        { label: 'E-mail', value: formData.contratado_email },
      ],
    },
    {
      titulo: 'Objeto e Vigência',
      itens: [
        { label: 'Objeto', value: formData.objeto },
        { label: 'Período', value: formData.periodo_execucao },
        { label: 'Local', value: formData.museu_local },
      ],
    },
    {
      titulo: 'Financeiro',
      itens: [
        { label: 'Valor Total', value: formData.valor_total ? formatarValor(formData.valor_total) : '' },
        { label: 'Detalhamento', value: formData.detalhamento_valores },
        { label: 'Forma de Pagamento', value: formData.forma_pagamento },
      ],
    },
    {
      titulo: 'Dados Bancários',
      itens: [
        { label: 'Banco', value: formData.banco },
        { label: 'Agência', value: formData.agencia },
        { label: 'Conta', value: formData.conta },
        { label: 'PIX', value: formData.pix },
      ],
    },
    {
      titulo: 'Assinatura',
      itens: [
        { label: 'Data', value: formData.data_assinatura },
        { label: 'Cidade', value: formData.cidade_assinatura },
        { label: 'Testemunha 1', value: formData.testemunha1_nome ? `${formData.testemunha1_nome} (${formData.testemunha1_cpf})` : '' },
        { label: 'Testemunha 2', value: formData.testemunha2_nome ? `${formData.testemunha2_nome} (${formData.testemunha2_cpf})` : '' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Revisão antes de gerar o PDF</h2>
            <p className="text-xs text-slate-500 mt-0.5">Confirme os dados abaixo. O número do termo é permanente e não pode ser reutilizado.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Número do termo em destaque */}
        <div className="mx-5 mt-4 bg-slate-900 text-white rounded-xl p-3 text-center">
          <p className="text-xs text-slate-400 mb-0.5">Número do Termo (permanente)</p>
          <p className="text-xl font-bold font-mono tracking-wider">{numeroTC}</p>
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
          {secoes.map((secao) => {
            const itensPreenchidos = secao.itens.filter(i => i.value);
            if (itensPreenchidos.length === 0) return null;
            return (
              <div key={secao.titulo}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{secao.titulo}</p>
                <div className="bg-slate-50 rounded-lg divide-y divide-slate-100">
                  {itensPreenchidos.map((item) => (
                    <div key={item.label} className="flex px-3 py-2 gap-3">
                      <span className="text-xs text-slate-500 w-32 flex-shrink-0">{item.label}</span>
                      <span className="text-xs text-slate-800 font-medium break-words">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Aviso campos obrigatórios faltantes */}
          {(!formData.contratado_nome || !formData.objeto || !formData.valor_total) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              ⚠ Campos obrigatórios em falta: {[
                !formData.contratado_nome && 'Nome do contratado',
                !formData.objeto && 'Objeto',
                !formData.valor_total && 'Valor total',
              ].filter(Boolean).join(', ')}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex gap-3 p-5 border-t">
          <Button variant="outline" onClick={onEdit} className="flex-1">
            <Edit2 className="w-4 h-4 mr-2" />
            Editar dados
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isGenerating || !formData.contratado_nome || !formData.objeto || !formData.valor_total}
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            {isGenerating ? 'Gerando e enviando...' : 'Confirmar e gerar PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}