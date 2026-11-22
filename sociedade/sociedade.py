from __future__ import annotations

from collections import Counter, deque
from typing import Iterable, Optional

from .agente import Agente
from .mensagens import Mensagem
from .normas import Constituicao
from .quadro import Quadro
from .registro import Registro
from .reputacao import Reputacao


class Sociedade:
    """Orquestra agentes sem controlá-los: entrega mensagens, aplica normas,
    aloca tarefas por leilão (Contract Net) e agrega decisões por voto.

    Não há "agente central": a sociedade é infraestrutura (canais, memória,
    regras, incentivos), não um comandante.
    """

    NOME = "sociedade"

    def __init__(self, constituicao: Constituicao | None = None,
                 limite_suspensao: int = 3) -> None:
        self.agentes: dict[str, Agente] = {}
        self.registro = Registro()
        self.quadro = Quadro(self._anotar_quadro)
        self.reputacao = Reputacao()
        self.constituicao = constituicao or Constituicao()
        self.limite_suspensao = limite_suspensao
        self.fila: deque[Mensagem] = deque()
        self.enviadas: Counter[str] = Counter()

    # --- composição ------------------------------------------------------
    def adicionar(self, *agentes: Agente) -> "Sociedade":
        for a in agentes:
            if a.nome in self.agentes:
                raise ValueError(f"nome duplicado: {a.nome}")
            self.agentes[a.nome] = a
        return self

    def _anotar_quadro(self, autor, chave, valor, versao) -> None:
        self.registro.anotar("quadro", autor, {"chave": chave, "versao": versao})

    # --- comunicação -----------------------------------------------------
    def publicar(self, *msgs: Mensagem) -> None:
        self.fila.extend(msgs)

    def _destinos(self, m: Mensagem) -> list[Agente]:
        if m.destinatario:
            a = self.agentes.get(m.destinatario)
            return [a] if a else []
        return [a for a in self.agentes.values() if m.tipo in a.inscricoes and a.nome != m.remetente]

    def passo(self) -> bool:
        if not self.fila:
            return False
        m = self.fila.popleft()
        self.enviadas[m.remetente] += 1
        if self.constituicao.suspenso(m.remetente, self.limite_suspensao):
            self.registro.anotar("violacao", m.remetente, {
                "norma": "suspensao", "motivo": "agente suspenso por reincidência", "msg": m.id})
            return True
        bloqueada, violacoes = (False, []) if m.remetente == self.NOME else self.constituicao.julgar(m, self)
        for v in violacoes:
            self.reputacao.registrar(v.agente, False)
            self.registro.anotar("violacao", v.agente, {"norma": v.norma, "motivo": v.motivo, "msg": m.id})
        if violacoes:
            # Transparência: a instituição anuncia publicamente a violação.
            self.publicar(Mensagem(self.NOME, "norma_violada", {
                "tipo": m.tipo, "remetente": m.remetente, "conteudo": m.conteudo,
                "bloqueada": bloqueada, "normas": [v.norma for v in violacoes],
                "msg_id": m.id}, causa=m.causa))  # bloqueada não entra no registro: liga-se à causa dela
        if bloqueada:
            return True
        self.registro.anotar("mensagem", m.remetente, {
            "id": m.id, "tipo": m.tipo, "para": m.destinatario, "causa": m.causa,
            "conteudo": m.conteudo})
        for a in self._destinos(m):
            self.publicar(*a.receber(m, self))
        return True

    def executar(self, max_passos: int = 10_000) -> int:
        n = 0
        while n < max_passos and self.passo():
            n += 1
        return n

    # --- coordenação -----------------------------------------------------
    def leiloar(self, tarefa: dict, excluir: Iterable[str] = ()) -> Optional[str]:
        """Contract Net (Smith, 1980) ponderado por reputação.

        Utilidade = autoavaliação do agente × confiança que a sociedade tem nele.
        Autoconfiança sem histórico verificado não basta para vencer sempre.
        """
        excl = set(excluir)
        lances = []
        for a in self.agentes.values():
            if a.nome in excl or self.constituicao.suspenso(a.nome, self.limite_suspensao):
                continue
            b = a.lance(tarefa, self)
            if b is not None:
                lances.append((b * self.reputacao.confianca(a.nome), a.nome))
        if not lances:
            return None
        vencedor = max(lances)[1]
        self.registro.anotar("decisao", "sociedade", {
            "tipo": "leilao", "tarefa": tarefa, "lances": sorted(lances, reverse=True),
            "vencedor": vencedor})
        return vencedor

    def votar(self, votos: dict[str, str], ponderado: bool = True) -> str:
        """Agregação: maioria simples ou ponderada por reputação."""
        placar: Counter[str] = Counter()
        for agente, opcao in votos.items():
            placar[opcao] += self.reputacao.confianca(agente) if ponderado else 1.0
        vencedor = placar.most_common(1)[0][0]
        self.registro.anotar("decisao", "sociedade", {
            "tipo": "votacao", "placar": dict(placar), "vencedor": vencedor})
        return vencedor
