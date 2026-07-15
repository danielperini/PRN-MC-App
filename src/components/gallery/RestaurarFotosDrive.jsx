import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FolderOpen, Eye, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Loader2, Image, Camera, Download, X } from 'lucide-react';

const PASTAS_SUGERIDAS = [
  { label: 'Relatórios Mensais', id: '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ' },
];
const PREVIEW_LIMITE = 80;
const CONFIRMAR_BLOCO = 5;

function limparCacheGaleria() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('museus_centro_galeria_fotos_cache_'))
      .forEach(k => localStorage.removeItem(k));
  } catch { }
}

function BarraProgresso({ atual, total, label }) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{atual}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-black transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FotoCard({ foto }) {
  const ok = foto.ja_importada && !foto.precisa_reparar;
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${ok ? 'border-gray-200 bg-gray-50 opacity-60' : foto.precisa_reparar ? 'border-amber-300 bg-amber-50' : 'border-black bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {foto.thumbnail_url
            ? <img src={foto.thumbnail_url} alt="" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <div className="flex h-full w-full items-center justify-center text-gray-300"><Camera className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-xs font-semibold text-black">{foto.drive_nome_original}</p>
          {foto.legenda && <p className="text-xs italic text-blue-600 leading-snug">{foto.legenda}</p>}
          <div className="flex flex-wrap gap-1">
            {foto.museu && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">{foto.museu}</span>}
            {foto.mes && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">{foto.mes}/{foto.ano}</span>}
            {foto.atividade_titulo
              ? <span className="max-w-[180px] truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{foto.atividade_titulo}</span>
              : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">Sem vínculo</span>}
            {ok && <Badge variant="outline" className="border-gray-300 text-[10px] text-gray-500">Persistida</Badge>}
            {foto.precisa_reparar && <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700">Reparar URL</Badge>}
          </div>
        </div>
      </div>
      {foto.drive_url && (
        <a href={foto.drive_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline">
          <FolderOpen className="h-3 w-3" /> Ver no Drive
        </a>
      )}
    </div>
  );
}

export default function RestaurarFotosDrive({ onImportConcluida }) {
  const [collapsed, setCollapsed] = useState(true);
  const [folderId, setFolderId] = useState(PASTAS_SUGERIDAS[0].id);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [fotosPreview, setFotosPreview] = useState([]);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewHasMore, setPreviewHasMore] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [progresso, setProgresso] = useState({ offset: 0, criadas: 0, reparadas: 0, erros: 0, falhas: [] });
  const [concluido, setConcluido] = useState(false);
  const cancelarRef = useRef(false);

  async function carregarPreview(offset, acumular) {
    if (!folderId.trim()) return toast.warning('Informe o ID da pasta do Drive.');
    setLoadingPreview(true);
    if (!acumular) { setFotosPreview([]); setResumo(null); setConcluido(false); }
    try {
      const res = await base44.functions.invoke('restaurarGaleriaDrive', {
        folder_id: folderId.trim(),
        modo: 'preview',
        offset: offset || 0,
        limite: PREVIEW_LIMITE,
      });
      const d = res.data || {};
      if (!d.success) throw new Error(d.error || 'Falha ao analisar pasta.');
      setResumo({ total_imagens: d.total_imagens, total_novas: d.total_novas, total_reparar: d.total_reparar, total_ja_importadas: d.total_ja_importadas });
      setFotosPreview(prev => acumular ? [...prev, ...(d.resultados || [])] : (d.resultados || []));
      setPreviewOffset((offset || 0) + PREVIEW_LIMITE);
      setPreviewHasMore(d.has_more);
      if (!acumular) toast.success(`${d.total_imagens} imagens · ${d.total_novas} novas · ${d.total_reparar} para reparar`);
    } catch (e) {
      toast.error(`Erro: ${e?.message || e}`);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function iniciarDownload() {
    if (!resumo) return;
    const totalParaBaixar = resumo.total_novas + resumo.total_reparar;
    if (totalParaBaixar === 0) return toast.info('Todas as fotos já estão importadas.');
    setBaixando(true);
    setConcluido(false);
    cancelarRef.current = false;
    setProgresso({ offset: 0, criadas: 0, reparadas: 0, erros: 0, falhas: [] });

    let offset = 0;
    let totalCriadas = 0;
    let totalReparadas = 0;
    let totalErros = 0;
    const todasFalhas = [];

    try {
      while (true) {
        if (cancelarRef.current) { toast.info('Download cancelado.'); break; }
        const res = await base44.functions.invoke('restaurarGaleriaDrive', {
          folder_id: folderId.trim(),
          modo: 'confirmar',
          offset,
          limite: CONFIRMAR_BLOCO,
        });
        const d = res.data || {};
        totalCriadas += d.total_criadas || 0;
        totalReparadas += d.total_reparadas || 0;
        totalErros += d.total_erros || 0;
        if (d.falhas && d.falhas.length) todasFalhas.push(...d.falhas);

        setProgresso({
          offset: d.next_offset || offset,
          criadas: totalCriadas,
          reparadas: totalReparadas,
          erros: totalErros,
          falhas: [...todasFalhas],
        });

        if (!d.has_more) break;
        offset = d.next_offset;
      }

      if (!cancelarRef.current) {
        setConcluido(true);
        limparCacheGaleria();
        if (onImportConcluida) await onImportConcluida();
        if (totalErros > 0) toast.warning(`${totalCriadas} criadas, ${totalReparadas} reparadas, ${totalErros} erro(s).`);
        else toast.success(`${totalCriadas} fotos baixadas e ${totalReparadas} reparadas!`);
        await carregarPreview(0, false);
      }
    } catch (e) {
      toast.error(`Erro no download: ${e?.message || e}`);
    } finally {
      setBaixando(false);
    }
  }

  const fotosParaBaixar = fotosPreview.filter(f => !f.ja_importada || f.precisa_reparar);
  const fotosConcluidas = fotosPreview.filter(f => f.ja_importada && !f.precisa_reparar);
  const totalParaBaixar = resumo ? resumo.total_novas + resumo.total_reparar : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
            <Image className="h-4 w-4 text-black" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Restaurar fotos do Drive</p>
            <p className="text-xs text-gray-500">
              Baixa arquivos reais, persiste no Base44 e vincula aos relatórios
              {resumo && ` · ${totalParaBaixar} para baixar`}
            </p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="space-y-4 border-t border-gray-100 px-5 pb-5 pt-4">
          {/* Pasta */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">ID da pasta do Google Drive</label>
            <Input value={folderId} onChange={e => setFolderId(e.target.value)} placeholder="Cole o ID da pasta…" />
            <div className="flex flex-wrap gap-2">
              {PASTAS_SUGERIDAS.map(p => (
                <button key={p.id} type="button" onClick={() => setFolderId(p.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${folderId === p.id ? 'border-black bg-black text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 space-y-0.5">
            <p>✅ Detecta museu, mês e ano pelo caminho da pasta e nome do arquivo</p>
            <p>🔗 Vincula atividade com correspondência semântica (score ≥ 4)</p>
            <p>⬇️ Baixa {CONFIRMAR_BLOCO} fotos por chamada — sem timeout</p>
            <p>🔁 Deduplica pelo ID real do Google Drive</p>
          </div>

          {/* Botões */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => carregarPreview(0, false)} disabled={loadingPreview || baixando} variant="outline" className="gap-2">
              {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {loadingPreview ? 'Analisando…' : 'Analisar pasta'}
            </Button>
            {resumo && totalParaBaixar > 0 && !baixando && (
              <Button onClick={iniciarDownload} disabled={loadingPreview} className="gap-2 bg-black text-white">
                <Download className="h-4 w-4" />
                Baixar {totalParaBaixar} foto(s)
              </Button>
            )}
            {baixando && (
              <Button type="button" onClick={() => { cancelarRef.current = true; }} variant="outline" className="gap-2 border-red-300 text-red-600">
                <X className="h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>

          {/* Cards resumo */}
          {resumo && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total', valor: resumo.total_imagens, cls: 'border-gray-200 bg-gray-50 text-black' },
                { label: 'Novas', valor: resumo.total_novas, cls: 'border-green-200 bg-green-50 text-green-700' },
                { label: 'Reparar URL', valor: resumo.total_reparar, cls: 'border-amber-200 bg-amber-50 text-amber-700' },
                { label: 'Importadas', valor: resumo.total_ja_importadas, cls: 'border-gray-200 bg-gray-50 text-gray-500' },
              ].map(c => (
                <div key={c.label} className={`rounded-xl border p-3 ${c.cls}`}>
                  <p className="text-[10px] font-bold uppercase opacity-70">{c.label}</p>
                  <p className="mt-1 text-xl font-bold">{c.valor}</p>
                </div>
              ))}
            </div>
          )}

          {/* Progresso */}
          {baixando && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold">Download em andamento…</p>
              <BarraProgresso
                atual={progresso.criadas + progresso.reparadas + progresso.erros}
                total={totalParaBaixar}
                label={`${progresso.criadas} criadas · ${progresso.reparadas} reparadas · ${progresso.erros} erros`}
              />
              <p className="text-xs text-gray-500">
                Processando {CONFIRMAR_BLOCO} fotos por chamada — aguarde sem fechar a janela.
              </p>
            </div>
          )}

          {/* Resultado */}
          {concluido && !baixando && (
            <div className={`rounded-xl border p-4 space-y-1 ${progresso.erros > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                {progresso.criadas} criadas · {progresso.reparadas} reparadas · {progresso.erros} erros
              </p>
              {progresso.falhas.slice(0, 5).map((f, i) => (
                <p key={i} className="flex items-center gap-1 text-xs text-red-700">
                  <AlertTriangle className="h-3 w-3" /> {f.arquivo}: {f.erro}
                </p>
              ))}
            </div>
          )}

          {/* Grid preview */}
          {fotosPreview.length > 0 && !baixando && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-gray-500">
                  Pré-visualização ({fotosPreview.length} de {resumo?.total_imagens || '?'})
                </p>
                {fotosConcluidas.length > 0 && (
                  <Badge variant="outline" className="text-[10px] text-gray-500">{fotosConcluidas.length} já importadas</Badge>
                )}
              </div>
              {fotosParaBaixar.length > 0 ? (
                <div className="grid max-h-[480px] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                  {fotosParaBaixar.map((foto, i) => <FotoCard key={foto.drive_file_id || i} foto={foto} />)}
                </div>
              ) : (
                <div className="rounded-xl bg-green-50 p-5 text-sm font-semibold text-green-700">
                  ✅ Todas as fotos desta página já foram importadas com URL válida.
                </div>
              )}
              {previewHasMore && (
                <Button variant="outline" onClick={() => carregarPreview(previewOffset, true)} disabled={loadingPreview} className="w-full gap-2">
                  {loadingPreview && <Loader2 className="h-4 w-4 animate-spin" />}
                  Carregar mais fotos do preview
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}