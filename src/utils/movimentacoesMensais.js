const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Valores confirmados pelo responsável financeiro. Em 2026, somente estes repasses
// representam entrada nova de recursos no projeto. Aplicações, resgates, rendimentos,
// devoluções e transferências entre conta corrente e investimento não entram como crédito.
const CREDITOS_EXTERNOS_CONFIRMADOS_2026 = Object.freeze({
  '2026-02': 1320000,
  '2026-06': 81700,
});

function numero(valor) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function dataRegistro(registro) {
  return String(registro.processado_em || registro.updated_date || registro.created_date || '');
}

function chaveDocumento(registro, index) {
  return String(registro.drive_file_id || registro.id || `${registro.ano}-${registro.mes_num}-${index}`);
}

function tipoLancamento(lancamento) {
  const tipo = normalizar(lancamento?.tipo);
  if (tipo.includes('rend')) return 'rendimento';
  if (tipo.includes('cred') || tipo.includes('entrada')) return 'credito';
  if (tipo.includes('deb') || tipo.includes('saida') || tipo.includes('pagamento')) return 'debito';
  return tipo;
}

function descricaoLancamento(lancamento) {
  return normalizar([
    lancamento?.descricao,
    lancamento?.historico,
    lancamento?.detalhe,
    lancamento?.categoria_fluxo,
  ].filter(Boolean).join(' '));
}

function ehTransferenciaInterna(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return [
    'aplicacao financeira', 'aplicacao automatica', 'aplicacao cdb', 'aplicacao fundo',
    'resgate aplicacao', 'resgate automatico', 'resgate cdb', 'resgate fundo',
    'transferencia entre contas', 'transf entre contas', 'conta investimento',
    'conta corrente para investimento', 'investimento para conta corrente',
    'movimentacao interna', 'saldo aplicado', 'aporte aplicacao', 'baixa aplicacao',
    'aplicacao de saldo', 'resgate de investimento', 'transferencia para aplicacao',
    'transferencia da aplicacao',
  ].some(termo => descricao.includes(termo));
}

function ehRendimento(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return tipoLancamento(lancamento) === 'rendimento'
    || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'atualizacao monetaria', 'correcao monetaria'].some(termo => descricao.includes(termo));
}

function ehDevolucaoOuEstorno(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return ['devolucao', 'estorno', 'reembolso', 'credito devolvido', 'cancelamento', 'reversao'].some(termo => descricao.includes(termo));
}

function ehCreditoExternoPorDescricao(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return [
    'repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc',
    'termo de colaboracao', 'parceria', 'convenio', 'subvencao', 'aporte do projeto',
  ].some(termo => descricao.includes(termo));
}

function fingerprintLancamento(lancamento, registro) {
  return [
    normalizar(lancamento?.data),
    descricaoLancamento(lancamento),
    tipoLancamento(lancamento),
    Math.abs(numero(lancamento?.valor)).toFixed(2),
    String(registro?.conta || registro?.banco || '').replace(/\D/g, ''),
  ].join('|');
}

function lancamentosUnicos(registros) {
  const map = new Map();
  registros.forEach(registro => {
    (registro.lancamentos || []).forEach(lancamento => {
      const key = fingerprintLancamento(lancamento, registro);
      if (!map.has(key)) map.set(key, { ...lancamento, _registro: registro });
    });
  });
  return Array.from(map.values());
}

function chaveMes(registros) {
  const primeiro = registros.find(Boolean);
  const ano = Number(primeiro?.ano);
  const mes = Number(primeiro?.mes_num);
  if (!ano || mes < 1 || mes > 12) return null;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function parseDataLancamento(valor, anoFallback = null) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  let ano; let mes; let dia;
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    ano = Number(iso[1]); mes = Number(iso[2]); dia = Number(iso[3]);
  } else {
    const br = texto.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (!br) return null;
    dia = Number(br[1]); mes = Number(br[2]); ano = br[3] ? Number(br[3]) : Number(anoFallback);
    if (ano > 0 && ano < 100) ano += 2000;
  }
  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia, key: `${ano}-${String(mes).padStart(2, '0')}`, sortKey: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}

export function deduplicarRegistrosPorDocumento(movimentacoes = []) {
  const porDocumento = new Map();
  movimentacoes.forEach((registro, index) => {
    const chave = chaveDocumento(registro, index);
    const atual = porDocumento.get(chave);
    if (!atual || dataRegistro(registro) >= dataRegistro(atual)) porDocumento.set(chave, registro);
  });
  return Array.from(porDocumento.values());
}

