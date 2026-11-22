"""Acervo: armazenamento com livro-razão encadeado por hash.

Princípio do Guardião: nada é apagado ou alterado em silêncio.
Toda mutação é um EVENTO num livro-razão append-only; cada evento guarda o
hash do anterior (cadeia). As tabelas `entidades` e `relacoes` são apenas uma
visão materializada, que pode ser reconstruída do zero reexecutando o livro.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone

from . import modelo

ESQUEMA = """
CREATE TABLE IF NOT EXISTS eventos (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    agente     TEXT NOT NULL,
    acao       TEXT NOT NULL,
    alvo       TEXT NOT NULL,
    carga      TEXT NOT NULL,
    regra      TEXT,
    hash_ant   TEXT NOT NULL,
    hash       TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS entidades (
    id       TEXT PRIMARY KEY,
    tipo     TEXT NOT NULL,
    dados    TEXT NOT NULL,
    versao   INTEGER NOT NULL,
    criado   TEXT NOT NULL,
    alterado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS relacoes (
    origem  TEXT NOT NULL,
    rel     TEXT NOT NULL,
    destino TEXT NOT NULL,
    dados   TEXT NOT NULL,
    PRIMARY KEY (origem, rel, destino)
);
CREATE INDEX IF NOT EXISTS ix_rel_dest ON relacoes(destino, rel);
CREATE INDEX IF NOT EXISTS ix_ent_tipo ON entidades(tipo);
"""

GENESE = "0" * 64
ACOES = {"criar", "alterar", "relacionar", "desrelacionar", "verificar", "contestar"}


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _hash_evento(hash_ant, ts, agente, acao, alvo, carga, regra) -> str:
    bruto = _canon([hash_ant, ts, agente, acao, alvo, carga, regra or ""])
    return hashlib.sha256(bruto.encode()).hexdigest()


class Acervo:
    def __init__(self, caminho: str = ":memory:"):
        self.db = sqlite3.connect(caminho)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(ESQUEMA)

    # ------------------------------------------------------------------ livro
    def _ultimo_hash(self) -> str:
        r = self.db.execute("SELECT hash FROM eventos ORDER BY seq DESC LIMIT 1").fetchone()
        return r["hash"] if r else GENESE

    def _registrar(self, agente, acao, alvo, carga, regra=None, ts=None) -> str:
        if acao not in ACOES:
            raise ValueError(f"ação inválida: {acao}")
        if not agente:
            raise ValueError("todo evento precisa de um agente responsável")
        ts = ts or _agora()
        carga_s = _canon(carga)
        h_ant = self._ultimo_hash()
        h = _hash_evento(h_ant, ts, agente, acao, alvo, carga_s, regra)
        self.db.execute(
            "INSERT INTO eventos(ts,agente,acao,alvo,carga,regra,hash_ant,hash) VALUES (?,?,?,?,?,?,?,?)",
            (ts, agente, acao, alvo, carga_s, regra, h_ant, h),
        )
        self._aplicar(ts, acao, alvo, carga)
        self.db.commit()
        return h

    def _aplicar(self, ts, acao, alvo, carga):
        """Aplica um evento à visão materializada (usado também no replay)."""
        if acao == "criar":
            self.db.execute(
                "INSERT INTO entidades(id,tipo,dados,versao,criado,alterado) VALUES (?,?,?,?,?,?)",
                (alvo, modelo.tipo_de(alvo), _canon(carga), 1, ts, ts),
            )
        elif acao in ("alterar", "verificar", "contestar"):
            atual = self.obter(alvo)
            if atual is None:
                raise KeyError(alvo)
            novo = {**atual, **carga}
            self.db.execute(
                "UPDATE entidades SET dados=?, versao=versao+1, alterado=? WHERE id=?",
                (_canon(novo), ts, alvo),
            )
        elif acao == "relacionar":
            self.db.execute(
                "INSERT OR REPLACE INTO relacoes(origem,rel,destino,dados) VALUES (?,?,?,?)",
                (carga["origem"], carga["rel"], carga["destino"], _canon(carga.get("dados", {}))),
            )
        elif acao == "desrelacionar":
            self.db.execute(
                "DELETE FROM relacoes WHERE origem=? AND rel=? AND destino=?",
                (carga["origem"], carga["rel"], carga["destino"]),
            )

    # --------------------------------------------------------------- escrita
    def criar(self, ident: str, dados: dict, agente: str, regra: str | None = None) -> str:
        problemas = modelo.validar_entidade(ident, dados)
        if problemas:
            raise ValueError("; ".join(problemas))
        if self.obter(ident) is not None:
            raise ValueError(f"já existe: {ident}")
        return self._registrar(agente, "criar", ident, dados, regra)

    def alterar(self, ident: str, mudancas: dict, agente: str, regra: str | None = None,
                acao: str = "alterar") -> str:
        atual = self.obter(ident)
        if atual is None:
            raise KeyError(ident)
        problemas = modelo.validar_entidade(ident, {**atual, **mudancas})
        if problemas:
            raise ValueError("; ".join(problemas))
        return self._registrar(agente, acao, ident, mudancas, regra)

    def relacionar(self, origem: str, rel: str, destino: str, agente: str,
                   dados: dict | None = None, regra: str | None = None) -> str:
        modelo.validar_relacao(origem, rel, destino)
        for e in (origem, destino):
            if self.obter(e) is None:
                raise KeyError(f"entidade inexistente: {e}")
        carga = {"origem": origem, "rel": rel, "destino": destino, "dados": dados or {}}
        return self._registrar(agente, "relacionar", f"{origem}|{rel}|{destino}", carga, regra)

    def desrelacionar(self, origem: str, rel: str, destino: str, agente: str, motivo: str) -> str:
        carga = {"origem": origem, "rel": rel, "destino": destino, "motivo": motivo}
        return self._registrar(agente, "desrelacionar", f"{origem}|{rel}|{destino}", carga)

    # --------------------------------------------------------------- leitura
    def obter(self, ident: str) -> dict | None:
        r = self.db.execute("SELECT dados FROM entidades WHERE id=?", (ident,)).fetchone()
        return json.loads(r["dados"]) if r else None

    def meta(self, ident: str) -> dict | None:
        r = self.db.execute("SELECT versao, criado, alterado FROM entidades WHERE id=?", (ident,)).fetchone()
        return dict(r) if r else None

    def listar(self, tipo: str | None = None) -> list[tuple[str, dict]]:
        q = "SELECT id, dados FROM entidades" + (" WHERE tipo=?" if tipo else "") + " ORDER BY id"
        rows = self.db.execute(q, (tipo,) if tipo else ()).fetchall()
        return [(r["id"], json.loads(r["dados"])) for r in rows]

    def saindo(self, ident: str, rel: str | None = None) -> list[tuple[str, str, dict]]:
        q = "SELECT rel, destino, dados FROM relacoes WHERE origem=?" + (" AND rel=?" if rel else "")
        rows = self.db.execute(q, (ident, rel) if rel else (ident,)).fetchall()
        return [(r["rel"], r["destino"], json.loads(r["dados"])) for r in rows]

    def entrando(self, ident: str, rel: str | None = None) -> list[tuple[str, str, dict]]:
        q = "SELECT rel, origem, dados FROM relacoes WHERE destino=?" + (" AND rel=?" if rel else "")
        rows = self.db.execute(q, (ident, rel) if rel else (ident,)).fetchall()
        return [(r["rel"], r["origem"], json.loads(r["dados"])) for r in rows]

    def todas_relacoes(self) -> list[tuple[str, str, str, dict]]:
        rows = self.db.execute("SELECT origem, rel, destino, dados FROM relacoes ORDER BY origem, rel, destino")
        return [(r["origem"], r["rel"], r["destino"], json.loads(r["dados"])) for r in rows]

    def historico(self, ident: str) -> list[dict]:
        """Todos os eventos que tocaram uma entidade (inclusive como ponta de relação)."""
        rows = self.db.execute(
            "SELECT seq, ts, agente, acao, alvo, carga, regra, hash FROM eventos "
            "WHERE alvo=? OR alvo LIKE ? OR alvo LIKE ? ORDER BY seq",
            (ident, f"{ident}|%", f"%|{ident}"),
        ).fetchall()
        return [{**dict(r), "carga": json.loads(r["carga"])} for r in rows]

    def eventos(self) -> list[dict]:
        rows = self.db.execute("SELECT * FROM eventos ORDER BY seq").fetchall()
        return [dict(r) for r in rows]

    def nome(self, ident: str) -> str:
        d = self.obter(ident) or {}
        return d.get("nome") or d.get("titulo") or d.get("enunciado") or ident
