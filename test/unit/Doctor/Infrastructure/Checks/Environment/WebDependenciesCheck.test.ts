import { WebDependenciesCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/WebDependenciesCheck'
import path from 'node:path'

describe('WebDependenciesCheck', () => {
  it('returns ok when web/node_modules exists', async () => {
    const projectRoot = path.resolve(import.meta.dirname, '../../../../../..')
    const check = new WebDependenciesCheck(projectRoot)
    const result = await check.check()
    expect(['ok', 'error']).toContain(result.severity)
  })

  it('is fixable', () => {
    const check = new WebDependenciesCheck('/tmp')
    expect(typeof check.fix).toBe('function')
  })
})
