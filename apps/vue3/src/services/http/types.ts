export interface ApiSuccessResponse<T> {
  success: true
  data: T
  timestamp: string
}

export interface ApiErrorResponse {
  success: false
  statusCode: number
  message: string | string[]
  error?: string
  timestamp: string
  path: string
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface PageQuery {
  page: number
  pageSize: number
}
