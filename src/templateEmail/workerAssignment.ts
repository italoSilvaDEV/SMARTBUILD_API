export const workerAssignmentEmail = (
    workerName: string,
    serviceName: string,
    startDate: string,
    deadline: string,
    projectLocation: string,
    workerEmail?: string,
    latitude?: number | null,
    longitude?: number | null,
    isScheduleChange?: boolean,
    oldStartDate?: string,
    oldDeadline?: string
) => {
    const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const formattedStartTime = new Date(startDate).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const formattedDeadline = new Date(deadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const formattedDeadlineTime = new Date(deadline).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const formattedOldStartDate = oldStartDate ? new Date(oldStartDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }) : null;

    const formattedOldStartTime = oldStartDate ? new Date(oldStartDate).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }) : null;

    const formattedOldDeadline = oldDeadline ? new Date(oldDeadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }) : null;

    const formattedOldDeadlineTime = oldDeadline ? new Date(oldDeadline).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }) : null;

    const mapsUrl = (latitude && longitude)
        ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

    const badgeText = isScheduleChange ? 'UPDATED' : 'ASSIGNED';
    const badgeColor = isScheduleChange ? '#1E90FF' : '#1E9B5C';
    const greeting = `Hello, ${workerName}${isScheduleChange ? '.' : '.'}`;
    const mainMessage = isScheduleChange
        ? 'The schedule for your assignment has been updated:'
        : 'You have been assigned to the following service:';

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>New Assignment - ${serviceName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style type="text/css">
        * { margin: 0; padding: 0; }
        body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #E1E1E;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        
        @media only screen and (max-width:600px) {
            .email-container { width: 100% !important; }
            .content-padding { padding: 24px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#E1E1E;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E1E1E;">
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
                    
                    <!-- Badge e Título -->
                    <tr>
                        <td class="content-padding" style="padding:32px 24px;">
                            <div style="display:inline-block;background-color:${badgeColor};color:#FFFFFF;padding:4px 12px;border-radius:999px;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;">
                                ${badgeText}
                            </div>
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:#121212;margin:0;line-height:1.4;">
                                ${serviceName}
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Greeting e Mensagem -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 16px 0;font-weight:600;">
                                ${greeting}
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0;line-height:1.5;font-weight:400;">
                                ${mainMessage}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Service Details Box -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <div style="background-color:rgba(18,18,18,0.03);padding:32px 24px;border-radius:0;">
                                <!-- Service Name -->
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:20px;color:#121212;margin:0 0 20px 0;font-weight:600;line-height:1.4;">
                                    ${serviceName}
                                </p>
                                
                                ${isScheduleChange && formattedOldStartDate && formattedOldStartTime ? `
                                <!-- Start Date Update -->
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                                    <tr>
                                        <td style="padding:0;vertical-align:middle;width:auto;">
                                            <table cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td style="padding:0 8px 0 0;vertical-align:middle;">
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M17.5 8.33333H2.5M13.3333 1.66667V5M6.66667 1.66667V5M6.5 18.3333H13.5C14.9001 18.3333 15.6002 18.3333 16.135 18.0608C16.6054 17.8212 16.9878 17.4387 17.2275 16.9683C17.5 16.4335 17.5 15.7335 17.5 14.3333V7.33333C17.5 5.93319 17.5 5.23312 17.2275 4.69836C16.9878 4.22795 16.6054 3.8455 16.135 3.60582C15.6002 3.33333 14.9001 3.33333 13.5 3.33333H6.5C5.09987 3.33333 4.3998 3.33333 3.86504 3.60582C3.39462 3.8455 3.01218 4.22795 2.77248 4.69836C2.5 5.23312 2.5 5.93319 2.5 7.33333V14.3333C2.5 15.7335 2.5 16.4335 2.77248 16.9683C3.01218 17.4387 3.39462 17.8212 3.86504 18.0608C4.3998 18.3333 5.09987 18.3333 6.5 18.3333Z" stroke="#595959" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                                        </svg>
                                                    </td>
                                                    <td style="padding:0;vertical-align:middle;">
                                                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#D92D20;margin:0;text-decoration:line-through;white-space:nowrap;font-weight:600;">${formattedOldStartDate} (${formattedOldStartTime})</p>
                                                    </td>
                                                    <td style="padding:0 6px;vertical-align:middle;">
                                                        <span style="color:#595959;font-size:14px;">⇒</span>
                                                    </td>
                                                    <td style="padding:0;vertical-align:middle;">
                                                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;font-weight:600;">${formattedStartDate} (${formattedStartTime})</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                ` : `
                                <!-- Start Date -->
                                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                                    <tr>
                                        <td style="padding:0 8px 0 0;vertical-align:middle;">
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M17.5 8.33333H2.5M13.3333 1.66667V5M6.66667 1.66667V5M6.5 18.3333H13.5C14.9001 18.3333 15.6002 18.3333 16.135 18.0608C16.6054 17.8212 16.9878 17.4387 17.2275 16.9683C17.5 16.4335 17.5 15.7335 17.5 14.3333V7.33333C17.5 5.93319 17.5 5.23312 17.2275 4.69836C16.9878 4.22795 16.6054 3.8455 16.135 3.60582C15.6002 3.33333 14.9001 3.33333 13.5 3.33333H6.5C5.09987 3.33333 4.3998 3.33333 3.86504 3.60582C3.39462 3.8455 3.01218 4.22795 2.77248 4.69836C2.5 5.23312 2.5 5.93319 2.5 7.33333V14.3333C2.5 15.7335 2.5 16.4335 2.77248 16.9683C3.01218 17.4387 3.39462 17.8212 3.86504 18.0608C4.3998 18.3333 5.09987 18.3333 6.5 18.3333Z" stroke="#595959" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                            </svg>
                                        </td>
                                        <td style="padding:0;vertical-align:middle;">
                                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;">
                                                <span style="font-weight:600;">Start:</span>
                                                <span style="font-weight:400;"> ${formattedStartDate} (${formattedStartTime})</span>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                `}
                                
                                ${isScheduleChange && formattedOldDeadline && formattedOldDeadlineTime ? `
                                <!-- Deadline Update -->
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                                    <tr>
                                        <td style="padding:0;vertical-align:middle;width:auto;">
                                            <table cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td style="padding:0 8px 0 0;vertical-align:middle;">
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M2.5 7.5L2.5 6.5C2.5 5.09987 2.5 4.3998 2.77248 3.86502C3.01217 3.39462 3.39462 3.01217 3.86502 2.77248C4.3998 2.5 5.09987 2.5 6.5 2.5H7.08333M2.5 7.5V13.5C2.5 14.9001 2.5 15.6002 2.77248 16.135C3.01217 16.6054 3.39462 16.9878 3.86502 17.2275C4.3998 17.5 5.09987 17.5 6.5 17.5H13.5C14.9001 17.5 15.6002 17.5 16.135 17.2275C16.6054 16.9878 16.9878 16.6054 17.2275 16.135C17.5 15.6002 17.5 14.9001 17.5 13.5V7.5M2.5 7.5H17.5M17.5 7.5V6.5C17.5 5.09987 17.5 4.3998 17.2275 3.86502C16.9878 3.39462 16.6054 3.01217 16.135 2.77248C15.6002 2.5 14.9001 2.5 13.5 2.5H12.9167M7.08333 2.5V1.66667M7.08333 2.5V5M7.08333 2.5H12.9167M12.9167 2.5V1.66667M12.9167 2.5V5" stroke="#595959" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                                        </svg>
                                                    </td>
                                                    <td style="padding:0;vertical-align:middle;">
                                                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#D92D20;margin:0;text-decoration:line-through;white-space:nowrap;font-weight:600;">${formattedOldDeadline} (${formattedOldDeadlineTime})</p>
                                                    </td>
                                                    <td style="padding:0 6px;vertical-align:middle;">
                                                        <span style="color:#595959;font-size:14px;">⇒</span>
                                                    </td>
                                                    <td style="padding:0;vertical-align:middle;">
                                                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;font-weight:600;">${formattedDeadline} (${formattedDeadlineTime})</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                ` : `
                                <!-- Deadline -->
                                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                                    <tr>
                                        <td style="padding:0 8px 0 0;vertical-align:middle;">
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M2.5 7.5L2.5 6.5C2.5 5.09987 2.5 4.3998 2.77248 3.86502C3.01217 3.39462 3.39462 3.01217 3.86502 2.77248C4.3998 2.5 5.09987 2.5 6.5 2.5H7.08333M2.5 7.5V13.5C2.5 14.9001 2.5 15.6002 2.77248 16.135C3.01217 16.6054 3.39462 16.9878 3.86502 17.2275C4.3998 17.5 5.09987 17.5 6.5 17.5H13.5C14.9001 17.5 15.6002 17.5 16.135 17.2275C16.6054 16.9878 16.9878 16.6054 17.2275 16.135C17.5 15.6002 17.5 14.9001 17.5 13.5V7.5M2.5 7.5H17.5M17.5 7.5V6.5C17.5 5.09987 17.5 4.3998 17.2275 3.86502C16.9878 3.39462 16.6054 3.01217 16.135 2.77248C15.6002 2.5 14.9001 2.5 13.5 2.5H12.9167M7.08333 2.5V1.66667M7.08333 2.5V5M7.08333 2.5H12.9167M12.9167 2.5V1.66667M12.9167 2.5V5" stroke="#595959" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                            </svg>
                                        </td>
                                        <td style="padding:0;vertical-align:middle;">
                                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;white-space:nowrap;">
                                                <span style="font-weight:600;">Deadline:</span>
                                                <span style="font-weight:400;"> ${formattedDeadline} (${formattedDeadlineTime})</span>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                `}
                                
                                <!-- Divider -->
                                <div style="height:1px;background-color:#E5E7EB;margin:0 0 20px 0;"></div>
                                
                                <!-- Location with Copy Button -->
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding:0;vertical-align:middle;">
                                            <table cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td style="padding:0 8px 0 0;vertical-align:middle;">
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M10 10.8333C11.1506 10.8333 12.0833 9.90059 12.0833 8.74999C12.0833 7.59938 11.1506 6.66666 10 6.66666C8.84938 6.66666 7.91666 7.59938 7.91666 8.74999C7.91666 9.90059 8.84938 10.8333 10 10.8333Z" stroke="#595959" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                                            <path d="M10 18.3333C13.3333 15 16.6667 12.0152 16.6667 8.74999C16.6667 5.48476 13.6819 2.5 10 2.5C6.31811 2.5 3.33333 5.48476 3.33333 8.74999C3.33333 12.0152 6.66666 15 10 18.3333Z" stroke="#595959" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                                        </svg>
                                                    </td>
                                                    <td style="padding:0;vertical-align:middle;">
                                                        <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;">
                                                            <span style="font-weight:600;">Location:</span>
                                                            <span style="font-weight:400;"> ${projectLocation}</span>
                                                        </p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                        <td align="right" style="padding:0;vertical-align:middle;">
                                            <table cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td style="padding:0 6px 0 0;vertical-align:middle;">
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M4.16669 12.5C3.39007 12.5 3.00176 12.5 2.69554 12.373C2.28726 12.204 1.96272 11.8795 1.79371 11.4712C1.66669 11.165 1.66669 10.7767 1.66669 10V4.33333C1.66669 3.39991 1.66669 2.9332 1.84834 2.57668C2.00813 2.26308 2.26311 2.00811 2.57671 1.84832C2.93323 1.66667 3.39994 1.66667 4.33335 1.66667H10C10.7767 1.66667 11.165 1.66667 11.4712 1.79369C11.8795 1.9627 12.204 2.28724 12.373 2.69552C12.5 3.00174 12.5 3.39005 12.5 4.16667M10 18.3333H15.6667C16.6001 18.3333 17.0668 18.3333 17.4233 18.1517C17.7369 17.9919 17.9919 17.7369 18.1517 17.4233C18.3334 17.0668 18.3334 16.6001 18.3334 15.6667V10C18.3334 9.06658 18.3334 8.59987 18.1517 8.24335C17.9919 7.92975 17.7369 7.67477 17.4233 7.51498C17.0668 7.33333 16.6001 7.33333 15.6667 7.33333H10C9.06659 7.33333 8.59988 7.33333 8.24336 7.51498C7.92976 7.67477 7.67478 7.92975 7.51499 8.24335C7.33334 8.59987 7.33334 9.06658 7.33334 10V15.6667C7.33334 16.6001 7.33334 17.0668 7.51499 17.4233C7.67478 17.7369 7.92976 17.9919 8.24336 18.1517C8.59988 18.3333 9.06659 18.3333 10 18.3333Z" stroke="#A6855C" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                                        </svg>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- CTA Button - Open in Maps -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <a href="${mapsUrl}" style="display:block;background-color:#A6855C;color:#FFFFFF;padding:12px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                Open in Maps
                            </a>
                        </td>
                    </tr>
                    
                    <!-- App Download Section -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 40px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 16px 0;line-height:1.4;font-weight:400;">
                                Notable at the touch of a button! Download our app for Android.
                            </p>
                            <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="padding:0 16px 0 0;vertical-align:middle;">
                                        <a href="https://play.google.com/store/apps/details?id=com.smartbuild.app" style="display:block;">
                                            <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="height:60px;width:auto;display:block;">
                                        </a>
                                    </td>
                                    <td style="padding:0;vertical-align:middle;">
                                        <a href="https://apps.apple.com/br/app/smartbuild4u-app/id6740789217" style="display:block;">
                                            <img src="https://i.ibb.co/WN38DHh7/apple.png" alt="Download on the App Store" style="height:60px;width:auto;display:block;">
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer Info -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 14px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This email was sent to <a href="mailto:${workerEmail || ''}" style="color:#A6855C;text-decoration:none;">${workerEmail || 'your email'}</a>. If you'd rather not receive this kind of email, you can <a href="#" style="color:#A6855C;text-decoration:none;">unsubscribe</a> or manage your email.
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
                                            <img src="https://i.ibb.co/jPVYCxJr/logo-footer.png" alt="SmartBuild" style="height:24px;display:block;max-width:121px;">
                                        </a>
                                    </td>
                                    <td align="right" valign="middle" style="vertical-align:middle;">
                                        <a href="https://www.instagram.com/smartbuildapp/" style="text-decoration:none;display:inline-block;margin-right:16px;">
                                            <img src="https://i.ibb.co/Swk8pH06/instragram-icon.png" alt="Instagram" style="width:20px;height:20px;display:block;">
                                        </a>
                                        <a href="https://www.linkedin.com/company/smartbuildapp/" style="text-decoration:none;display:inline-block;">
                                            <svg width="22" height="20" viewBox="0 0 22 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M4.93329 5.83333C6.21996 5.83333 7.26663 4.78667 7.26663 3.5C7.26663 2.21333 6.21996 1.16667 4.93329 1.16667C3.64663 1.16667 2.59996 2.21333 2.59996 3.5C2.59996 4.78667 3.64663 5.83333 4.93329 5.83333ZM4.93329 5.83333V18.8333M10.7666 9.33333V18.8333M10.7666 9.33333C10.7666 7.58333 12.5166 6.41667 14.2666 6.41667C16.0166 6.41667 18.35 7.58333 18.35 10.5V18.8333M10.7666 9.33333V6.41667" stroke="#595959" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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

