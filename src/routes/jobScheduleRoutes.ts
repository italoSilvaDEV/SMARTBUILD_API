import { Router } from "express";
import { GetJobsByProjectController } from "../controllers/jobSchedule/getJobsByProjectController";
import { checkToken } from "../middlewares/checkToken";
import { GetProjectsByCompanyController } from "../controllers/jobSchedule/getProjectsByCompanyController";
import { GetUsersByCompanyController } from "../controllers/jobSchedule/getUsersByCompanyController";
import { CreateJobCompanyController } from "../controllers/jobSchedule/createJobCompanyController";

const jobScheduleRoutes = Router();

const getJobsByProjectController = new GetJobsByProjectController();
const getProjectsByCompanyController = new GetProjectsByCompanyController();
const getUsersByCompanyController = new GetUsersByCompanyController();
const createJobCompanyController = new CreateJobCompanyController();

jobScheduleRoutes.get("/jobs/details/:projectId", checkToken, getJobsByProjectController.handle)

jobScheduleRoutes.get("/jobs/main/projects/:companyId", checkToken, getProjectsByCompanyController.handle)
jobScheduleRoutes.get("/jobs/main/users/:companyId", checkToken, getUsersByCompanyController.handle)
jobScheduleRoutes.post("/jobs/main/create", checkToken, createJobCompanyController.handle)

export default jobScheduleRoutes;