import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, RefreshCw, LayoutGrid, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';
import CardRubricaEditor from '@/components/rubricas/CardRubricaEditor';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];
const ABAS = ['MHAB', 'MIS', 'MUMO', 'NOTURNO'];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function isRubricaNoturno(rubrica = {}) {
  const texto = normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria,
    rubrica?.centro_custo,
    rubrica?.meta_id,
    rubrica?.observacao_uso,
  ].filter(Boolean).join(' '));

  return texto.includes('noturno');
}

function isRubricaMuseuValida(rubrica = {}) {
  const texto = normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria,
    rubrica?.centro_custo,
    rubrica?.meta_id,
    rubrica?.observacao_uso,
  ].filter(Boolean).join(' '));

  if (!texto) return true;

  if (
    texto.includes('coordenador') ||
    texto.includes('coordenacao') ||
    texto.includes('coord ') ||
    texto.includes('coord.') ||
    texto.includes('assistente') ||
    texto.includes('analista') ||
    texto.includes('equipe') ||
    texto.includes('gestao') ||
    texto.includes('administrativo') ||
    texto.includes('adm ') ||
    texto.includes('adm.') ||
    texto.includes('consultoria') ||
    texto.includes('consultorias') ||
    texto.includes('juridico') ||
    texto.includes('contador') ||
    texto.includes('contabilidade') ||
    texto.includes('energia eletrica') ||
    texto.includes('material escritorio') ||
    texto.includes('educador') ||
    texto.includes('educadora') ||
    texto.includes('educadores') ||
    texto.includes('diaria educador') ||
    texto.includes('diarias educador') ||
    texto.includes('diárias educador') ||
    texto.includes('diaria de educador') ||
    texto.includes('diarias de educador')
  ) {
    return false;
  }

  return true;
}

