import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
try{process.loadEnvFile('.env.local');}catch{}
process.env.SAFE_LOCAL_DEV='1';
const root=resolve('dist'),port=Number(process.env.PORT)||4174;
const {handler:dataHandler}=await import('../netlify/functions/sheets-data.mjs');
const {handler:authHandler}=await import('../netlify/functions/reports-auth.mjs');
const {handler:photosHandler}=await import('../netlify/functions/photos.mjs');
const {handler:recordsHandler}=await import('../netlify/functions/records.mjs');
const {handleAI}=await import('../netlify/functions/_shared/ai-service.mjs');
await mkdir('.local-state',{recursive:true});
let queue=Promise.resolve();
const readBudget=async()=>{try{const body=await readFile('.local-state/ai-budget.json','utf8');return{data:JSON.parse(body),etag:createHash('sha256').update(body).digest('hex')};}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const localStore={getWithMetadata:readBudget,setJSON:(_key,data,condition)=>{const job=queue.then(async()=>{const previous=await readBudget();if(condition.onlyIfNew&&previous||condition.onlyIfMatch&&previous?.etag!==condition.onlyIfMatch)return{modified:false};await writeFile('.local-state/ai-budget.json',JSON.stringify(data));return{modified:true};});queue=job.catch(()=>{});return job;}};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.pdf':'application/pdf'};
http.createServer(async(req,res)=>{
  try{
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);return res.end();}
    const url=new URL(req.url,`http://127.0.0.1:${port}`);let body='';
    for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>5_500_000){res.writeHead(413);return res.end();}}
    if(url.pathname==='/api/ia'){
      const response=await handleAI(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body}),{store:localStore});
      res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());
    }
    if(['/api/dados','/api/relatorios-acesso','/api/fotos','/api/registros'].includes(url.pathname)){
      const handler=url.pathname==='/api/dados'?dataHandler:url.pathname==='/api/relatorios-acesso'?authHandler:url.pathname==='/api/fotos'?photosHandler:recordsHandler;
      const response=await handler({httpMethod:req.method,headers:req.headers,queryStringParameters:Object.fromEntries(url.searchParams),body});res.writeHead(response.statusCode,response.headers);return res.end(response.isBase64Encoded?Buffer.from(response.body,'base64'):response.body);
    }
    let path=decodeURIComponent(url.pathname);if(path==='/')path='/index.html';if(path==='/relatorios')path='/relatorios.html';
    const file=resolve(root,`.${path}`);if(!file.startsWith(root+sep)||path.split('/').some(part=>part.startsWith('.'))){res.writeHead(403);return res.end();}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(content);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Recurso indisponível.'}));}
}).listen(port,'127.0.0.1',()=>console.log(`Prévia local: http://127.0.0.1:${port} | Demonstração: http://127.0.0.1:${port}/?demo=1`));
