import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download, ExternalLink } from 'lucide-react';

export default function PagamentosTabelaDetalhada({ pagamentos = [], agrupadoPor = 'museu', totalPago = 0, totalPagamentos = 0 }) {
  const [filtroMuseu, setFiltroMuseu] = useState(null);
  const [filtroRubrica, setFiltroRubrica] = useState(null);

  if (!pagamentos || pagamentos.length === 0) {
    return (
      <Card className="p-6 text-center text-gray-500">
        Nenhum pagamento registrado para este período.
      </Card>
    );
  }

  // Extrair valores únicos para filtros
  const museus = [...new Set(pagamentos.map(p => p.museu))];
  const rubricas = [...new Set(pagamentos.map(p => p.rubrica))];

  // Filtrar pagamentos
  let pagamentosFiltrados = pagamentos;
  if (filtroMuseu) pagamentosFiltrados = pagamentosFiltrados.filter(p => p.museu === filtroMuseu);
  if (filtroRubrica) pagamentosFiltrados = pagamentosFiltrados.filter(p => p.rubrica === filtroRubrica);

  // Agrupar para exibição
  let grupos = {};
  pagamentosFiltrados.forEach(pag => {
    let chave = agrupadoPor === 'museu' ? pag.museu : pag.rubrica;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(pag);
  });

  const statusBadgeColor = {
    'PAGO': 'bg-green-100 text-green-800',
    'APROVADO': 'bg-blue-100 text-blue-800',
    'APROVADO_ADMIN': 'bg-blue-100 text-blue-800',
    'APROVADO_COORD': 'bg-blue-100 text-blue-800'
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleDateString('pt-BR');
  };

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  };

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <Card className="p-4 bg-slate-50 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-600">Total de Pagamentos</p>
          <p className="text-2xl font-bold">{pagamentosFiltrados.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Valor Total</p>
          <p className="text-2xl font-bold">{formatarMoeda(pagamentosFiltrados.reduce((sum, p) => sum + (p.valor || 0), 0))}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Período</p>
          <p className="text-sm font-semibold">5 de {pagamentos[0]?.data_pagamento ? new Date(pagamentos[0].data_pagamento).getFullYear() : 'N/A'}</p>
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-gray-600 block mb-2">Filtrar por Museu</label>
          <select
            value={filtroMuseu || ''}
            onChange={(e) => setFiltroMuseu(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos os museus</option>
            {museus.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-gray-600 block mb-2">Filtrar por Rubrica</label>
          <select
            value={filtroRubrica || ''}
            onChange={(e) => setFiltroRubrica(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todas as rubricas</option>
            {rubricas.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabelas por grupo */}
      {Object.entries(grupos).map(([grupoChave, pagsByGrupo]) => (
        <Card key={grupoChave} className="overflow-hidden">
          <div className="bg-slate-100 p-4 border-b">
            <h4 className="font-semibold text-sm">{agrupadoPor === 'museu' ? '🏛️' : '💰'} {grupoChave}</h4>
            <p className="text-xs text-gray-600 mt-1">{pagsByGrupo.length} pagamentos — {formatarMoeda(pagsByGrupo.reduce((s, p) => s + (p.valor || 0), 0))}</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-xs">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs">Descrição</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs">Museu</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs">Valor</th>
                  <th className="px-4 py-3 text-center font-semibold text-xs">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-xs">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {pagsByGrupo.map((pag, idx) => (
                  <tr key={pag.id || idx} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3">{formatarData(pag.data_pagamento)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-xs">{pag.fornecedor_nome}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">{pag.descricao}</td>
                    <td className="px-4 py-3 text-xs">{pag.museu}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatarMoeda(pag.valor)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={statusBadgeColor[pag.status] || 'bg-gray-100 text-gray-800'}>
                        {pag.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {pag.nf_pdf_url && (
                          <a href={pag.nf_pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                            <FileText className="w-4 h-4" title="NF PDF" />
                          </a>
                        )}
                        {pag.nf_xml_url && (
                          <a href={pag.nf_xml_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-800">
                            <FileText className="w-4 h-4" title="XML" />
                          </a>
                        )}
                        {pag.comprovante_url && (
                          <a href={pag.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-800">
                            <Download className="w-4 h-4" title="Comprovante" />
                          </a>
                        )}
                        {pag.documentos?.length > 0 && (
                          <details className="cursor-pointer">
                            <summary className="text-gray-600 hover:text-gray-800">
                              <ExternalLink className="w-4 h-4" />
                            </summary>
                            <div className="absolute mt-2 bg-white border rounded-lg p-2 shadow-lg z-10 min-w-[200px]">
                              {pag.documentos.map((doc, i) => (
                                <a
                                  key={i}
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-xs text-blue-600 hover:underline py-1"
                                >
                                  📎 {doc.nome}
                                </a>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {/* Totalizador final */}
      <Card className="p-4 bg-black text-white">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs opacity-80">Total Geral de Pagamentos</p>
            <p className="text-2xl font-bold">{pagamentosFiltrados.length}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Valor Total Pago</p>
            <p className="text-2xl font-bold">{formatarMoeda(pagamentosFiltrados.reduce((sum, p) => sum + (p.valor || 0), 0))}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Museus Envolvidos</p>
            <p className="text-2xl font-bold">{museus.length}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}