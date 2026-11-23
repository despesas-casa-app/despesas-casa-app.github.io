# Armazenamento remoto

Uma **interface** única (a "tomada padrão") para guardar e ler o log de eventos, com duas
implementações que se encaixam nela:

- **Memória/local**: para os testes e para o modo demonstração (**Fase 1**);
- **Google Sheets**: a planilha do casal, só com eventos já criptografados (**Fase 3**).

O resto do app só conhece a interface, nunca a implementação.
