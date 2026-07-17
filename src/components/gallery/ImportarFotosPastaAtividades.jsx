import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, Eye, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, Camera, Download, X, MapPin, User, CalendarDays, Link2, Images,
} from 'lucide-react';

const PASTA_RAIZ_LABEL = 'Pasta "Fotos Vinculadas a Atividades"';
const LOTE = 5;

function BarraProgresso({ atual, total, label }) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{atual}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FotoCard({ foto }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
          {foto.thumbnail_url
            ? <img src={foto.thumbnail_url} alt="" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.opacity = '0.2'; }} />
            : <div className="flex h-full w-full items-center justify-center text-gray-300"><Camera className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-xs font-semibold text-gray-900">{foto.drive_nome_original}</p>
          {foto.legenda && <p className="text-xs italic text-blue-600 leading-snug line-clamp-2">{foto.legenda}</p>}
          <div className="flex flex-wrap gap-1 mt-1">
            {foto.museu && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">{foto.museu}</span>}
            {foto.mes_referencia && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{foto.mes_referencia}</span>}
            {foto.atividade_titulo
              ? <span className="max-w-[200px] truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 flex items-center gap-1"><Link2 className="h-2.5 w-2.5" />{foto.atividade_titulo}</span>
              : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">Sem vínculo</span>}
            {foto.geo_coordinates && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />{foto.geo_coordinates}
              </span>
            )}
            {foto.autor_relatorio && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700 flex items-center gap-1">
                <User className="h-2.5 w-2.5" />Foto de Registro — {foto.autor_relatorio}
              </span>
            )}
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

