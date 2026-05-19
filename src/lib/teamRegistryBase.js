const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

export const TEAM_REGISTRY_BASE = [
  {
    nome: 'Daniel Perini',
    email: 'danielperini.mc@viadutodasartes.org.br',
    funcao: 'Coordenação Geral',
    area: 'Museus Centro',
  },
  {
    nome: 'Ana Luiza',
    funcao: 'Consultoria de Programação',
    area: 'Museus Centro',
  },
  {
    nome: 'Fernanda Campos de Pinho Monte-Mor',
    email: 'coordenacao.mc@viadutodasartes.org.br',
    cpf: '00400752654',
    cnpj: '35.106.999/0001-32',
    funcao: 'Coordenação de Comunicação',
    area: 'Museus Centro',
    valor_referencia: 'R$ 5.000,00 (1ª fase) · R$ 6.000,00 (aditivo)',
    inicio_vinculo_referencia: 'Setembro de 2024',
  },
  {
    nome: 'Juliana Silva',
    funcao: 'Educativo',
    area: 'MIS BH',
  },
  {
    nome: 'Lara Carvalho Ferreira',
    email: 'laracarferre@gmail.com',
    cpf: '15136387696',
    cnpj: '35.414.029/0001-02',
    funcao: 'Educadora',
    area: 'Museus Centro',
    valor_referencia: 'R$ 4.600,00',
    inicio_vinculo_referencia: '15/10/2025',
  },
  {
    nome: 'Caroline Abasse e Braga',
    email: 'design.mc@viadutodasartes.org.br',
    cpf: '08248382621',
    cnpj: '49.177.209/0001-14',
    funcao: 'Designer',
    area: 'Museus Centro',
    valor_referencia: 'R$ 2.600,00',
    inicio_vinculo_referencia: '15/11/2024',
  },
  {
    nome: 'Daniela Isis de Souza Araújo',
    email: 'danielaisis.souza@gmail.com',
    cpf: '08012082624',
    cnpj: '26.923.773/0001-33',
    funcao: 'Produtora',
    area: 'MUMO',
    valor_referencia: 'R$ 4.000,00 / R$ 4.200,00',
    inicio_vinculo_referencia: '15/07/2025',
  },
  {
    nome: 'Wanda Mucchiut',
    funcao: 'Produção Cultural',
    area: 'Museus Centro',
  },
  {
    nome: 'Isabella Caroline de Souza',
    funcao: 'Produção Cultural',
    area: 'Museus Centro',
  },
  {
    nome: 'Clara Braga Assumpção',
    email: 'clarabragas@gmail.com',
    cpf: '022040466-63',
    cnpj: '49.420.887/0001-66',
    funcao: 'Educadora',
    area: 'Museus Centro',
    valor_referencia: 'R$ 4.600,00',
    inicio_vinculo_referencia: '12/09/2024',
  },
  {
    nome: 'Daniel Moreira Soares',
    email: 'contato@danielmoreira.art.br',
    cpf: '03056946697',
    cnpj: '43448500000101',
    funcao: 'Fotógrafo',
    area: 'Museus Centro',
    valor_referencia: 'R$ 3.000,00',
    inicio_vinculo_referencia: '02 de fevereiro de 2026',
  },
  {
    nome: 'Samira Lopes Mota',
    email: 'design@viadutodasartes.org.br',
    cpf: '05522571683',
    cnpj: '19291971000166',
    funcao: 'Designer Gráfico',
    area: 'Museus Centro',
    valor_referencia: 'R$ 2.600,00',
    inicio_vinculo_referencia: '01/06/2025',
  },
  {
    nome: 'André Luiz da Silva Oliveira',
    email: 'retinaeletricafilmes@gmail.com',
    cpf: '06528556601',
    cnpj: '49884148000125',
    funcao: 'Redes Sociais',
    area: 'Museus Centro',
    valor_referencia: 'R$ 2.500,00',
    inicio_vinculo_referencia: 'Março de 2026',
  },
  {
    nome: 'Cristina Sanches Porto',
    email: 'cristinasanches@cscomunicacao.com',
    cpf: '04366828693',
    cnpj: '5141130300138',
    funcao: 'Assessoria de Imprensa',
    area: 'Museus Centro',
    valor_referencia: 'R$ 3.000,00',
    inicio_vinculo_referencia: '2025',
  },
  {
    nome: 'Josiane Amâncio',
    funcao: 'Coordenação',
    area: 'Museus Centro',
  },
  {
    nome: 'Marcos Hilatrio',
    funcao: 'Produção Cultural',
    area: 'Museus Centro',
  },
  {
    nome: 'Leandro Gabriel',
    funcao: 'Produção Cultural',
    area: 'Museus Centro',
  },
];

export function getTeamRegistryByEmail(email = '') {
  const key = normalizeEmail(email);
  if (!key) return null;
  return TEAM_REGISTRY_BASE.find((item) => normalizeEmail(item.email) === key) || null;
}

export function buildTeamMemberFormPreset(email = '') {
  const item = getTeamRegistryByEmail(email);
  if (!item) return null;

  return {
    email_pessoal: item.email || '',
    cpf: item.cpf || '',
    tipo_pessoa: item.cnpj ? 'MEI' : 'PF',
    cnpj: item.cnpj || '',
    funcao_institucional: item.funcao || '',
    valor_referencia: item.valor_referencia || '',
    inicio_vinculo_referencia: item.inicio_vinculo_referencia || '',
  };
}
