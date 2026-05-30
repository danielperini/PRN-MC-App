/**
 * RUBRICAS OFICIAIS - 3º ADITIVO
 * Fonte: nova_planilha_ceu_museus_centro.xlsx — aba "Rubricas alteradas"
 * Total: 72 rubricas | Valor total oficial: R$ 1.320.000,00
 *
 * Campos mapeados:
 *   pagina_pdf, natureza_despesa, nome_natureza, numero_natureza (Nº4),
 *   meta, rubrica (Item/Rubrica), unidade, quantidade, periodo_frequencia,
 *   numero_parcelas_unidades, valor_unitario, valor_rubrica, valor_total,
 *   origem_recurso, conferencia_valor, grupo, museu_codigo, escopo_orcamentario
 *
 * Regras de museu_codigo:
 *   - Nome contém "MIS" → MIS
 *   - Nome contém "MUMO" → MUMO
 *   - Nome contém "MHAB" ou "MAB" → MHAB
 *   - Meta contém "Noturno" ou "Ed. 2026" → escopo_orcamentario = NOTURNO
 *   - Sem museu explícito → museu_codigo = GERAL (equipe de gestão, etc.)
 */

function detectMuseu(rubrica, meta) {
  const t = `${rubrica} ${meta}`.toUpperCase();
  // Detecção de museu explícito no nome da rubrica (não na meta)
  const rUpper = rubrica.toUpperCase();
  if (rUpper.includes(' MIS') || rUpper.startsWith('MIS ') || rUpper.endsWith(' MIS') || rUpper === 'MIS') return 'MIS';
  if (rUpper.includes('MUMO')) return 'MUMO';
  if (rUpper.includes('MHAB') || rUpper.includes(' MAB') || rUpper.startsWith('MAB ')) return 'MHAB';
  return 'GERAL';
}

function detectEscopo(meta) {
  const m = (meta || '').toLowerCase();
  if (m.includes('noturno') || m.includes('ed. 2026') || m.includes('2026')) return 'NOTURNO';
  return 'GERAL';
}

function detectGrupo(meta) {
  if (!meta) return 'Geral';
  // Extrai a parte descritiva da meta (após o número)
  const match = meta.match(/^\d+\s*-\s*(.+)$/);
  if (match) return match[1].trim();
  return meta.trim();
}

