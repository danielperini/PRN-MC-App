import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BaseConhecimento() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      setError('');

      const data = await base44.entities.KnowledgeDocument.list('-created_date', 200);
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar documentos:', err);
      setFiles([]);
      setError('Erro ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setMessage('');
      setError('');

      const contentBase64 = await fileToBase64(file);

      const response = await base44.functions.invoke('processDocumentUpload', {
        file_name: file.name,
        content_base64: contentBase64,
        titulo: file.name.replace(/\.[^/.]+$/, ''),
        descricao: '',
        versao: '',
      });

      const data = response?.data || response || {};

      if (!data?.ok || !data?.saved) {
        throw new Error(data?.error || 'Falha ao gravar arquivo.');
      }

      setMessage(`Arquivo gravado com sucesso: ${file.name}`);
      await carregar();
    } catch (err) {
      console.error('Erro upload:', err);
      setError(err?.message || 'Erro ao enviar arquivo.');
    } finally {
      e.target.value = '';
      setUploading(false);
    }
  }

  async function remover(id) {
    try {
      setError('');
      setMessage('');

      await base44.entities.KnowledgeDocument.delete(id);
      await carregar();
    } catch (err) {
      console.error('Erro ao remover:', err);
      setError('Erro ao remover arquivo.');
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
        <p className="text-sm text-gray-600">
          Os arquivos enviados são gravados no storage e registrados na entity KnowledgeDocument.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center px-4 py-2 rounded-lg border cursor-pointer">
          <span>{uploading ? 'Enviando...' : 'Adicionar arquivo'}</span>
          <input
            type="file"
            className="hidden"
            onChange={upload}
            disabled={uploading}
          />
        </label>

        <button
          type="button"
          onClick={carregar}
          className="px-4 py-2 rounded-lg border"
          disabled={loading || uploading}
        >
          Atualizar
        </button>
      </div>

      {message ? (
        <div className="p-3 rounded-lg border border-green-300 bg-green-50 text-green-800">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div>Carregando...</div>
      ) : files.length === 0 ? (
        <div>Nenhum arquivo enviado.</div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-4 p-3 rounded-lg border"
            >
              <div className="min-w-0">
                <div className="font-medium break-all">
                  {f.file_name || f.titulo || 'Arquivo sem nome'}
                </div>
                <div className="text-sm text-gray-600">
                  {f.categoria || 'Sem categoria'}
                </div>
                {f.descricao ? (
                  <div className="text-sm text-gray-500 mt-1">
                    {f.descricao}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {f.file_url ? (
                  <a
                    href={f.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg border"
                  >
                    Abrir
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => remover(f.id)}
                  className="px-3 py-2 rounded-lg border"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
