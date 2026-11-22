import unittest

from experimentos import emergencia, redacao
from sociedade import Agente, Constituicao, Mensagem, Registro, Reputacao, Sociedade
from sociedade.normas import exige_campos, separacao_de_poderes


class Eco(Agente):
    inscricoes = ("ping",)

    def receber(self, msg, soc):
        return [msg.responder(self.nome, "pong", {"autor": msg.remetente})]


class TestNucleo(unittest.TestCase):
    def test_registro_detecta_adulteracao(self):
        r = Registro()
        for i in range(5):
            r.anotar("evento", "a", {"i": i})
        self.assertTrue(r.integro())
        object.__setattr__(list(r)[2], "dados", {"i": 999})
        self.assertFalse(r.integro())

    def test_cadeia_causal(self):
        soc = Sociedade().adicionar(Eco("eco"))
        origem = Mensagem("u", "ping")
        soc.publicar(origem)
        soc.executar()
        pong = [e for e in soc.registro.filtrar("mensagem") if e.dados["tipo"] == "pong"][0]
        self.assertEqual([e.dados["id"] for e in soc.registro.cadeia_causal(pong.dados["id"])],
                         [pong.dados["id"], origem.id])

    def test_reputacao_assimetrica(self):
        r = Reputacao(peso_falha=2)
        r.registrar("x", True)
        r.registrar("x", False)
        self.assertLess(r.confianca("x"), 0.5)

    def test_norma_bloqueia_e_anuncia(self):
        soc = Sociedade(Constituicao([exige_campos("fato", "fonte")]))
        soc.publicar(Mensagem("a", "fato", {"texto": "x"}))
        soc.executar()
        self.assertFalse(any(e.dados["tipo"] == "fato" for e in soc.registro.filtrar("mensagem")))
        self.assertEqual(len(soc.registro.filtrar("violacao")), 1)
        self.assertTrue(any(e.dados["tipo"] == "norma_violada" for e in soc.registro.filtrar("mensagem")))
        self.assertLess(soc.reputacao.confianca("a"), 0.5)

    def test_separacao_de_poderes(self):
        soc = Sociedade(Constituicao([separacao_de_poderes("aprovacao")]))
        soc.publicar(Mensagem("a", "aprovacao", {"autor": "a"}), Mensagem("b", "aprovacao", {"autor": "a"}))
        soc.executar()
        aprov = [e.autor for e in soc.registro.filtrar("mensagem") if e.dados["tipo"] == "aprovacao"]
        self.assertEqual(aprov, ["b"])

    def test_suspensao_por_reincidencia(self):
        soc = Sociedade(Constituicao([exige_campos("fato", "fonte")]), limite_suspensao=2)
        soc.adicionar(Agente("a", {"x"}), Agente("b", {"x"}))
        soc.publicar(*(Mensagem("a", "fato") for _ in range(2)))
        soc.executar()
        self.assertEqual(soc.leiloar({"competencia": "x"}), "b")

    def test_leilao_pondera_reputacao(self):
        class Confiante(Agente):
            def lance(self, t, s):
                return 0.95
        class Modesto(Agente):
            def lance(self, t, s):
                return 0.6
        soc = Sociedade().adicionar(Confiante("c"), Modesto("m"))
        self.assertEqual(soc.leiloar({}), "c")
        soc.reputacao.registrar("c", False)
        self.assertEqual(soc.leiloar({}), "m")


class TestExperimentos(unittest.TestCase):
    def test_redacao_emerge_com_fontes_e_auditoria(self):
        for semente in range(10):
            r = redacao.rodar(semente, saida=None)
            self.assertEqual(r["veredito"], "aprovado", semente)
            self.assertTrue(r["registro_integro"])
            for s in redacao.SECOES:
                self.assertIn(f"## {s}", r["texto"])
            self.assertNotIn("Blog anônimo", r["texto"])
            rep = r["reputacao"]
            self.assertGreater(rep["pesquisadora_rigorosa"], rep["pesquisador_apressado"])
            self.assertIn(("redator", "separacao_de_poderes"), [(a, n) for a, n, _ in r["violacoes"]])
            self.assertEqual(r["trilha"][-1].autor, "usuaria")

    def test_emergencia(self):
        r = emergencia.experimento(rodadas=200, semente=1)
        self.assertLess(r["teorema"]["residuo"], 1e-6)
        ind, col = r["diversa"]
        self.assertLess(col, ind / 3)                       # diversidade: coletivo >> indivíduo
        self.assertGreater(r["homogenea"][1], 10)           # viés comum não se cancela
        c = r["cascata"]
        self.assertGreater(c["herding 0.8, média"], 2 * c["independente, média"])
        self.assertGreater(c["herding 0.8 + 3 manip., média"], 5 * c["norma: independência + mediana, 3 manip."])


if __name__ == "__main__":
    unittest.main()
