import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Moon, Star, RefreshCw, X, ChevronDown, ChevronUp, ExternalLink, Camera, MapPin, Loader2, FolderSearch } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// IDs das pastas do Google Drive para cada projeto Noturno
const PROJETOS = [
  {
    id: 'noturno-2026',
    label: '🌙 Noturno nos Museus 2026',
    subtitulo: 'Museus Centro BH — Edição 2026',
    cor: 'indigo',
    bgClass: 'bg-indigo-50 border-indigo-200',
    headerClass: 'bg-indigo-600',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    driveFolder: '1rnpwK5eEY0bPFLbmyqfzzzyxbw9Zm3oh',
    reportId: '6a5524d079963e8244afda9a',
    metaId: 'noturno-2026',
    filtroNome: ['noturno', 'museus centro', 'mis', 'mumo', 'mhab'],
  },
  {
    id: 'noturno-pampulha',
    label: '🌙 Noturno Pampulha 2026',
    subtitulo: 'Museus da Pampulha — Edição 2026',
    cor: 'violet',
    bgClass: 'bg-violet-50 border-violet-200',
    headerClass: 'bg-violet-700',
    badgeClass: 'bg-violet-100 text-violet-700',
    driveFolder: null, // será buscado por keyword "pampulha"
    metaId: 'noturno-pampulha',
    filtroNome: ['pampulha', 'noturno pampulha'],
  },
];

function FotoCard({ foto, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(foto)}
      className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden bg-gray-100">
        <img
          src={foto.fileUrl || foto.file_url || foto.thumb_url}
          alt={foto.legenda || foto.caption || foto.file_name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={e => { e.currentTarget.style.opacity = '0.15'; }}
        />
      </div>
      <div className="p-2.5 space-y-1">
        <p className="line-clamp-2 text-xs font-medium text-gray-800 leading-snug">
          {foto.legenda || foto.caption || foto.activityTitulo || foto.file_name || 'Foto do Noturno'}
        </p>
        {(foto.museu || foto.local) && (
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5" />
            {foto.museu || foto.local}
          </p>
        )}
        {foto.autor && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Camera className="h-2.5 w-2.5" />
            {foto.autor}
          </p>
        )}
      </div>
    </button>
  );
}

