import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users, CheckCircle } from 'lucide-react';

export default function ComplianceStats({ currentMonth, currentYear }) {
  const { data: allUsers = [] } = useQuery({
    queryKey: ['compliance-users'],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.User.filter(
        { role: 'PROFISSIONAL' },
        '-created_date',
        500
      );
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
  const obligatedUsers = allUsers.filter(u => !exemptedEmails.has(u.email));
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="p-5 rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between mb-2">
          <Users className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">Esperados</span>
        </div>
        <p className="text-2xl font-bold text-black">{totalObligated}</p>
        <p className="text-xs text-gray-400 mt-1">profissionais obrigados</p>
      </div>

      <div className="p-5 rounded-xl border border-blue-100 bg-blue-50">
        <div className="flex items-center justify-between mb-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-medium text-gray-500">Entregues</span>
        </div>
        <p className="text-2xl font-bold text-blue-900">{percentSubmitted}%</p>
        <p className="text-xs text-blue-700 mt-1">{totalSubmitted} de {totalObligated} enviados</p>
      </div>

      <div className="p-5 rounded-xl border border-green-100 bg-green-50">
        <div className="flex items-center justify-between mb-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span className="text-sm font-medium text-gray-500">Aprovados</span>
        </div>
        <p className="text-2xl font-bold text-green-900">{percentApproved}%</p>
        <p className="text-xs text-green-700 mt-1">{totalApproved} de {totalObligated} aprovados</p>
      </div>

      <div className="p-5 rounded-xl border border-amber-100 bg-amber-50">
        <div className="flex items-center justify-between mb-2">
          <TrendingUp className="w-5 h-5 text-amber-400" />
          <span className="text-sm font-medium text-gray-500">Pendentes</span>
        </div>
        <p className="text-2xl font-bold text-amber-900">{totalObligated - totalSubmitted}</p>
        <p className="text-xs text-amber-700 mt-1">ainda não enviados</p>
      </div>
    </div>
  );
}