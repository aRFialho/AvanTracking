const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoRecipient {
  email: string;
  name?: string;
}

interface SendBrevoEmailInput {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent: string;
}

export const sendBrevoEmail = async (input: SendBrevoEmailInput) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail =
    process.env.BREVO_SENDER_EMAIL || process.env.BREVO_SENDER_MAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Avantracking';

  if (!apiKey || !senderEmail) {
    throw new Error(
      'Configuracao de e-mail incompleta. Defina BREVO_API_KEY e BREVO_SENDER_EMAIL ou BREVO_SENDER_MAIL.',
    );
  }

  if (!Array.isArray(input.to) || input.to.length === 0) {
    throw new Error('Nenhum destinatario informado para o envio do e-mail.');
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: input.to.map((recipient) => ({
        email: recipient.email,
        name: recipient.name || recipient.email,
      })),
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Brevo respondeu com erro ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
    );
  }
};
