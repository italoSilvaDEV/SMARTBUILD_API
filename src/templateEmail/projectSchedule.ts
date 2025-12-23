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

    const title = isScheduleChange
        ? `Project Schedule Updated`
        : `Project Schedule Confirmation`;

    const greeting = `Hello, ${clientName}${isScheduleChange ? '.' : ''}`;

    const mainMessage = isScheduleChange
        ? `There has been a change in the schedule for the project.`
        : 'Your project schedule has been confirmed.';

    // Conteúdo específico para atualização
    const updateContent = isScheduleChange && formattedOldStartDate && formattedOldDeadline ? `
        <div style="background-color:rgba(108,18,18,0.03);border-radius:0;padding:32px 24px;margin:0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                    <td style="padding:0;vertical-align:middle;width:auto;">
                        <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#D92D20;margin:0;text-decoration:line-through;white-space:nowrap;font-weight:600;">${formattedOldStartDate}</p>
                                </td>
                                <td style="padding:0 6px;vertical-align:middle;">
                                    <span style="color:#595959;font-size:14px;">⇒</span>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;font-weight:600;">${formattedStartDate}</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                    <td style="padding:0 16px;vertical-align:middle;width:100%;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td style="padding:0;vertical-align:middle;width:6px;">
                                    <div style="width:6px;height:6px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <div style="height:1px;background-color:#121212;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;width:6px;">
                                    <div style="width:6px;height:6px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                            </tr>
                        </table>
                    </td>
                    <td style="padding:0;vertical-align:middle;width:auto;">
                        <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding:0;vertical-align:middle;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#D92D20;margin:0;text-decoration:line-through;white-space:nowrap;font-weight:600;">${formattedOldDeadline}</p>
                                </td>
                                <td style="padding:0 6px;vertical-align:middle;">
                                    <span style="color:#595959;font-size:14px;">⇒</span>
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
                    <td valign="middle" style="padding:0 16px;width:100%;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td style="padding:0;vertical-align:middle;width:6px;">
                                    <div style="width:6px;height:6px;background-color:#121212;border-radius:50%;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;">
                                    <div style="height:1px;background-color:#121212;"></div>
                                </td>
                                <td style="padding:0;vertical-align:middle;width:6px;">
                                    <div style="width:6px;height:6px;background-color:#121212;border-radius:50%;"></div>
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
            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0;"><span style="font-weight:600;">Contract:</span> Project #${contractNumber}</p>
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
<body style="margin:0;padding:0;background-color:#FFFFFF;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
        <tr>
            <td align="center">
                
                <!-- Main Container -->
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    
                    <!-- Header com Logo -->
                    <tr>
                        <td style="background-color:#121212;padding:32px 32px;text-align:left;">
                            <a href="https://app.prosmartbuild.com/" style="text-decoration:none;display:inline-block;">
                                <img src="https://i.ibb.co/RG50Jkz7/logo-header.png" alt="SmartBuild" style="height:32px;display:block;max-width:160px;">
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Título -->
                    <tr>
                        <td class="content-padding" style="padding:24px 32px 32px;">
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:#121212;margin:0;line-height:1.4;">
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
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0;line-height:1.5;font-weight:400;">
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
                        <td class="content-padding" style="padding:24px 24px;">
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
                        <td class="content-padding" style="padding:40px 32px 24px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="left" valign="middle" style="vertical-align:middle;">
                                        <a href="https://app.prosmartbuild.com/" style="text-decoration:none;display:inline-block;">
                                            <img src="https://i.ibb.co/jPVYCxJr/logo-footer.png" alt="SmartBuild" style="height:24px;display:block;max-width:121px;">
                                        </a>
                                    </td>
                                    <td align="right" valign="middle" style="vertical-align:middle;">
                                        <a href="https://www.instagram.com/smartbuildapp/" style="text-decoration:none;display:inline-block;">
                                            <img src="https://i.ibb.co/Swk8pH06/instragram-icon.png" alt="Instagram" style="width:24px;height:24px;display:block;">
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

