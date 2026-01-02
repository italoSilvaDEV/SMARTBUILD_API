/**
 * Template de email de notificação de pagamento QuickBooks para a empresa
 */
export function quickBooksPaymentNotificationCompany(
  companyName: string,
  invoiceCode: string,
  formattedAmount: string,
  clientName: string,
  contractNumber?: string,
  paymentHistory?: Array<{ date: string; amount: string; method?: string }>,
  remainingBalance?: string,
  totalInvoiceAmount?: string
): string {
  const hasMultiplePayments = paymentHistory && paymentHistory.length > 0;
  const isPartialPayment = remainingBalance && parseFloat(remainingBalance.replace(/[^0-9.-]+/g, "")) > 0;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Received Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1565C0 0%, #1976D2 100%); padding: 40px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${isPartialPayment ? ' Partial Payment Received' : '✓ Payment Received'}</h1>
                            <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">via QuickBooks</p>
                        </td>
                    </tr>
                    
                    <!-- Success Badge -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center;">
                            <div style="display: inline-block; background-color: ${isPartialPayment ? '#FF9800' : '#4CAF50'}; color: white; padding: 10px 30px; border-radius: 25px; font-size: 16px; font-weight: 600;">
                                ${isPartialPayment ? ' Partial Payment' : '✓ Payment Confirmed'}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <p style="margin: 0 0 20px 0; color: #333; font-size: 16px; line-height: 1.6;">
                                Hello <strong>${companyName}</strong> Team,
                            </p>
                            <p style="margin: 0 0 20px 0; color: #555; font-size: 15px; line-height: 1.6;">
                                ${isPartialPayment 
                                  ? 'A partial payment has been successfully processed through QuickBooks and recorded in your account.' 
                                  : 'Great news! A payment has been successfully processed through QuickBooks and recorded in your account.'}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Payment Details Card -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 8px; overflow: hidden;">
                                <tr>
                                    <td style="padding: 25px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1565C0; font-size: 18px; border-bottom: 2px solid #1976D2; padding-bottom: 10px;">Payment Summary</h2>
                                        
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 10px 0; color: #666; font-size: 14px; border-bottom: 1px solid #e0e0e0;">
                                                    <strong>Invoice Number:</strong>
                                                </td>
                                                <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid #e0e0e0;">
                                                    #${invoiceCode}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 10px 0; color: #666; font-size: 14px; border-bottom: 1px solid #e0e0e0;">
                                                    <strong>Client:</strong>
                                                </td>
                                                <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid #e0e0e0;">
                                                    ${clientName}
                                                </td>
                                            </tr>
                                            ${contractNumber ? `
                                            <tr>
                                                <td style="padding: 10px 0; color: #666; font-size: 14px; border-bottom: 1px solid #e0e0e0;">
                                                    <strong>Contract:</strong>
                                                </td>
                                                <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid #e0e0e0;">
                                                    ${contractNumber}
                                                </td>
                                            </tr>
                                            ` : ''}
                                            <tr>
                                                <td style="padding: 10px 0; color: #666; font-size: 14px; border-bottom: 1px solid #e0e0e0;">
                                                    <strong>Payment Method:</strong>
                                                </td>
                                                <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid #e0e0e0;">
                                                    QuickBooks
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 15px 0 10px 0; color: #666; font-size: 15px;">
                                                    <strong>${isPartialPayment ? 'Payment Amount:' : 'Amount Received:'}</strong>
                                                </td>
                                                <td style="padding: 15px 0 10px 0; color: #4CAF50; font-size: 22px; font-weight: 700; text-align: right;">
                                                    ${formattedAmount}
                                                </td>
                                            </tr>
                                            ${isPartialPayment && totalInvoiceAmount ? `
                                            <tr>
                                                <td style="padding: 10px 0; color: #666; font-size: 14px; border-top: 1px solid #e0e0e0;">
                                                    <strong>Total Invoice Amount:</strong>
                                                </td>
                                                <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: 600; text-align: right; border-top: 1px solid #e0e0e0;">
                                                    ${totalInvoiceAmount}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 10px 0; color: #666; font-size: 15px; border-top: 2px solid #FF9800;">
                                                    <strong>Remaining Balance:</strong>
                                                </td>
                                                <td style="padding: 10px 0; color: #FF9800; font-size: 18px; font-weight: 700; text-align: right; border-top: 2px solid #FF9800;">
                                                    ${remainingBalance}
                                                </td>
                                            </tr>
                                            ` : ''}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    ${hasMultiplePayments ? `
                    <!-- Payment History -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table style="width: 100%; border-collapse: collapse; background-color: #fff3e0; border-radius: 8px; overflow: hidden; border: 2px solid #FF9800;">
                                <tr>
                                    <td style="padding: 25px;">
                                        <h2 style="margin: 0 0 20px 0; color: #E65100; font-size: 18px; border-bottom: 2px solid #FF9800; padding-bottom: 10px;">
                                             Payment History
                                        </h2>
                                        
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <thead>
                                                <tr style="background-color: #FFE0B2;">
                                                    <th style="padding: 12px 8px; text-align: left; color: #E65100; font-size: 13px; font-weight: 600; border-bottom: 2px solid #FF9800;">
                                                        Date
                                                    </th>
                                                    <th style="padding: 12px 8px; text-align: left; color: #E65100; font-size: 13px; font-weight: 600; border-bottom: 2px solid #FF9800;">
                                                        Method
                                                    </th>
                                                    <th style="padding: 12px 8px; text-align: right; color: #E65100; font-size: 13px; font-weight: 600; border-bottom: 2px solid #FF9800;">
                                                        Amount
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${paymentHistory.map((payment, index) => `
                                                <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#FFF8E1'};">
                                                    <td style="padding: 10px 8px; color: #555; font-size: 13px; border-bottom: 1px solid #FFE0B2;">
                                                        ${payment.date}
                                                    </td>
                                                    <td style="padding: 10px 8px; color: #555; font-size: 13px; border-bottom: 1px solid #FFE0B2;">
                                                        ${payment.method || 'QuickBooks'}
                                                    </td>
                                                    <td style="padding: 10px 8px; color: #2E7D32; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid #FFE0B2;">
                                                        ${payment.amount}
                                                    </td>
                                                </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                        
                                        <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #FF9800;">
                                            <p style="margin: 0; color: #E65100; font-size: 14px; font-weight: 600; text-align: center;">
                                                Total Payments: ${paymentHistory.length} • ${isPartialPayment ? 'More payments expected' : 'Invoice fully paid'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    ` : ''}
                    
                    
                    <!-- Action Reminder -->
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: ${isPartialPayment ? '#FFF3E0' : '#E3F2FD'}; border-left: 4px solid ${isPartialPayment ? '#FF9800' : '#1976D2'}; padding: 20px; border-radius: 4px;">
                                <h3 style="margin: 0 0 10px 0; color: ${isPartialPayment ? '#E65100' : '#1565C0'}; font-size: 16px;">📌 Next Steps</h3>
                                <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
                                    <li>This payment has been automatically recorded in QuickBooks</li>
                                    ${isPartialPayment 
                                      ? '<li>The invoice status has been updated to <strong>"Partially Paid"</strong></li><li>Remaining balance: <strong>' + (remainingBalance || '$0.00') + '</strong></li><li>Additional payments can be made using the same invoice link</li>' 
                                      : '<li>The invoice status has been updated to <strong>"Paid"</strong></li><li>No further action is required</li>'}
                                    <li>You can view full details in your QuickBooks dashboard</li>
                                </ul>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Status Indicator -->
                    <tr>
                        <td style="padding: 0 40px 40px; text-align: center;">
                            <div style="display: inline-block; background-color: #f1f8f4; padding: 15px 30px; border-radius: 8px; border: 1px solid #4CAF50;">
                                <p style="margin: 0; color: #2E7D32; font-size: 14px; font-weight: 600;">
                                    ✓ Automatically synced with QuickBooks
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0 0 5px 0; color: #333; font-size: 16px; font-weight: 600;">${companyName}</p>
                            <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                                This is an automated notification from your QuickBooks integration.<br/>
                                Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

