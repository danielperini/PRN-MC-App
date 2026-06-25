import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FIXED_EMAILS = ['notasfiscais@viadutodasartes.org.br', 'danielperini.mc@viadutodasartes.org.br', 'daniell@periniprojetos.com.br'];

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
// Aceita Modelo A (referência mensal), B (atividade no museu), C (serviço para atividade), D (profissional/função do evento).
// O museu/espaço é OPCIONAL — Modelo D (funções como Assistente de Produção, Educador, etc.) não precisa citar museu.
function descricaoNoturnoValida(desc) {
  const d = norm(desc);
  const temProjeto = d.includes('museus centro');
  const temTermo = d.includes('01-031.069/24-80') || d.includes('termo de colaboracao');
  const temParceria = d.includes('smc') || d.includes('fmc');
  // Noturno: aceitar com ou sem "(2026)" e variações como "noturno nos museu"
  const temNoturno = d.includes('noturno nos museu') || d.includes('noturno 2026') ||
    d.includes('noturno nos museus') || d.includes('11a edicao') || d.includes('11ª edicao');
  const temParcela = d.includes('parcela');
  // Museu/local é OPCIONAL — não bloquear se ausente (Modelo D não cita museu específico)
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
  // Só valida se houver dado de tomador preenchido na NF
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
        `A descrição deve conter: Projeto Museus Centro, Termo 01-031.069/24-80, SMC/FMC, referência ao Noturno nos Museus (2026) e número da parcela. ` +
        `O museu/espaço e o nome da atividade são recomendados mas não obrigatórios para funções de equipe.`
      );
    }
    // FUNEMP é opcional — não reprovar por ausência, apenas alertar
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

  // === 3. XML (alerta, não reprovação) ===
  const xmlUrl = purchase?.nota_fiscal_xml_url || purchase?.xml_url || purchase?.nf_xml_url;
  if (!xmlUrl) {
    alertas.push('XML da nota fiscal não anexado (recomendado).');
  }

  // Dados bancários são OPCIONAIS — não geram erro nem alerta

  // Score: começa em 10, desconta apenas por erros reais
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

