import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const CAMPOS_OBRIGATORIOS = [
  { key: 'celular', label: 'Celular' },
  { key: 'endereco_residencial', label: 'Endereço Residencial' },
  { key: 'contato_emergencia_nome', label: 'Contato de Emergência (nome)' },
  { key: 'contato_emergencia_telefone', label: 'Contato de Emergência (telefone)' },
  { key: 'museu_vinculado', label: 'Museu Vinculado' },
  { key: 'contrato_num_parcelas', label: 'Nº de Parcelas do Contrato' },
  { key: 'contrato_valor_parcela', label: 'Valor de Cada Parcela' },
];

function getCamposFaltantes(member) {
  return CAMPOS_OBRIGATORIOS.filter(c => !member?.[c.key]).map(c => c.label);
}

export default function EnviarConviteCadastroModal({ open, onOpenChange, allUsers, teamMembers }) {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // Montar lista de usuários com cadastro incompleto
  const destinatarios = React.useMemo(() => {
    if (!allUsers?.length) return [];
    return allUsers
      .filter(u => {
        const role = (u.role || '').toUpperCase();
        if (role === 'PATROCINADOR' || role === 'OBSERVADOR') return false;
        const member = teamMembers?.find(m => m.user_email === u.email);
        const faltantes = getCamposFaltantes(member);
        return faltantes.length > 0;
      })
      .map(u => {
        const member = teamMembers?.find(m => m.user_email === u.email);
        return {
          email: u.email,
          nome: u.full_name || u.email,
          campos_faltantes: getCamposFaltantes(member),
        };
      });
  }, [allUsers, teamMembers]);

  const handleEnviar = async () => {
    if (destinatarios.length === 0) return;
    setEnviando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('notifyTeamCompletarCadastro', {
        destinatarios,
      });
      setResultado(res.data);
      if (res.data?.enviados > 0) {
        toast.success(`E-mails enviados: ${res.data.enviados}`);
      }
      if (res.data?.falhas > 0) {
        toast.warning(`${res.data.falhas} e-mail(s) falharam — verifique os detalhes`);
      }
    } catch (e) {
      toast.error('Erro ao enviar convites: ' + e.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleClose = () => {
    setResultado(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Enviar Convite de Cadastro Incompleto
          </DialogTitle>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4 py-2">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${resultado.falhas === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              {resultado.falhas === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              )}
              <div>
                <p className="font-semibold text-sm">{resultado.enviados} e-mail(s) enviado(s) com sucesso</p>
                {resultado.falhas > 0 && (
                  <p className="text-xs text-yellow-700 mt-0.5">
                    {resultado.falhas} falha(s) — usuários não registrados na plataforma não recebem e-mail
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              {resultado.results?.map(r => (
                <div key={r.email} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="text-foreground">{r.nome || r.email}</span>
                  {r.ok ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200">Enviado</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 border-red-200">Falhou</Badge>
                  )}
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={handleClose}>Fechar</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              {destinatarios.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="font-medium">Todos os cadastros estão completos!</p>
                  <p className="text-sm mt-1">Nenhum usuário precisa completar dados.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Os seguintes <strong>{destinatarios.length} usuário(s)</strong> receberão um e-mail com a lista de campos faltantes:
                  </p>
                  <div className="max-h-80 overflow-y-auto space-y-2 border rounded-lg divide-y">
                    {destinatarios.map(d => (
                      <div key={d.email} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{d.nome}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                          </div>
                          <Badge variant="outline" className="text-xs flex-shrink-0 text-amber-700 border-amber-300 bg-amber-50">
                            {d.campos_faltantes.length} campo(s)
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.campos_faltantes.map(c => (
                            <span key={c} className="text-xs bg-yellow-100 text-yellow-800 rounded px-1.5 py-0.5">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              {destinatarios.length > 0 && (
                <Button
                  className="bg-black hover:bg-gray-800 text-white"
                  onClick={handleEnviar}
                  disabled={enviando}
                >
                  {enviando ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Enviar {destinatarios.length} Convite(s)</>
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}