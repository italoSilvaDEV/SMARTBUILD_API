import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { HelpChatMessage, HelpReport, HelpThreadContext } from "./types";

/**
 * Histórico de conversas do assistente. Toda leitura e escrita é filtrada
 * por userId + companyId: cada usuário só vê as próprias conversas da
 * empresa ativa.
 */

const TITLE_MAX = 80;

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  report: HelpReport | null;
  createdAt: Date;
}

/**
 * O JSON `report` guarda o relatório e, junto, o contexto da conversa (projeto em foco).
 * Resposta sem relatório mas com contexto é gravada como `{ title: "", context }`.
 */
function unpackReport(raw: Prisma.JsonValue): { report: HelpReport | null; context: HelpThreadContext | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { report: null, context: null };
  const { context, ...rest } = raw as Record<string, unknown>;
  const report = typeof rest.title === "string" && rest.title.trim() ? (rest as unknown as HelpReport) : null;
  return { report, context: (context as HelpThreadContext | undefined) ?? null };
}

function toStored(row: { id: string; role: string; content: string; report: Prisma.JsonValue; createdAt: Date }): StoredMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    report: unpackReport(row.report).report,
    createdAt: row.createdAt,
  };
}

/** Contexto (projeto/subcontractor em foco) mais recente da conversa. */
export async function getThreadContext(threadId: string): Promise<HelpThreadContext | null> {
  const rows = await prisma.helpAssistantMessage.findMany({
    where: { threadId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { report: true },
  });
  const merged: HelpThreadContext = {};
  for (const row of rows) {
    const { context } = unpackReport(row.report);
    if (!context) continue;
    if (!merged.projectId && context.projectId) {
      merged.projectId = context.projectId;
      merged.projectLabel = context.projectLabel;
    }
    if (!merged.subcontractorId && context.subcontractorId) {
      merged.subcontractorId = context.subcontractorId;
      merged.subcontractorLabel = context.subcontractorLabel;
    }
  }
  return Object.keys(merged).length ? merged : null;
}

export async function listThreads(userId: string, companyId: string) {
  return prisma.helpAssistantThread.findMany({
    where: { userId, companyId },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
}

export async function findThread(threadId: string, userId: string, companyId: string) {
  return prisma.helpAssistantThread.findFirst({
    where: { id: threadId, userId, companyId },
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
}

export async function getThreadMessages(threadId: string): Promise<StoredMessage[]> {
  const rows = await prisma.helpAssistantMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, report: true, createdAt: true },
  });
  return rows.map(toStored);
}

/** Últimas mensagens da conversa, no formato enviado ao modelo. */
export async function getRecentHistory(threadId: string, limit: number): Promise<HelpChatMessage[]> {
  const rows = await prisma.helpAssistantMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .filter((row) => row.content.trim())
    .map((row) => ({ role: row.role === "assistant" ? "assistant" : "user", content: row.content }));
}

export async function createThread(userId: string, companyId: string, firstQuestion: string) {
  const title = firstQuestion.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  return prisma.helpAssistantThread.create({
    data: { userId, companyId, title: title || null },
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
}

export async function saveExchange(threadId: string, question: string, reply: { content: string; report: HelpReport | null; context?: HelpThreadContext | null }) {
  const packed = reply.report
    ? { ...reply.report, ...(reply.context ? { context: reply.context } : {}) }
    : reply.context
      ? { title: "", context: reply.context }
      : null;
  const now = new Date();
  const [, assistant] = await prisma.$transaction([
    prisma.helpAssistantMessage.create({ data: { threadId, role: "user", content: question, createdAt: now } }),
    prisma.helpAssistantMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: reply.content,
        report: packed ? (packed as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        createdAt: new Date(now.getTime() + 1),
      },
      select: { id: true, role: true, content: true, report: true, createdAt: true },
    }),
    prisma.helpAssistantThread.update({ where: { id: threadId }, data: { lastMessageAt: now } }),
  ]);
  return toStored(assistant);
}

export async function deleteThread(threadId: string, userId: string, companyId: string) {
  const result = await prisma.helpAssistantThread.deleteMany({ where: { id: threadId, userId, companyId } });
  return result.count > 0;
}
