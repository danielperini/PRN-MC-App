import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FolderSearch, CheckCircle, MapPin, Image, Loader2, ExternalLink } from 'lucide-react';

const FOLDER_ID = '1rnpwK5eEY0bPFLbmyqfzzzyxbw9Zm3oh';
const REPORT_ID = '6a5524d079963e8244afda9a';

const MUSEU_CORES = {
  MHAB: 'bg-amber-100 text-amber-800',
  MIS: 'bg-blue-100 text-blue-800',
  MUMO: 'bg-purple-100 text-purple-800',
  MCK: 'bg-green-100 text-green-800',
  MAP: 'bg-cyan-100 text-cyan-800',
  'CASA DO BAILE': 'bg-rose-100 text-rose-800',
  NOTURNO: 'bg-indigo-100 text-indigo-800',
};

export default function VarreduraDriveNoturno({ onConcluido }) {
  const [rodando, setRodando] = useState(false);
  const [status, setStatus] = useState(null);
  const [totalCriadas, setTotalCriadas] = useState(0);
  const [totalPastas, setTotalPastas] = useState(0);
  const [pastasProcessadas, setPastasProcessadas] = useState(0);
  const [linksPorMuseu, setLinksPorMuseu] = useState({});
  const [erro, setErro] = useState(null);
  const [concluido, setConcluido] = useState(false);

  const executarLote = async (proxima) => {
    const payload = {
      folderId: FOLDER_ID,
      reportId: REPORT_ID,
      currentFolderIndex: proxima?.currentFolderIndex || 0,
      currentPageToken: proxima?.currentPageToken || null,
    };

    const res = await base44.functions.invoke('varreduraProfundaFotosDrive', payload);
    return res.data;
  };

  const iniciarVarredura = async () => {
    setRodando(true);
    setErro(null);
    setConcluido(false);
    setTotalCriadas(0);
    setLinksPorMuseu({});

    let proxima = null;
    let acumuladoCriadas = 0;

    try {
      let iteracoes = 0;
      const MAX_ITER = 20; // segurança contra loop infinito

      do {
        setStatus(proxima ? `Processando lote ${iteracoes + 1}...` : 'Iniciando varredura...');
        const resultado = await executarLote(proxima);

        if (resultado.error) {
          setErro(resultado.error);
          break;
        }

        acumuladoCriadas += resultado.criadas || 0;
        setTotalCriadas(acumuladoCriadas);
        setTotalPastas(resultado.total_pastas || 0);
        setPastasProcessadas(resultado.pastas_processadas || 0);

        if (resultado.links_por_museu) {
          setLinksPorMuseu(prev => {
            const merged = { ...prev };
            for (const [k, v] of Object.entries(resultado.links_por_museu)) {
              if (!merged[k]) merged[k] = { total: 0, geo: v.geo, exemplos: [] };
              merged[k].total += v.total;
              merged[k].exemplos = [...merged[k].exemplos, ...v.exemplos].slice(0, 3);
            }
            return merged;
          });
        }

        proxima = resultado.proxima_chamada;
        iteracoes++;

        if (resultado.status === 'concluido' || !proxima) {
          setConcluido(true);
          setStatus('Varredura concluída!');
          if (onConcluido) onConcluido({ totalCriadas: acumuladoCriadas });
          break;
        }

        // Pequena pausa entre lotes
        await new Promise(r => setTimeout(r, 300));
      } while (proxima && iteracoes < MAX_ITER);

      if (iteracoes >= MAX_ITER) {
        setStatus('Limite de lotes atingido. Execute novamente para continuar.');
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setRodando(false);
    }
  };

  const progresso = totalPastas > 0 ? Math.round((pastasProcessadas / totalPastas) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FolderSearch className="w-5 h-5 text-indigo-600" />
        <div>
          <p className="font-semibold text-slate-800">Varredura Profunda — Noturno nos Museus 2026</p>
          <p className="text-xs text-slate-500">Pasta: drive.google.com/drive/folders/{FOLDER_ID.slice(0, 20)}…</p>
        </div>
        <a
          href={`https://drive.google.com/drive/folders/${FOLDER_ID}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-blue-600 hover:text-blue-800"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {!concluido && (
        <Button
          onClick={iniciarVarredura}
          disabled={rodando}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {rodando ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {status}</>
          ) : (
            <><FolderSearch className="w-4 h-4 mr-2" /> Iniciar Varredura Profunda</>
          )}
        </Button>
      )}

      {rodando && totalPastas > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{pastasProcessadas}/{totalPastas} pastas</span>
            <span>{progresso}%</span>
          </div>
          <Progress value={progresso} className="h-2" />
        </div>
      )}

      {totalCriadas > 0 && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-2">
          <Image className="w-4 h-4" />
          <span>{totalCriadas} fotos adicionadas à galeria</span>
        </div>
      )}

      {Object.keys(linksPorMuseu).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Fotos por Museu com Geolocalização</p>
          {Object.entries(linksPorMuseu).map(([museu, dados]) => (
            <div key={museu} className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge className={MUSEU_CORES[museu] || 'bg-slate-100 text-slate-700'}>
                  {museu}
                </Badge>
                <span className="text-xs text-slate-500">{dados.total} fotos</span>
              </div>
              {dados.geo && (
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="w-3 h-3" />
                  <span>{dados.geo.endereco}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono">{dados.geo.lat?.toFixed(4)}, {dados.geo.lng?.toFixed(4)}</span>
                </div>
              )}
              {dados.exemplos?.length > 0 && (
                <div className="flex gap-1 overflow-x-auto">
                  {dados.exemplos.map((ex, i) => (
                    <img
                      key={i}
                      src={ex.url}
                      alt={ex.nome}
                      className="w-16 h-16 object-cover rounded flex-shrink-0 border border-slate-200"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {concluido && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4" />
          <span>Varredura concluída! {totalCriadas} novas fotos importadas e associadas ao relatório.</span>
        </div>
      )}

      {erro && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">
          Erro: {erro}
        </div>
      )}
    </div>
  );
}