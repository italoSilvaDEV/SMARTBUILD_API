export const invoiceCustom = (
    name: string, 
    logo: string, 
    code: string, 
    invoiceAmount: string, 
    companyName: string, 
    phone: string, 
    customBody?: string,
    customSubject?: string,
    invoiceType?: string,
    invoiceUrl?: string,
    invoiceId?: string,
    companyEmail?: string
) => {
    // Formatar o valor para mostrar em dólares

    // Determinar a URL correta baseada no tipo de invoice
    let paymentUrl = '';
    if (invoiceType === 'stripe') {
        paymentUrl = `${process.env.URL_FRONT}/pay/${invoiceId}`;
    } else if (invoiceType === 'quickbooks' && invoiceUrl) {
        paymentUrl = invoiceUrl; // URL do QuickBooks Online
    }

    const formattedValue = invoiceAmount.includes('$') 
        ? invoiceAmount 
        : `$${parseFloat(invoiceAmount.replace(/[^\d.-]/g, '') || '0').toFixed(2)}`;

    // Função para processar formatação markdown básica
    const processMarkdown = (text: string): string => {
        if (!text) return '';
        
        return text
            // Converter quebras de linha para <br>
            .replace(/\n/g, '<br>')
            // Converter **texto** para <strong>texto</strong>
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Converter *texto* para <em>texto</em>
            .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
            // Converter --- para linha horizontal
            .replace(/---/g, '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">')
            // Converter • para bullet points
            .replace(/• /g, '&bull; ');
    };

    // Usar o corpo personalizado processado se fornecido
    const emailContent = customBody ? processMarkdown(customBody) : `
        <p style="font-size:16px;color:#333333;margin:10px 0 0 0;line-height:1.6;">Hope you're doing well! I am here to inform you that a new invoice for <strong>${formattedValue}</strong> is available for you! 🎉</p>
        <p style="font-size:16px;color:#333333;margin:16px 0 0 0;line-height:1.6;">If you have any questions, we're here to help! 😉</p>
        <p style="font-size:16px;color:#333333;margin:16px 0 0 0;line-height:1.6;">Have a great day!</p>
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
    <title>Invoice ${code}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style type="text/css">
        * { margin: 0; padding: 0; }
        #outlook a { padding: 0; }
        .ReadMsgBody { width: 100%; }
        .ExternalClass { width: 100%; }
        body { 
            margin: 0; 
            padding: 0; 
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        a[x-apple-data-detectors] { 
            color: inherit !important; 
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #BC9C6B 0%, #A68B5B 100%);
            color: #ffffff !important;
            padding: 14px 32px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            display: inline-block;
            font-size: 15px;
            box-shadow: 0 4px 12px rgba(188, 156, 107, 0.25);
            transition: all 0.3s ease;
        }
        
        .btn-primary:hover {
            box-shadow: 0 6px 16px rgba(188, 156, 107, 0.35);
            transform: translateY(-1px);
        }
        
        @media only screen and (max-width:600px) {
            .email-container { width: 100% !important; }
            .content-wrapper { padding: 20px !important; }
            h1 { font-size: 24px !important; }
            .amount-display { font-size: 32px !important; }
            .btn-primary { padding: 12px 24px !important; font-size: 14px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;">
        <tr>
            <td align="center" style="padding:40px 20px;">
                
                <!-- Main Container -->
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
                    
                    <!-- Logo Section -->
                    <tr>
                        <td align="center" style="padding:32px 32px 24px;">
                            <img src="${logo}" alt="${companyName}" style="max-width:140px;height:auto;display:block;">
                        </td>
                    </tr>
                    
                    <!-- Hero Section -->
                    <tr>
                        <td align="center" style="padding:0 32px 32px;">
                            <h1 style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:700;color:#1a1a1a;margin:0 0 20px;line-height:1.3;">
                                ${customSubject || (invoiceType === 'stripe' ? `Your Invoice is Ready` : `Invoice #${code}`)}
                            </h1>
                            
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:600;color:#BC9C6B;margin:0;line-height:1.5;">
                                Hello, ${name}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Amount Card -->
                    <tr>
                        <td align="center" style="padding:0 32px 32px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);border-radius:12px;border:1px solid #e9ecef;">
                                <tr>
                                    <td align="center" style="padding:28px;">
                                        <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:13px;color:#666666;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">
                                            Total Amount
                                        </p>
                                        <p class="amount-display" style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:40px;font-weight:700;color:#BC9C6B;margin:0;line-height:1;">
                                            ${formattedValue}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Content Section -->
                    <tr>
                        <td class="content-wrapper" style="padding:0 48px 32px;">
                            <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;color:#333333;line-height:1.6;text-align:center;">
                                ${emailContent}
                                <p style="font-size:15px;color:#666666;margin:20px 0 0 0;line-height:1.6;">
                                    You can check all the details in the PDF attached to this email.
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    ${(invoiceType === 'stripe' || invoiceType === 'quickbooks') && paymentUrl ? `
                    <tr>
                        <td align="center" style="padding:0 32px 40px;">
                            <a href="${paymentUrl}" class="btn-primary" style="background:linear-gradient(135deg, #BC9C6B 0%, #A68B5B 100%);color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;font-size:15px;box-shadow:0 4px 12px rgba(188,156,107,0.25);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">
                                View & Pay Invoice
                            </a>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 32px;">
                            <div style="height:1px;background-color:#e9ecef;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding:32px;">
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#1a1a1a;margin:0 0 8px;">
                                ${companyName}
                            </p>
                            ${phone ? `
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#666666;margin:0;">
                                ${phone}
                            </p>
                            ` : ''}
                            ${companyEmail ? `
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#666666;margin:4px 0 0 0;">
                                ${companyEmail}
                            </p>
                            ` : ''}
                        </td>
                    </tr>
                    
                    <!-- Bottom Spacing -->
                    <tr>
                        <td style="height:20px;"></td>
                    </tr>
                    
                </table>
                
                <!-- Footer Note -->
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                    <tr>
                        <td align="center" style="padding:0 20px;">
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#999999;line-height:1.5;margin:0;">
                                This is an automated message. Please do not reply directly to this email.
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
};

