import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { OBJECTIVE, REFERENCES } from '../dist/assets/report-model.js';
import { formatDate } from '../dist/assets/shared.js';
const text = value => String(value || 'Não informado').replace(/[\u0000-\u0008]/g,'');
export function createReportPdf(report) {
  const doc=new jsPDF({unit:'mm',format:'letter',compress:true});
  doc.setProperties({title:report.title,subject:report.period,author:'INTEP Plásticos',creator:'INTEP Segurança'});
  const margin=18, width=180, bottom=257; let y=20;
  const page=()=>{doc.addPage();y=22;};
  const paragraph=(content,size=9,bold=false)=>{
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(25,35,48);
    const lines=doc.splitTextToSize(String(content),width);
    for(const line of lines){if(y+size*.45>bottom)page();doc.text(line,margin,y);y+=size*.45;}y+=3;
  };
  const heading=content=>{if(y+16>bottom)page();y+=3;paragraph(content,10,true);};
  const table=(head,body,columnStyles={})=>{
    autoTable(doc,{startY:y,head:[head],body,margin:{top:22,right:18,bottom:23,left:18},tableWidth:width,styles:{font:'helvetica',fontSize:8,cellPadding:2.4,overflow:'linebreak',valign:'top',textColor:[25,35,48],lineColor:[220,226,232],lineWidth:.15},headStyles:{fillColor:[23,56,90],textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[243,246,249]},columnStyles,rowPageBreak:'avoid',showHead:'everyPage'});y=doc.lastAutoTable.finalY+6;
  };
  doc.setFillColor(16,37,63);doc.rect(0,0,216,10,'F');
  paragraph('INTEP PLÁSTICOS',11,true);
  paragraph(report.title,15,true);
  paragraph('Registro de Condições Observadas e Ações Corretivas',9);
  paragraph(report.demo?'DEMONSTRAÇÃO — DADOS FICTÍCIOS. NÃO UTILIZAR COMO RELATÓRIO REAL.':'PRÉVIA — Revisão e aprovação técnica necessárias antes da emissão.',9,true);
  table(['Empresa','Responsável','Período'],[['INTEP PLÁSTICOS',text(report.owner),report.period]]);
  paragraph(`Recorte: ${report.filterLabel}`,8);
  paragraph(`Dados consultados em: ${new Date(report.generatedAt || report.emittedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,8);
  heading('1. OBJETIVO');paragraph(OBJECTIVE);
  heading('2. INDICADORES DO PERÍODO');
  const m=report.metrics;
  table(['Inspeções','DDS / participações','Dias de ausência','Pendências / resolvidas'],[[m.inspections,`${m.dds} / ${m.participants}`,m.absenceDays,`${m.actions} / ${m.resolved}`]]);
  paragraph('Pendências são contadas exclusivamente na aba Pendências. Dias de ausência são quantidades informadas, agrupadas pela data da entrevista; não representam uma taxa. DDS conta registros, incluindo agendamentos. Participações somam somente quantidades numéricas informadas.',8);
  heading('3. REGISTRO DAS CONDIÇÕES OBSERVADAS');
  if(report.data.inspections.length) table(['Local / data','Condição observada','Risco','Ação corretiva','Prioridade'],report.data.inspections.map(r=>[`${text(r.sector)}\n${formatDate(r.date)}`,text(r.condition || r.item),text(r.risk),text(r.action),text(r.priority)]),{0:{cellWidth:27},1:{cellWidth:46},2:{cellWidth:31},3:{cellWidth:50},4:{cellWidth:26}});
  else paragraph('Nenhuma condição registrada no recorte selecionado. Ausência de registros não significa ausência de riscos.');
  heading('4. ACOMPANHAMENTO DAS PENDÊNCIAS');
  if(report.data.pending.length) table(['Setor / pendência','Ação corretiva','Responsável','Prazo / status'],report.data.pending.map(r=>[`${text(r.sector)}\n${text(r.description)}`,text(r.action),text(r.owner),`${formatDate(r.due)}\n${text(r.status)}`]),{0:{cellWidth:55},1:{cellWidth:60},2:{cellWidth:32},3:{cellWidth:33}});
  else paragraph('Nenhuma pendência registrada no recorte selecionado.');
  heading('5. DDS DO PERÍODO');
  if(report.data.dds.length) table(['Data / setor','Tema','Turno','Participações','Registro'],report.data.dds.map(r=>[`${formatDate(r.date)}\n${text(r.sector)}`,text(r.topic),text(r.shift),r.participants ?? 'Não informado',r.registered?'Sim':'Não']));
  else paragraph('Nenhum DDS registrado no recorte selecionado.');
  heading('6. REFERÊNCIAS DO MODELO — VALIDAR APLICABILIDADE');paragraph(REFERENCES);
  heading('7. OBSERVAÇÕES FINAIS');paragraph(report.notes || 'Sem observações adicionais.');
  const photos=Array.isArray(report.photos)?report.photos.filter(p=>p && typeof p.dataUrl==='string' && p.dataUrl.startsWith('data:image/')):[];
  if(photos.length){
    heading('8. REGISTRO FOTOGRÁFICO');
    paragraph('Imagens anexadas pela pessoa responsável. Confirme que nenhuma delas expõe dados pessoais ou informações médicas antes de distribuir o documento.',8);
    photos.forEach((photo,index)=>{
      const ratio=photo.height&&photo.width?photo.height/photo.width:0.75;
      const boxWidth=Math.min(width,120);
      let drawWidth=boxWidth, drawHeight=boxWidth*ratio;
      if(drawHeight>95){drawHeight=95;drawWidth=drawHeight/ratio;}
      if(y+drawHeight+12>bottom)page();
      try{doc.addImage(photo.dataUrl,'JPEG',margin,y,drawWidth,drawHeight,`foto-${index}`,'MEDIUM');}
      catch{paragraph(`Foto ${index+1} não pôde ser incorporada ao PDF.`,8);return;}
      y+=drawHeight+4;
      paragraph(`Foto ${index+1}${photo.caption?` — ${text(photo.caption)}`:''}`,8);
    });
  }
  if(y+32>bottom)page(); y+=12;doc.setDrawColor(110,120,130);doc.line(margin,y,margin+90,y);y+=5;paragraph(`Responsável: ${text(report.owner)}`);paragraph('Revisão / aprovação: ____________________     Data: ____/____/________',8);
  const count=doc.getNumberOfPages();
  for(let i=1;i<=count;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(100);doc.text(`INTEP | ${report.demo?'DEMONSTRAÇÃO':'PRÉVIA PARA REVISÃO'} | ${report.period}`,margin,268);doc.text(`${i} / ${count}`,198,268,{align:'right'});}
  return doc;
}
export function downloadReport(report) { createReportPdf(report).save(`INTEP_${report.type==='monthly'?'Mensal':'Semanal'}_${report.filters.start}${report.demo?'_DEMONSTRACAO':''}.pdf`); }
