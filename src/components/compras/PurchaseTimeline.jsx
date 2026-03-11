import React from 'react';
import { CheckCircle2, Circle, XCircle, Clock, Send, ShieldCheck, DollarSign } from 'lucide-react';

const STEPS = [
  { key: 'RASCUNHO',         label: 'Rascunho',          icon: Clock },
  { key: 'SOLICITADO',       label: 'Enviado',            icon: Send },
  { key: 'APROVADO_COORD',   label: 'Aprovado Coord.',    icon: ShieldCheck },
  { key: 'APROVADO_ADMIN',   label: 'Aprovado Admin',     icon: ShieldCheck },
  { key: 'PAGO',             label: 'Pago',               icon: DollarSign },
];

const REJECT_STATUSES = ['RECUSADO', 'CANCELADO'];

export default function PurchaseTimeline({ purchase }) {
  const currentStatus = purchase.status;
  const isRejected = REJECT_STATUSES.includes(currentStatus);

  const currentIdx = STEPS.findIndex(s => s.key === currentStatus);
  const activeIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="py-2">
      {isRejected ? (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Solicitação Recusada</p>
            {(purchase.aprov_coord_comentario || purchase.aprov_admin_comentario) && (
              <p className="text-xs text-red-600 mt-0.5">
                {purchase.aprov_admin_comentario || purchase.aprov_coord_comentario}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => {
            const done = idx < activeIdx;
            const active = idx === activeIdx;
            const Icon = step.icon;

            return (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all
                    ${done  ? 'bg-black border-black text-white'
                    : active ? 'bg-white border-black text-black'
                    : 'bg-white border-gray-200 text-gray-300'}`}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight max-w-[60px]
                    ${done || active ? 'text-black' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 ${done ? 'bg-black' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Metadados de aprovação */}
      {(purchase.aprov_coord_nome || purchase.aprov_admin_nome) && !isRejected && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {purchase.aprov_coord_nome && (
            <div className="text-xs bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-400 block">Coord. Geral</span>
              <span className="font-medium text-gray-700">{purchase.aprov_coord_nome}</span>
              {purchase.aprov_coord_data && <span className="text-gray-400 ml-1">— {purchase.aprov_coord_data}</span>}
              {purchase.aprov_coord_comentario && <p className="text-gray-500 mt-0.5 italic">"{purchase.aprov_coord_comentario}"</p>}
            </div>
          )}
          {purchase.aprov_admin_nome && (
            <div className="text-xs bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-400 block">Coord. Admin</span>
              <span className="font-medium text-gray-700">{purchase.aprov_admin_nome}</span>
              {purchase.aprov_admin_data && <span className="text-gray-400 ml-1">— {purchase.aprov_admin_data}</span>}
              {purchase.aprov_admin_comentario && <p className="text-gray-500 mt-0.5 italic">"{purchase.aprov_admin_comentario}"</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}