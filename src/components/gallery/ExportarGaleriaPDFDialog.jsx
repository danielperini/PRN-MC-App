import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Images, Building2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import viadutoHeaderOriginal from '@/assets/viadutoHeaderOriginal';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile'];
const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som',
  MUMO: 'MUMO — Museu da Moda',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
};

// Carrega uma URL via elemento <img> (evita bloqueios CORS do fetch em URLs do Drive)
function loadImageElement(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Converte HTMLImageElement para JPEG data URL via Canvas, respeitando proporção (contain)
function imageToDataUrl(img, maxW, maxH) {
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.78), w, h };
  } catch {
    return null;
  }
}

// Tenta carregar uma foto pelos candidatos de URL, em ordem de prioridade
async function fetchPhotoData(foto, maxW, maxH) {
  const urls = [
    foto.fileUrl,
    ...(foto.fallbackUrls || []),
    foto.originalFileUrl,
  ].filter(Boolean);

  for (const url of urls) {
    const img = await loadImageElement(url);
    if (img && img.naturalWidth > 0) {
      const result = imageToDataUrl(img, maxW, maxH);
      if (result) return { ...result, url };
    }
  }
  return null;
}

function normalizarLegenda(texto = '') {
  return String(texto)
    .replace(/\boficina\b/gi, 'atividade educativa')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function dataRealizacao(foto) {
  const data = new Date(foto.date || foto.timestamp || '');
  return Number.isNaN(data.getTime()) ? 'Data não informada' : data.toLocaleDateString('pt-BR');
}

function drawInstitutionalHeader(doc, pageW) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.addImage(viadutoHeaderOriginal, 'PNG', 12, 4, pageW - 24, 23);
  doc.setDrawColor(205, 205, 205);
  doc.line(12, 30, pageW - 12, 30);
}

const FOLDER_DRIVE_ID = '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ';

async function varrerTodosMuseusDrive(setProgresso, setProgressoPct) {
  const museus = ['MHAB', 'MIS', 'MUMO', 'Casa do Baile'];
  let totalCriadas = 0;
  let totalReparadas = 0;
  for (let mi = 0; mi < museus.length; mi++) {
    const museu = museus[mi];
    setProgresso(`Varrendo pastas do ${museu} no Drive...`);
    if (setProgressoPct) setProgressoPct(2 + Math.round((mi / museus.length) * 25));
    try {
      let offset = 0;
      let hasMore = true;
      let page = 0;
      while (hasMore) {
        page++;
        setProgresso(`Varredura ${museu} · lote ${page} (${totalCriadas} novas até agora)...`);
        const res = await base44.functions.invoke('varrerFotosMuseusDrive', {
          folder_id: FOLDER_DRIVE_ID,
          museu,
          offset,
        });
        const d = res?.data || {};
        totalCriadas += d.criadas || 0;
        totalReparadas += d.reparadas || 0;
        offset = d.next_offset;
        hasMore = d.has_more;
        if (!d.success) break;
      }
    } catch (e) {
      console.warn(`Varredura ${museu} silenciada:`, e?.message);
    }
  }
  if (totalCriadas + totalReparadas > 0) {
    setProgresso(`✓ ${totalCriadas} novas + ${totalReparadas} reparadas de todos os museus. Recarregando banco...`);
    if (setProgressoPct) setProgressoPct(28);
    await new Promise(r => setTimeout(r, 600));
  }
}

