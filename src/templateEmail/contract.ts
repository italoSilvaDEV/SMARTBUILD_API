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
  const customBody = formatBody(body);

  return `
    <div style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:28px 32px;border-bottom:1px solid #e4e4e7;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td>
                        ${companyAvatar ? `<img src="${companyAvatar}" alt="${safeCompanyName}" style="height:42px;max-width:160px;object-fit:contain;" />` : `<div style="font-size:18px;font-weight:700;">${safeCompanyName}</div>`}
                      </td>
                      <td align="right" style="font-size:13px;color:#71717a;">Contract #${contractNumber}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;color:#18181b;">Contract ready for signature</h1>
                  <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3f3f46;">Hi ${safeClientName},</p>
                  <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3f3f46;">
                    ${customBody || `${safeCompanyName} sent you a contract to review and sign.`}
                  </p>
                  ${authCode ? `
                    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px 16px;margin:20px 0;">
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#71717a;margin-bottom:6px;">Authentication code</div>
                      <div style="font-size:22px;font-weight:700;letter-spacing:.12em;color:#18181b;">${escapeHtml(authCode)}</div>
                    </div>
                  ` : ""}
                  <div style="margin:28px 0;">
                    <a href="${reviewLink}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 18px;font-size:15px;font-weight:600;">
                      Review and sign contract
                    </a>
                  </div>
                  <p style="font-size:13px;line-height:1.6;color:#71717a;margin:0;">
                    If the button does not work, copy and paste this link into your browser:<br />
                    <a href="${reviewLink}" style="color:#6f5b3e;word-break:break-all;">${reviewLink}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}
