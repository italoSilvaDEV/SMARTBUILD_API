import { Router } from "express"
import { UserController } from "../controllers/User/UserController"
import { UserMultiCompanyController } from "../controllers/User/UserMultiCompanyController";
import { checkToken } from "../middlewares/checkToken"
import { compressImage } from "../config/compressImage";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";
import { isMultiCompanyEnabled } from "../helpers/featureToggle";
const userRoutes = Router()

const User = new UserController()
const UserMultiCompany = new UserMultiCompanyController()

//criar usuario
const uploadPhoto = multer(uploadConfig.uploadUtf8("./public/tmp/user"))

// Feature toggle para multi-company
// const multiCompanyEnabled = await isMultiCompanyEnabled();


userRoutes.post("/user",
    checkToken,
    uploadPhoto.single("avatar"),
    compressImage("user"),
    User.create)

//update user
userRoutes.put("/user", checkToken, User.update)

// app
userRoutes.put("/user/update-profile", checkToken, User.updateUserProfile);

//update imgUser
userRoutes.put("/user/img/:id",
    checkToken,
    uploadPhoto.single("file"),    
    compressImage("user"),
    User.updateImg
)

// search one user
userRoutes.get("/user/consulta/:id", checkToken, User.searchOneUser)

// app
userRoutes.get("/user/details/:id", checkToken, User.getUserDetails);

// search one user
userRoutes.get("/user/office", checkToken, User.serchOfficeUser)

//Busca all user
userRoutes.post("/user/consulta", checkToken, User.serchAllUser)

//Busca all user
userRoutes.delete("/user/:id", checkToken, User.delete)

//Recuperar senha
userRoutes.post('/recover-password', User.sendMailRecover)
userRoutes.post('/valid-code', User.validCode)
userRoutes.post('/create-password', User.updatePassword)

// Atualizar email do usuário e enviar nova senha
userRoutes.post("/user/update-email", checkToken, User.updateUserEmailAndSendPassword);

// Rota para verificar status da assinatura
userRoutes.get('/user/subscription-status/:userId?', checkToken, User.getSubscriptionStatus);

// Rota para verificar status da assinatura local
userRoutes.get('/user/local-subscription-status/:userId?', checkToken, User.getLocalSubscriptionsStatus);

// rota com feature toggle para autenticação
userRoutes.post("/auth", async (req, res) => {
  const multiCompanyEnabled = await isMultiCompanyEnabled();
  if (multiCompanyEnabled) {
    console.log('🔄 Using multi-company authentication');
    return UserMultiCompany.authenticate(req, res);
  } else {
    console.log('🔄 Using single company authentication');
    return User.authenticate(req, res);
  }
});

export { userRoutes }