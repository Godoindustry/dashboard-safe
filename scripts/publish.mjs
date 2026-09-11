import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const prompt=createInterface({input:process.stdin,output:process.stdout});
const npm=process.env.npm_execpath;
if(!npm){console.error('Abra PUBLICAR-NETLIFY.cmd ou execute npm run publicar.');process.exit(1);}
const npx=join(dirname(npm),'npx-cli.js');
async function run(file,args,quiet=false){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[file,...args],{stdio:quiet?['inherit','ignore','ignore']:'inherit',env:process.env,windowsHide:true});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Etapa interrompida (${code}). Confira conexão, conta e configurações do Netlify.`)));
  });
}
const cli=(...args)=>run(npx,['--yes','netlify-cli@27.5.2',...args]);
try{
  console.log('\nINTEP — Publicação guiada no Netlify\nO site será público. Use uma conta no plano Free, com recarga automática desativada.');
  console.log('Não envie o arquivo .env.local para repositórios ou pastas públicas.');
  const answer=await prompt.question('Continuar com a preparação? Digite SIM: ');
  if(answer.trim().toUpperCase()!=='SIM')process.exit(0);
  await run(npm,['ci']);
  await cli('login');
  let linked=false;try{await access('.netlify/state.json');linked=true;}catch{}
  if(!linked){
    const choice=await prompt.question('Você já criou um projeto vazio no Netlify? (S/N): ');
    if(choice.trim().toUpperCase()==='S')await cli('link');
    else await cli('sites:create');
  }
  const linkedState=JSON.parse(await readFile('.netlify/state.json','utf8'));
  console.log(`\nProjeto vinculado: ${linkedState.siteId}. Confira o projeto acima para não alterar outro site.`);
  let envFile;
  try{await access('.env.local');envFile='.env.local';}catch{}
  if(envFile){
    const importChoice=await prompt.question('Importar as chaves locais para as variáveis privadas deste projeto? (S/N): ');
    if(importChoice.trim().toUpperCase()==='S'){
      await run(npx,['--yes','netlify-cli@27.5.2','env:import',envFile],true);
      console.log('Configuração importada sem mostrar as chaves.');
    }
  }else{
    console.log('Configure GROQ_DASHBOARD_API_KEY e GROQ_REPORT_API_KEY nas variáveis de ambiente do projeto, escopo Functions, contexto Production. Veja LEIA-ME.html.');
    const ready=await prompt.question('As duas chaves já estão configuradas no Netlify? Digite SIM para continuar: ');
    if(ready.trim().toUpperCase()!=='SIM')process.exit(0);
  }
  const publish=await prompt.question('Publicar agora neste projeto? Digite PUBLICAR: ');
  if(publish.trim().toUpperCase()!=='PUBLICAR')process.exit(0);
  await cli('deploy','--prod','--context','production','--open');
  console.log('Publicação concluída. Confira a leitura da planilha e envie uma pergunta curta à IA.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{prompt.close();}
