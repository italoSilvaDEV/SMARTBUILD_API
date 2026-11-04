import { Prisma } from "@prisma/client";
import { HelpAssistantContext } from "./types";

/**
 * Recorte de projetos do operador. Quem tem acesso total (visibleProjectIds = null) vê tudo;
 * os demais só enxergam os projetos em que são vendedor ou gerente.
 */

/** O usuário pode ver este projeto? */
export function canSeeProject(ctx: HelpAssistantContext, projectId: unknown): boolean {
  if (ctx.visibleProjectIds === null) return true;
  return typeof projectId === "string" && ctx.visibleProjectIds.includes(projectId);
}

/** Filtro para consultas na tabela de projetos. */
export function projectIdFilter(ctx: HelpAssistantContext): Prisma.ProjectWhereInput {
  return ctx.visibleProjectIds === null ? {} : { id: { in: ctx.visibleProjectIds } };
}

/** Filtro por coluna de id de projeto (ex.: projectId de ordens de serviço). */
export function projectIdIn(ctx: HelpAssistantContext): { in: string[] } | undefined {
  return ctx.visibleProjectIds === null ? undefined : { in: ctx.visibleProjectIds };
}

export const NO_PROJECT_ACCESS = { error: "no access to this project", hint: "O usuário só vê projetos em que é vendedor ou gerente." };

/** Faturas visíveis: tudo (Owner/invoiceEditAll) ou só as criadas pelo usuário ou dos projetos que ele gerencia. */
export function invoiceScope(ctx: HelpAssistantContext): Prisma.InvoiceWhereInput {
  if (ctx.invoiceAccessAll) return {};
  return { OR: [{ user_id: ctx.userId }, { project: { project_manager_id: ctx.userId } }, { project_manager_id: ctx.userId }] };
}
