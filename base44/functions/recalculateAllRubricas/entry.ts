import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? '')
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeText(value: any): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function makeRubricaKey(row: any): string {
  return [
    row.natureza_despesa,
    row.nome_natureza,
    row.numero_item,
    row.meta,
    row.item_rubrica,
    row.unidade,
    row.quantidade,
    row.periodo_frequencia,
    row.valor_unitario,
    row.valor_total,
    row.origem_recurso
  ]
    .map(normalizeText)
    .join('|');
}

function getPurchaseValue(p: any): number {
  return toNumber(
    p?.valor_pago ||
      p?.valor_aprovado_admin ||
      p?.valor_aprovado ||
      p?.valor_final ||
      p?.valor_solicitado ||
      p?.valor_total ||
      p?.valor ||
      p?.rubrica_debitada_valor ||
      0
  );
}

function isStatusAprovado(status: any): boolean {
  return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(
    String(status || '').trim().toUpperCase()
  );
}

const TOTAL_OFICIAL_3_ADITIVO = 1320000;

const RUBRICAS_OFICIAIS_3_ADITIVO = [
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '3',
    meta: '10 - 18 pequenas mostras de baixa ou média complexidade',
    item_rubrica: 'Mostra baixa complexidade MIS',
    unidade: 'Mostra',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 4000,
    valor_total: 4000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '3',
    meta: '10 - 18 pequenas mostras de baixa ou média complexidade',
    item_rubrica: 'Mostra média complexidade MHAB',
    unidade: 'Mostra',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 7000,
    valor_total: 7000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '3',
    meta: '10 - 18 pequenas mostras de baixa ou média complexidade',
    item_rubrica: 'Peça em destaque MHAB',
    unidade: 'Mostra',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 1000,
    valor_total: 1000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '42',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Produção (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 6000,
    valor_total: 6000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '42',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Assistente de Produção (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 4000,
    valor_total: 4000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '23',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'ID (designer) (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 7000,
    valor_total: 7000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '13',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Sinalização (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 45,
    periodo_frequencia: 1,
    valor_unitario: 250,
    valor_total: 11250,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '42',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Monitores (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 10,
    periodo_frequencia: 1,
    valor_unitario: 300,
    valor_total: 3000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '17',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Kit de Iluminação (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 6,
    periodo_frequencia: 1,
    valor_unitario: 2000,
    valor_total: 12000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339037',
    nome_natureza: 'Locação de Mão de Obra',
    numero_item: '2',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Segurança (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 6,
    periodo_frequencia: 1,
    valor_unitario: 500,
    valor_total: 3000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '41',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Limpeza (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 6,
    periodo_frequencia: 1,
    valor_unitario: 450,
    valor_total: 2700,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '18',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Vans (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 32,
    periodo_frequencia: 1,
    valor_unitario: 950,
    valor_total: 30400,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '24',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Vídeo e Fotografia (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 20000,
    valor_total: 20000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '22',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Apresentações – MIS / MUMO / MHAB / 3 museus PBH (Ed. 2026)',
    unidade: 'Evento',
    quantidade: 6,
    periodo_frequencia: 1,
    valor_unitario: 2500,
    valor_total: 15000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '99',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Infraestrutura MIS/MUMO/MHAB (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 3,
    periodo_frequencia: 1,
    valor_unitario: 4000,
    valor_total: 12000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '22',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Apresentações Culturais - 3 museus PBH (Ed. 2026)',
    unidade: 'Evento',
    quantidade: 1,
    periodo_frequencia: 3,
    valor_unitario: 2500,
    valor_total: 7500,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '99',
    meta: '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
    item_rubrica: 'Infraestrutura 3 museus PBH (Ed. 2026)',
    unidade: 'serviço',
    quantidade: 3,
    periodo_frequencia: 1,
    valor_unitario: 2500,
    valor_total: 7500,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '42',
    meta: '16 - 101 Diárias',
    item_rubrica: 'Diárias MIS / MUMO / MHAB',
    unidade: 'serviço',
    quantidade: 21,
    periodo_frequencia: 1,
    valor_unitario: 300,
    valor_total: 6300,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '23',
    meta: '17 - Publicações',
    item_rubrica: 'Designer MHAB',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 7000,
    valor_total: 7000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '24',
    meta: '17 - Publicações',
    item_rubrica: 'Fotógrafo MHAB',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 5675,
    valor_total: 5675,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '22',
    meta: '17 - Publicações',
    item_rubrica: 'Pesquisa e texto MHAB (2ª publicação)',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 3000,
    valor_total: 3000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '99',
    meta: '17 - Publicações',
    item_rubrica: 'Revisão MHAB',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 55,
    valor_unitario: 25,
    valor_total: 1375,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '99',
    meta: '17 - Publicações',
    item_rubrica: 'Tradução MHAB',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 55,
    valor_unitario: 40,
    valor_total: 2200,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '13',
    meta: '17 - Publicações',
    item_rubrica: 'Impressão MHAB',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 350,
    valor_unitario: 60,
    valor_total: 21000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '12',
    meta: '18 - Custeios para atividades educativas contínuas',
    item_rubrica: 'Lanches/buffet (mês 19 ao mês 28)',
    unidade: 'serviço',
    quantidade: 3,
    periodo_frequencia: 1,
    valor_unitario: 3000,
    valor_total: 9000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '12',
    meta: '18 - Custeios para atividades educativas contínuas',
    item_rubrica: 'Alimentação (mês 19 ao mês 28)',
    unidade: 'serviço',
    quantidade: 3,
    periodo_frequencia: 10,
    valor_unitario: 300,
    valor_total: 9000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339030',
    nome_natureza: 'Material de consumo',
    numero_item: '15',
    meta: '18 - Custeios para atividades educativas contínuas',
    item_rubrica: 'Material MIS / MUMO / MHAB (mês 19 ao mês 28)',
    unidade: 'mês',
    quantidade: 3,
    periodo_frequencia: 10,
    valor_unitario: 800,
    valor_total: 24000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '22',
    meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais',
    item_rubrica: 'Ações Educativo-culturais MIS / MUMO / MHAB',
    unidade: 'serviço',
    quantidade: 3,
    periodo_frequencia: 10,
    valor_unitario: 3000,
    valor_total: 90000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '99',
    meta: '20 - Realizar 30 (trinta) ações educativas e ou culturais',
    item_rubrica: 'Fornecimento de som e iluminação',
    unidade: 'serviço',
    quantidade: 5,
    periodo_frequencia: 1,
    valor_unitario: 1500,
    valor_total: 7500,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '3',
    meta: '21 - Realizar uma exposição e o evento de abertura no Museu da Moda',
    item_rubrica: 'Exposição MUMO',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 210000,
    valor_total: 210000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339035',
    nome_natureza: 'Serviços de Consultoria',
    numero_item: '1',
    meta: '22. Contratação de consultorias',
    item_rubrica: 'Consultorias de temas transversais diversos',
    unidade: 'serviço',
    quantidade: 2,
    periodo_frequencia: 1,
    valor_unitario: 2500,
    valor_total: 5000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339035',
    nome_natureza: 'Serviços de Consultoria',
    numero_item: '1',
    meta: '22. Contratação de consultorias',
    item_rubrica: 'Formação sobre Ambiente Seguro, Diversidade e Inclusão',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 2500,
    valor_total: 2500,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339030',
    nome_natureza: 'Material de consumo',
    numero_item: '04',
    meta: '23 - Despesas Gerais',
    item_rubrica: 'Transporte',
    unidade: 'mês',
    quantidade: 1,
    periodo_frequencia: 10,
    valor_unitario: 400,
    valor_total: 4000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339030',
    nome_natureza: 'Material de consumo',
    numero_item: '12',
    meta: '23 - Despesas Gerais',
    item_rubrica: 'Material escritório',
    unidade: 'mês',
    quantidade: 1,
    periodo_frequencia: 9,
    valor_unitario: 300,
    valor_total: 2700,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '46',
    meta: '23 - Despesas Gerais',
    item_rubrica: 'Assessoria Jurídica',
    unidade: 'mês',
    quantidade: 1,
    periodo_frequencia: 10,
    valor_unitario: 1700,
    valor_total: 17000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '04',
    meta: '23 - Despesas Gerais',
    item_rubrica: 'Energia elétrica',
    unidade: 'mês',
    quantidade: 1,
    periodo_frequencia: 10,
    valor_unitario: 450,
    valor_total: 4500,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '42',
    meta: '23 - Despesas Gerais',
    item_rubrica: 'Contador',
    unidade: 'mês',
    quantidade: 1,
    periodo_frequencia: 10,
    valor_unitario: 1000,
    valor_total: 10000,
    origem_recurso: '3º ADITIVO'
  },
  {
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    numero_item: '99',
    meta: '24 - Gestão do projeto',
    item_rubrica: 'Gestão, coordenação, produção, administração, comunicação e operação continuada',
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 750000,
    valor_total: 750000,
    origem_recurso: '3º ADITIVO'
  }
];

function buildRubricaPayload(row: any, index: number) {
  const codigo = `3AD-${String(index + 1).padStart(3, '0')}`;
  const rubricaKey = makeRubricaKey(row);
  const valorTotal = roundMoney(toNumber(row.valor_total));
  const valorUnitario = roundMoney(toNumber(row.valor_unitario));

  return {
    codigo,
    rubrica_key: rubricaKey,
    origem_recurso: row.origem_recurso,
    fonte_recurso: row.origem_recurso,
    aditivo: '3º ADITIVO',
    plano_trabalho: '3º Aditivo - Museus Centro / OSC Viaduto das Artes',
    natureza_despesa: String(row.natureza_despesa),
    nome_natureza: row.nome_natureza,
    numero_item: String(row.numero_item),
    numero: String(row.numero_item),
    meta: row.meta,
    item_rubrica: row.item_rubrica,
    nome: row.item_rubrica,
    rubrica: row.item_rubrica,
    descricao: `${row.meta} — ${row.item_rubrica}`,
    unidade: row.unidade,
    quantidade: toNumber(row.quantidade),
    periodo_frequencia: toNumber(row.periodo_frequencia),
    valor_unitario: valorUnitario,
    valor_total: valorTotal,
    valor_rubrica: valorTotal,
    ativo: true,
    status: 'ATIVA',
    oficial_3_aditivo: true
  };
}

function isRubrica3Aditivo(r: any): boolean {
  const origem = normalizeText(r?.origem_recurso || r?.fonte_recurso || r?.aditivo || '');
  return (
    r?.oficial_3_aditivo === true ||
    origem.includes('3 aditivo') ||
    origem.includes('3º aditivo') ||
    origem.includes('3o aditivo')
  );
}

function getRubricaExistingKey(r: any): string {
  if (r?.rubrica_key) return String(r.rubrica_key);
  return makeRubricaKey({
    natureza_despesa: r?.natureza_despesa,
    nome_natureza: r?.nome_natureza,
    numero_item: r?.numero_item || r?.numero,
    meta: r?.meta,
    item_rubrica: r?.item_rubrica || r?.rubrica || r?.nome,
    unidade: r?.unidade,
    quantidade: r?.quantidade,
    periodo_frequencia: r?.periodo_frequencia,
    valor_unitario: r?.valor_unitario,
    valor_total: r?.valor_total || r?.valor_rubrica,
    origem_recurso: r?.origem_recurso || r?.fonte_recurso || r?.aditivo
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const somaOficial = roundMoney(
      RUBRICAS_OFICIAIS_3_ADITIVO.reduce((acc, row) => acc + toNumber(row.valor_total), 0)
    );

    if (somaOficial !== TOTAL_OFICIAL_3_ADITIVO) {
      return json(
        {
          success: false,
          error: 'Base oficial do 3º Aditivo não confere com R$ 1.320.000,00.',
          totalCalculado: somaOficial,
          totalEsperado: TOTAL_OFICIAL_3_ADITIVO
        },
        500
      );
    }

    let rubricas = await base44.asServiceRole.entities.Rubrica.list();
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list();

    const porChave = new Map<string, any[]>();

    for (const r of rubricas || []) {
      const key = getRubricaExistingKey(r);
      if (!key) continue;

      if (!porChave.has(key)) porChave.set(key, []);
      porChave.get(key)!.push(r);
    }

    const oficiaisAtivas: any[] = [];
    let criadas = 0;
    let atualizadas = 0;
    let duplicadasDesativadas = 0;

    for (let i = 0; i < RUBRICAS_OFICIAIS_3_ADITIVO.length; i++) {
      const payload = buildRubricaPayload(RUBRICAS_OFICIAIS_3_ADITIVO[i], i);
      const existentes = porChave.get(payload.rubrica_key) || [];
      const principal = existentes[0];

      if (principal?.id) {
        await base44.asServiceRole.entities.Rubrica.update(principal.id, payload);
        oficiaisAtivas.push({ ...principal, ...payload });
        atualizadas++;

        for (const duplicada of existentes.slice(1)) {
          await base44.asServiceRole.entities.Rubrica.update(duplicada.id, {
            ativo: false,
            status: 'INATIVA_DUPLICADA',
            duplicada_de: principal.id,
            motivo_inativacao: 'Duplicidade removida pela restauração da base oficial do 3º Aditivo.'
          });
          duplicadasDesativadas++;
        }
      } else {
        const criada = await base44.asServiceRole.entities.Rubrica.create(payload);
        oficiaisAtivas.push(criada);
        criadas++;
      }
    }

    rubricas = await base44.asServiceRole.entities.Rubrica.list();

    const chavesOficiais = new Set(
      RUBRICAS_OFICIAIS_3_ADITIVO.map((row) => makeRubricaKey(row))
    );

    for (const r of rubricas || []) {
      if (!isRubrica3Aditivo(r)) continue;

      const key = getRubricaExistingKey(r);

      if (!chavesOficiais.has(key) && r?.ativo !== false) {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          ativo: false,
          status: 'INATIVA_FORA_BASE_OFICIAL',
          motivo_inativacao:
            'Rubrica do 3º Aditivo não encontrada na base oficial restaurada. Solicitações existentes não foram alteradas.'
        });
      }
    }

    rubricas = await base44.asServiceRole.entities.Rubrica.list();

    const acumulado: Record<string, number> = {};

    for (const p of purchases || []) {
      if (!p?.rubrica_id) continue;
      if (!isStatusAprovado(p.status)) continue;

      const valor = getPurchaseValue(p);
      if (!valor || valor <= 0) continue;

      acumulado[p.rubrica_id] = roundMoney((acumulado[p.rubrica_id] || 0) + valor);
    }

    let recalculadas = 0;

    for (const r of rubricas || []) {
      if (!r?.id) continue;

      const total = roundMoney(toNumber(r.valor_total || r.valor_rubrica));
      const utilizado = roundMoney(toNumber(acumulado[r.id] || 0));
      const saldo = roundMoney(total - utilizado);
      const percentual = total > 0 ? roundMoney((utilizado / total) * 100) : 0;

      await base44.asServiceRole.entities.Rubrica.update(r.id, {
        valor_utilizado: utilizado,
        saldo_comprometido: 0,
        valor_comprometido: 0,
        saldo_real: saldo,
        saldo,
        percentual_utilizado: percentual,
        regra_financeira: 'APROVADO = UTILIZADO',
        atualizado_por_recalculo: true,
        recalculado_em: new Date().toISOString()
      });

      recalculadas++;
    }

    return json({
      success: true,
      regra: 'APROVADO = UTILIZADO',
      totalOficial3Aditivo: TOTAL_OFICIAL_3_ADITIVO,
      somaOficialRestaurada: somaOficial,
      rubricasOficiais: RUBRICAS_OFICIAIS_3_ADITIVO.length,
      criadas,
      atualizadas,
      duplicadasDesativadas,
      recalculadas,
      totalComprasAprovadasConsideradas: Object.keys(acumulado).length,
      observacao:
        'Rubricas fora da base oficial foram inativadas. Solicitações existentes não foram alteradas.'
    });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);

    return json(
      {
        success: false,
        error: error?.message || 'Erro ao restaurar e recalcular rubricas.'
      },
      500
    );
  }
});
