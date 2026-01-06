export const permissionKeyApprovalEmail = (
    requesterName: string,
    requesterEmail: string,
    keyId: string,
    rawKey: string,
    secret: string
) => {
    const approveUrl = `${process.env.URL_API}/permissions-key/${keyId}/approve?secret=${secret}`;
    const rejectUrl = `${process.env.URL_API}/permissions-key/${keyId}/reject?secret=${secret}`;

    return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Permission Key Approval Request</title>
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
                                <img src="https://i.ibb.co/RG50Jkz7/logo-header.png" alt="SmartBuild" style="height:32px;display:block;max-width:160px;">
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Badge e Título -->
                    <tr>
                        <td class="content-padding" style="padding:32px 24px;">
                            <div style="display:inline-block;background-color:#A6855C;color:#FFFFFF;padding:4px 12px;border-radius:999px;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;">
                                KEY REQUEST
                            </div>
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:#121212;margin:0;line-height:1.4;">
                                New Permission Key Request
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Requester Info -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 16px 0;line-height:1.5;font-weight:400;">
                                A new sensitive action key has been requested by:
                            </p>
                            <div style="background-color:rgba(18,18,18,0.03);padding:24px;border-radius:4px;margin-bottom:32px;">
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0 0 8px 0;">
                                    <span style="font-weight:600;">Name:</span> ${requesterName}
                                </p>
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#121212;margin:0 0 16px 0;">
                                    <span style="font-weight:600;">Email:</span> ${requesterEmail}
                                </p>
                                <div style="border-top:1px solid #E5E7EB;padding-top:16px;">
                                    <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B6B6B;margin:0 0 4px 0;text-transform:uppercase;font-weight:600;">
                                        Generated Key (Copy and share only after approval)
                                    </p>
                                    <p style="font-family:'Courier New', monospace;font-size:14px;color:#121212;background-color:#FFFFFF;padding:12px;border:1px dashed #A6855C;border-radius:4px;word-break:break-all;">
                                        ${rawKey}
                                    </p>
                                </div>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Action Buttons -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="48%">
                                        <a href="${approveUrl}" style="display:block;background-color:#1E9B5C;color:#FFFFFF;padding:12px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                            Approve Key
                                        </a>
                                    </td>
                                    <td width="4%">&nbsp;</td>
                                    <td width="48%">
                                        <a href="${rejectUrl}" style="display:block;background-color:#D92D20;color:#FFFFFF;padding:12px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                            Reject Request
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer Info -->
                    <tr>
                        <td class="content-padding" style="padding:0 24px 14px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This is an automated security notification. If you did not expect this request, please reject it immediately.
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
                                            <img src="https://i.ibb.co/jPVYCxJr/logo-footer.png" alt="SmartBuild" style="height:24px;display:block;max-width:121px;">
                                        </a>
                                    </td>
                                    <td align="right" valign="middle" style="vertical-align:middle;">
                                        <a href="https://www.instagram.com/smartbuildapp/" style="text-decoration:none;display:inline-block;margin-right:16px;">
                                            <img src="https://i.ibb.co/Swk8pH06/instragram-icon.png" alt="Instagram" style="width:20px;height:20px;display:block;">
                                        </a>
                                        <a href="https://www.linkedin.com/company/smartbuildapp/" style="text-decoration:none;display:inline-block;">
                                            <svg width="22" height="20" viewBox="0 0 22 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M4.93329 5.83333C6.21996 5.83333 7.26663 4.78667 7.26663 3.5C7.26663 2.21333 6.21996 1.16667 4.93329 1.16667C3.64663 1.16667 2.59996 2.21333 2.59996 3.5C2.59996 4.78667 3.64663 5.83333 4.93329 5.83333ZM4.93329 5.83333V18.8333M10.7666 9.33333V18.8333M10.7666 9.33333C10.7666 7.58333 12.5166 6.41667 14.2666 6.41667C16.0166 6.41667 18.35 7.58333 18.35 10.5V18.8333M10.7666 9.33333V6.41667" stroke="#595959" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                            </svg>
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

