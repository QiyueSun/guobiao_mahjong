import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { setupSocketHandler } from './socket/SocketHandler';
import apiRoutes from './api/routes';
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

app.use('/api/v1', apiRoutes);

setupSocketHandler(io);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, '🀄 Mahjong server started');
});

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection');
});
