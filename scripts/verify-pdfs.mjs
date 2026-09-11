import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildReport } from '../dist/assets/report-model.js';
import { createReportPdf } from '../src/pdf.js';
const demo=JSON.parse(await readFile('dist/data/demo-data.json','utf8'));
await mkdir('qa',{recursive:true});
for(const type of ['weekly','monthly']){
  const report=buildReport(demo,{type,date:'2026-09-09',demo:true,owner:'Responsável técnico — exemplo',notes:'Texto revisado: manter acompanhamento das pendências e registrar a conclusão das ações na planilha. Dados fictícios para teste.'});
  const pdf=createReportPdf(report);
  await writeFile(`qa/Exemplo_${type}.pdf`,Buffer.from(pdf.output('arraybuffer')));
  console.log(`${type}: ${pdf.getNumberOfPages()} páginas.`);
}
const stress={...demo,inspections:Array.from({length:65},(_,i)=>({...demo.inspections[2],condition:`REGISTRO-${String(i+1).padStart(3,'0')}: condição de teste com acentuação, inspeção e ação corretiva.`,action:'Avaliar a condição com o responsável técnico. Registrar evidência e acompanhar o prazo na planilha.'}))};
const stressPdf=createReportPdf(buildReport(stress,{type:'monthly',date:'2026-09',demo:true,notes:'OBSERVACAO-FINAL-PRESERVADA: revisão humana realizada para o teste de paginação.'}));
await writeFile('qa/Teste_65_registros.pdf',Buffer.from(stressPdf.output('arraybuffer')));
console.log(`65 registros: ${stressPdf.getNumberOfPages()} páginas.`);
