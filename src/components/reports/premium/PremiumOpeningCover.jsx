import React from 'react';
import { extractPhotos, fmtInt, normalizeText } from './premiumReportUtils';

function pickCoverPhoto(contexto) {
  const candidate = contexto?.cover_photo_candidate;
  if (candidate?.imageUrl || candidate?.url) {
    return {
      url: candidate.imageUrl || candidate.url,
      credito: candidate.credito || '',
      localizacao: candidate.localizacao || null,
    };
  }

  const photos = extractPhotos(contexto, 48);
  const rankedPhotos = photos
    .map((photo) => {
      const text = normalizeText([photo.legenda, photo.atividade, photo.fileName, photo.museu].filter(Boolean).join(' '));
      let score = 0;
      if (text.includes('museu') || text.includes('mhab') || text.includes('mis') || text.includes('mumo')) score += 4;
      if (text.includes('exposicao') || text.includes('mostra')) score += 4;
      if (text.includes('publico') || text.includes('participantes') || text.includes('visita')) score += 3;
      if (text.includes('oficina') || text.includes('atividade') || text.includes('mediacao')) score += 2;
      if (text.includes('registro') || text.includes('capa')) score += 1;
      return { photo, score };
    })
    .sort((a, b) => b.score - a.score);

  return rankedPhotos[0]?.photo || photos[0] || {};
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
        <div className="premium-cover-grid">
          <span>{fmtInt(contexto?.total_relatorios)} relatórios</span>
          <span>{fmtInt(contexto?.total_atividades)} atividades</span>
          <span>{fmtInt(contexto?.publico_total)} público</span>
          <span>{fmtInt(contexto?.programacao_total)} programações</span>
        </div>
      </div>
    </section>
  );
}
