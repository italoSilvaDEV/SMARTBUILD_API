import { SubcontractorAccessError } from '../../utils/subcontractorIdentity';
import { withExternalAuthors, authorizeExternalReportEmployee } from '../../services/employeeExternalReportBridge';
import { externalServiceError } from '../../services/SubcontractorAccessService';
import { deleteFileFromS3 } from '../../utils/S3/deleteFileFromS3';
import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

// Listar todas as atividades
export const listActivities = async (req: Request, res: Response): Promise<void> => {
    const { serviceProjectId } = req.params
    try {
        const activities = await withExternalAuthors(prisma.activities.findMany({
            where: {
                serviceProjectId
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                },
            },
            orderBy: {
                date_creation: "desc"
            }
        }), (req as any).userId);
        res.status(200).json(activities);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch activities" });
    }
};

// Cadastrar uma nova atividade
export const createActivity = async (req: Request, res: Response): Promise<void> => {
    const { text, serviceProjectId, authorId } = req.body;
    try {
        const activity = await prisma.activities.create({
            data: {
                text,
                serviceProjectId,
                authorId,
            },
        });
        res.status(201).json(activity);
    } catch (error) {
        res.status(500).json({ error: "Failed to create activity" });
    }
};

// Excluir uma atividade
export const deleteActivity = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        if (await authorizeExternalReportEmployee(id, (req as any).userId, true)) {
            const photos = await prisma.galleryAfter.findMany({where:{description:id,title:'FEED_POST'}});
            await prisma.$transaction(async tx=>{await tx.galleryAfter.deleteMany({where:{description:id,title:'FEED_POST'}});await tx.activities.delete({where:{id}});});
            await Promise.all(photos.map(photo=>deleteFileFromS3(photo.url).catch(()=>{})));
            res.status(200).json({message:'Activity deleted successfully'});return;
        }
        await prisma.activities.delete({
            where: { id },
        });
        res.status(200).json({ message: "Activity deleted successfully" });
    } catch (error) {
        if (error instanceof SubcontractorAccessError) { const failure=externalServiceError(error);res.status(failure.status).json({error:failure.code}); }
        else res.status(500).json({error:'Failed to delete activity'});
    }
};
