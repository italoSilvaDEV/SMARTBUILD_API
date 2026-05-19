import type { KnowledgePlaybook } from "../types";
import { assistantWhatsappEnv } from "../config/env";
import { normalizeText } from "../utils/text";

const appUrl = (assistantWhatsappEnv.publicAppUrl || "the system").replace(/\/$/, "");
const loginUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/login` : "the system login page";
const settingsUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/stripe-config` : "Management > Settings";
const userManagementUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/users` : "Management > User Management";
const servicesUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/services` : "Management > Services";

export const assistantWhatsappPlaybooks: KnowledgePlaybook[] = [
  {
    id: "account-login",
    module: "account",
    intent: "login to the system",
    terms: ["login", "log in", "entrar", "acessar", "sign in", "senha", "email e senha", "credenciais invalidas", "invalid credentials"],
    route: "/login",
    uiLocation: loginUrl,
    directAnswer:
      `Para entrar no sistema, acesse ${loginUrl} e informe o email da company cadastrada e a senha cadastrada. Se nao entrar, normalmente e credencial invalida ou o sistema esta fora do ar.`,
    prerequisites: ["A company precisa existir no sistema.", "O usuario precisa informar exatamente o email cadastrado da company e a senha correta."],
    commonMistakes: [
      "Usar um email que nao e o email da company cadastrada.",
      "Digitar senha errada ou senha antiga.",
      "Confundir cadastro novo com login de uma company que ainda nao foi ativada no checkout.",
    ],
    bugSignals: [
      "O email existe no banco e o usuario ja redefiniu a senha, mas ainda nao consegue entrar.",
      "A tela de login nao carrega para varios usuarios ao mesmo tempo.",
      "O sistema retorna erro inesperado diferente de credenciais invalidas.",
    ],
    supportEscalationNote:
      "Se o email existe e a senha foi recuperada corretamente, mas ainda nao entra, tratar como possivel indisponibilidade ou falha tecnica.",
  },
  {
    id: "account-login-email-check",
    module: "account",
    intent: "check company email for login support",
    terms: ["email correto", "email cadastrado", "nao consigo entrar mesmo com senha correta", "meu email existe", "verificar email", "company email"],
    route: "/login",
    uiLocation: loginUrl,
    directAnswer:
      "Me manda o email da company usado no cadastro que eu verifico o proximo passo. Se o email estiver registrado no sistema, o caminho mais provavel e recuperar a senha pelo Forgot password na tela de login.",
    prerequisites: ["O usuario precisa informar o email exato da company."],
    commonMistakes: [
      "Enviar email com typo.",
      "Enviar email pessoal quando a conta foi criada com email da company.",
      "Pedir para procurar email parecido; isso nao deve ser feito por seguranca.",
    ],
    bugSignals: [
      "Email existe, usuario redefiniu senha pelo fluxo de forgot password e ainda recebe credenciais invalidas.",
    ],
    supportEscalationNote:
      "Se o email existe e forgot password nao resolve, tratar como possivel falha tecnica. Se nao existe, orientar o usuario a conferir o email informado ou realizar cadastro.",
  },
  {
    id: "account-forgot-password",
    module: "account",
    intent: "recover password",
    terms: ["forgot password", "esqueci senha", "recuperar senha", "reset password", "trocar senha", "senha errada"],
    route: "/login",
    uiLocation: `${loginUrl} > link below password input`,
    directAnswer:
      `Para recuperar a senha, va em ${loginUrl} e clique em Forgot password logo abaixo do input de password. A pagina de recuperacao vai pedir o email; depois de informar, sera enviado um codigo para esse email. Digite o codigo recebido, confirme, e entao o sistema libera os campos para cadastrar a nova senha.`,
    prerequisites: ["O email precisa ser o email da company cadastrada no sistema."],
    commonMistakes: [
      "Tentar recuperar senha com email diferente do cadastro.",
      "Digitar o email com erro.",
      "Nao conferir o codigo enviado para o email antes de tentar criar a nova senha.",
      "Informar codigo errado ou expirado.",
      "Voltar para login antes de concluir o fluxo de recuperacao.",
    ],
    bugSignals: [
      "Email existe, mas o codigo de recuperacao nao chega.",
      "Codigo correto nao confirma.",
      "A tela nao libera o cadastro da nova senha depois de confirmar o codigo.",
    ],
    supportEscalationNote:
      "Se o email existe e o fluxo de forgot password nao funciona, tratar como possivel falha tecnica.",
  },
  {
    id: "account-signup",
    module: "account",
    intent: "sign up create system account",
    terms: ["sign up", "signup", "cadastro", "cadastrar", "criar conta", "registrar", "nova company", "nova conta"],
    route: "/login",
    uiLocation: `${loginUrl} > Sign up`,
    directAnswer:
      `Para criar uma conta, acesse ${loginUrl} e clique em Sign up. Primeiro escolha um plano mensal, quarterly ou anual. Depois preencha nome da company, seu nome, email da company, senha e confirmacao de senha. Se ja estiver no formulario e quiser trocar o plano, clique em Change plan para voltar uma tela e escolher outro plano. Apos criar a conta, voce precisa concluir o checkout para ativar e acessar.`,
    prerequisites: ["Nao existe plano free nesse passo.", "O checkout precisa ser concluido para ativar a conta."],
    commonMistakes: [
      "Usar email invalido.",
      "Digitar senha e confirmacao de senha diferentes.",
      "Tentar criar conta com email de company que ja existe.",
      "Achar que precisa sair do cadastro para trocar o plano; no formulario existe Change plan.",
      "Criar a conta e nao concluir o checkout.",
    ],
    bugSignals: [
      "Formulario valido nao avanca.",
      "Checkout nao abre apos criar a conta.",
      "Erro inesperado fora de email invalido, senha sem match ou email ja existente.",
    ],
    supportEscalationNote:
      "Se o erro nao for email invalido, senha/confirmacao sem match, email ja existente ou checkout pendente, tratar como possivel falha tecnica.",
  },
  {
    id: "account-signup-plans",
    module: "account",
    intent: "pricing and available plans",
    terms: ["planos", "preco", "precos", "pricing", "price", "mensal", "quarterly", "anual", "plano", "beneficios", "limites"],
    route: "/login",
    uiLocation: `${loginUrl} > Sign up > plan selection`,
    directAnswer:
      "No cadastro, depois de clicar em Sign up, voce escolhe um plano mensal, quarterly ou anual. Quando o usuario perguntar preco, beneficios ou limites, consulte os planos ativos no banco e responda somente com os dados disponiveis.",
    prerequisites: ["Os precos e limites podem mudar, entao devem vir da tool de planos ativos.", "Nao inventar beneficios ou limites ausentes no banco."],
    commonMistakes: [
      "Esperar plano free nessa etapa; nao existe plano free nesse fluxo.",
      "Confundir quarterly com mensal. Quarterly e cobranca trimestral quando existir plano com essa duracao.",
    ],
    bugSignals: [
      "Nenhum plano ativo aparece na tela de cadastro.",
      "Plano ativo no banco nao aparece na selecao.",
    ],
    supportEscalationNote:
      "Se os planos ativos nao aparecem para o usuario, tratar como possivel falha tecnica no cadastro/checkout.",
  },
  {
    id: "settings-overview",
    module: "settings",
    intent: "settings overview tabs and navigation",
    terms: ["settings", "configuracoes", "configuracao", "stripe-config", "management settings", "payments", "subscription", "integrations", "company", "policies", "terms", "email reminders"],
    route: "/stripe-config",
    uiLocation: `Management > Settings (${settingsUrl})`,
    directAnswer:
      `As configuracoes ficam em Management > Settings. Nessa tela voce encontra as tabs Payments, Subscription, Integrations, Company, Policies & Terms e Email Reminders. A tab Email Reminders so aparece para usuarios com permissao Email Reminders.`,
    prerequisites: ["O usuario precisa ter permissao Settings para acessar a tela.", "Email Reminders depende da permissao Email Reminders."],
    commonMistakes: [
      "Procurar configuracoes financeiras dentro de Financials em vez de Management > Settings.",
      "Nao ver Email Reminders por falta da permissao especifica.",
      "Achar que Settings mostra dados privados pelo WhatsApp; nesta V1 o assistant apenas orienta onde ver no sistema.",
    ],
    bugSignals: [
      "Usuario tem permissao Settings e mesmo assim nao ve o item Settings.",
      "A tela /stripe-config nao carrega.",
      "Tabs principais de Settings nao aparecem para um usuario com permissao correta.",
    ],
    supportEscalationNote:
      "Se o usuario tem permissao correta e a tela nao aparece ou nao carrega, tratar como possivel falha tecnica.",
  },
  {
    id: "settings-payments-stripe",
    module: "settings",
    intent: "configure Stripe payments",
    terms: ["stripe", "payment", "payments", "pagamento", "pagamentos", "receber pagamento", "online payment", "conectar stripe", "retomar conexao", "conectado", "disconnected", "connected"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Payments",
    directAnswer:
      "Para configurar Stripe, va em Management > Settings > Payments. Ali o sistema mostra Stripe Payment Processing como Connected ou Disconnected. Se ainda nao conectou, clique em Conectar ao Stripe; se o onboarding ficou incompleto, clique em Retomar Conexao.",
    prerequisites: ["A company precisa ter acesso a Settings.", "Para receber pagamento online em invoices Stripe, o Stripe precisa estar conectado e com onboarding concluido."],
    commonMistakes: [
      "Tentar receber pagamento online antes de conectar o Stripe.",
      "Parar no meio do onboarding do Stripe e nao voltar em Retomar Conexao.",
      "Tentar reconectar quando o status ja aparece Connected.",
      "Confundir configuracao do Stripe com a tab Subscription; Payments e para processamento de pagamentos, Subscription e para assinatura do proprio sistema.",
    ],
    bugSignals: [
      "Onboarding do Stripe conclui, mas Payments continua Disconnected apos atualizar a tela.",
      "Botao Conectar ao Stripe nao redireciona.",
      "Stripe esta Connected, mas invoices Stripe nao permitem pagamento online.",
    ],
    supportEscalationNote:
      "Sem autenticacao da company, nao afirmar status real do Stripe pelo WhatsApp. Oriente o usuario a conferir o status em Payments.",
  },
  {
    id: "settings-subscription",
    module: "settings",
    intent: "manage subscription billing portal and plans",
    terms: ["subscription", "assinatura", "plano", "billing", "portal", "customer portal", "open portal", "view plans", "upgrade", "preco", "price", "beneficios", "limites", "invoices da assinatura"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Subscription",
    directAnswer:
      "Para gerenciar assinatura, va em Management > Settings > Subscription. Se o plano for free, a tela mostra Upgrade Your Plan e o botao View Plans. Se for plano pago, aparece Subscription Management com Open Portal para gerenciar payment information, subscription, billing history e invoices.",
    prerequisites: ["Para ver status real da assinatura, o usuario precisa acessar a propria tab Subscription no sistema.", "Perguntas de preco, beneficios e limites devem usar os planos ativos do banco."],
    commonMistakes: [
      "Procurar assinatura na tab Payments; assinatura fica em Subscription.",
      "Esperar Open Portal em plano free; nesse caso aparece View Plans.",
      "Pedir status privado da assinatura pelo WhatsApp nesta V1; o assistant ainda nao consulta dados da company.",
    ],
    bugSignals: [
      "Open Portal nao abre para uma company com plano pago ativo.",
      "View Plans nao abre para plano free.",
      "Portal abre, mas nao mostra billing history ou invoices esperados.",
    ],
    supportEscalationNote:
      "Para precos e limites, usar listActivePlans. Para status privado da company, orientar a conferir no sistema.",
  },
  {
    id: "settings-integrations-quickbooks",
    module: "settings",
    intent: "connect reconnect disconnect QuickBooks Online",
    terms: ["quickbooks", "qbo", "integracao", "integrations", "connect quickbooks", "reconnect quickbooks", "connected to quickbooks", "force reauthorization", "disconnect quickbooks", "realm", "accounting"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Integrations",
    directAnswer:
      "Para conectar ou reconectar QuickBooks, va em Management > Settings > Integrations. Use Connect to QuickBooks quando estiver desconectado ou Reconnect QuickBooks quando o sistema pedir reautorizacao. Ao autorizar, escolha a company correta do QuickBooks Online Accounting e depois volte para Settings.",
    prerequisites: ["A integracao usa QuickBooks Online Accounting.", "O usuario precisa escolher a company correta no fluxo OAuth do QuickBooks."],
    commonMistakes: [
      "Selecionar uma company diferente da que ja estava conectada.",
      "Escolher uma conta que nao e QuickBooks Online Accounting.",
      "Tentar conectar uma company QBO que ja esta ligada a outra company no sistema.",
      "Ignorar o estado Reconnect QuickBooks quando o token expira ou precisa de reautorizacao.",
    ],
    bugSignals: [
      "Usuario escolhe a company QBO correta e ainda recebe erro de different company.",
      "QuickBooks retorna sucesso, mas a tab continua Disconnected.",
      "Botao Connect to QuickBooks ou Reconnect QuickBooks nao redireciona.",
    ],
    supportEscalationNote:
      "Nao prometer checar status real do QuickBooks pelo WhatsApp. Oriente o usuario pela tab Integrations.",
  },
  {
    id: "settings-integrations-qbo-sync",
    module: "settings",
    intent: "QuickBooks customer project synchronization settings",
    terms: ["sync", "sincronizar", "sincronizo clientes", "synchronization", "customers projects", "customers/projects", "clientes quickbooks", "clientes qbo", "projetos quickbooks", "start synchronization", "bidirectional", "cooldown", "create quickbooks invoices"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Integrations > Sync Settings",
    directAnswer:
      "Depois de conectar QuickBooks, va em Management > Settings > Integrations > Sync Settings. Hoje a entidade visivel e Customers/Projects: marque essa opcao e clique em Start Synchronization. A sync e bidirectional entre QBO e o sistema.",
    prerequisites: ["QuickBooks precisa estar conectado.", "Customers/Projects precisa estar marcado antes de iniciar a sincronizacao."],
    commonMistakes: [
      "Tentar iniciar sync sem marcar Customers/Projects.",
      "Tentar sincronizar novamente dentro do cooldown de 720 minutos.",
      "Desabilitar a preferencia e nao confirmar o modal.",
      "Confundir sync de Customers/Projects com Create QuickBooks Invoices.",
    ],
    bugSignals: [
      "Start Synchronization fica bloqueado mesmo com Customers/Projects ativo e fora do cooldown.",
      "Sincronizacao fica presa em IN_PROGRESS ou PENDING por muito tempo.",
      "Sync retorna COMPLETED, mas clientes/projetos nao aparecem como esperado.",
    ],
    supportEscalationNote:
      "Se o fluxo correto foi seguido e a sync nao conclui ou nao reflete dados, tratar como possivel falha tecnica.",
  },
  {
    id: "settings-integrations-qbo-invoice-creation",
    module: "settings",
    intent: "create QuickBooks invoices from Stripe invoices",
    terms: ["create quickbooks invoices", "invoice creation", "invoice stripe quickbooks", "stripe invoice qbo", "criar invoice quickbooks", "invoice no quickbooks"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Integrations > QuickBooks Configuration",
    directAnswer:
      "Em Management > Settings > Integrations, quando QuickBooks estiver conectado, existe a opcao Create QuickBooks Invoices. Quando ela fica ativa, cada invoice Stripe criada no sistema tambem cria uma invoice correspondente no QuickBooks Online.",
    prerequisites: ["QuickBooks precisa estar conectado.", "A opcao Create QuickBooks Invoices precisa estar ativa antes de criar a invoice Stripe."],
    commonMistakes: [
      "Ativar a configuracao depois de criar a invoice e esperar que ela sincronize retroativamente.",
      "Achar que essa opcao cria invoices do QuickBooks sem criar uma invoice Stripe no sistema.",
      "Confundir essa configuracao com a sync de Customers/Projects.",
    ],
    bugSignals: [
      "Configuracao esta ativa antes da criacao, mas a invoice correspondente nao aparece no QBO.",
      "Switch nao salva ou volta para desativado sem mensagem clara.",
    ],
    supportEscalationNote:
      "Se a configuracao estava ativa antes da criacao e a invoice nao foi criada no QBO, tratar como possivel falha tecnica.",
  },
  {
    id: "settings-company-details",
    module: "settings",
    intent: "edit company profile details",
    terms: ["company details", "company", "empresa", "dados da empresa", "logo", "company name", "phone", "telefone", "address", "email", "website", "project visibility", "attendance mode", "save changes"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Company",
    directAnswer:
      "Para editar dados da company, va em Management > Settings > Company. Ali voce pode alterar logo, Company Name, Phone, Address, Email, Website e Default Project Visibility for Employees. Depois clique em Save Changes.",
    prerequisites: ["Address e obrigatorio para salvar.", "Work start/end time, quando usados, precisam ser preenchidos juntos.", "Employee App Attendance Mode aparece desabilitado porque foi movido para User Management."],
    commonMistakes: [
      "Tentar salvar sem Address.",
      "Preencher start time sem end time ou o contrario.",
      "Tentar editar Attendance Mode nessa tela; ele agora e gerenciado individualmente em User Management.",
      "Nao clicar em Save Changes depois de alterar os dados.",
    ],
    bugSignals: [
      "Save Changes retorna erro sem campo invalido claro.",
      "Logo novo nao aparece apos salvar e atualizar a tela.",
      "Project Visibility salvo volta para o valor anterior.",
    ],
    supportEscalationNote:
      "Se Address esta preenchido e as horas estao coerentes, mas Save Changes falha, tratar como possivel falha tecnica.",
  },
  {
    id: "settings-company-signature",
    module: "settings",
    intent: "register edit company signature",
    terms: ["company signature", "assinatura da company", "assinatura empresa", "register signature", "edit signature", "signature modal", "estimate signature", "change order signature"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Company > Company signature",
    directAnswer:
      "A assinatura da company fica em Management > Settings > Company, no bloco Company signature. Se nao houver assinatura, clique em Register signature; se ja existir, clique em Edit signature. A assinatura desenhada e usada em estimates e change orders.",
    prerequisites: ["O usuario precisa salvar a assinatura no modal.", "A assinatura so aparece em documentos que usam a assinatura da company."],
    commonMistakes: [
      "Desenhar a assinatura e fechar o modal sem salvar.",
      "Procurar a assinatura em Policies & Terms; ela fica na tab Company.",
      "Esperar que a assinatura atualize documentos antigos ja gerados automaticamente.",
    ],
    bugSignals: [
      "Modal salva sem erro, mas a assinatura nao aparece no bloco Company signature.",
      "Assinatura aparece em Settings, mas nao e aplicada em novos estimates ou change orders.",
    ],
    supportEscalationNote:
      "Se a assinatura foi salva e nao aparece em documentos novos, tratar como possivel falha tecnica.",
  },
  {
    id: "settings-policies-terms",
    module: "settings",
    intent: "edit policies terms introduction letter variables",
    terms: ["policies", "terms", "policies e terms", "policies terms", "editar policies", "editar terms", "edito policies", "edito terms", "contract terms", "termos", "politicas", "introduction letter", "terms conditions", "variaveis", "variables", "clientName", "clientEmail", "projectLocation", "save terms"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Policies & Terms",
    directAnswer:
      "Para editar textos padrao, va em Management > Settings > Policies & Terms. No bloco Contract Terms & Policies voce edita Introduction Letter e Terms & Conditions. Para inserir variavel, clique dentro do campo desejado e depois clique na tag da variavel.",
    prerequisites: ["Variaveis disponiveis: {{clientName}}, {{clientEmail}} e {{projectLocation}}.", "Depois de alterar, clique em Save Terms."],
    commonMistakes: [
      "Clicar na variavel sem estar com cursor dentro de Introduction Letter ou Terms & Conditions.",
      "Digitar variavel manualmente com nome diferente do suportado.",
      "Alterar o texto e sair da tela sem clicar em Save Terms.",
      "Esperar dados reais quando client email ou project location nao existem; nesse caso o sistema usa fallback.",
    ],
    bugSignals: [
      "Save Terms nao habilita mesmo com alteracao no texto.",
      "Texto salvo volta ao valor antigo depois de atualizar a tela.",
      "Variaveis suportadas nao sao substituidas em estimates ou contracts novos.",
    ],
    supportEscalationNote:
      "Se as variaveis suportadas foram usadas corretamente e nao substituem nos documentos novos, tratar como possivel falha tecnica.",
  },
  {
    id: "settings-email-reminders",
    module: "settings",
    intent: "configure automatic invoice email reminders",
    terms: ["email reminders", "email reminder", "automatic email reminders", "lembretes", "lembrete automatico", "quando manda", "quando envia", "manda quando", "invoice reminders", "pending invoices", "due date", "overdue", "send before", "send after", "save configuration"],
    route: "/stripe-config",
    uiLocation: "Management > Settings > Email Reminders",
    directAnswer:
      "Para configurar lembretes automaticos, va em Management > Settings > Email Reminders. Ative Enable Automatic Reminders, escolha os envios 7/3/1 dias antes, no due date, ou 1/3/7 dias depois, e clique em Save Configuration.",
    prerequisites: ["O usuario precisa ter permissao Email Reminders.", "O invoice precisa estar open, ter dueDate e ter email no work context ou no client."],
    commonMistakes: [
      "Nao ver a tab por falta da permissao Email Reminders.",
      "Ativar o switch e esquecer de marcar pelo menos um momento de envio.",
      "Esperar lembrete para invoice sem dueDate, sem email ou que nao esta open.",
      "Esperar envio imediato; o job roda diariamente as 9:00 AM no timezone do servidor.",
    ],
    bugSignals: [
      "Configuracao salva e invoice atende as regras, mas o email nao e enviado no dia correto.",
      "Email e enviado mais de uma vez para o mesmo tipo de lembrete no mesmo dia.",
      "Log/timeline do invoice nao registra o envio automatico.",
    ],
    supportEscalationNote:
      "Se a permissao existe, a configuracao esta ativa, o invoice esta open com dueDate/email e mesmo assim nao envia no horario esperado, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-overview",
    module: "user_management",
    intent: "user management overview tabs navigation",
    terms: ["user management", "usuarios", "users", "employees", "funcionarios", "active employees", "inactive employees", "extra employees", "offices", "office", "posicoes", "permissoes", "management user management", "gestion de usuarios", "empleados"],
    route: "/users",
    uiLocation: `Management > User Management (${userManagementUrl})`,
    directAnswer:
      `User Management fica em Management > User Management. A tela usa a rota ${userManagementUrl} e tem as abas Active Employees, Inactive Employees, Extra Employees e Offices. Nela voce pode buscar, atualizar a lista, ordenar usuarios e gerenciar usuarios, offices e permissoes.`,
    prerequisites: ["O usuario precisa ter permissao User Management para ver essa tela."],
    commonMistakes: [
      "Procurar usuarios em Settings; o gerenciamento fica em Management > User Management.",
      "Nao ver a tela por falta da permissao User Management.",
      "Confundir Offices com office fisico; nessa tela Office representa o cargo/grupo de permissoes do usuario.",
    ],
    bugSignals: [
      "Usuario tem permissao User Management e mesmo assim nao ve o menu.",
      "A rota /users nao carrega.",
      "As abas Active Employees, Inactive Employees, Extra Employees ou Offices nao aparecem.",
    ],
    supportEscalationNote:
      "Se o usuario tem permissao correta e a tela nao aparece ou nao carrega, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-active-inactive-employees",
    module: "user_management",
    intent: "activate deactivate active inactive employee",
    terms: ["active employees", "inactive employees", "ativo", "inativo", "desativar usuario", "ativar usuario", "employee inactive", "employee active", "status usuario", "status employee", "reactivate", "disable employee", "enable employee"],
    route: "/users",
    uiLocation: "Management > User Management > Active Employees / Inactive Employees",
    directAnswer:
      "Para ativar ou desativar um funcionario, va em Management > User Management, abra o menu do usuario ou clique nele para entrar nos detalhes, depois clique em Edit User. No modal, altere o switch Status e salve em Save Changes.",
    prerequisites: ["Usuario inativo nao deve conseguir acessar o sistema.", "Para extra paid user, precisa existir extra seat disponivel para reativar."],
    commonMistakes: [
      "Procurar um usuario desativado em Active Employees em vez de Inactive Employees.",
      "Alterar o status e fechar o modal sem clicar em Save Changes.",
      "Tentar reativar extra paid user sem seat extra disponivel.",
    ],
    bugSignals: [
      "Status foi salvo como Active, mas o usuario continua em Inactive Employees.",
      "Usuario aparece ativo, mas recebe Access denied ao entrar.",
      "Existe seat extra disponivel, mas o sistema bloqueia a reativacao.",
    ],
    supportEscalationNote:
      "Se o usuario seguiu o fluxo correto e o status nao muda ou o acesso continua bloqueado, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-user-details",
    module: "user_management",
    intent: "user details services linked tasks resend edit user",
    terms: ["user details", "detalhes usuario", "services linked", "tasks", "tarefas", "servicos vinculados", "unlink service", "desvincular servico", "view project", "delete task", "resend password", "edit user"],
    route: "/user/:id",
    uiLocation: "Management > User Management > click an employee",
    directAnswer:
      "Ao clicar em um funcionario na lista, o sistema abre os detalhes em /user/:id. Essa tela mostra foto, nome, office, status, email, telefone, location e hourly/daily rate. Ela tambem tem Edit User, Resend Password e as tabs Services Linked e Tasks.",
    prerequisites: ["O usuario precisa existir na company atual.", "Para ver detalhes, precisa ter permissao User Management."],
    commonMistakes: [
      "Esperar editar todos os dados direto na lista; a edicao completa fica em Edit User.",
      "Tentar remover um service link que ja tem attendance records; o sistema pode bloquear para preservar historico.",
      "Procurar tasks do usuario na lista principal em vez da tab Tasks dentro dos detalhes.",
    ],
    bugSignals: [
      "Clicar no usuario nao abre /user/:id.",
      "Services Linked ou Tasks nao carregam mesmo havendo dados.",
      "Unlink de service sem attendance records falha.",
      "Delete task falha sem mensagem clara.",
    ],
    supportEscalationNote:
      "Se os detalhes nao carregam ou uma acao valida falha, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-add-edit-user",
    module: "user_management",
    intent: "add edit user required fields project visibility password office",
    terms: ["new user", "add user", "create user", "criar usuario", "adicionar usuario", "adiciono usuario", "cadastrar usuario", "cadastrar funcionario", "novo usuario", "editar usuario", "edit user", "office role", "project visibility", "all active projects", "only assigned projects", "senha automatica", "senha manual", "manual password", "automatic password"],
    route: "/users",
    uiLocation: "Management > User Management > New User / Edit User",
    directAnswer:
      "Para adicionar usuario, va em Management > User Management e clique em New User. Preencha Full Name, Email Address, Phone Number, Location, Office Role e Project Visibility. Foto e opcional. Em Project Visibility, All Active Projects libera projetos ativos; Only Assigned Projects limita aos projetos atribuidos.",
    prerequisites: ["A company precisa ter employee slot disponivel no plano ou em extra users.", "Office Role e Project Visibility sao obrigatorios.", "Telefone precisa bater com o pais selecionado."],
    commonMistakes: [
      "Deixar Office Role ou Project Visibility em branco.",
      "Usar email invalido ou email ja cadastrado na mesma company.",
      "Preencher phone em formato diferente do pais selecionado.",
      "Achar que Owner segue a mesma regra dos outros offices; Owner sempre fica com acesso total e All Active Projects.",
      "Tentar senha manual para usuario que ja pertence a outra company; nesse caso o sistema desabilita senha manual.",
      "Atingir o limite de employees do plano sem comprar extra users.",
    ],
    bugSignals: [
      "Todos os campos obrigatorios estao validos e o sistema nao cria o usuario.",
      "Email disponivel e formato correto, mas o sistema acusa duplicidade.",
      "Project Visibility esta selecionado e mesmo assim o modal nao salva.",
      "Usuario criado nao recebe email de acesso automatico.",
    ],
    supportEscalationNote:
      "Se os campos estao validos, existe slot disponivel e o sistema ainda nao cria ou salva, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-worker-time-card",
    module: "user_management",
    intent: "worker time card configuration attendance clock in clock out break overtime rates",
    terms: ["worker", "time card", "timecard", "attendance", "clock in", "clock out", "manual", "automatic", "hourly rate", "daily rate", "break time", "break minutes", "overtime", "over time", "can edit time card", "employee app attendance mode"],
    route: "/users",
    uiLocation: "Management > User Management > New User/Edit User > Worker settings",
    directAnswer:
      "As configuracoes de Time Card ficam em User Management, dentro do usuario. Quando o Office Role e Worker, o modal mostra payment type Hourly ou Daily, rate, Clock In Mode, Clock Out Mode e Break Time. Em edicao tambem aparecem Status e Over Time.",
    prerequisites: ["As opcoes especificas de time card aparecem quando o usuario e Worker.", "Break Time aceita minutos de 0 a 120."],
    commonMistakes: [
      "Tentar configurar Employee App Attendance Mode em Settings > Company; essa configuracao agora e por usuario em User Management.",
      "Selecionar Office Role diferente de Worker e esperar ver as opcoes de time card.",
      "Ativar break sem revisar os minutos.",
      "Confundir canEditTimeCard com permissao geral de editar usuarios; ele permite edicao manual do time card pelo employee.",
    ],
    bugSignals: [
      "Office Role e Worker, mas as configuracoes de Time Card nao aparecem.",
      "Salvar Clock In/Out Mode ou Break Time e o valor voltar ao antigo.",
      "Daily/Hourly Rate salvo nao aparece nos detalhes do usuario.",
    ],
    supportEscalationNote:
      "Se o usuario e Worker e a configuracao nao aparece ou nao salva, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-password-reset-admin",
    module: "user_management",
    intent: "resend reset employee password admin",
    terms: ["resend password", "reset password", "reenviar senha", "resetar senha", "send password", "update password", "senha usuario", "senha funcionario", "manual password", "automatic password", "multiple companies"],
    route: "/user/:id",
    uiLocation: "Management > User Management > user details > Resend Password",
    directAnswer:
      "Para reenviar ou resetar senha de um usuario, abra Management > User Management, clique no usuario e use Resend Password. No modo automatico o sistema gera uma senha e envia por email. No modo manual voce define a senha diretamente, sem envio de email.",
    prerequisites: ["Senha manual precisa ter pelo menos 6 caracteres.", "Se o usuario pertence a multiplas companies, o sistema usa o modo automatico por seguranca."],
    commonMistakes: [
      "Esperar email quando usou modo manual; nesse modo nao ha envio.",
      "Digitar senha manual com menos de 6 caracteres.",
      "Nao perceber que usuario de multiplas companies nao permite senha manual.",
      "Resetar senha e orientar o usuario a tentar senha antiga.",
    ],
    bugSignals: [
      "Modo automatico confirma, mas email nao chega.",
      "Senha manual com 6 ou mais caracteres falha sem motivo claro.",
      "Usuario recebe nova senha e ainda nao consegue entrar.",
    ],
    supportEscalationNote:
      "Se o reset foi concluido e o usuario nao recebe email ou nao consegue entrar com a nova senha, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-extra-employees",
    module: "user_management",
    intent: "add extra employee users seats subscription limit",
    terms: ["extra employee", "extra employees", "extra user", "extra users", "extra paid user", "o que e extra employee", "o que e extra user", "add extra users", "comprar extra user", "comprar seats", "employee limit", "limite funcionarios", "plan limit", "allowed employees", "extra seat", "mais usuarios", "subscription active"],
    route: "/users",
    uiLocation: "Management > User Management > Add Extra Users",
    directAnswer:
      "Extra user e um seat adicional para criar usuarios alem do limite do plano. Em Management > User Management, clique em Add Extra Users, escolha a quantidade e confirme. O modal mostra total users, plan limit, extra users e o valor mensal estimado.",
    prerequisites: ["A subscription precisa estar ativa para comprar extra users.", "A cobranca aparece na proxima invoice.", "Usuarios criados acima do limite allowedEmployees passam a ser extra paid users."],
    commonMistakes: [
      "Tentar criar mais usuarios sem comprar extra users depois de atingir o limite do plano.",
      "Esperar cobranca imediata separada; a mudanca aparece na proxima invoice.",
      "Nao notar que Add Extra Users fica desabilitado quando a subscription nao esta ativa.",
    ],
    bugSignals: [
      "Subscription ativa, mas Add Extra Users esta desabilitado.",
      "Compra confirma, mas o limite de usuarios nao aumenta.",
      "Novo usuario acima do limite nao aparece como extra user.",
    ],
    supportEscalationNote:
      "Sem autenticacao da company, nao afirmar quantidade real de seats. Oriente o usuario a conferir no modal Add Extra Users.",
  },
  {
    id: "user-management-reduce-extra-employees",
    module: "user_management",
    intent: "reduce extra employees seats disable selected extra users",
    terms: ["reduce extras", "reduce extra users", "como reduzir extra users", "reduzir extra users", "remover extra employees", "unused seats", "assigned seats", "disable extra users", "cancelar extra users", "extra paid users"],
    route: "/users",
    uiLocation: "Management > User Management > Extra Employees > Reduce Extras",
    directAnswer:
      "Para reduzir extra users, va na aba Extra Employees e clique em Reduce Extras. Se houver unused seats, o sistema reduz sem afetar usuarios. Se voce reduzir seats ja atribuidos, precisa selecionar exatamente quais extra users serao desativados.",
    prerequisites: ["A company precisa ter extra users contratados.", "Se a reducao afetar usuarios atribuidos, a selecao dos usuarios e obrigatoria."],
    commonMistakes: [
      "Tentar reduzir mais seats do que existem.",
      "Nao selecionar a quantidade exata de usuarios quando o sistema pede.",
      "Esperar que reduzir extra user apague usuario; o sistema desativa usuarios selecionados quando necessario.",
      "Esperar efeito financeiro imediato; a mudanca impacta a proxima invoice.",
    ],
    bugSignals: [
      "Existe unused seat, mas o sistema exige selecionar usuario.",
      "Selecionou a quantidade correta e mesmo assim nao consegue reduzir.",
      "Reducao confirma, mas a quantidade de extra users nao muda.",
    ],
    supportEscalationNote:
      "Se a quantidade e a selecao estao corretas e a reducao falha, tratar como possivel falha tecnica.",
  },
  {
    id: "user-management-offices",
    module: "user_management",
    intent: "create edit delete offices permissions user roles",
    terms: ["offices", "office", "new office", "edit office", "delete office", "office permissions", "grant all permissions", "permissoes office", "cargo", "role", "position", "users count", "system offices", "office name"],
    route: "/users",
    uiLocation: "Management > User Management > Offices",
    directAnswer:
      "Offices ficam na aba Offices de User Management. Eles funcionam como cargos/grupos de permissao. Clique em New Office para criar, informe Office Name e selecione permissoes; Grant All Permissions marca todas as permissoes visiveis disponiveis no plano.",
    prerequisites: ["Permissoes exibidas vem do plano ativo e precisam estar visiveis para offices.", "Office Name e obrigatorio.", "Office name precisa ser unico dentro da company."],
    commonMistakes: [
      "Criar office com nome que ja existe na mesma company.",
      "Tentar editar nome de system office protegido.",
      "Tentar deletar office do sistema ou office com usuarios vinculados.",
      "Achar que mudar permissoes do office altera dados antigos; isso controla acesso de usuarios associados ao office.",
      "Confundir users count com limite do plano; users count e a quantidade de usuarios ligados naquele office.",
    ],
    bugSignals: [
      "Office novo com nome unico e permissoes validas nao salva.",
      "Office sem usuarios vinculados e nao protegido nao deleta.",
      "Permissoes visiveis do plano nao aparecem no modal.",
      "Usuario continua sem acesso apos trocar para office com permissao correta e relogar.",
    ],
    supportEscalationNote:
      "Se o office nao e protegido, nao tem usuarios vinculados e mesmo assim nao deleta ou nao salva, tratar como possivel falha tecnica.",
  },
  {
    id: "services-overview",
    module: "services",
    intent: "navigate services materials catalog categories",
    terms: ["services", "materials", "catalogo", "catalog", "management services", "tela services", "aba services", "aba materials", "categorias", "category", "categoria", "lista services", "onde fica services"],
    route: "/services",
    uiLocation: `Management > Services (${servicesUrl})`,
    directAnswer:
      `Services fica em Management > Services. Nessa tela o sistema mostra as abas Services e Materials, com categorias, imagem, nome, status e actions. Use a busca para localizar uma categoria, clique em New para criar uma nova, ou clique em uma categoria para abrir os detalhes.`,
    prerequisites: ["O usuario precisa ter permissao Services para ver essa tela."],
    commonMistakes: [
      "Procurar Services dentro de Settings; o caminho correto e Management > Services.",
      "Nao ver a tela por falta da permissao Services.",
      "Confundir a aba Materials do catalogo com Cost of materials dentro de um projeto.",
    ],
    bugSignals: [
      "Usuario tem permissao Services e mesmo assim nao ve o menu.",
      "A lista de categorias nao carrega mesmo apos atualizar a tela.",
      "Clicar em uma categoria nao abre os detalhes.",
    ],
    supportEscalationNote:
      "Se o usuario tem permissao correta e a tela nao abre ou nao carrega categorias, tratar como possivel falha tecnica.",
  },
  {
    id: "services-create-category",
    module: "services",
    intent: "create service or material category",
    terms: ["new category", "create category", "criar categoria", "nova categoria", "categoria de material", "categoria de service", "category image", "imagem categoria", "materials new", "services new"],
    route: "/services",
    uiLocation: "Management > Services > New",
    directAnswer:
      "Para criar categoria, va em Management > Services, clique em New, escolha se ela fica em Services ou Materials, informe o nome e adicione uma imagem. Depois confirme a criacao.",
    prerequisites: ["Nome da categoria e obrigatorio.", "Imagem da categoria e obrigatoria.", "A imagem precisa ser um arquivo de imagem valido e ter ate 5MB."],
    commonMistakes: [
      "Criar sem imagem.",
      "Usar arquivo que nao e imagem ou arquivo grande demais.",
      "Criar uma categoria com nome que ja existe na mesma aba.",
      "Criar em Materials quando queria que aparecesse como Services, ou o contrario.",
    ],
    bugSignals: [
      "Nome e imagem validos, mas a categoria nao salva.",
      "Categoria criada nao aparece depois de atualizar a lista.",
      "Upload de imagem valida ate 5MB falha repetidamente.",
    ],
    supportEscalationNote:
      "Se nome, aba e imagem estao corretos e mesmo assim nao salva, tratar como possivel falha tecnica.",
  },
  {
    id: "services-edit-category-status",
    module: "services",
    intent: "edit category image name status enabled disabled",
    terms: ["edit category", "editar categoria", "trocar imagem categoria", "status category", "enabled", "disabled", "ativar categoria", "desativar categoria", "ligar categoria", "desligar categoria"],
    route: "/category/:id",
    uiLocation: "Management > Services > category details",
    directAnswer:
      "Para editar uma categoria, abra Management > Services, clique na categoria e use a opcao de editar para alterar nome ou imagem. Na tela de detalhes tambem existe o switch de status, que muda a categoria entre Enabled e Disabled.",
    prerequisites: ["A categoria precisa existir.", "Imagem nova, se enviada, precisa ser imagem valida ate 5MB."],
    commonMistakes: [
      "Achar que desativar e o mesmo que deletar; status apenas muda o estado exibido da categoria.",
      "Tentar salvar nome igual ao de outra categoria da mesma aba.",
      "Trocar por uma imagem invalida ou grande demais.",
    ],
    bugSignals: [
      "Categoria com dados validos nao atualiza.",
      "Status muda na tela, mas volta ao valor antigo ao atualizar.",
      "Imagem valida nao atualiza.",
    ],
    supportEscalationNote:
      "Se editar nome, imagem ou status com dados validos e a mudanca nao permanece, tratar como possivel falha tecnica.",
  },
  {
    id: "services-subcategories",
    module: "services",
    intent: "create edit delete subcategories inside category",
    terms: ["subcategory", "sub category", "subcategoria", "add subcategory", "criar subcategoria", "editar subcategoria", "deletar subcategoria", "remove subcategory"],
    route: "/category/:id",
    uiLocation: "Management > Services > category details > Add Subcategory",
    directAnswer:
      "Para criar subcategoria, abra a categoria em Management > Services e clique em Add Subcategory. Informe o nome e salve. Pela propria subcategoria voce tambem pode editar ou deletar.",
    prerequisites: ["A categoria precisa existir.", "Nome da subcategoria e obrigatorio."],
    commonMistakes: [
      "Criar subcategoria sem nome.",
      "Usar nome que ja existe dentro da mesma categoria.",
      "Deletar subcategoria achando que os itens dentro dela ficarao salvos; ao deletar a subcategoria, os services/materials dentro dela tambem sao removidos.",
    ],
    bugSignals: [
      "Subcategoria com nome valido nao salva.",
      "Subcategoria deletada continua aparecendo apos atualizar.",
      "Subcategoria nao abre ou nao mostra os itens dentro dela.",
    ],
    supportEscalationNote:
      "Se a subcategoria tem nome valido e mesmo assim nao salva, edita ou deleta, tratar como possivel falha tecnica.",
  },
  {
    id: "services-create-edit-service",
    module: "services",
    intent: "create edit delete service material item fixed variable price measurement product",
    terms: ["add service", "create service", "new service", "criar service", "criar servico", "editar service", "delete service", "fixed price", "variable price", "minimum price", "maximum price", "measurement", "product", "price type", "preco fixo", "preco variavel"],
    route: "/category/:id",
    uiLocation: "Management > Services > category details > subcategory > Add Service",
    directAnswer:
      "Para criar um item, abra a categoria, entre na subcategoria e clique em Add Service. Informe Service Name, escolha Service Type entre Measurement ou Product, escolha Price Type entre Fixed ou Variable e preencha os valores. Description e opcional.",
    prerequisites: [
      "O item precisa estar dentro de uma subcategoria.",
      "Service Name e obrigatorio.",
      "Fixed precisa de fixed price.",
      "Variable precisa de minimum price e maximum price, com maximum maior que minimum.",
    ],
    commonMistakes: [
      "Tentar criar service direto na categoria, sem subcategoria.",
      "Nao selecionar Service Type ou Price Type.",
      "Usar variable price com maximum menor ou igual ao minimum.",
      "Confundir Description com campo obrigatorio; ela e opcional.",
    ],
    bugSignals: [
      "Item com nome, tipo e preco validos nao salva.",
      "Edicao confirma, mas o item volta ao valor antigo.",
      "Item deletado continua aparecendo apos atualizar.",
    ],
    supportEscalationNote:
      "Se os campos obrigatorios estao corretos e o item nao salva, edita ou deleta, tratar como possivel falha tecnica.",
  },
  {
    id: "services-vs-materials",
    module: "services",
    intent: "difference between services tab materials tab and project cost materials",
    terms: ["services vs materials", "materials", "material", "cost of materials", "custo de material", "catalogo de material", "material no catalogo", "material no projeto", "lancar material", "material cost"],
    route: "/services",
    uiLocation: "Management > Services > Services/Materials",
    directAnswer:
      "A aba Services e a aba Materials em Management > Services sao catalogos reutilizaveis. Esses itens podem ser selecionados depois em estimates e projects. Ja Cost of materials dentro de um projeto e para registrar compras, custos ou creditos reais daquele projeto.",
    prerequisites: ["Para criar catalogo, use Management > Services.", "Para lancar custo real, use Project Details > Cost of materials."],
    commonMistakes: [
      "Criar material no catalogo esperando que isso registre custo real em um projeto.",
      "Lancar custo em Cost of materials esperando que isso crie item reutilizavel no catalogo.",
      "Procurar custo real dentro da aba Materials do catalogo.",
    ],
    bugSignals: [
      "Material criado no catalogo nao aparece para selecao em estimate/project mesmo com categoria, subcategoria e item preenchidos.",
      "Custo real salvo em projeto nao aparece na tabela de custos do projeto.",
    ],
    supportEscalationNote:
      "Se o usuario esta no fluxo correto e o item/custo nao aparece apos atualizar, tratar como possivel falha tecnica.",
  },
  {
    id: "services-in-estimates",
    module: "services",
    intent: "use catalog services materials custom service in estimate builder",
    terms: ["estimate services", "new estimate service", "servico no estimate", "material no estimate", "custom service", "custom service estimate", "custom service catalogo", "custom service salva", "custom service salva no catalogo", "adicionar custom service", "services step estimate", "buscar categoria estimate", "variable price estimate", "safety margin", "photos estimate"],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "Financials > Estimates > New Estimate > Services",
    directAnswer:
      "No estimate manual, va ate a etapa Services. Voce pode buscar categorias, filtrar entre Services e Materials, abrir uma categoria, escolher o item dentro da subcategoria e configurar quantidade/preco antes de adicionar ao estimate.",
    prerequisites: ["Para avancar no estimate, precisa ter pelo menos um item selecionado.", "Itens do catalogo precisam existir com categoria, subcategoria e service/material dentro."],
    commonMistakes: [
      "Procurar um material com o filtro em Services, ou um service com o filtro em Materials.",
      "Achar que Custom service cria item no catalogo; ele vale apenas para aquele estimate.",
      "Tentar completar o estimate sem nenhum item selecionado.",
      "Para item com preco variavel, nao ajustar o valor dentro da faixa mostrada.",
    ],
    bugSignals: [
      "Categoria com itens validos nao aparece no estimate mesmo com filtro correto.",
      "Item selecionado nao entra no estimate apos configurar quantidade/preco.",
      "Custom service com nome, quantidade e preco validos nao adiciona.",
    ],
    supportEscalationNote:
      "Se o usuario esta na etapa correta, com filtro certo e campos validos, mas o item nao aparece ou nao adiciona, tratar como possivel falha tecnica.",
  },
  {
    id: "services-in-projects",
    module: "services",
    intent: "use services materials custom services in projects and project details",
    terms: ["project services", "new project service", "servico no project", "material no project", "custom service project", "estimate virou project", "servicos do projeto", "project details services", "status service", "responsible service", "stages service"],
    route: "/seller/new-project/services/:id",
    uiLocation: "Projects > New Project > Services / Project Details > Services",
    directAnswer:
      "No projeto manual, a escolha de Services e Materials funciona como no estimate: abrir categoria, escolher item e configurar antes de adicionar. Quando um estimate vira projeto, os itens selecionados no estimate passam a compor os services do projeto.",
    prerequisites: ["Para criar projeto manual com itens, precisa selecionar pelo menos um service/material ou custom service.", "Para acompanhar depois, abra Project Details > Services."],
    commonMistakes: [
      "Esperar que editar o catalogo altere automaticamente itens ja adicionados em projetos antigos.",
      "Confundir services do projeto com categorias do catalogo.",
      "Procurar custos reais de materiais na aba Services do projeto; custos ficam em Cost of materials.",
    ],
    bugSignals: [
      "Estimate aprovado/conversao nao levou os itens para o projeto.",
      "Service do projeto nao abre detalhes.",
      "Status, responsavel ou datas do service nao permanecem apos salvar.",
    ],
    supportEscalationNote:
      "Se o projeto foi criado corretamente e os services nao aparecem ou nao salvam alteracoes, tratar como possivel falha tecnica.",
  },
  {
    id: "services-material-costs",
    module: "services",
    intent: "project cost of materials actual purchases credits files",
    terms: ["cost of materials", "material cost", "custo de materiais", "custo real de material", "lancar custo real de material", "lancar custo material", "purchase", "compras", "credit material", "invoice material", "anexo material", "export material cost", "project material cost"],
    route: "/seller/details/:idproject",
    uiLocation: "Project Details > Cost of materials",
    directAnswer:
      "Para lancar custo real de material, abra o projeto e va em Cost of materials. Clique em New cost, informe material, tipo Cost ou Credit, preco, quantidade, service relacionado e anexo opcional. Tambem da para adicionar mais de uma compra, editar, deletar e exportar.",
    prerequisites: ["O custo precisa estar dentro de um projeto.", "Material, preco, quantidade e service relacionado precisam ser preenchidos."],
    commonMistakes: [
      "Criar material em Management > Services achando que isso lanca custo real no projeto.",
      "Nao selecionar o service relacionado ao custo.",
      "Anexar arquivo fora dos formatos aceitos ou grande demais.",
      "Confundir Credit com Cost.",
    ],
    bugSignals: [
      "Custo com campos validos nao salva.",
      "Anexo valido nao aparece depois de salvar.",
      "Exportacao nao inclui custos que aparecem na tabela.",
    ],
    supportEscalationNote:
      "Se o custo tem dados validos e mesmo assim nao salva, edita, deleta ou exporta corretamente, tratar como possivel falha tecnica.",
  },
  {
    id: "services-subcontractor-usage",
    module: "services",
    intent: "services categories used in subcontractor cost schedule categories",
    terms: ["subcontractor services", "subcontractor cost", "categoria subcontractor", "subcontractor category", "from schedule", "all categories", "new category subcontractor", "schedule category", "custo subcontractor"],
    route: "/seller/details/:idproject",
    uiLocation: "Project Details > Subcontractor Cost",
    directAnswer:
      "Em Subcontractor Cost, a categoria serve para organizar ou relacionar o custo com itens do projeto. O seletor pode mostrar itens From Schedule e All Categories, e quando o fluxo oferecer a opcao, voce pode criar uma nova categoria dali.",
    prerequisites: ["O custo de subcontractor precisa estar dentro de um projeto.", "Para usar categorias do catalogo, elas precisam existir em Management > Services."],
    commonMistakes: [
      "Achar que selecionar categoria em Subcontractor Cost cria ou edita um service completo no catalogo.",
      "Procurar services do catalogo dentro da tela de subcontractor em vez de Management > Services.",
      "Nao selecionar subcontractor, datas ou valor ao criar custo.",
    ],
    bugSignals: [
      "Categoria existente nao aparece no seletor de custo.",
      "Custo de subcontractor com dados validos nao salva.",
      "Item From Schedule nao aparece mesmo existindo no schedule do projeto.",
    ],
    supportEscalationNote:
      "Se o usuario esta no projeto correto e os dados estao validos, mas categoria ou custo nao funciona, tratar como possivel falha tecnica.",
  },
  {
    id: "services-common-issues",
    module: "services",
    intent: "common services materials catalog issues permissions missing items wrong flow",
    terms: ["nao vejo services", "services nao aparece", "categoria nao aparece", "material nao aparece", "service nao aparece", "custom service catalogo", "custom service nao salva catalogo", "nao consigo criar service", "nao consigo criar categoria", "nao consigo salvar material", "erro services", "problema services"],
    route: "/services",
    uiLocation: "Management > Services",
    directAnswer:
      "Se Services nao aparece, confira se seu usuario tem permissao Services. Se uma categoria ou item nao aparece em estimate/project, confira se ele foi criado na aba correta, se a categoria tem subcategoria e se existe um service/material dentro dela.",
    prerequisites: ["Permissao Services para acessar o catalogo.", "Categoria, subcategoria e item precisam estar criados para aparecerem nos fluxos de estimate/project."],
    commonMistakes: [
      "Estar na aba ou filtro errado.",
      "Criar apenas categoria, mas nao criar subcategoria e item.",
      "Procurar custo real de material no catalogo em vez de Project Details > Cost of materials.",
      "Achar que Custom service salvo em estimate/project vira item do catalogo.",
    ],
    bugSignals: [
      "Usuario tem permissao correta, categoria completa e filtro correto, mas o item nao aparece.",
      "Campos obrigatorios estao validos e mesmo assim o sistema nao salva.",
      "Alteracoes aparecem salvas, mas somem apos atualizar a tela.",
    ],
    supportEscalationNote:
      "Se o fluxo esta correto e mesmo assim nao funciona, orientar como possivel falha tecnica, sem criar ticket automatico nesta V1.",
  },
];

export function searchPlaybooks(query: string, limit = 4) {
  const normalizedQuery = normalizeText(query);
  const words = new Set(normalizedQuery.split(" ").filter((word) => word.length > 2));

  return assistantWhatsappPlaybooks
    .map((playbook) => {
      const haystack = normalizeText(
        [
          playbook.intent,
          playbook.module,
          playbook.uiLocation,
          playbook.directAnswer,
          ...playbook.terms,
          ...playbook.prerequisites,
          ...playbook.commonMistakes,
          ...playbook.bugSignals,
          playbook.supportEscalationNote,
        ].join(" ")
      );

      let score = 0;
      for (const term of playbook.terms) {
        if (normalizedQuery.includes(normalizeText(term))) score += 6;
      }

      for (const word of words) {
        if (haystack.includes(word)) score += 1;
      }

      if (normalizedQuery.includes(normalizeText(playbook.module))) score += 2;
      return { playbook, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.playbook);
}
