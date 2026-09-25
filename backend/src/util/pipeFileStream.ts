import type { ReadStream } from 'node:fs';
import type { Request, Response } from 'express';

/** Pipe a file stream to the response and tear it down if the client disconnects */
export function pipeFileStream(
  req: Request,
  res: Response,
  stream: ReadStream,
): void {
  const cleanup = () => {
    if (!stream.destroyed) stream.destroy();
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
  stream.on('error', (error) => {
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read file' });
      return;
    }
    res.destroy(error);
  });
  stream.pipe(res);
}
