const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function numero(valor) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
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

function fingerprintLancamento(lancamento, registro, parsed) {
  return [
    parsed?.sortKey || String(lancamento.data || ''),
    String(lancamento.descricao || '').trim().toLowerCase().replace(/\s+/g, ' '),
    String(lancamento.tipo || '').toLowerCase(),
    numero(lancamento.valor).toFixed(2),
    lancamento.saldo == null ? '' : numero(lancamento.saldo).toFixed(2),
    String(registro.conta || '').replace(/\D/g, ''),
  ].join('|');
}

function resumoLancamentos(lancamentos) {
  const creditos = lancamentos
    .filter(l => l.tipo === 'credito')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);
  const debitos = lancamentos
    .filter(l => l.tipo === 'debito')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);
  const rendimento = lancamentos
    .filter(l => l.tipo === 'rendimento')
    .reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  const comSaldo = lancamentos
    .filter(l => l.saldo != null && l._sort_key)
    .sort((a, b) => b._sort_key.localeCompare(a._sort_key));

  return {
    creditos,
    debitos,
    rendimento,
    saldoFinal: comSaldo.length ? numero(comSaldo[0].saldo) : null,
  };
}

export function agruparMovimentacoesPorMes(movimentacoes = []) {
  const grupos = new Map();
  const fingerprints = new Set();

  const garantirGrupo = (ano, mes) => {
    const key = `${ano}-${String(mes).padStart(2, '0')}`;
    if (!grupos.has(key)) {
      grupos.set(key, { key, ano, mes_num: mes, mes: MESES_NOME[mes], registros: [] });
    }
    return grupos.get(key);
  };

  movimentacoes.forEach((registro, registroIndex) => {
    const porMes = new Map();
    const anoFallback = Number(registro.ano) || null;

    (registro.lancamentos || []).forEach((lancamento, lancamentoIndex) => {
      const parsed = parseDataLancamento(lancamento.data, anoFallback);
      if (!parsed) return;

      const fingerprint = fingerprintLancamento(lancamento, registro, parsed);
      if (fingerprints.has(fingerprint)) return;
      fingerprints.add(fingerprint);

      if (!porMes.has(parsed.key)) porMes.set(parsed.key, []);
      porMes.get(parsed.key).push({
        ...lancamento,
        _sort_key: `${parsed.sortKey}-${String(lancamentoIndex).padStart(5, '0')}`,
      });
    });

    if (porMes.size === 0) {
      const ano = Number(registro.ano);
      const mes = Number(registro.mes_num);
      if (!ano || mes < 1 || mes > 12) return;
      const grupo = garantirGrupo(ano, mes);
      grupo.registros.push({ ...registro, _source_index: registroIndex });
      return;
    }

    porMes.forEach((lancamentos, key) => {
      const [ano, mes] = key.split('-').map(Number);
      const resumo = resumoLancamentos(lancamentos);
      const grupo = garantirGrupo(ano, mes);
      const ehMesReferencia = Number(registro.ano) === ano && Number(registro.mes_num) === mes;

      grupo.registros.push({
        ...registro,
        ano,
        mes_num: mes,
        mes: MESES_NOME[mes],
        lancamentos,
        total_creditos: resumo.creditos,
        total_debitos: resumo.debitos,
        total_rendimento: registro.tipo === 'extrato_rendimento'
          ? (resumo.rendimento || (ehMesReferencia ? numero(registro.total_rendimento) : 0))
          : resumo.rendimento,
        saldo_final: resumo.saldoFinal ?? (ehMesReferencia ? numero(registro.saldo_final) : 0),
        _source_index: registroIndex,
      });
    });

    if (registro.tipo === 'extrato_rendimento' && numero(registro.total_rendimento) > 0) {
      const ano = Number(registro.ano);
      const mes = Number(registro.mes_num);
      const key = `${ano}-${String(mes).padStart(2, '0')}`;
      if (ano && mes >= 1 && mes <= 12 && !porMes.has(key)) {
        const grupo = garantirGrupo(ano, mes);
        grupo.registros.push({
          ...registro,
          lancamentos: [],
          total_creditos: 0,
          total_debitos: 0,
          total_rendimento: numero(registro.total_rendimento),
          _source_index: registroIndex,
        });
      }
    }
  });

  return Array.from(grupos.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function resumirRegistrosMensais(registros = []) {
  const conta = registros.filter(r => r.tipo === 'extrato_conta');
  const rend = registros.filter(r => r.tipo === 'extrato_rendimento');
  const creditos = conta.reduce((s, r) => s + numero(r.total_creditos), 0);
  const debitos = conta.reduce((s, r) => s + numero(r.total_debitos), 0);
  const rendimento = rend.reduce((s, r) => s + numero(r.total_rendimento), 0)
    + conta.reduce((s, r) => s + numero(r.total_rendimento), 0);

  const saldosPorConta = new Map();
  conta.forEach((r, index) => {
    const contaKey = String(r.conta || r.banco || `registro-${index}`);
    if (r.saldo_final != null) saldosPorConta.set(contaKey, numero(r.saldo_final));
  });
  const saldoDocumental = Array.from(saldosPorConta.values()).reduce((s, v) => s + v, 0);

  return {
    creditos,
    debitos,
    rendimento,
    saldo: saldoDocumental || (creditos - debitos),
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
