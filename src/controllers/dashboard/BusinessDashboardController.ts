import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { returnPayLoad } from '../../config/returnPayLoad';
import dayjs from 'dayjs';
import { DateTime } from 'luxon';
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from '../../utils/calculaHoraExtra';
import { isMultiCompanyEnabled } from '../../helpers/featureToggle';
import {
    applyPaidShortGapsToAttendances,
    getPaidShortGapEligibleAt,
    getPaidShortGapHours
} from '../../utils/paidShortGaps';
import { applyEffectiveBreaksToAttendances } from '../../utils/attendanceBreaks';
import {
    getSeriesTotal,
    mapCumulativeCountRow,
    normalizeDashboardNumber
} from '../../utils/mobileDashboardSummary';

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

function calculateTimeCardTotal(attendances: any[]) {
    applyEffectiveBreaksToAttendances(attendances);
    applyPaidShortGapsToAttendances(attendances);

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

    return calculateTimeCardTotal(attendances as any[]);
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

type MobileDashboardCountSeries = {
    customers: Array<{ label: string; value: number }>;
    employees: Array<{ label: string; value: number }>;
    estimates: Array<{ label: string; value: number }>;
    invoices: Array<{ label: string; value: number }>;
    projects: Array<{ label: string; value: number }>;
};

async function queryCumulativeCounts({
    buckets,
    dateColumn,
    from,
    period,
    where
}: {
    buckets: SparklineBucket[];
    dateColumn: Prisma.Sql;
    from: Prisma.Sql;
    period: DashboardPeriod;
    where: Prisma.Sql;
}) {
    if (buckets.length === 0) return [];

    const expressions = buckets.map((bucket, index) => Prisma.sql`
        COALESCE(SUM(CASE WHEN ${dateColumn} <= ${bucket.endDate} THEN 1 ELSE 0 END), 0)
        AS ${Prisma.raw(`bucket${index}`)}
    `);
    const periodStart = period === "allPeriod"
        ? null
        : getDateRange(period).startDate;
    const maximumEndDate = buckets[buckets.length - 1].endDate;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT ${Prisma.join(expressions)}
        ${from}
        WHERE ${where}
          AND ${dateColumn} <= ${maximumEndDate}
          ${periodStart ? Prisma.sql`AND ${dateColumn} >= ${periodStart}` : Prisma.empty}
    `);

    return mapCumulativeCountRow(rows[0], buckets);
}

async function getMobileCountSeries(
    companyId: string,
    period: DashboardPeriod,
    buckets: SparklineBucket[]
): Promise<MobileDashboardCountSeries> {
    const [estimates, projects, customers, employees, invoices] = await Promise.all([
        queryCumulativeCounts({
            buckets,
            dateColumn: Prisma.sql`e.date_creation`,
            from: Prisma.sql`FROM \`Estimate\` e INNER JOIN \`project\` p ON p.id = e.projectId`,
            period,
            where: Prisma.sql`
                p.company_id = ${companyId}
                AND p.status_project IN ('Pending', 'Accepted')
                AND e.status IN ('approved', 'pending', 'canceled')
            `
        }),
        queryCumulativeCounts({
            buckets,
            dateColumn: Prisma.sql`p.date_creation`,
            from: Prisma.sql`FROM \`project\` p`,
            period,
            where: Prisma.sql`
                p.company_id = ${companyId}
                AND p.status_project IN ('Pre-Start', 'In Progress', 'Final walkthrough', 'Finished')
            `
        }),
        queryCumulativeCounts({
            buckets,
            dateColumn: Prisma.sql`c.date_creation`,
            from: Prisma.sql`FROM \`Client\` c`,
            period,
            where: Prisma.sql`c.company_id = ${companyId}`
        }),
        queryCumulativeCounts({
            buckets,
            dateColumn: Prisma.sql`u.date_creation`,
            from: Prisma.sql`FROM \`User\` u INNER JOIN \`Office\` o ON o.id = u.office_id`,
            period,
            where: Prisma.sql`
                u.company_id = ${companyId}
                AND u.isDisabled = false
                AND o.name = 'Worker'
            `
        }),
        queryCumulativeCounts({
            buckets,
            dateColumn: Prisma.sql`i.createdAt`,
            from: Prisma.sql`FROM \`Invoice\` i`,
            period,
            where: Prisma.sql`
                i.companyId = ${companyId}
                AND (i.cancel_invoice_edit = false OR i.cancel_invoice_edit IS NULL)
                AND i.status <> 'void'
            `
        })
    ]);

    return { customers, employees, estimates, invoices, projects };
}

