import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, RefreshCw, Eye, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function TeamContractsPanel() {
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(null);
  const [uploadingNewContract, setUploadingNewContract] = useState(null);

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['team-contracts-panel'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
  });

  const membersWithContracts = teamMembers.filter((m) => m.contrato_url);

  async function handleRefreshContract(member) {
    setRefreshing(member.id);
    try {
      const res = await base44.functions.invoke('refreshTeamContractData', {
        teamMemberId: member.id,
        contractUrl: member.contrato_url,
      });

      if (res.data?.success) {
        toast.success('Contrato relido e dados atualizados.');
        await queryClient.invalidateQueries({ queryKey: ['team-contracts-panel'] });
      } else {
        toast.error(res.data?.error || 'Erro ao reler contrato.');
      }
    } catch (e) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setRefreshing(null);
    }
  }

  async function handleUploadNewContract(member) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingNewContract(member.id);
      try {
        const uploadRes = await base44.integrations.Core.UploadFile({ file });
        const newUrl = uploadRes?.file_url || uploadRes?.data?.file_url;

        if (!newUrl) throw new Error('Arquivo enviado, mas sem URL retornada.');

        const refreshRes = await base44.functions.invoke('refreshTeamContractData', {
          teamMemberId: member.id,
          contractUrl: newUrl,
        });

        if (refreshRes.data?.success) {
          toast.success('Novo contrato anexado e processado.');
          await queryClient.invalidateQueries({ queryKey: ['team-contracts-panel'] });
          setShowDetails(false);
        } else {
          toast.error(refreshRes.data?.error || 'Erro ao processar contrato.');
        }
      } catch (e) {
        toast.error(`Erro: ${e.message}`);
      } finally {
        setUploadingNewContract(null);
      }
    };
    input.click();
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-slate-600 text-sm">Carregando contratos...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Contratos de Equipe ({membersWithContracts.length})</h3>
        </div>

        {membersWithContracts.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-slate-600">
              Nenhum contrato anexado na equipe.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {membersWithContracts.map((member) => {
              const isExpiring =
                member.data_fim_contrato &&
                new Date(member.data_fim_contrato) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

              return (
                <Card
                  key={member.id}
                  className={isExpiring ? 'border-orange-300 bg-orange-50' : ''}
                >
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {/* Cabeçalho */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-900">{member.user_name}</h4>
                          <p className="text-sm text-slate-600">{member.funcao || 'Sem função'}</p>
                        </div>
                        {isExpiring && (
                          <Badge className="bg-orange-100 text-orange-800">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Vence em breve
                          </Badge>
                        )}
                      </div>

                      {/* Info do contrato */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                        {member.data_inicio_contrato && (
                          <div>
                            <span className="font-medium">Início:</span> {member.data_inicio_contrato}
                          </div>
                        )}
                        {member.data_fim_contrato && (
                          <div>
                            <span className="font-medium">Fim:</span> {member.data_fim_contrato}
                          </div>
                        )}
                        {member.numero_parcelas && (
                          <div>
                            <span className="font-medium">Parcelas:</span> {member.numero_parcelas}
                          </div>
                        )}
                        {member.valor_total && (
                          <div>
                            <span className="font-medium">Total:</span> R$ {member.valor_total.toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Escopo/Objeto */}
                      {member.objeto_contrato && (
                        <div className="bg-slate-100 p-2 rounded text-xs text-slate-700">
                          <span className="font-medium">Escopo:</span> {member.objeto_contrato}
                        </div>
                      )}

                      {/* Botões */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMember(member);
                            setShowDetails(true);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Detalhes
                        </Button>

                        <a
                          href={member.contrato_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
                        >
                          <FileText className="w-4 h-4" />
                          Ver contrato
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRefreshContract(member)}
                          disabled={refreshing === member.id}
                        >
                          {refreshing === member.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {showDetails && selectedMember && (
        <Dialog open onOpenChange={setShowDetails}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedMember.user_name} — Contrato</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Informações básicas */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="font-medium text-slate-700">Função</Label>
                  <p>{selectedMember.funcao}</p>
                </div>
                <div>
                  <Label className="font-medium text-slate-700">Rubrica</Label>
                  <p>{selectedMember.budgetline_id || 'N/A'}</p>
                </div>
                <div>
                  <Label className="font-medium text-slate-700">Data início</Label>
                  <p>{selectedMember.data_inicio_contrato || 'N/A'}</p>
                </div>
                <div>
                  <Label className="font-medium text-slate-700">Data fim</Label>
                  <p>{selectedMember.data_fim_contrato || 'N/A'}</p>
                </div>
                <div>
                  <Label className="font-medium text-slate-700">Parcelas</Label>
                  <p>{selectedMember.numero_parcelas} × R$ {selectedMember.valor_parcela?.toFixed(2) || '0'}</p>
                </div>
                <div>
                  <Label className="font-medium text-slate-700">Total</Label>
                  <p>R$ {selectedMember.valor_total?.toFixed(2) || '0'}</p>
                </div>
              </div>

              {/* Escopo */}
              {selectedMember.objeto_contrato && (
                <div className="space-y-2">
                  <Label className="font-medium text-slate-700">Escopo do contrato</Label>
                  <Textarea
                    readOnly
                    value={selectedMember.objeto_contrato}
                    className="text-xs h-20"
                  />
                </div>
              )}

              {/* Descrição */}
              {selectedMember.descricao_contrato && (
                <div className="space-y-2">
                  <Label className="font-medium text-slate-700">Descrição extraída</Label>
                  <Textarea
                    readOnly
                    value={selectedMember.descricao_contrato}
                    className="text-xs h-20"
                  />
                </div>
              )}

              {/* Cronograma */}
              {selectedMember.cronograma_parcelas?.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-medium text-slate-700">Cronograma de parcelas</Label>
                  <div className="bg-slate-50 rounded p-2 space-y-1 max-h-40 overflow-y-auto">
                    {selectedMember.cronograma_parcelas.map((parc, i) => (
                      <div key={i} className="text-xs text-slate-700 border-l-2 border-slate-300 pl-2 py-1">
                        <span className="font-medium">Parc. {parc.numero}</span> — {parc.vencimento} — R$ {parc.valor?.toFixed(2)}
                        {parc.descricao && ` — ${parc.descricao}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-2 pt-4">
                <a
                  href={selectedMember.contrato_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  <FileText className="w-4 h-4" />
                  Abrir contrato
                  <ExternalLink className="w-3 h-3" />
                </a>

                <Button
                  variant="outline"
                  onClick={() => handleRefreshContract(selectedMember)}
                  disabled={refreshing === selectedMember.id}
                  className="flex-1"
                >
                  {refreshing === selectedMember.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Reler contrato
                </Button>

                <Button
                  variant="outline"
                  onClick={() => handleUploadNewContract(selectedMember)}
                  disabled={uploadingNewContract === selectedMember.id}
                  className="flex-1"
                >
                  {uploadingNewContract === selectedMember.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Trocar contrato
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}