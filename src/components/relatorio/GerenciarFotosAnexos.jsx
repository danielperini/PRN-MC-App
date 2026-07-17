import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Images, Loader2, Trash2, Check, X, Search, AlertTriangle } from 'lucide-react';

const NOTURNO_KEYWORDS = ['noturno', 'pampulha', 'noturno 2026', 'noturno pampulha', 'noturno nos museus'];

function isNoturnoFoto(foto) {
  const m = (foto.museu || '').toLowerCase();
  const c = (foto.caption || foto.legenda || '').toLowerCase();
  const n = (foto.file_name || '').toLowerCase();
  return NOTURNO_KEYWORDS.some(kw => m.includes(kw) || c.includes(kw) || n.includes(kw));
}

function isMumoFoto(foto) {
  const m = (foto.museu || '').toLowerCase();
  const c = (foto.caption || foto.legenda || '').toLowerCase();
  return m.includes('mumo') || m.includes('moda') || c.includes('mumo');
}

export default function GerenciarFotosAnexos({ relatorioId, relatorio, onAtualizar, filtroVersao, dataInicio, dataFim }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [fotosGaleria, setFotosGaleria] = useState([]);
  const [atividadesMap, setAtividadesMap] = useState({});
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [removendo, setRemovendo] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  const isNoturno = filtroVersao === 'noturno' || filtroVersao === 'noturno_pampulha';

  async function buscarFotos() {
    setCarregando(true);
    try {
      // Buscar atividades do período
      const atividades = await base44.entities.Activity.filter(
        { data_realizacao: { $gte: dataInicio, $lte: dataFim } },
        '-data_realizacao',
        300
      ).catch(() => []);

      // Filtrar atividades Noturno
      const atvsNoturno = isNoturno
        ? atividades.filter(a => {
            const cc = (a.centro_custo || '').toLowerCase();
            const m = (a.museu || '').toLowerCase();
            return NOTURNO_KEYWORDS.some(kw => cc.includes(kw) || m.includes(kw));
          })
        : atividades;

      const mapAtv = {};
      for (const a of atvsNoturno) mapAtv[a.id] = a;
      setAtividadesMap(mapAtv);

      const reportIds = new Set(atvsNoturno.map(a => a.report_id).filter(Boolean));
      const activityIds = new Set(atvsNoturno.map(a => a.id).filter(Boolean));

      // Buscar fotos
      const todasFotos = await base44.entities.ReportPhoto.filter(
        { galeria_oculta: false },
        '-created_date',
        400
      ).catch(() => []);

      // Classificar cada foto
      const fotosClassificadas = todasFotos.filter(f => f.file_url || f.foto_url).map(f => {
        const vinculadaAtividade = f.activity_id && activityIds.has(f.activity_id);
        const vinculadaReport = f.report_id && reportIds.has(f.report_id);
        const ehNoturno = isNoturnoFoto(f);
        const ehMumo = isMumoFoto(f);
        const temVinculo = vinculadaAtividade || vinculadaReport || ehNoturno;
        const atv = f.activity_id ? mapAtv[f.activity_id] : null;

        return {
          ...f,
          url: f.file_url || f.foto_url,
          _vinculadaAtividade: vinculadaAtividade,
          _vinculadaReport: vinculadaReport,
          _ehNoturno: ehNoturno,
          _ehMumo: ehMumo,
          _temVinculo: temVinculo,
          _atividadeTitulo: atv?.titulo || '',
          _atividadeMuseu: atv?.museu || atv?.centro_custo || f.museu || '',
        };
      });

      // Ordenar: noturno e vinculadas primeiro
      fotosClassificadas.sort((a, b) => {
        if (a._temVinculo && !b._temVinculo) return -1;
        if (!a._temVinculo && b._temVinculo) return 1;
        if (a._ehMumo && !b._ehMumo) return 1;
        if (!a._ehMumo && b._ehMumo) return -1;
        return 0;
      });

      setFotosGaleria(fotosClassificadas);

      // Seleção automática: quando é Noturno, pré-seleciona fotos vinculadas ao período excluindo MUMO e já incluídas
      if (isNoturno) {
        const urlsJaNoRelatorio = new Set((relatorio?.anexos_evidencias || []).map(a => a.foto_url));
        const autoIds = fotosClassificadas
          .filter(f => f._temVinculo && !f._ehMumo && !urlsJaNoRelatorio.has(f.url))
          .map(f => f.id);
        setSelecionadas(new Set(autoIds));
      }
    } catch (err) {
      toast.error('Erro ao buscar fotos: ' + (err?.message || String(err)));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (aberto) buscarFotos();
  }, [aberto]);

  function toggleSelecionada(id) {
    setSelecionadas(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  async function adicionarSelecionadasAoRelatorio() {
    if (selecionadas.size === 0) { toast.warning('Nenhuma foto selecionada.'); return; }
    setAdicionando(true);
    try {
      const fotosEscolhidas = fotosGaleria.filter(f => selecionadas.has(f.id));
      const novosAnexos = fotosEscolhidas.map(f => ({
        foto_url: f.url,
        atividade_nome: f._atividadeTitulo || f.legenda || f.caption || 'Evidência fotográfica — Noturno nos Museus',
        atividade_data: f.created_date?.split('T')[0] || '',
        local: f._atividadeMuseu || '',
        meta_nome: f.meta_id || '',
        legenda_ia: f.legenda || f.caption || (f._atividadeTitulo ? `${f._atividadeTitulo} — ${f._atividadeMuseu}` : 'Registro fotográfico do projeto Noturno nos Museus'),
        legenda_editada: '',
      }));

      // Mesclar com anexos existentes, evitando duplicatas por url
      const existentes = relatorio?.anexos_evidencias || [];
      const urlsExistentes = new Set(existentes.map(a => a.foto_url));
      const novosUnicos = novosAnexos.filter(a => !urlsExistentes.has(a.foto_url));

      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
        anexos_evidencias: [...existentes, ...novosUnicos],
      });

      toast.success(`${novosUnicos.length} foto(s) adicionada(s) ao relatório.`);
      if (onAtualizar) await onAtualizar();
      setAberto(false);
    } catch (err) {
      toast.error('Erro ao adicionar fotos: ' + (err?.message || String(err)));
    } finally {
      setAdicionando(false);
    }
  }

  async function removerFotoDoRelatorio(fotoUrl) {
    setRemovendo(true);
    try {
      const existentes = relatorio?.anexos_evidencias || [];
      const filtradas = existentes.filter(a => a.foto_url !== fotoUrl);
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, { anexos_evidencias: filtradas });
      toast.success('Foto removida do relatório.');
      if (onAtualizar) await onAtualizar();
    } catch (err) {
      toast.error('Erro ao remover: ' + (err?.message || String(err)));
    } finally {
      setRemovendo(false);
    }
  }

  const anexosAtuais = relatorio?.anexos_evidencias || [];
  const urlsNoRelatorio = new Set(anexosAtuais.map(a => a.foto_url));

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setAberto(true)}
        className="border-purple-300 text-purple-700 hover:bg-purple-50"
      >
        <Images className="w-4 h-4 mr-1" />
        Gerenciar Fotos dos Anexos
      </Button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl my-4">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-lg">Gerenciar Fotos — Anexos e Evidências</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isNoturno ? '🌙 Modo Noturno: fotos do MUMO destacadas em vermelho' : 'Selecione as fotos para incluir no relatório'}
                </p>
              </div>
              <button onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Fotos já no relatório */}
            {anexosAtuais.length > 0 && (
              <div className="p-4 border-b bg-green-50">
                <div className="flex items-center gap-2 mb-3">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="font-semibold text-sm text-green-800">{anexosAtuais.length} foto(s) atualmente no relatório</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
                  {anexosAtuais.map((a, i) => (
                    <div key={i} className="relative group">
                      <img src={a.foto_url} alt={a.legenda_ia || ''} className="w-full aspect-square object-cover rounded-lg border-2 border-green-400" />
                      <button
                        onClick={() => removerFotoDoRelatorio(a.foto_url)}
                        disabled={removendo}
                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover do relatório"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {a.local && <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white px-1 py-0.5 rounded-b-lg truncate">{a.local}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ações rápidas */}
            <div className="p-4 border-b flex items-center gap-2 flex-wrap bg-slate-50">
              <Button size="sm" variant="outline" onClick={buscarFotos} disabled={carregando}>
                {carregando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                Buscar na Galeria
              </Button>
              {isNoturno && (
                <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                  🌙 Fotos do Noturno pré-selecionadas automaticamente (MUMO excluído)
                </span>
              )}
              <Button size="sm" variant="outline" onClick={() => setSelecionadas(new Set())}>
                Limpar seleção
              </Button>
              <Badge variant="outline">{selecionadas.size} selecionada(s)</Badge>
              <Badge variant="outline" className="text-slate-500">{fotosGaleria.length} na galeria</Badge>
            </div>

            {/* Grade de fotos da galeria */}
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              {carregando && (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                  <span className="text-sm text-slate-500">Buscando fotos da galeria...</span>
                </div>
              )}

              {!carregando && fotosGaleria.length === 0 && (
                <p className="text-center text-slate-400 italic py-8 text-sm">Nenhuma foto encontrada na galeria. Clique em "Buscar na Galeria".</p>
              )}

              {!carregando && fotosGaleria.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {fotosGaleria.map(foto => {
                    const noRelatorio = urlsNoRelatorio.has(foto.url);
                    const sel = selecionadas.has(foto.id);
                    const alertaMumo = isNoturno && foto._ehMumo;

                    return (
                      <div
                        key={foto.id}
                        onClick={() => { if (!noRelatorio) toggleSelecionada(foto.id); }}
                        className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                          noRelatorio ? 'border-green-400 opacity-60 cursor-not-allowed' :
                          alertaMumo ? 'border-red-400 ring-2 ring-red-200' :
                          sel ? 'border-purple-500 ring-2 ring-purple-200' :
                          foto._temVinculo ? 'border-blue-300 hover:border-blue-500' :
                          'border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <img
                          src={foto.url}
                          alt={foto.legenda || foto.caption || ''}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />

                        {/* Badge de status */}
                        {noRelatorio && (
                          <div className="absolute top-1 right-1">
                            <Check className="w-4 h-4 text-green-600 bg-white rounded-full p-0.5" />
                          </div>
                        )}
                        {sel && !noRelatorio && (
                          <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {alertaMumo && (
                          <div className="absolute top-1 left-1" title="Foto do MUMO — não recomendada para o Noturno">
                            <AlertTriangle className="w-4 h-4 text-red-500 bg-white rounded-full p-0.5" />
                          </div>
                        )}
                        {foto._ehNoturno && !alertaMumo && (
                          <div className="absolute top-1 left-1 bg-purple-600 rounded text-[9px] text-white px-1">🌙</div>
                        )}

                        {/* Legenda inferior */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white px-1 py-0.5 truncate">
                          {foto._atividadeTitulo || foto.museu || foto.caption || foto.file_name || ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legenda */}
            <div className="px-4 pb-2 flex gap-4 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-green-400 inline-block" /> Já no relatório</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-purple-500 inline-block" /> Selecionada</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-blue-300 inline-block" /> Vinculada ao período</span>
              {isNoturno && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-red-400 inline-block" /> MUMO (excluir)</span>}
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex justify-between items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-600">
                {selecionadas.size > 0 ? `${selecionadas.size} foto(s) prontas para adicionar` : 'Selecione fotos para adicionar ao relatório'}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
                <Button
                  onClick={adicionarSelecionadasAoRelatorio}
                  disabled={selecionadas.size === 0 || adicionando}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {adicionando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Images className="w-4 h-4 mr-1" />}
                  Adicionar {selecionadas.size > 0 ? `(${selecionadas.size})` : ''} ao Relatório
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}