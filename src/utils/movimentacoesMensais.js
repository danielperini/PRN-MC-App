const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const INICIO_PROJETO = '2026-02';

export const CREDITOS_EXTERNOS_CONFIRMADOS_2026 = Object.freeze({
  '2026-02': 1320000,
  '2026-06': 81719.85,
});

const num = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (valor == null || valor === '') return 0;
  let texto = String(valor).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  const negativo = texto.includes('-') || /\d[\d.,]*D$/i.test(texto);
  texto = texto.replace(/[CD]$/i, '').replace(/[^\d,.-]/g, '');
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  else if ((texto.match(/\./g) || []).length > 1) texto = texto.replace(/\./g, '');
  const numero = Number(texto.replace(/(?!^)-/g, ''));
  if (!Number.isFinite(numero)) return 0;
  return negativo ? -Math.abs(numero) : numero;
};
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const dataRegistro = (r) => String(r?.processado_em || r?.updated_date || r?.created_date || '');
const docId = (r, i = 0) => String(r?.drive_file_id || r?.id || `${r?.ano}-${r?.mes_num}-${i}`);

function descricao(l) {
  return norm([l?.descricao, l?.historico, l?.detalhe, l?.categoria_fluxo, l?.categoria].filter(Boolean).join(' '));
}
function indicadorCD(l) {
  const cd = norm(l?.indicador_cd || l?.natureza_cd || l?.credito_debito).replace(/[^cd]/g, '');
  return cd === 'c' ? 'C' : cd === 'd' ? 'D' : '';
}
function tipoLancamento(l) {
  const t = norm(l?.tipo || l?.tipo_sugerido);
  const cd = indicadorCD(l);
  if (t.includes('rend')) return 'rendimento';
  if (t.includes('cred') || t.includes('entrada') || cd === 'C') return 'credito';
  if (t.includes('deb') || t.includes('saida') || t.includes('pagamento') || cd === 'D') return 'debito';
  return t;
}
function nomeDocumento(r) {
  return norm([r?.drive_file_name, r?.file_name, r?.nome_arquivo].filter(Boolean).join(' '));
}

export function ehTransferenciaInterna(l) {
  if (l?.transferencia_interna === true) return true;
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('transferencia_interna') || categoria.includes('movimentacao_interna')) return true;
  const d = descricao(l);
  return /\bresg(?:ate| aut| automat| automatico)?\b/.test(d)
    || /\baplic(?:acao| automat| automatica| financeira)?\b/.test(d)
    || /\bapl(?:ic)?\b/.test(d)
    || ['transferencia entre contas', 'transf entre contas', 'transferencia conta corrente', 'transferencia para aplicacao', 'conta investimento', 'investimento para conta corrente', 'conta corrente para investimento', 'saldo aplicado', 'baixa aplicacao', 'aporte aplicacao', 'resgate fundo', 'resgate cdb', 'aplicacao cdb', 'aplicacao fundo', 'resg aut', 'resgate automat', 'aplic automat'].some((termo) => d.includes(termo));
}
function ehRendimento(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('rendimento')) return true;
  const d = descricao(l);
  return tipoLancamento(l) === 'rendimento' || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'correcao monetaria', 'rendimento bruto no mes', 'rendimento liquido no mes', 'resultado no mes'].some((termo) => d.includes(termo));
}
function ehEstorno(l) {
  const d = descricao(l);
  return ['devolucao', 'estorno', 'reembolso', 'cancelamento', 'reversao'].some((termo) => d.includes(termo));
}
function ehCreditoExterno(l) {
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('credito_externo')) return true;
  const d = descricao(l);
  return ['repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc', 'termo de colaboracao', 'convenio', 'subvencao'].some((termo) => d.includes(termo));
}
function ehDebitoOperacional(l) {
  if (ehTransferenciaInterna(l) || ehRendimento(l) || ehEstorno(l)) return false;
  const categoria = norm(l?.categoria || l?.categoria_fluxo);
  if (categoria.includes('debito_operacional')) return true;
  const d = descricao(l);
  return tipoLancamento(l) === 'debito' && (/\bdeb pix\b/.test(d) || d.includes('envio ted') || d.includes('envio tev') || d.includes('envio transf') || d.includes('pag boleto') || d.includes('pagamento') || d.includes('tarifa'));
}
function ehDocumentoRendimento(r) {
  if (r?._credito_confirmado) return false;
  const nome = nomeDocumento(r);
  if (['extrato mensal', 'extrato da conta', 'extrato conta', 'conta corrente'].some((termo) => nome.includes(termo))) return false;
  if (['rendimento', 'investimento', 'fundo', 'cdb', 'poupanca', 'aplicacao'].some((termo) => nome.includes(termo))) return true;
  if (r?.tipo === 'extrato_rendimento') return true;
  const lancamentos = r?.lancamentos || [];
  return lancamentos.length > 0 && lancamentos.every((l) => ehTransferenciaInterna(l) || ehRendimento(l));
}

