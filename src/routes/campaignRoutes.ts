import { Router } from 'express';
import { CampaignController } from '../controllers/campaigns/CampaignController';
import { checkToken } from '../middlewares/checkToken';

const campaignRoutes = Router();
const campaignController = new CampaignController();

// Rotas para campanhas
campaignRoutes.post('/campaigns', checkToken, campaignController.create);
campaignRoutes.get('/campaigns', checkToken, campaignController.getAllCampaigns);
campaignRoutes.get('/campaigns/plans', campaignController.getCampaignPlans); // Pública para permitir listagem na página de cadastro
campaignRoutes.get('/campaigns/:id', campaignController.getCampaignById); // Pública para permitir acesso à página de cadastro
campaignRoutes.put('/campaigns/:id', checkToken, campaignController.updateCampaign);
campaignRoutes.delete('/campaigns/:id', checkToken, campaignController.deleteCampaign);

export { campaignRoutes };

