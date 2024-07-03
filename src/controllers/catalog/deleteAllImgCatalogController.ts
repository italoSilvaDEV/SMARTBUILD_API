import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";

export class UpdateCatalogController {
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

      let file = "";
      file = `${request.file?.filename.split('.')[0]}.webp`;

      if (!id) {
        this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
        return response.status(400).json({ error: "Catalog name is required!" });
      }

      const catalog = await prisma.catalog.findUnique({
        where: { id }
      });

      if (!catalog) {
        this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
        return response.status(400).json({ error: "Catalog invalid!" });
      }

      const imgCatalog = await prisma.imgCatalog.findMany({
        where: { catalog_id: id }
      });

      // Deletar todos os arquivos de imgCatalog
      for (const img of imgCatalog) {
        deleteFile(`./public/tmp/catalogimg/${img.uri}`);
      }

      // Deletar registros de imgCatalog do banco de dados
      if (imgCatalog.length > 0) {
        await prisma.imgCatalog.deleteMany({
          where: { catalog_id: id }
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
