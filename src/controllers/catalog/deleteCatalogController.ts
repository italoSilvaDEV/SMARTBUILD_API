import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";

export class DeleteCatalogController {
  constructor() {
    this.handle = this.handle.bind(this);
  }

  async handle(request: Request, response: Response) {
    try {
      const { id } = request.params;

      if (!id) {
        return response.status(400).json({ error: "Catalog id is required!" });
      }

      const catalog = await prisma.catalog.findUnique({
        where: { id }
      });

      if (!catalog) {
        return response.status(400).json({ error: "Catalog not found!" });
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

      // Deletar o catálogo
      await prisma.catalog.delete({
        where: { id }
      });

      return response.json({ message: "Catalog and related images deleted successfully!" });
    } catch (error) {
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Internal error" });
    }
  }
}
