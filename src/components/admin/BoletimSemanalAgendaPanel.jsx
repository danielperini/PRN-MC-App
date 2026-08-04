import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Send, Trash2, Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CONFIG_FILTER = { categoria: 'agenda_digest', chave_config: 'destinatarios_boletim_semanal' };
const LAST_SEND_FILTER = { categoria: 'agenda_digest', chave_config: 'ultimo_envio_boletim_semanal' };

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export default function BoletimSemanalAgendaPanel() {
  const queryClient = useQueryClient();
  const [novoEmail, setNovoEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const { data: configRecord, isLoading } = useQuery({
    queryKey: ['agenda-digest-destinatarios'],
    queryFn: async () => {
      const res = await base44.entities.MetadadosConfig.filter(CONFIG_FILTER);
      return Array.isArray(res) && res.length > 0 ? res[0] : null;
    },
  });

  const { data: lastSendRecord } = useQuery({
    queryKey: ['agenda-digest-ultimo-envio'],
    queryFn: async () => {
      const res = await base44.entities.MetadadosConfig.filter(LAST_SEND_FILTER);
      return Array.isArray(res) && res.length > 0 ? res[0] : null;
    },
  });

  const emails = Array.isArray(configRecord?.config_json?.emails)
    ? configRecord.config_json.emails.map((e) => String(e || '').trim()).filter(Boolean)
    : [];

  const lastSend = lastSendRecord?.config_json || null;

  async function persistEmails(nextEmails) {
    const payload = {
      categoria: 'agenda_digest',
      chave_config: 'destinatarios_boletim_semanal',
      label: 'Destinatários do Boletim Semanal da Agenda',
      config_json: { emails: nextEmails },
      ativo: true,
    };
    if (configRecord?.id) {
      await base44.entities.MetadadosConfig.update(configRecord.id, payload);
    } else {
      await base44.entities.MetadadosConfig.create(payload);
    }
    await queryClient.invalidateQueries({ queryKey: ['agenda-digest-destinatarios'] });
  }

  async function handleAdd() {
    const email = String(novoEmail || '').trim();
    if (!isValidEmail(email)) {
      setFeedback({ type: 'error', message: 'E-mail inválido.' });
      return;
    }
    if (emails.map((e) => e.toLowerCase()).includes(email.toLowerCase())) {
      setFeedback({ type: 'error', message: 'E-mail já está na lista.' });
      return;
    }
    setAdding(true);
    setFeedback(null);
    try {
      await persistEmails([...emails, email]);
      setNovoEmail('');
      setFeedback({ type: 'success', message: 'Destinatário adicionado.' });
    } catch (e) {
      setFeedback({ type: 'error', message: e?.message || 'Erro ao adicionar.' });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(emailToRemove) {
    setRemovingId(emailToRemove);
    setFeedback(null);
    try {
      await persistEmails(emails.filter((e) => e !== emailToRemove));
      setFeedback({ type: 'success', message: 'Destinatário removido.' });
    } catch (e) {
      setFeedback({ type: 'error', message: e?.message || 'Erro ao remover.' });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    setFeedback(null);
    try {
      const res = await base44.functions.invoke('sendWeeklyAgendaDigest', {
        force: true,
        test_email: 'danielperini.mc@viadutordasartes.org.br',
      });
      const data = res?.data || {};
      if (data.skipped) {
        setFeedback({ type: 'warning', message: `Sem envio: ${data.reason || 'sem atividades'}` });
      } else if (data.enviados > 0) {
        setFeedback({ type: 'success', message: `Teste enviado para ${data.enviados} destinatário(s). ${data.total_atividades || 0} atividades na semana de ${data.week || ''}.` });
      } else {
        setFeedback({ type: 'error', message: 'Nenhum e-mail foi enviado.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', message: e?.message || 'Erro ao disparar teste.' });
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="border-2 border-green-500 rounded-lg p-6 bg-green-50">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-lg font-bold text-green-900 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Boletim Semanal da Agenda
        </h2>
        {lastSend?.data && (
          <span className="text-xs text-green-800 bg-green-100 border border-green-300 rounded-full px-3 py-1">
            Último envio automático: {new Date(lastSend.data).toLocaleString('pt-BR', { dateStyle: '2-digit', timeStyle: 'short' })}
            {typeof lastSend.enviados === 'number' ? ` · ${lastSend.enviados} e-mail(s)` : ''}
          </span>
        )}
      </div>
      <p className="text-sm text-green-800 mb-4">
        Dispara automaticamente toda <strong>segunda-feira às 08h00</strong> a programação da próxima semana
        (segunda a domingo) para os e-mails cadastrados abaixo. Sem atividades na semana = e-mail suprimido.
      </p>

      {/* Lista de destinatários */}
      <div className="bg-white border border-green-200 rounded-lg p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-3">Destinatários ({emails.length})</div>
        {isLoading ? (
          <div className="text-sm text-green-700">Carregando…</div>
        ) : emails.length === 0 ? (
          <div className="text-sm text-green-700 italic">Nenhum destinatário cadastrado. Adicione abaixo.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-2 bg-green-100 border border-green-300 text-green-900 text-sm rounded-full pl-3 pr-1.5 py-1"
              >
                {email}
                <button
                  type="button"
                  onClick={() => handleRemove(email)}
                  disabled={removingId === email}
                  className="text-green-700 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Remover ${email}`}
                >
                  {removingId === email ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Adicionar destinatário */}
      <div className="flex gap-2 mb-4">
        <Input
          type="email"
          placeholder="nome@instituicao.gov.br"
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !adding) handleAdd(); }}
          className="bg-white border-green-300"
        />
        <Button
          type="button"
          onClick={handleAdd}
          disabled={adding || !novoEmail.trim()}
          className="bg-green-700 hover:bg-green-800 text-white gap-2 flex-none"
        >
          {adding ? <RotateCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Adicionar
        </Button>
      </div>

      {/* Disparo de teste */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="outline"
          onClick={handleSendTest}
          disabled={sendingTest}
          className="border-green-600 text-green-800 hover:bg-green-100 gap-2"
        >
          {sendingTest ? <RotateCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar Teste Agora
        </Button>
        <span className="text-xs text-green-800">
          Envia para <code className="bg-green-100 px-1 rounded">danielperini.mc@viadutordasartes.org.br</code> com prefixo [TESTE].
        </span>
      </div>

      {feedback && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-green-100 border-green-400 text-green-900'
              : feedback.type === 'warning'
                ? 'bg-amber-50 border-amber-400 text-amber-900'
                : 'bg-red-50 border-red-400 text-red-900'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}