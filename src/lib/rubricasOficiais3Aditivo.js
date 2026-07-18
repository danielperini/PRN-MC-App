/**
 * RUBRICAS OFICIAIS - 3º ADITIVO
 * Fonte: Tabela oficial colada — consolidada conforme planilha oficial
 * Total: R$ 1.320.000,00
 *
 * ATENÇÃO: Este arquivo é a ÚNICA fonte de verdade para as rubricas do 3º Aditivo.
 * Não alterar sem atualizar a tabela oficial.
 */

function detectMuseu(rubrica) {
  const r = rubrica.toUpperCase();
  if (r.includes(' MIS') || r.startsWith('MIS ') || r.endsWith(' MIS') || r === 'MIS') return 'MIS';
  if (r.includes('MUMO')) return 'MUMO';
  if (r.includes('MHAB') || r.includes(' MAB') || r.startsWith('MAB ')) return 'MHAB';
  return 'GERAL';
}

function detectEscopo(meta) {
  const m = (meta || '').toLowerCase();
  if (m.includes('noturno') || m.includes('ed. 2026') || m.includes('2026')) return 'NOTURNO';
  return 'GERAL';
}

function detectGrupo(meta) {
  if (!meta) return 'Geral';
  const match = meta.match(/^\d+\s*-\s*(.+)$/);
  if (match) return match[1].trim();
  const match2 = meta.match(/^\d+\.\s*(.+)$/);
  if (match2) return match2[1].trim();
  return meta.trim();
}

/**
 * 72 rubricas extraídas exclusivamente da tabela oficial colada.
 * Total: R$ 1.320.000,00
 */
