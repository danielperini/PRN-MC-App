import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { toastMessages } from '@/lib/toastMessages';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription
} from '@/components/ui/alert-dialog';

export default function ComunicadosPanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const handleConfirm = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke('notifyListaPresencaObrigatoriedade', {});
      const data = res?.data || res;
      toastMessages.success(`Aviso enviado para ${data?.enviados || 0} destinatário(s).`);
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao enviar aviso.');
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="border-2 border-black rounded-lg p-6 bg-white">
      <h2 className="text-lg font-bold text-black mb-4">Comunicados e Notificações</h2>
      <p className="text-sm text-gray-700 mb-6">
        Envie um comunicado único para todos os educadores e produtores ativos informando a nova
        obrigatoriedade de anexar lista de presença e inscritos nas oficinas.
      </p>

      <Button
        variant="outline"
        onClick={() => setConfirmOpen(true)}
        disabled={sending}
        className="gap-2"
      >
        <Bell className="w-4 h-4" />
        {sending ? 'Enviando...' : 'Enviar aviso: lista de presença em oficinas'}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar aviso de lista de presença?</AlertDialogTitle>
            <AlertDialogDescription>
              Este e-mail será enviado a todos os educadores e produtores ativos cadastrados no sistema,
              informando sobre a nova obrigatoriedade de anexar lista de presença e inscritos nas oficinas.
              Envios já feitos hoje para o mesmo destinatário não serão duplicados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={sending}>
              {sending ? 'Enviando...' : 'Confirmar envio'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}