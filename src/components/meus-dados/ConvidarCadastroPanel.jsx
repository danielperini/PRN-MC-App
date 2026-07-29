import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';

const CAMPOS_OBRIGATORIOS = [
  { key: 'celular', label: 'Celular' },
  { key: 'endereco_residencial', label: 'Endereço' },
  { key: 'contato_emergencia_nome', label: 'Contato emergência' },
  { key: 'museu_vinculado', label: 'Museu vinculado' },
  { key: 'contrato_num_parcelas', label: 'Nº parcelas' },
  { key: 'contrato_valor_parcela', label: 'Valor parcela' },
  { key: 'pix_key', label: 'Chave PIX' },
  { key: 'cpf', label: 'CPF' },
  { key: 'banco', label: 'Banco' },
];

function camposFaltantes(member) {
  return CAMPOS_OBRIGATORIOS.filter(c => !member?.[c.key]).map(c => c.label);
}

export default function ConvidarCadastroPanel({ allUsers, teamData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendentes, setPendentes] = useState(null);
  const [resultado, setResultado] = useState(null);

  const handleAnalysar = async () => {
    setLoading(true);
    try {
      const filtered = allUsers.filter(u =>
        u.role !== 'PATROCINADOR' && u.role !== 'OBSERVADOR'
      );
      const lista = filtered.map(u => {
        const member = teamData.find(m => m.user_email === u.email);
        const faltantes = camposFaltantes(member);
        return { ...u, faltantes };
      }).filter(u => u.faltantes.length > 0);
      setPendentes(lista);
    } finally {
      setLoading(false);
    }
  };

  const handleEnviar = async () => {
    if (!pendentes?.length) return;
    setSending(true);
    try {
      const res = await base44.functions.invoke('notifyTeamCompletarCadastro', {
        usuarios: pendentes.map(u => ({
          email: u.email,
          nome: u.full_name,
          campos_faltantes: u.faltantes,
        })),
      });
      const data = res?.data || {};
      setResultado(data);
      toast.success(`E-mails enviados para ${data.enviados || pendentes.length} profissional(is)!`);
    } catch (e) {
      toast.error('Erro ao enviar e-mails: ' + (e?.message || 'tente novamente'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setOpen(v => !v);
          if (!open && !pendentes) handleAnalysar();
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-semibold text-slate-800">Ações Administrativas — Convidar Equipe</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4 bg-white">
          <p className="text-sm text-slate-600">
            Envie um e-mail único para todos os membros com cadastro incompleto, convidando-os a completar suas informações e fazer upload do contrato assinado.
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verificando cadastros...
            </div>
          )}

          {resultado && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              E-mails enviados com sucesso para {resultado.enviados} profissional(is). {resultado.erros > 0 && `${resultado.erros} com erro.`}
            </div>
          )}

          {pendentes && !resultado && (
            <>
              {pendentes.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Todos os membros têm cadastro completo!
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span><strong>{pendentes.length}</strong> membro(s) com cadastro incompleto</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {pendentes.map(u => (
                      <div key={u.email} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{u.full_name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                          <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                            {u.faltantes.slice(0, 4).map(f => (
                              <Badge key={f} className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{f}</Badge>
                            ))}
                            {u.faltantes.length > 4 && (
                              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">+{u.faltantes.length - 4}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      onClick={handleEnviar}
                      disabled={sending}
                      className="bg-black hover:bg-gray-800 text-white text-sm"
                    >
                      {sending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</>
                        : <><Mail className="w-4 h-4 mr-2" />Enviar e-mail para {pendentes.length} membro(s)</>}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleAnalysar} disabled={loading} className="text-sm">
                      Atualizar lista
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {!pendentes && !loading && (
            <Button type="button" variant="outline" onClick={handleAnalysar} className="text-sm">
              Verificar cadastros incompletos
            </Button>
          )}
        </div>
      )}
    </div>
  );
}