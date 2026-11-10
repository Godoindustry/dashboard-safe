# Ligar o dashboard à planilha (uma vez só, ~10 minutos)

O script fica dentro da planilha. Ele grava os registros do dashboard e guarda fotos e PDFs
numa pasta do Google Drive de quem instalar ("SAFE - Evidências e relatórios").
Instale com a conta Google que vai guardar as fotos e que tem permissão de editar a planilha.

1. Abra a planilha → menu **Extensões → Apps Script**.
2. Apague o que estiver no editor e cole todo o conteúdo de `Codigo.gs`. Clique em **Salvar** (ícone de disquete).
3. No topo, escolha a função **configurar** e clique em **Executar**.
   - O Google pede permissão: **Revisar permissões** → escolha sua conta → **Avançado** → **Acessar (não seguro)** → **Permitir**.
     O aviso aparece porque o script é seu e não passou por revisão do Google; ele só mexe nesta planilha e na pasta que cria.
   - Não precisa copiar nada do registro: o dashboard se conecta sozinho.
4. **Implantar → Nova implantação** → engrenagem → **App da Web**.
   - Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**. → **Implantar**.
   - Copie o **URL do app da Web** (termina em `/exec`).
5. Na Vercel (projeto dashboard-safe → Settings → Environment Variables), crie só
   `GOOGLE_APPS_SCRIPT_URL` = o link do passo 4.
6. Vercel → **Deployments** → três pontinhos da publicação mais recente → **Redeploy**.
7. Abra `https://dashboard-safe-sooty.vercel.app/api/relatorios-acesso?verificar=1` em até 7 dias.
   Deve aparecer `"script":"ok"`: o dashboard e o script se parearam.

O "Qualquer pessoa" do passo 4 é seguro: depois do pareamento o script só aceita o dashboard.

Se um dia trocar o código do script, use **Implantar → Gerenciar implantações → editar → Nova versão**,
assim o link continua o mesmo.
