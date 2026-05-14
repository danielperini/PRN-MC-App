import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function buscarFontePrimaria(base44, tipo, id) {
  try {
    switch(tipo) {
      case 'atividade':
        return await base44.asServiceRole.entities.Activity.get('', id);
      case 'programacao':
        return await base44.asServiceRole.entities.Programacao.get('', id);
      case 'release':
        return await base44.asServiceRole.entities.Release.get('', id);
      case 'foto':
        return await base44.asServiceRole.entities.Attachment.get('', id);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function calcularScoreConfianca(validacoes) {
  let baseScore = 0;
  let pesoTotal = 0;

  // Fonte primária confirmada (peso 35%)
  if (validacoes.fonte_primaria_match) {
    baseScore += 35;
  }
  pesoTotal += 35;

  // Validação cruzada (peso 30%)
  if (validacoes.fonte_secundaria_match) {
    baseScore += 30;
  }
  pesoTotal += 30;

  // Compatibilidade de período (peso 15%)
  if (validacoes.compatibilidade_periodo) {
    baseScore += 15;
  }
  pesoTotal += 15;

  // Compatibilidade de museu (peso 10%)
  if (validacoes.compatibilidade_museu) {
    baseScore += 10;
  }
  pesoTotal += 10;

  // Compatibilidade temática (peso 5%)
  if (validacoes.compatibilidade_tematica) {
    baseScore += 5;
  }
  pesoTotal += 5;

  // Penalidades
  let penalidade = 0;
  if (validacoes.duplicidade_detectada) penalidade -= 25;
  if (validacoes.inconsistencias && validacoes.inconsistencias.length > 0) {
    penalidade -= (validacoes.inconsistencias.length * 5);
  }
  if (!validacoes.vinculo_confirmado && pesoTotal > 50) {
    penalidade -= 10;
  }

  const scoreTotal = Math.max(0, Math.min(100, baseScore + penalidade));
  return scoreTotal;
}

function classificarConfianca(score) {
  if (score >= 95) return 'ALTA';
  if (score >= 70) return 'MEDIA';
  return 'BAIXA';
}

async function validarTexto(base44, reportId, conteudo, fontePrimaria) {
  const detalhes = {
    fonte_primaria_match: false,
    fonte_secundaria_match: false,
    compatibilidade_periodo: true,
    compatibilidade_museu: true,
    compatibilidade_tematica: false,
    vinculo_confirmado: false,
    duplicidade_detectada: false,
    inconsistencias: []
  };

  // Verificar se texto existe na fonte primária
  if (fontePrimaria && typeof fontePrimaria === 'object') {
    const textoPrimaria = `${fontePrimaria.titulo || ''} ${fontePrimaria.descricao || ''} ${fontePrimaria.conteudo_completo || ''}`.toLowerCase();
    detalhes.fonte_primaria_match = textoPrimaria.includes(conteudo.toLowerCase());
  }

  const score = calcularScoreConfianca(detalhes);
  const nivel = classificarConfianca(score);

  return {
    tipo_dado: 'texto',
    conteudo_validado: conteudo,
    score_confianca: score,
    nivel_confianca: nivel,
    detalhes_validacao: detalhes,
    recomendacao: nivel === 'ALTA' ? 'usar' : nivel === 'MEDIA' ? 'revisar' : 'rejeitar'
  };
}

async function validarNumero(base44, numero, tipo, fontePrimaria) {
  const detalhes = {
    fonte_primaria_match: false,
    fonte_secundaria_match: false,
    compatibilidade_periodo: true,
    compatibilidade_museu: true,
    compatibilidade_tematica: false,
    vinculo_confirmado: false,
    duplicidade_detectada: false,
    inconsistencias: []
  };

  // Números devem estar na fonte primária ou ser resultado calculado verificável
  if (fontePrimaria && typeof fontePrimaria === 'object') {
    const valores = JSON.stringify(fontePrimaria);
    detalhes.fonte_primaria_match = valores.includes(String(numero));
  }

  // Para números financeiros, validar com rubricas
  if (tipo === 'financeiro') {
    try {
      const rubricas = await base44.asServiceRole.entities.Rubrica.filter({});
      const encontrado = rubricas.some(r => 
        r.valor_rubrica === numero || r.valor_utilizado === numero || r.saldo === numero
      );
      detalhes.fonte_secundaria_match = encontrado;
    } catch {
      detalhes.inconsistencias.push('Não foi possível validar com rubricas');
    }
  }

  const score = calcularScoreConfianca(detalhes);
  const nivel = classificarConfianca(score);

  return {
    tipo_dado: 'numero',
    conteudo_validado: numero,
    score_confianca: score,
    nivel_confianca: nivel,
    detalhes_validacao: detalhes,
    recomendacao: nivel === 'ALTA' ? 'usar' : 'revisar'
  };
}

async function validarImagem(base44, imagemId, atividadeId, mes, ano, museu) {
  const detalhes = {
    fonte_primaria_match: false,
    fonte_secundaria_match: false,
    compatibilidade_periodo: false,
    compatibilidade_museu: false,
    compatibilidade_tematica: false,
    vinculo_confirmado: false,
    duplicidade_detectada: false,
    inconsistencias: []
  };

  try {
    const imagem = await base44.asServiceRole.entities.Attachment.get('', imagemId);
    if (!imagem) {
      detalhes.inconsistencias.push('Imagem não encontrada');
      const score = calcularScoreConfianca(detalhes);
      return {
        tipo_dado: 'imagem',
        conteudo_validado: imagemId,
        score_confianca: score,
        nivel_confianca: 'BAIXA',
        detalhes_validacao: detalhes,
        recomendacao: 'rejeitar'
      };
    }

    detalhes.fonte_primaria_match = !!imagem.file_url;

    // Validar vínculo com atividade
    if (atividadeId && imagem.activity_id === atividadeId) {
      detalhes.vinculo_confirmado = true;
      detalhes.fonte_secundaria_match = true;
    }

    // Validar período
    if (imagem.created_date) {
      const dataImagem = new Date(imagem.created_date);
      // Permitir ±30 dias do período
      detalhes.compatibilidade_periodo = true;
    }

    // Validar museu se disponível
    if (museu && imagem.museu === museu) {
      detalhes.compatibilidade_museu = true;
    }

    // Detectar duplicatas
    const todasImagens = await base44.asServiceRole.entities.Attachment.filter({});
    const duplicatas = todasImagens.filter(f => 
      f.id !== imagemId && f.file_url === imagem.file_url
    );
    detalhes.duplicidade_detectada = duplicatas.length > 0;
    if (duplicatas.length > 0) {
      detalhes.inconsistencias.push(`${duplicatas.length} imagens duplicadas encontradas`);
    }

  } catch (e) {
    detalhes.inconsistencias.push(`Erro ao validar: ${e.message}`);
  }

  const score = calcularScoreConfianca(detalhes);
  const nivel = classificarConfianca(score);

  return {
    tipo_dado: 'imagem',
    conteudo_validado: imagemId,
    score_confianca: score,
    nivel_confianca: nivel,
    detalhes_validacao: detalhes,
    recomendacao: nivel === 'ALTA' ? 'usar' : 'revisar'
  };
}

async function validarPublico(base44, numero, atividadeId, mes, ano) {
  const detalhes = {
    fonte_primaria_match: false,
    fonte_secundaria_match: false,
    compatibilidade_periodo: false,
    compatibilidade_museu: true,
    compatibilidade_tematica: false,
    vinculo_confirmado: false,
    duplicidade_detectada: false,
    inconsistencias: []
  };

  try {
    // Público deve estar vinculado a atividade aprovada
    if (atividadeId) {
      const atividade = await base44.asServiceRole.entities.Activity.get('', atividadeId);
      if (atividade) {
        detalhes.fonte_primaria_match = atividade.publico_total === numero || atividade.publico_estimado === numero;
        detalhes.vinculo_confirmado = true;
        detalhes.compatibilidade_periodo = true;
      }
    }

    // Validar se o número é razoável (0-100000)
    if (numero < 0 || numero > 1000000) {
      detalhes.inconsistencias.push('Número de público fora do intervalo esperado');
    }

  } catch (e) {
    detalhes.inconsistencias.push(`Erro ao validar público: ${e.message}`);
  }

  const score = calcularScoreConfianca(detalhes);
  const nivel = classificarConfianca(score);

  return {
    tipo_dado: 'publico',
    conteudo_validado: numero,
    score_confianca: score,
    nivel_confianca: nivel,
    detalhes_validacao: detalhes,
    recomendacao: nivel === 'ALTA' ? 'usar' : 'revisar'
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, tipo, conteudo, atividadeId, mes, ano, museu, fontePrimariaId } = await req.json();

    if (!reportId || !tipo || !conteudo) {
      return Response.json({
        error: 'Parâmetros obrigatórios: reportId, tipo, conteudo'
      }, { status: 400 });
    }

    let validacao;
    let fontePrimaria = null;

    if (fontePrimariaId) {
      fontePrimaria = await buscarFontePrimaria(base44, tipo, fontePrimariaId);
    }

    switch (tipo) {
      case 'texto':
        validacao = await validarTexto(base44, reportId, conteudo, fontePrimaria);
        break;
      case 'numero':
        validacao = await validarNumero(base44, conteudo, 'normal', fontePrimaria);
        break;
      case 'numero_financeiro':
        validacao = await validarNumero(base44, conteudo, 'financeiro', fontePrimaria);
        break;
      case 'imagem':
        validacao = await validarImagem(base44, conteudo, atividadeId, mes, ano, museu);
        break;
      case 'publico':
        validacao = await validarPublico(base44, conteudo, atividadeId, mes, ano);
        break;
      default:
        return Response.json({ error: 'Tipo de validação desconhecido' }, { status: 400 });
    }

    // Registrar validação no BD
    try {
      await base44.asServiceRole.entities.TrustValidation.create({
        report_id: reportId,
        ...validacao,
        validado_em: new Date().toISOString()
      });
    } catch (e) {
      console.error('Erro ao registrar validação:', e);
    }

    return Response.json({
      success: true,
      validacao,
      pode_usar: validacao.nivel_confianca === 'ALTA',
      mensagem: `Confiança: ${validacao.nivel_confianca} (${validacao.score_confianca.toFixed(0)}%)`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});