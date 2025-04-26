export const invoiceCustom = (name: string, logo: string, code: string, invoiceAmount: string, companyName: string, phone: string) => `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
  <head>
    <meta charset="UTF-8">
    <meta content="width=device-width, initial-scale=1" name="viewport">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta content="telephone=no" name="format-detection">
    <title>New Invoice</title>
    <style type="text/css">
      #outlook a { padding:0; }
      .ch { mso-style-priority:100!important; text-decoration:none!important; }
      a[x-apple-data-detectors] { color:inherit!important; text-decoration:none!important; font-size:inherit!important; font-family:inherit!important; font-weight:inherit!important; line-height:inherit!important; }
      .a { display:none; float:left; overflow:hidden; width:0; max-height:0; line-height:0; mso-hide:all; }
      @media only screen and (max-width:600px) {
        p, ul li, ol li, a { line-height:150%!important }
        h1, h2, h3, h1 a, h2 a, h3 a { line-height:120%!important }
        h1 { font-size:36px!important; text-align:left }
        h2 { font-size:26px!important; text-align:left }
        h3 { font-size:20px!important; text-align:left }
        .co p, .co ul li, .co ol li, .co a { font-size:14px!important }
        .cm p, .cm ul li, .cm ol li, .cm a { font-size:12px!important }
        *[class="gmail-fix"] { display:none!important }
        .cb table, .cc table, .cd table, .cb, .cd, .cc { width:100%!important; max-width:600px!important }
        .adapt-img { width:100%!important; height:auto!important }
      }
      @media screen and (max-width:384px) {
        .mail-message-content { width:414px!important }
      }
    </style>
  </head>
  <body style="width:100%;font-family:arial, 'helvetica neue', helvetica, sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0">
    <div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#FAFAFA">
      <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;padding:0;Margin:0;width:100%;height:100%;background-repeat:repeat;background-position:center top;background-color:#FAFAFA">
        <tr>
          <td valign="top" style="padding:0;Margin:0">
            <table cellpadding="0" cellspacing="0" class="cb" align="center" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;table-layout:fixed !important;width:100%">
              <tr>
                <td align="center" style="padding:0;Margin:0">
                  <table bgcolor="#ffffff" class="co" align="center" cellpadding="0" cellspacing="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#FFFFFF;width:600px">
                    <tr>
                      <td align="left" style="padding:0;Margin:0;padding-top:15px;padding-left:20px;padding-right:20px">
                        <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                          <tr>
                            <td align="center" valign="top" style="padding:0;Margin:0;width:560px">
                              <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                <tr>
                                  <td align="center" style="padding:0;Margin:0;padding-top:10px;padding-bottom:10px;font-size:0px">
                                    <img src="${logo}" alt="" style="display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" width="180" height="180">
                                  </td>
                                </tr>
                                <tr>
                                  <td align="left" style="padding:0;Margin:0;padding-top:10px;padding-bottom:10px">
                                    <p style="Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:24px;color:#333333;font-size:16px">Hello, ${name},</p>
                                    <br>
                                    <p style="Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;color:#333333;font-size:14px">Hope you're doing well! I am here to inform you that a new invoice for <strong>${invoiceAmount}</strong> is available for you! 🎉</p>
                                    <br><br>
                                    <p style="Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;color:#333333;font-size:14px">If you have any questions, we're here to help! 😉</p>
                                    <br>
                                    <p style="Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;color:#333333;font-size:14px">Best regards,</p>
                                    <p style="Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;color:#333333;font-size:14px">${companyName}<br>${phone}</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
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

