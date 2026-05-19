import React from 'react';
import {
  extractPhotos,
  groupGalleryPhotosByMuseumMonthActivity,
  prepareInlineAndGalleryPhotos,
} from './premiumReportUtils';

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
          <small>{photo.legenda || photo.atividade || 'Registro vinculado à atividade'}</small>
          {photo.localizacao?.label ? <small>GPS: {photo.localizacao.label}</small> : null}
          {photo.credito ? <small>Crédito: {photo.credito}</small> : null}
          {photo.link ? <a href={photo.link} target="_blank" rel="noreferrer">Abrir arquivo</a> : null}
        </article>
      ))}
    </div>
  );
}

export default function PremiumGallery({ contexto, limit = 36 }) {
  const allPhotos = extractPhotos(contexto, limit);
  const { galleryPhotos } = prepareInlineAndGalleryPhotos(
    allPhotos,
    contexto?.selected_inline_photo_ids || []
  );
  const grouped = groupGalleryPhotosByMuseumMonthActivity(galleryPhotos);
  const photos = grouped.flatMap((museumGroup) =>
    museumGroup.months.flatMap((monthGroup) =>
      monthGroup.activities.flatMap((activityGroup) => activityGroup.photos)
    )
  );

  if (photos.length === 0) return null;

  return (
    <>
      <div className="premium-gallery">
        {photos.map((photo, index) => (
          <figure className={`premium-photo premium-photo-${index % 5}`} key={photo.url || photo.link || `${photo.legenda}-${index}`}>
            <img src={photo.url || photo.link} alt={photo.legenda || photo.atividade || 'Registro vinculado à atividade do relatório'} loading="lazy" />
            <PhotoCaption photo={photo} />
          </figure>
        ))}
      </div>
      {grouped.map((museumGroup) => (
        <section key={museumGroup.museu}>
          <h3>{museumGroup.museu}</h3>
          {museumGroup.months.map((monthGroup) => (
            <div key={`${museumGroup.museu}-${monthGroup.mes}`} className="mt-3">
              <p className="premium-card-meta">{monthGroup.mes}</p>
              {monthGroup.activities.map((activityGroup) => (
                <div key={`${monthGroup.mes}-${activityGroup.atividade}`} className="mt-2">
                  <strong>{activityGroup.atividade}</strong>
                  <PhotoIndex photos={activityGroup.photos} />
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
