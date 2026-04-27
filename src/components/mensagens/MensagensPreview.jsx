import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Send, Loader2, Users, Mail, BellRing } from 'lucide-react';

export default function MensagensPreview({ form, destinatarios, onBack, onConfirm, loading }) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Button>
        <h2 className="text-lg font-semibold text-slate-800">Pré-visualização da mensagem</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Resumo */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Resumo</h3>

            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Destinatários</p>
                <p className="text-sm font-semibold text-slate-900">{destinatarios.length} pessoa(s)</p>
              </div>
            </div>

            {form.enviar_email && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-xs text-slate-500">Canal</p>
                  <p className="text-sm font-semibold text-slate-900">E-mail</p>
                </div>
              </div>
            )}

            {form.exibir_banner && (
              <div className="flex items-center gap-3">
                <BellRing className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs text-slate-500">Aviso no sistema</p>
                  <p className="text-sm font-semibold text-slate-900">
                    Ativo {form.data_expiracao ? `até ${form.data_expiracao}` : '(sem expiração)'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Lista de destinatários */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Lista de destinatários</h3>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {destinatarios.map((email) => (
                <p key={email} className="text-xs text-slate-600 py-1 border-b border-slate-50 last:border-0">{email}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Preview da mensagem */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Assunto</p>
            <p className="text-base font-semibold text-slate-800 mt-1">{form.assunto}</p>
          </div>
          <div className="h-px bg-slate-100" />
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Corpo</p>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-4 min-h-32">
              {form.corpo}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmação */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
          />
          <span className="text-sm text-amber-800 font-medium">
            Confirmo o envio desta mensagem para os {destinatarios.length} destinatário(s) selecionado(s).
          </span>
        </label>

        <Button
          onClick={onConfirm}
          disabled={!confirmed || loading}
          className="bg-slate-900 hover:bg-slate-700 text-white gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar mensagem
        </Button>
      </div>
    </div>
  );
}