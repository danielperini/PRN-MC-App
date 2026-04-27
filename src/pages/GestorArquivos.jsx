{showHistory === 'invoices' && (
  <div className="bg-white border border-gray-200 rounded-lg p-6">
    <h3 className="text-lg font-semibold mb-4 text-black flex items-center gap-2">
      <File className="w-5 h-5" /> Notas Fiscais
    </h3>

    {isLoading ? (
      <div className="text-center py-8 text-gray-400">Carregando notas fiscais...</div>
    ) : (
      (() => {
        // 🔥 NOTAS DA ENTRADA ÚNICA (Attachment)
        const notasEntradaUnica = backups.filter(
          (b) => b.nf_categoria === 'nota_fiscal'
        );

        // 🔥 NOTAS ANTIGAS (InvoiceSubmission)
        const notasAntigas = invoiceSubmissions
          .filter(inv => inv.notas_fiscais?.length > 0)
          .flatMap(inv =>
            inv.notas_fiscais.map(nf => ({
              ...nf,
              tipo: 'antigo',
              userName: inv.user_name,
              data: inv.data_submissao,
            }))
          );

        const todasNotas = [
          ...notasEntradaUnica.map(nf => ({
            tipo: 'nova',
            numero: nf.nf_numero,
            fornecedor: nf.nf_emitente_nome,
            valor: nf.nf_valor_total,
            data: nf.date,
            file_url: nf.fileUrl,
            nome: nf.fileName,
          })),
          ...notasAntigas,
        ];

        if (todasNotas.length === 0) {
          return (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Nenhuma nota fiscal encontrada</p>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {todasNotas
              .sort((a, b) => new Date(b.data) - new Date(a.data))
              .map((nf, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  <div>
                    <p className="font-medium text-black">
                      {nf.numero || 'Sem número'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {nf.fornecedor || 'Fornecedor não identificado'} •
                      R$ {Number(nf.valor || 0).toLocaleString('pt-BR')} •
                      {nf.data && ` ${new Date(nf.data).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {nf.file_url && (
                      <a
                        href={nf.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                        Ver
                      </a>
                    )}
                  </div>
                </div>
              ))}
          </div>
        );
      })()
    )}
  </div>
)}
