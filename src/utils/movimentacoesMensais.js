const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function numero(valor) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
}

function dataRegistro(registro) {
  return String(registro.processado_em || registro.updated_date || registro.created_date || '');
}

function chaveDocumento(registro, index) {
  return String(registro.drive_file_id || registro.id || `${registro.ano}-${registro.mes_num}-${index}`);
}

export function parseDataLancamento(valor, anoFallback = null) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  let ano;
  let mes;
  let dia;

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else {
    const br = texto.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (!br) return null;
    dia = Number(br[1]);
    mes = Number(br[2]);
    ano = br[3] ? Number(br[3]) : Number(anoFallback);
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

export function deduplicarRegistrosPorDocumento(movimentacoes = []) {
  const porDocumento = new Map();

  movimentacoes.forEach((registro, index) => {
    const chave = chaveDocumento(registro, index);
    const atual = porDocumento.get(chave);
    if (!atual || dataRegistro(registro) >= dataRegistro(atual)) {
      porDocumento.set(chave, registro);
    }
  });

  return Array.from(porDocumento.values());
}

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();
  const registrosUnicos = deduplicarRegistrosPorDocumento(movimentacoes);

  registrosUnicos.forEach((registro, index) => {
    const ano = Number(registro.ano);
    const mes = Number(registro.mes_num);
    if (!ano || mes < 1 || mes > 12) return;

    const key = `${ano}-${String(mes).padStart(2, '0')}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        ano,
        mes_num: mes,
        mes: MESES_NOME[mes],
        registros: [],
      });
    }

    grupos.get(key).registros.push({
      ...registro,
      _source_index: index,
    });
  });

  return Array.from(grupos.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirRegistrosMensais(registros = []) {
  const unicos = deduplicarRegistrosPorDocumento(registros);
  const conta = unicos.filter(r => r.tipo === 'extrato_conta');
  const rend = unicos.filter(r => r.tipo === 'extrato_rendimento');

  const creditos = conta.reduce((s, r) => s + numero(r.total_creditos), 0);
  const debitos = conta.reduce((s, r) => s + numero(r.total_debitos), 0);
  const rendimento = rend.reduce((s, r) => s + numero(r.total_rendimento), 0)
    + conta.reduce((s, r) => s + numero(r.total_rendimento), 0);

  const saldosPorConta = new Map();
  [...conta]
    .sort((a, b) => dataRegistro(a).localeCompare(dataRegistro(b)))
    .forEach((r, index) => {
      const contaKey = String(r.conta || r.banco || `registro-${index}`);
      if (r.saldo_final != null) saldosPorConta.set(contaKey, numero(r.saldo_final));
    });

  const saldoDocumental = Array.from(saldosPorConta.values()).reduce((s, v) => s + v, 0);

  return {
    creditos,
    debitos,
    rendimento,
    saldo: saldoDocumental || (creditos - debitos),
    documentos: unicos.length,
  };
}

export function resumirGruposMensais(grupos = []) {
  return grupos.reduce((totais, grupo) => {
    const resumo = resumirRegistrosMensais(grupo.registros);
    totais.creditos += resumo.creditos;
    totais.debitos += resumo.debitos;
    totais.rendimento += resumo.rendimento;
    return totais;
  }, { creditos: 0, debitos: 0, rendimento: 0 });
}
