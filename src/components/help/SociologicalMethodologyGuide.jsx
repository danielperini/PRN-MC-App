import React, { useState } from 'react';
import { ChevronDown, Users, MapPin, BookOpen, Mic, Heart, Lightbulb } from 'lucide-react';

export default function SociologicalMethodologyGuide() {
  const [expanded, setExpanded] = useState(null);

  const sections = [
    {
      id: 'participacao',
      title: 'Participação Social',
      icon: <Users className="w-5 h-5" />,
      description: 'Dimensão coletiva do trabalho cultural e educativo',
      pontos: [
        'Envolvimento ativo de comunidades e públicos',
        'Construção conjunta com participantes',
        'Protagonismo compartilhado nas ações',
        'Múltiplas vozes e perspectivas representadas',
      ],
      exemplos: [
        '"As atividades reuniram aproximadamente X pessoas em processos de participação social..."',
        '"Consolidou-se espaço de diálogo e construção coletiva..."',
      ],
    },
    {
      id: 'mediacao',
      title: 'Mediação Cultural',
      icon: <Lightbulb className="w-5 h-5" />,
      description: 'Processos educativos de interação e aprendizagem',
      pontos: [
        'Facilitação de encontros entre públicos e conhecimento',
        'Práticas educativas que fortalecem experiências',
        'Escuta e validação de saberes diversos',
        'Espaços de diálogo e troca de vivências',
      ],
      exemplos: [
        '"Práticas de mediação cultural evidenciaram-se em X processos..."',
        '"Consolidaram-se ações educativas de formação e escuta..."',
      ],
    },
    {
      id: 'territorio',
      title: 'Dimensão Territorial',
      icon: <MapPin className="w-5 h-5" />,
      description: 'Leitura, escuta e pertencimento ao lugar',
      pontos: [
        'Compreensão dos contextos e dinâmicas locais',
        'Apropriação dos espaços culturais e públicos',
        'Vínculo com comunidades vizinhas',
        'Desenvolvimento territorial através da cultura',
      ],
      exemplos: [
        '"A escuta territorial e a apropriação de espaços reforçaram..."',
        '"Considerando a leitura do território e suas demandas..."',
      ],
    },
    {
      id: 'escuta',
      title: 'Escuta e Percepção',
      icon: <Mic className="w-5 h-5" />,
      description: 'Valorização das experiências e perspectivas dos públicos',
      pontos: [
        'Coleta de feedback e observações dos participantes',
        'Registros de vivências e impressões',
        'Diálogo contínuo com comunidades',
        'Integração de percepções na avaliação',
      ],
      exemplos: [
        '"Processos de escuta evidenciaram percepções e experiências..."',
        '"A dimensão participativa consolidou-se através do diálogo..."',
      ],
    },
    {
      id: 'memoria',
      title: 'Produção de Memória',
      icon: <BookOpen className="w-5 h-5" />,
      description: 'Registros, documentação e preservação de vivências',
      pontos: [
        'Documentação visual através de fotografias',
        'Registros escritos e relatos de experiências',
        'Construção de acervo e memória institucional',
        'Patrimônio como ferramenta de aprendizagem',
      ],
      exemplos: [
        '"Produziram-se registros que consolidam memória do período..."',
        '"A documentação fotográfica evidencia a apropriação dos espaços..."',
      ],
    },
    {
      id: 'construcao',
      title: 'Construção Coletiva',
      icon: <Heart className="w-5 h-5" />,
      description: 'Trabalho integrado e articulado entre equipes e parceiros',
      pontos: [
        'Articulação entre diferentes equipes e museus',
        'Parcerias com comunidades e instituições',
        'Integração de saberes e práticas diversas',
        'Atuação institucional coordenada',
      ],
      exemplos: [
        '"O trabalho colaborativo das equipes evidenciou articulação..."',
        '"Consolidou-se atuação conjunta e integrada entre os museus..."',
      ],
    },
  ];

  return (
    <div className="space-y-4 text-sm">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-900 font-semibold mb-2">📚 Metodologia Sociológica nos Relatórios</p>
        <p className="text-blue-800 text-xs">
          Os relatórios institucionais incorporam análise sociológica elegante, conectando ações
          culturais com dimensões de participação, mediação, território e memória. Isso reforça a
          sofisticação institucional sem transformar o texto em linguagem acadêmica.
        </p>
      </div>

      <div className="space-y-2">
        {sections.map((section) => (
          <div
            key={section.id}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white"
          >
            <button
              onClick={() => setExpanded(expanded === section.id ? null : section.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="text-gray-600">{section.icon}</div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{section.title}</p>
                <p className="text-gray-600 text-xs">{section.description}</p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  expanded === section.id ? 'rotate-180' : ''
                }`}
              />
            </button>

            {expanded === section.id && (
              <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                {/* Pontos-chave */}
                <div>
                  <p className="font-medium text-gray-900 text-xs mb-2">✓ Pontos-chave:</p>
                  <ul className="space-y-1">
                    {section.pontos.map((ponto, i) => (
                      <li key={i} className="text-gray-700 text-xs pl-4 border-l-2 border-gray-300">
                        {ponto}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Exemplos */}
                <div>
                  <p className="font-medium text-gray-900 text-xs mb-2">📝 Exemplos de linguagem:</p>
                  <ul className="space-y-2">
                    {section.exemplos.map((exemplo, i) => (
                      <li key={i} className="text-gray-700 text-xs italic p-2 bg-white rounded border border-gray-200">
                        {exemplo}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Critérios */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
        <p className="text-green-900 font-semibold mb-2 text-xs">✓ Critérios de Qualidade</p>
        <ul className="space-y-1 text-xs text-green-800">
          <li>✓ Linguagem sofisticada e institucional</li>
          <li>✓ Referências sociológicas apenas quando pertinentes</li>
          <li>✓ Conexão clara entre ações e dimensões sociais/territoriais</li>
          <li>✓ Evitar jargão acadêmico excessivo</li>
          <li>✓ Humanizar narrativa sem artificialismo</li>
          <li>✓ Validar apenas dados reais documentados</li>
        </ul>
      </div>

      {/* O que NÃO fazer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-amber-900 font-semibold mb-2 text-xs">⚠️ O que evitar</p>
        <ul className="space-y-1 text-xs text-amber-800">
          <li>❌ Inventar metodologia ou participação inexistente</li>
          <li>❌ Usar termos acadêmicos sem contexto</li>
          <li>❌ Transformar relatório em artigo científico</li>
          <li>❌ Mencionar dimensões sem evidências nos dados</li>
          <li>❌ Excesso de citações teóricas</li>
          <li>❌ Linguagem hermética ou inacessível</li>
        </ul>
      </div>
    </div>
  );
}