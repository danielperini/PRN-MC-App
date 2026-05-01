import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

/**
 * Delete Account Dialog with confirmation
 * Requires user to type their email for confirmation
 */
export default function DeleteAccountDialog({ userEmail, open, onOpenChange }) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmEmail !== userEmail) {
      toast.error('Email não corresponde');
      return;
    }

    setIsDeleting(true);
    try {
      await base44.functions.invoke('deleteUserAccount', { email: userEmail });
      toast.success('Conta deletada com sucesso');
      setTimeout(() => {
        base44.auth.logout('/');
      }, 1500);
    } catch (error) {
      toast.error('Erro ao deletar conta');
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <AlertDialogTitle>Deletar Conta</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base space-y-3">
            <p>
              Esta ação é <strong>permanente e irreversível</strong>. Todos os seus dados serão deletados.
            </p>
            <p>Para confirmar, digite seu email:</p>
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={userEmail}
              className="mt-2"
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-2 justify-end">
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={confirmEmail !== userEmail || isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deletando...
              </>
            ) : (
              'Deletar Permanentemente'
            )}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}