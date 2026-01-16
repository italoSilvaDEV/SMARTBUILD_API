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
        UPDATED: { color: '#1E90FF', text: 'Schedule Updated', badge: 'UPDATED' },
        CANCELLED: { color: '#D92D20', text: 'Schedule Cancelled', badge: 'CANCELLED' },
        ASSIGNED: { color: '#1E9B5C', text: 'New Assignment', badge: 'ASSIGNED' },
        REMOVED: { color: '#F79009', text: 'Assignment Removed', badge: 'REMOVED' },
    };

    const config = statusConfig[status];

    const formattedDate = (date?: string) => {
        if (!date) return 'Not set';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) + ' (' + new Date(date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) + ')';
    };

    const changesHtml = changes.length > 0 ? `
        <!-- Changes Box -->
        <tr>
            <td class="content-padding" style="padding:0 24px 32px;">
                <div style="background-color:rgba(18,18,18,0.03);padding:24px;border-radius:0;border-left:4px solid #A6855C;">
                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0 0 16px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                        What has changed:
                    </p>
                    ${changes.map(change => `
                        <div style="margin-bottom:12px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B6B6B;margin:0 0 4px 0;">${change.label}</p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;line-height:1.5;">
                                ${change.oldValue ? `<span style="text-decoration:line-through;color:#D92D20;font-weight:500;">${change.oldValue}</span> <span style="color:#6B6B6B;margin:0 8px;">⇒</span>` : ''}
                                <span style="font-weight:600;color:#121212;">${change.newValue}</span>
                            </p>
                        </div>
                    `).join('')}
                </div>
            </td>
        </tr>
    ` : '';

    const detailsBox = status !== 'CANCELLED' ? `
        <!-- Details Box -->
        <tr>
            <td class="content-padding" style="padding:0 24px 32px;">
                <div style="background-color:rgba(18,18,18,0.03);padding:32px 24px;border-radius:0;">
                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:18px;color:#121212;margin:0 0 20px 0;font-weight:600;line-height:1.4;">
                        Assignment Details
                    </p>
                    
                    <!-- Dates -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                        <tr>
                            <td style="padding:0 0 8px 0;">
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;">
                                    <span style="font-weight:600;color:#6B6B6B;">Start:</span>
                                    <span style="font-weight:500;color:#121212;"> ${formattedDate(startDate)}</span>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 0 16px 0;">
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;">
                                    <span style="font-weight:600;color:#6B6B6B;">Deadline:</span>
                                    <span style="font-weight:500;color:#121212;"> ${formattedDate(deadline)}</span>
                                </p>
                            </td>
                        </tr>
                    </table>

                    <!-- Divider -->
                    <div style="height:1px;background-color:#E5E7EB;margin:0 0 20px 0;"></div>

                    <!-- Location -->
                    <table cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td style="padding:0 8px 0 0;vertical-align:top;">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M10 10.8333C11.1506 10.8333 12.0833 9.90059 12.0833 8.74999C12.0833 7.59938 11.1506 6.66666 10 6.66666C8.84938 6.66666 7.91666 7.59938 7.91666 8.74999C7.91666 9.90059 8.84938 10.8333 10 10.8333Z" stroke="#121212" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M10 18.3333C13.3333 15 16.6667 12.0152 16.6667 8.74999C16.6667 5.48476 13.6819 2.5 10 2.5C6.31811 2.5 3.33333 5.48476 3.33333 8.74999C3.33333 12.0152 6.66666 15 10 18.3333Z" stroke="#121212" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </td>
                            <td style="padding:0;vertical-align:middle;">
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;line-height:1.5;">
                                    ${location}
                                </p>
                            </td>
                        </tr>
                    </table>
                </div>
            </td>
        </tr>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${config.text}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style type="text/css">
        * { margin: 0; padding: 0; }
        body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #F2F2F2;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        
        @media only screen and (max-width:600px) {
            .email-container { width: 100% !important; }
            .content-padding { padding: 24px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#F2F2F2;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F2F2;">
        <tr>
            <td align="center">
                
                <!-- Main Container -->
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin:40px 0;">
                    
                    <!-- Header com Logo -->
                    <tr>
                        <td style="background-color:#121212;padding:32px 32px;text-align:left;">
                            <a href="https://app.prosmartbuild.com/" style="text-decoration:none;display:inline-block;">
                                <img src="https://assets-codelabs-dev.s3.sa-east-1.amazonaws.com/smart-header-logo.png" alt="SmartBuild" style="height:32px;display:block;max-width:160px;">
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Status Badge e Título -->
                    <tr>
                        <td class="content-padding" style="padding:32px 24px 8px;">
                            <div style="display:inline-block;background-color:${config.color}15;color:${config.color};padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;">
                                ${config.badge}
                            </div>
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:#121212;margin:0;line-height:1.4;">
                                ${config.text}
                            </h1>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#6B6B6B;margin:8px 0 0 0;font-weight:400;">
                                Contract #${contractNumber} • ${projectName}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Greeting e Mensagem -->
                    <tr>
                        <td class="content-padding" style="padding:24px 24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 12px 0;font-weight:600;">
                                Hello, ${recipientName}.
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0;line-height:1.5;font-weight:400;">
                                ${status === 'CANCELLED'
            ? `This email is to inform you that the schedule for <strong>${projectName}</strong> has been cancelled.`
            : status === 'REMOVED'
                ? `You have been removed from the assignment for <strong>${projectName}</strong>.`
                : status === 'ASSIGNED'
                    ? `You have been assigned to <strong>${projectName}</strong>. Please check the details below.`
                    : `We are writing to inform you about updates to the schedule for <strong>${projectName}</strong>.`
        }
                            </p>
                        </td>
                    </tr>

                    ${changesHtml}
                    ${detailsBox}

                    ${description ? `
                    <!-- Description -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0 0 8px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                                Notes / Description
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0;line-height:1.6;font-weight:400;">
                                ${description}
                            </p>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- CTA Button -->
                    ${status !== 'CANCELLED' && status !== 'REMOVED' ? `
                    <tr>
                        <td class="content-padding" style="padding:0 24px 40px;">
                            <a href="https://app.prosmartbuild.com/" style="display:block;background-color:#A6855C;color:#FFFFFF;padding:14px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                View Full Schedule
                            </a>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Footer Info -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 14px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This is an automated notification from ${companyName}. If you have any questions, please contact us directly.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Copyright -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 40px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0;">
                                © SmartBuild ${new Date().getFullYear()}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 24px;">
                            <div style="height:1px;background-color:#E5E7EB;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer Logo e Social -->
                    <tr>
                        <td class="content-padding" style="padding:40px 24px 24px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="left" valign="middle" style="vertical-align:middle;">
                                        <a href="https://app.prosmartbuild.com/" style="text-decoration:none;display:inline-block;">
                                            <img src="https://assets-codelabs-dev.s3.sa-east-1.amazonaws.com/smart-footer-logo.png" alt="SmartBuild" style="height:24px;display:block;max-width:121px;">
                                        </a>
                                    </td>
                                    <td align="right" valign="middle" style="vertical-align:middle;">
                                        <a href="https://www.instagram.com/smartbuildapp/" style="text-decoration:none;display:inline-block;margin-right:16px;">
                                            <img src="https://assets-codelabs-dev.s3.sa-east-1.amazonaws.com/instagram.png" alt="Instagram" style="width:20px;height:20px;display:block;">
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
};

