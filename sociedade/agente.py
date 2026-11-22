from __future__ import annotations

from typing import TYPE_CHECKING, Iterable, Optional

from .mensagens import Mensagem

if TYPE_CHECKING:
    from .sociedade import Sociedade


class Agente:
    """Unidade autônoma, especializada e interdependente.

    - autonomia parcial: decide sozinho como reagir (`receber`);
    - percepção: só vê as mensagens dos tipos em que se inscreve;
    - objetivo/competência: `competencias` declara o que sabe fazer;
    - comunicação: devolve novas mensagens, nunca altera outro agente diretamente;
    - interdependência: o resultado útil só aparece na interação.
    """

    inscricoes: tuple[str, ...] = ()

    def __init__(self, nome: str, competencias: Iterable[str] = (), papel: str = "") -> None:
        self.nome = nome
        self.papel = papel or type(self).__name__
        self.competencias = set(competencias)

    def receber(self, msg: Mensagem, soc: "Sociedade") -> list[Mensagem]:
        return []

    def lance(self, tarefa: dict, soc: "Sociedade") -> Optional[float]:
        """Contract Net: devolve a autoavaliação de adequação (0..1) ou None."""
        return 1.0 if tarefa.get("competencia") in self.competencias else None

    def __repr__(self) -> str:
        return f"<{self.papel} {self.nome}>"
