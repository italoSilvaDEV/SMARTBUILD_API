export interface ScheduleChange {
    label: string;
    oldValue?: string;
    newValue: string;
}

export const jobScheduleGlobalTemplate = (
    recipientName: string,
    projectName: string,
    contractNumber: string | number,
    location: string,
    status: 'UPDATED' | 'CANCELLED' | 'ASSIGNED' | 'REMOVED',
    changes: ScheduleChange[] = [],
    logo: string = '',
    companyName: string = '',
    phone?: string,
    email?: string,
    startDate?: string,
    deadline?: string,
    description?: string
) => {
    const statusConfig = {
        UPDATED: { color: '#3b82f6', text: 'Schedule Updated', icon: '📅' },
        CANCELLED: { color: '#ef4444', text: 'Schedule Cancelled', icon: '❌' },
        ASSIGNED: { color: '#10b981', text: 'New Assignment', icon: '✅' },
        REMOVED: { color: '#f59e0b', text: 'Assignment Removed', icon: '👤' },
    };

    const config = statusConfig[status];

    const formattedDate = (date?: string) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const changesHtml = changes.length > 0 ? `
        <div style="margin-top: 24px; padding: 20px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
            <p style="font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">Changes Details</p>
            ${changes.map(change => `
                <div style="margin-bottom: 12px;">
                    <p style="font-size: 13px; color: #6b7280; margin: 0 0 4px 0;">${change.label}</p>
                    <p style="font-size: 14px; color: #111827; margin: 0;">
                        ${change.oldValue ? `<span style="text-decoration: line-through; color: #9ca3af;">${change.oldValue}</span> <span style="color: #3b82f6; margin: 0 8px;">→</span>` : ''}
                        <strong>${change.newValue}</strong>
                    </p>
                </div>
            `).join('')}
        </div>
    ` : '';

    const detailsHtml = status !== 'CANCELLED' ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <tr>
                <td style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; font-weight: 600;">Project / Service</p>
                    <p style="font-size: 15px; color: #111827; margin: 0; font-weight: 500;">${projectName}</p>
                </td>
            </tr>
            <tr>
                <td style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; font-weight: 600;">Location</p>
                    <p style="font-size: 14px; color: #374151; margin: 0;">${location}</p>
                </td>
            </tr>
            <tr>
                <td style="padding: 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td width="50%" style="padding: 16px; border-right: 1px solid #e5e7eb;">
                                <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; font-weight: 600;">Start Date</p>
                                <p style="font-size: 14px; color: #059669; margin: 0; font-weight: 600;">${formattedDate(startDate)}</p>
                            </td>
                            <td width="50%" style="padding: 16px;">
                                <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; font-weight: 600;">Deadline</p>
                                <p style="font-size: 14px; color: #dc2626; margin: 0; font-weight: 600;">${formattedDate(deadline)}</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', -apple-system, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .header { padding: 32px; text-align: center; }
        .content { padding: 0 32px 32px; }
        .footer { padding: 32px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb; }
        .badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            ${logo ? `<img src="${logo}" alt="${companyName}" style="max-width: 140px; margin-bottom: 24px;">` : ''}
            <div class="badge" style="background-color: ${config.color}20; color: ${config.color};">
                ${config.icon} ${config.text}
            </div>
            <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">${config.text}</h1>
            <p style="font-size: 14px; color: #6b7280; margin-top: 8px;">Contract #${contractNumber}</p>
        </div>
        
        <div class="content">
            <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0;">Dear ${recipientName},</p>
            <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 12px 0 0 0;">
                ${status === 'CANCELLED' 
                    ? `This email is to inform you that the schedule for <strong>${projectName}</strong> has been cancelled.` 
                    : status === 'REMOVED'
                    ? `You have been removed from the assignment for <strong>${projectName}</strong>.`
                    : status === 'ASSIGNED'
                    ? `You have been assigned to <strong>${projectName}</strong>. Please find the details below.`
                    : `We are writing to inform you about updates to the schedule for <strong>${projectName}</strong>.`
                }
            </p>

            ${changesHtml}
            ${detailsHtml}

            ${description ? `
                <div style="margin-top: 24px;">
                    <p style="font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 8px 0;">Description</p>
                    <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">${description}</p>
                </div>
            ` : ''}

            <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin-top: 32px; text-align: center;">
                If you have any questions, please don't hesitate to contact us.
            </p>
        </div>

        <div class="footer">
            <p style="font-size: 15px; font-weight: 600; color: #111827; margin: 0;">${companyName}</p>
            ${phone ? `<p style="font-size: 14px; color: #6b7280; margin: 4px 0 0 0;">${phone}</p>` : ''}
            ${email ? `<p style="font-size: 14px; color: #6b7280; margin: 4px 0 0 0;"><a href="mailto:${email}" style="color: #3b82f6; text-decoration: none;">${email}</a></p>` : ''}
            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">This is an automated message. Please do not reply directly to this email.</p>
        </div>
    </div>
</body>
</html>
    `;
};
