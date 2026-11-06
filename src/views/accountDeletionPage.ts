const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export function deletionPage(locale: 'en' | 'pt', token: string, error?: string, reference?: string) {
  const pt = locale === 'pt';
  const retention = pt ? process.env.ACCOUNT_DELETION_RETENTION_PT : process.env.ACCOUNT_DELETION_RETENTION_EN;
  const title = pt ? 'Solicitar exclusão da conta' : 'Request account deletion';
  return `<!doctype html>
<html lang="${pt ? 'pt-BR' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Pro SmartBuild</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#202631;font:16px/1.6 system-ui,sans-serif}
header{background:#191e27;color:#fff;padding:24px}header div,main{max-width:740px;margin:auto}
header div{display:flex;justify-content:space-between;gap:20px;align-items:center}header a{color:#e8c48a}
main{padding:32px 20px 60px}section{background:white;border:1px solid #e2e5e9;border-radius:16px;padding:28px;margin:20px 0}
h1{font-size:30px;line-height:1.2;margin:0 0 16px}h2{font-size:19px}p{margin:12px 0}a{color:#78531d}
label{display:block;font-weight:600}input[type=email]{width:100%;padding:14px;border:1px solid #78818e;border-radius:8px;font:inherit;margin:8px 0 16px}
.confirm{display:flex;gap:10px;font-weight:400;align-items:flex-start}.confirm input{margin-top:7px}
button{background:#202631;color:white;border:0;border-radius:8px;font:600 16px system-ui;padding:15px 22px;margin-top:20px;cursor:pointer;width:100%}
button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #b18137;outline-offset:3px}
.error{background:#fff0ef;border:1px solid #ab3026;padding:14px;border-radius:8px}.success{border-top:5px solid #298156}
.muted{color:#525e6d;font-size:14px}.trap{position:absolute;left:-10000px}code{overflow-wrap:anywhere}
@media(max-width:480px){section{padding:20px}h1{font-size:26px}header{padding:20px}}
</style></head><body>
<header><div><strong>PRO SMARTBUILD</strong><nav aria-label="Language"><a href="?lang=en" lang="en">English</a> · <a href="?lang=pt" lang="pt-BR">Português</a></nav></div></header>
<main>
${reference ? `<section class="success" role="status"><h1>${pt ? 'Solicitação registrada' : 'Request received'}</h1>
<p>${pt ? 'Seu pedido foi salvo e aguarda verificação da equipe. Entraremos em contato pelo e-mail informado para atender à solicitação em até 7 dias.' : 'Your request has been saved and is awaiting team verification. We will contact you at the email provided to handle your request within 7 days.'}</p>
<p>${pt ? 'Protocolo' : 'Reference'}: <code>${escapeHtml(reference)}</code></p>
<p>${pt ? 'A conta, os dados e a assinatura não foram excluídos ou cancelados neste envio.' : 'Submitting this request has not deleted your account or data, or cancelled your subscription.'}</p></section>` : `
<section><h1>${title}</h1>
<p>${pt ? 'Solicite a exclusão da sua conta Pro SmartBuild e dos dados pessoais associados, mesmo sem acesso ao aplicativo.' : 'Request deletion of your Pro SmartBuild account and associated personal data, even if you no longer have access to the app.'}</p>
<ol>
<li>${pt ? 'Informe o e-mail usado na conta da sua empresa e envie o pedido.' : 'Enter the email used for your company account and submit your request.'}</li>
<li>${pt ? 'A equipe entrará em contato por esse e-mail para confirmar sua identidade e autoridade sobre a conta.' : 'Our team will contact that email to verify your identity and authority over the account.'}</li>
<li>${pt ? 'O atendimento é manual, em até 7 dias. Pedir o motivo ou oferecer ajuda é opcional e não condiciona a exclusão.' : 'Requests are handled manually within 7 days. Sharing a reason or discussing alternatives is optional and is not a condition of deletion.'}</li>
</ol>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/account-deletion">
<input type="hidden" name="token" value="${escapeHtml(token)}"><input type="hidden" name="locale" value="${locale}">
<label for="email">${pt ? 'E-mail da conta da empresa' : 'Company account email'}</label>
<input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>
<div class="trap" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="confirm"><input name="confirm" type="checkbox" value="yes" required><span>${pt ? 'Solicito a exclusão da minha conta e dos dados associados e entendo que a equipe verificará minha identidade antes de executar o pedido.' : 'I request deletion of my account and associated data and understand that the team will verify my identity before carrying out the request.'}</span></label>
<button type="submit">${pt ? 'Solicitar exclusão' : 'Request deletion'}</button>
<p class="muted">${pt ? 'Não envie senhas ou documentos por este formulário. Este pedido não apaga automaticamente a empresa ou dados de outros usuários.' : 'Do not submit passwords or documents through this form. This request does not automatically delete the company or other users’ data.'}</p>
</form></section>`}
<section><h2>${pt ? 'Dados e retenção' : 'Data and retention'}</h2>
<p>${pt ? 'Após a verificação, o atendimento abrangerá seu perfil (nome, e-mail, telefone e foto), credenciais de acesso e dados pessoais associados, incluindo mensagens e arquivos, conforme aplicável. Dados compartilhados da empresa e de outras pessoas serão avaliados para preservar os direitos dos demais titulares.' : 'After verification, processing covers your profile (name, email, phone and photo), access credentials and associated personal data, including messages and files where applicable. Shared company data and other people’s data will be assessed to preserve their rights.'}</p>
<p>${escapeHtml(retention || '')}</p>
<h2>${pt ? 'Assinaturas' : 'Subscriptions'}</h2>
<p>${pt ? 'Enviar o pedido não cancela automaticamente uma assinatura. A equipe explicará o tratamento da assinatura e eventuais etapas de cancelamento no provedor de pagamento.' : 'Submitting a request does not automatically cancel a subscription. Our team will explain how your subscription is handled and any cancellation steps with your payment provider.'}</p>
<p>${pt ? 'Dúvidas ou dificuldade com o formulário?' : 'Questions or trouble with the form?'} <a href="mailto:support@smartbuild4u.com">support@smartbuild4u.com</a></p>
</section></main></body></html>`;
}
