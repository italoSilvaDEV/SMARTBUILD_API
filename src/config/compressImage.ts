// resizeAndCompressImageMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';

import sizeOf from 'image-size'; // Certifique-se de instalar a biblioteca com: npm install image-size
const path = require("path");

export const compressImage = (url: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return next();
    }

    // const filePath = `./public/tmp/${url}/${req.file.filename.replace(/\s/g, "")}`;

    const filePath = path.resolve(
      __dirname,
      "..",
      "..",
      "public",
      "tmp",
      url,
      req.file.filename.replace(/\s/g, "")
    );

    // console.log("Caminho do arquivo no compressImage:", filePath);
    try {
    
    const dimensions = getImageDimensions(filePath);
    if (!dimensions) {
      // console.log("Dimensões inválidas para o arquivo:", filePath);
      // Não é uma imagem válida, pule para o próximo middleware
      return next();
    }

    const nameFile = `${req.file.filename.split('.')[0]}.webp`.replace(/\s/g, "");

      if (req.file.size < 50000) {
        await sharp(filePath)
          .rotate()
          .webp()
          .toFile(`./public/tmp/${url}/${nameFile}`);
      } else {
        await sharp(filePath)
          .rotate()
          .webp({ quality: 80 })
          .toFile(`./public/tmp/${url}/${nameFile}`);
      }
      next();
    } catch (error) {
      // Lide com o erro aqui
      // console.error("Erro no compressImage:", error);
      // console.error(error);
      next(error);
    }
  };
};

export function getImageDimensions(filePath: string) {
  try {
    return sizeOf(filePath);
  } catch (error) {
    // Não foi possível obter as dimensões da imagem
    // console.error('Error getting image dimensions:', error);
    return null;
  }
}
