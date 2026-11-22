import json
import unittest
from pathlib import Path

from atlas import exportar, semente
from atlas.acervo import Acervo
from atlas.agentes import (Classificador, Coletor, Curador, Extrator, Guardiao, Historiador, PermissaoNegada,
                           Verificador)
from atlas.investigacao import Investigacao

SEMENTE = Path(__file__).resolve().parent.parent / "dados" / "semente"


def acervo_semeado():
    a = Acervo()
    semente.carregar(a, SEMENTE)
    return a


class TestSemente(unittest.TestCase):
    def test_carrega_e_livro_integro(self):
        a = acervo_semeado()
        self.assertGreater(len(a.listar("afirm")), 20)
        r = Guardiao(a).auditar()
        self.assertTrue(r["integro"], r["problemas"])

    def test_toda_afirmacao_tem_fonte_e_classificacao(self):
        a = acervo_semeado()
        for ident, _ in a.listar("afirm"):
            self.assertTrue(a.entrando(ident, "apresenta"), f"{ident} sem obra")
            self.assertTrue(a.saindo(ident, "classificado_em"), f"{ident} sem lugar na árvore")


class TestGuardiao(unittest.TestCase):
    def test_detecta_adulteracao_do_livro(self):
        a = acervo_semeado()
        a.db.execute("UPDATE eventos SET carga='{\"titulo\":\"falso\"}' WHERE seq=5")
        r = Guardiao(a).auditar()
        self.assertFalse(r["integro"])
        self.assertTrue(any("adulterado" in p for p in r["problemas"]))

    def test_detecta_alteracao_fora_do_livro(self):
        a = acervo_semeado()
        a.db.execute("UPDATE entidades SET dados='{\"enunciado\":\"x\"}' WHERE id='afirm:miller-aminoacidos'")
        r = Guardiao(a).auditar()
        self.assertFalse(r["integro"])
        self.assertTrue(any("replay" in p for p in r["problemas"]))

    def test_desrelacionar_fica_no_historico(self):
        a = acervo_semeado()
        a.desrelacionar("obra:brasier-2002", "contradiz", "afirm:schopf-microfosseis", "historiador@1/x", "teste")
        self.assertFalse(any(r == "contradiz" for r, _, _ in a.entrando("afirm:schopf-microfosseis")))
        acoes = [e["acao"] for e in a.historico("afirm:schopf-microfosseis")]
        self.assertIn("desrelacionar", acoes)
        self.assertTrue(Guardiao(a).auditar()["integro"])


class TestPermissoes(unittest.TestCase):
    def test_papeis_separados(self):
        a = Acervo()
        with self.assertRaises(PermissaoNegada):
            Coletor(a).criar("afirm:x", {"enunciado": "x"})
        with self.assertRaises(PermissaoNegada):
            Extrator(a).criar("obra:x", {"titulo": "x", "ano": 2000, "tipo_obra": "artigo"})
        with self.assertRaises(PermissaoNegada):
            Extrator(a)._registrar_juizo("verificar", "afirm:x", {}, "r")

    def test_quem_cria_nao_verifica(self):
        a = Acervo()
        o = Coletor(a).registrar_obra("T", 2000, "artigo", ["A"])
        a.criar("afirm:auto", {"enunciado": "auto"}, agente="verificador@1/b")
        a.relacionar(o, "apresenta", "afirm:auto", "extrator@1/a")
        with self.assertRaises(PermissaoNegada):
            Verificador(a).verificar("afirm:auto")

    def test_relacao_com_tipos_invalidos(self):
        a = acervo_semeado()
        with self.assertRaises(ValueError):
            Historiador(a).relacionar("conceito:evolucao", "replica", "afirm:miller-aminoacidos")


