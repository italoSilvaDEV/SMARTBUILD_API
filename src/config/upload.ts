import multer from "multer";
import { resolve } from "path"
import crypto from "crypto"
import fs from "fs"

export default {
    upload(folder: string) {
        const uploadPath = resolve(__dirname, "..", "..", folder);

        return {
            storage: multer.diskStorage({
                destination: resolve(__dirname, "..", "..", folder),
                filename: (request, file, callback) => {
                    const fileHash = crypto.randomBytes(16).toString("hex")

                    const fileName = `${fileHash}-${file.originalname.replace(/\s/g, "")}`

                    return callback(null, fileName)
                }
            })
        }
    }
}