export function parseDataLancamento(valor, anoFallback = null) {
  const texto = String(valor || '').trim();
  let match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let ano; let mes; let dia;
  if (match) [ano, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = texto.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (!match) return null;
    [dia, mes, ano] = [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : Number(anoFallback)];
    if (ano > 0 && ano < 100) ano += 2000;
  }
  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia, key: `${ano}-${String(mes).padStart(2, '0')}`, sortKey: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}
function competenciaDominanteLancamentos(r) {
  const anoFallback = Number(r?.ano_referencia || r?.ano || 2026);
  const contagem = new Map();
  (r?.lancamentos || []).forEach((l) => {
    const p = parseDataLancamento(l?.data, anoFallback);
    if (p) contagem.set(p.key, (contagem.get(p.key) || 0) + 1);
  });
  return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}
function competenciaDocumento(r) {
  const dominante = competenciaDominanteLancamentos(r);
  if (dominante) return dominante;
  const mesExtraido = Number(r?.mes_referencia || r?.mes_num);
  const anoExtraido = Number(r?.ano_referencia || r?.ano || 2026);
  if (anoExtraido && mesExtraido >= 1 && mesExtraido <= 12) return `${anoExtraido}-${String(mesExtraido).padStart(2, '0')}`;
  const nome = nomeDocumento(r);
  const nomeMatch = nome.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_/ ](20\d{2})(?:\D|$)/) || nome.match(/(20\d{2})[-_/ ](0?[1-9]|1[0-2])/);
  if (!nomeMatch) return null;
  const primeiro = Number(nomeMatch[1]);
  const segundo = Number(nomeMatch[2]);
  const ano = primeiro > 2000 ? primeiro : segundo;
  const mes = primeiro > 2000 ? segundo : primeiro;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function deduplicarRegistrosPorDocumento(lista = []) {
  const mapa = new Map();
  lista.forEach((r, i) => {
    const chave = docId(r, i);
    const atual = mapa.get(chave);
    if (!atual || dataRegistro(r) >= dataRegistro(atual)) mapa.set(chave, r);
  });
  return [...mapa.values()];
}
function chaveConta(r, i = 0) {
  const conta = String(r?.conta || '').replace(/\D/g, '');
  return `${ehDocumentoRendimento(r) ? 'investimento' : 'conta'}|${conta || norm(r?.banco) || i}`;
}
function rendimentoInformado(r) {
  const candidatos = [r?.total_rendimento, r?.rendimento_bruto_mes, r?.rendimento_bruto_no_mes, r?.rendimento_mes, r?.rendimentos, r?.rentabilidade_mes, r?.resultado_mes];
  for (const valor of candidatos) {
    const convertido = Math.abs(num(valor));
    if (convertido > 0) return convertido;
  }
  const resumo = String(r?.resumo_ia || '');
  const match = resumo.match(/(?:rendimento(?:\s+bruto|\s+liquido)?(?:\s+no)?\s+mes|total\s+de\s+rendimentos?)\D{0,30}(R\$\s*)?([\d.]+,\d{2}|\d+(?:\.\d{1,2})?)/i);
  return match ? Math.abs(num(match[2])) : 0;
}
function scoreDocumento(r) {
  const nome = nomeDocumento(r);
  const operacionais = (r?.lancamentos || []).filter(ehDebitoOperacional).length;
  let score = operacionais * 100 + (r?.lancamentos || []).length;
  if (nome.includes('extrato mensal')) score += 1000000;
  if (nome.includes('extrato da conta') || nome.includes('extrato conta')) score += 500000;
  if (nome.includes('rendimento') || nome.includes('investimento')) score += 250000;
  if (ehDocumentoRendimento(r) && rendimentoInformado(r) > 0) score += 2000000;
  if (ehDocumentoRendimento(r) && (Math.abs(num(r?.saldo_inicial)) > 0 || Math.abs(num(r?.saldo_final)) > 0)) score += 100000;
  if (r?.drive_file_id) score += 10000;
  return score;
}
function documentosCanonicos(registros, rendimento) {
  const mapa = new Map();
  registros.filter((r) => !r?._credito_confirmado && (rendimento ? ehDocumentoRendimento(r) : !ehDocumentoRendimento(r))).forEach((r, i) => {
    const chave = chaveConta(r, i);
    const atual = mapa.get(chave);
    if (!atual || scoreDocumento(r) > scoreDocumento(atual) || (scoreDocumento(r) === scoreDocumento(atual) && dataRegistro(r) > dataRegistro(atual))) mapa.set(chave, r);
  });
  return [...mapa.values()];
}
function lancamentosUnicos(registros) {
  const mapa = new Map();
  [...registros].sort((a, b) => scoreDocumento(b) - scoreDocumento(a)).forEach((r) => {
    const ocorrencias = new Map();
    (r?.lancamentos || []).forEach((l, indice) => {
      const base = [norm(l?.data), descricao(l), tipoLancamento(l), Math.abs(num(l?.valor)).toFixed(2), l?.saldo == null ? '' : num(l.saldo).toFixed(2)].join('|');
      const ocorrencia = (ocorrencias.get(base) || 0) + 1;
      ocorrencias.set(base, ocorrencia);
      const chave = `${base}|${ocorrencia}`;
      if (!mapa.has(chave)) mapa.set(chave, { ...l, tipo: tipoLancamento(l), valor: Math.abs(num(l?.valor)), _registro: r, _indice: indice });
    });
  });
  return [...mapa.values()];
}
function saldoFinal(r) {
  const comSaldo = (r?.lancamentos || []).filter((l) => l?.saldo != null);
  return comSaldo.length ? num(comSaldo[comSaldo.length - 1].saldo) : num(r?.saldo_final);
}
function rendimentoDoDocumento(r) {
  const informado = rendimentoInformado(r);
  if (informado > 0) return informado;
  const lancamentos = r?.lancamentos || [];
  const explicito = lancamentos.filter(ehRendimento).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  if (explicito > 0) return explicito;
  const saldoInicial = num(r?.saldo_inicial);
  const saldoFim = num(r?.saldo_final);
  if (!saldoInicial && !saldoFim) return 0;
  const aplicacoes = lancamentos.filter((l) => {
    const d = descricao(l);
    return ehTransferenciaInterna(l) && (indicadorCD(l) === 'C' || d.includes('aplicacao'));
  }).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const resgates = lancamentos.filter((l) => {
    const d = descricao(l);
    return ehTransferenciaInterna(l) && (indicadorCD(l) === 'D' || d.includes('resgate'));
  }).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const calculado = saldoFim - saldoInicial - aplicacoes + resgates;
  return calculado > 0 ? calculado : 0;
}
function fragmentar(lista = []) {
  return deduplicarRegistrosPorDocumento(lista).flatMap((r, indice) => {
    const competenciaBase = competenciaDocumento(r);
    const anoFallback = Number(r?.ano_referencia || r?.ano || competenciaBase?.slice(0, 4) || 2026);
    const porMes = new Map();
    const semData = [];

    (r?.lancamentos || []).forEach((lancamento) => {
      const parsed = parseDataLancamento(lancamento?.data, anoFallback);
      if (!parsed) {
        semData.push(lancamento);
        return;
      }
      if (!porMes.has(parsed.key)) porMes.set(parsed.key, []);
      porMes.get(parsed.key).push({ ...lancamento, data_bancaria_normalizada: parsed.sortKey });
    });

    const fallback = competenciaBase || [...porMes.keys()].sort()[0];
    if (semData.length && fallback) {
      if (!porMes.has(fallback)) porMes.set(fallback, []);
      porMes.get(fallback).push(...semData);
    }
    if (!porMes.size && fallback) porMes.set(fallback, []);

    const keys = [...porMes.keys()].filter((key) => key >= INICIO_PROJETO).sort();
    const ultimaCompetencia = keys[keys.length - 1];
    const tipoDocumento = ehDocumentoRendimento(r) ? 'extrato_rendimento' : 'extrato_conta';

    return keys.map((key) => {
      const [ano, mes] = key.split('-').map(Number);
      const recebeTotaisDocumento = key === (competenciaBase || ultimaCompetencia);
      const recebeSaldoFinal = key === ultimaCompetencia;
      return {
        ...r,
        tipo: tipoDocumento,
        ano,
        mes_num: mes,
        mes: MESES[mes],
        lancamentos: porMes.get(key) || [],
        saldo_inicial: key === keys[0] ? r?.saldo_inicial : 0,
        saldo_final: recebeSaldoFinal ? r?.saldo_final : null,
        total_rendimento: tipoDocumento === 'extrato_rendimento' && recebeTotaisDocumento ? r?.total_rendimento : 0,
        _documento_original_id: docId(r, indice),
        _competencia_documento: competenciaBase,
        _competencia_lancamentos: key,
      };
    });
  });
}

