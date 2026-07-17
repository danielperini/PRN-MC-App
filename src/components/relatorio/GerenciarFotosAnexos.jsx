import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Images, Loader2, Trash2, Check, X, Search, AlertTriangle, Upload, Edit2, Save } from 'lucide-react';

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

export default function GerenciarFotosAnexos({ relatorioId, relatorio, onAtualizar, filtroVersao, dataInicio, dataFim, embutido = false }) {
  const [aberto, setAberto] = useState(embutido);
  const [carregando, setCarregando] = useState(false);
  const [fotosGaleria, setFotosGaleria] = useState([]);
  const [atividadesMap, setAtividadesMap] = useState({});
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [removendo, setRemovendo] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const [editandoLegenda, setEditandoLegenda] = useState(null); // index do anexo sendo editado
  const [legendaTemp, setLegendaTemp] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('atuais'); // 'atuais' | 'galeria'
  const fileInputRef = useRef(null);

  const isNoturno = filtroVersao === 'noturno' || filtroVersao === 'noturno_pampulha';

  async function buscarFotos() {
    setCarregando(true);
    try {
      const atividades = await base44.entities.Activity.filter(
        { data_realizacao: { $gte: dataInicio, $lte: dataFim } },
        '-data_realizacao',
        300
      ).catch(() => []);

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

      const todasFotos = await base44.entities.ReportPhoto.filter(
        { galeria_oculta: false },
        '-created_date',
        400
      ).catch(() => []);

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

      fotosClassificadas.sort((a, b) => {
        if (a._temVinculo && !b._temVinculo) return -1;
        if (!a._temVinculo && b._temVinculo) return 1;
        if (a._ehMumo && !b._ehMumo) return 1;
        if (!a._ehMumo && b._ehMumo) return -1;
        return 0;
      });

      setFotosGaleria(fotosClassificadas);

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
    if (aberto && abaAtiva === 'galeria' && fotosGaleria.length === 0) buscarFotos();
  }, [aberto, abaAtiva]);

  // Auto-abre a aba galeria se não houver fotos ainda
  useEffect(() => {
    if (embutido && (relatorio?.anexos_evidencias || []).length === 0) setAbaAtiva('galeria');
  }, []);

  function toggleSelecionada(id) {
    setSelecionadas(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  async function uploadFoto(file) {
    setUploadando(true);
    try {
      const resposta = await base44.integrations.Core.UploadFile({ file });
      const url = resposta?.file_url || resposta?.url || resposta?.data?.file_url;
      if (!url) throw new Error('Upload não retornou URL.');
      const existentes = relatorio?.anexos_evidencias || [];
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
        anexos_evidencias: [...existentes, {
          foto_url: url,
          atividade_nome: file.name.replace(/\.[^/.]+$/, ''),
          atividade_data: '',
          local: '',
          meta_nome: '',
          legenda_ia: file.name.replace(/\.[^/.]+$/, ''),
          legenda_editada: '',
        }],
      });
      toast.success('Foto adicionada ao relatório.');
      if (onAtualizar) await onAtualizar();
    } catch (err) {
      toast.error('Erro no upload: ' + (err?.message || String(err)));
    } finally {
      setUploadando(false);
    }
  }

  async function adicionarSelecionadasAoRelatorio() {
    if (selecionadas.size === 0) { toast.warning('Nenhuma foto selecionada.'); return; }
    setAdicionando(true);
    try {
      const fotosEscolhidas = fotosGaleria.filter(f => selecionadas.has(f.id));
      const existentes = relatorio?.anexos_evidencias || [];
      const urlsExistentes = new Set(existentes.map(a => a.foto_url));
      const novos = fotosEscolhidas
        .filter(f => !urlsExistentes.has(f.url))
        .map(f => ({
          foto_url: f.url,
          atividade_nome: f._atividadeTitulo || f.legenda || f.caption || 'Evidência fotográfica',
          atividade_data: f.created_date?.split('T')[0] || '',
          local: f._atividadeMuseu || '',
          meta_nome: f.meta_id || '',
          legenda_ia: f.legenda || f.caption || (f._atividadeTitulo ? `${f._atividadeTitulo} — ${f._atividadeMuseu}` : 'Registro fotográfico'),
          legenda_editada: '',
        }));
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
        anexos_evidencias: [...existentes, ...novos],
      });
      toast.success(`${novos.length} foto(s) adicionada(s).`);
      setSelecionadas(new Set());
      if (onAtualizar) await onAtualizar();
      setAbaAtiva('atuais');
    } catch (err) {
      toast.error('Erro ao adicionar: ' + (err?.message || String(err)));
    } finally {
      setAdicionando(false);
    }
  }

  async function removerFotoDoRelatorio(fotoUrl) {
    setRemovendo(true);
    try {
      const filtradas = (relatorio?.anexos_evidencias || []).filter(a => a.foto_url !== fotoUrl);
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, { anexos_evidencias: filtradas });
      toast.success('Foto removida.');
      if (onAtualizar) await onAtualizar();
    } catch (err) {
      toast.error('Erro ao remover: ' + (err?.message || String(err)));
    } finally {
      setRemovendo(false);
    }
  }

  async function salvarLegenda(index) {
    const existentes = [...(relatorio?.anexos_evidencias || [])];
    existentes[index] = { ...existentes[index], legenda_editada: legendaTemp };
    await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, { anexos_evidencias: existentes });
    setEditandoLegenda(null);
    if (onAtualizar) await onAtualizar();
    toast.success('Legenda salva.');
  }

  const anexosAtuais = relatorio?.anexos_evidencias || [];
  const urlsNoRelatorio = new Set(anexosAtuais.map(a => a.foto_url));

  const conteudo = (
    <div className={embutido ? 'space-y-3' : 'bg-white rounded-xl shadow-2xl w-full max-w-5xl my-4'}>
      {/* Header — só no modal */}
      {!embutido && (
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">Evidências e Anexos Fotográficos</h2>
            <p className="text-xs text-slate-500">{isNoturno ? '🌙 Modo Noturno: MUMO excluído automaticamente' : 'Gerencie as fotos do relatório'}</p>
          </div>
          <button onClick={() => setAberto(false)}><X className="w-6 h-6 text-slate-400" /></button>
        </div>
      )}

      {/* Abas */}
      <div className={`flex gap-1 ${embutido ? '' : 'px-4 pt-3'}`}>
        <button
          onClick={() => setAbaAtiva('atuais')}
          className={`px-4 py-2 text-sm rounded-t-lg font-medium border-b-2 transition-colors ${abaAtiva === 'atuais' ? 'border-purple-600 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          📎 No relatório ({anexosAtuais.length})
        </button>
        <button
          onClick={() => setAbaAtiva('galeria')}
          className={`px-4 py-2 text-sm rounded-t-lg font-medium border-b-2 transition-colors ${abaAtiva === 'galeria' ? 'border-purple-600 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          🖼 Buscar na Galeria
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm rounded-t-lg font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          {uploadando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Subir foto
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFoto(f); }} />
      </div>

      <div className={embutido ? '' : 'p-4 pt-0'}>
        {/* ABA: Fotos no relatório */}
        {abaAtiva === 'atuais' && (
          <div className="border rounded-xl p-3 space-y-3">
            {anexosAtuais.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm italic">
                Nenhuma foto no relatório ainda. Use "Buscar na Galeria" ou "Subir foto" para adicionar.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {anexosAtuais.map((a, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border border-slate-200">
                    <img src={a.foto_url} alt={a.legenda_editada || a.legenda_ia || ''} className="w-full aspect-square object-cover" />

                    {/* Ações */}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditandoLegenda(i); setLegendaTemp(a.legenda_editada || a.legenda_ia || ''); }}
                        className="bg-blue-500 text-white rounded-full p-1" title="Editar legenda"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removerFotoDoRelatorio(a.foto_url)}
                        disabled={removendo}
                        className="bg-red-500 text-white rounded-full p-1" title="Remover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Legenda */}
                    {editandoLegenda === i ? (
                      <div className="p-2 bg-white border-t flex gap-1">
                        <input
                          autoFocus
                          value={legendaTemp}
                          onChange={e => setLegendaTemp(e.target.value)}
                          className="flex-1 text-xs border rounded px-1 py-0.5"
                          onKeyDown={e => { if (e.key === 'Enter') salvarLegenda(i); if (e.key === 'Escape') setEditandoLegenda(null); }}
                        />
                        <button onClick={() => salvarLegenda(i)} className="text-green-600"><Save className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditandoLegenda(null)} className="text-slate-400"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-[9px] text-white px-1.5 py-1 truncate">
                        {a.legenda_editada || a.legenda_ia || a.atividade_nome || a.local || ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: Galeria */}
        {abaAtiva === 'galeria' && (
          <div className="border rounded-xl overflow-hidden">
            {/* Toolbar galeria */}
            <div className="p-3 bg-slate-50 border-b flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={buscarFotos} disabled={carregando}>
                {carregando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                Atualizar galeria
              </Button>
              {isNoturno && (
                <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                  🌙 Noturno pré-selecionado · MUMO excluído
                </span>
              )}
              <button onClick={() => setSelecionadas(new Set())} className="text-xs text-slate-500 underline">Limpar seleção</button>
              <div className="ml-auto flex gap-2">
                <Badge variant="outline">{selecionadas.size} selecionada(s)</Badge>
                <Badge variant="outline" className="text-slate-400">{fotosGaleria.length} na galeria</Badge>
              </div>
            </div>

            {/* Grade */}
            <div className="p-3 max-h-[45vh] overflow-y-auto">
              {carregando && (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                  <span className="text-sm text-slate-500">Carregando galeria...</span>
                </div>
              )}
              {!carregando && fotosGaleria.length === 0 && (
                <p className="text-center text-slate-400 italic py-8 text-sm">Clique em "Atualizar galeria" para buscar fotos.</p>
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
                          noRelatorio ? 'border-green-400 opacity-50 cursor-not-allowed' :
                          alertaMumo ? 'border-red-400 ring-1 ring-red-200' :
                          sel ? 'border-purple-500 ring-2 ring-purple-200' :
                          foto._temVinculo ? 'border-blue-300 hover:border-blue-500' :
                          'border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <img src={foto.url} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                        {noRelatorio && <div className="absolute top-1 right-1"><Check className="w-4 h-4 text-green-600 bg-white rounded-full p-0.5" /></div>}
                        {sel && !noRelatorio && <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5"><Check className="w-3 h-3 text-white" /></div>}
                        {alertaMumo && <div className="absolute top-1 left-1" title="MUMO"><AlertTriangle className="w-4 h-4 text-red-500 bg-white rounded-full p-0.5" /></div>}
                        {foto._ehNoturno && !alertaMumo && <div className="absolute top-1 left-1 bg-purple-600 rounded text-[8px] text-white px-1">🌙</div>}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white px-1 py-0.5 truncate">
                          {foto._atividadeTitulo || foto.museu || foto.caption || ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legenda + ação */}
            <div className="p-3 border-t bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-green-400 inline-block" /> Já no relatório</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-purple-500 inline-block" /> Selecionada</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-blue-300 inline-block" /> Vinculada</span>
                {isNoturno && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-red-400 inline-block" /> MUMO</span>}
              </div>
              <Button
                onClick={adicionarSelecionadasAoRelatorio}
                disabled={selecionadas.size === 0 || adicionando}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                size="sm"
              >
                {adicionando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Images className="w-4 h-4 mr-1" />}
                Adicionar {selecionadas.size > 0 ? `(${selecionadas.size})` : ''} ao Relatório
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embutido) return conteudo;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)} className="border-purple-300 text-purple-700 hover:bg-purple-50">
        <Images className="w-4 h-4 mr-1" />
        Gerenciar Fotos dos Anexos
      </Button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
          {conteudo}
        </div>
      )}
    </>
  );
}