function captionFor(item = {}, activity = null) {
  const manual = item.legenda || item.caption || item.titulo || item.title || '';

  // 🔥 REGRA FIXA — EXPOSIÇÃO MIS
  if (
    String(manual).toLowerCase().includes('entrevista') &&
    (
      String(activity?.museu || '').toUpperCase().includes('MIS') ||
      String(activity?.local || '').toUpperCase().includes('MIS')
    )
  ) {
    return `Exposição do Traço ao Pixel · MIS · ${formatDateBR(activity?.date)}`;
  }

  if (manual) return String(manual);

  if (activity?.title) {
    return [
      activity.title,
      activity.local || activity.museu || '',
      formatDateBR(activity.date)
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return String(
    item.descricao ||
    item.description ||
    item.file_name ||
    item.fileName ||
    'Foto da galeria'
  );
}
