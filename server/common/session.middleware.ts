import type { Response } from 'express';
import type { Store } from '../store.ts';
import { type AuthRequest, token } from './auth.ts';

/** Her /api isteğinde bearer token’ı çözüp kullanıcıyı isteğe iliştirir. */
export const sessionMiddleware = (store: Store) => async (req: AuthRequest, res: Response, next: (error?: unknown) => void) => {
  res.setHeader('Cache-Control', 'no-store');
  try { req.user = await store.user(token(req)); next(); } catch (error) { next(error); }
};
