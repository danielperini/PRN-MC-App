const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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
    'aplicacao', 'aplicacao financeira', 'investimento', 'resgate', 'resgate aplicacao',
    'transferencia entre contas', 'transf entre contas', 'conta investimento',
    'conta corrente para investimento', 'investimento para conta corrente',
    'movimentacao interna', 'saldo aplicado', 'aporte aplicacao', 'baixa aplicacao',
  ].some(termo => descricao.includes(termo));
}

function ehRendimento(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return tipoLancamento(lancamento) === 'rendimento'
    || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'atualizacao monetaria'].some(termo => descricao.includes(termo));
}

function ehDevolucaoOuEstorno(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return ['devolucao', 'estorno', 'reembolso', 'credito devolvido', 'cancelamento'].some(termo => descricao.includes(termo));
}

function ehCreditoExternoConfirmado(lancamento) {
  const valor = Math.abs(numero(lancamento?.valor));
  const descricao = descricaoLancamento(lancamento);
  const valorConfirmado = Math.abs(valor - 1320000) <= 0.01 || Math.abs(valor - 81700) <= 0.01;
  const origemPublica = [
    'repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc',
    'termo de colaboracao', 'parceria', 'convenio', 'subvencao', 'aporte do projeto',
  ].some(termo => descricao.includes(termo));
  return valorConfirmado || origemPublica;
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

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();
  deduplicarRegistrosPorDocumento(movimentacoes).forEach((registro, index) => {
    const ano = Number(registro.ano); const mes = Number(registro.mes_num);
    if (!ano || mes < 1 || mes > 12) return;
    const key = `${ano}-${String(mes).padStart(2, '0')}`;
    if (!grupos.has(key)) grupos.set(key, { key, ano, mes_num: mes, mes: MESES_NOME[mes], registros: [] });
    grupos.get(key).registros.push({ ...registro, _source_index: index });
  });
  return Array.from(grupos.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirRegistrosMensais(registros = []) {
  const unicos = deduplicarRegistrosPorDocumento(registros);
  const conta = unicos.filter(r => r.tipo === 'extrato_conta');
  const rend = unicos.filter(r => r.tipo === 'extrato_rendimento');
  const lancamentos = lancamentosUnicos(conta);

  const creditos = lancamentos
    .filter(l => tipoLancamento(l) === 'credito')
    .filter(l => !ehTransferenciaInterna(l) && !ehRendimento(l) && !ehDevolucaoOuEstorno(l))
    .filter(ehCreditoExternoConfirmado)
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
    transferencias_internas_ignoradas: lancamentos.filter(ehTransferenciaInterna).length,
    devolucoes_estornos_ignorados: lancamentos.filter(ehDevolucaoOuEstorno).length,
  };
}

export function resumirGruposMensais(grupos = []) {
  return grupos.reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;
    totais.rendimento += resumo.rendimento;
    totais.transferencias_internas_ignoradas += resumo.transferencias_internas_ignoradas || 0;
    totais.devolucoes_estornos_ignorados += resumo.devolucoes_estornos_ignorados || 0;
    return totais;
  }, { creditos: 0, debitos: 0, rendimento: 0, transferencias_internas_ignoradas: 0, devolucoes_estornos_ignorados: 0 });
}