const RAW_RUBRICAS = [
  // ── Meta 1 — Equipe principal (13 rubricas) ────────────────────────────────
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Coordenador Geral (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 7000, valor_total: 70000, conferencia_valor: 70000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assistente de Coordenação e produção', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5000, valor_total: 50000, conferencia_valor: 50000 },
  { pagina_pdf: 38, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Consultoria de programação', unidade: 'mês', quantidade: 1, periodo_frequencia: 5, valor_unitario: 6000, valor_total: 30000, conferencia_valor: 30000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '53', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Coordenador Comunicação (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 6000, valor_total: 60000, conferencia_valor: 60000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Analista Adm. Financeira (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5000, valor_total: 50000, conferencia_valor: 50000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assistente Administrativo (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4000, valor_total: 40000, conferencia_valor: 40000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MIS/MUMO/MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 3, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 113400, conferencia_valor: 113400 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assessor de Imprensa (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 3000, valor_total: 27000, conferencia_valor: 27000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Rede Social / Marketing Cultural (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2500, valor_total: 22500, conferencia_valor: 22500 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Fotógrafo (mês 19 ao mês 28)', unidade: 'Serviço', quantidade: 3, periodo_frequencia: 9, valor_unitario: 1000, valor_total: 27000, conferencia_valor: 27000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Designer (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5200, valor_total: 52000, conferencia_valor: 52000 },

  // ── Meta 3 — Manutenção de exposições (3 rubricas) ─────────────────────────
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MIS (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MUMO (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, conferencia_valor: 18000 },

  // ── Meta 7 — Educador (1 rubrica consolidada) ─────────────────────────────
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MIS / MUMO / MHAB (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 3, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 138000, conferencia_valor: 138000 },

  // ── Meta 10 — 18 pequenas mostras (3 rubricas) ─────────────────────────────
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Mostra baixa complexidade MIS', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Mostra média complexidade MHAB', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, conferencia_valor: 7000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Peça em destaque MHAB', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 1000, valor_total: 1000, conferencia_valor: 1000 },

  // ── Meta 11 — Noturno nos Museus Ed. 2026 (28 rubricas) ───────────────────
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Produção (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 6000, valor_total: 6000, conferencia_valor: 6000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Assistente de Produção (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'ID (designer) (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, conferencia_valor: 7000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '13', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Sinalização (Ed. 2026)', unidade: 'serviço', quantidade: 45, periodo_frequencia: 1, valor_unitario: 250, valor_total: 11250, conferencia_valor: 11250 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Monitores (Ed. 2026)', unidade: 'serviço', quantidade: 10, periodo_frequencia: 1, valor_unitario: 300, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '17', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Kit de Iluminação (Ed. 2026)', unidade: 'serviço', quantidade: 6, periodo_frequencia: 1, valor_unitario: 2000, valor_total: 12000, conferencia_valor: 12000 },
  { pagina_pdf: 41, natureza_despesa: '339037', nome_natureza: 'Locação de Mão de Obra', numero_natureza: '2', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Segurança (Ed. 2026)', unidade: 'serviço', quantidade: 6, periodo_frequencia: 1, valor_unitario: 500, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '41', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Limpeza (Ed. 2026)', unidade: 'serviço', quantidade: 6, periodo_frequencia: 1, valor_unitario: 450, valor_total: 2700, conferencia_valor: 2700 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '18', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Vans (Ed. 2026)', unidade: 'serviço', quantidade: 32, periodo_frequencia: 1, valor_unitario: 950, valor_total: 30400, conferencia_valor: 30400 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Vídeo e Fotografia (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 20000, valor_total: 20000, conferencia_valor: 20000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações – MIS / MUMO / MHAB / 3 museus PBH (Ed. 2026)', unidade: 'Evento', quantidade: 6, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 15000, conferencia_valor: 15000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MIS/MUMO/MHAB (Ed. 2026)', unidade: 'serviço', quantidade: 3, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 12000, conferencia_valor: 12000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações Culturais - 3 museus PBH (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 3, valor_unitario: 2500, valor_total: 7500, conferencia_valor: 7500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 3, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 7500, conferencia_valor: 7500 },

  // ── Meta 16 — 101 Diárias (1 rubrica consolidada) ─────────────────────────
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '16 - 101 Diárias', rubrica: 'Diárias MIS / MUMO / MHAB', unidade: 'serviço', quantidade: 21, periodo_frequencia: 1, valor_unitario: 300, valor_total: 6300, conferencia_valor: 6300 },

  // ── Meta 17 — Publicações (6 rubricas) ────────────────────────────────────
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '17 - Publicações', rubrica: 'Designer MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, conferencia_valor: 7000 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '17 - Publicações', rubrica: 'Fotógrafo MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 5675, valor_total: 5675, conferencia_valor: 5675 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '17 - Publicações', rubrica: 'Pesquisa e texto MHAB (2ª publicação)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 3000, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '17 - Publicações', rubrica: 'Revisão MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 55, valor_unitario: 25, valor_total: 1375, conferencia_valor: 1375 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '17 - Publicações', rubrica: 'Tradução MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 55, valor_unitario: 40, valor_total: 2200, conferencia_valor: 2200 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '13', meta: '17 - Publicações', rubrica: 'Impressão MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 350, valor_unitario: 60, valor_total: 21000, conferencia_valor: 21000 },

  // ── Meta 18 — Custeios atividades educativas (4 rubricas consolidadas) ─────
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '12', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Lanches/buffet (mês 19 ao mês 28)', unidade: 'serviço', quantidade: 3, periodo_frequencia: 1, valor_unitario: 3000, valor_total: 9000, conferencia_valor: 9000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '12', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Alimentação (mês 19 ao mês 28)', unidade: 'serviço', quantidade: 3, periodo_frequencia: 10, valor_unitario: 300, valor_total: 9000, conferencia_valor: 9000 },
  { pagina_pdf: 43, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '15', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Material MIS / MUMO / MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 3, periodo_frequencia: 10, valor_unitario: 800, valor_total: 24000, conferencia_valor: 24000 },

  // ── Meta 20 — 30 ações educativas (2 rubricas consolidadas) ───────────────
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais', rubrica: 'Ações Educativo-culturais MIS / MUMO / MHAB', unidade: 'serviço', quantidade: 3, periodo_frequencia: 10, valor_unitario: 3000, valor_total: 90000, conferencia_valor: 90000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais', rubrica: 'Fornecimento de som e iluminação', unidade: 'serviço', quantidade: 5, periodo_frequencia: 1, valor_unitario: 1500, valor_total: 7500, conferencia_valor: 7500 },

  // ── Meta 21 — Exposição MUMO (1 rubrica) ──────────────────────────────────
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '21 - Realizar uma exposição e o evento de abertura no Museu da Moda', rubrica: 'Exposição MUMO', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 210000, valor_total: 210000, conferencia_valor: 210000 },

  // ── Meta 22 — Consultorias (2 rubricas) ───────────────────────────────────
  { pagina_pdf: 43, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '22. Contratação de consultorias', rubrica: 'Consultorias de temas transversais diversos', unidade: 'serviço', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, conferencia_valor: 5000 },
  { pagina_pdf: 43, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '22. Contratação de consultorias', rubrica: 'Formação sobre Ambiente Seguro, Diversidade e Inclusão', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },

  // ── Meta 23 — Despesas Gerais (5 rubricas) ────────────────────────────────
  { pagina_pdf: 44, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '04', meta: '23 - Despesas Gerais', rubrica: 'Transporte', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 400, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 44, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '12', meta: '23 - Despesas Gerais', rubrica: 'Material escritório', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 300, valor_total: 2700, conferencia_valor: 2700 },
  { pagina_pdf: 44, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '46', meta: '23 - Despesas Gerais', rubrica: 'Assessoria Jurídica', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 1700, valor_total: 17000, conferencia_valor: 17000 },
  { pagina_pdf: 44, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '04', meta: '23 - Despesas Gerais', rubrica: 'Energia elétrica', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 450, valor_total: 4500, conferencia_valor: 4500 },
  { pagina_pdf: 44, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '23 - Despesas Gerais', rubrica: 'Contador', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 1000, valor_total: 10000, conferencia_valor: 10000 },
];

