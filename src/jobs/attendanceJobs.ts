import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();

export const setupAttendanceJobs = () => {
    cron.schedule('0 18 * * *', async () => {
        try {
            const openAttendances = await prisma.userAttendance.findMany({
                where: { check_out_time: null }
            });

            for (const attendance of openAttendances) {
                await prisma.userAttendance.update({
                    where: { id: attendance.id },
                    data: {
                        check_out_time: new Date(),
                        check_out_address: 'Automatic clockout',
                        check_out_latitude: attendance.check_in_latitude,
                        check_out_longitude: attendance.check_in_longitude,
                    },
                });
            }
        } catch (error) {
            console.error('Automatic checkout error:', error);
        }
    });
}; 