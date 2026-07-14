const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const CREDITOS_EXTERNOS_CONFIRMADOS_2026 = Object.freeze({
  '2026-02': 1320000,
  '2026-06': 81719.85,
});

const TERMOS_TRANSFERENCIA_INTERNA = [
  'aplicacao financeira', 'aplicacao automatica', 'aplicacao cdb', 'aplicacao fundo',
  'resgate aplicacao', 'resgate automatico', 'resgate cdb', 'resgate fundo',
  'resgate automat', 'aplicacao de saldo', 'aporte aplicacao', 'baixa aplicacao',
  'resgate de investimento', 'transferencia para aplicacao', 'transferencia da aplicacao',
  'transferencia entre contas', 'transf entre contas', 'conta investimento',
  'conta corrente para investimento', 'investimento para conta corrente',
  'movimentacao interna', 'saldo aplicado', 'transferencia da conta para aplicacao',
  'transferencia da aplicacao para conta',
];

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

function descricaoLancamento(lancamento) {
  return normalizar([
    lancamento?.descricao,
    lancamento?.historico,
    lancamento?.detalhe,
    lancamento?.categoria_fluxo,
  ].filter(Boolean).join(' '));
}

function tipoLancamento(lancamento) {
  const tipo = normalizar(lancamento?.tipo);
  if (tipo.includes('rend')) return 'rendimento';
  if (tipo.includes('cred') || tipo.includes('entrada')) return 'credito';
  if (tipo.includes('deb') || tipo.includes('saida') || tipo.includes('pagamento')) return 'debito';
  return tipo;
}

export function ehTransferenciaInterna(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  if (/\bresgate\b/.test(descricao)) return true;
  if (/\baplicacao\b/.test(descricao) && /\b(automatica|financeira|cdb|fundo|saldo)\b/.test(descricao)) return true;
  return TERMOS_TRANSFERENCIA_INTERNA.some(termo => descricao.includes(termo));
}

function ehRendimento(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return tipoLancamento(lancamento) === 'rendimento'
    || ['rendimento', 'remuneracao', 'juros', 'rentabilidade', 'atualizacao monetaria', 'correcao monetaria']
      .some(termo => descricao.includes(termo));
}

function ehDevolucaoOuEstorno(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return ['devolucao', 'estorno', 'reembolso', 'credito devolvido', 'cancelamento', 'reversao']
    .some(termo => descricao.includes(termo));
}

function ehCreditoExternoPorDescricao(lancamento) {
  const descricao = descricaoLancamento(lancamento);
  return ['repasse', 'prefeitura', 'fundacao municipal de cultura', 'fmc',
    'termo de colaboracao', 'parceria', 'convenio', 'subvencao', 'aporte do projeto']
    .some(termo => descricao.includes(termo));
}

function dataRegistro(registro) {
  return String(registro.processado_em || registro.updated_date || registro.created_date || '');
}

function chaveDocumento(registro, index) {
  return String(registro.drive_file_id || registro.id || `${registro.ano}-${registro.mes_num}-${index}`);
}

