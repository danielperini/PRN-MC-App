import React from 'react';
import AuditoriaNormalizacao3Aditivo from '@/components/rubricas/AuditoriaNormalizacao3Aditivo';

export default function AuditoriaRubricas3Aditivo() {
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Normalização de Rubricas — 3º Aditivo</h1>
        <p className="text-slate-500 text-sm mt-1">
          Auditoria, reclassificação e validação conforme o documento oficial. Total esperado: R$ 1.320.000,00
        </p>
      </div>
      <AuditoriaNormalizacao3Aditivo />
    </div>
  );
}