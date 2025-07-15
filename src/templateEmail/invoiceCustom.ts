export const invoiceCustom = (name: string, logo: string, code: string, invoiceAmount: string, companyName: string, phone: string) => {
    // Formatar o valor para mostrar em dólares
    const formattedValue = invoiceAmount.includes('$') 
        ? invoiceAmount 
        : `$${parseFloat(invoiceAmount.replace(/[^\d.-]/g, '') || '0').toFixed(2)}`;

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="format-detection" content="telephone=no">
    <title>Invoice ${code}</title>
    
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
                                            <img class="adapt-img" src="${logo}" alt="Company Logo" style="max-width:120px; height:auto; display:block; margin:0 auto;">
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
                                        <td align="center" bgcolor="#cfebf6" style="padding:30px; margin: 0;">
                                            <p style="font-size:16px;color:#333333;margin:0;text-align:center;"><strong>Your Invoice #${code} is ready!</strong></p>
                                            <p style="font-size:12px;color:#333333;margin:0;text-align:center;">Total ${formattedValue}</p>
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
                                            <div style="font-size:14px;color:#333333;line-height:1.6;text-align:center;max-width:500px;margin:0 auto;">
                                                <p style="font-size:14px;color:#333333;margin:0;text-align:center;">Dear ${name}</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Hope you're doing well! I am here to inform you that a new invoice for <strong>${formattedValue}</strong> is available for you! 🎉</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">If you have any questions, we're here to help! 😉</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">Have a great day!</p>
                                                <p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;"><strong>${companyName}</strong></p>
                                                ${phone ? `<p style="font-size:14px;color:#333333;margin:10px 0 0 0;text-align:center;">${phone}</p>` : ''}
                                            </div>
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
};

