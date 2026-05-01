import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// Mapa de IDs antigos (BudgetLine) → palavras-chave para encontrar rubrica nova
// Baseado nos dados observados nas solicitações existentes
const MAPA_DESCRICAO_PARA_RUBRICA: Record<string, string[]> = {
  "educador mis": ["educador mis / mumo / mhab"],
  "designer (mes": ["designer (m"],
  "design grafico": ["designer (m"],
  "assessor de imprensa": ["assessor de imprensa"],
  "producao mis": ["produ"],
  "fotografo": ["fot"],
  "rede social": ["rede social"],
  "coordenador geral": ["coordenador geral"],
  "analista adm": ["analista adm"],
  "assistente adm": ["assistente administrativo"],
  "coord comunicacao": ["coordenador de comunica"],
  "manutencao mis": ["manuten"],
  "manutencao mumo": ["manuten"],
  "manutencao mhab": ["manuten"],
  "contador": ["contador"],
  "juridica": ["assessoria jur"],
  "transporte": ["transporte"],
};

function normalize(str: string): string {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findRubricaByKeyword(rubricasAtivas: any[], descricao: string, fornecedor: string): any | null {
  const desc = normalize(descricao);
  const forn = normalize(fornecedor);
  const combined = `${desc} ${forn}`;

  // Regras específicas por padrão de descrição/fornecedor (mais precisas primeiro)
  const regras: Array<{ test: (s: string) => boolean; keyword: string }> = [
    { test: s => s.includes("educador") || s.includes("educadora") || s.includes("acao educativa"), keyword: "educador mis" },
    { test: s => s.includes("design grafico") || s.includes("design gr") || (s.includes("samira") && s.includes("design")), keyword: "designer (mes" },
    { test: s => s.includes("assessoria de imprensa") || s.includes("assessor de imprensa"), keyword: "assessor de imprensa" },
    { test: s => s.includes("producao") && !s.includes("assistente") && (s.includes("mis") || s.includes("mumo") || s.includes("mhab") || s.includes("museus centro")), keyword: "producao mis" },
    { test: s => s.includes("fotografo") || s.includes("fotografa") || (s.includes("foto") && s.includes("museus centro")), keyword: "fotografo" },
    { test: s => s.includes("designer") && !s.includes("identidade"), keyword: "designer (mes" },
    { test: s => s.includes("rede social") || s.includes("marketing cultural"), keyword: "rede social" },
    { test: s => s.includes("coordenador geral") || s.includes("coord geral"), keyword: "coordenador geral" },
    { test: s => s.includes("analista") && s.includes("financ"), keyword: "analista adm" },
    { test: s => s.includes("assistente") && s.includes("administrat"), keyword: "assistente adm" },
    { test: s => s.includes("coord") && s.includes("comunicac"), keyword: "coord comunicacao" },
    { test: s => s.includes("manutencao") && s.includes("mis"), keyword: "manutencao mis" },
    { test: s => s.includes("manutencao") && s.includes("mumo"), keyword: "manutencao mumo" },
    { test: s => s.includes("manutencao") && s.includes("mhab"), keyword: "manutencao mhab" },
    { test: s => s.includes("contabilid") || s.includes("contador"), keyword: "contador" },
    { test: s => s.includes("juridic") || s.includes("advocac"), keyword: "juridica" },
    { test: s => s.includes("transporte") && !s.includes("van"), keyword: "transporte" },
  ];

  for (const regra of regras) {
    if (regra.test(combined)) {
      const targets = MAPA_DESCRICAO_PARA_RUBRICA[regra.keyword];
      if (targets) {
        for (const target of targets) {
          const found = rubricasAtivas.find(r => normalize(r.rubrica || "").includes(normalize(target)));
          if (found) return found;
        }
      }
      // Fallback: buscar diretamente por keyword na rubrica
      const found = rubricasAtivas.find(r => normalize(r.rubrica || "").includes(normalize(regra.keyword)));
      if (found) return found;
    }
  }

  // Matching direto por palavras-chave do nome da rubrica
  for (const rubrica of rubricasAtivas) {
    const rubricaNorm = normalize(rubrica.rubrica || "");
    const words = rubricaNorm.split(/\s+/).filter(w => w.length > 4);
    if (words.length > 1 && words.filter(w => combined.includes(w)).length >= Math.min(2, words.length)) {
      return rubrica;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Acesso negado: apenas admin" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.apply !== true;

    // Buscar rubricas ativas
    const rubricasAtivas = await base44.asServiceRole.entities.Rubrica.filter({ ativo: true });

    // Buscar IDs de rubricas que existem agora
    const idsValidos = new Set(rubricasAtivas.map((r: any) => r.id));

    // Buscar todas as solicitações
    const todas = await base44.asServiceRole.entities.PurchaseRequest.list("-created_date", 500);

    const remapeadas = [];
    const semMatch = [];
    const jaOk = [];

    for (const pr of todas) {
      const rubricaIdAtual = pr.rubrica_id || pr.budgetline_id;

      // Se o rubrica_id atual é válido, não precisa remapear
      if (rubricaIdAtual && idsValidos.has(rubricaIdAtual)) {
        // Garantir que rubrica_id e budgetline_id apontem para o mesmo ID válido
        if (pr.rubrica_id !== rubricaIdAtual && !dryRun) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            rubrica_id: rubricaIdAtual,
            budgetline_id: rubricaIdAtual,
          });
        }
        jaOk.push({ id: pr.id, fornecedor: pr.fornecedor_nome, rubrica_id: rubricaIdAtual });
        continue;
      }

      // ID inválido — tentar encontrar rubrica correta
      const match = findRubricaByKeyword(
        rubricasAtivas,
        pr.descricao_item || "",
        pr.fornecedor_nome || pr.nf_emitente_nome || ""
      );

      if (match) {
        remapeadas.push({
          id: pr.id,
          fornecedor: pr.fornecedor_nome,
          descricao: pr.descricao_item?.substring(0, 60),
          rubrica_antiga: rubricaIdAtual,
          rubrica_nova_id: match.id,
          rubrica_nova_nome: match.rubrica,
        });

        if (!dryRun) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            rubrica_id: match.id,
            budgetline_id: match.id,
          });
        }
      } else {
        semMatch.push({
          id: pr.id,
          fornecedor: pr.fornecedor_nome,
          descricao: pr.descricao_item?.substring(0, 60),
          rubrica_id_antiga: rubricaIdAtual,
        });
      }
    }

    return Response.json({
      modo: dryRun ? "dryRun" : "aplicado",
      totalSolicitacoes: todas.length,
      jaOk: jaOk.length,
      remapeadas: remapeadas.length,
      semMatch: semMatch.length,
      detalhe_remapeadas: remapeadas,
      detalhe_semMatch: semMatch,
      avisos: dryRun ? ["Modo DRY-RUN: nenhuma alteração aplicada"] : [],
    });

  } catch (error: any) {
    console.error("Erro:", error);
    return Response.json({ erro: error.message }, { status: 500 });
  }
});