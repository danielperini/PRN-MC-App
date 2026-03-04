import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users, CheckCircle } from 'lucide-react';

export default function ComplianceStats({ currentMonth, currentYear }) {
  const { data: userPermissions = [] } = useQuery({
    queryKey: ['compliance-permissions'],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.UserPermission.list('-created_date', 500);
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ['compliance-reports', currentMonth, currentYear],
    queryFn: async () => {
      const data = await base44.entities.Report.list('-created_date', 500);
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: exemptions = [] } = useQuery({
    queryKey: ['compliance-exemptions', currentMonth, currentYear],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.ReportExemption.filter(
        { mes_referencia: currentMonth, ano: currentYear },
        '-created_date',
        500
      );
      return Array.isArray(data) ? data : [];
    },
  });

  const exemptedEmails = new Set(exemptions.map(e => e.user_email));
  const obligatedUsers = userPermissions.filter(
    p => p.must_submit_monthly_report && !exemptedEmails.has(p.user_email)
  );
  const submittedReports = allReports.filter(
    r => r.mes_referencia === currentMonth && r.ano === currentYear
  );
  const approvedReports = submittedReports.filter(r => r.status === 'APPROVED');

  const totalObligated = obligatedUsers.length;
  const totalSubmitted = submittedReports.length;
  const totalApproved = approvedReports.length;

  const percentSubmitted = totalObligated > 0 ? Math.round((totalSubmitted / totalObligated) * 100) : 0;
  const percentApproved = totalObligated > 0 ? Math.round((totalApproved / totalObligated) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
      <div className="p-5 rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between mb-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">Entregues</span>
        </div>
        <p className="text-2xl font-bold text-black">{percentSubmitted}%</p>
        <p className="text-xs text-gray-500 mt-1">{totalSubmitted} de {totalObligated} enviados</p>
      </div>

      <div className="p-5 rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between mb-2">
          <CheckCircle className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">Aprovados</span>
        </div>
        <p className="text-2xl font-bold text-black">{percentApproved}%</p>
        <p className="text-xs text-gray-500 mt-1">{totalApproved} de {totalObligated} aprovados</p>
      </div>

      <div className="p-5 rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between mb-2">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">Pendentes</span>
        </div>
        <p className="text-2xl font-bold text-black">{totalObligated - totalSubmitted}</p>
        <p className="text-xs text-gray-500 mt-1">ainda não enviados</p>
      </div>
    </div>
  );
}