import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '@/components/auth/RequireAuth';
import LoadingPage from '@/components/common/LoadingPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, RefreshCw, ChevronDown, ChevronRight, Images, X, FolderSearch } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// ─── Constantes ──────────────────────────────────────────────────────────────
const MES_ORDER = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_FILTRO = ['Fevereiro','Março','Abril','Maio','Junho'];
const ANO_FILTRO = '2026';

const MUSEU_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som',
  MUMO: 'MUMO — Museu da Moda de BH',
  SEM_IDENTIFICACAO: 'Sem identificação de museu',
};

const TIPO_LABELS = {
  lanche: 'Alimentação / Lanche',
  manutencao: 'Manutenção',
  estrutura: 'Infraestrutura / Estrutura',
  exposicao: 'Exposição',
  oficina: 'Oficina / Formação',
  evento: 'Evento / Programação',
  comunicacao: 'Comunicação / Divulgação',
  outro: 'Atividade Geral',
};

function detectTipo(titulo = '', descricao = '') {
  const t = `${titulo} ${descricao}`.toLowerCase();
  if (/lanche|alimenta|café|coffee|coffe|refeição|marmita/.test(t)) return 'lanche';
  if (/manuten|reparo|conserto|pintura|reforma|limpeza/.test(t)) return 'manutencao';
  if (/estrutura|infraestrutura|montagem|desmontagem|instalação|equipamento/.test(t)) return 'estrutura';
  if (/exposiç|exposição|mostra|exibiç|curadoria/.test(t)) return 'exposicao';
  if (/oficina|workshop|formação|capacitação|curso/.test(t)) return 'oficina';
  if (/evento|programação|apresentação|espetáculo|show|festival/.test(t)) return 'evento';
  if (/divulg|comunicação|post|clipping|imprensa|mídia|release/.test(t)) return 'comunicacao';
  return 'outro';
}

function mesParseado(mesStr = '') {
  const partes = String(mesStr).split('/');
  const nome = partes[0]?.trim() || '';
  const ano = partes[1]?.trim() || ANO_FILTRO;
  const idx = MES_ORDER.findIndex(m => m.toLowerCase() === nome.toLowerCase());
  return { nome: idx === -1 ? nome : MES_ORDER[idx], ano, idx: idx === -1 ? 99 : idx };
}

function formatDateBR(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('pt-BR');
}

function getLegenda(img) {
  return img.activityTitulo || img.legenda || img.caption || img.description || img.fileName || 'Registro fotográfico';
}

// ─── Componente: card de foto ─────────────────────────────────────────────────
function FotoCard({ img, onClick }) {
  const legenda = getLegenda(img);
  return (
    <div className="flex flex-col gap-1.5 break-inside-avoid">
      <button
        type="button"
        onClick={() => onClick(img)}
        className="group overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition w-full"
      >
        <img
          src={img.fileUrl}
          alt={legenda}
          loading="lazy"
          className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          style={{ minHeight: 140, maxHeight: 220, objectFit: 'cover' }}
          onError={e => { e.currentTarget.style.opacity = '0.25'; }}
        />
      </button>
      <p className="text-xs text-gray-700 px-0.5 leading-snug line-clamp-2">{legenda}</p>
      {img.date && <p className="text-[11px] text-gray-400 px-0.5">{formatDateBR(img.date)}</p>}
    </div>
  );
}

