{menuAberto && (
  <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-lg">
    <a
      href={`/Compras?solicitacao=${p.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
    >
      <LinkIcon className="h-3.5 w-3.5" />
      Acessar solicitação
    </a>

    {podeAprovar && pendenteCoordenacao && (
      <>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpenId(null);
            onApprove(p);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aprovar
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpenId(null);
            onReturn(p);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Devolver
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpenId(null);
            onReject(p);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          <XCircle className="h-3.5 w-3.5" />
          Reprovar
        </button>
      </>
    )}
  </div>
)}
