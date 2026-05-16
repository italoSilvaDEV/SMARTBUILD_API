import type { KnowledgePlaybook } from "../types";
import { normalizeText } from "../utils/text";

export const assistantWhatsappPlaybooks: KnowledgePlaybook[] = [
  {
    id: "clients-list",
    module: "clients",
    intent: "find clients list",
    terms: ["clients", "client list", "lista de clientes", "onde ficam os clientes", "ver clientes", "customer"],
    route: "/seller/clients",
    uiLocation: "Sidebar > Workflow > Clients",
    directAnswer:
      "Para ver os clients, va em Workflow > Clients. Ali voce consegue pesquisar, abrir detalhes do client e acessar os locations/work contexts vinculados a ele.",
    prerequisites: ["O usuario precisa ter a permissao Clients."],
    commonMistakes: [
      "Procurar clients dentro de Financials; o item principal fica em Workflow.",
      "Confundir client com location/work context. Um client pode ter mais de um location.",
    ],
    bugSignals: ["A tela de Clients abre vazia mesmo com clients cadastrados.", "A busca nao retorna um client que aparece sem filtro."],
    supportEscalationNote:
      "Tratar como possivel falha quando o usuario esta em Workflow > Clients, tem permissao e mesmo assim a lista ou busca nao funciona.",
  },
  {
    id: "clients-create",
    module: "clients",
    intent: "create client",
    terms: ["create client", "new client", "add client", "criar cliente", "novo cliente", "adicionar cliente", "criar customer"],
    route: "/seller/clients",
    uiLocation: "Sidebar > Workflow > Clients > New Client",
    directAnswer:
      "Para criar um client, va em Workflow > Clients e clique em New Client. Preencha os dados principais do client e pelo menos um location/work context quando o fluxo pedir endereco/local.",
    prerequisites: ["O usuario precisa ter permissao Clients.", "Email e location podem ser necessarios em fluxos que depois enviam documentos."],
    commonMistakes: [
      "Cadastrar so o nome do client e esquecer o location quando o proximo fluxo depende de endereco.",
      "Tentar criar o client dentro do Estimate quando queria gerenciar o cadastro completo.",
    ],
    bugSignals: ["O botao New Client nao abre.", "O client salva mas nao aparece na lista depois de atualizar.", "Erro ao salvar com campos validos."],
    supportEscalationNote:
      "Tratar como possivel falha quando os campos obrigatorios estao preenchidos e o sistema nao salva ou nao exibe o client criado.",
  },
  {
    id: "clients-edit",
    module: "clients",
    intent: "edit client",
    terms: ["edit client", "editar cliente", "alterar cliente", "mudar email cliente", "editar location", "work context"],
    route: "/seller/clients",
    uiLocation: "Sidebar > Workflow > Clients > open client details",
    directAnswer:
      "Para editar um client, abra Workflow > Clients, clique no client desejado e edite os dados no detalhe. Se a duvida for endereco, procure a area de location/work context dentro do client.",
    prerequisites: ["O usuario precisa ter permissao Clients."],
    commonMistakes: [
      "Editar o client certo, mas o location errado quando o client tem mais de um endereco.",
      "Esperar que a mudanca altere documentos antigos ja enviados; normalmente ela vale para novos fluxos.",
    ],
    bugSignals: ["Alteracao salva visualmente mas volta ao valor antigo ao recarregar.", "Location editado nao aparece no fluxo de Estimate."],
    supportEscalationNote:
      "Tratar como possivel falha quando a edicao confirma sucesso mas nao persiste depois de recarregar ou nao reflete nos fluxos novos.",
  },
  {
    id: "estimate-list",
    module: "estimates",
    intent: "find estimates",
    terms: ["estimates", "estimate list", "lista de estimates", "orcamentos", "financials estimates"],
    route: "/seller/estimates",
    uiLocation: "Sidebar > Financials > Estimates",
    directAnswer:
      "Para ver os estimates, va em Financials > Estimates. A listagem mostra os estimates existentes e permite pesquisar, filtrar, abrir actions e criar um novo estimate.",
    prerequisites: ["O usuario precisa ter permissao Estimates."],
    commonMistakes: ["Procurar Estimate dentro de Workflow; ele fica em Financials."],
    bugSignals: ["A tabela nao carrega.", "Filtros quebram a listagem.", "Actions nao abrem."],
    supportEscalationNote:
      "Tratar como possivel falha quando o usuario esta em Financials > Estimates com permissao e a listagem/actions nao respondem.",
  },
  {
    id: "estimate-create-manual",
    module: "estimates",
    intent: "create manual estimate",
    terms: ["new estimate", "manual estimate", "manual builder", "criar estimate", "novo estimate", "criar orcamento"],
    route: "/seller/new-estimate/type-estimate",
    uiLocation: "Financials > Estimates > New Estimate > Manual Builder",
    directAnswer:
      "Para criar um estimate manual, va em Financials > Estimates, clique em New Estimate e escolha Manual Builder. Depois selecione client/location, adicione servicos, revise o summary e salve ou envie.",
    prerequisites: ["Permissao Estimates.", "Um client/location precisa ser selecionado antes de montar os servicos."],
    commonMistakes: [
      "Entrar no Smart Builder quando queria montar manualmente.",
      "Nao selecionar location depois do client, deixando o proximo passo bloqueado.",
    ],
    bugSignals: ["New Estimate nao abre.", "Manual Builder nao avanca.", "O fluxo trava mesmo com client/location selecionados."],
    supportEscalationNote:
      "Tratar como possivel falha quando o usuario selecionou client/location corretamente e mesmo assim o fluxo nao avanca ou fica carregando.",
  },
  {
    id: "estimate-select-client-location",
    module: "estimates",
    intent: "select client and location for estimate",
    terms: ["select client estimate", "selecionar cliente estimate", "location estimate", "work context estimate", "nao avanca client", "nao avanca cliente"],
    route: "/seller/new-estimate/client-data",
    uiLocation: "New Estimate > Client data",
    directAnswer:
      "No estimate, primeiro selecione o client e depois selecione o location/work context desse client. O fluxo so deve avancar quando os dois estiverem definidos.",
    prerequisites: ["O client precisa existir.", "O client precisa ter um location/work context valido."],
    commonMistakes: [
      "Selecionar apenas o client e esquecer o location.",
      "Criar client novo sem location e tentar avancar no estimate.",
    ],
    bugSignals: ["Client e location aparecem selecionados, mas o botao de avancar continua bloqueado.", "Location criado nao aparece no seletor."],
    supportEscalationNote:
      "Tratar como possivel falha quando client e location estao selecionados corretamente e o botao continua bloqueado.",
  },
  {
    id: "estimate-add-catalog-service",
    module: "estimates",
    intent: "add catalog service to estimate",
    terms: ["add service", "adicionar servico", "servico catalogo", "catalog service", "selecionar servico", "service estimate"],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "New Estimate > Services",
    directAnswer:
      "Para adicionar um servico do catalogo no estimate, entre no step Services, escolha a categoria/servico, ajuste quantidade/preco se o modal permitir e confirme para adicionar ao estimate.",
    prerequisites: ["Client/location ja selecionados.", "O catalogo precisa ter servicos cadastrados para aparecerem na busca."],
    commonMistakes: [
      "Procurar servico antes de escolher categoria ou sem usar a busca.",
      "Confundir servico do catalogo com Custom Service.",
    ],
    bugSignals: ["Servico selecionado nao entra no estimate.", "Preco/quantidade nao atualiza.", "Busca nao encontra servico existente."],
    supportEscalationNote:
      "Tratar como possivel falha quando o servico existe no catalogo, o usuario confirma a selecao e ele nao e adicionado ao estimate.",
  },
  {
    id: "estimate-add-custom-service",
    module: "estimates",
    intent: "add custom service to estimate",
    terms: [
      "custom service",
      "add custom service",
      "servico personalizado",
      "adicionar servico manual",
      "add service manually",
      "servico manual",
    ],
    route: "/seller/new-estimate/services/:id",
    uiLocation: "New Estimate > Services > Custom service",
    directAnswer:
      "Para adicionar um custom service, entre no estimate builder no step Services e clique em Custom service. Preencha nome, descricao, quantidade e preco, depois confirme para inserir esse item no estimate.",
    prerequisites: ["Voce precisa ja ter selecionado client/location e estar dentro do builder do estimate."],
    commonMistakes: [
      "Procurar Custom service na listagem de estimates; ele fica dentro do builder, no step Services.",
      "Tentar usar servico do catalogo quando precisa criar um item unico/manual.",
      "Deixar preco ou nome vazio quando o modal exige esses campos.",
    ],
    bugSignals: ["Botao Custom service nao abre modal.", "Modal nao salva com nome, quantidade e preco preenchidos.", "O item some ao ir para o summary."],
    supportEscalationNote:
      "Tratar como possivel falha quando o usuario esta no step Services, preencheu os campos necessarios e o custom service nao salva ou desaparece.",
  },
  {
    id: "estimate-save-send",
    module: "estimates",
    intent: "save or send estimate",
    terms: ["save estimate", "send estimate", "enviar estimate", "salvar estimate", "mandar orcamento", "enviar orcamento"],
    route: "/seller/new-estimate/services-summary/:id",
    uiLocation: "New Estimate > Summary",
    directAnswer:
      "Para salvar ou enviar, va ate o Summary do estimate. Use Save para deixar salvo sem enviar, ou Send/Send Estimate para abrir o modal de email e enviar ao client.",
    prerequisites: ["O estimate precisa ter client/location e pelo menos os itens necessarios para gerar o summary.", "Para envio, o client precisa ter email valido."],
    commonMistakes: [
      "Achar que Save envia email; Save apenas salva.",
      "Tentar enviar sem email do client ou sem revisar os destinatarios no modal.",
    ],
    bugSignals: ["Save fica carregando sem concluir.", "Modal de envio nao abre.", "Email retorna erro mesmo com destinatario valido."],
    supportEscalationNote:
      "Tratar como possivel falha quando o estimate esta completo e o save/send falha sem uma validacao clara para corrigir.",
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

