# DASHBOARD SAFE · SAFE

Dashboard de segurança do trabalho, Google Sheets, Google Drive, Groq e Vercel. Versão 2.0.

## Comece aqui

Abra `LEIA-ME.html`. A produção usa a Vercel conectada ao repositório GitHub. Cada `push` em `main` inicia uma publicação conforme `vercel.json`.

O projeto completo inclui `dist`, `api`, as funções compartilhadas e `vercel.json`. Não publique somente `dist`: isso removeria lançamentos, fotos e agendamentos.

Na Vercel: Root Directory na raiz do repositório; Build Command conforme `vercel.json`; Output Directory `dist`. As funções em `api/` são detectadas automaticamente. Configure as variáveis antes do deploy.

## O que funciona

- Consulta automática a cada 15 segundos enquanto a aba está visível, com pausa, atualização manual, preservação de filtros e aviso quando só a última leitura estiver disponível.
- Filtros combináveis por múltiplos meses, datas, setor, status, prioridade, busca, turno, registro de DDS e prazo vencido. Clique nas barras/legendas para filtrar. Explorador por tipo, ordenação e paginação, sem limitar o total a oito registros.
- Temas claro e escuro, preferência salva no navegador.
- IA sem senha de visitante: analisa indicadores e organiza a visualização por comandos. Alterações visuais podem ser desfeitas. Não cria fatos nem toma decisões de segurança no lugar de um responsável.
- Cada uma das 12 frentes possui formulário de lançamento. O site grava inspeções, pendências ou DDS na aba correspondente da planilha Google e envia as fotos reduzidas para uma pasta privada do Google Drive.
- Área separada `/relatorios`: semanal (segunda–domingo) e mensal, filtros, fotos do Drive, observações editáveis e download PDF paginado. PDF não usa IA obrigatoriamente.
- Relatório semanal automático toda sexta-feira às 16h e mensal automático no último dia do mês às 15h, sempre no fuso `America/Sao_Paulo`. Os PDFs são arquivados no Drive sem duplicar uma mesma competência.
- Relatórios seguem a estrutura do Word fornecido, com indicadores e DDS acrescentados. Referências normativas são as do modelo, não certificação de conformidade. Toda saída é uma prévia para revisão/aprovação técnica.

## Integração e chaves

`GROQ_DASHBOARD_API_KEY`: chave 2, perguntas e organização. `GROQ_REPORT_API_KEY`: chave 1, relatórios semanais e mensais. Não há fallback entre as chaves. Modelo fixado: `openai/gpt-oss-20b`, raciocínio baixo e saída limitada.

Na cópia local, chaves ficam em `.env.local`, ignorado pelo Git. Em produção, cadastre-as em Vercel → Project → Settings → Environment Variables. Nunca coloque segredos dentro de `dist` ou no repositório.

O fluxo de planilha, fotos e relatórios não precisa de banco de dados externo. A IA é opcional; lançamentos e PDFs não dependem dela.

### Google Drive e gravação pelo site

Ative as APIs Google Sheets e Google Drive. Cadastre as variáveis na Vercel. A planilha deve ser compartilhada como **Editor** com `GOOGLE_SERVICE_ACCOUNT_EMAIL`. Para o Drive, escolha um destes modos:

- Google Workspace com Drive compartilhado: adicione a conta de serviço como colaboradora e configure `GOOGLE_DRIVE_SHARED_DRIVE_ID` e `GOOGLE_DRIVE_FOLDER_ID`.
- Google Workspace com delegação no domínio: configure `GOOGLE_DRIVE_IMPERSONATE_EMAIL` e a delegação administrativa para o escopo Drive.
- Meu Drive de uma pessoa: configure `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN`, além de `GOOGLE_DRIVE_FOLDER_ID`.

Contas de serviço não possuem cota própria para serem donas de arquivos em “Meu Drive”; sem Drive compartilhado ou impersonação, use OAuth. Configure obrigatoriamente `REPORTS_ACCESS_CODE`, `REPORTS_SESSION_SECRET` e `CRON_SECRET` com pelo menos 16 caracteres. `REPORT_OWNER` define o responsável mostrado nos PDFs automáticos.

## Atualização e limites Free

