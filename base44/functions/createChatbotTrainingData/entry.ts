import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Dados de treinamento para o chatbot
    const trainingData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      created_by: user.email,
      
      project_summary: {
        name: "Museus Centro - Belo Horizonte",
        description: "Iniciativa cultural que integra museus importantes da região central de BH, fortalecendo a relação entre espaços culturais e a população",
        funding: "Secretaria Municipal de Cultura e Fundação Municipal de Cultura",
        key_principle: "Todas as atividades são gratuitas e acessíveis"
      },

      museums: {
        mhab: {
          name: "Museu Histórico Abílio Barreto",
          code: "MHAB",
          founded: 1943,
          focus: "História da cidade",
          description: "Primeiro museu de Belo Horizonte. Preserva a história da cidade com grande acervo"
        },
        misberth: {
          name: "Museu da Imagem e do Som de Belo Horizonte",
          code: "MIS BH",
          focus: "Patrimônio audiovisual",
          items: "Mais de 90 mil itens",
          description: "Instituição dedicada à preservação do patrimônio audiovisual da cidade"
        },
        mumo: {
          name: "Museu de Moda de Belo Horizonte",
          code: "MUMO",
          distinction: "Primeiro museu público de moda do Brasil",
          focus: "Cultura da moda e sua relação com a história"
        }
      },

      qa_training: [
        {
          id: "q001",
          question: "O que é o projeto Museus Centro?",
          answer: "É uma iniciativa cultural da Prefeitura de Belo Horizonte que integra museus importantes da região central da cidade, fortalecendo a relação entre espaços culturais e a população. O projeto promove exposições, atividades educativas e eventos culturais que estimulam o público a conhecer a história, a moda e a produção audiovisual de BH."
        },
        {
          id: "q002",
          question: "Quais são os museus participantes?",
          answer: "Existem três museus principais: MHAB (Museu Histórico Abílio Barreto), MIS BH (Museu da Imagem e do Som de Belo Horizonte) e MUMO (Museu de Moda de Belo Horizonte). Juntos, eles formam um percurso cultural único na cidade."
        },
        {
          id: "q003",
          question: "Qual é o foco de cada museu?",
          answer: "MHAB: História e memória de Belo Horizonte. MIS BH: Patrimônio audiovisual da cidade com mais de 90 mil itens. MUMO: Cultura da moda e sua relação com a história - é o primeiro museu público de moda do Brasil."
        },
        {
          id: "q004",
          question: "Quais são os principais objetivos do projeto?",
          answer: "1. Fortalecer a integração entre museus da região central. 2. Ampliar o acesso da população aos acervos museológicos. 3. Promover atividades culturais, educativas e de formação. 4. Valorizar a memória histórica, a moda e o audiovisual da cidade."
        },
        {
          id: "q005",
          question: "Que tipos de atividades são oferecidas?",
          answer: "Exposições temporárias e permanentes, oficinas educativas e culturais, mostras de cinema e audiovisual, eventos culturais e apresentações artísticas, programações especiais durante férias e datas comemorativas, e ações educativas voltadas para escolas e famílias."
        },
        {
          id: "q006",
          question: "As atividades são pagas?",
          answer: "Não, todas as atividades do projeto Museus Centro são completamente gratuitas. Isso ampliam o acesso à cultura, estimulam a educação patrimonial e fortalecem os museus como espaços de encontro e conhecimento."
        },
        {
          id: "q007",
          question: "Por que o projeto é importante culturalmente?",
          answer: "O projeto reforça a identidade cultural de Belo Horizonte ao conectar diferentes dimensões da memória urbana. Ao articular história, moda e audiovisual, cria um percurso cultural que incentiva a população a redescobrir a cidade e seus patrimônios, fortalecendo os museus como espaços de encontro e produção cultural."
        },
        {
          id: "q008",
          question: "O MUMO é único no Brasil?",
          answer: "Sim, o MUMO é o primeiro museu público de moda do Brasil, dedicado à cultura da moda e sua relação com a história, tornando-o uma instituição única e importante para a preservação dessa memória cultural."
        },
        {
          id: "q009",
          question: "Qual museu tem o maior acervo audiovisual?",
          answer: "O MIS BH (Museu da Imagem e do Som) é a instituição dedicada à preservação do patrimônio audiovisual da cidade, possuindo mais de 90 mil itens em sua coleção."
        },
        {
          id: "q010",
          question: "Desde quando o MHAB existe?",
          answer: "O MHAB (Museu Histórico Abílio Barreto) foi criado em 1943 e é o primeiro museu de Belo Horizonte, preservando a história da cidade."
        },
        {
          id: "q011",
          question: "Como o projeto contribui para educação patrimonial?",
          answer: "Através de atividades gratuitas que ampliam o acesso à cultura, estimulam a educação patrimonial e fortalecem os museus como espaços de encontro, conhecimento e produção cultural para a comunidade."
        },
        {
          id: "q012",
          question: "Existem programações especiais?",
          answer: "Sim, o projeto oferece programações especiais durante férias e datas comemorativas, além de ações educativas voltadas especialmente para escolas e famílias."
        }
      ],

      chatbot_guidelines: {
        tone: "Profissional, acessível e didático",
        focus_areas: [
          "Informações sobre o projeto Museus Centro",
          "Descrição dos três museus (MHAB, MIS BH, MUMO)",
          "Tipos de atividades e programações",
          "Reforçar caráter gratuito de todas as ações",
          "Valorizar importância cultural e educativa"
        ],
        restrictions: [
          "Não compartilhar informações financeiras",
          "Não fornecer detalhes de salários",
          "Manter foco em aspectos educativos e culturais"
        ]
      }
    };

    return Response.json({
      success: true,
      message: "Dados de treinamento do chatbot gerados com sucesso",
      data: trainingData
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});