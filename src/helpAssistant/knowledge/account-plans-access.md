---
title: Conta, planos e acesso (login, empresa, idioma, assinatura)
module: general
routes: [/, /login, /plans, /join/:inviteCode, /forgot-password, /reset-password, /company-selection, /subscription-plans, /subscription-expired]
---

# Conta, planos e acesso (login, empresa, idioma, assinatura)

## Para que serve

Este documento explica como entrar no SmartBuild, como trocar de empresa, como mudar o idioma, como recuperar a senha, como criar uma conta com um plano e o que acontece quando a assinatura expira. Também explica por que uma tela ou um item do menu pode não aparecer para o usuário.

## Onde encontrar

- **Entrada no sistema:** a página inicial do SmartBuild (tela de login, "Welcome back" / "Bem-vindo de volta").
- **Recuperar senha:** link "Forgot password?" (Esqueceu a senha?), na tela de login.
- **Criar conta:** link "Sign up" (Cadastre-se), na tela de login.
- **Trocar de empresa:** menu do usuário (nome e foto no rodapé do menu lateral) > "Switch Company" (Trocar empresa). Esse item só aparece quando a conta tem acesso a mais de uma empresa e o modo multiempresa está ativo.
- **Idioma:** menu do usuário > "Languages" (Idiomas) > "English", "Português" ou "Español".
- **Planos e assinatura:** tela "Choose your plan" (Escolha seu plano) e tela "Subscription Expired" (Assinatura expirada), que aparecem em situações específicas (ver abaixo).

## O que aparece na tela

**Login**

- Campos "Email" (placeholder "name@company.com") e "Password" (placeholder "Enter your password").
- Botão "Sign in" (Entrar), que muda para "Signing in..." (Entrando...) durante a entrada.
- Links "Forgot password?" (Esqueceu a senha?) e "Don't have an account? Sign up" (Ainda não tem uma conta? Cadastre-se).
- Mensagens de erro:
  - "Please check your credentials and try again." (Confira suas credenciais e tente novamente.), para e-mail ou senha incorretos;
  - "Access denied: User is disabled." (Acesso negado: o usuário está desativado.), para usuário desativado.
- A tela de login não tem seletor de idioma. Ela usa o idioma salvo no navegador (ou inglês, se não houver).

**Seleção de empresa ("Select Company")**

- Título "Select Company" (Selecionar Empresa) e subtítulo "Choose a company to continue" (Escolha uma empresa para continuar).
- Lista "Your Companies" (Suas Empresas). Cada empresa tem o botão "Select Company" (Selecionar Empresa), que vira "Selecting..." (Selecionando...) durante a troca. Na troca de empresa, a empresa atual aparece com o rótulo "Current" (Atual).
- Sem acesso a empresa nenhuma: "No Companies Found" (Nenhuma empresa encontrada), com a orientação "You don't have access to any companies yet. Please contact your administrator." (Você ainda não tem acesso a nenhuma empresa. Entre em contato com o administrador.).
- Falha ao carregar: "We couldn't load your companies. Please try again." (Não foi possível carregar suas empresas. Tente novamente.).
- Falha ao selecionar: "Error selecting company. Please try again." (Erro ao selecionar empresa. Tente novamente.).
- Se a empresa escolhida for de perfil Worker, aparece a tela "Mobile Access Required" (Acesso Mobile Necessário). Ela explica que o funcionário de campo deve usar o aplicativo, com os itens Check-in/Check-out, Projetos e Notificações, e o botão "Download for iOS" (Baixar para iOS). Para Android, aparece "Android version coming soon" (Versão para Android em breve). O botão "Back to Login" (Voltar ao Login) retorna à tela de entrada.

**Recuperação de senha ("Password Recovery")**

- Etapa 1: subtítulo "Enter your email to receive a verification code" (Digite seu e-mail para receber um código de verificação), campo "Type your email..." e botão "Get Code" (Receber código).
- Etapa 2 (verificação): "Enter the verification code" (Digite o código de verificação), com o botão "Confirm Code" (Confirmar código) e o link "Resend code" (Reenviar código).
- Etapa 3 (nova senha): "Create your new password" (Crie sua nova senha), campos "New Password" e "Confirm new password", indicador de força ("Weak" / "Medium" / "Strong") e o botão "Reset Password" (Redefinir senha).
- Sucesso: "Password Changed Successfully!" (Senha alterada com sucesso!), com o botão "Return to Login" (Voltar ao login).

