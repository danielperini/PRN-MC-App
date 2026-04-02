import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      contractUrl,
      invoiceData,
      tolerance = 1.00,
      competenciaData
    } = await req.json();

    if (!contractUrl || !invoiceData) {
      return Response.json(
        { error: 'contractUrl e invoiceData são obrigatórios' },
        { status: 400 }
      );
    }

    // 1. Extrair dados do contrato
    const extractContract = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url: contractUrl,
      json_schema: {
        type: 'object',
        properties: {
          contratado_nome: { type: 'string' },
          contratado_cpf: { type: 'string' },
          contratado_cnpj: { type: 'string' },
          contratado_banco: { type: 'string' },
          contratado_agencia: { type: 'string' },
          contratado_conta: { type: 'string' },
          pix_key: { type: 'string' },
          objeto: { type: 'string' },
          data_inicio: { type: 'string' },
          data_fim: { type: 'string' },
          valor_parcela: { type: 'number' },
          numero_parcelas: { type: 'number' }
        }
      }
    }).catch(() => ({ status: 'error', output: {} }));

    const contractData = extractContract.status === 'success' ? extractContract.output : {};

    // 2. Preparar dados da NF
    const nf = invoiceData || {};
    const competenciaDate = competenciaData ? new Date(competenciaData) : new Date();

    // 3. Normalizar CPF/CNPJ (apenas dígitos)
    const normalizeCpfCnpj = (val) => (val || '').replace(/\D/g, '');

    const nfCpfCnpj = normalizeCpfCnpj(nf.fornecedor_cnpj);
    const contractCpfCnpj = normalizeCpfCnpj(
      contractData.contratado_cnpj || contractData.contratado_cpf || ''
    );

    // 4. Comparar identificação
    const comparacao = {
      nome_ou_empresa: { match: false, detalhes: '' },
      cpf_cnpj: { match: false, detalhes: '' },
      valor: { match: false, detalhes: '' },
      vigencia: { match: false, detalhes: '' },
      dados_bancarios: { match: false, detalhes: '' },
      objeto: { match: false, detalhes: '' }
    };

    const warnings = [];
    const critical_issues = [];

    // === NOME/EMPRESA ===
    const nfNome = (nf.fornecedor_nome || '').toLowerCase().trim();
    const contractNome = (contractData.contratado_nome || '').toLowerCase().trim();

    if (nfNome && contractNome) {
      const match = nfNome === contractNome ||
                   nfNome.includes(contractNome) ||
                   contractNome.includes(nfNome);
      comparacao.nome_ou_empresa = {
        match,
        detalhes: match ? 'Nomes compatíveis' : `Divergência: NF="${nf.fornecedor_nome}" vs Contrato="${contractData.contratado_nome}"`
      };
      if (!match && nfNome && contractNome) {
        warnings.push(`Nome do fornecedor não corresponde exatamente ao contrato`);
      }
    } else {
      comparacao.nome_ou_empresa = {
        match: false,
        detalhes: 'Dados insuficientes para comparação'
      };
    }

    // === CPF/CNPJ ===
    if (nfCpfCnpj && contractCpfCnpj) {
      const match = nfCpfCnpj === contractCpfCnpj;
      comparacao.cpf_cnpj = {
        match,
        detalhes: match ? 'CPF/CNPJ compatível' : `Divergência crítica: NF="${nfCpfCnpj}" vs Contrato="${contractCpfCnpj}"`
      };
      if (!match) {
        critical_issues.push('CPF/CNPJ da NF não corresponde ao contrato');
      }
    } else if (contractCpfCnpj) {
      comparacao.cpf_cnpj = {
        match: false,
        detalhes: 'CPF/CNPJ não extraído da NF'
      };
      warnings.push('CPF/CNPJ não encontrado na NF');
    }

    // === VALOR ===
    const nfValor = parseFloat(nf.valor_total) || 0;
    const contractValor = parseFloat(contractData.valor_parcela) || 0;

    if (nfValor && contractValor) {
      const diff = Math.abs(nfValor - contractValor);
      const match = diff <= tolerance;
      comparacao.valor = {
        match,
        detalhes: match
          ? `Valor compatível: R$ ${nfValor.toFixed(2)}`
          : `Divergência crítica: NF=R$ ${nfValor.toFixed(2)} vs Contrato=R$ ${contractValor.toFixed(2)}`
      };
      if (!match) {
        critical_issues.push(`Valor divergente (diferença: R$ ${diff.toFixed(2)})`);
      }
    } else if (contractValor) {
      comparacao.valor = {
        match: false,
        detalhes: `Valor não extraído da NF`
      };
      warnings.push('Valor não encontrado na NF');
    }

    // === VIGÊNCIA ===
    let vigenciaMatch = true;
    let vigenciaDetails = '';

    if (contractData.data_inicio && contractData.data_fim) {
      const inicio = new Date(contractData.data_inicio);
      const fim = new Date(contractData.data_fim);

      if (competenciaDate >= inicio && competenciaDate <= fim) {
        vigenciaDetails = `Dentro do período (${contractData.data_inicio} a ${contractData.data_fim})`;
      } else {
        vigenciaMatch = false;
        vigenciaDetails = `Fora da vigência: competência em ${competenciaDate.toLocaleDateString('pt-BR')} vs período ${contractData.data_inicio} a ${contractData.data_fim}`;
        critical_issues.push('Nota Fiscal fora do período de vigência do contrato');
      }
    } else {
      vigenciaDetails = 'Datas de vigência não encontradas no contrato';
      warnings.push('Não foi possível validar vigência do contrato');
    }

    comparacao.vigencia = {
      match: vigenciaMatch,
      detalhes: vigenciaDetails
    };

    // === DADOS BANCÁRIOS ===
    const nfBanco = (nf.banco_nome || '').toLowerCase().trim();
    const nfConta = (nf.banco_conta || '').trim();
    const nfPix = (nf.banco_pix || '').toLowerCase().trim();

    const contractBanco = (contractData.contratado_banco || '').toLowerCase().trim();
    const contractConta = (contractData.contratado_conta || '').trim();
    const contractPix = (contractData.pix_key || '').toLowerCase().trim();

    let bancarioMatch = true;
    let bancarioDetails = '';

    if (nfPix && contractPix) {
      if (nfPix === contractPix) {
        bancarioDetails = 'PIX compatível';
      } else {
        bancarioMatch = false;
        bancarioDetails = `Divergência: PIX da NF não corresponde ao contrato`;
        warnings.push('Chave PIX não corresponde à registrada no contrato');
      }
    } else if (nfBanco && contractBanco) {
      if (nfBanco.includes(contractBanco) || contractBanco.includes(nfBanco)) {
        if (nfConta && contractConta && nfConta === contractConta) {
          bancarioDetails = `Banco e conta compatíveis`;
        } else if (nfConta && contractConta) {
          bancarioMatch = false;
          bancarioDetails = `Conta divergente: NF="${nfConta}" vs Contrato="${contractConta}"`;
          warnings.push('Número da conta não corresponde ao contrato');
        } else {
          bancarioDetails = `Banco compatível`;
        }
      } else {
        bancarioMatch = false;
        bancarioDetails = `Banco divergente: NF="${nf.banco_nome}" vs Contrato="${contractData.contratado_banco}"`;
        warnings.push('Banco não corresponde ao contrato');
      }
    } else if (contractBanco) {
      bancarioDetails = 'Dados bancários não extraídos da NF';
      warnings.push('Dados bancários não encontrados na NF para comparação');
    } else {
      bancarioDetails = 'Dados bancários não encontrados no contrato';
    }

    comparacao.dados_bancarios = {
      match: bancarioMatch,
      detalhes: bancarioDetails
    };

    // === OBJETO/DESCRIÇÃO ===
    const nfDescricao = (nf.descricao_servico || '').toLowerCase().trim();
    const contractObjeto = (contractData.objeto || '').toLowerCase().trim();

    let objetoMatch = true;
    let objetoDetails = '';

    if (nfDescricao && contractObjeto) {
      // Comparar semanticamente (palavras-chave)
      const nfWords = nfDescricao.split(/\s+/).filter(w => w.length > 3);
      const contractWords = contractObjeto.split(/\s+/).filter(w => w.length > 3);
      const commonWords = nfWords.filter(w => contractWords.some(cw => cw.includes(w) || w.includes(cw)));

      if (commonWords.length >= Math.min(nfWords.length, contractWords.length) * 0.5) {
        objetoMatch = true;
        objetoDetails = 'Serviços semanticamente compatíveis';
      } else {
        objetoMatch = false;
        objetoDetails = `Possível divergência semântica entre descrições`;
        warnings.push('Descrição do serviço pode não corresponder exatamente ao contrato');
      }
    } else if (contractObjeto) {
      objetoDetails = 'Descrição não extraída da NF';
    }

    comparacao.objeto = {
      match: objetoMatch,
      detalhes: objetoDetails
    };

    // === DECISÃO FINAL ===
    const canSubmit = critical_issues.length === 0;
    let status = 'ok';
    if (critical_issues.length > 0) status = 'divergente';
    else if (warnings.length > 0) status = 'alerta';

    const summary = `Cruzamento contrato vs NF concluído: ${critical_issues.length} divergências críticas, ${warnings.length} alertas.`;

    return Response.json({
      success: true,
      status,
      can_submit: canSubmit,
      summary,
      warnings,
      critical_issues,
      comparacao,
      contract_data: contractData,
      invoice_data: nf,
      mensagem: status === 'ok'
        ? '✅ Documentos compatíveis. Prosseguir com aprovação.'
        : status === 'alerta'
        ? '⚠️ Alertas encontrados. Recomenda-se revisar antes de aprovar.'
        : '❌ Divergências críticas encontradas. Bloquear aprovação/pagamento.'
    });
  } catch (error) {
    console.error('Erro na validação cruzada:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});