# Fronteira Morta — DF 2.0

Versão web do jogo **Fronteira Morta**.

## Publicar uma nova versão a partir do ZIP

O arquivo ZIP deve conter, na **raiz**, `index.html`, `css/`, `js/` e `img/` — exatamente como o arquivo `Fronteira Morta(1).zip`.

1. Acesse **Settings → Pages** e selecione **GitHub Actions** em *Build and deployment → Source*.
2. Abra [Nova Release](https://github.com/viniresenha777-coder/Df-2.0/releases/new).
3. Escolha uma tag (ex.: `v2.0`) e título (ex.: `Fronteira Morta 2.0`).
4. Em *Attach binaries by dropping them here or selecting them*, envie o ZIP completo do jogo.
5. Clique em **Publish release**.

A publicação acionará `[.github/workflows/pages.yml](.github/workflows/pages.yml)`. O workflow valida e extrai o ZIP, copia os arquivos do jogo para a branch `main` (preservando este README e os workflows) e publica o site no GitHub Pages.

**Link previsto depois de o workflow concluir com sucesso:** https://viniresenha777-coder.github.io/Df-2.0/

> Não publique o endereço como funcional antes de verificar o deploy.
