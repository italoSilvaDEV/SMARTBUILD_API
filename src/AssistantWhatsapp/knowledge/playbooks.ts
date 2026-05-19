import type { KnowledgePlaybook } from "../types";
import { assistantWhatsappEnv } from "../config/env";
import { normalizeText } from "../utils/text";

const appUrl = (assistantWhatsappEnv.publicAppUrl || "the system").replace(/\/$/, "");
const loginUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/login` : "the system login page";
const settingsUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/stripe-config` : "Management > Settings";

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

      if (normalizedQuery.includes(playbook.module)) score += 2;
      return { playbook, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.playbook);
}
