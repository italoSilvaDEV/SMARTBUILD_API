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
    // Formatar as datas para o formato "Dec 16, 2025"
    const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const formattedDeadline = new Date(deadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const formattedOldStartDate = oldStartDate ? new Date(oldStartDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }) : null;

    const formattedOldDeadline = oldDeadline ? new Date(oldDeadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }) : null;

    // Obter a inicial do nome do cliente
    const clientInitial = clientName.charAt(0).toUpperCase();

    // Extrair nome do serviço do contractNumber (ex: "Drywall Installation")
    const serviceName = contractNumber.split('#')[0].trim() || 'Service';

    // Determinar título e badge baseado no contexto
    const badgeText = isScheduleChange ? 'UPDATE' : 'SCHEDULED';
    const badgeColor = isScheduleChange ? '#0EA5E9' : '#10B981';
    
    const title = isScheduleChange 
        ? `${serviceName} #${contractNumber.split('#')[1] || contractNumber} Rescheduled (${formattedStartDate.split(',')[0]} ${formattedStartDate.split(',')[1].split(' ')[1]} - ${formattedDeadline.split(',')[0]} ${formattedDeadline.split(',')[1].split(' ')[1]})`
        : `${serviceName} #${contractNumber.split('#')[1] || contractNumber} at ${projectLocation.split(',')[0]} starts ${formattedStartDate.split(',')[0]} ${formattedStartDate.split(',')[1].split(' ')[1]}`;
    
    const greeting = `Hello, ${clientName}${isScheduleChange ? '.' : ''}`;
    
    const mainMessage = isScheduleChange 
        ? `There has been a change in the schedule for the ${serviceName} service.`
        : 'Your project schedule has been confirmed.';

    // Conteúdo específico para atualização
    const updateContent = isScheduleChange && formattedOldStartDate && formattedOldDeadline ? `
        <div style="background-color:#F9FAFB;border-radius:8px;padding:20px;margin:0;">
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#6B7280;margin:0 0 16px 0;font-weight:500;">${serviceName} #${contractNumber.split('#')[1] || contractNumber}</p>
            
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr>
                    <td style="padding:0;">
                        <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding:0;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#DC2626;margin:0;text-decoration:line-through;white-space:nowrap;">${formattedOldStartDate}</p>
                                </td>
                                <td style="padding:0 8px;">
                                    <span style="color:#6B7280;font-size:14px;">⇒</span>
                                </td>
                                <td style="padding:0;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;white-space:nowrap;">${formattedStartDate}</p>
                                </td>
                                <td style="padding:0 0 0 12px;">
                                    <table cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <td style="padding:0;vertical-align:middle;">
                                                <div style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></div>
                                            </td>
                                            <td style="padding:0;vertical-align:middle;">
                                                <div style="width:60px;height:2px;background-color:#E5E7EB;margin:0 4px;"></div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td style="padding:0;">
                        <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding:0;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#DC2626;margin:0;text-decoration:line-through;white-space:nowrap;">${formattedOldDeadline}</p>
                                </td>
                                <td style="padding:0 8px;">
                                    <span style="color:#6B7280;font-size:14px;">⇒</span>
                                </td>
                                <td style="padding:0;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;white-space:nowrap;">${formattedDeadline}</p>
                                </td>
                                <td style="padding:0 0 0 12px;">
                                    <table cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <td style="padding:0;vertical-align:middle;">
                                                <div style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></div>
                                            </td>
                                            <td style="padding:0;vertical-align:middle;">
                                                <div style="width:60px;height:2px;background-color:#E5E7EB;margin:0 4px;"></div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid #E5E7EB;">
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;margin:0;"><strong>Location:</strong> ${projectLocation}</p>
            </div>
        </div>
    ` : `
        <div style="background-color:#FFFFFF;padding:0;">
            <!-- Timeline -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                    <td style="padding:0;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="width:8px;padding:0;">
                                    <div style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></div>
                                </td>
                                <td style="padding:0;">
                                    <div style="height:2px;background-color:#E5E7EB;"></div>
                                </td>
                                <td style="width:8px;padding:0;">
                                    <div style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <!-- Datas -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                    <td align="left" style="padding:0;">
                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;font-weight:600;">${formattedStartDate}</p>
                    </td>
                    <td align="right" style="padding:0;">
                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;font-weight:600;">${formattedDeadline}</p>
                    </td>
                </tr>
            </table>
            
            <!-- Location -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                <tr>
                    <td valign="middle" style="width:32px;padding:0 12px 0 0;">
                        <div style="width:32px;height:32px;background-color:#3B82F6;border-radius:50%;text-align:center;line-height:32px;">
                            <span style="color:#FFFFFF;font-size:18px;">📍</span>
                        </div>
                    </td>
                    <td valign="middle" style="padding:0;">
                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;margin:0;"><strong>Location:</strong> ${projectLocation}</p>
                    </td>
                </tr>
            </table>
            
            <!-- Contract -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td valign="middle" style="width:32px;padding:0 12px 0 0;">
                        <div style="width:32px;height:32px;background-color:#3B82F6;border-radius:50%;text-align:center;line-height:32px;">
                            <span style="color:#FFFFFF;font-size:18px;">📄</span>
                        </div>
                    </td>
                    <td valign="middle" style="padding:0;">
                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;margin:0;"><strong>Contract:</strong> ${serviceName} #${contractNumber.split('#')[1] || contractNumber}</p>
                    </td>
                </tr>
            </table>
        </div>
    `;

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${isScheduleChange ? 'Project Schedule Update' : 'Project Scheduled'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style type="text/css">
        * { margin: 0; padding: 0; }
        body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #F9FAFB;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        
        @media only screen and (max-width:600px) {
            .email-container { width: 100% !important; }
            .content-padding { padding: 24px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#F9FAFB;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9FAFB;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                
                <!-- Main Container -->
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    
                    <!-- Header com Logo -->
                    <tr>
                        <td style="background-color:#1F2937;padding:16px 32px;text-align:left;">
                            ${logo ? `<img src="${logo}" alt="${company}" style="height:32px;display:block;">` : `<span style="color:#CDA574;font-family:'Inter',-apple-system,sans-serif;font-size:20px;font-weight:600;">🏗 SmartBuild</span>`}
                        </td>
                    </tr>
                    
                    <!-- Badge -->
                    <tr>
                        <td class="content-padding" style="padding:32px 32px 0;">
                            <div style="display:inline-block;background-color:${badgeColor};color:#FFFFFF;padding:6px 16px;border-radius:16px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                                ${badgeText}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Título -->
                    <tr>
                        <td class="content-padding" style="padding:16px 32px 24px;">
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:20px;font-weight:600;color:#111827;margin:0;line-height:1.4;">
                                ${title}
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Greeting com Avatar -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 16px;">
                            <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td valign="middle" style="padding:0 12px 0 0;">
                                        <div style="width:40px;height:40px;background-color:#3B82F6;border-radius:50%;text-align:center;line-height:40px;">
                                            <span style="color:#FFFFFF;font-size:18px;font-weight:600;">${clientInitial}</span>
                                        </div>
                                    </td>
                                    <td valign="middle" style="padding:0;">
                                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:15px;color:#111827;margin:0;font-weight:500;">
                                            ${greeting}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Mensagem Principal -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 24px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#6B7280;margin:0;line-height:1.6;">
                                ${mainMessage}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Schedule/Timeline Content -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 24px;">
                            ${updateContent}
                        </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#111827;margin:0 0 16px 0;">
                                Need to reschedule?
                            </p>
                            <a href="mailto:${companyEmail || 'contact@smartbuild.com'}" style="display:inline-block;background-color:#92764D;color:#FFFFFF;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:14px;font-weight:500;">
                                Contact us
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 32px;">
                            <div style="height:1px;background-color:#E5E7EB;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer Info -->
                    <tr>
                        <td class="content-padding" style="padding:24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B7280;margin:0;line-height:1.6;">
                                This email was sent to <a href="mailto:${companyEmail || ''}" style="color:#3B82F6;text-decoration:none;">${companyEmail || 'your email'}</a>. If you'd rather not receive this kind of email, you can <a href="#" style="color:#3B82F6;text-decoration:none;">unsubscribe</a> or manage your email.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Copyright -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 24px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#9CA3AF;margin:0;">
                                © SmartBuild 2026
                            </p>
                        </td>
                    </tr>
                    
                </table>
                
                <!-- Footer Logo e Social -->
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                    <tr>
                        <td style="padding:0 32px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="left" valign="middle" style="vertical-align:middle;">
                                        <table cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="background-color:#CDA574;width:18px;height:24px;padding:0;"></td>
                                                <td style="background-color:#121212;padding:0 8px;height:24px;">
                                                    <span style="color:#FFFFFF;font-family:'Inter',-apple-system,sans-serif;font-size:14px;font-weight:600;line-height:24px;">SmartBuild</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td align="right" valign="middle" style="vertical-align:middle;">
                                        <a href="https://www.instagram.com/${company.toLowerCase().replace(/\s+/g, '')}" style="text-decoration:none;display:inline-block;width:24px;height:24px;background-color:#E5E7EB;border-radius:4px;text-align:center;line-height:24px;">
                                            <span style="font-size:16px;">📷</span>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                
                <!-- Footer Text -->
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                    <tr>
                        <td style="padding:0 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B7280;margin:0 0 8px 0;">
                                This email was sent to ${companyEmail || 'your email'}. If you'd rather not receive this kind of email, you can <a href="#" style="color:#3B82F6;text-decoration:underline;">unsubscribe</a> or manage your email.
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B7280;margin:0;">
                                © SmartBuild ${new Date().getFullYear()}
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

