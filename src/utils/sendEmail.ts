import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_KEY || '');

interface SendEmailData {
    to: string | string[];
    subject?: string;
    html?: string;
    text?: string;
    from?: string;
    templateId?: string;
    dynamicTemplateData?: { [key: string]: any };
}

export async function sendEmail({ to, subject, html, text, from, templateId, dynamicTemplateData }: SendEmailData) {
    const msg = {
        to,
        from: from || process.env.EMAIL_SMTP || 'no-reply@prosmartbuild.com',
        subject,
        text: text || subject || '',
        html: html || '',
        templateId,
        dynamicTemplateData,
    };

    // If using a template and no subject is provided, SendGrid uses the template's subject
    if (templateId) {
        if (!subject) delete (msg as any).subject;
        delete (msg as any).html;
        delete (msg as any).text;
    }

    try {
        await sgMail.send(msg);
        console.log(`Email sent to ${to}`);
    } catch (error: any) {
        console.error('Error sending email via SendGrid:', error);
        if (error.response) {
            console.error(error.response.body);
        }
    }
}
