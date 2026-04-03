import { DependenciesCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/DependenciesCheck'
import path from 'node:path'

describe('DependenciesCheck', () => {
  it('returns ok when node_modules exists', async () => {
    // Use project root (has node_modules since tests are running)
    const projectRoot = path.resolve(import.meta.dirname, '../../../../../..')
    const check = new DependenciesCheck(projectRoot)
    const result = await check.check()
    expect(result.severity).toBe('ok')
  })

  it('returns error when node_modules is missing', async () => {
    const check = new DependenciesCheck('/tmp/nonexistent-project')
    const result = await check.check()
    expect(result.severity).toBe('error')
    expect(result.fixable).toBe(true)
  })

  it('is fixable', () => {
    const check = new DependenciesCheck('/tmp')
    expect(typeof check.fix).toBe('function')
  })
})
