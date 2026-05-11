import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';

export default function ComplianceStats({ currentMonth, currentYear }) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString().split('T')[0];

  const { data: userPermissions = [], refetch: refetchPermissions } = useQuery({
    queryKey: ['compliance-permissions'],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.UserPermission.list('-created_date', 500);
      return Array.isArray(data) ? data : [];
    }
  });

  const { data: allReports = [], refetch: refetchReports } = useQuery({
    queryKey: ['compliance-reports-30days', thirtyDaysAgoISO],
    queryFn: async () => {
      const data = await base44.entities.Report.list('-updated_date', 500);
      return Array.isArray(data) ? data : [];
    }
  });

  const { data: exemptions = [], refetch: refetchExemptions } = useQuery({
    queryKey: ['compliance-exemptions', currentMonth, currentYear],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.ReportExemption.filter(
        { mes_referencia: currentMonth, ano: currentYear },
        '-created_date',
        500
      );
      return Array.isArray(data) ? data : [];
    }
  });

  React.useEffect(() => {
    const refreshCompliance = () => {
      refetchPermissions();
      refetchReports();
      refetchExemptions();
    };

    window.addEventListener('dashboard:update', refreshCompliance);

    return () => {
      window.removeEventListener('dashboard:update', refreshCompliance);
    };
  }, [refetchPermissions, refetchReports, refetchExemptions]);

  const exemptedEmails = new Set(exemptions.map((e) => e.user_email));

  const obligatedUsers = userPermissions.filter(
    (p) => p.must_submit_monthly_report && !exemptedEmails.has(p.user_email)
  );

  const submittedReports = allReports.filter((r) => {
    const reportDate = r.updated_date || r.created_date;
    const isIn30Days = reportDate >= thirtyDaysAgoISO;

    return (
      ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(r.status) &&
      isIn30Days
    );
  });

  const approvedReports = submittedReports.filter((r) => r.status === 'APPROVED');

  const totalObligated = obligatedUsers.length;
  const totalSubmitted = submittedReports.length;
  const totalApproved = approvedReports.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-8">
      <div className="p-5 rounded-xl border border-gray-100 bg-white hidden">
        <div className="flex items-center justify-between mb-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">
            Relatórios Enviados
          </span>
        </div>

        <p className="text-2xl font-bold text-black">{totalSubmitted}</p>

        <p className="text-xs text-gray-500 mt-1">
          de {totalObligated} mensais · {totalApproved} aprovados
        </p>
      </div>
    </div>
  );
}
