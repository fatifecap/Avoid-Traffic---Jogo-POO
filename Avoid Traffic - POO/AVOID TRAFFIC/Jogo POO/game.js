//  game.js — Avoid Traffic
//  Conceitos de POO aplicados:
//    - Classes e Objetos  (Mapa, Player, Pedido, Obstacle...)
//    - Herança            (Traffic, Rain, Accident estendem Obstacle)
//    - Polimorfismo       (cada obstáculo implementa aplicarEfeito() diferente)

//  CONFIGURAÇÕES GLOBAIS DO JOGO
//  Constantes e variáveis compartilhadas por todas as classes
const CONFIG = {
  ALTURA_HUD:       44,   // altura em px do painel de informações no topo
  TAMANHO_CELULA:   60,   // tamanho de cada célula do mapa em px
  TEMPO_POR_PEDIDO: 30,   // segundos para entregar cada pedido
  MAX_OBSTACULOS:   14,   // máximo de obstáculos simultâneos na tela
  INTERVALO_SPAWN:  1800, // ms entre spawns de obstáculos
  DIST_MIN_SPAWN:   3,    // distância mínima (em células) para spawnar longe do player
};

// Dimensões do canvas — preenchidas quando o jogo inicia
let LARGURA_CANVAS, ALTURA_CANVAS;

// Instância global do controlador do jogo
let gc;

// Constantes de teclas
const TECLAS_ESQUERDA = ['ArrowLeft', 'a', 'A'];
const TECLAS_DIREITA = ['ArrowRight', 'd', 'D'];
const TECLAS_CIMA = ['ArrowUp', 'w', 'W'];
const TECLAS_BAIXO = ['ArrowDown', 's', 'S'];

