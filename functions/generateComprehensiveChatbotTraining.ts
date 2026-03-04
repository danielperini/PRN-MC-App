import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trainingData = {
      timestamp: new Date().toISOString(),
      version: "2.0 - Completo com 3º Aditivo",
      created_by: user.email,
      document_source: "3º Termo Aditivo ao Termo de Colaboração (VIGENTE)",
      
      contract_info: {
        instrument: "3º Termo Aditivo ao Termo de Colaboração",
        chamamento: "FMC nº 001/2024",
        vigencia: "até 29 de novembro de 2026",
        duracao: "28 meses",
        valor_global: "R$ 3.891.800,00",
        acrescimo_3_aditivo: "R$ 1.320.000,00",
        parties: ["Fundação Municipal de Cultura (FMC)", "OSC Viaduto das Artes"]
      },

      museums_detailed: {
        mumo: {
          name: "Museu da Moda de Belo Horizonte",
          code: "MUMO",
          distinction: "Primeiro museu público de moda do Brasil",
          location: "R. da Bahia, 1149 - Centro",
          building: "Castelinho da Bahia (arquitetura neogótica)",
          focus: ["Moda como bem cultural", "Economia criativa", "Design"],
          current_exhibition: "Clara Nunes - eu sou a tal mineira",
          activities: ["Exposições", "Oficinas", "Debates", "Visitas mediadas", "Teatro de bolso"]
        },
        mis: {
          name: "Museu da Imagem e do Som de Belo Horizonte",
          code: "MIS BH",
          location: "Av. Álvares Cabral, 560 - Lourdes",
          focus: "Salvaguarda do patrimônio audiovisual",
          acervo: "Mais de 90 mil itens",
          current_exhibition: "Cinema: coleções e outras sensações",
          activities: ["Cineclubes", "Oficinas de cinema", "Cine ao ar livre", "Preservação audiovisual"]
        },
        mhab: {
          name: "Museu Histórico Abílio Barreto",
          code: "MHAB",
          founded: 1941,
          location: "Av. Prudente de Morais, 202 - Cidade Jardim",
          building: "Casarão da Fazenda do Leitão (1883)",
          focus: "História e dinâmica urbana de BH",
          current_exhibition: "Belo Horizonte Fora dos Planos",
          programs: ["Museu em Perspectiva", "Arte no Museu", "Acervos Operacionais"]
        }
      },

      project_goals: [
        "Fortalecer integração entre museus da região central",
        "Ampliar acesso aos acervos museológicos",
        "Promover atividades culturais e educativas",
        "Valorizar memória histórica, moda e audiovisual"
      ],

      key_principles: [
        "Todas as ações são GRATUITAS",
        "Classificação indicativa LIVRE",
        "Proibição de conteúdo discriminatório",
        "Acessibilidade garantida",
        "Trabalho colaborativo FMC + OSC"
      ],

      governance: {
        commission: "Comissão de Programação (paritária)",
        osc_roles: [
          "Coordenação Geral",
          "Coordenação de Programação",
          "Coordenação de Comunicação",
          "Coordenação de Produção"
        ],
        fmc_roles: [
          "3 Coordenadores dos museus",
          "Diretoria de Museus"
        ]
      },

      metas_summary: {
        fase_1_18: {
          exposicoes: ["Casarão MHAB", "MIS"],
          acoes_educativas: 60,
          acoes_culturais: 36,
          mostras: 18,
          alteracao_nucleos: 2
        },
        fase_3_19_28: {
          exposicao_mumo: 1,
          acoes_educativas_culturais: 30,
          consultorias: 2,
          formacao: 1
        },
        toda_vigencia: {
          educadores_fixos: 3,
          diarias_educadores: 101,
          catalogos: 4,
          maquete_tatil: 1,
          videos_libras: 5,
          noturno_edicoes: 3,
          presente_iemanja: 1
        }
      },

      comprehensive_qa: [
        {
          category: "Contrato e Vigência",
          questions: [
            {
              q: "Qual é o instrumento vigente?",
              a: "O 3º Termo Aditivo ao Termo de Colaboração, vinculado ao Chamamento Público FMC nº 001/2024, é o instrumento vigente até 29 de novembro de 2026."
            },
            {
              q: "Até quando vai o projeto?",
              a: "O projeto vigora até 29 de novembro de 2026, totalizando 28 meses de execução."
            },
            {
              q: "Qual o valor total do projeto?",
              a: "O valor global é R$ 3.891.800,00, sendo R$ 1.320.000,00 referentes ao acréscimo do 3º Termo Aditivo."
            }
          ]
        },
        {
          category: "Museus",
          questions: [
            {
              q: "Quais museus fazem parte?",
              a: "MUMO (Museu da Moda), MIS BH (Museu da Imagem e do Som) e MHAB (Museu Histórico Abílio Barreto)."
            },
            {
              q: "O que é o MUMO?",
              a: "É o primeiro museu público de moda do Brasil, localizado no Castelinho da Bahia. Trabalha com moda, design, economia criativa e memória."
            },
            {
              q: "Qual é o acervo do MIS?",
              a: "O MIS preserva mais de 90 mil itens audiovisuais, trabalhando com salvaguarda, catalogação e difusão do patrimônio audiovisual de BH."
            },
            {
              q: "Quando foi fundado o MHAB?",
              a: "O MHAB foi fundado em 1941 e é o primeiro museu de Belo Horizonte, dedicado à história e memória urbana da cidade."
            }
          ]
        },
        {
          category: "Atividades e Metas",
          questions: [
            {
              q: "Quantas ações educativas estão previstas?",
              a: "60 ações educativas na fase 1 (mês 2-18) + 30 ações educativas/culturais na fase final (mês 19-28)."
            },
            {
              q: "Quantas ações culturais serão realizadas?",
              a: "36 ações culturais na fase 1, mais 30 ações mistas na fase final, além das 4 ações do Presente de Iemanjá."
            },
            {
              q: "Quantos educadores o projeto tem?",
              a: "3 educadores fixos com carga de 40h semanais (um em cada museu), mais 101 diárias de educadores para atendimento ao público espontâneo."
            },
            {
              q: "O que são as 18 mostras?",
              a: "São mostras de curta duração e baixa/média complexidade em áreas não convencionais dos museus (foyer, jardins, mezanino, hall)."
            }
          ]
        },
        {
          category: "Exposições",
          questions: [
            {
              q: "Quais exposições novas estão previstas?",
              a: "1 exposição no Casarão do MHAB, 1 exposição no MIS e 1 exposição no MUMO, além de alteração de 2 núcleos (MUMO e MIS)."
            },
            {
              q: "O que é alteração de núcleos?",
              a: "É a substituição de acervos e obras em salas específicas das exposições permanentes 'Clara Nunes' (MUMO) e 'Cinema: coleções e outras sensações' (MIS)."
            }
          ]
        },
        {
          category: "Noturno nos Museus",
          questions: [
            {
              q: "O que é o Noturno nos Museus?",
              a: "É um evento cultural que abre diversos museus de BH em horário estendido (18h às 23h), com programação gratuita e vans de transporte entre os espaços."
            },
            {
              q: "Quantas edições do Noturno serão realizadas?",
              a: "3 edições: 2024, 2025 e 2026."
            },
            {
              q: "Tem transporte gratuito no Noturno?",
              a: "Sim, são disponibilizadas vans gratuitas que circulam entre os museus durante todo o evento."
            },
            {
              q: "Quando foi a última edição do Noturno?",
              a: "A 10ª edição ocorreu em 27 de junho de 2025, com mais de 30 museus participantes."
            },
            {
              q: "Quantas pessoas participaram do Noturno em 2024?",
              a: "A 9ª edição em dezembro de 2024 reuniu 24 espaços culturais em celebração aos 127 anos de Belo Horizonte."
            }
          ]
        },
        {
          category: "Acessibilidade",
          questions: [
            {
              q: "Quais recursos de acessibilidade estão previstos?",
              a: "1 maquete tátil, 5 vídeos em Libras e 1 formação em ambiente seguro e acessibilidade."
            },
            {
              q: "O projeto é acessível?",
              a: "Sim, todas as ações garantem acessibilidade, com dispositivos pedagógicos, mediação inclusiva e formação específica."
            }
          ]
        },
        {
          category: "Publicações",
          questions: [
            {
              q: "Quantos catálogos serão produzidos?",
              a: "4 catálogos com 300 exemplares cada: 2 para o MHAB, 1 para o MIS e 1 para o MUMO."
            }
          ]
        },
        {
          category: "Presente de Iemanjá",
          questions: [
            {
              q: "O que é o Presente de Iemanjá?",
              a: "É um festejo de cultura de matriz africana realizado na orla da Lagoa da Pampulha, com 4 ações culturais, infraestrutura completa e divulgação."
            },
            {
              q: "Por que o MHAB apoia o Presente de Iemanjá?",
              a: "Porque se integra às ações do MHAB na Pampulha, valorizando a cultura negra e manifestações importantes para a memória dessas comunidades."
            }
          ]
        },
        {
          category: "Gratuidade",
          questions: [
            {
              q: "As atividades são pagas?",
              a: "Não. TODAS as atividades do projeto são completamente gratuitas e com classificação indicativa livre."
            },
            {
              q: "Precisa pagar para visitar os museus?",
              a: "Não, todas as visitas, exposições, oficinas e atividades são gratuitas e abertas ao público."
            }
          ]
        },
        {
          category: "Fase 3 do Projeto",
          questions: [
            {
              q: "O que acontece na Fase 3?",
              a: "A Fase 3 (mês 19-28) inclui: 30 ações educativas/culturais, nova exposição no MUMO, 2 consultorias e 1 formação em ambiente seguro."
            },
            {
              q: "Quantos meses tem a Fase 3?",
              a: "A Fase 3 tem 10 meses de duração (mês 19 ao mês 28)."
            }
          ]
        },
        {
          category: "Estrutura e Equipe",
          questions: [
            {
              q: "O que é a Comissão de Programação?",
              a: "É uma comissão paritária formada por coordenadores da OSC (Geral, Programação, Comunicação e Produção) + coordenadores dos 3 museus + Diretoria de Museus."
            },
            {
              q: "Quem coordena o projeto?",
              a: "A Coordenação Geral gerencia todas as etapas, cronograma e relatórios, em diálogo constante com a FMC e museus."
            }
          ]
        }
      ],

      detailed_meta_breakdown: [
        {
          meta: 1,
          nome: "Contratação da equipe principal",
          periodo: "Mês 1 ao 28",
          entregas: ["Coordenação Geral", "Coordenação Programação", "Coordenação Comunicação", "Coordenação Produção"]
        },
        {
          meta: 2,
          nome: "Plano de Comunicação nacional",
          periodo: "Mês 1 ao 28",
          entregas: ["Identidade visual", "Peças gráficas", "Assessoria de imprensa", "Relatórios trimestrais"]
        },
        {
          meta: 3,
          nome: "Manutenção de 4 exposições",
          periodo: "Mês 2 ao 28",
          entregas: ["Reparos preventivos", "Manutenções corretivas"]
        },
        {
          meta: 4,
          nome: "Alteração de 2 núcleos",
          periodo: "Mês 6 ao 15",
          entregas: ["Núcleo MUMO", "Núcleo MIS"]
        },
        {
          meta: 5,
          nome: "60 ações educativas",
          periodo: "Mês 2 ao 18",
          tipos: ["Oficinas", "Palestras", "Mesas redondas", "Exibição de filmes"]
        },
        {
          meta: 6,
          nome: "36 ações culturais",
          periodo: "Mês 2 ao 18",
          tipos: ["Teatro", "Música", "Dança", "Literatura"]
        },
        {
          meta: 7,
          nome: "3 educadores fixos",
          periodo: "Mês 1 ao 28",
          detalhes: "40h semanais, 1 por museu, 28 parcelas totais, 10 parcelas na Fase 3"
        },
        {
          meta: 8,
          nome: "Exposição Casarão MHAB",
          periodo: "Mês 1 ao 18 (abertura mês 11)",
          etapas: ["Desmontagem", "Montagem", "Abertura", "Manutenção"]
        },
        {
          meta: 9,
          nome: "Exposição MIS",
          periodo: "Mês 11 ao 18",
          area: "96,77 m²"
        },
        {
          meta: 10,
          nome: "18 mostras de curta duração",
          periodo: "Mês 3 ao 28",
          locais: ["Foyer", "Jardins", "Mezanino", "Hall", "Áreas não convencionais"]
        },
        {
          meta: 11,
          nome: "Noturno nos Museus (3 edições)",
          periodo: "Mês 3 ao 28",
          edicoes: ["2024", "2025", "2026"],
          inclui: ["Vans gratuitas", "Monitores", "Iluminação", "Segurança"]
        },
        {
          meta: 12,
          nome: "Projeto curatorial MHAB galeria sede",
          periodo: "Mês 6 ao 18",
          entregas: ["Pesquisa", "Curadoria", "Projeto expográfico"]
        },
        {
          meta: 13,
          nome: "Projeto curatorial MUMO",
          periodo: "Mês 6 ao 18",
          entregas: ["Pesquisa", "Curadoria", "Identidade visual"]
        },
        {
          meta: 14,
          nome: "Inscrição em Leis de Incentivo",
          periodo: "Mês 1 ao 18",
          acoes: ["Lei Federal", "Editais", "Apresentação a empresas"]
        },
        {
          meta: 15,
          nome: "Dispositivos acessíveis",
          periodo: "Mês 2 ao 18",
          entregas: ["1 maquete tátil", "5 vídeos em Libras"]
        },
        {
          meta: 16,
          nome: "101 diárias de educador",
          periodo: "Mês 2 ao 28",
          foco: "Mediação ao público espontâneo (finais de semana)"
        },
        {
          meta: 17,
          nome: "4 Publicações",
          periodo: "Mês 2 ao 28",
          distribuicao: ["2 MHAB", "1 MIS", "1 MUMO"],
          tiragem: "300 exemplares cada"
        },
        {
          meta: 18,
          nome: "Custeios contínuos",
          periodo: "Mês 1 ao 28",
          inclui: ["Lanches", "Materiais pedagógicos", "Consultorias"]
        },
        {
          meta: 19,
          nome: "Presente de Iemanjá",
          periodo: "Mês 6 ao 15",
          inclui: ["4 ações culturais", "Produção", "Infraestrutura", "Logística"]
        },
        {
          meta: 20,
          nome: "30 ações fase final",
          periodo: "Mês 19 ao 28",
          distribuicao: "Entre os 3 museus"
        },
        {
          meta: 21,
          nome: "Exposição MUMO",
          periodo: "Mês 19 ao 28",
          etapas: ["Desmobilização anterior", "Pesquisa", "Montagem", "Abertura"]
        },
        {
          meta: 23,
          nome: "Consultorias",
          periodo: "Mês 19 ao 28",
          entregas: ["2 consultorias temáticas", "1 formação ambiente seguro"]
        }
      ],

      chatbot_guidelines_updated: {
        tone: "Profissional, acessível, didático e encorajador",
        must_mention: [
          "Gratuidade de todas as ações",
          "3º Termo Aditivo como instrumento vigente",
          "Classificação indicativa livre",
          "Trabalho colaborativo OSC + FMC"
        ],
        must_not_mention: [
          "Valores salariais individuais",
          "Detalhes financeiros específicos de RH"
        ],
        can_mention: [
          "Quantitativos de metas",
          "Cronograma de execução",
          "Estrutura de coordenação",
          "Tipos de atividades",
          "Público-alvo"
        ]
      }
    };

    const jsonContent = JSON.stringify(trainingData, null, 2);

    // Upload para Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    let folderId = null;
    const searchResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=name=%27Treinamento%20Chatbot%20Museus%27%20and%20mimeType=%27application/vnd.google-apps.folder%27%20and%20trashed=false',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchResponse.json();
    
    if (!searchData.files || searchData.files.length === 0) {
      const createResponse = await fetch(
        'https://www.googleapis.com/drive/v3/files',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Treinamento Chatbot Museus',
            mimeType: 'application/vnd.google-apps.folder'
          })
        }
      );
      const folderData = await createResponse.json();
      folderId = folderData.id;
    } else {
      folderId = searchData.files[0].id;
    }

    // Upload JSON
    const formData = new FormData();
    const file = new File([jsonContent], `chatbot_training_completo_${new Date().toISOString().split('T')[0]}.json`);
    formData.append('metadata', new Blob([JSON.stringify({
      name: `chatbot_training_completo_${new Date().toISOString().split('T')[0]}.json`,
      parents: [folderId]
    })], { type: 'application/json' }));
    formData.append('file', file);

    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      }
    );

    return Response.json({
      success: true,
      message: 'Treinamento completo gerado e enviado ao Google Drive',
      folder_id: folderId,
      total_questions: trainingData.comprehensive_qa.reduce((sum, cat) => sum + cat.questions.length, 0)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});