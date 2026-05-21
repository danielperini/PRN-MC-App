import React from 'react';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';
import { splitParagraphs } from './premiumReportUtils';

function buildFechamentoEditorial(contexto = {}) {
  const periodo = contexto?.reportEditorial?.periodLabel || contexto?.periodo_extenso || 'o recorte selecionado';
  return `O encerramento deste relatório não se organiza como uma conclusão administrativa, mas como o registro de uma experiência coletiva de trabalho, acompanhamento e construção institucional.

Durante ${periodo}, o Projeto Museus Centro foi sustentado por uma rede de pessoas, equipamentos públicos, equipes técnicas, educadoras, produtores, coordenações, prestadoras de serviço e parceiros institucionais que deram forma cotidiana à política pública cultural nos museus municipais de Belo Horizonte.

A documentação reunida no aplicativo preserva uma parte importante dessa experiência. Relatórios, fotografias, programações, indicadores, documentos fiscais, registros educativos, evidências de produção e informações financeiras deixam de aparecer como arquivos isolados e passam a compor uma memória operacional do projeto.

Essa memória não substitui a presença viva nos museus. Ao contrário, ajuda a reconhecer o que foi realizado, como foi realizado e quais vínculos foram construídos entre gestão, mediação cultural, equipes, territórios e públicos.

O desenvolvimento do aplicativo Museus Centro / Viaduto das Artes também integra esse processo. Mais do que uma ferramenta de registro, o sistema passa a funcionar como infraestrutura de governança, rastreabilidade e consolidação institucional. Ele permite reunir dados dispersos, organizar evidências, acompanhar metas, cruzar programação, relatórios, documentos, rubricas e prestação de contas, fortalecendo a transparência e a memória do projeto.

O período analisado revela um projeto em movimento: em transição de equipes, em reorganização de fluxos, em amadurecimento de metodologias e em consolidação de uma prática de registro mais rigorosa. As ações culturais, educativas, comunicacionais, financeiras e documentais aqui apresentadas expressam esse esforço de continuidade.

Concluir este relatório é, portanto, reconhecer que a cultura pública se realiza tanto nos encontros com o público quanto no trabalho silencioso de planejamento, produção, escuta, documentação, mediação, cuidado com os acervos, organização administrativa e construção de dados confiáveis.

O Museus Centro se afirma, nesse percurso, como uma experiência de articulação entre equipamentos, equipes e territórios. Sua continuidade depende da capacidade de transformar registros em memória, memória em aprendizado institucional e aprendizado em novas formas de presença pública.

Este relatório preserva esse ciclo: o que foi feito, o que foi registrado, o que pôde ser verificado e o que permanece como base para os próximos meses de trabalho.`;
}

export default function PremiumClosingSection({ contexto = {} }) {
  const paragraphs = splitParagraphs(buildFechamentoEditorial(contexto), 12);

  return (
    <section className="premium-closing premium-page-break">
      <PremiumInternalPageHeader />

      <div>
        <p className="premium-eyebrow">Encerramento</p>
        <h2>Memória pública, trabalho coletivo e cultura em continuidade</h2>
      </div>
      <div className="premium-prose">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="premium-signature">
        <span>Projeto Museus Centro</span>
        <strong>Viaduto das Artes / Diretoria de Museus / FMC-BH</strong>
      </div>
    </section>
  );
}
