interface ContractEmailTemplateData {
  companyName: string;
  companyAvatar?: string;
  clientName: string;
  contractNumber: number;
  reviewLink: string;
  authCode?: string | null;
  body?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBody(body?: string) {
  if (!body?.trim()) return "";
  return escapeHtml(body.trim()).replace(/\n/g, "<br />");
}

export function contractEmailTemplate({
  companyName,
  companyAvatar,
  clientName,
  contractNumber,
  reviewLink,
  authCode,
  body,
}: ContractEmailTemplateData) {
  const safeCompanyName = escapeHtml(companyName || "SmartBuild");
  const safeClientName = escapeHtml(clientName || "Customer");
  const safeReviewLink = escapeHtml(reviewLink);
  const safeCompanyAvatar = companyAvatar ? escapeHtml(companyAvatar) : "";
  const safeAuthCode = authCode ? escapeHtml(authCode) : "";
  const customBody = formatBody(body);

  const messageHtml = customBody || `
    ${safeCompanyName} sent you a contract to review and sign. Please open the secure link below, review the attached PDF and complete your signature.
  `;

  return `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Contract #${contractNumber} Ready for Signature</title>
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
            .company-logo { max-width: 120px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#F2F2F2;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F2F2;">
        <tr>
            <td align="center">
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

                    <tr>
                        <td style="background-color:#121212;padding:32px 32px;text-align:left;">
                            <a href="https://app.prosmartbuild.com/" style="text-decoration:none;display:inline-block;">
                                <img src="https://assets-codelabs-dev.s3.sa-east-1.amazonaws.com/smart-header-logo.png" alt="SmartBuild" style="height:32px;display:block;max-width:160px;">
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding:32px 24px 8px;">
                            <div style="display:inline-block;background-color:rgba(166,133,92,0.14);color:#92764D;padding:4px 12px;border-radius:999px;font-family:'Inter',-apple-system,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;">
                                Contract
                            </div>
                            <h1 style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:#121212;margin:0;line-height:1.4;">
                                Contract #${contractNumber} ready for signature
                            </h1>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#6B6B6B;margin:8px 0 0 0;font-weight:400;">
                                Sent by ${safeCompanyName}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding:24px 24px 24px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0 0 16px 0;font-weight:600;">
                                Hello, ${safeClientName}.
                            </p>
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:16px;color:#121212;margin:0;line-height:1.5;font-weight:400;">
                                ${messageHtml}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <div style="background-color:rgba(18,18,18,0.03);padding:28px 24px;border-radius:0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding:0;vertical-align:middle;">
                                            ${safeCompanyAvatar ? `
                                                <img class="company-logo" src="${safeCompanyAvatar}" alt="${safeCompanyName}" style="height:auto;max-height:48px;max-width:150px;display:block;object-fit:contain;">
                                            ` : `
                                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:18px;color:#121212;margin:0;font-weight:600;line-height:1.4;">
                                                    ${safeCompanyName}
                                                </p>
                                            `}
                                        </td>
                                        <td align="right" style="padding:0;vertical-align:middle;">
                                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B6B6B;margin:0 0 6px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                                                Contract number
                                            </p>
                                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:18px;color:#121212;margin:0;font-weight:600;">
                                                ${contractNumber}
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>

                    ${safeAuthCode ? `
                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <div style="background-color:rgba(166,133,92,0.10);border-left:4px solid #A6855C;padding:20px 24px;border-radius:0;">
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#6B6B6B;margin:0 0 8px 0;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                                    Authentication code
                                </p>
                                <p style="font-family:'Inter',-apple-system,sans-serif;font-size:24px;color:#121212;margin:0;font-weight:700;letter-spacing:0.12em;">
                                    ${safeAuthCode}
                                </p>
                            </div>
                        </td>
                    </tr>
                    ` : ""}

                    <tr>
                        <td class="content-padding" style="padding:0 24px 32px;">
                            <a href="${safeReviewLink}" style="display:block;background-color:#A6855C;color:#FFFFFF;padding:12px 18px;border-radius:4px;text-decoration:none;font-family:'Inter',-apple-system,sans-serif;font-size:16px;font-weight:600;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
                                Review and sign contract
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding:0 24px 24px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#595959;margin:0;line-height:1.5;">
                                If the button does not work, copy and paste this link into your browser:
                                <a href="${safeReviewLink}" style="color:#A6855C;text-decoration:none;word-break:break-all;">${safeReviewLink}</a>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:0 24px;">
                            <div style="height:1px;background-color:#E5E7EB;"></div>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding:24px 24px 14px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0 0 14px 0;line-height:1.4;">
                                This is an automated notification from ${safeCompanyName}. If you have any questions, please contact the company directly.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding:0 24px 40px;">
                            <p style="font-family:'Inter',-apple-system,sans-serif;font-size:14px;color:#595959;margin:0;">
                                &copy; SmartBuild ${new Date().getFullYear()}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:0 24px;">
                            <div style="height:1px;background-color:#E5E7EB;"></div>
                        </td>
                    </tr>

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
