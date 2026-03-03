import React from 'react';
import { AlertCircle, CheckCircle, Clock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CompliancePanel({ allReports, allUsers }) {
  const currentMonth = new Date().toLocaleString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + new Date().toLocaleString('pt-BR', { month: 'long' }).slice(1);
  const currentYear = new Date().getFullYear();
  const today = new Date().getDate();
  const isDeadline = today <= 10;

  // Profissionais obrigados (com role PROFISSIONAL)
  const obligatoryUsers = allUsers.filter(u => u.role === 'PROFISSIONAL' || u.role === 'profissional') || [];
  
  // Relatórios do mês atual
  const thisMonthReports = allReports.filter(r => r.mes_referencia === currentMonth && r.ano === currentYear);
  
  // Status por profissional obrigado
  const obligatoryStatus = obligatoryUsers.map(user => {
    const report = thisMonthReports.find(r => r.created_by === user.email);
    const status = report?.status || null;
    
    return {
      user,
      report,
      status,
      hasSent: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'].includes(status),
      isApproved: status === 'APPROVED'
    };
  });

  const totalObligatory = obligatoryStatus.length;
  const submitted = obligatoryStatus.filter(s => s.hasSent).length;
  const approved = obligatoryStatus.filter(s => s.isApproved).length;
  const pending = totalObligatory - submitted;

  return (
    <div className="mb-8 space-y-4">
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-amber-900">📋 Conformidade de Relatórios</h2>
            <p className="text-sm text-amber-800 mt-1">
              {currentMonth} {currentYear} {isDeadline ? '- Prazo até dia 10' : '- Prazo encerrado'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-amber-100">
            <p className="text-2xl font-bold text-black">{totalObligatory}</p>
            <p className="text-xs text-gray-600 mt-1">Profissionais obrigados</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-blue-100">
            <p className="text-2xl font-bold text-blue-600">{submitted}</p>
            <p className="text-xs text-gray-600 mt-1">Relatórios enviados</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-green-100">
            <p className="text-2xl font-bold text-green-600">{approved}</p>
            <p className="text-xs text-gray-600 mt-1">Aprovados</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-red-100">
            <p className="text-2xl font-bold text-red-600">{pending}</p>
            <p className="text-xs text-gray-600 mt-1">Pendentes</p>
          </div>
        </div>

        {/* Lista de profissionais */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {obligatoryStatus.map(item => {
            const { user, hasSent, isApproved } = item;
            
            let badgeConfig = {
              icon: Clock,
              color: 'bg-gray-100 text-gray-700',
              label: 'Pendente'
            };
            
            if (isApproved) {
              badgeConfig = {
                icon: CheckCircle,
                color: 'bg-green-100 text-green-700',
                label: 'Aprovado'
              };
            } else if (hasSent) {
              badgeConfig = {
                icon: AlertCircle,
                color: 'bg-blue-100 text-blue-700',
                label: 'Enviado'
              };
            }

            const Icon = badgeConfig.icon;

            return (
              <div key={user.email} className="flex items-center justify-between p-3 bg-white border border-amber-100 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-black truncate">{user.full_name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <Badge className={`${badgeConfig.color} font-normal gap-1 flex-shrink-0`}>
                  <Icon className="w-3 h-3" />
                  {badgeConfig.label}
                </Badge>
              </div>
            );
          })}
        </div>

        {totalObligatory === 0 && (
          <div className="text-center py-6 text-gray-500 text-sm">
            Nenhum profissional obrigado cadastrado
          </div>
        )}
      </div>
    </div>
  );
}