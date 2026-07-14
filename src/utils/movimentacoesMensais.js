const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Repasses de recursos externos confirmados pelo responsável financeiro.
// Somente estes valores entram como crédito externo real.
const CREDITOS_EXTERNOS_CONFIRMADOS_2026 = Object.freeze({
  '2026-02': 1320000,
  '2026-06': 81719.85,
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

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO DETERMINÍSTICA: TRANSFERÊNCIA INTERNA
// Qualquer lançamento que se enquadre aqui é visível para auditoria mas NÃO
// entra em débitos operacionais, gastos por rubrica, comparações com NFs ou
// totais de despesas.
// ─────────────────────────────────────────────────────────────────────────────
const TERMOS_TRANSFERENCIA_INTERNA = [
  'aplicacao financeira', 'aplicacao automatica', 'aplicacao cdb', 'aplicacao fundo',
  'resgate aplicacao', 'resgate automatico', 'resgate cdb', 'resgate fundo',
  'resgate automat',
  'resgate ',            // cobre "resgate xpto" no início
  ' resgate',            // cobre "xpto resgate" no final
  'aplicacao de saldo', 'aporte aplicacao', 'baixa aplicacao',
  'resgate de investimento', 'transferencia para aplicacao', 'transferencia da aplicacao',
  'transferencia entre contas', 'transf entre contas', 'conta investimento',
  'conta corrente para investimento', 'investimento para conta corrente',
  'movimentacao interna', 'saldo aplicado',
  'transferencia da conta para aplicacao', 'transferencia da aplicacao para conta',
];

function descricaoLancamento(lancamento) {
  return normalizar([
    lancamento?.descricao,
    lancamento?.historico,
    lancamento?.detalhe,
    lancamento?.categoria_fluxo,
  ].filter(Boolean).join(' '));
}

export function ehTransferenciaInterna(lancamento) {
  const desc = descricaoLancamento(lancamento);
  // Verificação exata por prefixo/sufixo de "resgate" para não cortar palavras
  if (/\bresgate\b/.test(desc)) return true;
  if (/\baplicacao\b/.test(desc) && /\b(automatica|financeira|cdb|fundo|saldo)\b/.test(desc)) return true;
  return TERMOS_TRANSFERENCIA_INTERNA.some(termo => desc.includes(termo));
}

function tipoLancamento(lancamento) {
  const tipo = normalizar(lancamento?.tipo);
  if (tipo.includes('rend')) return 'rendimento';
  if (tipo.includes('cred') || tipo.includes('entrada')) return 'credito';
  if (tipo.includes('deb') || tipo.includes('saida') || tipo.includes('pagamento')) return 'debito';
  return tipo;
}

function ehRendimento(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return tipoLancamento(lancamento) === 'rendimento'
    || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'atualizacao monetaria', 'correcao monetaria'].some(t => descricao.includes(t));
}

function ehDevolucaoOuEstorno(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return ['devolucao', 'estorno', 'reembolso', 'credito devolvido', 'cancelamento', 'reversao'].some(t => descricao.includes(t));
}

function ehCreditoExternoPorDescricao(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return [
    'repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc',
    'termo de colaboracao', 'parceria', 'convenio', 'subvencao', 'aporte do projeto',
  ].some(t => descricao.includes(t));
}

function dataRegistro(registro) {
  return String(registro.processado_em || registro.updated_date || registro.created_date || '');
}

function chaveDocumento(registro, index) {
  return String(registro.drive_file_id || registro.id || `${registro.ano}-${registro.mes_num}-${index}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICAÇÃO SEGURA DE LANÇAMENTOS
// Chave: drive_file_id + conta + data + descrição + valor + saldo + posição
// Garante que dois pagamentos legítimos de mesmo valor/data/descrição
// (ex: 2x R$ 1.000 RH Assessoria) NÃO sejam eliminados quando os saldos
// subsequentes forem diferentes.
// ─────────────────────────────────────────────────────────────────────────────
function fingerprintLancamento(lancamento, registro, posicao) {
  return [
    String(registro?.drive_file_id || registro?.id || ''),
    String(registro?.conta || registro?.banco || '').replace(/\D/g, ''),
    normalizar(lancamento?.data),
    descricaoLancamento(lancamento),
    tipoLancamento(lancamento),
    Math.abs(numero(lancamento?.valor)).toFixed(2),
    lancamento?.saldo != null ? numero(lancamento.saldo).toFixed(2) : `idx${posicao}`,
  ].join('|');
}

function lancamentosUnicos(registros) {
  const map = new Map();
  registros.forEach(registro => {
    (registro.lancamentos || []).forEach((lancamento, posicao) => {
      const key = fingerprintLancamento(lancamento, registro, posicao);
      if (!map.has(key)) map.set(key, { ...lancamento, _registro: registro });
    });
  });
  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// AGRUPAMENTO POR DATA REAL DO LANÇAMENTO
// A pasta/mês do PDF serve apenas como referência documental.
// Lançamentos de 01/04 a 30/04 aparecem em Abril mesmo que o PDF
// venha da pasta de Julho.
// ─────────────────────────────────────────────────────────────────────────────
export function parseDataLancamento(valor, anoFallback = null) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  let ano, mes, dia;
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
  return {
    ano, mes, dia,
    key: `${ano}-${String(mes).padStart(2, '0')}`,
    sortKey: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  };
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

function chaveMes(registros) {
  const primeiro = registros.find(Boolean);
  const ano = Number(primeiro?.ano);
  const mes = Number(primeiro?.mes_num);
  if (!ano || mes < 1 || mes > 12) return null;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO MENSAL
// Débitos operacionais = débitos totais MENOS transferências internas.
// Transferências internas ficam visíveis mas não entram nos totais de despesa.
// ─────────────────────────────────────────────────────────────────────────────
export function resumirRegistrosMensais(registros = []) {
  const unicos = deduplicarRegistrosPorDocumento(registros);
  const conta = unicos.filter(r => r.tipo === 'extrato_conta');
  const rend = unicos.filter(r => r.tipo === 'extrato_rendimento');
  const lancamentos = lancamentosUnicos(conta);
  const mesKey = chaveMes(unicos);

  // Créditos externos confirmados (repasses)
  const creditoConfirmado = mesKey ? CREDITOS_EXTERNOS_CONFIRMADOS_2026[mesKey] : undefined;

  const creditosBrutos = lancamentos
    .filter(l => tipoLancamento(l) === 'credito')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const creditosClassificados = lancamentos
    .filter(l => tipoLancamento(l) === 'credito')
    .filter(l => !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehDevolucaoOuEstorno(l))
    .filter(ehCreditoExternoPorDescricao)
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const creditos = creditoConfirmado !== undefined ? creditoConfirmado : creditosClassificados;

  // Débitos brutos (tudo)
  const debitosBrutos = lancamentos
    .filter(l => tipoLancamento(l) === 'debito')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  // Transferências internas (NÃO entram em débitos operacionais)
  const transInternasValor = lancamentos
    .filter(l => tipoLancamento(l) === 'debito' && ehTransferenciaInterna(l))
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const transInternasQtd = lancamentos.filter(l => ehTransferenciaInterna(l)).length;

  // Débitos OPERACIONAIS REAIS (sem transferências internas, rendimentos ou estornos)
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
    debitos,              // operacionais reais
    rendimento,
    saldo: saldoDocumental || (creditos - debitos + rendimento),
    documentos: unicos.length,
    creditos_brutos: creditosBrutos,
    debitos_brutos: debitosBrutos,
    transferencias_internas_valor: transInternasValor,
    transferencias_internas_qtd: transInternasQtd,
    creditos_nao_operacionais: Math.max(0, creditosBrutos - creditos),
    debitos_nao_operacionais: transInternasValor,
    devolucoes_estornos_ignorados: lancamentos.filter(ehDevolucaoOuEstorno).length,
    credito_confirmado: creditoConfirmado !== undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGRUPAMENTO POR MÊS (usa campos ano/mes_num do registro — que devem
// ter sido preenchidos pela importação com base nas datas reais dos lançamentos)
// ─────────────────────────────────────────────────────────────────────────────
export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();
  deduplicarRegistrosPorDocumento(movimentacoes).forEach((registro, index) => {
    const ano = Number(registro.ano);
    const mes = Number(registro.mes_num);
    if (!ano || mes < 1 || mes > 12) return;
    const key = `${ano}-${String(mes).padStart(2, '0')}`;
    if (!grupos.has(key)) grupos.set(key, { key, ano, mes_num: mes, mes: MESES_NOME[mes], registros: [] });
    grupos.get(key).registros.push({ ...registro, _source_index: index });
  });

  // Aplica os totais ajustados deterministicamente no primeiro extrato de cada tipo por mês.
  // Os demais recebem zero para evitar dupla contagem de PDFs sobrepostos.
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
          total_debitos_operacionais: aplicar ? resumo.debitos : 0,
          total_transferencias_internas: aplicar ? resumo.transferencias_internas_valor : 0,
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

// ─────────────────────────────────────────────────────────────────────────────
// TOTAIS CONSOLIDADOS (todos os meses)
// Usa débitos operacionais reais, não totais brutos.
// ─────────────────────────────────────────────────────────────────────────────
export function resumirGruposMensais(grupos = []) {
  return grupos.reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;           // operacionais reais
    totais.debitos_brutos += resumo.debitos_brutos;
    totais.transferencias_internas += resumo.transferencias_internas_valor;
    totais.rendimento += resumo.rendimento;
    totais.saldo_final = resumo.saldo;          // último mês
    return totais;
  }, {
    creditos: 0,
    debitos: 0,
    debitos_brutos: 0,
    transferencias_internas: 0,
    rendimento: 0,
    saldo_final: 0,
  });
}