// 🔥 APENAS TRECHOS ALTERADOS (resto mantém igual)

const [form, setForm] = useState({
  ...
  oportunidades_resumo: '',
  ...
});

useEffect(() => {
  if (!report?.id) return;
  if (lastLoadedReportIdRef.current === report.id) return;

  setForm((prev) => ({
    ...prev,
    ...report,

    resumo_periodo: report?.resumo_periodo ?? '',

    // 🔥 CORREÇÃO AQUI (LER DOS DOIS CAMPOS)
    oportunidades_resumo:
      report?.oportunidades_resumo ??
      report?.oportunidades ??
      '',

    ...
  }));

  lastLoadedReportIdRef.current = report.id;
}, [report]);

function buildPayload(nextStatus) {
  return {
    ...form,

    ...(nextStatus ? { status: nextStatus } : {}),

    resumo_periodo: form?.resumo_periodo ?? '',

    // 🔥 CORREÇÃO CRÍTICA (SALVAR NO CAMPO CERTO)
    oportunidades: form?.oportunidades_resumo ?? '',

    // opcional: manter também (compatibilidade futura)
    oportunidades_resumo: form?.oportunidades_resumo ?? '',

    comentarios_coordenacao: form?.comentarios_coordenacao ?? '',
    comentarios_gerais: form?.comentarios_gerais ?? '',
    avaliacao_pontos_positivos: form?.avaliacao_pontos_positivos ?? '',
    avaliacao_desafios: form?.avaliacao_desafios ?? '',
    avaliacao_sugestoes: form?.avaliacao_sugestoes ?? '',

    ...
  };
}
