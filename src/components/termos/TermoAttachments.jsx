import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, Loader2, CheckCircle2, X, File, Download } from 'lucide-react';

export default function TermoAttachments({ attachments, onUpdate }) {
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);

  const handleFileUpload = async (type, file) => {
    if (!file) return;

    setLoading(prev => ({ ...prev, [type]: true }));
    setError(null);

    try {
      const response = await base44.functions.invoke('uploadWithDuplicateCheck', {
        file
      });

      const fileUrl = response.data?.file_url;
      if (!fileUrl) throw new Error('Erro ao fazer upload');

      onUpdate({
        ...attachments,
        [type]: {
          url: fileUrl,
          name: file.name,
          uploadedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      setError(`Erro ao anexar ${type}: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const removeAttachment = (type) => {
    const newAttachments = { ...attachments };
    delete newAttachments[type];
    onUpdate(newAttachments);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileUp className="w-5 h-5 text-green-600" />
          Anexos & Documentação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-100 text-red-800 rounded text-sm">
            {error}
          </div>
        )}

        {/* Nota Fiscal */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <label className="font-semibold text-slate-700">📄 Nota Fiscal</label>
            {attachments?.notaFiscal && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Anexada
              </span>
            )}
          </div>

          {!attachments?.notaFiscal ? (
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => handleFileUpload('notaFiscal', e.target.files?.[0])}
                  disabled={loading.notaFiscal}
                  className="hidden"
                />
                <Button
                  asChild
                  variant="outline"
                  className="w-full cursor-pointer"
                  disabled={loading.notaFiscal}
                >
                  <span>
                    {loading.notaFiscal ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4 mr-2" />
                        Selecionar Nota Fiscal
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-white p-3 rounded border border-green-200">
              <div className="flex items-center gap-2">
                <File className="w-4 h-4 text-green-600" />
                <div className="text-sm">
                  <p className="font-medium text-slate-700">{attachments.notaFiscal.name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(attachments.notaFiscal.uploadedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={attachments.notaFiscal.url} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeAttachment('notaFiscal')}
                >
                  <X className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            PDF, JPG ou PNG da nota fiscal emitida
          </p>
        </div>

        {/* Termo Assinado */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <label className="font-semibold text-slate-700">✍️ Termo Assinado</label>
            {attachments?.termoAssinado && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Anexado
              </span>
            )}
          </div>

          {!attachments?.termoAssinado ? (
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => handleFileUpload('termoAssinado', e.target.files?.[0])}
                  disabled={loading.termoAssinado}
                  className="hidden"
                />
                <Button
                  asChild
                  variant="outline"
                  className="w-full cursor-pointer"
                  disabled={loading.termoAssinado}
                >
                  <span>
                    {loading.termoAssinado ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4 mr-2" />
                        Selecionar Termo Assinado
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-white p-3 rounded border border-green-200">
              <div className="flex items-center gap-2">
                <File className="w-4 h-4 text-green-600" />
                <div className="text-sm">
                  <p className="font-medium text-slate-700">{attachments.termoAssinado.name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(attachments.termoAssinado.uploadedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={attachments.termoAssinado.url} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeAttachment('termoAssinado')}
                >
                  <X className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            PDF ou imagem do termo com assinaturas de ambas as partes
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
          <p className="font-semibold mb-1">💡 Dica:</p>
          <p>Após finalizar o termo, você poderá gerar o PDF, imprimir para assinatura e anexá-lo aqui para arquivo completo.</p>
        </div>
      </CardContent>
    </Card>
  );
}