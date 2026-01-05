import { Router } from "express";
import { GetJobsByProjectController } from "../controllers/jobSchedule/getJobsByProjectController";
import { checkToken } from "../middlewares/checkToken";
import { GetProjectsByCompanyController } from "../controllers/jobSchedule/getProjectsByCompanyController";
import { GetUsersByProjectController } from "../controllers/jobSchedule/getUsersByProjectController";
import { CreateJobCompanyController } from "../controllers/jobSchedule/createJobCompanyController";
import { GetJobsByCompanyController } from "../controllers/jobSchedule/getJobsByCompanyController";
import { GetServicesByProjectController } from "../controllers/jobSchedule/getServicesByProjectController";
import { CreateJobProjectController } from "../controllers/jobSchedule/createJobProjectController";
import { CreateSubserviceController } from "../controllers/jobSchedule/SubServices/createSubserviceController";
import { GetSubContractorsController } from "../controllers/jobSchedule/getSubContractorsControler";
import { CompleteJobController } from "../controllers/jobSchedule/completeJobController";
import { CreateCustomServiceController } from "../controllers/jobSchedule/CustomServices/createCustomServiceController";
import { GetCustomJobsController } from "../controllers/jobSchedule/CustomServices/getCustomJobsController";
const jobScheduleRoutes = Router();

const getJobsByProjectController = new GetJobsByProjectController();
const getProjectsByCompanyController = new GetProjectsByCompanyController();
const getUsersByProjectController = new GetUsersByProjectController();
const createJobCompanyController = new CreateJobCompanyController();
const getJobsByCompanyController = new GetJobsByCompanyController();
const getServicesByProjectController = new GetServicesByProjectController();
const createJobProjectController = new CreateJobProjectController();
const createSubserviceController = new CreateSubserviceController();
const getSubContractorsController = new GetSubContractorsController();
const completeJobController = new CompleteJobController();
const createCustomServiceController = new CreateCustomServiceController();
const getCustomJobsController = new GetCustomJobsController();

jobScheduleRoutes.get("/jobs/details/:projectId", checkToken, getJobsByProjectController.handle)
jobScheduleRoutes.get("/jobs/details/users/:projectId/:companyId", checkToken, getUsersByProjectController.handle)
jobScheduleRoutes.get("/jobs/details/services/:projectId/:companyId", checkToken, getServicesByProjectController.handle)
jobScheduleRoutes.post("/jobs/details/create", checkToken, createJobProjectController.handle)
jobScheduleRoutes.post("/jobs/details/subservice", checkToken, createSubserviceController.handle)
jobScheduleRoutes.get("/jobs/details/subcontractors/:companyId", checkToken, getSubContractorsController.handle)
jobScheduleRoutes.post("/jobs/details/complete", checkToken, completeJobController.handle)
jobScheduleRoutes.post("/jobs/details/customservice", checkToken, createCustomServiceController.handle)
jobScheduleRoutes.get("/jobs/details/customjobs/:projectId/:companyId", checkToken, getCustomJobsController.handle)

jobScheduleRoutes.get("/jobs/main/jobs/:companyId", checkToken, getJobsByCompanyController.handle)
jobScheduleRoutes.get("/jobs/main/projects/:companyId", checkToken, getProjectsByCompanyController.handle)
jobScheduleRoutes.post("/jobs/main/create", checkToken, createJobCompanyController.handle)

export default jobScheduleRoutes;