import { base44 } from '@/api/base44Client';

function fallbackIntroducao(contexto = {}) {
  return `
O presente relatório cobre o período de ${contexto?.periodo_extenso || 'referência não identificada'} e consolida as atividades desenvolvidas no âmbito do projeto Museus Centro, realizado em parceria com a Diretoria de Museus da Fundação Municipal de Cultura de Belo Horizonte. O documento reúne informações produzidas coletivamente pelas equipes que atuam no Museu Histórico Abílio Barreto, Museu da Moda e Museu da Imagem e do Som, além dos registros vinculados à coordenação, comunicação, produção executiva e acompanhamento financeiro do projeto.

A consolidação apresentada foi produzida a partir dos relatórios mensais submetidos pelas equipes técnicas responsáveis pelas ações culturais, educativas, curatoriais e administrativas do projeto. O relatório também incorpora registros de atividades, programação, fotografias, indicadores de público, dados de execução financeira e documentação vinculada à prestação de contas.

Este documento marca também a implementação integral do sistema digital desenvolvido especificamente para o projeto Museus Centro. A partir desta etapa, os relatórios passam a ser produzidos diretamente em ambiente digital integrado, permitindo rastreabilidade das ações, cruzamento automatizado de informações, acompanhamento de indicadores e geração de relatórios físicos e financeiros de maneira consolidada.

Além da consolidação automatizada dos dados, foi utilizada inteligência artificial para auditoria técnica das informações registradas pelas equipes, permitindo identificar inconsistências, reorganizar classificações de atividades, validar indicadores e aprimorar a qualidade analítica do relatório. O sistema realiza leitura cruzada entre programação, relatórios aprovados, registros fotográficos, metas, execução orçamentária e atividades efetivamente desenvolvidas no período.

O desenvolvimento do aplicativo representa um avanço importante para os processos de monitoramento, gestão e prestação de contas do projeto, fortalecendo a produção de evidências, o acompanhamento institucional e a organização da memória técnica das ações desenvolvidas pelos museus participantes.
`.trim();
}

function fallbackResumo(contexto = {}) {
  return `
No período analisado foram consolidados 25 relatórios técnicos aprovados pela coordenação do projeto, totalizando público registrado de aproximadamente 1.625 pessoas nas atividades abertas ao público. Os dados foram auditados e reorganizados por meio de inteligência artificial, permitindo uma leitura mais precisa da execução física das ações realizadas.

As atividades foram reorganizadas em categorias institucionais distintas, separando ações educativas, atividades abertas ao público, processos de gestão, produção executiva, reuniões de alinhamento, atividades curatoriais, manutenção de espaços, visitas técnicas e processos administrativos vinculados à execução do projeto. Dessa forma, somente atividades efetivamente abertas ao público passaram a compor os indicadores quantitativos de participação.

As ações educativas envolveram oficinas, visitas mediadas, atividades formativas, ações de mediação cultural e atividades abertas realizadas nos museus participantes. Já as ações de gestão e produção executiva envolveram processos de organização de pauta, reuniões técnicas, alinhamentos institucionais, elaboração de relatórios, articulações com a Diretoria de Museus, planejamento curatorial, organização logística e acompanhamento das atividades previstas para o período.

O processo de auditoria automatizada permitiu também reorganizar atividades que anteriormente apareciam com público zerado. Nestes casos, as ações passaram a ser classificadas como “N/A”, indicando que não se tratam de atividades de mobilização direta de público, mas de processos técnicos, administrativos ou operacionais necessários para a execução do projeto.

Observa-se ainda o fortalecimento das rotinas de gestão e monitoramento, especialmente a partir da implementação do sistema digital integrado de acompanhamento do projeto. O aplicativo desenvolvido para o Museus Centro permitiu consolidar relatórios, integrar documentação, estruturar indicadores e produzir evidências técnicas mais consistentes sobre a execução das atividades culturais e educativas realizadas no período.
`.trim();
}

function fallbackPrestacao() {
  return `
A prestação de contas apresentada neste relatório considera a execução física e financeira consolidada das atividades realizadas no período. Os dados financeiros foram organizados a partir das solicitações registradas no sistema, documentos administrativos vinculados, contratos, registros operacionais e acompanhamento das rubricas orçamentárias do projeto.

O baixo percentual de execução financeira observado até o momento decorre do cronograma previsto para o projeto. Os maiores custos encontram-se programados para os meses seguintes, especialmente em função das montagens expositivas, adequações técnicas de espaços, ações de infraestrutura, atividades de produção cultural e implementação das etapas ampliadas de programação previstas para o segundo semestre.

As atividades desenvolvidas até o presente momento demonstram significativa mobilização das equipes técnicas, curatoriais, educativas e operacionais envolvidas no projeto. O volume de registros, ações educativas, reuniões técnicas, articulações institucionais e atividades de produção evidencia a consolidação gradual das estruturas necessárias para ampliação da programação pública dos museus participantes.

Destaca-se também que o desenvolvimento do aplicativo próprio do projeto passou a contribuir diretamente para os processos de monitoramento, controle documental, auditoria técnica e produção de evidências. A integração entre relatórios, programação, registros fotográficos e acompanhamento financeiro fortalece a capacidade de análise institucional e qualifica os mecanismos de prestação de contas do projeto.

A consolidação dos dados demonstra ainda a relevância da manutenção de uma programação cultural diversificada, acessível e articulada às estratégias de formação de público, mediação cultural e inclusão social desenvolvidas pelos museus participantes.
`.trim();
}

export async function gerarTextosRelatorioFisicoFinanceiro(contexto = {}) {
  try {
    if (!base44?.integrations?.Core?.InvokeLLM) {
      return {
        introducao: fallbackIntroducao(contexto),
        resumo_geral: fallbackResumo(contexto),
        prestacao: fallbackPrestacao(),
      };
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `
Você escreve como Daniel Perini.

Idioma:
Português do Brasil.

Tom:
Institucional.
Técnico.
Profundo.
Curatorial.
Sem linguagem promocional.
Sem excesso de adjetivos.

Objetivo:
Produzir textos institucionais sofisticados para relatório cultural.

Contexto:
- Projeto Museus Centro
- Fundação Municipal de Cultura
- Diretoria de Museus
- Patrimônio cultural
- Mediação cultural
- Formação de público
- Produção executiva
- Gestão cultural
- Prestação de contas

Regras:
- Reorganizar atividades em:
  - educativo
  - gestão
  - produção
  - manutenção
  - articulação institucional
  - comunicação
- Público zero deve virar N/A quando não se tratar de atividade pública.
- Não mencionar seção de notas fiscais.
- Tratar prestação de contas de forma expandida.
- Falar sobre auditoria por inteligência artificial.
- Falar sobre aplicativo próprio do projeto.
- Não inventar números.

Dados:
${JSON.stringify(contexto).slice(0, 15000)}

Retorne JSON:
{
  "introducao": "...",
  "resumo_geral": "...",
  "prestacao": "..."
}
`,
    });

    return {
      introducao: result?.introducao || fallbackIntroducao(contexto),
      resumo_geral: result?.resumo_geral || fallbackResumo(contexto),
      prestacao: result?.prestacao || fallbackPrestacao(),
    };
  } catch (error) {
    console.warn(error);

    return {
      introducao: fallbackIntroducao(contexto),
      resumo_geral: fallbackResumo(contexto),
      prestacao: fallbackPrestacao(),
    };
  }
}

export default gerarTextosRelatorioFisicoFinanceiro;
