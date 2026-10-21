export type HelpChatRole = "user" | "assistant";

export interface HelpChatMessage {
  role: HelpChatRole;
  content: string;
}

export interface HelpAssistantContext {
  userId: string;
  userName: string;
  officeName: string | null;
  /** Empresa ativa, já validada contra os vínculos do usuário. */
  companyId: string | null;
  companyName: string | null;
  /** Permissões efetivas (plano ∩ cargo), calculadas no servidor como no login. */
  permissions: string[];
  /** Owner/Administrator ou usuário com acesso a todos os projetos. */
  fullProjectAccess: boolean;
  /** Rota atual do front (ex.: /seller/projects). Apenas informativa. */
  route: string | null;
  language: string;
}

/** Relatório estruturado que o front renderiza (métricas, gráfico e tabela). */
export interface HelpReport {
  title: string;
  description?: string;
  chartMode?: "bar" | "line" | "pie";
  chartData?: Record<string, string | number>[];
  metrics?: { label: string; value: string; tone?: "default" | "warning" | "success" }[];
  table?: {
    columns: { key: string; label: string }[];
    rows: Record<string, string | number | boolean | null>[];
  } | null;
}

/**
 * Ferramenta de uma skill. Por enquanto o assistente é somente leitura:
 * `readOnly` é o literal `true`, então uma tool que escreve não compila.
 * Skills de escrita vão exigir um fluxo de confirmação antes de mudar isso.
 */
export interface HelpTool {
  name: string;
  description: string;
  readOnly: true;
  /** JSON Schema dos argumentos. */
  parameters: Record<string, unknown>;
  /** Todas estas permissões são exigidas; sem elas a tool nem é oferecida ao modelo. */
  requiredPermissions?: string[];
  /** Exige acesso a todos os projetos da empresa. */
  requiresFullProjectAccess?: boolean;
  /** Quando true, o retorno `{ report }` vira o relatório da resposta. */
  producesReport?: boolean;
  run: (args: Record<string, unknown>, ctx: HelpAssistantContext) => Promise<unknown>;
}

export interface HelpSource {
  title: string;
  section: string;
}

/** Contexto dinâmico que uma skill injeta a cada pergunta (ex.: trechos do RAG). */
export interface HelpSkillContext {
  text: string;
  sources: HelpSource[];
}

/**
 * Uma skill é um pacote de conhecimento (instruções), contexto dinâmico
 * opcional e ferramentas de leitura. Novas capacidades entram registrando
 * uma skill em `skills/index.ts`, sem alterar o serviço.
 */
export interface HelpSkill {
  id: string;
  description: string;
  /** Trecho de prompt anexado ao system prompt quando a skill está ativa. */
  instructions: string;
  isAvailable?: (ctx: HelpAssistantContext) => boolean;
  buildContext?: (query: string, ctx: HelpAssistantContext) => Promise<HelpSkillContext | null>;
  tools?: HelpTool[];
}

export interface HelpAssistantReply {
  content: string;
  /** Tools (somente leitura) executadas para montar a resposta. */
  toolsUsed: string[];
  sources: HelpSource[];
  report: HelpReport | null;
}
