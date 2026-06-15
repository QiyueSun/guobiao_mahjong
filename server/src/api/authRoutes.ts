import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { players } from '../db/schema';
import { isGoogleAuthConfigured, AuthUser } from '../auth/passport';

const router = Router();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  if (!isGoogleAuthConfigured) {
    res.status(503).json({ code: 'GOOGLE_AUTH_DISABLED', message: 'Google 登录未配置' });
    return;
  }
  const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
  if (playerId) req.session.linkPlayerId = playerId;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    if (!isGoogleAuthConfigured) {
      res.redirect(CLIENT_ORIGIN);
      return;
    }
    passport.authenticate('google', { failureRedirect: CLIENT_ORIGIN })(req, res, next);
  },
  async (req: Request, res: Response) => {
    const user = req.user as AuthUser | undefined;
    const linkPlayerId = req.session.linkPlayerId;

    if (user && linkPlayerId) {
      await getDb()
        .insert(players)
        .values({ id: linkPlayerId, userId: user.id, nickname: user.name ?? 'Player' })
        .onConflictDoUpdate({ target: players.id, set: { userId: user.id } });
      delete req.session.linkPlayerId;
    }

    res.redirect(CLIENT_ORIGIN);
  },
);

router.post('/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ code: 'NOT_AUTHENTICATED' });
    return;
  }
  const user = req.user as AuthUser;
  res.json({ user });
});

export default router;
