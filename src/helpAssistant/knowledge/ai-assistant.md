---
title: Assistente de IA (Beta)
module: general
routes: [/ai-assistant]
---

# Assistente de IA (Beta)

## Para que serve

O Assistente de IA responde perguntas sobre o negócio em linguagem natural, usando os dados atuais da sua empresa no SmartBuild. Você pergunta como faria para uma pessoa da equipe, e ele responde com texto, métricas e, quando faz sentido, tabelas e gráficos. Também é possível exportar a resposta em CSV ou PDF.

Exemplos de perguntas que ele responde, segundo a própria tela:

- projetos, clientes, faturas, cartões de ponto, margens e relatórios executivos;
- quais projetos estão consumindo mais custos no mês;
- quais faturas estão vencidas e qual o impacto no caixa nos próximos 30 dias;
- qual cliente tem maior receita e maior risco de atraso.

A funcionalidade está marcada como "Beta" no menu.

## Onde encontrar

- **Menu:** "Platform" (Plataforma) > "IA Assistant (Beta)" (Assistente de IA, Beta).
- **Quem vê:** todos os usuários da empresa. Este item não tem permissão específica no menu.
- **Título da tela:** "AI Assistant" (Assistente de IA).
- **Layout:** a tela ocupa toda a área, sem a barra superior. O menu lateral continua disponível para voltar a outras telas.

## O que aparece na tela

**Tela inicial de uma conversa nova**

- Mensagem de boas-vindas: "I'm your SmartBuild AI Assistant. Ask about projects, clients, invoices, margins or reports, and I'll answer with live business data." (Sou o Assistente de IA do SmartBuild. Pergunte sobre projetos, clientes, faturas, margens ou relatórios e responderei com dados atuais da sua empresa.)
- Título: "Ask anything about your business." (Pergunte qualquer coisa sobre sua empresa.)
- Quatro atalhos de pergunta, que enviam a pergunta com um clique:
  - "Top spending project" (Projeto com maior gasto): "Which project is consuming the most cost this month?" (Qual projeto está consumindo mais custos neste mês?)
  - "Executive report" (Relatório executivo): "Generate an executive report with charts for projects currently in progress." (Gere um relatório executivo com gráficos dos projetos atualmente em andamento.)
  - "Client risk" (Risco de clientes): "Which client has the highest revenue and the highest delay risk?" (Qual cliente possui a maior receita e o maior risco de atraso?)
  - "Invoice aging" (Vencimento de faturas): "Show overdue invoices and the cash impact for the next 30 days." (Mostre as faturas vencidas e o impacto no caixa para os próximos 30 dias.)

**Campo de pergunta**

- Texto de apoio: "Ask about a project, client, invoice, time card, or report..." (Pergunte sobre um projeto, cliente, fatura, cartão de ponto ou relatório...).
- Botão de enviar, com o rótulo "Send message" (Enviar mensagem).
- Botão de gravação de voz, com os rótulos "Start voice recording" (Iniciar gravação de voz) e "Stop voice recording" (Parar gravação de voz).

**Respostas**

- Cada resposta mostra o nome "AI Assistant" (Assistente de IA) e a hora.
- Quando a resposta traz um relatório, aparecem os botões "Export CSV" (Exportar CSV) e "Export PDF" (Exportar PDF) logo abaixo.
- Enquanto a resposta é preparada, aparece uma frase de andamento que muda conforme o assunto da pergunta.

**Histórico de conversas**

- Painel lateral "History" (Histórico), com o botão "New chat" (Nova conversa).
- Lista de conversas salvas, com o resumo da primeira pergunta. Quando não há conversas, aparece "No saved conversations yet." (Ainda não há conversas salvas.)
- Em telas pequenas, o histórico abre e fecha por botões próprios: "Open conversation history" (Abrir histórico de conversas) e "Close conversation history" (Fechar histórico de conversas).
- Cada conversa tem o botão "Delete conversation" (Excluir conversa).

**Mensagens de erro**

- "I couldn't complete that request right now. Please try again in a moment." (Não foi possível concluir essa solicitação agora. Tente novamente em instantes.), seguida de "Try rephrasing the question." (Tente reformular a pergunta.) e "If the issue continues, try again shortly." (Se o problema continuar, tente novamente em alguns instantes.).
- Se o áudio não puder ser transcrito: "I couldn't transcribe the audio right now. Please try again." (Não foi possível transcrever o áudio agora. Tente novamente.).
- Se o microfone não for liberado: "Please allow microphone access to record audio." (Permita o acesso ao microfone para gravar o áudio.).

## Como fazer

### Como fazer uma pergunta

1. Abra "IA Assistant (Beta)" no menu.
2. Digite sua pergunta no campo de texto ou clique em um dos atalhos.
3. Clique em enviar ou pressione Enter. Para quebrar a linha dentro da pergunta, use Shift + Enter.
4. Aguarde a resposta. Você pode continuar a conversa com perguntas de acompanhamento, que usam o contexto das perguntas anteriores.

### Como começar uma conversa nova