class TestVerificacao(unittest.TestCase):
    def setUp(self):
        self.a = acervo_semeado()
        self.v = Verificador(self.a)

    def test_fonte_unica_nao_e_forte(self):
        self.assertNotEqual(self.v.avaliar("afirm:woese-tres-dominios")["rotulo"], "forte")

    def test_replicacao_independente_eleva(self):
        av = self.v.avaliar("afirm:miller-aminoacidos")
        self.assertEqual(av["rotulo"], "forte")
        self.assertEqual(av["independentes"], 1)

    def test_coautoria_nao_conta_como_independente(self):
        self.assertEqual(self.v.avaliar("afirm:woese-archaea")["independentes"], 0)

    def test_contestacao(self):
        self.assertEqual(self.v.avaliar("afirm:schopf-microfosseis")["rotulo"], "contestada")
        self.assertEqual(self.v.avaliar("afirm:turing-jogo-imitacao")["rotulo"], "contestada")

    def test_retratacao_derruba(self):
        self.a.alterar("obra:miller-1953", {"status": "retratado"}, "coletor@1/teste", "teste:retratacao")
        av = self.v.avaliar("afirm:miller-aminoacidos")
        self.assertEqual(av["rotulo"], "superada/retratada")
        niveis = {n["nivel"]: n["estado"] for n in self.v.niveis("afirm:miller-aminoacidos")}
        self.assertEqual(niveis["8-obsolescencia"], "falha")

    def test_oito_niveis_registrados_no_livro(self):
        r = self.v.verificar("afirm:shannon-entropia-informacao")
        self.assertEqual(len(r["niveis"]), 8)
        self.assertEqual(self.a.obter("afirm:shannon-entropia-informacao")["verificacao"]["rotulo"], r["rotulo"])
        self.assertIn("verificar", [e["acao"] for e in self.a.historico("afirm:shannon-entropia-informacao")])

    def test_sem_doi_fica_pendente(self):
        niv = {n["nivel"]: n["estado"] for n in self.v.niveis("afirm:wachtershauser-metabolismo")}
        self.assertEqual(niv["1-existencia_da_fonte"], "pendente")


class TestCuradoria(unittest.TestCase):
    def test_estado_do_debate(self):
        a = acervo_semeado()
        v = Verificador(a)
        r = Curador(a).avaliar_controversia("controv:replicador-ou-metabolismo", v.avaliar)
        self.assertIn("debate ativo", r["estado_debate"])
        self.assertEqual(len(r["posicoes"]), 2)


class TestInvestigacao(unittest.TestCase):
    def setUp(self):
        self.a = acervo_semeado()
        self.i = Investigacao(self.a)

    def test_trilha(self):
        t = self.i.trilha("afirm:watson-crick-dupla-helice")
        self.assertEqual(t["fontes"][0]["identificadores"]["doi"], "10.1038/171737a0")
        self.assertIn("Rosalind Franklin", json.dumps(t, ensure_ascii=False))
        self.assertTrue(t["historico"])

    def test_caminho_entre_areas(self):
        p = self.i.caminho("afirm:darwin-descendencia-modificacao", "afirm:shannon-entropia-informacao")
        self.assertIsNotNone(p)
        self.assertEqual(p[-1][2], "afirm:shannon-entropia-informacao")

    def test_investigar(self):
        r = self.i.investigar("origem da vida")
        self.assertIn("controv:replicador-ou-metabolismo", [c["id"] for c in r["controversias"]])
        self.assertTrue(r["lacunas"])

    def test_linhagem_cronologica(self):
        lin = Historiador(self.a).linhagem("afirm:shannon-entropia-informacao")
        anos = [x["ano"] for x in lin]
        self.assertEqual(anos, sorted(anos))

    def test_arvore_profundidade_arbitraria(self):
        caminho = [f"N{i}" for i in range(10)]
        folha = Classificador(self.a).classificar("conceito:evolucao", caminho)
        self.assertEqual(self.a.obter(folha)["nivel"], "subtopico-4")


class TestExportacao(unittest.TestCase):
    def test_jsonld_e_turtle(self):
        a = acervo_semeado()
        g = exportar.jsonld(a)
        self.assertEqual(len(g["@graph"]), len(a.listar()))
        ttl = exportar.turtle(a)
        self.assertIn("schema:Claim", ttl)
        self.assertIn("@prefix", ttl)


if __name__ == "__main__":
    unittest.main()
