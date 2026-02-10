import { Router } from 'express'
import { userRoutes } from './userRoutes'
import { serviceRoutes } from './serviceRoutes'
import { catalogRoutes } from './catalogRoutes'
import { projectRoutes } from './projectRoutes'
import { clientRoutes } from './clientRoutes'
import { workedRours } from './workedHours'
import { subcontractorRoutes } from './subcontractor'
import { serviceStageRoutes } from './serviceStagesRoutes'
import { userAttendanceRoutes } from './userAttendanceRoutes'
import { stripeRoutes } from './stripeRoutes'
import { paymentElementRoutes } from './paymentElementRoutes'
import { financeDashboard } from './financeDashboardRoutes'
import { businessDashboard } from './businessDashboardRoutes'
import { dashboardMasterRoutes } from './dashboardMasterRoutes'
import { companyRoutes } from './companyRoutes'
import { planRoutes } from './planRoutes'
import { permissionRoutes } from './permissionRoutes'
import { permissionGroupRoutes } from './permissionGroupRoutes'
import { subscriptionRoutes } from './subscriptionRoutes'
import { campaignRoutes } from './campaignRoutes'

import { quickbooksRoutes } from './quickbooksRoutes'
import { quickBooksConfigRoutes } from './quickBooksConfigRoutes'
import { invoiceRoutes } from "./invoiceRoutes"
import { customInvoiceRoutes } from "./customInvoiceRoutes"
import { invoicePaymentRoutes } from "./customInvoicePaymentRoutes"
import { invoiceStatisticsRoutes } from "./invoiceStatisticsRoutes"
import { invoiceAutoEmailRoutes } from "./invoiceAutoEmailRoutes"

import { estimateRoutes } from './estimateRoutes'
import { isMultiCompanyEnabled } from '../helpers/featureToggle'
import { fildsPdfProjectRoutes } from './fildsPdfProjectRoutes'
import fileRoutes from './fileRoutes'
import pasteRoutes from './pasteRoutes'
import { checkToken } from '../middlewares/checkToken'
import multer from 'multer'
import uploadConfig from "../config/upload";
import { UploadImageController } from '../controllers/projects/UploadImageController';
import { timeCardsRouts } from './timeCardsRoutes'
import { contractTermRoutes } from './contractTermRoutes'
import { openAiRoutes } from './openAiRoutes'
import { workContextRoutes } from './workContextRoutes'
import { projectFeedRoutes } from './projectFeedRoutes'
import { publicFeedLinkRoutes } from './publicFeedLinkRoutes'
import changeOrderRoutes from './changeOrderRoutes'
import pdfInvoicePaidRoutes from './pdfInvoicePaidRoutes'
import { tutorialRoutes } from './tutorialRoutes'
import { salesRoutes } from './salesRoutes'
import { appVersionRoutes } from './appVersionRoutes'
import { imagesAttachmentsRoutes } from './imagesAttachments'
import jobScheduleRoutes from './jobScheduleRoutes'
import { permissionsKeyRoutes } from './permissionsKeyRoutes'
import { taskRoutes } from './taskRoutes'
import { officeRoutes } from './officeRoutes'
import { chatRoutes } from './chatRoutes'
const uploadImageController = new UploadImageController();
const router = Router()
// Nova configuração de upload para imagens genéricas
const uploadImageGeneric = multer(
  uploadConfig.upload("./public/tmp/image-upload")
);
router.get('/config', async (req, res) => {
  const config = await isMultiCompanyEnabled();
  res.json({ config })
})
// Rota pública para versão do app (deve estar antes das rotas protegidas)
router.use(appVersionRoutes);

router.use("/permissions-key", permissionsKeyRoutes)

router.post(
  "/upload-image",
  checkToken,
  uploadImageGeneric.single("file"),
  uploadImageController.uploadImage
);

router.use(userRoutes)
router.use(companyRoutes)
router.use(serviceRoutes)
router.use(catalogRoutes)
router.use(projectRoutes)
router.use(clientRoutes)
router.use(workedRours)
router.use(subcontractorRoutes)
router.use("/service-project-stages", serviceStageRoutes);
router.use(userAttendanceRoutes)
router.use(stripeRoutes)
router.use(paymentElementRoutes)
router.use(quickbooksRoutes)
router.use("/quickbooks-config", quickBooksConfigRoutes)
router.use("/finance-dashboard", financeDashboard);
router.use("/business-dashboard", businessDashboard);
router.use(dashboardMasterRoutes);
router.use(invoiceRoutes);
router.use(customInvoiceRoutes);
router.use(invoicePaymentRoutes);
router.use(invoiceStatisticsRoutes);
router.use(invoiceAutoEmailRoutes);
router.use("/estimate", estimateRoutes);
router.use(fildsPdfProjectRoutes);
router.use(fileRoutes);
router.use(pasteRoutes);
// Novas rotas para planos e permissões
router.use(planRoutes)
router.use(permissionRoutes)
router.use(permissionGroupRoutes)
router.use(subscriptionRoutes)
router.use(campaignRoutes)
router.use("/timecards", timeCardsRouts)
router.use("/contract-terms", contractTermRoutes)
router.use("/openai", openAiRoutes)
router.use(workContextRoutes)
router.use(projectFeedRoutes)
router.use(publicFeedLinkRoutes)
router.use("/changeorder", changeOrderRoutes)
router.use(pdfInvoicePaidRoutes)
router.use(tutorialRoutes)
router.use(salesRoutes)
router.use(imagesAttachmentsRoutes)
router.use(jobScheduleRoutes)
router.use("/tasks", taskRoutes)
router.use("/chats", chatRoutes)
router.use(officeRoutes)

export { router }


