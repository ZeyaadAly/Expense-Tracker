export interface AuthContext {
  readonly userId: string;
  readonly email?: string;
}
declare module "express-serve-static-core" {
  interface Request { auth?: AuthContext }
}
