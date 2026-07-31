import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, CheckCircle, XCircle, ExternalLink, Search, X, FileCode2, AlertCircle, Loader2, RefreshCw, Filter, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Status de intakes que devem ser OCULTADOS da fila (já resolvidos)
const STATUS_OCULTAR_INTAKE = new Set([
  'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO', 'APROVADO_FINANCEIRO',
  'REJEITADO', 'CANCELADO', 'DELETADO', 'ENVIADO_APROVACAO'
]);
// Status de compras já tratadas (para cruzamento por chave fiscal)
const STATUS_COMPRAS_JA_TRATADAS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO', 'RECUSADO', 'CANCELADO']);
// Status que ainda precisam de atenção — excluímos da query diretamente os já resolvidos
const STATUS_PENDENTES = ['AGUARDANDO_REVISAO', 'ANALISANDO_IA', 'RASCUNHO', 'ENVIADO'];
// Status de PurchaseRequest que indicam item já pago/aprovado definitivamente
const STATUS_PR_RESOLVIDOS = new Set(['APROVADO_ADMIN', 'PAGO', 'RECUSADO', 'CANCELADO']);

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}
function normalizar(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
function digitos(v) { return String(v || '').replace(/\D/g, ''); }
function numero(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
function dados(intake) { return intake.data || intake; }
function resultado(intake) { return dados(intake).resultado_ia || intake.resultado_ia || {}; }
function xmlUrl(intake) { const d = dados(intake); const ia = resultado(intake); return d.nf_xml_url || intake.nf_xml_url || ia.drive_xml_url || ia.arquivos_fiscais?.xml || ''; }
function pdfUrl(intake) { const d = dados(intake); const ia = resultado(intake); return d.arquivo_original_url || intake.arquivo_original_url || ia.drive_pdf_url || ia.arquivos_fiscais?.pdf || ''; }
function chaveFiscal(item) {
  const d = dados(item); const ia = resultado(item);
  const chave = digitos(d.nf_chave_acesso || d.chave_acesso || item.nf_chave_acesso || ia.nf_chave_acesso);
  if (chave.length === 44) return `chave:${chave}`;
  const cnpj = digitos(d.nf_emitente_cpf_cnpj || d.fornecedor_cpf_cnpj || d.cnpj_fornecedor || item.fornecedor_cpf_cnpj || ia.nf_emitente_cpf_cnpj);
  const nf = digitos(d.nf_numero || d.numero_nota || d.numero_nf || item.nf_numero || ia.nf_numero);
  const valor = numero(d.nf_valor_total || d.valor_total || d.valor || item.nf_valor_total || ia.nf_valor_total).toFixed(2);
  const nome = normalizar(d.nf_emitente_nome || d.fornecedor_nome || item.fornecedor_nome || ia.nf_emitente_nome);
  if (cnpj && nf) return `cnpj-nf:${cnpj}:${nf}`;
  if (nf && valor !== '0.00') return `nf-valor:${nf}:${valor}:${nome}`;
  const arquivo = normalizar(d.file_name_final || d.file_name_original || item.file_name_final || item.file_name_original)
    .replace(/\.(pdf|xml)$/i, '').replace(/\b(comp|comprovante|xml|pdf)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  return arquivo ? `arquivo:${arquivo}` : `id:${item.id}`;
}
function ehNotaFiscal(item) {
  const d = dados(item); const ia = resultado(item);
  const nome = normalizar(d.file_name_final || d.file_name_original || item.file_name_final || item.file_name_original);
  const tipo = normalizar(d.tipo_detectado || item.tipo_detectado || ia.tipo_documento);
  const naoFiscal = ['extrato', 'rendimento', 'comprovante', 'recibo', 'devolucao', 'estorno', 'orcamento', 'contrato', 'aditivo', 'icon.png', 'image.png', 'bandeirola', 'cartaz', 'instagram', 'cracha', 'rider', '.jpg', '.jpeg', '.png', '.docx'].some(t => nome.includes(t));
  if (naoFiscal) return false;
  const temNumero = !!digitos(d.nf_numero || d.numero_nota || item.nf_numero || ia.nf_numero);
  const temChave = digitos(d.nf_chave_acesso || item.nf_chave_acesso || ia.nf_chave_acesso).length === 44;
  const temPdf = !!pdfUrl(item) && /\.pdf($|\?)/i.test(pdfUrl(item)) || /\.pdf$/i.test(nome);
  return (tipo.includes('nota_fiscal') || tipo.includes('nf') || temNumero || temChave || /\bnf\b/.test(nome)) && !!temPdf;
}
function scoreItem(item) { const status = String(item.status_processamento || '').toUpperCase(); return (STATUS_OCULTAR_INTAKE.has(status) ? 100 : 0) + (pdfUrl(item) ? 10 : 0) + (xmlUrl(item) ? 5 : 0) + (item.updated_date ? 1 : 0); }
function deduplicar(items) {
  const map = new Map();
  for (const item of items) {
    if (!ehNotaFiscal(item)) continue;
    const key = chaveFiscal(item); const atual = map.get(key);
    if (!atual || scoreItem(item) > scoreItem(atual) || String(item.updated_date || '') > String(atual.updated_date || '')) map.set(key, item);
  }
  return Array.from(map.values());
}

function StatusXML({ intake }) {
  return xmlUrl(intake)
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 rounded-full px-2.5 py-1"><FileCode2 className="w-3 h-3" /> XML vinculado</span>
    : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-100 rounded-full px-2.5 py-1"><AlertCircle className="w-3 h-3" /> XML faltante</span>;
}

function NFCard({ intake, onAprovar, onRejeitar, processando, canSeeAll }) {
  const d = dados(intake); const ia = resultado(intake);
  const xml = xmlUrl(intake); const pdf = pdfUrl(intake);
  const valor = d.nf_valor_total || d.valor_total || intake.nf_valor_total || ia.nf_valor_total;
  const fornecedor = d.nf_emitente_nome || d.fornecedor_nome || intake.fornecedor_nome || ia.nf_emitente_nome || '—';
  const numeroNF = d.nf_numero || d.numero_nota || intake.nf_numero || ia.nf_numero;
  const centro = d.centro_custo || intake.centro_custo;
  const rubrica = d.rubrica_nome_sugerida || ia.rubrica_nome_sugerida || '';
  const fileName = d.file_name_final || d.file_name_original || intake.file_name_final || intake.file_name_original || '—';
  const score = ia.score_confiabilidade ?? ia.response?.score_confiabilidade;
  const solicitante = d.user_name || intake.user_name || d.user_email || intake.user_email || '';

  return <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${xml ? 'border-gray-200' : 'border-orange-200'}`}>
    <div className={`h-1 ${xml ? 'bg-green-400' : 'bg-orange-400'}`} />
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-900 truncate" title={fileName}>{fileName}</p><p className="text-xs text-gray-400 truncate mt-0.5">{fornecedor}</p>{canSeeAll && solicitante && <p className="text-xs text-blue-600 font-medium mt-0.5">👤 {solicitante}</p>}<div className="flex gap-2 mt-2 flex-wrap"><StatusXML intake={intake} />{numeroNF && <span className="text-[10px] bg-gray-100 rounded-full px-2 py-1">NF {numeroNF}</span>}{score != null && <span className="text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-1">IA {Number(score) <= 1 ? Math.round(Number(score) * 100) : Math.round(Number(score))}%</span>}</div></div><div className="text-right shrink-0"><p className="text-lg font-bold">{fmtBRL(valor)}</p>{centro && <span className="text-[10px] bg-gray-100 rounded-full px-2 py-1">{centro}</span>}</div></div>
      {rubrica && <p className="text-[11px] text-gray-500"><b>Rubrica:</b> {rubrica}</p>}
      <div className="flex gap-2 flex-wrap">{pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5"><ExternalLink className="w-3 h-3" />Ver PDF</a>}{xml && <a href={xml} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5"><FileCode2 className="w-3 h-3" />Ver XML</a>}</div>
      <div className="flex gap-2 pt-3 border-t"><Button size="sm" disabled={processando === intake.id} onClick={() => onAprovar(intake)} className="flex-1 bg-green-600 hover:bg-green-700 rounded-xl">{processando === intake.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Aprovar</Button><Button size="sm" variant="outline" disabled={processando === intake.id} onClick={() => onRejeitar(intake)} className="flex-1 border-red-200 text-red-600 rounded-xl"><XCircle className="w-4 h-4" /> Rejeitar</Button></div>
    </div>
  </div>;
}

export default function AprovacaoNFs() {
  const [busca, setBusca] = useState('');
  const [filtroXml, setFiltroXml] = useState('todos');
  const [processando, setProcessando] = useState(null);
  const [limpando, setLimpando] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['current-user-aprovacao'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: userPermissionData } = useQuery({
    queryKey: ['user-permission-aprovacao', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const perms = await base44.entities.UserPermission.filter({ user_email: currentUser.email });
      return perms?.[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
  });
  const canSeeAll = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const base = String(userPermissionData?.base_role || '').toUpperCase();
    return base.includes('COORD') || base.includes('ADMIN');
  }, [currentUser, userPermissionData]);

  const { data: intakesBrutos = [], isLoading, refetch } = useQuery({
    queryKey: ['intakes-aprovacao', canSeeAll, currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      if (canSeeAll) {
        return (await Promise.all(STATUS_PENDENTES.map(status => base44.entities.DocumentIntake.filter({ status_processamento: status }, '-created_date', 3000)))).flat();
      } else {
        return (await Promise.all(STATUS_PENDENTES.map(status => base44.entities.DocumentIntake.filter({ status_processamento: status, user_email: currentUser.email }, '-created_date', 3000)))).flat();
      }
    },
    enabled: !!currentUser,
    staleTime: 60000,
  });
  const { data: aprovadosIntake = [], refetch: refetchAprovados } = useQuery({
    queryKey: ['intakes-aprovados'],
    queryFn: async () => (await Promise.all(['APROVADO'].map(status => base44.entities.DocumentIntake.filter({ status_processamento: status }, '-created_date', 3000)))).flat(),
    staleTime: 60000,
  });
  const { data: compras = [], refetch: refetchCompras } = useQuery({
    queryKey: ['compras-tratadas-fila-nf'],
    queryFn: async () => {
      const resultados = await Promise.all(
        [...STATUS_COMPRAS_JA_TRATADAS].map(status =>
          base44.entities.PurchaseRequest.filter({ status }, '-created_date', 3000)
        )
      );
      return resultados.flat();
    },
    staleTime: 60000,
  });

  // PurchaseRequests diretamente marcadas como pagas ou aprovadas definitivamente
  const { data: prResolvidas = [] } = useQuery({
    queryKey: ['pr-resolvidas-fila-nf'],
    queryFn: async () => {
      const resultados = await Promise.all(
        [...STATUS_PR_RESOLVIDOS].map(status =>
          base44.entities.PurchaseRequest.filter({ status }, '-created_date', 3000)
        )
      );
      return resultados.flat();
    },
    staleTime: 60000,
  });

  const chavesAprovadas = useMemo(() => {
    const set = new Set(aprovadosIntake.map(chaveFiscal));
    compras.filter(p => STATUS_COMPRAS_JA_TRATADAS.has(String(p.status || '').toUpperCase())).forEach(p => set.add(chaveFiscal(p)));
    // Também excluir por ID direto de PurchaseRequests já resolvidas
    prResolvidas.forEach(p => {
      set.add(chaveFiscal(p));
      if (p.nf_chave_acesso) set.add(`chave:${digitos(p.nf_chave_acesso)}`);
    });
    return set;
  }, [aprovadosIntake, compras, prResolvidas]);

  // Mapa de IDs de PurchaseRequests já resolvidas para lookup O(1)
  const prResolvidasIds = useMemo(() => new Set(prResolvidas.map(p => p.id)), [prResolvidas]);

  const intakes = useMemo(() => {
    const dedup = deduplicar(intakesBrutos);
    return dedup.filter(i => {
      const d = dados(i);
      const status = String(d.status_processamento || i.status_processamento || '').toUpperCase();
      // 1. Status do próprio intake já resolvido
      if (STATUS_OCULTAR_INTAKE.has(status)) return false;
      // 2. Chave fiscal já consta em intake aprovado ou compra tratada
      if (chavesAprovadas.has(chaveFiscal(i))) return false;
      // 3. PR vinculado diretamente já está pago/aprovado definitivamente
      const prId = d.entidade_destino_id || i.entidade_destino_id;
      if (prId && prResolvidasIds.has(prId)) return false;
      return true;
    });
  }, [intakesBrutos, chavesAprovadas, prResolvidasIds]);
  const filtrados = useMemo(() => intakes.filter(item => {
    const temXml = !!xmlUrl(item);
    if (filtroXml === 'com_xml' && !temXml) return false;
    if (filtroXml === 'sem_xml' && temXml) return false;
    if (!busca) return true;
    const d = dados(item); const b = normalizar(busca);
    return [d.file_name_final, d.file_name_original, d.nf_emitente_nome, d.fornecedor_nome, d.nf_numero].some(v => normalizar(v).includes(b));
  }), [intakes, busca, filtroXml]);
  const comXml = intakes.filter(i => !!xmlUrl(i)).length;
  const semXml = intakes.length - comXml;
  const ocultadas = Math.max(0, intakesBrutos.length - intakes.length);
  // Contagem de intakes ocultos por já estarem aprovados/pagos via PR vinculado
  const ocultadasPorPR = useMemo(() =>
    deduplicar(intakesBrutos).filter(i => {
      const d = dados(i);
      const prId = d.entidade_destino_id || i.entidade_destino_id;
      return prId && prResolvidasIds.has(prId);
    }).length,
  [intakesBrutos, prResolvidasIds]);

  const { refetch: refetchPrResolvidas } = useQuery({ queryKey: ['pr-resolvidas-fila-nf'], enabled: false });
  async function atualizarTudo() { await Promise.all([refetch(), refetchAprovados(), refetchCompras(), refetchPrResolvidas()]); }
  async function limparFila() {
    setLimpando(true);
    try {
      // 1. Buscar XMLs faltantes no Drive e vincular
      const buscaXml = await base44.functions.invoke('buscarXmlsFaltantesNFs', {});
      // 2. Limpar fila (aprovados, duplicados, não fiscais)
      const limpeza = await base44.functions.invoke('limparFilaAprovacaoNFs', {});

      // 3. Após vincular XMLs, recarregar para ver quem ainda está sem XML
      await atualizarTudo();

      // 4. Retirar da fila as NFs que continuam sem XML (ocultar silenciosamente)
      const semXmlAinda = intakesBrutos.filter(i => ehNotaFiscal(i) && !xmlUrl(i));
      let retiradosSemXml = 0;
      if (semXmlAinda.length > 0) {
        await Promise.allSettled(
          semXmlAinda.map(i =>
            base44.entities.DocumentIntake.update(i.id, { ocultar_entrada_unica: true })
          )
        );
        retiradosSemXml = semXmlAinda.length;
      }

      const xr = buscaXml?.data?.resumo || buscaXml?.resumo || {};
      const lr = limpeza?.data?.resumo || limpeza?.resumo || {};
      toast.success(
        `${xr.xmls_vinculados || 0} XML(s) vinculado(s) · ${lr.ja_aprovados_retirados || 0} já aprovada(s) retirada(s) · ${lr.duplicados_arquivados || 0} duplicata(s) · ${retiradosSemXml} sem XML retirada(s) da fila`,
        { duration: 12000 }
      );
      await atualizarTudo();
    } catch (e) { toast.error('Erro na limpeza: ' + (e?.message || String(e)), { duration: 12000 }); }
    finally { setLimpando(false); }
  }
  async function handleAprovar(intake) {
    setProcessando(intake.id);
    try { await base44.entities.DocumentIntake.update(intake.id, { status_processamento: 'APROVADO' }); const prId = intake.data?.purchase_request_id || intake.entidade_destino_id; if (prId) await base44.entities.PurchaseRequest.update(prId, { status: 'APROVADO_COORD' }); toast.success('NF aprovada com sucesso!'); await atualizarTudo(); }
    catch (e) { toast.error('Erro ao aprovar: ' + (e?.message || String(e))); }
    finally { setProcessando(null); }
  }
  async function handleRejeitar(intake) {
    setProcessando(intake.id);
    try { await base44.entities.DocumentIntake.update(intake.id, { status_processamento: 'REJEITADO' }); toast.success('NF rejeitada.'); await atualizarTudo(); }
    catch (e) { toast.error('Erro ao rejeitar: ' + (e?.message || String(e))); }
    finally { setProcessando(null); }
  }

  return <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-white" /></div><div><h1 className="text-xl font-bold">Aprovação de NFs</h1><p className="text-sm text-gray-400">Somente notas fiscais únicas, ainda não aprovadas, com PDF e controle de XML por mês</p></div></div><div className="flex gap-2"><Button onClick={limparFila} disabled={limpando} className="gap-2 rounded-xl bg-slate-900">{limpando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}Revisar fila e buscar XMLs</Button><Button onClick={atualizarTudo} variant="outline" className="gap-2 rounded-xl"><RefreshCw className="w-4 h-4" />Atualizar</Button></div></div>
    {(ocultadas > 0 || ocultadasPorPR > 0) && (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-start gap-2">
        <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
        <span>
          {ocultadas > 0 && <><b>{ocultadas}</b> registro(s) aprovado(s), duplicado(s) ou não fiscal(is) ocultados automaticamente. </>}
          {ocultadasPorPR > 0 && <><b>{ocultadasPorPR}</b> NF(s) ocultadas por já estarem pagas/aprovadas no módulo de compras.</>}
        </span>
      </div>
    )}
    <div className="grid grid-cols-3 gap-3"><div className="rounded-2xl border bg-white p-4 text-center"><p className="text-2xl font-bold">{intakes.length}</p><p className="text-xs text-gray-400">Aguardando</p></div><div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center"><p className="text-2xl font-bold text-green-700">{comXml}</p><p className="text-xs text-green-600">Com XML</p></div><div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center"><p className="text-2xl font-bold text-orange-600">{semXml}</p><p className="text-xs text-orange-500">XML faltante</p></div></div>
    <div className="flex gap-3 flex-wrap"><div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, fornecedor, número…" className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border" />{busca && <button onClick={() => setBusca('')} className="absolute right-2.5 top-2.5"><X className="w-4 h-4" /></button>}</div><div className="flex gap-2">{[['todos','Todos'],['com_xml','Com XML'],['sem_xml','XML faltante']].map(([key,label]) => <button key={key} onClick={() => setFiltroXml(key)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${filtroXml===key?'bg-slate-900 text-white':'bg-white text-gray-500'}`}><Filter className="w-3 h-3" />{label}</button>)}</div></div>
    {isLoading ? <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300" /></div> : filtrados.length === 0 ? <div className="rounded-2xl border-2 border-dashed py-16 text-center"><CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="font-semibold text-gray-500">Nenhuma NF pendente única</p></div> : <><p className="text-xs text-gray-400">{filtrados.length} nota(s) fiscal(is) encontrada(s)</p><div className="grid gap-4 sm:grid-cols-2">{filtrados.map(intake => <NFCard key={intake.id} intake={intake} onAprovar={handleAprovar} onRejeitar={handleRejeitar} processando={processando} canSeeAll={canSeeAll} />)}</div></>}
  </div>;
}