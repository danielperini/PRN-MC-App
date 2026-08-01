import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Mail, Loader2 } from 'lucide-react';

const DESTINATARIOS = [
  'josianeamancio@viadutodasartes.org.br',
  'daniel@periniprojetos.com.br',
  'notasfiscais@viadutodasartes.org.br',
];

const ASSUNTO = 'Museus Centro — Perini Projetos | Atualização do Sistema — 5º Aditivo';

const DATA_ENVIO = new Date().toLocaleDateString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric'
});

const CORPO_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; margin: 0; padding: 0; background: #f5f5f5; }
  .container { max-width: 640px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: #111111; color: #ffffff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
  .header p { margin: 6px 0 0; font-size: 13px; color: #aaaaaa; }
  .body { padding: 28px 32px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555555; margin: 24px 0 8px; }
  .card { background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 6px; padding: 14px 16px; margin-bottom: 12px; }
  .card p { margin: 4px 0; font-size: 14px; }
  .card strong { color: #111111; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th { background: #f0f0f0; text-align: left; padding: 8px 10px; font-weight: 700; color: #333333; border-bottom: 2px solid #dddddd; }
  td { padding: 8px 10px; border-bottom: 1px solid #eeeeee; }
  .total-row td { background: #eeeeee; font-weight: 700; color: #111111; border-bottom: none; }
  .value { text-align: right; font-weight: 600; }
  .steps { background: #f0f7ff; border: 1px solid #bcd9f5; border-radius: 6px; padding: 14px 16px; }
  .steps p { margin: 6px 0; font-size: 14px; }
  .footer { padding: 20px 32px; border-top: 1px solid #eeeeee; font-size: 12px; color: #888888; text-align: center; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Museus Centro — Perini Projetos</h1>
    <p>Atualização do Sistema — 5º Aditivo ao Contrato de Gestão</p>
  </div>
  <div class="body">

    <div class="section-title">Contexto do Aditivo</div>
    <div class="card">
      <p><strong>Instrumento:</strong> 5º Aditivo ao Contrato de Gestão Museus Centro</p>
      <p><strong>Valor acrescido:</strong> <strong>R$ 15.800,00</strong></p>
      <p><strong>Data de referência:</strong> 01/08/2026</p>
    </div>

    <div class="section-title">Meta Vinculada</div>
    <div class="card">
      <p><strong>Meta:</strong> 3º Simpósio do Patrimônio Cultural de BH</p>
      <p><strong>Local de realização:</strong> Museu Histórico Abílio Barreto (MHAB)</p>
    </div>

    <div class="section-title">Rubricas do 5º Aditivo</div>
    <table>
      <thead>
        <tr>
          <th>Rubrica</th>
          <th>Natureza</th>
          <th>Cód.</th>
          <th class="value">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Coordenador Geral (Simpósio)</td>
          <td>339039</td>
          <td>42</td>
          <td class="value">R$ 3.000,00</td>
        </tr>
        <tr>
          <td>Produção</td>
          <td>339039</td>
          <td>42</td>
          <td class="value">R$ 2.500,00</td>
        </tr>
        <tr>
          <td>Apresentações Culturais</td>
          <td>339039</td>
          <td>22</td>
          <td class="value">R$ 6.700,00</td>
        </tr>
        <tr>
          <td>Monitores (Diárias)</td>
          <td>339039</td>
          <td>42</td>
          <td class="value">R$ 600,00</td>
        </tr>
        <tr>
          <td>Material Educativo (kit)</td>
          <td>339030</td>
          <td>12</td>
          <td class="value">R$ 3.000,00</td>
        </tr>
        <tr class="total-row">
          <td colspan="3"><strong>TOTAL 5º ADITIVO</strong></td>
          <td class="value"><strong>R$ 15.800,00</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="section-title" style="margin-top:24px">Próximos Passos</div>
    <div class="steps">
      <p>✅ As rubricas do 5º Aditivo já estão <strong>ativas na plataforma</strong> e disponíveis para uso imediato.</p>
      <p>📋 Para registrar despesas vinculadas ao Simpósio, acesse a seção <strong>Compras</strong> e selecione a meta <strong>"3º Simpósio do Patrimônio Cultural de BH"</strong> e a rubrica correspondente.</p>
      <p>🔍 As rubricas aparecem na lista com o prefixo <strong>[5º Aditivo]</strong> para fácil identificação.</p>
    </div>

  </div>
  <div class="footer">
    Enviado automaticamente em ${DATA_ENVIO} · Plataforma Museus Centro — Perini Projetos
  </div>
</div>
</body>
</html>
`.trim();

export default function NotificarAditivoButton() {
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleEnviar() {
    if (!window.confirm(
      `Enviar notificação do 5º Aditivo para:\n\n${DESTINATARIOS.join('\n')}\n\nDeseja prosseguir?`
    )) return;

    setLoading(true);

    try {
      // Cria a SystemMessage no banco para que sendSystemMessage possa atualizá-la
      const msg = await base44.asServiceRole.entities.SystemMessage.create({
        assunto: ASSUNTO,
        corpo: CORPO_HTML,
        destinatarios: DESTINATARIOS,
        status: 'pendente',
        tipo: 'notificacao_aditivo',
      }).catch(async () => {
        // Se asServiceRole não disponível no frontend, tenta sem role
        return await base44.entities.SystemMessage.create({
          assunto: ASSUNTO,
          corpo: CORPO_HTML,
          destinatarios: DESTINATARIOS,
          status: 'pendente',
          tipo: 'notificacao_aditivo',
        });
      });

      const messageId = msg?.id;
      if (!messageId) throw new Error('Não foi possível criar registro da mensagem.');

      const res = await base44.functions.invoke('sendSystemMessage', {
        messageId,
        destinatarios: DESTINATARIOS,
        assunto: ASSUNTO,
        corpo: CORPO_HTML,
        enviar_email: true,
      });

      const result = res?.data || res;

      if (result?.emailErrors?.length > 0) {
        const falhas = result.emailErrors.join(', ');
        const sucessos = DESTINATARIOS.filter(e => !result.emailErrors.includes(e));
        toast.warning(
          `Enviado para ${sucessos.length} destinatário(s). Falha em: ${falhas}`,
          { duration: 8000 }
        );
      } else {
        setEnviado(true);
        toast.success(
          `✅ Notificação do 5º Aditivo enviada com sucesso para:\n${DESTINATARIOS.join(', ')}`,
          { duration: 8000 }
        );
      }
    } catch (err) {
      toast.error('Erro ao enviar notificação: ' + (err?.message || 'desconhecido'), { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={loading || enviado}
      onClick={handleEnviar}
      className="gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mail className="h-4 w-4" />
      )}
      {loading ? 'Enviando...' : enviado ? '✓ Notificação Enviada' : 'Enviar Notificação do 5º Aditivo'}
    </Button>
  );
}