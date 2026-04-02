import type { PlanetCore } from '@gravito/core'
import { fromGravitoContext } from '@/Shared/Presentation/IHttpContext'
import type {
	IModuleRouter,
	RouteHandler,
	Middleware,
} from '@/Shared/Presentation/IModuleRouter'

/**
 * 執行 middleware 管線（洋蔥模型）
 * Middleware 按順序執行，最後執行 handler
 */
function runPipeline(
	middlewares: Middleware[],
	handler: RouteHandler,
): RouteHandler {
	return (ctx) => {
		let index = -1
		const dispatch = (i: number): Promise<Response> => {
			if (i <= index) {
				return Promise.reject(new Error('next() called multiple times'))
			}
			index = i
			if (i === middlewares.length) {
				return handler(ctx)
			}
			return middlewares[i](ctx, () => dispatch(i + 1))
		}
		return dispatch(0)
	}
}

/**
 * 建立 Gravito 框架的 IModuleRouter 適配器
 *
 * @param core - PlanetCore 實例
 * @param prefix - 路由前綴（group 內部使用）
 *
 * @example
 * const router = createGravitoModuleRouter(core)
 * router.get('/users', async (ctx) => ctx.json({ users: [] }))
 */
export function createGravitoModuleRouter(
	core: PlanetCore,
	prefix = '',
): IModuleRouter {
	function register(method: 'get' | 'post' | 'put' | 'patch' | 'delete') {
		return (path: string, ...args: unknown[]) => {
			const fullPath = prefix + path
			const handler = args[args.length - 1] as RouteHandler
			const middlewares = args.length > 1 ? (args[0] as Middleware[]) : []
			const pipeline = runPipeline(middlewares, handler)

			core.router[method](fullPath, (ctx: any) =>
				pipeline(fromGravitoContext(ctx)),
			)
		}
	}

	return {
		get: register('get') as IModuleRouter['get'],
		post: register('post') as IModuleRouter['post'],
		put: register('put') as IModuleRouter['put'],
		patch: register('patch') as IModuleRouter['patch'],
		delete: register('delete') as IModuleRouter['delete'],
		head: (path: string, handler: RouteHandler) => {
			const fullPath = prefix + path
			// HEAD 通常用 GET 實作
			core.router.get(fullPath, (ctx: any) => handler(fromGravitoContext(ctx)))
		},
		options: (path: string, handler: RouteHandler) => {
			const fullPath = prefix + path
			// OPTIONS 若 Gravito Router 不支援，用 GET 作為備用
			const router = core.router as any
			if (router.options && typeof router.options === 'function') {
				router.options(fullPath, (ctx: any) => handler(fromGravitoContext(ctx)))
			} else {
				router.get(fullPath, (ctx: any) => handler(fromGravitoContext(ctx)))
			}
		},
		group(groupPrefix, fn) {
			fn(createGravitoModuleRouter(core, prefix + groupPrefix))
		},
	}
}
