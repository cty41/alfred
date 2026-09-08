import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ProbeConfig { alfredRoot: string; ttlMs: number; timeoutMs: number }

export class CapabilityProbe {
  private cached?: { expiresAt: number; value: unknown }
  private pending?: Promise<unknown>
  constructor(private readonly config: ProbeConfig) {}

  async snapshot(signal?: AbortSignal): Promise<unknown> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value
    if (this.pending) return this.pending
    this.pending = this.run(signal).then(value => {
      this.cached = { expiresAt: Date.now() + this.config.ttlMs, value }
      return value
    }).finally(() => { this.pending = undefined })
    return this.pending
  }

  invalidate(): void { this.cached = undefined }

  private async run(signal?: AbortSignal): Promise<unknown> {
    const script = path.join(this.config.alfredRoot, 'alfred.ps1')
    const shell = process.platform === 'win32' ? 'powershell' : 'pwsh'
    try {
      const { stdout } = await execFileAsync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, 'capabilities', '-Quick', '-Json'], {
        cwd: this.config.alfredRoot,
        encoding: 'utf8',
        timeout: this.config.timeoutMs,
        maxBuffer: 1024 * 1024,
        signal,
        windowsHide: true,
      })
      const start = stdout.indexOf('{')
      const end = stdout.lastIndexOf('}')
      if (start < 0 || end < start) throw new Error('capability probe returned no JSON object')
      return JSON.parse(stdout.slice(start, end + 1))
    } catch (error) {
      return { command: 'capabilities', status: 'issues', issues: ['capability-probe-unavailable'], data: { capabilities: [] }, observedError: error instanceof Error ? error.name : 'Error' }
    }
  }
}

export function defaultAlfredRoot(importUrl: string): string {
  const file = new URL(importUrl)
  return path.resolve(path.dirname(file.pathname.replace(/^\/(?=[A-Za-z]:)/u, '')), '../../..')
}
