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

    // Extrair nome do serviço do contractNumber (ex: "Drywall Installation")
    const serviceName = contractNumber.split('#')[0].trim() || 'Service';

    // Determinar título e badge baseado no contexto
    const badgeText = isScheduleChange ? 'UPDATE' : 'SCHEDULED';
    const badgeColor = isScheduleChange ? '#1E90FF' : '#1E9B5C';
    
    const title = isScheduleChange 
        ? `${serviceName} #${contractNumber.split('#')[1] || contractNumber} Rescheduled (${formattedStartDate.split(',')[0]} ${formattedStartDate.split(',')[1].split(' ')[1]} - ${formattedDeadline.split(',')[0]} ${formattedDeadline.split(',')[1].split(' ')[1]})`
        : `${serviceName} #${contractNumber.split('#')[1] || contractNumber} at ${projectLocation.split(',')[0]} starts ${formattedStartDate.split(',')[0]} ${formattedStartDate.split(',')[1].split(' ')[1]}`;
    
    const greeting = `Hello, ${clientName}${isScheduleChange ? '.' : ''}`;
    
    const mainMessage = isScheduleChange 
        ? `There has been a change in the schedule for the ${serviceName} service.`
        : 'Your project schedule has been confirmed.';

    // Conteúdo específico para atualização
    const updateContent = isScheduleChange && formattedOldStartDate && formattedOldDeadline ? `
        <div style="background-color:rgba(18,18,18,0.03);border-radius:0;padding:32px 24px;margin:0;">
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#595959;margin:0 0 24px 0;font-weight:600;">${serviceName} #${contractNumber.split('#')[1] || contractNumber}</p>
            
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                    <td style="padding:0;vertical-align:middle;">
                        <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#D92D20;margin:0;text-decoration:line-through;white-space:nowrap;font-weight:600;">${formattedOldStartDate}</p>
                                </td>
                                <td style="padding:0 4px;vertical-align:middle;">
                                    <span style="color:#595959;font-size:12px;">⇒</span>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;font-weight:600;">${formattedStartDate}</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                    <td style="padding:0 12px;vertical-align:middle;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td style="padding:0;vertical-align:middle;width:8px;">
                                    <div style="width:8px;height:8px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <div style="height:2px;background-color:#E5E7EB;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;width:8px;">
                                    <div style="width:8px;height:8px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                            </tr>
                        </table>
                    </td>
                    <td style="padding:0;vertical-align:middle;">
                        <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#D92D20;margin:0;text-decoration:line-through;white-space:nowrap;font-weight:600;">${formattedOldDeadline}</p>
                                </td>
                                <td style="padding:0 4px;vertical-align:middle;">
                                    <span style="color:#595959;font-size:12px;">⇒</span>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;font-weight:600;">${formattedDeadline}</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#595959;margin:0;font-weight:600;"><span style="font-weight:600;">Location:</span> <span style="font-weight:400;">${projectLocation}</span></p>
        </div>
    ` : `
        <div style="background-color:rgba(18,18,18,0.03);padding:32px 24px;border-radius:0;">
            <!-- Timeline com datas -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                    <td align="left" valign="middle" style="padding:0;width:auto;">
                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;font-weight:600;white-space:nowrap;">${formattedStartDate}</p>
                    </td>
                    <td valign="middle" style="padding:0 12px;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td style="padding:0;vertical-align:middle;width:8px;">
                                    <div style="width:8px;height:8px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <div style="height:2px;background-color:#E5E7EB;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;width:8px;">
                                    <div style="width:8px;height:8px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                            </tr>
                        </table>
                    </td>
                    <td align="right" valign="middle" style="padding:0;width:auto;">
                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;font-weight:600;white-space:nowrap;">${formattedDeadline}</p>
                    </td>
                </tr>
            </table>
            
            <!-- Divider -->
            <div style="height:1px;background-color:#E5E7EB;margin:16px 0;"></div>
            
            <!-- Location -->
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 16px 0;"><span style="font-weight:600;">Location:</span> <span style="font-weight:400;">${projectLocation}</span></p>
            
            <!-- Divider -->
            <div style="height:1px;background-color:#E5E7EB;margin:16px 0;"></div>
            
            <!-- Contract -->
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0;"><span style="font-weight:600;">Contract:</span> ${serviceName} #${contractNumber.split('#')[1] || contractNumber}</p>
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
                    
                    <!-- Greeting e Mensagem -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 24px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 16px 0;font-weight:600;">
                                ${greeting}
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0;line-height:1.5;">
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
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This email was sent to <a href="mailto:${companyEmail || ''}" style="color:#A6855C;text-decoration:none;">${companyEmail || 'your email'}</a>. If you'd rather not receive this kind of email, you can <a href="#" style="color:#A6855C;text-decoration:none;">unsubscribe</a> or manage your email.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Copyright -->
                    <tr>
                        <td class="content-padding" style="padding:0 32px 40px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0;">
                                © SmartBuild ${new Date().getFullYear()}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 32px;">
                            <div style="height:1px;background-color:#E5E7EB;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer Logo e Social -->
                    <tr>
                        <td class="content-padding" style="padding:40px 32px 32px;">
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
                                        <a href="https://www.instagram.com/${company.toLowerCase().replace(/\s+/g, '')}" style="text-decoration:none;display:inline-block;">
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                                                <path d="M10 1.80469C12.6703 1.80469 12.9859 1.81563 14.0406 1.86406C15.0156 1.90938 15.5453 2.06719 15.8984 2.19844C16.3672 2.37344 16.7016 2.58594 17.0531 2.9375C17.4078 3.29219 17.6172 3.62344 17.7922 4.09219C17.9234 4.44531 18.0812 4.97812 18.1266 5.95C18.175 7.00781 18.1859 7.32344 18.1859 9.99063C18.1859 12.6609 18.175 12.9766 18.1266 14.0313C18.0812 15.0063 17.9234 15.5359 17.7922 15.8891C17.6172 16.3578 17.4047 16.6922 17.0531 17.0438C16.6984 17.3984 16.3672 17.6078 15.8984 17.7828C15.5453 17.9141 15.0125 18.0719 14.0406 18.1172C12.9828 18.1656 12.6672 18.1766 10 18.1766C7.32969 18.1766 7.01406 18.1656 5.95938 18.1172C4.98438 18.0719 4.45469 17.9141 4.10156 17.7828C3.63281 17.6078 3.29844 17.3953 2.94688 17.0438C2.59219 16.6891 2.38281 16.3578 2.20781 15.8891C2.07656 15.5359 1.91875 15.0031 1.87344 14.0313C1.825 12.9734 1.81406 12.6578 1.81406 9.99063C1.81406 7.32031 1.825 7.00469 1.87344 5.95C1.91875 4.975 2.07656 4.44531 2.20781 4.09219C2.38281 3.62344 2.59531 3.28906 2.94688 2.9375C3.30156 2.58281 3.63281 2.37344 4.10156 2.19844C4.45469 2.06719 4.9875 1.90938 5.95938 1.86406C7.01406 1.81563 7.32969 1.80469 10 1.80469ZM10 0C7.28438 0 6.94375 0.0109375 5.87656 0.059375C4.8125 0.107813 4.08594 0.277344 3.45156 0.525C2.79219 0.784375 2.23438 1.12969 1.67969 1.68438C1.125 2.23906 0.779688 2.79688 0.520312 3.45312C0.272188 4.09063 0.102656 4.81406 0.054375 5.87813C0.00590625 6.94844 -0.00515625 7.28906 -0.00515625 10.0047C-0.00515625 12.7203 0.00590625 13.0609 0.054375 14.1281C0.102656 15.1922 0.272188 15.9187 0.520312 16.5531C0.779688 17.2125 1.125 17.7703 1.67969 18.325C2.23438 18.8797 2.79219 19.2281 3.44844 19.4844C4.08594 19.7328 4.80938 19.9023 5.87344 19.9508C6.94063 19.9992 7.28125 20.0102 9.99688 20.0102C12.7125 20.0102 13.0531 19.9992 14.1203 19.9508C15.1844 19.9023 15.9109 19.7328 16.5453 19.4844C17.2016 19.2281 17.7594 18.8797 18.3141 18.325C18.8688 17.7703 19.2172 17.2125 19.4734 16.5563C19.7219 15.9187 19.8914 15.1953 19.9398 14.1313C19.9883 13.0641 19.9992 12.7234 19.9992 10.0078C19.9992 7.29219 19.9883 6.95156 19.9398 5.88438C19.8914 4.82031 19.7219 4.09375 19.4734 3.45938C19.2266 2.79688 18.8813 2.23906 18.3266 1.68438C17.7719 1.12969 17.2141 0.78125 16.5578 0.525C15.9203 0.276562 15.1969 0.107031 14.1328 0.0585938C13.0625 0.0109375 12.7219 0 10.0063 0H10Z" fill="#595959"/>
                                                <path d="M10 4.86719C7.16406 4.86719 4.86719 7.16406 4.86719 10C4.86719 12.8359 7.16406 15.1328 10 15.1328C12.8359 15.1328 15.1328 12.8359 15.1328 10C15.1328 7.16406 12.8359 4.86719 10 4.86719ZM10 13.3359C8.15781 13.3359 6.66406 11.8422 6.66406 10C6.66406 8.15781 8.15781 6.66406 10 6.66406C11.8422 6.66406 13.3359 8.15781 13.3359 10C13.3359 11.8422 11.8422 13.3359 10 13.3359Z" fill="#595959"/>
                                                <path d="M15.3383 5.86133C15.9936 5.86133 16.5258 5.32915 16.5258 4.67383C16.5258 4.01851 15.9936 3.48633 15.3383 3.48633C14.683 3.48633 14.1508 4.01851 14.1508 4.67383C14.1508 5.32915 14.683 5.86133 15.3383 5.86133Z" fill="#595959"/>
                                            </svg>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

