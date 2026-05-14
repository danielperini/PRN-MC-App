import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FRASES_PARTICIPACAO = [
  'ampliando experiências de participação social',
  'fortalecendo o envolvimento coletivo',
  'consolidando espaços de diálogo e construção conjunta',
  'promovendo a voz e o protagonismo dos participantes',
  'através de processos participativos e colaborativos',
  'envolvendo ativamente a comunidade',
  'em construção coletiva com os públicos',
  'com significativa participação comunitária',
];

const FRASES_MEDIACAO = [
  'práticas de mediação cultural e educação',
  'processos educativos de interação e aprendizagem',
  'ações de mediação entre os públicos e o conhecimento',
  'consolidando processos de formação e escuta',
  'através de diálogos educativos e mediadores',
  'reforçando a função educativa e cultural',
  'em processos de aprendizagem compartilhada',
];

const FRASES_TERRITORIO = [
  'considerando a leitura e a escuta territorial',
  'com dimensão e pertencimento territorial',
  'refletindo a realidade e as dinâmicas locais',
  'na perspectiva da apropriação dos espaços',
  'vinculando cultura e desenvolvimento territorial',
  'em diálogo com as comunidades locais',
  'refletindo as demandas e identidades territoriais',
];

const FRASES_MEMORIA = [
  'produzindo registros visuais e documentais',
  'consolidando memória através de documentação',
  'produção compartilhada de conhecimento e memória',
  'registrando experiências e vivências',
  'em construção colaborativa da memória institucional',
  'documentando processos e aprendizagens',
];

const FRASES_EQUIPES = [
  'refletindo trabalho colaborativo das equipes',
  'demonstrando articulação entre equipes',
  'em integração de diferentes saberes e práticas',
  'resultado de atuação conjunta e integrada',
  'consolidando a atuação institucional coordenada',
  'evidenciando trabalho em rede e colaborativo',
];

function selecionarAleatoriamente(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function analisarContexroActividad(atividade, patterns) {
  const contexto = {
    titulo: atividade.titulo,
    tipo: atividade.tipo_atividade,
    publico: atividade.publico_total,
    repeticoes: atividade.quantas_repeticoes,
    temParceria: atividade.parceria === 'Sim',
    temFotos: Array.isArray(atividade.fotos) && atividade.fotos.length > 0,
    temObservacoes: !!atividade.observacoes,
    eEducativa: ['Oficina', 'Palestra', 'Workshop', 'Encontro', 'Roda de Conversa'].includes(
      atividade.tipo_atividade
    ),
    eMetaEstruturada: atividade.classificacao === 'META',
  };

  return contexto;
}

function gerarFraseComplementar(atividade, patterns) {
  const frases = [];

  // Se tem participação significativa
  if (atividade.publico > 100 || atividade.repeticoes > 3 || atividade.temParceria) {
    frases.push(selecionarAleatoriamente(FRASES_PARTICIPACAO));
  }

  // Se é educativa/mediativa
  if (atividade.eEducativa) {
    frases.push(selecionarAleatoriamente(FRASES_MEDIACAO));
  }

  // Se tem registros visuais
  if (atividade.temFotos) {
    frases.push(selecionarAleatoriamente(FRASES_MEMORIA));
  }

  // Se tem observações detalhadas
  if (atividade.temObservacoes) {
    frases.push('com escuta das percepções e vivências dos participantes');
  }

  if (frases.length === 0) {
    frases.push('consolidando a atuação institucional');
  }

  return frases.join(', ');
}

async function gerarSinteseSociologica(atividades, patterns) {
  if (!Array.isArray(atividades) || atividades.length === 0) {
    return null;
  }

  // Agrupar atividades por tipo
  const atividadesPorTipo = {};
  for (const atividade of atividades) {
    const tipo = atividade.tipo_atividade || 'Outra';
    if (!atividadesPorTipo[tipo]) {
      atividadesPorTipo[tipo] = [];
    }
    atividadesPorTipo[tipo].push(atividade);
  }

  let sintese = 'As atividades realizadas no período ';

  const aspectos = [];

  // Aspecto 1: Participação
  const totalParticipantes = atividades.reduce((sum, a) => sum + (a.publico_total || 0), 0);
  if (totalParticipantes > 0) {
    aspectos.push(
      `reuniram aproximadamente ${totalParticipantes} participantes em processos de ` +
      `${selecionarAleatoriamente(FRASES_PARTICIPACAO)}`
    );
  }

  // Aspecto 2: Mediação
  const atividadesEducativas = atividades.filter(
    (a) =>
      ['Oficina', 'Palestra', 'Workshop', 'Encontro', 'Roda de Conversa'].includes(
        a.tipo_atividade
      )
  );
  if (atividadesEducativas.length > 0) {
    aspectos.push(
      `consolidaram ${atividadesEducativas.length} processo(s) educativo(s) de ` +
      `${selecionarAleatoriamente(FRASES_MEDIACAO)}`
    );
  }

  // Aspecto 3: Memória e registros
  const atividadesComFotos = atividades.filter(
    (a) => Array.isArray(a.fotos) && a.fotos.length > 0
  );
  if (atividadesComFotos.length > 0) {
    aspectos.push(
      `evidenciaram ${selecionarAleatoriamente(FRASES_MEMORIA)}`
    );
  }

  // Montar síntese
  if (aspectos.length > 0) {
    sintese += aspectos.join(', contribuindo para ') + '.';
  } else {
    sintese += 'reforçaram o compromisso institucional com a cultura e a participação.';
  }

  // Adicionar dimensão de equipe
  sintese +=
    ` Este trabalho reflete ${selecionarAleatoriamente(FRASES_EQUIPES)}, evidenciando ` +
    `o compromisso com fortalecimento cultural e desenvolvimento territorial.`;

  return sintese;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, atividades, patterns } = await req.json();

    if (!reportId || !Array.isArray(atividades)) {
      return Response.json({ error: 'reportId and atividades are required' }, { status: 400 });
    }

    // Gerar síntese sociológica
    const sinteseSociologica = await gerarSinteseSociologica(atividades, patterns);

    // Gerar frases por atividade (top 3)
    const atividadesDestacadas = atividades
      .filter((a) => a.titulo)
      .slice(0, 3)
      .map((atividade) => ({
        titulo: atividade.titulo,
        frase: gerarFraseComplementar(atividade, patterns),
      }));

    return Response.json({
      success: true,
      sinteseSociologica,
      atividadesDestacadas,
      totalAtividades: atividades.length,
      totalParticipantes: atividades.reduce((sum, a) => sum + (a.publico_total || 0), 0),
    });
  } catch (error) {
    console.error('Erro ao enriquecer com linguagem sociológica:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});