export function resumirRegistrosMensais(registros = []) {
  const unicos = deduplicarRegistrosPorDocumento(registros);
  const conta = unicos.filter(r => r.tipo === 'extrato_conta');
  const rend = unicos.filter(r => r.tipo === 'extrato_rendimento');
  const lancamentos = lancamentosUnicos(conta);
  const mesKey = chaveMes(unicos);

  const creditosBrutos = lancamentos
    .filter(l => tipoLancamento(l) === 'credito')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const creditosClassificados = lancamentos
    .filter(l => tipoLancamento(l) === 'credito')
    .filter(l => !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehDevolucaoOuEstorno(l))
    .filter(ehCreditoExternoPorDescricao)
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const creditoConfirmado = mesKey ? CREDITOS_EXTERNOS_CONFIRMADOS_2026[mesKey] : undefined;
  const creditos = creditoConfirmado !== undefined ? creditoConfirmado : creditosClassificados;

  const debitosBrutos = lancamentos
    .filter(l => tipoLancamento(l) === 'debito')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const debitos = lancamentos
    .filter(l => tipoLancamento(l) === 'debito')
    .filter(l => !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehDevolucaoOuEstorno(l))
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const rendimentoLancamentos = lancamentos
    .filter(ehRendimento)
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);
  const rendimentoDocumentos = rend.reduce((s, r) => s + numero(r.total_rendimento), 0);
  const rendimento = rendimentoDocumentos || rendimentoLancamentos;

  const saldosPorConta = new Map();
  [...conta].sort((a, b) => dataRegistro(a).localeCompare(dataRegistro(b))).forEach((r, index) => {
    const contaKey = String(r.conta || r.banco || `registro-${index}`);
    if (r.saldo_final != null) saldosPorConta.set(contaKey, numero(r.saldo_final));
  });
  const saldoDocumental = Array.from(saldosPorConta.values()).reduce((s, v) => s + v, 0);

  return {
    creditos,
    debitos,
    rendimento,
    saldo: saldoDocumental || (creditos - debitos + rendimento),
    documentos: unicos.length,
    creditos_brutos: creditosBrutos,
    debitos_brutos: debitosBrutos,
    creditos_nao_operacionais: Math.max(0, creditosBrutos - creditos),
    debitos_nao_operacionais: Math.max(0, debitosBrutos - debitos),
    transferencias_internas_ignoradas: lancamentos.filter(ehTransferenciaInterna).length,
    devolucoes_estornos_ignorados: lancamentos.filter(ehDevolucaoOuEstorno).length,
    credito_confirmado: creditoConfirmado !== undefined,
  };
}

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();
  deduplicarRegistrosPorDocumento(movimentacoes).forEach((registro, index) => {
    const ano = Number(registro.ano); const mes = Number(registro.mes_num);
    if (!ano || mes < 1 || mes > 12) return;
    const key = `${ano}-${String(mes).padStart(2, '0')}`;
    if (!grupos.has(key)) grupos.set(key, { key, ano, mes_num: mes, mes: MESES_NOME[mes], registros: [] });
    grupos.get(key).registros.push({ ...registro, _source_index: index });
  });

  // Compatibilidade com telas antigas: os totais ajustados ficam somente no primeiro
  // extrato de conta do mês. Os demais recebem zero, evitando soma duplicada de PDFs
  // sobrepostos sem apagar ou alterar os dados persistidos.
  grupos.forEach(grupo => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    let contaAplicada = false;
    let rendimentoAplicado = false;
    grupo.registros = grupo.registros.map(registro => {
      if (registro.tipo === 'extrato_conta') {
        const aplicar = !contaAplicada;
        contaAplicada = true;
        return {
          ...registro,
          total_creditos_bruto: numero(registro.total_creditos),
          total_debitos_bruto: numero(registro.total_debitos),
          total_creditos: aplicar ? resumo.creditos : 0,
          total_debitos: aplicar ? resumo.debitos : 0,
          totais_ajustados_deterministicamente: true,
        };
      }
      if (registro.tipo === 'extrato_rendimento') {
        const aplicar = !rendimentoAplicado;
        rendimentoAplicado = true;
        return {
          ...registro,
          total_rendimento_bruto: numero(registro.total_rendimento),
          total_rendimento: aplicar ? resumo.rendimento : 0,
          totais_ajustados_deterministicamente: true,
        };
      }
      return registro;
    });
  });

  return Array.from(grupos.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirGruposMensais(grupos = []) {
  return grupos.reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;
    totais.rendimento += resumo.rendimento;
    totais.creditos_nao_operacionais += resumo.creditos_nao_operacionais || 0;
    totais.debitos_nao_operacionais += resumo.debitos_nao_operacionais || 0;
    totais.transferencias_internas_ignoradas += resumo.transferencias_internas_ignoradas || 0;
    totais.devolucoes_estornos_ignorados += resumo.devolucoes_estornos_ignorados || 0;
    return totais;
  }, {
    creditos: 0,
    debitos: 0,
    rendimento: 0,
    creditos_nao_operacionais: 0,
    debitos_nao_operacionais: 0,
    transferencias_internas_ignoradas: 0,
    devolucoes_estornos_ignorados: 0,
  });
}
