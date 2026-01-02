/**
 * Template de email de confirmação de pagamento QuickBooks para o cliente
 */
export function quickBooksPaymentConfirmation(
  clientName: string,
  companyLogo: string,
  invoiceCode: string,
  formattedAmount: string,
  companyName: string,
  companyPhone?: string,
  companyEmail?: string
): string {
  const contactInfo = [];
  if (companyPhone) contactInfo.push(`Phone: ${companyPhone}`);
  if (companyEmail) contactInfo.push(`Email: ${companyEmail}`);
  const contactHtml = contactInfo.length > 0
    ? `<p style="margin: 0; color: #666; font-size: 14px;">${contactInfo.join(' | ')}</p>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 40px; text-align: center;">
                            ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" style="max-width: 150px; height: auto; margin-bottom: 20px; border-radius: 8px; background-color: white; padding: 10px;" />` : ''}
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Payment Confirmed!</h1>
                            <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">via QuickBooks</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <p style="margin: 0 0 20px 0; color: #333; font-size: 16px; line-height: 1.6;">
                                Dear <strong>${clientName}</strong>,
                            </p>
                            <p style="margin: 0 0 20px 0; color: #555; font-size: 15px; line-height: 1.6;">
                                We are pleased to confirm that your payment has been successfully processed through QuickBooks.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Payment Details Card -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 8px; overflow: hidden;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h2 style="margin: 0 0 15px 0; color: #2E7D32; font-size: 18px;">Payment Details</h2>
                                        
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px 0; color: #666; font-size: 14px; border-bottom: 1px solid #e0e0e0;">Invoice Number:</td>
                                                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid #e0e0e0;">#${invoiceCode}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #666; font-size: 14px; border-bottom: 1px solid #e0e0e0;">Payment Amount:</td>
                                                <td style="padding: 8px 0; color: #2E7D32; font-size: 16px; font-weight: 700; text-align: right; border-bottom: 1px solid #e0e0e0;">${formattedAmount}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #666; font-size: 14px;">Payment Method:</td>
                                                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right;">QuickBooks</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Thank You Message -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <p style="margin: 0; color: #555; font-size: 15px; line-height: 1.6;">
                                Thank you for your prompt payment. Your transaction has been successfully recorded in our QuickBooks system.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Questions Section -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #f1f8f4; border-left: 4px solid #4CAF50; padding: 15px 20px; border-radius: 4px;">
                                <p style="margin: 0; color: #333; font-size: 14px; line-height: 1.6;">
                                    <strong>Questions?</strong> If you have any questions about this payment or need additional information, please don't hesitate to contact us.
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0 0 10px 0; color: #333; font-size: 16px; font-weight: 600;">${companyName}</p>
                            ${contactHtml}
                            <p style="margin: 15px 0 0 0; color: #999; font-size: 12px;">
                                This is an automated confirmation email.<br/>
                                Please do not reply directly to this message.
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
}

