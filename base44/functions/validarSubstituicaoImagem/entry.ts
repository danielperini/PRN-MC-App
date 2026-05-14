import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { revision_id, secao, indice, imagem_nova, data_from, data_to, museu } = body;

    if (!revision_id || !secao || !indice || !imagem_nova) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Buscar revisão atual
    const revision = await base44.entities.ReportRevision.filter({
      id: revision_id,
    });

    if (!revision || revision.length === 0) {
      return Response.json({ error: 'Revisão não encontrada' }, { status: 404 });
    }

    const rev = revision[0];
    const avisos = [];
    const permitir = { resultado: true, avisos: [] };

    // VALIDAÇÃO 1: Período
    if (data_from && imagem_nova.data) {
      const imgDate = new Date(imagem_nova.data);
      const fromDate = new Date(data_from);
      if (imgDate < fromDate) {
        avisos.push({
          tipo: 'aviso_periodo',
          msg: `Imagem anterior ao período selecionado (${imagem_nova.data})`,
          permitir_mesmo_assim: true,
        });
      }
    }

    if (data_to && imagem_nova.data) {
      const imgDate = new Date(imagem_nova.data);
      const toDate = new Date(data_to);
      if (imgDate > toDate) {
        avisos.push({
          tipo: 'aviso_periodo',
          msg: `Imagem posterior ao período selecionado (${imagem_nova.data})`,
          permitir_mesmo_assim: true,
        });
      }
    }

    // VALIDAÇÃO 2: Museu
    if (museu && imagem_nova.museu && imagem_nova.museu !== museu) {
      avisos.push({
        tipo: 'aviso_museu',
        msg: `Imagem é do museu "${imagem_nova.museu}", não de "${museu}"`,
        permitir_mesmo_assim: true,
      });
    }

    // VALIDAÇÃO 3: Duplicidade (imagem já aparece no relatório)
    const conteudoImagens = rev.conteudo_imagens || [];
    const duplicada = conteudoImagens.some(
      img => img.url_substituida === imagem_nova.url || img.url_original === imagem_nova.url
    );

    if (duplicada) {
      avisos.push({
        tipo: 'aviso_duplicidade',
        msg: 'Esta imagem já aparece em outra seção do relatório',
        permitir_mesmo_assim: true,
      });
    }

    // VALIDAÇÃO 4: Vínculo com atividade/período
    if (imagem_nova.tipo === 'atividade' && imagem_nova.metadata?.ativ_id) {
      const atividade = await base44.entities.Activity.filter({
        id: imagem_nova.metadata.ativ_id,
      });

      if (atividade && atividade.length > 0) {
        const ativ = atividade[0];
        const atividadeDate = new Date(ativ.data_realizacao || ativ.data_inicio);
        const fromDate = new Date(data_from);
        const toDate = new Date(data_to);

        if (atividadeDate < fromDate || atividadeDate > toDate) {
          avisos.push({
            tipo: 'aviso_vinculo',
            msg: `Atividade vinculada (${ativ.titulo}) está fora do período`,
            permitir_mesmo_assim: true,
          });
        }
      }
    }

    permitir.avisos = avisos;

    // Registrar tentativa de substituição no histórico
    await base44.entities.ReportRevisionHistory.create({
      revision_id,
      usuario_email: user.email,
      tipo_alteracao: 'IMAGEM_SUBSTITUIDA',
      secao,
      indice_imagem: indice,
      conteudo_original: 'Validação de substituição',
      conteudo_novo: imagem_nova.url,
      data_alteracao: new Date().toISOString(),
      acao_permitida: permitir.resultado,
      motivo_rejeicao: avisos.length > 0 ? avisos.map(a => a.msg).join('; ') : null,
    });

    return Response.json(permitir);
  } catch (error) {
    console.error('validarSubstituicaoImagem:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});