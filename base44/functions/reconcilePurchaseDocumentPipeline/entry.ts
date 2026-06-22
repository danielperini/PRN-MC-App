import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas administradores e coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const modoPrevia = body.modo !== 'corrigir'; // default: preview

    const resultado = {
      modo: modoPrevia ? 'PREVIA' : 'CORRECAO',
      documentIntake_total: 0,
      purchaseRequest_total: 0,
      docs_sem_solicitacao: 0,
      solics_sem_documento: 0,
      solics_invisiveis_aprovacao: 0,
      docs_duplicados: 0,
      solics_duplicadas: 0,
      nfs_duplicadas: 0,
      backups_ausentes: 0,
      debitos_ausentes: 0,
      debitos_duplicados: 0,
      referencias_quebradas: 0,
      vinculos_criados: 0,
      estados_corrigidos: 0,
      solics_criadas: 0,
      correcoes: [],
      erros: [],
    };

    // 1. Carregar todos os DocumentIntake ativos
    const allIntakes = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) { hasMore = false; break; }
      allIntakes.push(...batch.filter(d => d.status_registro !== 'REMOVIDO'));
      skip += 500;
      if (batch.length < 500) hasMore = false;
    }
    resultado.documentIntake_total = allIntakes.length;

    // 2. Carregar todas as PurchaseRequest
    const allPurchases = [];
    skip = 0;
    hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) { hasMore = false; break; }
      allPurchases.push(...batch);
      skip += 500;
      if (batch.length < 500) hasMore = false;
    }
    resultado.purchaseRequest_total = allPurchases.length;

    // Índices rápidos
    const purchaseByIntakeId = new Map();
    const purchaseByEntidadeId = new Map();
    for (const p of allPurchases) {
      const di = p.documento_intake_id || p.intake_id || '';
      if (di) purchaseByIntakeId.set(di, p);
      const edi = p.entidade_destino_id || '';
      if (edi) purchaseByEntidadeId.set(edi, p);
    }

    const intakeById = new Map();
    for (const d of allIntakes) {
      if (d.id) intakeById.set(d.id, d);
    }

    // 3. DocumentIntake sem PurchaseRequest
    const tiposValidos = ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'DOCUMENTO_ADMINISTRATIVO', 'CONTRATO', 'RECIBO_PDF', 'PENDENTE'];
    for (const doc of allIntakes) {
      if (!tiposValidos.includes(doc.tipo_detectado)) continue;
      if (doc.status_processamento === 'DELETADO' || doc.status_processamento === 'REJEITADO') continue;

      const temPurchase =
        purchaseByIntakeId.has(doc.id) ||
        purchaseByEntidadeId.has(doc.id) ||
        (doc.entidade_destino === 'PurchaseRequest' && doc.entidade_destino_id);

      if (!temPurchase) {
        resultado.docs_sem_solicitacao++;
        resultado.correcoes.push({
          tipo: 'DOC_SEM_SOLICITACAO',
          documentIntakeId: doc.id,
          file_name: doc.file_name_original || doc.file_name_final || '(sem nome)',
          tipo_detectado: doc.tipo_detectado,
          status: doc.status_processamento,
        });
      }
    }

    // 4. PurchaseRequest sem DocumentIntake
    for (const p of allPurchases) {
      const di = p.documento_intake_id || p.intake_id || '';
      const edi = p.entidade_destino_id || '';

      if (!di && !edi) {
        resultado.solics_sem_documento++;
        resultado.correcoes.push({
          tipo: 'SOLIC_SEM_DOCUMENTO',
          purchaseId: p.id,
          descricao: p.descricao_item || '(sem descrição)',
          status: p.status,
        });
        continue;
      }

      // Referência quebrada: tem ID mas documento não existe
      if (di && !intakeById.has(di)) {
        resultado.referencias_quebradas++;
        resultado.correcoes.push({
          tipo: 'REFERENCIA_QUEBRADA',
          purchaseId: p.id,
          documentoIntakeId: di,
          descricao: p.descricao_item || '(sem descrição)',
        });
      }
    }

    // 5. Solicitações invisíveis em aprovações (status pendente mas não aparecem)
    const statusPendentes = ['SOLICITADO', 'PENDENTE', 'PENDENTE_APROVACAO', 'AGUARDANDO_APROVACAO',
      'EM_ANALISE', 'DOCUMENTO_PROCESSADO', 'NOTA_VERIFICADA', 'PRONTO_PARA_APROVACAO',
      'ENVIADO', 'ENVIADO_APROVACAO', 'RASCUNHO', 'ANALISANDO_IA', 'AGUARDANDO_REVISAO'];
    for (const p of allPurchases) {
      const s = String(p.status || '').toUpperCase().trim();
      if (statusPendentes.includes(s) && !p.rubrica_id && !p.budgetline_id) {
        resultado.solics_invisiveis_aprovacao++;
      }
    }

    // 6. Detectar duplicidades (NF mesma chave)
    const nfKeys = new Map();
    for (const p of allPurchases) {
      const cnpj = String(p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
      const nfNum = String(p.nf_numero || '').trim();
      if (!cnpj || !nfNum) continue;
      const key = `${cnpj}:${nfNum}`;
      const existing = nfKeys.get(key);
      if (existing) {
        resultado.nfs_duplicadas++;
        resultado.correcoes.push({
          tipo: 'NF_DUPLICADA',
          purchaseId1: existing.id,
          purchaseId2: p.id,
          chave: key,
        });
      } else {
        nfKeys.set(key, p);
      }
    }

    // 7. Aprovados sem backup no Drive
    for (const p of allPurchases) {
      const s = String(p.status || '').toUpperCase().trim();
      if (['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(s)) {
        if (!p.drive_backup_status || p.drive_backup_status === 'pendente') {
          resultado.backups_ausentes++;
        }
        if (p.rubrica_id && !p.rubrica_debitada_em) {
          resultado.debitos_ausentes++;
        }
      }
    }

    // 8. EXECUTAR CORREÇÕES (apenas se modo !== 'previa')
    if (!modoPrevia) {
      // Criar PurchaseRequest para DocumentIntake órfãos
      for (const c of resultado.correcoes.filter(c => c.tipo === 'DOC_SEM_SOLICITACAO')) {
        try {
          const doc = intakeById.get(c.documentIntakeId);
          if (!doc) continue;

          const valor = doc.nf_valor_total || 0;
          const created = await base44.asServiceRole.entities.PurchaseRequest.create({
            descricao_item: doc.file_name_original || 'Documento da Entrada Única',
            fornecedor_nome: doc.nf_emitente_nome || doc.fornecedor_nome || 'Fornecedor não informado',
            fornecedor_cnpj: doc.nf_emitente_cpf_cnpj || doc.fornecedor_cpf_cnpj || '',
            nf_numero: doc.nf_numero || '',
            nf_valor_total: valor,
            valor_solicitado: valor,
            valor_total: valor,
            nf_emitente_nome: doc.nf_emitente_nome || '',
            nf_emitente_cpf_cnpj: doc.nf_emitente_cpf_cnpj || '',
            documento_intake_id: doc.id,
            intake_id: doc.id,
            entidade_destino_id: doc.id,
            origem: 'EntradaUnica',
            tipo_origem: 'ENTRADA_UNICA',
            status: 'SOLICITADO',
            file_url: doc.arquivo_original_url || '',
            arquivo_url: doc.arquivo_original_url || '',
            documento_url: doc.arquivo_original_url || '',
            centro_custo: doc.centro_custo || '',
            rubrica_id: doc.rubrica_id_sugerida || '',
            rubrica_nome: doc.rubrica_nome_sugerida || '',
            user_email: doc.user_email || '',
          });

          await base44.asServiceRole.entities.DocumentIntake.update(doc.id, {
            entidade_destino: 'PurchaseRequest',
            entidade_destino_id: created.id,
            status_processamento: 'ENVIADO_APROVACAO',
          });

          resultado.solics_criadas++;
          resultado.vinculos_criados++;
        } catch (err) {
          resultado.erros.push({
            tipo: 'CRIAR_SOLICITACAO',
            documentIntakeId: c.documentIntakeId,
            erro: err?.message || 'Erro desconhecido',
          });
        }
      }

      // Corrigir estados inconsistentes
      for (const p of allPurchases) {
        try {
          const s = String(p.status || '').toUpperCase().trim();
          // Se tem rubrica debitada mas status não é aprovado
          if (p.rubrica_debitada_em && !['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(s)) {
            await base44.asServiceRole.entities.PurchaseRequest.update(p.id, {
              status: 'APROVADO_COORD',
            });
            resultado.estados_corrigidos++;
          }
        } catch (err) {
          resultado.erros.push({
            tipo: 'CORRIGIR_ESTADO',
            purchaseId: p.id,
            erro: err?.message || 'Erro desconhecido',
          });
        }
      }
    }

    return Response.json(resultado);
  } catch (error) {
    console.error('reconcilePurchaseDocumentPipeline error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});