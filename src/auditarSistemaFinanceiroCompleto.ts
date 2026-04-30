import { base44 } from '@/api/base44Client';

interface AuditResult {
  rubricasAtualizadas: number;
  solicitacoesConsertadas: number;
  duplicidadesRemovidas: number;
  documentsInconsistentes: number;
  xmlPdfVinculados: number;
  estornosProcessados: number;
  relatorio: string[];
}

export async function auditarSistemaFinanceiroCompleto(): Promise<AuditResult> {
  const resultado: AuditResult = {
    rubricasAtualizadas: 0,
    solicitacoesConsertadas: 0,
    duplicidadesRemovidas: 0,
    documentsInconsistentes: 0,
    xmlPdfVinculados: 0,
    estornosProcessados: 0,
    relatorio: []
  };

  try {
    resultado.relatorio.push('=== INICIANDO AUDITORIA FINANCEIRA ===');

    // PASSO 1: RECONCILIAR RUBRICAS
    resultado.relatorio.push('\n[1] Reconciliando Rubricas...');
    await reconciliarRubricas(resultado);

    // PASSO 2: DETECTAR SOLICITAÇÕES SEM RUBRICA
    resultado.relatorio.push('\n[2] Detectando Solicitações sem Rubrica...');
    await detectarSolicitacoesSemRubrica(resultado);

    // PASSO 3: DETECTAR RUBRICA ERRADA
    resultado.relatorio.push('\n[3] Detectando Rubricas Incompatíveis...');
    await detectarRubricaErrada(resultado);

    // PASSO 4: DETECTAR DUPLICIDADE
    resultado.relatorio.push('\n[4] Detectando Duplicidades de Solicitação...');
    await detectarDuplicidadeSolicitacao(resultado);

    // PASSO 5: DETECTAR DOCUMENTOS SEM SOLICITAÇÃO
    resultado.relatorio.push('\n[5] Detectando Documentos sem Solicitação...');
    await detectarDocumentosSemSolicitacao(resultado);

    // PASSO 6: DETECTAR XML/PDF NÃO VINCULADOS
    resultado.relatorio.push('\n[6] Vinculando XML/PDF...');
    await vincularXmlPdf(resultado);

    // PASSO 7: DETECTAR ARQUIVOS DUPLICADOS
    resultado.relatorio.push('\n[7] Detectando Arquivos Duplicados...');
    await detectarArquivosDuplicados(resultado);

    // PASSO 8: ESTORNO AUTOMÁTICO
    resultado.relatorio.push('\n[8] Processando Estornos...');
    await processarEstornos(resultado);

    // PASSO 9: GARANTIR CONSISTÊNCIA FINAL
    resultado.relatorio.push('\n[9] Validando Consistência Final...');
    await garantirConsistenciaFinal(resultado);

    resultado.relatorio.push('\n=== AUDITORIA CONCLUÍDA ===');
    resultado.relatorio.push(`✓ Rubricas atualizadas: ${resultado.rubricasAtualizadas}`);
    resultado.relatorio.push(`✓ Solicitações corrigidas: ${resultado.solicitacoesConsertadas}`);
    resultado.relatorio.push(`✓ Duplicidades removidas: ${resultado.duplicidadesRemovidas}`);
    resultado.relatorio.push(`✓ Documentos inconsistentes: ${resultado.documentsInconsistentes}`);
    resultado.relatorio.push(`✓ XML/PDF vinculados: ${resultado.xmlPdfVinculados}`);
    resultado.relatorio.push(`✓ Estornos processados: ${resultado.estornosProcessados}`);

    return resultado;
  } catch (error) {
    resultado.relatorio.push(`❌ ERRO: ${error.message}`);
    return resultado;
  }
}

