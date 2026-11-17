
"use strict";

// ======================================================
// ECLIPSE RUN
// Arduino + LDR + Transformações Dia/Noite
// ======================================================

(() => {
    const $ = id => document.getElementById(id);

    const cenario = $("eclipse-cenario");
    const mundo = $("eclipse-mundo");
    const personagem = $("eclipse-personagem");

    const tempoHTML = $("eclipse-tempo");
    const modoHTML = $("eclipse-modo");
    const velocidadeHTML = $("eclipse-velocidade");
    const luxHTML = $("eclipse-lux");
    const statusHTML = $("eclipse-status");

    const aviso = $("eclipse-aviso");
    const inicio = $("eclipse-inicio");
    const fim = $("eclipse-fim");
    const resultado = $("eclipse-resultado");

    const botaoIniciar = $("eclipse-iniciar");
    const botaoReiniciar = $("eclipse-reiniciar");
    const botaoCalibrar = $("eclipse-calibrar");
    const botaoTeclado = $("eclipse-teclado");
    const botaoAlterar = $("eclipse-escolher-dificuldade");

    const botoesDificuldade =
        document.querySelectorAll(".eclipse-dificuldade");

    const descricaoDificuldade =
        $("eclipse-descricao-dificuldade");

    if (!cenario || !mundo || !personagem) {
        console.error("Elementos do Eclipse Run não encontrados.");
        return;
    }

    // Impede que o jogo seja iniciado duas vezes.
    if (window.__eclipseRunInicializado) {
        console.warn("Eclipse Run já inicializado.");
        return;
    }

    window.__eclipseRunInicializado = true;

    // ==================================================
    // CONFIGURAÇÕES
    // ==================================================

    const LARGURA_PLATAFORMA = 120;
    const VELOCIDADE_INICIAL = 145;
    const AUMENTO_VELOCIDADE = 0.20;

    const TEMPO_PISCADA = 500;
    const TEMPO_TRANSFORMACAO = 900;

    const QUANTIDADE_PARTICULAS = 24;

    const CONFIGURACOES = {
        facil: {
            intervalo: 0,
            maxPedras: 3
        },
        medio: {
            intervalo: 20,
            maxPedras: 2
        },
        dificil: {
            intervalo: 10,
            maxPedras: 1
        }
    };

    const DESCRICOES = {
        facil:
            "Velocidade constante. Até 3 pedras entre pontes.",
        medio:
            "A velocidade aumenta 20% a cada 20 segundos.",
        dificil:
            "A velocidade aumenta 20% a cada 10 segundos."
    };

    // ==================================================
    // ESTADO DO JOGO
    // ==================================================

    let dificuldade = "facil";

    let jogando = false;
    let tecladoAtivo = false;

    let calibrando = false;
    let calibrado = false;

    let modo = "sol";

    let luxAtual = null;
    let ultimaLeitura = 0;

    let limiteEscuro = 0;
    let limiteClaro = 0;

    let posicao = 60;
    let velocidade = VELOCIDADE_INICIAL;

    let tempo = 0;
    let ultimoFrame = 0;
    let animacao = null;

    let plataformas = [];
    let proximaPosicao = 0;

    let ultimoTipoPonte = null;
    let repeticoesPonte = 0;
    let nivelAnterior = 0;

    let idPartida = 0;
    let temporizadorDerrota = null;

    const prazo = {
        sol: 0,
        lua: 0
    };

    // ==================================================
    // ELEMENTOS DA TRANSFORMAÇÃO
    // ==================================================

    const bracoDireito =
        personagem.querySelector(".eclipse-braco.direito");

    const maoSolar = document.createElement("div");
    maoSolar.className = "eclipse-mao-solar";

    if (bracoDireito) {
        bracoDireito.appendChild(maoSolar);
    }

    const camadaParticulas = document.createElement("div");
    camadaParticulas.className = "eclipse-particulas";

    const nucleoSolar = document.createElement("div");
    nucleoSolar.className = "eclipse-nucleo-solar";

    const auraSolar = document.createElement("div");
    auraSolar.className = "eclipse-aura-solar";

    const esferaSolar = document.createElement("div");
    esferaSolar.className = "eclipse-esfera-solar";

    const flashCeleste = document.createElement("div");
    flashCeleste.className = "eclipse-flash-celeste";

    cenario.appendChild(camadaParticulas);
    cenario.appendChild(nucleoSolar);
    cenario.appendChild(auraSolar);
    cenario.appendChild(esferaSolar);
    cenario.appendChild(flashCeleste);

    let transformacaoId = 0;
    let temporizadorTransformacao = null;
    let animacoesMagicas = [];

    // ==================================================
    // FUNÇÕES AUXILIARES
    // ==================================================

    function inteiro(min, max) {
        return Math.floor(
            Math.random() * (max - min + 1)
        ) + min;
    }

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatarTempo(valor) {
        const minutos = Math.floor(valor / 60);
        const segundos = Math.floor(valor % 60);

        return (
            String(minutos).padStart(2, "0") +
            ":" +
            String(segundos).padStart(2, "0")
        );
    }

    function informar(texto) {
        if (statusHTML) {
            statusHTML.textContent = texto;
        }
    }

    function mostrarAviso(texto) {
        if (!aviso) return;

        aviso.textContent = texto;
        aviso.classList.remove("aparecer");

        void aviso.offsetWidth;

        aviso.classList.add("aparecer");
    }

    // ==================================================
    // PLATAFORMAS
    // ==================================================

    function criarPlataforma(tipo) {
        const elemento = document.createElement("div");

        elemento.className = "eclipse-plataforma " + tipo;

        elemento.style.left = proximaPosicao + "px";
        elemento.style.width = LARGURA_PLATAFORMA + "px";
        elemento.style.margin = "0";
        elemento.style.borderRadius = "0";
        elemento.style.boxSizing = "border-box";

        mundo.appendChild(elemento);

        plataformas.push({
            tipo,
            x: proximaPosicao,
            largura: LARGURA_PLATAFORMA,
            elemento
        });

        proximaPosicao += LARGURA_PLATAFORMA;
    }

    function escolherPonte() {
        let tipo;

        if (repeticoesPonte >= 2) {
            tipo = ultimoTipoPonte === "sol"
                ? "lua"
                : "sol";
        } else {
            tipo = Math.random() < 0.5
                ? "sol"
                : "lua";
        }

        if (tipo === ultimoTipoPonte) {
            repeticoesPonte++;
        } else {
            repeticoesPonte = 1;
        }

        ultimoTipoPonte = tipo;

        return tipo;
    }

    function gerarTrecho() {
        const config = CONFIGURACOES[dificuldade];

        const quantidadePedras =
            inteiro(1, config.maxPedras);

        for (let i = 0; i < quantidadePedras; i++) {
            criarPlataforma("pedra");
        }

        criarPlataforma(escolherPonte());
    }

    function gerarMundo() {
        mundo.innerHTML = "";

        plataformas = [];
        proximaPosicao = 0;

        ultimoTipoPonte = null;
        repeticoesPonte = 0;

        for (let i = 0; i < 4; i++) {
            criarPlataforma("pedra");
        }

        while (proximaPosicao < 2500) {
            gerarTrecho();
        }
    }

    function atualizarMundo() {
        while (
            proximaPosicao <
            posicao + cenario.clientWidth + 600
        ) {
            gerarTrecho();
        }

        while (
            plataformas.length > 0 &&
            plataformas[0].x +
            LARGURA_PLATAFORMA < posicao - 900
        ) {
            const antiga = plataformas.shift();
            antiga.elemento.remove();
        }
    }

    // ==================================================
    // POSIÇÕES PARA AS ANIMAÇÕES
    // ==================================================

    function centroRelativo(elemento) {
        const area = cenario.getBoundingClientRect();
        const rect = elemento.getBoundingClientRect();

        return {
            x: rect.left - area.left + rect.width / 2,
            y: rect.top - area.top + rect.height / 2
        };
    }

    function posicaoMao() {
        return centroRelativo(maoSolar);
    }

    function posicaoAstro(tipo) {
        const elemento = cenario.querySelector(
            tipo === "sol"
                ? ".eclipse-sol"
                : ".eclipse-lua"
        );

        return centroRelativo(elemento);
    }

    function posicionar(elemento, posicaoAlvo) {
        elemento.style.left = posicaoAlvo.x + "px";
        elemento.style.top = posicaoAlvo.y + "px";
    }

    // ==================================================
    // LIMPEZA DAS ANIMAÇÕES
    // ==================================================

    function limparParticulas() {
        for (const animacaoAtual of animacoesMagicas) {
            animacaoAtual.cancel();
        }

        animacoesMagicas = [];
        camadaParticulas.replaceChildren();
    }

    function cancelarTransformacao() {
        transformacaoId++;

        if (temporizadorTransformacao !== null) {
            clearTimeout(temporizadorTransformacao);
            temporizadorTransformacao = null;
        }

        limparParticulas();

        personagem.classList.remove(
            "absorvendo-sol",
            "devolvendo-sol"
        );

        nucleoSolar.classList.remove("ativo");
        auraSolar.classList.remove("ativa");
        esferaSolar.classList.remove("ativa");
        flashCeleste.classList.remove("ativo");

        cenario.classList.remove(
            "transformando-noite",
            "transformando-dia"
        );
    }

    // ==================================================
    // PARTÍCULAS MÁGICAS
    // ==================================================

    function criarParticula(origem, destino, atraso, duracao) {
        const particula = document.createElement("div");

        particula.className = "eclipse-particula-solar";

        const tamanho = inteiro(3, 7);

        particula.style.width = tamanho + "px";
        particula.style.height = tamanho + "px";

        posicionar(particula, origem);

        camadaParticulas.appendChild(particula);

        const deslocamentoX = destino.x - origem.x;
        const deslocamentoY = destino.y - origem.y;

        const curvaX = inteiro(-65, 65);
        const curvaY = inteiro(-45, 45);

        const animacaoAtual = particula.animate(
            [
                {
                    transform: "translate(0,0) scale(0.3)",
                    opacity: 0
                },
                {
                    offset: 0.2,
                    transform:
                        `translate(${curvaX * 0.4}px, ${curvaY * 0.4}px) scale(1.2)`,
                    opacity: 1
                },
                {
                    offset: 0.65,
                    transform:
                        `translate(${deslocamentoX * 0.65 + curvaX}px, ${deslocamentoY * 0.65 + curvaY}px) scale(0.9)`,
                    opacity: 1
                },
                {
                    transform:
                        `translate(${deslocamentoX}px, ${deslocamentoY}px) scale(0.1)`,
                    opacity: 0
                }
            ],
            {
                duration: duracao,
                delay: atraso,
                easing: "ease-in-out",
                fill: "forwards"
            }
        );

        animacoesMagicas.push(animacaoAtual);
    }

    function criarFluxoEnergia(origem, destino) {
        for (let i = 0; i < QUANTIDADE_PARTICULAS; i++) {
            criarParticula(
                origem,
                destino,
                inteiro(0, 250),
                inteiro(450, 620)
            );
        }
    }

    // ==================================================
    // TRANSFORMAÇÃO: DIA -> NOITE
    // ==================================================

    function absorverSol() {
        cancelarTransformacao();

        const idAtual = transformacaoId;

        personagem.classList.add(
            "energia-solar",
            "absorvendo-sol"
        );

        cenario.classList.add("transformando-noite");

        requestAnimationFrame(() => {
            if (
                idAtual !== transformacaoId ||
                !jogando ||
                modo !== "lua"
            ) {
                return;
            }

            const origem = posicaoAstro("sol");
            const destino = posicaoMao();

            posicionar(nucleoSolar, origem);
            posicionar(auraSolar, destino);

            nucleoSolar.classList.add("ativo");
            auraSolar.classList.add("ativa");

            criarFluxoEnergia(origem, destino);
        });

        temporizadorTransformacao = setTimeout(() => {
            if (idAtual !== transformacaoId) return;

            personagem.classList.remove("absorvendo-sol");

            nucleoSolar.classList.remove("ativo");
            auraSolar.classList.remove("ativa");

            cenario.classList.remove("transformando-noite");

            limparParticulas();
            temporizadorTransformacao = null;
        }, TEMPO_TRANSFORMACAO);
    }

    // ==================================================
    // TRANSFORMAÇÃO: NOITE -> DIA
    // ==================================================

    function devolverSol() {
        cancelarTransformacao();

        const idAtual = transformacaoId;

        // Mantém a energia na mão durante a devolução.
        personagem.classList.add(
            "energia-solar",
            "devolvendo-sol"
        );

        cenario.classList.add("transformando-dia");

        requestAnimationFrame(() => {
            if (
                idAtual !== transformacaoId ||
                !jogando ||
                modo !== "sol"
            ) {
                return;
            }

            const origem = posicaoMao();
            const destino = posicaoAstro("lua");

            posicionar(auraSolar, origem);
            posicionar(esferaSolar, origem);
            posicionar(flashCeleste, destino);

            auraSolar.classList.add("ativa");
            esferaSolar.classList.add("ativa");

            // Esfera dourada viajando da mão até a Lua.
            const dx = destino.x - origem.x;
            const dy = destino.y - origem.y;

            const animacaoEsfera = esferaSolar.animate(
                [
                    {
                        transform:
                            "translate(-50%, -50%) scale(0.5)",
                        opacity: 0
                    },
                    {
                        offset: 0.2,
                        transform:
                            "translate(-50%, -50%) scale(1.4)",
                        opacity: 1
                    },
                    {
                        offset: 0.85,
                        transform:
                            `translate(calc(-50% + ${dx * 0.85}px), calc(-50% + ${dy * 0.85}px)) scale(1)`,
                        opacity: 1
                    },
                    {
                        transform:
                            `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`,
                        opacity: 0
                    }
                ],
                {
                    duration: 720,
                    easing: "ease-in-out",
                    fill: "forwards"
                }
            );

            animacoesMagicas.push(animacaoEsfera);

            criarFluxoEnergia(origem, destino);

            // A Lua recebe a energia e vira Sol.
            setTimeout(() => {
                if (idAtual !== transformacaoId) return;

                flashCeleste.classList.add("ativo");

                personagem.classList.remove("energia-solar");
            }, 620);
        });

        temporizadorTransformacao = setTimeout(() => {
            if (idAtual !== transformacaoId) return;

            personagem.classList.remove(
                "devolvendo-sol",
                "energia-solar"
            );

            auraSolar.classList.remove("ativa");
            esferaSolar.classList.remove("ativa");

            cenario.classList.remove("transformando-dia");

            limparParticulas();

            temporizadorTransformacao = null;

            setTimeout(() => {
                if (idAtual === transformacaoId) {
                    flashCeleste.classList.remove("ativo");
                }
            }, 300);
        }, TEMPO_TRANSFORMACAO);
    }

    function removerEnergiaSolar() {
        cancelarTransformacao();

        personagem.classList.remove("energia-solar");
    }

    // ==================================================
    // DIA E NOITE
    // ==================================================

    function atualizarVisual() {
        cenario.classList.toggle(
            "noite",
            modo === "lua"
        );

        if (modoHTML) {
            modoHTML.textContent =
                modo === "sol" ? "☀ SOL" : "☾ LUA";

            modoHTML.style.color =
                modo === "sol"
                    ? "#ffd45e"
                    : "#cbdcff";
        }
    }

    function mudarModo(novoModo) {
        if (novoModo === modo) return;

        const agora = performance.now();
        const anterior = modo;

        modo = novoModo;

        // A ponte antiga continua sólida por 500 ms.
        prazo[anterior] = agora + TEMPO_PISCADA;
        prazo[novoModo] = 0;

        atualizarVisual();
        atualizarPontes(agora);

        if (jogando) {
            if (novoModo === "lua") {
                absorverSol();
            } else {
                devolverSol();
            }
        }
    }

    function ponteSolida(tipo, agora) {
        if (tipo === "pedra") return true;
        if (tipo === modo) return true;

        return agora < prazo[tipo];
    }

    function atualizarPontes(agora = performance.now()) {
        for (const plataforma of plataformas) {
            const ativa =
                ponteSolida(plataforma.tipo, agora);

            const piscando =
                plataforma.tipo !== "pedra" &&
                plataforma.tipo !== modo &&
                ativa;

            plataforma.elemento.classList.toggle(
                "piscando",
                piscando
            );

            plataforma.elemento.classList.toggle(
                "invisivel",
                !ativa
            );
        }
    }

    // ==================================================
    // LEITURA DO LDR
    // ==================================================

    function receberLux(valor) {
        const numero = Number(valor);

        if (
            !Number.isFinite(numero) ||
            numero < 0
        ) {
            return;
        }

        luxAtual = numero;
        ultimaLeitura = performance.now();

        if (luxHTML) {
            luxHTML.textContent =
                "Lux: " + numero.toFixed(1);
        }

        if (!calibrado || tecladoAtivo || calibrando) {
            return;
        }

        if (
            modo === "sol" &&
            numero <= limiteEscuro
        ) {
            mudarModo("lua");
        } else if (
            modo === "lua" &&
            numero >= limiteClaro
        ) {
            mudarModo("sol");
        }
    }

    window.addEventListener(
        "arduino-lux",
        evento => receberLux(evento.detail?.lux)
    );

    window.addEventListener(
        "arduino-desconectado",
        () => {
            luxAtual = null;
            ultimaLeitura = 0;
            calibrado = false;

            if (luxHTML) {
                luxHTML.textContent = "Lux: --";
            }

            if (jogando && !tecladoAtivo) {
                encerrarPartida("Arduino desconectado.");
            }
        }
    );

    // ==================================================
    // CALIBRAÇÃO
    // ==================================================

    async function calibrar() {
        if (calibrando || jogando) return;

        if (
            luxAtual === null ||
            performance.now() - ultimaLeitura > 3000
        ) {
            informar("Conecte o Arduino antes de calibrar.");
            return;
        }

        calibrando = true;
        calibrado = false;

        if (botaoCalibrar) {
            botaoCalibrar.disabled = true;
        }

        informar(
            "Deixe o LDR descoberto durante 4 segundos."
        );

        const amostras = [];

        for (let i = 0; i < 40; i++) {
            if (
                luxAtual !== null &&
                performance.now() - ultimaLeitura < 1000
            ) {
                amostras.push(luxAtual);
            }

            await esperar(100);
        }

        const media = amostras.reduce(
            (soma, valor) => soma + valor,
            0
        ) / amostras.length;

        calibrando = false;

        if (botaoCalibrar) {
            botaoCalibrar.disabled = false;
        }

        if (
            amostras.length < 10 ||
            !Number.isFinite(media) ||
            media <= 0
        ) {
            informar("Calibração inválida.");
            return;
        }

        limiteEscuro = media * 0.75;
        limiteClaro = media * 0.85;

        calibrado = true;

        informar(
            "LDR calibrado! Tampe para Lua e destampe para Sol."
        );
    }

    // ==================================================
    // CÂMERA
    // ==================================================

    function atualizarCamera() {
        const centroVisual =
            cenario.clientWidth * 0.24 +
            personagem.offsetWidth / 2;

        const deslocamento =
            posicao - centroVisual;

        mundo.style.transform =
            `translate3d(${-deslocamento}px, 0, 0)`;
    }

    // ==================================================
    // COLISÃO
    // ==================================================

    function verificarChao(agora) {
        const indice = Math.floor(
            posicao / LARGURA_PLATAFORMA
        );

        const xPlataforma =
            indice * LARGURA_PLATAFORMA;

        const plataforma = plataformas.find(
            p => p.x === xPlataforma
        );

        if (!plataforma) {
            return {
                seguro: false,
                plataforma: null
            };
        }

        return {
            seguro: ponteSolida(
                plataforma.tipo,
                agora
            ),
            plataforma
        };
    }

    // ==================================================
    // VELOCIDADE
    // ==================================================

    function atualizarVelocidade() {
        const config = CONFIGURACOES[dificuldade];

        let nivel = 0;

        if (config.intervalo > 0) {
            nivel = Math.floor(
                tempo / config.intervalo
            );
        }

        if (nivel > nivelAnterior) {
            nivelAnterior = nivel;
            mostrarAviso("VELOCIDADE AUMENTADA!");
        }

        const multiplicador =
            1 + nivel * AUMENTO_VELOCIDADE;

        velocidade =
            VELOCIDADE_INICIAL * multiplicador;

        if (velocidadeHTML) {
            velocidadeHTML.textContent =
                multiplicador.toFixed(1) + "x";
        }

        const duracao = Math.max(
            0.12,
            0.3 / multiplicador
        );

        personagem.querySelectorAll(
            ".eclipse-braco, .eclipse-perna"
        ).forEach(parte => {
            parte.style.animationDuration =
                duracao + "s";
        });

        personagem.style.setProperty(
            "--duracao-corrida",
            duracao + "s"
        );
    }

    // ==================================================
    // DERROTA
    // ==================================================

    function encerrarPartida(mensagem) {
        if (!jogando) return;

        jogando = false;

        removerEnergiaSolar();

        if (animacao !== null) {
            cancelAnimationFrame(animacao);
            animacao = null;
        }

        personagem.classList.add("caindo");

        if (resultado) {
            resultado.textContent =
                formatarTempo(tempo);
        }

        informar(mensagem);

        const partidaAtual = idPartida;

        if (temporizadorDerrota !== null) {
            clearTimeout(temporizadorDerrota);
        }

        temporizadorDerrota = setTimeout(() => {
            if (partidaAtual !== idPartida) return;

            fim?.classList.remove("eclipse-oculto");
        }, 800);
    }

    function perder(colisao) {
        console.group("ECLIPSE RUN - QUEDA");

        console.log("Tempo:", tempo.toFixed(2));
        console.log("Posição:", posicao);
        console.log("Modo:", modo);
        console.log("Lux:", luxAtual);

        console.log(
            "Plataforma:",
            colisao.plataforma?.tipo ?? "Nenhuma"
        );

        console.log(
            "Plataforma sólida:",
            colisao.seguro
        );

        console.groupEnd();

        encerrarPartida("Você caiu no abismo!");
    }

    // ==================================================
    // LOOP PRINCIPAL
    // ==================================================

    function atualizar(agora) {
        if (!jogando) return;

        const delta = Math.min(
            Math.max(0, (agora - ultimoFrame) / 1000),
            0.05
        );

        ultimoFrame = agora;
        tempo += delta;

        atualizarVelocidade();

        if (
            !tecladoAtivo &&
            performance.now() - ultimaLeitura > 3000
        ) {
            encerrarPartida(
                "Comunicação com Arduino interrompida."
            );
            return;
        }

        posicao += velocidade * delta;

        atualizarMundo();
        atualizarCamera();
        atualizarPontes(agora);

        if (tempoHTML) {
            tempoHTML.textContent =
                formatarTempo(tempo);
        }

        const colisao = verificarChao(agora);

        if (!colisao.seguro) {
            perder(colisao);
            return;
        }

        animacao = requestAnimationFrame(atualizar);
    }

    // ==================================================
    // INICIAR JOGO
    // ==================================================

    function iniciarJogo() {
        if (calibrando) return;

        if (!tecladoAtivo) {
            if (!calibrado) {
                informar("Calibre o LDR antes de jogar.");
                return;
            }

            if (
                luxAtual === null ||
                performance.now() - ultimaLeitura > 3000
            ) {
                informar("Aguardando leituras do Arduino.");
                return;
            }
        }

        idPartida++;

        if (animacao !== null) {
            cancelAnimationFrame(animacao);
            animacao = null;
        }

        if (temporizadorDerrota !== null) {
            clearTimeout(temporizadorDerrota);
            temporizadorDerrota = null;
        }

        removerEnergiaSolar();

        jogando = true;

        modo = tecladoAtivo
            ? "sol"
            : (
                luxAtual <= limiteEscuro
                    ? "lua"
                    : "sol"
            );

        prazo.sol = 0;
        prazo.lua = 0;

        posicao = 60;
        velocidade = VELOCIDADE_INICIAL;

        tempo = 0;
        nivelAnterior = 0;

        if (tempoHTML) {
            tempoHTML.textContent = "00:00";
        }

        if (velocidadeHTML) {
            velocidadeHTML.textContent = "1.0x";
        }

        personagem.classList.remove(
            "caindo",
            "parado"
        );

        inicio?.classList.add("eclipse-oculto");
        fim?.classList.add("eclipse-oculto");

        gerarMundo();

        atualizarVisual();
        atualizarCamera();
        atualizarPontes();

        if (modo === "lua") {
            absorverSol();
        }

        informar(
            tecladoAtivo
                ? "Jogando pelo teclado."
                : "Jogando com o LDR."
        );

        ultimoFrame = performance.now();
        animacao = requestAnimationFrame(atualizar);
    }

    // ==================================================
    // DIFICULDADES
    // ==================================================

    botoesDificuldade.forEach(botao => {
        botao.addEventListener("click", () => {
            if (jogando || calibrando) return;

            const escolhida =
                botao.dataset.dificuldade;

            if (!CONFIGURACOES[escolhida]) return;

            dificuldade = escolhida;

            botoesDificuldade.forEach(item => {
                item.classList.remove("selecionado");
            });

            botao.classList.add("selecionado");

            if (descricaoDificuldade) {
                descricaoDificuldade.textContent =
                    DESCRICOES[dificuldade];
            }

            gerarMundo();
            atualizarCamera();
            atualizarPontes();
        });
    });

    // ==================================================
    // BOTÕES
    // ==================================================

    botaoIniciar?.addEventListener(
        "click",
        iniciarJogo
    );

    botaoReiniciar?.addEventListener(
        "click",
        iniciarJogo
    );

    botaoCalibrar?.addEventListener(
        "click",
        calibrar
    );

    botaoTeclado?.addEventListener("click", () => {
        if (jogando || calibrando) return;

        tecladoAtivo = !tecladoAtivo;

        botaoTeclado.textContent =
            "Usar teclado: " +
            (tecladoAtivo ? "LIGADO" : "DESLIGADO");

        informar(
            tecladoAtivo
                ? "Modo teclado ativado."
                : "Modo Arduino ativado."
        );
    });

    botaoAlterar?.addEventListener("click", () => {
        idPartida++;
        jogando = false;

        removerEnergiaSolar();

        if (animacao !== null) {
            cancelAnimationFrame(animacao);
            animacao = null;
        }

        if (temporizadorDerrota !== null) {
            clearTimeout(temporizadorDerrota);
            temporizadorDerrota = null;
        }

        fim?.classList.add("eclipse-oculto");
        inicio?.classList.remove("eclipse-oculto");

        personagem.classList.remove("caindo");
        personagem.classList.add("parado");

        posicao = 60;
        prazo.sol = 0;
        prazo.lua = 0;

        gerarMundo();
        atualizarCamera();
        atualizarPontes();

        informar("Escolha a dificuldade para começar.");
    });

    // ==================================================
    // TECLADO
    // ==================================================

    document.addEventListener("keydown", evento => {
        if (evento.code !== "Space") return;
        if (!jogando || !tecladoAtivo) return;

        evento.preventDefault();

        if (evento.repeat) return;

        mudarModo(
            modo === "sol" ? "lua" : "sol"
        );
    });

    // ==================================================
    // REDIMENSIONAMENTO
    // ==================================================

    window.addEventListener("resize", () => {
        atualizarCamera();
    });

    // ==================================================
    // INICIALIZAÇÃO
    // ==================================================

    personagem.classList.add("parado");

    gerarMundo();
    atualizarVisual();
    atualizarCamera();
    atualizarPontes();

    if (descricaoDificuldade) {
        descricaoDificuldade.textContent =
            DESCRICOES[dificuldade];
    }

    console.log(
        "Eclipse Run carregado com transformações solares."
    );
})();