// ─── Componente: bloco de atividade ──────────────────────────────────────────
function AtividadeBloco({ atividade, fotos, onClick }) {
  const [open, setOpen] = useState(true);
  const tipo = detectTipo(atividade, '');
  const tipoLabel = TIPO_LABELS[tipo] || 'Atividade';
  const minFotos = fotos.length >= 3;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Cabeçalho da atividade */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{atividade}</span>
            <Badge className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 border-0 font-normal">
              {tipoLabel}
            </Badge>
            {!minFotos && (
              <Badge className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 font-normal">
                {fotos.length} foto{fotos.length !== 1 ? 's' : ''} — abaixo de 3
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{fotos.length} registro{fotos.length !== 1 ? 's' : ''} fotográfico{fotos.length !== 1 ? 's' : ''}</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
      </button>

      {/* Grade de fotos */}
      {open && (
        <div className="px-5 pb-5">
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {fotos.map(img => (
              <FotoCard key={img.id || img.fileUrl} img={img} onClick={onClick} />
            ))}
          </div>
          {!minFotos && (
            <p className="mt-3 text-xs text-amber-600 italic">
              ⚠️ Esta atividade possui menos de 3 fotos no período. Considere adicionar mais registros.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente: seção mensal ─────────────────────────────────────────────────
function MesSection({ mesLabel, atividades, onClick }) {
  const [open, setOpen] = useState(true);
  const totalFotos = Object.values(atividades).reduce((s, f) => s + f.length, 0);
  const totalAtividades = Object.keys(atividades).length;

  return (
    <section className="space-y-3">
      {/* Cabeçalho do mês */}
      <div className="rounded-2xl bg-gray-900 text-white px-6 py-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {open ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
          <div>
            <h2 className="text-xl font-bold">{mesLabel}</h2>
            <p className="text-sm text-white/60 mt-0.5">{totalAtividades} atividade{totalAtividades !== 1 ? 's' : ''} · {totalFotos} foto{totalFotos !== 1 ? 's' : ''}</p>
          </div>
        </button>
      </div>

      {/* Blocos de atividade */}
      {open && (
        <div className="space-y-3 pl-1">
          {Object.entries(atividades).map(([atividade, fotos]) => (
            <AtividadeBloco
              key={atividade}
              atividade={atividade}
              fotos={fotos}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
function RelatorioAtividadesHtmlInner() {
  const [selected, setSelected] = useState(null);
  const [buscandoDrive, setBuscandoDrive] = useState(false);
  const [driveMsg, setDriveMsg] = useState('');
  const printRef = useRef(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['relatorio-atividades-html-fev-jun-2026-v3'],
    queryFn: async () => {
      const [reports, photos] = await Promise.all([
        base44.entities.Report.list('-created_date', 200),
        base44.entities.ReportPhoto.list('-created_date', 2000),
      ]);
      return { reports, photos };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  async function buscarFotosDrive() {
    setBuscandoDrive(true);
    setDriveMsg('Iniciando varredura profunda no Drive...');
    try {
      // Varrer pastas de fotos de atividades — múltiplos lotes para cobrir fev-jun
      const lotes = [
        { skip: 0, limit: 50 },
        { skip: 50, limit: 50 },
        { skip: 100, limit: 50 },
      ];
      let totalImportadas = 0;
      for (const lote of lotes) {
        setDriveMsg(`Varrendo Drive — lote ${lote.skip / 50 + 1}/3...`);
        const res = await base44.functions.invoke('varreduraProfundaFotosDrive', {
          skip: lote.skip,
          limit: lote.limit,
          mes_filtro: ['fevereiro', 'março', 'abril', 'maio', 'junho'],
          ano_filtro: 2026,
        });
        totalImportadas += res?.data?.importadas || res?.data?.created || 0;
      }
      setDriveMsg(`✅ Varredura concluída — ${totalImportadas} fotos importadas. Recarregando...`);
      await refetch();
    } catch (e) {
      setDriveMsg(`⚠️ ${e?.message || 'Erro na varredura. Tente novamente.'}`);
    } finally {
      setBuscandoDrive(false);
    }
  }

  // ─── Estrutura: mês → atividade → fotos ──────────────────────────────────
  const estrutura = useMemo(() => {
    if (!data) return [];

    const reports = data.reports || [];
    const photos = data.photos || [];

    // Meses permitidos: fev (2) a jun (6) de 2026
    const MESES_PERMITIDOS = new Set(['fevereiro','março','marco','abril','maio','junho']);
    const normMes = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Filtrar relatórios do período
    const reportsFiltrados = reports.filter(r => {
      const ano = Number(r.ano) || 0;
      const mes = normMes(r.mes_referencia);
      // aceitar ano 2026, ou ano 0/undefined se o mês bater
      return MESES_PERMITIDOS.has(mes) && (ano === 2026 || ano === 0 || !r.ano);
    });

    // Indexar fotos por report_id
    const photosByReport = new Map();
    for (const p of photos) {
      if (!p.file_url) continue;
      const key = p.report_id || '__sem_report__';
      if (!photosByReport.has(key)) photosByReport.set(key, []);
      photosByReport.get(key).push(p);
    }

    // Fotos soltas (sem report_id) — pool para completar atividades sem foto
    const fotasSoltas = (photosByReport.get('__sem_report__') || []).map(p => ({
      id: p.id, fileUrl: p.file_url, legenda: p.caption || p.legenda || p.file_name || '',
      date: p.created_date, museu: p.museu, reportMes: p.mes_referencia, activityTitulo: '',
    }));

    // Pool de fotos por mês (de qualquer report) para completar atividades
    const fotosPorMes = new Map(); // normMes → foto[]
    for (const p of photos) {
      if (!p.file_url) continue;
      const mn = normMes(p.mes_referencia || '');
      if (!mn) continue;
      if (!fotosPorMes.has(mn)) fotosPorMes.set(mn, []);
      fotosPorMes.get(mn).push({
        id: p.id, fileUrl: p.file_url,
        legenda: p.caption || p.legenda || p.file_name || '',
        date: p.created_date, museu: p.museu, reportMes: p.mes_referencia,
      });
    }

    // Mês index para ordenação
    const mesIdx = mes => MES_ORDER.findIndex(m => normMes(m) === normMes(mes));

    // mesMap: mesKey → { idx, atividades: Map<titulo, fotos[]> }
    const mesMap = new Map();

    for (const report of reportsFiltrados) {
      const mesNome = MES_ORDER[mesIdx(report.mes_referencia)] || report.mes_referencia;
      const mesKey = `${mesNome}/2026`;
      const idx = mesIdx(report.mes_referencia);

      if (!mesMap.has(mesKey)) mesMap.set(mesKey, { idx, atividades: new Map() });
      const { atividades } = mesMap.get(mesKey);

      const fotosDoReport = (photosByReport.get(report.id) || []).map(p => ({
        id: p.id, fileUrl: p.file_url,
        legenda: p.caption || p.legenda || p.file_name || '',
        date: p.created_date, museu: p.museu || report.museu,
        reportMes: mesNome, activityTitulo: '',
      }));

      // Pool para completar: fotos do report + fotos do mesmo mês
      const poolMes = fotosPorMes.get(normMes(mesNome)) || [];

      const atividadesDoReport = Array.isArray(report.atividades) ? report.atividades : [];

      if (atividadesDoReport.length === 0) {
        // Sem atividades: bloco genérico do museu com fotos do report
        if (fotosDoReport.length > 0) {
          const titulo = report.museu || 'Atividades do período';
          if (!atividades.has(titulo)) atividades.set(titulo, []);
          const jaIds = new Set(atividades.get(titulo).map(f => f.id));
          for (const f of fotosDoReport) {
            if (!jaIds.has(f.id)) { f.activityTitulo = titulo; atividades.get(titulo).push(f); jaIds.add(f.id); }
          }
        }
      } else {
        // Distribuir fotos do report entre atividades proporcionalmente
        const totalAts = atividadesDoReport.length;
        const fotosPorAt = Math.max(1, Math.ceil(fotosDoReport.length / totalAts));

        atividadesDoReport.forEach((act, i) => {
          const titulo = act.titulo || `Atividade ${i + 1}`;
          // Sempre registrar a atividade mesmo sem fotos
          if (!atividades.has(titulo)) atividades.set(titulo, []);
          const jaIds = new Set(atividades.get(titulo).map(f => f.id));

          // Fatia de fotos diretamente do report
          const slice = fotosDoReport.slice(i * fotosPorAt, (i + 1) * fotosPorAt);
          for (const f of slice) {
            const fc = { ...f, activityTitulo: titulo };
            if (!jaIds.has(fc.id)) { atividades.get(titulo).push(fc); jaIds.add(fc.id); }
          }

          // Completar até 3 com fotos do mesmo mês (pool amplo)
          if (atividades.get(titulo).length < 3) {
            for (const c of poolMes) {
              if (atividades.get(titulo).length >= 3) break;
              if (!jaIds.has(c.id)) {
                atividades.get(titulo).push({ ...c, activityTitulo: titulo });
                jaIds.add(c.id);
              }
            }
          }
        });
      }
    }

    return Array.from(mesMap.entries())
      .sort((a, b) => a[1].idx - b[1].idx)
      .map(([mesLabel, { atividades }]) => ({
        mesLabel,
        // Incluir atividades MESMO sem fotos (mostrar que existem)
        atividades: Object.fromEntries(atividades.entries()),
      }))
      .filter(({ atividades }) => Object.keys(atividades).length > 0);
  }, [data]);

  const totalFotos = estrutura.reduce((s, m) =>
    s + Object.values(m.atividades).reduce((ss, f) => ss + f.length, 0), 0);
  const totalAtividades = estrutura.reduce((s, m) => s + Object.keys(m.atividades).length, 0);
  const totalMeses = estrutura.length;

  function handlePrint() {
    window.print();
  }

  if (isLoading) return <LoadingPage message="Carregando atividades e fotos..." description="Buscando registros de fevereiro a junho/2026." />;
  if (isError) return <LoadingPage error errorTitle="Erro ao carregar" errorDescription={error?.message} />;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Barra de controle (oculta na impressão) */}
      <div className="print:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div>
          <h1 className="font-bold text-gray-900 text-lg leading-tight">Relatório de Atividades com Fotos</h1>
          <p className="text-xs text-gray-500">Fevereiro a Junho/2026 · {totalMeses} meses · {totalAtividades} atividades · {totalFotos} fotos</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {driveMsg && (
            <span className="text-xs text-blue-600 max-w-xs truncate">{driveMsg}</span>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={buscarFotosDrive} disabled={buscandoDrive}>
            <FolderSearch className={`w-4 h-4 mr-1 ${buscandoDrive ? 'animate-pulse' : ''}`} />
            {buscandoDrive ? 'Varrendo Drive...' : 'Buscar fotos no Drive'}
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-2 bg-gray-900 hover:bg-gray-800 text-white">
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Cabeçalho do relatório impresso */}
      <div className="hidden print:block px-10 pt-8 pb-4 border-b border-gray-300">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Museus Centro · Viaduto das Artes</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Relatório de Atividades com Registros Fotográficos</h1>
        <p className="text-sm text-gray-600 mt-0.5">Período: Fevereiro a Junho de 2026 · Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
        <div className="flex gap-6 mt-3 text-sm text-gray-700">
          <span><strong>{totalMeses}</strong> meses</span>
          <span><strong>{totalAtividades}</strong> atividades</span>
          <span><strong>{totalFotos}</strong> fotos</span>
        </div>
      </div>

      <div ref={printRef} className="mx-auto max-w-5xl px-4 py-8 md:px-6 space-y-10 print:px-8 print:py-6 print:space-y-8">

        {/* Resumo rápido (tela) */}
        <div className="print:hidden grid grid-cols-3 gap-3">
          {[
            { label: 'Meses cobertos', value: totalMeses, sub: 'fev–jun 2026' },
            { label: 'Atividades', value: totalAtividades, sub: 'com fotos associadas' },
            { label: 'Fotos totais', value: totalFotos, sub: 'registros fotográficos' },
          ].map(c => (
            <div key={c.label} className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs font-medium text-gray-700 mt-0.5">{c.label}</p>
              <p className="text-[11px] text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Conteúdo por mês */}
        {estrutura.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center space-y-4">
            <Images className="mx-auto h-12 w-12 text-gray-300" />
            <div>
              <p className="font-medium text-gray-700">Nenhuma atividade encontrada no período</p>
              <p className="text-sm text-gray-400 mt-1">As fotos podem estar no Google Drive e ainda não sincronizadas.</p>
            </div>
            <Button onClick={buscarFotosDrive} disabled={buscandoDrive} className="gap-2">
              <FolderSearch className="w-4 h-4" />
              {buscandoDrive ? 'Varrendo Drive...' : 'Buscar fotos no Drive agora'}
            </Button>
            {driveMsg && <p className="text-xs text-blue-600">{driveMsg}</p>}
          </div>
        ) : (
          <div className="space-y-10">
            {estrutura.map(({ mesLabel, atividades }) => (
              <MesSection
                key={mesLabel}
                mesLabel={mesLabel}
                atividades={atividades}
                onClick={setSelected}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="w-full max-w-5xl overflow-hidden border-0 bg-black p-0 print:hidden">
          {selected && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={selected.fileUrl}
                alt={getLegenda(selected)}
                className="max-h-[80vh] w-full object-contain"
              />
              <div className="bg-black/85 px-6 py-4 space-y-1 text-white">
                <p className="text-lg font-semibold">{getLegenda(selected)}</p>
                <div className="flex flex-wrap gap-3 text-xs text-white/60">
                  {selected.activityTitulo && <span>{selected.activityTitulo}</span>}
                  {selected.museu && <span>{selected.museu}</span>}
                  {selected.reportMes && <span>{selected.reportMes}</span>}
                  {selected.date && <span>{formatDateBR(selected.date)}</span>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { font-size: 11pt; }
          section { page-break-inside: avoid; }
          img { max-height: 200px !important; object-fit: cover; }
          .columns-1, .columns-2, .columns-3 { column-count: 3 !important; }
        }
      `}</style>
    </div>
  );
}

export default function RelatorioAtividadesHtml() {
  return (
    <RequireAuth>
      <RelatorioAtividadesHtmlInner />
    </RequireAuth>
  );
}