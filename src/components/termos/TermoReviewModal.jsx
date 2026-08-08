import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Edit2, Download, X, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import aiClient from '@/lib/aiClient';

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

      const res = await aiClient.InvokeLLM({
        prompt: `Você é Dr. Lex, especialista sênior em Direito dos Contratos Culturais brasileiros, com profundo conhecimento em:
- Lei 13.019/2014 (Marco Regulatório das OSCs) e suas alterações
- Termo de Colaboração, Termo de Fomento e Acordos de Cooperação
- Contratos de prestação de serviços (Código Civil, arts. 593-609)
- Lei de Direitos Autorais (9.610/98)
- Legislação trabalhista quanto à caracterização de vínculo empregatício
- Boas práticas em prestação de contas de convênios e parcerias públicas

Analise rigorosamente o Termo de Compromisso abaixo e forneça:

1. ERROS CRÍTICOS: campos obrigatórios vazios, inconsistências de valores (verifique se parcelas × quantidade = total), datas inválidas ou incompatíveis, CNPJ/CPF em formato incorreto, ausência de testemunhas, objeto/escopo genérico demais para prestação de contas, rubrica orçamentária incompatível ou com saldo insuficiente.

2. ERROS DE ORTOGRAFIA E REDAÇÃO: erros gramaticais, concordância, pontuação, termos técnico-jurídicos incorretos, linguagem inadequada para instrumento contratual formal.

3. ALERTAS JURÍDICOS: cláusulas que possam caracterizar vínculo empregatício, ausência de prazo determinado, valor que parece desproporcional à função/escopo, descrição da NF incompatível com o objeto, ausência de dados bancários, período de execução anterior à data de assinatura.

4. COMPATIBILIDADE ORÇAMENTÁRIA: verifique se a rubrica vinculada (se informada) é compatível com o objeto e escopo descritos. Se o valor declarado parecer elevado para o tipo de serviço descrito, alerte. Rubrica: "${formData.rubrica_vinculada ? 'vinculada' : 'não informada'}".

5. STATUS GERAL: "APROVADO" (documento apto para assinatura) ou "REVISAR" (há problemas que impedem ou comprometem a validade do instrumento).

6. RESUMO: frase objetiva com o parecer geral do Dr. Lex.

Termo para revisão:
${textoCompleto}

Responda em JSON conforme o schema.`,
        response_json_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['APROVADO', 'REVISAR'] },
            resumo: { type: 'string' },
            erros_criticos: { type: 'array', items: { type: 'string' } },
            erros_ortografia: { type: 'array', items: { type: 'string' } },
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
              Revisão jurídica e orçamentária com IA (Dr. Lex)
            </button>
          )}

          {iaLoading && (
            <div className="flex items-center justify-center gap-2 border border-violet-200 bg-violet-50 rounded-xl py-3 text-sm text-violet-600">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Dr. Lex analisando: ortografia, jurídico e orçamento...
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
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {iaRevisao.status === 'APROVADO'
                    ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    : <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  }
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase">Parecer Dr. Lex</span>
                    <p className={`text-sm font-semibold ${iaRevisao.status === 'APROVADO' ? 'text-green-800' : 'text-amber-800'}`}>
                      {iaRevisao.resumo}
                    </p>
                  </div>
                </div>
                <button onClick={handleRevisarIA} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 flex-shrink-0">
                  <RefreshCw className="w-3 h-3" /> refazer
                </button>
              </div>

              {iaRevisao.erros_criticos?.length > 0 && (
                <div className="mt-2 bg-red-50 rounded-lg p-2.5">
                  <p className="text-xs font-bold text-red-700 mb-1.5">⛔ Erros críticos:</p>
                  <ul className="space-y-1">
                    {iaRevisao.erros_criticos.map((e, i) => (
                      <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0">•</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {iaRevisao.erros_ortografia?.length > 0 && (
                <div className="mt-2 bg-orange-50 rounded-lg p-2.5">
                  <p className="text-xs font-bold text-orange-700 mb-1.5">✏️ Ortografia e redação:</p>
                  <ul className="space-y-1">
                    {iaRevisao.erros_ortografia.map((e, i) => (
                      <li key={i} className="text-xs text-orange-700 flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0">•</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {iaRevisao.alertas?.length > 0 && (
                <div className="mt-2 bg-amber-50 rounded-lg p-2.5">
                  <p className="text-xs font-bold text-amber-700 mb-1.5">⚠️ Alertas jurídicos:</p>
                  <ul className="space-y-1">
                    {iaRevisao.alertas.map((a, i) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0">•</span> {a}
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