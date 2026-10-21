import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { HelpChatMessage, HelpReport } from "./types";

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

function toStored(row: { id: string; role: string; content: string; report: Prisma.JsonValue; createdAt: Date }): StoredMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    report: (row.report as unknown as HelpReport | null) ?? null,
    createdAt: row.createdAt,
  };
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

export async function saveExchange(threadId: string, question: string, reply: { content: string; report: HelpReport | null }) {
  const now = new Date();
  const [, assistant] = await prisma.$transaction([
    prisma.helpAssistantMessage.create({ data: { threadId, role: "user", content: question, createdAt: now } }),
    prisma.helpAssistantMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: reply.content,
        report: reply.report ? (reply.report as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
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
