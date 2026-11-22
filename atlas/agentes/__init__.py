from .base import Agente, PermissaoNegada, PERMISSOES, PAPEL_POR_REL, PAPEL_POR_TIPO
from .papeis import Coletor, Extrator, Classificador, Historiador, Tradutor, Curador
from .verificador import Verificador, NIVEIS_VERIFICACAO
from .guardiao import Guardiao

CLASSES = {c.papel: c for c in (Coletor, Extrator, Classificador, Historiador, Tradutor, Curador,
                                Verificador, Guardiao)}


def sociedade(acervo):
    """Instancia um agente de cada papel sobre o mesmo acervo."""
    return {papel: cls(acervo) for papel, cls in CLASSES.items()}
