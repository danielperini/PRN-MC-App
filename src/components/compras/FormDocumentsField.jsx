import React from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function FormDocumentsField({
  documents = [],
  onDocumentsChange,
  type = 'arquivo',
  label = 'Arquivos'
}) {
  const [uploading, setUploading] = React.useState(false);

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    setUploading(true);
    try {
      const uploaded = [];

      for (const file of selectedFiles) {
        const res = await base44.integrations.Core.UploadFile({ file });

        uploaded.push({
          name: file.name,
          url: res.file_url,
          size: file.size,
          mime_type: file.type,
          type,
        });
      }

      onDocumentsChange?.([...(documents || []), ...uploaded]);
      toast.success(`${uploaded.length} arquivo(s) enviado(s)`);
    } catch (e) {
      toast.error('Erro ao enviar arquivo: ' + e.message);
    }
    setUploading(false);
  };

  const removeFile = (index) => {
    const next = [...(documents || [])];
    next.splice(index, 1);
    onDocumentsChange?.(next);
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed rounded-xl p-4 text-center">
        <Input type="file" multiple onChange={handleFileChange} />
        <p className="text-xs text-gray-500 mt-2">
          Anexe um ou mais arquivos para {label.toLowerCase()}
        </p>
      </div>

      {uploading && (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Enviando arquivos...
        </div>
      )}

      {(documents || []).length > 0 && (
        <div className="space-y-2">
          {(documents || []).map((doc, index) => (
            <div
              key={`${doc.url || doc.name}-${index}`}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-gray-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-gray-500">
                    {doc.size ? `${(doc.size / 1024 / 1024).toFixed(2)} MB` : 'Arquivo enviado'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    Ver
                  </a>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
