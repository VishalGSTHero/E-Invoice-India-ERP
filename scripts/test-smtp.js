require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const nodemailer = require('nodemailer');

(async () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log('Verifying SMTP...');
  await transporter.verify();
  console.log('SMTP OK');

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: process.env.MAIL_TO,
    subject: '[E-Invoice Daily] SMTP test',
    text: 'SMTP test from E-Invoice Playwright daily runner. If you received this, email config works.',
    html: '<p>SMTP test from <b>E-Invoice Playwright</b> daily runner.</p><p>If you received this, email config works.</p>',
  });
  console.log('Test mail sent:', info.messageId);
})().catch((err) => {
  console.error('SMTP FAILED:', err.message);
  process.exit(1);
});
