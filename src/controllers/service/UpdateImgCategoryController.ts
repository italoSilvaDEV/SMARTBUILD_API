import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";


export class UpdateImgCategoryController {

    async handle(request: Request, response: Response) {
        const {
            id,
        } = request.params;

        let file = ""
        file = `${request.file?.filename.split('.')[0]}.webp`;

        const category = await prisma.category.findUnique({
            where: {
                id
            }
        });

        if (!category) {
            throw Error("Invalid category identifier!");
        }


        await prisma.category.update({
            where: {
                id
            },
            data: {
                category_img: file
            }
        })

        if (category) {
            deleteFile(`./public/tmp/category/${category.category_img}`)
        }
        deleteFile(`./public/tmp/category/${request.file?.filename}`)

        

        return response.json();

    }
}