“Tempo real” aqui é **atualização por consulta**, não envio instantâneo do Google Sheets. Navegador: 15 s; memória do servidor: 10 s; cache da CDN: até 5 s. O próprio Google pode demorar para propagar uma alteração. Não é possível prometer um prazo máximo de 15 s. Abas ocultas param a consulta; falhas aumentam o intervalo até 120 s. Relatórios preservam a prévia em edição e avisam quando há dados novos.

IA: no máximo **60.000 tokens reservados/dia, 30 chamadas/dia, 6.000 tokens reservados por chamada e intervalo global de 65 s**, compartilhados pelas duas chaves e por todos os visitantes deste projeto. Contagem conservadora por bytes de entrada + margem + teto de saída; falhas também ficam reservadas. O orçamento diário reinicia às 00h UTC (21h em São Paulo). Com perguntas maiores, o limite de tokens pode bloquear antes das 30 chamadas. Não há tentativas automáticas nem IA em cada atualização.

Esses limites são deste dashboard, não leitura do saldo real da conta Groq. Na Vercel Hobby, cron jobs podem executar em qualquer minuto dentro da hora configurada; em planos superiores, executam no minuto indicado. Assim, no Hobby, “16h” significa entre 16:00 e 16:59. **Gratuidade com acesso ilimitado ou disponibilidade ininterrupta não pode ser garantida.**

Referências oficiais: [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [limites das Vercel Functions](https://vercel.com/docs/functions/limitations) e [limites Groq](https://console.groq.com/docs/rate-limits).

## Dados e privacidade

Planilha configurada: `1BcHzuaOFOm2MMs11l-BNBzMmlnzdHdPrnhSnIPk7z30`. Abas estruturadas: Inspeções por Setor, DDS, Absenteísmo e Pendências; também são lidas Indicativo Diário, Resumo Mensal e Inspeção de EPI. O formulário do site envia Plano de Ação para Pendências, Treinamentos/DDS para DDS e as demais frentes para Inspeções por Setor. O site não lança dados médicos de absenteísmo.

As colunas atuais são aceitas. Adicione **Risco** e **Prioridade** às inspeções e **Prioridade** às pendências para preencher esses campos; caso contrário aparecem como não informados. Veja `docs/contrato-de-dados.md`.

Taxa de resolução e alertas contam somente a aba Pendências: uma inspeção e sua pendência não viram duas ações. Canceladas saem do denominador. Ausências usam a data da entrevista, quantidade de dias informada e nunca uma taxa sem denominador. Registros sem data aparecem em “Todos” ou no filtro “Sem data”, não em meses específicos.

Nomes, CID, motivos e descrição médica da aba Absenteísmo não são enviados ao navegador ou ao Groq. O navegador recebe data, setor, dias e comunicação, não anonimização irreversível. Textos livres de inspeções e pendências são mostrados no painel: não inclua informações pessoais neles. A IA recebe somente agregados e filtros.

**Antes de registrar dados pessoais na planilha, retire o compartilhamento público** e configure a conta de serviço Google: compartilhe a planilha como Editor e preencha `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` na Vercel. Apenas uma das duas preenchida causa bloqueio.

A leitura pública do painel continua separada dos lançamentos. Para gravar registros ou abrir fotos, a pessoa precisa entrar em `/relatorios`; o cookie protegido vale para todo o site por 12 horas. Os PDFs manuais ficam no computador, e os PDFs automáticos são arquivados na pasta configurada do Drive. As imagens não são publicadas por URL aberta: passam por uma função autenticada.

## Desenvolvimento e verificação

`npm ci`, `npm run build`, `npm run check`, `npm test`, `npm start`. Prévia local em `http://127.0.0.1:4174`; `/?demo=1` mostra dados fictícios explicitamente identificados. Abra pelo servidor, não diretamente por `file://`. O servidor local nunca expõe `.env.local` e só aceita conexões de loopback. Seu contador persistente de teste fica em `.local-state`, fora da publicação.

Os testes cobrem datas, filtros, métricas sem dupla contagem, cabeçalhos reais, remoção de campos sensíveis, comandos permitidos, concorrência do orçamento, separação das chaves, PDF multipágina, roteamento dos lançamentos, validação de imagens e horários dos relatórios automáticos. A publicação e as permissões Google precisam ser verificadas após o primeiro deploy.
