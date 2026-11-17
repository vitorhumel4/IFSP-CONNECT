
"use strict";

// ==========================================
// MONITOR DE LUX - ARDUINO UNO
// ==========================================

(() => {
    const botaoConectar = document.getElementById(
        "conectar-arduino"
    );

    const botaoReiniciar = document.getElementById(
        "reiniciar-arduino"
    );

    const visorLux = document.getElementById("lux");

    const statusArduino = document.getElementById(
        "status-arduino"
    );

    let porta = null;
    let leitor = null;
    let conectado = false;
    let conectando = false;
    let encerrando = false;
    let sessao = 0;

    const BAUD_RATE = 9600;

    function atualizarStatus(mensagem) {
        if (statusArduino) {
            statusArduino.textContent = mensagem;
        }
    }

    function atualizarBotao() {
        if (!botaoConectar) return;

        botaoConectar.textContent = conectado
            ? "Desconectar Arduino"
            : "Conectar Arduino";

        botaoConectar.disabled = conectando;
    }

    function receberLinha(linha) {
        const texto = linha.trim();

        if (!texto) return;

        if (texto.toUpperCase() === "INVALIDO") {
            if (visorLux) {
                visorLux.textContent = "---";
            }

            return;
        }

        // Aceita linhas como:
        // 125.5
        // 125,5
        // LUX: 125.5
        // Lux: 125.5 lx

        const correspondencia = texto.match(
            /^(?:LUX\s*:\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:LUX|LX))?$/i
        );

        if (!correspondencia) return;

        const lux = Number(
            correspondencia[1].replace(",", ".")
        );

        if (!Number.isFinite(lux)) return;

        if (visorLux) {
            visorLux.textContent = lux.toFixed(1);
        }

        // Envia a leitura para o Eclipse Run.
        window.dispatchEvent(
            new CustomEvent("arduino-lux", {
                detail: {
                    lux: lux,
                    instante: performance.now()
                }
            })
        );
    }

    async function lerArduino(sessaoAtual) {
        const decodificador = new TextDecoder();
        let buffer = "";

        try {
            while (
                conectado &&
                porta &&
                sessaoAtual === sessao
            ) {
                leitor = porta.readable.getReader();

                try {
                    while (
                        conectado &&
                        sessaoAtual === sessao
                    ) {
                        const { value, done } =
                            await leitor.read();

                        if (done) break;

                        buffer += decodificador.decode(
                            value,
                            { stream: true }
                        );

                        const linhas = buffer.split(/\r?\n/);

                        buffer = linhas.pop() || "";

                        for (const linha of linhas) {
                            receberLinha(linha);
                        }

                        // Evita acumular dados indefinidamente.
                        if (buffer.length > 1000) {
                            buffer = "";
                        }
                    }
                } finally {
                    if (leitor) {
                        try {
                            leitor.releaseLock();
                        } catch (erro) {
                            console.warn(erro);
                        }

                        leitor = null;
                    }
                }

                break;
            }
        } catch (erro) {
            if (conectado) {
                console.error(
                    "Erro na leitura serial:",
                    erro
                );

                atualizarStatus(
                    "Erro na comunicação com Arduino."
                );
            }
        } finally {
            if (
                sessaoAtual === sessao &&
                !encerrando
            ) {
                await desconectarArduino();
            }
        }
    }

    async function conectarArduino() {
        if (conectando || conectado) return;

        if (!("serial" in navigator)) {
            atualizarStatus(
                "Use Chrome ou Edge com Live Server."
            );
            return;
        }

        conectando = true;
        atualizarBotao();

        try {
            // Abre a janela para selecionar
            // a porta USB do Arduino.
            porta = await navigator.serial.requestPort();

            await porta.open({
                baudRate: BAUD_RATE
            });

            conectado = true;
            sessao++;

            atualizarStatus("Arduino conectado.");

            if (visorLux) {
                visorLux.textContent = "---";
            }

            atualizarBotao();

            // A leitura acontece continuamente.
            void lerArduino(sessao);
        } catch (erro) {
            console.error(
                "Erro ao conectar Arduino:",
                erro
            );

            if (erro.name === "NotFoundError") {
                atualizarStatus(
                    "Seleção de porta cancelada."
                );
            } else {
                atualizarStatus(
                    "Não foi possível conectar: " +
                    erro.message
                );
            }

            porta = null;
        } finally {
            conectando = false;
            atualizarBotao();
        }
    }

    async function desconectarArduino() {
        if (encerrando) return;

        encerrando = true;
        conectado = false;
        sessao++;

        const leitorAtual = leitor;
        const portaAtual = porta;

        try {
            if (leitorAtual) {
                await leitorAtual.cancel();
            }

            // Aguarda a liberação do leitor.
            while (leitor && leitor === leitorAtual) {
                await new Promise(resolve => {
                    setTimeout(resolve, 20);
                });
            }

            if (portaAtual) {
                await portaAtual.close();
            }

            atualizarStatus("Arduino desconectado.");

            window.dispatchEvent(
                new CustomEvent("arduino-desconectado")
            );
        } catch (erro) {
            console.error(
                "Erro ao desconectar:",
                erro
            );

            atualizarStatus(
                "Erro ao fechar a conexão."
            );
        } finally {
            porta = null;
            leitor = null;
            encerrando = false;
            atualizarBotao();
        }
    }

    async function reiniciarArduino() {
        if (!conectado || !porta) {
            atualizarStatus(
                "Conecte o Arduino primeiro."
            );
            return;
        }

        try {
            atualizarStatus("Reiniciando Arduino...");

            // Reinicia por DTR.
            await porta.setSignals({
                dataTerminalReady: false
            });

            await new Promise(resolve => {
                setTimeout(resolve, 150);
            });

            await porta.setSignals({
                dataTerminalReady: true
            });

            atualizarStatus(
                "Arduino reiniciado. Aguardando dados..."
            );
        } catch (erro) {
            console.error(erro);

            atualizarStatus(
                "Não foi possível reiniciar o Arduino."
            );
        }
    }

    // ==========================================
    // EVENTOS DOS BOTÕES
    // ==========================================

    if (botaoConectar) {
        botaoConectar.addEventListener(
            "click",
            async () => {
                if (conectado) {
                    await desconectarArduino();
                } else {
                    await conectarArduino();
                }
            }
        );
    } else {
        console.warn(
            "Botão conectar-arduino não encontrado."
        );
    }

    if (botaoReiniciar) {
        botaoReiniciar.addEventListener(
            "click",
            reiniciarArduino
        );
    }

    if ("serial" in navigator) {
        navigator.serial.addEventListener(
            "disconnect",
            () => {
                if (conectado) {
                    void desconectarArduino();
                }
            }
        );
    }

    atualizarBotao();
})();
