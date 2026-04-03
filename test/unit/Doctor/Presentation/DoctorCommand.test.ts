import { parseDoctorArgs } from '@/Modules/Doctor/Presentation/DoctorCommand'

describe('parseDoctorArgs', () => {
  it('returns noFix=false by default', () => {
    const args = parseDoctorArgs(['doctor'])
    expect(args.noFix).toBe(false)
  })

  it('returns noFix=true with --no-fix flag', () => {
    const args = parseDoctorArgs(['doctor', '--no-fix'])
    expect(args.noFix).toBe(true)
  })
})
