/**
 * 依賴注入容器 - 框架無關介面
 *
 * @public - 所有層都可使用的公開介面
 *
 * 定義依賴注入的註冊和解析機制，隱藏具體框架（Gravito/Nest/Express 等）的容器實現。
 *
 * **設計原則**
 * - 完全框架無關：不依賴任何具體 DI 框架
 * - 支援兩種生命週期：單例（全應用共享）和工廠（每次新建）
 * - 遵循依賴注入模式：所有服務通過容器解析
 *
 * @design
 * - 若框架升級或更換，只需實現新的 IContainer 適配器
 * - Module 和 Service 不知道具體容器是什麼
 *
 * @example
 * ```typescript
 * // Module 中註冊服務
 * export class UserServiceProvider extends ModuleServiceProvider {
 *   register(container: IContainer) {
 *     container.singleton('UserRepository', (c) => new UserRepository(c.make('db')))
 *     container.singleton('UserService', (c) => new UserService(c.make('UserRepository')))
 *   }
 * }
 *
 * // 應用層使用
 * const userService = container.make('UserService')
 * ```
 */
export interface IContainer {
	/**
	 * 註冊單例服務（全應用共享一個實例）
	 *
	 * 適用於：資料庫連接、Logger、Config 等重量級、無狀態的服務
	 *
	 * @param name - 服務註冊名稱
	 * @param factory - 工廠函數，接收容器，返回服務實例
	 */
	singleton(name: string, factory: (container: IContainer) => any): void

	/**
	 * 註冊工廠服務（每次解析創建新實例）
	 *
	 * 適用於：Request Handler、Controller 等有狀態的服務
	 *
	 * @param name - 服務註冊名稱
	 * @param factory - 工廠函數，每次調用 make() 都會執行
	 */
	bind(name: string, factory: (container: IContainer) => any): void

	/**
	 * 從容器解析服務
	 *
	 * @param name - 服務註冊名稱
	 * @returns 解析後的服務實例
	 * @throws 若服務未註冊，應拋出清晰的錯誤信息
	 */
	make(name: string): any
}

/**
 * 服務提供者基類（框架無關）
 *
 * @public - 所有 Module 都應該繼承此類定義服務提供者
 *
 * 模組應繼承此類而不是直接繼承框架特定的 ServiceProvider。
 * 由框架適配層負責將此類適配為具體框架的 ServiceProvider（如 Nest.js 的 @Injectable）。
 *
 * **職責**
 * - `register()`：定義本模組提供的服務（Repository、Service、Controller）
 * - `boot()`：可選，執行應用啟動時的初始化邏輯
 *
 * **設計原則**
 * - 完全框架無關：只使用 IContainer 介面
 * - 隱藏框架細節：Framework Adapter 負責將此類轉換為框架特定格式
 *
 * @example
 * ```typescript
 * // Domain 層
 * export interface IUserRepository extends IRepository<User> {
 *   findByEmail(email: string): Promise<User | null>
 * }
 *
 * // Infrastructure 層
 * export class UserServiceProvider extends ModuleServiceProvider {
 *   register(container: IContainer): void {
 *     // 註冊 Repository（自動使用 IDatabaseAccess）
 *     container.singleton(
 *       'UserRepository',
 *       (c) => new UserRepository(c.make('db'))
 *     )
 *
 *     // 註冊 Service
 *     container.singleton(
 *       'UserService',
 *       (c) => new UserService(c.make('UserRepository'))
 *     )
 *   }
 *
 *   boot(_context: any): void {
 *     // 應用啟動時的初始化邏輯（可選）
 *   }
 * }
 *
 * // Wiring 層（Framework Adapter）
 * export function registerUserModule(core: PlanetCore): void {
 *   const provider = new UserServiceProvider()
 *   provider.register(core.container)
 *   provider.boot(core)
 * }
 * ```
 */
export abstract class ModuleServiceProvider {
	/**
	 * 註冊服務到容器
	 *
	 * 此方法在應用啟動時調用，模組在此定義所有提供的服務。
	 *
	 * @param container - 框架無關的容器介面（可以安全地假設它支援 singleton 和 bind）
	 */
	abstract register(container: IContainer): void

	/**
	 * 啟動服務（可選）
	 *
	 * 在應用啟動完成後調用，用於執行初始化邏輯（如建立資料庫索引、預熱快取等）。
	 * 注意：此時需要框架特定的資源，應由框架適配層傳入。
	 *
	 * @param _context - 應用上下文（框架特定，Module 不應該依賴它）
	 */
	boot(_context: any): void {
		// 默認空實現
	}
}