export function resumirRegistrosMensais(registros = []) {
  const contas = documentosCanonicos(registros, false);
  const investimentos = documentosCanonicos(registros, true);
  const lancamentos = lancamentosUnicos(contas);
  const primeiro = registros[0];
  const key = primeiro ? `${primeiro.ano}-${String(primeiro.mes_num || 0).padStart(2, '0')}` : '';
  const creditoConfirmado = CREDITOS_EXTERNOS_CONFIRMADOS_2026[key];
  const creditosBrutos = lancamentos.filter((l) => tipoLancamento(l) === 'credito').reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const creditosClassificados = lancamentos.filter((l) => tipoLancamento(l) === 'credito' && !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehEstorno(l) && ehCreditoExterno(l)).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const creditos = creditoConfirmado !== undefined ? creditoConfirmado : creditosClassificados;
  const debitosBrutos = lancamentos.filter((l) => tipoLancamento(l) === 'debito').reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const transferencias = lancamentos.filter(ehTransferenciaInterna).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const debitos = lancamentos.filter(ehDebitoOperacional).reduce((s, l) => s + Math.abs(num(l.valor)), 0);
  const rendimento = investimentos.reduce((s, r) => s + rendimentoDoDocumento(r), 0);
  const saldoConta = contas.reduce((s, r) => s + saldoFinal(r), 0);
  const saldoInvestimento = investimentos.reduce((s, r) => s + num(r?.saldo_final), 0);
  const saldoDocumental = saldoConta + saldoInvestimento;
  return {
    creditos, debitos, rendimento,
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
    if (!grupos.has(key)) grupos.set(key, { key, ano: registro.ano, mes_num: registro.mes_num, mes: MESES[registro.mes_num], registros: [] });
    grupos.get(key).registros.push(registro);
  });
  Object.keys(CREDITOS_EXTERNOS_CONFIRMADOS_2026).forEach((key) => {
    const [ano, mes] = key.split('-').map(Number);
    if (!grupos.has(key)) grupos.set(key, { key, ano, mes_num: mes, mes: MESES[mes], registros: [] });
    grupos.get(key).registros.push({ id: `credito-confirmado-${key}`, ano, mes_num: mes, mes: MESES[mes], tipo: 'credito_confirmado', lancamentos: [], _credito_confirmado: true });
  });
  grupos.forEach((grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    let contaAplicada = false;
    let rendimentoAplicado = false;
    grupo.registros = grupo.registros.map((r) => {
      if (r?._credito_confirmado) return r;
      if (!ehDocumentoRendimento(r)) {
        const aplicar = !contaAplicada;
        contaAplicada = true;
        return { ...r, tipo: 'extrato_conta', total_creditos: aplicar ? resumo.creditos : 0, total_debitos: aplicar ? resumo.debitos : 0, total_transferencias_internas: aplicar ? resumo.transferencias_internas_valor : 0, saldo_final: aplicar ? resumo.saldo : null, totais_ajustados_deterministicamente: true };
      }
      const aplicar = !rendimentoAplicado;
      rendimentoAplicado = true;
      return { ...r, tipo: 'extrato_rendimento', total_rendimento: aplicar ? resumo.rendimento : 0, totais_ajustados_deterministicamente: true };
    });
  });
  return [...grupos.values()].filter((grupo) => grupo.key >= INICIO_PROJETO).sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirGruposMensais(grupos = []) {
  return [...grupos].filter((grupo) => grupo.key >= INICIO_PROJETO).sort((a, b) => a.key.localeCompare(b.key)).reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;
    totais.debitos_brutos += resumo.debitos_brutos;
    totais.transferencias_internas += resumo.transferencias_internas_valor;
    totais.rendimento += resumo.rendimento;
    // saldo_final e saldo_investimento: usar o valor do mês mais recente com dados
    if (resumo.saldo !== 0 || resumo.saldo_conta !== 0 || resumo.saldo_investimento !== 0) {
      totais.saldo_final = resumo.saldo;
      totais.saldo_conta = resumo.saldo_conta;
      totais.saldo_investimento = resumo.saldo_investimento;
    }
    totais.documentos_ignorados_no_calculo += resumo.documentos_ignorados_no_calculo;
    return totais;
  }, { creditos: 0, debitos: 0, debitos_brutos: 0, transferencias_internas: 0, rendimento: 0, saldo_final: 0, saldo_conta: 0, saldo_investimento: 0, documentos_ignorados_no_calculo: 0 });
}