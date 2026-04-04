import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('首頁顯示 Dashboard 三個區塊', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('系統狀態')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('工作流程')).toBeVisible()
    await expect(page.getByText('最近 Session')).toBeVisible()
  })

  test('開啟 Wizard Drawer 並可切換步驟', async ({ page }) => {
    await page.goto('/')
    await page.getByText('新手引導 Wizard').click()
    await expect(page.getByText('提取 Schema').first()).toBeVisible()
    await page.getByText('下一步 →').click()
    await expect(page.getByText('整理視覺化').first()).toBeVisible()
  })

  test('[開啟 Canvas →] 跳轉到 /canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByText('開啟 Canvas →').click()
    await expect(page).toHaveURL('/canvas')
  })
})
