export interface JwtPayload {
  sub: string;
  email: string;
  sessionVersion?: number;
}
