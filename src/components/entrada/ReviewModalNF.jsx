import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import CoordReviewModalNF from './CoordReviewModalNF';
import PainelDadosIdentificadosNF from './PainelDadosIdentificadosNF';
import { analisarNFDeterministico, aplicarCamposAoFormulario } from '@/utils/nfDeterministicAnalysis';

// ── Helpers de normalização (mantidos do original) ──────────────────────────
function limparExtensao(nome) {
  return String(nome || '').replace(/\.[^.]+$/, '').trim();
}
function normalizarTexto(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
function textoLivre(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_) { return ''; }
}
function parseValorBR(value) {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return '';
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || '';
  return Number(raw.replace(',', '.')) || '';
}
function extrairCpfCnpj(texto) {
  const raw = String(texto || '');
  const formatado = raw.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
  if (formatado) return formatado[0];
  const labels = raw.match(/(?:CNPJ|CPF|CPF\/CNPJ|CNPJ\/CPF)[^0-9]{0,30}(\d{11,14})/i);
  if (labels) return labels[1];
  const soltos = Array.from(raw.matchAll(/\b\d{11,14}\b/g)).map((m) => m[0]);
  return soltos.find((n) => n.length === 14 || n.length === 11) || '';
}
function extrairMunicipio(texto) {
  const raw = String(texto || '');
  const upper = normalizarTexto(raw);
  const label = raw.match(/(?:Munic[ií]pio|Cidade|Localidade)[\s:\-]+([A-Za-zÀ-ÿ\s]{3,40})(?:\n|,|\-|UF|Estado|CEP|$)/i);
  if (label?.[1]) return label[1].trim().replace(/\s+/g, ' ').toUpperCase();
  const cidades = ['BELO HORIZONTE', 'CONTAGEM', 'BETIM', 'SABARA', 'NOVA LIMA', 'SANTA LUZIA', 'RIBEIRAO DAS NEVES', 'SETE LAGOAS', 'RIO DE JANEIRO', 'SAO PAULO', 'CURITIBA', 'BRASILIA'];
  return cidades.find((cidade) => upper.includes(cidade)) || '';
}
function formatCompetencia(dateLike) {
  if (!dateLike) return '';
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const raw = String(dateLike);
  let data = null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) data = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!data && br) data = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  if (!data || Number.isNaN(data.getTime())) return '';
  return `${meses[data.getMonth()]}/${data.getFullYear()}`;
}
function coletarTextoDaNF(intake) {
  const ia = intake?.resultado_ia || {};
  return [
    intake?.raw_text, intake?.ocr_text, intake?.texto_extraido, intake?.texto_lido,
    intake?.conteudo_extraido, intake?.nf_texto_extraido,
    ia?.raw_text, ia?.ocr_text, ia?.texto_extraido, ia?.texto_lido, ia?.conteudo_extraido,
    ia?.nf_texto_extraido, ia?.full_text, ia?.markdown, ia?.dados_extraidos, ia?.documento, ia?.analise,
  ].map(textoLivre).filter(Boolean).join('\n');
}
function extrairNomeArquivo(fileName, intake = {}) {
  const nomeOriginal = limparExtensao(fileName);
  const nome = normalizarTexto(nomeOriginal);
  const result = {};
  const nfMatch = nome.match(/\bNF\s*(\d+)\b/i) || nome.match(/\bNOTA\s*(\d+)\b/i);
  if (nfMatch) result.nf_numero = nfMatch[1];
  const valores = Array.from(nomeOriginal.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,9},\d{2}|\d{1,9}\.\d{2})/g));
  if (valores.length) {
    const ultimoValor = valores[valores.length - 1]?.[1];
    const valor = parseValorBR(ultimoValor);
    if (valor) result.nf_valor_total = valor;
  }
  const partes = nomeOriginal.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const primeiraParte = partes[0] || nomeOriginal;
  const segundaParte = partes[1] || '';
  const funcao = primeiraParte.replace(/^\d+\s*/i, '').replace(/\bNF\s*\d+\b/i, '').replace(/\bNOTA\s*\d+\b/i, '').replace(/\s+/g, ' ').trim();
  const fornecedor = segundaParte.replace(/\bMUSEUS\s+CENTRO\b/i, '').replace(/\bR\$?\s*\d+[.,]\d{2}\b/i, '').replace(/\s+/g, ' ').trim();
  if (fornecedor) { result.nf_emitente_nome = fornecedor; result.fornecedor_nome = fornecedor; }
  if (funcao) result.descricao_servico = `${funcao} — ${fornecedor || 'MUSEUS CENTRO'}`;
  else result.descricao_servico = `Documento: ${nomeOriginal}`;
  if (nome.includes('ANALISTA ADMINISTRATIVO FINANCEIRO') || nome.includes('ANALISTA ADM') || nome.includes('FINANCEIRO')) {
    result.rubrica_nome_sugerida = 'Equipe e gestão — Analista Adm. Financeira (mês 19 ao 28)';
    result.meta_sugerida = 'MC3A-01'; result.meta_id = 'MC3A-01'; result.tipo_gasto = 'Serviço'; result.categoria_sugerida = 'Nota Fiscal'; result.centro_custo_sugerido = 'Atuação Geral';
  }
  if (nome.includes('MUSEUS CENTRO') && !result.centro_custo_sugerido) result.centro_custo_sugerido = 'Atuação Geral';
  const textoNF = coletarTextoDaNF(intake);
  const cpfCnpj = extrairCpfCnpj(textoNF);
  const municipio = extrairMunicipio(textoNF);
  if (cpfCnpj) result.nf_emitente_cpf_cnpj = cpfCnpj;
  if (municipio) result.municipio = municipio;
  const dataEmissao = intake.nf_data_emissao || intake.resultado_ia?.nf_data_emissao || intake.resultado_ia?.data_emissao || intake.created_date || '';
  if (dataEmissao) {
    result.nf_data_emissao = result.nf_data_emissao || dataEmissao;
    result.competencia = result.competencia || formatCompetencia(dataEmissao);
    result.competencia_sugerida = result.competencia;
  }
  result.justificativa_ia = result.justificativa_ia || 'Campos preenchidos automaticamente a partir da leitura da NF e do nome do arquivo enviado.';
  return result;
}
function escolherValor(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}
function getCpfCnpjFromIA(ia, intake, arquivo) {
  return escolherValor(ia.nf_emitente_cpf_cnpj, ia.fornecedor_cpf_cnpj, ia.cnpj_emitente, ia.cpf_emitente, ia.emitente?.cnpj, ia.emitente?.cpf, ia.prestador?.cnpj, ia.prestador?.cpf, intake.nf_emitente_cpf_cnpj, intake.fornecedor_cpf_cnpj, arquivo.nf_emitente_cpf_cnpj);
}
function getMunicipioFromIA(ia, intake, arquivo) {
  return escolherValor(ia.municipio, ia.municipio_emitente, ia.cidade_emitente, ia.emitente?.municipio, ia.prestador?.municipio, intake.municipio, arquivo.municipio);
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ReviewModalNF(props) {
  const intake = props.intake || {};
  const [analise, setAnalise] = useState(() => intake.resultado_analise_deterministica || null);
  const [analisando, setAnalisando] = useState(false);

  // Checa se já foi analisado; caso contrário, executa na primeira abertura
  useEffect(() => {
    // FLUXO 2: já analisado — não reanalisar
    if (intake.resultado_analise_deterministica?.executado_em) {
      setAnalise(intake.resultado_analise_deterministica);
      return;
    }
    // FLUXO 3: intake já processado ou vinculado a compra PAGA — não bloquear com análise automática
    const statusProcessado = ['APROVADO', 'ENVIADO_APROVACAO', 'AGUARDANDO_REVISAO', 'RASCUNHO', 'ENVIADO'].includes(intake.status_processamento || '');
    const jaTemDados = intake.resultado_ia?.nf_numero || intake.resultado_ia?.nf_valor_total || intake.nf_numero;
    if (jaTemDados && !statusProcessado) {
      return;
    }
    // FLUXO 1: primeira análise apenas se ainda não há dados suficientes
    if (!jaTemDados) {
      executarAnalise(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake.id]);

  async function executarAnalise(forcar = false) {
    if (analisando) return;
    setAnalisando(true);
    try {
      const resultado = analisarNFDeterministico(intake, null);
      setAnalise(resultado);
      // Persiste no banco para não reanalisar na próxima abertura
      await base44.entities.DocumentIntake.update(intake.id, {
        resultado_analise_deterministica: resultado,
      }).catch(() => {});
    } finally {
      setAnalisando(false);
    }
  }

  // Monta intake enriquecido com fallback do nome do arquivo (igual ao original)
  const intakeComFallback = useMemo(() => {
    const ia = intake.resultado_ia || {};
    const arquivo = extrairNomeArquivo(intake.file_name_original || intake.file_name_final || '', intake);
    const cpfCnpj = getCpfCnpjFromIA(ia, intake, arquivo);
    const municipio = getMunicipioFromIA(ia, intake, arquivo);

    // Aplica campos da análise determinística ao resultado_ia (apenas campos vazios)
    const iaComAnalise = analise ? aplicarCamposAoFormulario(analise, {
      nf_numero: escolherValor(ia.nf_numero, arquivo.nf_numero),
      nf_valor_total: escolherValor(ia.nf_valor_total, arquivo.nf_valor_total),
      nf_data_emissao: escolherValor(ia.nf_data_emissao),
      nf_emitente_nome: escolherValor(ia.nf_emitente_nome, ia.fornecedor_nome, intake.nf_emitente_nome, arquivo.nf_emitente_nome),
      nf_emitente_cpf_cnpj: cpfCnpj,
      descricao_servico: escolherValor(ia.descricao_servico, arquivo.descricao_servico),
      competencia: escolherValor(ia.competencia, ia.competencia_sugerida, arquivo.competencia),
      detalhe_pagamento: '',
    }) : null;

    const resultado_ia = {
      ...ia,
      nf_numero: escolherValor(iaComAnalise?.nf_numero, ia.nf_numero, intake.nf_numero, arquivo.nf_numero),
      nf_valor_total: escolherValor(iaComAnalise?.nf_valor_total, ia.nf_valor_total, ia.valor_total, intake.nf_valor_total, arquivo.nf_valor_total),
      nf_data_emissao: escolherValor(iaComAnalise?.nf_data_emissao, ia.nf_data_emissao, ia.data_emissao, intake.nf_data_emissao),
      competencia: escolherValor(iaComAnalise?.competencia, ia.competencia, ia.nf_competencia, ia.competencia_sugerida, arquivo.competencia),
      competencia_sugerida: escolherValor(ia.competencia_sugerida, ia.competencia, arquivo.competencia_sugerida),
      nf_emitente_nome: escolherValor(iaComAnalise?.nf_emitente_nome, ia.nf_emitente_nome, ia.fornecedor_nome, intake.nf_emitente_nome, intake.fornecedor_nome, arquivo.nf_emitente_nome),
      fornecedor_nome: escolherValor(ia.fornecedor_nome, ia.nf_emitente_nome, arquivo.fornecedor_nome),
      nf_emitente_cpf_cnpj: cpfCnpj,
      fornecedor_cpf_cnpj: cpfCnpj,
      municipio,
      nf_emitente_municipio: escolherValor(ia.nf_emitente_municipio, ia.municipio_emitente, municipio),
      nf_emitente_uf: escolherValor(ia.nf_emitente_uf, ia.uf_emitente, ''),
      nf_emitente_inscricao_municipal: escolherValor(ia.nf_emitente_inscricao_municipal, ia.inscricao_municipal, ''),
      nf_emitente_email: escolherValor(ia.nf_emitente_email, ia.email_emitente, ''),
      nf_emitente_telefone: escolherValor(ia.nf_emitente_telefone, ia.telefone_emitente, ''),
      nf_emitente_banco: escolherValor(ia.nf_emitente_banco, ia.fornecedor_banco, ''),
      nf_emitente_agencia: escolherValor(ia.nf_emitente_agencia, ia.fornecedor_agencia, ''),
      nf_emitente_conta: escolherValor(ia.nf_emitente_conta, ia.fornecedor_conta, ''),
      nf_emitente_pix: escolherValor(ia.nf_emitente_pix, ia.fornecedor_pix, analise?.campos?.pix?.valor || ''),
      nf_chave_acesso: escolherValor(ia.nf_chave_acesso, ia.chave_acesso, ''),
      nf_valor_iss: escolherValor(ia.nf_valor_iss, ia.valor_iss, ''),
      nf_aliquota_iss: escolherValor(ia.nf_aliquota_iss, ia.aliquota_iss, ''),
      descricao_servico: escolherValor(iaComAnalise?.descricao_servico, ia.descricao_servico, ia.descricao, arquivo.descricao_servico),
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
      nf_emitente_cpf_cnpj: escolherValor(intake.nf_emitente_cpf_cnpj, resultado_ia.nf_emitente_cpf_cnpj),
      fornecedor_cpf_cnpj: escolherValor(intake.fornecedor_cpf_cnpj, resultado_ia.fornecedor_cpf_cnpj),
      municipio: escolherValor(intake.municipio, resultado_ia.municipio),
      centro_custo: escolherValor(intake.centro_custo, resultado_ia.centro_custo_sugerido),
      resultado_ia,
      // Injeta o painel de análise determinística como slot para CoordReviewModalNF
      _analise_deterministica: analise,
      _analisando_deterministica: analisando,
      _onReanalisar: () => executarAnalise(true),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake, analise, analisando]);

  return (
    <CoordReviewModalNF
      {...props}
      intake={intakeComFallback}
      painelDadosIdentificados={
        <PainelDadosIdentificadosNF
          analise={analise}
          isCoordenador={props.isCoordenador}
          onReanalisar={() => executarAnalise(true)}
          reanalisando={analisando}
        />
      }
    />
  );
}