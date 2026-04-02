import type { IHttpContext } from './IHttpContext'

/** 最終請求處理函式，回傳 HTTP Response */
export type RouteHandler = (ctx: IHttpContext) => Promise<Response>

/**
 * 中間件函式 — 洋蔥模型（Onion Model）
 * 呼叫 next() 繼續管線，或直接回傳 Response 短路
 *
 * @example
 * const authGuard: Middleware = async (ctx, next) => {
 *   const token = ctx.getHeader('Authorization')
 *   if (!token) return ctx.json({ error: 'Unauthorized' }, 401)
 *   return next()
 * }
 */
export type Middleware = (
	ctx: IHttpContext,
	next: () => Promise<Response>,
) => Promise<Response>

/**
 * 框架無關的模組路由介面
 *
 * 設計原則：
 * 1. 完整 HTTP 方法支援
 * 2. 每個方法支援可選 middleware 陣列（洋蔥模型）
 * 3. 路由群組 (group) 支援前綴
 * 4. 不依賴任何框架，可在任何 Adapter 中實作
 *
 * @example 基本使用
 * router.get('/users', listUsers)
 * router.post('/users', createUser)
 *
 * @example 帶中間件
 * router.get('/users/me', [authGuard], getProfile)
 * router.delete('/users/:id', [authGuard, adminGuard], deleteUser)
 *
 * @example 路由群組
 * router.group('/api/v1', (r) => {
 *   r.get('/users', listUsers)
 *   r.post('/users', createUser)
 * })
 */
export interface IModuleRouter {
	// === GET ===
	get(path: string, handler: RouteHandler): void
	get(path: string, middlewares: Middleware[], handler: RouteHandler): void

	// === POST ===
	post(path: string, handler: RouteHandler): void
	post(path: string, middlewares: Middleware[], handler: RouteHandler): void

	// === PUT ===
	put(path: string, handler: RouteHandler): void
	put(path: string, middlewares: Middleware[], handler: RouteHandler): void

	// === PATCH ===
	patch(path: string, handler: RouteHandler): void
	patch(path: string, middlewares: Middleware[], handler: RouteHandler): void

	// === DELETE ===
	delete(path: string, handler: RouteHandler): void
	delete(path: string, middlewares: Middleware[], handler: RouteHandler): void

	// === HEAD（通常用於檢查資源存在，不回傳 body）===
	head(path: string, handler: RouteHandler): void

	// === OPTIONS（CORS preflight 處理）===
	options(path: string, handler: RouteHandler): void

	/**
	 * 路由群組 — 套用路徑前綴
	 * @param prefix - 路徑前綴（如 '/api/v1'）
	 * @param fn - 在此群組中定義路由的函式
	 *
	 * @example
	 * router.group('/users', (r) => {
	 *   r.get('/', listUsers)          // GET /users/
	 *   r.post('/', createUser)        // POST /users/
	 *   r.get('/:id', getUser)         // GET /users/:id
	 *   r.put('/:id', updateUser)      // PUT /users/:id
	 *   r.delete('/:id', deleteUser)   // DELETE /users/:id
	 * })
	 */
	group(prefix: string, fn: (router: IModuleRouter) => void): void
}
