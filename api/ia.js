// Função de servidor da Vercel para a IA.
//
// A chave do Groq fica SOMENTE aqui, nas variáveis de ambiente do projeto.
// Ela nunca é enviada ao navegador e não aparece em nenhum arquivo da pasta dist.
//
// Variáveis necessárias no painel da Vercel (Settings -> Environment Variables):
//   GROQ_DASHBOARD_API_KEY  -> perguntas e organização do painel
//   GROQ_REPORT_API_KEY     -> observações finais dos relatórios
//
// A regra de negócio é a mesma já testada do projeto: validação da pergunta,
// bloqueio de origem externa, limite de tamanho e teto de tokens por chamada.
import { handleAI } from '../netlify/functions/_shared/ai-service.mjs';

// Controle de cota. Na Vercel não existe armazenamento compartilhado gratuito,
// então o contador vive na memória da instância: ele segura repetição rápida e
// uso contínuo, mas duas instâncias simultâneas contam separado. O teto real de
// gasto continua sendo o limite da própria conta Groq.
const memoria = new Map();
const store = {
  async getWithMetadata(chave) {
    const item = memoria.get(chave);
    return item ? { data: item.data, etag: item.etag } : null;
  },
  async setJSON(chave, data, condicao = {}) {
    const atual = memoria.get(chave);
    if (condicao.onlyIfNew && atual) return { modified: false };
    if (condicao.onlyIfMatch && atual?.etag !== condicao.onlyIfMatch) return { modified: false };
    memoria.set(chave, { data, etag: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
    return { modified: true };
  },
};

export const config = { api: { bodyParser: false } };

async function corpo(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const partes = [];
  for await (const parte of req) partes.push(parte);
  return Buffer.concat(partes).toString('utf8');
}

export default async function handler(req, res) {
  try {
    const protocolo = req.headers['x-forwarded-proto'] || 'https';
    const url = `${protocolo}://${req.headers.host}${req.url}`;
    const texto = ['GET', 'HEAD'].includes(req.method) ? undefined : await corpo(req);
    const cabecalhos = new Headers();
    for (const [nome, valor] of Object.entries(req.headers)) {
      if (typeof valor === 'string') cabecalhos.set(nome, valor);
      else if (Array.isArray(valor)) cabecalhos.set(nome, valor.join(', '));
    }
    const resposta = await handleAI(new Request(url, { method: req.method, headers: cabecalhos, body: texto }), { store });
    res.statusCode = resposta.status;
    resposta.headers.forEach((valor, nome) => res.setHeader(nome, valor));
    res.end(Buffer.from(await resposta.arrayBuffer()));
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'IA indisponível no momento. Os indicadores, filtros e o PDF continuam funcionando.' }));
  }
}
