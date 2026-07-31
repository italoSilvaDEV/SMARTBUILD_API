import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { checkToken } from "../middlewares/checkToken";
import { WorkOrderController } from "../controllers/workOrders/WorkOrderController";
import { WorkOrderSettingsController } from "../controllers/workOrders/WorkOrderSettingsController";

const workOrderRoutes = Router();
const controller = new WorkOrderController();
const settings = new WorkOrderSettingsController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadPdf = (req: Request, res: Response, next: NextFunction) => {
  upload.single("pdf")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Work order PDF cannot exceed 20 MB" });
    }
    return res.status(400).json({ error: "Unable to process work order PDF" });
  });
};

workOrderRoutes.get("/public/:publicToken", controller.getPublic.bind(controller));
workOrderRoutes.patch("/public/:publicToken/sign", controller.signPublic.bind(controller));

workOrderRoutes.use(checkToken);
workOrderRoutes.get("/settings/:companyId", settings.get.bind(settings));
workOrderRoutes.put("/settings", settings.save.bind(settings));
workOrderRoutes.get("/next-number/:companyId", controller.nextNumber.bind(controller));
workOrderRoutes.get("/", controller.list.bind(controller));
workOrderRoutes.post("/", controller.create.bind(controller));
workOrderRoutes.get("/my/project/:projectId", controller.listMineByProject.bind(controller));
workOrderRoutes.get("/my/:id", controller.getMine.bind(controller));
workOrderRoutes.patch("/my/:id/sign", controller.signMine.bind(controller));
workOrderRoutes.get("/:id", controller.get.bind(controller));
workOrderRoutes.put("/:id", controller.update.bind(controller));
workOrderRoutes.patch("/:id/cancel", controller.cancel.bind(controller));
workOrderRoutes.delete("/:id", controller.remove.bind(controller));
workOrderRoutes.post("/:id/send", uploadPdf, controller.send.bind(controller));

export { workOrderRoutes };
