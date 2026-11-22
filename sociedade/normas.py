from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable, Optional

from .mensagens import Mensagem

if TYPE_CHECKING:
    from .sociedade import Sociedade


@dataclass(frozen=True)
class Violacao:
    norma: str
    agente: str
    motivo: str
    msg_id: int


@dataclass
class Norma:
    """Regra verificável aplicada a toda mensagem antes da entrega.

    `verificar` devolve um motivo (str) quando a mensagem viola a norma, ou None.
    `bloqueia`: se True a mensagem não é entregue; senão só é anotada e sancionada.
    """
    nome: str
    verificar: Callable[[Mensagem, "Sociedade"], Optional[str]]
    bloqueia: bool = True


class Constituicao:
    """Conjunto de normas + sanções graduadas (princípio 5 de Ostrom)."""

    def __init__(self, normas: list[Norma] | None = None) -> None:
        self.normas = list(normas or [])
        self.reincidencia: dict[str, int] = {}

    def adicionar(self, norma: Norma) -> None:
        self.normas.append(norma)

    def julgar(self, msg: Mensagem, soc: "Sociedade") -> tuple[bool, list[Violacao]]:
        violacoes, bloqueada = [], False
        for n in self.normas:
            motivo = n.verificar(msg, soc)
            if motivo:
                violacoes.append(Violacao(n.nome, msg.remetente, motivo, msg.id))
                bloqueada |= n.bloqueia
        for v in violacoes:
            self.reincidencia[v.agente] = self.reincidencia.get(v.agente, 0) + 1
        return bloqueada, violacoes

    def suspenso(self, agente: str, limite: int) -> bool:
        return self.reincidencia.get(agente, 0) >= limite


# --- Normas de uso geral -------------------------------------------------------

def separacao_de_poderes(tipo_aprovacao: str, campo_autor: str = "autor") -> Norma:
    """Nenhum agente aprova o próprio trabalho."""
    def v(m: Mensagem, _s) -> Optional[str]:
        if m.tipo == tipo_aprovacao and m.conteudo.get(campo_autor) == m.remetente:
            return "agente tentou aprovar o próprio trabalho"
        return None
    return Norma("separacao_de_poderes", v)


def exige_campos(tipo: str, *campos: str) -> Norma:
    """Mensagens de `tipo` precisam trazer `campos` não vazios (ex.: fonte)."""
    def v(m: Mensagem, _s) -> Optional[str]:
        if m.tipo == tipo:
            faltam = [c for c in campos if not m.conteudo.get(c)]
            if faltam:
                return f"campos obrigatórios ausentes: {', '.join(faltam)}"
        return None
    return Norma(f"exige_{'_'.join(campos)}_em_{tipo}", v)


def limite_de_voz(maximo: int) -> Norma:
    """Teto de mensagens por agente por execução: contém spam e captura do canal."""
    def v(m: Mensagem, s: "Sociedade") -> Optional[str]:
        if s.enviadas.get(m.remetente, 0) > maximo:
            return f"excedeu o limite de {maximo} mensagens"
        return None
    return Norma("limite_de_voz", v)
