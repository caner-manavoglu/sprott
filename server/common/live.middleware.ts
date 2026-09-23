import type { Response, NextFunction } from 'express';
import { EventEmitter } from 'node:events';
import type { AuthRequest } from './auth.ts';

/**
 * Değişiklik sinyali (SSE). Pano döndüren yazma istekleri olayı proje kimliğiyle yayar;
 * istemci başka projenin panosunu yeniden çekmez. Diğer yazmalar kapsamsız yayılır.
 * ponytail: tek API süreci; birden fazla instance için PostgreSQL LISTEN/NOTIFY kullanın.
 */
export function liveMiddleware() {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/live') {
      if (!req.user) {res.status(401).json({message: 'Lütfen giriş yapın.'}); return;}
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      // Yalnızca yenile sinyali; veriler her seferinde yetkili GET uçlarından okunur.
      const changed = (projectId: number | null) => res.write(`data: ${projectId === null ? 'changed' : `project:${projectId}`}\n\n`);
      events.on('changed', changed);
      changed(null);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
      res.on('close', () => {clearInterval(heartbeat); events.off('changed', changed);});
      return;
    }
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      (!req.path.startsWith('/mcp') ||
        (req.path === '/mcp/http' && req.body?.method === 'tools/call' && req.body?.params?.name === 'transition_task') ||
        (req.path === '/mcp/tools' && req.body?.operation === 'transition_task'));
    if (mutation) {
      // Pano yanıtı (`{project: {id}, columns, tasks}`) hangi projenin değiştiğini söyler.
      const json = res.json.bind(res);
      res.json = body => {
        const projectId = body?.project?.id;
        if (typeof projectId === 'number' && body.columns) res.locals.liveProject = projectId;
        return json(body);
      };
      res.on('finish', () => {if (res.statusCode < 400 && res.locals.liveChanged !== false) events.emit('changed', res.locals.liveProject ?? null);});
    }
    next();
  };
}