function chaveConta(registro, index = 0) {
  const conta = normalizar(registro?.conta).replace(/\D/g, '');
  const banco = normalizar(registro?.banco);
  return `${registro?.tipo || 'documento'}|${conta || banco || `registro-${index}`}`;
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

function assinaturaBaseLancamento(lancamento, registro) {
  return [
    chaveConta(registro),
    normalizar(lancamento?.data),
    descricaoLancamento(lancamento),
    tipoLancamento(lancamento),
    Math.abs(numero(lancamento?.valor)).toFixed(2),
    lancamento?.saldo == null ? '' : numero(lancamento.saldo).toFixed(2),
  ].join('|');
}

function deduplicarLancamentosSobrepostos(registros) {
  const canonicos = new Map();

  [...registros]
    .sort((a, b) => dataRegistro(b).localeCompare(dataRegistro(a)))
    .forEach(registro => {
      const ocorrencias = new Map();
      (registro.lancamentos || []).forEach((lancamento, indice) => {
        const base = assinaturaBaseLancamento(lancamento, registro);
        const ocorrencia = (ocorrencias.get(base) || 0) + 1;
        ocorrencias.set(base, ocorrencia);
        const chave = `${base}|ocorrencia:${ocorrencia}`;
        if (!canonicos.has(chave)) {
          canonicos.set(chave, {
            ...lancamento,
            tipo: tipoLancamento(lancamento),
            valor: Math.abs(numero(lancamento?.valor)),
            saldo: lancamento?.saldo == null ? null : numero(lancamento.saldo),
            _registro: registro,
            _indice_origem: indice,
            _chave_deduplicacao: chave,
          });
        }
      });
    });

  return Array.from(canonicos.values());
}

function saldoFinalDoFragmento(registro) {
  const comSaldo = (registro.lancamentos || [])
    .map((lancamento, indice) => ({
      saldo: lancamento?.saldo,
      parsed: parseDataLancamento(lancamento?.data, registro.ano),
      indice,
    }))
    .filter(item => item.saldo != null)
    .sort((a, b) => {
      const dataA = a.parsed?.sortKey || '';
      const dataB = b.parsed?.sortKey || '';
      return dataA.localeCompare(dataB) || a.indice - b.indice;
    });
  return comSaldo.length ? numero(comSaldo[comSaldo.length - 1].saldo) : numero(registro.saldo_final);
}

function criarFragmentosMensais(movimentacoes = []) {
  const fragmentos = [];

  deduplicarRegistrosPorDocumento(movimentacoes).forEach((registro, indexRegistro) => {
    const porMes = new Map();
    const anoFallback = Number(registro.ano) || 2026;

    (registro.lancamentos || []).forEach((lancamento, indice) => {
      const parsed = parseDataLancamento(lancamento?.data, anoFallback);
      const key = parsed?.key || `${registro.ano}-${String(registro.mes_num || 0).padStart(2, '0')}`;
      if (!/^\d{4}-\d{2}$/.test(key)) return;
      if (!porMes.has(key)) porMes.set(key, []);
      porMes.get(key).push({ ...lancamento, _indice_origem: indice });
    });

    if (porMes.size === 0) {
      const ano = Number(registro.ano);
      const mes = Number(registro.mes_num);
      if (!ano || mes < 1 || mes > 12) return;
      porMes.set(`${ano}-${String(mes).padStart(2, '0')}`, []);
    }

    porMes.forEach((lancamentos, key) => {
      const [ano, mes] = key.split('-').map(Number);
      const ehCompetenciaOriginal = Number(registro.ano) === ano && Number(registro.mes_num) === mes;
      const fragmento = {
        ...registro,
        ano,
        mes_num: mes,
        mes: MESES_NOME[mes],
        lancamentos,
        _source_index: indexRegistro,
        _documento_original_id: chaveDocumento(registro, indexRegistro),
        _competencia_original: ehCompetenciaOriginal,
      };

      if (registro.tipo === 'extrato_conta') {
        fragmento.saldo_final = lancamentos.length ? saldoFinalDoFragmento(fragmento) : (ehCompetenciaOriginal ? numero(registro.saldo_final) : 0);
      }
      if (registro.tipo === 'extrato_rendimento' && !ehCompetenciaOriginal) {
        fragmento.total_rendimento = 0;
        fragmento.saldo_final = 0;
      }
      fragmentos.push(fragmento);
    });
  });

  return fragmentos;
}

function documentoMaisRecentePorConta(registros) {
  const mapa = new Map();
  registros.forEach((registro, index) => {
    const chave = chaveConta(registro, index);
    const atual = mapa.get(chave);
    if (!atual || dataRegistro(registro) >= dataRegistro(atual)) mapa.set(chave, registro);
  });
  return Array.from(mapa.values());
}

export function resumirRegistrosMensais(registros = []) {
  const conta = registros.filter(registro => registro.tipo === 'extrato_conta');
  const rendimentoDocs = registros.filter(registro => registro.tipo === 'extrato_rendimento');
  const lancamentos = deduplicarLancamentosSobrepostos(conta);
  const primeiro = registros[0];
  const mesKey = primeiro ? `${primeiro.ano}-${String(primeiro.mes_num || 0).padStart(2, '0')}` : null;

  const creditoConfirmado = mesKey ? CREDITOS_EXTERNOS_CONFIRMADOS_2026[mesKey] : undefined;
  const creditosBrutos = lancamentos
    .filter(item => tipoLancamento(item) === 'credito')
    .reduce((soma, item) => soma + Math.abs(numero(item.valor)), 0);
  const creditosClassificados = lancamentos
    .filter(item => tipoLancamento(item) === 'credito')
    .filter(item => !ehTransferenciaInterna(item) && !ehRendimento(item) && !ehDevolucaoOuEstorno(item))
    .filter(ehCreditoExternoPorDescricao)
    .reduce((soma, item) => soma + Math.abs(numero(item.valor)), 0);
  const creditos = creditoConfirmado !== undefined ? creditoConfirmado : creditosClassificados;

  const debitosBrutos = lancamentos
    .filter(item => tipoLancamento(item) === 'debito')
    .reduce((soma, item) => soma + Math.abs(numero(item.valor)), 0);
  const transferenciasInternasValor = lancamentos
    .filter(item => tipoLancamento(item) === 'debito' && ehTransferenciaInterna(item))
    .reduce((soma, item) => soma + Math.abs(numero(item.valor)), 0);
  const debitos = lancamentos
    .filter(item => tipoLancamento(item) === 'debito')
    .filter(item => !ehTransferenciaInterna(item) && !ehRendimento(item) && !ehDevolucaoOuEstorno(item))
    .reduce((soma, item) => soma + Math.abs(numero(item.valor)), 0);

  const rendimentoEmLancamentos = lancamentos
    .filter(ehRendimento)
    .reduce((soma, item) => soma + Math.abs(numero(item.valor)), 0);
  const rendimentoDocumental = documentoMaisRecentePorConta(rendimentoDocs)
    .reduce((soma, registro) => soma + numero(registro.total_rendimento), 0);
  const rendimento = rendimentoDocumental || rendimentoEmLancamentos;

  const saldosConta = documentoMaisRecentePorConta(conta)
    .reduce((soma, registro) => soma + saldoFinalDoFragmento(registro), 0);
  const saldosInvestimento = documentoMaisRecentePorConta(rendimentoDocs)
    .reduce((soma, registro) => soma + numero(registro.saldo_final), 0);
  const saldoDocumental = saldosConta + saldosInvestimento;
  const saldoCalculado = creditos - debitos + rendimento;

  return {
    creditos,
    debitos,
    rendimento,
    saldo: Math.abs(saldoDocumental) > 0.009 ? saldoDocumental : saldoCalculado,
    saldo_conta: saldosConta,
    saldo_investimento: saldosInvestimento,
    saldo_sem_rendimento: saldosConta + Math.max(0, saldosInvestimento - rendimento),
    documentos: new Set(registros.map((registro, index) => chaveDocumento(registro, index))).size,
    lancamentos_unicos: lancamentos.length,
    creditos_brutos: creditosBrutos,
    debitos_brutos: debitosBrutos,
    transferencias_internas_valor: transferenciasInternasValor,
    transferencias_internas_qtd: lancamentos.filter(ehTransferenciaInterna).length,
    creditos_nao_operacionais: Math.max(0, creditosBrutos - creditos),
    debitos_nao_operacionais: transferenciasInternasValor,
    devolucoes_estornos_ignorados: lancamentos.filter(ehDevolucaoOuEstorno).length,
    credito_confirmado: creditoConfirmado !== undefined,
  };
}

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();

  criarFragmentosMensais(movimentacoes).forEach(fragmento => {
    const key = `${fragmento.ano}-${String(fragmento.mes_num).padStart(2, '0')}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        ano: fragmento.ano,
        mes_num: fragmento.mes_num,
        mes: MESES_NOME[fragmento.mes_num],
        registros: [],
      });
    }
    grupos.get(key).registros.push(fragmento);
  });

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
          saldo_final: aplicar ? resumo.saldo : null,
          saldo_conta: aplicar ? resumo.saldo_conta : null,
          saldo_investimento: aplicar ? resumo.saldo_investimento : null,
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
          saldo_final_consolidado: aplicar ? resumo.saldo : null,
          totais_ajustados_deterministicamente: true,
        };
      }
      return registro;
    });
  });

  return Array.from(grupos.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirGruposMensais(grupos = []) {
  const ordenados = [...grupos].sort((a, b) => a.key.localeCompare(b.key));
  return ordenados.reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;
    totais.debitos_brutos += resumo.debitos_brutos;
    totais.transferencias_internas += resumo.transferencias_internas_valor;
    totais.rendimento += resumo.rendimento;
    totais.saldo_final = resumo.saldo;
    totais.saldo_conta = resumo.saldo_conta;
    totais.saldo_investimento = resumo.saldo_investimento;
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
  });
}
