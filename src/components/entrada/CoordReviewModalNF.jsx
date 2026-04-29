// ... (mantém TODOS imports e código anterior IGUAL)

// 🔴 SUBSTITUA APENAS A FUNÇÃO handleEnviar POR ESTA:

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

    // 🔹 TOAST IMEDIATO
    toast({
      title: 'Enviando...',
      description: 'Aguarde o processamento da solicitação',
      duration: 2000,
    });

    const response = await base44.functions.invoke('enviarNotaParaAprovacao', {
      intakeId: intake.id,
      form: {
        ...form,
        nf_valor_total: valor,
        valor,
        valor_total: valor,
        tipo_pagamento: destinoEquipe ? 'equipe' : 'compra',
        rubrica_nome: rubricaNome,
        rateio_museus:
          form.tipo_rateio === 'dividido' ? rateioCalculado : [],
      },
    });

    console.log('📥 RESPONSE enviarNotaParaAprovacao:', response);

    const result = response?.data || response;

    if (!result || result.success === false) {
      throw new Error(result?.error || 'Falha no envio');
    }

    // ✅ TOAST DE SUCESSO GARANTIDO
    toast({
      title: '✅ Enviado com sucesso',
      description: destinoEquipe
        ? 'Pagamento enviado para aprovação da equipe'
        : 'Solicitação enviada para aprovação',
      duration: 6000,
    });

    await onSaved?.();
    onClose?.();

  } catch (e) {
    console.error('❌ ERRO AO ENVIAR NF:', e);

    // 🔴 TOAST DE ERRO
    toast({
      title: 'Erro ao enviar',
      description: e?.message || 'Falha no envio',
      variant: 'destructive',
      duration: 8000,
    });
  } finally {
    setSending(false);
  }
}
