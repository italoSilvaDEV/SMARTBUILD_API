export const changeOrderApprovedEmail = (
    clientName: string,
    companyOwnerName: string,
    changeOrderNumber: string,
    estimateNumber: string,
    additionalAmount: number,
    changeOrderId: string,
    companyOwnerEmail: string,
    projectId: string
) => {
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(additionalAmount);

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Change Order Confirmed!</title>
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
                                Change Order Confirmed!
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Mensagem e Valor -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 32px 0;line-height:1.5;font-weight:400;">
                                ${clientName} approved Change Order #${changeOrderNumber}.
                            </p>
                            
                            <!-- Valor Aprovado -->
                            <div style="margin-bottom:32px;">
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B6B6B;margin:0 0 16px 0;font-weight:400;line-height:1.5;">
                                    Approved Additional
                                </p>
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;color:#079455;margin:0;font-weight:600;line-height:1;">
                                    + ${formattedAmount}
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <a href="${process.env.URL_FRONT}/seller/project/details/${projectId}?tab=ChangeOrders" 
                            style="display:block;background-color:#A6855C;color:#FFFFFF;padding:12px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                View Change Order
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Footer Info -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 14px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This email was sent to <a href="mailto:${companyOwnerEmail}" style="color:#A6855C;text-decoration:none;">${companyOwnerEmail}</a>. If you'd rather not receive this kind of email, you can <a href="#" style="color:#A6855C;text-decoration:none;">unsubscribe</a> or manage your email.
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

