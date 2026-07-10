// Minimal mock of a Mastra server's agent-controller session SSE endpoint.
// Speaks just enough SSE for @mastra/client-js's AgentControllerSession.subscribe():
// emits 3 events, then terminates the connection. The resourceId in the path
// selects how:
//   - res-clean   → res.end()            (server closes the response cleanly)
//   - res-destroy → res.socket.destroy() (abrupt drop, like a network blip / proxy reset)
// Counts requests per path so the client script can prove no reconnect attempt arrives.
import http from 'node:http';

export function startMockServer() {
  const requestLog = []; // { path, authorization }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requestLog.push({ path: url.pathname, authorization: req.headers.authorization });

    if (!url.pathname.endsWith('/stream')) {
      res.writeHead(404).end();
      return;
    }

    const mode = url.pathname.includes('res-destroy') ? 'destroy' : 'clean';
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      res.write(`data: ${JSON.stringify({ type: 'demo_event', seq: n })}\n\n`);
      if (n === 3) {
        clearInterval(timer);
        // Small delay so the third event flushes before the connection dies.
        if (mode === 'destroy') setTimeout(() => res.socket.destroy(), 100);
        else res.end();
      }
    }, 50);
    res.on('close', () => clearInterval(timer));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requestLog,
        close: () => server.close(),
      });
    });
  });
}
