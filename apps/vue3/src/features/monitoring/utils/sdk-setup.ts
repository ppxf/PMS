export interface ParsedDsn {
  checkUrl: string
  projectId: string
  publicKey: string
}

export function parseDsn(dsn: string): ParsedDsn {
  const url = new URL(dsn)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('DSN 必须使用 HTTP 或 HTTPS')
  }

  const pathSegments = url.pathname.split('/').filter(Boolean)
  const projectId = pathSegments[pathSegments.length - 1]
  if (!url.username || !projectId) throw new Error('DSN 格式无效')

  return {
    checkUrl: `${url.origin}/api/sdk/check`,
    projectId,
    publicKey: decodeURIComponent(url.username),
  }
}

export const buildEnvSnippet = (dsn: string) => `VITE_PMS_DSN=${dsn}`

export function buildCheckSnippet(dsn: string): string {
  const { checkUrl, projectId, publicKey } = parseDsn(dsn)
  return `const response = await fetch('${checkUrl}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: '${projectId}',
    publicKey: '${publicKey}',
  }),
});

if (!response.ok) throw new Error('PMS DSN 连接校验失败');
console.log('PMS DSN 连接成功');`
}
