---
title: O que a plataforma não tem ou não faz hoje (limitações)
module: general
routes: [/home]
---

# O que a plataforma não tem ou não faz hoje

## Para que serve

Use este documento quando o usuário perguntar se a plataforma faz algo que ela não faz, ou quando estiver avaliando se ela atende ao seu negócio. Responda com franqueza que o recurso não existe hoje, sem sugerir alternativas inventadas. Tudo abaixo está confirmado nos documentos dos módulos.

## Geral e conta

- O item "Tutorial (Coming Soon)" aparece desabilitado e não funciona nesta versão.
- O "IA Assistant (Beta)" foi desativado; o Assistente SmartBuild o substitui. O Assistente é somente leitura: não cria, edita, exclui nem envia nada no sistema.
- O idioma é salvo no navegador, não na conta, e a tela de login não tem seletor de idioma. As telas "Access restricted" e "Mobile Access Required" aparecem só em inglês.
- Os itens "Management", "Settings" e "Account" do menu do usuário não executam ação.
- O chat é interno, entre a equipe da própria empresa; não é canal de suporte. Só Owner e Administrator criam e editam grupos, e apagar mensagem só é possível pelo computador.
- O limite de usuários depende do plano; usuários extras são cobrados na próxima fatura.

## Integrações

- **Contas a pagar** não se ligam a projetos, clientes, faturas, QuickBooks nem Stripe. É um controle separado.
- **QuickBooks:** projetos são sincronizados apenas do QuickBooks para o SmartBuild; projetos criados no SmartBuild não são exportados. Um orçamento só vai ao QuickBooks se o projeto já estiver ligado a um projeto de lá. Cancelamentos feitos direto no QuickBooks podem não aparecer automaticamente no SmartBuild. Mesclar clientes não altera o QuickBooks.
- **Lembretes de cobrança** automáticos rodam uma vez por dia, às 9h (horário do servidor), só para faturas Pending, e não se aplicam a faturas QuickBooks com pagamento parcial.
- **Contratos** são independentes das faturas: não há cobrança automática vinculada a um contrato.

## Clientes, catálogo e projetos

- Clientes não têm status ativo/inativo. Exclusão e mesclagem são definitivas, e a mesclagem não tem segunda confirmação.
- Exclusão de galeria e de serviço do catálogo é imediata, sem janela de confirmação.
- O status do projeto só muda pela lista ("Change Status") ou pela aba Details, um projeto por vez. O status "Canceled" não é selecionável nem listado.
- O feed carrega até 200 publicações, a busca vale só para as carregadas, publicações não são editáveis e a página pública do cliente só lê, sem curtir nem comentar.

## Orçamentos, contratos e ordens de alteração

- Orçamento recusado não aceita nova resposta pelo link: para nova proposta, crie outro orçamento. Cancelar um orçamento aprovado remove a assinatura e desvincula os serviços do projeto.
- A IA dos orçamentos não altera impostos, descontos, status, assinaturas, faturas, pagamentos, agendas nem PDFs.
- Contratos só aceitam PDF. Não há e-mail automático ao assinar. Contrato assinado não pode ser editado, cancelado nem excluído, e contrato expirado não é reenviado sem aumentar a validade.
- Ordem de alteração: o cliente não tem botão de recusa (só aceita e assina ou baixa o PDF). Aprovada, não pode ser editada nem excluída.

## Faturas e pagamentos

- Faturas pagas não podem ser editadas nem canceladas. Faturas Stripe enviadas pela Stripe não têm "Edit Invoice"; editar uma fatura Stripe cancela a anterior e cria outra.
- Faturas do tipo "Other" aceitam um único pagamento, sempre pelo valor total, sem pagamento parcial.
- Faturas QuickBooks com pagamento parcial não podem ser canceladas.
- No Dashboard, as vendas contam pela data de criação da fatura, não pela data do pagamento, e o cartão "Customers" não muda com o período.

## Agenda, equipe e horas

- O "Mark as Completed" não fica na tela Job Schedule, só na aba Schedule do projeto.
- No Job Dispatch, o status "On the Way" existe nas traduções, mas o sistema não o gera.
- Atividades não calcula horas pagas nem valores (use Time Cards), e o tempo médio online não considera pausas.
- Horas extras só aparecem com "Over Time" ligado no cadastro do funcionário. Pedidos de ponto são feitos só pelo aplicativo do funcionário.

## Subcontratados, propostas e ordens de serviço

- Subcontratado com lançamentos ou vínculos não pode ser excluído. O "Total Paid" não separa pagos de não pagos.
- Bid Requests: proposta aprovada não pode ser substituída, solicitação cancelada não reabre e não se aceita proposta após o prazo sem reabrir.
- Work Orders: editar volta a ordem para Pending e apaga as assinaturas; cancelar não apaga a ordem.

## Como responder

- Se o recurso perguntado estiver nesta lista ou não constar nos documentos, diga que não existe hoje, em uma ou duas frases.
- Não invente integrações, automações nem planos futuros. Não indique suporte do SmartBuild como solução.
