import type { MarkerPayload } from './types'

interface StatusResult {
  readonly recording: boolean
  readonly sessionId: string | null
}

interface MarkerResult {
  readonly success: boolean
  readonly error?: string
}

export function createApi(baseUrl: string) {
  return {
    async checkStatus(): Promise<StatusResult> {
      const res = await fetch(`${baseUrl}/api/recording/status`, { method: 'GET' })
      const json = (await res.json()) as any
      if (!json.success || !json.data?.recording) {
        return { recording: false, sessionId: null }
      }
      return {
        recording: true,
        sessionId: json.data.session?.id ?? null,
      }
    },

    async sendMarker(marker: MarkerPayload): Promise<MarkerResult> {
      try {
        const res = await fetch(`${baseUrl}/api/recording/marker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(marker),
        })
        const json = (await res.json()) as any
        if (!json.success) {
          return { success: false, error: json.error?.message ?? 'Unknown error' }
        }
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    },
  }
}

export type ExtensionApi = ReturnType<typeof createApi>