1. Clique em "New chat" (Nova conversa) no histórico.
2. A conversa anterior continua salva no histórico.

### Como abrir uma conversa anterior

1. Abra o histórico.
2. Clique na conversa desejada. As mensagens dela são carregadas.

### Como excluir uma conversa

1. Abra o histórico e localize a conversa.
2. Clique em "Delete conversation" (Excluir conversa).
3. Confirme em "Delete this conversation? This action cannot be undone." (Excluir esta conversa? Esta ação não pode ser desfeita.).

A exclusão é definitiva. Não há como recuperar a conversa depois.

### Como falar em vez de digitar

1. Clique no botão de gravação de voz e fale a pergunta.
2. Clique de novo para parar. O texto transcrito aparece no campo de pergunta.
3. Confira o texto e envie.

### Como exportar uma resposta em CSV ou PDF

Há duas maneiras:

- **Pelo botão:** em uma resposta que tem relatório, clique em "Export CSV" ou "Export PDF".
- **Pela pergunta:** escreva na pergunta que você quer o arquivo. Se a pergunta citar "pdf", o PDF é baixado logo após a resposta, desde que ela traga um relatório. Se citar "csv", "excel", "spreadsheet", "planilha" ou "hoja de cálculo", o CSV é baixado nas mesmas condições.

O arquivo CSV abre em planilhas, como Excel. O PDF traz o título do relatório, as métricas principais e os dados da tabela ou do gráfico.

## Status e ciclo de vida

- **Conversa nova:** começa com a mensagem de boas-vindas e com o título "New conversation" (Nova conversa). Depois da primeira pergunta, a conversa passa a ter um título próprio, com base no assunto.
- **Conversa salva:** fica no histórico até ser excluída.
- **Resposta:** é gerada a partir dos dados do momento da pergunta. Se os dados mudarem depois, é preciso perguntar de novo para ter a informação atualizada.

## Regras de negócio

- **Dados usados:** as respostas usam os dados da empresa à qual você está conectado no momento. Trocar de empresa muda os dados usados nas próximas perguntas.
- **Histórico individual:** cada conversa pertence ao usuário que a criou. Outros usuários da empresa não veem o histórico de quem perguntou.
- **Exclusão:** excluir uma conversa apaga o histórico dela para você. Não é possível desfazer.
- **Beta:** a funcionalidade está em fase de testes. Respostas podem ser imprecisas. Para decisões importantes, confira os números nas telas do módulo correspondente, como Dashboard, Projetos, Faturas ou Cartões de ponto.
- **Exportação:** os arquivos são gerados a partir da resposta. Só há exportação quando a resposta traz um relatório.

## Relação com outros módulos

- **Projetos, clientes, faturas e cartões de ponto:** são as principais fontes das respostas. O que está cadastrado e atualizado nesses módulos aparece nas respostas.
- **Dashboard:** muitas perguntas sobre caixa, vencimentos e projetos têm números parecidos com os do painel. Pequenas diferenças podem acontecer por causa de período e critério de cálculo.
- **Permissões:** o item de menu não exige permissão. Consulte o documento de visão geral para entender as permissões de cada área.

## Dúvidas frequentes

**P:** O que o assistente faz exatamente?
**R:** Responde perguntas sobre os dados da sua empresa, como projetos, clientes, faturas, cartões de ponto, margens e relatórios, e pode gerar relatórios para exportar.

**P:** Por que o item se chama "IA Assistant (Beta)"?
**R:** Porque a funcionalidade ainda está em fase de testes. Confira números importantes nas telas de origem antes de decidir.

**P:** Posso pedir um relatório em PDF?
**R:** Sim. Escreva na pergunta que você quer em PDF, ou clique em "Export PDF" na resposta que traz o relatório.

**P:** Consigo abrir uma planilha com os dados?
**R:** Sim. Peça o CSV na pergunta (por exemplo, "em planilha") ou clique em "Export CSV" na resposta.

**P:** Excluí uma conversa por engano. Consigo recuperar?
**R:** Não. A exclusão é definitiva. Se precisar da informação, faça a pergunta de novo.

**P:** Outro usuário da empresa vê minhas perguntas?
**R:** Não. O histórico de conversas é pessoal.

**P:** A resposta trouxe um número diferente do que vejo no Dashboard. Por quê?
**R:** Os dois podem usar períodos ou critérios de cálculo diferentes. Confira o período da pergunta e o período escolhido no Dashboard.

**P:** A pergunta não foi respondida e apareceu uma mensagem de erro. O que faço?
**R:** Tente reformular a pergunta, com mais detalhes, como o nome do projeto ou o período. Se o problema continuar, tente de novo mais tarde.

**P:** Posso usar a voz em vez de digitar?
**R:** Sim. Use o botão de gravação de voz, confira o texto transcrito e envie. Permita o acesso ao microfone quando o navegador pedir.

**P:** Eu troquei de empresa e as respostas mudaram. É normal?
**R:** Sim. As respostas usam os dados da empresa à qual você está conectado no momento.