class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro interno ao carregar a aba.',
    };
  }

  componentDidCatch(error, info) {
    console.error('Erro em RubricasPorMuseu:', error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({
        hasError: false,
        errorMessage: '',
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">A aba não carregou.</p>
              <p className="text-sm mt-1">{this.state.errorMessage}</p>
              <p className="text-xs mt-2 text-amber-700">
                O app foi preservado para não travar. Verifique o componente RubricasMuseuEditor ou a function de rubricas.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function KpiCard({ label, value, helper, dark = false }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm min-w-0 ${
        dark
          ? 'bg-black border-black text-white shadow-md'
          : 'bg-white border-gray-200 text-black hover:shadow-md transition-shadow'
      }`}
    >
      <p className={`text-[11px] uppercase tracking-wide font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-3xl font-bold mt-3 leading-tight truncate ${dark ? 'text-white' : 'text-black'}`}>
        {value}
      </p>
      {helper && (
        <p className={`text-xs mt-1 truncate ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

function MuseuResumoCard({ museu, active, onClick }) {
  return (
    <Card
      className={`cursor-pointer transition-all rounded-2xl shadow-sm ${
        active
          ? 'border-black bg-black text-white shadow-md'
          : 'border-gray-200 bg-white hover:border-black hover:shadow-md'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-gray-300' : 'text-gray-500'}`}>
          Museu
        </p>
        <h2 className={`text-3xl font-bold leading-tight mt-1 ${active ? 'text-white' : 'text-black'}`}>
          {museu}
        </h2>
        <p className={`text-xs mt-3 ${active ? 'text-gray-300' : 'text-gray-500'}`}>
          Clique para visualizar rubricas específicas.
        </p>
      </CardContent>
    </Card>
  );
}

function ActiveRubricasEditor({ aba, canEdit, refreshNonce }) {
  const isNoturno = aba === 'NOTURNO';

  return (
    <SafeBoundary resetKey={`${aba}-${refreshNonce}`}>
      <RubricasMuseuEditor
        key={`${aba}-${refreshNonce}`}
        museu={isNoturno ? 'GERAL' : aba}
        canEdit={canEdit}
        refreshKey={refreshNonce}
        rubricaFilter={isNoturno ? isRubricaNoturno : isRubricaMuseuValida}
      />
    </SafeBoundary>
  );
}

export default function RubricasPorMuseu() {
  const [abaAtiva, setAbaAtiva] = useState('MHAB');
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const user = await base44.auth.me();

        if (!active) return;
        setCurrentUser(user || null);

        if (user?.email && base44?.entities?.UserPermission?.filter) {
          try {
            const perms = await base44.entities.UserPermission.filter({ user_email: user.email });
            if (active) setUserPermission(perms?.[0] || null);
          } catch (error) {
            console.warn('Permissões indisponíveis em RubricasPorMuseu:', error);
          }
        }
      } catch (error) {
        console.warn('Usuário indisponível em RubricasPorMuseu:', error);
        if (active) setCurrentUser(null);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  const isCoordenador =
    !!currentUser &&
    ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const canEdit =
    isCoordenador ||
    userPermission?.pode_gerenciar_rubricas ||
    userPermission?.gestao_compras;

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      try {
        if (base44?.functions?.invoke) {
          await base44.functions.invoke('recalculateAllRubricas', {
            trigger: 'manual_refresh_rubricas_por_museu',
          });
        }
      } catch (error) {
        console.warn('recalculateAllRubricas indisponível:', error);
      }

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = Array.isArray(query.queryKey)
            ? query.queryKey.join('|').toLowerCase()
            : String(query.queryKey || '').toLowerCase();

          return (
            key.includes('rubrica') ||
            key.includes('budget') ||
            key.includes('compra') ||
            key.includes('purchase') ||
            key.includes('museu')
          );
        },
      });

      setRefreshNonce((prev) => prev + 1);
      toast.success('Rubricas atualizadas');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar rubricas');
    } finally {
      setIsRefreshing(false);
    }
  };

  const abaLabel = useMemo(() => {
    if (abaAtiva === 'NOTURNO') return 'Rubricas do Noturno';
    return `Rubricas do ${abaAtiva}`;
  }, [abaAtiva]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-black" />
              Rubricas por Museu
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Acompanhamento orçamentário consolidado por museu.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>

            {isCoordenador && (
              <>
                <Button
                  variant="outline"
                  className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl"
                  onClick={() => setShowGerenciar(true)}
                >
                  Gerenciar
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl"
                  onClick={() => setShowCardEditor(true)}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Editor de Cards
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Módulo"
            value="Ativo"
            helper="carregamento seguro"
            dark
          />
          <KpiCard
            label="Museus"
            value="3"
            helper="MHAB, MIS e MUMO"
          />
          <KpiCard
            label="Aba extra"
            value="Noturno"
            helper="filtro por rubrica"
          />
          <KpiCard
            label="Atualização"
            value={isRefreshing ? '...' : fmtCurrency(0)}
            helper="use Recalcular para sincronizar"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MUSEUS.map((museu) => (
            <MuseuResumoCard
              key={museu}
              museu={museu}
              active={abaAtiva === museu}
              onClick={() => setAbaAtiva(museu)}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-black">{abaLabel}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Somente a aba ativa é montada para evitar travamento do app.
              </p>
            </div>

            <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
              <TabsList className="grid grid-cols-4 bg-gray-100 rounded-xl p-1 w-[340px]">
                {ABAS.map((aba) => (
                  <TabsTrigger
                    key={aba}
                    value={aba}
                    className="text-xs font-semibold rounded-lg data-[state=active]:bg-black data-[state=active]:text-white"
                  >
                    {aba}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="m-0 p-4 bg-white">
            <ActiveRubricasEditor
              aba={abaAtiva}
              canEdit={canEdit}
              refreshNonce={refreshNonce}
            />
          </div>
        </div>

        {showGerenciar && (
          <GerenciarRubricasMuseuDialog
            open={showGerenciar}
            onClose={() => setShowGerenciar(false)}
          />
        )}

        {showCardEditor && (
          <CardRubricaEditor
            open={showCardEditor}
            onClose={() => setShowCardEditor(false)}
          />
        )}
      </div>
    </div>
  );
}
