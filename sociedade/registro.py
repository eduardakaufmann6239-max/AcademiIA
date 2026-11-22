from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class Entrada:
    indice: int
    evento: str          # "mensagem", "violacao", "quadro", "decisao"
    autor: str
    dados: dict[str, Any]
    hash_anterior: str
    hash: str


class Registro:
    """Livro-razão append-only encadeado por hash.

    Responde à pergunta central da governança de agentes: *quem fez o quê, por
    causa de quê?* Qualquer alteração retroativa quebra a cadeia (`integro()`).
    """

    def __init__(self) -> None:
        self._entradas: list[Entrada] = []
        self._por_msg: dict[int, Entrada] = {}

    @staticmethod
    def _hash(indice: int, evento: str, autor: str, dados: dict, anterior: str) -> str:
        bruto = json.dumps([indice, evento, autor, dados, anterior], sort_keys=True,
                           ensure_ascii=False, default=str)
        return hashlib.sha256(bruto.encode()).hexdigest()

    def anotar(self, evento: str, autor: str, dados: dict[str, Any]) -> Entrada:
        anterior = self._entradas[-1].hash if self._entradas else "0" * 64
        i = len(self._entradas)
        e = Entrada(i, evento, autor, dados, anterior, self._hash(i, evento, autor, dados, anterior))
        self._entradas.append(e)
        if evento == "mensagem":
            self._por_msg[dados["id"]] = e
        return e

    def integro(self) -> bool:
        anterior = "0" * 64
        for e in self._entradas:
            if e.hash_anterior != anterior or e.hash != self._hash(
                    e.indice, e.evento, e.autor, e.dados, anterior):
                return False
            anterior = e.hash
        return True

    def cadeia_causal(self, msg_id: int) -> list[Entrada]:
        """Da mensagem dada até a origem, seguindo o campo `causa`."""
        cadeia: list[Entrada] = []
        atual: Optional[int] = msg_id
        while atual is not None and atual in self._por_msg:
            e = self._por_msg[atual]
            cadeia.append(e)
            atual = e.dados.get("causa")
        return cadeia

    def filtrar(self, evento: str) -> list[Entrada]:
        return [e for e in self._entradas if e.evento == evento]

    def __len__(self) -> int:
        return len(self._entradas)

    def __iter__(self):
        return iter(self._entradas)
