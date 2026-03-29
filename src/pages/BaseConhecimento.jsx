import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const PROGRAMACAO_FILE_NAME = 'Planilha_de_programação_MC-VAR (1).xlsx';
const PROGRAMACAO_SOURCE_URL =
  'https://docs.google.com/spreadsheets/d/1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC/edit?usp=drive_link&ouid=114388859796899599894&rtpof=true&sd=true';

function inferCategoria(file) {
  const name = String(file?.name || '').toLowerCase();

  if (name.endsWith('.pdf')) return 'Relatório';
  if (name.endsWith('.doc') || name.endsWith('.docx')) return 'Manual';
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return 'Outro';

  return 'Outro';
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

      const uploadedFile = await base44.integrations.Core.UploadFile({ file });

      if (!uploadedFile?.file_url) {
        throw new Error('Falha ao enviar arquivo para o storage.');
      }

      const created = await base44.entities.KnowledgeDocument.create({
        titulo: file.name.replace(/\.[^/.]+$/, ''),
        categoria: inferCategoria(file),
        versao: new Date().toLocaleDateString('pt-BR'),
        descricao: `Arquivo adicionado em ${new Date().toLocaleDateString('pt-BR')}`,
        file_url: uploadedFile.file_url,
        file_name: file.name,
        conteudo_extraido: `Arquivo: ${file.name}`,
        ativo: true,
      });

      if (!created?.id) {
        throw new Error('Falha ao gravar registro no banco.');
      }

      if (file.name === PROGRAMACAO_FILE_NAME) {
        const syncResponse = await base44.functions.invoke('syncProgramacao', {
          source_url: PROGRAMACAO_SOURCE_URL,
          title: 'Programação espelhada',
          mode: 'history',
          debug: '1',
        });

        const syncData = syncResponse?.data || syncResponse || {};

        if (!syncData?.ok) {
          throw new Error(syncData?.error || 'Arquivo salvo, mas a sincronização da programação falhou.');
        }

        setMessage(
          `Arquivo gravado com sucesso: ${file.name}. Programação sincronizada. Itens: ${syncData.total_items || 0}.`
        );
      } else {
        setMessage(`Arquivo gravado com sucesso: ${file.name}`);
      }

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
