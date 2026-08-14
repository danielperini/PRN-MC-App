# Entrega técnica da migração — Gestor Museus Centro

**Estado:** NOT_RECONCILED  
**Data da auditoria:** 13 de agosto de 2026  
**Ambiente:** https://appgestor.periniprojetos.com.br

## Objetivo

Este documento registra o estado técnico verificável da migração Base44/Google Drive para PostgreSQL e storage próprio na Hostinger. Ele preserva a distinção entre dados efetivamente migrados e dados ainda sem fonte estruturada comprovada.

## Infraestrutura

- Aplicação: `/opt/gestor-museus`
- Banco: PostgreSQL, container `appgestor-db`
- API: Node, container `appgestor-api`
- Web: container `gestor-museus-web`
- Storage: `/opt/gestor-museus/storage/`

## Dados confirmados

| Domínio | Registros | Estado |
|---|---:|---|
| Usuários | 26 | Migrado |
| Relatórios | 54 | Migrado |
| Atividades de relatório | 210 | Migrado |
| Fotos de relatório | 1.623 | Migrado, com pendências físicas |
| Anexos | 1.410 | Base canônica |
| Rubricas | 52 | Estrutura presente |
| Metas | 26 | Estrutura presente |
| Atividades | 210 | Estrutura presente |
| Programações | 366 | Estrutura presente |
| Compras | 225 | Migradas |
| Documentos de compra | 410 | Vinculados |
| Movimentações bancárias | 0 | Não migradas |

## Documentos

- 1.407 anexos estão `OK`.
- 3 anexos permanecem `PENDENTE`: CEMIG, PPE/NF22 e Petróleo Major.
- A competência documental é determinada pela data de emissão da NF.
- `COMP.pdf` é comprovante de pagamento, não NF e não cria débito.
- Duplicatas documentais são preservadas como evidência e excluídas de somatórios.

## Relatórios e público

- Relatórios: 42 aprovados, 10 rascunhos e 2 devolvidos.
- Atividades: META 131, ROTINA 43, EXTRA 5, sem classificação 31.
- Público por museu: MUMO 17.983; MHAB 28.151; MIS 4.149; Atuação Geral 431.

## Pendências conhecidas

1. Não há movimentações bancárias ou extratos estruturados; compras não podem ser consideradas pagas por inferência.
2. O conjunto estruturado de rubricas do 4º Aditivo (R$ 81.719,85) não foi localizado. Ele não pode ser recriado por constante de frontend.
3. 51 atividades têm referência de meta legada e 32 não têm meta.
4. 20 fotos possuem referência externa Google Photos, mas não têm cópia local e a origem retorna HTTP 403.
5. Os três anexos pendentes devem ser preservados fora de somatórios, sem exclusão automática.

## Regras de retomada

A reconciliação só poderá ser retomada quando houver fonte oficial verificável para extratos/pagamentos, rubricas do 4º Aditivo ou vínculos de meta. Toda alteração futura deve criar backup, trilha de auditoria e manter os documentos históricos.

## Critério de entrega

A migração está tecnicamente entregue como espelho fiel das fontes encontradas, mas não deve ser apresentada como execução financeira reconciliada. Cards financeiros devem informar que os dados estão em processo de conciliação até a chegada das fontes canônicas.
