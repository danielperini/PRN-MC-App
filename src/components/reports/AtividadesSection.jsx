import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AtividadesSection from '@/components/reports/AtividadesSection';
import { Button } from '@/components/ui/button';

export default function ReportEditor({ reportId }) {

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ================= LOAD ================= */

  useEffect(() => {
    async function load() {
      const r = await base44.entities.Report.get(reportId);

      // 🔥 FIX: garantir array
      r.atividades = r.atividades || [];

      setReport(r);
      setLoading(false);
    }

    load();
  }, [reportId]);

  /* ================= SAVE ================= */

  async function salvar() {
    if (!report) return;

    await base44.entities.Report.update(reportId, {
      ...report,

      // 🔥 FIX: garantir que não salva undefined
      atividades: report.atividades || [],
    });
  }

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="p-4 space-y-6">

      <h1 className="text-xl font-bold">Relatório</h1>

      {/* ATIVIDADES */}
      <AtividadesSection
        report={report}
        setReport={setReport}
      />

      <div className="flex justify-end">
        <Button onClick={salvar}>
          Salvar Relatório
        </Button>
      </div>

    </div>
  );
}
