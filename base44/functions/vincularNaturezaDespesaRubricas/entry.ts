import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Mapeamento de palavras-chave para natureza de despesa
// 339030 = Material de Consumo
// 339035 = Serviços de Consultoria (PF)
// 339036 = Outros Serviços de Terceiros (PF)
// 339039 = Outros Serviços de Terceiros (PJ)
// 339030 = Passagens e Despesas de Locomoção
// 449052 = Equipamentos e Material Permanente

const REGRAS_NATUREZA = [
  // 339039 — Outros Serviços de Terceiros PJ (empresas/CNPJ)
  {
    codigo: '339039',
    nome: 'Outros Serviços de Terceiros - Pessoa Jurídica',
    palavras: [
      'comunicacao', 'comunicação', 'assessoria', 'designer', 'grafica', 'gráfica',
      'producao', 'produção', 'expografia', 'expografica', 'expográfica',
      'captacao', 'captação', 'video', 'vídeo', 'foto', 'audiovisual',
      'impressao', 'impressão', 'publicacao', 'publicação', 'editorial',
      'segurança', 'seguranca', 'limpeza', 'manutencao', 'manutenção',
      'locacao', 'locação', 'aluguel', 'hospedagem', 'translado', 'transporte',
      'logistica', 'logística', 'buffet', 'catering', 'sonorizacao', 'sonorização',
      'iluminacao', 'iluminação', 'cerimonial', 'montagem', 'desmontagem',
      'terceiros pj', 'pessoa juridica', 'pessoa jurídica', 'cnpj',
    ]
  },
  // 339036 — Outros Serviços de Terceiros PF (pessoas físicas)
  {
    codigo: '339036',
    nome: 'Outros Serviços de Terceiros - Pessoa Física',
    palavras: [
      'artista', 'artístico', 'artistico', 'performer', 'musico', 'músico',
      'ator', 'atriz', 'dancando', 'dançando', 'danca', 'dança', 'teatro',
      'oficina', 'facilitador', 'mediador', 'mediacao', 'mediação',
      'monitoria', 'monitora', 'monitor', 'educador', 'educadora',
      'bolsista', 'estagiario', 'estagiário', 'voluntario', 'voluntário',
      'pessoa fisica', 'pessoa física', 'cpf', 'terceiros pf',
    ]
  },
  // 339035 — Serviços de Consultoria PF
  {
    codigo: '339035',
    nome: 'Serviços de Consultoria - Pessoa Física',
    palavras: [
      'consultoria', 'consultor', 'coordenador', 'coordenação', 'coordenacao',
      'coordenadora', 'gerencia', 'gerência', 'gerente', 'gestor', 'gestora',
      'diretor', 'diretora', 'supervisao', 'supervisão', 'supervisor', 'supervisora',
      'formacao', 'formação', 'capacitacao', 'capacitação', 'treinamento',
      'acessibilidade', 'diversidade', 'inclusao', 'inclusão',
      'curadoria', 'curador', 'curadora', 'arquiteto', 'arquiteta',
      'contador', 'contadora', 'advogado', 'advogada', 'juridico', 'jurídico',
    ]
  },
  // 339030 — Material de Consumo
  {
    codigo: '339030',
    nome: 'Material de Consumo',
    palavras: [
      'material', 'consumo', 'suprimento', 'papelaria', 'escritório', 'escritorio',
      'insumo', 'copo', 'garrafa', 'alimento', 'lanche', 'cafe', 'café',
      'coffee', 'agua', 'água', 'higiene', 'limpeza consumo',
    ]
  },
  // 449052 — Equipamentos e Material Permanente
  {
    codigo: '449052',
    nome: 'Equipamentos e Material Permanente',
    palavras: [
      'equipamento', 'permanente', 'computador', 'notebook', 'projetor',
      'camera', 'câmera', 'televisao', 'televisão', 'monitor', 'impressora',
      'mobiliario', 'mobiliário', 'movel', 'móvel', 'infrastructure',
    ]
  },
];

function normalizarTexto(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function detectarNatureza(rubrica) {
  // Se já tem natureza_despesa definida e nome_natureza, respeita
  if (rubrica.natureza_despesa && rubrica.nome_natureza) {
    return null; // sem alteração necessária
  }

  const textoBase = normalizarTexto(
    [rubrica.rubrica, rubrica.nome, rubrica.grupo, rubrica.descricao, rubrica.nome_natureza].join(' ')
  );

  // Prioridade: verifica regras na ordem (mais específica primeiro)
  for (const regra of REGRAS_NATUREZA) {
    for (const palavra of regra.palavras) {
      if (textoBase.includes(normalizarTexto(palavra))) {
        return { codigo: regra.codigo, nome: regra.nome };
      }
    }
  }

  // Fallback: 339039 para qualquer serviço não identificado
  return { codigo: '339039', nome: 'Outros Serviços de Terceiros - Pessoa Jurídica' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const forcarSobrescrita = body?.forcar === true;

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);

    let atualizadas = 0;
    let ignoradas = 0;
    const detalhes = [];

    for (const rubrica of rubricas) {
      // Se já tem ambos os campos e não está forçando sobrescrita, pula
      if (!forcarSobrescrita && rubrica.natureza_despesa && rubrica.nome_natureza) {
        ignoradas++;
        continue;
      }

      const natureza = detectarNatureza(rubrica);
      if (!natureza) {
        ignoradas++;
        continue;
      }

      // Só atualiza se for diferente do que já está
      if (
        !forcarSobrescrita &&
        rubrica.natureza_despesa === natureza.codigo &&
        rubrica.nome_natureza === natureza.nome
      ) {
        ignoradas++;
        continue;
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        natureza_despesa: natureza.codigo,
        nome_natureza: natureza.nome,
      });

      atualizadas++;
      detalhes.push({
        rubrica: rubrica.rubrica || rubrica.nome,
        natureza_despesa: natureza.codigo,
        nome_natureza: natureza.nome,
      });
    }

    return Response.json({
      success: true,
      total: rubricas.length,
      atualizadas,
      ignoradas,
      detalhes,
      message: `${atualizadas} rubricas atualizadas com natureza de despesa.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});