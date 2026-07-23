import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';

/**
 * preencherCamposNFPampulha
 *
 * Preenche o campo `cod` (N4 oficial, 2 dígitos) nas compras do Noturno Pampulha
 * usando regras determinísticas por grupo de rubrica.
 *
 * Para o grupo "Comunicação e divulgação", analisa deterministicamente a descrição
 * da compra por palavras-chave e, se ambíguo, usa GPT-4o-mini como fallback.
 *
 * NUNCA grava '339039', IDs internos ou qualquer valor que não seja um código N4
 * de 2 dígitos válido no campo `cod`.
 */

const PAMPULHA_CENTROS = ['Noturno Pampulha', 'Noturno nos Museus Pampulha'];
const CODIGOS_VALIDOS = new Set(['13', '22', '23', '24', '42', '99']);

// ── Normalização ──────────────────────────────────────────────────────────────
function norm(v: string): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Mapa GRUPO_COD: resolve cod pelo grupo (ou rubrica) da Rubrica ────────────
// Prioridade: artistas/atrações → 22 | produção/infraestrutura → 99 | equipe/coordenação → 42
// comunicação/divulgação → análise secundária da descrição da compra
function resolverCodPorGrupo(rubrica: any): string | 'COMUNICACAO' | null {
  const texto = norm([
    rubrica.grupo || '',
    rubrica.rubrica || rubrica.nome || '',
  ].join(' '));

  // Grupos com código direto
  if (texto.includes('artista') || texto.includes('atracao') || texto.includes('atrações') || texto.includes('atracoes')) return '22';
  if (texto.includes('producao') && (texto.includes('infraestrutura') || texto.includes('infra'))) return '99';
  if (texto.includes('infraestrutura') && !texto.includes('comunicacao')) return '99';
  if (texto.includes('equipe') || texto.includes('coordenacao') || texto.includes('tecnica') || texto.includes('coordenação')) return '42';

  // Grupo comunicação — análise secundária necessária
  if (texto.includes('comunicacao') || texto.includes('divulgacao') || texto.includes('comunicação') || texto.includes('divulgação')) return 'COMUNICACAO';

  return null;
}

// ── Análise determinística da descrição para grupo Comunicação ─────────────────
function resolverCodComunicacaoDeterministico(descricao: string): string | null {
  const d = norm(descricao);

  // Sinalização física → 13
  if (
    d.includes('sinalizacao') ||
    d.includes('sinalização') ||
    d.includes('comunicacao visual') ||
    d.includes('impressao de sinalizacao') ||
    d.includes('grafico de sinalizacao') ||
    d.includes('placa') ||
    d.includes('faixa') ||
    d.includes('banner')
  ) return '13';

  // Designer / identidade visual / marketing → 23
  if (
    d.includes('designer') ||
    d.includes('design grafico') ||
    d.includes('identidade visual') ||
    d.includes('marketing') ||
    d.includes('redes sociais') ||
    d.includes('social media') ||
    d.includes('post')
  ) return '23';

  // Fotografia / vídeo → 24
  if (
    d.includes('fotografia') ||
    d.includes('fotografo') ||
    d.includes('video') ||
    d.includes('vídeo') ||
    d.includes('audiovisual') ||
    d.includes('filmagem') ||
    d.includes('cobertura fotografica')
  ) return '24';

  return null;
}

