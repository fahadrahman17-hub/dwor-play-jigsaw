const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000;
const jg=require('./jigsaw-server')();
const server=http.createServer((req,res)=>{
 const u=req.url.split('?')[0],im=u.match(/^\/img\/([a-z0-9]{4})\/(\d+)$/);
 if(im){const r=jg.image(im[1],+im[2]);if(!r){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':r.mime,'Cache-Control':'private, max-age=300'});return res.end(r.buf)}
 fs.readFile(path.join(__dirname,'public','index.html'),(e,d)=>{res.writeHead(e?404:200,{'Content-Type':'text/html; charset=utf-8'});res.end(e?'Not found':d)})});
server.on('upgrade',(req,sock,head)=>jg.wss.handleUpgrade(req,sock,head,x=>jg.wss.emit('connection',x,req)));
server.listen(PORT,()=>console.log('DWOR jigsaw running on port '+PORT));
