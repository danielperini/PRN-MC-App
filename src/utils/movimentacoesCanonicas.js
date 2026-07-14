import {
  agruparMovimentacoesPorMes,
  resumirRegistrosMensais,
} from '@/utils/movimentacoesMensais';

function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function dataRegistro(registro) {
  return String(registro?.processado_em || registro?.updated_date || registro?.created_date || '');
}

function nomeDocumento(registro) {
  return normalizar([
    registro?.drive_file_name,
    registro?.file_name,
    registro?.nome_arquivo,
    registro?.resumo_ia,
  ].filter(Boolean).join(' '));
}

function ehDocumentoRendimento(registro) {
  if (registro?.tipo === 'extrato_rendimento') return true;
  const nome = nomeDocumento(registro);
  return [
    'rendimento', 'investimento', 'aplicacao', 'cdb', 'fundo', 'poupanca',
    'movimentacao detalhada', 'qtde de cotas', 'dados de tributacao',
  ].some(termo => nome.includes(termo));
}

function descricaoLancamento(lancamento) {
  return normalizar([
    lancamento?.descricao,
    lancamento?.historico,
    lancamento?.detalhe,
    lancamento?.categoria_fluxo,
  ].filter(Boolean).join(' '));
}

function ehMovimentacaoInterna(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return /\bresgate\b/.test(descricao)
    || /\baplicacao\b/.test(descricao)
    || descricao.includes('transferencia entre contas')
    || descricao.includes('conta investimento')
    || descricao.includes('investimento para conta corrente')
    || descricao.includes('conta corrente para investimento');
}

function ehDebito(lancamento) {
  const tipo = normalizar(lancamento?.tipo);
  return tipo.includes('deb') || tipo.includes('saida') || tipo.includes('pagamento');
}

function chaveConta(registro, indice) {
  const conta = String(registro?.conta || '').replace(/\D/g, '');
  const banco = normalizar(registro?.banco);
  return `${ehDocumentoRendimento(registro) ? 'investimento' : 'conta'}|${conta || banco || `registro-${indice}`}`;
}

function pontuarExtratoConta(registro) {
  const nome = nomeDocumento(registro);
  const operacionais = (registro?.lancamentos || [])
    .filter(lancamento => ehDebito(lancamento) && !ehMovimentacaoInterna(lancamento)).length;
  let pontos = operacionais * 100 + (registro?.lancamentos || []).length;
  if (nome.includes('extrato mensal')) pontos += 1_000_000;
  if (nome.includes('extrato da conta') || nome.includes('extrato conta')) pontos += 500_000;
  if (nome.includes('conta corrente')) pontos += 250_000;
  return pontos;
}

function selecionarPorConta(registros, rendimento) {
  const mapa = new Map();
  registros
    .filter(registro => rendimento ? ehDocumentoRendimento(registro) : !ehDocumentoRendimento(registro) && registro?.tipo === 'extrato_conta')
    .forEach((registro, indice) => {
      const chave = chaveConta(registro, indice);
      const atual = mapa.get(chave);
      if (!atual) {
        mapa.set(chave, registro);
        return;
      }
      if (rendimento) {
        if (dataRegistro(registro) >= dataRegistro(atual)) mapa.set(chave, registro);
        return;
      }
      const novo = pontuarExtratoConta(registro);
      const anterior = pontuarExtratoConta(atual);
      if (novo > anterior || (novo === anterior && dataRegistro(registro) > dataRegistro(atual))) {
        mapa.set(chave, registro);
      }
    });
  return Array.from(mapa.values());
}

export function selecionarRegistrosCanonicos(registros = []) {
  return [
    ...selecionarPorConta(registros, false),
    ...selecionarPorConta(registros, true),
  ];
}

export function resumirRegistrosMensaisCanonicos(registros = []) {
  const canonicos = selecionarRegistrosCanonicos(registros);
  const resumo = resumirRegistrosMensais(canonicos);
  return {
    ...resumo,
    documentos_disponiveis: registros.length,
    documentos_canonicos: canonicos.length,
    documentos_ignorados_no_calculo: Math.max(0, registros.length - canonicos.length),
  };
}

export function agruparMovimentacoesPorMesCanonicas(movimentacoes = []) {
  return agruparMovimentacoesPorMes(movimentacoes).map(grupo => ({
    ...grupo,
    resumo_canonico: resumirRegistrosMensaisCanonicos(grupo.registros),
  }));
}

export function resumirGruposMensaisCanonicos(grupos = []) {
  const ordenados = [...grupos].sort((a, b) => a.key.localeCompare(b.key));
  return ordenados.reduce((totais, grupo) => {
    const resumo = grupo.resumo_canonico || resumirRegistrosMensaisCanonicos(grupo.registros);
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