async function reconciliarRubricas(resultado: AuditResult) {
  try {
    const rubricas = await base44.entities.Rubrica.list();
    
    for (const rubrica of rubricas) {
      const statusValidos = ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];
      
      const compras = await base44.entities.PurchaseRequest.filter({
        rubrica_id: rubrica.id,
        status: { $in: statusValidos }
      });

      const somaUtilizado = compras.reduce((sum, c) => {
        return sum + (c.valor_solicitado || c.valor_total || c.valor || 0);
      }, 0);

      const saldo = rubrica.valor_total - somaUtilizado;
      const percentual = (somaUtilizado / rubrica.valor_total) * 100;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: somaUtilizado,
        saldo: saldo,
        saldo_real: saldo,
        percentual_utilizado: percentual
      });

      resultado.rubricasAtualizadas++;
      resultado.relatorio.push(`  ✓ ${rubrica.nome}: ${somaUtilizado}/${rubrica.valor_total}`);
    }
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function detectarSolicitacoesSemRubrica(resultado: AuditResult) {
  try {
    const compras = await base44.entities.PurchaseRequest.list();
    
    for (const compra of compras) {
      if (!compra.rubrica_id) {
        await base44.entities.PurchaseRequest.update(compra.id, {
          status_auditoria: 'INCONSISTENTE_SEM_RUBRICA'
        });
        
        resultado.solicitacoesConsertadas++;
        resultado.relatorio.push(`  ⚠️ ${compra.id} marcada como inconsistente (sem rubrica)`);
      }
    }
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function detectarRubricaErrada(resultado: AuditResult) {
  try {
    const compras = await base44.entities.PurchaseRequest.list();
    const rubricas = await base44.entities.Rubrica.list();
    
    for (const compra of compras) {
      if (!compra.rubrica_id) continue;
      
      const rubricaAtual = rubricas.find(r => r.id === compra.rubrica_id);
      if (!rubricaAtual) continue;

      // Verificar compatibilidade simples
      let rubricaCorreta = rubricaAtual;
      
      if (compra.centro_custo && !rubricaAtual.centro_custo?.includes(compra.centro_custo)) {
        // Procurar rubrica correta
        rubricaCorreta = rubricas.find(r => 
          r.centro_custo?.includes(compra.centro_custo) &&
          r.tipo_gasto === compra.tipo_gasto
        ) || rubricaAtual;
      }

      if (rubricaCorreta.id !== compra.rubrica_id) {
        const valor = compra.valor_solicitado || compra.valor_total || 0;
        
        // Estornar da rubrica antiga
        await base44.entities.Rubrica.update(rubricaAtual.id, {
          valor_utilizado: Math.max(0, (rubricaAtual.valor_utilizado || 0) - valor)
        });

        // Debitar na rubrica correta
        await base44.entities.PurchaseRequest.update(compra.id, {
          rubrica_id: rubricaCorreta.id
        });

        resultado.solicitacoesConsertadas++;
        resultado.relatorio.push(`  ✓ ${compra.id} movida para rubrica correta`);
      }
    }
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function detectarDuplicidadeSolicitacao(resultado: AuditResult) {
  try {
    const compras = await base44.entities.PurchaseRequest.list();
    const processados = new Set<string>();

    for (const compra of compras) {
      if (processados.has(compra.id)) continue;

      const duplicadas = compras.filter(c =>
        !processados.has(c.id) &&
        c.nf_numero === compra.nf_numero &&
        c.fornecedor === compra.fornecedor &&
        c.valor_total === compra.valor_total &&
        c.id !== compra.id
      );

      if (duplicadas.length > 0) {
        // Manter primeira, cancelar as outras
        for (const dup of duplicadas) {
          const valor = dup.valor_solicitado || dup.valor_total || 0;
          
          if (dup.rubrica_id) {
            const rubrica = await base44.entities.Rubrica.get(dup.rubrica_id);
            await base44.entities.Rubrica.update(dup.rubrica_id, {
              valor_utilizado: Math.max(0, (rubrica.valor_utilizado || 0) - valor)
            });
          }

          await base44.entities.PurchaseRequest.update(dup.id, {
            status: 'CANCELADO',
            rubrica_debitada_valor: 0
          });

          processados.add(dup.id);
          resultado.duplicidadesRemovidas++;
        }
      }

      processados.add(compra.id);
    }

    resultado.relatorio.push(`  ✓ ${resultado.duplicidadesRemovidas} duplicidades removidas`);
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function detectarDocumentosSemSolicitacao(resultado: AuditResult) {
  try {
    const intakes = await base44.entities.DocumentIntake.list();

    for (const intake of intakes) {
      if (!intake.entidade_destino || intake.entidade_destino !== 'PurchaseRequest') {
        resultado.documentsInconsistentes++;
        resultado.relatorio.push(`  ⚠️ ${intake.id} sem destino válido`);
        continue;
      }

      if (intake.entidade_destino_id) {
        try {
          await base44.entities.PurchaseRequest.get(intake.entidade_destino_id);
        } catch {
          resultado.documentsInconsistentes++;
          resultado.relatorio.push(`  ⚠️ ${intake.id} aponta para solicitação inexistente`);
        }
      }
    }
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function vincularXmlPdf(resultado: AuditResult) {
  try {
    const intakes = await base44.entities.DocumentIntake.list();
    const xmls = intakes.filter(i => i.tipo_detectado === 'NOTA_FISCAL_XML');

    for (const xml of xmls) {
      if (xml.nf_pdf_intake_id) continue; // Já vinculado

      // Procurar PDF correspondente
      const pdfs = intakes.filter(i => 
        i.tipo_detectado === 'NOTA_FISCAL_PDF' &&
        !i.nf_xml_intake_id
      );

      let melhorPdf = null;
      let melhorScore = 0;

      for (const pdf of pdfs) {
        let score = 0;

        // Nome arquivo
        if (xml.file_name_original?.includes(pdf.file_name_original?.split('.')[0])) {
          score += 3;
        }

        // Valor
        const xmlValor = xml.resultado_ia?.nf_valor_total || 0;
        const pdfValor = pdf.resultado_ia?.nf_valor_total || 0;
        if (Math.abs(xmlValor - pdfValor) < 1) {
          score += 2;
        }

        // Fornecedor
        if (xml.resultado_ia?.nf_emitente_nome === pdf.resultado_ia?.nf_emitente_nome) {
          score += 3;
        }

        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }

      if (melhorPdf && melhorScore >= 2) {
        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          nf_xml_intake_id: xml.id,
          grupo_status: 'COMPLETO'
        });

        await base44.entities.DocumentIntake.update(xml.id, {
          nf_pdf_intake_id: melhorPdf.id,
          grupo_status: 'COMPLETO',
          ocultar_entrada_unica: true
        });

        resultado.xmlPdfVinculados++;
        resultado.relatorio.push(`  ✓ XML ${xml.id} vinculado a PDF ${melhorPdf.id}`);
      }
    }
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function detectarArquivosDuplicados(resultado: AuditResult) {
  try {
    const intakes = await base44.entities.DocumentIntake.list();
    const processados = new Set<string>();

    for (const intake of intakes) {
      if (processados.has(intake.id)) continue;

      const duplicados = intakes.filter(i =>
        !processados.has(i.id) &&
        i.file_name_original === intake.file_name_original &&
        i.resultado_ia?.nf_valor_total === intake.resultado_ia?.nf_valor_total &&
        i.resultado_ia?.nf_emitente_nome === intake.resultado_ia?.nf_emitente_nome &&
        i.id !== intake.id
      );

      if (duplicados.length > 0) {
        for (const dup of duplicados) {
          await base44.entities.DocumentIntake.update(dup.id, {
            status_processamento: 'DELETADO',
            ocultar_entrada_unica: true
          });

          processados.add(dup.id);
          resultado.duplicidadesRemovidas++;
        }
      }

      processados.add(intake.id);
    }

    resultado.relatorio.push(`  ✓ Arquivos duplicados marcados`);
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function processarEstornos(resultado: AuditResult) {
  try {
    const compras = await base44.entities.PurchaseRequest.list();
    const intakes = await base44.entities.DocumentIntake.list();

    for (const compra of compras) {
      if (compra.status !== 'CANCELADO') continue;

      const temDocumento = intakes.some(i => i.entidade_destino_id === compra.id);

      if (!temDocumento && compra.rubrica_id) {
        const rubrica = await base44.entities.Rubrica.get(compra.rubrica_id);
        const valor = compra.valor_solicitado || compra.valor_total || 0;

        await base44.entities.Rubrica.update(compra.rubrica_id, {
          valor_utilizado: Math.max(0, (rubrica.valor_utilizado || 0) - valor)
        });

        resultado.estornosProcessados++;
      }
    }

    resultado.relatorio.push(`  ✓ ${resultado.estornosProcessados} estornos processados`);
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}

async function garantirConsistenciaFinal(resultado: AuditResult) {
  try {
    const compras = await base44.entities.PurchaseRequest.list();

    for (const compra of compras) {
      const statusValidos = ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];
      
      if (!statusValidos.includes(compra.status)) continue;

      const erros = [];
      if (!compra.rubrica_id) erros.push('sem_rubrica');
      if (!compra.valor_total && !compra.valor_solicitado) erros.push('sem_valor');

      const temDocumento = await base44.entities.DocumentIntake.list({
        entidade_destino_id: compra.id
      });

      if (temDocumento.length === 0 && compra.status === 'PAGO') {
        erros.push('sem_documento');
      }

      if (erros.length > 0) {
        await base44.entities.PurchaseRequest.update(compra.id, {
          status_auditoria: `INCONSISTENTE: ${erros.join(', ')}`
        });
      }
    }

    resultado.relatorio.push(`  ✓ Consistência final validada`);
  } catch (error) {
    resultado.relatorio.push(`  ❌ Erro: ${error.message}`);
  }
}