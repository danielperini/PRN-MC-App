import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { UPLOAD_CONFIG } from '@/lib/uploadConfig';

export default function FileSizeHelp({ variant = 'info', showIcon = true }) {
  if (variant === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
        {showIcon && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
        <div>
          <p className="text-sm font-medium text-red-900">Arquivo muito grande</p>
          <p className="text-sm text-red-700 mt-1">
            O limite máximo permitido é de <strong>{UPLOAD_CONFIG.MAX_SIZE_MB} MB</strong> por arquivo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
      {showIcon && <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />}
      <div>
        <p className="text-sm font-medium text-blue-900">Limite de tamanho de arquivo</p>
        <p className="text-sm text-blue-700 mt-1">
          Você pode enviar arquivos de até <strong>{UPLOAD_CONFIG.MAX_SIZE_MB} MB</strong>. 
          Se o arquivo for maior, comprima-o ou divida em múltiplos arquivos menores.
        </p>
      </div>
    </div>
  );
}