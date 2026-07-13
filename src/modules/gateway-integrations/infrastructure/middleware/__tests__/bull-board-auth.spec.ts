import { bullBoardAuthMiddleware } from '../bull-board-auth.middleware';
import { Request, Response } from 'express';

describe('Bull Board Auth Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    process.env.BULL_BOARD_USER = 'admin';
    process.env.BULL_BOARD_PASS = 'secret123';
    
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should reject without authorization header', () => {
    bullBoardAuthMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Authentication required.');
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept valid basic auth', () => {
    const b64 = Buffer.from('admin:secret123').toString('base64');
    req.headers = { authorization: `Basic ${b64}` };
    
    bullBoardAuthMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject invalid password but valid length (timing safe equal check)', () => {
    const b64 = Buffer.from('admin:secret456').toString('base64');
    req.headers = { authorization: `Basic ${b64}` };
    
    bullBoardAuthMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should not crash if password string is missing completely (no colon)', () => {
    const b64 = Buffer.from('admin').toString('base64');
    req.headers = { authorization: `Basic ${b64}` };
    
    expect(() => {
      bullBoardAuthMiddleware(req as Request, res as Response, next);
    }).not.toThrow();
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
