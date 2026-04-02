import appConfig from './app'

export { default as app } from './app'
export { getOrbits } from './orbits'

export function buildConfig(portOverride?: number) {
  const port = portOverride ?? appConfig.port
  return {
    ...appConfig,
    PORT: port,
  }
}
