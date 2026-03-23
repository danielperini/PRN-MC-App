// 🔥 APENAS AJUSTES PONTUAIS — COMPATÍVEL COM IA DE CONTRATO + AUTO PREENCHIMENTO

function MemberCard({
  member,
  budgetLine,
  allTeamPayments,
  isCoordenador,
  onEdit,
  onDocs,
  onPayment,
  onDelete,
  showPayButton = true,
  editLabel = 'Editar equipe',
}) {
  const parcelas =
    toNumber(member.parcelas) ||
    toNumber(member.numero_parcelas);

  const valorParcela =
    toNumber(member.valor_parcela) ||
    (toNumber(member.valor_total) && parcelas > 0
      ? toNumber(member.valor_total) / parcelas
      : 0);

  const pagasNoContrato =
    toNumber(member.parcelas_pagas);

  const valorTotal =
    toNumber(member.valor_total) ||
    (parcelas * valorParcela);

  const saldo = Math.max(0, valorTotal - pagasNoContrato * valorParcela);

  const dataInicio =
    member.data_inicio ||
    member.data_inicio_contrato ||
    member.contract_start_date;

  const dataFim =
    member.data_fim ||
    member.data_fim_contrato ||
    member.contract_end_date;

  const vencido = isContratoVencido(dataFim);

  const resumo = getResumoFinanceiro(member, allTeamPayments);

  // 🔥 NOVO: INDICA SE VEIO DE IA
  const preenchidoPorIA = member.preenchido_por_ia === true;

  return (
    <div className="border p-4 rounded-xl space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-semibold">{getMemberDisplayName(member)}</p>
          <p className="text-xs text-gray-500">{member.funcao || member.cargo || '—'}</p>

          {preenchidoPorIA && (
            <p className="text-[10px] text-blue-600 mt-1">
              Dados preenchidos automaticamente por contrato
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <Badge className={vencido ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
            {vencido ? 'Vencido' : 'Válido'}
          </Badge>

          {resumo.aguardando > 0 && (
            <Badge className="bg-amber-100 text-amber-800">
              {resumo.aguardando} pendente(s)
            </Badge>
          )}

          {resumo.pagos > 0 && (
            <Badge className="bg-blue-100 text-blue-800">
              {resumo.pagos} pago(s)
            </Badge>
          )}
        </div>
      </div>

      {budgetLine ? (
        <p className="text-xs text-gray-500">
          {budgetLine.codigo} — {budgetLine.descricao}
        </p>
      ) : (
        <div className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Sem rubrica / linha orçamentária vinculada</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
        <div>
          <CalendarDays className="w-3 h-3 inline mr-1" />
          {formatDate(dataInicio)} → {formatDate(dataFim)}
        </div>

        <div>
          <Layers3 className="w-3 h-3 inline mr-1" />
          {pagasNoContrato}/{parcelas} parcelas
        </div>

        <div>
          <Wallet className="w-3 h-3 inline mr-1" />
          {formatBRL(valorTotal)}
        </div>

        <div>
          Saldo: {formatBRL(saldo)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <Clock3 className="w-3.5 h-3.5" />
            Último envio
          </div>
          <div className="font-medium text-gray-800">
            {resumo.ultimoEnvio
              ? `${resumo.ultimoEnvio.mes_referencia || '—'} / ${resumo.ultimoEnvio.ano || '—'}`
              : 'Nenhum envio'}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <Receipt className="w-3.5 h-3.5" />
            Valor da parcela
          </div>
          <div className="font-medium text-gray-800">
            {formatBRL(valorParcela)}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Status último envio
          </div>
          <div className="font-medium text-gray-800">
            {resumo.ultimoEnvio?.status || '—'}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <CreditCard className="w-3.5 h-3.5" />
            Último pagamento
          </div>
          <div className="font-medium text-gray-800">
            {resumo.ultimoPagamento
              ? `${formatDate(resumo.ultimoPagamento?.data_pagamento)} • ${formatBRL(
                  resumo.ultimoPagamento?.valor_pago || resumo.ultimoPagamento?.valor_nf || 0
                )}`
              : 'Nenhum pagamento'}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(member)}
        >
          <Edit2 className="w-3 h-3 mr-1" />
          {editLabel}
        </Button>

        {showPayButton && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPayment(member)}
          >
            <Receipt className="w-3 h-3 mr-1" />
            Pagar equipe
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => onDocs(member)}
        >
          <FileText className="w-3 h-3 mr-1" />
          Documentos
        </Button>

        {isCoordenador && onDelete && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(member)}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
