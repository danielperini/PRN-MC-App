import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Edit2, Download, X, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function TermoReviewModal({ formData, numeroTC, projetoAtual, onConfirm, onEdit, onClose, isGenerating }) {
  const [iaRevisao, setIaRevisao] = useState(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaErro, setIaErro] = useState(null);

  const formatarValor = (v) => {
    const n = parseFloat(v || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  };

  const handleRevisarIA = async () => {
    setIaLoading(true);
    setIaErro(null);
    setIaRevisao(null);
    try {
      const textoCompleto = `
TERMO DE COMPROMISSO ${numeroTC}
Projeto: ${projetoAtual?.nome_projeto || ''}
Contratado: ${formData.contratado_nome || ''}
CPF/CNPJ: ${formData.contratado_cpf_cnpj || ''}
Função: ${formData.funcao_projeto || ''}
Endereço: ${formData.contratado_endereco || ''}

OBJETO: ${formData.objeto || ''}

ESCOPO: ${formData.escopo || ''}

Período: ${formData.periodo_execucao || ''}
Local: ${formData.museu_local || ''}

Valor Total: ${formatarValor(formData.valor_total)}
Parcelas: ${formData.detalhamento_valores || ''}
Forma de Pagamento: ${formData.forma_pagamento || ''}

Banco: ${formData.banco || ''} | Agência: ${formData.agencia || ''} | Conta: ${formData.conta || ''} | PIX: ${formData.pix || ''}

Descrição NF: ${formData.descricao_nf_editavel || ''}

Data Assinatura: ${formData.data_assinatura || ''}
Testemunha 1: ${formData.testemunha1_nome || ''} - CPF: ${formData.testemunha1_cpf || ''}
Testemunha 2: ${formData.testemunha2_nome || ''} - CPF: ${formData.testemunha2_cpf || ''}
      `.trim();

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um revisor jurídico especializado em contratos culturais brasileiros. Revise o seguinte Termo de Compromisso e forneça:

1. ERROS CRÍTICOS: campos obrigatórios vazios, inconsistências de dados, erros numéricos (parcelas x total), datas inválidas.
2. ALERTAS: informações suspeitas ou que merecem atenção.
3. STATUS GERAL: "APROVADO" (pode gerar PDF) ou "REVISAR" (há problemas críticos).
4. RESUMO: frase curta com o status geral.

Termo para revisão:
${textoCompleto}

Responda em JSON conforme o schema.`,
        response_json_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['APROVADO', 'REVISAR'] },
            resumo: { type: 'string' },
            erros_criticos: { type: 'array', items: { type: 'string' } },
            alertas: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      setIaRevisao(res);
    } catch (e) {
      setIaErro('Falha na revisão por IA. Você pode prosseguir normalmente.');
    } finally {
      setIaLoading(false);
    }
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
            <p className="text-xs text-slate-500 mt-0.5">Confirme os dados. O número do termo é permanente.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Número em destaque */}
        <div className="mx-5 mt-4 bg-slate-900 text-white rounded-xl p-3 text-center">
          <p className="text-xs text-slate-400 mb-0.5">Número do Termo (permanente)</p>
          <p className="text-xl font-bold font-mono tracking-wider">{numeroTC}</p>
        </div>

        {/* Revisão IA */}
        <div className="mx-5 mt-4">
          {!iaRevisao && !iaLoading && (
            <button
              onClick={handleRevisarIA}
              className="w-full flex items-center justify-center gap-2 border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-xl py-2.5 text-sm font-medium transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Revisar com IA antes de exportar
            </button>
          )}

          {iaLoading && (
            <div className="flex items-center justify-center gap-2 border border-violet-200 bg-violet-50 rounded-xl py-3 text-sm text-violet-600">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Analisando o termo com IA...
            </div>
          )}

          {iaErro && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {iaErro}
            </div>
          )}

          {iaRevisao && (
            <div className={`rounded-xl border p-4 ${iaRevisao.status === 'APROVADO' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {iaRevisao.status === 'APROVADO'
                  ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  : <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                }
                <span className={`font-semibold text-sm ${iaRevisao.status === 'APROVADO' ? 'text-green-800' : 'text-amber-800'}`}>
                  {iaRevisao.resumo}
                </span>
                <button onClick={handleRevisarIA} className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> refazer
                </button>
              </div>

              {iaRevisao.erros_criticos?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-bold text-red-700 mb-1">Erros críticos:</p>
                  <ul className="space-y-1">
                    {iaRevisao.erros_criticos.map((e, i) => (
                      <li key={i} className="text-xs text-red-700 flex items-start gap-1">
                        <span className="mt-0.5">•</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {iaRevisao.alertas?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-bold text-amber-700 mb-1">Alertas:</p>
                  <ul className="space-y-1">
                    {iaRevisao.alertas.map((a, i) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                        <span className="mt-0.5">•</span> {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-4 max-h-[45vh] overflow-y-auto">
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
                      <span className="text-xs text-slate-800 font-medium break-words min-w-0">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

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
            {isGenerating ? 'Gerando...' : 'Confirmar e gerar PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}