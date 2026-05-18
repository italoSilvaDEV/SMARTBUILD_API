import sgMail from '@sendgrid/mail';
import { prisma } from './prisma';

interface SendEmailData {
    to: string | string[];
    subject?: string;
    html?: string;
    text?: string;
    from?: string;
    replyTo?: string;
    companyId?: string | null;
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
    companyId,
    templateId,
    dynamicTemplateData,
    attachments,
    debugContext,
    throwOnError = false,
}: SendEmailData) {
    const recipients = Array.isArray(to) ? to : [to];
    const contextLabel = debugContext || 'sendEmail';
    const resolvedReplyTo = await resolveReplyTo(replyTo, companyId, dynamicTemplateData);
    const msg = {
        to,
        from: from || process.env.EMAIL_SMTP || 'no-reply@prosmartbuild.com',
        ...(resolvedReplyTo ? { replyTo: resolvedReplyTo } : {}),
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

function normalizeEmail(value?: string | null) {
    const email = value?.trim();
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function getReplyToFromTemplateData(dynamicTemplateData?: { [key: string]: any }) {
    if (!dynamicTemplateData) return undefined;

    return normalizeEmail(
        dynamicTemplateData.companyReplyToEmail ||
        dynamicTemplateData.companyEmail ||
        dynamicTemplateData.company_email ||
        dynamicTemplateData.replyToEmail
    );
}

async function resolveReplyTo(replyTo?: string, companyId?: string | null, dynamicTemplateData?: { [key: string]: any }) {
    const explicitReplyTo = normalizeEmail(replyTo);
    if (explicitReplyTo) return explicitReplyTo;

    const templateReplyTo = getReplyToFromTemplateData(dynamicTemplateData);
    if (templateReplyTo) return templateReplyTo;

    if (!companyId) return undefined;

    try {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { email: true }
        });

        return normalizeEmail(company?.email);
    } catch (error) {
        console.error("[sendEmail] Failed to resolve company replyTo", {
            companyId,
            message: error instanceof Error ? error.message : String(error)
        });
        return undefined;
    }
}
}
