import type { OptimizationReportData } from './OptimizationReportRenderer'

export function renderOptimizationReportJson(data: OptimizationReportData): string {
  return JSON.stringify(data, (_key, value) => {
    // Set 型別無法直接 JSON stringify，轉為 Array
    if (value instanceof Set) return [...value]
    return value
  }, 2)
}
