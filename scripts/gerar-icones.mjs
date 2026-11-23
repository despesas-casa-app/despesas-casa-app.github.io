// Gera os ícones PNG do app (casinha branca sobre fundo verde) sem nenhuma dependência externa.
// Uso: npm run gerar-icones   →   grava em public/icones/
//
// O desenho é o mesmo de public/icone.svg. Se mudar um, mude o outro.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const MARCA = [0x0f, 0x76, 0x6e];
const BRANCO = [0xff, 0xff, 0xff];

/** Tabela de CRC32 usada pelo formato PNG. */
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
    for (let x = 0; x < tamanho; x++) {
      const [r, g, b, a] = pixel(x, y);
      linha.set([r, g, b, a], 1 + x * 4);
    }
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

/** Coordenadas no espaço 0–512 do SVG. Devolve a cor do ponto, ou null se for transparente. */
function corNoPonto(u, v, { cantos, escala }) {
  // Para o ícone "maskable", o desenho encolhe para caber na zona segura do Android.
  const c = 256;
  const x = c + (u - c) / escala;
  const y = c + (v - c) / escala;

  if (cantos) {
    const r = 112;
    const dx = Math.max(r - u, 0, u - (512 - r));
    const dy = Math.max(r - v, 0, v - (512 - r));
    if (dx * dx + dy * dy > r * r) return null;
  }

  const porta = x >= 222 && x <= 290 && y >= 292 && y <= 384;
  const paredes = x >= 140 && x <= 372 && y >= 236 && y <= 384;
  // Telhado: triângulo com topo em (256,112) e base de 112 a 400 na altura 236.
  const telhado = y >= 112 && y <= 236 && Math.abs(x - 256) <= ((y - 112) / 124) * 144;
  if (porta) return MARCA;
  if (paredes || telhado) return BRANCO;
  return MARCA;
}

function desenhar(tamanho, opcoes) {
  const amostras = 4; // suaviza as bordas
  return png(tamanho, (px, py) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < amostras; sy++) {
      for (let sx = 0; sx < amostras; sx++) {
        const u = ((px + (sx + 0.5) / amostras) / tamanho) * 512;
        const v = ((py + (sy + 0.5) / amostras) / tamanho) * 512;
        const cor = corNoPonto(u, v, opcoes);
        if (cor) {
          r += cor[0];
          g += cor[1];
          b += cor[2];
          a += 1;
        }
      }
    }
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / amostras ** 2) * 255)];
  });
}

const pasta = new URL('../public/icones/', import.meta.url);
mkdirSync(pasta, { recursive: true });
writeFileSync(new URL('icone-192.png', pasta), desenhar(192, { cantos: true, escala: 1 }));
writeFileSync(new URL('icone-512.png', pasta), desenhar(512, { cantos: true, escala: 1 }));
writeFileSync(new URL('icone-mascara-512.png', pasta), desenhar(512, { cantos: false, escala: 0.8 }));
console.log('Ícones gerados em public/icones/');
