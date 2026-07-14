const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CREDITOS_2026 = Object.freeze({ '2026-02': 1320000, '2026-06': 81719.85 });

const num = (v) => Number.isFinite(Number(v || 0)) ? Number(v || 0) : 0;
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const dataRegistro = (r) => String(r?.processado_em || r?.updated_date || r?.created_date || '');
const docId = (r, i = 0) => String(r?.drive_file_id || r?.id || `${r?.ano}-${r?.mes_num}-${i}`);

function desc(l) {
  return norm([l?.descricao, l?.historico, l?.detalhe, l?.categoria_fluxo, l?.categoria].filter(Boolean).join(' '));
}

function tipo(l) {
  const t = norm(l?.tipo || l?.tipo_sugerido);
  const cd = norm(l?.indicador_cd || l?.natureza_cd || l?.credito_debito);
  if (t.includes('rend')) return 'rendimento';
  if (t.includes('cred') || t.includes('entrada') || cd === 'c') return 'credito';
  if (t.includes('deb') || t.includes('saida') || t.includes('pagamento') || cd === 'd') return 'debito';
  return t;
}

function nomeDoc(r) {
  return norm([r?.drive_file_name, r?.file_name, r?.nome_arquivo].filter(Boolean).join(' '));
}

export function ehTransferenciaInterna(l) {
  if (l?.transferencia_interna === true) return true;
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('transferencia_interna') || categoria.includes('movimentacao_interna')) return true;

  const d = desc(l);
  return /\bresg(?:ate| aut| automat)?\b/.test(d)
    || /\baplic(?:acao| automat| financeira)?\b/.test(d)
    || /\bapl(?:ic)?\b/.test(d)
    || [
      'transferencia entre contas', 'transf entre contas', 'conta investimento',
      'investimento para conta corrente', 'conta corrente para investimento',
      'movimentacao interna', 'saldo aplicado', 'baixa aplicacao',
      'aporte aplicacao', 'resgate fundo', 'resgate cdb', 'aplicacao cdb',
      'aplicacao fundo', 'resg aut', 'resgate automat', 'aplic automat',
    ].some((t) => d.includes(t));
}

function ehRendimento(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('rendimento')) return true;
  const d = desc(l);
  return tipo(l) === 'rendimento' || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'correcao monetaria', 'rendimento bruto no mes'].some((t) => d.includes(t));
}

function ehEstorno(l) {
  const d = desc(l);
  return ['devolucao', 'estorno', 'reembolso', 'cancelamento', 'reversao'].some((t) => d.includes(t));
}

function ehCreditoExterno(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('credito_externo')) return true;
  const d = desc(l);
  return ['repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc', 'termo de colaboracao', 'convenio', 'subvencao'].some((t) => d.includes(t));
}

function ehDebitoOperacional(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('debito_operacional')) return true;
  if (ehTransferenciaInterna(l) || ehRendimento(l) || ehEstorno(l)) return false;
  const d = desc(l);
  return tipo(l) === 'debito' && (
    /\bdeb pix\b/.test(d)
    || d.includes('envio ted')
    || d.includes('envio tev')
    || d.includes('envio transf')
    || d.includes('pag boleto')
    || d.includes('pagamento')
    || d.includes('tarifa')
    || !d
  );
}

function operacionais(r) {
  return (r?.lancamentos || []).filter(ehDebitoOperacional).length;
}

function ehDocRendimento(r) {
  const nome = nomeDoc(r);
  if (['extrato mensal', 'extrato da conta', 'extrato conta', 'conta corrente'].some((t) => nome.includes(t))) return false;
  if (['rendimento', 'investimento', 'fundo', 'cdb', 'poupanca'].some((t) => nome.includes(t))) return true;
  if (operacionais(r) > 0) return false;
  if (r?.tipo === 'extrato_rendimento') return true;
  const ls = r?.lancamentos || [];
  return ls.length > 0 && ls.every((l) => ehTransferenciaInterna(l) || ehRendimento(l));
}

export function parseDataLancamento(valor, anoFallback = null) {
  const s = String(valor || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let ano; let mes; let dia;
  if (m) [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (!m) return null;
    [dia, mes, ano] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : Number(anoFallback)];
    if (ano > 0 && ano < 100) ano += 2000;
  }
  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia, key: `${ano}-${String(mes).padStart(2, '0')}`, sortKey: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}