**Escolha de plano ("Choose your plan")**

- Título "Choose your plan" (Escolha seu plano), com a frase "Unlock premium features to boost productivity and streamline your workflow." (Desbloqueie recursos premium para aumentar a produtividade e simplificar seu trabalho.).
- Seletor de período: "Monthly" (Mensal), "Quarterly" (Trimestral) e "Annually" (Anual).
- Cada plano mostra preço em dólar (USD), a periodicidade ("/month", "/quarter" ou "/year", que em português aparecem como "/mês", "/trimestre" e "/ano") e o botão "Select plan" (Selecionar plano). O plano pago de maior preço da lista recebe a faixa "Best Value" (Melhor opção).
- Planos gratuitos (período de teste) aparecem com o preço "Free" (Grátis).

**Criar conta ("Create Account")**

- Aparece depois de escolher um plano. Campos: "Company Name" (Nome da empresa), "Your Name" (Seu nome), "Email", "Password" e "Confirm Password" (Confirmar senha).
- Ao enviar:
  - Plano gratuito: a conta e a assinatura são criadas na hora, com a mensagem "Registration and subscription completed successfully! Redirecting to login..." (Cadastro e assinatura concluídos! Redirecionando para o login...).
  - Plano pago: o sistema leva para a página de pagamento segura para concluir a assinatura.
- Quem chega por um link de convite de plano (com código de convite) cria a conta pelo convite.
- Sem plano escolhido: "No plan selected. Please select a plan first." (Nenhum plano selecionado. Escolha um plano primeiro.).

**Assinatura expirada ("Subscription Expired")**

- Título "Subscription Expired" (Assinatura expirada) e a orientação de renovar a assinatura para continuar usando os recursos.
- Botão "Renew Subscription" (Renovar assinatura).
- Botão "Return to Login" (Voltar ao login), que sai da conta.

**Configuração inicial ("Let's Get Your Workspace Ready")**

- Aparece logo após o login para o usuário que ainda não concluiu a configuração inicial. Ao concluir, o sistema mostra a mensagem de sucesso e recarrega a página.
- Passo 0, "Welcome to PRO SmartBuild" (Bem-vindo ao PRO SmartBuild): botão "Get Started" (Começar).
- Passo 1, "Company Information" (Informações da empresa), "Step 1 of 2" (Etapa 1 de 2): "Company Details" (Dados da empresa), com "Phone Number" (Telefone, com seletor de país: Brasil, EUA ou Espanha), "Email Address" (E-mail), "Business Address" (Endereço comercial), "Website" (Site, opcional) e "Company signature" (Assinatura da empresa, opcional).
- Passo 2, "Contract Terms" (Termos contratuais), "Step 2 of 2" (Etapa 2 de 2): "Introduction Letter" (Carta de apresentação) e "Terms & Conditions" (Termos e condições). Os dois campos são obrigatórios. Os botões "Default" (Padrão) e "Clear" (Limpar) preenchem ou apagam o texto padrão. "Available Variables" (Variáveis disponíveis) são campos que o sistema troca pelos dados reais ao gerar documentos.
- Botão final "Complete Setup" (Concluir configuração). Mensagem de sucesso: "Setup completed! Welcome to SmartBuild!" (Configuração concluída! Bem-vindo ao SmartBuild!).

## Como fazer

### Como entrar no sistema

1. Digite o e-mail e a senha.
2. Clique em "Sign in" (Entrar).
3. O sistema leva você para a primeira tela liberada para o seu usuário (ver "Para onde o sistema leva depois do login").

Se aparecer "Please check your credentials and try again.", confira o e-mail e a senha. Se o problema continuar, use "Forgot password?".

### Como recuperar a senha

1. Clique em "Forgot password?" na tela de login.
2. Digite seu e-mail e clique em "Get Code" (Receber código). O código chega no e-mail.
3. Digite o código e clique em "Confirm Code". Se não chegou, use "Resend code".
4. Crie a nova senha, confirme e clique em "Reset Password". A senha deve ter pelo menos 6 caracteres.
5. Entre de novo com a nova senha.

