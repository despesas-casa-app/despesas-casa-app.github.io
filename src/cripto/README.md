# Criptografia

Camada isolada de criptografia (especificação, seção 5). Chega na **Fase 2**.

- Usa **só a WebCrypto** nativa do navegador. Nenhuma biblioteca de terceiros.
- Frase-mestra → PBKDF2-SHA256 → KEK; DEK aleatória (AES-256-GCM) embrulhada pela KEK.
- Cada evento: AES-256-GCM, IV aleatório de 96 bits, AAD = id do evento + versão do esquema.
- Testes obrigatórios: ida e volta; chave errada falha; adulterar ciphertext ou AAD falha.