export function deduplicarRegistrosPorDocumento(lista = []) {
  const mapa = new Map();
  lista.forEach((r, i) => {
    const k = docId(r, i);
    const atual = mapa.get(k);
    if (!atual || dataRegistro(r) >= dataRegistro(atual)) mapa.set(k, r);
  });
  return [...mapa.values()];
}

function chaveConta(r, i = 0) {
  const conta = String(r?.conta || '').replace(/\D/g, '');
  return `${ehDocRendimento(r) ? 'investimento' : 'conta'}|${conta || norm(r?.banco) || i}`;
}

function scoreConta(r) {
  const n = nomeDoc(r);
  let s = operacionais(r) * 100 + (r?.lancamentos || []).length;
  if (n.includes('extrato mensal')) s += 1000000;
  if (n.includes('extrato da conta') || n.includes('extrato conta')) s += 500000;
  if (n.includes('conta corrente')) s += 250000;
  return s;
}

function canonicos(registros, rendimento) {
  const mapa = new Map();
  registros.filter((r) => rendimento ? ehDocRendimento(r) : !ehDocRendimento(r)).forEach((r, i) => {
    const k = chaveConta(r, i);
    const atual = mapa.get(k);
    if (!atual) return mapa.set(k, r);
    const melhor = rendimento
      ? dataRegistro(r) >= dataRegistro(atual)
      : scoreConta(r) > scoreConta(atual) || (scoreConta(r) === scoreConta(atual) && dataRegistro(r) > dataRegistro(atual));
    if (melhor) mapa.set(k, r);
  });
  return [...mapa.values()];
}

function lancamentosUnicos(registros) {
  const mapa = new Map();
  [...registros].sort((a, b) => scoreConta(b) - scoreConta(a)).forEach((r) => {
    const ocorrencias = new Map();
    (r.lancamentos || []).forEach((l, i) => {
      const base = [norm(l?.data), desc(l), tipo(l), Math.abs(num(l?.valor)).toFixed(2), l?.saldo == null ? '' : num(l.saldo).toFixed(2)].join('|');
      const oc = (ocorrencias.get(base) || 0) + 1;
      ocorrencias.set(base, oc);
      const k = `${base}|${oc}`;
      if (!mapa.has(k)) mapa.set(k, { ...l, tipo: tipo(l), valor: Math.abs(num(l?.valor)), _registro: r, _indice: i });
    });
  });
  return [...mapa.values()];
}

function saldoFinal(r) {
  const comSaldo = (r?.lancamentos || []).filter((l) => l?.saldo != null);
  return comSaldo.length ? num(comSaldo[comSaldo.length - 1].saldo) : num(r?.saldo_final);
}

function fragmentar(lista = []) {
  const out = [];
  deduplicarRegistrosPorDocumento(lista).forEach((r, idx) => {
    const porMes = new Map();
    (r.lancamentos || []).forEach((l) => {
      const p = parseDataLancamento(l?.data, Number(r.ano) || 2026);
      const k = p?.key || `${r.ano}-${String(r.mes_num || 0).padStart(2, '0')}`;
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      if (!porMes.has(k)) porMes.set(k, []);
      porMes.get(k).push(l);
    });
    if (!porMes.size && r.ano && r.mes_num) porMes.set(`${r.ano}-${String(r.mes_num).padStart(2, '0')}`, []);
    porMes.forEach((lancamentos, k) => {
      const [ano, mes] = k.split('-').map(Number);
      out.push({ ...r, tipo: ehDocRendimento(r) ? 'extrato_rendimento' : 'extrato_conta', ano, mes_num: mes, mes: MESES[mes], lancamentos, _documento_original_id: docId(r, idx) });
    });
  });
  return out;
}