### Como trocar de empresa

1. Clique no seu nome e foto no rodapé do menu lateral.
2. Clique em "Switch Company" (Trocar empresa).
3. Escolha a empresa desejada e clique em "Select Company".

Se você escolher a empresa que já está em uso, o sistema volta para a tela anterior. Ao trocar para outra empresa, os dados carregados da empresa anterior são limpos da tela.

### Como mudar o idioma

1. Clique no seu nome e foto no rodapé do menu lateral.
2. Clique em "Languages" (Idiomas).
3. Escolha "English", "Português" ou "Español". O idioma atual aparece marcado como "Current" (Atual).

O idioma é salvo no navegador deste computador. Em outro computador ou navegador, escolha de novo.

### Como criar uma conta

1. Na tela de login, clique em "Sign up" (Cadastre-se).
2. Escolha o período e o plano desejado e clique em "Select plan".
3. Preencha os dados da empresa e do responsável, com senha e confirmação.
4. Clique para criar a conta. Se o plano for pago, siga para a página de pagamento.

### Como renovar a assinatura

1. Na tela "Subscription Expired", clique em "Renew Subscription".
2. Se a sua conta não tem plano pago ativo, o sistema leva você para a escolha de planos. Se tem um plano pago com assinatura, o sistema abre a área de pagamento para atualizar o método de pagamento ou renovar.
3. Conclua o pagamento na página segura e volte ao sistema.

Quem não é administrador vê a mesma tela, mas quem pode renovar é o Owner ou o Administrator.

### Como escolher um plano (para quem ainda não tem plano)

1. O Owner ou o Administrator é levado para "Choose your plan" logo após o login, se a empresa ainda não tem plano.
2. Escolha o período (mensal, trimestral ou anual) e clique em "Select plan".
3. O sistema leva você para a página de pagamento. Depois do pagamento, volte ao sistema.

Se o plano escolhido não estiver mais disponível, aparece "Selected plan is no longer available. Please choose another plan." (O plano selecionado não está mais disponível. Escolha outro plano.).

## Status e ciclo de vida

**Situação da assinatura**

- **Ativa:** a empresa usa os recursos liberados pelo plano.
- **Expirada:** o sistema mostra "Subscription Expired" no lugar do sistema.
- **Pagamento recusado:** também mostra a tela de assinatura expirada, para atualizar o pagamento.
- **Cancelada:** também mostra a tela de assinatura expirada. Para voltar, é preciso escolher um plano novamente.

**Quando a situação é verificada**

- Ao entrar no sistema.
- Ao abrir uma tela do sistema.
- A cada 5 minutos, enquanto o sistema está aberto.

Se a situação mudar para expirada, a tela de assinatura expirada aparece no lugar do sistema.

**Regra de expiração por tipo de plano**

- **Sem plano:** a empresa é considerada expirada.
- **Plano gratuito (período de teste):** expira quando a data de término da assinatura passa. Sem assinatura, também é considerada expirada.
- **Plano pago:** expira quando a assinatura não está mais ativa. Para assinaturas feitas por loja de aplicativo, expira também quando a data de término passa.

## Regras de negócio

**Para onde o sistema leva depois do login**

- Master (equipe interna do SmartBuild): vai para a área Master.
- Owner ou Administrator:
  - sem plano: vai para "Choose your plan";
  - com assinatura expirada, cancelada ou com pagamento recusado: vai para "Subscription Expired";
  - caso contrário: vai para a primeira tela liberada.
- Demais perfis:
  - com assinatura expirada, cancelada ou com pagamento recusado: vai para "Subscription Expired";
  - caso contrário: vai para a primeira tela liberada.
- Se o modo multiempresa estiver ativo e a empresa ainda não foi escolhida, o sistema mostra "Select Company" antes.

**Primeira tela liberada.** O sistema procura, nesta ordem, a primeira tela para a qual o usuário tem permissão:

