// 🔴 IMPORTANTE: TODO O ARQUIVO É IGUAL AO SEU
// 🔴 APENAS handleEnviar FOI ALTERADO

// ... (MANTÉM TODO SEU ARQUIVO EXATAMENTE IGUAL ATÉ A FUNÇÃO)

async function handleEnviar(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (sending) return;

  console.log('🚀 CLICK ENVIAR NF', { intakeId: intake?.id, form });

  const erros = validarEnvio();

  if (erros.length) {
    toast({
      title: 'Preencha campos obrigatórios',
      description: erros.join(', '),
      variant: 'destructive',
      duration: 5000,
    });
    return;
  }

  setSending(true);

  try {
    const valor = parseValorBR(form.nf_valor_total);
    const rateioCalculado = getRateioCalculado();
    const destinoEquipe = isPagamentoEquipe(form, intake);
    const rubricaNome = getRubricaNome(form.rubrica_id);

    toast({
      title: 'Enviando solicitação...',
      description: destinoEquipe
        ? 'A nota será enviada para Pagamentos da Equipe.'
        : 'A nota será enviada para Solicitações.',
      duration: 2500,
    });

    const payload = {
      intakeId: intake.id,
      form: {
        ...form,
        nf_valor_total: valor,
        valor,
        valor_total: valor,
        tipo_pagamento: destinoEquipe ? 'equipe' : 'compra',
        destino_aprovacao: destinoEquipe ? 'equipe' : 'solicitacao',
        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,
        rateio_museus: form.tipo_rateio === 'dividido' ? rateioCalculado : [],
        museus_rateio: form.tipo_rateio === 'dividido' ? form.museus_rateio : [],
      },
    };

    console.log('📡 INVOKE enviarNotaParaAprovacao', payload);

    // 🔥 FIX PRINCIPAL (ANTI-TRAVAMENTO)
    const response = await Promise.race([
      base44.functions.invoke('enviarNotaParaAprovacao', payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout ao enviar (backend não respondeu)')), 12000)
      ),
    ]);

    console.log('📥 RESPONSE enviarNotaParaAprovacao:', response);

    const result = response?.data || response;

    if (!result) {
      throw new Error('Sem resposta da function enviarNotaParaAprovacao.');
    }

    if (result?.success === false) {
      throw new Error(result?.error || result?.message || 'Falha ao enviar nota.');
    }

    toast({
      title: destinoEquipe
        ? '✅ Enviado para Pagamentos da Equipe'
        : '✅ Solicitação enviada',
      description: destinoEquipe
        ? 'Disponível em Compras → Pagamentos da Equipe.'
        : 'Disponível em Compras → Solicitações.',
      duration: 7000,
    });

    await onSaved?.();
    onClose?.();

    return result;

  } catch (e) {
    console.error('❌ ERRO AO ENVIAR NF:', e);

    toast({
      title: 'Erro ao enviar solicitação',
      description: e?.message || 'Falha ao enviar para aprovação.',
      variant: 'destructive',
      duration: 9000,
    });
  } finally {
    setSending(false); // 🔴 ESSENCIAL
  }
}

// ... (RESTO DO ARQUIVO PERMANECE EXATAMENTE IGUAL)
