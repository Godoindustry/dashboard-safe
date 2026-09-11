# DASHBOARD SAFE · SAFE

Dashboard de segurança do trabalho, Google Sheets, Groq e Netlify. Versão 2.0.

## Comece aqui

Abra `LEIA-ME.html`. No Windows, `PUBLICAR-NETLIFY.cmd` inicia uma publicação guiada. É necessário Node.js 24 LTS, internet e sua conta Netlify Free. O publicador pede login, cria ou vincula um projeto, importa as configurações privadas quando autorizadas e publica o painel com as funções de servidor. Não publica nada apenas por abrir esta pasta.

O ZIP de entrega contém o projeto completo, sem chaves, dependências instaladas ou arquivos de teste gerados. Extraia antes de usar. **Não arraste somente `dist` para Netlify Drop:** esse fluxo não prepara as funções de IA e Google Sheets. Use o publicador ou um repositório Git conectado ao Netlify.

Se publicar por Git: base desta pasta (`DASHBOARD SAFE` em um repositório que também contém outros projetos); build `npm run build && npm run check && npm test`; publish `dist`; functions `netlify/functions`. O `netlify.toml` já configura tudo. Configure as chaves antes do deploy.

## O que funciona

- Consulta automática a cada 15 segundos enquanto a aba está visível, com pausa, atualização manual, preservação de filtros e aviso quando só a última leitura estiver disponível.
- Filtros combináveis por múltiplos meses, datas, setor, status, prioridade, busca, turno, registro de DDS e prazo vencido. Clique nas barras/legendas para filtrar. Explorador por tipo, ordenação e paginação, sem limitar o total a oito registros.
- Temas claro e escuro, preferência salva no navegador.
- IA sem senha de visitante: analisa indicadores e organiza a visualização por comandos. Alterações visuais podem ser desfeitas. Não edita a planilha, não cria fatos nem toma decisões de segurança no lugar de um responsável.
- Área separada `/relatorios`: semanal (segunda–domingo) e mensal, filtros, observações editáveis e download PDF paginado. PDF não usa IA obrigatoriamente. A análise gerada permanece no PDF.
- Relatórios seguem a estrutura do Word fornecido, com indicadores e DDS acrescentados. Referências normativas são as do modelo, não certificação de conformidade. Toda saída é uma prévia para revisão/aprovação técnica.

## Integração e chaves

`GROQ_DASHBOARD_API_KEY`: chave 2, perguntas e organização. `GROQ_REPORT_API_KEY`: chave 1, relatórios semanais e mensais. Não há fallback entre as chaves. Modelo fixado: `openai/gpt-oss-20b`, raciocínio baixo e saída limitada.

Na cópia local, as chaves fornecidas estão em `.env.local`, ignorado pelo Git e excluído do ZIP. O publicador pode importar esse arquivo para variáveis do Netlify, sem imprimir valores. Em uma cópia extraída do ZIP, cadastre as duas variáveis no Netlify (escopo Functions, contexto Production), ou copie seu `.env.local` privado para a raiz antes de publicar. Nunca o coloque dentro de `dist`. Como as chaves foram compartilhadas em conversa, é recomendável substituí-las no Groq antes de distribuir o projeto.

O painel não precisa de banco de dados externo pago. Netlify Blobs guarda apenas um pequeno contador global de consumo, sem conversas nem dados da planilha. Se esse contador estiver indisponível, a IA bloqueia a chamada para não gastar sem controle.

## Atualização e limites Free

“Tempo real” aqui é **atualização por consulta**, não envio instantâneo do Google Sheets. Navegador: 15 s; memória do servidor: 10 s; cache da CDN: até 5 s. O próprio Google pode demorar para propagar uma alteração. Não é possível prometer um prazo máximo de 15 s. Abas ocultas param a consulta; falhas aumentam o intervalo até 120 s. Relatórios preservam a prévia em edição e avisam quando há dados novos.