//  UTILITÁRIOS
//  Funções pequenas reutilizadas em várias partes do código
/** Retorna um número inteiro aleatório entre min e max (inclusive) */
function intAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Mantém um valor dentro de um intervalo [min, max] */
function clamp(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

/** Calcula a distância de Manhattan (soma das diferenças em X e Y) */
function distanciaManhattan(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** Atualiza o texto de um elemento do HUD pelo seu id */
function atualizarHUD(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto;
}

/** Mostra a tela com o id informado e esconde todas as outras */
function mostrarTela(id) {
  document.querySelectorAll('.screen').forEach(tela => tela.classList.remove('active'));
  const tela = document.getElementById(id);
  if (tela) tela.classList.add('active');
}

/** Desenha um emoji centralizado na posição (cx, cy) com o tamanho dado */
function desenharEmoji(ctx, emoji, tamanho, cx, cy) {
  ctx.save(); // Salva estado do contexto
  ctx.font         = `${tamanho}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha  = 1.0; // Força opacidade máxima
  ctx.fillText(emoji, cx, cy);
  ctx.restore(); // Restaura estado anterior
}

/** Verifica se dois retângulos {x, y, w, h} estão se sobrepondo */
function retangulosColidem(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}


//  CLASSE: Mapa
//  Responsável por gerar e desenhar o grid de ruas e blocos
class Mapa {

  /**
   * @param {number} largura - largura total do canvas em px
   * @param {number} altura  - altura total do canvas em px
   */
  constructor(largura, altura) {
    const CEL  = CONFIG.TAMANHO_CELULA;
    this.cols  = Math.floor(largura / CEL);
    this.rows  = Math.floor(altura  / CEL);
    this.grade = this._gerarGrade(); // matriz 2D: 0 = rua, 1 = bloco
  }

  // ---- Geração do grid ----
  /**
   * Cria a matriz de células do mapa.
   * Ruas horizontais a cada 3 linhas, verticais a cada 3 colunas.
   * Última linha e coluna também são rua (borda livre).
   */
  _gerarGrade() {
    // Começa com tudo bloqueado (1 = bloco verde)
    const grade = Array.from(
      { length: this.rows },
      () => Array(this.cols).fill(1)
    );

    // Abre ruas horizontais a cada 3 linhas
    for (let linha = 0; linha < this.rows; linha += 3) {
      for (let col = 0; col < this.cols; col++) {
        grade[linha][col] = 0; // 0 = rua
      }
    }

    // Abre ruas verticais a cada 3 colunas
    for (let col = 0; col < this.cols; col += 3) {
      for (let linha = 0; linha < this.rows; linha++) {
        grade[linha][col] = 0;
      }
    }

    // Garante borda inferior e direita sempre livres
    for (let col = 0; col < this.cols; col++) grade[this.rows - 1][col] = 0;
    for (let lin = 0; lin < this.rows;  lin++) grade[lin][this.cols - 1] = 0;

    return grade;
  }

  // ---- Consultas ----

  /** Retorna true se a posição em pixels (px, py) cai sobre uma rua */
  eRua(px, py) {
    const CEL   = CONFIG.TAMANHO_CELULA;
    const col   = Math.floor(px / CEL);
    const linha = Math.floor(py / CEL);

    // Fora dos limites do mapa = não é rua
    if (linha < 0 || linha >= this.rows) return false;
    if (col  < 0 || col  >= this.cols)  return false;

    return this.grade[linha][col] === 0;
  }

  /** Retorna {x, y} de uma célula aleatória que seja rua */
  posAleatoriaNaRua() {
    const CEL = CONFIG.TAMANHO_CELULA;
    let x, y;

    do {
      const col   = intAleatorio(0, this.cols - 1);
      const linha = intAleatorio(0, this.rows - 1);
      x = col   * CEL + 2;
      y = linha * CEL + 2;
    } while (!this.eRua(x + CEL / 2, y + CEL / 2));

    return { x, y };
  }

  // ---- Desenho ----

  desenhar(ctx) {
    const CEL = CONFIG.TAMANHO_CELULA;

    for (let linha = 0; linha < this.rows; linha++) {
      for (let col = 0; col < this.cols; col++) {
        const x = col   * CEL;
        const y = linha * CEL;

        if (this.grade[linha][col] === 0) {
          this._desenharRua(ctx, x, y, CEL);
        } else {
          this._desenharBloco(ctx, x, y, CEL);
        }
      }
    }
  }

  _desenharRua(ctx, x, y, cel) {
    ctx.save();
    
    // Fundo de asfalto
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x, y, cel, cel);

    // Linhas pontilhadas centrais (marcação de faixa)
    ctx.strokeStyle = '#666';
    ctx.lineWidth   = 1;
    ctx.setLineDash([8, 8]);

    ctx.beginPath();
    ctx.moveTo(x,           y + cel / 2);
    ctx.lineTo(x + cel,     y + cel / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + cel / 2, y);
    ctx.lineTo(x + cel / 2, y + cel);
    ctx.stroke();

    ctx.setLineDash([]); // reseta o padrão de linha
    ctx.restore();
  }

  _desenharBloco(ctx, x, y, cel) {
    ctx.save();
    
    // Bloco verde (calçada / jardim)
    ctx.fillStyle = '#4a7c59';
    ctx.fillRect(x, y, cel, cel);

    // Detalhe interno mais escuro
    ctx.fillStyle = '#3d6649';
    ctx.fillRect(x + 4, y + 4, cel - 8, cel - 8);

    // Borda do detalhe interno
    ctx.strokeStyle = '#355a3e';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 4, y + 4, cel - 8, cel - 8);
    
    ctx.restore();
  }
}

//  CLASSE: Player
//  Controla o entregador: movimento, vidas e estado
class Player {

  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 40; // largura em px
    this.h = 40; // altura em px

    this.velocidadeBase = 4;
    this.velocidade     = this.velocidadeBase;

    this.vidas           = 3;
    this.invencivel      = false; // evita dano em sequência
    this.timerInvencivel = 0;    // frames restantes de invencibilidade

    this.temPedido = false; // true quando carregando um pedido
    this.emChuva   = false; // true quando sobreposto a um obstáculo Rain

    this.emoji = '🛵';
  }

  // ---- Movimento ----
  /** Move o player com base nas teclas, respeitando o mapa e os limites */
  atualizar(teclas, mapa) {
    const dx = this._calcularDirecaoX(teclas);
    const dy = this._calcularDirecaoY(teclas);

    this._moverX(dx, mapa);
    this._moverY(dy, mapa);
    this._manterDentroDoCanvas();
    this._atualizarInvencibilidade();
  }

  _calcularDirecaoX(teclas) {
    for (const tecla of TECLAS_ESQUERDA) {
      if (teclas[tecla]) return -this.velocidade;
    }
    for (const tecla of TECLAS_DIREITA) {
      if (teclas[tecla]) return this.velocidade;
    }
    return 0;
  }

  _calcularDirecaoY(teclas) {
    for (const tecla of TECLAS_CIMA) {
      if (teclas[tecla]) return -this.velocidade;
    }
    for (const tecla of TECLAS_BAIXO) {
      if (teclas[tecla]) return this.velocidade;
    }
    return 0;
  }

  _moverX(dx, mapa) {
    if (dx === 0) return;
    const novoX = this.x + dx;

    // Checa limites do canvas primeiro
    if (novoX < 0 || novoX + this.w > LARGURA_CANVAS) return;

    // Checa se os dois cantos horizontais da frente ainda estão na rua
    const ladoEsqNaRua   = mapa.eRua(novoX + 4,          this.y + this.h / 2);
    const ladoDirNaRua   = mapa.eRua(novoX + this.w - 4, this.y + this.h / 2);

    if (ladoEsqNaRua && ladoDirNaRua) {
      this.x = novoX;
    }
  }

  _moverY(dy, mapa) {
    if (dy === 0) return;
    const novoY = this.y + dy;

    if (novoY < 0 || novoY + this.h > ALTURA_CANVAS) return;

    const topoNaRua      = mapa.eRua(this.x + this.w / 2, novoY + 4);
    const baseNaRua      = mapa.eRua(this.x + this.w / 2, novoY + this.h - 4);

    if (topoNaRua && baseNaRua) {
      this.y = novoY;
    }
  }

  /** Segurança extra: garante que o player nunca saia do canvas */
  _manterDentroDoCanvas() {
    this.x = clamp(this.x, 0, LARGURA_CANVAS - this.w);
    this.y = clamp(this.y, 0, ALTURA_CANVAS  - this.h);
  }

  _atualizarInvencibilidade() {
    if (!this.invencivel) return;
    this.timerInvencivel--;
    if (this.timerInvencivel <= 0) this.invencivel = false;
  }

  // ---- Vida e efeitos ----

  resetarVelocidade() {
    this.velocidade = this.velocidadeBase;
  }

  aplicarLentidaoDaChuva() {
    this.velocidade = this.velocidadeBase * 0.7;
  }

  perderVida() {
    if (this.invencivel) return; // ignora dano durante o período de proteção
    this.vidas--;
    this.invencivel      = true;
    this.timerInvencivel = 90; // ~1.5 segundos de proteção (a 60fps)
  }

  // ---- Desenho ----

  desenhar(ctx) {
    // Pisca enquanto invencível (some a cada 10 frames)
    const piscando = this.invencivel && Math.floor(this.timerInvencivel / 10) % 2 === 0;
    if (piscando) return;

    ctx.save();
    ctx.globalAlpha = 1.0; // Força opacidade máxima
    
    // Desenha o emoji do entregador
    desenharEmoji(ctx, this.emoji, this.w, this.x + this.w / 2, this.y + this.h / 2);

    // Mostra a caixinha de pedido acima quando carregando
    if (this.temPedido) {
      ctx.font         = '22px serif';
      ctx.textBaseline = 'bottom';
      ctx.textAlign    = 'center';
      ctx.fillText('📦', this.x + this.w / 2, this.y);
    }
    
    ctx.restore();
  }
}


//  CLASSE BASE: Obstacle
//  Define a interface comum de todos os obstáculos.
//  Herança: Traffic, Rain e Accident estendem esta classe.
class Obstacle {

  constructor(x, y) {
    this.x     = x;
    this.y     = y;
    this.w     = CONFIG.TAMANHO_CELULA;
    this.h     = CONFIG.TAMANHO_CELULA;
    this.ativo = true; // false = será removido da lista no próximo frame
  }

  /**
   * POLIMORFISMO: cada subclasse sobrescreve este método
   * para aplicar um efeito diferente no player ao colidir.
   */
  aplicarEfeito(player) {
    // Implementado pelas subclasses
  }

  /** Verifica colisão com o player usando AABB (retângulos alinhados) */
  colideCom(player) {
    return retangulosColidem(this, player);
  }

  desenhar(ctx) {
    // Implementado pelas subclasses
  }
}


//  SUBCLASSE: Traffic extends Obstacle  — HERANÇA
//  Carro que se move pelas ruas e tira vida ao colidir
class Traffic extends Obstacle {

 constructor(x, y) {
    super(x, y);
    this.w         = CONFIG.TAMANHO_CELULA - 4;
    this.h         = CONFIG.TAMANHO_CELULA - 4;
    this.direcao   = Math.random() < 0.5 ? 'horizontal' : 'vertical';
    this.velocidade = (Math.random() < 0.5 ? 2 : 3);
    this.colidiuNeste = false; 
  }

  // ---- Movimento ----

  atualizar(mapa) {
    if (this.direcao === 'horizontal') {
      this._moverHorizontal(mapa);
    } else {
      this._moverVertical(mapa);
    }

    // Impede que o carro saia dos limites do canvas
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);

    this.x = clamp(this.x, 0, LARGURA_CANVAS - this.w);
    this.y = clamp(this.y, 0, ALTURA_CANVAS  - this.h);
  }

  _moverHorizontal(mapa) {
    this.x += this.velocidade;

    // Ponto à frente do carro (com margem de 2px para detecção antecipada)
    const frenteX    = this.velocidade > 0 ? this.x + this.w + 2 : this.x - 2;
    const meioY      = this.y + this.h / 2;
    const bateNaBorda  = this.x + this.w > LARGURA_CANVAS || this.x < 0;
    const bateNaParede = !mapa.eRua(frenteX, meioY);

    if (bateNaBorda || bateNaParede) {
      this.velocidade *= -1;         // inverte a direção
      this.x += this.velocidade * 2; // afasta da parede para não ficar preso
    }
  }

  _moverVertical(mapa) {
    this.y += this.velocidade;

    const meioX      = this.x + this.w / 2;
    const frenteY    = this.velocidade > 0 ? this.y + this.h + 2 : this.y - 2;
    const bateNaBorda  = this.y + this.h > ALTURA_CANVAS || this.y < 0;
    const bateNaParede = !mapa.eRua(meioX, frenteY);

    if (bateNaBorda || bateNaParede) {
      this.velocidade *= -1;
      this.y += this.velocidade * 2;;
    }
  }

  // ---- Efeito — POLIMORFISMO ----

  /** Tira uma vida e empurra o player para fora do carro */
  aplicarEfeito(player) {
    if (this.colidiuNeste) return;
    this.colidiuNeste = true;

    player.perderVida();
    this._empurrarPlayer(player);
  }

  _empurrarPlayer(player) {
    // Calcula a sobreposição em cada eixo
    const sobrepostoX = Math.min(player.x + player.w - this.x, this.x + this.w - player.x);
    const sobrepostoY = Math.min(player.y + player.h - this.y, this.y + this.h - player.y);

    // Empurra pelo eixo com menor sobreposição (caminho mais curto para fora)
    if (sobrepostoX < sobrepostoY) {
      player.x = Math.round(player.x + (player.x < this.x ? -sobrepostoX - 2 : sobrepostoX + 2));
    } else {
      player.y = Math.round(player.y + (player.y < this.y ? -sobrepostoY - 2 : sobrepostoY + 2));
    }

    // Garante que o empurrão não jogue o player pra fora do canvas
    player.x = clamp(player.x, 0, LARGURA_CANVAS - player.w);
    player.y = clamp(player.y, 0, ALTURA_CANVAS  - player.h);
  }

  // ---- Desenho ----

  desenhar(ctx) {
    ctx.font = '40px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚗', Math.round(this.x + this.w / 2), Math.round(this.y + this.h / 2));
  }
}

//  SUBCLASSE: Rain extends Obstacle  — HERANÇA
//  Área de chuva que reduz a velocidade enquanto o player estiver dentro
class Rain extends Obstacle {

  constructor(x, y) {
    super(x, y);
    this.w       = CONFIG.TAMANHO_CELULA * 2;
    this.h       = CONFIG.TAMANHO_CELULA * 2;
    this.duracao = 350; // frames até sumir (~5.8s a 60fps)

    // Gera as gotas com posições e velocidades iniciais aleatórias
    this.gotas = Array.from({ length: 30 }, () => ({
      x:  Math.random() * this.w,
      y:  Math.random() * this.h,
      vy: 3 + Math.random() * 3, // velocidade vertical de cada gota
    }));
  }

  // ---- Ciclo de vida ----

  atualizar() {
    this.duracao--;
    if (this.duracao <= 0) {
      this.ativo = false; // marca para ser removido
      return;
    }
    this._animarGotas();
  }

  _animarGotas() {
    for (const gota of this.gotas) {
      gota.y += gota.vy;
      if (gota.y > this.h) {
        // Quando a gota sai pela base, volta ao topo em posição aleatória
        gota.y = 0;
        gota.x = Math.random() * this.w;
      }
    }
  }

  // ---- Efeito — POLIMORFISMO ----

  /**
   * Sinaliza que o player está na chuva.
   * A velocidade é reduzida no GameController após todas as colisões do frame.
   */
  aplicarEfeito(player) {
    player.emChuva = true;
  }

  // ---- Desenho ----

  desenhar(ctx) {
    ctx.save();
    ctx.globalAlpha = 1.0; // Força opacidade máxima
    
    // Fundo azulado semitransparente
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgb(80, 140, 210)';
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // Borda tracejada
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.5)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(this.x, this.y, this.w, this.h);
    ctx.setLineDash([]);

    // Desenha cada gota de chuva como uma linha curta inclinada
    ctx.strokeStyle = 'rgba(180, 220, 255, 0.7)';
    ctx.lineWidth   = 1;
    const baseX = this.x;
    const baseY = this.y;
    for (const gota of this.gotas) {
      ctx.beginPath();
      ctx.moveTo(baseX + gota.x,     baseY + gota.y);
      ctx.lineTo(baseX + gota.x - 2, baseY + gota.y + 7);
      ctx.stroke();
    }

    // Ícone no canto superior esquerdo
    ctx.globalAlpha = 1.0;
    ctx.font         = '18px serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🌧️', this.x + 2, this.y + 2);
    
    ctx.restore();
  }
}


//  SUBCLASSE: Accident extends Obstacle  — HERANÇA
//  Zona de acidente estática que tira vida ao tocar
class Accident extends Obstacle {

  constructor(x, y) {
    super(x, y);
    this.w       = CONFIG.TAMANHO_CELULA * 2;
    this.h       = CONFIG.TAMANHO_CELULA;
    this.duracao = 450; // frames até sumir (~7.5s a 60fps)
  }

  atualizar() {
    this.duracao--;
    if (this.duracao <= 0) this.ativo = false;
  }

  // ---- Efeito — POLIMORFISMO ----

  /** Remove uma vida do player */
  aplicarEfeito(player) {
    player.perderVida();
  }

  // ---- Desenho ----

  desenhar(ctx) {
    ctx.save();
    ctx.globalAlpha = 1.0; // Força opacidade máxima
    
    // Fundo vermelho semitransparente
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgb(220, 50, 50)';
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // Borda tracejada vermelha
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(this.x, this.y, this.w, this.h);
    ctx.setLineDash([]);

    // Ícones centralizados na área do acidente
    ctx.font         = '26px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚧', this.x + this.w / 2 - 14, this.y + this.h / 2);
    ctx.fillText('⚠️', this.x + this.w / 2 + 14, this.y + this.h / 2);
    
    ctx.restore();
  }
}

//  CLASSE: Pedido
//  Gerencia o ciclo de coleta e entrega de um pedido
class Pedido {

  /**
   * @param {number} ox, oy - posição de coleta (origem)
   * @param {number} dx, dy - posição de entrega (destino)
   */
  constructor(ox, oy, dx, dy) {
    this.origem   = { x: ox, y: oy };
    this.destino  = { x: dx, y: dy };
    this.tamanho  = CONFIG.TAMANHO_CELULA - 6;
    this.coletado = false;
  }

  // ---- Verificações de contato ----

  /** True se o player está tocando a origem e ainda não coletou */
  naOrigem(player) {
    return !this.coletado && this._tocaPonto(player, this.origem);
  }

  /** True se o player está tocando o destino e já coletou */
  noDestino(player) {
    return this.coletado && this._tocaPonto(player, this.destino);
  }

  _tocaPonto(player, ponto) {
    return retangulosColidem(player, {
      x: ponto.x, y: ponto.y,
      w: this.tamanho, h: this.tamanho,
    });
  }

  // ---- Desenho ----

  desenhar(ctx) {
    ctx.save();
    ctx.globalAlpha = 1.0; // Força opacidade máxima
    
    if (!this.coletado) {
      this._desenharMarcador(ctx, this.origem, '#f1c40f', '📦', 'COLETA');
    }
    this._desenharMarcador(ctx, this.destino, '#2ecc71', '🏠', 'ENTREGA');
    
    ctx.restore();
  }

  /** Desenha um marcador (caixa colorida + emoji + rótulo) em uma posição */
  _desenharMarcador(ctx, ponto, cor, emoji, rotulo) {
    const { x, y } = ponto;
    const tam = this.tamanho;

    // Caixa colorida com borda
    ctx.fillStyle   = cor;
    ctx.fillRect(x, y, tam, tam);
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 2;
    ctx.strokeRect(x, y, tam, tam);

    // Emoji centralizado na caixa
    desenharEmoji(ctx, emoji, tam - 8, x + tam / 2, y + tam / 2);

    // Rótulo de texto acima da caixa
    ctx.fillStyle    = '#fff';
    ctx.font         = 'bold 10px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(rotulo, x + tam / 2, y - 6);
  }
}


//  CLASSE: GameController
//  Orquestra todos os elementos: loop principal, timers e HUD
class GameController {

  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');

    this._configurarCanvas();
    this._configurarTeclas();

    this.mapa       = new Mapa(LARGURA_CANVAS, ALTURA_CANVAS);
    this.player     = null;
    this.pedido     = null;
    this.obstaculos = [];

    this.pontos        = 0;
    this.tempoRestante = CONFIG.TEMPO_POR_PEDIDO;
    this.rodando       = false;

    // Guarda os IDs para cancelar timers e animação ao destruir
    this._idAnimacao = null;
    this._idTimer    = null;
    this._idSpawn    = null;
  }

  // ---- Configuração ----

  _configurarCanvas() {
    LARGURA_CANVAS         = window.innerWidth;
    ALTURA_CANVAS          = window.innerHeight - CONFIG.ALTURA_HUD;
    this.canvas.width      = LARGURA_CANVAS;
    this.canvas.height     = ALTURA_CANVAS;
  }

  _configurarTeclas() {
    this.teclas = {};

    // As funções são salvas para poder removê-las no destruir()
    this._aoApertarTecla = e => {
      this.teclas[e.key] = true;
      // Impede que as setas façam scroll na página
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    };
    this._aoSoltarTecla = e => { this.teclas[e.key] = false; };

    document.addEventListener('keydown', this._aoApertarTecla);
    document.addEventListener('keyup',   this._aoSoltarTecla);
  }

  // ---- Início ----

  iniciar() {
    const posInicial   = this.mapa.posAleatoriaNaRua();
    this.player        = new Player(posInicial.x, posInicial.y);
    this.obstaculos    = [];
    this.pontos        = 0;
    this.tempoRestante = CONFIG.TEMPO_POR_PEDIDO;
    this.rodando       = true;
    this.teclas        = {};

    this._criarPedido();
    this._iniciarTimer();
    this._iniciarSpawnDeObstaculos();
    this._loop();
  }

  /** Para o jogo e libera todos os recursos (timers, eventos, animação) */
  destruir() {
    this.rodando = false;
    clearInterval(this._idTimer);
    clearInterval(this._idSpawn);
    cancelAnimationFrame(this._idAnimacao);
    document.removeEventListener('keydown', this._aoApertarTecla);
    document.removeEventListener('keyup',   this._aoSoltarTecla);
  }

  // ---- Timers ----

  _iniciarTimer() {
    clearInterval(this._idTimer);
    this._idTimer = setInterval(() => {
      if (!this.rodando) return;
      this.tempoRestante--;
      atualizarHUD('hudTempo', this.tempoRestante); // atualiza HUD imediatamente
      if (this.tempoRestante <= 0) this._gameOver('⏱️ Tempo esgotado!');
    }, 1000);
  }

  _iniciarSpawnDeObstaculos() {
    clearInterval(this._idSpawn);
    this._idSpawn = setInterval(() => {
      if (this.rodando) this._spawnarObstaculo();
    }, CONFIG.INTERVALO_SPAWN);
  }

  // ---- Loop principal ----

  _loop() {
    if (!this.rodando) return;
    this._atualizar();
    this._desenhar();
    this._idAnimacao = requestAnimationFrame(() => this._loop());
  }

  // ---- Atualização (lógica do jogo) ----

  _atualizar() {
    this.player.emChuva = false; // reseta flag antes de checar colisões do frame

    this._removerObstaculosInativos();
    this._atualizarObstaculos();
    this._aplicarVelocidadeDoPlayer();
    this.player.atualizar(this.teclas, this.mapa);
    this._verificarPedido();
    this._verificarGameOver();
    this._atualizarHUD();
  }

  _removerObstaculosInativos() {
    // Remove obstáculos inativos sem criar novo array
    let idx = 0;
    for (let i = 0; i < this.obstaculos.length; i++) {
      if (this.obstaculos[i].ativo) {
        this.obstaculos[idx++] = this.obstaculos[i];
      }
    }
    this.obstaculos.length = idx;
  }

  _atualizarObstaculos() {
    const lenObs = this.obstaculos.length;
    for (let i = 0; i < lenObs; i++) {
      const obs = this.obstaculos[i];
      
      // Traffic precisa do mapa para não atravessar blocos
      if (obs instanceof Traffic) obs.atualizar(this.mapa);
      else                        obs.atualizar();

      // Early exit: pula se não colidiu
      if (!obs.colideCom(this.player)) continue;
      
      // POLIMORFISMO: ao colidir, cada obstáculo aplica seu próprio efeito
      obs.aplicarEfeito(this.player);
    }
  }

  /** Define a velocidade do player com base em se está ou não na chuva */
  _aplicarVelocidadeDoPlayer() {
    if (this.player.emChuva) {
      this.player.aplicarLentidaoDaChuva();
    } else {
      this.player.resetarVelocidade();
    }
  }

  _verificarPedido() {
    if (!this.pedido) return;

    // Coleta o pedido ao chegar na origem
    if (this.pedido.naOrigem(this.player)) {
      this.pedido.coletado  = true;
      this.player.temPedido = true;
      this._setarStatus('📦 Pedido coletado! Vá ao destino!');
    }

    // Conclui a entrega ao chegar no destino com o pedido
    if (this.pedido.noDestino(this.player)) {
      this._concluirEntrega();
    }
  }

  _concluirEntrega() {
    this.player.temPedido = false;

    // Pontuação proporcional ao tempo restante
    const bonus = Math.max(10, this.tempoRestante * 6);
    this.pontos += bonus;
    this._setarStatus(`✅ Entregue! +${bonus}pts`);

    // Reinicia o timer e cria um novo pedido
    this.tempoRestante = CONFIG.TEMPO_POR_PEDIDO;
    atualizarHUD('hudTempo', this.tempoRestante);
    this._criarPedido();
  }

  _verificarGameOver() {
    if (this.player.vidas <= 0) this._gameOver('💀 Sem vidas!');
  }

  _atualizarHUD() {
    atualizarHUD('hudPontos', this.pontos);
    atualizarHUD('hudVidas',  '❤️'.repeat(Math.max(0, this.player.vidas)));
  }

  // ---- Geração de conteúdo ----

  _criarPedido() {
    const origem = this.mapa.posAleatoriaNaRua();
    let destino;

    // Garante distância mínima entre origem e destino
    do {
      destino = this.mapa.posAleatoriaNaRua();
    } while (distanciaManhattan(origem.x, origem.y, destino.x, destino.y) < CONFIG.TAMANHO_CELULA * 5);

    this.pedido = new Pedido(origem.x, origem.y, destino.x, destino.y);
    this._setarStatus('📦 Buscar pedido!');
  }

  _spawnarObstaculo() {
    const totalAtivos = this.obstaculos.length; // já removeu inativos
    if (totalAtivos >= CONFIG.MAX_OBSTACULOS) return;

    const pos    = this._posicaoLongeDoPlayer();
    const tipos  = [Rain, Traffic, Accident];
    const Classe = tipos[intAleatorio(0, tipos.length - 1)];
    this.obstaculos.push(new Classe(pos.x, pos.y));
  }

  /** Retorna uma posição na rua que esteja longe o suficiente do player */
  _posicaoLongeDoPlayer() {
    const distMinima = CONFIG.TAMANHO_CELULA * CONFIG.DIST_MIN_SPAWN;
    let pos;
    let tentativas = 0;
    const playerX = this.player.x;
    const playerY = this.player.y;

    do {
      pos = this.mapa.posAleatoriaNaRua();
      tentativas++;
    } while (
      tentativas < 20 &&
      distanciaManhattan(pos.x, pos.y, playerX, playerY) < distMinima
    );

    return pos;
  }

  // ---- Desenho ----

  _desenhar() {
    this.ctx.save();
    this.ctx.globalAlpha = 1.0; // Garante opacidade máxima no início
    
    this.ctx.clearRect(0, 0, LARGURA_CANVAS, ALTURA_CANVAS);
    this.mapa.desenhar(this.ctx);
    if (this.pedido) this.pedido.desenhar(this.ctx);
    
    const lenObs = this.obstaculos.length;
    for (let i = 0; i < lenObs; i++) {
      this.obstaculos[i].desenhar(this.ctx);
    }
    
    this.player.desenhar(this.ctx);
    
    this.ctx.restore();
  }

  // ---- Auxiliares ----

  _setarStatus(texto) {
    const el = document.getElementById('hudStatus');
    if (el) el.textContent = texto;
  }

  _gameOver(motivo) {
    this.destruir(); // limpa tudo antes de mostrar a tela de fim
    const finalScore = document.getElementById('finalScore');
    if (finalScore) {
      finalScore.innerHTML =
        `${motivo}<br>⭐ Pontuação final: <strong>${this.pontos}</strong>`;
    }
    mostrarTela('gameOverScreen');
  }

  // No método _atualizar():
_atualizar() {
  this.player.emChuva = false; // reseta flag ANTES de checar colisões
  
  this._removerObstaculosInativos();
  this._atualizarObstaculos();
  
  // NOVO: Aplicar velocidade ANTES de mover
  this._aplicarVelocidadeDoPlayer();
  
  this.player.atualizar(this.teclas, this.mapa);
  this._verificarPedido();
  this._verificarGameOver();
  this._atualizarHUD();
}

// Melhorar this método:
_aplicarVelocidadeDoPlayer() {
  // Verifica colisão com chuva ANTES de mover
  for (const obs of this.obstaculos) {
    if (obs instanceof Rain && obs.colideCom(this.player)) {
      this.player.emChuva = true;
      break; // já detectou, pode parar
    }
  }

  // Aplica a velocidade correta
  if (this.player.emChuva) {
    this.player.aplicarLentidaoDaChuva();
  } else {
    this.player.resetarVelocidade();
  }
}

}


//  FUNÇÕES GLOBAIS — chamadas diretamente pelo HTML
function iniciarJogo() {
  mostrarTela('gameScreen');
  gc = new GameController();
  gc.iniciar();
}

function reiniciarJogo() {
  if (gc) gc.destruir(); // encerra o jogo atual antes de voltar ao menu
  mostrarTela('menuScreen');
}