export default function ExportarGaleriaPDFDialog({ open, onClose, fotos }) {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [progressoPct, setProgressoPct] = useState(0);
  const [etapa, setEtapa] = useState('');
  const [auditoria, setAuditoria] = useState(null);

  // Filtra apenas fotos com museu identificado
  const fotosValidas = fotos.filter(f => f.sectionKey && SECTION_ORDER.includes(f.sectionKey));
  const museusPresentes = SECTION_ORDER.filter(k => fotosValidas.some(f => f.sectionKey === k));

  async function handleExportar() {
    if (fotosValidas.length === 0) {
      toast.error('Nenhuma foto com museu identificado para exportar.');
      return;
    }
    setLoading(true);
    setAuditoria(null);
    setProgressoPct(2);

    const auditLog = { carregadas: 0, falhas: 0, total: fotosValidas.length, novas_importadas: 0 };

    try {
      // ── Etapa 0: varre pastas do Drive de todos os museus antes de gerar o PDF ──
      setEtapa('drive');
      await varrerTodosMuseusDrive(setProgresso, setProgressoPct);

      // ── Etapa 0.5: valida integridade das URLs ──
      const semUrl = fotosValidas.filter(f => !f.fileUrl || typeof f.fileUrl !== 'string' || f.fileUrl.trim() === '');
      if (semUrl.length > 0) {
        throw new Error(`${semUrl.length} foto(s) sem URL válida após varredura. Execute a sincronização novamente.`);
      }

      const pageW = 210, pageH = 297, margin = 12;
      const cols = 2, rows = 2, perPage = cols * rows;
      const cellW = (pageW - margin * 2 - (cols - 1) * 6) / cols;
      const headerH = 34;
      const slotH = 81;
      const cellH = slotH + 26;

      setEtapa('pdf');
      setProgresso(`Carregando ${fotosValidas.length} fotos do Drive antes de montar o PDF...`);
      setProgressoPct(30);
      const imagensPreCarregadas = [];
      for (let i = 0; i < fotosValidas.length; i++) {
        if (i > 0 && i % 3 === 0) {
          setProgresso(`Carregando imagens · ${i}/${fotosValidas.length}...`);
          setProgressoPct(30 + Math.round((i / fotosValidas.length) * 35));
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
        imagensPreCarregadas.push(await fetchPhotoData(fotosValidas[i], cellW * 4, slotH * 4));
      }
      setProgressoPct(65);
      const fotosFalhas = fotosValidas.filter((_, index) => !imagensPreCarregadas[index]);
      if (fotosFalhas.length) {
        throw new Error(`${fotosFalhas.length} foto(s) não puderam ser carregadas do Drive. Nenhuma página em branco foi gerada.`);
      }
      imagensPreCarregadas.forEach(() => { auditLog.carregadas += 1; });
      const imagemPorChave = new Map(fotosValidas.map((foto, index) => [foto.id || foto.fileUrl, imagensPreCarregadas[index]]));
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

      // ──────────────────────────────────────────
      // CAPA
      // ──────────────────────────────────────────
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', pageW / 2, 28, { align: 'center' });
      doc.setFontSize(26);
      doc.setFont('helvetica', 'bold');
      doc.text('Galeria de Fotos', pageW / 2, 95, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Museus Centro', pageW / 2, 112, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(170, 170, 170);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 130, { align: 'center' });
      doc.text(`${fotosValidas.length} fotografias`, pageW / 2, 141, { align: 'center' });

      // Link centralizado da capa
      doc.setFontSize(10);
      doc.setTextColor(150, 205, 255);
      doc.textWithLink('Fotos da galeria no app', pageW / 2, 165, {
        url: `${window.location.origin}/GaleriaFotos`,
        align: 'center',
      });

      // ──────────────────────────────────────────
      // AGRUPA POR MUSEU
      // ──────────────────────────────────────────
      const grupos = new Map(SECTION_ORDER.map(k => [k, []]));
      for (const foto of fotosValidas) {
        if (grupos.has(foto.sectionKey)) grupos.get(foto.sectionKey).push(foto);
      }

      let fotosProcessadas = 0;
      const total = fotosValidas.length;
      let museuCounter = 0;
      const totalMuseus = museusPresentes.length;

      for (const sectionKey of SECTION_ORDER) {
        const secFotos = grupos.get(sectionKey) || [];
        if (!secFotos.length) continue;

        // ── Página título da seção ──
        doc.addPage();
        doc.setFillColor(245, 245, 245);
        doc.rect(0, 0, pageW, pageH, 'F');
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(SECTION_LABELS[sectionKey], pageW / 2, pageH / 2 - 12, { align: 'center', maxWidth: 180 });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`${secFotos.length} foto${secFotos.length !== 1 ? 's' : ''}`, pageW / 2, pageH / 2 + 6, { align: 'center' });

        doc.setFillColor(20, 20, 20);
        doc.rect(0, 0, pageW, 14, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', margin, 8.5);

        // ── Páginas de fotos ──
        const totalPagSec = Math.ceil(secFotos.length / perPage);
        for (let p = 0; p < totalPagSec; p++) {
          const pageFotos = secFotos.slice(p * perPage, (p + 1) * perPage);
          const pctBase = 65 + Math.round((fotosProcessadas / total) * 30);
          setProgresso(`${SECTION_LABELS[sectionKey]} · página ${p + 1}/${totalPagSec} (fotos ${fotosProcessadas + 1}–${Math.min(fotosProcessadas + pageFotos.length, total)} de ${total})`);
          setProgressoPct(pctBase);
          await new Promise((r) => requestAnimationFrame(() => r()));
          const imagens = pageFotos.map((foto) => imagemPorChave.get(foto.id || foto.fileUrl));
          fotosProcessadas += pageFotos.length;

          doc.addPage();
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageW, pageH, 'F');

          // Cabeçalho institucional em todas as páginas do álbum
          doc.setFillColor(20, 20, 20);
          doc.rect(0, 0, pageW, 14, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', margin, 6.5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.text(SECTION_LABELS[sectionKey], margin, 11);
          doc.setTextColor(90, 90, 90);

          for (let i = 0; i < pageFotos.length; i++) {
            const foto = pageFotos[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const slotX = margin + col * (cellW + 4);
            const slotY = headerH + row * (cellH + 4);
            const imgResult = imagens[i];
            if (!imgResult) continue;

            if (i > 0) await new Promise((r) => requestAnimationFrame(() => r()));

            const scaleX = cellW / imgResult.w;
            const scaleY = slotH / imgResult.h;
            const scale = Math.min(scaleX, scaleY);
            const renderW = imgResult.w * scale;
            const renderH = imgResult.h * scale;
            const offsetX = slotX + (cellW - renderW) / 2;
            const offsetY = slotY + (slotH - renderH) / 2;

            doc.setFillColor(246, 246, 246);
            doc.rect(slotX, slotY, cellW, slotH, 'F');
            doc.addImage(imgResult.dataUrl, 'JPEG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
            doc.setDrawColor(205, 205, 205);
            doc.rect(slotX, slotY, cellW, slotH, 'S');
            if (foto.fileUrl) doc.link(offsetX, offsetY, renderW, renderH, { url: foto.fileUrl });

            const atividade = normalizarLegenda(foto.activityTitulo || foto.legenda || foto.fileName || 'Registro fotográfico');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            doc.text(doc.splitTextToSize(atividade, cellW).slice(0, 2), slotX, slotY + slotH + 5);
            doc.setFontSize(5.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(115, 115, 115);
            doc.text(`Museu: ${SECTION_LABELS[foto.sectionKey] || foto.museu || 'Não informado'}`, slotX, slotY + slotH + 15, { maxWidth: cellW });
            doc.text(`Data da realização: ${dataRealizacao(foto)}`, slotX, slotY + slotH + 20);
          }

        }
      }

      setProgresso('Preparando a auditoria...');
      setProgressoPct(96);
      await new Promise((r) => requestAnimationFrame(() => r()));

      // Página de auditoria ao final
      doc.addPage();
      doc.setFillColor(252, 252, 252);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Relatório de Auditoria', margin, 44);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const linhas = [
        `Total cadastrado na Galeria: ${total}`,
        `Fotos carregadas com sucesso: ${auditLog.carregadas}`,
        `Fotos não acessíveis (arquivo indisponível): ${auditLog.falhas}`,
        `Data de geração: ${new Date().toLocaleString('pt-BR')}`,
      ];
      linhas.forEach((linha, idx) => {
        doc.text(linha, margin, 58 + idx * 9);
      });
      doc.setFontSize(8);
      doc.setTextColor(100, 150, 220);
      doc.textWithLink('Fotos da galeria no app', pageW / 2, 58 + linhas.length * 9 + 10, {
        url: `${window.location.origin}/GaleriaFotos`,
        align: 'center',
      });

      // Cabeçalho e paginação definitivos, incluindo a página de auditoria
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let pagina = 1; pagina <= totalPaginas; pagina++) {
        doc.setPage(pagina);
        drawInstitutionalHeader(doc, pageW);
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text('Museus Centro · Viaduto das Artes', margin, pageH - 6);
        doc.text(`Página ${pagina} de ${totalPaginas}`, pageW - margin, pageH - 6, { align: 'right' });
      }

      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`Galeria_MuseusCentro_${ts}.pdf`);

      setAuditoria(auditLog);
      toast.success(`PDF gerado! ${auditLog.carregadas}/${total} fotos incluídas.`);
      setEtapa('');
      setProgressoPct(0);
      if (auditLog.falhas === 0) onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
      setProgressoPct(0);
      setEtapa('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Exportar Galeria em PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Images className="h-4 w-4 text-gray-400" />
              <span><strong>{fotosValidas.length}</strong> fotos identificadas serão incluídas</span>
            </div>
            {fotos.length - fotosValidas.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {fotos.length - fotosValidas.length} fotos sem museu identificado foram excluídas.
              </p>
            )}
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-500">Museus incluídos:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {museusPresentes.map(m => (
                    <span key={m} className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                      {SECTION_LABELS[m]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="text-xs leading-snug">{progresso || 'Gerando PDF...'}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(3, Math.min(100, progressoPct))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                <span>{Math.round(progressoPct)}%</span>
                <span>{etapa === 'drive' ? 'Etapa: Drive' : etapa === 'pdf' ? 'Etapa: PDF' : 'Processando'}</span>
              </div>
              <p className="text-[11px] text-gray-400 px-1">
                As fotos são carregadas via browser. URLs bloqueadas por CORS serão marcadas com link para o original.
              </p>
            </div>
          )}

          {auditoria && !loading && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1 text-xs">
              <p className="font-semibold text-green-800">Auditoria do PDF gerado</p>
              <p className="text-green-700">✓ Carregadas: <strong>{auditoria.carregadas}</strong> / {auditoria.total}</p>
              {auditoria.falhas > 0 && (
                <p className="text-amber-700">⚠ Não acessíveis (CORS/expiradas): <strong>{auditoria.falhas}</strong> — link para o original incluído no PDF.</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">
            O PDF é gerado no seu navegador. Fotos com restrição de acesso recebem link clicável para o original.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {auditoria && !loading ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button onClick={handleExportar} disabled={loading || fotosValidas.length === 0}>
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Gerando...</>
              : `Baixar PDF (${fotosValidas.length} fotos)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}