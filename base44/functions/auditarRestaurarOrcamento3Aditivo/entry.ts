import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// ============================================================
// LISTA OFICIAL DO 3º ADITIVO — fonte única da verdade
// Soma: R$ 1.320.000,00
// ============================================================
const RUBRICAS_OFICIAIS = [
  // Equipe e gestão
  { grupo: "Equipe e gestão", rubrica: "Coordenador Geral (mês 19 ao 28)", valor_rubrica: 70000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Assistente de Coordenação e Produção", valor_rubrica: 50000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Consultoria de programação", valor_rubrica: 30000, numero_parcelas_unidades: "1 contrato" },
  { grupo: "Equipe e gestão", rubrica: "Coordenador de Comunicação (mês 19 ao 28)", valor_rubrica: 60000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Analista Adm. Financeira (mês 19 ao 28)", valor_rubrica: 50000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Assistente Administrativo (mês 19 ao 28)", valor_rubrica: 40000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Produção MIS/MUMO/MHAB (mês 19 ao 28)", valor_rubrica: 113400, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Assessor de Imprensa (mês 19 ao 28)", valor_rubrica: 27000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Rede Social / Marketing Cultural (mês 19 ao 28)", valor_rubrica: 22500, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Fotógrafo (mês 19 ao 28)", valor_rubrica: 27000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Equipe e gestão", rubrica: "Designer (mês 19 ao 28)", valor_rubrica: 52000, numero_parcelas_unidades: "10 meses" },
  // Manutenção e operação
  { grupo: "Manutenção e operação", rubrica: "Manutenção MIS (mês 19 ao 28)", valor_rubrica: 13500, numero_parcelas_unidades: "10 meses" },
  { grupo: "Manutenção e operação", rubrica: "Manutenção MUMO (mês 19 ao 28)", valor_rubrica: 13500, numero_parcelas_unidades: "10 meses" },
  { grupo: "Manutenção e operação", rubrica: "Manutenção MHAB (mês 19 ao 28)", valor_rubrica: 18000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Manutenção e operação", rubrica: "Educador MIS / MUMO / MHAB (mês 19 ao 28)", valor_rubrica: 138000, numero_parcelas_unidades: "10 meses" },
  // Mostras e exposições
  { grupo: "Mostras e exposições", rubrica: "Mostra de baixa complexidade MIS", valor_rubrica: 4000, numero_parcelas_unidades: "1" },
  { grupo: "Mostras e exposições", rubrica: "Mostra de média complexidade MHAB", valor_rubrica: 7000, numero_parcelas_unidades: "1" },
  { grupo: "Mostras e exposições", rubrica: "Peça em destaque MHAB", valor_rubrica: 1000, numero_parcelas_unidades: "1" },
  { grupo: "Mostras e exposições", rubrica: "Exposição MUMO", valor_rubrica: 210000, numero_parcelas_unidades: "1" },
  // Noturno nos Museus 2026
  { grupo: "Noturno nos Museus 2026", rubrica: "Produção (Ed. 2026)", valor_rubrica: 6000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Assistente de Produção (Ed. 2026)", valor_rubrica: 4000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "ID / designer (Ed. 2026)", valor_rubrica: 7000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Sinalização (Ed. 2026)", valor_rubrica: 11250, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Monitores (Ed. 2026)", valor_rubrica: 3000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Kit de Iluminação (Ed. 2026)", valor_rubrica: 12000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Segurança (Ed. 2026)", valor_rubrica: 3000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Limpeza (Ed. 2026)", valor_rubrica: 2700, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Vans (Ed. 2026)", valor_rubrica: 30400, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Vídeo e Fotografia (Ed. 2026)", valor_rubrica: 20000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Apresentações – MIS/MUMO/MHAB/3 museus PBH (Ed. 2026)", valor_rubrica: 15000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Infraestrutura MIS/MUMO/MHAB (Ed. 2026)", valor_rubrica: 12000, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Apresentações culturais – 3 museus PBH (Ed. 2026)", valor_rubrica: 7500, numero_parcelas_unidades: "1" },
  { grupo: "Noturno nos Museus 2026", rubrica: "Infraestrutura 3 museus PBH (Ed. 2026)", valor_rubrica: 7500, numero_parcelas_unidades: "1" },
  // Diárias e publicações
  { grupo: "Diárias e publicações", rubrica: "Diárias MIS / MUMO / MHAB", valor_rubrica: 6300, numero_parcelas_unidades: "1" },
  { grupo: "Diárias e publicações", rubrica: "Designer MHAB", valor_rubrica: 7000, numero_parcelas_unidades: "1" },
  { grupo: "Diárias e publicações", rubrica: "Fotógrafo MHAB", valor_rubrica: 5675, numero_parcelas_unidades: "1" },
  { grupo: "Diárias e publicações", rubrica: "Pesquisa e texto MHAB (2ª publicação)", valor_rubrica: 3000, numero_parcelas_unidades: "1" },
  { grupo: "Diárias e publicações", rubrica: "Revisão MHAB", valor_rubrica: 1375, numero_parcelas_unidades: "1" },
  { grupo: "Diárias e publicações", rubrica: "Tradução MHAB", valor_rubrica: 2200, numero_parcelas_unidades: "1" },
  { grupo: "Diárias e publicações", rubrica: "Impressão MHAB", valor_rubrica: 21000, numero_parcelas_unidades: "1" },
  // Alimentação, material e ações
  { grupo: "Alimentação, material e ações", rubrica: "Lanches/buffet (mês 19 ao 28)", valor_rubrica: 9000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Alimentação, material e ações", rubrica: "Alimentação (mês 19 ao 28)", valor_rubrica: 9000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Alimentação, material e ações", rubrica: "Material MIS / MUMO / MHAB (mês 19 ao 28)", valor_rubrica: 24000, numero_parcelas_unidades: "10 meses" },
  { grupo: "Alimentação, material e ações", rubrica: "Ações educativo-culturais MIS / MUMO / MHAB", valor_rubrica: 90000, numero_parcelas_unidades: "1" },
  { grupo: "Alimentação, material e ações", rubrica: "Fornecimento de som e iluminação", valor_rubrica: 7500, numero_parcelas_unidades: "1" },
  // Consultorias
  { grupo: "Consultorias", rubrica: "Consultorias de temas transversais diversos", valor_rubrica: 5000, numero_parcelas_unidades: "1" },
  { grupo: "Consultorias", rubrica: "Formação sobre Ambiente Seguro, Diversidade e Inclusão", valor_rubrica: 2500, numero_parcelas_unidades: "1" },
  // Despesas gerais
  { grupo: "Despesas gerais", rubrica: "Transporte", valor_rubrica: 4000, numero_parcelas_unidades: "1" },
  { grupo: "Despesas gerais", rubrica: "Material de escritório", valor_rubrica: 2700, numero_parcelas_unidades: "1" },
  { grupo: "Despesas gerais", rubrica: "Assessoria jurídica", valor_rubrica: 17000, numero_parcelas_unidades: "1" },
  { grupo: "Despesas gerais", rubrica: "Energia elétrica", valor_rubrica: 4500, numero_parcelas_unidades: "1" },
  { grupo: "Despesas gerais", rubrica: "Contador", valor_rubrica: 10000, numero_parcelas_unidades: "1" },
];

const SOMA_OFICIAL = 1320000;

// ============================================================
// Utilitários de normalização
// ============================================================
function removeAcentos(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(str) {
  return removeAcentos(str)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Chave de matching: normaliza rubrica + valor (ignora grupo para tolerância)
function rubricaMatchKey(rubrica, valor) {
  return `${normalizeKey(rubrica)}||${Math.round(Number(valor || 0))}`;
}

// Chave de matching só por nome (sem valor) — para remapeamento de solicitações
function rubricaNomeKey(rubrica) {
  return normalizeKey(rubrica);
}

// ============================================================
// Paginação
// ============================================================
async function listAll(entityApi, orderBy = "created_date", pageSize = 200) {
  let all = [];
  let page = 0;
  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }
  return all;
}

// ============================================================
// Handler principal
// ============================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Acesso negado: apenas admin" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.apply !== true;
    const modo = dryRun ? "dryRun" : "aplicado";

    console.log(`[saneamento] Iniciando — modo: ${modo}`);

    // Validar soma da lista oficial
    const somaCalculada = RUBRICAS_OFICIAIS.reduce((s, r) => s + r.valor_rubrica, 0);
    if (somaCalculada !== SOMA_OFICIAL) {
      return Response.json(
        { erro: `Soma inválida da lista oficial: ${somaCalculada} != ${SOMA_OFICIAL}` },
        { status: 400 }
      );
    }

    // --------------------------------------------------------
    // 1. Carregar todas as rubricas existentes (ativas + inativas)
    // --------------------------------------------------------
    const todasRubricas = await listAll(base44.asServiceRole.entities.Rubrica, "ordem_exibicao");
    console.log(`[saneamento] Rubricas encontradas no banco: ${todasRubricas.length}`);

    // Mapas de lookup para as oficiais
    const oficialPorChave = new Map(); // chave: normalizedNome||valor → oficial
    const oficialPorNome = new Map();  // chave: normalizedNome → oficial

    for (const of_ of RUBRICAS_OFICIAIS) {
      const chave = rubricaMatchKey(of_.rubrica, of_.valor_rubrica);
      const nomeKey = rubricaNomeKey(of_.rubrica);
      oficialPorChave.set(chave, of_);
      oficialPorNome.set(nomeKey, of_);
    }

    // --------------------------------------------------------
    // 2. Classificar cada rubrica existente: oficial ou duplicada
    // --------------------------------------------------------
    // Para cada rubrica oficial, guardamos o registro "vencedor" (1 por oficial)
    const bancoPorOficialChave = new Map(); // chaveOficial → registro do banco
    const aDesativar = [];  // rubricas a marcar ativo=false
    const aAtualizar = [];  // rubricas a corrigir valor/grupo/nome
    const aCriar = [];      // oficiais sem registro no banco

    // Primeiro: identificar o melhor candidato para cada oficial
    for (const rubricaBanco of todasRubricas) {
      const chave = rubricaMatchKey(rubricaBanco.rubrica, rubricaBanco.valor_rubrica);
      const nomeKey = rubricaNomeKey(rubricaBanco.rubrica);

      const matchPorChave = oficialPorChave.get(chave);
      const matchPorNome = oficialPorNome.get(nomeKey);
      const match = matchPorChave || matchPorNome;

      if (match) {
        const matchChave = rubricaMatchKey(match.rubrica, match.valor_rubrica);
        if (!bancoPorOficialChave.has(matchChave)) {
          // Primeiro candidato: reservar este como o "oficial"
          bancoPorOficialChave.set(matchChave, rubricaBanco);
        } else {
          // Segundo candidato: é duplicata, desativar
          aDesativar.push({ registro: rubricaBanco, motivo: `Duplicata de "${match.rubrica}"` });
        }
      } else {
        // Não está na lista oficial: desativar
        aDesativar.push({ registro: rubricaBanco, motivo: "Não consta na lista oficial do 3º Aditivo" });
      }
    }

    // Verificar quais oficiais não têm registro no banco (criar)
    for (const of_ of RUBRICAS_OFICIAIS) {
      const chave = rubricaMatchKey(of_.rubrica, of_.valor_rubrica);
      if (!bancoPorOficialChave.has(chave)) {
        aCriar.push(of_);
      } else {
        // Verificar se precisa corrigir nome, grupo ou valor
        const registro = bancoPorOficialChave.get(chave);
        const necessitaCorrecao =
          registro.rubrica !== of_.rubrica ||
          registro.grupo !== of_.grupo ||
          registro.valor_rubrica !== of_.valor_rubrica ||
          registro.ativo === false;

        if (necessitaCorrecao) {
          aAtualizar.push({ registro, oficial: of_ });
        }
      }
    }

    console.log(`[saneamento] A criar: ${aCriar.length}, A atualizar: ${aAtualizar.length}, A desativar: ${aDesativar.length}`);

    // --------------------------------------------------------
    // 3. Aplicar alterações (se não for dryRun)
    // --------------------------------------------------------
    let rubricasCriadas = 0;
    let rubricasAtualizadas = 0;
    let rubricasDesativadas = 0;
    const logAcoes = [];

    if (!dryRun) {
      // 3a. Criar rubricas oficiais ausentes
      for (const of_ of aCriar) {
        await base44.asServiceRole.entities.Rubrica.create({
          grupo: of_.grupo,
          rubrica: of_.rubrica,
          valor_rubrica: of_.valor_rubrica,
          numero_parcelas_unidades: of_.numero_parcelas_unidades || "1",
          valor_utilizado: 0,
          saldo: of_.valor_rubrica,
          percentual_utilizado: 0,
          ativo: true,
          ordem_exibicao: 0,
        });
        rubricasCriadas++;
        logAcoes.push(`CRIADA: "${of_.rubrica}" [${of_.grupo}] = R$ ${of_.valor_rubrica}`);
        console.log(`[saneamento] Criada: ${of_.rubrica}`);
      }

      // 3b. Atualizar rubricas que precisam de correção
      for (const { registro, oficial } of aAtualizar) {
        await base44.asServiceRole.entities.Rubrica.update(registro.id, {
          grupo: oficial.grupo,
          rubrica: oficial.rubrica,
          valor_rubrica: oficial.valor_rubrica,
          numero_parcelas_unidades: oficial.numero_parcelas_unidades || registro.numero_parcelas_unidades || "1",
          ativo: true,
        });
        rubricasAtualizadas++;
        logAcoes.push(`ATUALIZADA: "${registro.rubrica}" → "${oficial.rubrica}" [${oficial.grupo}]`);
        console.log(`[saneamento] Atualizada: ${registro.rubrica} → ${oficial.rubrica}`);
      }

      // 3c. Desativar duplicatas e não-oficiais
      for (const { registro, motivo } of aDesativar) {
        if (registro.ativo !== false) {
          await base44.asServiceRole.entities.Rubrica.update(registro.id, {
            ativo: false,
            observacao_uso: `Desativada por saneamento da base oficial do 3º Aditivo. Motivo: ${motivo}`,
          });
          rubricasDesativadas++;
          logAcoes.push(`DESATIVADA: "${registro.rubrica}" [${registro.grupo}] — ${motivo}`);
          console.log(`[saneamento] Desativada: ${registro.rubrica} — ${motivo}`);
        }
      }
    }

    // --------------------------------------------------------
    // 4. Recarregar estado atual após alterações
    // --------------------------------------------------------
    const rubricasAtuais = await listAll(base44.asServiceRole.entities.Rubrica, "ordem_exibicao");
    const rubricasAtivas = rubricasAtuais.filter(r => r.ativo !== false);

    // Montar mapa id → oficial para remapeamento
    const idParaOficial = new Map();
    for (const r of rubricasAtivas) {
      const nomeKey = rubricaNomeKey(r.rubrica);
      const of_ = oficialPorNome.get(nomeKey);
      if (of_) idParaOficial.set(r.id, of_);
    }

    // Montar mapa: nomeKey → id do registro ativo oficial
    const nomeKeyParaIdAtivo = new Map();
    for (const r of rubricasAtivas) {
      const nomeKey = rubricaNomeKey(r.rubrica);
      if (oficialPorNome.has(nomeKey)) {
        nomeKeyParaIdAtivo.set(nomeKey, r.id);
      }
    }

    // --------------------------------------------------------
    // 5. Remapear solicitações que apontam para rubricas desativadas
    // --------------------------------------------------------
    const todasSolicitacoes = await listAll(base44.asServiceRole.entities.PurchaseRequest, "created_date");
    console.log(`[saneamento] Total de solicitações: ${todasSolicitacoes.length}`);

    const idsDesativados = new Set(aDesativar.map(d => d.registro.id));
    let solicitacoesRemapeadas = 0;
    const logRemapeamentos = [];

    for (const pr of todasSolicitacoes) {
      if (!pr.rubrica_id) continue;
      if (!idsDesativados.has(pr.rubrica_id)) continue;

      // Encontrar a rubrica desativada
      const rubricaDesativada = todasRubricas.find(r => r.id === pr.rubrica_id);
      if (!rubricaDesativada) continue;

      // Tentar encontrar a oficial equivalente
      const nomeKey = rubricaNomeKey(rubricaDesativada.rubrica);
      const novoId = nomeKeyParaIdAtivo.get(nomeKey);

      if (!novoId) continue; // Não encontrou equivalente, manter como está

      if (!dryRun) {
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
          rubrica_id: novoId,
        });
        solicitacoesRemapeadas++;
        logRemapeamentos.push(
          `Solicitação ${pr.id}: rubrica "${rubricaDesativada.rubrica}" → "${todasRubricas.find(r => r.id === novoId)?.rubrica || novoId}"`
        );
        console.log(`[saneamento] Remapeada solicitação ${pr.id}`);
      } else {
        solicitacoesRemapeadas++;
        logRemapeamentos.push(
          `[DRY] Solicitação ${pr.id}: rubrica "${rubricaDesativada.rubrica}" seria remapeada`
        );
      }
    }

    // --------------------------------------------------------
    // 6. Recalcular valor_utilizado, saldo, percentual para oficiais
    // --------------------------------------------------------
    // Recarregar solicitações (após remapeamento) para cálculo correto
    const solicitacoesFinais = !dryRun
      ? await listAll(base44.asServiceRole.entities.PurchaseRequest, "created_date")
      : todasSolicitacoes;

    const statusQueDebitam = ["APROVADO_COORD", "APROVADO_ADMIN", "PAGO"];
    const utilizadoPorRubrica = new Map();

    for (const pr of solicitacoesFinais) {
      if (!pr.rubrica_id) continue;
      if (!statusQueDebitam.includes(pr.status)) continue;

      const valor = Number(pr.valor_aprovado_admin || pr.valor_aprovado || pr.valor_solicitado || 0);
      const atual = utilizadoPorRubrica.get(pr.rubrica_id) || 0;
      utilizadoPorRubrica.set(pr.rubrica_id, atual + valor);
    }

    let rubricasRecalculadas = 0;
    if (!dryRun) {
      const rubricasParaRecalcular = await listAll(base44.asServiceRole.entities.Rubrica, "ordem_exibicao");
      for (const r of rubricasParaRecalcular) {
        if (r.ativo === false) continue;
        const utilizado = utilizadoPorRubrica.get(r.id) || 0;
        const saldo = r.valor_rubrica - utilizado;
        const percentual = r.valor_rubrica > 0
          ? Math.round((utilizado / r.valor_rubrica) * 10000) / 100
          : 0;
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          valor_utilizado: utilizado,
          saldo: saldo,
          percentual_utilizado: percentual,
        });
        rubricasRecalculadas++;
      }
      console.log(`[saneamento] Recalculadas: ${rubricasRecalculadas} rubricas`);
    }

    // --------------------------------------------------------
    // 7. Validação final
    // --------------------------------------------------------
    const rubricasFinais = await listAll(base44.asServiceRole.entities.Rubrica, "ordem_exibicao");
    const rubricasAtivasFinais = rubricasFinais.filter(r => r.ativo !== false);
    const somaFinal = rubricasAtivasFinais.reduce((s, r) => s + (r.valor_rubrica || 0), 0);
    const validacaoOk = somaFinal === SOMA_OFICIAL;

    console.log(`[saneamento] Soma final: R$ ${somaFinal} — Esperado: R$ ${SOMA_OFICIAL} — OK: ${validacaoOk}`);

    // --------------------------------------------------------
    // 8. Relatório
    // --------------------------------------------------------
    return Response.json({
      modo,
      data: new Date().toISOString(),
      usuario: user.email,
      validacao: {
        somaFinal,
        somaEsperada: SOMA_OFICIAL,
        ok: validacaoOk,
        totalRubricasAtivas: rubricasAtivasFinais.length,
        totalRubricasOficiais: RUBRICAS_OFICIAIS.length,
      },
      resumo: {
        rubricasCriadas,
        rubricasAtualizadas,
        rubricasDesativadas,
        solicitacoesRemapeadas,
        rubricasRecalculadas,
      },
      acoes: logAcoes,
      remapeamentos: logRemapeamentos,
      pendentes: dryRun ? {
        aCriar: aCriar.map(r => `${r.rubrica} [${r.grupo}]`),
        aAtualizar: aAtualizar.map(({ registro, oficial }) => `"${registro.rubrica}" → "${oficial.rubrica}"`),
        aDesativar: aDesativar.map(({ registro, motivo }) => `"${registro.rubrica}" — ${motivo}`),
      } : null,
    });
  } catch (error) {
    console.error("[saneamento] Erro:", error);
    return Response.json(
      { erro: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
});