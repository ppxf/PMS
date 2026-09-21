import { http } from '@/services/http'

import type { AuthSession, AuthUser } from '../model/auth.store'

export interface LoginCredentials {
  email: string
  password: string
}

export interface CurrentUser {
  user: AuthUser
  permissions: string[]
}

export function login(credentials: LoginCredentials): Promise<AuthSession> {
  return http.post<AuthSession, LoginCredentials>('/auth/login', credentials)
}

export function getCurrentUser(): Promise<CurrentUser> {
  return http.get<CurrentUser>('/auth/me')
}
