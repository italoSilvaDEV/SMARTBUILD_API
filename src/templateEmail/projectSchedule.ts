export const projectScheduleEmail = (
    clientName: string,
    logo: string,
    company: string,
    contractNumber: string,
    projectLocation: string,
    startDate: string,
    deadline: string,
    isScheduleChange: boolean,
    oldStartDate?: string,
    oldDeadline?: string,
    phone?: string,
    companyEmail?: string
) => {
    // Formatar as datas
    const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const formattedDeadline = new Date(deadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const formattedOldStartDate = oldStartDate ? new Date(oldStartDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : null;

    const formattedOldDeadline = oldDeadline ? new Date(oldDeadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : null;

    // Determinar título e conteúdo baseado no contexto
    const title = isScheduleChange 
        ? "Project Schedule Update" 
        : "Project Schedule Confirmation";
    
    const subtitle = isScheduleChange 
        ? "Your project schedule has been updated" 
        : "Your project has been scheduled";

    const mainContent = isScheduleChange ? `
        <p style="font-size:15px;color:#4b5563;margin:0 0 16px 0;line-height:1.7;">This email confirms that your project schedule has been updated. Please review the new schedule details below.</p>
        ${formattedOldStartDate && formattedOldDeadline ? `
        <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px 0;">
            <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Previous Schedule</p>
            <p style="font-size:14px;color:#374151;margin:4px 0;line-height:1.6;"><strong>Start Date:</strong> ${formattedOldStartDate}</p>
            <p style="font-size:14px;color:#374151;margin:4px 0;line-height:1.6;"><strong>Deadline:</strong> ${formattedOldDeadline}</p>
        </div>
        ` : ''}
        <p style="font-size:15px;color:#4b5563;margin:0 0 0 0;line-height:1.7;">The updated schedule is detailed below. If you have any questions or concerns, please contact us.</p>
    ` : `
        <p style="font-size:15px;color:#4b5563;margin:0 0 16px 0;line-height:1.7;">This email confirms that your project has been scheduled. We are pleased to inform you of the project timeline and look forward to beginning work.</p>
        <p style="font-size:15px;color:#4b5563;margin:0 0 0 0;line-height:1.7;">Please review the schedule details below. If you have any questions or need to discuss any adjustments, please don't hesitate to contact us.</p>
    `;

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="format-detection" content="telephone=no">
    <title>${isScheduleChange ? 'Project Schedule Update' : 'Project Scheduled'} - Contract ${contractNumber}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style type="text/css">
        * { margin: 0; padding: 0; }
        #outlook a { padding: 0; }
        .ReadMsgBody { width: 100%; }
        .ExternalClass { width: 100%; }
        body { 
            margin: 0; 
            padding: 0; 
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        a[x-apple-data-detectors] { 
            color: inherit !important; 
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        
        @media only screen and (max-width:600px) {
            .email-container { width: 100% !important; }
            .content-wrapper { padding: 20px !important; }
            h1 { font-size: 24px !important; }
            .schedule-card { padding: 20px !important; }
            .status-badge { font-size: 11px !important; padding: 6px 14px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;">
        <tr>
            <td align="center" style="padding:40px 20px;">
                
                <!-- Main Container -->
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
                    
                    <!-- Logo Section -->
                    <tr>
                        <td align="center" style="padding:32px 32px 24px;">
                            <img src="${logo}" alt="${company}" style="max-width:140px;height:auto;display:block;">
                        </td>
                    </tr>
                    
                    <!-- Hero Section -->
                    <tr>
                        <td style="padding:0 32px 32px;">
                            <h1 style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:24px;font-weight:600;color:#111827;margin:0 0 8px;line-height:1.3;text-align:left;">
                                ${title}
                            </h1>
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:left;">
                                ${subtitle}
                            </p>
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;color:#374151;margin:0;line-height:1.6;text-align:left;">
                                Dear ${clientName},
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Schedule Card -->
                    <tr>
                        <td style="padding:0 32px 32px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
                                <tr>
                                    <td style="padding:24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="padding-bottom:20px;border-bottom:1px solid #e5e7eb;">
                                                    <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#6b7280;margin:0 0 6px 0;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">
                                                        Contract Number
                                                    </p>
                                                    <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:18px;color:#111827;margin:0;font-weight:600;">
                                                        ${contractNumber}
                                                    </p>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:20px 0;border-bottom:1px solid #e5e7eb;">
                                                    <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#6b7280;margin:0 0 6px 0;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">
                                                        Project Location
                                                    </p>
                                                    <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;color:#374151;margin:0;line-height:1.5;">
                                                        ${projectLocation || 'Not specified'}
                                                    </p>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:20px 0 0 0;">
                                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                                        <tr>
                                                            <td width="50%" style="padding-right:12px;vertical-align:top;">
                                                                <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#6b7280;margin:0 0 8px 0;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">
                                                                    Start Date
                                                                </p>
                                                                <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:16px;color:#059669;margin:0;font-weight:600;">
                                                                    ${formattedStartDate}
                                                                </p>
                                                            </td>
                                                            <td width="50%" style="padding-left:12px;vertical-align:top;">
                                                                <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#6b7280;margin:0 0 8px 0;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">
                                                                    Deadline
                                                                </p>
                                                                <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:16px;color:#dc2626;margin:0;font-weight:600;">
                                                                    ${formattedDeadline}
                                                                </p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Content Section -->
                    <tr>
                        <td style="padding:0 32px 32px;">
                            <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;text-align:left;">
                                ${mainContent}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 32px;">
                            <div style="height:1px;background-color:#e9ecef;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding:32px;">
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#111827;margin:0 0 8px;">
                                ${company}
                            </p>
                            ${phone ? `
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#6b7280;margin:0;">
                                ${phone}
                            </p>
                            ` : ''}
                            ${companyEmail ? `
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#6b7280;margin:4px 0 0 0;">
                                <a href="mailto:${companyEmail}" style="color:#2563eb;text-decoration:none;">${companyEmail}</a>
                            </p>
                            ` : ''}
                        </td>
                    </tr>
                    
                    <!-- Bottom Spacing -->
                    <tr>
                        <td style="height:20px;"></td>
                    </tr>
                    
                </table>
                
                <!-- Footer Note -->
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                    <tr>
                        <td align="center" style="padding:0 20px;">
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#9ca3af;line-height:1.5;margin:0;">
                                This is an automated message. Please do not reply directly to this email.
                            </p>
                        </td>
                    </tr>
                </table>
                
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

