import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { DateTime } from "luxon";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { parseDateRange, getDefaultWeekRange } from "../../utils/dateUtils";

function calculateWeeklyOvertime(weeklyAttendances: Map<string, any>) {
    let totalPrice = 0;
    let totalHours = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;

    weeklyAttendances.forEach(weekData => {
        let weeklyRegularHoursUsed = 0;
        const WEEKLY_REGULAR_LIMIT = 40;

        const sortedAttendances = weekData.attendances.sort((a: any, b: any) =>
            new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime()
        );

        sortedAttendances.forEach((attendance: any) => {
            if (!attendance.check_in_time || !attendance.user) return;

            let dailyHours = 0;
            if (attendance.check_out_time) {
                const hours = calcularHorasTrabalhadas(
                    attendance.check_in_time.toISOString(),
                    attendance.check_out_time.toISOString(),
                    attendance.workStartTime,
                    attendance.workEndTime,
                    attendance.user.defaultBreakMinutes || 0
                );
                dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
            }

            const hadOvertimePermission = attendance.isOvertime === true;
            const hourlyRate = attendance.user.hourly_price || 0;
            const remainingRegularHours = Math.max(0, WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed);
            const regularHoursThisDay = Math.min(dailyHours, remainingRegularHours);
            const potentialOvertimeHours = Math.max(0, dailyHours - regularHoursThisDay);

            weeklyRegularHoursUsed += regularHoursThisDay;

            if (hadOvertimePermission && potentialOvertimeHours > 0) {
                totalRegularHours += regularHoursThisDay;
                totalOvertimeHours += potentialOvertimeHours;
                totalPrice += (regularHoursThisDay * hourlyRate) + (potentialOvertimeHours * hourlyRate * 1.5);
            } else {
                totalRegularHours += dailyHours;
                totalPrice += dailyHours * hourlyRate;
            }

            totalHours += dailyHours;
        });
    });

    return {
        totalPrice: parseFloat(totalPrice.toFixed(2)),
        totalHours: parseFloat(totalHours.toFixed(2)),
        totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2))
    };
}

