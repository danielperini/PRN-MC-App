// sincronizarNFCanonicalDiario
//
// Orquestrador diário (PRD) — mantém o Google Drive sincronizado com o padrão
// canônico de arquivos de NF, sem nenhuma interação do usuário.
//
// Fluxo sequencial:
//   1. renomearNFsDrive (dryRun=false)
//      → varre as ROOT_FOLDERS (inclui pasta externa 1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU)
//        e renomeia arquivos legados p/ o padrão oficial canônico.
//   2. recuperarVinculosDriveNFs (limite=200, apenasQuebrados=true)
//      → varre DocumentIntakes com status AGUARDANDO_REVISAO/ENVIADO_APROVACAO/APROVADO,
//        valida links no Drive, e para os 404: busca o arquivo por nome (global Drive
//        + pasta externa) e atualiza arquivo_original_url/nf_pdf_url/nf_xml_url.
//
// Token: cada sub-função resolve seu próprio token defensivamente
// (conn?.accessToken || conn?.access_token || conn?.token).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);

    // Permite execução por automação (sem usuário) — service role ativo por padrão.
    // Não há necessidade de auth.me() aqui; downstream chama apenas SDK asServiceRole.

    // 1. Renomear NFs do Drive p/ padrão canônico (efetivo — dryRun=false conforme PRD)
    let renameResult: any = null;
    try {
      renameResult = await base44.functions.invoke('renomearNFsDrive', { dryRun: false });
    } catch (e) {
      renameResult = { ok: false, error: (e as any)?.message || String(e) };
    }

    // 2. Recuperar vínculos 404 (limite=200, apenasQuebrados=true)
    let recoverResult: any = null;
    try {
      recoverResult = await base44.functions.invoke('recuperarVinculosDriveNFs', {
        limite: 200,
        apenasQuebrados: true,
      });
    } catch (e) {
      recoverResult = { ok: false, error: (e as any)?.message || String(e) };
    }

    const renameOk = renameResult?.data?.ok ?? renameResult?.ok ?? false;
    const recoverOk = recoverResult?.data?.ok ?? recoverResult?.ok ?? false;

    return Response.json({
      ok: renameOk || recoverOk,
      rename: {
        ok: renameOk,
        stats: renameResult?.data?.stats ?? renameResult?.stats ?? null,
        error: renameResult?.data?.error ?? renameResult?.error ?? null,
      },
      recover: {
        ok: recoverOk,
        stats: recoverResult?.data?.stats ?? recoverResult?.stats ?? null,
        recovery_folder_scanned:
          recoverResult?.data?.recovery_folder_scanned ?? recoverResult?.recovery_folder_scanned ?? null,
        error: recoverResult?.data?.error ?? recoverResult?.error ?? null,
      },
      execution_ms: Date.now() - start,
      processado_em: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as any)?.message || String(err), stack: (err as any)?.stack },
      { status: 500 },
    );
  }
});