function AlbumProjeto({ projeto, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [fotos, setFotos] = useState([]);
  const [totalDrive, setTotalDrive] = useState(0);
  const [selectedFoto, setSelectedFoto] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [erro, setErro] = useState('');
  const [varreduraStatus, setVarreduraStatus] = useState('idle'); // idle | running | done | error
  const [varreduraMsg, setVarreduraMsg] = useState('');
  const [totalCriadas, setTotalCriadas] = useState(0);
  const varreduraAbortRef = useRef(false);

  useEffect(() => {
    carregarFotos();
  }, []);

  async function executarVarreduraCompleta() {
    if (!projeto.driveFolder) {
      setVarreduraMsg('Pasta do Drive não configurada para este projeto.');
      return;
    }
    setVarreduraStatus('running');
    setVarreduraMsg('Iniciando varredura...');
    setTotalCriadas(0);
    varreduraAbortRef.current = false;

    let currentFolderIndex = 0;
    let currentPageToken = null;
    let totalAcumulado = 0;
    let rodadas = 0;
    const MAX_RODADAS = 50; // segurança contra loop infinito

    try {
      while (rodadas < MAX_RODADAS) {
        if (varreduraAbortRef.current) break;
        rodadas++;

        const res = await base44.functions.invoke('varreduraProfundaFotosDrive', {
          folderId: projeto.driveFolder,
          reportId: projeto.reportId || '6a5524d079963e8244afda9a',
          currentFolderIndex,
          currentPageToken,
        });

        const data = res?.data || res;
        totalAcumulado += data.criadas || 0;
        setTotalCriadas(totalAcumulado);

        const totalPastas = data.total_pastas || '?';
        const processadas = data.pastas_processadas || currentFolderIndex;
        setVarreduraMsg(`Processando pasta ${processadas}/${totalPastas} — ${totalAcumulado} fotos novas vinculadas`);

        if (data.status === 'concluido' || !data.proxima_chamada) {
          break;
        }

        currentFolderIndex = data.proxima_chamada.currentFolderIndex ?? currentFolderIndex + 5;
        currentPageToken = data.proxima_chamada.currentPageToken || null;
      }

      setVarreduraStatus('done');
      setVarreduraMsg(`✅ Varredura concluída — ${totalAcumulado} fotos novas vinculadas ao álbum.`);
      // Recarregar fotos após varredura
      await carregarFotos();
    } catch (e) {
      setVarreduraStatus('error');
      setVarreduraMsg(`Erro na varredura: ${e.message}`);
    }
  }

  async function carregarFotos() {
    setStatus('loading');
    setErro('');
    try {
      // 1. Buscar TODAS as fotos locais (sem limite) em paralelo com o Drive
      const [allPhotos, driveRes] = await Promise.all([
        base44.entities.ReportPhoto.list('-created_date', 2000),
        projeto.driveFolder
          ? base44.functions.invoke('criarAlbumNoturnoDrive', {
              dry_run: true,
              max_por_local: 30,
              min_por_local: 1,
              folder_id: projeto.driveFolder,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      // Fotos locais filtradas por keyword
      const filtro = projeto.filtroNome;
      const filtradas = (allPhotos || []).filter(p => {
        if (!p.file_url) return false;
        const texto = [p.file_name, p.caption, p.legenda, p.museu, p.mes_referencia, p.contexto_ia]
          .join(' ').toLowerCase();
        return filtro.some(k => texto.includes(k));
      }).map(p => ({
        id: p.id,
        fileUrl: p.file_url,
        legenda: p.legenda || p.caption || p.file_name,
        museu: p.museu,
        autor: p.author || p.autor,
        mes_referencia: p.mes_referencia,
        drive_file_id: p.drive_file_id,
      }));

      // Fotos do Drive
      const albumFotos = (driveRes?.data?.album || []).flatMap(l => l.fotos || []);
      setTotalDrive(driveRes?.data?.total_fotos_drive || albumFotos.length);

      // IDs já persistidos no BD para evitar duplicatas
      const idsJaSalvos = new Set(filtradas.map(f => f.drive_file_id).filter(Boolean));

      // Persistir fotos novas do Drive como ReportPhoto vinculadas ao projeto
      const novasParaSalvar = albumFotos.filter(f =>
        f.drive_file_id && !idsJaSalvos.has(f.drive_file_id) && (f.file_url || f.thumb_url)
      );

      if (novasParaSalvar.length > 0) {
        const registros = novasParaSalvar.map(f => ({
          file_url: f.file_url || f.thumb_url,
          file_name: f.name || f.drive_file_id,
          drive_file_id: f.drive_file_id,
          drive_backup_status: 'concluido',
          legenda: f.legenda || f.name || '',
          caption: f.legenda || '',
          museu: f.local || projeto.label,
          mes_referencia: 'Junho',
          ano: 2026,
          fonte_ia: 'drive_sync',
          contexto_ia: `Noturno nos Museus — ${projeto.label}`,
        }));
        // Salvar em lotes de 20 para não sobrecarregar
        for (let i = 0; i < registros.length; i += 20) {
          await base44.entities.ReportPhoto.bulkCreate(registros.slice(i, i + 20));
        }
        // Recarregar fotos locais após persistir
        const atualizadas = await base44.entities.ReportPhoto.list('-created_date', 2000);
        filtradas.push(...atualizadas.filter(p => {
          if (!p.file_url) return false;
          const texto = [p.file_name, p.caption, p.legenda, p.museu, p.mes_referencia, p.contexto_ia]
            .join(' ').toLowerCase();
          return projeto.filtroNome.some(k => texto.includes(k)) && !filtradas.find(f => f.id === p.id);
        }).map(p => ({
          id: p.id,
          fileUrl: p.file_url,
          legenda: p.legenda || p.caption || p.file_name,
          museu: p.museu,
          autor: p.author || p.autor,
          mes_referencia: p.mes_referencia,
          drive_file_id: p.drive_file_id,
        })));
      }

      const driveFotos = albumFotos.map(f => ({
        id: f.drive_file_id,
        fileUrl: f.file_url || f.thumb_url,
        legenda: f.legenda || f.name,
        museu: f.local,
        autor: f.autor,
        view_url: f.view_url,
        drive_file_id: f.drive_file_id,
      }));

      // Combinar e deduplicar por drive_file_id e fileUrl
      const seen = new Set();
      const unicas = [...filtradas, ...driveFotos].filter(f => {
        const key = f.drive_file_id || (f.fileUrl || '').split('?')[0];
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return !!f.fileUrl;
      });

      setFotos(unicas);
      setStatus('done');
    } catch (e) {
      setErro(e.message || 'Erro ao carregar fotos.');
      setStatus('error');
    }
  }

  const corBorder = projeto.cor === 'violet' ? 'border-violet-200' : 'border-indigo-200';
  const corBg = projeto.cor === 'violet' ? 'bg-violet-50' : 'bg-indigo-50';
  const corHeader = projeto.cor === 'violet' ? 'bg-violet-700' : 'bg-indigo-600';
  const corText = projeto.cor === 'violet' ? 'text-violet-900' : 'text-indigo-900';
  const corBadge = projeto.cor === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700';
  const corBtn = projeto.cor === 'violet' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <div className={`rounded-2xl border ${corBorder} ${corBg} overflow-hidden`}>
      {/* Header */}
      <div className={`${corHeader} px-5 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <Moon className="h-6 w-6 text-white" />
          <div>
            <h3 className="text-base font-bold text-white">{projeto.label}</h3>
            <p className="text-xs text-white/70">{projeto.subtitulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'done' && (
            <span className={`rounded-full ${corBadge} px-2.5 py-0.5 text-xs font-medium bg-white/20 text-white`}>
              {fotos.length} fotos
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-white/80 hover:text-white p-1"
          >
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="text-white/80 hover:text-white p-1">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">

          {/* Barra de varredura */}
          {projeto.driveFolder && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                disabled={varreduraStatus === 'running' || status === 'loading'}
                onClick={executarVarreduraCompleta}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-white transition ${
                  varreduraStatus === 'running' ? 'opacity-60 cursor-not-allowed ' + corBtn : corBtn
                }`}
              >
                {varreduraStatus === 'running'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FolderSearch className="h-3.5 w-3.5" />}
                {varreduraStatus === 'running' ? 'Varrendo Drive...' : 'Buscar fotos no Drive'}
              </button>
              {varreduraMsg && (
                <span className={`text-xs ${varreduraStatus === 'error' ? 'text-red-600' : varreduraStatus === 'done' ? 'text-green-600' : 'text-gray-500'}`}>
                  {varreduraMsg}
                </span>
              )}
            </div>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <div className={`flex items-center gap-3 ${corText} text-sm py-6 justify-center`}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Buscando fotos no Drive e galeria local...</span>
            </div>
          )}

          {/* Erro */}
          {status === 'error' && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 space-y-2">
              <p>{erro}</p>
              <button type="button" onClick={carregarFotos} className="text-xs underline flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Tentar novamente
              </button>
            </div>
          )}

          {/* Resultado */}
          {status === 'done' && (
            <>
              {fotos.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Moon className="h-10 w-10 mx-auto text-gray-300" />
                  <p className="text-sm text-gray-500">Nenhuma foto encontrada para este projeto.</p>
                  <p className="text-xs text-gray-400">Use a Varredura do Drive para importar fotos do Noturno.</p>
                  <button type="button" onClick={carregarFotos} className={`mt-2 inline-flex items-center gap-1.5 rounded-xl ${corBtn} px-4 py-2 text-xs font-medium text-white`}>
                    <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{fotos.length} fotos encontradas</span>
                    <button type="button" onClick={carregarFotos} className="flex items-center gap-1 hover:text-gray-700">
                      <RefreshCw className="h-3 w-3" /> Atualizar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {fotos.map((foto, idx) => (
                      <FotoCard key={foto.id || idx} foto={foto} onClick={setSelectedFoto} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal foto expandida */}
      <Dialog open={!!selectedFoto} onOpenChange={open => !open && setSelectedFoto(null)}>
        <DialogContent className="w-full max-w-4xl overflow-hidden border-0 bg-black p-0">
          {selectedFoto && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedFoto(null)}
                className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={selectedFoto.fileUrl}
                alt={selectedFoto.legenda}
                className="max-h-[75vh] w-full object-contain"
              />
              <div className="bg-black/90 p-5 text-white space-y-2">
                <p className="text-base font-semibold">{selectedFoto.legenda || 'Foto do Noturno'}</p>
                <div className="flex flex-wrap gap-3 text-xs text-white/70">
                  {selectedFoto.museu && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedFoto.museu}</span>
                  )}
                  {selectedFoto.autor && (
                    <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{selectedFoto.autor}</span>
                  )}
                  {selectedFoto.mes_referencia && <span>📅 {selectedFoto.mes_referencia}</span>}
                </div>
                {selectedFoto.view_url && (
                  <a href={selectedFoto.view_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-100 underline">
                    Ver original no Drive <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AlbumNoturnoProjects({ onClose }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-bold text-gray-900">Álbuns do Projeto Noturno</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      {PROJETOS.map(projeto => (
        <AlbumProjeto key={projeto.id} projeto={projeto} />
      ))}
    </div>
  );
}