function AtividadeSemFotoCard({ atv }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-900 truncate">{atv.titulo}</p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {atv.museu && <span className="text-[10px] text-amber-700">{atv.museu}</span>}
          {atv.mes && <span className="text-[10px] text-amber-600">{atv.mes}</span>}
          {atv.autor && <span className="text-[10px] text-amber-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{atv.autor}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ImportarFotosPastaAtividades({ onImportConcluida }) {
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [fotosPreview, setFotosPreview] = useState([]);
  const [atividadesSemFoto, setAtividadesSemFoto] = useState([]);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewHasMore, setPreviewHasMore] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ criadas: 0, ja_existia: 0, erros: 0, falhas: [] });
  const [concluido, setConcluido] = useState(false);
  const cancelarRef = useRef(false);

  async function carregarPreview(offset = 0, acumular = false) {
    setLoading(true);
    if (!acumular) { setFotosPreview([]); setResumo(null); setConcluido(false); }
    try {
      const res = await base44.functions.invoke('importarFotosPastaAtividades', {
        modo: 'preview', offset, limite: 20,
      });
      const d = res.data || {};
      if (!d.success) throw new Error(d.error || 'Falha ao analisar pasta');
      setResumo({
        total_fotos: d.total_fotos,
        total_pastas: d.total_pastas,
        atividades_sem_foto: d.atividades_sem_foto,
      });
      setFotosPreview(prev => acumular ? [...prev, ...(d.resultados || [])] : (d.resultados || []));
      setAtividadesSemFoto(d.atividades_sem_foto_lista || []);
      setPreviewOffset(offset + 20);
      setPreviewHasMore(d.has_more);
      if (!acumular) toast.success(`${d.total_fotos} fotos em ${d.total_pastas} pastas · ${d.atividades_sem_foto} atividades sem foto`);
    } catch (e) {
      toast.error(`Erro: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function iniciarImportacao() {
    if (!resumo) return;
    setImportando(true);
    setConcluido(false);
    cancelarRef.current = false;
    setProgresso({ criadas: 0, ja_existia: 0, erros: 0, falhas: [] });

    let offset = 0;
    let totalCriadas = 0;
    let totalExistia = 0;
    let totalErros = 0;
    const todasFalhas = [];

    try {
      while (true) {
        if (cancelarRef.current) { toast.info('Importação cancelada.'); break; }
        const res = await base44.functions.invoke('importarFotosPastaAtividades', {
          modo: 'importar', offset, limite: LOTE,
        });
        const d = res.data || {};
        totalCriadas += d.criadas || 0;
        totalExistia += d.ja_existia || 0;
        totalErros += (d.falhas?.length || 0);
        if (d.falhas?.length) todasFalhas.push(...d.falhas);
        setProgresso({ criadas: totalCriadas, ja_existia: totalExistia, erros: totalErros, falhas: [...todasFalhas] });
        if (!d.has_more) break;
        offset = d.next_offset;
      }
      if (!cancelarRef.current) {
        setConcluido(true);
        // Limpar cache da galeria
        Object.keys(localStorage).filter(k => k.startsWith('museus_centro_galeria_fotos_cache_')).forEach(k => localStorage.removeItem(k));
        if (onImportConcluida) onImportConcluida();
        toast.success(`${totalCriadas} fotos importadas · ${totalExistia} já existiam`);
      }
    } catch (e) {
      toast.error(`Erro na importação: ${e?.message || e}`);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-emerald-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
            <Images className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Importar fotos de atividades do Drive</p>
            <p className="text-xs text-gray-500">
              {PASTA_RAIZ_LABEL} · busca por pasta/título de atividade, autor, geolocalização
              {resumo && ` · ${resumo.total_fotos} fotos · ${resumo.atividades_sem_foto} atividades sem foto`}
            </p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="space-y-4 border-t border-emerald-100 px-5 pb-5 pt-4">

          {/* Info */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 space-y-0.5">
            <p>📂 Busca sub-pastas pelo título da pasta (= nome da atividade)</p>
            <p>🔗 Vincula automaticamente às atividades por correspondência semântica</p>
            <p>👤 Legenda: <strong>"Foto de Registro — [Autor do Relatório]"</strong></p>
            <p>📍 Extrai geolocalização dos metadados EXIF quando disponível</p>
            <p>⚠️ Identifica atividades de relatórios sem foto de registro</p>
          </div>

          {/* Botões */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => carregarPreview(0, false)} disabled={loading || importando} variant="outline" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {loading ? 'Analisando…' : 'Analisar pasta do Drive'}
            </Button>
            {resumo && resumo.total_fotos > 0 && !importando && (
              <Button onClick={iniciarImportacao} disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Download className="h-4 w-4" />
                Importar todas ({resumo.total_fotos})
              </Button>
            )}
            {importando && (
              <Button type="button" onClick={() => { cancelarRef.current = true; }} variant="outline" className="gap-2 border-red-300 text-red-600">
                <X className="h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>

          {/* Cards resumo */}
          {resumo && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Fotos encontradas', valor: resumo.total_fotos, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                { label: 'Pastas/atividades', valor: resumo.total_pastas, cls: 'border-blue-200 bg-blue-50 text-blue-800' },
                { label: 'Atividades sem foto', valor: resumo.atividades_sem_foto, cls: 'border-amber-200 bg-amber-50 text-amber-800' },
              ].map(c => (
                <div key={c.label} className={`rounded-xl border p-3 ${c.cls}`}>
                  <p className="text-[10px] font-bold uppercase opacity-70">{c.label}</p>
                  <p className="mt-1 text-xl font-bold">{c.valor}</p>
                </div>
              ))}
            </div>
          )}

          {/* Progresso */}
          {importando && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold">Importação em andamento…</p>
              <BarraProgresso
                atual={progresso.criadas + progresso.ja_existia + progresso.erros}
                total={resumo?.total_fotos || 0}
                label={`${progresso.criadas} importadas · ${progresso.ja_existia} já existiam · ${progresso.erros} erros`}
              />
            </div>
          )}

          {/* Resultado */}
          {concluido && !importando && (
            <div className={`rounded-xl border p-4 space-y-1 ${progresso.erros > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                {progresso.criadas} importadas · {progresso.ja_existia} já existiam · {progresso.erros} erros
              </p>
              {progresso.falhas.slice(0, 5).map((f, i) => (
                <p key={i} className="flex items-center gap-1 text-xs text-red-700">
                  <AlertTriangle className="h-3 w-3" /> {f.arquivo}: {f.erro}
                </p>
              ))}
            </div>
          )}

          {/* Preview de fotos */}
          {fotosPreview.length > 0 && !importando && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase text-gray-500">
                Fotos encontradas ({fotosPreview.length} de {resumo?.total_fotos || '?'})
              </p>
              <div className="grid max-h-[500px] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                {fotosPreview.map((foto, i) => (
                  <FotoCard key={foto.drive_file_id || i} foto={foto} />
                ))}
              </div>
              {previewHasMore && (
                <Button variant="outline" onClick={() => carregarPreview(previewOffset, true)} disabled={loading} className="w-full gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Carregar mais fotos
                </Button>
              )}
            </div>
          )}

          {/* Atividades sem foto */}
          {atividadesSemFoto.length > 0 && !importando && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Atividades sem foto de registro ({atividadesSemFoto.length})
              </p>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {atividadesSemFoto.map((atv, i) => (
                  <AtividadeSemFotoCard key={atv.id || i} atv={atv} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}