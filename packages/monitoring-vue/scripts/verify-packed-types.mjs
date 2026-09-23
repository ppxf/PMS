import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const tarball = process.argv[2]
if (!tarball) throw new Error('Usage: pnpm verify:pack <path-to-tarball>')

const require = createRequire(import.meta.url)
const workspace = mkdtempSync(join(tmpdir(), 'pms-monitoring-vue-consumer-'))

function declarationFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? declarationFiles(path) : path.endsWith('.d.ts') ? [path] : []
  })
}

try {
  const extracted = join(workspace, 'extracted')
  const modules = join(workspace, 'node_modules')
  const sdk = join(modules, '@pms', 'monitoring-vue')
  mkdirSync(extracted, { recursive: true })
  mkdirSync(dirname(sdk), { recursive: true })
  execFileSync('tar', ['-xzf', resolve(tarball), '-C', extracted], { stdio: 'inherit' })
  cpSync(join(extracted, 'package'), sdk, { recursive: true })

  const coreImportPattern = /(?:from\s+|import\(\s*)['"]@pms\/monitoring-core['"]/
  const coreImports = declarationFiles(join(sdk, 'dist')).filter((file) =>
    coreImportPattern.test(readFileSync(file, 'utf8')),
  )
  if (coreImports.length) {
    throw new Error(`Packed declarations reference @pms/monitoring-core: ${coreImports.join(', ')}`)
  }

  const vuePackage = dirname(require.resolve('vue/package.json'))
  symlinkSync(vuePackage, join(modules, 'vue'), 'junction')
  writeFileSync(
    join(workspace, 'consumer.ts'),
    `import type { App } from 'vue'
import {
  captureException,
  init,
  type ClientState,
  type MonitoringEnvelope,
  type Transport,
  type VueMonitoringInitOptions,
} from '@pms/monitoring-vue'

declare const app: App
const transport: Transport = { send: async (_envelope: MonitoringEnvelope) => undefined }
const options: VueMonitoringInitOptions = {
  app,
  dsn: 'https://public@example.test/api/sdk/00000000-0000-4000-8000-000000000000',
  transport,
}
const state: ClientState = init(options)
void state
void captureException(new Error('consumer smoke test'))
`,
  )
  writeFileSync(
    join(workspace, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      files: ['consumer.ts'],
    }),
  )

  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {
    cwd: workspace,
    stdio: 'inherit',
  })
  console.log('Packed TypeScript consumer compiled without @pms/monitoring-core installed.')
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
