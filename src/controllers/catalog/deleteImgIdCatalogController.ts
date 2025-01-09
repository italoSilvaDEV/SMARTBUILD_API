import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import S3Storage from "../../utils/S3/s3Storage";

export class DeleteAllImgCatalogController {
  constructor() {
    this.handle = this.handle.bind(this);
    this.deleteFiles = this.deleteFiles.bind(this);
  }

  deleteFiles(file: string, requestFile: string | undefined) {
    deleteFile(`./public/tmp/catalog/${file}`);
    deleteFile(`./public/tmp/catalog/${requestFile}`);
  }

  async handle(request: Request, response: Response) {
    try {
      const { id } = request.params;
      const imgcatalogid = request.body; // Expecting an array of ids directly

      const s3 = new S3Storage()
      if (!id) {
        return response.status(400).json({ error: "Catalog name is required!" });
      }

      const catalog = await prisma.catalog.findUnique({
        where: { id }
      });

      if (!catalog) {
       return response.status(400).json({ error: "Catalog invalid!" });
      }

      if (!Array.isArray(imgcatalogid) || imgcatalogid.length === 0) {
        return response.status(400).json({ error: "Array of ids is required!" });
      }

      const imgCatalog = await prisma.imgCatalog.findMany({
        where: { id: { in: imgcatalogid }, catalog_id: id }
      });

      // Deletar todos os arquivos de imgCatalog
      for (const img of imgCatalog) {
        await s3.deleteFile(img.uri);
      }

      // Deletar registros de imgCatalog do banco de dados
      if (imgCatalog.length > 0) {
        await prisma.imgCatalog.deleteMany({
          where: { id: { in: imgcatalogid }, catalog_id: id }
        });
      }

      return response.json(catalog.id);
    } catch (error) {
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Internal error" });
    }
  }
}
