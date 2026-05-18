import React from 'react';
import { extractPhotos } from './premiumReportUtils';

function PlaceholderImage({ label }) {
  return (
    <div className="premium-photo-placeholder">
      <span>{label}</span>
    </div>
  );
}

export default function PremiumGallery({ contexto, limit = 18 }) {
  const photos = extractPhotos(contexto, limit);
  const hasPhotos = photos.length > 0;

  return (
    <div className="premium-gallery">
      {(hasPhotos ? photos : [
        { legenda: 'Galeria aguardando imagem vinculada no app.', museu: 'Museus Centro' },
        { legenda: 'Evidencia visual pendente de curadoria.', museu: 'Museus Centro' },
        { legenda: 'Registro fotografico a associar.', museu: 'Museus Centro' },
      ]).map((photo, index) => (
        <figure className={`premium-photo premium-photo-${index % 5}`} key={photo.url || `${photo.legenda}-${index}`}>
          {photo.url ? (
            <img src={photo.url} alt={photo.legenda || 'Registro visual do Museus Centro'} loading="lazy" />
          ) : (
            <PlaceholderImage label={photo.museu || 'Museus Centro'} />
          )}
          <figcaption>
            <span>{photo.museu || 'Museus Centro'}</span>
            {photo.legenda}
            {photo.credito ? <small>Credito: {photo.credito}</small> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
