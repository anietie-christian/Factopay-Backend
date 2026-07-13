import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

export function bullBoardAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const expectedUser = process.env.BULL_BOARD_USER;
  const expectedPass = process.env.BULL_BOARD_PASS;

  if (!expectedUser || !expectedPass) {
    // Fail-closed
    return res.status(500).send('BULL_BOARD credentials not configured.');
  }

  const expectedUserBuf = Buffer.from(expectedUser);
  const expectedPassBuf = Buffer.from(expectedPass);
  const loginBuf = Buffer.from(login || '');
  const passBuf = Buffer.from(password || '');

  if (
    loginBuf.length === expectedUserBuf.length &&
    passBuf.length === expectedPassBuf.length &&
    crypto.timingSafeEqual(loginBuf, expectedUserBuf) &&
    crypto.timingSafeEqual(passBuf, expectedPassBuf)
  ) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="401"');
  res.status(401).send('Authentication required.');
}
