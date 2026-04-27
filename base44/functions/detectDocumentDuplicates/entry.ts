import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import crypto from 'node:crypto';

// Calcula hash SHA-256 de um arquivo via URL
async function calculateFileHash(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    const hashBuffer = crypto.createHash('sha256').update(Buffer.from(buffer)).digest();
    return hashBuffer.toString('hex');
  } catch (e) {
    console.error('Erro ao calcular hash:', e);
    return null;
  }
}

// Compara dados de NF (idênticos = duplicado exato)
function compareNFData(nf1, nf2) {
  if (!nf1 || !nf2) return { isDuplicate: false, reason: '' };

  // Mesmos números e emitentes = duplicado
  if (nf1.nf_numero === nf2.nf_numero && 
      nf1.nf_emitente_cpf_cnpj === nf2.nf_emitente_cpf_cnpj &&
      nf1.nf_valor_total === nf2.nf_valor_total) {
    return { isDuplicate: true, reason: 'Mesma NF (número, emitente, valor)' };
  }

  return { isDuplicate: false, reason: '' };
}

// Calcula similaridade entre strings (para detecção de variações)
function stringSimilarity(str1 = '', str2 = '') {
  if (!str1 || !str2) return 0;
  const s1 = String(str1).toLowerCase().trim();
  const s2 = String(str2).toLowerCase().trim();
  if (s1 === s2) return 1;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { intake_id } = await req.json();
    if (!intake_id) {
      return Response.json({ error: 'intake_id required' }, { status: 400 });
    }

    // Carrega o documento atual
    const currentIntake = await base44.entities.DocumentIntake.list('id', 1);
    const intake = currentIntake.find(i => i.id === intake_id);
    
    if (!intake) {
      return Response.json({ error: 'Intake não encontrado' }, { status: 404 });
    }

    // Carrega todos os documentos do usuário (menos o atual)
    const allIntakes = await base44.entities.DocumentIntake.filter(
      { user_email: user.email, status_registro: 'ATIVO' },
      '-created_date',
      500
    );

    const otherIntakes = allIntakes.filter(i => i.id !== intake_id);
    const duplicates = [];

    // Se é NF, compara com outras NFs
    if (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') {
      const currentNFData = intake.resultado_ia || {};
      
      for (const otherIntake of otherIntakes) {
        if (otherIntake.tipo_detectado !== 'NOTA_FISCAL_PDF' && otherIntake.tipo_detectado !== 'NOTA_FISCAL_XML') {
          continue;
        }

        const otherNFData = otherIntake.resultado_ia || {};

        // Comparação 1: Hash idêntico = duplicado exato
        if (intake.file_hash && otherIntake.file_hash && intake.file_hash === otherIntake.file_hash) {
          duplicates.push({
            id: otherIntake.id,
            file_name: otherIntake.file_name_original,
            created_date: otherIntake.created_date,
            match_reason: 'Arquivo idêntico (hash)',
            similarity_score: 1,
          });
          continue;
        }

        // Comparação 2: Dados de NF idênticos
        const nfComparison = compareNFData(currentNFData, otherNFData);
        if (nfComparison.isDuplicate) {
          duplicates.push({
            id: otherIntake.id,
            file_name: otherIntake.file_name_original,
            nf_numero: otherNFData.nf_numero,
            match_reason: nfComparison.reason,
            similarity_score: 1,
            created_date: otherIntake.created_date,
          });
          continue;
        }

        // Comparação 3: Similaridade de NF (número + emitente)
        if (currentNFData.nf_numero && otherNFData.nf_numero) {
          const numberSim = stringSimilarity(currentNFData.nf_numero, otherNFData.nf_numero);
          const emitterSim = stringSimilarity(
            currentNFData.nf_emitente_cpf_cnpj,
            otherNFData.nf_emitente_cpf_cnpj
          );

          const avgSimilarity = (numberSim + emitterSim) / 2;

          if (avgSimilarity > 0.85) {
            duplicates.push({
              id: otherIntake.id,
              file_name: otherIntake.file_name_original,
              nf_numero: otherNFData.nf_numero,
              match_reason: `Número/emitente muito similar (${Math.round(avgSimilarity * 100)}%)`,
              similarity_score: avgSimilarity,
              created_date: otherIntake.created_date,
            });
          }
        }
      }
    } 
    // Se é foto, compara com outras fotos (por conteúdo / hash)
    else if (intake.tipo_detectado === 'FOTO_ATIVIDADE') {
      for (const otherIntake of otherIntakes) {
        if (otherIntake.tipo_detectado !== 'FOTO_ATIVIDADE') continue;

        // Hash idêntico = mesma foto
        if (intake.file_hash && otherIntake.file_hash && intake.file_hash === otherIntake.file_hash) {
          duplicates.push({
            id: otherIntake.id,
            file_name: otherIntake.file_name_original,
            match_reason: 'Foto idêntica (conteúdo)',
            similarity_score: 1,
            created_date: otherIntake.created_date,
          });
        }
      }
    }

    // Ordena por data (mais recentes primeiro)
    duplicates.sort((a, b) => {
      const dateA = new Date(a.created_date).getTime();
      const dateB = new Date(b.created_date).getTime();
      return dateB - dateA;
    });

    return Response.json({ 
      duplicates,
      count: duplicates.length,
      analysis_type: intake.tipo_detectado,
    });
  } catch (error) {
    console.error('Erro na detecção de duplicados:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});