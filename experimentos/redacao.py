"""Experimento 1 — uma sociedade de agentes escreve uma redação com fontes.

Papéis: Planejador, dois Pesquisadores (um rigoroso, um descuidado e
autoconfiante), Verificador, Redator e Crítico. Ninguém comanda: o Planejador
delega por leilão, o Verificador audita, a reputação realoca tarefas, as normas
bloqueiam afirmações sem fonte e autoaprovação. O resultado (texto + trilha de
auditoria) emerge da interação.

Uso:  python -m experimentos.redacao [--semente N]
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

from sociedade import Agente, Constituicao, Mensagem, Sociedade
from sociedade.normas import exige_campos, limite_de_voz, separacao_de_poderes

SECOES = ["Introdução", "Conceito e emergência", "IA multiagente",
          "Sociedade e instituições", "Contra-argumento", "Conclusão"]

# Base de conhecimento: afirmações verificáveis com fonte real.
BASE: dict[str, list[tuple[str, str]]] = {
    "Introdução": [
        ("Minsky propõe que a mente é uma sociedade de processos simples, cada um "
         "incapaz de pensar sozinho", "Minsky, 1986"),
        ("o conhecimento relevante numa sociedade está disperso entre muitos indivíduos "
         "e nenhum planejador central o possui inteiro", "Hayek, 1945"),
    ],
    "Conceito e emergência": [
        ("o erro quadrático da estimativa coletiva é igual ao erro médio individual "
         "menos a diversidade das estimativas", "Page, 2007"),
        ("grupos de solucionadores diversos podem superar grupos formados apenas pelos "
         "melhores indivíduos", "Hong & Page, 2004"),
    ],
    "IA multiagente": [
        ("no protocolo Contract Net, tarefas são anunciadas e alocadas por lances entre "
         "agentes", "Smith, 1980"),
        ("modelos de linguagem que debatem entre si melhoram a factualidade das "
         "respostas", "Du et al., 2023"),
    ],
    "Sociedade e instituições": [
        ("comunidades governam recursos comuns de forma duradoura quando têm monitoramento "
         "e sanções graduadas", "Ostrom, 1990"),
        ("em decisões coletivas, a responsabilidade diluída entre muitos agentes cria o "
         "problema das muitas mãos", "Thompson, 1980"),
    ],
    "Contra-argumento": [
        ("a influência social reduz a diversidade de opiniões e mina a sabedoria das "
         "multidões", "Lorenz et al., 2011"),
        ("cascatas informacionais fazem indivíduos ignorarem a própria informação para "
         "imitar os anteriores", "Bikhchandani, Hirshleifer & Welch, 1992"),
    ],
    "Conclusão": [
        ("a qualidade de um sistema distribuído depende das regras de monitoramento, "
         "sanção e participação que o governam", "Ostrom, 1990"),
        ("a inteligência coletiva de um grupo não é explicada pela inteligência média "
         "de seus membros", "Woolley et al., 2010"),
    ],
}
BIBLIOGRAFIA = {f for itens in BASE.values() for _, f in itens}
CONHECIDAS = {(a, f) for itens in BASE.values() for a, f in itens}

COSTURA = {
    "Introdução": "Como sistemas feitos de partes limitadas produzem inteligência?",
    "Conceito e emergência": "A inteligência coletiva tem, portanto, uma condição precisa: diversidade organizada.",
    "IA multiagente": "Na engenharia, a ideia vira arquitetura: papéis, leilões e verificação mútua.",
    "Sociedade e instituições": "Nas sociedades humanas, as instituições fazem o papel dos protocolos.",
    "Contra-argumento": "Descentralização, contudo, não garante sabedoria.",
    "Conclusão": "O desafio não é eliminar a autonomia, mas governá-la.",
}


class Planejador(Agente):
    inscricoes = ("tarefa", "evidencia_rejeitada", "norma_violada")

    def _delegar(self, secao: str, causa: Mensagem, soc: Sociedade) -> list[Mensagem]:
        quem = soc.leiloar({"competencia": "pesquisa", "secao": secao})
        if quem is None:
            soc.quadro.escrever(self.nome, f"pendente/{secao}", "sem pesquisador disponível")
            return []
        return [causa.responder(self.nome, "pesquisar", {"secao": secao}, destinatario=quem)]

    def receber(self, msg, soc):
        if msg.tipo == "tarefa":
            soc.quadro.escrever(self.nome, "plano", {"tema": msg.conteudo["tema"], "secoes": SECOES})
            return [m for s in SECOES for m in self._delegar(s, msg, soc)]
        if msg.tipo == "evidencia_rejeitada":
            return self._delegar(msg.conteudo["secao"], msg, soc)
        if msg.tipo == "norma_violada" and msg.conteudo["tipo"] == "evidencia" and msg.conteudo["bloqueada"]:
            return self._delegar(msg.conteudo["conteudo"]["secao"], msg, soc)
        return []


class Pesquisador(Agente):
    def __init__(self, nome, autoconfianca: float, descuido: float, rng: random.Random):
        super().__init__(nome, {"pesquisa"})
        self.autoconfianca, self.descuido, self.rng = autoconfianca, descuido, rng

    def lance(self, tarefa, soc):
        return self.autoconfianca if tarefa.get("competencia") in self.competencias else None

    def receber(self, msg, soc):
        if msg.tipo != "pesquisar":
            return []
        secao = msg.conteudo["secao"]
        usadas = {e["afirmacao"] for e in soc.quadro.ler(f"evidencia/{secao}", [])}
        livres = [x for x in BASE[secao] if x[0] not in usadas] or BASE[secao]
        afirmacao, fonte = self.rng.choice(livres)
        r = self.rng.random()
        if r < self.descuido / 2:
            fonte = ""                                        # esquece a fonte
        elif r < self.descuido:
            afirmacao = "estudos provam que sistemas descentralizados sempre acertam"
            fonte = "Blog anônimo, s.d."                     # inventa
        return [msg.responder(self.nome, "evidencia", {
            "secao": secao, "afirmacao": afirmacao, "fonte": fonte, "autor": self.nome})]


class Verificador(Agente):
    inscricoes = ("evidencia",)

    def receber(self, msg, soc):
        c = msg.conteudo
        ok = c["fonte"] in BIBLIOGRAFIA and (c["afirmacao"], c["fonte"]) in CONHECIDAS
        soc.reputacao.registrar(c["autor"], ok)
        if not ok:
            return [msg.responder(self.nome, "evidencia_rejeitada", {
                "secao": c["secao"], "autor": c["autor"], "motivo": "fonte não verificável"})]
        chave = f"evidencia/{c['secao']}"
        soc.quadro.escrever(self.nome, chave, soc.quadro.ler(chave, []) + [dict(c)])
        return [msg.responder(self.nome, "evidencia_aprovada", {"secao": c["secao"], "autor": c["autor"]})]


class Redator(Agente):
    inscricoes = ("evidencia_aprovada",)

    def __init__(self, nome):
        super().__init__(nome, {"redacao"})
        self.entregue = False

    def receber(self, msg, soc):
        plano = soc.quadro.ler("plano")
        if self.entregue or not all(soc.quadro.ler(f"evidencia/{s}") for s in plano["secoes"]):
            return []
        self.entregue = True
        partes = [f"# {plano['tema'].capitalize()}\n"]
        for s in plano["secoes"]:
            ev = soc.quadro.ler(f"evidencia/{s}")
            corpo = " ".join(f"{e['afirmacao'][0].upper()}{e['afirmacao'][1:]} ({e['fonte']})." for e in ev)
            partes.append(f"## {s}\n\n{COSTURA[s]} {corpo}\n")
        soc.quadro.escrever(self.nome, "rascunho", "\n".join(partes))
        return [msg.responder(self.nome, "rascunho", {"autor": self.nome}),
                # Tentativa de autoaprovação: a constituição deve barrar.
                msg.responder(self.nome, "aprovacao", {"autor": self.nome, "veredito": "aprovado"})]


class Critico(Agente):
    inscricoes = ("rascunho",)

    def receber(self, msg, soc):
        plano = soc.quadro.ler("plano")
        falhas = [s for s in plano["secoes"]
                  if not all(e.get("fonte") for e in soc.quadro.ler(f"evidencia/{s}", []))]
        if "Contra-argumento" not in plano["secoes"]:
            falhas.append("sem contra-argumento")
        veredito = "aprovado" if not falhas else "revisar"
        return [msg.responder(self.nome, "aprovacao", {
            "autor": msg.conteudo["autor"], "veredito": veredito, "falhas": falhas})]


def montar(semente: int = 7) -> Sociedade:
    rng = random.Random(semente)
    constituicao = Constituicao([
        exige_campos("evidencia", "afirmacao", "fonte"),   # sem fonte, não circula
        separacao_de_poderes("aprovacao"),                 # ninguém aprova a si mesmo
        limite_de_voz(60),                                 # teto contra captura do canal
    ])
    soc = Sociedade(constituicao, limite_suspensao=3)
    soc.adicionar(
        Planejador("planejador"),
        Pesquisador("pesquisadora_rigorosa", autoconfianca=0.70, descuido=0.0, rng=rng),
        Pesquisador("pesquisador_apressado", autoconfianca=0.95, descuido=0.6, rng=rng),
        Verificador("verificador"), Redator("redator"), Critico("critico"),
    )
    return soc


def rodar(semente: int = 7, saida: Path | None = Path("saida")) -> dict:
    soc = montar(semente)
    soc.publicar(Mensagem("usuaria", "tarefa", {"tema": "sociedade de agentes"}))
    passos = soc.executar()

    aprovacoes = [e for e in soc.registro.filtrar("mensagem") if e.dados["tipo"] == "aprovacao"]
    veredito = aprovacoes[-1].dados["conteudo"]["veredito"] if aprovacoes else "sem veredito"
    publicar = soc.votar({"critico": veredito, "verificador": "aprovado" if soc.quadro.ler("rascunho") else "revisar",
                          "planejador": veredito})
    leiloes = [e.dados["vencedor"] for e in soc.registro.filtrar("decisao") if e.dados["tipo"] == "leilao"]
    resultado = {
        "passos": passos, "veredito": veredito, "decisao": publicar,
        "texto": soc.quadro.ler("rascunho"), "reputacao": soc.reputacao.tabela(),
        "violacoes": [(e.autor, e.dados["norma"], e.dados["motivo"]) for e in soc.registro.filtrar("violacao")],
        "leiloes": leiloes, "registro_integro": soc.registro.integro(),
        "trilha": soc.registro.cadeia_causal(aprovacoes[-1].dados["id"]) if aprovacoes else [],
        "sociedade": soc,
    }
    if saida and resultado["texto"]:
        saida.mkdir(exist_ok=True)
        (saida / "redacao.md").write_text(resultado["texto"], encoding="utf-8")
    return resultado


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--semente", type=int, default=7)
    r = rodar(p.parse_args().semente)
    print(r["texto"] or "(sem texto)")
    print("─" * 70)
    print(f"Passos: {r['passos']} | veredito do crítico: {r['veredito']} | votação: {r['decisao']}")
    print(f"Registro íntegro (cadeia de hashes): {r['registro_integro']}")
    print("\nAlocação por leilão, em ordem:")
    for i, v in enumerate(r["leiloes"], 1):
        print(f"  {i:2d}. {v}")
    print("\nReputação final (média Beta):")
    for k, v in r["reputacao"].items():
        print(f"  {k:24s} {v:.3f}")
    print("\nViolações de normas:")
    for a, n, m in r["violacoes"] or [("—", "—", "nenhuma")]:
        print(f"  {a:24s} {n:32s} {m}")
    print("\nResponsabilização causal da aprovação final (da decisão até a origem):")
    for e in r["trilha"]:
        print(f"  #{e.dados['id']:<4d} {e.autor:24s} {e.dados['tipo']}")


if __name__ == "__main__":
    main()
