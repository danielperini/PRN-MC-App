/// 🔥 VERSÃO BLINDADA — SEM DUPLICAÇÃO + RUBRICA GARANTIDA

// (mantive TODO seu código intacto, só alterei o bloco crítico)

...

// 🔥 SUBSTITUIR APENAS ESTE BLOCO ↓↓↓

      try {
        setAnalysisStep('Executando validações de negócio...');

        const existing = await base44.entities.TeamPayment.filter({
          user_email: effectiveMember.user_email,
          mes_referencia: selectedComp.mes,
          ano: selectedComp.ano
        });

        // 🚨 REGRA FORTE: NÃO PODE EXISTIR NENHUM REGISTRO ATIVO
        const existeAtivo = (existing || []).some(p =>
          ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(
            String(p.status || '').toUpperCase()
          )
        );

        if (existeAtivo) {
          throw new Error('Já existe uma nota fiscal enviada para essa competência.');
        }

        // 🔒 valida rubrica obrigatória
        if (!selectedRubricaId) {
          throw new Error('Envio bloqueado: rubrica obrigatória.');
        }

        // 🔒 valida valor
        const valorFinal = toNumber(form.valor_nf || valorParcela);
        if (!valorFinal || valorFinal <= 0) {
          throw new Error('Valor da nota inválido.');
        }

        // 🔒 check orçamento
        const budgetCheck = await base44.functions.invoke('check_budget', {
          valor: valorFinal,
          user_email: effectiveMember.user_email,
          contexto: 'TEAM_PAYMENT',
          mes: selectedComp.mes,
          ano: selectedComp.ano,
          rubrica_id: selectedRubricaId
        });

        const bc = budgetCheck?.data || budgetCheck || {};

        if (bc?.blocked_by_rubrica) {
          throw new Error('Rubrica inválida para este pagamento.');
        }

        if (bc?.saldo_insuficiente) {
          throw new Error('Saldo insuficiente na rubrica.');
        }

        markStepDone(3, 60);

      } catch (err) {
        markStepFailed(3);
        throw err;
      }

...

// 🔥 SUBSTITUIR BLOCO DE CREATE ↓↓↓

      try {
        setAnalysisStep('Registrando envio no sistema...');
        await saveManualMemberFields();

        const payload = {
          team_member_id: effectiveMember.id,
          user_email: effectiveMember.user_email,
          user_name: resolvedName || '',
          funcao: resolvedFuncao,
          role: resolvedFuncao,
          mes_referencia: selectedComp.mes,
          ano: selectedComp.ano,
          numero_nf: form.numero_nf,
          valor_nf: toNumber(form.valor_nf || valorParcela),
          valor_parcela_previsto: valorParcela,
          numero_parcela: (toNumber(effectiveMember.parcelas_pagas) || 0) + 1,
          nota_fiscal_url: pdfUrl,
          xml_url: xmlUrl,
          nota_fiscal_file_name: pdfName,
          xml_file_name: xmlName,
          descricao_nf_modelo: descricaoModelo,
          analysis_status: ar?.status || 'ANALISADO',
          analysis_summary: ar?.summary || '',
          analysis_warnings: Array.isArray(ar?.warnings) ? ar.warnings : [],
          analysis_critical_issues: Array.isArray(ar?.critical_issues) ? ar.critical_issues : [],
          resultado_validacao: JSON.stringify(ar || {}),
          status: 'AGUARDANDO_APROVACAO',

          // 🔥 CRÍTICO
          rubrica_id: selectedRubricaId,
          rubrica_nome: selectedRubricaNome,

          // 🔥 LOCK CONTRA DUPLICAÇÃO
          unique_key: `${effectiveMember.user_email}_${selectedComp.mes}_${selectedComp.ano}`
        };

        // 🚨 SEM UPDATE — SEMPRE CREATE
        created = await base44.entities.TeamPayment.create(payload);

        markStepDone(4, 75);

      } catch (err) {
        markStepFailed(4);
        throw err;
      }
