import type { Middleware, RouteHandler } from './IModuleRouter'

/**
 * 合併多個 middleware 為單一 middleware
 *
 * @example
 * const secured = compose(rateLimiter, jwtGuard, auditLog)
 * router.get('/admin/data', [secured], getAdminData)
 */
export function compose(...middlewares: Middleware[]): Middleware {
	return (ctx, next) => {
		let index = -1
		const dispatch = (i: number): Promise<Response> => {
			if (i <= index) {
				return Promise.reject(new Error('next() called multiple times'))
			}
			index = i
			if (i === middlewares.length) {
				return next()
			}
			return middlewares[i](ctx, () => dispatch(i + 1))
		}
		return dispatch(0)
	}
}

/**
 * 將 middleware 包裝為 RouteHandler 裝飾器
 * 方便建立 handler 的 "protected" 版本
 *
 * @example
 * const protectedHandler = withGuard(jwtGuard)(getProfile)
 * router.get('/users/me', protectedHandler)
 */
export function withGuard(
	...middlewares: Middleware[]
): (handler: RouteHandler) => RouteHandler {
	return (handler) => {
		const composed = compose(...middlewares)
		return (ctx) => composed(ctx, () => handler(ctx))
	}
}
