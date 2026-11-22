"""Guardião: preserva versões e proveniência; detecta alteração não rastreável."""
from __future__ import annotations

import json

from ..acervo import Acervo, GENESE, _hash_evento
from .base import Agente, PERMISSOES


class Guardiao(Agente):
    papel = "guardiao"

    def auditar(self) -> dict:
        problemas = []
        eventos = self.acervo.eventos()

        # 1. cadeia de hashes íntegra
        anterior = GENESE
        for ev in eventos:
            if ev["hash_ant"] != anterior:
                problemas.append(f"evento {ev['seq']}: elo quebrado na cadeia")
            esperado = _hash_evento(ev["hash_ant"], ev["ts"], ev["agente"], ev["acao"], ev["alvo"],
                                    ev["carga"], ev["regra"])
            if esperado != ev["hash"]:
                problemas.append(f"evento {ev['seq']}: conteúdo adulterado (hash não confere)")
            anterior = ev["hash"]

        # 2. separação de funções respeitada
        criadores = {}
        for ev in eventos:
            papel = ev["agente"].split("@")[0]
            if ev["acao"] == "criar":
                criadores[ev["alvo"]] = papel
            if ev["acao"] == "verificar" and criadores.get(ev["alvo"]) == papel:
                problemas.append(f"evento {ev['seq']}: {ev['alvo']} verificado pelo mesmo papel que o criou")
            if papel in PERMISSOES and ev["acao"] == "verificar" and papel != "verificador":
                problemas.append(f"evento {ev['seq']}: papel '{papel}' não pode verificar")

        # 3. a visão materializada é reconstruível pelo livro-razão
        espelho = Acervo(":memory:")
        for ev in eventos:
            espelho._aplicar(ev["ts"], ev["acao"], ev["alvo"], json.loads(ev["carga"]))
        if espelho.listar() != self.acervo.listar():
            problemas.append("entidades divergem do replay do livro-razão (alteração fora do livro)")
        if espelho.todas_relacoes() != self.acervo.todas_relacoes():
            problemas.append("relações divergem do replay do livro-razão (alteração fora do livro)")
        espelho.db.close()

        return {"eventos": len(eventos), "integro": not problemas, "problemas": problemas,
                "hash_cabeca": eventos[-1]["hash"] if eventos else GENESE}
