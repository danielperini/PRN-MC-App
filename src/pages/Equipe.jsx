import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Users, Phone, Mail, MapPin, Briefcase, Building2 } from 'lucide-react';
import { isCoordenador } from '@/components/auth/permissions';
import RequireAuth from '@/components/auth/RequireAuth';

function fmtBRL(v) {
  if (!v) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Avatar({ name }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-white">{initials}</span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div>
        <span className="text-muted-foreground text-xs">{label}: </span>
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  );
}

function MemberDrawer({ member, isCoord, open, onClose }) {
  if (!member) return null;
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <Avatar name={member.user_name} />
            <div>
              <SheetTitle className="text-left">{member.user_name}</SheetTitle>
              <p className="text-sm text-muted-foreground">{member.funcao || member.funcao_institucional || '—'}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Dados Públicos */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contato e Vínculo</h3>
            <InfoRow icon={Mail} label="E-mail" value={member.user_email} />
            <InfoRow icon={Phone} label="Telefone" value={member.telefone || member.celular} />
            <InfoRow icon={Building2} label="Museu" value={member.museu_vinculado || member.museu_projeto} />
            <InfoRow icon={Briefcase} label="Função" value={member.funcao || member.funcao_institucional} />
            <InfoRow icon={MapPin} label="Regime" value={member.regime_trabalho} />
            {member.email_pessoal && <InfoRow icon={Mail} label="E-mail Pessoal" value={member.email_pessoal} />}
          </div>

          {/* Dados Financeiros — só coordenadores */}
          {isCoord && (
            <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wide">Dados Financeiros e Bancários</h3>
              <div className="space-y-2">
                <InfoRow icon={Briefcase} label="Tipo" value={member.tipo_pessoa} />
                {member.cpf && <InfoRow icon={Briefcase} label="CPF" value={member.cpf} />}
                {member.cnpj && <InfoRow icon={Briefcase} label="CNPJ" value={member.cnpj} />}
                {member.empresa_nome && <InfoRow icon={Building2} label="Empresa" value={member.empresa_nome} />}
                <InfoRow icon={Briefcase} label="PIX" value={member.pix_key} />
                {member.banco && (
                  <InfoRow
                    icon={Briefcase}
                    label="Banco"
                    value={`${member.banco}${member.agencia ? ` · Ag. ${member.agencia}` : ''}${member.conta ? ` · Conta ${member.conta}` : ''}${member.tipo_conta ? ` (${member.tipo_conta})` : ''}`}
                  />
                )}
                {member.contrato_valor_parcela && (
                  <InfoRow icon={Briefcase} label="Valor/Parcela" value={fmtBRL(member.contrato_valor_parcela)} />
                )}
                {member.contrato_num_parcelas && (
                  <InfoRow icon={Briefcase} label="Parcelas" value={String(member.contrato_num_parcelas)} />
                )}
                {member.valor_total && (
                  <InfoRow icon={Briefcase} label="Valor Total" value={fmtBRL(member.valor_total)} />
                )}
                {member.data_inicio_contrato && (
                  <InfoRow icon={Briefcase} label="Início" value={new Date(member.data_inicio_contrato).toLocaleDateString('pt-BR')} />
                )}
                {member.data_fim_contrato && (
                  <InfoRow icon={Briefcase} label="Término" value={new Date(member.data_fim_contrato).toLocaleDateString('pt-BR')} />
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EquipeInner() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const isCoord = isCoordenador(currentUser);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members-equipe'],
    queryFn: () => base44.entities.TeamMember.filter({ status: 'ATIVO' }, 'user_name', 200),
    staleTime: 60000,
  });

  const filtered = members.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (m.user_name || '').toLowerCase().includes(q) ||
      (m.user_email || '').toLowerCase().includes(q) ||
      (m.funcao || '').toLowerCase().includes(q) ||
      (m.funcao_institucional || '').toLowerCase().includes(q) ||
      (m.museu_vinculado || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Cabeçalho */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
              <p className="text-sm text-gray-500">{members.length} membros ativos</p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, função, museu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Carregando equipe...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhum membro encontrado.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(member => (
              <button
                key={member.id}
                onClick={() => setSelected(member)}
                className="text-left border border-border rounded-xl p-4 bg-white hover:shadow-md hover:border-gray-300 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={member.user_name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-black">
                      {member.user_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {member.funcao || member.funcao_institucional || '—'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(member.museu_vinculado || member.museu_projeto) && (
                        <Badge className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 font-medium">
                          {member.museu_vinculado || member.museu_projeto}
                        </Badge>
                      )}
                      {member.regime_trabalho && (
                        <Badge variant="outline" className="text-[10px] text-gray-500 font-normal">
                          {member.regime_trabalho}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {member.user_email && (
                        <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          {member.user_email}
                        </p>
                      )}
                      {(member.telefone || member.celular) && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3 flex-shrink-0" />
                          {member.telefone || member.celular}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <MemberDrawer
        member={selected}
        isCoord={isCoord}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export default function Equipe() {
  return (
    <RequireAuth>
      <EquipeInner />
    </RequireAuth>
  );
}