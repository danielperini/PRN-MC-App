import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const RAW_RUBRICAS = [
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Coordenador Geral (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 7000, valor_total: 70000, conferencia_valor: 70000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assistente de Coordenação e produção', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5000, valor_total: 50000, conferencia_valor: 50000 },
  { pagina_pdf: 38, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Consultoria de programação', unidade: 'mês', quantidade: 1, periodo_frequencia: 5, valor_unitario: 6000, valor_total: 30000, conferencia_valor: 30000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '53', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Coordenador Comunicação (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 6000, valor_total: 60000, conferencia_valor: 60000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Analista Adm. Financeira (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5000, valor_total: 50000, conferencia_valor: 50000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assistente Administrativo (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4000, valor_total: 40000, conferencia_valor: 40000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MIS (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 37800, conferencia_valor: 37800 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MUMO (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 37800, conferencia_valor: 37800 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 37800, conferencia_valor: 37800 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assessor de Imprensa (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 3000, valor_total: 27000, conferencia_valor: 27000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Rede Social / Marketing Cultural (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2500, valor_total: 22500, conferencia_valor: 22500 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Fotógrafo (mês 19 ao mês 28)', unidade: 'Serviço', quantidade: 3, periodo_frequencia: 9, valor_unitario: 1000, valor_total: 27000, conferencia_valor: 27000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Designer (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5200, valor_total: 52000, conferencia_valor: 52000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MIS (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MUMO (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, conferencia_valor: 18000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MIS (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 46000, conferencia_valor: 46000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MUMO (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 46000, conferencia_valor: 46000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MHAB (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 46000, conferencia_valor: 46000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Mostra baixa complexidade MIS', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Mostra média complexidade MHAB', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, conferencia_valor: 7000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Peça em destaque MHAB', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 1000, valor_total: 1000, conferencia_valor: 1000 },
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
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações MIS (Ed. 2026)', unidade: 'Evento', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações MUMO (Ed. 2026)', unidade: 'Evento', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações MHAB (Ed. 2026)', unidade: 'Evento', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MIS (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MUMO (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MHAB (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentação cultural MIS (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentação cultural MUMO (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentação cultural MHAB (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MIS - 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MUMO - 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MHAB - 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '16 - 101 Diárias', rubrica: 'Diárias MIS', unidade: 'serviço', quantidade: 7, periodo_frequencia: 1, valor_unitario: 300, valor_total: 2100, conferencia_valor: 2100 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '16 - 101 Diárias', rubrica: 'Diárias MUMO', unidade: 'serviço', quantidade: 7, periodo_frequencia: 1, valor_unitario: 300, valor_total: 2100, conferencia_valor: 2100 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '16 - 101 Diárias', rubrica: 'Diárias MHAB', unidade: 'serviço', quantidade: 7, periodo_frequencia: 1, valor_unitario: 300, valor_total: 2100, conferencia_valor: 2100 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '17 - Publicações', rubrica: 'Designer MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, conferencia_valor: 7000 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '17 - Publicações', rubrica: 'Fotógrafo MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 5675, valor_total: 5675, conferencia_valor: 5675 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '17 - Publicações', rubrica: 'Pesquisa e texto MHAB (2ª publicação)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 3000, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '17 - Publicações', rubrica: 'Revisão MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 55, valor_unitario: 25, valor_total: 1375, conferencia_valor: 1375 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '17 - Publicações', rubrica: 'Tradução MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 55, valor_unitario: 40, valor_total: 2200, conferencia_valor: 2200 },
  { pagina_pdf: 42, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '13', meta: '17 - Publicações', rubrica: 'Impressão MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 350, valor_unitario: 60, valor_total: 21000, conferencia_valor: 21000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '12', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Lanches/buffet MIS (mês 19 ao mês 28)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 3000, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '12', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Lanches/buffet MUMO (mês 19 ao mês 28)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 3000, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '12', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Lanches/buffet MHAB (mês 19 ao mês 28)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 3000, valor_total: 3000, conferencia_valor: 3000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '12', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Alimentação (mês 19 ao mês 28)', unidade: 'serviço', quantidade: 3, periodo_frequencia: 10, valor_unitario: 300, valor_total: 9000, conferencia_valor: 9000 },
  { pagina_pdf: 43, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '15', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Material MIS (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 800, valor_total: 8000, conferencia_valor: 8000 },
  { pagina_pdf: 43, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '15', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Material MUMO (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 800, valor_total: 8000, conferencia_valor: 8000 },
  { pagina_pdf: 43, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '15', meta: '18 - Custeios para atividades educativas contínuas', rubrica: 'Material MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 800, valor_total: 8000, conferencia_valor: 8000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais', rubrica: 'Ações Educativo-culturais MIS / MUMO / MHAB', unidade: 'serviço', quantidade: 3, periodo_frequencia: 10, valor_unitario: 3000, valor_total: 90000, conferencia_valor: 90000 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais', rubrica: 'Fornecimento de som e iluminação MIS', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais', rubrica: 'Fornecimento de som e iluminação MUMO', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais', rubrica: 'Fornecimento de som e iluminação MHAB', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 43, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '21 - Realizar uma exposição e o evento de abertura no Museu da Moda', rubrica: 'Exposição MUMO', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 210000, valor_total: 210000, conferencia_valor: 210000 },
  { pagina_pdf: 43, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '22. Contratação de consultorias', rubrica: 'Consultorias de temas transversais diversos', unidade: 'serviço', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, conferencia_valor: 5000 },
  { pagina_pdf: 43, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '22. Contratação de consultorias', rubrica: 'Formação sobre Ambiente Seguro, Diversidade e Inclusão', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, conferencia_valor: 2500 },
  { pagina_pdf: 44, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '04', meta: '23 - Despesas Gerais', rubrica: 'Transporte', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 400, valor_total: 4000, conferencia_valor: 4000 },
  { pagina_pdf: 44, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '12', meta: '23 - Despesas Gerais', rubrica: 'Material escritório', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 300, valor_total: 2700, conferencia_valor: 2700 },
  { pagina_pdf: 44, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '46', meta: '23 - Despesas Gerais', rubrica: 'Assessoria Jurídica', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 1700, valor_total: 17000, conferencia_valor: 17000 },
  { pagina_pdf: 44, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '04', meta: '23 - Despesas Gerais', rubrica: 'Energia elétrica', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 450, valor_total: 4500, conferencia_valor: 4500 },
  { pagina_pdf: 44, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '23 - Despesas Gerais', rubrica: 'Contador', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 1000, valor_total: 10000, conferencia_valor: 10000 },
];

function normalizeStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

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
  const match = meta.match(/^\d+\s*[-\.]\s*(.+)$/);
  if (match) return match[1].trim();
  return meta.trim();
}

function buildChave(rubricaObj) {
  const museu = detectMuseu(rubricaObj.rubrica);
  const escopo = detectEscopo(rubricaObj.meta);
  const grupo = detectGrupo(rubricaObj.meta);
  return `${normalizeStr(grupo)}::${normalizeStr(rubricaObj.rubrica)}::${normalizeStr(rubricaObj.meta)}::${museu}::${escopo}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    // Busca todas as rubricas existentes no banco
    const existentes = await base44.asServiceRole.entities.Rubrica.list();

    // Indexa existentes pela chave oficial
    const existentesPorChave = new Map();
    for (const r of existentes) {
      if (r._chave_oficial) {
        existentesPorChave.set(r._chave_oficial, r);
      }
    }

    // Prepara rubricas oficiais com campos completos
    const oficiais = RAW_RUBRICAS.map((r, idx) => {
      const museu = detectMuseu(r.rubrica);
      const escopo = detectEscopo(r.meta);
      const grupo = detectGrupo(r.meta);
      const chave = buildChave(r);
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

    // Chaves das 72 oficiais
    const chavesOficiais = new Set(oficiais.map(r => r._chave_oficial));

    let criadas = 0;
    let atualizadas = 0;
    let inativadas = 0;
    const divergencias = [];

    if (!dryRun) {
      // 1. Upsert das 72 rubricas oficiais
      for (const oficial of oficiais) {
        const existente = existentesPorChave.get(oficial._chave_oficial);
        if (existente) {
          // Preserva valor_utilizado se existir
          const valor_utilizado = existente.valor_utilizado || 0;
          const saldo = oficial.valor_total - valor_utilizado;
          await base44.asServiceRole.entities.Rubrica.update(existente.id, {
            ...oficial,
            valor_utilizado,
            saldo,
            valor_comprometido: existente.valor_comprometido || 0,
            saldo_comprometido: existente.saldo_comprometido || 0,
          });
          atualizadas++;
        } else {
          await base44.asServiceRole.entities.Rubrica.create({
            ...oficial,
            valor_utilizado: 0,
            valor_comprometido: 0,
            saldo_comprometido: 0,
            saldo: oficial.valor_total,
          });
          criadas++;
        }
      }

      // 2. Inativar rubricas antigas oficial_3_aditivo que não estão na tabela
      for (const existente of existentes) {
        const eOficial = existente.oficial_3_aditivo === true || existente.origem_recurso === '3º ADITIVO';
        if (eOficial && existente._chave_oficial && !chavesOficiais.has(existente._chave_oficial)) {
          await base44.asServiceRole.entities.Rubrica.update(existente.id, { ativo: false });
          inativadas++;
        }
      }
    }

    // Validações
    const totalOficial = oficiais.reduce((acc, r) => acc + r.valor_total, 0);
    if (totalOficial !== 1320000) {
      divergencias.push(`Total calculado = R$ ${totalOficial.toLocaleString('pt-BR')} — esperado R$ 1.320.000,00`);
    }
    if (oficiais.length !== 72) {
      divergencias.push(`Total de rubricas = ${oficiais.length} — esperado 72`);
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      total_oficiais: oficiais.length,
      total_valor: totalOficial,
      criadas: dryRun ? '(simulação)' : criadas,
      atualizadas: dryRun ? '(simulação)' : atualizadas,
      inativadas: dryRun ? '(simulação)' : inativadas,
      divergencias,
      mensagem: dryRun
        ? `Simulação OK — ${oficiais.length} rubricas seriam processadas. Total: R$ ${totalOficial.toLocaleString('pt-BR')}`
        : `Importação concluída — ${criadas} criadas, ${atualizadas} atualizadas, ${inativadas} inativadas.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});