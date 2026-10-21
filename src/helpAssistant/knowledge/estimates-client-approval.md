---
title: Enviar e aprovar orçamentos com o cliente
module: estimates
routes: [/estimate-response/:estimateId/:emailCripto, /seller/estimates]
---

# Enviar e aprovar orçamentos com o cliente

## Para que serve

Esta base explica o caminho de um orçamento depois de criado: como ele é enviado ao cliente por e-mail, o que o cliente vê na página de resposta, como ele aceita e assina, como ele recusa, e quais são as formas de aprovação feitas pelo vendedor, sem o cliente, como a aprovação manual e a remoção de assinatura.

## Onde encontrar

- **Envio**: na lista de orçamentos (menu "Estimates"), abra o menu de três pontos da linha e escolha "Send By Email" (em português, "Enviar por e-mail"). Também é possível enviar logo depois de criar, pelo botão "Create & Send" na tela de resumo do orçamento.
- **Aprovação manual e remoção de assinatura**: também no menu de três pontos da linha da lista, e na aba "Estimate" do detalhe do projeto.
- **Página do cliente**: o cliente não usa o sistema. Ele recebe um link por e-mail e abre a página de resposta do orçamento, sem precisar fazer login.
- Quem pode enviar e aprovar: usuários com a permissão **"Estimates"**.

## O que aparece na tela

### Janela de envio ("Send" / "Email Preview")

- Campo **"To"** (para): já vem com o e-mail do cliente. Você pode incluir outros destinatários separados por vírgula, no campo "Enter multiple email addresses separated by commas".
- Opção **"Send me a copy"** (enviar uma cópia para mim): quando marcada, você também recebe o e-mail.
- Campo **"Email Body"** (corpo do e-mail): texto personalizado, com o placeholder "Enter your custom message here...". Ele aparece no centro do e-mail.
- Seção **"Attachments"** (anexos):
  - "Automatic Attachment": o PDF do orçamento, que vai anexado automaticamente.
  - Área "Click to upload" para anexar arquivos extras, com a indicação "Most file types allowed". É possível anexar até 10 arquivos extras.
- Pré-visualização do e-mail, nas versões "Email Desktop Preview" e "Email Mobile Preview".
- Botões "Back to Edit" (voltar para editar) e "Send" (enviar). Durante o envio, o botão mostra "Sending...".
- Mensagens de erro: "Client email address is required." (e-mail do cliente obrigatório) e "Invalid client email address." (e-mail inválido).
- Ao enviar com sucesso, aparece "Email sent successfully!".

### Página do cliente (link do e-mail)

- Cabeçalho com o logotipo do sistema.
- O corpo da página mostra o documento do orçamento, como o cliente vai receber o PDF: capa, serviços e valores, termos, imagens e dados da empresa.
- Quando o orçamento já foi respondido ou cancelado, aparece uma marca d'água grande no documento com o status: "Approved" (aprovado), "Rejected" (rejeitado) ou "Canceled" (cancelado).
- Rodapé fixo com os botões:
  - **"Accept & Sign"** (aceitar e assinar): aparece quando o orçamento está pendente, ou aprovado mas aguardando assinatura.
  - **"Decline Estimate"** (recusar orçamento): mesmas condições do botão anterior.
  - **"Download"** (baixar): baixa o PDF do orçamento, quando o PDF existe.
- Texto de contato: "Questions about this estimate? Contact" seguido do nome e do e-mail da empresa.
- Se o link não for válido ou o orçamento não for encontrado, aparece a tela "Estimate Not Found", com a mensagem de erro correspondente.

### Janela de assinatura ("Signature")

- Área para desenhar a assinatura com o dedo ou o mouse. Ao confirmar, a assinatura é enviada e validada.

### Janela de recusa

- Título: "Decline Estimate". Mensagem: "Are you sure you want to decline this estimate? This action cannot be undone."
- Botões: "Cancel" e "Yes, Decline".

### Telas de resultado

- Após aceitar: "Estimate Accepted", com a mensagem "Thank you for accepting the estimate. We will contact you shortly to schedule the work.".
- Após recusar: "Estimate Declined", com a mensagem "The estimate has been declined. If you have any questions or would like to discuss alternatives, please contact us.".

### Ações do vendedor (menu de três pontos e aba "Estimate" do projeto)

- **"Manual Approval"** (aprovação manual): janela "Approve estimate {número} without sending to the client. A signature will be applied to the PDF.", com o campo "Client name (optional)". O texto do campo explica que o nome é usado na assinatura do PDF e que, se ficar vazio, o sistema usa o nome do cliente do projeto ou do contexto de trabalho.
- **"Remove Signature"** (remover assinatura): janela "Remove Client Signature", que explica que a área de assinatura será limpa e que o orçamento vai exigir uma nova assinatura, do cliente ou por aprovação manual.

