import { http } from '@/services/http'
import { mapUserDto } from '../model/user'

import type { PageQuery, PageResult } from '@/services/http'
import type { User, UserDto } from '../model/user'

export interface UserListQuery extends PageQuery {
  keyword?: string
  status?: 'active' | 'disabled'
}

export async function getUsers(
  query: UserListQuery,
  signal?: AbortSignal,
): Promise<PageResult<User>> {
  const result = await http.get<PageResult<UserDto>>('/users', {
    params: query,
    signal,
  })

  return {
    ...result,
    items: result.items.map(mapUserDto),
  }
}
