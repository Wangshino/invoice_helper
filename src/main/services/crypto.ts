import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto'
import { machineIdSync } from 'node-machine-id'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * 获取基于机器 ID 派生的加密密钥
 * 使用 scrypt 进行密钥派生, 确保即使机器 ID 泄露也无法直接解密
 */
function getEncryptionKey(): Buffer {
  const machineId = machineIdSync()
  const salt = 'invoice-helper-encryption-salt-v1'
  return scryptSync(machineId, salt, KEY_LENGTH)
}

/**
 * AES-256-GCM 加密
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  // 格式: iv(16) + authTag(16) + encrypted
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * AES-256-GCM 解密
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(ciphertext, 'base64')

  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final('utf8')
}