## Como fazer

### Como enviar um orçamento por e-mail

1. Na lista de orçamentos, abra o menu de três pontos da linha do orçamento.
2. Escolha "Send By Email". A opção não aparece para orçamentos cancelados.
3. Confira o campo "To". O e-mail do cliente já vem preenchido. Acrescente outros destinatários se quiser.
4. Marque "Send me a copy" se quiser receber uma cópia.
5. Escreva o texto no campo "Email Body", se quiser personalizar a mensagem.
6. Se precisar, anexe arquivos extras, até 10.
7. Confira a pré-visualização e clique em "Send".

### Como reenviar um orçamento já enviado

1. Abra o envio de novo, pelo mesmo menu "Send By Email".
2. Confira os destinatários e clique em "Send". O sistema envia o e-mail novamente com o PDF atual.

### Como o cliente aceita e assina

1. O cliente abre o link do e-mail e lê o orçamento.
2. Clica em "Accept & Sign".
3. Desenha a assinatura na janela "Signature" e confirma.
4. Se a assinatura estiver legível, o orçamento passa a Aprovado, e aparece "Estimate Accepted".

### Como o cliente recusa

1. No rodapé da página, clica em "Decline Estimate".
2. Confirma em "Yes, Decline".
3. O orçamento passa a Rejeitado e aparece "Estimate Declined".

### Como baixar o PDF pela página do cliente

1. No rodapé, clique em "Download".
2. Se o PDF não estiver disponível, aparece a mensagem "PDF not available for this estimate".

### Como fazer uma aprovação manual

1. Na lista, abra o menu de três pontos do orçamento, ou na aba "Estimate" do projeto, abra as ações do orçamento.
2. Escolha "Manual Approval".
3. Opcionalmente, digite o nome do cliente no campo "Client name (optional)". Esse nome aparece na assinatura do PDF.
4. Clique em "Apply manual approval" (aplicar aprovação manual).
5. O orçamento passa a Aprovado, e a assinatura aplicada no PDF indica que a aprovação foi manual.

Esta opção aparece para orçamentos pendentes e para orçamentos aprovados que ainda aguardam assinatura.

### Como remover a assinatura do cliente

1. Na aba "Estimate" do projeto, abra as ações do orçamento aprovado.
2. Escolha "Remove Signature" (remover assinatura).
3. Confirme em "Remove Client Signature".
4. A área de assinatura do PDF é limpa, e a linha passa a mostrar "Pending Client Signature" (assinatura do cliente pendente).

Esta opção aparece apenas para orçamentos aprovados que não estão aguardando assinatura.

## Status e ciclo de vida

- **Pending (pendente)**: o orçamento foi enviado ou está aguardando o cliente. O cliente pode aceitar e assinar, recusar, ou o vendedor pode fazer a aprovação manual.
- **Approved com assinatura pendente**: o orçamento está aprovado, mas ainda exige assinatura. Acontece quando um orçamento é convertido em projeto sem assinatura, ou quando a assinatura do cliente é removida. Nesse caso o cliente ainda pode aceitar e assinar pelo link.
- **Approved (aprovado)**: o cliente assinou, ou houve aprovação manual.
- **Rejected (rejeitado)**: o cliente recusou pelo link. A página deixa de mostrar os botões de resposta.
- **Canceled (cancelado)**: o vendedor cancelou. O link mostra a marca "Canceled" e não permite resposta.

## Regras de negócio

- **Link de acesso**: o link do cliente é válido apenas para o orçamento que ele identifica. Não é possível usar o link de um orçamento para responder a outro.
- **Uma única resposta**: o cliente só pode responder enquanto o orçamento está pendente, ou aprovado aguardando assinatura. Depois de respondido (aceito ou recusado), o sistema não aceita nova resposta pelo link.
- **Validação da assinatura**: a assinatura precisa ser uma imagem válida e legível. As mensagens de erro são:
  - "Please provide a clearer signature before confirming." (assinatura pouco legível).
  - "We could not verify this signature image. Please clear it and sign again. If the problem continues, refresh the page or use another browser." (imagem não verificada).
  - "Signature image is too large." e "Signature image dimensions are too large." (imagem grande demais).
  - "A valid signature image is required." (imagem inválida).
- **Efeitos de aceitar e assinar**:
  - O orçamento passa a Aprovado e a assinatura do cliente é aplicada ao PDF.
  - O projeto passa para o status "Accepted" (aceito), se ainda não estiver em um status de andamento.
  - A empresa e o vendedor recebem um e-mail avisando que o orçamento foi aprovado.
  - O cliente recebe um e-mail de confirmação.
