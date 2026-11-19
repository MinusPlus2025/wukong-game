import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  server: { port: 5181, host: true },
  plugins: [
    {
      name: 'save-wukong-recording',
      configureServer(server) {
        server.middlewares.use('/api/save-film', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }
          const dir = path.resolve(process.cwd(), 'public/recordings');
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `wukong-${Date.now()}.webm`);
          const out = fs.createWriteStream(file);
          req.pipe(out);
          out.on('finish', () => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: `/recordings/${path.basename(file)}` }));
          });
          out.on('error', (err) => {
            res.statusCode = 500;
            res.end(String(err));
          });
        });
      },
    },
  ],
});
