import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { returnPayLoad } from '../../config/returnPayLoad';
import dayjs from 'dayjs';
import { DateTime } from 'luxon';
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from '../../utils/calculaHoraExtra';
import { isMultiCompanyEnabled } from '../../helpers/featureToggle';
import { applyPaidShortGapsToAttendances, getPaidShortGapHours } from '../../utils/paidShortGaps';
import { applyEffectiveBreaksToAttendances } from '../../utils/attendanceBreaks';

function applyDashboardPaidShortGaps(projects: any[]) {
    const attendances = projects.flatMap(project =>
        (project.serviceProject || []).flatMap((serviceProject: any) =>
            (serviceProject.UserServiceProject || []).flatMap((userServiceProject: any) =>
                userServiceProject.user_attendances || []
            )
        )
    );

    applyPaidShortGapsToAttendances(attendances);
}

const validPeriods = [
    "thisYear",
    "thisQuarter",
    "last3Months",
    "lastMonth",
    "thisMonth",
    "last30Days",
    "allPeriod"
] as const;

type DashboardPeriod = typeof validPeriods[number];

const activeInvoiceFilter = {
    AND: [
        { OR: [{ cancel_invoice_edit: false }, { cancel_invoice_edit: null }] }
    ],
    status: { notIn: ['void'] }
};

function getDashboardDateBounds(period: DashboardPeriod, rangeEnd?: Date) {
    const { startDate, endDate } = getDateRange(period);

    return {
        startDate: period === 'allPeriod' ? undefined : dayjs(startDate).startOf('day').toDate(),
        endDate: dayjs(rangeEnd || endDate || new Date()).endOf('day').toDate()
    };
}

