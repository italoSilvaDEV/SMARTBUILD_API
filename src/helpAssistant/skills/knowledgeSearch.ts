import { knowledgeBase } from "../openaiClient";
import { KnowledgeHit } from "../knowledge/KnowledgeBase";
import { HelpSkill, HelpSource } from "../types";

function formatHits(hits: KnowledgeHit[]): string {
  return hits
    .map((hit, index) => `[Doc ${index + 1}] ${hit.chunk.title} › ${hit.chunk.section}\n${hit.chunk.text}`)
    .join("\n\n---\n\n");
}

function toSources(hits: KnowledgeHit[]): HelpSource[] {
  const seen = new Set<string>();
  return hits
    .map((hit) => ({ title: hit.chunk.title, section: hit.chunk.section }))
    .filter((source) => {
      const key = `${source.title}|${source.section}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Skill de RAG: recupera trechos da documentação a cada pergunta e expõe
 * uma tool para o modelo buscar outros assuntos na mesma resposta.
 */
export const knowledgeSearchSkill: HelpSkill = {
  id: "knowledge-search",
  description: "Recupera trechos da documentação funcional de cada módulo do sistema.",
  instructions: `
A seção DOCUMENTAÇÃO RECUPERADA traz trechos da documentação oficial do sistema, selecionados para a pergunta atual.
- Baseie a resposta nesses trechos. Eles têm prioridade sobre qualquer suposição.
- Se a pergunta envolver outro assunto que não está nos trechos, use a tool search_help_docs antes de responder.
- Se mesmo assim não houver informação, diga que não encontrou isso na documentação e indique o módulo mais provável no menu.
- Não cite "Doc 1", "trecho" ou "documentação recuperada" na resposta; fale naturalmente com o usuário.
`.trim(),
  isAvailable: () => Boolean(knowledgeBase),
  async buildContext(query, ctx) {
    if (!knowledgeBase) return null;
    const hits = await knowledgeBase.search(query, { route: ctx.route, limit: 6 });
    if (!hits.length) return null;
    return { text: formatHits(hits), sources: toSources(hits) };
  },
  tools: [
    {
      name: "search_help_docs",
      description:
        "Busca na documentação funcional do SmartBuild (telas, fluxos, status, regras de negócio). Use para assuntos que não vieram na documentação recuperada.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "O que procurar, em linguagem natural." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      async run(args, ctx) {
        if (!knowledgeBase || typeof args.query !== "string") return { results: [] };
        const hits = await knowledgeBase.search(args.query, { route: ctx.route, limit: 4 });
        return { results: hits.map((hit) => `${hit.chunk.title} › ${hit.chunk.section}\n${hit.chunk.text}`) };
      },
    },
  ],
};
