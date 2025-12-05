export const invoicePaidReceiptEmail = (
    clientName: string,
    logo: string,
    company: string,
    invoiceNumber: string,
    invoiceAmount: number,
    paymentDate: string,
    customBody?: string,
    phone?: string,
    companyEmail?: string
) => {
    // Formatar o valor como moeda em dólares
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(invoiceAmount);

    // Formatar a data
    const formattedDate = new Date(paymentDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

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

    // Usar o corpo personalizado processado se fornecido, caso contrário usar o padrão
    const emailContent = customBody ? processMarkdown(customBody) : `
        <p style="font-size:16px;color:#333333;margin:10px 0 0 0;line-height:1.6;">Great news! We have successfully received your payment of <strong>${formattedAmount}</strong> for Invoice #${invoiceNumber}. 🎉</p>
        <p style="font-size:16px;color:#333333;margin:16px 0 0 0;line-height:1.6;">Your payment receipt is attached to this email for your records.</p>
        <p style="font-size:16px;color:#333333;margin:16px 0 0 0;line-height:1.6;">Thank you for your business! We truly appreciate it. 😊</p>
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
    <title>Payment Receipt - Invoice ${invoiceNumber}</title>
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
        
        @media only screen and (max-width:600px) {
            .email-container { width: 100% !important; }
            .content-wrapper { padding: 20px !important; }
            h1 { font-size: 24px !important; }
            .amount-display { font-size: 32px !important; }
            .status-badge { font-size: 11px !important; padding: 6px 14px !important; }
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
                            <img src="${logo}" alt="${company}" style="max-width:140px;height:auto;display:block;">
                        </td>
                    </tr>
                    
                    <!-- Hero Section -->
                    <tr>
                        <td align="center" style="padding:0 32px 32px;">
                            <h1 style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:700;color:#1a1a1a;margin:0 0 12px;line-height:1.3;">
                                Payment Received! ✓
                            </h1>
                            
                            <!-- Status Badge -->
                            <div style="margin:0 0 20px;">
                                <span class="status-badge" style="display:inline-block;background:linear-gradient(135deg, #10b981 0%, #059669 100%);color:#ffffff;padding:8px 20px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;box-shadow:0 4px 12px rgba(16,185,129,0.25);">
                                    ✓ Paid on ${formattedDate}
                                </span>
                            </div>
                            
                            <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:600;color:#BC9C6B;margin:0;line-height:1.5;">
                                Hello, ${clientName}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Amount Card -->
                    <tr>
                        <td align="center" style="padding:0 32px 32px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);border-radius:12px;border:2px solid #10b981;">
                                <tr>
                                    <td align="center" style="padding:28px;">
                                        <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:13px;color:#065f46;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">
                                            Payment Amount
                                        </p>
                                        <p class="amount-display" style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:40px;font-weight:700;color:#059669;margin:0 0 8px;line-height:1;">
                                            ${formattedAmount}
                                        </p>
                                        <p style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:13px;color:#065f46;margin:0;font-weight:500;">
                                            Invoice #${invoiceNumber}
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
                                    Your payment receipt is attached to this email for your records.
                                </p>
                            </div>
                        </td>
                    </tr>
                    
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
                                ${company}
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
}

