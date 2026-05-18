import React from 'react';
import { extractPhotos } from './premiumReportUtils';

function PlaceholderImage({ label }) {
  return (
    <div className="premium-photo-placeholder">
      <span>{label}</span>
    </div>
  );
}

function PhotoCaption({ photo }) {
  return (
    <figcaption>
      <span>{[photo.museu, photo.mes].filter(Boolean).join(' / ') || 'Museus Centro'}</span>
      {photo.atividade ? `${photo.atividade}. ` : null}
      {photo.legenda}
      {photo.credito ? <small>Crédito: {photo.credito}</small> : null}
      {photo.localizacao?.label ? (
        <small>
          GPS: {photo.localizacao.mapUrl ? (
            <a href={photo.localizacao.mapUrl} target="_blank" rel="noreferrer">{photo.localizacao.label}</a>
          ) : photo.localizacao.label}
        </small>
      ) : null}
    </figcaption>
  );
}

function PhotoIndex({ photos }) {
  if (!photos.length) return null;

  return (
    <div className="premium-photo-index">
      {photos.map((photo, index) => (
        <article className="premium-photo-index-item" key={`${photo.link || photo.fileName}-${index}`}>
          <strong>{photo.mes || 'Período'}</strong>
          <span>{photo.atividade || 'Atividade vinculada ao app'}</span>
          <small>{photo.museu || 'Museus Centro'}</small>
          <small>{photo.fileName || 'Registro fotográfico'}</small>
          {photo.localizacao?.label ? <small>GPS: {photo.localizacao.label}</small> : <small>GPS: não informado</small>}
          {photo.credito ? <small>Crédito: {photo.credito}</small> : <small>Crédito: não informado</small>}
          {photo.link ? <a href={photo.link} target="_blank" rel="noreferrer">Abrir arquivo</a> : null}
        </article>
      ))}
    </div>
  );
}

export default function PremiumGallery({ contexto, limit = 36 }) {
  const photos = extractPhotos(contexto, limit);
  const hasPhotos = photos.length > 0;
  const galleryPhotos = hasPhotos ? photos : [
    { legenda: 'Galeria aguardando imagem vinculada no app.', museu: 'Museus Centro' },
    { legenda: 'Evidência visual pendente de curadoria.', museu: 'Museus Centro' },
    { legenda: 'Registro fotográfico a associar.', museu: 'Museus Centro' },
  ];

  return (
    <>
      <div className="premium-gallery">
        {galleryPhotos.map((photo, index) => (
          <figure className={`premium-photo premium-photo-${index % 5}`} key={photo.url || `${photo.legenda}-${index}`}>
            {photo.url ? (
              <img src={photo.url} alt={photo.legenda || 'Registro visual do Museus Centro'} loading="lazy" />
            ) : (
              <PlaceholderImage label={photo.museu || 'Museus Centro'} />
            )}
            <PhotoCaption photo={photo} />
          </figure>
        ))}
      </div>
      <PhotoIndex photos={photos} />
    </>
  );
}
