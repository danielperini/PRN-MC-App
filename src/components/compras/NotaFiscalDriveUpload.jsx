import React, { useMemo, useState } from 'react';
import { uploadNotaFiscalToDrive } from '@/lib/uploadNotaFiscalToDrive';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NotaFiscalDriveUpload({
  purchase = null,
  onUploaded,
  webAppUrl = 'COLE_AQUI_A_URL_DO_SEU_GOOGLE_APPS_SCRIPT',
  token = 'COLE_AQUI_O_MESMO_TOKEN_DO_APPS_SCRIPT',
}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const dadosBase = useMemo(() => {
    const fornecedor =
      purchase?.supplier_name ||
      purchase?.fornecedor ||
      purchase?.vendor_name ||
      '';

    const valor =
      purchase?.valor_pago ||
      purchase?.valor_aprovado_admin ||
      purchase?.valor_solicitado ||
      purchase?.amount ||
      '';

    const dataReferencia =
      purchase?.data_pagamento ||
      purchase?.data_emissao_nf ||
      purchase?.created_date ||
      new Date().toISOString().slice(0, 10);

    return {
      fornecedor,
      valor: String(valor ?? ''),
      dataReferencia: String(dataReferencia).slice(0, 10),
    };
  }, [purchase]);

  function handleChange(e) {
    const nextFiles = Array.from(e.target.files || []);
    setFiles(nextFiles);
    setMessage('');
  }

  async function handleUpload() {
    try {
      if (!files.length) {
        setMessage('Selecione pelo menos um arquivo PDF ou XML.');
        return;
      }

      setUploading(true);
      setMessage('');

      const uploaded = [];

      for (const file of files) {
        const result = await uploadNotaFiscalToDrive(file, {
          webAppUrl,
          token,
          fornecedor: dadosBase.fornecedor,
          valor: dadosBase.valor,
          dataReferencia: dadosBase.dataReferencia,
        });

        uploaded.push({
          file_id: result.fileId,
          file_name: result.fileName,
          file_url: result.fileUrl,
          download_url: result.downloadUrl,
          folder_path: result.folderPath,
          mime_type: file.type || '',
          categoria: file.name.toLowerCase().endsWith('.xml') ? 'XML' : 'NF',
          original_name: file.name,
        });
      }

      setMessage(`${uploaded.length} arquivo(s) enviado(s) com sucesso.`);
      setFiles([]);

      if (typeof onUploaded === 'function') {
        onUploaded(uploaded);
      }
    } catch (error) {
      setMessage(error?.message || 'Erro ao enviar arquivos.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4 bg-white">
      <div className="space-y-1">
        <div className="text-sm font-medium">Enviar NF / XML para Google Drive</div>
        <div className="text-xs text-gray-500">
          Selecione PDF e XML. Os arquivos serão enviados ao Drive e o retorno terá URL e ID.
        </div>
      </div>

      <Input
        type="file"
        accept=".pdf,.xml,application/pdf,text/xml,application/xml"
        multiple
        onChange={handleChange}
        disabled={uploading}
      />

      {!!files.length && (
        <div className="text-xs text-gray-600 space-y-1">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`}>
              {file.name}
            </div>
          ))}
        </div>
      )}

      {message ? (
        <div className="text-xs text-gray-700">{message}</div>
      ) : null}

      <Button
        type="button"
        onClick={handleUpload}
        disabled={uploading || !files.length}
      >
        {uploading ? 'Enviando...' : 'Enviar para o Drive'}
      </Button>
    </div>
  );
}


