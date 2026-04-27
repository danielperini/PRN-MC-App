import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, FileText, Send } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600' },
  enviado: { label: 'Enviado', color: 'bg-green-100 text-green-700' },
  erro: { label: 'Erro', color: 'bg-red-100 text-red-600' },
  expirado: { label: 'Expirado', color: 'bg-amber-100 text-amber-600' },
};

export default function MensagensHistorico() {
  const [mensagens, setMensagens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.SystemMessage.list('-created_date', 50).then((data) => {
      setMensagens(data || []);
    }).catch(() => setMensagens([])).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  if (mensagens.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Send className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nenhuma mensagem enviada ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mensagens.map((msg) => {
        const status = STATUS_CONFIG[msg.status] || STATUS_CONFIG.rascunho;
        return (
          <div key={msg.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{msg.titulo}</p>
                <p className="text-xs text-slate-400 truncate">{msg.assunto}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${status.color}`}>
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {msg.total_destinatarios > 0 && (
                <span>{msg.total_destinatarios} destinatário(s)</span>
              )}
              {msg.enviado_em && (
                <span>
                  Enviado em {format(new Date(msg.enviado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              )}
              {msg.remetente_nome && (
                <span>por {msg.remetente_nome}</span>
              )}
            </div>
            {msg.erro_detalhe && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {msg.erro_detalhe}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}