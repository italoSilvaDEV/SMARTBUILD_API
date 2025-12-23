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
        <div style="background-color:#F9FAFB;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#6B7280;margin:0 0 16px 0;font-weight:500;">${serviceName} #${contractNumber.split('#')[1] || contractNumber}</p>
            <div style="display:flex;align-items:center;margin-bottom:8px;">
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#DC2626;margin:0;text-decoration:line-through;">${formattedOldStartDate}</p>
                <span style="margin:0 8px;color:#6B7280;">⇒</span>
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;">${formattedStartDate}</p>
                <span style="width:40px;height:1px;background-color:#E5E7EB;margin:0 8px;"></span>
                <span style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></span>
            </div>
            <div style="display:flex;align-items:center;">
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#DC2626;margin:0;text-decoration:line-through;">${formattedOldDeadline}</p>
                <span style="margin:0 8px;color:#6B7280;">⇒</span>
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;">${formattedDeadline}</p>
                <span style="width:40px;height:1px;background-color:#E5E7EB;margin:0 8px;"></span>
                <span style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></span>
            </div>
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid #E5E7EB;">
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;margin:0;"><strong>Location:</strong> ${projectLocation}</p>
            </div>
        </div>
    ` : `
        <div style="background-color:#FFFFFF;padding:24px 0;">
            <div style="display:flex;align-items:center;margin-bottom:24px;">
                <span style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></span>
                <span style="flex:1;height:2px;background-color:#E5E7EB;margin:0 4px;"></span>
                <span style="width:8px;height:8px;background-color:#374151;border-radius:50%;"></span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;font-weight:600;">${formattedStartDate}</p>
                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#374151;margin:0;font-weight:600;">${formattedDeadline}</p>
            </div>
            <div style="margin-bottom:16px;">
                <div style="display:flex;align-items:center;margin-bottom:12px;">
                    <div style="width:32px;height:32px;background-color:#3B82F6;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;flex-shrink:0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                    </div>
                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;margin:0;"><strong>Location:</strong> ${projectLocation}</p>
                </div>
                <div style="display:flex;align-items:center;">
                    <div style="width:32px;height:32px;background-color:#3B82F6;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;flex-shrink:0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    </div>
                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;margin:0;"><strong>Contract:</strong> ${serviceName} #${contractNumber.split('#')[1] || contractNumber}</p>
                </div>
            </div>
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
                        <td style="background-color:#1F2937;padding:16px 32px;">
                            <img src="${logo}" alt="${company}" style="height:32px;display:block;">
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
                            <div style="display:flex;align-items:center;">
                                <div style="width:40px;height:40px;background-color:#3B82F6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;">
                                    <span style="color:#FFFFFF;font-size:18px;font-weight:600;">${clientInitial}</span>
                                </div>
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:15px;color:#111827;margin:0;font-weight:500;">
                                    ${greeting}
                                </p>
                            </div>
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
                                        <svg width="121" height="24" viewBox="0 0 121 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                                            <path d="M18.75 0H0V24H18.75V0Z" fill="#CDA574"/>
                                            <path d="M123 3.75H24.75V22.5H123V3.75Z" fill="#121212"/>
                                        </svg>
                                    </td>
                                    <td align="right" valign="middle" style="vertical-align:middle;">
                                        <a href="https://www.instagram.com/${company.toLowerCase().replace(/\s+/g, '')}" style="display:inline-block;">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="#6B7280"/>
                                            </svg>
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
}