function findDashboardAttendances(
    companyId: string,
    period: DashboardPeriod,
    maximumEndDate: Date
) {
    const checkInFilter: { gte?: Date; lte: Date } = { lte: maximumEndDate };
    if (period !== "allPeriod") {
        checkInFilter.gte = dayjs(getDateRange(period).startDate).startOf('day').toDate();
    }

    return prisma.userAttendance.findMany({
        where: {
            check_in_time: checkInFilter,
            AND: [
                {
                    OR: [
                        { check_out_time: { lte: maximumEndDate } },
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
                orderBy: { startedAt: 'asc' as const }
            }
        }
    });
}

async function getMobileTimeCardSeries(
    companyId: string,
    period: DashboardPeriod,
    buckets: SparklineBucket[]
) {
    if (buckets.length === 0) return [];

    // getTimeCardTotal historically treats every bucket boundary as the end of
    // that calendar day. Preserve that contract while loading the attendance
    // rows only once for the complete series.
    const bucketEndDates = buckets.map(bucket => dayjs(bucket.endDate).endOf('day').toDate());
    const maximumEndDate = bucketEndDates[bucketEndDates.length - 1];
    const attendances = await findDashboardAttendances(companyId, period, maximumEndDate);

    applyEffectiveBreaksToAttendances(attendances as any[]);
    applyPaidShortGapsToAttendances(attendances as any[]);

    const weeklyAttendances = new Map<string, Array<{
        attendance: typeof attendances[number];
        baseDailyHours: number;
        paidGapEligibleAt: Date | null;
        paidGapHours: number;
    }>>();

    attendances.forEach(attendance => {
        if (!attendance.check_in_time || !attendance.user) return;

        let baseDailyHours = 0;
        if (attendance.check_out_time) {
            const hours = calcularHorasTrabalhadas(
                attendance.check_in_time.toISOString(),
                attendance.check_out_time.toISOString(),
                attendance.workStartTime,
                attendance.workEndTime,
                attendance.user.defaultBreakMinutes || 0
            );
            baseDailyHours = convertHHMMToDecimal(hours.normais)
                + convertHHMMToDecimal(hours.extras);
        }

        const weekStart = DateTime.fromJSDate(attendance.check_in_time).startOf('week').plus({ days: 1 });
        const weekKey = `${attendance.user.id}-${weekStart.toISODate()}`;
        const week = weeklyAttendances.get(weekKey) || [];
        week.push({
            attendance,
            baseDailyHours,
            paidGapEligibleAt: getPaidShortGapEligibleAt(attendance),
            paidGapHours: getPaidShortGapHours(attendance),
        });
        weeklyAttendances.set(weekKey, week);
    });

    weeklyAttendances.forEach(week => {
        week.sort(
            (first, second) => first.attendance.check_in_time.getTime()
                - second.attendance.check_in_time.getTime()
        );
    });

    return buckets.map((bucket, bucketIndex) => {
        const bucketEndDate = bucketEndDates[bucketIndex];
        let totalPrice = 0;

        weeklyAttendances.forEach(week => {
            let weeklyRegularHoursUsed = 0;

            week.forEach(metric => {
                const { attendance } = metric;
                if (
                    attendance.check_in_time > bucketEndDate
                    || (attendance.check_out_time && attendance.check_out_time > bucketEndDate)
                    || !attendance.check_out_time
                    || !attendance.user
                ) {
                    return;
                }

                const paidGapHours = metric.paidGapEligibleAt
                    && metric.paidGapEligibleAt <= bucketEndDate
                    ? metric.paidGapHours
                    : 0;
                const dailyHours = metric.baseDailyHours + paidGapHours;
                const regularHours = Math.min(dailyHours, Math.max(0, 40 - weeklyRegularHoursUsed));
                const overtimeHours = Math.max(0, dailyHours - regularHours);
                const hourlyRate = Number(attendance.user.hourly_price || 0);

                weeklyRegularHoursUsed += regularHours;
                totalPrice += attendance.isOvertime === true && overtimeHours > 0
                    ? (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5)
                    : dailyHours * hourlyRate;
            });
        });

        return {
            label: bucket.label,
            value: Number(totalPrice.toFixed(2))
        };
    });
}

async function getMobileSalesPerformance(companyId: string, period: DashboardPeriod) {
    const { startDate, endDate } = getDashboardDateBounds(period);
    const rows = await prisma.$queryRaw<Array<{ monthKey: string; value: unknown }>>(Prisma.sql`
        SELECT DATE_FORMAT(i.createdAt, '%Y-%m') AS monthKey,
               COALESCE(SUM(i.totalAmount), 0) AS value
        FROM \`Invoice\` i
        WHERE i.companyId = ${companyId}
          AND (i.cancel_invoice_edit = false OR i.cancel_invoice_edit IS NULL)
          AND i.status = 'paid'
          ${startDate ? Prisma.sql`AND i.createdAt >= ${startDate}` : Prisma.empty}
          AND i.createdAt <= ${endDate}
        GROUP BY DATE_FORMAT(i.createdAt, '%Y-%m')
        ORDER BY monthKey ASC
    `);

    return rows.map(row => ({
        month: dayjs(`${row.monthKey}-01`).format('MMM YYYY'),
        monthKey: row.monthKey,
        value: Number(normalizeDashboardNumber(row.value).toFixed(2))
    }));
}

export class BusinessDashboardController {
    async mobileSummary(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error' || !valid.response?.id) {
                return res.status(404).json({ error: valid.message });
            }

            const period = String(req.query.period || "thisYear");
            if (!(validPeriods as readonly string[]).includes(period)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const selectedPeriod = period as DashboardPeriod;
            const companyId = valid.response.id;
            const buckets = buildSparklineBuckets(selectedPeriod);
            const [countSeries, timeCards, projectsOverview, salesPerformance, customerTotal] = await Promise.all([
                getMobileCountSeries(companyId, selectedPeriod, buckets),
                getMobileTimeCardSeries(companyId, selectedPeriod, buckets),
                prisma.project.groupBy({
                    by: ['status_project'],
                    where: {
                        company_id: companyId,
                        status_project: {
                            in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                        },
                        ...(selectedPeriod !== "allPeriod" && {
                            date_creation: {
                                gte: getDateRange(selectedPeriod).startDate,
                                lte: getDateRange(selectedPeriod).endDate
                                    ? dayjs(getDateRange(selectedPeriod).endDate).endOf('day').toDate()
                                    : undefined
                            }
                        })
                    },
                    _count: true
                }),
                getMobileSalesPerformance(companyId, selectedPeriod),
                prisma.client.count({ where: { company_id: companyId } })
            ]);

            const projectOverviewTotal = projectsOverview.reduce((sum, project) => sum + project._count, 0);
            const projectsOverviewResponse = projectsOverview.map(project => ({
                label: project.status_project,
                value: project._count,
                percentage: projectOverviewTotal > 0
                    ? (project._count / projectOverviewTotal) * 100
                    : 0
            }));

            return res.json({
                cards: {
                    customers: customerTotal,
                    employees: getSeriesTotal(countSeries.employees),
                    estimates: getSeriesTotal(countSeries.estimates),
                    invoices: getSeriesTotal(countSeries.invoices),
                    projects: getSeriesTotal(countSeries.projects),
                    timeCards: getSeriesTotal(timeCards)
                },
                projectsOverview: projectsOverviewResponse,
                salesPerformance,
                sparklines: {
                    ...countSeries,
                    timeCards
                }
            });
        } catch (error) {
            console.error("Error in mobileSummary:", error);
            return res.status(500).json({
                error: error instanceof Error ? error.message : "Internal server error"
            });
        }
    }

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
                countSeries,
                timeCards
            ] = await Promise.all([
                getMobileCountSeries(companyId!, selectedPeriod, buckets),
                getMobileTimeCardSeries(companyId!, selectedPeriod, buckets)
            ]);

            return res.json({
                ...countSeries,
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
