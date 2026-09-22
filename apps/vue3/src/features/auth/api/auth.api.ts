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

export interface RegisterInput {
  name: string
  email: string
  password: string
  passwordConfirmation: string
}

export interface ResetPasswordInput {
  token: string
  password: string
  passwordConfirmation: string
}

export interface MessageResponse {
  message: string
}

export function login(credentials: LoginCredentials): Promise<AuthSession> {
  return http.post<AuthSession, LoginCredentials>('/auth/login', credentials)
}

export function getCurrentUser(): Promise<CurrentUser> {
  return http.get<CurrentUser>('/auth/me')
}

export const register = (input: RegisterInput) =>
  http.post<MessageResponse, RegisterInput>('/auth/register', input)
export const verifyEmail = (token: string) =>
  http.post<MessageResponse, { token: string }>('/auth/verify-email', { token })
export const resendVerification = (email: string) =>
  http.post<MessageResponse, { email: string }>('/auth/resend-verification', { email })
export const forgotPassword = (email: string) =>
  http.post<MessageResponse, { email: string }>('/auth/forgot-password', { email })
export const resetPassword = (input: ResetPasswordInput) =>
  http.post<MessageResponse, ResetPasswordInput>('/auth/reset-password', input)