export function resumirRegistrosMensais(registros = []) {
  const contas = canonicos(registros, false);
  const investimentos = canonicos(registros, true);
  const ls = lancamentosUnicos(contas);
  const primeiro = registros[0];
  const key = primeiro ? `${primeiro.ano}-${String(primeiro.mes_num || 0).padStart(2, '0')}` : '';
  const creditoConfirmado = CREDITOS_2026[key];
  const creditosBrutos = ls.filter((l) => tipo(l) === 'credito').reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const creditosClassificados = ls.filter((l) => tipo(l) === 'credito' && !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehEstorno(l) && ehCreditoExterno(l)).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const creditos = creditoConfirmado !== undefined ? creditoConfirmado : creditosClassificados;
  const debitosBrutos = ls.filter((l) => tipo(l) === 'debito').reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const transferencias = ls.filter(ehTransferenciaInterna).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const debitos = ls.filter(ehDebitoOperacional).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const rendimentoDoc = investimentos.reduce((s, r) => s + num(r.total_rendimento), 0);
  const rendimento = rendimentoDoc || investimentos.flatMap((r) => r.lancamentos || []).filter(ehRendimento).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const saldoConta = contas.reduce((s, r) => s + saldoFinal(r), 0);
  const saldoInvestimento = investimentos.reduce((s, r) => s + num(r.saldo_final), 0);
  const saldoDocumental = saldoConta + saldoInvestimento;

  return {
    creditos,
    debitos,
    rendimento,
    saldo: Math.abs(saldoDocumental) > 0.009 ? saldoDocumental : creditos - debitos + rendimento,
    saldo_conta: saldoConta,
    saldo_investimento: saldoInvestimento,
    saldo_sem_rendimento: saldoConta + Math.max(0, saldoInvestimento - rendimento),
    documentos: contas.length + investimentos.length,
    documentos_ignorados_no_calculo: Math.max(0, registros.length - contas.length - investimentos.length),
    lancamentos_unicos: ls.length,
    creditos_brutos: creditosBrutos,
    debitos_brutos: debitosBrutos,
    transferencias_internas_valor: transferencias,
    transferencias_internas_qtd: ls.filter(ehTransferenciaInterna).length,
    creditos_nao_operacionais: Math.max(0, creditosBrutos - creditos),
    debitos_nao_operacionais: Math.max(0, debitosBrutos - debitos),
    devolucoes_estornos_ignorados: ls.filter(ehEstorno).length,
    credito_confirmado: creditoConfirmado !== undefined,
  };
}

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();
  fragmentar(movimentacoes).forEach((r) => {
    const key = `${r.ano}-${String(r.mes_num).padStart(2, '0')}`;
    if (!grupos.has(key)) grupos.set(key, { key, ano: r.ano, mes_num: r.mes_num, mes: MESES[r.mes_num], registros: [] });
    grupos.get(key).registros.push(r);
  });
  grupos.forEach((g) => {
    const resumo = resumirRegistrosMensais(g.registros);
    let conta = false;
    let rend = false;
    g.registros = g.registros.map((r) => {
      if (!ehDocRendimento(r)) {
        const aplicar = !conta;
        conta = true;
        return { ...r, tipo: 'extrato_conta', total_creditos: aplicar ? resumo.creditos : 0, total_debitos: aplicar ? resumo.debitos : 0, total_transferencias_internas: aplicar ? resumo.transferencias_internas_valor : 0, saldo_final: aplicar ? resumo.saldo : null, totais_ajustados_deterministicamente: true };
      }
      const aplicar = !rend;
      rend = true;
      return { ...r, tipo: 'extrato_rendimento', total_rendimento: aplicar ? resumo.rendimento : 0, totais_ajustados_deterministicamente: true };
    });
  });
  return [...grupos.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirGruposMensais(grupos = []) {
  return [...grupos].sort((a, b) => a.key.localeCompare(b.key)).reduce((t, g) => {
    const r = resumirRegistrosMensais(g.registros);
    t.creditos += r.creditos;
    t.debitos += r.debitos;
    t.debitos_brutos += r.debitos_brutos;
    t.transferencias_internas += r.transferencias_internas_valor;
    t.rendimento += r.rendimento;
    t.saldo_final = r.saldo;
    t.saldo_conta = r.saldo_conta;
    t.saldo_investimento = r.saldo_investimento;
    t.documentos_ignorados_no_calculo += r.documentos_ignorados_no_calculo;
    return t;
  }, { creditos: 0, debitos: 0, debitos_brutos: 0, transferencias_internas: 0, rendimento: 0, saldo_final: 0, saldo_conta: 0, saldo_investimento: 0, documentos_ignorados_no_calculo: 0 });
}
