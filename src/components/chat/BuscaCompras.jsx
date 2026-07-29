import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, Loader2 } from 'lucide-react';

const MESES = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const ANOS = ['2024', '2025', '2026'];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'APROVADO_COORD', label: 'Aprovado Coord.' },
  { value: 'APROVADO_ADMIN', label: 'Aprovado Admin' },
  { value: 'PAGO', label: 'Pago' },
];

const MUSEU_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'MUMO', label: 'MUMO' },
  { value: 'MIS', label: 'MIS' },
  { value: 'MHAB', label: 'MHAB' },
  { value: 'Geral', label: 'Geral' },
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function fmtBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function statusLabel(status) {
  const map = {
    APROVADO_COORD: 'Aprv. Coord',
    APROVADO_ADMIN: 'Aprv. Admin',
    PAGO: 'Pago',
    SOLICITADO: 'Solicitado',
    RASCUNHO: 'Rascunho',
    RECUSADO: 'Recusado',
    CANCELADO: 'Cancelado',
    DEVOLVIDO: 'Devolvido',
  };
  return map[status] || status || '—';
}

function statusColor(status) {
  if (status === 'PAGO') return 'text-green-700 bg-green-50';
  if (status === 'APROVADO_ADMIN') return 'text-blue-700 bg-blue-50';
  if (status === 'APROVADO_COORD') return 'text-indigo-700 bg-indigo-50';
  if (status === 'RECUSADO' || status === 'CANCELADO') return 'text-red-700 bg-red-50';
  return 'text-gray-600 bg-gray-100';
}

export default function BuscaCompras() {
  const [allCompras, setAllCompras] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);

  const [texto, setTexto] = useState('');
  const [museu, setMuseu] = useState('');
  const [status, setStatus] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState('');

  // Carrega todos ao montar
  useEffect(() => {
    let mounted = true;
    base44.entities.PurchaseRequest.list('-created_date', 500)
      .then((data) => { if (mounted) { setAllCompras(data || []); setLoadingData(false); } })
      .catch(() => { if (mounted) setLoadingData(false); });
    return () => { mounted = false; };
  }, []);

  const handleBuscar = useCallback(() => {
    setSearching(true);
    const q = normalizeText(texto);

    const filtered = allCompras.filter((c) => {
      // Texto livre
      if (q) {
        const haystack = normalizeText(
          [c.fornecedor_nome, c.descricao_item].filter(Boolean).join(' ')
        );
        if (!haystack.includes(q)) return false;
      }
      // Museu/CC
      if (museu) {
        const cc = normalizeText(c.centro_custo || '');
        if (!cc.includes(normalizeText(museu))) return false;
      }
      // Status
      if (status && c.status !== status) return false;
      // Período
      if (mes || ano) {
        const d = c.created_date ? new Date(c.created_date) : null;
        if (!d) return false;
        if (mes && String(d.getMonth() + 1) !== mes) return false;
        if (ano && String(d.getFullYear()) !== ano) return false;
      }
      return true;
    });

    setResults(filtered);
    setSearching(false);
  }, [allCompras, texto, museu, status, mes, ano]);

  const handleLimpar = () => {
    setTexto('');
    setMuseu('');
    setStatus('');
    setMes('');
    setAno('');
    setResults(null);
  };

  const totalValor = results
    ? results.reduce((sum, c) => sum + (Number(c.valor_aprovado || c.valor_solicitado) || 0), 0)
    : 0;

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500 text-xs">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Carregando compras...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filtros */}
      <div className="p-3 space-y-2 border-b bg-gray-50">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
          placeholder="Fornecedor ou descrição..."
          className="text-xs h-8"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={museu}
            onChange={(e) => setMuseu(e.target.value)}
            className="text-xs border rounded-md px-2 py-1.5 bg-white w-full"
          >
            {MUSEU_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-xs border rounded-md px-2 py-1.5 bg-white w-full"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="text-xs border rounded-md px-2 py-1.5 bg-white w-full"
          >
            <option value="">Mês</option>
            {MESES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="text-xs border rounded-md px-2 py-1.5 bg-white w-full"
          >
            <option value="">Ano</option>
            {ANOS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleBuscar}
            disabled={searching}
            size="sm"
            className="flex-1 h-8 text-xs"
          >
            {searching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
            Buscar
          </Button>
          <Button
            onClick={handleLimpar}
            variant="outline"
            size="sm"
            className="h-8 text-xs px-3"
          >
            <X className="w-3 h-3 mr-1" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Resultados */}
      <div className="flex-1 overflow-auto">
        {results === null ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            Use os filtros acima e clique em Buscar
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-500 px-4 text-center">
            Nenhuma compra encontrada com esses filtros.
          </div>
        ) : (
          <>
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-600 border-b">Fornecedor</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-600 border-b">Descrição</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-600 border-b">CC</th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-600 border-b">Valor</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-600 border-b">Status</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-600 border-b">Data</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c, i) => (
                  <tr key={c.id || i} className={i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-2 py-1.5 border-b border-gray-100 max-w-[70px] truncate" title={c.fornecedor_nome}>
                      {c.fornecedor_nome || '—'}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-100 max-w-[80px] truncate" title={c.descricao_item}>
                      {c.descricao_item || '—'}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-100 whitespace-nowrap">
                      {c.centro_custo || '—'}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-100 text-right whitespace-nowrap font-medium">
                      {fmtBRL(c.valor_aprovado || c.valor_solicitado)}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-100 whitespace-nowrap">
                      {fmtDate(c.created_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Rodapé */}
            <div className="sticky bottom-0 bg-white border-t px-3 py-2 flex justify-between items-center text-xs">
              <span className="text-gray-500">{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
              <span className="font-bold text-gray-800">Total: R$ {fmtBRL(totalValor)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}