import { HelpAssistantContext, HelpSkill, HelpTool } from "../types";
import { companyDataSkill } from "./companyData";
import { knowledgeSearchSkill } from "./knowledgeSearch";
import { platformGuideSkill } from "./platformGuide";
import { receivablesSkill } from "./receivables";
import { reportingSkill } from "./reporting";

/**
 * Registro de skills do assistente.
 * Para adicionar uma capacidade: crie o arquivo da skill e inclua aqui.
 */
const SKILLS: HelpSkill[] = [platformGuideSkill, knowledgeSearchSkill, companyDataSkill, receivablesSkill, reportingSkill];

export function getActiveSkills(ctx: HelpAssistantContext): HelpSkill[] {
  return SKILLS.filter((skill) => (skill.isAvailable ? skill.isAvailable(ctx) : true));
}

/** Uma tool só é oferecida ao modelo se o usuário tem todas as permissões exigidas. */
export function isToolAllowed(tool: HelpTool, ctx: HelpAssistantContext): boolean {
  if (tool.requiresFullProjectAccess && !ctx.fullProjectAccess) return false;
  return (tool.requiredPermissions ?? []).every((permission) => ctx.permissions.includes(permission));
}
