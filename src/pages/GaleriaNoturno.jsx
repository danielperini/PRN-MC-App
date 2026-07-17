import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '@/components/auth/RequireAuth';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Moon, MapPin, Camera, RefreshCw, Sparkles, X, ChevronDown,
  ChevronRight, Search, Images, AlertCircle, ExternalLink,
} from 'lucide-react';

// ─── Locais do evento ────────────────────────────────────────────────────────
const LOCAIS = [
  { id: 'MHAB',      nome: 'Museu Histórico Abílio Barreto',  sigla: 'MHAB', bairro: 'Cidade Jardim', cor: 'emerald' },
  { id: 'MIS',       nome: 'Museu da Imagem e do Som BH',     sigla: 'MIS',  bairro: 'Centro',        cor: 'sky'     },
  { id: 'MUMO',      nome: 'Museu do Museu',                  sigla: 'MUMO', bairro: 'Centro',        cor: 'violet'  },
  { id: 'MAO',       nome: 'Museu de Artes e Ofícios',        sigla: 'MAO',  bairro: 'Centro',        cor: 'amber'   },
  { id: 'MINEIRO',   nome: 'Museu Mineiro',                   sigla: 'MM',   bairro: 'Centro',        cor: 'rose'    },
  { id: 'PAMPULHA',  nome: 'Complexo da Pampulha',            sigla: 'PAM',  bairro: 'Pampulha',      cor: 'indigo'  },
];

