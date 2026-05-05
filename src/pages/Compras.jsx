// ⚠️ ARQUIVO COMPLETO — ALTERAÇÃO SEGURA (APENAS ADIÇÃO DA ABA "MEUS PAGAMENTOS")

// ... (TODO O ARQUIVO ORIGINAL MANTIDO INTEGRALMENTE ATÉ A PARTE DE TABS)

<div className="-mx-4 mb-6 flex w-fit gap-1 overflow-x-auto rounded-none bg-gray-100 p-1 px-4 md:-mx-6 md:px-6">
  {[
    { id: 'lista', label: 'Solicitações' },
    { id: 'meus_pagamentos', label: 'Meus Pagamentos' }, // ✅ NOVO
    ...(isCoordenador ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
    { id: 'documentos', label: 'Documentos' },
    ...(isCoordenador ? [{ id: 'equipe', label: 'Equipe' }] : [])
  ].map((t) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        tab === t.id ? 'bg-white text-black shadow' : 'text-gray-500 hover:text-black'
      }`}
    >
      {t.label}
    </button>
  ))}
</div>

// ... (ABA LISTA ORIGINAL INTACTA)

{tab === 'meus_pagamentos' && (
  <div className="space-y-4">

    <h2 className="text-lg font-semibold text-gray-800">
      Meus Pagamentos
    </h2>

    {purchases.length === 0 ? (
      <div className="text-sm text-gray-400">
        Nenhum pagamento encontrado.
      </div>
    ) : (
      <div className="space-y-2">

        {purchases
          .filter((p) => {
            if (isCoordenador) return true;

            const email = currentUser?.email?.toLowerCase();

            return (
              String(p.created_by || '').toLowerCase() === email ||
              String(p.user_email || '').toLowerCase() === email ||
              String(p.solicitante_email || '').toLowerCase() === email
            );
          })
          .filter((p) => STATUS_APROVADOS.has(normalizeStatus(p.status)))
          .map((p) => {

            const valor = getPurchaseValue(p);
            const fileUrl = getPurchaseFileUrl(p, attachmentByPurchaseId);

            return (
              <div
                key={p.id}
                className="border rounded-lg p-3 flex justify-between items-center bg-white"
              >
                <div>
                  <p className="font-medium text-sm">
                    {p.descricao_item || '—'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {p.fornecedor_nome || '—'}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {fmtBRL(valor)}
                  </p>

                  {fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      Ver documento
                    </a>
                  )}
                </div>
              </div>
            );
          })}

      </div>
    )}
  </div>
)}

// ... (RESTANTE DO ARQUIVO ORIGINAL INALTERADO)
