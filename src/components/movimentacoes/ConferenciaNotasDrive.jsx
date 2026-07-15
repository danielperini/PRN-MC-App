import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, FileText, FolderSync, Loader2, RefreshCw, AlertTriangle, Search, X } from 'lucide-react';

const PASTA_DEFAULT = '1OZj1U8TQWFZHa0e2TBsTdV_-SFz6mmLj'; // pasta NFs Drive

function statusBadge(item) {
  const s = String(item?.status_processamento || item?.tipo_detectado || '').toLowerCase();
  if (s.includes('aprovad')) return <Badge className="bg-green-100 text-green-700 border-green-300">Aprovada</Badge>;
  if (s.includes('reprovad') || s.includes('recusad')) return <Badge className="bg-red-100 text-red-700 border-red-300">Reprovada</Badge>;
  if (s.includes('pago')) return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Paga</Badge>;
  if (s.includes('pendente') || s.includes('aguard')) return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">Pendente</Badge>;
  if (s.includes('rascunho')) return <Badge className="bg-gray-100 text-gray-600 border-gray-300">Rascunho</Badge>;
  return <Badge variant="outline" className="text-gray-500 text-[10px]">{item?.status_processamento || '—'}</Badge>;
}

export default function ConferenciaNotasDrive() {
  const [collapsed, setCollapsed] = useState(false);
  const [pasta, setPasta] = useState(PASTA_DEFAULT);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoSync, setUltimoSync] = useState(null);
  const [busca, setBusca] = useState('');
  const queryClient = useQueryClient();

  const { data: intakes = [], isLoading, refetch } = useQuery({
    queryKey: ['documentintake-nfs-drive'],
    queryFn: () => base44.entities.DocumentIntake.filter({
      origem: 'google_drive_sync',
      status_registro: 'ATIVO',
    }, '-created_date', 500),
    staleTime: 60000,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases-nf-conferencia'],
    queryFn: () => base44.entities.PurchaseRequest.filter({
      status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO', 'SOLICITADO'] },
    }, '-created_date', 1000),
    staleTime: 120000,
  });

  // Mapa: drive_file_id → PurchaseRequest
  const purchaseByDriveId = new Map(
    purchases.filter(p => p.nf_pdf_url || p.nota_fiscal_url || p.arquivo_url)
      .map(p => [p.drive_file_id || p.nf_pdf_url, p])
  );

  // Classifica cada intake: tem PurchaseRequest vinculado?
  const itens = intakes.map(item => {
    const purchase = purchaseByDriveId.get(item.drive_file_id) || null;
    return { ...item, purchase, na_prestacao: Boolean(purchase) };
  });

  const filtrados = busca
    ? itens.filter(i => [i.file_name_original, i.fornecedor_nome, i.nf_numero, i.nf_emitente_nome]
        .some(v => String(v || '').toLowerCase().includes(busca.toLowerCase())))
    : itens;

  const naPrestacao = filtrados.filter(i => i.na_prestacao).length;
  const ausentes = filtrados.filter(i => !i.na_prestacao).length;

  async function sincronizar() {
    if (!pasta.trim()) return toast.warning('Informe o ID da pasta do Drive.');
    setSincronizando(true);
    try {
      const res = await base44.functions.invoke('syncNotasFiscaisDrive', { folder_id: pasta.trim() });
      const d = res.data || {};
      if (!d.success && d.code !== 'DRIVE_NOT_CONNECTED') throw new Error(d.error || 'Falha na sincronização.');
      if (d.code === 'DRIVE_NOT_CONNECTED') {
        toast.error('Google Drive não está conectado. Reconecte nas configurações.');
      } else {
        setUltimoSync({ importadas: d.importadas || 0, existentes: d.existentes || 0, erros: d.erros || 0 });
        toast.success(`${d.importadas || 0} NF(s) importadas, ${d.existentes || 0} já existentes.`);
        queryClient.invalidateQueries(['documentintake-nfs-drive']);
        refetch();
      }
    } catch (e) {
      toast.error(`Erro: ${e?.message || e}`);
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Cabeçalho colapsável */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Conferência NFs × Prestação de Contas</p>
            <p className="text-xs text-gray-500">
              {isLoading ? 'Carregando…' : `${itens.length} NFs do Drive · ${naPrestacao} na prestação · `}
              {!isLoading && <span className={ausentes > 0 ? 'font-semibold text-red-600' : 'text-green-600'}>{ausentes} ausentes</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ausentes > 0 && <Badge className="bg-red-100 text-red-700 border-red-300">{ausentes} ausentes</Badge>}
          {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 space-y-4 px-5 pb-5 pt-4">
          {/* Controles */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-500 mb-1 block">ID da pasta Drive (NFs)</label>
              <input
                value={pasta}
                onChange={e => setPasta(e.target.value)}
                placeholder="ID da pasta do Google Drive…"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={sincronizar} disabled={sincronizando} className="gap-2 bg-slate-900 text-white">
              {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSync className="h-4 w-4" />}
              {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
            </Button>
            <Button variant="outline" onClick={() => { queryClient.invalidateQueries(['documentintake-nfs-drive']); refetch(); }} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Atualizar lista
            </Button>
          </div>

          {/* Resultado do último sync */}
          {ultimoSync && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Último sync: <strong>{ultimoSync.importadas} importadas</strong> · {ultimoSync.existentes} já existiam · {ultimoSync.erros} erro(s)
            </div>
          )}

          {/* Info automação */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
            ⏱ Automação diária configurada às 07h00 — importa NFs novas do Drive automaticamente.
          </div>

          {/* Cards resumo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[10px] font-bold uppercase text-gray-500">Total no Drive</p>
              <p className="mt-1 text-xl font-bold text-black">{itens.length}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-[10px] font-bold uppercase text-green-600">Na prestação</p>
              <p className="mt-1 text-xl font-bold text-green-700">{naPrestacao}</p>
            </div>
            <div className={`rounded-xl border p-4 ${ausentes > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-[10px] font-bold uppercase ${ausentes > 0 ? 'text-red-600' : 'text-gray-500'}`}>Ausentes na prestação</p>
              <p className={`mt-1 text-xl font-bold ${ausentes > 0 ? 'text-red-700' : 'text-gray-400'}`}>{ausentes}</p>
            </div>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, fornecedor ou número da NF…"
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-9 text-sm"
            />
            {busca && <button type="button" onClick={() => setBusca('')} className="absolute right-3 top-2.5"><X className="h-4 w-4 text-gray-400" /></button>}
          </div>

          {/* Tabela */}
          {isLoading ? (
            <div className="py-10 text-center text-gray-400"><Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <FileText className="mx-auto h-8 w-8 mb-2 opacity-30" />
              <p>Nenhuma NF do Drive encontrada. Clique em "Sincronizar agora" para importar.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs text-gray-500">Arquivo</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500">Fornecedor / Nº NF</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500">Status Drive</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500">Na prestação</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtrados.map((item, idx) => (
                      <tr key={item.id || idx} className={item.na_prestacao ? '' : 'bg-red-50/40'}>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="truncate text-xs font-medium text-black">{item.file_name_original || item.file_name_final || '—'}</p>
                          <p className="text-[10px] text-gray-400">{item.mime_type?.includes('xml') ? 'XML' : 'PDF'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-gray-800">{item.fornecedor_nome || item.nf_emitente_nome || '—'}</p>
                          {item.nf_numero && <p className="text-[10px] text-gray-400">NF {item.nf_numero}</p>}
                        </td>
                        <td className="px-4 py-3">{statusBadge(item)}</td>
                        <td className="px-4 py-3">
                          {item.na_prestacao ? (
                            <span className="flex items-center gap-1 text-xs text-green-700 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Sim
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                              <AlertTriangle className="h-3.5 w-3.5" /> Ausente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.arquivo_original_url && (
                            <a href={item.arquivo_original_url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100">
                              <ExternalLink className="h-3 w-3" /> Drive
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ausentes > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>{ausentes} NF(s) encontradas no Drive não constam na prestação de contas.</strong><br />
                Verifique se foram lançadas em Compras ou se precisam ser importadas via Entrada Única.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}