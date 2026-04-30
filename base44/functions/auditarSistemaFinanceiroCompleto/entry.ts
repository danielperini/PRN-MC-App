import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function getValor(p: any) {
  return toNumber(
    p?.valor_solicitado ||
    p?.valor_total ||
    p?.valor ||
    0
  );
}

function isAprovado(p: any) {
  return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']
    .includes(String(p.status || '').toUpperCase());
}

function chaveDuplicidade(p: any) {
  return [
    p?.nf_numero || '',
    p?.fornecedor_cnpj || p?.fornecedor_cpf_cnpj || '',
    getValor(p)
  ].join('|');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const apply = body?.apply === true;

    const log: any = {
      modo: apply ? 'APLICANDO' : 'SIMULAÇÃO',
      rubricasAtualizadas: 0,
      duplicadosCancelados: 0,
      estornos: 0,
      vinculacoes: 0,
      inconsistencias: []
    };

    // =============================
    // 1. Buscar dados
    // =============================
    const rubricas = await base44.asServiceRole.entities.Rubrica.list();
    const compras = await base44.asServiceRole.entities.PurchaseRequest.list();
    const documentos = await base44.asServiceRole.entities.DocumentIntake.list();

    // =============================
    // 2. Deduplicação
    // =============================
    const mapa = new Map<string, any>();

    for (const p of compras) {
      const key = chaveDuplicidade(p);

      if (!mapa.has(key)) {
        mapa.set(key, p);
      } else {
        const duplicado = p;

        if (apply) {
          await base44.asServiceRole.entities.PurchaseRequest.update(duplicado.id, {
            status: 'CANCELADO'
          });
        }

        log.duplicadosCancelados++;
      }
    }

    // =============================
    // 3. Recalcular rubricas
    // =============================
    const acumulado: Record<string, number> = {};

    for (const p of compras) {
      if (!isAprovado(p)) continue;
      if (!p.rubrica_id) {
        log.inconsistencias.push({
          tipo: 'SEM_RUBRICA',
          id: p.id
        });
        continue;
      }

      const valor = getValor(p);

      acumulado[p.rubrica_id] =
        (acumulado[p.rubrica_id] || 0) + valor;
    }

    for (const r of rubricas) {
      const total = toNumber(r.valor_total || r.valor_rubrica);
      const utilizado = acumulado[r.id] || 0;
      const saldo = total - utilizado;

      if (apply) {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          valor_utilizado: utilizado,
          saldo: saldo,
          saldo_real: saldo,
          percentual_utilizado: total > 0 ? (utilizado / total) * 100 : 0
        });
      }

      log.rubricasAtualizadas++;
    }

    // =============================
    // 4. Vincular XML/PDF
    // =============================
    const pdfs = documentos.filter(d => d.tipo_detectado === 'NOTA_FISCAL_PDF');
    const xmls = documentos.filter(d => d.tipo_detectado === 'NOTA_FISCAL_XML');

    for (const xml of xmls) {
      if (xml.nf_pdf_intake_id) continue;

      const xmlNome = (xml.file_name_original || '').toLowerCase();

      let melhorPdf: any = null;

      for (const pdf of pdfs) {
        const pdfNome = (pdf.file_name_original || '').toLowerCase();

        if (xmlNome.includes(pdfNome.slice(0, 10)) || pdfNome.includes(xmlNome.slice(0, 10))) {
          melhorPdf = pdf;
          break;
        }
      }

      if (melhorPdf) {
        if (apply) {
          await base44.asServiceRole.entities.DocumentIntake.update(melhorPdf.id, {
            nf_xml_intake_id: xml.id,
            nf_xml_url: xml.arquivo_original_url,
            grupo_status: 'COMPLETO'
          });

          await base44.asServiceRole.entities.DocumentIntake.update(xml.id, {
            nf_pdf_intake_id: melhorPdf.id,
            nf_pdf_url: melhorPdf.arquivo_original_url,
            grupo_status: 'COMPLETO',
            ocultar_entrada_unica: true
          });
        }

        log.vinculacoes++;
      }
    }

    // =============================
    // 5. Resultado
    // =============================
    return json({
      success: true,
      ...log
    });

  } catch (error: any) {
    return json({
      success: false,
      error: error.message
    }, 500);
  }
});
