export interface ParsedDsn {
  dsn: string
  endpoint: string
  publicKey: string
  projectId: string
}

export function parseDsn(value: string): ParsedDsn {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('PMS DSN must be a valid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('PMS DSN protocol must be http or https')
  }
  if (!url.username) throw new TypeError('PMS DSN must include a public key')

  const match = url.pathname.replace(/\/$/, '').match(/^\/api\/sdk\/([^/]+)$/)
  if (!match?.[1]) throw new TypeError('PMS DSN path must match /api/sdk/<projectId>')

  const publicKey = decodeURIComponent(url.username)
  url.username = ''
  url.password = ''
  const endpoint = url.toString().replace(/\/$/, '')

  return {
    dsn: value.replace(/\/$/, ''),
    endpoint,
    publicKey,
    projectId: decodeURIComponent(match[1]),
  }
}
