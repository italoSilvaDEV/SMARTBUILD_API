import { Request, Response } from "express";
import { resolveHelpAccess } from "./access";
import { HelpAssistantService } from "./HelpAssistantService";
import * as history from "./history";
import { HelpAssistantContext } from "./types";

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;
const SUPPORTED_LANGUAGES = new Set(["pt", "en", "es"]);

const service = new HelpAssistantService();

function readCompanyId(req: Request): string | null {
  const value = req.body?.companyId ?? req.query?.companyId;
  return typeof value === "string" && value ? value : null;
}

export class HelpAssistantController {
  async listThreads(req: Request, res: Response) {
    const userId = (req as any).userId as string;
    try {
      const access = await resolveHelpAccess(userId, readCompanyId(req));
      if (!access) return res.status(403).json({ error: "Access denied for this company" });
      return res.json({ threads: await history.listThreads(userId, access.companyId) });
    } catch (error) {
      console.error("[HelpAssistant] list threads failed:", error);
      return res.status(500).json({ error: "Failed to list conversations" });
    }
  }

  async getThread(req: Request, res: Response) {
    const userId = (req as any).userId as string;
    try {
      const access = await resolveHelpAccess(userId, readCompanyId(req));
      if (!access) return res.status(403).json({ error: "Access denied for this company" });
      const thread = await history.findThread(req.params.threadId, userId, access.companyId);
      if (!thread) return res.status(404).json({ error: "Conversation not found" });
      return res.json({ thread, messages: await history.getThreadMessages(thread.id) });
    } catch (error) {
      console.error("[HelpAssistant] get thread failed:", error);
      return res.status(500).json({ error: "Failed to load conversation" });
    }
  }

  async deleteThread(req: Request, res: Response) {
    const userId = (req as any).userId as string;
    try {
      const access = await resolveHelpAccess(userId, readCompanyId(req));
      if (!access) return res.status(403).json({ error: "Access denied for this company" });
      const deleted = await history.deleteThread(req.params.threadId, userId, access.companyId);
      return deleted ? res.status(204).send() : res.status(404).json({ error: "Conversation not found" });
    } catch (error) {
      console.error("[HelpAssistant] delete thread failed:", error);
      return res.status(500).json({ error: "Failed to delete conversation" });
    }
  }

  async chat(req: Request, res: Response) {
    const userId = (req as any).userId as string;
    const question = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, MAX_MESSAGE_CHARS) : "";
    if (!question) {
      return res.status(400).json({ error: "message is required" });
    }

    if (!service.isConfigured()) {
      return res.status(503).json({ error: "Help assistant is not available" });
    }

    try {
      const access = await resolveHelpAccess(userId, readCompanyId(req));
      if (!access) return res.status(403).json({ error: "Access denied for this company" });

      const requestedThreadId = typeof req.body?.threadId === "string" ? req.body.threadId : null;
      const existing = requestedThreadId ? await history.findThread(requestedThreadId, userId, access.companyId) : null;
      if (requestedThreadId && !existing) return res.status(404).json({ error: "Conversation not found" });

      const previous = existing ? await history.getRecentHistory(existing.id, MAX_HISTORY_MESSAGES - 1) : [];

      const language = typeof req.body?.language === "string" ? req.body.language.split("-")[0] : "pt";
      const route = typeof req.body?.route === "string" ? req.body.route.slice(0, 200) : null;

      const ctx: HelpAssistantContext = {
        userId,
        ...access,
        route,
        language: SUPPORTED_LANGUAGES.has(language) ? language : "pt",
      };

      const reply = await service.reply([...previous, { role: "user", content: question }], ctx);
      if (!reply.content && !reply.report) {
        return res.status(502).json({ error: "Empty assistant response" });
      }

      const thread = existing ?? (await history.createThread(userId, access.companyId, question));
      const message = await history.saveExchange(thread.id, question, { content: reply.content, report: reply.report });

      return res.json({
        thread,
        message,
        sources: reply.sources,
        toolsUsed: reply.toolsUsed,
      });
    } catch (error) {
      console.error("[HelpAssistant] chat failed:", error);
      return res.status(500).json({ error: "Failed to generate help response" });
    }
  }
}
