import React from 'react';
import { AlertCircle, CheckCircle2, XCircle, Zap, BookOpen, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function GuiaNotaFiscal() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl p-8 border border-slate-200">
        <div className="flex items-start gap-4">
          <BookOpen className="w-8 h-8 text-slate-700 flex-shrink-0 mt-1" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Guia Completo: Como Analisar uma Nota Fiscal Corretamente</h1>
            <p className="text-slate-600 mt-2">Aprenda a identificar problemas, divergências e inconsistências em notas fiscais para evitar multas e problemas fiscais.</p>
          </div>
        </div>
      </div>

      {/* Seção 1: O que é DANFE vs XML */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-blue-600" />
          <h2 className="text-2xl font-bold text-slate-900">1. DANFE vs XML: Qual a Diferença?</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold text-blue-900 mb-2">📄 DANFE (PDF)</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Representação visual simplificada</li>
              <li>✓ Acompanha o produto no transporte</li>
              <li>✓ Leitura por humanos</li>
              <li>❌ Pode conter erros de digitação</li>
              <li>❌ Não é o registro oficial fiscal</li>
            </ul>
          </div>
          
          <div className="border border-green-200 rounded-lg p-4 bg-green-50">
            <h3 className="font-bold text-green-900 mb-2">💾 XML (Arquivo Digital)</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>✓ Formato padrão oficial da Receita Federal</li>
              <li>✓ A nota fiscal de fato (legalmente)</li>
              <li>✓ Assinado digitalmente</li>
              <li>✓ Validação de schema garantida</li>
              <li>✓ Obrigatório legalmente para auditoria</li>
            </ul>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ Importante:</strong> Se você tem apenas o DANFE (PDF) sem o XML, a NF não pode ser validada completamente. O arquivo XML é obrigatório legalmente!
          </p>
        </div>
      </Card>

      {/* Seção 2: Divergências Críticas */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <XCircle className="w-5 h-5 text-red-600" />
          <h2 className="text-2xl font-bold text-slate-900">2. Divergências Críticas (Multa de até 100%)</h2>
        </div>

        <div className="space-y-3">
          <div className="border-l-4 border-red-500 bg-red-50 p-4 rounded">
            <h3 className="font-bold text-red-900">Divergência de Valor</h3>
            <p className="text-sm text-red-800 mt-1">
              Se o valor no DANFE ≠ valor no XML → <strong>Multa: 100% do valor da operação</strong>
            </p>
            <p className="text-xs text-red-700 mt-2">Exemplo: DANFE diz R$ 1.000, XML diz R$ 999,99</p>
          </div>

          <div className="border-l-4 border-red-500 bg-red-50 p-4 rounded">
            <h3 className="font-bold text-red-900">Divergência de Destinatário</h3>
            <p className="text-sm text-red-800 mt-1">
              Se o destinatário no DANFE ≠ XML → <strong>Multa: 100% do valor da operação</strong>
            </p>
            <p className="text-xs text-red-700 mt-2">Exemplo: DANFE para 'Empresa A', XML para 'Empresa B'</p>
          </div>

          <div className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded">
            <h3 className="font-bold text-orange-900">Outros Erros de Divergência</h3>
            <p className="text-sm text-orange-800 mt-1">
              Outros campos divergentes → <strong>Multa: R$ 328,40 por documento</strong>
            </p>
            <p className="text-xs text-orange-700 mt-2">Exemplo: Data, descrição, CFOP, NCM, etc.</p>
          </div>
        </div>
      </Card>

      {/* Seção 3: Checklist de Validação */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <h2 className="text-2xl font-bold text-slate-900">3. Checklist de Validação</h2>
        </div>

        <div className="space-y-2">
          {[
            { item: 'Arquivo XML presente e assinado digitalmente', critical: true },
            { item: 'Valor total DANFE = Valor XML', critical: true },
            { item: 'Destinatário DANFE = Destinatário XML', critical: true },
            { item: 'Data de emissão válida (não futura, <5 anos)', critical: true },
            { item: 'CNPJ/CPF válido (formato e dígitos verificadores)', critical: false },
            { item: 'Numeração sequencial (sem saltos)', critical: false },
            { item: 'Descrição detalhada (não genérica)', critical: false },
            { item: 'Quantidade coerente com descrição', critical: false },
            { item: 'CFOP e NCM corretos', critical: false },
            { item: 'Impostos calculados corretamente', critical: false },
            { item: 'Nenhuma evidência de duplicação', critical: true },
            { item: 'Fonte confiável / Fornecedor conhecido', critical: false },
          ].map((check, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg">
              <CheckCircle2 className={`w-5 h-5 flex-shrink-0 mt-0.5 ${check.critical ? 'text-red-600' : 'text-green-600'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{check.item}</p>
                {check.critical && <Badge className="mt-1 bg-red-100 text-red-800">Crítico</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Seção 4: Sinais de Alerta */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <h2 className="text-2xl font-bold text-slate-900">4. Sinais de Alerta 🚩</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-amber-200 bg-amber-50 p-4 rounded-lg space-y-2">
            <h3 className="font-bold text-amber-900">Suspeita de Duplicação</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• Mesmo fornecedor em datas próximas</li>
              <li>• Valores muito similares</li>
              <li>• Descrição idêntica</li>
              <li>• Numeração NF sequencial suspeita</li>
            </ul>
          </div>

          <div className="border border-amber-200 bg-amber-50 p-4 rounded-lg space-y-2">
            <h3 className="font-bold text-amber-900">Inconsistência de Categoria</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• Descrição genérica ("serviços diversos")</li>
              <li>• Falta de detalhes técnicos</li>
              <li>• Categoria vs descrição não batem</li>
              <li>• Sem itemização</li>
            </ul>
          </div>

          <div className="border border-red-200 bg-red-50 p-4 rounded-lg space-y-2">
            <h3 className="font-bold text-red-900">Problemas com CNPJ/CPF</h3>
            <ul className="text-sm text-red-800 space-y-1">
              <li>• Dígitos verificadores inválidos</li>
              <li>• CNPJ de pessoa física (ou vice-versa)</li>
              <li>• Empresa inativa na Receita Federal</li>
              <li>• Documento fictício</li>
            </ul>
          </div>

          <div className="border border-red-200 bg-red-50 p-4 rounded-lg space-y-2">
            <h3 className="font-bold text-red-900">Problemas com Data</h3>
            <ul className="text-sm text-red-800 space-y-1">
              <li>• Data futura (não pode emitir NF do futuro)</li>
              <li>• Data muito antiga (&gt;5 anos)</li>
              <li>• Fora do período de apuração</li>
              <li>• Divergência DANFE/XML</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Seção 5: Procedimento Recomendado */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-blue-600" />
          <h2 className="text-2xl font-bold text-slate-900">5. Procedimento Recomendado de Análise</h2>
        </div>

        <div className="space-y-3">
          {[
            {
              step: 1,
              title: 'Verificar se tem XML',
              desc: 'A NF-e obrigatoriamente deve ter arquivo XML. Se tem apenas PDF, solicitar XML ao fornecedor.'
            },
            {
              step: 2,
              title: 'Validar integridade XML',
              desc: 'Conferir assinatura digital, validade do certificado, conformidade de schema.'
            },
            {
              step: 3,
              title: 'Cruzar DANFE com XML',
              desc: 'Valor, destinatário e informações críticas devem ser 100% idênticas.'
            },
            {
              step: 4,
              title: 'Validar dados de origem',
              desc: 'CNPJ/CPF válido, empresa ativa na Receita, data coerente.'
            },
            {
              step: 5,
              title: 'Verificar sequência de NFs',
              desc: 'Numeração NF não pode ter gaps (devem ser sequenciais ou justificados).'
            },
            {
              step: 6,
              title: 'Validar contra documentação',
              desc: 'Conferir com contrato, proposta, email de pedido, recebimento de mercadoria.'
            },
            {
              step: 7,
              title: 'Consultar na Receita Federal',
              desc: 'Fazer busca no https://consulta.sefaz.fazenda.gov.br (para NF-e).'
            },
            {
              step: 8,
              title: 'Aguardar aprovação',
              desc: 'Se tudo OK, NF pode ser registrada em sistema contábil/fiscal.'
            }
          ].map((proc) => (
            <div key={proc.step} className="flex gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                {proc.step}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900">{proc.title}</h4>
                <p className="text-sm text-slate-600 mt-1">{proc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Seção 6: Recursos */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Download className="w-5 h-5 text-slate-700" />
          6. Recursos e Links Úteis
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="https://consulta.sefaz.fazenda.gov.br" target="_blank" rel="noopener noreferrer" className="border border-slate-200 p-4 rounded-lg hover:bg-slate-50 transition">
            <p className="font-semibold text-slate-900">Consulta SEFAZ</p>
            <p className="text-sm text-slate-600 mt-1">Verificar autenticidade de NF-e na Receita Federal</p>
          </a>

          <a href="https://www.contabeis.com.br/artigos/6852/divergencias-entre-nf-e-e-xml/" target="_blank" rel="noopener noreferrer" className="border border-slate-200 p-4 rounded-lg hover:bg-slate-50 transition">
            <p className="font-semibold text-slate-900">Portal Contábeis</p>
            <p className="text-sm text-slate-600 mt-1">Artigos sobre divergências DANFE/XML</p>
          </a>

          <a href="https://www.e-auditoria.com.br/blog/xml-nfe-entenda-o-impacto-fiscal-e-contabil/" target="_blank" rel="noopener noreferrer" className="border border-slate-200 p-4 rounded-lg hover:bg-slate-50 transition">
            <p className="font-semibold text-slate-900">E-Auditoria</p>
            <p className="text-sm text-slate-600 mt-1">Impactos fiscal e contábil do XML</p>
          </a>

          <a href="https://nfe.fazenda.gov.br/" target="_blank" rel="noopener noreferrer" className="border border-slate-200 p-4 rounded-lg hover:bg-slate-50 transition">
            <p className="font-semibold text-slate-900">Portal NF-e</p>
            <p className="text-sm text-slate-600 mt-1">Documentação oficial da Receita Federal</p>
          </a>
        </div>
      </Card>

      {/* Seção 7: Multas */}
      <Card className="p-6 bg-red-50 border border-red-200 space-y-4">
        <h2 className="text-2xl font-bold text-red-900 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          ⚖️ Tabela de Multas (2026)
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-red-300">
                <th className="text-left py-2 px-3 font-bold text-red-900">Infração</th>
                <th className="text-left py-2 px-3 font-bold text-red-900">Multa</th>
                <th className="text-left py-2 px-3 font-bold text-red-900">Severidade</th>
              </tr>
            </thead>
            <tbody className="text-red-800">
              <tr className="border-b border-red-200">
                <td className="py-2 px-3">Divergência Valor/Destinatário</td>
                <td className="py-2 px-3"><strong>100% do valor</strong></td>
                <td className="py-2 px-3"><Badge className="bg-red-700">Crítica</Badge></td>
              </tr>
              <tr className="border-b border-red-200">
                <td className="py-2 px-3">Outra divergência</td>
                <td className="py-2 px-3">R$ 328,40/doc</td>
                <td className="py-2 px-3"><Badge className="bg-orange-600">Alta</Badge></td>
              </tr>
              <tr className="border-b border-red-200">
                <td className="py-2 px-3">NF não emitida obrigatoriamente</td>
                <td className="py-2 px-3">50% do valor (emitente)</td>
                <td className="py-2 px-3"><Badge className="bg-orange-600">Alta</Badge></td>
              </tr>
              <tr className="border-b border-red-200">
                <td className="py-2 px-3">NF não recebida obrigatoriamente</td>
                <td className="py-2 px-3">35% do valor (recebedor)</td>
                <td className="py-2 px-3"><Badge className="bg-orange-600">Alta</Badge></td>
              </tr>
              <tr>
                <td className="py-2 px-3">Numeração NF com gaps</td>
                <td className="py-2 px-3">R$ 246,30</td>
                <td className="py-2 px-3"><Badge className="bg-yellow-600">Média</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-red-700 mt-4">⚠️ Multas podem ser autuadas até 5 anos após a emissão. Valores sujeitos a variações. Consulte a Receita Federal para valores atualizados.</p>
      </Card>

      {/* Footer */}
      <div className="text-center pt-4">
        <Button variant="outline" onClick={() => window.history.back()}>← Voltar</Button>
      </div>
    </div>
  );
}