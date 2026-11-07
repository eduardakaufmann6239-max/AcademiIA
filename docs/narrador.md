# Narrador

O estúdio escolhe o narrador automaticamente, nesta ordem:

| Ordem | Narrador   | Qualidade             | Custo           | Como ativar                                                              |
| ----- | ---------- | --------------------- | --------------- | ------------------------------------------------------------------------ |
| 1     | ElevenLabs | voz natural, a melhor | pago, na nuvem  | `export ELEVENLABS_API_KEY=...` (opcional: `ELEVENLABS_VOZ=<id da voz>`) |
| 2     | Piper      | voz neural boa, pt-BR | grátis, offline | instalar o pacote Python `piper-tts` e baixar a voz (abaixo)             |
| 3     | espeak-ng  | robótica              | grátis          | instalar `espeak-ng`                                                     |
| 4     | nenhum     | legendas + música     | grátis          | padrão                                                                   |

## Piper (recomendado sem custo)

1. Instale o pacote Python `piper-tts` (projeto oficial: github.com/OHF-Voice/piper1-gpl).
2. Baixe a voz brasileira para a pasta `vozes/`:
   `python3 -m piper.download_voices pt_BR-faber-medium --data-dir vozes`
3. Renderize normalmente: `node src/cli.js render roteiros/exemplos/ia-como-aprende.json`.

Variáveis opcionais: `PIPER_VOZ` (caminho de outro modelo `.onnx`) e `PIPER_VELOCIDADE` (padrão `0.95`; menor = mais rápido).

A duração de cada cena se ajusta ao áudio real, e a música abaixa sozinha quando o narrador fala.
