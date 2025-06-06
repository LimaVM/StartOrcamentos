# Start Orçamentos - PWA

Um aplicativo web progressivo (PWA) moderno para criação e gerenciamento de orçamentos, desenvolvido para a Start do Brasil.

## Características

- Design moderno e responsivo para qualquer dispositivo
- Cadastro de produtos com imagens
- Criação de orçamentos personalizados
- Múltiplos templates de orçamento
- Geração de PDF para download e compartilhamento
- Funcionamento offline
- Interface intuitiva e amigável

## Tecnologias Utilizadas

- HTML5, CSS3 e JavaScript moderno
- Express.js para o backend
- Armazenamento de dados em JSON
- Geração de PDF com Puppeteer
- Service Worker para funcionalidades offline
- Design responsivo com Flexbox e CSS Grid

## Estrutura do Projeto

```
orcamento-pwa/
├── data/                  # Armazenamento de dados JSON
│   ├── orcamentos.json    # Dados dos orçamentos
│   └── produtos.json      # Dados dos produtos
├── public/                # Arquivos estáticos
│   ├── css/               # Estilos CSS
│   ├── images/            # Imagens e ícones
│   ├── js/                # Scripts JavaScript
│   ├── pdfs/              # PDFs gerados
│   ├── index.html         # Página principal
│   ├── manifest.json      # Manifest para PWA
│   └── service-worker.js  # Service Worker para PWA
├── templates/             # Templates HTML para orçamentos
├── server.js              # Servidor Express
└── package.json           # Dependências do projeto
```

## Variáveis de Template

O arquivo `variaveis_template.txt` contém todas as variáveis disponíveis para uso nos templates de orçamento:

- `$id` - Identificador único do orçamento (código alfanumérico de 5 caracteres)
- `$nomedocliente` - Nome do cliente
- `$enderecocliente` - Endereço do cliente
- `$telefonecliente` - Telefone do cliente
- `$emailcliente` - Email do cliente
- `$dataorcamento` - Data de criação do orçamento
- `$observacoes` - Observações adicionais
- `$valortotal` - Valor total do orçamento
- `$tabelaprodutos` - Tabela HTML com os produtos do orçamento

## Instalação e Execução

1. Clone o repositório
2. Instale as dependências:
   ```
   npm install
   ```
3. Inicie o servidor:
   ```
   npm start
   ```
4. O servidor escuta nas portas 80 e 443 (HTTPS). Acesse em `https://seu_dominio`

## Responsividade

O aplicativo é 100% responsivo e otimizado para:
- Smartphones (telas menores que 640px)
- Tablets (telas entre 640px e 1024px)
- Desktops (telas maiores que 1024px)

## Melhorias Implementadas

- Design moderno com microinterações e animações suaves
- Interface totalmente responsiva para qualquer dispositivo
- Navegação inferior para dispositivos móveis
- Integração da logo da Start em todos os elementos principais
- Paleta de cores moderna e consistente
- Tipografia mais legível com a fonte Inter
- Cards elevados com efeitos de hover
- Formulários mais intuitivos com feedback visual
- Modais redesenhados com animações fluidas
- Página "Sobre" com layout mais profissional
- Dados em cache na memória para respostas mais rápidas
- Instância única do Puppeteer reutilizada para gerar PDFs

## Licença

© 2025 Start do Brasil - Todos os direitos reservados
