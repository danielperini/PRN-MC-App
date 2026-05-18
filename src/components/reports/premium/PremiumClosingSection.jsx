import React from 'react';
import { splitParagraphs } from './premiumReportUtils';

const FECHAMENTO_EDITORIAL = `O encerramento deste relatório não se organiza como conclusão administrativa, mas como registro de uma experiência coletiva de trabalho. Entre fevereiro e abril de 2026, o Museus Centro foi sendo sustentado por uma rede de pessoas, equipamentos públicos, equipes técnicas, educadoras, produtores, coordenações, prestadoras de serviço e parceiros institucionais que deram forma cotidiana à política pública cultural nos museus municipais de Belo Horizonte.

A documentação reunida no aplicativo preserva uma parte importante dessa experiência. Relatórios, fotografias, programações, indicadores, documentos, registros educativos e evidências de produção deixam de aparecer como arquivos isolados e passam a compor uma memória operacional do projeto. Essa memória não substitui a presença viva nos museus, mas ajuda a reconhecer o que foi realizado, como foi realizado e quais vínculos foram construídos entre gestão, mediação cultural, equipes e públicos.

O desenvolvimento do aplicativo Museus Centro / Viaduto das Artes também integra esse processo. A plataforma nasceu de testes, ajustes, reuniões, revisão de fluxos, modelagem institucional e escuta das necessidades reais dos museus. Seu papel é apoiar as equipes, reduzir dispersões, organizar evidências e permitir que a tecnologia trabalhe a favor da cultura pública, liberando mais tempo e atenção para aquilo que dá sentido ao projeto: acolher pessoas, ativar acervos, produzir encontros e fortalecer a presença dos museus na cidade.

Este relatório reconhece, portanto, o trabalho coletivo da DEMUS, do Viaduto das Artes, das coordenações, das equipes dos museus e das/os profissionais que participaram da execução no período. A continuidade aqui não é uma ideia abstrata: ela se materializa na documentação do cotidiano, na mediação com os públicos, na construção de rotinas mais sustentáveis e na preservação da experiência institucional vivida por quem faz o Museus Centro acontecer.`;

export default function PremiumClosingSection({ textos }) {
  const paragraphs = splitParagraphs(FECHAMENTO_EDITORIAL, 6);

  return (
    <section className="premium-closing premium-page-break">
      <div>
        <p className="premium-eyebrow">Encerramento</p>
        <h2>Memória pública, trabalho coletivo e cultura em continuidade</h2>
      </div>
      <div className="premium-prose premium-prose-invert">
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
