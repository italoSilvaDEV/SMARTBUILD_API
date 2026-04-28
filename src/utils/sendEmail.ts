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
    debugContext?: string;
    throwOnError?: boolean;
}

export async function sendEmail({
    to,
    subject,
    html,
    text,
    from,
    replyTo,
    templateId,
    dynamicTemplateData,
    attachments,
    debugContext,
    throwOnError = false,
}: SendEmailData) {
    const recipients = Array.isArray(to) ? to : [to];
    const contextLabel = debugContext || 'sendEmail';
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
        console.error(`[sendEmail] [${contextLabel}] Error sending email via SendGrid`, {
            recipients,
            message: error?.message || null,
            code: error?.code || null,
            responseBody: error?.response?.body || null,
            responseHeaders: error?.response?.headers || null,
        });
        if (error.response) {
            console.error(error.response.body);
        }

        if (throwOnError) {
            throw error;
        }
    }
}
