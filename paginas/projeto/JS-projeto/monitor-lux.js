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
    let reiniciando = false;

    let sessao = 0;

    const BAUD_RATE = 9600;

    // ==========================================
    // FUNÇÕES AUXILIARES
    // ==========================================

    function esperar(ms) {

        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });

    }

    function atualizarStatus(mensagem) {

        if (statusArduino) {
            statusArduino.textContent = mensagem;
        }

    }

    function atualizarBotao() {

        if (botaoConectar) {

            botaoConectar.textContent = conectado
                ? "Desconectar Arduino"
                : "Conectar Arduino";

            botaoConectar.disabled =
                conectando || encerrando || reiniciando;

        }

        if (botaoReiniciar) {

            botaoReiniciar.disabled =
                !conectado ||
                conectando ||
                encerrando ||
                reiniciando;

            botaoReiniciar.textContent = reiniciando
                ? "Reiniciando..."
                : "Reiniciar Arduino";

        }

    }

    function limparVisor() {

        if (visorLux) {
            visorLux.textContent = "---";
        }

    }

    function avisarDesconexao() {

        window.dispatchEvent(
            new CustomEvent("arduino-desconectado")
        );

    }

    // ==========================================
    // RECEBER LEITURAS DO ARDUINO
    // ==========================================

    function receberLinha(linha) {

        const texto = linha.trim();

        if (!texto) return;

        if (texto.toUpperCase() === "INVALIDO") {

            limparVisor();
            return;

        }

        // Formatos aceitos:
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

        // Envia os dados para o Eclipse Run
        // e para o monitor ambiental.

        window.dispatchEvent(

            new CustomEvent("arduino-lux", {

                detail: {
                    lux: lux,
                    instante: performance.now()
                }

            })

        );

    }

    // ==========================================
    // LEITURA SERIAL CONTÍNUA
    // ==========================================

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

                            if (
                                conectado &&
                                sessaoAtual === sessao
                            ) {

                                receberLinha(linha);

                            }

                        }

                        if (buffer.length > 1000) {

                            buffer = "";

                        }

                    }

                } finally {

                    if (leitor) {

                        try {

                            leitor.releaseLock();

                        } catch (erro) {

                            console.warn(
                                "Erro ao liberar leitor:",
                                erro
                            );

                        }

                        leitor = null;

                    }

                }

                break;

            }

        } catch (erro) {

            if (
                conectado &&
                sessaoAtual === sessao
            ) {

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

    // ==========================================
    // CONECTAR ARDUINO
    // ==========================================

    async function conectarArduino() {

        if (
            conectando ||
            conectado ||
            encerrando
        ) {

            return;

        }

        if (!("serial" in navigator)) {

            atualizarStatus(
                "Use Chrome ou Edge com Live Server."
            );

            return;

        }

        conectando = true;

        atualizarBotao();

        let portaSelecionada = null;

        try {

            portaSelecionada =
                await navigator.serial.requestPort();

            await portaSelecionada.open({

                baudRate: BAUD_RATE

            });

            porta = portaSelecionada;

            conectado = true;

            sessao++;

            limparVisor();

            atualizarStatus(
                "Arduino conectado. Aguardando leituras..."
            );

            console.log(
                "Arduino conectado com sucesso."
            );

            // Inicia a leitura contínua.

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

            if (portaSelecionada) {

                try {

                    await portaSelecionada.close();

                } catch (erroFechamento) {

                    console.warn(
                        "Não foi possível fechar a porta:",
                        erroFechamento
                    );

                }

            }

            porta = null;

            conectado = false;

        } finally {

            conectando = false;

            atualizarBotao();

        }

    }

    // ==========================================
    // DESCONECTAR ARDUINO
    // ==========================================

    async function desconectarArduino() {

        if (encerrando) return;

        encerrando = true;

        const estavaConectado = conectado;

        conectado = false;

        sessao++;

        atualizarBotao();

        const leitorAtual = leitor;

        const portaAtual = porta;

        try {

            if (leitorAtual) {

                try {

                    await leitorAtual.cancel();

                } catch (erro) {

                    console.warn(
                        "Erro ao cancelar leitura:",
                        erro
                    );

                }

            }

            // Aguarda a liberação do leitor serial.

            while (
                leitor &&
                leitor === leitorAtual
            ) {

                await esperar(20);

            }

            if (portaAtual) {

                await portaAtual.close();

            }

            atualizarStatus(
                "Arduino desconectado."
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

            reiniciando = false;

            limparVisor();

            atualizarBotao();

            if (estavaConectado) {

                avisarDesconexao();

            }

        }

    }

    // ==========================================
    // REINICIAR ARDUINO POR DTR
    // ==========================================

    async function reiniciarArduino() {

        if (!conectado || !porta) {

            atualizarStatus(
                "Conecte o Arduino primeiro."
            );

            return;

        }

        if (
            reiniciando ||
            encerrando ||
            conectando
        ) {

            return;

        }

        reiniciando = true;

        atualizarBotao();

        atualizarStatus(
            "Reiniciando Arduino..."
        );

        try {

            // Reinicia o Arduino UNO por DTR.

            await porta.setSignals({

                dataTerminalReady: false

            });

            await esperar(200);

            await porta.setSignals({

                dataTerminalReady: true

            });

            // Aguarda a inicialização do Arduino.

            await esperar(2000);

            if (conectado && porta) {

                limparVisor();

                atualizarStatus(
                    "Comando de reset enviado. " +
                    "Aguardando leituras..."
                );

                console.log(
                    "Pulso de reset DTR enviado."
                );

            }

        } catch (erro) {

            console.error(
                "Erro ao reiniciar Arduino:",
                erro
            );

            atualizarStatus(
                "Não foi possível reiniciar: " +
                erro.message
            );

        } finally {

            reiniciando = false;

            atualizarBotao();

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

    } else {

        console.warn(
            "Botão reiniciar-arduino não encontrado."
        );

    }

    // ==========================================
    // DESCONEXÃO FÍSICA DO USB
    // ==========================================

    if ("serial" in navigator) {

        navigator.serial.addEventListener(

            "disconnect",

            evento => {

                if (
                    conectado &&
                    evento.target === porta
                ) {

                    void desconectarArduino();

                }

            }

        );

    }

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    atualizarBotao();

    console.log(
        "Monitor de Lux inicializado."
    );

})();


// ==========================================
// MONITOR DE ILUMINAÇÃO AMBIENTAL
// ==========================================

(() => {

    const visorLux = document.getElementById(
        "monitor-lux"
    );

    const ambiente = document.getElementById(
        "monitor-ambiente"
    );

    const descricao = document.getElementById(
        "monitor-descricao"
    );

    const icone = document.getElementById(
        "monitor-icone"
    );

    const marcador = document.getElementById(
        "monitor-marcador"
    );

    if (
        !visorLux ||
        !ambiente ||
        !descricao ||
        !icone ||
        !marcador
    ) {

        return;

    }

    // ==========================================
    // TABELA DE REFERÊNCIA DE ILUMINÂNCIA
    // ==========================================

    const ambientes = [

        {
            limite: 1,

            nome: "Noite escura",

            descricao:
                "Iluminação semelhante à de uma noite com pouca luz.",

            icone: "🌑",

            cor: "#4338ca"
        },

        {
            limite: 50,

            nome: "Ambiente pouco iluminado",

            descricao:
                "Semelhante a um ambiente em penumbra.",

            icone: "🕯️",

            cor: "#6366f1"
        },

        {
            limite: 150,

            nome: "Corredor iluminado",

            descricao:
                "Iluminação semelhante à de corredores internos.",

            icone: "🚪",

            cor: "#3b82f6"
        },

        {
            limite: 300,

            nome: "Quarto iluminado",

            descricao:
                "Semelhante à iluminação residencial.",

            icone: "🛏️",

            cor: "#16a34a"
        },

        {
            limite: 750,

            nome: "Sala de aula ou escritório",

            descricao:
                "Iluminação típica de ambientes de estudo e trabalho.",

            icone: "📚",

            cor: "#65a30d"
        },

        {
            limite: 2000,

            nome: "Ambiente interno muito iluminado",

            descricao:
                "Semelhante a locais com iluminação intensa.",

            icone: "💡",

            cor: "#ca8a04"
        },

        {
            limite: 20000,

            nome: "Ambiente externo à sombra",

            descricao:
                "Semelhante à iluminação natural indireta.",

            icone: "🌤️",

            cor: "#d97706"
        },

        {
            limite: Infinity,

            nome: "Ambiente externo sob luz solar",

            descricao:
                "Iluminância elevada, semelhante à luz solar.",

            icone: "☀️",

            cor: "#ea580c"
        }

    ];

    // ==========================================
    // ATUALIZAR MONITOR AMBIENTAL
    // ==========================================

    function atualizarMonitor(valor) {

        if (
            valor === null ||
            valor === undefined ||
            valor === ""
        ) {

            reiniciarMonitor();

            return;

        }

        const lux = Number(valor);

        if (
            !Number.isFinite(lux) ||
            lux < 0
        ) {

            reiniciarMonitor();

            return;

        }

        // Identifica o ambiente correspondente.

        const referencia = ambientes.find(

            item => lux < item.limite

        );

        // Atualiza o valor numérico.

        visorLux.textContent =

            lux.toLocaleString("pt-BR", {

                maximumFractionDigits: 2

            }) + " lx";

        // Atualiza o nome do ambiente.

        ambiente.textContent = referencia.nome;

        // Atualiza a descrição.

        descricao.textContent = referencia.descricao;

        // Atualiza o ícone.

        icone.textContent = referencia.icone;

        // Atualiza a cor do valor.

        visorLux.style.color = referencia.cor;

        // ======================================
        // ESCALA LOGARÍTMICA
        // ======================================

        const posicao = Math.min(

            100,

            Math.max(

                0,

                (
                    Math.log10(
                        Math.max(1, lux)
                    ) / 5
                ) * 100

            )

        );

        marcador.style.left = posicao + "%";

    }

    // ==========================================
    // REINICIAR MONITOR AMBIENTAL
    // ==========================================

    function reiniciarMonitor() {

        visorLux.textContent = "-- lx";

        ambiente.textContent =
            "Aguardando Arduino";

        descricao.textContent =
            "Aguardando uma medição válida do sensor LDR.";

        icone.textContent = "☀️";

        visorLux.style.color = "";

        marcador.style.left = "0%";

    }

    // ==========================================
    // RECEBER DADOS DO ARDUINO
    // ==========================================

    window.addEventListener(

        "arduino-lux",

        (evento) => {

            atualizarMonitor(
                evento.detail?.lux
            );

        }

    );

    // ==========================================
    // DETECTAR DESCONEXÃO
    // ==========================================

    window.addEventListener(

        "arduino-desconectado",

        () => {

            reiniciarMonitor();

        }

    );

})();


// ==========================================
// SINCRONIZAÇÃO DOS BOTÕES DO ECLIPSE RUN
// ==========================================

(() => {

    // Botões originais e seus correspondentes
    // dentro do jogo Eclipse Run.

    const pares = [

        [
            "conectar-arduino",
            "eclipse-conectar-arduino"
        ],

        [
            "reiniciar-arduino",
            "eclipse-reiniciar-arduino"
        ]

    ];

    // ==========================================
    // SINCRONIZAR OS CONTROLES
    // ==========================================

    for (const [idOriginal, idJogo] of pares) {

        const original = document.getElementById(
            idOriginal
        );

        const jogo = document.getElementById(
            idJogo
        );

        // Verifica se os botões existem.

        if (!original || !jogo) {

            continue;

        }

        // ======================================
        // ATUALIZAR O ESTADO DO BOTÃO
        // ======================================

        const sincronizar = () => {

            // Copia o texto do botão original.

            jogo.textContent =
                original.textContent.trim();

            // Copia o estado habilitado
            // ou desabilitado.

            jogo.disabled =
                original.disabled;

        };

        // ======================================
        // EXECUTAR A FUNÇÃO DO BOTÃO ORIGINAL
        // ======================================

        jogo.addEventListener(

            "click",

            () => {

                if (!original.disabled) {

                    original.click();

                }

                sincronizar();

            }

        );

        // ======================================
        // OBSERVAR ALTERAÇÕES NO BOTÃO ORIGINAL
        // ======================================

        const observador = new MutationObserver(

            sincronizar

        );

        observador.observe(

            original,

            {
                attributes: true,

                attributeFilter: [
                    "disabled"
                ],

                childList: true,

                characterData: true,

                subtree: true
            }

        );

        // Sincronização inicial.

        sincronizar();

    }

})();

// ======================================================
// GRÁFICO DE ILUMINÂNCIA EM TEMPO REAL
// JavaScript puro + Canvas HTML5
// ======================================================

(() => {

    const $ = id => document.getElementById(id);

    const canvas = $("grafico-lux-canvas");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const visorAtual = $("grafico-lux-atual");
    const visorMinimo = $("grafico-lux-minimo");
    const visorMaximo = $("grafico-lux-maximo");
    const visorMedia = $("grafico-lux-media");
    const visorQuantidade = $("grafico-lux-quantidade");

    const status = $("grafico-lux-status");
    const botaoLimpar = $("grafico-lux-limpar");

    // ==================================================
    // VARIÁVEIS
    // ==================================================

    const INTERVALO = 1000;
    const LIMITE_SEM_LEITURA = 3000;

    let historico = [];

    let luxAtual = null;
    let conectado = false;

    let ultimaLeitura = 0;
    let inicioColeta = null;

    let numeroLeitura = 0;
    let ultimaRegistrada = 0;

    let minimo = Infinity;
    let maximo = -Infinity;

    let soma = 0;
    let quantidade = 0;

    // ==================================================
    // FORMATAÇÃO
    // ==================================================

    function formatar(valor) {

        return valor.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        });
    }

    // ==================================================
    // ESTATÍSTICAS
    // ==================================================

    function atualizarEstatisticas() {

        visorQuantidade.textContent =
            quantidade.toLocaleString("pt-BR");

        if (quantidade === 0) {

            visorMinimo.textContent = "--";
            visorMaximo.textContent = "--";
            visorMedia.textContent = "--";

            return;
        }

        visorMinimo.textContent =
            formatar(minimo) + " lx";

        visorMaximo.textContent =
            formatar(maximo) + " lx";

        visorMedia.textContent =
            formatar(soma / quantidade) + " lx";
    }

    // ==================================================
    // ESCALA AUTOMÁTICA
    // ==================================================

    function calcularEscala(valor) {

        if (valor <= 0) return 10;

        const potencia = Math.pow(
            10,
            Math.floor(Math.log10(valor))
        );

        const normalizado = valor / potencia;

        let escala;

        if (normalizado <= 1) {

            escala = 1;

        } else if (normalizado <= 2) {

            escala = 2;

        } else if (normalizado <= 5) {

            escala = 5;

        } else {

            escala = 10;
        }

        return escala * potencia;
    }

    // ==================================================
    // DESENHAR GRÁFICO
    // ==================================================

    function desenharGrafico() {

        const largura = canvas.clientWidth;
        const altura = canvas.clientHeight;

        if (largura <= 0 || altura <= 0) return;

        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.round(largura * dpr);
        canvas.height = Math.round(altura * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.clearRect(0, 0, largura, altura);

        // Margens internas.

        const esquerda = 75;
        const direita = 20;
        const superior = 20;
        const inferior = 55;

        const areaLargura =
            largura - esquerda - direita;

        const areaAltura =
            altura - superior - inferior;

        if (areaLargura <= 0 || areaAltura <= 0) {
            return;
        }

        const base = superior + areaAltura;

        // Escala vertical automática.

        const maiorValor =
            quantidade > 0 ? maximo : 100;

        const limiteY = calcularEscala(
            Math.max(1, maiorValor * 1.05)
        );

        // Escala horizontal automática.

        const ultimoTempo = historico.length > 0
            ? historico[historico.length - 1].tempo
            : 0;

        const limiteX = Math.max(
            10,
            calcularEscala(ultimoTempo)
        );

        function converterX(tempo) {

            return esquerda +
                (tempo / limiteX) * areaLargura;
        }

        function converterY(lux) {

            return base -
                (lux / limiteY) * areaAltura;
        }

        ctx.font = "12px Lato, Arial, sans-serif";

        ctx.lineWidth = 1;

        // ==============================================
        // LINHAS HORIZONTAIS
        // ==============================================

        const divisoesY = 5;

        for (let i = 0; i <= divisoesY; i++) {

            const valor =
                limiteY * i / divisoesY;

            const y = converterY(valor);

            ctx.strokeStyle = "#dce7f7";

            ctx.beginPath();

            ctx.moveTo(esquerda, y);

            ctx.lineTo(
                largura - direita,
                y
            );

            ctx.stroke();

            ctx.fillStyle = "#1c2a44";

            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            ctx.fillText(
                valor.toLocaleString("pt-BR", {
                    maximumFractionDigits: 2
                }),
                esquerda - 10,
                y
            );
        }

        // ==============================================
        // LINHAS VERTICAIS
        // ==============================================

        const divisoesX = largura < 500 ? 5 : 10;

        for (let i = 0; i <= divisoesX; i++) {

            const tempo =
                limiteX * i / divisoesX;

            const x = converterX(tempo);

            ctx.strokeStyle = "#dce7f7";

            ctx.beginPath();

            ctx.moveTo(x, superior);
            ctx.lineTo(x, base);

            ctx.stroke();

            ctx.fillStyle = "#1c2a44";

            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            ctx.fillText(
                tempo.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1
                }),
                x,
                base + 10
            );
        }

        // ==============================================
        // EIXOS
        // ==============================================

        ctx.strokeStyle = "#0d3b8e";
        ctx.lineWidth = 2;

        ctx.beginPath();

        ctx.moveTo(esquerda, superior);
        ctx.lineTo(esquerda, base);
        ctx.lineTo(largura - direita, base);

        ctx.stroke();

        // ==============================================
        // TÍTULO DO EIXO X
        // ==============================================

        ctx.fillStyle = "#0d3b8e";

        ctx.font = "bold 13px Lato, Arial";

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
            "Tempo (s)",
            esquerda + areaLargura / 2,
            altura - 12
        );

        // ==============================================
        // TÍTULO DO EIXO Y
        // ==============================================

        ctx.save();

        ctx.translate(
            15,
            superior + areaAltura / 2
        );

        ctx.rotate(-Math.PI / 2);

        ctx.fillText(
            "Iluminância (lux)",
            0,
            0
        );

        ctx.restore();

        // ==============================================
        // GRÁFICO SEM DADOS
        // ==============================================

        if (historico.length === 0) {

            ctx.fillStyle = "#51617b";

            ctx.font = "14px Lato, Arial";

            ctx.textAlign = "center";

            ctx.fillText(
                "Aguardando medições...",
                esquerda + areaLargura / 2,
                superior + areaAltura / 2
            );

            return;
        }

        // ==============================================
        // PREENCHIMENTO ABAIXO DA LINHA
        // ==============================================

        const primeiro = historico[0];

        const ultimo =
            historico[historico.length - 1];

        const gradiente = ctx.createLinearGradient(
            0,
            superior,
            0,
            base
        );

        gradiente.addColorStop(
            0,
            "rgba(30, 111, 232, 0.30)"
        );

        gradiente.addColorStop(
            1,
            "rgba(30, 111, 232, 0.02)"
        );

        ctx.beginPath();

        ctx.moveTo(
            converterX(primeiro.tempo),
            base
        );

        historico.forEach(ponto => {

            ctx.lineTo(
                converterX(ponto.tempo),
                converterY(ponto.lux)
            );
        });

        ctx.lineTo(
            converterX(ultimo.tempo),
            base
        );

        ctx.closePath();

        ctx.fillStyle = gradiente;
        ctx.fill();

        // ==============================================
        // LINHA PRINCIPAL
        // ==============================================

        ctx.beginPath();

        historico.forEach((ponto, indice) => {

            const x = converterX(ponto.tempo);
            const y = converterY(ponto.lux);

            if (indice === 0) {

                ctx.moveTo(x, y);

            } else {

                ctx.lineTo(x, y);
            }
        });

        ctx.strokeStyle = "#1e6fe8";

        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        ctx.stroke();

        // ==============================================
        // PONTOS DAS MEDIÇÕES
        // ==============================================

        if (historico.length <= 150) {

            historico.forEach(ponto => {

                ctx.beginPath();

                ctx.arc(
                    converterX(ponto.tempo),
                    converterY(ponto.lux),
                    3,
                    0,
                    Math.PI * 2
                );

                ctx.fillStyle = "#0d3b8e";
                ctx.fill();

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.stroke();
            });
        }

        // ==============================================
        // DESTAQUE DA ÚLTIMA MEDIÇÃO
        // ==============================================

        ctx.beginPath();

        ctx.arc(
            converterX(ultimo.tempo),
            converterY(ultimo.lux),
            5,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = "#1e6fe8";
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // ==================================================
    // RECEBER LUMINOSIDADE DO ARDUINO
    // ==================================================

    window.addEventListener("arduino-lux", evento => {

        const valor = evento.detail?.lux;

        if (valor === null || valor === undefined) {
            return;
        }

        const numero = Number(valor);

        if (!Number.isFinite(numero) || numero < 0) {
            return;
        }

        luxAtual = numero;

        conectado = true;

        ultimaLeitura = performance.now();

        numeroLeitura++;

        if (inicioColeta === null) {

            inicioColeta = performance.now();
        }

        visorAtual.textContent =
            formatar(luxAtual);

        status.textContent =
            "Arduino conectado — coletando dados.";

        status.style.color = "#25834c";
    });

    // ==================================================
    // REGISTRAR MEDIÇÕES
    // ==================================================

    function registrarMedicao() {

        if (!conectado || luxAtual === null) {
            return;
        }

        const agora = performance.now();

        if (
            agora - ultimaLeitura >
            LIMITE_SEM_LEITURA
        ) {

            visorAtual.textContent = "---";

            status.textContent =
                "Aguardando novas leituras do Arduino...";

            status.style.color = "#a83b3b";

            return;
        }

        // Não registra uma leitura antiga novamente.

        if (numeroLeitura === ultimaRegistrada) {
            return;
        }

        ultimaRegistrada = numeroLeitura;

        if (inicioColeta === null) {

            inicioColeta = agora;
        }

        const tempo =
            (agora - inicioColeta) / 1000;

        historico.push({

            tempo: tempo,
            lux: luxAtual
        });

        quantidade++;

        soma += luxAtual;

        minimo = Math.min(minimo, luxAtual);
        maximo = Math.max(maximo, luxAtual);

        atualizarEstatisticas();

        desenharGrafico();
    }

    // Uma medição a cada segundo.

    setInterval(
        registrarMedicao,
        INTERVALO
    );

    // ==================================================
    // DESCONEXÃO DO ARDUINO
    // ==================================================

    window.addEventListener(
        "arduino-desconectado",
        () => {

            conectado = false;

            luxAtual = null;
            ultimaLeitura = 0;

            visorAtual.textContent = "---";

            status.textContent =
                "Arduino desconectado — histórico preservado.";

            status.style.color = "#a83b3b";
        }
    );

    // ==================================================
    // LIMPAR GRÁFICO
    // ==================================================

    botaoLimpar.addEventListener("click", () => {

        historico = [];

        quantidade = 0;
        soma = 0;

        minimo = Infinity;
        maximo = -Infinity;

        ultimaRegistrada = numeroLeitura;

        inicioColeta = conectado
            ? performance.now()
            : null;

        atualizarEstatisticas();

        desenharGrafico();
    });

    // ==================================================
    // REDIMENSIONAMENTO
    // ==================================================

    window.addEventListener(
        "resize",
        desenharGrafico
    );

    const observador = new ResizeObserver(() => {

        desenharGrafico();
    });

    observador.observe(canvas.parentElement);

    // ==================================================
    // INICIALIZAÇÃO
    // ==================================================

    atualizarEstatisticas();

    desenharGrafico();

    console.log(
        "Gráfico de iluminância inicializado sem bibliotecas."
    );

})();