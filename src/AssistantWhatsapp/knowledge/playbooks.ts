import type { KnowledgePlaybook } from "../types";
import { assistantWhatsappEnv } from "../config/env";
import { normalizeText } from "../utils/text";

const appUrl = (assistantWhatsappEnv.publicAppUrl || "the system").replace(/\/$/, "");
const loginUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/login` : "the system login page";
const estimatesUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/seller/estimates` : "Financials > Estimates";
const settingsUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/stripe-config` : "Management > Settings";
const userManagementUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/users` : "Management > User Management";
const servicesUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/services` : "Management > Services";
const projectsUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/seller/projects` : "Projects";
const newProjectUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/seller/new-project/type-project` : "Projects > New Project";

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
    id: "estimates-main-overview",
    module: "estimates",
    intent: "estimates main page overview navigation dashboard filters table export actions",
    terms: ["orcamentos", "financials estimates", "seller estimates", "pagina estimates", "lista estimates", "main estimates", "onde vejo estimates", "onde vejo meus estimates", "pagina principal estimates", "lista principal estimates"],
    route: "/seller/estimates",
    uiLocation: `Financials > Estimates (${estimatesUrl})`,
    directAnswer:
      `A pagina principal de estimates fica em Financials > Estimates. Ali o sistema mostra filtros, dashboard, busca, tabela de estimates, exportacao, actions e o botao New Estimate. Depois que um estimate e convertido para project, o acompanhamento principal passa a ser em Projects.`,
    prerequisites: ["O usuario precisa ter permissao Estimates para ver a tela.", "A lista principal mostra estimates da area de estimates; projects convertidos devem ser acompanhados em Projects."],
    commonMistakes: [
      "Procurar estimate convertido dentro da lista principal em vez de Projects.",
      "Nao ver a tela por falta da permissao Estimates.",
      "Achar que New Estimate e a unica forma de acessar um estimate existente; clicar na linha abre o editor do estimate.",
    ],
    bugSignals: [
      "Usuario tem permissao Estimates e mesmo assim nao ve o menu.",
      "A pagina carrega, mas dashboard e tabela ficam vazios com filtros padrao mesmo havendo estimates.",
      "Clicar em uma linha nao abre o editor.",
    ],
    supportEscalationNote:
      "Se o usuario tem permissao correta e a tela ou tabela nao carrega, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-main-filters-search-sort",
    module: "estimates",
    intent: "filter search sort estimates list by period date range status number client",
    terms: ["filter estimates", "filtros estimates", "status filter", "period filter", "date range", "custom date range", "this year", "this quarter", "last 3 months", "last month", "this month", "last 30 days", "all period", "clear all", "search estimate", "buscar estimate", "search por endereco", "ordenar estimates", "sort estimates"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Filters / Search / Table headers",
    directAnswer:
      "Na lista de estimates, use Period para filtrar por tempo, o date range para um intervalo personalizado e Status para Approved, Pending ou Canceled. A busca encontra estimate number ou nome do client. A tabela tambem permite ordenar por Number, Client/Address, Price e Status.",
    prerequisites: ["Custom date range tem prioridade quando estiver preenchido.", "Search foi feito para number ou client name."],
    commonMistakes: [
      "Buscar por address, seller ou price esperando resultado; a busca da tela usa number ou client name.",
      "Esquecer um status desmarcado e achar que o estimate sumiu.",
      "Usar date range antigo e nao clicar Clear All.",
    ],
    bugSignals: [
      "Clear All nao volta os filtros ao padrao.",
      "Estimate aparece sem search, mas desaparece mesmo buscando pelo numero correto.",
      "Ordenacao nao muda quando clica no titulo da coluna.",
    ],
    supportEscalationNote:
      "Se filtros, search ou ordenacao nao respondem com dados claramente visiveis, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-main-dashboard",
    module: "estimates",
    intent: "estimates dashboard chart total estimates average value monthly sales filters",
    terms: ["estimate dashboard", "dashboard estimates", "grafico estimates", "total estimates", "average value", "monthly sales", "dashboard vazio", "grafico vazio", "cards estimates", "o dashboard conta quantidade"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Estimates Dashboard",
    directAnswer:
      "O dashboard de estimates fica acima da tabela e respeita os filtros da tela. Ele mostra o grafico mensal e permite alternar entre Total Estimates e Average Value. Esses cards sao valores financeiros dos estimates, nao apenas contagem de linhas.",
    prerequisites: ["Os filtros de periodo, date range e status afetam o dashboard.", "Se nao houver estimates dentro do filtro atual, o grafico pode ficar vazio."],
    commonMistakes: [
      "Interpretar Total Estimates como quantidade simples em vez de valor total.",
      "Achar que o dashboard ignora filtros da tabela.",
      "Manter um date range/status restrito e achar que o grafico esta com erro.",
    ],
    bugSignals: [
      "Tabela mostra estimates no filtro atual, mas dashboard fica zerado.",
      "Trocar filtros nao atualiza o grafico.",
      "O card Average Value aparece inconsistente com a lista filtrada.",
    ],
    supportEscalationNote:
      "Se filtros e dados estao corretos e o dashboard nao atualiza, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-main-table",
    module: "estimates",
    intent: "estimates table columns row click status price seller client address",
    terms: ["tabela estimates", "table estimates", "colunas estimates", "number date", "client address", "price seller status actions", "clicar na linha", "abrir estimate", "status badge", "preco estimate", "seller estimate"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Estimates table",
    directAnswer:
      "A tabela mostra Number com data, Client/Address, Price, Seller, Status e Actions. O Price mostra o total efetivo do estimate, considerando ajustes como desconto/final amount quando existirem. Ao clicar na linha, o sistema abre o editor completo do estimate.",
    prerequisites: ["O estimate precisa estar dentro dos filtros atuais para aparecer.", "Para conferir sem editar, use Actions > View Estimate."],
    commonMistakes: [
      "Clicar na linha esperando abrir apenas visualizacao; a linha abre o editor.",
      "Comparar price da tabela com subtotal antigo sem considerar desconto ou total final.",
      "Procurar um project convertido nessa tabela em vez de Projects.",
    ],
    bugSignals: [
      "Price da tabela nao bate com o total efetivo mostrado no estimate.",
      "Status aparece errado apos atualizar a pagina.",
      "Actions nao abre para uma linha visivel.",
    ],
    supportEscalationNote:
      "Se as informacoes da tabela nao batem com o estimate aberto, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-main-export",
    module: "estimates",
    intent: "export estimates pdf excel selection mode report visible selected estimates file format",
    terms: ["export estimates", "exportar estimates", "exporto estimates", "como exporto estimates", "export estimates pdf ou excel", "export estimates excel ou pdf", "qual arquivo export estimates", "qual formato export estimates", "formato do export estimates", "arquivo export estimates", "exportar estimates em pdf", "exportar estimates em excel", "exporto estimates em excel", "como exporto estimates em excel", "exportar em excel", "export pdf estimates", "export excel estimates", "excel estimates", "relatorio excel", "pdf estimates", "relatorio estimates", "selecionar estimates export", "export pegou estimates errados"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Export Estimates",
    directAnswer:
      "Export Estimates pode gerar dois tipos de arquivo: PDF ou Excel. Clique em Export Estimates, escolha PDF ou Excel, selecione/ajuste os estimates visiveis pelo filtro atual e confirme para gerar o relatorio.",
    prerequisites: ["Precisa ter pelo menos um estimate selecionado.", "A exportacao usa a lista visivel/selecionada no momento."],
    commonMistakes: [
      "Achar que Export PDF baixa cada PDF individual; ele gera um relatorio da lista selecionada.",
      "Esquecer filtros ativos antes de exportar.",
      "Cancelar o modo selecao antes de confirmar a exportacao.",
    ],
    bugSignals: [
      "Export com estimates selecionados nao gera arquivo.",
      "Relatorio exportado nao respeita a selecao atual.",
      "Botao fica travado em modo export.",
    ],
    supportEscalationNote:
      "Se ha estimates selecionados e a exportacao nao gera PDF/Excel, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-row-editor",
    module: "estimates",
    intent: "open estimate row editor save changes save and send discard close preview edit services terms discount location",
    terms: ["editar estimate", "abrir estimate", "clicar estimate", "row editor", "editor estimate", "save changes", "save and send", "discard changes", "close estimate", "preview estimate", "editar services estimate", "editar desconto estimate", "project location estimate"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > click estimate row",
    directAnswer:
      "Para editar um estimate existente, clique na linha dele. O editor abre com preview e permite ajustar conteudo, services, custom service, secoes, terms, desconto e project location quando disponivel. Save Changes salva; Save And Send salva e abre o envio por email.",
    prerequisites: ["So existem botoes de salvar quando ha alteracoes pendentes.", "Close fecha o editor; Discard Changes desfaz alteracoes nao salvas."],
    commonMistakes: [
      "Usar View Estimate tentando editar; View Estimate e apenas visualizacao rapida.",
      "Fechar sem salvar depois de alterar.",
      "Esperar Save And Send enviar direto sem passar pelo modal de email.",
    ],
    bugSignals: [
      "Alteracoes salvas somem depois de atualizar.",
      "Save Changes fica desabilitado mesmo apos editar.",
      "Save And Send salva mas nao abre o modal de email.",
    ],
    supportEscalationNote:
      "Se o usuario edita corretamente e as alteracoes nao persistem, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-view-estimate",
    module: "estimates",
    intent: "view estimate modal information client summary services subtotal discount total",
    terms: ["view estimate", "view estimate mostra o que", "o que mostra view estimate", "visualizar estimate", "ver estimate", "modal view estimate", "client information estimate", "estimate summary", "services details", "subtotal discount total", "view mostra o que"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > View Estimate",
    directAnswer:
      "View Estimate abre uma visualizacao rapida. Ela mostra client information, email, phone, project address, total amount, status, services details, subtotal, discount e total. Nao e o editor; para editar, clique na linha do estimate.",
    prerequisites: ["O estimate precisa estar visivel na tabela.", "Use a action de tres pontos para abrir View Estimate."],
    commonMistakes: [
      "Tentar editar dentro de View Estimate.",
      "Confundir View Estimate com Download PDF.",
      "Procurar timeline dentro de View Estimate; timeline tem action propria.",
    ],
    bugSignals: [
      "View Estimate abre sem services que existem no editor.",
      "Total ou discount nao bate com a tabela.",
      "Modal nao abre ao clicar na action.",
    ],
    supportEscalationNote:
      "Se View Estimate mostra dados diferentes do editor, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-timeline",
    module: "estimates",
    intent: "estimate timeline drawer events created viewed approved rejected canceled email sent failed",
    terms: ["timeline estimate", "timeline estimates", "historico estimate", "activity timeline", "eventos estimate", "created viewed approved rejected canceled email sent failed", "drawer timeline", "timeline mostra o que"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Timeline",
    directAnswer:
      "Timeline abre um drawer lateral com os eventos do estimate em ordem cronologica. Ela pode mostrar created, viewed, approved, rejected, canceled, email sent e failed quando esses eventos acontecerem.",
    prerequisites: ["Eventos aparecem conforme acoes acontecem no estimate.", "Estimates novos podem ter poucos eventos."],
    commonMistakes: [
      "Esperar eventos que ainda nao aconteceram.",
      "Confundir Timeline com View Estimate.",
      "Achar que timeline vazia significa que o estimate nao existe.",
    ],
    bugSignals: [
      "Email enviado com sucesso nao aparece na timeline.",
      "Cancelamento ou aprovacao nao registra evento.",
      "Timeline nao abre para nenhum estimate.",
    ],
    supportEscalationNote:
      "Se uma acao aconteceu e a timeline nao registra depois de atualizar, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-download-pdf",
    module: "estimates",
    intent: "download estimate pdf pdf not available current pdf",
    terms: ["download pdf estimate", "baixar pdf estimate", "pdf estimate", "pdf not available", "download pdf indisponivel", "pdf nao baixa", "pdf nao disponivel", "baixar estimate"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Download PDF",
    directAnswer:
      "Download PDF baixa o PDF atual daquele estimate. Se aparecer PDF Not Available, o estimate ainda nao tem PDF disponivel para download ou houve falha na geracao/salvamento. Se voce acabou de editar, abra o estimate e salve/gere novamente antes de tentar baixar.",
    prerequisites: ["O estimate precisa ter um PDF disponivel.", "O link do PDF pode expirar e ser renovado quando a lista recarrega."],
    commonMistakes: [
      "Confundir Export Estimates com Download PDF individual.",
      "Tentar baixar PDF antes de salvar o estimate.",
      "Esperar PDF em um estimate que ainda nao teve PDF gerado.",
    ],
    bugSignals: [
      "PDF existe no estimate, mas Download PDF continua indisponivel.",
      "Download inicia mas baixa arquivo vazio.",
      "PDF baixado nao reflete a ultima versao salva.",
    ],
    supportEscalationNote:
      "Se o estimate foi salvo e ainda assim nao ha PDF ou o arquivo vem incorreto, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-send-email",
    module: "estimates",
    intent: "send estimate by email modal recipients body copy attachments preview automatic pdf",
    terms: ["send by email estimate", "enviar estimate por email", "send estimate", "email estimate", "modal send estimate", "recipient emails", "send me a copy", "email body", "attachments estimate", "automatic attachment", "email preview", "multiplos emails"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Send By Email",
    directAnswer:
      "Send By Email abre o modal de envio. O PDF do estimate vai como anexo automatico. Voce pode editar destinatarios, body do email, marcar Send me a copy, adicionar anexos extras e ver preview. Para multiplos emails, separe por virgula.",
    prerequisites: ["Precisa informar pelo menos um destinatario valido.", "A action fica desabilitada para estimate canceled.", "Arquivos extras muito grandes ou bloqueados pelo email podem ser recusados."],
    commonMistakes: [
      "Nao informar destinatario.",
      "Separar multiplos emails sem virgula.",
      "Achar que precisa anexar manualmente o PDF do estimate; ele ja vai automatico.",
      "Tentar enviar estimate canceled.",
    ],
    bugSignals: [
      "Email valido nao envia.",
      "Preview abre, mas o envio falha para todos os destinatarios.",
      "PDF automatico nao vai no email.",
    ],
    supportEscalationNote:
      "Se os emails estao validos e o estimate nao esta canceled, mas o envio falha, tratar como possivel falha tecnica ou problema de entrega de email.",
  },
  {
    id: "estimates-action-convert-to-invoice",
    module: "estimates",
    intent: "convert estimate to invoice payment customize percentage fixed stripe quickbooks fully paid canceled",
    terms: ["convert to invoice", "converter para invoice", "estimate to invoice", "criar invoice do estimate", "fully paid", "payment tab", "customize tab", "percentage invoice", "fixed invoice", "due date invoice", "stripe invoice", "quickbooks invoice", "save invoice", "create and send"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Convert > Convert to Invoice",
    directAnswer:
      "Para gerar invoice a partir de um estimate, abra Actions > Convert > Convert to Invoice. O modal tem Payment e Customize. Em Payment voce define recipients, custom creation date opcional, due date, amount por percentage ou fixed e payment method. Save Invoice salva; Create & Send cria e envia.",
    prerequisites: ["Nao fica disponivel para estimate canceled.", "Se o estimate ja esta fully paid, nao ha balance due para criar nova invoice.", "Stripe e QuickBooks precisam estar configurados para aparecerem disponiveis."],
    commonMistakes: [
      "Tentar converter estimate canceled.",
      "Tentar criar invoice quando o estimate ja esta fully paid.",
      "Selecionar Stripe ou QuickBooks sem configurar antes em Settings.",
      "Nao preencher due date ou valor valido.",
    ],
    bugSignals: [
      "Estimate nao canceled e com saldo, mas Convert to Invoice fica bloqueado.",
      "Stripe ou QuickBooks configurado aparece como Setup required.",
      "Save Invoice ou Create & Send falha com dados validos.",
    ],
    supportEscalationNote:
      "Se o estimate tem saldo, nao esta canceled e os campos estao validos, mas a invoice nao cria, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-convert-to-project",
    module: "estimates",
    intent: "convert estimate to project approved pre-start services move to projects irreversible",
    terms: ["convert to project", "converter para project", "estimate to project", "virar projeto", "estimate sumiu", "sumiu depois de converter", "pre-start", "approved automatico", "servicos viram projeto", "nao pode desfazer"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Convert > Convert to Project",
    directAnswer:
      "Convert to Project transforma o estimate em projeto. O sistema mostra uma confirmacao avisando que a acao nao pode ser desfeita. Se o estimate ainda nao estava approved, ele passa a approved durante a conversao. Depois disso, acompanhe em Projects.",
    prerequisites: ["Nao fica disponivel para estimate canceled.", "Depois da conversao, os services do estimate passam a compor os services do project."],
    commonMistakes: [
      "Procurar o estimate convertido na lista principal de estimates.",
      "Converter antes de revisar, esquecendo que a acao nao pode ser desfeita pela tela.",
      "Achar que os services precisam ser recriados no project; eles sao levados na conversao.",
    ],
    bugSignals: [
      "Conversao confirma, mas o projeto nao aparece em Projects.",
      "Services do estimate nao aparecem no project convertido.",
      "Estimate nao canceled nao permite abrir Convert to Project.",
    ],
    supportEscalationNote:
      "Se a conversao confirma e o project ou services nao aparecem, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-cancel",
    module: "estimates",
    intent: "cancel estimate keep history block send convert approved signed estimate",
    terms: ["cancel estimate", "cancelar estimate", "cancelar orcamento", "estimate canceled", "canceled estimate", "cancel mantem historico", "cancelar aprovado", "cancelar assinado", "bloqueia send convert"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Cancel",
    directAnswer:
      "Cancel marca o estimate como canceled e mantem o historico/timeline. Depois de canceled, enviar por email e converter ficam bloqueados. Se o estimate estava approved/assinado, o sistema remove o efeito da aprovacao/assinatura no estimate e marca como canceled.",
    prerequisites: ["A action aparece quando o estimate ainda nao esta canceled.", "Use Cancel quando precisa manter registro historico."],
    commonMistakes: [
      "Usar Delete quando queria apenas cancelar e manter historico.",
      "Esperar converter ou enviar estimate depois de canceled.",
      "Achar que cancelar apaga o estimate da mesma forma que delete.",
    ],
    bugSignals: [
      "Cancelamento confirma, mas o status nao muda.",
      "Timeline nao registra cancelamento.",
      "Estimate canceled ainda permite send/convert.",
    ],
    supportEscalationNote:
      "Se cancelar confirma e o estimate continua ativo, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-action-delete",
    module: "estimates",
    intent: "delete estimate permanent approved not allowed cancel instead related data",
    terms: ["delete estimate", "deletar estimate", "apagar estimate", "delete permanente", "delete approved estimate", "deletar approved", "delete ou cancel", "remover estimate", "confirm deletion"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Delete",
    directAnswer:
      "Delete remove o estimate de forma permanente e pode remover dados relacionados, como services, costs, schedule, photos, documents e history. Ele so aparece quando o estimate nao esta approved. Se o objetivo e manter historico, use Cancel.",
    prerequisites: ["Estimate approved nao pode ser deletado pela action; nesse caso, o caminho e cancelar.", "Delete e permanente."],
    commonMistakes: [
      "Deletar quando queria apenas cancelar.",
      "Esperar recuperar dados depois do delete.",
      "Tentar deletar estimate approved.",
    ],
    bugSignals: [
      "Estimate nao approved nao mostra Delete.",
      "Delete confirma, mas o estimate continua na lista apos atualizar.",
      "Modal de confirmacao nao abre.",
    ],
    supportEscalationNote:
      "Se o estimate nao e approved e mesmo assim nao deleta, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-main-common-issues",
    module: "estimates",
    intent: "common estimates main page issues permission missing search dashboard export pdf convert cancel delete",
    terms: ["nao vejo estimates", "estimates nao aparece", "estimate sumiu", "dashboard vazio", "search nao encontra", "export errado", "pdf nao baixa", "convert bloqueado", "converter bloqueado", "cancelar deletar", "problema estimates", "erro estimates"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates",
    directAnswer:
      "Se Estimates nao aparece, confira a permissao Estimates. Se um estimate sumiu apos Convert to Project, procure em Projects. Se search nao encontra, busque por number ou client name. Para dashboard vazio, revise period, status e date range.",
    prerequisites: ["Permissao Estimates para acessar a tela.", "Filtros ativos afetam dashboard, tabela e export.", "Algumas actions ficam bloqueadas para canceled, approved ou fully paid conforme o caso."],
    commonMistakes: [
      "Buscar por address ou seller no search.",
      "Exportar com filtros ou selecao errada.",
      "Confundir Export Estimates com Download PDF individual.",
      "Tentar Convert to Invoice em estimate canceled ou fully paid.",
      "Tentar Delete em estimate approved.",
    ],
    bugSignals: [
      "Fluxo correto com permissao correta ainda falha.",
      "Dados somem ou nao atualizam apos refresh.",
      "Action fica bloqueada sem motivo aparente para um estimate elegivel.",
    ],
    supportEscalationNote:
      "Se o usuario esta fazendo o fluxo correto e mesmo assim nao funciona, responder como possivel falha tecnica, sem criar ticket automatico.",
  },
  {
    id: "estimates-builder-entry-and-types",
    module: "estimates",
    intent: "new estimate entry manual builder smart ai builder choose flow",
    terms: ["new estimate", "criar estimate", "novo estimate", "type estimate", "manual builder", "manual buildwer", "smart builder", "smart ai builder", "smartbuilder", "fluxo manual", "fluxo ia", "builder estimate", "diferenca manual smart"],
    route: "/seller/new-estimate/type-estimate",
    uiLocation: "Financials > Estimates > New Estimate",
    directAnswer:
      "Para criar um estimate, va em Financials > Estimates e clique em New Estimate. O sistema abre a escolha entre Manual Builder e Smart AI Builder: Manual e para montar os itens manualmente pelo catalogo/custom service; Smart AI Builder e para descrever o escopo, enviar arquivos ou audio e revisar uma proposta de line items antes de salvar.",
    prerequisites: ["O usuario precisa ter permissao Estimates.", "Nenhum dos dois fluxos salva o estimate antes da tela final de builder/resumo."],
    commonMistakes: [
      "Escolher Smart AI achando que ele ja salva ou envia automaticamente.",
      "Escolher Manual e esperar que o sistema gere itens sozinho.",
      "Achar que a escolha do builder substitui a selecao de client e property location; ambos continuam necessarios.",
    ],
    bugSignals: [
      "New Estimate nao abre a tela de escolha.",
      "Selecionar Manual ou Smart AI nao leva para Select Client.",
      "Usuario tem permissao Estimates e mesmo assim nao consegue iniciar o fluxo.",
    ],
    supportEscalationNote:
      "Se o usuario tem permissao Estimates e nao consegue iniciar nenhum builder, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-builder-client-location",
    module: "estimates",
    intent: "select client work context create new client property location before services",
    terms: [
      "select client estimate",
      "selecionar client estimate",
      "cliente no estimate",
      "client dentro do estimate",
      "new client estimate",
      "new client dentro estimate",
      "criar cliente no estimate",
      "criar client dentro do estimate",
      "posso criar client dentro do estimate",
      "adicionar client estimate",
      "work context estimate",
      "property location",
      "location estimate",
      "mapa estimate",
      "nao consigo avancar client",
      "criar cliente durante estimate",
    ],
    route: "/seller/new-estimate/client-data",
    uiLocation: "Financials > Estimates > New Estimate > Select Client / Property Location",
    directAnswer:
      "Depois de escolher o builder, selecione um client e uma property location. Se o client ainda nao existe, clique em New Client nessa mesma tela; ao criar ali, o novo client/work context ja fica selecionado no estimate.",
    prerequisites: ["Client selecionado e property location selecionada sao necessarios para avancar.", "Se o client tiver work contexts, o sistema usa o contato escolhido para nome, email, phone e office address do estimate."],
    commonMistakes: [
      "Tentar avancar sem selecionar location no mapa.",
      "Criar client em outra tela achando que precisa sair do estimate; o fluxo tem New Client proprio.",
      "Selecionar o client correto, mas escolher o work context errado.",
      "Achar que property location e o mesmo que office address do client.",
    ],
    bugSignals: [
      "Novo client criado no modal nao fica selecionado no estimate.",
      "Location aparece selecionada, mas o botao continua bloqueado.",
      "Work context escolhido nao leva email/phone corretos para o resumo.",
    ],
    supportEscalationNote:
      "Se client e location estao preenchidos e o fluxo nao avanca, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-manual-services-step",
    module: "estimates",
    intent: "manual builder services step catalog search filters categories subcategories to complete",
    terms: ["services step estimate", "etapa services estimate", "manual services estimate", "buscar service estimate", "filter by type estimate", "services materials estimate", "categoria estimate", "subcategoria estimate", "to complete", "adicionar service no estimate", "material no estimate", "service do catalogo estimate"],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "Financials > Estimates > New Estimate > Manual Builder > Services",
    directAnswer:
      "No Manual Builder, a etapa Services mostra categorias do catalogo. Use search para achar categoria, Filter by type para alternar Services/Materials, abra a categoria, escolha o item dentro da subcategoria e configure quantidade/preco. Depois de adicionar pelo menos um item, clique em To complete para ir ao builder/resumo.",
    prerequisites: ["Para aparecer nessa etapa, o item precisa existir no catalogo com categoria, subcategoria e service/material.", "Para ir ao resumo, precisa ter pelo menos um item selecionado."],
    commonMistakes: [
      "Procurar material com o filtro em Services, ou service com o filtro em Materials.",
      "Criar so categoria no catalogo, sem subcategoria e item, e esperar aparecer no estimate.",
      "Clicar To complete sem nenhum item no estimate.",
      "Confundir esta etapa com Management > Services, que e onde o catalogo e criado/editado.",
    ],
    bugSignals: [
      "Categoria completa do catalogo nao aparece com filtro correto.",
      "Item selecionado nao abre o modal de configuracao.",
      "Item configurado nao entra no cart/estimate.",
    ],
    supportEscalationNote:
      "Se o catalogo esta correto, filtro correto e o item nao aparece ou nao adiciona, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-catalog-service-configuration",
    module: "estimates",
    intent: "configure selected catalog service fixed variable price quantity safety margin photos",
    terms: ["fixed service estimate", "variable service estimate", "preco fixo estimate", "preco variavel estimate", "price range estimate", "slider price", "quantity service estimate", "safety margin", "margin safe", "margem seguranca", "fotos service estimate", "photo gallery service", "10 imagens", "5mb image"],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "Financials > Estimates > New Estimate > Services > selected service modal",
    directAnswer:
      "Ao escolher um item do catalogo, o sistema abre o modal de configuracao. Informe quantity e price. Se o item for Variable, aparece a faixa de preco e um slider para ajustar dentro do minimo e maximo. Opcionalmente, use Safety Margin para somar uma margem de 1% a 20% e anexe fotos do service.",
    prerequisites: ["Quantity maior que zero e necessaria para adicionar.", "Fotos aceitam imagens JPEG, PNG ou GIF, ate 5MB cada, com limite de 10 imagens no service."],
    commonMistakes: [
      "Nao informar quantity.",
      "Nao perceber que service Variable pode ter preco ajustado dentro da faixa.",
      "Achar que Safety Margin altera o item no catalogo; ele afeta o item naquele estimate.",
      "Anexar arquivo que nao e imagem ou arquivo acima de 5MB.",
    ],
    bugSignals: [
      "Quantity e price validos, mas Add Service continua bloqueado.",
      "Slider de variable price nao respeita a faixa exibida.",
      "Imagem valida nao faz upload ou nao aparece depois de adicionada.",
    ],
    supportEscalationNote:
      "Se dados validos nao adicionam o service ou fotos validas nao sobem, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-custom-service-builder",
    module: "estimates",
    intent: "custom service in estimate builder not saved to catalog ai description enhance",
    terms: ["custom service estimate", "custom service", "servico custom estimate", "custom service salva no catalogo", "custom service catalogo", "generate step by step", "generate description", "enhance description", "ai description service", "add custom service estimate"],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "Estimate builder > Custom Service / Add Service > Custom Service",
    directAnswer:
      "Custom service cria um item apenas para aquele estimate. Ele nao cria nem edita item no catalogo em Management > Services. No modal, informe nome, description, quantity e price; se quiser, use Generate Step-by-step ou Enhance para ajudar no texto da description.",
    prerequisites: ["Service name, quantity maior que zero e price preenchido sao necessarios para adicionar.", "Para criar item reutilizavel no catalogo, use Management > Services."],
    commonMistakes: [
      "Achar que Custom service vira item do catalogo.",
      "Tentar adicionar sem nome, quantity ou price.",
      "Usar Custom service quando queria criar uma categoria/subcategoria reutilizavel.",
      "Achar que AI description salva sozinha; ainda precisa adicionar o service e salvar/criar o estimate.",
    ],
    bugSignals: [
      "Custom service com campos validos nao adiciona.",
      "Generate/Enhance de description falha repetidamente.",
      "Custom service adicionado some antes de salvar sem o usuario sair do fluxo.",
    ],
    supportEscalationNote:
      "Se os campos estao validos e o custom service nao adiciona, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-smartbuilder-flow",
    module: "estimates",
    intent: "smartbuilder ai estimate chat upload audio proposal line items apply services",
    terms: ["smartbuilder estimate", "smart builder estimate", "smart ai estimate", "ia estimate", "ai builder estimate", "upload scope", "audio smartbuilder", "view proposal", "apply to line items", "proposta smartbuilder", "line items smartbuilder", "editar proposta smartbuilder"],
    route: "/seller/new-estimate/smart-builder/:id",
    uiLocation: "Financials > Estimates > New Estimate > Smart AI Builder",
    directAnswer:
      "No Smart AI Builder, descreva o escopo, envie arquivos ou grave audio. O sistema monta uma proposta de line items; abra View Proposal, revise, edite se precisar e clique em Apply To Line Items. Nada e salvo no estimate ate aplicar a proposta e depois salvar ou criar/enviar no builder.",
    prerequisites: ["Client e property location continuam obrigatorios antes do SmartBuilder.", "A proposta precisa ser aplicada aos line items para ir ao builder/resumo."],
    commonMistakes: [
      "Achar que o SmartBuilder envia o estimate automaticamente.",
      "Fechar a proposta sem Apply To Line Items.",
      "Nao revisar quantity, price e description antes de salvar.",
      "Achar que os itens gerados viram itens do catalogo automaticamente.",
    ],
    bugSignals: [
      "Mensagem com escopo valido nao retorna proposta.",
      "Arquivo aceito nao anexa ou nao e considerado.",
      "Apply To Line Items nao leva os itens para o builder.",
    ],
    supportEscalationNote:
      "Se a IA processa, mas a proposta nao aparece ou nao aplica, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-builder-summary-overview",
    module: "estimates",
    intent: "estimate builder summary sections preview template work context discount emails custom date",
    terms: ["summary estimate", "services summary estimate", "resumo estimate", "builder resumo", "pdf template estimate", "classic template", "modern template", "work context no resumo", "additional emails estimate", "custom creation date", "discount estimate", "desconto estimate", "sections estimate", "preview estimate builder"],
    route: "/seller/new-estimate/services-summary/:id",
    uiLocation: "Estimate builder / summary",
    directAnswer:
      "No builder/resumo, voce revisa o estimate antes de salvar ou enviar. Ali da para escolher PDF Template, conferir o preview, trocar Work Context, aplicar desconto, ajustar additional emails, custom creation date e ligar/desligar sections como cover, services, terms e image attachments.",
    prerequisites: ["Precisa existir pelo menos um service no estimate.", "Company details e property location precisam estar completos para salvar/criar."],
    commonMistakes: [
      "Achar que mudar preview ja salva o estimate; precisa clicar Save, Save Changes ou Create & Send.",
      "Escolher work context errado e enviar para email errado.",
      "Aplicar desconto invalido, como percentage acima de 100 ou fixed maior que subtotal.",
      "Achar que custom creation date e obrigatoria; se vazio, o sistema usa a data atual.",
    ],
    bugSignals: [
      "Template selecionado nao muda o preview.",
      "Work context selecionado nao atualiza dados do client.",
      "Desconto valido mostra erro ou nao recalcula total.",
    ],
    supportEscalationNote:
      "Se dados validos nao atualizam preview/totais ou bloqueiam salvar, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-builder-letter-terms-variables",
    module: "estimates",
    intent: "introduction letter terms conditions variables from settings used in estimate",
    terms: ["introduction letter estimate", "letter estimate", "terms conditions estimate", "terms and conditions estimate", "variables estimate", "{{clientName}}", "{{clientEmail}}", "{{projectLocation}}", "policies terms estimate", "settings terms estimate"],
    route: "/seller/new-estimate/services-summary/:id",
    uiLocation: "Estimate builder > Introduction Letter / Terms & Conditions",
    directAnswer:
      "Introduction Letter e Terms & Conditions vem de Settings > Policies & Terms. As variaveis clientName, clientEmail e projectLocation sao substituidas no estimate pelos dados do client e da property location. Voce pode editar o texto no builder antes de salvar.",
    prerequisites: ["Os textos padrao precisam estar configurados em Settings > Policies & Terms para aparecerem automaticamente.", "As variaveis dependem dos dados selecionados no estimate."],
    commonMistakes: [
      "Editar o texto no estimate achando que altera o padrao em Settings; isso muda apenas aquele estimate.",
      "Esperar variavel ser preenchida sem client/email/location disponivel.",
      "Achar que Classic Template sempre mostra Introduction Letter; nesse template a intro pode ficar desabilitada.",
    ],
    bugSignals: [
      "Texto configurado em Settings nao carrega no builder.",
      "Variaveis nao sao substituidas mesmo com client/email/location preenchidos.",
      "Salvar letter/terms no builder nao reflete no preview.",
    ],
    supportEscalationNote:
      "Se Settings esta configurado e os dados existem, mas letter/terms nao carregam ou nao substituem variaveis, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-builder-line-items-and-images",
    module: "estimates",
    intent: "line items edit delete reorder add service image attachments service photos standalone photos",
    terms: ["line items estimate", "quoted items estimate", "editar service no builder", "deletar service estimate", "reordenar services", "add service builder", "image attachments estimate", "fotos no pdf estimate", "standalone photos estimate", "service photos estimate", "imagens anexadas estimate"],
    route: "/seller/new-estimate/services-summary/:id",
    uiLocation: "Estimate builder > Services & Items / Image Attachments",
    directAnswer:
      "No builder, Services & Items permite editar, deletar e reordenar os line items. As fotos adicionadas nos services aparecem em Image Attachments, e voce tambem pode adicionar fotos standalone nessa section. Essas imagens entram no PDF quando a section esta habilitada.",
    prerequisites: ["A section Image Attachments precisa estar habilitada para aparecer no PDF.", "As fotos precisam estar adicionadas no service ou como standalone photos."],
    commonMistakes: [
      "Adicionar foto no service e desabilitar Image Attachments.",
      "Editar/deletar/reordenar item e sair sem salvar.",
      "Achar que editar item no estimate altera o service original no catalogo.",
      "Adicionar muitas imagens e esperar que todas caibam no PDF/email sem limite.",
    ],
    bugSignals: [
      "Fotos aparecem no builder, mas nao aparecem no preview com Image Attachments habilitado.",
      "Reordenacao ou edicao de item nao persiste apos salvar.",
      "Service deletado continua aparecendo depois de atualizar.",
    ],
    supportEscalationNote:
      "Se sections, imagens ou line items estao corretos e o preview/salvamento nao reflete, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-builder-generate-pdf-save-send",
    module: "estimates",
    intent: "generate pdf preview save create send save changes save and send differences",
    terms: ["generate pdf estimate", "gerar pdf estimate", "generate pdf envia", "save estimate", "save changes estimate", "save and send estimate", "create and send", "create & send", "save ou send", "pdf nao mudou", "pdf baixado nao mudou", "enviar estimate"],
    route: "/seller/new-estimate/services-summary/:id",
    uiLocation: "Estimate builder > Preview / action buttons",
    directAnswer:
      "Generate PDF serve para revisar como o PDF vai ficar; ele nao envia o estimate ao client. Save ou Save Changes salva sem enviar. Create & Send cria o estimate e abre o modal de email. Save And Send, na edicao, salva as alteracoes e abre o modal de email.",
    prerequisites: ["Para salvar/criar, o estimate precisa ter services, email valido, company details e property location completos.", "Para enviar, o modal de email precisa ter destinatario valido."],
    commonMistakes: [
      "Achar que Generate PDF ja envia para o client.",
      "Fechar a tela depois de editar sem Save/Save Changes.",
      "Esperar PDF baixado refletir mudanca que ainda nao foi salva/gerada.",
      "Achar que Create & Send envia sem passar pelo modal de email.",
    ],
    bugSignals: [
      "Generate PDF falha com dados validos.",
      "Save/Save Changes confirma, mas dados nao persistem.",
      "Create & Send cria estimate, mas nao abre modal de email.",
      "PDF gerado/baixado nao reflete dados salvos.",
    ],
    supportEscalationNote:
      "Se o usuario salvou/gerou corretamente e o PDF continua antigo ou o envio nao abre, tratar como possivel falha tecnica.",
  },
  {
    id: "estimates-editor-existing-estimate",
    module: "estimates",
    intent: "edit existing estimate builder same rules as new estimate row click save changes save and send",
    terms: [
      "editar estimate existente",
      "como edito estimate existente",
      "como edito um estimate existente",
      "edito estimate existente",
      "alterar estimate existente",
      "edit existing estimate",
      "editar estimate da tabela",
      "editar estimate existente pela tabela",
      "clicar linha estimate",
      "edicao estimate",
      "isso vale editando",
      "builder edit estimate",
      "save changes",
      "save and send",
      "view estimate editar",
      "editar estimate aprovado",
      "estimate aprovado assinatura",
      "estimate aprovado perde assinatura",
      "estimate approved signature",
      "estimate pending signature",
      "pendente de assinatura estimate",
      "estimate volta para pending",
    ],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > click estimate row",
    directAnswer:
      "Para editar um estimate existente, clique na linha dele na tabela. O editor completo abre com as mesmas ideias do builder: services, sections, template, terms, discount, images e preview podem ser ajustados quando disponiveis. Se um estimate aprovado for alterado em partes importantes, o status continua Approved, mas ele pode ficar com pendencia de assinatura e remover a assinatura do cliente.",
    prerequisites: ["O estimate precisa estar visivel na lista/filtros.", "Alteracoes so persistem depois de Save Changes ou Save And Send.", "Estimate aprovado editado em partes importantes nao volta para status Pending; ele continua Approved, mas pode exigir nova assinatura."],
    commonMistakes: [
      "Abrir Actions > View Estimate tentando editar.",
      "Editar services/terms/discount/images e fechar sem salvar.",
      "Achar que Save And Send envia direto; ele salva e abre o modal de email.",
      "Esperar que mudancas no editor alterem o catalogo em Management > Services.",
      "Achar que editar estimate aprovado muda o status para Pending; o que pode voltar e a pendencia de assinatura.",
    ],
    bugSignals: [
      "Clicar na linha nao abre o editor.",
      "Save Changes salva, mas ao atualizar volta ao valor antigo.",
      "Save And Send nao abre modal de email.",
      "SmartBuilder na edicao nao aplica proposta aos line items.",
    ],
    supportEscalationNote:
      "Se o usuario abre o editor correto e salva, mas as mudancas nao persistem, tratar como possivel falha tecnica.",
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
      "Achar que Settings mostra dados privados pelo WhatsApp; o assistant apenas orienta onde ver no sistema.",
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
      "Pedir status privado da assinatura pelo WhatsApp; o assistant nao consulta dados da company.",
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
    intent: "difference between services catalog and using services materials inside estimate builder",
    terms: ["estimate services catalogo", "usar catalogo no estimate", "servico no estimate catalogo", "material no estimate catalogo", "custom service catalogo", "custom service salva", "custom service salva no catalogo", "service do catalogo estimate", "material do catalogo estimate"],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "Management > Services / Financials > Estimates > New Estimate > Services",
    directAnswer:
      "Management > Services e onde voce cria e edita o catalogo reutilizavel. No builder de estimate, voce apenas usa esses itens: busca categoria, filtra Services/Materials, escolhe o item e configura quantity/price para aquele estimate. Custom service vale so para aquele estimate e nao salva no catalogo.",
    prerequisites: ["Para aparecer no estimate, o item do catalogo precisa ter categoria, subcategoria e service/material dentro.", "Para criar item reutilizavel, use Management > Services; para usar no estimate, use a etapa Services do builder."],
    commonMistakes: [
      "Procurar um material com o filtro em Services, ou um service com o filtro em Materials.",
      "Achar que Custom service cria item no catalogo; ele vale apenas para aquele estimate.",
      "Editar um item no estimate achando que alterou o item original do catalogo.",
      "Criar so categoria no catalogo, sem subcategoria e item, e esperar aparecer no estimate.",
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
      "Se o fluxo esta correto e mesmo assim nao funciona, orientar como possivel falha tecnica, sem criar ticket automatico.",
  },
  {
    id: "projects-overview-list",
    module: "projects",
    intent: "projects list page filters search dashboard table new project",
    terms: ["projects", "projetos", "project list", "lista de projetos", "onde vejo projetos", "search projects", "buscar projeto", "new project", "novo projeto", "pre-start", "in progress", "final walkthrough", "finished"],
    route: "/seller/projects",
    uiLocation: `Projects (${projectsUrl})`,
    directAnswer:
      `A lista de projetos fica em Projects. Nessa tela o sistema mostra filtros de periodo, data customizada e status, search, paginacao, ordenacao, dashboard, tabela, Financial View, export PDF/Excel e o botao New Project. Os status ativos mais comuns sao Pre-Start, In Progress, Final walkthrough e Finished.`,
    prerequisites: ["O usuario precisa ter permissao Projects para ver a tela.", "Filtros ativos afetam dashboard, tabela e export."],
    commonMistakes: [
      "Procurar um project convertido ainda na lista principal de Estimates.",
      "Nao limpar filtros de periodo, status ou data customizada.",
      "Buscar por uma informacao que nao esta coberta pelo search da tela.",
    ],
    bugSignals: [
      "Usuario tem permissao Projects e mesmo assim nao ve o menu.",
      "Projeto aparece sem filtros, mas some com filtros corretos.",
      "Tabela ou dashboard nao atualiza depois de mudar filtros.",
    ],
    supportEscalationNote:
      "Se a permissao e os filtros estao corretos e o projeto ainda nao aparece, tratar como possivel falha tecnica.",
  },
  {
    id: "projects-dashboard-financial-view",
    module: "projects",
    intent: "projects dashboard financial view profit margin costs sales",
    terms: ["financial view", "visao financeira", "profit balance", "profit margin", "project dashboard", "sales dashboard", "total sales", "average value", "conversion rate", "employee cost", "subcontractor cost", "material cost", "lucro projeto", "margem projeto"],
    route: "/seller/projects",
    uiLocation: "Projects > Dashboard / Financial View",
    directAnswer:
      "No Projects Dashboard, o sistema mostra Total Sales, Average Value, Conversion Rate e vendas mensais respeitando os filtros da tela. Ao ligar Financial View, a tabela passa a mostrar estimate value, employee cost, subcontractor cost, material cost, profit balance e profit margin.",
    prerequisites: ["Os valores dependem de services, costs, invoices e pagamentos registrados no projeto.", "Filtros de data/status alteram os numeros exibidos."],
    commonMistakes: [
      "Interpretar o dashboard como contagem simples de projetos.",
      "Comparar Financial View sem conferir custos de materiais, employee cost, subcontractor cost e invoices.",
      "Esquecer que filtros ativos mudam os totais.",
    ],
    bugSignals: [
      "Custos aparecem nas tabs do projeto, mas nao refletem na Financial View.",
      "Dashboard continua vazio mesmo com projetos dentro do periodo correto.",
      "Profit balance ou margin nao muda depois de atualizar custos e recarregar.",
    ],
    supportEscalationNote:
      "Se os dados do projeto estao preenchidos e os filtros corretos, mas os numeros nao batem, tratar como possivel falha tecnica.",
  },
  {
    id: "projects-export-delete-actions",
    module: "projects",
    intent: "projects export pdf excel file format actions status delete project",
    terms: ["export projects", "export project", "exportar projetos", "exportar projeto", "export project pdf ou excel", "export projects pdf ou excel", "qual arquivo export project", "qual arquivo export projects", "qual arquivo exportar projetos", "qual formato export project", "qual formato export projects", "formato do export project", "formato do export projects", "arquivo export project", "arquivo export projects", "export financial", "baixar projeto", "pdf project", "pdf projects", "excel project", "excel projects", "delete project", "deletar projeto", "excluir projeto", "change status project", "mudar status projeto", "actions project"],
    route: "/seller/projects",
    uiLocation: "Projects > Export / Actions",
    directAnswer:
      "Em Projects, os formatos de export sao PDF ou Excel. O export gera um relatorio dos projetos visiveis ou selecionados; nao baixa PDFs individuais de cada projeto. Nas actions da lista, voce pode mudar o status. Delete project remove o projeto de forma permanente e deve ser usado com cuidado.",
    prerequisites: ["Para exportar, selecione os projetos desejados no modo de export.", "Para mudar status ou deletar, o usuario precisa conseguir acessar a lista de Projects."],
    commonMistakes: [
      "Achar que export baixa todos os arquivos individuais do projeto.",
      "Deletar quando o objetivo era apenas manter historico ou mudar status.",
      "Exportar com filtros ativos sem perceber que o relatorio segue a selecao atual.",
    ],
    bugSignals: [
      "Export nao gera arquivo com projetos selecionados.",
      "Status nao salva apos alteracao.",
      "Delete falha mesmo apos confirmacao.",
    ],
    supportEscalationNote:
      "Se a selecao e permissao estao corretas, mas export/status/delete falham, tratar como possivel falha tecnica.",
  },
  {
    id: "projects-new-project-flow",
    module: "projects",
    intent: "create new project direct manual smart builder client location services summary",
    terms: ["new project", "novo projeto", "criar projeto", "manual builder project", "smart builder project", "smart ai project", "client no project", "property location project", "project summary", "create and send project", "new client project"],
    route: "/seller/new-project/type-project",
    uiLocation: `Projects > New Project (${newProjectUrl})`,
    directAnswer:
      "Para criar um projeto direto, va em Projects e clique em New Project. O sistema pede Manual Builder ou Smart AI Builder, depois client/work context, property location, services e summary. Se criar um New Client dentro desse fluxo, ele ja fica selecionado para o projeto.",
    prerequisites: ["O usuario precisa ter permissao Projects.", "O fluxo precisa de client, location e pelo menos um service/material/custom service antes do resumo."],
    commonMistakes: [
      "Criar client fora do fluxo sem voltar e selecionar no projeto.",
      "Pular property location.",
      "Achar que Smart AI Builder salva automaticamente antes do resumo.",
      "Confundir custom service do projeto com item reutilizavel do catalogo.",
    ],
    bugSignals: [
      "New Client e criado, mas nao fica selecionado no fluxo.",
      "Location preenchida nao permite avancar.",
      "Service adicionado nao aparece no summary.",
    ],
    supportEscalationNote:
      "Se client, location e services estao corretos e o fluxo nao avanca ou nao salva, tratar como possivel falha tecnica.",
  },
  {
    id: "projects-from-estimate-conversion",
    module: "projects",
    intent: "convert estimate to project approved estimate moved project services",
    terms: ["convert to project", "converter para projeto", "estimate virou project", "estimate sumiu", "estimate convertido", "estimate aprovado virou projeto", "services do estimate no project", "estimate dentro do project"],
    route: "/seller/estimates",
    uiLocation: "Financials > Estimates > Actions > Convert > Convert to Project",
    directAnswer:
      "Convert to Project acontece a partir de Estimates. Depois da conversao, o estimate passa a ser acompanhado dentro do Project, e os services do estimate passam a compor os services do projeto. Se o estimate ainda nao estava approved, o sistema aprova durante a conversao.",
    prerequisites: ["O estimate nao pode estar canceled.", "Depois de converter, acompanhe o trabalho na tela de Projects."],
    commonMistakes: [
      "Procurar o estimate convertido na lista principal de Estimates.",
      "Achar que a conversao pode ser desfeita pela mesma action.",
      "Esperar que services convertidos continuem apenas no estimate original.",
    ],
    bugSignals: [
      "Conversao confirma, mas o project nao aparece em Projects.",
      "Project abre, mas services do estimate nao aparecem.",
      "Estimate convertido continua como se nao tivesse virado projeto.",
    ],
    supportEscalationNote:
      "Se a conversao foi confirmada e o projeto ou services nao aparecem, tratar como possivel falha tecnica.",
  },
  {
    id: "project-details-overview-header",
    module: "projects",
    intent: "project details tabs header actions cover photo duration manager seller client",
    terms: ["project details", "detalhes do projeto", "tabs project", "cover photo", "foto capa", "adjust duration", "project manager", "change seller", "editar client project", "tab details", "schedule tab", "estimate tab project"],
    route: "/seller/project/details/:id",
    uiLocation: "Project Details",
    directAnswer:
      "Ao clicar em um projeto, o sistema abre Project Details. Ali ficam as tabs Details, Schedule, Tasks, Reports, Estimate, Invoice, ChangeOrders, Services, Cost, CostHours, SubcontractorCost e Files. No header, voce pode alterar foto de capa, duration, project manager, seller e editar o client quando estiver na tab Details.",
    prerequisites: ["O usuario precisa ter acesso ao projeto.", "Algumas tabs tambem dependem de permissoes especificas, como Schedule e Tasks."],
    commonMistakes: [
      "Procurar todas as configuracoes do projeto apenas na lista de Projects.",
      "Tentar editar client fora da tab Details.",
      "Confundir tabs do projeto com paginas globais de Schedule, Reports ou Invoice.",
    ],
    bugSignals: [
      "Projeto abre, mas tabs principais nao carregam.",
      "Foto de capa valida nao salva.",
      "Seller ou project manager alterado nao permanece apos salvar.",
    ],
    supportEscalationNote:
      "Se o usuario tem acesso e a action correta nao salva ou nao carrega, tratar como possivel falha tecnica.",
  },
  {
    id: "project-details-metrics",
    module: "projects",
    intent: "project details metrics summary profit invoices balance location map",
    terms: ["project summary", "resumo projeto", "profit analysis", "analise de lucro", "project value", "material cost", "labor cost", "employee labor", "subcontractor labor", "balance due", "paid invoices", "location project", "export project details"],
    route: "/seller/project/details/:id?tab=Details",
    uiLocation: "Project Details > Details",
    directAnswer:
      "Na tab Details, o sistema mostra resumo financeiro, location/map, profit analysis, informacoes do client/contract, seller, project manager, status e export PDF. Project value vem dos services; material cost vem dos custos reais; labor junta employee e subcontractor cost; profit e a diferenca entre valor do projeto e custos.",
    prerequisites: ["Custos, services e invoices precisam estar registrados para os numeros ficarem completos.", "Location pode ser editada no bloco de mapa/location."],
    commonMistakes: [
      "Esperar que profit mude sem registrar custos ou invoices.",
      "Confundir paid invoices com total de invoices criadas.",
      "Procurar cost of materials dentro de Details em vez da tab Cost.",
    ],
    bugSignals: [
      "Custos registrados nao aparecem no resumo apos recarregar.",
      "Invoices pagas nao refletem no resumo.",
      "Location salva, mas volta para a anterior.",
    ],
    supportEscalationNote:
      "Se os dados existem nas tabs corretas e o resumo nao atualiza, tratar como possivel falha tecnica.",
  },
  {
    id: "project-schedule-tab",
    module: "projects",
    intent: "what is project details schedule service custom subservice workers subcontractors reminders complete",
    terms: ["project schedule", "schedule do projeto", "schedule project details", "project details schedule", "schedule em project details", "aba schedule", "tab schedule", "o que e schedule", "schedule e oq", "schedule e o que", "esse schedule", "pra que serve schedule", "agendamento do projeto", "agenda dos services", "agendar servico", "add service schedule", "custom service schedule", "custom service no schedule", "sub service", "subservice", "worker schedule", "subcontractor schedule", "reminder schedule", "mark completed", "set time", "deadline schedule", "dispatch calendar"],
    route: "/seller/project/details/:id?tab=Schedule",
    uiLocation: "Project Details > Schedule",
    directAnswer:
      "Em Project Details, a tab Schedule e a agenda dos services daquele projeto. Ela serve para definir quando cada service, custom service ou sub service vai acontecer, quem vai executar, start/deadline, horarios, descricao, reminders, edit/delete e mark completed. Nao e o mesmo Schedule global: aqui o foco e organizar os services dentro de um projeto especifico.",
    prerequisites: ["Precisa ter pelo menos um worker ou subcontractor atribuido para criar/editar o agendamento.", "Sub Service depende de um service/custom service pai."],
    commonMistakes: [
      "Confundir Schedule global com Schedule dentro do Project.",
      "Tentar criar Sub Service sem service pai agendado.",
      "Criar service schedule sem worker/subcontractor ou sem datas.",
      "Achar que Dispatch Calendar e o mesmo lugar de criacao dentro do Project.",
    ],
    bugSignals: [
      "Datas e assignees validos, mas o schedule nao salva.",
      "Reminder envia para destinatario errado ou nao envia.",
      "Servico marcado completed volta ao status anterior.",
    ],
    supportEscalationNote:
      "Se o schedule esta preenchido corretamente e nao salva, edita, envia reminder ou completa, tratar como possivel falha tecnica.",
  },
  {
    id: "project-tasks-reports-invoices",
    module: "projects",
    intent: "project tasks reports invoices global differences",
    terms: ["tasks project", "tarefas projeto", "reports project", "feed project", "invoice project", "invoices projeto", "dispatch tasks", "global reports", "invoice all", "receive payment", "payment link", "timeline invoice", "public report link"],
    route: "/seller/project/details/:id",
    uiLocation: "Project Details > Tasks / Reports / Invoice",
    directAnswer:
      "Dentro do Project, Tasks, Reports e Invoice sao focados naquele projeto. Tasks cria/edita tarefas para workers; Reports cria posts do feed com service, texto e fotos; Invoice lista e cria invoices daquele projeto, com send, cancel, delete, receive payment, payment link, timeline, download e export.",
    prerequisites: ["Tasks normalmente usa workers como assignees.", "Reports precisa selecionar um service para criar post.", "Invoices dependem do saldo/projeto e das regras de pagamento."],
    commonMistakes: [
      "Confundir Project Tasks com Dispatch Tasks global.",
      "Tentar criar report sem service no projeto.",
      "Confundir Project Invoice com Invoice All.",
      "Tentar editar invoice paid ou cancelar invoice que ja esta paid/void.",
    ],
    bugSignals: [
      "Task criada nao aparece no projeto.",
      "Report com service e foto valida nao publica.",
      "Invoice permitida pelo saldo nao cria ou nao envia.",
    ],
    supportEscalationNote:
      "Se o usuario esta na tab correta e os dados sao validos, mas task/report/invoice nao funciona, tratar como possivel falha tecnica.",
  },
  {
    id: "project-estimates-tab",
    module: "projects",
    intent: "project estimates multiple estimates approval signature cancel restore manual approval remove signature invoice",
    terms: ["estimate dentro do project", "project estimate", "estimates do projeto", "varios estimates", "manual approval", "remove signature", "restore estimate", "cancel estimate project", "assinatura sumiu", "pending signature", "pendente de assinatura", "editar estimate aprovado", "convert project estimate to invoice", "pdf needs update"],
    route: "/seller/project/details/:id?tab=Estimate",
    uiLocation: "Project Details > Estimate",
    directAnswer:
      "Na tab Estimate do projeto, voce pode ter varios estimates. Estimates aprovados somam no valor e services do projeto. Criar ou editar estimate ali usa o mesmo builder de Estimates. Se um estimate aprovado for alterado em partes importantes, como services, intro letter ou terms, o status continua Approved, mas ele pode ficar com pendencia de assinatura e a assinatura do cliente pode ser removida.",
    prerequisites: ["Aprovacao do estimate e o que leva os services para o projeto.", "Estimate aprovado editado em partes importantes nao volta para status Pending; ele continua Approved, mas pode exigir nova assinatura.", "Convert to invoice pode ficar bloqueado quando o projeto ja esta fully paid."],
    commonMistakes: [
      "Achar que View Estimate e o editor completo.",
      "Editar estimate aprovado e achar que o status volta para Pending; o que pode voltar e a pendencia de assinatura.",
      "Confundir Manual Approval com assinatura real do cliente.",
      "Achar que Cancel e Delete tem o mesmo efeito.",
    ],
    bugSignals: [
      "Estimate aprovado nao soma no projeto.",
      "Manual approval nao remove pendencia.",
      "Remove signature nao volta a exigir assinatura.",
      "PDF nao atualiza depois de salvar/gerar novamente.",
    ],
    supportEscalationNote:
      "Se o fluxo de estimate dentro do projeto esta correto e status, assinatura, servicos ou PDF nao atualizam, tratar como possivel falha tecnica.",
  },
  {
    id: "project-change-orders-tab",
    module: "projects",
    intent: "project change orders approved estimate changes services pdf update manual approval signature",
    terms: ["change order", "change orders", "ordem de mudanca", "alteracao estimate aprovado", "adicionar servico estimate aprovado", "change order approved", "change order pdf", "manual approval change order", "remove signature change order", "estimate pdf antigo"],
    route: "/seller/project/details/:id?tab=ChangeOrders",
    uiLocation: "Project Details > ChangeOrders",
    directAnswer:
      "Change Order e o caminho recomendado para adicionar mudancas em estimates ja aprovados. Na tab ChangeOrders, selecione o estimate, adicione existing/custom services, revise o preview e salve ou crie/envie. Quando aprovado, os services entram no estimate/projeto e o PDF do estimate pode ficar pendente de atualizacao.",
    prerequisites: ["A Change Order precisa estar ligada a um estimate do projeto.", "Para edit, normalmente a change order precisa estar pending."],
    commonMistakes: [
      "Editar diretamente um estimate aprovado quando o correto seria criar Change Order.",
      "Esperar que PDF do estimate atualize instantaneamente depois da aprovacao da Change Order.",
      "Achar que delete esta disponivel para qualquer status.",
    ],
    bugSignals: [
      "Change Order aprovada nao adiciona services no estimate/projeto.",
      "PDF do estimate continua antigo apos entrar na tab Estimate e aguardar atualizacao.",
      "Manual approval ou remove signature nao muda a pendencia corretamente.",
    ],
    supportEscalationNote:
      "Se a Change Order foi aprovada e os services ou PDF nao atualizam como esperado, tratar como possivel falha tecnica.",
  },
  {
    id: "project-services-service-details",
    module: "projects",
    intent: "project services service details general gallery history costs status responsible dates",
    terms: ["project services", "services do projeto", "service details", "detalhes do servico", "status service", "responsible service", "start deadline service", "gallery service", "before after", "history service", "service costs", "activities service"],
    route: "/seller/project/details/:id?tab=Services",
    uiLocation: "Project Details > Services / Service Details",
    directAnswer:
      "Na tab Services, o sistema mostra os services do projeto com search, filtro de status, status inline, start/deadline, responsible e acesso aos detalhes. Em Service Details, as tabs General, Gallery, History e Costs permitem ajustar dados do service, imagens before/after, historico de horas e custos ligados ao service.",
    prerequisites: ["Services precisam existir no projeto por criacao direta, estimate aprovado ou change order aprovada.", "Search de services pode exigir pelo menos alguns caracteres para filtrar."],
    commonMistakes: [
      "Procurar custo real de material na tab Services em vez da tab Cost.",
      "Achar que New change order cria service diretamente; ele leva para ChangeOrders.",
      "Esperar que service sem schedule apareca como job agendado.",
    ],
    bugSignals: [
      "Status, responsible ou datas do service nao salvam.",
      "Service abre, mas detalhes ficam vazios.",
      "Gallery, history ou costs nao carregam dados existentes.",
    ],
    supportEscalationNote:
      "Se o service existe e as alteracoes nao salvam ou detalhes nao carregam, tratar como possivel falha tecnica.",
  },
  {
    id: "project-costs-files",
    module: "projects",
    intent: "project cost materials employee cost subcontractor cost files folders uploads exports",
    terms: ["cost of materials", "onde lanco custo de material no projeto", "custo de material no projeto", "custo de materiais no projeto", "lancar custo de material no projeto", "lancar custo material projeto", "cost materials project", "employee cost project", "costhours", "subcontractor cost project", "files project", "folder project", "upload file project", "rich text file", "material credit", "payment date subcontractor", "overtime employee"],
    route: "/seller/project/details/:id",
    uiLocation: "Project Details > Cost / CostHours / SubcontractorCost / Files",
    directAnswer:
      "Nos custos do projeto, Cost registra materiais como Cost ou Credit, CostHours mostra custos de employees e SubcontractorCost registra custos de subcontractors. Em Files, voce pode criar folders, subir arquivos, criar rich text file, visualizar, baixar, editar e deletar arquivos dentro do projeto.",
    prerequisites: ["Custos precisam estar dentro de um projeto.", "Material cost precisa de material, tipo, preco, quantidade e service relacionado.", "Subcontractor cost precisa de subcontractor, categoria/datas/valor conforme o fluxo."],
    commonMistakes: [
      "Criar material no catalogo achando que isso registra custo real.",
      "Nao selecionar service relacionado ao material cost.",
      "Confundir employee cost com subcontractor cost.",
      "Procurar arquivos do projeto fora da tab Files.",
    ],
    bugSignals: [
      "Custo valido nao salva, edita, deleta ou exporta.",
      "Arquivo valido nao sobe ou nao abre preview/download.",
      "Total de custo nao reflete item criado apos recarregar.",
    ],
    supportEscalationNote:
      "Se os dados estao validos e custos ou arquivos nao funcionam, tratar como possivel falha tecnica.",
  },
  {
    id: "projects-common-issues",
    module: "projects",
    intent: "common project issues permissions filters converted estimate financial stale pdf schedule confusion",
    terms: ["nao vejo projects", "projeto nao aparece", "project nao aparece", "estimate sumiu", "financial view errado", "schedule confuso", "estimate pendente assinatura", "estimate pending signature", "assinatura removida", "change order pdf antigo", "project bug", "problema project", "erro projeto"],
    route: "/seller/projects",
    uiLocation: "Projects / Project Details",
    directAnswer:
      "Se Projects nao aparece, confira a permissao Projects. Se um projeto nao aparece, revise filtros, status, periodo, search e acesso do usuario. Se um estimate sumiu apos conversao, procure em Projects. Se Change Order aprovou e o PDF do estimate parece antigo, entre na tab Estimate e aguarde ou gere a atualizacao.",
    prerequisites: ["Permissao Projects para acessar projetos.", "Filtros ativos podem esconder projetos.", "Algumas tabs e actions dependem de status, assinatura, saldo ou permissao."],
    commonMistakes: [
      "Confundir project schedule, global schedule e dispatch.",
      "Achar que edit em estimate aprovado muda o status para Pending; o status continua Approved, mas pode exigir nova assinatura.",
      "Comparar Financial View sem conferir costs e invoices.",
      "Usar Change Order e esperar PDF do estimate atualizar imediatamente.",
    ],
    bugSignals: [
      "Usuario esta no caminho correto e com dados validos, mas action nao salva.",
      "Services, costs, invoices ou PDF nao atualizam apos recarregar/aguardar.",
      "Permissao correta e filtros limpos, mas projeto ou tab nao aparece.",
    ],
    supportEscalationNote:
      "Se o fluxo descrito esta correto e mesmo assim falha, orientar como possivel falha tecnica, sem criar ticket automatico.",
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
      if (playbook.module === "projects" && /\b(project|projects|projeto|projetos)\b/.test(normalizedQuery)) score += 4;
      if (
        playbook.id === "project-costs-files" &&
        /\b(cost|costs|custo|custos|material|materiais|files|arquivos)\b/.test(normalizedQuery) &&
        /\b(project|projects|projeto|projetos)\b/.test(normalizedQuery)
      ) {
        score += 8;
      }
      if (
        playbook.id === "projects-export-delete-actions" &&
        /\b(export|exportar|arquivo|formato|pdf|excel)\b/.test(normalizedQuery) &&
        /\b(project|projects|projeto|projetos)\b/.test(normalizedQuery)
      ) {
        score += 8;
      }
      if (
        playbook.id === "estimates-main-export" &&
        /\b(export|exportar|arquivo|formato|pdf|excel)\b/.test(normalizedQuery) &&
        /\b(estimate|estimates|orcamento|orcamentos)\b/.test(normalizedQuery)
      ) {
        score += 8;
      }
      if (
        (playbook.id === "estimates-editor-existing-estimate" || playbook.id === "project-estimates-tab") &&
        /\b(estimate|estimates|orcamento|orcamentos)\b/.test(normalizedQuery) &&
        /\b(assinatura|signature|assinado|approved|aprovado|editar|edit|pending|pendente)\b/.test(normalizedQuery)
      ) {
        score += 12;
      }
      if (
        playbook.id === "project-schedule-tab" &&
        /\b(schedule|agenda|agendamento|agendar|subservice|sub service)\b/.test(normalizedQuery) &&
        /\b(project|projects|projeto|projetos|details|detalhes)\b/.test(normalizedQuery)
      ) {
        score += 12;
      }
      return { playbook, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.playbook);
}
