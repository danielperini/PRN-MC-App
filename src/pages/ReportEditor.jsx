// 🔥 ALTERAÇÃO PRINCIPAL: carregar TODAS as atividades (sem limite)
const { data: activitiesFromDB = [], isLoading: isActivitiesLoading } = useQuery({
  queryKey: ['activities', reportId],
  queryFn: async () => {
    if (!reportId) return [];

    let all = [];
    let page = 0;
    const limit = 200;

    while (true) {
      const batch = await base44.entities.Activity.filter(
        { report_id: reportId },
        '-updated_date',
        limit,
        page * limit
      );

      if (!batch || batch.length === 0) break;

      all = all.concat(batch);

      if (batch.length < limit) break;

      page++;
    }

    return all;
  },
  enabled: !!reportId,
  staleTime: 30000
});
