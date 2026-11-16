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

### Recuperação de senha por e-mail

1. No login, clique em **Esqueci minha senha**, informe seu e-mail e peça o link.
2. O Supabase envia a mensagem de recuperação. A resposta é neutra mesmo que o e-mail não exista, para proteger a privacidade.
3. O jogador abre o **link recebido no próprio e-mail**. Isso comprova o acesso à caixa postal e cria uma sessão de recuperação.
4. A página [recuperar.html](recuperar.html) valida a sessão (evento `PASSWORD_RECOVERY` ou token recebido no link) antes de liberar a escolha de uma nova senha.
5. Depois de salvar, a sessão é encerrada e o jogador volta ao login normalmente. Os saves não são alterados.

**Configuração obrigatória em Authentication → URL Configuration → Redirect URLs:**

```text
https://viniresenha777-coder.github.io/Df-2.0/recuperar.html
```

É necessário adicionar essa URL além da raiz do jogo, que deve permanecer cadastrada. Sem isso, o link de recuperação pode redirecionar para outro endereço (por exemplo a tela de login sem o formulário para nova senha). Não é necessário alterar a tabela de partidas ou armazenar senhas.

### Como o salvamento funciona

- Checkpoints automáticos na troca de área e periodicamente; salvamento manual no menu.
- A interface só confirma que salvou após receber resposta positiva do Supabase.
- **Salvar e sair** grava, sai da sessão e volta ao login; navegadores não permitem fechar de forma confiável uma aba aberta manualmente.
- Se houver save local neste navegador, você pode marcar a opção para importá-lo ao entrar na primeira conta sem save online. O save local não é apagado automaticamente.
- Alterações simultâneas da mesma partida em dispositivos diferentes são detectadas pelo campo `revisao`; quando houver conflito, entre novamente antes de continuar.

### Atualização do site

O workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) publica automaticamente mudanças de `index.html`, `css/`, `js/` ou `img/` na `main`. Uma nova Release com um ZIP completo também pode atualizar o jogo.

> A publicação do site é automática, mas a execução do SQL e as configurações de Auth dependem do proprietário do Supabase.

### Regressões de multiplayer, interiores e bônus

Execute `node tests/regressions.cjs` (Node.js 18+). O teste usa dois clientes com transporte Realtime simulado e percorre os setores do mapa, casas, andares, combate compartilhado e limites dos interiores grandes. Também verifica a mobília determinística de todos os tipos de prédio e os totais de bônus.

Os canais identificam setor, prédio e andar. Móveis e decorações mantêm posições fixas; a disponibilidade de saque varia entre os móveis, com loot individual. Colete e implante somam proteção (limitada a 95%, considerando desgaste do colete), e o atributo Armadura aplica sua redução sobre o dano restante. O painel mostra a redução efetiva total. XP e dinheiro aparecem em linhas consecutivas, com os multiplicadores efetivos.

Validação manual antes de publicar: abra duas contas em navegadores separados, atualize ambas para a mesma versão, atravesse áreas, entre na mesma casa e troque de andar. Verifique posições, zumbis e dano; jogadores em casas ou andares diferentes não devem aparecer juntos. Repita em hospital/prisão e após reconectar. Os testes simulados não substituem esta checagem no Supabase real.

### Melhorias aleatórias na oficina

A oficina tem abas de criação, melhorias de armas e melhorias de coletes. **Melhorar** (ou Enter) substitui todos os pontos do equipamento selecionado por um novo sorteio independente, que pode aumentar ou diminuir os valores:

- Armas: Precisão, Dano e Velocidade de recarga, de 1 a 8 cada. Os efeitos por ponto permanecem os mesmos.
- Coletes: Armadura e Velocidade, de 1 a 24 cada. Cada ponto adiciona 1 ponto percentual de proteção ou 1% de velocidade. A proteção adicional acompanha o desgaste; o bônus de velocidade soma com o dos implantes antes dos modificadores de peso e atributos.

Cada sorteio custa 2 sucatas e dinheiro conforme o equipamento (com desconto de Artesão). O preço aparece antes do botão e independe do resultado atual. As melhorias ficam salvas por colete, enquanto armas mantêm suas instâncias individuais. Saves antigos recebem zero pontos de melhoria nos coletes. As linhas mostram números, sem quadradinhos ou seleção de atributo.

Execute também `node tests/upgrades.cjs` para verificar sorteios mínimos/mistos/máximos, custos, falta de recursos, efeitos dos coletes, salvamento, compatibilidade com saves antigos e controles da oficina.
