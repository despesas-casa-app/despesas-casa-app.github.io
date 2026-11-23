// Gera os ícones PNG do app "Viver Gasta" — azulejos amarelos esmaltados com rejunte claro —
// sem nenhuma dependência externa.
// Uso: npm run gerar-icones   →   grava em public/icones/
//
// O desenho é o mesmo de public/icone.svg. Se mudar um, mude o outro.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------------------------
// Desenho (coordenadas no espaço 0–512, iguais às do SVG)
// ---------------------------------------------------------------------------------------------

const REJUNTE = [0xff, 0xfc, 0xf4];
// Cor principal do app: #F8D588 (no meio do azulejo), com degradê suave de esmalte.
const AZULEJO_TOPO = [0xfb, 0xe3, 0xae];
const AZULEJO_BASE = [0xf4, 0xc7, 0x6b];
const RAIO_ICONE = 104;
/** Margem externa maior que o rejunte interno, para os azulejos dos cantos não serem cortados. */
const MARGEM = 26;
const REJUNTE_LARGURA = 14;
const AZULEJOS_POR_LADO = 3;
const LADO_AZULEJO = (512 - 2 * MARGEM - REJUNTE_LARGURA * (AZULEJOS_POR_LADO - 1)) / AZULEJOS_POR_LADO; // 144
const RAIO_AZULEJO = 20;
const BISEL = 10;
/** Pequenas variações de tom entre os azulejos, como em uma parede de verdade. */
const VARIACAO = [0, 6, -4, -6, 2, 5, 4, -3, 0];

const misturar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v) => Math.max(0, Math.min(255, v));

/** Distância "para dentro" de um retângulo arredondado (negativa = fora). */
function distanciaDentro(x, y, x0, y0, lado, raio) {
  const cx = Math.min(Math.max(x, x0 + raio), x0 + lado - raio);
  const cy = Math.min(Math.max(y, y0 + raio), y0 + lado - raio);
  const dx = x - cx;
  const dy = y - cy;
  const fora = Math.hypot(dx, dy);
  if (x >= x0 + raio && x <= x0 + lado - raio) {
    return Math.min(y - y0, y0 + lado - y);
  }
  if (y >= y0 + raio && y <= y0 + lado - raio) {
    return Math.min(x - x0, x0 + lado - x);
  }
  return raio - fora;
}

function corDoAzulejo(x, y) {
  for (let linha = 0; linha < AZULEJOS_POR_LADO; linha++) {
    for (let coluna = 0; coluna < AZULEJOS_POR_LADO; coluna++) {
      const x0 = MARGEM + coluna * (LADO_AZULEJO + REJUNTE_LARGURA);
      const y0 = MARGEM + linha * (LADO_AZULEJO + REJUNTE_LARGURA);
      if (x < x0 || x > x0 + LADO_AZULEJO || y < y0 || y > y0 + LADO_AZULEJO) continue;
      const dentro = distanciaDentro(x, y, x0, y0, LADO_AZULEJO, RAIO_AZULEJO);
      if (dentro < 0) return null;

      // Degradê vertical do esmalte.
      const t = (y - y0) / LADO_AZULEJO;
      let cor = misturar(AZULEJO_TOPO, AZULEJO_BASE, t);
      const ajuste = VARIACAO[linha * AZULEJOS_POR_LADO + coluna] ?? 0;
      cor = cor.map((v) => v + ajuste * 0.6);

      // Bisel: borda de cima/esquerda mais clara, de baixo/direita mais escura.
      if (dentro < BISEL) {
        const forca = 1 - dentro / BISEL;
        const luz = (x0 + LADO_AZULEJO - x + (y0 + LADO_AZULEJO - y)) / (2 * LADO_AZULEJO); // 1 no canto sup. esq.
        cor = luz > 0.5
          ? misturar(cor, [255, 255, 255], forca * 0.45)
          : misturar(cor, [0xc4, 0x93, 0x3c], forca * 0.4);
      }

      // Reflexo do esmalte: faixa diagonal suave no alto do azulejo.
      const u = (x - x0) / LADO_AZULEJO;
      const diagonal = u + t;
      if (diagonal > 0.35 && diagonal < 0.62 && t < 0.55) {
        const meio = Math.abs(diagonal - 0.485) / 0.135; // 0 no centro da faixa
        cor = misturar(cor, [255, 255, 255], (1 - meio) * 0.28);
      }
      return cor.map(clamp);
    }
  }
  return null;
}

/** Devolve a cor do ponto, ou null se for transparente. */
function corNoPonto(u, v, { cantos }) {
  if (cantos) {
    const r = RAIO_ICONE;
    const dx = Math.max(r - u, 0, u - (512 - r));
    const dy = Math.max(r - v, 0, v - (512 - r));
    if (dx * dx + dy * dy > r * r) return null;
  }
  return corDoAzulejo(u, v) ?? REJUNTE;
}

// ---------------------------------------------------------------------------------------------
// Formato PNG
// ---------------------------------------------------------------------------------------------

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const tipoEDados = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipoEDados));
  return Buffer.concat([tamanho, tipoEDados, crc]);
}

function png(tamanho, pixel) {
  const linhas = [];
  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 4);
    for (let x = 0; x < tamanho; x++) linha.set(pixel(x, y), 1 + x * 4);
    linhas.push(linha);
  }
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(tamanho, 0);
  cabecalho.writeUInt32BE(tamanho, 4);
  cabecalho.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

function desenhar(tamanho, opcoes) {
  const amostras = 4; // suaviza as bordas
  return png(tamanho, (px, py) => {
    const soma = [0, 0, 0];
    let cobertos = 0;
    for (let sy = 0; sy < amostras; sy++) {
      for (let sx = 0; sx < amostras; sx++) {
        const u = ((px + (sx + 0.5) / amostras) / tamanho) * 512;
        const v = ((py + (sy + 0.5) / amostras) / tamanho) * 512;
        const cor = corNoPonto(u, v, opcoes);
        if (!cor) continue;
        soma[0] += cor[0];
        soma[1] += cor[1];
        soma[2] += cor[2];
        cobertos += 1;
      }
    }
    if (cobertos === 0) return [0, 0, 0, 0];
    return [...soma.map((v) => Math.round(v / cobertos)), Math.round((cobertos / amostras ** 2) * 255)];
  });
}

const pasta = new URL('../public/icones/', import.meta.url);
mkdirSync(pasta, { recursive: true });
writeFileSync(new URL('icone-192.png', pasta), desenhar(192, { cantos: true }));
writeFileSync(new URL('icone-512.png', pasta), desenhar(512, { cantos: true }));
// "Maskable": o Android recorta no formato que quiser; o padrão de azulejos ocupa tudo.
writeFileSync(new URL('icone-mascara-512.png', pasta), desenhar(512, { cantos: false }));
console.log('Ícones gerados em public/icones/');
