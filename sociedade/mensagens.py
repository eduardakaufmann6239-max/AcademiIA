from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Any, Optional

_ids = itertools.count(1)


@dataclass(frozen=True)
class Mensagem:
    """Unidade de comunicação entre agentes.

    destinatario=None significa difusão para todos os inscritos no `tipo`.
    `causa` aponta para a mensagem que provocou esta, formando a cadeia causal.
    """
    remetente: str
    tipo: str
    conteudo: dict[str, Any] = field(default_factory=dict)
    destinatario: Optional[str] = None
    causa: Optional[int] = None
    id: int = field(default_factory=lambda: next(_ids))

    def responder(self, remetente: str, tipo: str, conteudo: dict[str, Any] | None = None,
                  destinatario: Optional[str] = None) -> "Mensagem":
        return Mensagem(remetente, tipo, conteudo or {}, destinatario, causa=self.id)
