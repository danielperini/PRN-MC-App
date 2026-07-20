import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FIXED_EMAILS = ['adm@viadutodasartes.org.br', 'josianeamancio@viadutodasartes.org.br', 'danielperini.mc@viadutodasartes.org.br'];

const TOMADOR_VIADUTO = {
  nome: 'VIADUTO DAS ARTES',
  cnpj: '23843648000125',
  inscricao: ['0745690001', '0.745.690/001-X'],
  email: 'viadutodasartes@viadutodasartes.org.br',
};

// Detecta se é Noturno Pampulha / Noturno 2026
function isNoturno(purchase) {
  const cc = String(purchase?.centro_custo || '').toLowerCase();
  const desc = String(purchase?.descricao_item || purchase?.observacoes || '').toLowerCase();
  const rubNome = String(purchase?.rubrica_nome || '').toLowerCase();
  return cc.includes('pampulha') || cc.includes('noturno') ||
    desc.includes('pampulha') || desc.includes('noturno') || desc.includes('kubitschek') || desc.includes('casa do baile') ||
    rubNome.includes('pampulha') || rubNome.includes('noturno');
}

// Normaliza texto: remove acentos e coloca em minúsculas para comparação semântica
function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDescricaoEsperada(purchase, rubrica, mes, year) {
  if (isNoturno(purchase)) {
    const atividade = purchase?.descricao_item || '[DESCRIÇÃO DA ATIVIDADE]';
    const parcela = purchase?.numero_parcela || '1';
    const museu = purchase?.local_execucao || purchase?.museu || '[MUSEU/ESPAÇO]';
    const natureza = rubrica?.rubrica || rubrica?.nome || purchase?.categoria || '[NATUREZA/SERVIÇO]';
    return `Serviço de ${natureza} para Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC: ${atividade}, para a 11ª Edição do evento Noturno nos Museus (2026), no ${museu} - Parcela ${parcela}.`;
  }
  const natureza = rubrica?.rubrica || rubrica?.nome || purchase?.categoria || '[NATUREZA_DESPESA]';
  return `Prestação de serviço ${natureza} Museus Centro - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC: Referente a ${mes} ${year}`;
}

// Verifica se a descrição do Noturno é semanticamente válida.
function descricaoNoturnoValida(desc) {
  const d = norm(desc);
  const temProjeto = d.includes('museus centro');
  const temTermo = d.includes('01-031.069/24-80') || d.includes('termo de colaboracao');
  const temParceria = d.includes('smc') || d.includes('fmc');
  const temNoturno = d.includes('noturno nos museu') || d.includes('noturno 2026') ||
    d.includes('noturno nos museus') || d.includes('11a edicao') || d.includes('11ª edicao');
  const temParcela = d.includes('parcela');
  const temMuseu = true;
  return { temProjeto, temTermo, temParceria, temNoturno, temParcela, temMuseu };
}

// Verifica se a descrição Museus Centro é válida
function descricaoMuseosValida(desc) {
  const d = norm(desc);
  return (d.includes('museus centro') || d.includes('projeto museus')) &&
    (d.includes('01-031.069/24-80') || d.includes('termo de colaboracao'));
}

// Verifica se o tomador é o Viaduto das Artes (tolerante)
function tomadorViadutoValido(cnpjTomador, nomeTomador) {
  const cnpjLimpo = String(cnpjTomador || '').replace(/\D/g, '');
  if (cnpjLimpo && cnpjLimpo === TOMADOR_VIADUTO.cnpj) return true;
  const nomeNorm = norm(nomeTomador || '');
  return nomeNorm.includes('viaduto das artes') || nomeNorm.includes('viaduto');
}

