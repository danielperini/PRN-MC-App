import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Validação de densidade textual e conformidade editorial
function validarDensidade(texto) {
  if (!texto) return { valido: false, erro: 'Texto vazio' };
  
  const paragrafos = texto.split('\n\n').filter(p => p.trim());
  if (paragrafos.length < 3) {
    return { valido: false, erro: `Mínimo 3 parágrafos (obtido ${paragrafos.length})` };
  }
  
  for (let i = 0; i < paragrafos.length; i++) {
    const palavras = paragrafos[i].trim().split(/\s+/).length;
    if (palavras < 80) {
      return { valido: false, erro: `Parágrafo ${i+1} curto (${palavras} palavras, mín 80)` };
    }
  }
  
  return { valido: true, paragrafos: paragrafos.length };
}

function detectarTextoAutomatico(texto) {
  const generico = [
    'foi realizado um',
    'durante o período',
    'a atividade foi',
    'conforme planejado',
    'neste mês'
  ];
  
  const count = generico.filter(g => 
    texto.toLowerCase().includes(g.toLowerCase())
  ).length;
  
  return count;
}

function validarFontes(blocoTexto, fontesDisp) {
  const fontes = {
    relatorios: fontesDisp.relatorios?.length || 0,
    atividades: fontesDisp.atividades?.length || 0,
    agenda: fontesDisp.agenda?.length || 0,
    programacao: fontesDisp.programacao?.length || 0,
    releases: fontesDisp.releases?.length || 0,
    imagens: fontesDisp.imagens?.length || 0,
    documentos: fontesDisp.documentos?.length || 0,
    financeiro: fontesDisp.financeiro ? 1 : 0
  };
  
  const integ = Object.values(fontes).filter(v => v > 0).length;
  
  return {
    valido: integ >= 2,
    integradas: integ,
    detalhes: fontes
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const { texto, fontes = {} } = body;

    if (!texto) return Response.json({ error: 'Texto obrigatório' }, { status: 400 });

    const densidade = validarDensidade(texto);
    const generico = detectarTextoAutomatico(texto);
    const fontesValidacao = validarFontes(texto, fontes);

    return Response.json({
      densidade,
      textoAutomatico: generico,
      fontesValidacao,
      conformidade: densidade.valido && generico < 2 && fontesValidacao.valido
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});