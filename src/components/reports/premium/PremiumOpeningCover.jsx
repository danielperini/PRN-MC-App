import React from 'react';
import { extractPhotos, fmtInt, normalizeText } from './premiumReportUtils';

function pickCoverPhoto(contexto) {
  const photos = extractPhotos(contexto, 48);
  const peopleHints = ['público', 'publico', 'equipe', 'oficina', 'atividade', 'mediação', 'mediacao', 'participantes', 'libras', 'memórias', 'memorias', 'roda', 'formação', 'formacao'];
  return photos.find((photo) => {
    const text = normalizeText([photo.legenda, photo.atividade, photo.fileName].filter(Boolean).join(' '));
    return peopleHints.some((hint) => text.includes(normalizeText(hint)));
  }) || photos[0] || {};
}

export default function PremiumOpeningCover({ contexto, filtros = {} }) {
  const cover = pickCoverPhoto(contexto);
  const coverPhoto = cover.url;
  const periodo = contexto?.periodo_extenso || `${filtros.dateFrom || ''} a ${filtros.dateTo || ''}`;

  return (
    <section className="premium-cover">
      {coverPhoto ? <img src={coverPhoto} alt="Imagem de capa do relatório Museus Centro" /> : <div className="premium-cover-fallback" />}
      <div className="premium-cover-overlay" />
      <div className="premium-cover-content">
        <p className="premium-cover-kicker">Viaduto das Artes / Museus Centro</p>
        <h1>Relatório Institucional</h1>
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