export class getAllController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params

        let {
            start_date,
            deadline,
        } = req.query

        if (!companyId) {
            return res.status(400).json({
                error: "companyId is required"
            })
        }

        if (!start_date || !deadline) {
            const defaultRange = getDefaultWeekRange();
            start_date = defaultRange.start_date;
            deadline = defaultRange.deadline;
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(404).json({
                error: "Company not found"
            })
        }


        const { startOfDay, endOfDay } = parseDateRange(String(start_date), String(deadline));
        const startDate = startOfDay;
        const deadlineDate = endOfDay;


        try {
            const projects = await prisma.project.findMany({
                where: {
                    company_id: companyId,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                    },
                    serviceProject: {
                        some: {
                            UserServiceProject: {
                                some: {
                                    user_attendances: {
                                        some: {
                                            check_in_time: {
                                                gte: startDate,
                                                lte: deadlineDate,
                                            },
                                            OR: [
                                                {
                                                    check_out_time: {
                                                        lte: deadlineDate,
                                                    }
                                                },
                                                {
                                                    check_out_time: null
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                select: {
                    id: true,
                    location: true,
                    client: {
                        select: {
                            name: true,
                            location: true,
                            city_and_state: true,
                        }
                    },
                    serviceProject: {
                        select: {
                            id: true,
                            name: true,
                            UserServiceProject: {
                                select: {
                                    user_attendances: {
                                        where: {
                                            check_in_time: {
                                                gte: startDate,
                                                lte: deadlineDate,
                                            },
                                            OR: [
                                                {
                                                    check_out_time: {
                                                        lte: deadlineDate,
                                                    }
                                                },
                                                {
                                                    check_out_time: null
                                                }
                                            ]
                                        },
                                        select: {
                                            date: true,
                                            check_in_time: true,
                                            check_out_time: true,
                                            workStartTime: true,
                                            workEndTime: true,
                                            isOvertime: true,
                                            user: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                    hourly_price: true,
                                                    avatar: true,
                                                    defaultBreakMinutes: true,
                                                    dailyRate: true
                                                }
                                            }
                                        },
                                        orderBy: {
                                            check_in_time: 'desc'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const allAttendances = await prisma.userAttendance.findMany({
                where: {
                    check_in_time: {
                        gte: startDate,
                        lte: deadlineDate,
                    },
                    AND: [
                        {
                            OR: [
                                { check_out_time: { lte: deadlineDate } },
                                { check_out_time: null }
                            ]
                        },
                        {
                            OR: [
                                {
                                    UserServiceProject: {
                                        service_project: {
                                            Project: {
                                                company_id: companyId,
                                                status_project: {
                                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                                }
                                            }
                                        }
                                    }
                                },
                                {
                                    UserServiceProject: {
                                        service_project: {
                                            projectId: null,
                                            company_id: companyId
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                },
                select: {
                    date: true,
                    check_in_time: true,
                    check_out_time: true,
                    workStartTime: true,
                    workEndTime: true,
                    isOvertime: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            hourly_price: true,
                            isOverTime: true,
                            avatar: true,
                            defaultBreakMinutes: true,
                            dailyRate: true
                        }
                    }
                }
            });

            const canceledProjectAttendances = await prisma.userAttendance.findMany({
                where: {
                    check_in_time: { gte: startDate, lte: deadlineDate },
                    AND: [
                        {
                            OR: [
                                { check_out_time: { lte: deadlineDate } },
                                { check_out_time: null }
                            ]
                        },
                        {
                            UserServiceProject: {
                                service_project: {
                                    projectId: null,
                                    company_id: companyId
                                }
                            }
                        }
                    ]
                },
                select: {
                    date: true,
                    check_in_time: true,
                    check_out_time: true,
                    workStartTime: true,
                    workEndTime: true,
                    isOvertime: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            hourly_price: true,
                            isOverTime: true,
                            defaultBreakMinutes: true,
                            dailyRate: true
                        }
                    }
                }
            });

            const weeklyAttendances = new Map();

            allAttendances.forEach(attendance => {
                if (attendance.check_in_time && attendance.user) {
                    const userId = attendance.user.id;
                    const attendanceDate = DateTime.fromJSDate(attendance.check_in_time);
                    const weekStart = attendanceDate.startOf('week').plus({ days: 1 });
                    const weekKey = `${userId}-${weekStart.toISODate()}`;

                    if (!weeklyAttendances.has(weekKey)) {
                        weeklyAttendances.set(weekKey, {
                            user: attendance.user,
                            attendances: []
                        });
                    }

                    weeklyAttendances.get(weekKey).attendances.push(attendance);
                }
            });

            const overtimeTotals = calculateWeeklyOvertime(weeklyAttendances);

            const totalProjects = projects.length;
            const totalServices = projects.reduce((acc, project) => acc + project.serviceProject.length, 0);

            const indicators = {
                ...overtimeTotals,
                totalServices,
                totalProjects
            };

            const canceledProjectWeeklyMap = new Map();
            canceledProjectAttendances.forEach(attendance => {
                if (attendance.check_in_time && attendance.user) {
                    const userId = attendance.user.id;
                    const attendanceDate = DateTime.fromJSDate(attendance.check_in_time);
                    const weekStart = attendanceDate.startOf('week').plus({ days: 1 });
                    const weekKey = `${userId}-${weekStart.toISODate()}`;
                    if (!canceledProjectWeeklyMap.has(weekKey)) {
                        canceledProjectWeeklyMap.set(weekKey, { user: attendance.user, attendances: [] });
                    }
                    canceledProjectWeeklyMap.get(weekKey).attendances.push(attendance);
                }
            });
            const canceledWorkerData: any[] = [];
            canceledProjectWeeklyMap.forEach(weekData => {
                let weeklyRegularHoursUsed = 0;
                const WEEKLY_REGULAR_LIMIT = 40;
                const attendancesWithHours: Array<{ attendance: any; dailyHours: number; hadOvertimePermission: boolean }> = [];
                weekData.attendances.forEach((attendance: any) => {
                    let dailyHours = 0;
                    if (attendance.check_out_time) {
                        const hours = calcularHorasTrabalhadas(
                            attendance.check_in_time.toISOString(),
                            attendance.check_out_time.toISOString(),
                            attendance.workStartTime,
                            attendance.workEndTime,
                            attendance.user.defaultBreakMinutes || 0
                        );
                        dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                    }
                    attendancesWithHours.push({
                        attendance,
                        dailyHours,
                        hadOvertimePermission: attendance.isOvertime === true
                    });
                });
                attendancesWithHours.forEach(({ attendance, dailyHours, hadOvertimePermission }) => {
                    const hourlyRate = attendance.user?.hourly_price || 0;
                    const remainingRegularHours = Math.max(0, WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed);
                    const finalRegularHours = Math.min(dailyHours, remainingRegularHours);
                    const potentialOvertimeHours = Math.max(0, dailyHours - finalRegularHours);
                    weeklyRegularHoursUsed += finalRegularHours;
                    let price = 0;
                    if (hadOvertimePermission && potentialOvertimeHours > 0) {
                        price = (finalRegularHours * hourlyRate) + (potentialOvertimeHours * hourlyRate * 1.5);
                    } else {
                        price = dailyHours * hourlyRate;
                    }
                    canceledWorkerData.push({
                        nameWorker: attendance.user?.name || "",
                        date: attendance.date,
                        in: attendance.check_in_time,
                        out: attendance.check_out_time,
                        regular_hours: parseFloat(dailyHours.toFixed(2)),
                        overtime_hours: 0,
                        total_hours: parseFloat(dailyHours.toFixed(2)),
                        price: parseFloat((dailyHours * hourlyRate).toFixed(2))
                    });
                });
            });
            const canceledProjectEntry = {
                clientData: "Canceled projects",
                clientName: "Canceled projects",
                clientAddress: "",
                clientCityAndState: "",
                serviceCount: 0,
                workerData: canceledWorkerData.sort((a, b) => new Date(b.in).getTime() - new Date(a.in).getTime())
            };

            const formattedProjects = [
                ...projects.map(project => {
                const clientName = project.client?.name || "";
                const clientAddress = project.location || project.client?.location || "";
                const clientData = `${clientName} - ${clientAddress}`;
                const clientCityAndState = project.client?.city_and_state || "";
                const serviceCount = project.serviceProject.length;

                const workerData: any[] = [];

                const projectWeeklyMap = new Map();

                project.serviceProject.forEach(service => {
                    service.UserServiceProject.forEach(userService => {
                        userService.user_attendances.forEach(attendance => {
                            if (attendance.check_in_time && attendance.user) {
                                const userId = attendance.user.id;
                                const attendanceDate = DateTime.fromJSDate(attendance.check_in_time);
                                const weekStart = attendanceDate.startOf('week').plus({ days: 1 });
                                const weekKey = `${userId}-${weekStart.toISODate()}`;

                                if (!projectWeeklyMap.has(weekKey)) {
                                    projectWeeklyMap.set(weekKey, {
                                        user: attendance.user,
                                        attendances: []
                                    });
                                }

                                projectWeeklyMap.get(weekKey).attendances.push(attendance);
                            }
                        });
                    });
                });

                projectWeeklyMap.forEach(weekData => {
                    let weeklyTotalHours = 0;
                    const attendancesWithHours: Array<{
                        attendance: any;
                        dailyHours: number;
                        hadOvertimePermission: boolean;
                    }> = [];

                    weekData.attendances.forEach((attendance: any) => {
                        let dailyHours = 0;

                        if (attendance.check_out_time) {
                            const hours = calcularHorasTrabalhadas(
                                attendance.check_in_time.toISOString(),
                                attendance.check_out_time.toISOString(),
                                attendance.workStartTime,
                                attendance.workEndTime,
                                attendance.user.defaultBreakMinutes || 0
                            );
                            dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                        } else {
                            dailyHours = 0;
                        }

                        weeklyTotalHours += dailyHours;

                        attendancesWithHours.push({
                            attendance,
                            dailyHours,
                            hadOvertimePermission: attendance.isOvertime === true
                        });
                    });

                    let weeklyRegularHoursUsed = 0;
                    const WEEKLY_REGULAR_LIMIT = 40;

                    attendancesWithHours.forEach(({ attendance, dailyHours, hadOvertimePermission }) => {
                        const hourlyRate = attendance.user?.hourly_price || 0;
                        let finalRegularHours = 0;
                        let finalOvertimeHours = 0;
                        let price = 0;

                        const remainingRegularHours = Math.max(0, WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed);
                        finalRegularHours = Math.min(dailyHours, remainingRegularHours);
                        const potentialOvertimeHours = Math.max(0, dailyHours - finalRegularHours);

                        weeklyRegularHoursUsed += finalRegularHours;

                        if (hadOvertimePermission && potentialOvertimeHours > 0) {
                            finalOvertimeHours = potentialOvertimeHours;
                            price = (finalRegularHours * hourlyRate) + (finalOvertimeHours * hourlyRate * 1.5);
                        } else {
                            finalRegularHours += potentialOvertimeHours;
                            finalOvertimeHours = 0;
                            price = dailyHours * hourlyRate;
                        }

                        workerData.push({
                            nameWorker: attendance.user?.name || "",
                            date: attendance.date,
                            in: attendance.check_in_time,
                            out: attendance.check_out_time,
                            regular_hours: parseFloat(dailyHours.toFixed(2)),
                            overtime_hours: 0,
                            total_hours: parseFloat(dailyHours.toFixed(2)),
                            price: parseFloat((dailyHours * hourlyRate).toFixed(2))
                        });
                    });
                });

                return {
                    clientData,
                    clientName,
                    clientAddress,
                    clientCityAndState,
                    serviceCount,
                    workerData: workerData.sort((a, b) => new Date(b.in).getTime() - new Date(a.in).getTime())
                };
            }),
                canceledProjectEntry
            ].sort((a, b) => a.clientName.localeCompare(b.clientName));

            const workersMap = new Map();

            const userWeeklyMap = new Map();

            weeklyAttendances.forEach((weekData, weekKey) => {
                const userId = weekData.user.id;

                if (!userWeeklyMap.has(userId)) {
                    userWeeklyMap.set(userId, {
                        user: weekData.user,
                        weeklyAttendances: new Map()
                    });
                }

                userWeeklyMap.get(userId).weeklyAttendances.set(weekKey, weekData);
            });

            userWeeklyMap.forEach((userData, userId) => {
                const userTotals = calculateWeeklyOvertime(userData.weeklyAttendances);

                workersMap.set(userId, {
                    user: {
                        id: userData.user.id,
                        name: userData.user.name,
                        hourly_price: userData.user.hourly_price,
                        isOverTime: userData.user.isOverTime
                    },
                    hours_worked: userTotals.totalHours,
                    regular_hours: userTotals.totalRegularHours,
                    overtime_hours: userTotals.totalOvertimeHours,
                    price: userTotals.totalPrice
                });
            });

            const formattedWorkers = Array.from(workersMap.values()).map(worker => ({
                user: {
                    ...worker.user,
                    isOverTime: worker.overtime_hours > 0
                },
                hours_worked: parseFloat(worker.hours_worked.toFixed(2)),
                regular_hours: parseFloat(worker.regular_hours.toFixed(2)),
                overtime_hours: parseFloat(worker.overtime_hours.toFixed(2)),
                price: parseFloat(worker.price.toFixed(2))
            })).sort((a, b) => a.user.name.localeCompare(b.user.name));

            const payrollMap = new Map();

            for (const weekData of weeklyAttendances.values()) {
                const userId = weekData.user.id;
                const userName = weekData.user.name;
                let userAvatar = null;
 
                try {
                    userAvatar = weekData.user.avatar ? await getPresignedUrl(weekData.user.avatar) : null;
                } catch (error) {
                    userAvatar = null;
                }

                let weeklyRegularHoursUsed = 0;
                const WEEKLY_REGULAR_LIMIT = 40;

                for (const attendance of weekData.attendances) {
                    let projectLocation = "";
                    let serviceId = "";

                    projects.forEach(project => {
                        project.serviceProject.forEach(service => {
                            service.UserServiceProject.forEach(userService => {
                                const foundAttendance = userService.user_attendances.find(ua =>
                                    ua.check_in_time?.getTime() === attendance.check_in_time?.getTime() &&
                                    (ua.check_out_time?.getTime() === attendance.check_out_time?.getTime() ||
                                        (ua.check_out_time === null && attendance.check_out_time === null)) &&
                                    ua.user?.id === attendance.user?.id
                                );
                                if (foundAttendance) {
                                    projectLocation = project.location || project.client?.location || "";
                                    serviceId = service.id;
                                }
                            });
                        });
                    });

                    const displayProject = projectLocation || "The project was cancelled";
                    {
                        let dailyHours = 0;

                        if (attendance.check_out_time) {
                            const hours = calcularHorasTrabalhadas(
                                attendance.check_in_time.toISOString(),
                                attendance.check_out_time.toISOString(),
                                attendance.workStartTime,
                                attendance.workEndTime,
                                attendance.user.defaultBreakMinutes || 0
                            );
                            dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                        } else {
                            dailyHours = 0;
                        }

                        const hadOvertimePermission = attendance.isOvertime === true;
                        const hourlyRate = attendance.user.hourly_price || 0;

                        let attendancePrice = 0;
                        const remainingRegularHours = Math.max(0, WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed);
                        const regularHoursThisDay = Math.min(dailyHours, remainingRegularHours);
                        const potentialOvertimeHours = Math.max(0, dailyHours - regularHoursThisDay);

                        weeklyRegularHoursUsed += regularHoursThisDay;

                        if (hadOvertimePermission && potentialOvertimeHours > 0) {
                            attendancePrice = (regularHoursThisDay * hourlyRate) + (potentialOvertimeHours * hourlyRate * 1.5);
                        } else {
                            attendancePrice = dailyHours * hourlyRate;
                        }

                        if (!payrollMap.has(userId)) {
                            payrollMap.set(userId, {
                                userName: userName,
                                userAvatar: userAvatar,
                                servicesCount: new Set(),
                                total: 0,
                                workers: []
                            });
                        }

                        const payrollUser = payrollMap.get(userId);
                        if (serviceId) payrollUser.servicesCount.add(serviceId);
                        payrollUser.total += attendancePrice;
                        payrollUser.workers.push({
                            project: displayProject,
                            date: attendance.date,
                            in: attendance.check_in_time,
                            out: attendance.check_out_time,
                            total: parseFloat((dailyHours * hourlyRate).toFixed(2))
                        });
                    }
                }
            }

            const formattedPayroll = Array.from(payrollMap.values()).map(user => ({
                userName: user.userName,
                userAvatar: user.userAvatar,
                servicesCount: user.servicesCount.size,
                total: parseFloat(user.total.toFixed(2)),
                workers: user.workers.sort((a: any, b: any) => new Date(b.in).getTime() - new Date(a.in).getTime())
            })).sort((a, b) => a.userName.localeCompare(b.userName));

            return res.status(200).json({
                data: {
                    indicators,
                    projects: formattedProjects,
                    workers: formattedWorkers,
                    payroll: formattedPayroll
                }
            })
        } catch (error) {
            res.status(500).json({
                error: "Internal server error" + error
            })
        }
    }
}