// ── Fallback: análise via GPT-4o-mini para descrições ambíguas ─────────────────
async function resolverCodComunicacaoIA(descricao: string): Promise<string | null> {
  try {
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const prompt = `Você é um classificador de despesas culturais. Dado o objeto/descrição de uma compra do projeto "Noturno nos Museus Pampulha", retorne APENAS o código N4 de 2 dígitos mais adequado, sem nenhum texto adicional.

Regras:
- '13' → sinalização física, impressão gráfica de sinalização, comunicação visual impressa
- '23' → design gráfico, identidade visual, marketing digital, redes sociais, peças gráficas digitais
- '24' → fotografia, vídeo, filmagem, registro audiovisual

Objeto da compra: "${descricao}"

Responda APENAS com o código (13, 23 ou 24). Se não for possível classificar, responda "null".`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0,
    });

    const resultado = (resp.choices[0]?.message?.content || '').trim();
    if (['13', '23', '24'].includes(resultado)) return resultado;
    return null;
  } catch (e) {
    console.error('[preencherCamposNFPampulha] Falha IA comunicação:', e?.message || e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    // ── Buscar rubricas do Noturno Pampulha ────────────────────────────────────
    const rubricasLists = await Promise.all(
      PAMPULHA_CENTROS.map(cc => base44.asServiceRole.entities.Rubrica.filter({ centro_custo: cc, ativo: true }))
    );
    const rubricas: any[] = rubricasLists.flat();

    // Montar mapa id → rubrica
    const rubricaMap = new Map<string, any>();
    for (const r of rubricas) rubricaMap.set(r.id, r);

    // ── Buscar compras do Noturno Pampulha ─────────────────────────────────────
    const comprasLists = await Promise.all(
      PAMPULHA_CENTROS.map(cc => base44.asServiceRole.entities.PurchaseRequest.filter({ centro_custo: cc }))
    );
    const compras: any[] = comprasLists.flat();

    // ── Contadores ─────────────────────────────────────────────────────────────
    let atualizadas = 0;
    let sem_match = 0;
    let sem_cod_comunicacao = 0;
    let ja_completas = 0;
    const detalhes: any[] = [];

    for (const compra of compras) {
      // Já tem cod preenchido → pular
      if (compra.cod && CODIGOS_VALIDOS.has(String(compra.cod))) {
        ja_completas++;
        continue;
      }

      // ── Buscar rubrica vinculada ───────────────────────────────────────────
      const rubrica = compra.rubrica_id ? (rubricaMap.get(compra.rubrica_id) || null) : null;

      if (!rubrica) {
        sem_match++;
        detalhes.push({
          id: compra.id,
          descricao: compra.descricao_item,
          motivo: 'sem_rubrica_vinculada',
          cod_aplicado: null,
          rubrica_grupo: null,
          campos_atualizados: [],
        });
        continue;
      }

      // ── Resolver cod pelo grupo da rubrica ─────────────────────────────────
      const grupoResult = resolverCodPorGrupo(rubrica);

      let cod: string | null = null;
      let fonte = '';

      if (grupoResult === 'COMUNICACAO') {
        // 1ª tentativa: determinístico por palavras-chave
        const descricao = compra.descricao_item || '';
        cod = resolverCodComunicacaoDeterministico(descricao);
        if (cod) {
          fonte = 'determinístico_comunicação';
        } else {
          // 2ª tentativa: fallback GPT-4o-mini
          cod = await resolverCodComunicacaoIA(descricao);
          if (cod) {
            fonte = 'ia_comunicação';
          } else {
            sem_cod_comunicacao++;
            detalhes.push({
              id: compra.id,
              descricao: compra.descricao_item,
              motivo: 'sem_cod_comunicacao',
              cod_aplicado: null,
              rubrica_grupo: rubrica.grupo || rubrica.rubrica,
              campos_atualizados: [],
            });
            continue;
          }
        }
      } else if (grupoResult && CODIGOS_VALIDOS.has(grupoResult)) {
        cod = grupoResult;
        fonte = 'grupo_rubrica';
      } else {
        sem_match++;
        detalhes.push({
          id: compra.id,
          descricao: compra.descricao_item,
          motivo: 'grupo_rubrica_nao_mapeado',
          cod_aplicado: null,
          rubrica_grupo: rubrica.grupo || rubrica.rubrica,
          campos_atualizados: [],
        });
        continue;
      }

      // ── Aplicar updates ────────────────────────────────────────────────────
      const camposAtualizados: string[] = [];

      // Gravar cod na compra (não-destrutivo para outros campos)
      const updateCompra: any = { cod, status_cod: 'OK' };
      await base44.asServiceRole.entities.PurchaseRequest.update(compra.id, updateCompra);
      camposAtualizados.push('cod', 'status_cod');

      // Sincronizar rubrica.codigo se vazio
      if (!rubrica.codigo) {
        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: cod }).catch(() => null);
        camposAtualizados.push('rubrica.codigo');
      }

      atualizadas++;
      detalhes.push({
        id: compra.id,
        descricao: compra.descricao_item,
        cod_aplicado: cod,
        fonte,
        rubrica_grupo: rubrica.grupo || rubrica.rubrica,
        campos_atualizados: camposAtualizados,
      });
    }

    return Response.json({
      success: true,
      atualizadas,
      sem_match,
      sem_cod_comunicacao,
      ja_completas,
      total: compras.length,
      detalhes,
    });

  } catch (error: any) {
    console.error('[preencherCamposNFPampulha]', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});