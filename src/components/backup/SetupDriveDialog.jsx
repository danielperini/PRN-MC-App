import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SetupDriveDialog({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSetup = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('setupDriveStructure', {});
      setResult(response.data);
      toast.success('Estrutura de pastas criada com sucesso!');
      setTimeout(() => {
        onClose();
        onSuccess?.();
      }, 2000);
    } catch (error) {
      toast.error('Erro ao configurar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar Google Drive</DialogTitle>
          <DialogDescription>
            Organizar pastas para backup automático de dados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-900">
              Esta ação criará as seguintes subpastas na sua pasta do Google Drive:
            </AlertDescription>
          </Alert>

          <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">📄</span>
              <span><strong>Relatórios em PDF</strong> - Sincronizar relatórios mensais</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">💰</span>
              <span><strong>Financeiro</strong> - Dados de backup geral</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <span><strong>Notas Fiscais</strong> - Notas fiscais de equipe</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📸</span>
              <span><strong>Fotos</strong> - Imagens de atividades</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📑</span>
              <span><strong>Documentos</strong> - Documentos gerais</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📜</span>
              <span><strong>Contratos</strong> - Contratos de membros</span>
            </div>
          </div>

          {result && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm text-green-900">
                ✓ Estrutura configurada com sucesso!
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSetup} 
              className="bg-black hover:bg-gray-800"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Configurando...
                </>
              ) : (
                'Criar Estrutura'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}