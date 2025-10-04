import multer from "multer";
import { resolve } from "path"
import crypto from "crypto"
import fs from "fs"

export default {
    upload(folder: string) {
        const uploadPath = resolve(__dirname, "..", "..", folder);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        return {
            storage: multer.diskStorage({
                destination: resolve(__dirname, "..", "..", folder),
                filename: (request, file, callback) => {
                    const fileHash = crypto.randomBytes(16).toString("hex")
                    
                    // Extensões baseadas no mimetype
                    const mimeToExt: { [key: string]: string } = {
                        'audio/mpeg': '.mp3',
                        'audio/mp3': '.mp3',
                        'audio/wav': '.wav',
                        'audio/wave': '.wav',
                        'audio/x-wav': '.wav',
                        'audio/webm': '.webm',
                        'audio/ogg': '.ogg',
                        'audio/flac': '.flac',
                        'audio/m4a': '.m4a',
                        'audio/mp4': '.mp4',
                        'video/mp4': '.mp4',
                        'video/mpeg': '.mpeg',
                    };

                    // Remove espaços do nome original
                    const cleanName = file.originalname.replace(/\s/g, "");
                    
                    // Verifica se já tem extensão
                    let fileName = '';
                    if (cleanName.includes('.')) {
                        // Já tem extensão
                        fileName = `${fileHash}-${cleanName}`;
                    } else if (file.mimetype && mimeToExt[file.mimetype]) {
                        // Não tem extensão, adiciona baseado no mimetype
                        fileName = `${fileHash}-${cleanName}${mimeToExt[file.mimetype]}`;
                    } else {
                        // Fallback: usa o nome sem extensão
                        fileName = `${fileHash}-${cleanName}`;
                    }

                    return callback(null, fileName)
                }
            })
        }
    }
}