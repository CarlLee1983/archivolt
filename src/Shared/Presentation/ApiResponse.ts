/**
 * API 響應格式化器
 *
 * 統一所有 API 響應格式
 */

export interface ApiResponseData {
	success: boolean
	data?: any
	error?: {
		code: string
		message: string
		details?: Record<string, any>
	}
	meta?: {
		timestamp: string
		path?: string
		pagination?: {
			total: number
			limit: number
			offset: number
			page: number
			pages: number
		}
		[key: string]: any
	}
}

export class ApiResponse {
	/**
	 * 成功響應
	 */
	static success(data: any, meta?: any): ApiResponseData {
		return {
			success: true,
			data,
			meta: {
				timestamp: new Date().toISOString(),
				...meta,
			},
		}
	}

	/**
	 * 錯誤響應
	 */
	static error(code: string, message: string, details?: any): ApiResponseData {
		return {
			success: false,
			error: {
				code,
				message,
				details,
			},
			meta: {
				timestamp: new Date().toISOString(),
			},
		}
	}

	/**
	 * 列表響應（含分頁元數據）
	 */
	static paginated(
		items: any[],
		total: number,
		limit: number,
		offset: number,
	): ApiResponseData {
		return {
			success: true,
			data: items,
			meta: {
				timestamp: new Date().toISOString(),
				pagination: {
					total,
					limit,
					offset,
					page: Math.floor(offset / limit) + 1,
					pages: Math.ceil(total / limit),
				},
			},
		}
	}
}
