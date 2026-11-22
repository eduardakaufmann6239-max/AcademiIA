"""Sociedade de agentes: núcleo mínimo para estudar inteligência coletiva.

Módulos:
    mensagens  - Mensagem e Barramento (comunicação)
    registro   - livro-razão encadeado por hash (responsabilização causal)
    quadro     - memória compartilhada versionada (blackboard)
    reputacao  - confiança bayesiana por agente
    normas     - normas, sanções e constituição
    agente     - classe base de agente
    sociedade  - orquestração: entrega, contract net, votação
"""
from .mensagens import Mensagem
from .registro import Registro
from .quadro import Quadro
from .reputacao import Reputacao
from .normas import Norma, Constituicao, Violacao
from .agente import Agente
from .sociedade import Sociedade

__all__ = [
    "Mensagem", "Registro", "Quadro", "Reputacao",
    "Norma", "Constituicao", "Violacao", "Agente", "Sociedade",
]
