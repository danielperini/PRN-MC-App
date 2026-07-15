import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FolderOpen, Eye, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Loader2, Image, Camera, Download } from 'lucide-react';

const PASTAS_SUGERIDAS = [{ label: 'Relatórios Mensais (pasta padrão)', id: '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ' }];
const CACHE_KEYS = ['museus_centro_galeria_fotos_cache_v2', 'museus_centro_galeria_fotos_cache_v3_full', 'museus_centro_galeria_fotos_cache_v4_attachment'];

function limparCacheGaleria() { try { CACHE_KEYS.forEach((key) => localStorage.removeItem(key)); } catch { /* cache opcional */ } }
function FotoPreviewCard({ foto }) {
  const concluida = foto.ja_importada && !foto.precisa_reparar;
  return <div className={`space-y-2 rounded-xl border p-3 ${concluida ? 'border-gray-200 bg-gray-50 opacity-60' : foto.precisa_reparar ? 'border-amber-300 bg-amber-50' : 'border-black bg-white'}`}>
    <div className="flex items-start gap-3">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {foto.thumbnail_url ? <img src={foto.thumbnail_url} alt="Pré-visualização" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <div className="flex h-full w-full items-center justify-center text-gray-300"><Camera className="h-6 w-6" /></div>}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-xs font-semibold text-black">{foto.drive_nome_original}</p>
        {foto.legenda && <p className="text-xs italic leading-snug text-blue-600">{foto.legenda}</p>}
        <div className="flex flex-wrap gap-1">
          {foto.museu && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">{foto.museu}</span>}
          {foto.mes && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">{foto.mes}/{foto.ano}</span>}
          {foto.atividade_titulo ? <span className="max-w-[180px] truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{foto.atividade_titulo}</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">Sem vínculo</span>}
          {concluida && <Badge variant="outline" className="border-gray-300 text-[10px] text-gray-500">Baixada e persistida</Badge>}
          {foto.precisa_reparar && <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700">URL do Drive — reparar</Badge>}
        </div>
      </div>
    </div>
    {foto.drive_url && <a href={foto.drive_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline"><FolderOpen className="h-3 w-3" /> Ver original no Drive</a>}
  </div>;
}

export default function RestaurarFotosDrive({ onImportConcluida }) {
  const [collapsed, setCollapsed] = useState(true);
  const [folderId, setFolderId] = useState(PASTAS_SUGERIDAS[0].id);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);

  async function handlePreview() {
    if (!folderId.trim()) return toast.warning('Informe o ID da pasta do Drive.');
    setLoadingPreview(true); setPreview(null); setResultado(null);
    try {
      const res = await base44.functions.invoke('restaurarGaleriaDrive', { folder_id: folderId.trim(), modo: 'preview' });
      if (!res.data?.success) throw new Error(res.data?.error || 'Falha ao analisar a pasta.');
      setPreview(res.data);
      toast.success(`${res.data.total_imagens} imagem(ns): ${res.data.total_novas} nova(s), ${res.data.total_reparar || 0} para reparar.`);
    } catch (e) { toast.error(`Erro ao analisar pasta: ${e?.message || e}`); }
    finally { setLoadingPreview(false); }
  }

  async function handleConfirmar() {
    const processar = preview?.resultados?.filter((foto) => !foto.ja_importada || foto.precisa_reparar) || [];
    if (!processar.length) return toast.warning('Nenhuma foto nova ou incompleta para baixar.');
    setLoadingImport(true); setResultado(null);
    try {
      const res = await base44.functions.invoke('restaurarGaleriaDrive', { folder_id: folderId.trim(), modo: 'confirmar' });
      const dados = res.data || {};
      setResultado(dados);
      if (dados.total_erros > 0) toast.warning(`${dados.total_criadas || 0} novas, ${dados.total_reparadas || 0} reparadas e ${dados.total_erros} erro(s).`);
      else toast.success(`${dados.total_criadas || 0} foto(s) baixadas e ${dados.total_reparadas || 0} URL(s) reparadas em ${dados.total_blocos || 0} bloco(s).`);
      limparCacheGaleria();
      await onImportConcluida?.();
      await handlePreview();
    } catch (e) { toast.error(`Erro na importação: ${e?.message || e}`); }
    finally { setLoadingImport(false); }
  }

  const processar = preview?.resultados?.filter((foto) => !foto.ja_importada || foto.precisa_reparar) || [];
  const concluidas = preview?.resultados?.filter((foto) => foto.ja_importada && !foto.precisa_reparar) || [];

  return <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <button onClick={() => setCollapsed((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100"><Image className="h-4 w-4 text-black" /></div><div className="text-left"><p className="text-sm font-semibold text-black">Restaurar fotos do Drive</p><p className="text-xs text-gray-500">Baixa os arquivos reais, persiste no Base44 e vincula aos relatórios</p></div></div>
      {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
    </button>
    {!collapsed && <div className="space-y-4 border-t border-gray-100 px-5 pb-5 pt-4">
      <div className="space-y-2"><label className="text-xs font-medium text-gray-600">ID da pasta do Google Drive</label><Input value={folderId} onChange={(e) => setFolderId(e.target.value)} placeholder="Cole o ID da pasta do Drive..." />
        <div className="flex flex-wrap gap-2">{PASTAS_SUGERIDAS.map((p) => <button key={p.id} type="button" onClick={() => setFolderId(p.id)} className={`rounded-full border px-2.5 py-1 text-[11px] ${folderId === p.id ? 'border-black bg-black text-white' : 'border-gray-300 text-gray-600'}`}>{p.label}</button>)}</div>
      </div>
      <div className="space-y-0.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700"><p>✅ Detecta museu, mês e ano pelo nome e pelo caminho da pasta</p><p>🔗 Vincula a atividade apenas quando houver correspondência</p><p>📝 Gera legenda no formato: Atividade — Local — Data</p><p>🔁 Deduplica pelo ID real do arquivo no Google Drive</p><p>⬇️ Baixa o conteúdo e envia ao armazenamento do Base44 em blocos de 10</p></div>
      <div className="flex flex-wrap gap-2"><Button onClick={handlePreview} disabled={loadingPreview || loadingImport} variant="outline" className="gap-2">{loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}{loadingPreview ? 'Analisando...' : 'Pré-visualizar fotos'}</Button>{preview && processar.length > 0 && <Button onClick={handleConfirmar} disabled={loadingImport || loadingPreview} className="gap-2 bg-black text-white">{loadingImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{loadingImport ? 'Baixando em blocos de 10...' : `Baixar e importar ${processar.length} foto(s)`}</Button>}</div>
      {loadingImport && <div className="rounded-xl border bg-slate-50 p-4"><p className="text-sm font-semibold">Download e persistência em andamento</p><p className="mt-1 text-xs text-gray-500">Cada bloco contém até 10 imagens. A janela será atualizada ao final.</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-2/3 animate-pulse bg-slate-700" /></div></div>}
      {preview && !loadingPreview && <div className="space-y-3"><div className="flex flex-wrap items-center gap-3 text-sm"><strong>{preview.total_imagens} imagens encontradas</strong>{preview.total_novas > 0 && <Badge className="bg-green-100 text-green-700">{preview.total_novas} novas</Badge>}{preview.total_reparar > 0 && <Badge className="bg-amber-100 text-amber-700">{preview.total_reparar} para reparar</Badge>}{concluidas.length > 0 && <Badge variant="outline">{concluidas.length} concluídas</Badge>}</div>{processar.length > 0 && <div className="grid max-h-[500px] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">{processar.map((foto, i) => <FotoPreviewCard key={foto.drive_file_id || i} foto={foto} />)}</div>}{!processar.length && <div className="rounded-xl bg-green-50 p-5 text-sm font-semibold text-green-700">Todas as fotos foram baixadas e persistidas com URL válida.</div>}</div>}
      {resultado && <div className={`space-y-1 rounded-xl border p-4 ${resultado.total_erros ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}><p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-5 w-5" />{resultado.total_criadas || 0} criadas · {resultado.total_reparadas || 0} reparadas · {resultado.total_erros || 0} erros</p><p className="text-xs">Processadas em {resultado.total_blocos || 0} bloco(s) de até 10.</p>{resultado.falhas?.slice(0, 5).map((falha, i) => <p key={i} className="flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3 w-3" />{falha.arquivo}: {falha.erro}</p>)}</div>}
    </div>}
  </div>;
}
