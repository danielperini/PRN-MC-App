import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, AlertTriangle, Building2, CreditCard, FileText, Scale, Folder } from 'lucide-react';

function Row({ label, value, highlight }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex gap-2 text-sm py-0.5">
      <span className="text-gray-500 w-44 flex-shrink-0">{label}:</span>
      <span className={`font-medium ${highlight === 'red' ? 'text-red-700' : highlight === 'green' ? 'text-green-700' : 'text-gray-800'}`}>
        {typeof value === 'boolean' ? (value ? '✅ Sim' : '❌ Não') : value}
      </span>
    </div>
  );
}

function Section({ icon: Icon, title, color = 'indigo', children }) {
  const colors = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div className={`rounded-lg border p-4 space-y-1 ${colors[color]}`}>
      <div className={`flex items-center gap-2 font-semibold mb-2 text-sm`}>
        <Icon className="w-4 h-4" />
        {title}
      </div>
      {children}
    </div>
  );
}

export default function InvoiceFullAnalysisPanel({ result }) {
  if (!result) return null;

  const { emitente, nota, banco, rubrica, pontos_criticos = [], alertas = [] } = result;
  const isValid = result.is_nota_valida;

  return (
    <div className="space-y-4 text-sm">

      {/* Status geral */}
      <Alert className={isValid ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
        {isValid
          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
          : <AlertCircle className="h-4 w-4 text-red-600" />}
        <AlertDescription className={isValid ? 'text-green-800' : 'text-red-800'}>
          <p className="font-semibold">{isValid ? '✅ Nota Fiscal Válida' : '⚠️ Nota com Pendências'}</p>
          {result.resumo_conformidade && <p className="mt-0.5 text-xs">{result.resumo_conformidade}</p>}
        </AlertDescription>
      </Alert>

      {/* XML */}
      {result.xml_obrigatorio && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <p className="font-semibold">📎 XML obrigatório para esta nota</p>
            <p className="text-xs mt-0.5">{result.xml_obrigatorio_motivo}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Equipe */}
      {result.equipe_msg && (
        <Alert className="border-blue-300 bg-blue-50">
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 font-medium">{result.equipe_msg}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Emissor */}
        <Section icon={Building2} title="Dados do Emissor (Pesquisa CNPJ)" color="indigo">
          <Row label="Razão Social" value={emitente?.nome} />
          <Row label="CNPJ/CPF" value={emitente?.cnpj_cpf} />
          <Row label="Situação Cadastral" value={emitente?.situacao_cadastral}
            highlight={emitente?.situacao_cadastral?.toUpperCase()?.includes('ATIVA') ? 'green' : 'red'} />
          <Row label="CNAE" value={emitente?.cnae_codigo ? `${emitente.cnae_codigo} — ${emitente.cnae_descricao || ''}` : null} />
          <Row label="Regime Tributário" value={emitente?.regime_tributario} />
          <Row label="Município/UF" value={emitente?.municipio ? `${emitente.municipio}/${emitente.uf}` : null} />
          <Row label="Porte" value={emitente?.porte} />
        </Section>

        {/* Nota */}
        <Section icon={FileText} title="Dados da Nota Fiscal" color="blue">
          <Row label="Nº da Nota" value={nota?.numero} />
          <Row label="Série" value={nota?.serie} />
          <Row label="Data de Emissão" value={nota?.data_emissao} />
          <Row label="Valor Total" value={nota?.valor_total ? `R$ ${Number(nota.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null} />
          <Row label="Valor Líquido" value={nota?.valor_liquido ? `R$ ${Number(nota.valor_liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null} />
          <Row label="ISS Retido" value={nota?.valor_iss ? `R$ ${Number(nota.valor_iss).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null} />
          <Row label="Serviço" value={nota?.descricao_servico} />
          <Row label="Cadeia Cultural" value={nota?.eh_servico_cultural} />
          <Row label="Legislação" value={nota?.legislacao_aplicavel} />
        </Section>

        {/* Conta Bancária */}
        <Section icon={CreditCard} title="Dados Bancários" color={banco?.confere_emissor ? 'green' : 'amber'}>
          <Row label="Banco" value={banco?.nome} />
          <Row label="Agência" value={banco?.agencia} />
          <Row label="Conta" value={banco?.conta} />
          <Row label="PIX" value={banco?.pix} />
          <Row label="Favorecido" value={banco?.favorecido} />
          <Row label="CPF/CNPJ Favorecido" value={banco?.cpf_cnpj} />
          <Row
            label="Confere com Emissor"
            value={banco?.confere_emissor}
            highlight={banco?.confere_emissor ? 'green' : 'red'}
          />
          {!banco?.confere_emissor && banco?.divergencia && (
            <div className="mt-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              ⚠️ {banco.divergencia}
            </div>
          )}
        </Section>

        {/* Rubrica */}
        <Section icon={Scale} title="Rubrica Orçamentária" color={rubrica?.saldo_suficiente ? 'green' : 'amber'}>
          <Row label="Rubrica Sugerida" value={rubrica?.sugerida} />
          <Row
            label="Saldo Suficiente"
            value={rubrica?.saldo_suficiente}
            highlight={rubrica?.saldo_suficiente ? 'green' : 'red'}
          />
          {rubrica?.observacao && (
            <div className="mt-1 text-xs text-gray-700">{rubrica.observacao}</div>
          )}
        </Section>

      </div>

      {/* Pontos críticos */}
      {pontos_criticos.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-red-800 mb-2">
            <AlertCircle className="w-4 h-4" /> Pontos Críticos ({pontos_criticos.length})
          </div>
          <ul className="list-disc pl-5 space-y-1 text-red-700 text-sm">
            {pontos_criticos.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-800 mb-2">
            <AlertTriangle className="w-4 h-4" /> Alertas ({alertas.length})
          </div>
          <ul className="list-disc pl-5 space-y-1 text-amber-700 text-sm">
            {alertas.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {/* Recomendação */}
      {result.recomendacao_final && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
          <span className="font-semibold">Recomendação: </span>{result.recomendacao_final}
        </div>
      )}

      {/* Drive */}
      {(result.drive_pdf_link || result.drive_xml_link) && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-2 font-medium text-gray-700 text-sm">
            <Folder className="w-4 h-4" /> Backup no Google Drive
          </div>
          {result.drive_pdf_link && (
            <a href={result.drive_pdf_link} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">📄 {result.nome_arquivo}</a>
          )}
          {result.drive_xml_link && (
            <a href={result.drive_xml_link} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">📋 XML da Nota</a>
          )}
        </div>
      )}
      {result.backup_error && (
        <p className="text-xs text-amber-600">⚠️ Backup no Drive: {result.backup_error}</p>
      )}
    </div>
  );
}