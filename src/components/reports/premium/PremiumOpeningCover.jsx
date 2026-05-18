import React from 'react';
import { extractPhotos, fmtInt } from './premiumReportUtils';

export default function PremiumOpeningCover({ contexto, filtros = {} }) {
  const photos = extractPhotos(contexto, 1);
  const cover = photos[0] || {};
  const coverPhoto = cover.url;
  const periodo = contexto?.periodo_extenso || `${filtros.dateFrom || ''} a ${filtros.dateTo || ''}`;

  return (
    <section className="premium-cover">
      {coverPhoto ? <img src={coverPhoto} alt="Imagem de capa do relatorio Museus Centro" /> : <div className="premium-cover-fallback" />}
      <div className="premium-cover-overlay" />
      <div className="premium-cover-content">
        <p className="premium-cover-kicker">Viaduto das Artes / Museus Centro</p>
        <h1>Relatorio Institucional Premium</h1>
        <p className="premium-cover-period">{periodo}</p>
        {(cover.credito || cover.localizacao?.label) && (
          <p className="premium-cover-credit">
            {[cover.credito ? `Credito: ${cover.credito}` : '', cover.localizacao?.label ? `GPS: ${cover.localizacao.label}` : ''].filter(Boolean).join(' / ')}
          </p>
        )}
        <div className="premium-cover-grid">
          <span>{fmtInt(contexto?.total_relatorios)} relatorios</span>
          <span>{fmtInt(contexto?.total_atividades)} atividades</span>
          <span>{fmtInt(contexto?.publico_total)} publico</span>
          <span>{fmtInt(contexto?.programacao_total)} programacoes</span>
        </div>
      </div>
    </section>
  );
}
