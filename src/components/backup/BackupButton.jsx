import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { HardDrive, Loader, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import SetupDriveDialog from './SetupDriveDialog';

export default function BackupButton({ userRole }) {
  const [showDialog, setShowDialog] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  const backupMutation = useMutation({
    mutationFn: () => base44.functions.invoke('backupToGoogleDrive'),
    onSuccess: (response) => {
      setBackupResult({
        success: true,
        data: response.data
      });
      toast.success('Backup realizado com sucesso!');
    },
    onError: (error) => {
      setBackupResult({
        success: false,
        error: error.message
      });
      toast.error(error.message || 'Erro ao realizar backup');
    }
  });



  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => {
            setBackupResult(null);
            setShowDialog(true);
          }}
          className="gap-2 bg-black hover:bg-gray-800 text-white text-sm md:text-base flex-1"
          disabled={backupMutation.isPending}
        >
          <HardDrive className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">{backupMutation.isPending ? 'Fazendo Backup...' : 'Fazer Backup'}</span>
          <span className="sm:hidden">{backupMutation.isPending ? 'Backup...' : 'Backup'}</span>
        </Button>
        {userRole === 'admin' && (
          <Button
            onClick={() => setShowSetup(true)}
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
          >
            <Settings className="w-4 h-4" /> Configurar
          </Button>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="w-[95%] rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">Backup para Google Drive</DialogTitle>
          </DialogHeader>

          {!backupResult ? (
            <div className="space-y-4">
              <p className="text-xs md:text-sm text-gray-600">
                Clique para iniciar o backup de todos os relatórios, atividades e anexos para o Google Drive.
              </p>
              <Button
                onClick={() => backupMutation.mutate()}
                disabled={backupMutation.isPending}
                className="w-full gap-2 bg-black hover:bg-gray-800 text-white text-sm md:text-base"
              >
                {backupMutation.isPending && <Loader className="w-4 h-4 animate-spin" />}
                {backupMutation.isPending ? 'Fazendo backup...' : 'Iniciar Backup'}
              </Button>
            </div>
          ) : backupResult.success ? (
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-start gap-3 p-3 md:p-4 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-green-900 text-sm md:text-base">Backup Concluído com Sucesso!</h3>
                  <p className="text-xs md:text-sm text-green-700 mt-1 break-words">
                    Data: {new Date(backupResult.data.timestamp).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 md:gap-3 text-center">
                <div className="p-2 md:p-3 bg-gray-50 rounded">
                  <p className="text-xl md:text-2xl font-semibold text-black">{backupResult.data.reportsCount}</p>
                  <p className="text-xs text-gray-600 mt-1">Relatórios</p>
                </div>
                <div className="p-2 md:p-3 bg-gray-50 rounded">
                  <p className="text-xl md:text-2xl font-semibold text-black">{backupResult.data.activitiesCount}</p>
                  <p className="text-xs text-gray-600 mt-1">Atividades</p>
                </div>
                <div className="p-2 md:p-3 bg-gray-50 rounded">
                  <p className="text-xl md:text-2xl font-semibold text-black">{backupResult.data.attachmentsCount}</p>
                  <p className="text-xs text-gray-600 mt-1">Anexos</p>
                </div>
              </div>

              <p className="text-xs text-gray-500 break-words">
                Os arquivos foram salvos em: <strong>Relatórios Backup / {new Date(backupResult.data.timestamp).toISOString().split('T')[0]}</strong>
              </p>

              <Button
                onClick={() => setShowDialog(false)}
                className="w-full bg-black hover:bg-gray-800 text-white text-sm md:text-base"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 md:p-4 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-red-900 text-sm md:text-base">Erro no Backup</h3>
                  <p className="text-xs md:text-sm text-red-700 mt-1 break-words">{backupResult.error}</p>
                </div>
              </div>

              <Button
                onClick={() => setBackupResult(null)}
                className="w-full bg-black hover:bg-gray-800 text-white text-sm md:text-base"
              >
                Tentar Novamente
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SetupDriveDialog 
        isOpen={showSetup} 
        onClose={() => setShowSetup(false)}
        onSuccess={() => {
          toast.success('Drive configurado! Inicie um backup.');
          setShowDialog(true);
        }}
      />
    </>
  );
}