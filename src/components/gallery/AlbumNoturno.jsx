import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { MapPin, Sparkles, RefreshCw, X, Moon, ChevronDown, ChevronRight, Camera } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

function formatCoordenadas(coords) {
  if (!coords) return null;
  const [lat, lng] = coords.split(',').map(s => s.trim());
  return `${lat}, ${lng}`;
}

function FotoCard({ foto, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(foto)}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden bg-gray-100">
        <img
          src={foto.thumb_url || foto.file_url}
          alt={foto.legenda}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={e => { e.currentTarget.style.opacity = '0.2'; }}
        />
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-xs leading-snug text-gray-700">{foto.legenda}</p>
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <Camera className="h-3 w-3" />
          {foto.autor}
        </p>
      </div>
    </button>
  );
}

function LocalSection({ local }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
      >
        <div className="flex items-start gap-3 text-left">
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100">
            <MapPin className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-black text-sm">{local.local}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{local.endereco}</p>
            {local.coordenadas && (
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">📍 {formatCoordenadas(local.coordenadas)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-gray-400">{local.fotos?.length || 0} fotos</span>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-gray-400" />
            : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {expanded && local.fotos?.length > 0 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {local.fotos.map((foto, idx) => (
              <FotoCard key={foto.drive_file_id || idx} foto={foto} onClick={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlbumNoturno({ onClose }) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [selectedFoto, setSelectedFoto] = useState(null);
  const [dryRun, setDryRun] = useState(true);

  async function gerarAlbum() {
    setStatus('loading');
    setErro('');
    try {
      const res = await base44.functions.invoke('criarAlbumNoturnoDrive', {
        dry_run: dryRun,
        max_por_local: 5,
        min_por_local: 3,
      });
      setResultado(res.data);
      setStatus('done');
    } catch (e) {
      setErro(e.message || 'Erro ao gerar álbum.');
      setStatus('error');
    }
  }

  const todasFotos = resultado?.album?.flatMap(l => l.fotos || []) || [];

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-indigo-900 text-base">Álbum Noturno nos Museus</h2>
            <p className="text-xs text-indigo-600">Curadoria IA · Fotos por local · Google Drive</p>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-indigo-400 hover:text-indigo-700">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Explicação */}
      <div className="rounded-xl border border-indigo-200 bg-white p-4 text-sm text-gray-700 space-y-1">
        <p>
          <strong>O que este painel faz:</strong> Busca todas as fotos na pasta do Google Drive do Noturno,
          usa IA para selecionar as melhores por local (3–5 por local), redige legendas jornalísticas
          com localização e crédito fotográfico, e cria um álbum separado na galeria.
        </p>
        <p className="text-xs text-gray-500">
          Pasta Drive: <code className="bg-gray-100 px-1 rounded">1rnpwK5eEY0bPFLbmyqfzzzyxbw9Zm3oh</code>
        </p>
      </div>

      {/* Opção dry run */}
      {status === 'idle' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>
              <strong>Simulação</strong> (pré-visualizar sem salvar na galeria)
            </span>
          </label>
          <button
            type="button"
            onClick={gerarAlbum}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-indigo-700"
          >
            <Sparkles className="h-4 w-4" />
            {dryRun ? 'Pré-visualizar álbum com IA' : 'Criar álbum Noturno'}
          </button>
        </div>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div className="flex items-center gap-3 text-indigo-700 text-sm">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Buscando fotos no Drive e gerando curadoria com IA... pode levar alguns minutos.</span>
        </div>
      )}

      {/* Erro */}
      {status === 'error' && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 space-y-2">
          <p>{erro}</p>
          <button type="button" onClick={() => setStatus('idle')} className="text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* Resultado */}
      {status === 'done' && resultado && (
        <div className="space-y-5">
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'No Drive', value: resultado.total_fotos_drive },
              { label: 'Selecionadas', value: resultado.total_selecionadas },
              { label: 'Locais', value: resultado.locais_com_fotos },
              { label: resultado.dry_run ? 'Simulação' : 'Salvas', value: resultado.dry_run ? '✓' : resultado.total_salvas },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-indigo-200 bg-white p-3 text-center">
                <p className="text-2xl font-bold text-indigo-700">{card.value}</p>
                <p className="text-xs text-gray-500">{card.label}</p>
              </div>
            ))}
          </div>

          {resultado.dry_run && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>Simulação concluída. Desmarque "Simulação" e clique para salvar na galeria.</span>
              <button
                type="button"
                onClick={() => { setDryRun(false); setStatus('idle'); }}
                className="ml-3 font-medium underline whitespace-nowrap"
              >
                Salvar agora
              </button>
            </div>
          )}

          {!resultado.dry_run && resultado.total_salvas > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              ✓ {resultado.total_salvas} fotos salvas na galeria no álbum "Noturno nos Museus". Atualize a galeria para ver.
            </div>
          )}

          {/* Álbum por local */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Fotos por local</h3>
            {(resultado.album || []).map((local, idx) => (
              <LocalSection key={idx} local={local} />
            ))}
            {(resultado.album || []).length === 0 && (
              <p className="text-sm text-gray-500">Nenhum local com fotos suficientes encontrado. Verifique se as fotos têm o nome do local na pasta.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setStatus('idle'); setResultado(null); }}
            className="text-xs text-indigo-600 underline"
          >
            Recomeçar
          </button>
        </div>
      )}

      {/* Modal de foto expandida */}
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
                src={selectedFoto.file_url}
                alt={selectedFoto.legenda}
                className="max-h-[75vh] w-full object-contain"
              />
              <div className="bg-black/85 p-5 text-white space-y-2">
                <p className="text-base font-semibold">{selectedFoto.legenda}</p>
                <div className="flex flex-wrap gap-3 text-xs text-white/70">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedFoto.local}</span>
                  <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{selectedFoto.autor}</span>
                  {selectedFoto.coordenadas && (
                    <span className="font-mono">📍 {formatCoordenadas(selectedFoto.coordenadas)}</span>
                  )}
                </div>
                {selectedFoto.view_url && (
                  <a
                    href={selectedFoto.view_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-indigo-300 hover:text-indigo-100 underline"
                  >
                    Ver original no Drive →
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