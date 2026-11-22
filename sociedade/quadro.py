from __future__ import annotations

from typing import Any, Callable, Optional


class Quadro:
    """Memória compartilhada (blackboard) versionada.

    Cada escrita guarda autor e versão; o histórico nunca é apagado, de modo que a
    memória coletiva é auditável. Um observador opcional (o Registro) é notificado.
    """

    def __init__(self, observador: Optional[Callable[[str, str, Any, int], None]] = None) -> None:
        self._hist: dict[str, list[tuple[str, Any]]] = {}
        self._obs = observador

    def escrever(self, autor: str, chave: str, valor: Any) -> int:
        self._hist.setdefault(chave, []).append((autor, valor))
        versao = len(self._hist[chave])
        if self._obs:
            self._obs(autor, chave, valor, versao)
        return versao

    def ler(self, chave: str, padrao: Any = None) -> Any:
        h = self._hist.get(chave)
        return h[-1][1] if h else padrao

    def autor(self, chave: str) -> Optional[str]:
        h = self._hist.get(chave)
        return h[-1][0] if h else None

    def historico(self, chave: str) -> list[tuple[str, Any]]:
        return list(self._hist.get(chave, []))

    def chaves(self, prefixo: str = "") -> list[str]:
        return [k for k in self._hist if k.startswith(prefixo)]