1. Painel ("Dashboard" ou "Dashboard Simple");
2. Tutorial ("Tutorial");
3. Relatórios ("Reports");
4. Agenda de trabalhos ("Job Schedule");
5. Despacho de trabalhos ("Job Dispatch");
6. Projetos ("Projects");
7. Clientes ("Clients");
8. Subcontratados ("Subcontractors");
9. Atividades ("Activities");
10. Orçamentos ("Estimates");
11. Contratos ("Contracts");
12. Faturas ("Invoice");
13. Cartões de ponto ("Time Cards");
14. Catálogo ("Catalog");
15. Serviços ("Services");
16. Gerenciamento de usuários ("User Management");
17. Configurações ("Settings").

Se nenhuma dessas permissões existir, o sistema abre o Início.

**Permissões são atualizadas sem sair do sistema.** Quando o plano ou o perfil muda, o sistema atualiza as permissões ao trocar de tela e a cada 5 minutos. Se o perfil do usuário for trocado para Worker, a sessão é encerrada.

**Permissões efetivas.** As permissões de cada usuário vêm do plano da empresa e do perfil. Owner e Administrator recebem todas as permissões do plano. Os demais perfis só ficam com as permissões que estão no plano e também no perfil, quando o perfil tem lista própria. Os detalhes estão no documento de visão geral da plataforma.

**Idioma.** O padrão é inglês. A escolha vale apenas para o navegador em que foi feita.

## Relação com outros módulos

- **Permissões e menu:** o menu mostra só o que a empresa e o perfil liberam. Ver o documento de visão geral.
- **Dashboard:** a versão do painel (completo ou simplificado) depende da permissão.
- **Assinatura e pagamentos:** a área de configurações reúne a configuração de pagamentos. Os pagamentos de faturas dos clientes são feitos pela página de pagamento segura.
- **Aplicativo do funcionário:** funcionários de campo usam o aplicativo móvel. Veja o documento de cartões de ponto.

## Dúvidas frequentes

**P:** Não consigo entrar. A senha está certa, mas aparece "Access denied: User is disabled."
**R:** Seu usuário está desativado. Peça ao Owner ou ao Administrator da empresa para reativar o acesso.

**P:** Entrei e caí em uma tela vazia ou em outra tela que não esperava. Por quê?
**R:** O sistema leva você para a primeira tela liberada para o seu usuário. Se você não tem nenhuma permissão, o sistema abre o Início. Peça ao Owner ou ao Administrator para conferir suas permissões.

**P:** Por que não vejo "Switch Company" no menu?
**R:** Esse item só aparece quando a sua conta tem acesso a mais de uma empresa e o modo multiempresa está ativo.

**P:** Mudei o idioma, mas em outro computador ele está em inglês. Por quê?
**R:** O idioma é salvo no navegador. Escolha o idioma de novo em "Languages", naquele computador.

**P:** Esqueci a senha. O que faço?
**R:** Clique em "Forgot password?" na tela de login, siga as etapas e use o código enviado para o seu e-mail.

**P:** Não recebi o código de verificação.
**R:** Use "Resend code" na tela de verificação para pedir um novo código.

**P:** Apareceu "Subscription Expired" e eu sou funcionário. O que faço?
**R:** A assinatura é da empresa e só o Owner ou o Administrator pode renová-la. Avise um deles.

**P:** Renovei a assinatura, mas o sistema ainda mostra "Subscription Expired".
**R:** Saia e entre de novo. Se continuar, aguarde alguns minutos, porque a situação da assinatura é verificada a cada 5 minutos.

**P:** Por que apareceu a tela "Mobile Access Required"?
**R:** Você tem o perfil Worker nessa empresa. Use o aplicativo móvel para acessar o sistema. Para iPhone, baixe pela App Store; a versão para Android ainda não está disponível.

**P:** Quero trocar meu plano. Como faço?
**R:** A troca é feita pela tela de planos, que o Owner ou o Administrator acessa pela área de configurações. Escolha o novo plano e conclua o pagamento na página segura. Para dúvidas sobre cobrança, fale com o suporte.

**P:** Preciso concluir a configuração inicial agora?
**R:** Sim, ela aparece logo após o login até ser concluída. Você precisa preencher telefone, e-mail e endereço da empresa, além dos dois textos de contrato (carta de apresentação e termos e condições).
