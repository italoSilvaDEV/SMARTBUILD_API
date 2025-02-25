export const createPreviewContract = (name: string,logo: string,company: string, value: string) => `
<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="format-detection" content="telephone=no">
    <title>New Template 2</title>
    
    <style type="text/css">
        #outlook a { padding: 0; }
        .u { mso-style-priority: 100 !important; text-decoration: none !important; }
        a[x-apple-data-detectors] { 
            color: inherit !important; 
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        .a { display: none; float: left; overflow: hidden; width: 0; max-height: 0; line-height: 0; mso-hide: all; }
        @media only screen and (max-width:600px) {
            p, ul li, ol li, a { line-height: 150% !important; }
            h1, h2, h3, h1 a, h2 a, h3 a { line-height: 120% !important; }
            h1 { font-size: 30px !important; text-align: left; }
            h2 { font-size: 24px !important; text-align: left; }
            h3 { font-size: 20px !important; text-align: left; }
            .bb p, .bb ul li, .bb ol li, .bb a { font-size: 14px !important; }
            *[class="gmail-fix"] { display: none !important; }
            .r table, .s, .t { width: 100% !important; }
            .o table, .p table, .q table, .o, .q, .p { width: 100% !important; max-width: 600px !important; }
            .adapt-img { width: 100% !important; height: auto !important; }
            .h { padding-bottom: 20px !important; }
        }
    </style>
</head>
<body style="width:100%;font-family:arial, 'helvetica neue', helvetica, sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0">
    <div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#F6F6F6">
        <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" role="none">
            <tr>
                <td valign="top">
                    <table class="o" cellspacing="0" cellpadding="0" align="center">
                        <tr>
                            <td align="center">
                                <table class="bb" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center" width="600">
                                    <tr>
                                        <td align="center" style="padding:20px;font-size:0px">
                                            <img class="adapt-img" src="${logo}" width="143" height="54">
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <table class="o" cellspacing="0" cellpadding="0" align="center">
                        <tr>
                            <td align="center">
                                <table bgcolor="#ffffff" class="bb" align="center" width="600">
                                    <tr>
                                        <td align="center" bgcolor="#cfebf6" style="padding:30px;">
                                            <p style="font-size:16px;color:#333333;"><strong>Your Estimate is ready!</strong></p>
                                            <p style="font-size:12px;color:#333333;">Total ${value}</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <table class="o" cellspacing="0" cellpadding="0" align="center">
                        <tr>
                            <td align="center">
                                <table bgcolor="#ffffff" class="bb" align="center" width="600">
                                    <tr>
                                        <td align="center" style="padding:20px;">
                                            <p style="font-size:14px;color:#333333;">Dear ${name}</p>
                                            <p style="font-size:14px;color:#333333;">We appreciate your business. Find your budget details in the attached file.</p>
                                            <p style="font-size:14px;color:#333333;">Feel free to contact us if you have any questions.</p>
                                            <p style="font-size:14px;color:#333333;">Have a great day!</p>
                                            <p style="font-size:14px;color:#333333;">${company}</p>
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
`