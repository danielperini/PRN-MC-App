import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const RUBRICAS_OFICIAIS = [
  // Equipe e gestão
  { grupo: "Equipe e gestao", rubrica: "Coordenador Geral (mês 19 ao 28)", valor_rubrica: 70000 },
  { grupo: "Equipe e gestao", rubrica: "Assistente de Coordenação e Produção", valor_rubrica: 50000 },
  { grupo: "Equipe e gestao", rubrica: "Coordenador de Comunicação (mês 19 ao 28)", valor_rubrica: 60000 },
  { grupo: "Equipe e gestao", rubrica: "Analista Adm. Financeira (mês 19 ao 28)", valor_rubrica: 50000 },
  { grupo: "Equipe e gestao", rubrica: "Assistente Administrativo (mês 19 ao 28)", valor_rubrica: 40000 },
  { grupo: "Equipe e gestao", rubrica: "Produção MIS/MUMO/MHAB (mês 19 ao 28)", valor_rubrica: 113400 },
  { grupo: "Equipe e gestao", rubrica: "Assessor de Imprensa (mês 19 ao 28)", valor_rubrica: 27000 },
  { grupo: "Equipe e gestao", rubrica: "Rede Social / Marketing Cultural (mês 19 ao 28)", valor_rubrica: 22500 },
  { grupo: "Equipe e gestao", rubrica: "Fotógrafo (mês 19 ao 28)", valor_rubrica: 27000 },
  { grupo: "Equipe e gestao", rubrica: "Designer (mês 19 ao 28)", valor_rubrica: 52000 },
  // Consultorias
  { grupo: "Consultorias", rubrica: "Consultoria de programação", valor_rubrica: 30000 },
  { grupo: "Consultorias", rubrica: "Consultorias de temas transversais diversos", valor_rubrica: 5000 },
  { grupo: "Consultorias", rubrica: "Formação sobre Ambiente Seguro, Diversidade e Inclusão", valor_rubrica: 2500 },
  // Manutenção e operação
  { grupo: "Manutencao e operacao", rubrica: "Manutenção MIS (mês 19 ao 28)", valor_rubrica: 13500 },
  { grupo: "Manutencao e operacao", rubrica: "Manutenção MUMO (mês 19 ao 28)", valor_rubrica: 13500 },
  { grupo: "Manutencao e operacao", rubrica: "Manutenção MHAB (mês 19 ao 28)", valor_rubrica: 18000 },
  { grupo: "Manutencao e operacao", rubrica: "Educador MIS / MUMO / MHAB (mês 19 ao 28)", valor_rubrica: 138000 },
  // Mostras e exposições
  { grupo: "Mostras e exposicoes", rubrica: "Mostra de baixa complexidade MIS", valor_rubrica: 4000 },
  { grupo: "Mostras e exposicoes", rubrica: "Mostra de média complexidade MHAB", valor_rubrica: 7000 },
  { grupo: "Mostras e exposicoes", rubrica: "Peça em destaque MHAB", valor_rubrica: 1000 },
  { grupo: "Mostras e exposicoes", rubrica: "Exposição MUMO", valor_rubrica: 210000 },
  // Noturno nos Museus 2026
  { grupo: "Noturno nos Museus 2026", rubrica: "Produção (Ed. 2026)", valor_rubrica: 6000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Assistente de Produção (Ed. 2026)", valor_rubrica: 4000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "ID / designer (Ed. 2026)", valor_rubrica: 7000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Sinalização (Ed. 2026)", valor_rubrica: 11250 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Monitores (Ed. 2026)", valor_rubrica: 3000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Kit de Iluminação (Ed. 2026)", valor_rubrica: 12000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Segurança (Ed. 2026)", valor_rubrica: 3000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Limpeza (Ed. 2026)", valor_rubrica: 2700 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Vans (Ed. 2026)", valor_rubrica: 30400 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Vídeo e Fotografia (Ed. 2026)", valor_rubrica: 20000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Apresentações – MIS/MUMO/MHAB/3 museus PBH (Ed. 2026)", valor_rubrica: 15000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Infraestrutura MIS/MUMO/MHAB (Ed. 2026)", valor_rubrica: 12000 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Apresentações culturais – 3 museus PBH (Ed. 2026)", valor_rubrica: 7500 },
  { grupo: "Noturno nos Museus 2026", rubrica: "Infraestrutura 3 museus PBH (Ed. 2026)", valor_rubrica: 7500 },
  // Diárias e publicações
  { grupo: "Diarias e publicacoes", rubrica: "Diárias MIS / MUMO / MHAB", valor_rubrica: 6300 },
  { grupo: "Diarias e publicacoes", rubrica: "Designer MHAB", valor_rubrica: 7000 },
  { grupo: "Diarias e publicacoes", rubrica: "Fotógrafo MHAB", valor_rubrica: 5675 },
  { grupo: "Diarias e publicacoes", rubrica: "Pesquisa e texto MHAB (2ª publicação)", valor_rubrica: 3000 },
  { grupo: "Diarias e publicacoes", rubrica: "Revisão MHAB", valor_rubrica: 1375 },
  { grupo: "Diarias e publicacoes", rubrica: "Tradução MHAB", valor_rubrica: 2200 },
  { grupo: "Diarias e publicacoes", rubrica: "Impressão MHAB", valor_rubrica: 21000 },
  // Alimentação, material e ações
  { grupo: "Alimentacao, material e acoes", rubrica: "Lanches/buffet (mês 19 ao 28)", valor_rubrica: 9000 },
  { grupo: "Alimentacao, material e acoes", rubrica: "Alimentação (mês 19 ao 28)", valor_rubrica: 9000 },
  { grupo: "Alimentacao, material e acoes", rubrica: "Material MIS / MUMO / MHAB (mês 19 ao 28)", valor_rubrica: 24000 },
  { grupo: "Alimentacao, material e acoes", rubrica: "Ações educativo-culturais MIS / MUMO / MHAB", valor_rubrica: 90000 },
  { grupo: "Alimentacao, material e acoes", rubrica: "Fornecimento de som e iluminação", valor_rubrica: 7500 },
  // Despesas gerais
  { grupo: "Despesas gerais", rubrica: "Transporte", valor_rubrica: 4000 },
  { grupo: "Despesas gerais", rubrica: "Material de escritório", valor_rubrica: 2700 },
  { grupo: "Despesas gerais", rubrica: "Assessoria jurídica", valor_rubrica: 17000 },
  { grupo: "Despesas gerais", rubrica: "Energia elétrica", valor_rubrica: 4500 },
  { grupo: "Despesas gerais", rubrica: "Contador", valor_rubrica: 10000 },
];

const SOMA_OFICIAL = 1320000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Acesso negado: apenas admin" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.apply !== true;
    const operacao = dryRun ? "dryRun" : "aplicado";

    console.log(`Iniciando auditoria e restauracao - Modo: ${operacao}`);

    const somaCalculada = RUBRICAS_OFICIAIS.reduce((sum, r) => sum + r.valor_rubrica, 0);
    if (somaCalculada !== SOMA_OFICIAL) {
      console.error(`Soma das rubricas ${somaCalculada} != ${SOMA_OFICIAL}`);
      return Response.json({
        erro: `Soma invalida: ${somaCalculada} != ${SOMA_OFICIAL}`,
        modo: operacao,
      }, { status: 400 });
    }

    console.log("Restaurando rubricas oficiais...");
    let rubricasCriadas = 0;
    let rubricasAtualizadas = 0;
    let rubricasDesativadas = 0;

    const rubricasExistentes = await base44.asServiceRole.entities.Rubrica.list();

    for (const oficial of RUBRICAS_OFICIAIS) {
      const existente = rubricasExistentes.find(
        (r) => r.rubrica === oficial.rubrica && r.grupo === oficial.grupo
      );

      if (!existente && !dryRun) {
        await base44.asServiceRole.entities.Rubrica.create({
          grupo: oficial.grupo,
          rubrica: oficial.rubrica,
          valor_rubrica: oficial.valor_rubrica,
          numero_parcelas_unidades: "1",
          valor_utilizado: 0,
          saldo: oficial.valor_rubrica,
          percentual_utilizado: 0,
          ativo: true,
          ordem_exibicao: 0,
        });
        rubricasCriadas++;
        console.log(`Criada: ${oficial.rubrica}`);
      } else if (existente && !dryRun) {
        if (existente.valor_rubrica !== oficial.valor_rubrica) {
          await base44.asServiceRole.entities.Rubrica.update(existente.id, {
            valor_rubrica: oficial.valor_rubrica,
            ativo: true,
          });
          rubricasAtualizadas++;
          console.log(`Atualizada: ${oficial.rubrica}`);
        } else if (!existente.ativo) {
          await base44.asServiceRole.entities.Rubrica.update(existente.id, {
            ativo: true,
          });
          rubricasAtualizadas++;
          console.log(`Reativada: ${oficial.rubrica}`);
        }
      }
    }

    for (const rubrica of rubricasExistentes) {
      const oficialMatch = RUBRICAS_OFICIAIS.find(
        (r) => r.rubrica === rubrica.rubrica && r.grupo === rubrica.grupo
      );
      if (!oficialMatch && rubrica.ativo && !dryRun) {
        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
          ativo: false,
        });
        rubricasDesativadas++;
        console.log(`Desativada nao-oficial: ${rubrica.rubrica}`);
      }
    }

    console.log("Auditando solicitacoes de compra...");
    const purchaseRequests = await base44.asServiceRole.entities.PurchaseRequest.list();

    const statusValidos = ["APROVADO", "APROVADO_COORD", "APROVADO_ADMIN", "PAGO"];
    const solicitacoesValidas = purchaseRequests.filter((pr) =>
      statusValidos.includes(pr.status)
    );

    console.log(`Total solicitacoes: ${purchaseRequests.length}, Validas: ${solicitacoesValidas.length}`);

    console.log("Detectando duplicidades...");
    let duplicidadesEncontradas = 0;
    let duplicidadesCanceladas = 0;

    const chaveMap = new Map();
    const duplicados = [];

    for (const pr of solicitacoesValidas) {
      const chave = `${pr.nf_numero || ""}|${pr.fornecedor_cnpj_cpf || ""}|${pr.valor_total || 0}`;

      if (chaveMap.has(chave)) {
        duplicidadesEncontradas++;
        duplicados.push(pr.id);
        console.log(`Duplicado: ${pr.nf_numero} - Fornecedor ${pr.fornecedor_cnpj_cpf}`);

        if (!dryRun && pr.status !== "CANCELADO") {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            status: "CANCELADO",
          });
          duplicidadesCanceladas++;
        }
      } else {
        chaveMap.set(chave, pr.id);
      }
    }

    console.log("Recalculando valores das rubricas...");
    const rubricasAtualizadas_calculo = await base44.asServiceRole.entities.Rubrica.list();
    const purchasePorRubrica = new Map();

    for (const pr of solicitacoesValidas) {
      if (!duplicados.includes(pr.id) && pr.rubrica_id) {
        const atual = purchasePorRubrica.get(pr.rubrica_id) || 0;
        purchasePorRubrica.set(pr.rubrica_id, atual + (pr.valor_total || 0));
      }
    }

    if (!dryRun) {
      for (const rubrica of rubricasAtualizadas_calculo) {
        if (rubrica.ativo) {
          const utilizado = purchasePorRubrica.get(rubrica.id) || 0;
          const saldo = rubrica.valor_rubrica - utilizado;
          const percentual = (utilizado / rubrica.valor_rubrica) * 100;

          await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
            valor_utilizado: utilizado,
            saldo: saldo,
            percentual_utilizado: Math.round(percentual * 100) / 100,
          });
        }
      }
      console.log("Rubricas recalculadas");
    }

    console.log("Vinculando arquivos...");
    const documentIntakes = await base44.asServiceRole.entities.DocumentIntake.list();
    const attachments = await base44.asServiceRole.entities.Attachment.list();

    let arquivosPdfVinculados = 0;
    let arquivosXmlVinculados = 0;

    for (const pr of solicitacoesValidas) {
      if (duplicados.includes(pr.id)) continue;

      const pdfIntake = documentIntakes.find(
        (di) =>
          di.nf_numero === pr.nf_numero &&
          di.nf_emitente_cpf_cnpj === pr.fornecedor_cnpj_cpf &&
          di.nf_tipo_documento === "pdf_nf" &&
          di.status_processamento === "APROVADO"
      );

      const pdfAttachment = attachments.find(
        (a) =>
          a.nf_numero === pr.nf_numero &&
          a.nf_emitente_cpf_cnpj === pr.fornecedor_cnpj_cpf &&
          a.nf_tipo_documento === "pdf_nf"
      );

      if (!dryRun) {
        if (pdfIntake && !pr.nota_fiscal_url) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            nota_fiscal_url: pdfIntake.arquivo_original_url,
            pdf_intake_id: pdfIntake.id,
          });
          arquivosPdfVinculados++;
        } else if (pdfAttachment && !pr.nota_fiscal_url) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            nota_fiscal_url: pdfAttachment.file_url,
            pdf_attachment_id: pdfAttachment.id,
          });
          arquivosPdfVinculados++;
        }
      }

      const xmlIntake = documentIntakes.find(
        (di) =>
          di.nf_numero === pr.nf_numero &&
          di.nf_emitente_cpf_cnpj === pr.fornecedor_cnpj_cpf &&
          di.nf_tipo_documento === "xml_nf" &&
          di.status_processamento === "APROVADO"
      );

      const xmlAttachment = attachments.find(
        (a) =>
          a.nf_numero === pr.nf_numero &&
          a.nf_emitente_cpf_cnpj === pr.fornecedor_cnpj_cpf &&
          a.nf_tipo_documento === "xml_nf"
      );

      if (!dryRun) {
        if (xmlIntake && !pr.xml_url) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            xml_url: xmlIntake.arquivo_original_url,
            xml_intake_id: xmlIntake.id,
          });
          arquivosXmlVinculados++;
        } else if (xmlAttachment && !pr.xml_url) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            xml_url: xmlAttachment.file_url,
            xml_attachment_id: xmlAttachment.id,
          });
          arquivosXmlVinculados++;
        }
      }

      if ((pdfIntake || xmlIntake) && !dryRun) {
        if (pdfIntake) {
          await base44.asServiceRole.entities.DocumentIntake.update(pdfIntake.id, {
            entidade_destino: "PurchaseRequest",
            entidade_destino_id: pr.id,
          });
        }
        if (xmlIntake) {
          await base44.asServiceRole.entities.DocumentIntake.update(xmlIntake.id, {
            entidade_destino: "PurchaseRequest",
            entidade_destino_id: pr.id,
          });
        }
      }
    }

    console.log("Detectando inconsistencias...");
    const inconsistencias = [];

    for (const rubrica of rubricasAtualizadas_calculo) {
      if (rubrica.ativo && (rubrica.valor_utilizado || 0) > rubrica.valor_rubrica) {
        inconsistencias.push(
          `Rubrica "${rubrica.rubrica}": Utilizado R$ ${rubrica.valor_utilizado} > Total R$ ${rubrica.valor_rubrica}`
        );
      }
    }

    const semRubrica = solicitacoesValidas.filter(
      (pr) => !pr.rubrica_id && !duplicados.includes(pr.id)
    );
    if (semRubrica.length > 0) {
      inconsistencias.push(`${semRubrica.length} solicitacoes sem rubrica vinculada`);
    }

    const semArquivo = solicitacoesValidas.filter(
      (pr) => !pr.nota_fiscal_url && !pr.xml_url && !duplicados.includes(pr.id)
    );
    if (semArquivo.length > 0) {
      inconsistencias.push(`${semArquivo.length} solicitacoes sem PDF ou XML vinculado`);
    }

    const relatorio = {
      modo: operacao,
      data: new Date().toISOString(),
      usuario: user.email,
      resumo: {
        totalRubricasOficiais: RUBRICAS_OFICIAIS.length,
        somaRubricas: somaCalculada,
        rubricasCriadas,
        rubricasAtualizadas,
        rubricasDesativadas,
        solicitacoesAuditadas: solicitacoesValidas.length,
        duplicidadesEncontradas,
        duplicidadesCanceladas,
        arquivosPdfVinculados,
        arquivosXmlVinculados,
        inconsistenciasDetectadas: inconsistencias.length,
      },
      inconsistencias,
      avisos: dryRun ? ["Modo DRY-RUN: nenhuma alteracao foi aplicada"] : [],
    };

    console.log(`Auditoria concluida - Modo: ${operacao}`);
    return Response.json(relatorio);
  } catch (error) {
    console.error("Erro:", error);
    return Response.json(
      {
        erro: error instanceof Error ? error.message : "Erro desconhecido",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
});