import { Router } from "express"
import { UserController } from "../controllers/UserController"
import { checkToken } from "../middlewares/checkToken"


import { compressImage } from "../config/compressImage";
import multer from "multer";
import uploadConfig from "../config/upload";
const userRoutes = Router()

const User = new UserController()
//criar usuario
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/user"))
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

//update imgUser
userRoutes.put("/user/img/:id",
    checkToken,
    uploadPhoto.single("file"),
    compressImage("user"),
    User.updateImg
)

// search one user
userRoutes.get("/user/consulta/:id", checkToken, User.searchOneUser)

// search one user
userRoutes.get("/user/office", checkToken, User.serchOfficeUser)

//Busca all user
userRoutes.post("/user/consulta", checkToken, User.serchAllUser)

//Busca all user
userRoutes.delete("/user/:id", checkToken, User.delete)

//Recuperar senha
userRoutes.post('/recover-password', User.sendMailRecover)
userRoutes.post('/create-password', User.updatePassword)


export { userRoutes }