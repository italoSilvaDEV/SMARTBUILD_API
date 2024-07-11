import multer from "multer";
import { resolve } from "path";
import crypto from "crypto";
import iconv from "iconv-lite";

export default {
    uploadUtf8(folder: string) {
        return {
            storage: multer.diskStorage({
                destination: resolve(__dirname, "..", "..", folder),
                filename: (request, file, callback) => {
                    const fileHash = crypto.randomBytes(16).toString("hex");

                    // Convert the filename to UTF-8
                    const originalName = iconv.decode(Buffer.from(file.originalname, 'binary'), 'utf-8');
                    const fileName = `${fileHash}-${originalName.replace(/\s/g, "")}`;

                    return callback(null, fileName);
                }
            })
        }
    }
}
