export type UserStatus = 'active' | 'disabled'

export interface User {
  id: string
  name: string
  email: string
  role: string
  status: UserStatus
}

export interface UserDto {
  id: string
  name: string
  email: string
  role: string
  status: UserStatus
}

export function mapUserDto(dto: UserDto): User {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    status: dto.status,
  }
}
