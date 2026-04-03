{/* 🔥 LISTA DE ENVIOS */}
<div className="space-y-3">
  <div className="font-semibold text-gray-800">📄 Meus envios</div>

  {meusPagamentos.length === 0 && (
    <div className="text-sm text-gray-500 border rounded-xl p-4">
      Nenhum envio realizado ainda.
    </div>
  )}

  {meusPagamentos.map((p) => (
    <div key={p.id} className="border rounded-xl p-4 bg-white shadow-sm space-y-2">
      
      <div className="flex justify-between items-center">
        <div className="font-medium text-gray-900">
          {p.nota_fiscal_file_name || 'Nota fiscal'}
        </div>

        <Badge className={getStatusColor(p.status)}>
          {getStatusLabel(p.status)}
        </Badge>
      </div>

      <div className="text-sm text-gray-600 grid grid-cols-2 gap-2">
        <div>📅 {p.mes_referencia}/{p.ano}</div>
        <div>💰 {formatBRL(p.valor_nf)}</div>
      </div>

      <div className="flex gap-3 text-sm">
        {p.nota_fiscal_url && (
          <a href={p.nota_fiscal_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            📄 Ver PDF
          </a>
        )}

        {p.xml_url && (
          <a href={p.xml_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            📦 Ver XML
          </a>
        )}
      </div>

    </div>
  ))}
</div>
