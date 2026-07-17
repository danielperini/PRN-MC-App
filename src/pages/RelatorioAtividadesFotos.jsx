import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadGalleryReportData } from '@/utils/galleryReportData';
import RequireAuth from '@/components/auth/RequireAuth';
import LoadingPage from '@/components/common/LoadingPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Images, ChevronDown, ChevronRight, Printer, RefreshCw, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import jsPDF from 'jspdf';

const MUSEU_LABELS = {
  MHAB: 'Museu Histórico Abílio Barreto',
  MIS: 'Museu da Imagem e do Som de Belo Horizonte',
  MUMO: 'Museu da Moda de Belo Horizonte',
  SEM_IDENTIFICACAO: 'Sem identificação de museu',
};

const MUSEU_COLORS = {
  MHAB: { bg: 'bg-amber-50', border: 'border-amber-300', header: 'bg-amber-700', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-800' },
  MIS: { bg: 'bg-sky-50', border: 'border-sky-300', header: 'bg-sky-700', text: 'text-sky-900', badge: 'bg-sky-100 text-sky-800' },
  MUMO: { bg: 'bg-violet-50', border: 'border-violet-300', header: 'bg-violet-700', text: 'text-violet-900', badge: 'bg-violet-100 text-violet-800' },
  SEM_IDENTIFICACAO: { bg: 'bg-gray-50', border: 'border-gray-300', header: 'bg-gray-600', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-800' },
};

const MES_ORDER = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function mesIndex(mesStr = '') {
  const partes = String(mesStr).split('/');
  const nome = partes[0]?.trim() || '';
  const ano = partes[1]?.trim() || '2026';
  const idx = MES_ORDER.findIndex(m => m.toLowerCase() === nome.toLowerCase());
  return { idx: idx === -1 ? 99 : idx, ano, nome: idx === -1 ? nome : MES_ORDER[idx], label: mesStr };
}

function formatDateBR(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('pt-BR');
}

function getLegenda(image) {
  return image.activityTitulo || image.legenda || image.caption || image.description || image.fileName || 'Registro fotográfico';
}

function getLocal(image) {
  return image.local || image.location || image.endereco || image.geoLocal || image.geo_local || null;
}

function getAutor(image) {
  return image.authorName || image.author || image.fotografo || image.autor || null;
}

// ─── Componente: foto individual no álbum ────────────────────────────────────
function AlbumPhoto({ image, onClick }) {
  const legenda = getLegenda(image);
  return (
    <div className="flex flex-col gap-2 break-inside-avoid">
      <button
        type="button"
        onClick={() => onClick(image)}
        className="group overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition w-full"
      >
        <img
          src={image.fileUrl}
          alt={legenda}
          loading="lazy"
          decoding="async"
          className="w-full object-cover max-h-64 transition-transform duration-300 group-hover:scale-[1.02]"
          style={{ objectFit: 'cover', minHeight: '160px' }}
          onError={e => { e.currentTarget.style.opacity = '0.2'; }}
        />
      </button>
      <div className="px-1">
        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{legenda}</p>
        <div className="flex flex-wrap gap-x-3 mt-0.5">
          {getLocal(image) && <p className="text-xs text-gray-500">📍 {getLocal(image)}</p>}
          {image.date && <p className="text-xs text-gray-400">{formatDateBR(image.date)}</p>}
          {getAutor(image) && <p className="text-xs text-gray-400">Foto: {getAutor(image)}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Álbum mensal de um museu ─────────────────────────────────────────────────
function AlbumMes({ museuKey, mesLabel, fotos, defaultOpen = false, onExportPDF }) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = MUSEU_COLORS[museuKey] || MUSEU_COLORS.SEM_IDENTIFICACAO;
  const [selected, setSelected] = useState(null);
  const albumRef = useRef(null);

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden shadow-sm`}>
      {/* Cabeçalho do álbum */}
      <div className={`${colors.header} text-white px-5 py-3 flex items-center justify-between gap-3`}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <span className="font-semibold text-base">{mesLabel}</span>
          <Badge className="bg-white/20 text-white border-0 text-xs ml-1">{fotos.length} foto{fotos.length !== 1 ? 's' : ''}</Badge>
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/20 border border-white/30 h-8 px-3 text-xs gap-1.5 shrink-0"
          onClick={() => onExportPDF(museuKey, mesLabel, fotos)}
        >
          <Download className="w-3.5 h-3.5" />
          PDF
        </Button>
      </div>

      {/* Grid de fotos */}
      {open && (
        <div ref={albumRef} className="p-5">
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5">
            {fotos.map(image => (
              <AlbumPhoto
                key={image.id || image.fileUrl}
                image={image}
                onClick={setSelected}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="w-full max-w-5xl overflow-hidden border-0 bg-black p-0">
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
                <div className="flex flex-wrap gap-3 text-xs text-white/70">
                  {selected.museu && <span>{selected.museu}</span>}
                  {selected.reportMes && <span>{selected.reportMes}</span>}
                  {selected.date && <span>{formatDateBR(selected.date)}</span>}
                  {selected.authorName && <span>Foto: {selected.authorName}</span>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Seção de um museu (com todos os meses) ───────────────────────────────────
function MuseuSection({ museuKey, albunsPorMes, onExportPDF, onExportMuseuPDF }) {
  const [open, setOpen] = useState(true);
  const colors = MUSEU_COLORS[museuKey] || MUSEU_COLORS.SEM_IDENTIFICACAO;
  const totalFotos = albunsPorMes.reduce((sum, a) => sum + a.fotos.length, 0);

  return (
    <section className="space-y-3">
      {/* Cabeçalho do museu */}
      <div className={`flex items-center justify-between gap-3 rounded-2xl border-2 ${colors.border} px-6 py-4 ${colors.bg}`}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-3 flex-1 text-left ${colors.text}`}
        >
          {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          <div>
            <h2 className="text-xl font-bold">{MUSEU_LABELS[museuKey] || museuKey}</h2>
            <p className="text-sm opacity-70 mt-0.5">{albunsPorMes.length} álbum{albunsPorMes.length !== 1 ? 's' : ''} · {totalFotos} foto{totalFotos !== 1 ? 's' : ''}</p>
          </div>
        </button>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className={`${colors.badge} border-current gap-1.5`}
            onClick={() => onExportMuseuPDF(museuKey, albunsPorMes)}
          >
            <Printer className="w-3.5 h-3.5" />
            Exportar museu completo
          </Button>
        </div>
      </div>

      {/* Álbuns mensais */}
      {open && (
        <div className="space-y-3 pl-2">
          {albunsPorMes.map(({ mesLabel, fotos }) => (
            <AlbumMes
              key={mesLabel}
              museuKey={museuKey}
              mesLabel={mesLabel}
              fotos={fotos}
              defaultOpen={albunsPorMes.length === 1}
              onExportPDF={onExportPDF}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Geração de PDF ────────────────────────────────────────────────────────────
async function gerarAlbumPDF(museuKey, mesLabel, fotos, opts = {}) {
  const museuNome = MUSEU_LABELS[museuKey] || museuKey;
  const titulo = opts.titulo || `${museuNome} — ${mesLabel}`;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14, CW = PW - M * 2;

  function drawHeader(page) {
    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, PW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('MUSEUS CENTRO — RELATÓRIO DE ATIVIDADES', M, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(titulo, M, 13);
    doc.text(`Pág. ${page}`, PW - M, 13, { align: 'right' });
  }

  // Capa
  drawHeader(1);
  let y = 28;
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, CW, 20, 'F');
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(museuNome.toUpperCase(), PW / 2, y + 9, { align: 'center', maxWidth: CW });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(mesLabel, PW / 2, y + 16, { align: 'center' });
  y += 26;
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  doc.text(`${fotos.length} registro${fotos.length !== 1 ? 's' : ''} fotográfico${fotos.length !== 1 ? 's' : ''}  ·  Gerado em ${new Date().toLocaleDateString('pt-BR')}`, PW / 2, y, { align: 'center' });
  y += 12;

  // Cada foto em página própria (garante foto inteira + legenda legível)
  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i];
    const legenda = getLegenda(foto);
    const isFirst = i === 0;

    if (!isFirst) {
      doc.addPage();
      y = 22;
    }

    drawHeader(i + (isFirst ? 1 : 2));

    // Carregar imagem
    try {
      const imgUrl = foto.fileUrl;
      // Tentar carregar via fetch → base64
      const resp = await fetch(imgUrl, { mode: 'cors' }).catch(() => null);
      if (resp && resp.ok) {
        const blob = await resp.blob();
        const base64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        const ext = blob.type.includes('png') ? 'PNG' : 'JPEG';

        // Calcular dimensões mantendo proporção, ocupando largura total
        const imgEl = new Image();
        await new Promise(resolve => { imgEl.onload = resolve; imgEl.onerror = resolve; imgEl.src = base64; });
        const ratio = imgEl.naturalWidth > 0 ? imgEl.naturalHeight / imgEl.naturalWidth : 0.75;
        const imgW = CW;
        const imgH = Math.min(imgW * ratio, PH - y - 40);

        doc.addImage(base64, ext, M, y, imgW, imgH);
        y += imgH + 4;
      } else {
        // Fallback: retângulo cinza com texto
        doc.setFillColor(220, 220, 220);
        doc.rect(M, y, CW, 80, 'F');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text('Imagem não disponível para exportação offline', PW / 2, y + 40, { align: 'center' });
        y += 84;
      }
    } catch {
      doc.setFillColor(220, 220, 220);
      doc.rect(M, y, CW, 60, 'F');
      y += 64;
    }

    // Caixa de legenda com fundo claro
    const legendaBlock = y + 4;
    const autor = getAutor(foto);
    const local = getLocal(foto);
    const metaParts = [
      foto.reportMes,
      foto.date ? formatDateBR(foto.date) : '',
      local ? `📍 ${local}` : '',
      autor ? `Foto: ${autor}` : '',
    ].filter(Boolean);

    const legendaLines = doc.splitTextToSize(legenda, CW - 4);
    const blockH = legendaLines.slice(0, 3).length * 5 + (metaParts.length ? 8 : 4) + 6;
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(M, legendaBlock - 2, CW, blockH, 2, 2, 'F');

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(legendaLines.slice(0, 3), M + 3, legendaBlock + 5);
    y = legendaBlock + legendaLines.slice(0, 3).length * 5 + 4;

    if (metaParts.length) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 90, 90);
      doc.text(metaParts.join('  ·  '), M + 3, y + 3);
    }
  }

  // Linha separadora no rodapé de todas as páginas
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PH - 10, PW - M, PH - 10);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('Museus Centro · Viaduto das Artes', M, PH - 6);
    doc.text(`${p} / ${total}`, PW - M, PH - 6, { align: 'right' });
  }

  const nomeArquivo = `Album_${museuKey}_${String(mesLabel).replace(/\//g, '-').replace(/\s/g, '_')}.pdf`;
  doc.save(nomeArquivo);
}

async function gerarMuseuCompletoPDF(museuKey, albunsPorMes) {
  // Gera um PDF com todos os meses do museu, com capa por mês
  const museuNome = MUSEU_LABELS[museuKey] || museuKey;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14, CW = PW - M * 2;
  let pageCount = 0;

  function drawHeader(museu, mes) {
    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, PW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('MUSEUS CENTRO — RELATÓRIO DE ATIVIDADES', M, 8);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${museu}  ·  ${mes}`, M, 13);
    doc.text(`Pág. ${pageCount}`, PW - M, 13, { align: 'right' });
  }

  for (const { mesLabel, fotos } of albunsPorMes) {
    // Capa do mês
    pageCount++;
    if (pageCount > 1) doc.addPage();
    drawHeader(museuNome, mesLabel);
    let y = 30;
    doc.setFillColor(245, 245, 245);
    doc.rect(M, y, CW, 18, 'F');
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(mesLabel.toUpperCase(), PW / 2, y + 12, { align: 'center' });
    y += 24;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`${fotos.length} foto${fotos.length !== 1 ? 's' : ''}`, PW / 2, y, { align: 'center' });

    // Fotos
    for (const foto of fotos) {
      pageCount++;
      doc.addPage();
      drawHeader(museuNome, mesLabel);
      y = 22;
      const legenda = getLegenda(foto);
      try {
        const resp = await fetch(foto.fileUrl, { mode: 'cors' }).catch(() => null);
        if (resp && resp.ok) {
          const blob = await resp.blob();
          const base64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          const ext = blob.type.includes('png') ? 'PNG' : 'JPEG';
          const imgEl = new Image();
          await new Promise(resolve => { imgEl.onload = resolve; imgEl.onerror = resolve; imgEl.src = base64; });
          const ratio = imgEl.naturalWidth > 0 ? imgEl.naturalHeight / imgEl.naturalWidth : 0.75;
          const imgW = CW;
          const imgH = Math.min(imgW * ratio, PH - y - 40);
          doc.addImage(base64, ext, M, y, imgW, imgH);
          y += imgH + 5;
        } else {
          doc.setFillColor(220, 220, 220);
          doc.rect(M, y, CW, 70, 'F');
          y += 74;
        }
      } catch {
        doc.setFillColor(220, 220, 220);
        doc.rect(M, y, CW, 60, 'F');
        y += 64;
      }
      // Caixa de legenda destacada
      const legendaBlock = y + 4;
      const autor = getAutor(foto);
      const local = getLocal(foto);
      const metaParts = [
        foto.reportMes,
        foto.date ? formatDateBR(foto.date) : '',
        local ? `📍 ${local}` : '',
        autor ? `Foto: ${autor}` : '',
      ].filter(Boolean);
      const ll = doc.splitTextToSize(legenda, CW - 4);
      const blockH = ll.slice(0, 3).length * 5 + (metaParts.length ? 8 : 4) + 6;
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(M, legendaBlock - 2, CW, blockH, 2, 2, 'F');
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text(ll.slice(0, 3), M + 3, legendaBlock + 5);
      y = legendaBlock + ll.slice(0, 3).length * 5 + 4;
      if (metaParts.length) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(90, 90, 90);
        doc.text(metaParts.join('  ·  '), M + 3, y + 3);
      }
    }
  }

  // Rodapé em todas as páginas
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PH - 10, PW - M, PH - 10);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('Museus Centro · Viaduto das Artes', M, PH - 6);
    doc.text(`${p} / ${total}`, PW - M, PH - 6, { align: 'right' });
  }

  doc.save(`Relatorio_${museuKey}_Completo.pdf`);
}

// ─── Página principal ─────────────────────────────────────────────────────────
function RelatorioAtividadesFotosInner() {
  const [exportando, setExportando] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['galeria-fotos-stable-v1'],
    queryFn: () => loadGalleryReportData({ limitAttachments: 500, useCache: true }),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const images = Array.isArray(data?.images) ? data.images : [];

  // Agrupar: museu → mes → fotos
  const estrutura = useMemo(() => {
    const map = new Map();
    for (const img of images) {
      const museu = img.sectionKey || 'SEM_IDENTIFICACAO';
      if (!map.has(museu)) map.set(museu, new Map());
      const mesMap = map.get(museu);
      const mesKey = img.reportMes || 'Sem período';
      if (!mesMap.has(mesKey)) mesMap.set(mesKey, []);
      mesMap.get(mesKey).push(img);
    }

    // Ordenar museus e meses
    const museuOrder = ['MHAB', 'MIS', 'MUMO', 'SEM_IDENTIFICACAO'];
    return museuOrder
      .filter(mk => map.has(mk))
      .map(museuKey => {
        const mesMap = map.get(museuKey);
        const albunsPorMes = Array.from(mesMap.entries())
          .map(([mesLabel, fotos]) => ({ mesLabel, ...mesIndex(mesLabel), fotos }))
          .sort((a, b) => {
            if (a.ano !== b.ano) return String(a.ano).localeCompare(String(b.ano));
            return a.idx - b.idx;
          })
          .map(({ mesLabel, fotos }) => ({ mesLabel, fotos }));
        return { museuKey, albunsPorMes };
      });
  }, [images]);

  const totalFotos = images.length;
  const totalAlbuns = estrutura.reduce((sum, m) => sum + m.albunsPorMes.length, 0);

  async function handleExportPDF(museuKey, mesLabel, fotos) {
    const key = `${museuKey}-${mesLabel}`;
    setExportando(key);
    try {
      await gerarAlbumPDF(museuKey, mesLabel, fotos);
    } finally {
      setExportando(null);
    }
  }

  async function handleExportMuseuPDF(museuKey, albunsPorMes) {
    setExportando(museuKey);
    try {
      await gerarMuseuCompletoPDF(museuKey, albunsPorMes);
    } finally {
      setExportando(null);
    }
  }

  if (isLoading) return <LoadingPage message="Carregando relatório..." description="Buscando fotos e atividades." />;
  if (isError && images.length === 0) return <LoadingPage error errorTitle="Não foi possível carregar" errorDescription={error?.message} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 space-y-8">

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Relatório de Atividades</h1>
            <p className="text-gray-500 mt-1">Álbuns fotográficos por museu e período · {totalFotos} fotos · {totalAlbuns} álbuns</p>
          </div>
          <div className="flex gap-2">
            {exportando && (
              <span className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Gerando PDF...
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Resumo por museu */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {estrutura.map(({ museuKey, albunsPorMes }) => {
            const colors = MUSEU_COLORS[museuKey] || MUSEU_COLORS.SEM_IDENTIFICACAO;
            const total = albunsPorMes.reduce((s, a) => s + a.fotos.length, 0);
            return (
              <div key={museuKey} className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-4`}>
                <p className={`font-bold text-sm ${colors.text}`}>{MUSEU_LABELS[museuKey] || museuKey}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
                <p className="text-xs text-gray-500">{albunsPorMes.length} álbum{albunsPorMes.length !== 1 ? 's' : ''}</p>
              </div>
            );
          })}
        </div>

        {/* Álbuns por museu */}
        {estrutura.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <Images className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-700">Nenhuma foto encontrada</p>
            <p className="text-sm text-gray-400 mt-1">Atualize a galeria ou verifique os filtros.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {estrutura.map(({ museuKey, albunsPorMes }) => (
              <MuseuSection
                key={museuKey}
                museuKey={museuKey}
                albunsPorMes={albunsPorMes}
                onExportPDF={handleExportPDF}
                onExportMuseuPDF={handleExportMuseuPDF}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RelatorioAtividadesFotos() {
  return (
    <RequireAuth>
      <RelatorioAtividadesFotosInner />
    </RequireAuth>
  );
}