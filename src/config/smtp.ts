// module.exports = {
//     host: `smtpout.secureserver.net`,
//     port: 465,
//     user: process.env.EMAIL_SMTP,
//     pass: process.env.PASS_SMTP
// }

module.exports = {
    host: `${process.env.HOST_SMTP}`,
    port: Number(process.env.PORT_SMTP),
    user: process.env.EMAIL_SMTP,
    pass: process.env.PASS_SMTP
}

