export const changeOrderEmail = (
    name: string,
    logo: string,
    company: string, 
    changeOrderNumber: string,
    estimateNumber: string,
    value: number,
    changeOrderId: string,
    email: string,
    customBody?: string
) => {
    // Formatar o valor como moeda em dólares
    const formattedValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);

    // Usar o corpo personalizado se fornecido, caso contrário usar o padrão
    const emailContent = customBody ? `${customBody}` : `
        <p style="font-size:14px;color:#333333;margin:0;text-align:center;">Dear ${name}</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">A change order has been created for your project estimate ${estimateNumber}.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Please review and approve the additional work scope and costs.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Feel free to contact us if you have any questions.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Have a great day!</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">${company}</p>
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
        <title>Change Order Notification</title>
        
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
                                            <td align="center" bgcolor="#fff3cd" style="padding:30px; margin: 0; border-left: 4px solid #ffc107;">
                                                <p style="font-size:16px;color:#333333;margin:0;text-align:center;"><strong>⚠️ Change Order ${changeOrderNumber}</strong></p>
                                                <p style="font-size:12px;color:#666666;margin:5px 0 0 0;text-align:center;">For Estimate ${estimateNumber}</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;"><strong>Additional Amount: ${formattedValue}</strong></p>
                                                <p style="font-size:12px;color:#333333;margin:15px 0;text-align:center;">
                                                  <a href="${process.env.URL_FRONT}/changeorder-response/${changeOrderId}" 
                                                     style="background-color:#ffc107;color:#333;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;margin-top:10px;font-size:14px;">
                                                    View Change Order
                                                  </a>
                                                </p>
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
                                                ${emailContent}
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

export const changeOrderApprovedEmail = (
    name: string,
    logo: string,
    company: string,
    changeOrderNumber: string,
    estimateNumber: string,
    value: number,
    changeOrderId: string,
    clientName: string,
    customBody?: string
) => {
    // Formatar o valor como moeda em dólares
    const formattedValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);

    // Usar o corpo personalizado se fornecido, caso contrário usar o padrão
    const emailContent = customBody ? `${customBody}` : `
        <p style="font-size:14px;color:#333333;margin:0;text-align:center;">Dear ${name}</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Great news! The change order you sent to ${clientName} has been approved.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">The client has reviewed and accepted the additional work scope and costs.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Feel free to contact us if you have any questions.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Have a great day!</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">${company}</p>
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
        <title>Change Order Approved</title>
        
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
                                            <td align="center" bgcolor="#d4edda" style="padding:30px; margin: 0; border-left: 4px solid #28a745;">
                                                <p style="font-size:16px;color:#333333;margin:0;text-align:center;"><strong>✅ Change Order ${changeOrderNumber} Approved</strong></p>
                                                <p style="font-size:12px;color:#666666;margin:5px 0 0 0;text-align:center;">For Estimate ${estimateNumber}</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;"><strong>Additional Amount: ${formattedValue}</strong></p>
                                                <p style="font-size:12px;color:#333333;margin:15px 0;text-align:center;">
                                                  <a href="${process.env.URL_FRONT}/changeorder/${changeOrderId}" 
                                                     style="background-color:#28a745;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;margin-top:10px;font-size:14px;">
                                                    View Change Order
                                                  </a>
                                                </p>
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
                                                ${emailContent}
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

