import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Cloud, FileText, Image, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function GoogleDriveImporter({ isOpen, onClose, onImportComplete }) {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [totalImport, setTotalImport] = useState(0);

  // Carregar arquivos do Drive ao abrir
  useEffect(() => {
    if (isOpen) {
      loadDriveFiles();
    }
  }, [isOpen]);

  const loadDriveFiles = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('importFromGoogleDrive', {
        action: 'list'
      });
      setFiles(response.data.files || []);
    } catch (error) {
      toast.error('Erro ao carregar arquivos do Drive: ' + error.message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  const getFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  };

  const toggleFile = (fileId) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const handleImport = async () => {
    if (selectedFiles.size === 0) {
      toast.error('Selecione pelo menos um arquivo');
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setTotalImport(selectedFiles.size);

    const filesToImport = files.filter(f => selectedFiles.has(f.id));
    let successCount = 0;

    for (const file of filesToImport) {
      try {
        await base44.functions.invoke('importFromGoogleDrive', {
          action: 'import',
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType
        });
        successCount++;
        setImportProgress(successCount);
      } catch (error) {
        toast.error(`Erro ao importar ${file.name}: ${error.message}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) importado(s) com sucesso!`);
      setSelectedFiles(new Set());
      setFiles([]);
      onImportComplete?.();
      onClose();
    }

    setImporting(false);
  };

  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-500" />
            Importar do Google Drive
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Carregando arquivos...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Busca */}
            <div>
              <Label className="text-sm font-medium">Buscar Arquivos</Label>
              <Input
                placeholder="Digite o nome do arquivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Lista de Arquivos */}
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {filteredFiles.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  {files.length === 0 ? 'Nenhum arquivo encontrado no Drive' : 'Nenhum arquivo corresponde à busca'}
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer transition"
                    onClick={() => toggleFile(file.id)}
                  >
                    <Checkbox
                      checked={selectedFiles.has(file.id)}
                      onChange={() => toggleFile(file.id)}
                      className="cursor-pointer"
                    />
                    <div className="flex-shrink-0">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{getFileSize(file.size)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Progresso de Importação */}
            {importing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Importando...</span>
                  <span className="text-gray-600">{importProgress} de {totalImport}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(importProgress / totalImport) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={importing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || selectedFiles.size === 0 || loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Importar ({selectedFiles.size})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}