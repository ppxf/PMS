export interface AuthUser {
  id: string;
  name: string;
  email: string;
  permissions: string[];
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  user: PublicUser;
  permissions: string[];
}

export interface CurrentUserResponse {
  user: PublicUser;
  permissions: string[];
}
