const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

export function workOrderEmail(data: {
  recipientName: string;
  companyName: string;
  companyLogo?: string;
  number: number;
  projectName?: string;
  startDate: Date;
  endDate: Date;
  reviewLink: string;
  message?: string;
}) {
  const date = (value: Date) => value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const logo = data.companyLogo
    ? `<img src="${escapeHtml(data.companyLogo)}" alt="${escapeHtml(data.companyName)}" style="display:block;max-width:150px;max-height:54px;object-fit:contain">`
    : `<div style="font-size:20px;font-weight:700;color:#101827">${escapeHtml(data.companyName)}</div>`;
  const projectRow = data.projectName
    ? `<tr><td style="padding:16px 0;color:#6b7280;font-size:12px">PROJECT</td><td align="right" style="padding:16px 0;font-weight:700">${escapeHtml(data.projectName)}</td></tr>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#101827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e5e7eb">
        <tr><td style="padding:28px 32px;border-bottom:3px solid #b99155">${logo}</td></tr>
        <tr><td style="padding:34px 32px">
          <div style="font-size:11px;letter-spacing:2px;color:#b07d36;font-weight:700">WORK ORDER #${data.number}</div>
          <h1 style="margin:10px 0 18px;font-size:26px;line-height:1.25">Work order ready for review</h1>
          <p style="margin:0 0 18px;line-height:1.6;color:#4b5563">Hello ${escapeHtml(data.recipientName)},</p>
          <p style="margin:0 0 24px;line-height:1.6;color:#4b5563">${escapeHtml(data.message || `${data.companyName} has sent you a work order for the project below.`)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
            ${projectRow}
            <tr><td style="padding:0 0 16px;color:#6b7280;font-size:12px">SCHEDULE</td><td align="right" style="padding:0 0 16px">${date(data.startDate)} - ${date(data.endDate)}</td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 20px"><tr><td style="background:#101827;border-radius:5px">
            <a href="${escapeHtml(data.reviewLink)}" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Review &amp; Sign Work Order</a>
          </td></tr></table>
          <p style="margin:0;line-height:1.6;color:#4b5563">A PDF copy is attached for reference. Use the button above to approve and sign the current work order.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8f8f8;color:#6b7280;font-size:12px">Sent by ${escapeHtml(data.companyName)}</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}