IA: no máximo **60.000 tokens reservados/dia, 30 chamadas/dia, 6.000 tokens reservados por chamada e intervalo global de 65 s**, compartilhados pelas duas chaves e por todos os visitantes deste projeto. Contagem conservadora por bytes de entrada + margem + teto de saída; falhas também ficam reservadas. O orçamento diário reinicia às 00h UTC (21h em São Paulo). Com perguntas maiores, o limite de tokens pode bloquear antes das 30 chamadas. Não há tentativas automáticas nem IA em cada atualização.

Esses limites são deste dashboard, não leitura do saldo real da conta Groq. Chaves da mesma organização compartilham limites, e outros aplicativos também podem consumi-los. Confira os limites efetivos na sua conta. Para manter custo zero, não migre para plano pago nem habilite cobrança automática. O plano Netlify Free atual tem teto de 300 créditos/mês; tráfego, funções e publicações consomem créditos. Se esgotar, o serviço pode pausar. **Gratuidade com acesso ilimitado ou disponibilidade ininterrupta não pode ser garantida.**

Referências oficiais consultadas em 11/09/2026: [Netlify Free](https://www.netlify.com/pricing/), [limites Groq](https://console.groq.com/docs/rate-limits), [CLI Netlify](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

## Dados e privacidade

Planilha configurada: `1BcHzuaOFOm2MMs11l-BNBzMmlnzdHdPrnhSnIPk7z30`. Abas: Inspeções por Setor, DDS, Absenteísmo e Pendências. Nenhum dado foi inserido ou alterado na planilha. Indicativo Diário é um formulário sem histórico; Resumo Mensal não substitui as linhas de origem. Novos lançamentos nas quatro abas alimentam o painel.

As colunas atuais são aceitas. Adicione **Risco** e **Prioridade** às inspeções e **Prioridade** às pendências para preencher esses campos; caso contrário aparecem como não informados. Veja `docs/contrato-de-dados.md`.

Taxa de resolução e alertas contam somente a aba Pendências: uma inspeção e sua pendência não viram duas ações. Canceladas saem do denominador. Ausências usam a data da entrevista, quantidade de dias informada e nunca uma taxa sem denominador. Registros sem data aparecem em “Todos” ou no filtro “Sem data”, não em meses específicos.

Nomes, CID, motivos e descrição médica da aba Absenteísmo não são enviados ao navegador ou ao Groq. O navegador recebe data, setor, dias e comunicação, não anonimização irreversível. Textos livres de inspeções e pendências são mostrados no painel: não inclua informações pessoais neles. A IA recebe somente agregados e filtros.

**Antes de registrar dados pessoais na planilha, retire o compartilhamento público** e configure leitura privada por conta de serviço Google: ative a API Google Sheets, compartilhe a planilha como Leitor com o e-mail da conta e preencha `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` no Netlify. Apenas uma das duas preenchida causa bloqueio, sem fallback público. Enquanto não configuradas, usa leitura pública da planilha. O link público original permite ver a planilha fora do dashboard; o painel não corrige esse compartilhamento.

A área de relatórios é separada, mas não é restrita por padrão. Para proteção opcional configure `REPORTS_ACCESS_CODE` e `REPORTS_SESSION_SECRET` (segredo aleatório longo). Isso protege relatórios, não adiciona código à IA do dashboard. PDFs baixados ficam no computador do usuário; não há arquivo histórico de PDFs em nuvem. O histórico de versões do Sheets ajuda na recuperação, mas não substitui backup independente.

## Desenvolvimento e verificação

`npm ci`, `npm run build`, `npm run check`, `npm test`, `npm start`. Prévia local em `http://127.0.0.1:4174`; `/?demo=1` mostra dados fictícios explicitamente identificados. Abra pelo servidor, não diretamente por `file://`. O servidor local nunca expõe `.env.local` e só aceita conexões de loopback. Seu contador persistente de teste fica em `.local-state`, fora da publicação.

Os testes cobrem datas, filtros, métricas sem dupla contagem, cabeçalhos reais, remoção de campos sensíveis, comandos permitidos, concorrência do orçamento, separação das chaves e PDF multipágina. A publicação e a configuração da conta Netlify precisam ser verificadas após o primeiro deploy.
