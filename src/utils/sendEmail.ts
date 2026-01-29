import sgMail from '@sendgrid/mail';

interface SendEmailData {
    to: string | string[];
    subject?: string;
    html?: string;
    text?: string;
    from?: string;
    replyTo?: string;
    templateId?: string;
    dynamicTemplateData?: { [key: string]: any };
    attachments?: Array<{
        content: string;
        filename: string;
        type: string;
        disposition?: string;
    }>;
}

export async function sendEmail({ to, subject, html, text, from, replyTo, templateId, dynamicTemplateData, attachments }: SendEmailData) {
    const msg = {
        to,
        from: from || process.env.EMAIL_SMTP || 'no-reply@prosmartbuild.com',
        replyTo,
        subject,
        text: text || subject || '',
        html: html || '',
        templateId,
        dynamicTemplateData,
        attachments,
    };

    if (templateId) {
        if (!subject) delete (msg as any).subject;
        delete (msg as any).html;
        delete (msg as any).text;
    }

    if (!process.env.SENDGRID_KEY) {
        throw new Error('SENDGRID_KEY not defined');
    }
    
    sgMail.setApiKey(process.env.SENDGRID_KEY);

    try {
        await sgMail.send(msg);
    } catch (error: any) {
        if (error.response) {
        }
    }
}