function validarConformidadeNF(purchase, rubrica) {
  const erros = [];
  const alertas = [];
  const nfDescricaoRaw = String(purchase?.nf_descricao || purchase?.observacoes || purchase?.descricao_item || '');
  const noturno = isNoturno(purchase);
  const mes = mesExtenso(purchase?.nf_data_emissao || purchase?.created_date);
  const year = ano(purchase?.nf_data_emissao || purchase?.created_date);

  // === 1. VALIDAR TOMADOR ===
  const cnpjTomador = String(purchase?.nf_destinatario_cpf_cnpj || purchase?.tomador_cnpj || '').replace(/\D/g, '');
  const nomeTomador = String(purchase?.nf_destinatario_nome || purchase?.tomador_nome || '');
  if (cnpjTomador || nomeTomador) {
    if (!tomadorViadutoValido(cnpjTomador, nomeTomador)) {
      erros.push(
        `Tomador da nota não corresponde ao Viaduto das Artes. ` +
        `Encontrado: "${nomeTomador || cnpjTomador}". ` +
        `Esperado: VIADUTO DAS ARTES · CNPJ 23.843.648/0001-25`
      );
    }
  }

  // === 2. VALIDAR DESCRIÇÃO ===
  if (noturno) {
    const check = descricaoNoturnoValida(nfDescricaoRaw);
    const faltando = [];
    if (!check.temProjeto) faltando.push('"Museus Centro"');
    if (!check.temTermo) faltando.push('"Termo de Colaboração 01-031.069/24-80"');
    if (!check.temParceria) faltando.push('"parceria com SMC/FMC"');
    if (!check.temNoturno) faltando.push('"Noturno nos Museus (2026)"');
    if (!check.temParcela) faltando.push('"Parcela N"');
    if (!check.temMuseu) faltando.push('nome do museu/espaço');

    if (faltando.length > 0) {
      erros.push(
        `Descrição da NF (Noturno) está incompleta. Faltando: ${faltando.join(', ')}. ` +
        `A descrição deve conter: Projeto Museus Centro, Termo 01-031.069/24-80, SMC/FMC, referência ao Noturno nos Museus (2026) e número da parcela.`
      );
    }
    const d = norm(nfDescricaoRaw);
    if (!d.includes('funemp') && !d.includes('056/2023')) {
      alertas.push('Opcional: A descrição pode incluir "Despesa paga com recursos oriundos da contrapartida do FUNEMP - Convênio MP CULTURA NA CIDADE Nº 056/2023".');
    }
  } else {
    if (!descricaoMuseosValida(nfDescricaoRaw)) {
      erros.push(
        `Descrição da NF não segue o padrão Museus Centro. ` +
        `Deve conter "Museus Centro - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC: Referente a ${mes} ${year}".`
      );
    }
  }

  const xmlUrl = purchase?.nota_fiscal_xml_url || purchase?.xml_url || purchase?.nf_xml_url;
  if (!xmlUrl) {
    alertas.push('XML da nota fiscal não anexado (recomendado).');
  }

  const score = Math.max(1, 10 - erros.length * 3);
  const descricaoSugerida = buildDescricaoEsperada(purchase, rubrica, mes, year);
  return { erros, alertas, score, descricaoSugerida, noturno };
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mesExtenso(dateValue) {
  const meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const d = dateValue ? new Date(dateValue) : new Date();
  const month = d.getMonth();
  return meses[Number.isFinite(month) ? month : new Date().getMonth()] || 'Mes';
}

function ano(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;

  try {
    user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body_req = await req.json();
    const { purchaseId, action = 'send_approval' } = body_req;
    if (!purchaseId) return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id).catch(() => null)
      : null;

    const valor = toNumber(
      purchase?.valor_pago || purchase?.valor_aprovado || purchase?.valor_aprovado_admin || purchase?.valor_solicitado
    );

    // Verificar conformidade
    const conformidade = validarConformidadeNF(purchase, rubrica);

    // Se action = 'check_only', retornar apenas o resultado da conformidade
    if (action === 'check_only') {
      return Response.json({ success: true, conformidade });
    }

    // SEMPRE usar apenas a fila - não enviar email imediato
    // O email será enviado nos lotes agendados (09:30 e 16:45)
    try {
      const queueResult = await base44.functions.invoke('enqueuePurchaseNotification', { purchaseId });
      
      // Marcar solicitação como APROVADO_ADMIN (aguardando pagamento financeiro)
      try {
        await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
          status: 'APROVADO_ADMIN',
          aprov_admin_nome: user?.full_name || user?.email || 'Sistema',
          aprov_admin_data: new Date().toISOString().split('T')[0],
          aprov_admin_comentario: 'Aprovado e adicionado à fila de notificação.',
        });
      } catch (_) {}

      return Response.json({ 
        success: true, 
        message: 'Notificação adicionada à fila para envio no próximo lote (09:30 ou 16:45).',
        queueResult: queueResult?.data || queueResult,
        conformidade 
      });
    } catch (error) {
      console.error('Erro ao adicionar à fila:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

  } catch (e) {
    return Response.json({ error: e?.message || 'Erro ao processar notificação' }, { status: 500 });
  }
});