- **Efeitos de recusar**: o orçamento passa a Rejeitado, e a empresa e o vendedor recebem um e-mail avisando da recusa.
- **Tamanho do envio**: o limite total do e-mail é de cerca de 28 MB, incluindo o PDF e os anexos extras.
  - Se o PDF sozinho ultrapassar esse limite, ele não é anexado e o cliente recebe um link seguro para revisar o orçamento.
  - Se o envio ainda ficar grande demais, o sistema recusa o envio com aviso de tamanho. Nesse caso, reduza os anexos extras e tente de novo.
- **Aprovação manual**: é possível apenas para orçamentos pendentes ou aprovados que aguardam assinatura. Ao aprovar, os serviços do orçamento passam a ser criados no projeto, se ainda não existirem, e o PDF recebe uma marca de aprovação manual com o nome informado.
- **Remoção de assinatura**: limpa a assinatura do PDF e mantém o orçamento aprovado, mas exigindo nova assinatura.
- **Assinatura e edição**: se um orçamento aprovado for alterado em serviços, descrição, termos ou local, a assinatura do cliente é removida do PDF, pois o conteúdo aprovado mudou. Veja a base "Criar e editar orçamentos".
- **Aviso de conversão**: converter um orçamento pendente em projeto marca o orçamento como Aprovado, mas com assinatura pendente. Veja a base "Orçamentos (Estimates) - lista e visão geral".

## Relação com outros módulos

- **Orçamentos (lista)**: onde ficam as ações de envio, aprovação manual, remoção de assinatura, cancelamento e conversão.
- **Projetos**: a aprovação do orçamento muda o status do projeto para aceito. A aprovação manual cria os serviços no projeto.
- **Faturas**: depois de aprovado, o orçamento pode ser convertido em fatura.
- **Contratos**: o orçamento pode ser usado como base para o contrato do projeto.
- **Clientes**: o e-mail do cliente é o destinatário padrão do envio e o destinatário da confirmação de aprovação.
- **Configurações da empresa**: o nome, o logotipo, o telefone e o e-mail da empresa aparecem na página do cliente e nos e-mails.

## Dúvidas frequentes

**P:** O cliente perdeu o e-mail. Como envio de novo?
**R:** Abra o orçamento na lista, escolha "Send By Email" no menu de três pontos e clique em "Send". O e-mail é enviado novamente com o PDF atual.

**P:** O cliente diz que o link não funciona, aparece "Estimate Not Found". O que fazer?
**R:** Confira se o link foi copiado por inteiro e se o orçamento não foi cancelado ou excluído. Se necessário, reenvie o orçamento pela opção "Send By Email".

**P:** O cliente tentou assinar e apareceu "Please provide a clearer signature before confirming.". Por quê?
**R:** A assinatura está pouco legível ou muito pequena. Ele deve limpar a área e assinar de novo, com traço mais firme. Se o problema continuar, pode atualizar a página ou usar outro navegador.

**P:** O cliente aceitou, mas o orçamento ainda aparece pedindo assinatura. Está certo?
**R:** Depende do caminho. Se o orçamento foi convertido em projeto antes da assinatura, ele fica Aprovado com assinatura pendente, e o cliente ainda precisa assinar pelo link. Depois da assinatura pelo link, o orçamento fica aprovado sem pendência.

**P:** Posso aprovar um orçamento sem o cliente assinar?
**R:** Sim, pela "Manual Approval". O sistema aplica uma marca de aprovação manual no PDF, com o nome do cliente que você informar ou com o nome do cliente cadastrado.

**P:** Como faço para tirar a assinatura do cliente de um orçamento?
**R:** Na aba "Estimate" do projeto, use "Remove Signature" no orçamento aprovado. Depois, o orçamento volta a exigir uma nova assinatura, do cliente ou por aprovação manual.

**P:** O cliente recusou, mas quer rever a proposta. O que faço?
**R:** Um orçamento recusado não aceita nova resposta pelo link. Para fazer uma nova proposta ao cliente, crie um novo orçamento.

**P:** O envio falhou porque o arquivo ficou muito grande. O que fazer?
**R:** Remova alguns anexos extras e envie novamente. O PDF do orçamento é substituído por um link seguro quando ele sozinho é muito grande, então o cliente ainda consegue ver o documento.

**P:** Recebi um aviso de que o cliente recusou. Quem recebe esse aviso?
**R:** O vendedor responsável pelo projeto e o e-mail da empresa recebem o aviso de recusa.
