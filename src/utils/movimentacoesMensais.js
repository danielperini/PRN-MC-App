const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const CREDITOS_EXTERNOS_CONFIRMADOS_2026 = Object.freeze({
  '2026-02': 1320000,
  '2026-06': 81719.85,
});

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
  return /\bresg(?:ate| aut| automat| automatico)?\b/.test(d)
    || /\baplic(?:acao| automat| automatica| financeira)?\b/.test(d)
    || /\bapl(?:ic)?\b/.test(d)
    || [
      'transferencia entre contas', 'transf entre contas', 'conta investimento',
      'investimento para conta corrente', 'conta corrente para investimento',
      'movimentacao interna', 'saldo aplicado', 'baixa aplicacao', 'aporte aplicacao',
      'resgate fundo', 'resgate cdb', 'aplicacao cdb', 'aplicacao fundo',
      'resg aut', 'resgate automat', 'aplic automat', 'resgate automatico cliente',
    ].some((termo) => d.includes(termo));
}

function ehRendimento(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('rendimento')) return true;
  const d = desc(l);
  return tipo(l) === 'rendimento'
    || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'correcao monetaria', 'rendimento bruto no mes']
      .some((termo) => d.includes(termo));
}

function ehEstorno(l) {
  const d = desc(l);
  return ['devolucao', 'estorno', 'reembolso', 'cancelamento', 'reversao'].some((termo) => d.includes(termo));
}

function ehCreditoExterno(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('credito_externo')) return true;
  const d = desc(l);
  return ['repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc', 'termo de colaboracao', 'convenio', 'subvencao']
    .some((termo) => d.includes(termo));
}

function ehDebitoOperacional(l) {
  // A exclusão de resgates/aplicações sempre tem prioridade sobre qualquer categoria legada.
  if (ehTransferenciaInterna(l) || ehRendimento(l) || ehEstorno(l)) return false;

  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('debito_operacional')) return true;

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
  if (r?._credito_confirmado) return false;
  const nome = nomeDoc(r);
  if (['extrato mensal', 'extrato da conta', 'extrato conta', 'conta corrente'].some((termo) => nome.includes(termo))) return false;
  if (['rendimento', 'investimento', 'fundo', 'cdb', 'poupanca'].some((termo) => nome.includes(termo))) return true;
  if (operacionais(r) > 0) return false;
  if (r?.tipo === 'extrato_rendimento') return true;
  const lancamentos = r?.lancamentos || [];
  return lancamentos.length > 0 && lancamentos.every((l) => ehTransferenciaInterna(l) || ehRendimento(l));
}

export function parseDataLancamento(valor, anoFallback = null) {
  const texto = String(valor || '').trim();
  let match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let ano; let mes; let dia;

  if (match) {
    [ano, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = texto.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (!match) return null;
    [dia, mes, ano] = [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : Number(anoFallback)];
    if (ano > 0 && ano < 100) ano += 2000;
  }

  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    ano,
    mes,
    dia,
    key: `${ano}-${String(mes).padStart(2, '0')}`,
    sortKey: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  };
}

export function deduplicarRegistrosPorDocumento(lista = []) {
  const mapa = new Map();
  lista.forEach((registro, indice) => {
    const chave = docId(registro, indice);
    const atual = mapa.get(chave);
    if (!atual || dataRegistro(registro) >= dataRegistro(atual)) mapa.set(chave, registro);
  });
  return [...mapa.values()];
}

function competenciaDoNome(registro) {
  const nome = nomeDoc(registro);
  const match = nome.match(/(?:^|\D)(0?[1-9]|1[0-2])[\s._-]*(20\d{2})(?:\D|$)/);
  return match ? { mes: Number(match[1]), ano: Number(match[2]) } : null;
}

function competenciaDominanteLancamentos(registro) {
  const contagem = new Map();
  (registro?.lancamentos || []).forEach((lancamento) => {
    const data = parseDataLancamento(lancamento?.data, Number(registro?.ano) || 2026);
    if (!data) return;
    contagem.set(data.key, (contagem.get(data.key) || 0) + 1);
  });
  if (!contagem.size) return null;
  const [key] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  const [ano, mes] = key.split('-').map(Number);
  return { ano, mes };
}

function competenciaDocumento(registro) {
  const mesExtraido = Number(registro?.mes_referencia || registro?.competencia_mes || 0);
  const anoExtraido = Number(registro?.ano_referencia || registro?.competencia_ano || 0);
  if (mesExtraido >= 1 && mesExtraido <= 12 && anoExtraido >= 2000) return { mes: mesExtraido, ano: anoExtraido };

  const peloNome = competenciaDoNome(registro);
  if (peloNome) return peloNome;

  const dominante = competenciaDominanteLancamentos(registro);
  if (dominante) return dominante;

  return { mes: Number(registro?.mes_num), ano: Number(registro?.ano) };
}

