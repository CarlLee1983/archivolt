export interface MarkerPayload {
  readonly url: string
  readonly action: 'navigate' | 'submit' | 'click' | 'request'
  readonly target?: string
  readonly label?: string
}

export interface ExtensionState {
  readonly apiBaseUrl: string
  readonly connected: boolean
  readonly lockedTabId: number | null
  readonly sessionId: string | null
}

export const DEFAULT_STATE: ExtensionState = {
  apiBaseUrl: 'http://localhost:3100',
  connected: false,
  lockedTabId: null,
  sessionId: null,
}

export interface RecordingStatusResponse {
  readonly success: boolean
  readonly data?: {
    readonly recording: boolean
    readonly session?: { readonly id: string }
    readonly proxyPort?: number
  }
}
