import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Outro'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

const GRUPOS_RAPIDOS = [
  { key: 'todos', label: 'Todos os usuários' },
  { key: 'coordenadores', label: 'Apenas coordenadores/admin' },
  { key: 'profissionais', label: 'Apenas profissionais' },
];

export default function MensagensDestinatarios({ destinatarios, setDestinatarios, filtros, setFiltros }) {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [grupoSelecionado, setGrupoSelecionado] = useState('');
  const [museuFiltro, setMuseuFiltro] = useState('');
  const [funcaoFiltro, setFuncaoFiltro] = useState('');
  const [equipesFiltro, setEquipeFiltro] = useState('');
  const [buscaManual, setBuscaManual] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setLoading(true);
    base44.entities.User.list().then((users) => {
      setAllUsers(users || []);
    }).catch(() => setAllUsers([])).finally(() => setLoading(false));
  }, []);

  function applyGroup(key) {
    setGrupoSelecionado(key);
    setMuseuFiltro('');
    setFuncaoFiltro('');
    setEquipeFiltro('');

    let filtered = [];
    if (key === 'todos') {
      filtered = allUsers.map((u) => u.email).filter(Boolean);
    } else if (key === 'coordenadores') {
      const coordRoles = ['COORDENADOR', 'ADMIN', 'admin', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA',
        'COORD_COMUNICACAO', 'COORD_PROGRAMACAO', 'CONSULTORIA_PROGRAMACAO'];
      filtered = allUsers
        .filter((u) => coordRoles.includes(u.role))
        .map((u) => u.email)
        .filter(Boolean);
    } else if (key === 'profissionais') {
      const coordRoles = ['COORDENADOR', 'ADMIN', 'admin', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA',
        'COORD_COMUNICACAO', 'COORD_PROGRAMACAO', 'CONSULTORIA_PROGRAMACAO'];
      filtered = allUsers
        .filter((u) => !coordRoles.includes(u.role))
        .map((u) => u.email)
        .filter(Boolean);
    }

    setDestinatarios([...new Set(filtered)]);
    setFiltros({ grupo: key });
  }

  function applyFilters() {
    let filtered = allUsers;
    if (museuFiltro) filtered = filtered.filter((u) => u.museu === museuFiltro);
    if (funcaoFiltro) filtered = filtered.filter((u) => u.funcao === funcaoFiltro);
    if (equipesFiltro) filtered = filtered.filter((u) => u.equipe === equipesFiltro);
    const emails = [...new Set(filtered.map((u) => u.email).filter(Boolean))];
    setDestinatarios(emails);
    setFiltros({ museu: museuFiltro, funcao: funcaoFiltro, equipe: equipesFiltro });
    setGrupoSelecionado('');
  }

  function addManual(email) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || destinatarios.includes(trimmed)) return;
    setDestinatarios([...destinatarios, trimmed]);
    setBuscaManual('');
  }

  function removeDestinatario(email) {
    setDestinatarios(destinatarios.filter((e) => e !== email));
  }

  const usersFiltered = buscaManual.length > 1
    ? allUsers.filter((u) =>
        (u.email || '').toLowerCase().includes(buscaManual.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(buscaManual.toLowerCase())
      ).slice(0, 8)
    : [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-slate-500" />
        <h3 className="font-semibold text-slate-800 text-sm">Destinatários</h3>
        {destinatarios.length > 0 && (
          <Badge className="ml-auto bg-blue-100 text-blue-700">{destinatarios.length}</Badge>
        )}
      </div>

      {/* Grupos rápidos */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Grupos rápidos</p>
        {GRUPOS_RAPIDOS.map((g) => (
          <button
            key={g.key}
            onClick={() => applyGroup(g.key)}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
              grupoSelecionado === g.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Filtros por atributo */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filtrar por atributo</p>
        <select
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          value={museuFiltro}
          onChange={(e) => setMuseuFiltro(e.target.value)}
        >
          <option value="">Todos os museus</option>
          {MUSEUS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          value={funcaoFiltro}
          onChange={(e) => setFuncaoFiltro(e.target.value)}
        >
          <option value="">Todas as funções</option>
          {FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          value={equipesFiltro}
          onChange={(e) => setEquipeFiltro(e.target.value)}
        >
          <option value="">Todas as equipes</option>
          {EQUIPES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <Button size="sm" variant="outline" className="w-full" onClick={applyFilters}>
          Aplicar filtros
        </Button>
      </div>

      {/* Adicionar manualmente */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <button
          className="flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wide"
          onClick={() => setShowManual((v) => !v)}
        >
          Adicionar manualmente
          {showManual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showManual && (
          <div className="relative">
            <Input
              placeholder="Buscar por nome ou email..."
              value={buscaManual}
              onChange={(e) => setBuscaManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManual(buscaManual)}
              className="text-sm"
            />
            {usersFiltered.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {usersFiltered.map((u) => (
                  <button
                    key={u.email}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex flex-col"
                    onClick={() => addManual(u.email)}
                  >
                    <span className="font-medium text-slate-800">{u.full_name || u.email}</span>
                    <span className="text-xs text-slate-400">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de destinatários selecionados */}
      {destinatarios.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500">{destinatarios.length} destinatário(s)</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {destinatarios.map((email) => {
              const u = allUsers.find((x) => x.email === email);
              return (
                <div key={email} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700 truncate block">{u?.full_name || email}</span>
                    {u?.full_name && <span className="text-slate-400 truncate block">{email}</span>}
                  </div>
                  <button onClick={() => removeDestinatario(email)} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-red-500 hover:text-red-700 px-0"
            onClick={() => { setDestinatarios([]); setGrupoSelecionado(''); }}
          >
            Limpar todos
          </Button>
        </div>
      )}
    </div>
  );
}