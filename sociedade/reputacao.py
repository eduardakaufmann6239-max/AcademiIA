from __future__ import annotations


class Reputacao:
    """Confiança bayesiana Beta(alfa, beta) por agente.

    Começa em Beta(1,1) (ignorância). Sucessos e falhas verificados por terceiros
    atualizam a crença; `confianca` é a média posterior. Falhas podem pesar mais
    que sucessos (assimetria deliberada: confiança se perde mais rápido do que se ganha).
    """

    def __init__(self, peso_falha: float = 2.0) -> None:
        self._ab: dict[str, list[float]] = {}
        self.peso_falha = peso_falha

    def _par(self, agente: str) -> list[float]:
        return self._ab.setdefault(agente, [1.0, 1.0])

    def registrar(self, agente: str, sucesso: bool) -> None:
        p = self._par(agente)
        if sucesso:
            p[0] += 1
        else:
            p[1] += self.peso_falha

    def confianca(self, agente: str) -> float:
        a, b = self._par(agente)
        return a / (a + b)

    def tabela(self) -> dict[str, float]:
        return {k: round(self.confianca(k), 3) for k in sorted(self._ab)}
