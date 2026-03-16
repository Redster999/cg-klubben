const nodemailer = require('nodemailer');

let transport;
let cachedKey = '';

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'ja', 'on'].includes(normalized);
}

function getConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const fromEmail = String(process.env.MAIL_FROM_EMAIL || '').trim();
  const fromName = String(process.env.MAIL_FROM_NAME || 'Klubbens Nettside').trim() || 'Klubbens Nettside';
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const configured = Boolean(host && port > 0 && user && pass && fromEmail);

  return {
    configured,
    fromEmail,
    fromName,
    host,
    pass,
    port,
    secure,
    user,
  };
}

function getMissingConfigKeys(config) {
  const missing = [];
  if (!config.host) {
    missing.push('SMTP_HOST');
  }
  if (!config.port) {
    missing.push('SMTP_PORT');
  }
  if (!config.user) {
    missing.push('SMTP_USER');
  }
  if (!config.pass) {
    missing.push('SMTP_PASS');
  }
  if (!config.fromEmail) {
    missing.push('MAIL_FROM_EMAIL');
  }
  return missing;
}

function configKey(config) {
  return `${config.host}:${config.port}:${config.user}:${config.secure ? 'secure' : 'plain'}`;
}

function getTransport(config) {
  const key = configKey(config);
  if (transport && key === cachedKey) {
    return transport;
  }

  transport = nodemailer.createTransport({
    auth: {
      pass: config.pass,
      user: config.user,
    },
    host: config.host,
    port: config.port,
    secure: config.secure,
  });
  cachedKey = key;
  return transport;
}

function fromHeader(config) {
  return `"${config.fromName.replace(/"/g, "'")}" <${config.fromEmail}>`;
}

function isMailConfigured() {
  return getConfig().configured;
}

function mailDebugContext({ to, subject } = {}) {
  const config = getConfig();
  return {
    configured: config.configured,
    fromEmail: config.fromEmail || null,
    host: config.host || null,
    missingConfig: getMissingConfigKeys(config),
    port: config.port || null,
    secure: config.secure,
    smtpUser: config.user || null,
    subject: subject || null,
    to: to || null,
  };
}

async function sendMail({ to, subject, text }) {
  const config = getConfig();
  if (!config.configured) {
    const error = new Error('Mail is not configured');
    error.code = 'MAIL_NOT_CONFIGURED';
    error.details = {
      missingConfig: getMissingConfigKeys(config),
    };
    throw error;
  }

  if (!to || !subject || !text) {
    const error = new Error('Missing e-mail parameters');
    error.code = 'MAIL_INVALID_ARGUMENTS';
    error.details = {
      toProvided: Boolean(to),
      subjectProvided: Boolean(subject),
      textProvided: Boolean(text),
    };
    throw error;
  }

  try {
    const transporter = getTransport(config);
    return await transporter.sendMail({
      from: fromHeader(config),
      subject,
      text,
      to,
    });
  } catch (error) {
    error.code = error.code || 'MAIL_SEND_FAILED';
    error.details = {
      command: error.command || null,
      errno: error.errno || null,
      host: config.host,
      port: config.port,
      response: error.response || null,
      responseCode: error.responseCode || null,
      secure: config.secure,
      smtpUser: config.user,
      syscall: error.syscall || null,
      to,
    };
    throw error;
  }
}

module.exports = {
  isMailConfigured,
  mailDebugContext,
  sendMail,
};