function clean(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
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

function buildBaseName(purchase, rubrica, valor) {
  const numero = purchase?.nf_numero || purchase?.id || 'SN';
  const centro = clean(purchase?.centro_custo || 'Geral');
  const fornecedor = clean(purchase?.fornecedor_nome || 'Fornecedor');
  const natureza = clean(rubrica?.rubrica || rubrica?.nome || purchase?.categoria || 'Despesa');
  const mes = mesExtenso(purchase?.nf_data_emissao || purchase?.created_date);
  const year = ano(purchase?.nf_data_emissao || purchase?.created_date);
  return `${numero}-${centro}-${fornecedor}-${natureza}-MuseusCentro-${mes}-${year}-R$-${moeda(valor)}`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;

  try {
    user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body_req = await req.json();
    const { purchaseId, recipients = FIXED_EMAILS, action = 'send_approval', correction_recipients = [] } = body_req;
    if (!purchaseId) return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });

    // Sempre inclui os dois emails fixos além de qualquer recipient passado
    const finalRecipients = [...new Set(
      [...FIXED_EMAILS, ...(recipients || [])]
        .map((e) => String(e || '').trim())
        .filter((e) => e.includes('@'))
    )];

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id).catch(() => null)
      : null;

    const valor = toNumber(
      purchase?.valor_pago || purchase?.valor_aprovado || purchase?.valor_aprovado_admin || purchase?.valor_solicitado
    );

    const saldoAtual =
      toNumber(rubrica?.valor_rubrica || rubrica?.valor_total) -
      toNumber(rubrica?.valor_utilizado) -
      toNumber(rubrica?.saldo_comprometido);
    const saldoPosPagamento = saldoAtual - valor;

    // Declarar URLs antes de usar
    const pdfUrl = purchase?.nota_fiscal_pdf_url || purchase?.nota_fiscal_url;
    const xmlUrl = purchase?.nota_fiscal_xml_url || purchase?.xml_url;
    const compUrl = purchase?.comprovante_url;

    const appUrl = `https://museus-centro.base44-apps.com/Compras`;
    const nfDataFormatada = (() => {
      const d = purchase?.nf_data_emissao || purchase?.data_emissao_nf;
      if (!d) return '—';
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    })();

    const rubricaTexto = [rubrica?.grupo, rubrica?.rubrica || rubrica?.nome].filter(Boolean).join(' › ');
    const naturezaCodigo = rubrica?.natureza_despesa || purchase?.natureza_despesa || '';
    const naturezaNome = rubrica?.nome_natureza || '';
    const naturezaDisplay = naturezaCodigo
      ? `${naturezaCodigo}${naturezaNome ? ' — ' + naturezaNome : ''}`
      : (naturezaNome || '—');
    const projetoDisplay = 'Museus Centro — Termo de Colaboração 01-031.069/24-80, parceria SMC/FMC';
    const appComprovante = `https://museus-centro.base44-apps.com/Compras`;

    // Link da pasta de backup no Drive
    const driveFolderUrl = purchase?.drive_backup_folder_url || null;
    const driveFileLinks = (purchase?.drive_backup_files || [])
      .filter(f => f?.webViewLink || f?.url)
      .map(f => ({ name: f?.name || f?.filename || 'Arquivo', url: f?.webViewLink || f?.url }));

    // Helpers para HTML de documentos
    function docButton(label, url, color) {
      if (!url) return '';
      return `<a href="${url}" target="_blank" style="display:inline-block;margin:4px 6px 4px 0;padding:8px 16px;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">${label}</a>`;
    }

    const docButtons = [
      docButton('📄 Nota Fiscal PDF', pdfUrl, '#1a56db'),
      docButton('📋 XML da NF', xmlUrl, '#0e9f6e'),
      docButton('🧾 Comprovante de Pagamento', compUrl, '#7e3af2'),
      docButton('📎 Anexar Comprovante / Recibo', appComprovante, '#374151'),
    ].filter(Boolean).join('');

    const driveFileButtons = driveFileLinks.map(f =>
      `<a href="${f.url}" target="_blank" style="display:inline-block;margin:4px 6px 4px 0;padding:7px 14px;background:#f3f4f6;color:#374151;text-decoration:none;border-radius:6px;font-size:12px;border:1px solid #d1d5db;">📎 ${f.name}</a>`
    ).join('');

    const pagamentoSection = purchase?.detalhe_pagamento
      ? `<tr><td colspan="2" style="padding:12px 16px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Dados para Pagamento</div>
          <div style="font-size:14px;color:#111827;white-space:pre-line;">${purchase.detalhe_pagamento}</div>
         </td></tr>`
      : '';

    const body = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Projeto Museus Centro · Viaduto das Artes</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.3;">Pagamento Aprovado<br>Aguardando Processamento</div>
        </td>
        <td align="right" style="vertical-align:top;">
          <div style="background:#22c55e;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;white-space:nowrap;">✓ APROVADO</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#ffffff;padding:0;">

    <!-- Intro -->
    <div style="padding:24px 32px 8px;font-size:14px;color:#374151;line-height:1.6;">
      Uma solicitação de pagamento foi aprovada pela coordenação e está aguardando processamento financeiro.
    </div>

    <!-- Valor destaque -->
    <div style="margin:16px 32px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 24px;display:flex;align-items:center;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="font-size:12px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Valor da Nota Fiscal</div>
          <div style="font-size:32px;font-weight:800;color:#15803d;margin-top:4px;">R$ ${moeda(valor)}</div>
        </td>
        <td align="right" style="vertical-align:middle;">
          <div style="font-size:12px;color:#6b7280;">Saldo após pagamento</div>
          <div style="font-size:18px;font-weight:700;color:${saldoPosPagamento >= 0 ? '#15803d' : '#dc2626'};">R$ ${moeda(saldoPosPagamento)}</div>
        </td>
      </tr></table>
    </div>

    <!-- Dados da solicitação -->
    <div style="padding:8px 32px 4px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Dados da Solicitação</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;width:45%;border-bottom:1px solid #e5e7eb;">Fornecedor / Emissor</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '—'}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">CNPJ / CPF</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${purchase?.fornecedor_cnpj || purchase?.nf_emitente_cpf_cnpj || '—'}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Número da NF</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb;">${purchase?.nf_numero || '—'}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Data de Emissão</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${nfDataFormatada}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Centro de Custo</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${purchase?.centro_custo || '—'}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Rubrica Orçamentária</td>
          <td style="padding:11px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${rubricaTexto || '—'}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Natureza da Despesa</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${naturezaDisplay}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;">Projeto</td>
          <td style="padding:11px 16px;font-size:13px;color:#111827;">${projetoDisplay}</td>
        </tr>
        ${pagamentoSection}
      </table>
    </div>

    <!-- Documentos Fiscais -->
    <div style="padding:20px 32px 4px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Documentos Fiscais</div>
      ${docButtons || '<span style="color:#9ca3af;font-size:13px;">Nenhum arquivo anexado</span>'}
    </div>

    <!-- Backup no Drive -->
    ${driveFolderUrl || driveFileButtons ? `
    <div style="padding:16px 32px 4px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Backup no Google Drive</div>
      ${driveFolderUrl ? `<a href="${driveFolderUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#1967d2;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:8px;">
        <img src="https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" width="16" height="16" style="vertical-align:middle;" alt="Drive"/>
        Abrir Pasta no Drive
      </a><br>` : ''}
      ${driveFileButtons}
    </div>` : ''}

    <!-- CTA -->
    <div style="padding:24px 32px 28px;">
      <a href="${appUrl}" target="_blank" style="display:block;text-align:center;background:#111827;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Acessar Solicitação no Sistema →
      </a>
    </div>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
    <div style="font-size:12px;color:#9ca3af;">Coordenação · Museus Centro · Viaduto das Artes</div>
    <div style="font-size:11px;color:#d1d5db;margin-top:4px;">Esta é uma mensagem automática do sistema de gestão do projeto.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    // Verificar conformidade
    const conformidade = validarConformidadeNF(purchase, rubrica);

    // Se action = 'check_only', retornar apenas o resultado da conformidade
    if (action === 'check_only') {
      return Response.json({ success: true, conformidade });
    }

    const detalhes = [];
    let algumSucesso = false;
    let algumErro = false;

    if (action === 'request_correction') {
      // E-mail de correção para quem cadastrou e/ou emissor
      const correcaoRecipients = [...new Set(
        correction_recipients.map(e => String(e || '').trim()).filter(e => e.includes('@'))
      )];
      if (!correcaoRecipients.length) {
        return Response.json({ error: 'Nenhum destinatário de correção informado' }, { status: 400 });
      }

      const errosList = (conformidade.erros || []).map(e => `• ${e}`).join('\n');
      const correcaoSubject = `⚠️ Correção necessária em nota fiscal — Museus Centro`;
      const correcaoBody = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#b91c1c;border-radius:12px 12px 0 0;padding:28px 32px;">
    <div style="font-size:11px;color:#fca5a5;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Projeto Museus Centro · Viaduto das Artes</div>
    <div style="font-size:22px;color:#ffffff;font-weight:700;">⚠️ Correção Necessária na Nota Fiscal</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="color:#374151;font-size:14px;line-height:1.7;">Olá,<br><br>A nota fiscal cadastrada precisa de correção antes do processamento final.</p>

    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:18px 24px;margin:16px 0;">
      <div style="font-size:12px;color:#b91c1c;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Problemas Identificados</div>
      <div style="font-size:14px;color:#7f1d1d;white-space:pre-line;">${errosList || '• Verificar conformidade da nota fiscal'}</div>
    </div>

    <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin:16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="background:#f9fafb;"><td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;width:45%;">Centro de custo</td><td style="padding:10px 16px;font-size:14px;color:#111827;">${purchase?.centro_custo || '—'}</td></tr>
        <tr><td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;border-top:1px solid #e5e7eb;">Rubrica</td><td style="padding:10px 16px;font-size:13px;color:#111827;border-top:1px solid #e5e7eb;">${rubricaTexto || '—'}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;border-top:1px solid #e5e7eb;">Valor</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:700;border-top:1px solid #e5e7eb;">R$ ${moeda(valor)}</td></tr>
        <tr><td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;border-top:1px solid #e5e7eb;">Emissor</td><td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #e5e7eb;">${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '—'}</td></tr>
      </table>
    </div>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 24px;margin:16px 0;">
      <div style="font-size:12px;color:#15803d;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Descrição Correta Sugerida</div>
      <div style="font-size:13px;color:#166534;line-height:1.6;">${conformidade.descricaoSugerida}</div>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:18px 24px;margin:16px 0;">
      <div style="font-size:12px;color:#1d4ed8;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Dados do Tomador que Devem Constar na Nota</div>
      <div style="font-size:13px;color:#1e40af;line-height:1.8;">
        <strong>VIADUTO DAS ARTES</strong><br>
        CNPJ: 23.843.648/0001-25<br>
        Inscrição Municipal: 0745690001<br>
        Endereço: Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010<br>
        E-mail: viadutodasartes@viadutodasartes.org.br
      </div>
    </div>

    <p style="font-size:13px;color:#6b7280;">Favor corrigir e reenviar a nota fiscal (PDF e XML).</p>
    <p style="font-size:13px;color:#374151;margin-top:16px;">Atenciosamente,<br><strong>Coordenação Museus Centro</strong></p>
  </td></tr>
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
    <div style="font-size:11px;color:#9ca3af;">Coordenação · Museus Centro · Viaduto das Artes</div>
  </td></tr>
</table></td></tr></table></body></html>`;

      for (const recipient of correcaoRecipients) {
        try {
          await base44.integrations.Core.SendEmail({ to: recipient, subject: correcaoSubject, body: correcaoBody });
          detalhes.push({ email: recipient, status: 'sucesso', tipo: 'correcao' });
          algumSucesso = true;
        } catch (err) {
          detalhes.push({ email: recipient, status: 'falha', erro: err?.message || 'Erro', tipo: 'correcao' });
          algumErro = true;
        }
      }
    } else {
      // action = 'send_approval' — envio padrão de aprovação
      for (const recipient of finalRecipients) {
        try {
          await base44.integrations.Core.SendEmail({
            to: recipient,
            subject: `✅ Pagamento Aprovado — ${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || 'Fornecedor'} · R$ ${moeda(valor)} · Museus Centro`,
            body,
          });
          detalhes.push({ email: recipient, status: 'sucesso', tipo: 'aprovacao' });
          algumSucesso = true;
        } catch (err) {
          detalhes.push({ email: recipient, status: 'falha', erro: err?.message || 'Erro desconhecido', tipo: 'aprovacao' });
          algumErro = true;
        }
      }

      // Marcar solicitação como APROVADO_ADMIN (aguardando pagamento financeiro)
      try {
        await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
          status: 'APROVADO_ADMIN',
          aprov_admin_nome: user?.full_name || user?.email || 'Sistema',
          aprov_admin_data: new Date().toISOString().split('T')[0],
          aprov_admin_comentario: 'Aprovado e notificado ao financeiro.',
        });
      } catch (_) {}

      // Enviar email de confirmação para quem cadastrou o documento
      const cadastradoPor = purchase?.created_by || purchase?.user_email || purchase?.solicitante_email;
      if (cadastradoPor && cadastradoPor.includes('@')) {
        const emailCadastrador = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#1a56db;border-radius:12px 12px 0 0;padding:28px 32px;">
    <div style="font-size:11px;color:#bfdbfe;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Projeto Museus Centro · Viaduto das Artes</div>
    <div style="font-size:22px;color:#ffffff;font-weight:700;">Sua solicitação foi aprovada e<br>encaminhada ao financeiro</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="color:#374151;font-size:14px;line-height:1.7;">Olá,<br><br>Sua nota fiscal foi aprovada pela coordenação e encaminhada ao setor financeiro para processamento do pagamento.</p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 24px;margin:16px 0;">
      <div style="font-size:12px;color:#15803d;font-weight:700;margin-bottom:4px;">Valor</div>
      <div style="font-size:28px;font-weight:800;color:#15803d;">R$ ${moeda(valor)}</div>
      <div style="font-size:13px;color:#374151;margin-top:8px;">Fornecedor: ${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '—'}</div>
      <div style="font-size:13px;color:#374151;">NF: ${purchase?.nf_numero || '—'} · ${nfDataFormatada}</div>
    </div>
    <p style="font-size:13px;color:#6b7280;">Após o pagamento ser efetuado, você receberá uma confirmação. Guarde o comprovante de pagamento.</p>
    <a href="${appComprovante}" target="_blank" style="display:block;text-align:center;background:#111827;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:16px;">Acessar Solicitação →</a>
  </td></tr>
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
    <div style="font-size:11px;color:#9ca3af;">Coordenação · Museus Centro · Viaduto das Artes</div>
  </td></tr>
</table></td></tr></table></body></html>`;

        try {
          await base44.integrations.Core.SendEmail({
            to: cadastradoPor,
            subject: `✅ Sua nota foi aprovada — R$ ${moeda(valor)} · Museus Centro`,
            body: emailCadastrador,
          });
          detalhes.push({ email: cadastradoPor, status: 'sucesso', tipo: 'confirmacao_cadastrador' });
        } catch (err) {
          detalhes.push({ email: cadastradoPor, status: 'falha', erro: err?.message, tipo: 'confirmacao_cadastrador' });
        }
      }
    }

    const statusLog = algumSucesso && algumErro ? 'falha_parcial' : algumSucesso ? 'sucesso' : 'falha';

    // Gravar log
    await base44.asServiceRole.entities.NotificacaoCompraLog.create({
      purchase_id: purchaseId,
      purchase_descricao: purchase?.descricao_item || purchase?.objeto || '',
      fornecedor: purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '',
      valor,
      recipients: action === 'request_correction' ? correction_recipients : finalRecipients,
      status: statusLog,
      enviado_por: user?.email || '',
      detalhes,
      erro: conformidade.erros?.join('; ') || null,
      disparado_em: new Date().toISOString(),
    });

    if (statusLog === 'falha') {
      return Response.json({ error: 'Falha ao enviar para todos os destinatários', detalhes }, { status: 500 });
    }

    return Response.json({ success: true, status: statusLog, action, conformidade, detalhes });
  } catch (e) {
    // Tentar registrar falha geral no log
    try {
      await base44.asServiceRole.entities.NotificacaoCompraLog.create({
        purchase_id: 'desconhecido',
        status: 'falha',
        enviado_por: user?.email || '',
        erro: e?.message || 'Erro desconhecido',
        disparado_em: new Date().toISOString(),
      });
    } catch (_) {}
    return Response.json({ error: e?.message || 'Erro ao enviar notificação' }, { status: 500 });
  }
});