import type { EmailProvider, EmailProviderPreset } from './types'

/**
 * 中国主流邮箱 IMAP/SMTP 配置预设
 */
export const EMAIL_PRESETS: Record<EmailProvider, EmailProviderPreset | null> = {
  qq: {
    name: 'QQ邮箱',
    imapHost: 'imap.qq.com',
    imapPort: 993,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465
  },
  '163': {
    name: '163邮箱',
    imapHost: 'imap.163.com',
    imapPort: 993,
    smtpHost: 'smtp.163.com',
    smtpPort: 465
  },
  '126': {
    name: '126邮箱',
    imapHost: 'imap.126.com',
    imapPort: 993,
    smtpHost: 'smtp.126.com',
    smtpPort: 465
  },
  sina: {
    name: '新浪邮箱',
    imapHost: 'imap.sina.com',
    imapPort: 993,
    smtpHost: 'smtp.sina.com',
    smtpPort: 465
  },
  gmail: {
    name: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465
  },
  outlook: {
    name: 'Outlook',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587
  },
  custom: null
}

/**
 * 根据邮箱地址自动识别提供商
 */
export function detectProvider(email: string): EmailProvider {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return 'custom'

  if (domain === 'qq.com' || domain === 'foxmail.com') return 'qq'
  if (domain === '163.com') return '163'
  if (domain === '126.com') return '126'
  if (domain === 'sina.com' || domain === 'sina.cn') return 'sina'
  if (domain === 'gmail.com') return 'gmail'
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') return 'outlook'

  return 'custom'
}
