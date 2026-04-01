import React from 'react';
import { X, CheckCircle2, AlertCircle, Clock, Mail, FileText, CreditCard, RotateCcw, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const NOTIFICATION_ICONS = {
  REPORT_SUBMITTED: Mail,
  REPORT_APPROVED: CheckCircle2,
  REPORT_RETURNED: AlertCircle,
  REPORT_NEEDS_ATTENTION: Clock,
  USER_APPROVED: CheckCircle2,
  INVOICE_SUBMITTED: FileText,
  INVOICE_APPROVED: CheckCircle2,
  INVOICE_RETURNED: RotateCcw,
  PAYMENT_SUBMITTED: CreditCard,
  PAYMENT_APPROVED: CheckCircle2,
  PAYMENT_RETURNED: RotateCcw,
  PAYMENT_DONE: DollarSign,
};

const NOTIFICATION_COLORS = {
  REPORT_SUBMITTED: 'bg-blue-50 border-blue-100 text-blue-900',
  REPORT_APPROVED: 'bg-green-50 border-green-100 text-green-900',
  REPORT_RETURNED: 'bg-red-50 border-red-100 text-red-900',
  REPORT_NEEDS_ATTENTION: 'bg-amber-50 border-amber-100 text-amber-900',
  USER_APPROVED: 'bg-green-50 border-green-100 text-green-900',
  INVOICE_SUBMITTED: 'bg-indigo-50 border-indigo-100 text-indigo-900',
  INVOICE_APPROVED: 'bg-green-50 border-green-100 text-green-900',
  INVOICE_RETURNED: 'bg-orange-50 border-orange-100 text-orange-900',
  PAYMENT_SUBMITTED: 'bg-indigo-50 border-indigo-100 text-indigo-900',
  PAYMENT_APPROVED: 'bg-green-50 border-green-100 text-green-900',
  PAYMENT_RETURNED: 'bg-orange-50 border-orange-100 text-orange-900',
  PAYMENT_DONE: 'bg-emerald-50 border-emerald-100 text-emerald-900',
};

export default function NotificationPanel({ notifications, onClose, userEmail }) {
  const markAsRead = async (notifId) => {
    try {
      await base44.entities.Notification.update(notifId, { read: true });
    } catch (error) {
      toast.error('Erro ao marcar como lido');
    }
  };

  const deleteNotification = async (notifId) => {
    try {
      await base44.entities.Notification.delete(notifId);
    } catch (error) {
      toast.error('Erro ao deletar notificação');
    }
  };

  return (
    <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-200 rounded-2xl shadow-lg z-50">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-semibold text-black">Notificações</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Sem notificações no momento
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map(notif => {
              const Icon = NOTIFICATION_ICONS[notif.type] || Clock;
              const colorClass = NOTIFICATION_COLORS[notif.type] || 'bg-gray-50 border-gray-100 text-gray-900';

              return (
                <div
                  key={notif.id}
                  className={`p-4 border-l-4 ${
                    notif.read ? 'opacity-70 bg-gray-50' : 'bg-white border-l-blue-500'
                  } hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex gap-3">
                    <Icon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-black text-sm">{notif.title}</p>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notif.created_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {!notif.read && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => markAsRead(notif.id)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Ler
                        </button>
                        <button
                          onClick={() => deleteNotification(notif.id)}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}