async function getTimeCardTotal(companyId: string, period: DashboardPeriod, rangeEnd?: Date) {
    const { startDate, endDate } = getDashboardDateBounds(period, rangeEnd);
    const checkInFilter: { gte?: Date; lte: Date } = { lte: endDate };
    if (startDate) checkInFilter.gte = startDate;

    const attendances = await prisma.userAttendance.findMany({
        where: {
            check_in_time: checkInFilter,
            AND: [
                {
                    OR: [
                        { check_out_time: { lte: endDate } },
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
                                            in: ['Pre-Start', 'In Progress', 'Final walkthrough', 'Finished']
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
            id: true,
            user_id: true,
            date: true,
            check_in_time: true,
            check_out_time: true,
            workStartTime: true,
            workEndTime: true,
            isOvertime: true,
            user: {
                select: {
                    id: true,
                    hourly_price: true,
                    defaultBreakMinutes: true,
                    manualBreakEnabled: true,
                    paidShortGapEnabled: true
                }
            },
            breakRecords: {
                orderBy: { startedAt: 'asc' }
            }
        }
    });

    applyEffectiveBreaksToAttendances(attendances as any[]);
    applyPaidShortGapsToAttendances(attendances as any[]);

    const weeklyAttendances = new Map<string, { attendances: any[] }>();
    attendances.forEach(attendance => {
        if (!attendance.check_in_time || !attendance.user) return;

        const weekStart = DateTime.fromJSDate(attendance.check_in_time).startOf('week').plus({ days: 1 });
        const weekKey = `${attendance.user.id}-${weekStart.toISODate()}`;
        const week = weeklyAttendances.get(weekKey) || { attendances: [] };
        week.attendances.push(attendance);
        weeklyAttendances.set(weekKey, week);
    });

    let totalPrice = 0;

    weeklyAttendances.forEach(week => {
        let weeklyRegularHoursUsed = 0;
        const sortedAttendances = [...week.attendances].sort(
            (first, second) => new Date(first.check_in_time).getTime() - new Date(second.check_in_time).getTime()
        );

        sortedAttendances.forEach(attendance => {
            if (!attendance.check_out_time || !attendance.user) return;

            const hours = calcularHorasTrabalhadas(
                attendance.check_in_time.toISOString(),
                attendance.check_out_time.toISOString(),
                attendance.workStartTime,
                attendance.workEndTime,
                attendance.user.defaultBreakMinutes || 0
            );
            const dailyHours = convertHHMMToDecimal(hours.normais)
                + convertHHMMToDecimal(hours.extras)
                + getPaidShortGapHours(attendance);
            const regularHours = Math.min(dailyHours, Math.max(0, 40 - weeklyRegularHoursUsed));
            const overtimeHours = Math.max(0, dailyHours - regularHours);
            const hourlyRate = Number(attendance.user.hourly_price || 0);

            weeklyRegularHoursUsed += regularHours;
            totalPrice += attendance.isOvertime === true && overtimeHours > 0
                ? (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5)
                : dailyHours * hourlyRate;
        });
    });

    return Number(totalPrice.toFixed(2));
}

async function validCompany(request: Request) {
    const authHeader = returnPayLoad(request)
    const { companyId } = request.query

    if (authHeader == null) return {
        status: 'error',
        message: 'Token not found'
    };
    const user = await prisma.user.findUnique({
        where: {
            id: authHeader.id
        },
    })
    if (!user) return {
        status: 'error',
        message: 'User not found'
    };
    const isMultiCompany = await isMultiCompanyEnabled()
    let response;
    if (isMultiCompany) {
        response = await prisma.company.findUnique({
            where: {
                id: String(companyId)
            }
        })
    } else {
        response = await prisma.company.findUnique({
            where: {
                id: String(user.company_id)
            }
        })
    }
    if (response) {
        return {
            status: 'success',
            response,

        }
    }

    return {
        status: 'error',
        message: 'Company not found'
    };
}

function getDateRange(periodType: string) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date | undefined;

    switch (periodType) {
        case "thisYear":
            startDate = new Date(now.getFullYear(), 0, 1);
            break;

        case "thisQuarter":
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            break;

        case "last3Months":
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 3);
            break;

        case "lastMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case "thisMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;

        case "last30Days":
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
            break;

        case "allPeriod":
            startDate = new Date(2020, 0, 1); // Não será usado, mas mantendo para compatibilidade
            break;

        default:
            startDate = new Date(now.getFullYear(), 0, 1);
    }

    return { startDate, endDate };
}

type SparklineBucket = {
    label: string;
    endDate: Date;
};

function getPeriodEndDate(period: DashboardPeriod, endDate?: Date) {
    if (endDate) {
        return dayjs(endDate).endOf('day');
    }

    if (period === "thisYear") {
        return dayjs().endOf('year');
    }

    return dayjs();
}

function buildSparklineBuckets(period: DashboardPeriod) {
    const bucketCount = period === "thisYear" || period === "allPeriod" ? 12 : 8;

    if (period === "thisYear") {
        const firstMonth = dayjs().startOf('year');

        return Array.from({ length: bucketCount }, (_, index) => {
            const bucketEnd = firstMonth.add(index, 'month').endOf('month');

            return {
                label: bucketEnd.format('MMM'),
                endDate: bucketEnd.toDate()
            };
        });
    }

    if (period === "allPeriod") {
        const currentMonth = dayjs().startOf('month');
        const firstBucketMonth = currentMonth.subtract(bucketCount - 1, 'month');

        return Array.from({ length: bucketCount }, (_, index) => {
            const bucketMonth = firstBucketMonth.add(index, 'month');
            const bucketEnd = index === bucketCount - 1 ? dayjs() : bucketMonth.endOf('month');

            return {
                label: bucketEnd.format('MMM'),
                endDate: bucketEnd.toDate()
            };
        });
    }

    const { startDate, endDate } = getDateRange(period);
    const rangeStart = dayjs(startDate);
    const rangeEnd = getPeriodEndDate(period, endDate);
    const rangeDuration = Math.max(rangeEnd.valueOf() - rangeStart.valueOf(), 1);

    return Array.from({ length: bucketCount }, (_, index) => {
        const bucketEnd = rangeStart.add(rangeDuration * ((index + 1) / bucketCount), 'millisecond');

        return {
            label: bucketEnd.format('MMM D'),
            endDate: bucketEnd.toDate()
        };
    });
}

function getCumulativeDateFilter(period: DashboardPeriod, bucket: SparklineBucket) {
    const dateFilter: any = {
        lte: bucket.endDate
    };

    if (period !== "allPeriod") {
        dateFilter.gte = getDateRange(period).startDate;
    }

    return dateFilter;
}

export class BusinessDashboardController {
    async dashboardCards(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);

            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = dayjs(endDate).endOf('day').toDate();
                }
            }

            const [
                estimates,
                projects,
                customers,
                employees,
                invoices,
                timeCards,
                inProgressProjects,
                preStartProjects,
                completedProjects,
                jobsSchedule
            ] = await Promise.all([
                // Total Estimates
                prisma.estimate.count({
                    where: {
                        project: {
                            company_id: valid.response?.id,
                            status_project: {
                                in: ["Pending", "Accepted"]
                            }
                        },
                        status: {
                            in: ["approved", "pending", "canceled"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        }),
                    }
                }),
                // Total Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: {
                            in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),

                prisma.client.count({
                    where: {
                        company_id: valid.response?.id
                    }
                }),
                // Total Employees
                prisma.user.count({
                    where: {
                        company_id: valid.response?.id,
                        isDisabled: false,
                        office: {
                            name: "Worker"
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // Total Invoices
                prisma.invoice.count({
                    where: {
                        companyId: valid.response?.id,
                        ...activeInvoiceFilter,
                        ...(Object.keys(dateFilter).length > 0 && {
                            createdAt: dateFilter
                        })
                    }
                }),
                // Total payroll cost represented by time cards
                getTimeCardTotal(valid.response!.id, period as DashboardPeriod),
                // In Progress Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "In Progress",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // Pre-Start Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "Pre-Start",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // Completed Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "Finished",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),

                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        start_date: {
                            not: null
                        },
                        deadline: {
                            not: null
                        },
                        status_project: {
                            not: "Finished"
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                })
            ]);

            return res.json({
                estimates,
                projects,
                customers: Number(customers),
                employees,
                invoices,
                timeCards,
                inProgressProjects,
                preStartProjects,
                completedProjects,
                jobsSchedule
            });
        } catch (error) {
            console.error("Error in dashboardCards:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async cardSparklines(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);

            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            if (!(validPeriods as readonly string[]).includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`,
                    validPeriods
                });
            }

            const selectedPeriod = period as DashboardPeriod;
            const buckets = buildSparklineBuckets(selectedPeriod);
            const companyId = valid.response?.id;

            const [
                estimates,
                projects,
                customers,
                employees,
                invoices,
                timeCards
            ] = await Promise.all([
                Promise.all(buckets.map(async (bucket) => ({
                    label: bucket.label,
                    value: await prisma.estimate.count({
                        where: {
                            project: {
                                company_id: companyId,
                                status_project: {
                                    in: ["Pending", "Accepted"]
                                }
                            },
                            status: {
                                in: ["approved", "pending", "canceled"]
                            },
                            date_creation: getCumulativeDateFilter(selectedPeriod, bucket)
                        }
                    })
                }))),
                Promise.all(buckets.map(async (bucket) => ({
                    label: bucket.label,
                    value: await prisma.project.count({
                        where: {
                            company_id: companyId,
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                            },
                            date_creation: getCumulativeDateFilter(selectedPeriod, bucket)
                        }
                    })
                }))),
                Promise.all(buckets.map(async (bucket) => ({
                    label: bucket.label,
                    value: await prisma.client.count({
                        where: {
                            company_id: companyId,
                            date_creation: getCumulativeDateFilter(selectedPeriod, bucket)
                        }
                    })
                }))),
                Promise.all(buckets.map(async (bucket) => ({
                    label: bucket.label,
                    value: await prisma.user.count({
                        where: {
                            company_id: companyId,
                            isDisabled: false,
                            office: {
                                name: "Worker"
                            },
                            date_creation: getCumulativeDateFilter(selectedPeriod, bucket)
                        }
                    })
                }))),
                Promise.all(buckets.map(async (bucket) => ({
                    label: bucket.label,
                    value: await prisma.invoice.count({
                        where: {
                            companyId,
                            ...activeInvoiceFilter,
                            createdAt: getCumulativeDateFilter(selectedPeriod, bucket)
                        }
                    })
                }))),
                Promise.all(buckets.map(async (bucket) => ({
                    label: bucket.label,
                    value: await getTimeCardTotal(companyId!, selectedPeriod, bucket.endDate)
                })))
            ]);

            return res.json({
                estimates,
                projects,
                customers,
                employees,
                invoices,
                timeCards
            });
        } catch (error) {
            console.error("Error in cardSparklines:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async salesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const selectedPeriod = period as DashboardPeriod;
            const { startDate, endDate } = getDashboardDateBounds(selectedPeriod);

            const dateFilter: any = {};
            if (selectedPeriod !== "allPeriod") {
                dateFilter.gte = startDate;
                dateFilter.lte = endDate;
            }

            const invoices = await prisma.invoice.findMany({
                where: {
                    companyId: valid.response?.id,
                    ...activeInvoiceFilter,
                    status: 'paid',
                    ...(Object.keys(dateFilter).length > 0 && {
                        createdAt: dateFilter
                    })
                },
                select: {
                    createdAt: true,
                    totalAmount: true
                }
            });

            const salesByMonth = invoices.reduce<Record<string, number>>((acc, invoice) => {
                const monthKey = dayjs(invoice.createdAt).format('YYYY-MM');
                acc[monthKey] = (acc[monthKey] || 0) + Number(invoice.totalAmount || 0);
                return acc;
            }, {});

            const salesData = Object.entries(salesByMonth)
                .sort(([firstMonth], [secondMonth]) => firstMonth.localeCompare(secondMonth))
                .map(([monthKey, value]) => ({
                    month: dayjs(`${monthKey}-01`).format('MMM YYYY'),
                    monthKey,
                    value: Number(value.toFixed(2))
                }));

            return res.json(salesData);
        } catch (error) {
            console.error("Error in salesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async salesChartDetails(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { monthKey, period = 'thisYear' } = req.query;
            if (!(validPeriods as readonly string[]).includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(', ')}`
                });
            }

            if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) {
                return res.status(400).json({ error: 'monthKey must use YYYY-MM format' });
            }

            const monthStart = dayjs(`${monthKey}-01`).startOf('month');
            if (!monthStart.isValid()) {
                return res.status(400).json({ error: 'Invalid monthKey' });
            }

            const selectedPeriod = period as DashboardPeriod;
            const { startDate: periodStart, endDate: periodEnd } = getDashboardDateBounds(selectedPeriod);
            const rangeStart = periodStart && dayjs(periodStart).isAfter(monthStart)
                ? dayjs(periodStart)
                : monthStart;
            const monthEnd = monthStart.endOf('month');
            const rangeEnd = dayjs(periodEnd).isBefore(monthEnd) ? dayjs(periodEnd) : monthEnd;

            if (rangeStart.isAfter(rangeEnd)) {
                return res.json({ invoices: [], month: monthStart.format('MMM YYYY'), monthKey, total: 0 });
            }

            const invoices = await prisma.invoice.findMany({
                where: {
                    companyId: valid.response?.id,
                    ...activeInvoiceFilter,
                    status: 'paid',
                    createdAt: {
                        gte: rangeStart.toDate(),
                        lte: rangeEnd.toDate()
                    }
                },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    externalInvoiceId: true,
                    invoiceType: true,
                    projectId: true,
                    status: true,
                    totalAmount: true,
                    createdAt: true,
                    project: {
                        select: {
                            contract_number: true,
                            client: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });
            const normalizedInvoices = invoices.map(invoice => ({
                ...invoice,
                totalAmount: Number(invoice.totalAmount)
            }));
            const total = normalizedInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);

            return res.json({
                invoices: normalizedInvoices,
                month: monthStart.format('MMM YYYY'),
                monthKey,
                total: Number(total.toFixed(2))
            });
        } catch (error) {
            console.error('Error in salesChartDetails:', error);
            return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
        }
    }

    async expensesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const expenses = await prisma.costProject.findMany({
                where: {
                    ServiceProject: {
                        Project: {
                            company_id: valid.response?.id
                        }
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                select: {
                    price: true,
                    date_creation: true
                }
            });

            const expensesByMonth = expenses.reduce<Record<string, number>>((acc, expense) => {
                const monthYear = dayjs(expense.date_creation).format('MMM YYYY');
                acc[monthYear] = (acc[monthYear] || 0) + Number(expense.price || 0);
                return acc;
            }, {});

            const expensesData = Object.entries(expensesByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, value]) => ({
                    month,
                    value: Number(value.toFixed(2))
                }));

            return res.json(expensesData);
        } catch (error) {
            console.error("Error in expensesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }
    async expenses(req: Request, res: Response) {
        const valid = await validCompany(req);
        if (valid.status === 'error') {
            return res.status(404).json({ error: valid.message });
        }

        const { period = "thisYear" } = req.query;

        const validPeriods = [
            "thisYear",
            "thisQuarter",
            "last3Months",
            "lastMonth",
            "thisMonth",
            "last30Days",
            "allPeriod"
        ];

        if (!validPeriods.includes(period as string)) {
            return res.status(400).json({
                error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
            });
        }

        const { startDate, endDate } = getDateRange(period as string);

        const dateFilter: any = {};
        if (period !== "allPeriod") {
            dateFilter.gte = startDate;
            if (endDate) {
                dateFilter.lte = endDate;
            }
        }
        try {
            const costProject = await prisma.costProject.findMany({
                select: {
                    price: true,
                    material_name: true,
                },
                where: {
                    ServiceProject: {
                        Project: {
                            company_id: valid.response?.id
                        }
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
            });
            // Contar projetos com status específicos dentro do período
            const projects = await prisma.project.findMany({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                            },
                        },
                        {
                            company_id: valid.response?.id,
                        },
                        Object.keys(dateFilter).length > 0 ? {
                            date_creation: dateFilter
                        } : {}
                    ]
                },
                include: {
                    client: {
                        select: {
                            name: true,
                            location: true,
                            city_and_state: true,
                        }
                    },
                    workedHours: {
                        select: {
                            id: true,
                            project_id: true,
                            name_user: true,
                            amount_of_hours: true,
                            hourly_price: true,
                            date_creation: true,
                            start_date: true,
                            end_date: true,
                            type_price: true,
                            fixed_price: true,
                            subcontractor_id: true,
                        }
                    },
                    serviceProject: {
                        select: {
                            id: true,
                            name: true,
                            UserServiceProject: {
                                select: {
                                    user_attendances: {
                                        include: {
                                            user: {
                                                select: {
                                                    name: true,
                                                    hourly_price: true,
                                                    paidShortGapEnabled: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                    }
                },
            })
            applyDashboardPaidShortGaps(projects);

            // Formatar e calcular horas trabalhadas
            const formattedResult = projects.flatMap(i => i.serviceProject
                .filter(s => s.UserServiceProject.length > 0) // Filtra para garantir que há dados em UserServiceProject
                .flatMap(s => s.UserServiceProject
                    .filter(user => user.user_attendances.length > 0) // Filtra para garantir que há dados em user_attendances
                    .flatMap(user => user.user_attendances
                        .map(x => {
                            let hoursWorked = 0;
                            if (x.check_out_time && x.check_in_time) {
                                hoursWorked = dayjs(x.check_out_time).diff(
                                    dayjs(x.check_in_time),
                                    "hour",
                                    true
                                );
                            }
                            const roundedHours = parseFloat(hoursWorked.toFixed(2));
                            let regularHours = 0;
                            let overtimeHours = 0;

                            if (x.check_out_time && x.check_in_time) {
                                const hours = calcularHorasTrabalhadas(
                                    x.check_in_time.toISOString(),
                                    x.check_out_time.toISOString(),
                                    x.workStartTime,
                                    x.workEndTime,
                                );
                                regularHours = convertHHMMToDecimal(hours.normais) + getPaidShortGapHours(x);
                                overtimeHours = convertHHMMToDecimal(hours.extras);
                            }

                            const calculatedPrice = x.user.hourly_price
                                ? (regularHours * x.user.hourly_price) + (overtimeHours * x.user.hourly_price * 1.5)
                                : 0;
                            return ({
                                ...x,
                                hours_worked: roundedHours,
                                price: calculatedPrice
                            })
                        })
                    )
                )
            );

            const employeeCost = projects.flatMap(i => i.workedHours
                .filter(item => {
                    if (item.subcontractor_id) return false;

                    return true;
                })
                .map(item => ({
                    id: item.id,
                    price: item.type_price === "fixed"
                        ? Number(item.fixed_price || 0)
                        : Number(item.amount_of_hours || 0) * Number(item.hourly_price || 0)
                }))
            );

            const subcontractorCost = projects.flatMap(i => i.workedHours
                .filter(item => {
                    return !!item.subcontractor_id;
                })
                .map(item => ({
                    id: item.id,
                    price: item.type_price === "fixed"
                        ? Number(item.fixed_price || 0)
                        : (item.amount_of_hours
                            ? Number(item.amount_of_hours) * Number(item.hourly_price || 0)
                            : Number(item.hourly_price || 0))
                }))
            );

            const costProjectTotal = parseFloat(
                costProject
                    .reduce((sum, expense) => sum + Number(expense.price), 0)
                    .toFixed(2)
            );

            const formattedResultTotal = parseFloat(
                formattedResult
                    .reduce((acc, i) => acc + (i.price || 0), 0)
                    .toFixed(2)
            );

            const employeeCostTotal = parseFloat(
                employeeCost
                    .reduce((sum, expense) => sum + Number(expense.price), 0)
                    .toFixed(2)
            );

            const subcontractorCostTotal = parseFloat(
                subcontractorCost
                    .reduce((sum, expense) => sum + Number(expense.price), 0)
                    .toFixed(2)
            );

            const totalEmployeeCost = parseFloat(
                (formattedResultTotal + employeeCostTotal).toFixed(2)
            );

            const formattedExpenses = [{
                label: 'Material cost',
                value: costProjectTotal,
                color: "#DC2626",
            }, {
                label: 'Employee cost',
                value: totalEmployeeCost,
                color: "#EA580C",
            }, {
                label: 'Subcontractor cost',
                value: subcontractorCostTotal,
                color: "#D97706",
            }];

            return res.json(formattedExpenses);
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async cashflowChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const [invoices, expenses] = await Promise.all([
                prisma.invoice.findMany({
                    where: {
                        companyId: valid.response?.id,
                        status: 'paid',
                        ...(Object.keys(dateFilter).length > 0 && {
                            createdAt: dateFilter
                        })
                    },
                    select: {
                        totalAmount: true,
                        createdAt: true,
                        id: true
                    }
                }),
                prisma.costProject.findMany({
                    where: {
                        ServiceProject: {
                            Project: {
                                company_id: valid.response?.id
                            }
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    },
                    select: {
                        price: true,
                        date_creation: true
                    }
                })
            ]);

            const cashflowByMonth: Record<string, { income: number; expenses: number; invoiceIds: string[] }> = {};

            // Process income
            invoices.forEach(invoice => {
                const monthYear = dayjs(invoice.createdAt).format('MMM YYYY');
                if (!cashflowByMonth[monthYear]) {
                    cashflowByMonth[monthYear] = { income: 0, expenses: 0, invoiceIds: [] };
                }
                cashflowByMonth[monthYear].income += Number(invoice.totalAmount || 0);
                cashflowByMonth[monthYear].invoiceIds.push(invoice.id);
            });

            // Process expenses
            expenses.forEach(expense => {
                const monthYear = dayjs(expense.date_creation).format('MMM YYYY');
                if (!cashflowByMonth[monthYear]) {
                    cashflowByMonth[monthYear] = { income: 0, expenses: 0, invoiceIds: [] };
                }
                cashflowByMonth[monthYear].expenses += Number(expense.price || 0);
            });

            const cashflowData = Object.entries(cashflowByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, data]) => ({
                    month,
                    income: Number(data.income.toFixed(2)),
                    expenses: Number(data.expenses.toFixed(2)),
                    invoiceIds: data.invoiceIds
                }));

            return res.json(cashflowData);
        } catch (error) {
            console.error("Error in cashflowChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async invoicesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const now = new Date();
            const invoices = await prisma.invoice.findMany({
                where: {
                    companyId: valid.response?.id,
                    ...(Object.keys(dateFilter).length > 0 && {
                        createdAt: dateFilter
                    })
                },
                select: {
                    totalAmount: true,
                    status: true,
                    dueDate: true,
                    createdAt: true
                }
            });

            const invoicesByMonth = invoices.reduce<Record<string, { paid: number; notDueYet: number; overdue: number }>>(
                (acc, invoice) => {
                    const monthYear = dayjs(invoice.createdAt).format('MMM YYYY');
                    if (!acc[monthYear]) {
                        acc[monthYear] = { paid: 0, notDueYet: 0, overdue: 0 };
                    }

                    const amount = Number(invoice.totalAmount || 0);
                    if (invoice.status === 'paid') {
                        acc[monthYear].paid += amount;
                    } else if (invoice.dueDate && new Date(invoice.dueDate) < now) {
                        acc[monthYear].overdue += amount;
                    } else {
                        acc[monthYear].notDueYet += amount;
                    }

                    return acc;
                },
                {}
            );

            const invoicesData = Object.entries(invoicesByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, data]) => ({
                    month,
                    paid: Number(data.paid.toFixed(2)),
                    notDueYet: Number(data.notDueYet.toFixed(2)),
                    overdue: Number(data.overdue.toFixed(2))
                }));

            return res.json(invoicesData);
        } catch (error) {
            console.error("Error in invoicesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async projectsChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear", subcontractorId } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            // Se houver subcontractorId, filtrar apenas projetos desse subcontractor
            let projectIds: string[] | undefined;
            if (subcontractorId) {
                const workedHours = await prisma.workedhours.findMany({
                    where: {
                        subcontractor_id: subcontractorId as string,
                        amount_of_hours: null,
                    },
                    select: {
                        project_id: true,
                    },
                    distinct: ['project_id'],
                });
                projectIds = workedHours.map((wh: any) => wh.project_id).filter(Boolean);

                if (projectIds.length === 0) {
                    return res.json([]);
                }
            }

            const projects = await prisma.project.groupBy({
                by: ['status_project'],
                where: {
                    company_id: valid.response?.id,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                    },
                    ...(projectIds && { id: { in: projectIds } }),
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                _count: true
            });

            const total = projects.reduce((sum, p) => sum + p._count, 0);
            const chartData = projects.map(p => ({
                label: p.status_project,
                value: p._count,
                percentage: (p._count / total) * 100
            }));

            return res.json(chartData);
        } catch (error) {
            console.error("Error in projectsChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async estimatesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const [pendingEstimates, acceptedEstimates, deniedEstimates] = await Promise.all([

                prisma.estimate.count({
                    where: {
                        project: {
                            company_id: valid.response?.id,
                            status_project: {
                                in: ["Pending", "Accepted"]
                            }
                        },
                        status: {
                            in: ["pending"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        }),
                    }
                }),
                prisma.estimate.count({
                    where: {
                        project: {
                            company_id: valid.response?.id,
                            status_project: {
                                in: ["Pending", "Accepted"]
                            }
                        },
                        status: {
                            in: ["approved"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                prisma.estimate.count({
                    where: {
                        project: {
                            company_id: valid.response?.id,
                            status_project: {
                                in: ["Pending", "Accepted"]
                            }
                        },
                        status: {
                            in: ["canceled"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                })
            ]);

            const chartData = [
                { label: "Pending", value: pendingEstimates },
                { label: "Accepted", value: acceptedEstimates },
                { label: "Denied", value: deniedEstimates }
            ];

            return res.json(chartData);
        } catch (error) {
            console.error("Error in estimatesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }
} 
