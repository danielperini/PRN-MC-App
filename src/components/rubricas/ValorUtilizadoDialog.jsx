import React from 'react';
import { X } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const first = (...values) => values.find(value => value !== null && value !== undefined && String(value).trim()) || '—';

export default function ValorUtilizadoDialog({ rubrica, composition, onClose }) {
  if (!rubrica) return null;
  const orcado = Number(composition?.orcado ?? rubrica.valor_rubrica ?? rubrica.valor_total ?? 0);
  const utilizado = Number(composition?.utilizado || 0);
  const solicitacoes = composition?.solicitacoes || [];
  const somaCentavos = solicitacoes.reduce((sum, item) => sum + Math.round(Number(item.valor_composicao || 0) * 100), 0);
  const confere = somaCentavos === Number(composition?.total_cents || 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Composição do Valor Utilizado" className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Composição do Valor Utilizado</h2>
            <p className="text-sm text-gray-600">{first(rubrica.grupo)} · {first(rubrica.rubrica)}</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="rounded p-2 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['ORÇADO', money(orcado)],
            ['UTILIZADO', money(utilizado)],
            ['SALDO', money(orcado - utilizado)],
            ['% EXECUTADO', orcado > 0 ? `${(utilizado / orcado * 100).toFixed(1)}%` : '0,0%'],
          ].map(([label, value]) => <div key={label} className="rounded border p-3"><p className="text-xs text-gray-500">{label}</p><strong>{value}</strong></div>)}
        </div>
        {solicitacoes.length === 0 ? (
          <p className="rounded border border-dashed p-6 text-center text-gray-600">Nenhuma solicitação aprovada vinculada a esta rubrica.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-xs">
              <thead className="bg-gray-50"><tr>{['ID / número', 'Descrição', 'Fornecedor', 'Solicitante', 'Data', 'Centro de custo', 'Grupo / meta', 'Rubrica', 'Natureza', 'Item', 'Valor', 'Status', 'Documento', 'Ações'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{solicitacoes.map(item => {
                const id = String(item.id || item.base44_id || '');
                const documentUrl = item.nf_pdf_url || item.nota_fiscal_url || item.arquivo_url || item.drive_file_url;
                return <tr key={id} className="border-t align-top">
                  <td className="p-2">{first(item.numero_solicitacao, item.nf_numero, id)}</td>
                  <td className="p-2">{first(item.descricao_item, item.descricao, item.descricao_servico, item.objeto)}</td>
                  <td className="p-2">{first(item.fornecedor_nome, item.nf_emitente_nome, item.fornecedor)}</td>
                  <td className="p-2">{first(item.solicitante_nome, item.user_email, item.created_by)}</td>
                  <td className="p-2">{first(item.nf_data_emissao, item.data_solicitacao, item.created_at, item.created_date)}</td>
                  <td className="p-2">{first(item.centro_custo, composition?.centro_custo)}</td>
                  <td className="p-2">{first(item.meta_nome_resolvido, item.meta_nome, composition?.grupo, item.meta_id)}</td>
                  <td className="p-2">{first(composition?.rubrica)}</td>
                  <td className="p-2">{first(item.natureza_despesa, rubrica.natureza_despesa)}</td>
                  <td className="p-2">{first(item.codigo_item_pbh, rubrica.codigo_item_pbh)}</td>
                  <td className="p-2 whitespace-nowrap font-semibold">{money(item.valor_composicao)}</td>
                  <td className="p-2">{first(item.status)}</td>
                  <td className="p-2">{documentUrl ? <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Abrir</a> : '—'}</td>
                  <td className="p-2"><a href={`/Compras?id=${encodeURIComponent(id)}`} className="text-blue-700 underline">Ver solicitação</a></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4 font-semibold">
          <span>TOTAL DAS SOLICITAÇÕES = {money(somaCentavos / 100)}</span>
          <span>VALOR UTILIZADO = {money(utilizado)}</span>
          {!confere && <span role="alert" className="text-red-700">Divergência de composição; atualize a página e avise a administração.</span>}
        </div>
      </section>
    </div>
  );
}
