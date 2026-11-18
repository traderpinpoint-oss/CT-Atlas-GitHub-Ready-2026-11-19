import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8767);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let filename;
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    filename=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!filename.startsWith(root+path.sep))throw Error('Outside root');
  } catch {res.writeHead(400);res.end('Invalid path');return;}
  fs.stat(filename,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());stream.pipe(res);
  });
});
server.on('error',error=>{console.error(`Could not start: ${error.message}. Choose another PORT if this one is busy.`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`CT Atlas: http://127.0.0.1:${port}/ - keep this terminal open. Press Ctrl+C to stop.`));
