export const invoicePaymentRequiresAction = (
    clientName: string, 
    companyLogo: string, 
    invoiceCode: string, 
    invoiceAmount: string, 
    companyName: string,
    verificationUrl: string,
    arrivalDate: string,
    companyPhone?: string,
    companyEmail?: string
) => {
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
    <title>Action Required - Invoice ${invoiceCode}</title>
    
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
        .action-icon {
            background-color: #ff9800;
            color: white;
            border-radius: 50%;
            display: inline-block;
            width: 50px;
            height: 50px;
            line-height: 50px;
            text-align: center;
            font-size: 24px;
            margin: 10px auto;
        }
        .cta-button {
            display: inline-block;
            padding: 15px 30px;
            background-color: #007bff;
            color: white !important;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            font-size: 16px;
            margin: 20px 0;
        }
        .cta-button:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body style="width:100%;font-family:arial, 'helvetica neue', helvetica, sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0">
    <div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#F6F6F6">
        <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" role="none" style="border-collapse: collapse;">
            <tr>
                <td valign="top" align="center">
                    <!-- Header with Logo -->
                    <table class="o" cellspacing="0" cellpadding="0" align="center" style="border-collapse: collapse; width: 600px;">
                        <tr>
                            <td align="center">
                                <table class="bb" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center" width="600" style="border-collapse: collapse;">
                                    <tr>
                                        <td align="center" style="padding:20px;font-size:0px">
                                            <img class="adapt-img" src="${companyLogo}" alt="Company Logo" style="max-width:120px; height:auto; display:block; margin:0 auto;">
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Action Required Banner -->
                    <table class="o" cellspacing="0" cellpadding="0" align="center" style="border-collapse: collapse; margin: 0; width: 600px;">
                        <tr>
                            <td align="center" style="padding: 0;">
                                <table bgcolor="#ffffff" class="bb" align="center" width="600" style="border-collapse: collapse; margin: 0;">
                                    <tr>
                                        <td align="center" bgcolor="#fff3cd" style="padding:30px; margin: 0; border: 1px solid #ffeaa7;">
                                            <p style="font-size:18px;color:#856404;margin:0;text-align:center;font-weight:bold;">Action Required to Complete Payment</p>
                                            <p style="font-size:16px;color:#856404;margin:10px 0 0 0;text-align:center;">Invoice #${invoiceCode}</p>
                                            <p style="font-size:14px;color:#856404;margin:5px 0 0 0;text-align:center;">Amount: ${formattedValue}</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Main Content -->
                    <table class="o" cellspacing="0" cellpadding="0" align="center" style="border-collapse: collapse; margin: 0; width: 600px;">
                        <tr>
                            <td align="center" style="padding: 0;">
                                <table bgcolor="#ffffff" class="bb" align="center" width="600" style="border-collapse: collapse; margin: 0;">
                                    <tr>
                                        <td align="center" style="padding:30px; margin: 0;">
                                            <div style="font-size:14px;color:#333333;line-height:1.6;text-align:center;max-width:500px;margin:0 auto;">
                                                <p style="font-size:16px;color:#333333;margin:0;text-align:center;font-weight:bold;">Dear ${clientName},</p>
                                                
                                                <p style="font-size:14px;color:#333333;margin:20px 0;text-align:center;">
                                                    To complete your bank account payment, we need to verify your bank account with microdeposits.
                                                </p>
                                                
                                                <div style="background-color:#f8f9fa;border:1px solid #dee2e6;border-radius:5px;padding:20px;margin:20px 0;">
                                                    <p style="font-size:14px;color:#333333;margin:5px 0;text-align:center;"><strong>Invoice Number:</strong> #${invoiceCode}</p>
                                                    <p style="font-size:14px;color:#333333;margin:5px 0;text-align:center;"><strong>Payment Amount:</strong> ${formattedValue}</p>
                                                    <p style="font-size:14px;color:#333333;margin:5px 0;text-align:center;"><strong>Status:</strong> <span style="color:#ff9800;font-weight:bold;">REQUIRES ACTION</span></p>
                                                </div>
                                                
                                                <div style="background-color:#e7f3ff;border:1px solid #bee5eb;border-radius:5px;padding:15px;margin:20px 0;">
                                                    <p style="font-size:14px;color:#0c5460;margin:0;text-align:center;font-weight:bold;">📋 How to Complete Verification</p>
                                                    <p style="font-size:13px;color:#0c5460;margin:10px 0 0 0;text-align:center;">
                                                        <strong>Step 1:</strong> We deposited $0.01 in your bank account on <strong>${arrivalDate}</strong><br><br>
                                                        <strong>Step 2:</strong> Check your bank statement for a transaction starting with <strong>"SM"</strong><br><br>
                                                        <strong>Step 3:</strong> Enter the 6-digit code from the transaction description (Example: <strong>SMXXXX</strong>)<br><br>
                                                    </p>
                                                </div>
                                                
                                                <div style="background-color:#fff8e1;border:1px solid #ffcc02;border-radius:5px;padding:15px;margin:20px 0;">
                                                    <p style="font-size:14px;color:#856404;margin:0;text-align:center;font-weight:bold;">📝 Example of what to look for:</p>
                                                    <p style="font-size:13px;color:#856404;margin:10px 0 0 0;text-align:center;">
                                                        In your bank statement:<br>
                                                        <strong>SMXXXX</strong> → $0.01<br><br>
                                                        Enter the 6-digit code that starts with "SM"
                                                    </p>
                                                </div>
                                                
                                                <a href="${verificationUrl}" class="cta-button" style="color: white; text-decoration: none;">
                                                    ✓ Verify Bank Account Now
                                                </a>
                                                
                                                <p style="font-size:12px;color:#888888;margin:20px 0;text-align:center;">
                                                    Or copy and paste this link in your browser:<br>
                                                    <a href="${verificationUrl}" style="color:#007bff;word-break:break-all;">${verificationUrl}</a>
                                                </p>
                                                
                                                <div style="background-color:#ffebee;border:1px solid #f44336;border-radius:5px;padding:15px;margin:20px 0;">
                                                    <p style="font-size:14px;color:#c62828;margin:0;text-align:center;font-weight:bold;">⏰ Important</p>
                                                    <p style="font-size:13px;color:#c62828;margin:10px 0 0 0;text-align:center;">
                                                        Your payment will not be processed until you complete the verification.<br>
                                                        This is a one-time verification to secure your bank account for future payments.
                                                    </p>
                                                </div>
                                                
                                                <p style="font-size:14px;color:#333333;margin:20px 0;text-align:center;">
                                                    If you have any questions or need assistance, please don't hesitate to contact us.
                                                </p>
                                                
                                                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                                                
                                                <p style="font-size:16px;color:#333333;margin:10px 0;text-align:center;font-weight:bold;">${companyName}</p>
                                                ${companyPhone ? `<p style="font-size:14px;color:#666666;margin:5px 0;text-align:center;">📞 ${companyPhone}</p>` : ''}
                                                ${companyEmail ? `<p style="font-size:14px;color:#666666;margin:5px 0;text-align:center;">✉️ ${companyEmail}</p>` : ''}
                                                
                                                <p style="font-size:12px;color:#888888;margin:20px 0 0 0;text-align:center;font-style:italic;">
                                                    This is an automated notification email. Please keep this for your records.
                                                </p>
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


