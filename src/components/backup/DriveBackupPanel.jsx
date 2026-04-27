import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, RefreshCw, Trash2, CheckCircle, AlertCircle,
  Clock, HardDrive, ShieldCheck, Play
} from 'lucide-react';
import { toast } from 'sonner';

export default function DriveBackupPanel({ currentUser }) {
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});

  const isAdmin = ['admin', 'ADMIN'].includes(currentUser?.role);

  async function runAction(key, fnName, payload = {}) {
    setLoading(prev => ({ ...prev, [key]: true }));
    setResults(prev => ({ ...prev, [key]: null }));
    try {
      const res = await base44.functions.invoke(fnName, payload);
      setResults(prev => ({ ...prev, [key]: { ok: true, data: res.data } }));
      toast.success(`${key} concluído`);
    } catch (e) {
      setResults(prev => ({ ...prev, [key]: { ok: false, error: e?.message || String(e) } }));
      toast.error(`Erro: ${e?.message || String(e)}`);
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  const panels = [
    {
      key: 'estrutura',
      title: 'Criar/Verificar Estrutura de Pastas',
      description: 'Cria as 9 pastas tipadas na raiz do Drive (01_Notas_Fiscais, 02_Comprovantes, etc.)',
      icon: FolderOpen,
      color: 'blue',
      fn: 'setupDriveStructure',
      payload: {},
      adminOnly: true,
    },
    {
      key: 'dedup_sim',
      title: 'Verificar Duplicados (Simulação)',
      description: 'Analisa o Drive em modo seguro (dry_run=true). Nenhum arquivo é movido.',
      icon: ShieldCheck,
      color: 'yellow',
      fn: 'deduplicateDriveFolder',
      payload: { dry_run: true },
      adminOnly: true,
    },
    {
      key: 'dedup_real',
      title: 'Limpeza Real de Duplicados',
      description: 'Move arquivos duplicados para 09_Lixeira_Controlada. Irreversível — execute após simulação.',
      icon: Trash2,
      color: 'red',
      fn: 'deduplicateDriveFolder',
      payload: { dry_run: false },
      adminOnly: true,
      danger: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-gray-700" />
          <h2 className="text-base font-semibold text-black">Gestão de Backup no Drive</h2>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 text-sm text-blue-900">
          <strong>Pasta raiz:</strong>{' '}
          <a
            href="https://drive.google.com/drive/folders/1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Abrir no Drive
          </a>
          <br />
          <span className="text-xs text-blue-700 mt-1 block">
            Backups automáticos ocorrem apenas quando arquivos são criados, atualizados ou excluídos.
          </span>
        </div>

        <div className="space-y-4">
          {panels.map(panel => {
            const Icon = panel.icon;
            const res = results[panel.key];
            const isLoading = loading[panel.key];
            const disabled = !isAdmin && panel.adminOnly;

            return (
              <div
                key={panel.key}
                className={`border rounded-lg p-4 ${panel.danger ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      panel.danger ? 'text-red-500' :
                      panel.color === 'yellow' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`} />
                    <div>
                      <p className="font-medium text-sm text-black">{panel.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{panel.description}</p>
                      {disabled && (
                        <p className="text-xs text-red-500 mt-1">Requer permissão de administrador</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={panel.danger ? 'destructive' : 'outline'}
                    disabled={disabled || isLoading}
                    onClick={() => runAction(panel.key, panel.fn, panel.payload)}
                    className="flex-shrink-0"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span className="ml-1.5">{isLoading ? 'Executando...' : 'Executar'}</span>
                  </Button>
                </div>

                {/* Resultado */}
                {res && (
                  <div className={`mt-3 p-3 rounded-md text-xs ${res.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    {res.ok ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-green-800">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Concluído com sucesso
                        </div>

                        {/* setupDriveStructure */}
                        {res.data?.folders && (
                          <div className="text-green-700 mt-1">
                            {Object.keys(res.data.folders).length} pastas verificadas/criadas
                          </div>
                        )}

                        {/* deduplicateDriveFolder */}
                        {res.data?.summary && (
                          <div className="space-y-0.5 text-green-700 mt-1">
                            <div>Analisados: <strong>{res.data.summary.total_analisados}</strong></div>
                            <div>Duplicatas: <strong>{res.data.summary.duplicatas_encontradas}</strong></div>
                            <div>Mantidos: <strong>{res.data.summary.arquivos_mantidos}</strong></div>
                            <div>Movidos: <strong>{res.data.summary.arquivos_movidos}</strong></div>
                            {res.data.summary.erros > 0 && (
                              <div className="text-red-600">Erros: <strong>{res.data.summary.erros}</strong></div>
                            )}
                            {res.data.mode && (
                              <div className="mt-1 italic text-gray-600">{res.data.mode}</div>
                            )}
                          </div>
                        )}

                        {/* Duplicatas encontradas em simulação */}
                        {res.data?.duplicatas?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-gray-600 hover:text-black">
                              Ver {res.data.duplicatas.length} duplicata(s) encontrada(s)
                            </summary>
                            <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
                              {res.data.duplicatas.slice(0, 20).map((d, i) => (
                                <div key={i} className="text-gray-700 truncate">
                                  {d.name} <span className="text-gray-400">({d.action})</span>
                                </div>
                              ))}
                              {res.data.duplicatas.length > 20 && (
                                <div className="text-gray-500">...e mais {res.data.duplicatas.length - 20}</div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-700">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {res.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda da estrutura */}
      <div className="border border-gray-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />Estrutura de Pastas no Drive
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
          {[
            { name: '01_Notas_Fiscais', sub: 'PDF, XML, Por_Rubrica, Por_Fornecedor, Por_Mes' },
            { name: '02_Comprovantes_Pagamento', sub: 'Por membro / mês' },
            { name: '03_Fotos_Atividades', sub: 'MIS, MHAB, MUMO, Geral' },
            { name: '04_Relatorios', sub: 'Rascunhos, Aprovados, PDFs_Gerados' },
            { name: '05_Contratos' },
            { name: '06_Orcamento_Rubricas' },
            { name: '07_Documentos_Administrativos' },
            { name: '08_Backup_App', sub: 'JSON, Logs, Auditoria' },
            { name: '09_Lixeira_Controlada', sub: 'Arquivos deletados/duplicados' },
          ].map(f => (
            <div key={f.name} className="flex flex-col">
              <span className="font-medium text-gray-800">📁 {f.name}</span>
              {f.sub && <span className="text-gray-400 ml-4">{f.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}