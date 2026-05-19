import OpenAI from "openai";
import { assistantWhatsappEnv } from "../config/env";
import { assistantWhatsappPlaybooks, searchPlaybooks } from "../knowledge/playbooks";
import type { AssistantWhatsappSession, KnowledgePlaybook } from "../types";
import { prisma } from "../../utils/prisma";

type KnowledgeDocument = {
  playbook: KnowledgePlaybook;
  content: string;
};

type EmbeddedKnowledgeDocument = KnowledgeDocument & {
  embedding: number[];
};

type KnowledgeSearchResult = {
  playbook: KnowledgePlaybook;
  relevance: number | null;
  source: "semantic" | "fallback";
};

const openai = assistantWhatsappEnv.openAiApiKey
  ? new OpenAI({ apiKey: assistantWhatsappEnv.openAiApiKey })
  : null;

export class AssistantWhatsappKnowledgeService {
  private static embeddedDocumentsPromise: Promise<EmbeddedKnowledgeDocument[]> | null = null;

  async search(params: {
    query: string;
    session: AssistantWhatsappSession;
    limit?: number;
  }): Promise<{
    query: string;
    contextualQuery: string;
    source: "semantic" | "fallback";
    matches: KnowledgeSearchResult[];
  }> {
    const limit = params.limit || 5;
    const contextualQuery = await this.buildContextualQuery(params.session.id, params.query);

    if (!openai) {
      return this.fallbackSearch(params.query, contextualQuery, limit);
    }

    try {
      const [documents, queryEmbedding] = await Promise.all([
        this.getEmbeddedDocuments(),
        this.embedOne(contextualQuery),
      ]);

      const matches = documents
        .map((document) => ({
          playbook: document.playbook,
          relevance: cosineSimilarity(queryEmbedding, document.embedding),
          source: "semantic" as const,
        }))
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, limit);

      return {
        query: params.query,
        contextualQuery,
        source: "semantic",
        matches,
      };
    } catch (error) {
      console.error("[AssistantWhatsappKnowledgeService.search]", {
        message: error instanceof Error ? error.message : String(error),
      });
      return this.fallbackSearch(params.query, contextualQuery, limit);
    }
  }

  private async getEmbeddedDocuments() {
    if (!AssistantWhatsappKnowledgeService.embeddedDocumentsPromise) {
      AssistantWhatsappKnowledgeService.embeddedDocumentsPromise = this.embedDocuments();
    }

    try {
      return await AssistantWhatsappKnowledgeService.embeddedDocumentsPromise;
    } catch (error) {
      AssistantWhatsappKnowledgeService.embeddedDocumentsPromise = null;
      throw error;
    }
  }

  private async embedDocuments() {
    const documents = assistantWhatsappPlaybooks.map((playbook) => ({
      playbook,
      content: buildPlaybookDocument(playbook),
    }));

    const response = await openai!.embeddings.create({
      model: assistantWhatsappEnv.openAiEmbeddingModel,
      input: documents.map((document) => document.content),
    });

    return documents.map((document, index) => ({
      ...document,
      embedding: response.data[index]?.embedding || [],
    }));
  }

  private async embedOne(input: string) {
    const response = await openai!.embeddings.create({
      model: assistantWhatsappEnv.openAiEmbeddingModel,
      input,
    });

    return response.data[0]?.embedding || [];
  }

  private async buildContextualQuery(sessionId: string, query: string) {
    const recentMessages = await this.getRecentConversation(sessionId);

    if (!recentMessages.length) return query;

    const context = recentMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")
      .slice(-1800);

    return `Recent conversation:\n${context}\n\nCurrent user question:\n${query}`;
  }

  private async getRecentConversation(sessionId: string) {
    if (!process.env.DATABASE_URL) return [];

    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ role: string; content: string; createdAt: Date }>>(
        `
          SELECT role, content, createdAt
          FROM assistant_whatsapp_messages
          WHERE sessionId = ?
          ORDER BY createdAt DESC
          LIMIT 8
        `,
        sessionId
      );

      return rows
        .reverse()
        .filter((row) => row.content && row.content.trim())
        .map((row) => ({
          role: row.role === "assistant" ? "assistant" : "user",
          content: row.content.trim().slice(0, 600),
        }));
    } catch (error) {
      console.error("[AssistantWhatsappKnowledgeService.getRecentConversation]", {
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private fallbackSearch(query: string, contextualQuery: string, limit: number) {
    const matches = searchPlaybooks(contextualQuery || query, limit).map((playbook) => ({
      playbook,
      relevance: null,
      source: "fallback" as const,
    }));

    return {
      query,
      contextualQuery,
      source: "fallback" as const,
      matches,
    };
  }
}

function buildPlaybookDocument(playbook: KnowledgePlaybook) {
  return [
    `Module: ${playbook.module}`,
    `Intent: ${playbook.intent}`,
    `Terms: ${playbook.terms.join(", ")}`,
    `Route: ${playbook.route || "not specified"}`,
    `UI location: ${playbook.uiLocation}`,
    `Direct answer: ${playbook.directAnswer}`,
    `Prerequisites: ${playbook.prerequisites.join(" | ")}`,
    `Common mistakes: ${playbook.commonMistakes.join(" | ")}`,
    `Bug signals: ${playbook.bugSignals.join(" | ")}`,
    `Support escalation: ${playbook.supportEscalationNote}`,
  ].join("\n");
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
