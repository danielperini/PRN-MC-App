import React from 'react';
import { Card } from '@/components/ui/card';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';

export default function PurchaseStatusNotification({ status }) {
  const configs = {
    RASCUNHO: {
      icon: Clock,
      title: 'Rascunho',
      description: 'Esta solicitação está em rascunho. Complete o preenchimento para enviar.',
      color: 'bg-gray-50 border-gray-200 text-gray-700',
      iconColor: 'text-gray-500',
    },
    PENDENTE: {
      icon: AlertCircle,
      title: 'Pendente de Revisão',
      description: 'Sua solicitação foi enviada e aguarda revisão do coordenador.',
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      iconColor: 'text-amber-600',
    },
    APROVADO: {
      icon: CheckCircle,
      title: 'Aprovada',
      description: 'Excelente! Sua solicitação foi aprovada. Aguarde o prosseguimento.',
      color: 'bg-green-50 border-green-200 text-green-700',
      iconColor: 'text-green-600',
    },
    REJEITADO: {
      icon: AlertCircle,
      title: 'Rejeitada',
      description: 'Sua solicitação foi rejeitada. Entre em contato com o coordenador para mais informações.',
      color: 'bg-red-50 border-red-200 text-red-700',
      iconColor: 'text-red-600',
    },
  };

  const config = configs[status];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <Card className={`p-4 border ${config.color} flex items-start gap-3`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <div>
        <p className="font-semibold text-sm">{config.title}</p>
        <p className="text-xs mt-1 opacity-80">{config.description}</p>
      </div>
    </Card>
  );
}