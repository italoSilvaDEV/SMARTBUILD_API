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
import { ResendEmailController } from "../controllers/jobSchedule/resendEmailController";
import { UpdateJobProjectController } from "../controllers/jobSchedule/updateJobProjectController";
import { DeleteJobProjectController } from "../controllers/jobSchedule/deleteJobProjectController";
import { UpdateSubserviceController } from "../controllers/jobSchedule/SubServices/updateSubserviceController";
import { DeleteSubserviceController } from "../controllers/jobSchedule/SubServices/deleteSubserviceController";
import { UpdateCustomServiceController } from "../controllers/jobSchedule/CustomServices/updateCustomServiceController";
import { DeleteCustomServiceController } from "../controllers/jobSchedule/CustomServices/deleteCustomServiceController";
import { ProjectScheduleController } from "../controllers/jobSchedule/projectScheduleController";
import { GetAllProjectServicesController } from "../controllers/jobSchedule/GetAllProjectServicesController";
import { GetLiveTrackingByCompanyController } from "../controllers/jobSchedule/GetLiveTrackingByCompanyController";
import { GetDispatchJobsByCompanyController } from "../controllers/jobSchedule/GetDispatchJobsByCompanyController";

const jobScheduleRoutes = Router();

const projectScheduleController = new ProjectScheduleController();
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
const resendEmailController = new ResendEmailController();
const updateJobProjectController = new UpdateJobProjectController();
const deleteJobProjectController = new DeleteJobProjectController();
const updateSubserviceController = new UpdateSubserviceController();
const deleteSubserviceController = new DeleteSubserviceController();
const updateCustomServiceController = new UpdateCustomServiceController();
const deleteCustomServiceController = new DeleteCustomServiceController();
const getAllProjectServicesController = new GetAllProjectServicesController();
const getLiveTrackingByCompanyController = new GetLiveTrackingByCompanyController();
const getDispatchJobsByCompanyController = new GetDispatchJobsByCompanyController();

jobScheduleRoutes.get("/jobs/details/:projectId", checkToken, getJobsByProjectController.handle)
jobScheduleRoutes.get("/jobs/details/users/:projectId/:companyId", checkToken, getUsersByProjectController.handle)
jobScheduleRoutes.get("/jobs/details/services/:projectId/:companyId", checkToken, getServicesByProjectController.handle)
jobScheduleRoutes.get("/jobs/details/projectservices/:projectId", checkToken, getAllProjectServicesController.handle)
jobScheduleRoutes.post("/jobs/details/create", checkToken, createJobProjectController.handle)

// Edit and Delete Routes
jobScheduleRoutes.put("/jobs/details/update", checkToken, updateJobProjectController.handle)
jobScheduleRoutes.delete("/jobs/details/delete/:serviceProjectId/:companyId", checkToken, deleteJobProjectController.handle)

jobScheduleRoutes.put("/jobs/details/subservice/update", checkToken, updateSubserviceController.handle)
jobScheduleRoutes.delete("/jobs/details/subservice/delete/:subserviceId/:companyId", checkToken, deleteSubserviceController.handle)

jobScheduleRoutes.put("/jobs/details/customservice/update", checkToken, updateCustomServiceController.handle)
jobScheduleRoutes.delete("/jobs/details/customservice/delete/:customServiceId/:companyId", checkToken, deleteCustomServiceController.handle)

jobScheduleRoutes.post("/jobs/details/subservice", checkToken, createSubserviceController.handle)
jobScheduleRoutes.get("/jobs/details/subcontractors/:companyId", checkToken, getSubContractorsController.handle)
jobScheduleRoutes.post("/jobs/details/complete", checkToken, completeJobController.handle)
jobScheduleRoutes.post("/jobs/details/customservice", checkToken, createCustomServiceController.handle)
jobScheduleRoutes.get("/jobs/details/customjobs/:projectId/:companyId", checkToken, getCustomJobsController.handle)
jobScheduleRoutes.get("/jobs/details/company/:companyId/dispatch", checkToken, getDispatchJobsByCompanyController.handle.bind(getDispatchJobsByCompanyController))

jobScheduleRoutes.post("/jobs/details/resend/service/:id", checkToken, resendEmailController.forServiceProject)
jobScheduleRoutes.post("/jobs/details/resend/subservice/:id", checkToken, resendEmailController.forSubService)
jobScheduleRoutes.post("/jobs/details/resend/customservice/:id", checkToken, resendEmailController.forCustomService)

jobScheduleRoutes.get("/jobs/main/jobs/:companyId", checkToken, getJobsByCompanyController.handle)
jobScheduleRoutes.get("/jobs/main/projects/:companyId", checkToken, getProjectsByCompanyController.handle)
jobScheduleRoutes.get("/jobs/main/live-tracking/current/:companyId", checkToken, getLiveTrackingByCompanyController.handle.bind(getLiveTrackingByCompanyController))
jobScheduleRoutes.get("/jobs/main/live-tracking/:companyId", checkToken, getLiveTrackingByCompanyController.handle.bind(getLiveTrackingByCompanyController))
jobScheduleRoutes.post("/jobs/main/create", checkToken, createJobCompanyController.handle)

// Project Level Schedule Routes
jobScheduleRoutes.put("/jobs/main/update/:projectId", checkToken, projectScheduleController.update)
jobScheduleRoutes.post("/jobs/main/resend/:projectId", checkToken, projectScheduleController.resend)
jobScheduleRoutes.post("/jobs/main/sendemail/updated", checkToken, projectScheduleController.sendEmailUpdated)
jobScheduleRoutes.post("/jobs/main/sendemail/assigned", checkToken, projectScheduleController.sendEmailAssigned)
jobScheduleRoutes.delete("/jobs/main/delete/:projectId", checkToken, projectScheduleController.delete)

export default jobScheduleRoutes;


