import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users, oauthAccounts } from '../db/schema';
import { logger } from '../logger';

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    linkPlayerId?: string;
  }
}

export const isGoogleAuthConfigured = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export function configurePassport(): void {
  passport.serializeUser((user: AuthUser, done) => done(null, user.id));

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await getDb().select().from(users).where(eq(users.id, id));
      done(null, user ?? null);
    } catch (err) {
      done(err as Error);
    }
  });

  if (!isGoogleAuthConfigured) {
    logger.warn('Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET missing) — login disabled');
    return;
  }

  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/api/v1/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const db = getDb();
        const providerAccountId = profile.id;

        const [existing] = await db.select().from(oauthAccounts)
          .where(and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerAccountId, providerAccountId)));

        if (existing) {
          const [user] = await db.select().from(users).where(eq(users.id, existing.userId));
          done(null, user);
          return;
        }

        const [user] = await db.insert(users).values({
          name: profile.displayName ?? null,
          email: profile.emails?.[0]?.value ?? null,
          avatarUrl: profile.photos?.[0]?.value ?? null,
        }).returning();

        await db.insert(oauthAccounts).values({
          userId: user.id,
          provider: 'google',
          providerAccountId,
        });

        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    },
  ));
}