// Validação interna: garante que os dados estão corretos
const _total = RAW_RUBRICAS.reduce((acc, r) => acc + r.valor_total, 0);
if (_total !== 1320000) {
  console.warn(`[ALERTA] Total das rubricas = R$ ${_total.toLocaleString('pt-BR')} — esperado R$ 1.320.000,00`);
}

function normalizeStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export function getRubricasOficiais3Aditivo() {
  return RAW_RUBRICAS.map((r, idx) => {
    const museu = detectMuseu(r.rubrica);
    const escopo = detectEscopo(r.meta);
    const grupo = detectGrupo(r.meta);
    const chave = `${normalizeStr(grupo)}::${normalizeStr(r.rubrica)}::${normalizeStr(r.meta)}::${museu}::${escopo}`;
    return {
      ...r,
      nome: r.rubrica,
      item_rubrica: r.rubrica,
      grupo,
      numero_natureza: String(r.numero_natureza),
      numero_parcelas_unidades: String(r.periodo_frequencia),
      valor_rubrica: r.valor_total,
      museu_codigo: museu,
      escopo_orcamentario: escopo,
      origem_recurso: '3º ADITIVO',
      ativo: true,
      oficial_3_aditivo: true,
      fonte_importacao: 'rubricas_oficiais_3_aditivo_tabela_colada',
      ordem_exibicao: idx,
      _chave_oficial: chave,
    };
  });
}

export const TOTAL_OFICIAL_3_ADITIVO = 1320000;
export const TOTAL_RUBRICAS_OFICIAIS = RAW_RUBRICAS.length;

export function calcularTotalOficial() {
  return RAW_RUBRICAS.reduce((acc, r) => acc + r.valor_total, 0);
}

export function rubricaPertenceAoMuseu(rubrica = {}, museu = '') {
  const codigoRubrica = String(rubrica?.museu_codigo || '').toUpperCase().replace('MAB', 'MHAB');
  const museuNorm = String(museu || '').toUpperCase().replace('MAB', 'MHAB');
  if (!museuNorm || museuNorm === 'GERAL') return false;
  return codigoRubrica === museuNorm;
}

export function rubricaENoturno(rubrica = {}) {
  if (rubrica?.escopo_orcamentario === 'NOTURNO') return true;
  const t = `${rubrica?.meta || ''} ${rubrica?.grupo || ''} ${rubrica?.rubrica || ''} ${rubrica?.nome || ''}`.toLowerCase();
  return t.includes('noturno') || t.includes('ed. 2026') || t.includes('ed 2026');
}

export function detectMuseuFromRubricaEntity(r = {}) {
  if (r?.museu_codigo === 'MIS') return 'MIS';
  if (r?.museu_codigo === 'MHAB' || r?.museu_codigo === 'MAB') return 'MHAB';
  if (r?.museu_codigo === 'MUMO') return 'MUMO';
  const rUpper = `${r?.rubrica || ''} ${r?.museu_codigo || ''}`.toUpperCase();
  if (rUpper.includes(' MIS') || rUpper.startsWith('MIS ')) return 'MIS';
  if (rUpper.includes('MUMO')) return 'MUMO';
  if (rUpper.includes('MHAB') || rUpper.includes(' MAB')) return 'MHAB';
  return 'GERAL';
}