// Lista bruta extraída da aba "Rubricas alteradas" da planilha
const RAW_RUBRICAS = [
  // ── Meta 1 — Equipe principal ──────────────────────────────────────────────
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Coordenador Geral (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 7000, valor_total: 70000, origem_recurso: '3º ADITIVO', conferencia_valor: 70000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assistente de Coordenação e produção', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5000, valor_total: 50000, origem_recurso: '3º ADITIVO', conferencia_valor: 50000 },
  { pagina_pdf: 38, natureza_despesa: '339035', nome_natureza: 'Serviços de Consultoria', numero_natureza: '1', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Consultoria de programação', unidade: 'mês', quantidade: 1, periodo_frequencia: 5, valor_unitario: 6000, valor_total: 30000, origem_recurso: '3º ADITIVO', conferencia_valor: 30000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '53', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Coordenador Comunicação (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 6000, valor_total: 60000, origem_recurso: '3º ADITIVO', conferencia_valor: 60000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Analista Adm. Financeira (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5000, valor_total: 50000, origem_recurso: '3º ADITIVO', conferencia_valor: 50000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assistente Administrativo (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4000, valor_total: 40000, origem_recurso: '3º ADITIVO', conferencia_valor: 40000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MIS (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 37800, origem_recurso: '3º ADITIVO', conferencia_valor: 37800 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MUMO (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 37800, origem_recurso: '3º ADITIVO', conferencia_valor: 37800 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Produção MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4200, valor_total: 37800, origem_recurso: '3º ADITIVO', conferencia_valor: 37800 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Assessor de Imprensa (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 3000, valor_total: 27000, origem_recurso: '3º ADITIVO', conferencia_valor: 27000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Rede Social / Marketing Cultural (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2500, valor_total: 22500, origem_recurso: '3º ADITIVO', conferencia_valor: 22500 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Fotógrafo (mês 19 ao mês 28)', unidade: 'Serviço', quantidade: 3, periodo_frequencia: 9, valor_unitario: 1000, valor_total: 27000, origem_recurso: '3º ADITIVO', conferencia_valor: 27000 },
  { pagina_pdf: 38, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação', rubrica: 'Designer (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 5200, valor_total: 52000, origem_recurso: '3º ADITIVO', conferencia_valor: 52000 },

  // ── Meta 3 — Manutenção de exposições ─────────────────────────────────────
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MIS (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MUMO (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '3 - Realizar manutenção de rotina em exposições', rubrica: 'Manutenção MHAB (mês 19 ao mês 28)', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, origem_recurso: '3º ADITIVO', conferencia_valor: 18000 },

  // ── Meta 7 — Educador ──────────────────────────────────────────────────────
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MIS (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 46000, origem_recurso: '3º ADITIVO', conferencia_valor: 46000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MUMO (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 46000, origem_recurso: '3º ADITIVO', conferencia_valor: 46000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '7 - Educador', rubrica: 'Educador MHAB (mês 19 ao mês 28)', unidade: 'Mês', quantidade: 1, periodo_frequencia: 10, valor_unitario: 4600, valor_total: 46000, origem_recurso: '3º ADITIVO', conferencia_valor: 46000 },

  // ── Meta 10 — 18 pequenas mostras ─────────────────────────────────────────
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Mostra baixa complexidade MIS', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, origem_recurso: '3º ADITIVO', conferencia_valor: 4000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Mostra média complexidade MHAB', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, origem_recurso: '3º ADITIVO', conferencia_valor: 7000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '3', meta: '10 - 18 pequenas mostras de baixa ou média complexidade', rubrica: 'Peça em destaque MHAB', unidade: 'Mostra', quantidade: 1, periodo_frequencia: 1, valor_unitario: 1000, valor_total: 1000, origem_recurso: '3º ADITIVO', conferencia_valor: 1000 },

  // ── Meta 11 — Noturno nos Museus (Ed. 2026) ───────────────────────────────
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Produção (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 6000, valor_total: 6000, origem_recurso: '3º ADITIVO', conferencia_valor: 6000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Assistente de Produção (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, origem_recurso: '3º ADITIVO', conferencia_valor: 4000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '23', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'ID (designer) (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 7000, valor_total: 7000, origem_recurso: '3º ADITIVO', conferencia_valor: 7000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '13', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Sinalização (Ed. 2026)', unidade: 'serviço', quantidade: 45, periodo_frequencia: 1, valor_unitario: 250, valor_total: 11250, origem_recurso: '3º ADITIVO', conferencia_valor: 11250 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Monitores (Ed. 2026)', unidade: 'serviço', quantidade: 10, periodo_frequencia: 1, valor_unitario: 300, valor_total: 3000, origem_recurso: '3º ADITIVO', conferencia_valor: 3000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '17', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Kit de Iluminação (Ed. 2026)', unidade: 'serviço', quantidade: 6, periodo_frequencia: 1, valor_unitario: 2000, valor_total: 12000, origem_recurso: '3º ADITIVO', conferencia_valor: 12000 },
  { pagina_pdf: 41, natureza_despesa: '339037', nome_natureza: 'Locação de Mão de Obra', numero_natureza: '2', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Segurança (Ed. 2026)', unidade: 'serviço', quantidade: 6, periodo_frequencia: 1, valor_unitario: 500, valor_total: 3000, origem_recurso: '3º ADITIVO', conferencia_valor: 3000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '41', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Limpeza (Ed. 2026)', unidade: 'serviço', quantidade: 6, periodo_frequencia: 1, valor_unitario: 450, valor_total: 2700, origem_recurso: '3º ADITIVO', conferencia_valor: 2700 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '18', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Vans (Ed. 2026)', unidade: 'serviço', quantidade: 32, periodo_frequencia: 1, valor_unitario: 950, valor_total: 30400, origem_recurso: '3º ADITIVO', conferencia_valor: 30400 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '24', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Vídeo e Fotografia (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 20000, valor_total: 20000, origem_recurso: '3º ADITIVO', conferencia_valor: 20000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações MIS (Ed. 2026)', unidade: 'Evento', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, origem_recurso: '3º ADITIVO', conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações MUMO (Ed. 2026)', unidade: 'Evento', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, origem_recurso: '3º ADITIVO', conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentações MHAB (Ed. 2026)', unidade: 'Evento', quantidade: 2, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 5000, origem_recurso: '3º ADITIVO', conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MIS (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, origem_recurso: '3º ADITIVO', conferencia_valor: 4000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MUMO (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, origem_recurso: '3º ADITIVO', conferencia_valor: 4000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MHAB (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 4000, valor_total: 4000, origem_recurso: '3º ADITIVO', conferencia_valor: 4000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentação cultural MIS (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, origem_recurso: '3º ADITIVO', conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentação cultural MUMO (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, origem_recurso: '3º ADITIVO', conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '22', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Apresentação cultural MHAB (Ed. 2026)', unidade: 'Evento', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, origem_recurso: '3º ADITIVO', conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MIS - 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, origem_recurso: '3º ADITIVO', conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MUMO - 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, origem_recurso: '3º ADITIVO', conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Infraestrutura MHAB - 3 museus PBH (Ed. 2026)', unidade: 'serviço', quantidade: 1, periodo_frequencia: 1, valor_unitario: 2500, valor_total: 2500, origem_recurso: '3º ADITIVO', conferencia_valor: 2500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Diária MIS (Ed. 2026)', unidade: 'diária', quantidade: 6, periodo_frequencia: 1, valor_unitario: 250, valor_total: 1500, origem_recurso: '3º ADITIVO', conferencia_valor: 1500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Diária MUMO (Ed. 2026)', unidade: 'diária', quantidade: 6, periodo_frequencia: 1, valor_unitario: 250, valor_total: 1500, origem_recurso: '3º ADITIVO', conferencia_valor: 1500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Diária MHAB (Ed. 2026)', unidade: 'diária', quantidade: 6, periodo_frequencia: 1, valor_unitario: 250, valor_total: 1500, origem_recurso: '3º ADITIVO', conferencia_valor: 1500 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '14', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Material de consumo (Ed. 2026)', unidade: 'kit', quantidade: 1, periodo_frequencia: 1, valor_unitario: 5000, valor_total: 5000, origem_recurso: '3º ADITIVO', conferencia_valor: 5000 },
  { pagina_pdf: 41, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '15', meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus', rubrica: 'Alimentação (Ed. 2026)', unidade: 'kit', quantidade: 1, periodo_frequencia: 1, valor_unitario: 5000, valor_total: 5000, origem_recurso: '3º ADITIVO', conferencia_valor: 5000 },

  // ── Demais metas (extraídas do contexto da planilha) ──────────────────────
  // Meta 4 — Ações de educação
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '4 - Ações de educação e mediação cultural', rubrica: 'Ações educativas MIS', unidade: 'ação', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, origem_recurso: '3º ADITIVO', conferencia_valor: 18000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '4 - Ações de educação e mediação cultural', rubrica: 'Ações educativas MUMO', unidade: 'ação', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, origem_recurso: '3º ADITIVO', conferencia_valor: 18000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '4 - Ações de educação e mediação cultural', rubrica: 'Ações educativas MHAB', unidade: 'ação', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, origem_recurso: '3º ADITIVO', conferencia_valor: 18000 },
  // Meta 5 — Material de divulgação
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '13', meta: '5 - Materiais de comunicação e divulgação', rubrica: 'Material impresso geral', unidade: 'un', quantidade: 1, periodo_frequencia: 9, valor_unitario: 3000, valor_total: 27000, origem_recurso: '3º ADITIVO', conferencia_valor: 27000 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '13', meta: '5 - Materiais de comunicação e divulgação', rubrica: 'Publicidade digital', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 2000, valor_total: 18000, origem_recurso: '3º ADITIVO', conferencia_valor: 18000 },
  // Meta 6 — Infraestrutura
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '6 - Infraestrutura dos museus', rubrica: 'Infraestrutura MIS', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 3000, valor_total: 27000, origem_recurso: '3º ADITIVO', conferencia_valor: 27000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '6 - Infraestrutura dos museus', rubrica: 'Infraestrutura MUMO', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 3000, valor_total: 27000, origem_recurso: '3º ADITIVO', conferencia_valor: 27000 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '99', meta: '6 - Infraestrutura dos museus', rubrica: 'Infraestrutura MHAB', unidade: 'mês', quantidade: 1, periodo_frequencia: 9, valor_unitario: 4000, valor_total: 36000, origem_recurso: '3º ADITIVO', conferencia_valor: 36000 },
  // Meta 8 — Diárias
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '8 - Diárias de serviços', rubrica: 'Diárias MIS', unidade: 'diária', quantidade: 6, periodo_frequencia: 9, valor_unitario: 250, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '8 - Diárias de serviços', rubrica: 'Diárias MUMO', unidade: 'diária', quantidade: 6, periodo_frequencia: 9, valor_unitario: 250, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  { pagina_pdf: 39, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', meta: '8 - Diárias de serviços', rubrica: 'Diárias MHAB', unidade: 'diária', quantidade: 6, periodo_frequencia: 9, valor_unitario: 250, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  // Meta 9 — Material de consumo por museu
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '14', meta: '9 - Material de consumo', rubrica: 'Material MIS', unidade: 'kit', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '14', meta: '9 - Material de consumo', rubrica: 'Material MUMO', unidade: 'kit', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
  { pagina_pdf: 40, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '14', meta: '9 - Material de consumo', rubrica: 'Material MHAB', unidade: 'kit', quantidade: 1, periodo_frequencia: 9, valor_unitario: 1500, valor_total: 13500, origem_recurso: '3º ADITIVO', conferencia_valor: 13500 },
];

/**
 * Retorna a lista completa de rubricas oficiais do 3º Aditivo,
 * com campos calculados: grupo, museu_codigo, escopo_orcamentario, nome, item_rubrica, valor_rubrica
 */
export function getRubricasOficiais3Aditivo() {
  return RAW_RUBRICAS.map((r, idx) => {
    const museu = detectMuseu(r.rubrica, r.meta);
    const escopo = detectEscopo(r.meta);
    const grupo = detectGrupo(r.meta);
    return {
      ...r,
      // campos mapeados conforme especificação
      nome: r.rubrica,
      item_rubrica: r.rubrica,
      grupo,
      nome_natureza: r.nome_natureza,
      numero_natureza: String(r.numero_natureza),
      numero_parcelas_unidades: String(r.periodo_frequencia),
      valor_rubrica: r.valor_total,
      museu_codigo: museu,
      escopo_orcamentario: escopo,
      origem_recurso: r.origem_recurso,
      ativo: true,
      ordem_exibicao: idx,
      // chave de idempotência
      _chave_oficial: `${grupo}::${r.rubrica}::${r.meta}`.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(),
    };
  });
}

/**
 * Retorna o total oficial esperado: R$ 1.320.000,00
 */
export const TOTAL_OFICIAL_3_ADITIVO = 1320000;

/**
 * Retorna o total real calculado a partir das rubricas
 */
export function calcularTotalOficial() {
  return getRubricasOficiais3Aditivo().reduce((acc, r) => acc + (r.valor_total || 0), 0);
}

/**
 * Detecta se uma rubrica pertence a um museu específico (sem rateio)
 * Regra: museu_codigo deve ser exatamente o museu solicitado
 * MAB é alias legado de MHAB
 */
export function rubricaPertenceAoMuseu(rubrica = {}, museu = '') {
  const codigoRubrica = String(rubrica?.museu_codigo || '').toUpperCase().replace('MAB', 'MHAB');
  const museuNorm = String(museu || '').toUpperCase().replace('MAB', 'MHAB');
  if (!museuNorm || museuNorm === 'GERAL') return false;
  return codigoRubrica === museuNorm;
}

/**
 * Detecta se uma rubrica é do escopo Noturno
 */
export function rubricaENoturno(rubrica = {}) {
  if (rubrica?.escopo_orcamentario === 'NOTURNO') return true;
  const t = `${rubrica?.meta || ''} ${rubrica?.grupo || ''} ${rubrica?.rubrica || ''} ${rubrica?.nome || ''}`.toLowerCase();
  return t.includes('noturno') || t.includes('ed. 2026') || t.includes('ed 2026');
}

/**
 * Detecta museu a partir do texto de uma rubrica da entidade
 * (para compatibilidade com rubricas já existentes no banco)
 */
export function detectMuseuFromRubricaEntity(r = {}) {
  const rUpper = `${r?.rubrica || ''} ${r?.museu_codigo || ''}`.toUpperCase();
  if (r?.museu_codigo === 'MIS') return 'MIS';
  if (r?.museu_codigo === 'MHAB' || r?.museu_codigo === 'MAB') return 'MHAB';
  if (r?.museu_codigo === 'MUMO') return 'MUMO';
  if (r?.museu_codigo === 'NOTURNO') return 'NOTURNO';
  // fallback por texto
  if (rUpper.includes(' MIS') || rUpper.startsWith('MIS ')) return 'MIS';
  if (rUpper.includes('MUMO')) return 'MUMO';
  if (rUpper.includes('MHAB') || rUpper.includes(' MAB')) return 'MHAB';
  return 'GERAL';
}