import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ 
  isOpen, 
  title = 'Confirmar operação', 
  description = 'Tem certeza que deseja continuar?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const isDestructive = variant === 'destructive';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel?.()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {isDestructive && <AlertTriangle className="w-5 h-5 text-red-600" />}
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button 
            className={`${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-gray-800'} text-white`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processando...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}