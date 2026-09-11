import { build } from 'esbuild';
await build({entryPoints:['src/pdf.js'],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/assets/pdf.bundle.js',legalComments:'eof',external:['html2canvas','dompurify']});
// Leitura direta da planilha pelo navegador, usada quando a publicação tem só a pasta dist.
await build({entryPoints:['src/sheets-browser.js'],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/assets/sheets-client.js',legalComments:'eof'});
console.log('Dashboard e gerador de PDF prontos. Nenhuma variável secreta é incorporada ao navegador.');
