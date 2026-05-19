import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { backupContractIntakeToDrive } from '@/lib/contractDriveBackup';
import {
  Loader2, FileText, User, Building2, CheckCircle2,
  AlertCircle, Link2, ExternalLink, DollarSign, Calendar, MapPin,
} from 'lucide-react';

function fmtBRL(v) {
  const n = Number(v);
  if (!n) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
}

function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function SectionTitle({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 mt-4 first:mt-0">{children}</p>
  );
}

export default function ReviewModalContrato({ intake, onClose, onSaved }) {
  const [loading, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [nfsRelacionadas, setNfsRelacionadas] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const ia = intake?.resultado_ia || {};

  const [form, setForm] = useState({
    team_member_id: intake?.contrato_team_member_id || '',
    fornecedor_id: intake?.contrato_fornecedor_id || '',
    centro_custo: intake?.centro_custo || ia?.centro_custo || '',
    numero_contrato: intake?.contrato_numero || ia?.numero_contrato || '',
    observacoes: '',
  });

  useEffect(() => {
    if (!intake) return;
    setLoadingData(true);
    Promise.all([
      base44.entities.TeamMember.list().catch(() => []),
      base44.entities.Fornecedor.list().catch(() => []),
    ]).then(([members, forns]) => {
      setTeamMembers(Array.isArray(members) ? members : []);
      setFornecedores(Array.isArray(forns) ? forns : []);

      // Buscar NFs relacionadas por CPF/CNPJ ou nome do fornecedor
      const cnpj = onlyDigits(ia?.fornecedor_cpf_cnpj || ia?.nf_emitente_cpf_cnpj || '');
      const nomeForn = String(ia?.fornecedor_nome || '').toLowerCase().trim();

      base44.entities.DocumentIntake.list('-created_date', 300).then(allDocs => {
        const docs = Array.isArray(allDocs) ? allDocs : [];
        const related = docs.filter(d => {
          if (d.id === intake.id) return false;
          const tipo = String(d.tipo_detectado || '');
          if (!['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'RECIBO_PDF'].includes(tipo)) return false;
          const dCnpj = onlyDigits(d.nf_emitente_cpf_cnpj || d.fornecedor_cpf_cnpj || '');
          const dNome = String(d.nf_emitente_nome || d.fornecedor_nome || '').toLowerCase().trim();
          if (cnpj && dCnpj && cnpj === dCnpj) return true;
          if (nomeForn && dNome && (dNome.includes(nomeForn.slice(0, 10)) || nomeForn.includes(dNome.slice(0, 10)))) return true;
          return false;
        });
        setNfsRelacionadas(related.slice(0, 10));
      }).catch(() => {});
    }).finally(() => setLoadingData(false));
  }, [intake?.id]);

  async function handleSave() {
    if (!intake?.id) return;
    setSaving(true);
    try {
      const cnpjLimpo = onlyDigits(ia?.fornecedor_cpf_cnpj || '');

      // 1. Criar/atualizar Fornecedor
      let fornecedorId = form.fornecedor_id;
      if (!fornecedorId && ia?.fornecedor_nome) {
        // Verificar se já existe por CPF/CNPJ
        let existing = null;
        if (cnpjLimpo) {
          const byDoc = await base44.entities.Fornecedor.filter({ cpf_cnpj: cnpjLimpo }).catch(() => []);
          existing = (Array.isArray(byDoc) ? byDoc : [])[0] || null;
          if (!existing) {
            const byCnpj = await base44.entities.Fornecedor.filter({ cnpj: cnpjLimpo }).catch(() => []);
            existing = (Array.isArray(byCnpj) ? byCnpj : [])[0] || null;
          }
        }

        if (existing && !existing.revisado_manualmente) {
          // Atualiza campos vazios
          const updates = {};
          if (!existing.banco && ia?.fornecedor_banco)  updates.banco   = ia.fornecedor_banco;
          if (!existing.agencia && ia?.fornecedor_agencia) updates.agencia = ia.fornecedor_agencia;
          if (!existing.conta && ia?.fornecedor_conta)  updates.conta   = ia.fornecedor_conta;
          if (!existing.pix && ia?.fornecedor_pix)     updates.pix     = ia.fornecedor_pix;
          if (Object.keys(updates).length > 0) {
            await base44.entities.Fornecedor.update(existing.id, updates).catch(() => {});
          }
          fornecedorId = existing.id;
        } else if (!existing) {
          const tipoPessoa = ia?.fornecedor_tipo === 'PJ' ? 'pessoa_juridica'
            : ia?.fornecedor_tipo === 'MEI' ? 'MEI'
            : 'pessoa_fisica';
          const novoForn = await base44.entities.Fornecedor.create({
            nome: ia.fornecedor_nome || '',
            tipo_pessoa: tipoPessoa,
            tipo: tipoPessoa === 'pessoa_fisica' ? 'pessoa_fisica' : 'pessoa_juridica',
            cpf_cnpj: cnpjLimpo || '',
            cpf: tipoPessoa === 'pessoa_fisica' ? cnpjLimpo : '',
            cnpj: tipoPessoa !== 'pessoa_fisica' ? cnpjLimpo : '',
            banco: ia?.fornecedor_banco || '',
            agencia: ia?.fornecedor_agencia || '',
            conta: ia?.fornecedor_conta || '',
            pix: ia?.fornecedor_pix || '',
            museus_atuacao: ia?.museu_relacionado ? [ia.museu_relacionado] : [],
            status: 'ATIVO',
            ativo: true,
            contratos_intake_ids: [intake.id],
          }).catch(() => null);
          fornecedorId = novoForn?.id || '';
        } else {
          fornecedorId = existing.id;
        }
      }

      // 2. Atualizar TeamMember se vinculado
      if (form.team_member_id && ia) {
        const updates = {};
        if (intake.arquivo_original_url && !updates.contrato_url) updates.contrato_url = intake.arquivo_original_url;
        if (ia?.objeto_contrato) updates.objeto_contrato = ia.objeto_contrato;
        if (ia?.vigencia_inicio) updates.data_inicio_contrato = ia.vigencia_inicio;
        if (ia?.vigencia_fim) updates.data_fim_contrato = ia.vigencia_fim;
        if (ia?.valor_total) updates.valor_total = Number(ia.valor_total);
        if (ia?.numero_parcelas) updates.numero_parcelas = Number(ia.numero_parcelas);
        if (ia?.valor_parcela) updates.valor_parcela = Number(ia.valor_parcela);
        if (ia?.fornecedor_banco) updates.banco = ia.fornecedor_banco;
        if (ia?.fornecedor_agencia) updates.agencia = ia.fornecedor_agencia;
        if (ia?.fornecedor_conta) updates.conta = ia.fornecedor_conta;
        if (ia?.fornecedor_pix) updates.pix_key = ia.fornecedor_pix;
        if (ia?.escopo_descricao || ia?.objeto_contrato) updates.escopo_descricao = ia.escopo_descricao || ia.objeto_contrato;
        if (ia?.museu_relacionado) updates.museu_projeto = ia.museu_relacionado;
        if (ia?.centro_custo) updates.centro_custo = ia.centro_custo;
        if (fornecedorId) updates.fornecedor_id = fornecedorId;
        if (ia?.numero_contrato) updates.numero_contrato = ia.numero_contrato;
        if (ia?.data_assinatura) updates.data_assinatura = ia.data_assinatura;
        updates.status_contrato = 'VIGENTE';

        await base44.entities.TeamMember.update(form.team_member_id, updates).catch(() => {});
      }

      // 3. Atualizar DocumentIntake
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        tipo_detectado: intake.tipo_detectado || 'CONTRATO_PDF',
        revisado_pelo_usuario: true,
        grupo_status: 'COMPLETO',
        entidade_destino: form.team_member_id ? 'TeamMember' : fornecedorId ? 'Fornecedor' : '',
        entidade_destino_id: form.team_member_id || fornecedorId || '',
        contrato_team_member_id: form.team_member_id || null,
        contrato_fornecedor_id: fornecedorId || null,
        contrato_numero: form.numero_contrato || ia?.numero_contrato || '',
        centro_custo: form.centro_custo || ia?.centro_custo || '',
      });

      // 4. Backup no Drive (via função existente)
      if (intake.arquivo_original_url) {
        const backupResult = await backupContractIntakeToDrive({
          intake: {
            ...intake,
            status_processamento: 'APROVADO',
            revisado_pelo_usuario: true,
            grupo_status: 'COMPLETO',
            entidade_destino: form.team_member_id ? 'TeamMember' : fornecedorId ? 'Fornecedor' : '',
            entidade_destino_id: form.team_member_id || fornecedorId || '',
            contrato_team_member_id: form.team_member_id || null,
            contrato_fornecedor_id: fornecedorId || null,
            contrato_numero: form.numero_contrato || ia?.numero_contrato || '',
            centro_custo: form.centro_custo || ia?.centro_custo || '',
          },
          currentUser: null,
          linkType: form.team_member_id ? 'TeamMember' : fornecedorId ? 'Fornecedor' : ''
        });

        if (backupResult?.success) {
          toast.success('Backup salvo no Drive em Contratos APP.');
        } else if (backupResult && !backupResult.skipped) {
          toast.warning('Contrato vinculado ao app. Backup no Drive ficou pendente.');
        }
      }

      toast.success('Contrato vinculado e arquivado com sucesso.');
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose?.(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Revisar Contrato
          </DialogTitle>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Dados extraídos pela IA */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <SectionTitle>Dados extraídos pela IA</SectionTitle>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {ia?.fornecedor_nome && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Building2 className="w-3 h-3" />Fornecedor/Prestador</p>
                    <p className="font-medium text-gray-800">{ia.fornecedor_nome}</p>
                    {ia?.fornecedor_cpf_cnpj && <p className="text-xs text-gray-500">{ia.fornecedor_cpf_cnpj}</p>}
                  </div>
                )}
                {ia?.responsavel_tecnico && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><User className="w-3 h-3" />Responsável técnico</p>
                    <p className="font-medium text-gray-800">{ia.responsavel_tecnico}</p>
                  </div>
                )}
                {ia?.valor_total && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" />Valor total</p>
                    <p className="font-medium text-gray-800">{fmtBRL(ia.valor_total)}</p>
                    {ia?.numero_parcelas > 1 && <p className="text-xs text-gray-500">{ia.numero_parcelas}x {fmtBRL(ia.valor_parcela)}</p>}
                  </div>
                )}
                {(ia?.vigencia_inicio || ia?.vigencia_fim) && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" />Vigência</p>
                    <p className="font-medium text-gray-800">{fmtDate(ia.vigencia_inicio)} → {fmtDate(ia.vigencia_fim)}</p>
                  </div>
                )}
                {ia?.museu_relacionado && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Museu/Centro</p>
                    <p className="font-medium text-gray-800">{ia.museu_relacionado}</p>
                  </div>
                )}
                {ia?.meta_contrato && (
                  <div>
                    <p className="text-xs text-gray-500">Meta</p>
                    <Badge variant="outline" className="text-xs">{ia.meta_contrato}</Badge>
                  </div>
                )}
                {ia?.rubrica_sugerida && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Rubrica sugerida</p>
                    <p className="text-sm font-medium text-blue-700">{ia.rubrica_sugerida}</p>
                  </div>
                )}
                {ia?.objeto_contrato && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Objeto do contrato</p>
                    <p className="text-sm text-gray-700 line-clamp-3">{ia.objeto_contrato}</p>
                  </div>
                )}
              </div>
              {intake.arquivo_original_url && (
                <a href={intake.arquivo_original_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 underline">
                  <ExternalLink className="w-3 h-3" />Ver contrato
                </a>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-gray-200 text-gray-600">
                  Backup Drive: {intake.backup_drive_status || 'PENDENTE'}
                </Badge>
                {intake.drive_backup_url && (
                  <a
                    href={intake.drive_backup_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Abrir backup no Drive
                  </a>
                )}
              </div>
            </div>

            {/* Vínculo com membro da equipe */}
            <div>
              <SectionTitle>Vincular ao Membro da Equipe</SectionTitle>
              <div className="space-y-1">
                <Label className="text-xs">Membro da equipe</Label>
                <select
                  value={form.team_member_id}
                  onChange={e => setForm(prev => ({ ...prev, team_member_id: e.target.value }))}
                  className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
                >
                  <option value="">— Nenhum (vincular ao fornecedor) —</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.user_name} {m.funcao ? `— ${m.funcao}` : ''}</option>
                  ))}
                </select>
                {ia?.membros_equipe?.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    IA identificou: {ia.membros_equipe.map(m => m.nome).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Vínculo com fornecedor (quando sem membro) */}
            {!form.team_member_id && (
              <div>
                <SectionTitle>Vincular ao Fornecedor</SectionTitle>
                <div className="space-y-1">
                  <Label className="text-xs">Fornecedor (será criado automaticamente se não selecionado)</Label>
                  <select
                    value={form.fornecedor_id}
                    onChange={e => setForm(prev => ({ ...prev, fornecedor_id: e.target.value }))}
                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
                  >
                    <option value="">— Criar novo automaticamente —</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.nome} {f.cpf_cnpj ? `(${f.cpf_cnpj})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Campos complementares */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Número do contrato</Label>
                <Input value={form.numero_contrato} onChange={e => setForm(prev => ({ ...prev, numero_contrato: e.target.value }))}
                  placeholder="Ex: 001/2026" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Centro de custo</Label>
                <select
                  value={form.centro_custo}
                  onChange={e => setForm(prev => ({ ...prev, centro_custo: e.target.value }))}
                  className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
                >
                  <option value="">Selecione</option>
                  {['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Publicações', 'Geral'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* NFs relacionadas encontradas */}
            {nfsRelacionadas.length > 0 && (
              <div>
                <SectionTitle>Notas Fiscais relacionadas encontradas ({nfsRelacionadas.length})</SectionTitle>
                <div className="space-y-1.5">
                  {nfsRelacionadas.map(nf => (
                    <div key={nf.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-green-800">{nf.file_name_original || nf.file_name_final}</p>
                        <p className="text-[10px] text-green-600">{nf.tipo_detectado} — {nf.nf_emitente_nome || nf.fornecedor_nome || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        {nf.arquivo_original_url && (
                          <a href={nf.arquivo_original_url} target="_blank" rel="noreferrer"
                            className="text-xs text-green-700 underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />Ver
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aviso regras */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">Regras do contrato:</p>
                  <p>• O contrato não debita rubrica nem cria solicitação financeira.</p>
                  <p>• Será arquivado como documento-base para organizar fornecedor, equipe e notas.</p>
                  <p>• NFs vinculadas continuam sendo os documentos financeiros.</p>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => onClose?.()} disabled={loading}>Cancelar</Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Confirmar vínculo'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
