import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4'te async route handler'larda atılan hatalar otomatik olarak error
 * middleware'e yönlendirilmez — yakalanmayan bir promise reddi, Node 20'nin
 * varsayılan davranışı gereği TÜM PROCESS'İ ÇÖKERTİR. Bu sarmalayıcı her async
 * handler'ı bu riskten korur (bkz. index.ts'teki global error handler).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
