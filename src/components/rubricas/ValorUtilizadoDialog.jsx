import React, { useState } from 'react';
import { X } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const first = (...values) => values.find(value => value !== null && value !== undefined && String(value).trim()) || '—';

export default function ValorUtilizadoDialog({ rubrica, composition, onClose, onEditPurchase, onCompositionChanged, canEdit = false }) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [correcting, setCorrecting] = useState(null);
  const [error, setError] = useState('');
  if (!rubrica) return null;
  const orcado = Number(composition?.orcado ?? rubrica.valor_rubrica ?? rubrica.valor_total ?? 0);
  const utilizado = Number(composition?.utilizado || 0);
  const solicitacoes = composition?.solicitacoes || [];
  const somaCentavos = solicitacoes.reduce((sum, item) => sum + Math.round(Number(item.valor_composicao || 0) * 100), 0);
  const confere = somaCentavos === Number(composition?.total_cents || 0);

  async function searchPurchases(event) {
    event.preventDefault();
    if (search.trim().length < 2) { setError('Informe ao menos dois caracteres para buscar.'); return; }
    setSearching(true);
    setSearched(false);
    setError('');
    try {
      const params = new URLSearchParams({ q:search.trim(), rubricaId:String(rubrica.id) });
      const response = await fetch(`/api/finance/rubrica-composition/candidates?${params}`, { credentials:'include', cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Falha na busca');
      setCandidates(data.candidates || []);
      setSearched(true);
    } catch (cause) { setError(`Não foi possível buscar solicitações: ${cause.message}`); }
    finally { setSearching(false); }
  }

  async function correctPurchase(purchase, action) {
    const label = action === 'include' ? 'vincular a esta rubrica' : 'retirar do somatório';
    if (!window.confirm(`Confirma ${label} a solicitação ${first(purchase.nf_numero, purchase.id)}? A nota fiscal e a solicitação serão preservadas.`)) return;
    const reason = window.prompt('Informe a justificativa da correção (mínimo de 8 caracteres):');
    if (reason === null) return;
    if (reason.trim().length < 8) { setError('A justificativa precisa ter pelo menos 8 caracteres.'); return; }
    setCorrecting(purchase.id);
    setError('');
    try {
      const response = await fetch('/api/finance/rubrica-composition/correct', {
        method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ purchaseId:purchase.id, rubricaId:String(rubrica.id), action, reason:reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Correção não concluída');
      if (action === 'include') setCandidates(previous => previous.filter(item => item.id !== purchase.id));
      await onCompositionChanged?.();
    } catch (cause) { setError(`Não foi possível corrigir a composição: ${cause.message}`); }
    finally { setCorrecting(null); }
  }

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
        {canEdit && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>Corrija os lançamentos que compõem o total. Para trocar uma rubrica, use “Editar solicitação”. “Retirar do somatório” não apaga a solicitação nem a nota fiscal.</p>
              <button type="button" onClick={() => setShowAdd(value => !value)} className="rounded bg-blue-800 px-3 py-1.5 font-medium text-white hover:bg-blue-900">
                {showAdd ? 'Fechar busca' : 'Adicionar solicitação existente'}
              </button>
            </div>
            {showAdd && (
              <div className="mt-3">
                <form onSubmit={searchPurchases} className="flex gap-2">
                  <input value={search} onChange={event => { setSearch(event.target.value); setSearched(false); setCandidates([]); }} placeholder="Buscar por número da NF, fornecedor ou descrição"
                    className="min-w-0 flex-1 rounded border bg-white px-3 py-2" />
                  <button type="submit" disabled={searching} className="rounded border border-blue-700 bg-white px-3 py-2 text-blue-800 disabled:opacity-50">{searching ? 'Buscando…' : 'Buscar'}</button>
                </form>
                {candidates.length > 0 && <div className="mt-2 max-h-56 overflow-auto rounded border bg-white">
                  {candidates.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-2 last:border-b-0">
                    <span><strong>NF {first(item.nf_numero, item.id)}</strong> · {first(item.fornecedor_nome, item.nf_emitente_nome)} · {money(item.valor_composicao)}<br />
                      <small>{first(item.descricao_item)} · Rubrica atual: {first(item.rubrica_atual, 'sem rubrica')}{item.incluir_no_somatorio === false ? ' · fora do somatório' : ''}</small></span>
                    <button type="button" disabled={correcting === item.id} onClick={() => correctPurchase(item, 'include')} className="rounded border px-2 py-1 text-blue-800 disabled:opacity-50">Vincular</button>
                  </div>)}
                </div>}
                {searched && candidates.length === 0 && <p className="mt-2 text-gray-600">Nenhuma solicitação encontrada. Use outra busca.</p>}
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        {solicitacoes.length === 0 ? (
          <p className="rounded border border-dashed p-6 text-center text-gray-600">Nenhuma solicitação aprovada vinculada a esta rubrica.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-xs">
              <thead className="bg-gray-50"><tr>{['ID / número', 'Descrição', 'Fornecedor', 'Solicitante', 'Data', 'Centro de custo', 'Grupo / meta', 'Rubrica', 'Natureza', 'Item', 'Valor', 'Status', 'Documento', 'Ações'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{solicitacoes.map(item => {
                const id = String(item.id || item.base44_id || '');
                const documentUrl = item.nf_pdf_url || item.nota_fiscal_pdf_url || item.nota_fiscal_url || item.arquivo_url;
                const driveUrl = item.drive_backup_nf_pdf_link || item.drive_file_url || (item.drive_file_id ? `https://drive.google.com/file/d/${encodeURIComponent(item.drive_file_id)}/view` : '');
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
                  <td className="p-2 whitespace-nowrap">
                    {documentUrl && <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-700 underline">Nota fiscal</a>}
                    {driveUrl && <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Drive</a>}
                    {!documentUrl && !driveUrl && '—'}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {canEdit && onEditPurchase ? <button type="button" onClick={() => onEditPurchase(item)} className="mr-2 text-blue-700 underline">Editar solicitação</button> : null}
                    {canEdit && <button type="button" disabled={correcting === id} onClick={() => correctPurchase(item, 'exclude')} className="mr-2 text-red-700 underline disabled:opacity-50">Retirar do somatório</button>}
                    <a href={`/Compras?id=${encodeURIComponent(id)}`} className="text-blue-700 underline">Ver em Compras</a>
                  </td>
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
