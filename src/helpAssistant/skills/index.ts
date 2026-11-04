import { HelpAssistantContext, HelpSkill, HelpTool } from "../types";
import { companyDataSkill } from "./companyData";
import { knowledgeSearchSkill } from "./knowledgeSearch";
import { platformGuideSkill } from "./platformGuide";
import { projectsAndEstimatesSkill } from "./projectsAndEstimates";
import { receivablesSkill } from "./receivables";
import { accountsPayableSkill, bidRequestsSkill, breakPoliciesSkill, workOrdersSkill } from "./moduleSkills";
import { contractsSkill, jobScheduleSkill, servicesCatalogSkill, usersSkill } from "./moreModuleSkills";
import { activitiesSkill, catalogAndSettingsSkill, jobDispatchSkill, timeCardRequestsSkill } from "./operationsSkills";
import { materialsSkill } from "./materialsSkill";
import { reportingSkill } from "./reporting";
import { crossProjectSkill, fullReportSkill, laborAndSubsSkill } from "./reportSkills";

/**
 * Registro de skills do assistente.
 * Para adicionar uma capacidade: crie o arquivo da skill e inclua aqui.
 */
const SKILLS: HelpSkill[] = [platformGuideSkill, knowledgeSearchSkill, companyDataSkill, projectsAndEstimatesSkill, receivablesSkill, fullReportSkill, crossProjectSkill, laborAndSubsSkill, breakPoliciesSkill, workOrdersSkill, bidRequestsSkill, accountsPayableSkill, contractsSkill, servicesCatalogSkill, usersSkill, jobScheduleSkill, activitiesSkill, timeCardRequestsSkill, catalogAndSettingsSkill, jobDispatchSkill, materialsSkill, reportingSkill];

export function getActiveSkills(ctx: HelpAssistantContext): HelpSkill[] {
  return SKILLS.filter((skill) => (skill.isAvailable ? skill.isAvailable(ctx) : true));
}

/** Uma tool só é oferecida ao modelo se o usuário tem todas as permissões exigidas. */
export function isToolAllowed(tool: HelpTool, ctx: HelpAssistantContext): boolean {
  if (tool.requiresFullProjectAccess && !ctx.fullProjectAccess && !tool.projectScoped) return false;
  if (tool.requiresFullInvoiceAccess && !ctx.invoiceAccessAll) return false;
  return (tool.requiredPermissions ?? []).every((permission) => ctx.permissions.includes(permission));
}
