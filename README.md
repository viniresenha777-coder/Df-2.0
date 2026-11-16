# Fronteira Morta 2.0

Jogue no navegador: https://viniresenha777-coder.github.io/Df-2.0/

## Cadastro, login e progresso online (Supabase)

A versão web usa **Supabase Auth** para criar e autenticar contas por e-mail e senha.
Apenas um JSON com o progresso do jogo é guardado em `public.fm_partidas`, associado ao identificador da conta. **Senhas não são armazenadas pelo jogo ou no GitHub.**

### Configuração obrigatória do Supabase

1. Acesse seu projeto no Supabase → **SQL Editor**. Cole e execute todo o conteúdo de [supabase/configurar-banco.sql](supabase/configurar-banco.sql). O script cria a tabela e aplica Row Level Security (RLS) para que cada jogador veja e altere somente a própria partida.
2. Em **Authentication → URL Configuration**, defina o **Site URL** para `https://viniresenha777-coder.github.io/Df-2.0/`. Adicione exatamente esse mesmo endereço em **Redirect URLs**.
3. Em **Authentication → Providers → Email**, habilite logins com e-mail e senha. Recomenda-se manter a confirmação de e-mail ativada.
4. Teste cadastro, confirmação por e-mail, login, carregar jogo e **Esc → Salvar e sair**.

Se o link de confirmação apontar para `localhost:3000`, o Site URL/Redirect URLs ainda não estão corretos.
A opção **Reenviar confirmação** ajuda quando o link anterior expirou.

### Como o salvamento funciona

- Checkpoints automáticos na troca de área e periodicamente; salvamento manual no menu.
- A interface só confirma que salvou após receber resposta positiva do Supabase.
- **Salvar e sair** grava, sai da sessão e volta ao login; navegadores não permitem fechar de forma confiável uma aba aberta manualmente.
- Se houver save local neste navegador, você pode marcar a opção para importá-lo ao entrar na primeira conta sem save online. O save local não é apagado automaticamente.
- Alterações simultâneas da mesma partida em dispositivos diferentes são detectadas pelo campo `revisao`; quando houver conflito, entre novamente antes de continuar.

### Atualização do site

O workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) publica automaticamente mudanças de `index.html`, `css/`, `js/` ou `img/` na `main`. Uma nova Release com um ZIP completo também pode atualizar o jogo.

> A publicação do site é automática, mas a execução do SQL e as configurações de Auth dependem do proprietário do Supabase.
