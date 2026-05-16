import type { KnowledgePlaybook } from "../types";
import { assistantWhatsappEnv } from "../config/env";
import { normalizeText } from "../utils/text";

const appUrl = (assistantWhatsappEnv.publicAppUrl || "the SmartBuild app").replace(/\/$/, "");
const loginUrl = assistantWhatsappEnv.publicAppUrl ? `${appUrl}/login` : "the SmartBuild login page";

export const assistantWhatsappPlaybooks: KnowledgePlaybook[] = [
  {
    id: "account-login",
    module: "account",
    intent: "login to SmartBuild",
    terms: ["login", "log in", "entrar", "acessar", "sign in", "senha", "email e senha", "credenciais invalidas", "invalid credentials"],
    route: "/login",
    uiLocation: loginUrl,
    directAnswer:
      `Para entrar no SmartBuild, acesse ${loginUrl} e informe o email da company cadastrada e a senha cadastrada. Se nao entrar, normalmente e credencial invalida ou o sistema esta fora do ar.`,
    prerequisites: ["A company precisa existir no SmartBuild.", "O usuario precisa informar exatamente o email cadastrado da company e a senha correta."],
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
      "Me manda o email da company usado no cadastro que eu verifico o proximo passo. Se o email estiver registrado, o caminho mais provavel e recuperar a senha pelo Forgot password na tela de login.",
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
    prerequisites: ["O email precisa ser o email da company cadastrada no SmartBuild."],
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
    intent: "sign up create SmartBuild account",
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
