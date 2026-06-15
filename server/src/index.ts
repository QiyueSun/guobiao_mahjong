import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import passport from 'passport';
import { Server } from 'socket.io';
import { setupSocketHandler } from './socket/SocketHandler';
import apiRoutes from './api/routes';
import authRoutes from './api/authRoutes';
import { configurePassport } from './auth/passport';
import { getRedis } from './redis';
import { logger } from './logger';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN ?? '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use(session({
  store: new RedisStore({ client: getRedis(), prefix: 'sess:' }),
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: parseInt(process.env.SESSION_TTL_SECONDS ?? '7200', 10) * 1000,
    httpOnly: true,
    sameSite: 'lax',
  },
}));

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/v1', apiRoutes);
app.use('/api/v1/auth', authRoutes);

setupSocketHandler(io);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, '🀄 Mahjong server started');
});

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection');
});