const COR_MAP = {
  emerald: { ring: 'ring-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  sky:     { ring: 'ring-sky-400',     bg: 'bg-sky-50',     text: 'text-sky-700',     badge: 'bg-sky-100 text-sky-800'         },
  violet:  { ring: 'ring-violet-400',  bg: 'bg-violet-50',  text: 'text-violet-700',  badge: 'bg-violet-100 text-violet-800'   },
  amber:   { ring: 'ring-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-800'     },
  rose:    { ring: 'ring-rose-400',    bg: 'bg-rose-50',    text: 'text-rose-700',    badge: 'bg-rose-100 text-rose-800'       },
  indigo:  { ring: 'ring-indigo-400',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  badge: 'bg-indigo-100 text-indigo-800'   },
};

// ─── Utilitários ─────────────────────────────────────────────────────────────
function detectarLocal(foto) {
  const txt = ((foto.file_name || '') + ' ' + (foto.legenda || foto.caption || '') + ' ' + (foto.museu || '')).toLowerCase();
  if (txt.includes('mhab') || txt.includes('abilio') || txt.includes('abílio') || txt.includes('hist')) return 'MHAB';
  if (txt.includes('mis') || txt.includes('imagem') || txt.includes('som bh')) return 'MIS';
  if (txt.includes('mumo') || txt.includes('moda') || txt.includes('museu do museu')) return 'MUMO';
  if (txt.includes('mao') || txt.includes('artes e ofício') || txt.includes('artes e oficio')) return 'MAO';
  if (txt.includes('mineiro')) return 'MINEIRO';
  if (txt.includes('pampulha') || txt.includes('casa do baile') || txt.includes('kubitschek') || txt.includes('map ')) return 'PAMPULHA';
  return null;
}

// ─── Componente de foto individual ───────────────────────────────────────────
function FotoCard({ foto, cor, onClick, eager }) {
  const cores = COR_MAP[cor] || COR_MAP.indigo;
  const legenda = foto.legenda || foto.caption || foto.file_name || 'Foto sem legenda';
  const autor = foto.author || foto.autor || 'Arquivo Viaduto das Artes';
  const isProfissional = autor.toLowerCase().includes('daniel moreira');

  return (
    <button
      type="button"
      onClick={() => onClick(foto)}
      className={`group relative overflow-hidden rounded-2xl bg-white text-left shadow-sm border border-gray-200 transition-all hover:-translate-y-1 hover:shadow-lg hover:ring-2 ${cores.ring}`}
    >
      <div className="aspect-[4/3] overflow-hidden bg-gray-100">
        <img
          src={foto.file_url || foto.thumb_url}
          alt={legenda}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          onError={(e) => { e.currentTarget.style.opacity = '0.15'; }}
        />
        {isProfissional && (
          <div className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm flex items-center gap-1">
            <Camera className="h-2.5 w-2.5" /> PRO
          </div>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900">{legenda}</p>
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <Camera className="h-2.5 w-2.5 shrink-0" />
          <span className={`font-medium ${isProfissional ? 'text-indigo-600' : 'text-gray-500'}`}>{autor}</span>
        </div>
        {foto.bairro && (
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span>{foto.bairro}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Seção de álbum por local ─────────────────────────────────────────────────
function AlbumSection({ local, fotos, onFotoClick }) {
  const [expanded, setExpanded] = useState(true);
  const cor = COR_MAP[local.cor] || COR_MAP.indigo;

  if (fotos.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-gray-200 overflow-hidden shadow-sm`}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between p-4 md:p-5 transition ${cor.bg} hover:brightness-95`}
      >
        <div className="flex items-center gap-3 text-left">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm`}>
            <MapPin className={`h-4 w-4 ${cor.text}`} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm md:text-base">{local.nome}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cor.badge}`}>{local.sigla}</span>
              <span className="text-xs text-gray-500">{local.bairro}</span>
              <span className="text-xs text-gray-400">· {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}</span>
            </div>
          </div>
        </div>
        {expanded
          ? <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
          : <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="p-4 md:p-5 bg-white">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {fotos.map((foto, idx) => (
              <FotoCard
                key={foto.id || foto.drive_file_id || idx}
                foto={foto}
                cor={local.cor}
                eager={idx < 4}
                onClick={onFotoClick}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Modal de foto expandida ─────────────────────────────────────────────────
function FotoModal({ foto, onClose }) {
  if (!foto) return null;
  const legenda = foto.legenda || foto.caption || foto.file_name || 'Foto';
  const autor = foto.author || foto.autor || 'Arquivo Viaduto das Artes';
  const isProfissional = autor.toLowerCase().includes('daniel moreira');
  const viewUrl = foto.view_url || foto.drive_backup_folder_url;

  return (
    <DialogContent className="w-full max-w-4xl overflow-hidden border-0 bg-black p-0">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>

        <img
          src={foto.file_url || foto.thumb_url}
          alt={legenda}
          className="max-h-[72vh] w-full object-contain bg-black"
        />

        <div className="bg-gradient-to-t from-black via-black/90 to-black/70 p-5 space-y-3 text-white">
          {/* Legenda principal */}
          <p className="text-base md:text-lg font-semibold leading-snug">{legenda}</p>

          {/* Crédito do fotógrafo — destaque para profissional */}
          <div className={`flex items-center gap-2 ${isProfissional ? 'text-indigo-300' : 'text-white/60'}`}>
            <Camera className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm font-medium">{autor}</span>
            {isProfissional && (
              <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">PROFISSIONAL</span>
            )}
          </div>

          {/* Metadados */}
          <div className="flex flex-wrap gap-3 text-xs text-white/60">
            {(foto.local || foto.museu) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {foto.local || foto.museu}
              </span>
            )}
            {foto.bairro && <span>{foto.bairro}</span>}
            {foto.endereco && <span className="hidden md:inline">{foto.endereco}</span>}
            {foto.coordenadas && (
              <span className="font-mono">📍 {foto.coordenadas}</span>
            )}
          </div>

          {/* Link para o Drive */}
          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-100 underline"
            >
              <ExternalLink className="h-3 w-3" /> Ver original no Google Drive
            </a>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Painel de geração do álbum ───────────────────────────────────────────────
function PainelGerarAlbum({ onAlbumGerado }) {
  const [status, setStatus] = useState('idle');
  const [dryRun, setDryRun] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  async function gerar() {
    setStatus('loading');
    setErro('');
    try {
      const res = await base44.functions.invoke('criarAlbumNoturnoDrive', {
        dry_run: dryRun,
        max_por_local: 6,
        min_por_local: 2,
      });
      setResultado(res.data);
      setStatus('done');
      if (!dryRun) onAlbumGerado?.();
    } catch (e) {
      setErro(e.message || 'Erro ao gerar álbum');
      setStatus('error');
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-900">Curadoria IA — Google Drive</p>
          <p className="text-xs text-indigo-600">Busca fotos na pasta do Noturno e cria álbuns por local com legendas jornalísticas</p>
        </div>
      </div>

      {status === 'idle' && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="rounded" />
            <span>Apenas pré-visualizar (sem salvar)</span>
          </label>
          <button
            onClick={gerar}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            {dryRun ? 'Pré-visualizar' : 'Gerar e salvar álbum'}
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-indigo-700">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Buscando fotos no Drive e gerando curadoria com IA...
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-2">
          <span><AlertCircle className="h-4 w-4 inline mr-1" />{erro}</span>
          <button onClick={() => setStatus('idle')} className="text-xs underline shrink-0">Tentar novamente</button>
        </div>
      )}

      {status === 'done' && resultado && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {[
              { label: 'No Drive', val: resultado.total_fotos_drive },
              { label: 'Selecionadas', val: resultado.total_selecionadas },
              { label: 'Locais', val: resultado.locais_com_fotos },
              { label: resultado.dry_run ? 'Simulação' : 'Salvas', val: resultado.dry_run ? '✓' : resultado.total_salvas },
            ].map(c => (
              <div key={c.label} className="rounded-xl bg-white border border-indigo-100 p-3 text-center shadow-sm">
                <p className="text-xl font-bold text-indigo-700">{c.val}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
          {resultado.dry_run ? (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>Simulação ok. Desmarque "Apenas pré-visualizar" e clique para salvar na galeria.</span>
              <button onClick={() => { setDryRun(false); setStatus('idle'); }} className="ml-2 underline font-medium whitespace-nowrap">Salvar</button>
            </div>
          ) : (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              ✓ {resultado.total_salvas} fotos salvas. Atualize a galeria abaixo.
            </div>
          )}
          <button onClick={() => { setStatus('idle'); setResultado(null); }} className="text-xs text-indigo-600 underline">Recomeçar</button>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
function GaleriaNoturnoInner() {
  const [search, setSearch] = useState('');
  const [localAtivo, setLocalAtivo] = useState('');
  const [selectedFoto, setSelectedFoto] = useState(null);
  const [showPainel, setShowPainel] = useState(false);

  // Busca fotos do ReportPhoto vinculadas ao álbum Noturno
  const { data: fotosDB = [], isLoading, refetch } = useQuery({
    queryKey: ['galeria-noturno-fotos'],
    queryFn: async () => {
      // Buscar relatórios do Noturno
      const reports = await base44.entities.Report.filter({ museu: 'Noturno nos Museus' }, '-created_date', 5);
      const albumReports = await base44.entities.Report.filter({ mes_referencia: 'Album-Noturno-2026' }, '-created_date', 5);
      const todos = [...reports, ...albumReports];
      const idsUnicos = [...new Set(todos.map(r => r.id))];

      if (idsUnicos.length === 0) return [];

      // Buscar fotos de todos esses relatórios
      const fotosPromises = idsUnicos.map(id =>
        base44.entities.ReportPhoto.filter({ report_id: id }, 'ordem', 200).catch(() => [])
      );
      const lotes = await Promise.all(fotosPromises);
      const todas = lotes.flat().filter(f => f.file_url);

      // Deduplicar por file_url
      const seen = new Set();
      return todas.filter(f => {
        const key = (f.file_url || '').split('?')[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Agrupar fotos por local detectado
  const albumPorLocal = useMemo(() => {
    const q = search.trim().toLowerCase();
    const grupos = {};

    fotosDB.forEach(foto => {
      const local = detectarLocal(foto) || 'OUTROS';
      if (!grupos[local]) grupos[local] = [];

      // Filtro de busca
      if (q) {
        const txt = ((foto.file_name || '') + ' ' + (foto.legenda || '') + ' ' + (foto.caption || '') + ' ' + (foto.author || '')).toLowerCase();
        if (!txt.includes(q)) return;
      }

      // Filtro de local ativo
      if (localAtivo && local !== localAtivo) return;

      grupos[local].push(foto);
    });

    return grupos;
  }, [fotosDB, search, localAtivo]);

  // Locais com fotos
  const locaisComFotos = useMemo(() => {
    return LOCAIS.filter(l => {
      const fotos = albumPorLocal[l.id] || [];
      return fotos.length > 0;
    });
  }, [albumPorLocal]);

  const totalFotos = useMemo(() =>
    Object.values(albumPorLocal).reduce((s, arr) => s + arr.length, 0),
  [albumPorLocal]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3 text-gray-500">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Carregando galeria do Noturno...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10 space-y-6">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow">
                <Moon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                  Noturno nos Museus
                </h1>
                <p className="text-sm text-gray-500">Álbum fotográfico por local · Belo Horizonte</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {totalFotos} {totalFotos === 1 ? 'foto' : 'fotos'} em {locaisComFotos.length} {locaisComFotos.length === 1 ? 'local' : 'locais'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setShowPainel(v => !v); }}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-sm transition ${showPainel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}
            >
              <Sparkles className="h-4 w-4" />
              Curadoria Drive
            </button>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>

        {/* ── Painel de curadoria IA ── */}
        {showPainel && (
          <PainelGerarAlbum onAlbumGerado={() => { refetch(); setShowPainel(false); }} />
        )}

        {/* ── Busca + filtro de local ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por legenda, fotógrafo, local..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Chips de local */}
          {LOCAIS.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setLocalAtivo('')}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${!localAtivo ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
              >
                Todos
              </button>
              {LOCAIS.map(l => {
                const count = (albumPorLocal[l.id] || []).length;
                const ativo = localAtivo === l.id;
                const cor = COR_MAP[l.cor];
                return (
                  <button
                    key={l.id}
                    onClick={() => setLocalAtivo(ativo ? '' : l.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${ativo ? `${cor.badge} border-transparent ring-1 ${cor.ring}` : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                  >
                    {l.sigla} {count > 0 && <span className="opacity-60">({count})</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Álbuns por local ── */}
        {totalFotos === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-16 text-center">
            <Images className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="font-semibold text-gray-700">Nenhuma foto do Noturno encontrada</p>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              Use o botão "Curadoria Drive" acima para buscar fotos da pasta do Google Drive e criar os álbuns automaticamente com IA.
            </p>
            <button
              onClick={() => setShowPainel(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 shadow"
            >
              <Sparkles className="h-4 w-4" /> Gerar álbum com IA
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Locais com fotos */}
            {locaisComFotos.map(local => (
              <AlbumSection
                key={local.id}
                local={local}
                fotos={albumPorLocal[local.id] || []}
                onFotoClick={setSelectedFoto}
              />
            ))}

            {/* Fotos sem local identificado */}
            {(albumPorLocal['OUTROS'] || []).length > 0 && !localAtivo && (
              <AlbumSection
                local={{ id: 'OUTROS', nome: 'Outras fotos do Noturno', sigla: '—', bairro: 'Belo Horizonte', cor: 'indigo' }}
                fotos={albumPorLocal['OUTROS']}
                onFotoClick={setSelectedFoto}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Modal de foto expandida ── */}
      <Dialog open={!!selectedFoto} onOpenChange={open => !open && setSelectedFoto(null)}>
        <FotoModal foto={selectedFoto} onClose={() => setSelectedFoto(null)} />
      </Dialog>
    </div>
  );
}

export default function GaleriaNoturno() {
  return (
    <RequireAuth>
      <GaleriaNoturnoInner />
    </RequireAuth>
  );
}