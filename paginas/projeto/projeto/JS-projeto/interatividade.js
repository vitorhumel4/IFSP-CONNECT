/*
=========================================================
 ARQUIVO: formataçao.js

 PROJETO: IFSP CONNECT

 FUNCIONALIDADES:
1. Anima os elementos conforme a rolagem da página.
2. Faz os elementos aparecerem por baixo, pelos lados
    ou com efeito de zoom.
3. Repete as animações quando o conteúdo volta à tela.
4. Cria uma barra azul que mostra o progresso da página.
5. Faz o botão de voltar ao topo funcionar suavemente.
6. Adiciona efeitos visuais de interatividade em imagens (materiais e participantes)
   e aplica negrito ao passar o mouse nas frases da tabela de desenvolvimento.

 IMPORTANTE:
 O jogo Eclipse Run e os controles do Arduino
 não recebem animações deste arquivo.
=========================================================
*/

document.addEventListener("DOMContentLoaded", () => {

    // Verifica se o visitante prefere animações reduzidas.
    const movimentoReduzido = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;


    // =====================================================
    // 1. IDENTIFICAR OS ELEMENTOS DE CADA PÁGINA
    // =====================================================

    const elementosProjeto = [
        ...document.querySelectorAll(
            ".intuito-do-projeto, .logo-do-projeto, .resumo-do-projeto"
        )
    ];

    const elementosEstrutura = [
        ...document.querySelectorAll(
            ".materiais-do-projeto li, " +
            ".materiais-do-projeto img, " +
            ".materiais-do-projeto p, " +
            ".conteudo-ldr"
        )
    ];

    const elementosIntegracao = [
        ...document.querySelectorAll(".monitor-lux")
    ];

    const elementosAnimados = [...new Set([
        ...elementosProjeto,
        ...elementosEstrutura,
        ...elementosIntegracao
    ])];


    // =====================================================
    // 2. CRIAR AS ANIMAÇÕES DE ROLAGEM E INTERATIVIDADE
    // =====================================================

    const estiloAnimacoes = document.createElement("style");

    estiloAnimacoes.textContent = `
        /* Configuração inicial dos elementos de rolagem */
        .fx-scroll-item {
            opacity: 0;
            transition:
                opacity 750ms ease,
                transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: opacity, transform;
        }
        .fx-from-bottom { transform: translate3d(0, 100px, 0) scale(0.92); }
        .fx-from-left { transform: translate3d(-110px, 0, 0) rotate(-3deg); }
        .fx-from-right { transform: translate3d(110px, 0, 0) rotate(3deg); }
        .fx-zoom { transform: scale(0.78) rotate(-3deg); }

        .fx-scroll-item.fx-visible {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
        }

        /* =====================================================
           EFEITOS DE INTERATIVIDADE (Hover perceptível)
           ==================================================== */

        /* Imagens de materiais, participantes e professores ganham zoom suave e sombra ao passar o mouse */
        .materiais-do-projeto img,
        .IMG-participantes-projeto,
        .IMG-professores-projeto {
            transition: transform 0.3s ease, box-shadow 0.3s ease !important;
        }
        .materiais-do-projeto img:hover,
        .IMG-participantes-projeto:hover,
        .IMG-professores-projeto:hover {
            transform: scale(1.03) !important;
            box-shadow: 0 10px 25px rgba(0, 123, 255, 0.3) !important;
        }

        /* Itens gerais da estrutura */
        .materiais-do-projeto li,
        .intuito-do-projeto,
        .resumo-do-projeto {
            transition: transform 0.25s ease !important;
        }
        
        .materiais-do-projeto li:hover {
            transform: translateX(6px);
        }

        /* Tópicos numéricos (1, 2, 3...) ficam em negrito ao passar o mouse */
        .conteudo-ldr h3 {
            transition: font-weight 0.2s ease, transform 0.2s ease !important;
        }
        .conteudo-ldr h3:hover {
            font-weight: bold !important;
            transform: translateX(4px);
        }

        /* Células da tabela de desenvolvimento ("Atuou...", "Desenvolveu...") ficam em negrito ao passar o mouse */
        .tabela-desenvolvimento td {
            transition: font-weight 0.2s ease !important;
        }
        .tabela-desenvolvimento td:hover {
            font-weight: bold !important;
        }

        /* Monitor do Arduino com efeito de brilho interativo */
        .monitor-lux {
            transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease !important;
            border: 2px solid rgba(0, 123, 255, 0.3);
        }
        .monitor-lux:hover {
            transform: translateY(-3px);
            border-color: #007bff;
            box-shadow: 0 0 18px rgba(0, 123, 255, 0.4);
        }

        @media (prefers-reduced-motion: reduce) {
            .fx-scroll-item,
            .fx-scroll-item.fx-visible,
            .materiais-do-projeto img,
            .IMG-participantes-projeto,
            .IMG-professores-projeto,
            .monitor-lux {
                opacity: 1;
                transform: none;
                transition: none;
            }
        }
    `;

    document.head.appendChild(estiloAnimacoes);


    if (movimentoReduzido || !("IntersectionObserver" in window)) {
        elementosAnimados.forEach((elemento) => {
            elemento.style.opacity = "1";
            elemento.style.transform = "none";
        });
    } else {
        const observador = new IntersectionObserver(
            (entradas) => {
                entradas.forEach((entrada) => {
                    if (entrada.isIntersecting) {
                        entrada.target.classList.add("fx-visible");
                    } else {
                        entrada.target.classList.remove("fx-visible");
                    }
                });
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -35px 0px"
            }
        );

        elementosAnimados.forEach((elemento, indice) => {
            elemento.classList.add("fx-scroll-item");

            const tipo = indice % 4;
            if (tipo === 0) elemento.classList.add("fx-from-bottom");
            else if (tipo === 1) elemento.classList.add("fx-from-left");
            else if (tipo === 2) elemento.classList.add("fx-from-right");
            else elemento.classList.add("fx-zoom");

            elemento.style.transitionDelay = `${(indice % 4) * 90}ms`;
            observador.observe(elemento);
        });
    }


    // =====================================================
    // 3. BARRA AZUL DE PROGRESSO NO TOPO
    // =====================================================

    if (!document.getElementById("progresso-rolagem")) {
        const barra = document.createElement("div");
        barra.id = "progresso-rolagem";

        Object.assign(barra.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "0%",
            height: "5px",
            backgroundColor: "#007bff",
            boxShadow: "0 0 12px rgba(0, 123, 255, 0.75)",
            zIndex: "99999",
            pointerEvents: "none"
        });

        document.body.appendChild(barra);

        let ticking = false;

        function atualizarProgresso() {
            const alturaRolavel = document.documentElement.scrollHeight - window.innerHeight;
            const porcentagem = alturaRolavel > 0 ? (window.scrollY / alturaRolavel) * 100 : 0;
            barra.style.width = `${Math.min(porcentagem, 100)}%`;
            ticking = false;
        }

        window.addEventListener("scroll", () => {
            if (!ticking) {
                window.requestAnimationFrame(atualizarProgresso);
                ticking = true;
            }
        }, { passive: true });

        window.addEventListener("resize", atualizarProgresso);
        atualizarProgresso();
    }


    // =====================================================
    // 4. BOTÃO VOLTAR AO TOPO
    // =====================================================

    const botaoTopo = document.querySelector(".botãoinício, .botao-inicio");

    if (botaoTopo) {
        botaoTopo.addEventListener("click", (evento) => {
            evento.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: movimentoReduzido ? "auto" : "smooth"
            });
        });
    }

});