/**
 * Gravito ServiceProvider 適配器
 *
 * 將框架無關的 ModuleServiceProvider 適配為 Gravito 的 ServiceProvider
 * 這是框架耦合的唯一地點。
 */

import { ServiceProvider, type Container as GravitoContainer, type PlanetCore } from '@gravito/core'
import type { ModuleServiceProvider, IContainer } from '@/Shared/Infrastructure/IServiceProvider'

/**
 * 將 Gravito 的 Container 適配為框架無關的 IContainer
 */
class GravitoContainerAdapter implements IContainer {
	constructor(private gravitoContainer: GravitoContainer) {}

	singleton(name: string, factory: (container: IContainer) => any): void {
		this.gravitoContainer.singleton(name, (c: GravitoContainer) => {
			return factory(new GravitoContainerAdapter(c))
		})
	}

	bind(name: string, factory: (container: IContainer) => any): void {
		// Gravito 中的 bind 實現每次都創建新實例
		this.gravitoContainer.bind(name, (c: GravitoContainer) => {
			return factory(new GravitoContainerAdapter(c))
		})
	}

	make(name: string): any {
		return this.gravitoContainer.make(name)
	}
}

/**
 * 將框架無關的 ModuleServiceProvider 適配為 Gravito 的 ServiceProvider
 */
export class GravitoServiceProviderAdapter extends ServiceProvider {
	constructor(private moduleProvider: ModuleServiceProvider) {
		super()
	}

	register(container: GravitoContainer): void {
		// 將 Gravito 的 Container 適配為框架無關的 IContainer
		const adaptedContainer = new GravitoContainerAdapter(container)

		// 調用模組的註冊方法
		this.moduleProvider.register(adaptedContainer)
	}

	boot(core: PlanetCore): void {
		// 調用模組的啟動方法
		this.moduleProvider.boot(core)
	}
}

/**
 * 工廠函式：創建適配器
 *
 * @param moduleProvider - 框架無關的模組服務提供者
 * @returns Gravito 框架的 ServiceProvider
 *
 * @example
 * app.register(createGravitoServiceProvider(new UserServiceProvider()))
 */
export function createGravitoServiceProvider(moduleProvider: ModuleServiceProvider): ServiceProvider {
	return new GravitoServiceProviderAdapter(moduleProvider)
}
