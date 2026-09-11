import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { transformWorkbook } from '../netlify/functions/_shared/data.mjs';
test('DDS sem quantidade não inventa uma participação e linhas vazias são descartadas',()=>{const result=transformWorkbook({dds:[{}, {Data:'11/09/2026',Participantes:'Todos da equipe'}, {Data:'11/09/2026',Participantes:0}]});assert.equal(result.dds.length,2);assert.equal(result.dds[0].participants,null);assert.equal(result.dds[1].participants,0);});
test('arquivos públicos não contêm chaves nem campo de código de IA',async()=>{
  async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=`${path}/${entry.name}`;if(entry.isDirectory())await walk(file);else{const content=await readFile(file,'utf8');assert.ok(!/gsk_[A-Za-z0-9]{30,}/.test(content),file);assert.ok(!content.includes('Código de acesso à IA'),file);}}}
  await walk('dist');
});