function chaveConta(registro, indice = 0) {
  const conta = String(registro?.conta || '').replace(/\D/g, '');
  return `${ehDocRendimento(registro) ? 'investimento' : 'conta'}|${conta || norm(registro?.banco) || indice}`;
}

function scoreConta(registro) {
  const nome = nomeDoc(registro);
  let score = operacionais(registro) * 100 + (registro?.lancamentos || []).length;
  if (nome.includes('extrato mensal')) score += 1000000;
  if (nome.includes('extrato da conta') || nome.includes('extrato conta')) score += 500000;
  if (nome.includes('conta corrente')) score += 250000;
  return score;
}

function canonicos(registros, rendimento) {
  const mapa = new Map();
  registros
    .filter((registro) => !registro?._credito_confirmado && (rendimento ? ehDocRendimento(registro) : !ehDocRendimento(registro)))
    .forEach((registro, indice) => {
      const chave = chaveConta(registro, indice);
      const atual = mapa.get(chave);
      if (!atual) {
        mapa.set(chave, registro);
        return;
      }
      const melhor = rendimento
        ? dataRegistro(registro) >= dataRegistro(atual)
        : scoreConta(registro) > scoreConta(atual)
          || (scoreConta(registro) === scoreConta(atual) && dataRegistro(registro) > dataRegistro(atual));
      if (melhor) mapa.set(chave, registro);
    });
  return [...mapa.values()];
}

function lancamentosUnicos(registros) {
  const mapa = new Map();
  [...registros].sort((a, b) => scoreConta(b) - scoreConta(a)).forEach((registro) => {
    const ocorrencias = new Map();
    (registro.lancamentos || []).forEach((lancamento, indice) => {
      const base = [
        norm(lancamento?.data),
        desc(lancamento),
        tipo(lancamento),
        Math.abs(num(lancamento?.valor)).toFixed(2),
        lancamento?.saldo == null ? '' : num(lancamento.saldo).toFixed(2),
      ].join('|');
      const ocorrencia = (ocorrencias.get(base) || 0) + 1;
      ocorrencias.set(base, ocorrencia);
      const chave = `${base}|${ocorrencia}`;
      if (!mapa.has(chave)) mapa.set(chave, {
        ...lancamento,
        tipo: tipo(lancamento),
        valor: Math.abs(num(lancamento?.valor)),
        _registro: registro,
        _indice: indice,
      });
    });
  });
  return [...mapa.values()];
}

function saldoFinal(registro) {
  const comSaldo = (registro?.lancamentos || []).filter((lancamento) => lancamento?.saldo != null);
  return comSaldo.length ? num(comSaldo[comSaldo.length - 1].saldo) : num(registro?.saldo_final);
}

function fragmentar(lista = []) {
  return deduplicarRegistrosPorDocumento(lista).flatMap((registro, indice) => {
    const competencia = competenciaDocumento(registro);
    if (!competencia?.ano || !competencia?.mes || competencia.mes < 1 || competencia.mes > 12) return [];

    return [{
      ...registro,
      tipo: ehDocRendimento(registro) ? 'extrato_rendimento' : 'extrato_conta',
      ano: competencia.ano,
      mes_num: competencia.mes,
      mes: MESES[competencia.mes],
      lancamentos: Array.isArray(registro.lancamentos) ? registro.lancamentos : [],
      _documento_original_id: docId(registro, indice),
      _competencia_canonica: `${competencia.ano}-${String(competencia.mes).padStart(2, '0')}`,
    }];
  });
}

