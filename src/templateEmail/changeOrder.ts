export const changeOrderEmail = (
    name: string,
    logo: string,
    company: string,
    changeOrderNumber: string,
    estimateNumber: string,
    value: number,
    changeOrderId: string,
    email: string,
    projectLocation: string
) => {
    const formattedValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Change Order #${changeOrderNumber} Pending Approval</title>
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
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    
                    <!-- Header com Logo -->
                    <tr>
                        <td style="background-color:#121212;padding:32px 32px;text-align:left;">
                            <a href="https://app.prosmartbuild.com/" style="text-decoration:none;display:inline-block;">
                                <img src="https://assets-codelabs-dev.s3.sa-east-1.amazonaws.com/smart-header-logo.png" alt="SmartBuild" style="height:32px;display:block;max-width:160px;">
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Título -->
                    <tr>
                        <td class="content-padding" style="padding:32px 24px;">
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:#121212;margin:0;line-height:1.4;">
                                Change Order #${changeOrderNumber} Pending Approval
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Mensagem Principal -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 16px 0;font-weight:600;">
                                Hello, ${name}.
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 32px 0;line-height:1.5;font-weight:400;">
                                We have identified the need for changes to the original scope of the project.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Box com Total e Localização -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <div style="background-color:rgba(18,18,18,0.03);padding:32px 24px;border-radius:0;">
                                <!-- Total Amount -->
                                <div style="text-align:center;margin-bottom:20px;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B6B6B;margin:0 0 8px 0;font-weight:400;line-height:1.5;">
                                        Total Additional Amount
                                    </p>
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;color:#A6855C;margin:0;font-weight:600;line-height:1;">
                                        + ${formattedValue}
                                    </p>
                                </div>
                                
                                <!-- Location -->
                                <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                                    <tr>
                                        <td style="padding:0 8px 0 0;vertical-align:middle;">
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M10 10.8333C11.1506 10.8333 12.0833 9.90059 12.0833 8.74999C12.0833 7.59938 11.1506 6.66666 10 6.66666C8.84938 6.66666 7.91666 7.59938 7.91666 8.74999C7.91666 9.90059 8.84938 10.8333 10 10.8333Z" stroke="#121212" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                                <path d="M10 18.3333C13.3333 15 16.6667 12.0152 16.6667 8.74999C16.6667 5.48476 13.6819 2.5 10 2.5C6.31811 2.5 3.33333 5.48476 3.33333 8.74999C3.33333 12.0152 6.66666 15 10 18.3333Z" stroke="#121212" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                                            </svg>
                                        </td>
                                        <td style="padding:0;vertical-align:middle;">
                                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0;font-weight:400;line-height:1.7;">
                                                ${projectLocation}
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <a href="${process.env.URL_FRONT}/changeorder-response/${changeOrderId}" style="display:block;background-color:#A6855C;color:#FFFFFF;padding:12px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                View Change Order
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Footer Info -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 14px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This email was sent to <a href="mailto:${email}" style="color:#A6855C;text-decoration:none;">${email}</a>. If you'd rather not receive this kind of email, you can <a href="#" style="color:#A6855C;text-decoration:none;">unsubscribe</a> or manage your email.
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
}

export const changeOrderNotificationEmail = (
    name: string,
    logo: string,
    company: string,
    changeOrderNumber: string,
    estimateNumber: string,
    value: number,
    email: string,
    status: string
) => {
    // Formatar o valor como moeda em dólares
    const formattedValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);

    const statusMessage = status === "approved"
        ? "has been approved"
        : status === "rejected"
            ? "has been rejected"
            : "status has been updated";

    const statusColor = status === "approved" ? "#d4edda" : "#f8d7da";
    const statusIcon = status === "approved" ? "✅" : "❌";

    return `
    <!DOCTYPE html>
    <html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="x-apple-disable-message-reformatting">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="format-detection" content="telephone=no">
        <title>Change Order Status Update</title>
        
        <style type="text/css">
            #outlook a { padding: 0; }
            .u { mso-style-priority: 100 !important; text-decoration: none !important; }
            a[x-apple-data-detectors] { 
                color: inherit !important; 
                text-decoration: none !important;
                font-size: inherit !important;
                font-family: inherit !important;
                font-weight: inherit !important;
                line-height: inherit !important;
            }
            .a { display: none; float: left; overflow: hidden; width: 0; max-height: 0; line-height: 0; mso-hide: all; }
            @media only screen and (max-width:600px) {
                p, ul li, ol li, a { line-height: 150% !important; }
                h1, h2, h3, h1 a, h2 a, h3 a { line-height: 120% !important; }
                h1 { font-size: 30px !important; text-align: center; }
                h2 { font-size: 24px !important; text-align: center; }
                h3 { font-size: 20px !important; text-align: center; }
                .bb p, .bb ul li, .bb ol li, .bb a { font-size: 14px !important; }
                *[class="gmail-fix"] { display: none !important; }
                .r table, .s, .t { width: 100% !important; }
                .o table, .p table, .q table, .o, .q, .p { width: 100% !important; max-width: 600px !important; }
                .adapt-img { width: auto !important; height: auto !important; max-width: 100% !important; }
                .h { padding-bottom: 20px !important; }
            }
            body { margin: 0; padding: 0; }
            table { border-spacing: 0; }
            p { margin: 0; text-align: center; }
        </style>
    </head>
    <body style="width:100%;font-family:arial, 'helvetica neue', helvetica, sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0">
        <div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#F6F6F6">
            <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" role="none" style="border-collapse: collapse;">
                <tr>
                    <td valign="top" align="center">
                        <table class="o" cellspacing="0" cellpadding="0" align="center" style="border-collapse: collapse; width: 600px;">
                            <tr>
                                <td align="center">
                                    <table class="bb" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center" width="600" style="border-collapse: collapse;">
                                        <tr>
                                            <td align="center" style="padding:20px;font-size:0px">
                                                <img class="adapt-img" src="${logo}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" width="143">
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <table class="o" cellspacing="0" cellpadding="0" align="center" style="border-collapse: collapse; margin: 0; width: 600px;">
                            <tr>
                                <td align="center" style="padding: 0;">
                                    <table bgcolor="#ffffff" class="bb" align="center" width="600" style="border-collapse: collapse; margin: 0;">
                                        <tr>
                                            <td align="center" bgcolor="${statusColor}" style="padding:30px; margin: 0;">
                                                <p style="font-size:16px;color:#333333;margin:0;text-align:center;"><strong>${statusIcon} Change Order ${changeOrderNumber} ${statusMessage}</strong></p>
                                                <p style="font-size:12px;color:#666666;margin:5px 0 0 0;text-align:center;">Estimate ${estimateNumber}</p>
                                                <p style="font-size:12px;color:#333333;margin:10px 0 0 0;text-align:center;">By: ${email}</p>
                                                <p style="font-size:14px;color:#333333;margin:5px 0 0 0;text-align:center;">Amount: ${formattedValue}</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <table class="o" cellspacing="0" cellpadding="0" align="center" style="border-collapse: collapse; margin: 0; width: 600px;">
                            <tr>
                                <td align="center" style="padding: 0;">
                                    <table bgcolor="#ffffff" class="bb" align="center" width="600" style="border-collapse: collapse; margin: 0;">
                                        <tr>
                                            <td align="center" style="padding:20px; margin: 0;">
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Have a great day!</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">${company}</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
    </body>
    </html>
    `;
}

