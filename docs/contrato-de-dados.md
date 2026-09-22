# Contrato de dados do dashboard

## Inspeções por Setor

Campos: Data, Setor, Item verificado, Situação encontrada, Ação necessária,
Responsável, Prazo, Status, Foto/Evidência e Observações. Se forem adicionadas
as colunas Risco e Prioridade, elas passam a alimentar o relatório e os gráficos.

## DDS

Campos: Data, Horário, Tema do DDS, Setor, Turno, Responsável, Participantes,
Registro realizado? e Observações.

## Absenteísmo

Campos existentes aceitos: Data entrevista, Colaborador, Setor, Data(s)
ausência, Qtd. dias, Motivo informado, CID, Descrição do ocorrido, Ausência
comunicada? e Observações. O dashboard recebe somente Data entrevista, Setor,
Qtd. dias, Data(s) ausência e Ausência comunicada?. Os demais campos nunca saem da função do
servidor.

## Pendências

Cabeçalhos atuais reconhecidos: Data, Setor, Não conformidade / problema,
Ação corretiva, Responsável, Prazo, Status, Data de conclusão, Evidência e
Observações. Prioridade pode ser adicionada como coluna opcional.

## Indicadores e datas

Pendências fornecem a taxa de resolução e os alertas de prazo/prioridade.
Inspeções não são somadas de novo a essas contagens. Ausências são quantidades
de dias informadas, agrupadas pela data da entrevista, sem expor nomes ou CID.
Não são uma taxa de absenteísmo. Inspeções, pendências e DDS usam a coluna Data
nos filtros e relatórios; Prazo serve somente para acompanhamento de vencimento.

Um mês específico não inclui registros sem data. Eles ficam em Todos ou Sem data.
Prioridade e Risco ausentes são exibidos como Não informado, sem inferência por IA.

## Convenções

- Uma linha representa um registro.
- Não use células mescladas nas abas de dados.
- Datas devem ser valores de data.
- Quantidades devem ser números.
- Não repita o cabeçalho no meio da tabela.
- Novas linhas são reconhecidas automaticamente, sem alterar o dashboard.

## Lançamentos feitos pelo site

- Plano de Ação grava em **Pendências**.
- Treinamentos/DDS grava em **DDS**.
- As outras dez frentes gravam em **Inspeções por Setor**, usando o nome da frente em Item verificado.
- O servidor lê a linha de cabeçalho já existente e encaixa os valores pelos nomes aceitos acima; colunas desconhecidas ficam vazias.
- Cada envio recebe um ID único `SAFE-...`. O mesmo ID e os links privados das fotos ficam em Foto/Evidência ou Evidência, enquanto o Drive guarda ID, frente, data e setor nos metadados. Assim, o relatório associa as imagens ao lançamento correto mesmo quando há vários registros no mesmo dia.
- A planilha precisa estar compartilhada como Editor com a conta de serviço configurada.
