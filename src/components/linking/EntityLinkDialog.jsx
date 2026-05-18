import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link2, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  applyEntityLinks,
  createTeamMemberFromSource,
  getPersonName,
  loadLinkingDatasets,
  normalizeEmail,
  suggestEntityLinks,
} from '@/utils/linking/smartEntityLinker';

function SuggestionRow({ label, item }) {
  if (!item?.entity) return null;
  const entity = item.entity;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{getPersonName(entity) || entity.descricao_item || entity.file_name || entity.id}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
      <Badge variant="outline">{item.score}%</Badge>
    </div>
  );
}

function getBest(suggestions, key) {
  return suggestions?.[key]?.[0]?.entity || null;
}

export default function EntityLinkDialog({
  open,
  onClose,
  source,
  sourceType,
  sourceId,
  datasets: providedDatasets,
  currentUser,
  onApplied,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [datasets, setDatasets] = useState(providedDatasets || null);
  const [suggestions, setSuggestions] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!open) return;
      setLoading(true);
      try {
        const loaded = providedDatasets || await loadLinkingDatasets();
        if (!active) return;
        const nextSuggestions = suggestEntityLinks(source || {}, loaded, { minScore: 45 });
        setDatasets(loaded);
        setSuggestions(nextSuggestions);
        setSelectedMemberId(getBest(nextSuggestions, 'teamMembers')?.id || '');
        setSelectedUserId(getBest(nextSuggestions, 'users')?.id || '');
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível analisar os vínculos.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [open, source, providedDatasets]);

  const selected = useMemo(() => ({
    teamMember: (datasets?.teamMembers || []).find(m => String(m.id) === String(selectedMemberId)) || null,
    user: (datasets?.users || []).find(u => String(u.id) === String(selectedUserId)) || null,
    teamPayment: getBest(suggestions, 'teamPayments'),
    purchaseRequest: getBest(suggestions, 'purchaseRequests'),
    attachment: getBest(suggestions, 'attachments'),
  }), [datasets, selectedMemberId, selectedUserId, suggestions]);

  const canApply = Boolean(sourceType && (sourceId || source?.id));

  async function handleApply(extraSelected = selected) {
    if (!canApply) {
      toast.info('Selecione um registro salvo para aplicar o vínculo.');
      return;
    }
    setSaving(true);
    try {
      const patch = await applyEntityLinks({
        sourceType,
        sourceId: sourceId || source?.id,
        suggestions,
        selected: extraSelected,
        patchExtra: { entity_link_status: 'CONFIRMED' },
      });
      toast.success('Vínculo confirmado.');
      await onApplied?.(patch);
      onClose?.();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao confirmar vínculo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMember() {
    setSaving(true);
    try {
      const created = await createTeamMemberFromSource(source || {}, currentUser);
      setDatasets(prev => ({ ...prev, teamMembers: [created, ...(prev?.teamMembers || [])] }));
      await handleApply({ ...selected, teamMember: created });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar membro a partir do documento.');
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !saving) onClose?.(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vínculo inteligente de registros
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analisando nomes, CPF/CNPJ, NF, valores e histórico
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p className="font-medium">{getPersonName(source || {}) || source?.file_name_original || source?.descricao_item || 'Registro em análise'}</p>
              <p className="text-xs text-slate-500">{sourceType || source?.__entityType || 'Registro'} {source?.id ? `· ${source.id}` : ''}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Membro de equipe</Label>
                <Select value={selectedMemberId || '__none__'} onValueChange={v => setSelectedMemberId(v === '__none__' ? '' : v)} disabled={saving}>
                  <SelectTrigger><SelectValue placeholder="Escolher membro" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem vínculo</SelectItem>
                    {(datasets?.teamMembers || []).map(member => (
                      <SelectItem key={member.id} value={String(member.id)}>{getPersonName(member) || member.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Usuário relacionado</Label>
                <Select value={selectedUserId || '__none__'} onValueChange={v => setSelectedUserId(v === '__none__' ? '' : v)} disabled={saving}>
                  <SelectTrigger><SelectValue placeholder="Escolher usuário" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem usuário</SelectItem>
                    {(datasets?.users || []).map(user => (
                      <SelectItem key={user.id || user.email} value={String(user.id || user.email)}>{user.name || user.full_name || normalizeEmail(user.email)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sugestões encontradas</p>
              <SuggestionRow label="Membro de equipe provável" item={suggestions?.teamMembers?.[0]} />
              <SuggestionRow label="Usuário relacionado" item={suggestions?.users?.[0]} />
              <SuggestionRow label="Pagamento de equipe" item={suggestions?.teamPayments?.[0]} />
              <SuggestionRow label="Solicitação financeira" item={suggestions?.purchaseRequests?.[0]} />
              <SuggestionRow label="Anexo / nota fiscal" item={suggestions?.attachments?.[0]} />
              {!suggestions?.confidence && <p className="text-sm text-slate-500">Nenhum vínculo forte encontrado. É possível criar um novo membro ou ignorar.</p>}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onClose?.()} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Ignorar
              </Button>
              <Button type="button" variant="outline" onClick={handleCreateMember} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Criar novo membro
              </Button>
              <Button type="button" onClick={() => handleApply()} disabled={saving || !canApply}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Confirmar vínculo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
