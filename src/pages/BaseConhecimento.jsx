import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw } from 'lucide-react';

const PROGRAMACAO_FILE_NAME = 'Planilha_de_programação_MC-VAR (1).xlsx';

function inferCategoria(file) {
  const name = String(file?.name || '').toLowerCase();

  if (name.endsWith('.pdf')) return 'Relatório';
  if (name.endsWith('.doc') || name.endsWith('.docx')) return 'Manual';
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return 'Outro';

  return 'Outro';
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch (_) {
    return String(value);
  }
}

function extractSyncErrors(syncResult) {
  const errors = syncResult?.programacao_sync?.errors;
  return Array.isArray(errors) ? errors : [];
}

function renderErrorText(err) {
  if (!err) return '';

  if (typeof err === 'string') return err;

  const nome = err?.nome ? `Nome: ${err.nome}` : '';
  const data = err?.data ? `Data: ${err.data}` : '';
  const museu = err?.museu ? `Museu: ${err.museu}` : '';
  const etapa = err?.etapa ? `Etapa: ${err.etapa}` : '';
  const error = err?.error ? `Erro: ${err.error}` : 'Erro: sem detalhe retornado';

  return [nome, data, museu, etapa, error].filter(Boolean).join(' | ');
}

export default function BaseConhecimento() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

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
          knowledge_document_id: created.id,
          file_name: file.name,
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

  async function sincronizarPlanilha() {
    try {
      setSyncing(true);
      setMessage('');
      setError('');
      setSyncResult(null);

      const res = await base44.functions.invoke('syncBaseConhecimento');
      const data = res?.data || res || {};

      setSyncResult(data);

      if (!data?.ok) {
        setError(data?.error || 'Erro na sincronização da planilha.');
        return;
      }

      const agora = new Date();
      setLastSync(agora);

      const totalItens = data?.total_items || 0;
      const totalErros = data?.programacao_sync?.errors?.length || 0;
      const criados = data?.programacao_sync?.created || 0;
      const atualizados = data?.programacao_sync?.updated || 0;

      if (totalErros > 0) {
        const primeiroErro = renderErrorText(extractSyncErrors(data)[0]);
        setMessage(
          `Sincronização concluída com alertas. ${totalItens} itens lidos, ${criados} criados, ${atualizados} atualizados e ${totalErros} erro(s).`
        );
        if (primeiroErro) {
          setError(`Primeiro erro da sincronização: ${primeiroErro}`);
        }
      } else {
        setMessage(`Planilha sincronizada com sucesso. ${totalItens} itens lidos.`);
      }
    } catch (err) {
      console.error('Erro ao sincronizar planilha:', err);
      setError(err?.message || 'Erro ao sincronizar planilha.');
    } finally {
      setSyncing(false);
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

  const syncErrors = useMemo(() => extractSyncErrors(syncResult), [syncResult]);
  const firstErrorText = useMemo(() => renderErrorText(syncErrors[0]), [syncErrors]);
  const visibleErrors = useMemo(() => syncErrors.slice(0, 3), [syncErrors]);

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
        <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div>Carregando...</div>
      ) : files.length === 0 ? (
        <div>Nenhum arquivo enviado.</div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => {
            const isPlanilha = f.file_name === PROGRAMACAO_FILE_NAME;

            return (
              <div
                key={f.id}
                className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${isPlanilha ? 'border-blue-200 bg-blue-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-all">
                    {f.file_name || f.titulo || 'Arquivo sem nome'}
                  </div>

                  <div className="text-sm text-gray-600">
                    {f.categoria || 'Sem categoria'}
                  </div>

                  {isPlanilha && (
                    <div className="text-xs text-blue-700 mt-1 space-y-1">
                      <div>🔄 Sincronização automática: 8h e 20h</div>

                      {lastSync ? (
                        <div>Última atualização manual: {lastSync.toLocaleString('pt-BR')}</div>
                      ) : f.updated_date ? (
                        <div>Última atualização: {formatDateTime(f.updated_date)}</div>
                      ) : null}

                      {syncResult && (
                        <div className="mt-2 space-y-1">
                          <div className="text-green-700">
                            ✅ {syncResult.total_items || 0} itens lidos da planilha ({syncResult.sheet_names?.length || 0} abas)
                          </div>

                          {syncResult.programacao_sync && (
                            <>
                              <div className="text-blue-700">
                                📥 {syncResult.programacao_sync.created || 0} novos registros criados
                              </div>

                              <div className="text-indigo-700">
                                ✏️ {syncResult.programacao_sync.updated || 0} registros atualizados
                              </div>

                              <div className="text-orange-700">
                                🗑️ {syncResult.programacao_sync.deleted || 0} registros removidos (não estavam mais na planilha)
                              </div>

                              {syncErrors.length > 0 && (
                                <div className="mt-2 p-2 rounded border border-red-200 bg-red-50 text-red-700 space-y-1">
                                  <div>
                                    ⚠️ {syncErrors.length} erro(s) durante a sincronização
                                  </div>

                                  {firstErrorText ? (
                                    <div className="text-[11px] break-words">
                                      <strong>Primeiro erro:</strong> {firstErrorText}
                                    </div>
                                  ) : null}

                                  {visibleErrors.length > 0 ? (
                                    <div className="text-[11px] space-y-1">
                                      {visibleErrors.map((item, index) => (
                                        <div key={`${item?.nome || 'erro'}-${index}`} className="break-words">
                                          {index + 1}. {renderErrorText(item)}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </>
                          )}

                          <div className="text-purple-700 text-xs">
                            🤖 Agenda salva na base de conhecimento do assistente IA
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isPlanilha && f.descricao ? (
                    <div className="text-sm text-gray-500 mt-1">
                      {f.descricao}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isPlanilha && (
                    <button
                      type="button"
                      onClick={sincronizarPlanilha}
                      disabled={syncing}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-300 bg-white text-blue-700 text-sm hover:bg-blue-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Sincronizando...' : 'Atualizar'}
                    </button>
                  )}

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
            );
          })}
        </div>
      )}
    </div>
  );
}
