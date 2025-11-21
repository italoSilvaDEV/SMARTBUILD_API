export const invoicePaidPaymentEmail = (
    clientName: string,
    logo: string,
    company: string,
    invoiceNumber: string,
    paymentAmount: number,
    paymentDate: string,
    paymentMethod: string,
    customBody?: string
) => {
    // Formatar o valor como moeda em dólares
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(paymentAmount);

    // Formatar a data
    const formattedDate = new Date(paymentDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Usar o corpo personalizado se fornecido, caso contrário usar o padrão
    const emailContent = customBody ? `${customBody}` : `
        <p style="font-size:14px;color:#333333;margin:0;text-align:center;">Dear ${clientName}</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">We are pleased to confirm that Invoice #${invoiceNumber} has been paid successfully.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Thank you for your prompt payment.</p>
        <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">If you have any questions, please feel free to contact us.</p>
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
        <title>Invoice Payment Confirmation</title>
        
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
                                                <p style="font-size:16px;color:#155724;margin:0;text-align:center;"><strong>✅ Invoice #${invoiceNumber} - Payment Confirmed</strong></p>
                                                <p style="font-size:14px;color:#155724;margin:10px 0 0 0;text-align:center;"><strong>Payment Amount: ${formattedAmount}</strong></p>
                                                <p style="font-size:12px;color:#666666;margin:5px 0 0 0;text-align:center;">Payment Date: ${formattedDate}</p>
                                                <p style="font-size:12px;color:#666666;margin:5px 0 0 0;text-align:center;">Payment Method: ${paymentMethod}</p>
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

