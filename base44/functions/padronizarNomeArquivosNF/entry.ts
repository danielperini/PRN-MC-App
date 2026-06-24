import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── HELPERS ──
function safeStr(v) { return String(v || '').trim(); }

function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function parseValorBR(v) {
  const raw = String(v || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}

/** Remove acentos, caracteres especiais e espaços */
function limparNome(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
}

/** Remove caracteres inválidos para nome de arquivo */
function sanitizarNomeArquivo(v) {
  return String(v || '')
    .replace(/[\/\:;\?\*"\'\(\)\[\]\{\}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza centro de custo para sigla padronizada */
function normalizarCentroCusto(v) {
  const raw = safeStr(v).toUpperCase();
  if (raw.includes('MHAB') || raw.includes('ABILIO')) return 'MHAB';
  if (raw.includes('MIS') || raw.includes('IMAGEM E SOM')) return 'MIS';
  if (raw.includes('MUMO') || raw.includes('MODA')) return 'MUMO';
  if (raw.includes('NOTURNO')) return 'NOTURNO';
  if (raw.includes('PUBLICAC')) return 'PUBLICACOES';
  if (raw.includes('GERAL') || raw.includes('TRANSVERSAL') || raw.includes('ATUACAO')) return 'GERAL';
  return 'GERAL';
}

/** Extrai mês por extenso e ano de uma data */
function extrairMesAno(dataStr) {
  try {
    const d = new Date(dataStr);
    if (isNaN(d.getTime())) return null;
    return { mes: MESES[d.getMonth()], ano: String(d.getFullYear()), mesNum: String(d.getMonth() + 1).padStart(2, '0') };
  } catch { return null; }
}

/** Infere natureza de despesa textual a partir da rubrica, categoria ou descrição */
function inferirNaturezaDespesa(intake, purchaseRequest) {
  // Prioridade 1: nome da rubrica vinculada
  const rubricaNome = safeStr(
    purchaseRequest?.rubrica_nome ||
    intake?.rubrica_nome_sugerida ||
    purchaseRequest?.resultado_ia?.rubrica_nome ||
    ''
  );
  if (rubricaNome && rubricaNome.length > 2 && rubricaNome.length < 40) {
    return limparNome(rubricaNome);
  }

  // Prioridade 2: categoria da solicitação
  const categoria = safeStr(purchaseRequest?.categoria || '');
  const mapaCategoria = {
    'Serviços (equipe/coordenação)': 'Coordenacao',
    'Serviços (comunicação: designer, foto, vídeo, imprensa, redes)': 'Comunicacao',
    'Serviços (produção/infraestrutura/expografia)': 'Producao',
    'Serviços (eventos/atrações/artistas)': 'Artistas',
    'Serviços (segurança/limpeza)': 'SegurancaLimpeza',
    'Logística (transporte/vans)': 'Transporte',
    'Alimentação (lanche/café/coffeebreak)': 'Alimentacao',
    'Consultoria / Formação / Acessibilidade': 'Consultoria',
    'Materiais de consumo': 'MaterialConsumo',
    'Outros': 'Geral',
  };
  if (mapaCategoria[categoria]) return mapaCategoria[categoria];

  // Prioridade 3: descrição do item (primeiras 3 palavras significativas)
  const desc = safeStr(intake?.resultado_ia?.descricao_servico || purchaseRequest?.descricao_item || '');
  if (desc.length > 3) {
    const palavras = desc.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    return limparNome(palavras.slice(0, 3).join(''));
  }

  return 'NaoClassificado';
}

/** Determina prefixo do arquivo: NF, XML ou COMP */
function determinarPrefixo(intake) {
  const nome = safeStr(intake?.file_name_original || '').toLowerCase();
  const tipo = safeStr(intake?.tipo_detectado || '').toUpperCase();
  const desc = safeStr(intake?.resultado_ia?.tipo_documento || '').toLowerCase();
  const mime = safeStr(intake?.mime_type || '').toLowerCase();

  // XML sempre
  if (mime.includes('xml') || nome.endsWith('.xml') || tipo === 'NOTA_FISCAL_XML') return 'XML';

  // Comprovante por palavras-chave
  const compKeywords = ['comp', 'comprovante', 'pix', 'ted', 'transferencia', 'pagamento', 'boleto', 'bol'];
  if (compKeywords.some(k => nome.includes(k) || desc.includes(k))) return 'COMP';

  // Recibo
  if (nome.includes('recibo') || desc.includes('recibo')) return 'COMP';

  // Default NF
  return 'NF';
}

/** Detecta extensão do arquivo */
function determinarExtensao(intake) {
  const nome = safeStr(intake?.file_name_original || '').toLowerCase();
  const mime = safeStr(intake?.mime_type || '').toLowerCase();
  const prefixo = determinarPrefixo(intake);
  if (prefixo === 'XML') return 'xml';
  if (mime.includes('xml') || nome.endsWith('.xml')) return 'xml';
  return 'pdf';
}

/** Gera nome padronizado conforme regras oficiais */
function gerarNomePadronizado(intake, purchaseRequest) {
  const prefixo = determinarPrefixo(intake);
  const extensao = determinarExtensao(intake);

  // Número NF
  const nfNumero = safeStr(
    intake?.resultado_ia?.nf_numero ||
    intake?.nf_numero ||
    purchaseRequest?.nf_numero ||
    ''
  ) || 'SN';

  // Centro de custo
  const centroCusto = normalizarCentroCusto(
    purchaseRequest?.centro_custo ||
    intake?.centro_custo ||
    intake?.resultado_ia?.centro_custo_sugerido ||
    ''
  );

  // Fornecedor (limpo, sem espaços nem acentos)
  const fornecedorRaw = safeStr(
    purchaseRequest?.fornecedor_nome ||
    intake?.nf_emitente_nome ||
    intake?.resultado_ia?.nf_emitente_nome ||
    intake?.fornecedor_nome ||
    'Fornecedor'
  );
  const fornecedor = limparNome(fornecedorRaw).substring(0, 50) || 'Fornecedor';

  // Natureza da despesa
  const naturezaDespesa = inferirNaturezaDespesa(intake, purchaseRequest).substring(0, 40);

  // Data → mês extenso + ano
  const data = extrairMesAno(
    intake?.resultado_ia?.nf_data_emissao ||
    intake?.nf_data_emissao ||
    purchaseRequest?.nf_data_emissao ||
    purchaseRequest?.created_date ||
    intake?.created_date ||
    new Date().toISOString()
  );
  const mesExtenso = data?.mes || MESES[new Date().getMonth()];
  const ano = data?.ano || String(new Date().getFullYear());

  // Valor
  const valor = purchaseRequest?.valor_aprovado_admin ||
    purchaseRequest?.valor_solicitado ||
    intake?.nf_valor_total ||
    intake?.resultado_ia?.nf_valor_total ||
    0;
  const valorFormatado = parseValorBR(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Montagem final
  const nome = `${prefixo}-${nfNumero}-${centroCusto}-${fornecedor}-${naturezaDespesa}-MuseusCentro-${mesExtenso}-${ano}-R$-${valorFormatado}.${extensao}`;

  return sanitizarNomeArquivo(nome);
}

// ── HANDLER ──
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = safeStr(body.mode) || 'single'; // 'single', 'batch', 'migrate'
    const svc = base44.asServiceRole;

    const resultados = { mode, processados: 0, erros: 0, detalhes: [] };

    if (mode === 'single') {
      const intakeId = safeStr(body.intake_id);
      if (!intakeId) return Response.json({ error: 'intake_id obrigatório' }, { status: 400 });

      const intake = await svc.entities.DocumentIntake.get(intakeId);
      if (!intake) return Response.json({ error: 'Intake não encontrado' }, { status: 404 });

      // Verificar se é NF/XML/Comprovante
      const prefixo = determinarPrefixo(intake);
      if (!['NF', 'XML', 'COMP'].includes(prefixo)) {
        return Response.json({ ok: true, skipped: true, reason: 'Tipo não padronizável: ' + prefixo });
      }

      // Buscar PurchaseRequest vinculada
      let pr = null;
      if (intake.entidade_destino === 'PurchaseRequest' && intake.entidade_destino_id) {
        try { pr = await svc.entities.PurchaseRequest.get(intake.entidade_destino_id); } catch {}
      }

      const nomePadronizado = gerarNomePadronizado(intake, pr);
      await svc.entities.DocumentIntake.update(intakeId, { file_name_final: nomePadronizado });
      resultados.processados = 1;
      resultados.detalhes.push({ id: intakeId, nome_original: intake.file_name_original, nome_padronizado: nomePadronizado });
    }

    if (mode === 'batch' || mode === 'migrate') {
      const tipos = ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'AGUARDANDO_REVISAO'];
      const filterMode = mode === 'migrate'
        ? { tipo_detectado: { $in: tipos }, status_registro: { $ne: 'REMOVIDO' } }
        : { ...body.filter, status_registro: { $ne: 'REMOVIDO' } };

      let skip = 0, total = 0;
      const MAX = mode === 'migrate' ? 200 : 50;

      while (true) {
        const batch = await svc.entities.DocumentIntake.filter(filterMode, 'created_date', 50, skip);
        if (!batch || !batch.length) break;

        for (const intake of batch) {
          if (total >= MAX) break;
          try {
            const prefixo = determinarPrefixo(intake);
            if (!['NF', 'XML', 'COMP'].includes(prefixo)) {
              resultados.detalhes.push({ id: intake.id, skipped: true, reason: 'Nao padronizavel: ' + prefixo });
              continue;
            }

            let pr = null;
            if (intake.entidade_destino === 'PurchaseRequest' && intake.entidade_destino_id) {
              try { pr = await svc.entities.PurchaseRequest.get(intake.entidade_destino_id); } catch {}
            }

            const nomePadronizado = gerarNomePadronizado(intake, pr);
            await svc.entities.DocumentIntake.update(intake.id, { file_name_final: nomePadronizado });
            resultados.processados++;
            resultados.detalhes.push({ id: intake.id, nome_original: intake.file_name_original, nome_padronizado: nomePadronizado });
            total++;
          } catch (e) {
            resultados.erros++;
            resultados.detalhes.push({ id: intake.id, erro: e.message });
          }
        }
        skip += 50;
        if (total >= MAX) break;
      }
    }

    return Response.json(resultados);
  } catch (error) {
    console.error('padronizarNomeArquivosNF error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});