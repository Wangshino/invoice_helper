/**
 * IMAP 操作层 — 纯 IMAP 连接/获取/下载，无业务逻辑
 *
 * 每次操作独立连接，操作完毕后 logout。
 * 使用 imapflow 库 (已安装 ^1.0.184)。
 */
import { ImapFlow } from 'imapflow'

// ============================================================
// 类型
// ============================================================

export interface ImapConfig {
  host: string
  port: number
  user: string
  pass: string
}

export interface ImapMessage {
  uid: number
  subject: string
  from: string
  date: Date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodyStructure: any
}

// ============================================================
// 连接测试
// ============================================================

/** 测试 IMAP 连接 — 成功正常返回，失败抛异常 */
export async function testImapConnection(config: ImapConfig): Promise<void> {
  console.log(`[IMAP] 测试连接: ${config.user}@${config.host}:${config.port}`)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false
  })

  try {
    await client.connect()
    console.log('[IMAP] 连接成功, 获取 INBOX 锁...')
    const lock = await client.getMailboxLock('INBOX')
    lock.release()
    console.log('[IMAP] 测试连接完成')
  } catch (e) {
    console.error('[IMAP] 测试连接失败:', e instanceof Error ? e.message : String(e))
    throw e
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

// ============================================================
// 获取邮件列表
// ============================================================

/** 获取邮件列表（增量同步） */
export async function fetchMessages(
  config: ImapConfig,
  folder: string,
  lastUid: number | null,
  limit: number
): Promise<ImapMessage[]> {
  console.log(`[IMAP] fetchMessages: ${config.user}@${config.host}:${config.port}, folder="${folder}", lastUid=${lastUid}, limit=${limit}`)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false
  })

  try {
    await client.connect()
    console.log(`[IMAP] 连接成功, 获取 mailbox lock: "${folder}"`)
    const lock = await client.getMailboxLock(folder)

    try {
      // 构建 UID 范围
      const uidRange = lastUid ? `${lastUid + 1}:*` : '1:*'
      console.log(`[IMAP] UID 范围: ${uidRange}`)

      const messages: ImapMessage[] = []
      for await (const msg of client.fetch(
        uidRange,
        { uid: true, envelope: true, bodyStructure: true },
        { uid: true }
      )) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || '',
          from: msg.envelope?.from?.[0]?.address || '',
          date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
          bodyStructure: msg.bodyStructure
        })
      }

      // 按 UID 升序排列，限制数量
      messages.sort((a, b) => a.uid - b.uid)
      console.log(`[IMAP] 获取到 ${messages.length} 封邮件`)
      return messages.slice(0, limit)
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error(`[IMAP] fetchMessages 失败:`, e instanceof Error ? e.message : String(e))
    throw e
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

// ============================================================
// 下载附件
// ============================================================

/** 下载指定邮件的单个附件，返回 Buffer */
export async function downloadAttachment(
  config: ImapConfig,
  folder: string,
  uid: number,
  partId: string
): Promise<Buffer> {
  console.log(`[IMAP] downloadAttachment: uid=${uid}, partId=${partId}, folder="${folder}"`)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder)

    try {
      const download = await client.download(String(uid), partId, { uid: true })
      const chunks: Buffer[] = []
      for await (const chunk of download.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const result = Buffer.concat(chunks)
      console.log(`[IMAP] 下载完成: ${result.length} bytes`)
      return result
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error(`[IMAP] downloadAttachment 失败:`, e instanceof Error ? e.message : String(e))
    throw e
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

// ============================================================
// 列出邮箱文件夹 (调试用)
// ============================================================

/** 列出所有邮箱文件夹，返回名称列表 */
export async function listMailboxes(config: ImapConfig): Promise<string[]> {
  console.log(`[IMAP] listMailboxes: ${config.user}@${config.host}:${config.port}`)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false
  })

  try {
    await client.connect()
    const folders: string[] = []

    const mailboxes = await client.list()
    for (const mailbox of mailboxes) {
      folders.push(mailbox.path || mailbox.name)
    }

    console.log(`[IMAP] 可用文件夹: ${JSON.stringify(folders)}`)
    return folders
  } catch (e) {
    console.error(`[IMAP] listMailboxes 失败:`, e instanceof Error ? e.message : String(e))
    throw e
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

/** 获取邮件的 HTML 正文 */
export async function fetchEmailHtml(
  config: ImapConfig,
  folder: string,
  uid: number,
  bodyStructure: BodyStructure
): Promise<string | null> {
  console.log(`[IMAP] fetchEmailHtml: uid=${uid}, folder="${folder}"`)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder)

    try {
      // 在 bodyStructure 中查找 text/html 部分
      const htmlPart = findHtmlPart(bodyStructure)
      if (!htmlPart) {
        console.log(`[IMAP] 邮件 uid=${uid} 无 text/html 部分`)
        return null
      }

      const download = await client.download(String(uid), String(htmlPart), { uid: true })
      const chunks: Buffer[] = []
      for await (const chunk of download.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buffer = Buffer.concat(chunks)
      const html = buffer.toString('utf-8')
      console.log(`[IMAP] HTML 正文获取完成: ${html.length} chars`)
      return html
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error(`[IMAP] fetchEmailHtml 失败:`, e instanceof Error ? e.message : String(e))
    return null
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BodyStructure = any

/** 递归查找 text/html 部分的 part ID */
function findHtmlPart(node: BodyStructure): string | null {
  if (!node) return null

  if (node.type === 'text/html' && node.part) {
    return String(node.part)
  }

  if (node.childNodes?.length) {
    for (const child of node.childNodes) {
      const found = findHtmlPart(child)
      if (found) return found
    }
  }

  return null
}
