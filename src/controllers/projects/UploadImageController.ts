import { Request, Response } from "express";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2, uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class UploadImageController {
  async uploadImage(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Image file is required" });
      }
      
      const filePath = req.file?.filename; 
      
      // Upload para S3
      const fileName = await uploadFileToS3_2(
        req.file,
        "",
        false
      );

      // Gerar URL assinada
      const signedUrl = await getPresignedUrl(fileName);

      deleteFile(`./public/tmp/image-upload/${filePath}`);
      
      return res.json({ 
        url: signedUrl,
        fileName: fileName 
      });
    } catch (error) {
      // Limpeza em caso de erro
      if (req.file) {
        deleteFile(`./public/tmp/image-upload/${req.file?.filename}`);
      }
      
      // console.error("Error uploading image:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }
} 