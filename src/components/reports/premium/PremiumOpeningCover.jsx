import React from 'react';
import { extractPhotos, normalizeText } from './premiumReportUtils';

function buildCoverCandidateScore(photo = {}, { preferred = false } = {}) {
  const safePhoto = photo || {};
  const text = normalizeText([
    safePhoto.legenda,
    safePhoto.atividade,
    safePhoto.fileName,
    safePhoto.museu,
    safePhoto.credito,
  ].filter(Boolean).join(' '));

  let score = preferred ? 20 : 0;

  if (text.includes('museu') || text.includes('mhab') || text.includes('mis') || text.includes('mumo')) score += 8;
  if (text.includes('exposicao') || text.includes('mostra') || text.includes('acervo')) score += 8;
  if (text.includes('publico') || text.includes('participantes') || text.includes('visita') || text.includes('mediada')) score += 7;
  if (text.includes('oficina') || text.includes('atividade') || text.includes('educativo') || text.includes('programacao')) score += 5;
  if (text.includes('auditorio') || text.includes('casarao') || text.includes('galeria') || text.includes('teatro')) score += 3;
  if (safePhoto.credito) score += 2;
  if (safePhoto.localizacao?.label) score += 1;

  if (text.includes('nf') || text.includes('xml') || text.includes('recibo') || text.includes('comprovante') || text.includes('contrato')) score -= 18;
  if (text.includes('print') || text.includes('screenshot') || text.includes('captura')) score -= 12;
  if (text.includes('selfie') || text.includes('documento')) score -= 8;

  return score;
}

function normalizeCoverPhoto(photo = {}, options = {}) {
  const safePhoto = photo || {};
  const url = safePhoto.imageUrl || safePhoto.url || safePhoto.src || safePhoto.file_url || '';
  if (!url) return null;

  return {
    id: safePhoto.imageId || safePhoto.id || url,
    url,
    legenda: safePhoto.legenda || safePhoto.caption || '',
    atividade: safePhoto.atividade || safePhoto.assignedActivityTitle || '',
    fileName: safePhoto.fileName || safePhoto.name || '',
    museu: safePhoto.museu || safePhoto.museum || '',
    credito: safePhoto.credito || '',
    localizacao: safePhoto.localizacao || null,
    preferred: !!options.preferred,
  };
}

function pickCoverPhoto(contexto) {
  const preferredPool = [
    normalizeCoverPhoto(contexto?.cover_photo_candidate, { preferred: true }),
    ...(Array.isArray(contexto?.unusedImages) ? contexto.unusedImages.map((photo) => normalizeCoverPhoto(photo, { preferred: true })) : []),
  ].filter(Boolean);

  const fallbackPool = extractPhotos(contexto, 64)
    .map((photo) => normalizeCoverPhoto(photo))
    .filter(Boolean);

  const uniqueCandidates = Array.from(
    new Map([...preferredPool, ...fallbackPool].map((photo) => [photo.id, photo])).values()
  );

  const rankedPhotos = uniqueCandidates
    .map((photo) => ({
      photo,
      score: buildCoverCandidateScore(photo, { preferred: photo.preferred }),
    }))
    .sort((a, b) => b.score - a.score);

  return rankedPhotos[0]?.photo || uniqueCandidates[0] || {};
}

export default function PremiumOpeningCover({ contexto }) {
  const cover = pickCoverPhoto(contexto);
  const coverPhoto = cover.url;
  const periodo = contexto?.reportEditorial?.periodLabel || contexto?.periodo_extenso || 'Período selecionado';

  return (
    <section className="premium-cover">
      {coverPhoto ? <img src={coverPhoto} alt="Imagem de capa do relatório Museus Centro" /> : <div className="premium-cover-fallback" />}
      <div className="premium-cover-overlay" />
      <div className="premium-cover-content">
        <p className="premium-cover-kicker">Viaduto das Artes / Museus Centro</p>
        <h1>Relatório Institucional</h1>
        <p className="premium-cover-period">Museus Centro · Viaduto das Artes</p>
        <p className="premium-cover-period">{periodo}</p>
        {(cover.credito || cover.localizacao?.label) && (
          <p className="premium-cover-credit">
            {[cover.credito ? `Crédito: ${cover.credito}` : '', cover.localizacao?.label ? `GPS: ${cover.localizacao.label}` : ''].filter(Boolean).join(' / ')}
          </p>
        )}
      </div>
    </section>
  );
}
