"""Empacota o código do jogo num arquivo só, fechado e sem comentários (js/jogo.min.js).

Por quê: com os arquivos soltos, tudo (dinheiro, jogador, save) fica ao alcance do Console do navegador.
Dentro de uma função fechada nada disso fica global, e sem comentários/espaços o código fica difícil de ler.

Como usar (a partir da pasta Df-2.0), com o Python do Blender:
    "C:\\Program Files\\Blender Foundation\\Blender 5.3\\5.3\\python\\bin\\python.exe" -I tools/empacotar.py

- A lista de arquivos e a ordem vêm do dev.html (a versão para testar com os arquivos soltos).
- O index.html (o que vai para o site) tem no <template id="game-scripts"> só o js/jogo.min.js (carregado pelo
  login.js depois de entrar); a versão (?v=) é atualizada aqui. cloud.js e login.js continuam arquivos soltos.
"""
import os
import re
import sys
import hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEV = os.path.join(ROOT, "dev.html")
INDEX = os.path.join(ROOT, "index.html")
OUT = os.path.join(ROOT, "js", "jogo.min.js")

REGEX_BEFORE = set("(,=:[!&|?{};+-*%<>~^")
REGEX_WORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"}


def strip_js(src):
    """Tira comentários, espaços do começo das linhas e linhas vazias, sem mexer em textos, templates e regex.
    As quebras de linha ficam (a inserção automática de ponto e vírgula continua igual)."""
    out = []
    i, n = 0, len(src)
    last = ""          # último caractere significativo emitido (para saber se "/" abre regex)
    last_word = ""
    tmpl = []          # pilha de profundidade de chaves dentro de ${ } de templates

    def emit(s):
        out.append(s)

    while i < n:
        c = src[i]
        # dentro de ${ ... } de um template: "}" que fecha volta para o template
        if c == "}" and tmpl and tmpl[-1] == 0:
            tmpl.pop()
            emit(c)
            i += 1
            i = read_template(src, i, emit, tmpl)
            last = "`"
            continue
        if c == "{" and tmpl:
            tmpl[-1] += 1
        elif c == "}" and tmpl:
            tmpl[-1] -= 1
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            if j < 0:
                raise ValueError("comentário /* sem fim")
            if "\n" in src[i:j]:
                emit("\n")
            else:
                emit(" ")
            i = j + 2
            continue
        if c in "\"'":
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\":
                    j += 1
                elif src[j] == "\n":
                    raise ValueError("texto sem fim na linha")
                j += 1
            emit(src[i:j + 1])
            i = j + 1
            last = c
            last_word = ""
            continue
        if c == "`":
            emit(c)
            i = read_template(src, i + 1, emit, tmpl)
            last = "`"
            last_word = ""
            continue
        if c == "/" and (last == "" or last in REGEX_BEFORE or last_word in REGEX_WORDS):
            j = i + 1
            in_class = False
            while j < n:
                ch = src[j]
                if ch == "\\":
                    j += 2
                    continue
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    break
                elif ch == "\n":
                    raise ValueError("regex sem fim na linha")
                j += 1
            j += 1
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            emit(src[i:j])
            i = j
            last = "/"
            last_word = ""
            continue
        if c == "\n":
            emit("\n")
            i += 1
            while i < n and src[i] in " \t\r":
                i += 1
            continue
        if c.isalnum() or c == "_" or c == "$":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            word = src[i:j]
            emit(word)
            i = j
            last = word[-1]
            last_word = word
            continue
        emit(c)
        if c not in " \t\r":
            last = c
            last_word = ""
        i += 1
    text = "".join(out)
    lines = [ln.rstrip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln.strip())


def read_template(src, i, emit, tmpl):
    """Copia o template a partir de i (depois da crase) até a crase final ou até um ${ (que abre expressão)."""
    n = len(src)
    j = i
    while j < n:
        ch = src[j]
        if ch == "\\":
            j += 2
            continue
        if ch == "`":
            emit(src[i:j + 1])
            return j + 1
        if ch == "$" and j + 1 < n and src[j + 1] == "{":
            emit(src[i:j + 2])
            tmpl.append(0)
            return j + 2
        j += 1
    raise ValueError("template sem fim")


def game_scripts():
    html = open(DEV, encoding="utf-8").read()
    # só o que está no <template id="game-scripts"> (carregado depois do login); cloud.js e login.js ficam soltos
    html = html[html.index('<template id="game-scripts">'):html.index("</template>")]
    names = re.findall(r'<script src="(js/[^"?]+)(?:\?[^"]*)?"></script>', html)
    return [s for s in names if s != "js/jogo.min.js"]


def main():
    parts = []
    files = game_scripts()
    srcs = [open(os.path.join(ROOT, rel), encoding="utf-8").read().replace("\r\n", "\n") for rel in files]
    # Arquivos soltos: "typeof X" de algo declarado num arquivo que ainda não carregou dá "undefined".
    # Num arquivo só, const/let ainda não inicializado dá erro (zona morta). Esses viram var (que dá "undefined").
    typeof_names = set(re.findall(r"typeof\s+([A-Za-z_$][\w$]*)", "\n".join(srcs)))
    def to_var(m):
        decl = m.group(2)
        names = set(re.findall(r"(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=", decl))
        return ("var " if names & typeof_names else m.group(1) + " ") + decl
    for rel, src in zip(files, srcs):
        src = re.sub(r"^(const|let) ([^\n]*)", to_var, src, flags=re.M)
        src = re.sub(r'^\s*"use strict";\s*', "", src)
        try:
            body = strip_js(src)
        except ValueError as e:
            sys.exit(f"ERRO em {rel}: {e}")
        parts.append(body)
    bundle = '(function(){"use strict";\n' + "\n;\n".join(parts) + "\n})();\n"
    open(OUT, "w", encoding="utf-8", newline="\n").write(bundle)
    ver = hashlib.sha1(bundle.encode("utf-8")).hexdigest()[:10]
    idx = open(INDEX, encoding="utf-8").read()
    idx2, k = re.subn(r'js/jogo\.min\.js\?v=[^"]*', f"js/jogo.min.js?v={ver}", idx)
    if k != 1:
        sys.exit("ERRO: index.html não tem exatamente um js/jogo.min.js")
    open(INDEX, "w", encoding="utf-8", newline="").write(idx2)
    total = sum(os.path.getsize(os.path.join(ROOT, r)) for r in game_scripts())
    print(f"{len(parts)} arquivos -> js/jogo.min.js ({len(bundle) // 1024} KB, antes {total // 1024} KB), versão {ver}")


if __name__ == "__main__":
    main()
