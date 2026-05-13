import React, { useMemo } from 'react';
import CoordReviewModalNF from './CoordReviewModalNF';

function limparExtensao(nome) {
  return String(nome || '').replace(/\.[^.]+$/, '').trim();
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseValorBR(value) {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return '';

  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || '';
  }

  return Number(raw.replace(',', '.')) || '';
}

function formatCompetencia(dateLike) {
  if (!dateLike) return '';

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const raw = String(dateLike);
  let data = null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    data = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!data && br) {
    data = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  }

  if (!data || Number.isNaN(data.getTime())) return '';

  return `${meses[data.getMonth()]}/${data.getFullYear()}`;
}

function extrairNomeArquivo(fileName, intake = {}) {
  const nomeOriginal = limparExtensao(fileName);
  const nome = normalizarTexto(nomeOriginal);
  const result = {};

  const nfMatch = nome.match(/\bNF\s*(\d+)\b/i) || nome.match(/\bNOTA\s*(\d+)\b/i);
  if (nfMatch) {
    result.nf_numero = nfMatch[1];
  }

  const valores = Array.from(nomeOriginal.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,9},\d{2}|\d{1,9}\.\d{2})/g));
  if (valores.length) {
    const ultimoValor = valores[valores.length - 1]?.[1];
    const valor = parseValorBR(ultimoValor);
    if (valor) result.nf_valor_total = valor;
  }

  const partes = nomeOriginal
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const primeiraParte = partes[0] || nomeOriginal;
  const segundaParte = partes[1] || '';

  let funcao = primeiraParte
    .replace(/^\d+\s*/i, '')
    .replace(/\bNF\s*\d+\b/i, '')
    .replace(/\bNOTA\s*\d+\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const fornecedor = segundaParte
    .replace(/\bMUSEUS\s+CENTRO\b/i, '')
    .replace(/\bR\$?\s*\d+[.,]\d{2}\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (fornecedor) {
    result.nf_emitente_nome = fornecedor;
    result.fornecedor_nome = fornecedor;
  }

  if (funcao) {
    result.descricao_servico = `${funcao} — ${fornecedor || 'MUSEUS CENTRO'}`;
  } else {
    result.descricao_servico = `Documento: ${nomeOriginal}`;
  }

  if (nome.includes('ANALISTA ADMINISTRATIVO FINANCEIRO') || nome.includes('ANALISTA ADM') || nome.includes('FINANCEIRO')) {
    result.rubrica_nome_sugerida = 'Equipe e gestão — Analista Adm. Financeira (mês 19 ao 28)';
    result.meta_sugerida = 'MC3A-01';
    result.meta_id = 'MC3A-01';
    result.tipo_gasto = 'Serviço';
    result.categoria_sugerida = 'Nota Fiscal';
    result.centro_custo_sugerido = 'Atuação Geral';
  }

  if (nome.includes('MUSEUS CENTRO') && !result.centro_custo_sugerido) {
    result.centro_custo_sugerido = 'Atuação Geral';
  }

  const dataEmissao =
    intake.nf_data_emissao ||
    intake.resultado_ia?.nf_data_emissao ||
    intake.resultado_ia?.data_emissao ||
    intake.created_date ||
    '';

  if (dataEmissao) {
    result.nf_data_emissao = result.nf_data_emissao || dataEmissao;
    result.competencia = result.competencia || formatCompetencia(dataEmissao);
    result.competencia_sugerida = result.competencia;
  }

  result.justificativa_ia = result.justificativa_ia || 'Campos preenchidos automaticamente a partir do nome do arquivo enviado.';

  return result;
}

function escolherValor(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

export default function ReviewModalNF(props) {
  const intake = props.intake || {};

  const intakeComFallback = useMemo(() => {
    const ia = intake.resultado_ia || {};
    const arquivo = extrairNomeArquivo(
      intake.file_name_original || intake.file_name_final || '',
      intake
    );

    const resultado_ia = {
      ...ia,
      nf_numero: escolherValor(ia.nf_numero, intake.nf_numero, arquivo.nf_numero),
      nf_valor_total: escolherValor(ia.nf_valor_total, ia.valor_total, ia.valor, intake.nf_valor_total, intake.valor, arquivo.nf_valor_total),
      nf_data_emissao: escolherValor(ia.nf_data_emissao, ia.data_emissao, intake.nf_data_emissao, arquivo.nf_data_emissao),
      competencia: escolherValor(ia.competencia, ia.competencia_sugerida, arquivo.competencia),
      competencia_sugerida: escolherValor(ia.competencia_sugerida, ia.competencia, arquivo.competencia_sugerida),
      nf_emitente_nome: escolherValor(ia.nf_emitente_nome, ia.fornecedor_nome, intake.nf_emitente_nome, intake.fornecedor_nome, arquivo.nf_emitente_nome),
      fornecedor_nome: escolherValor(ia.fornecedor_nome, ia.nf_emitente_nome, arquivo.fornecedor_nome),
      nf_emitente_cpf_cnpj: escolherValor(ia.nf_emitente_cpf_cnpj, ia.fornecedor_cpf_cnpj, intake.nf_emitente_cpf_cnpj, intake.fornecedor_cpf_cnpj),
      municipio: escolherValor(ia.municipio, intake.municipio),
      descricao_servico: escolherValor(ia.descricao_servico, ia.descricao, arquivo.descricao_servico),
      meta_sugerida: escolherValor(ia.meta_sugerida, ia.meta_id, arquivo.meta_sugerida),
      meta_id: escolherValor(ia.meta_id, ia.meta_sugerida, arquivo.meta_id),
      tipo_gasto: escolherValor(ia.tipo_gasto, arquivo.tipo_gasto, 'Serviço'),
      categoria_sugerida: escolherValor(ia.categoria_sugerida, arquivo.categoria_sugerida, 'Nota Fiscal'),
      rubrica_nome_sugerida: escolherValor(ia.rubrica_nome_sugerida, intake.rubrica_nome_sugerida, arquivo.rubrica_nome_sugerida),
      centro_custo_sugerido: escolherValor(ia.centro_custo_sugerido, intake.centro_custo, arquivo.centro_custo_sugerido),
      justificativa_ia: escolherValor(ia.justificativa_ia, arquivo.justificativa_ia),
    };

    return {
      ...intake,
      centro_custo: escolherValor(intake.centro_custo, resultado_ia.centro_custo_sugerido),
      resultado_ia,
    };
  }, [intake]);

  return <CoordReviewModalNF {...props} intake={intakeComFallback} />;
}