export function resumirRegistrosMensais(registros = []) {
  const contas = canonicos(registros, false);
  const investimentos = canonicos(registros, true);
  const lancamentos = lancamentosUnicos(contas);
  const primeiro = registros[0];
  const key = primeiro ? `${primeiro.ano}-${String(primeiro.mes_num || 0).padStart(2, '0')}` : '';
  const creditoConfirmado = CREDITOS_EXTERNOS_CONFIRMADOS_2026[key];

  const creditosBrutos = lancamentos.filter((l) => tipo(l) === 'credito').reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const creditosClassificados = lancamentos
    .filter((l) => tipo(l) === 'credito' && !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehEstorno(l) && ehCreditoExterno(l))
    .reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const creditos = creditoConfirmado !== undefined ? creditoConfirmado : creditosClassificados;

  const debitosBrutos = lancamentos.filter((l) => tipo(l) === 'debito').reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const transferencias = lancamentos.filter(ehTransferenciaInterna).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const debitos = lancamentos.filter(ehDebitoOperacional).reduce((s, l) => s + Math.abs(num(l.valor)), 0);

  const rendimentoDocumental = investimentos.reduce((s, registro) => s + num(registro.total_rendimento), 0);
  const rendimento = rendimentoDocumental || investimentos
    .flatMap((registro) => registro.lancamentos || [])
    .filter(ehRendimento)
    .reduce((s, l) => s + Math.abs(num(l.valor)), 0);

  const saldoConta = contas.reduce((s, registro) => s + saldoFinal(registro), 0);
  const saldoInvestimento = investimentos.reduce((s, registro) => s + num(registro.saldo_final), 0);
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
    documentos_ignorados_no_calculo: Math.max(0, registros.filter((r) => !r?._credito_confirmado).length - contas.length - investimentos.length),
    lancamentos_unicos: lancamentos.length,
    creditos_brutos: creditosBrutos,
    debitos_brutos: debitosBrutos,
    transferencias_internas_valor: transferencias,
    transferencias_internas_qtd: lancamentos.filter(ehTransferenciaInterna).length,
    creditos_nao_operacionais: Math.max(0, creditosBrutos - creditos),
    debitos_nao_operacionais: Math.max(0, debitosBrutos - debitos),
    devolucoes_estornos_ignorados: lancamentos.filter(ehEstorno).length,
    credito_confirmado: creditoConfirmado !== undefined,
    extrato_conta_presente: contas.length > 0,
    extrato_rendimento_presente: investimentos.length > 0,
  };
}

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();

  fragmentar(movimentacoes).forEach((registro) => {
    const key = `${registro.ano}-${String(registro.mes_num).padStart(2, '0')}`;
    if (!grupos.has(key)) grupos.set(key, {
      key,
      ano: registro.ano,
      mes_num: registro.mes_num,
      mes: MESES[registro.mes_num],
      registros: [],
    });
    grupos.get(key).registros.push(registro);
  });

  Object.keys(CREDITOS_EXTERNOS_CONFIRMADOS_2026).forEach((key) => {
    const [ano, mes] = key.split('-').map(Number);
    if (!grupos.has(key)) grupos.set(key, { key, ano, mes_num: mes, mes: MESES[mes], registros: [] });
    grupos.get(key).registros.push({
      id: `credito-confirmado-${key}`,
      ano,
      mes_num: mes,
      mes: MESES[mes],
      tipo: 'credito_confirmado',
      lancamentos: [],
      _credito_confirmado: true,
    });
  });

  grupos.forEach((grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    let contaAplicada = false;
    let rendimentoAplicado = false;

    grupo.registros = grupo.registros.map((registro) => {
      if (registro?._credito_confirmado) return registro;
      if (!ehDocRendimento(registro)) {
        const aplicar = !contaAplicada;
        contaAplicada = true;
        return {
          ...registro,
          tipo: 'extrato_conta',
          total_creditos: aplicar ? resumo.creditos : 0,
          total_debitos: aplicar ? resumo.debitos : 0,
          total_transferencias_internas: aplicar ? resumo.transferencias_internas_valor : 0,
          saldo_final: aplicar ? resumo.saldo : null,
          totais_ajustados_deterministicamente: true,
        };
      }

      const aplicar = !rendimentoAplicado;
      rendimentoAplicado = true;
      return {
        ...registro,
        tipo: 'extrato_rendimento',
        total_rendimento: aplicar ? resumo.rendimento : 0,
        totais_ajustados_deterministicamente: true,
      };
    });
  });

  return [...grupos.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirGruposMensais(grupos = []) {
  return [...grupos].sort((a, b) => a.key.localeCompare(b.key)).reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;
    totais.debitos_brutos += resumo.debitos_brutos;
    totais.transferencias_internas += resumo.transferencias_internas_valor;
    totais.rendimento += resumo.rendimento;
    totais.saldo_final = resumo.saldo;
    totais.saldo_conta = resumo.saldo_conta;
    totais.saldo_investimento = resumo.saldo_investimento;
    totais.documentos_ignorados_no_calculo += resumo.documentos_ignorados_no_calculo;
    return totais;
  }, {
    creditos: 0,
    debitos: 0,
    debitos_brutos: 0,
    transferencias_internas: 0,
    rendimento: 0,
    saldo_final: 0,
    saldo_conta: 0,
    saldo_investimento: 0,
    documentos_ignorados_no_calculo: 0,
  });
}
