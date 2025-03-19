import { Router } from "express"
import { UserController } from "../controllers/User/UserController"
import { checkToken } from "../middlewares/checkToken"
import { compressImage } from "../config/compressImage";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";

const userRoutes = Router()

const User = new UserController()

//criar usuario
const uploadPhoto = multer(uploadConfig.uploadUtf8("./public/tmp/user"))
//criar

userRoutes.post("/user",
    checkToken,
    uploadPhoto.single("avatar"),
    compressImage("user"),
    User.create)

//login user
userRoutes.post("/auth", User.authenticate)

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

export { userRoutes }