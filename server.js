/**
 * Servidor Node.js para o PWA de Orçamentos
 * 
 * Este servidor fornece uma API RESTful para gerenciar produtos, templates e orçamentos,
 * além de servir os arquivos estáticos do frontend.
 * Geração de PDF agora é feita 100% em Node.js usando Puppeteer e EJS.
 * 
 * @author Manus
 * @version 2.3.0 - Margens PDF reduzidas, otimização layout.
 */

// Importação de módulos necessários
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");
const ejs = require("ejs"); // Template engine
const puppeteer = require("puppeteer"); // PDF generation - Garante que está usando o pacote completo
const app = express();

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      timeout: 120000,
    });
    console.log(`Puppeteer iniciado. Versão: ${await browserInstance.version()}`);
  }
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
      console.log("Puppeteer fechado.");
    } catch (err) {
      console.error("Erro ao fechar Puppeteer:", err);
    }
    browserInstance = null;
  }
}

process.on("exit", () => {
  closeBrowser().catch(() => {});
});
process.on("SIGINT", () => {
  closeBrowser().finally(() => process.exit(0));
});

// Configuração do middleware para processar JSON e dados de formulário
app.use(express.json({ limit: "100mb" })); // Aumenta limite para JSON (Base64)
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Configuração para servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, "public")));

// Configuração do multer para upload de imagens EM MEMÓRIA
const memoryStorage = multer.memoryStorage();

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Apenas imagens são permitidas!"), false);
  }
};

const upload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // Limite de 100MB
  },
});

// Cria as pastas necessárias se não existirem
async function criarPastasNecessarias() {
  try {
    await fs.mkdir(path.join(__dirname, "public", "pdfs"), { recursive: true });
    console.log("Pasta de PDFs criada ou já existente");

    await fs.mkdir(path.join(__dirname, "data"), { recursive: true });
    console.log("Pasta de dados criada ou já existente");

    // Cria arquivos JSON vazios se não existirem
    const produtosPath = path.join(__dirname, "data", "produtos.json");
    const orcamentosPath = path.join(__dirname, "data", "orcamentos.json");
    try {
      await fs.access(produtosPath);
    } catch {
      await fs.writeFile(produtosPath, "[]", "utf8");
      console.log("Arquivo produtos.json criado.");
    }
    try {
      await fs.access(orcamentosPath);
    } catch {
      await fs.writeFile(orcamentosPath, "[]", "utf8");
      console.log("Arquivo orcamentos.json criado.");
    }
  } catch (error) {
    console.error("Erro ao criar pastas/arquivos necessários:", error);
  }
}

criarPastasNecessarias();

// --- Funções Auxiliares --- //
const jsonCache = {};

async function lerArquivoJSON(filePath) {
  if (jsonCache[filePath]) {
    return jsonCache[filePath];
  }
  try {
    const data = await fs.readFile(filePath, "utf8");
    jsonCache[filePath] = JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Arquivo ${filePath} não encontrado, retornando array vazio.`);
      jsonCache[filePath] = [];
    } else {
      console.error(`Erro ao ler arquivo ${filePath}:`, error);
      throw new Error(`Falha ao ler arquivo JSON: ${filePath}`); // Lança erro para ser tratado
    }
  }
  return jsonCache[filePath];
}

async function escreverArquivoJSON(filePath, data) {
  jsonCache[filePath] = data;
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error(`Erro ao escrever arquivo ${filePath}:`, error);
    throw new Error(`Falha ao escrever arquivo JSON: ${filePath}`); // Lança erro
  }
}

const formatarData = (data) => {
  if (!data) return "";
  try {
    const dateObj = new Date(data);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (e) {
    return "";
  }
};

const formatarMoeda = (valor) => {
  const numValor = Number(valor);
  if (isNaN(numValor)) return "R$ 0,00";
  return numValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// --- Rotas para Produtos --- //
app.get("/api/produtos", async (req, res, next) => {
  try {
    const produtos = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    res.json(produtos);
  } catch (error) {
    next(error); // Passa o erro para o middleware
  }
});

app.get("/api/produtos/:id", async (req, res, next) => {
  try {
    const produtos = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    const produto = produtos.find((p) => p.id === req.params.id);
    if (!produto) {
      return res.status(404).json({ erro: "Produto não encontrado" });
    }
    res.json(produto);
  } catch (error) {
    next(error);
  }
});

app.post("/api/produtos", upload.single("foto"), async (req, res, next) => {
  try {
    const { nanoid } = await import("nanoid");
    const { nome, valor, descricao } = req.body;
    if (!nome || !valor) {
      return res.status(400).json({ erro: "Nome e valor são obrigatórios" });
    }
    let fotoBase64 = null;
    if (req.file) {
      fotoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }
    const produtos = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    const novoProduto = {
      id: nanoid(10),
      nome,
      descricao: descricao || "",
      valor: parseFloat(valor),
      foto: fotoBase64,
      dataCriacao: new Date().toISOString(),
    };
    produtos.push(novoProduto);
    await escreverArquivoJSON(path.join(__dirname, "data", "produtos.json"), produtos);
    const { foto, ...produtoSemFoto } = novoProduto;
    res.status(201).json(produtoSemFoto);
  } catch (error) {
    next(error);
  }
});

app.put("/api/produtos/:id", upload.single("foto"), async (req, res, next) => {
  try {
    const { nome, valor, descricao } = req.body;
    const produtoId = req.params.id;
    const produtos = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    const index = produtos.findIndex((p) => p.id === produtoId);
    if (index === -1) {
      return res.status(404).json({ erro: "Produto não encontrado" });
    }
    const produtoAtualizado = {
      ...produtos[index],
      nome: nome !== undefined ? nome : produtos[index].nome,
      descricao: descricao !== undefined ? descricao : produtos[index].descricao,
      valor: valor !== undefined ? parseFloat(valor) : produtos[index].valor,
      dataAtualizacao: new Date().toISOString(),
    };
    if (req.file) {
      produtoAtualizado.foto = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }
    produtos[index] = produtoAtualizado;
    await escreverArquivoJSON(path.join(__dirname, "data", "produtos.json"), produtos);
    const { foto, ...produtoSemFoto } = produtoAtualizado;
    res.json(produtoSemFoto);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/produtos/:id", async (req, res, next) => {
  try {
    const produtoId = req.params.id;
    const produtos = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    const index = produtos.findIndex((p) => p.id === produtoId);
    if (index === -1) {
      return res.status(404).json({ erro: "Produto não encontrado" });
    }
    produtos.splice(index, 1);
    await escreverArquivoJSON(path.join(__dirname, "data", "produtos.json"), produtos);
    res.json({ mensagem: "Produto excluído com sucesso" });
  } catch (error) {
    next(error);
  }
});

// --- Rotas para Templates --- //
app.get("/api/templates", async (req, res, next) => {
  try {
    const templatesDir = path.join(__dirname, "templates");
    await fs.access(templatesDir);
    const arquivos = await fs.readdir(templatesDir);
    const templates = arquivos
      .filter((arquivo) => arquivo.endsWith(".html"))
      .map((arquivo) => ({ id: arquivo, nome: arquivo.replace(".html", "") }));
    res.json(templates);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("Pasta de templates não encontrada.");
      return res.json([]);
    }
    next(error);
  }
});

app.get("/api/templates/:id", async (req, res, next) => {
  try {
    const templateId = req.params.id;
    if (templateId.includes("..") || templateId.includes("/") || !templateId.endsWith(".html")) {
      return res.status(400).json({ erro: "ID de template inválido" });
    }
    const caminhoTemplate = path.join(__dirname, "templates", templateId);
    try {
      const conteudo = await fs.readFile(caminhoTemplate, "utf8");
      res.json({ id: templateId, conteudo });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ erro: "Template não encontrado" });
      }
      throw error; // Re-throw para ser pego pelo catch externo
    }
  } catch (error) {
    next(error);
  }
});

// --- Rotas para Orçamentos --- //
app.get("/api/orcamentos", async (req, res, next) => {
  try {
    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const orcamentosSemFotoItens = orcamentos.map(orc => ({
        ...orc,
        itens: orc.itens.map(({ foto, ...restoItem }) => restoItem)
    }));
    res.json(orcamentosSemFotoItens);
  } catch (error) {
    next(error);
  }
});

app.get("/api/orcamentos/:id", async (req, res, next) => {
  try {
    const orcamentoId = req.params.id;
    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const orcamento = orcamentos.find((o) => o.id === orcamentoId);
    if (!orcamento) {
      return res.status(404).json({ erro: "Orçamento não encontrado" });
    }
    res.json(orcamento);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orcamentos", async (req, res, next) => {
  try {
    const { nanoid } = await import("nanoid");
    const {
      nomeCliente,
      enderecoCliente,
      telefoneCliente,
      emailCliente,
      templateId,
      produtos: produtosInput,
      observacoes,
      tipoDesconto,
      valorDesconto,
    } = req.body;

    if (!nomeCliente || !templateId || !produtosInput || !Array.isArray(produtosInput) || produtosInput.length === 0) {
      return res.status(400).json({ erro: "Dados incompletos. Nome do cliente, template e pelo menos um produto são obrigatórios" });
    }

    // Valida templateId
    if (templateId.includes("..") || templateId.includes("/") || !templateId.endsWith(".html")) {
        return res.status(400).json({ erro: "ID de template inválido" });
    }
    try {
      await fs.access(path.join(__dirname, "templates", templateId));
    } catch (error) {
      return res.status(400).json({ erro: `Template ${templateId} não encontrado` });
    }

    const todosProdutosCadastrados = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    let valorTotalBruto = 0;
    const itensDoOrcamento = [];

    for (const item of produtosInput) {
      const produtoCompleto = todosProdutosCadastrados.find((p) => p.id === item.id);
      if (!produtoCompleto) {
        return res.status(400).json({ erro: `Produto com ID ${item.id} não encontrado no cadastro.` });
      }
      const quantidade = parseInt(item.quantidade, 10) || 1;
      const valorUnitario = parseFloat(produtoCompleto.valor);
      if (isNaN(quantidade) || quantidade <= 0 || isNaN(valorUnitario)) {
        return res.status(400).json({ erro: `Dados inválidos para o produto ${produtoCompleto.nome}.` });
      }
      const subtotalItem = valorUnitario * quantidade;
      valorTotalBruto += subtotalItem;
      itensDoOrcamento.push({
        id: produtoCompleto.id,
        nome: produtoCompleto.nome,
        descricao: produtoCompleto.descricao || "",
        valorUnitario: valorUnitario,
        quantidade: quantidade,
        valorTotal: subtotalItem,
        foto: produtoCompleto.foto // Inclui a foto Base64
      });
    }

    let descontoCalculado = 0;
    const vlrDescInput = parseFloat(valorDesconto) || 0;
    if (tipoDesconto === "percentual" && vlrDescInput > 0) {
      descontoCalculado = (valorTotalBruto * vlrDescInput) / 100;
    } else if (tipoDesconto === "fixo" && vlrDescInput > 0) {
      descontoCalculado = vlrDescInput;
    }
    descontoCalculado = Math.min(descontoCalculado, valorTotalBruto);
    const valorTotalFinal = valorTotalBruto - descontoCalculado;

    const novoOrcamento = {
      id: nanoid(5),
      nomeCliente,
      enderecoCliente: enderecoCliente || "",
      telefoneCliente: telefoneCliente || "",
      emailCliente: emailCliente || "",
      templateId,
      itens: itensDoOrcamento,
      valorTotalBruto: valorTotalBruto,
      tipoDesconto: tipoDesconto || null,
      valorDescontoInput: valorDesconto || 0,
      descontoCalculado: descontoCalculado,
      valorTotal: valorTotalFinal,
      observacoes: observacoes || "",
      dataCriacao: new Date().toISOString(),
      status: "pendente",
      pdfUrl: null,
    };

    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    orcamentos.push(novoOrcamento);
    await escreverArquivoJSON(path.join(__dirname, "data", "orcamentos.json"), orcamentos);

    const { itens, ...orcamentoSemFotoItens } = novoOrcamento;
    const itensSemFoto = itens.map(({ foto, ...restoItem }) => restoItem);
    res.status(201).json({ ...orcamentoSemFotoItens, itens: itensSemFoto });

  } catch (error) {
    next(error); // Passa o erro para o middleware
  }
});

/**
 * Função para preparar dados e renderizar HTML usando EJS.
 */
async function renderizarHtmlOrcamento(orcamentoId) {
  const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
  const orcamento = orcamentos.find((o) => o.id === orcamentoId);
  if (!orcamento) {
    const err = new Error("Orçamento não encontrado");
    err.status = 404;
    throw err;
  }

  const caminhoTemplate = path.join(__dirname, "templates", orcamento.templateId);
  let conteudoTemplate;
  try {
    conteudoTemplate = await fs.readFile(caminhoTemplate, "utf8");
  } catch (error) {
    const err = new Error(`Template ${orcamento.templateId} não encontrado`);
    err.status = 404;
    throw err;
  }

  const dataCriacao = new Date(orcamento.dataCriacao);
  const dataValidade = new Date(dataCriacao);
  dataValidade.setDate(dataValidade.getDate() + 30); // Validade de 30 dias

  let logoBase64 = null;
  try {
      logoBase64 = await fs.readFile(path.join(__dirname, "public", "images", "logo", "logo.jpeg"), "base64");
  } catch (logoError) {
      console.warn("Logo não encontrado em public/images/logo/logo.jpeg");
  }

  // Prepara os dados para o template EJS
  const dadosParaEJS = {
    orcamento: {
        ...orcamento, // Inclui id, nomeCliente, enderecoCliente, etc.
        dataCriacaoFormatada: formatarData(dataCriacao),
        validadeFormatada: formatarData(dataValidade),
        valorTotalBrutoFormatado: formatarMoeda(orcamento.valorTotalBruto),
        valorDescontoCalculadoFormatado: formatarMoeda(orcamento.descontoCalculado),
        valorTotalFormatado: formatarMoeda(orcamento.valorTotal),
        // Formata itens dentro do objeto orcamento para o template
        itens: orcamento.itens.map(item => ({
            ...item,
            valorUnitarioOriginalFormatado: formatarMoeda(item.valorUnitario),
            valorTotalItemFormatado: formatarMoeda(item.valorTotal),
            imagemUrl: item.foto // Usa a string Base64 diretamente
        }))
    },
    // Disponibiliza funções de formatação para o template
    formatarMoeda: formatarMoeda,
    formatarData: formatarData,
    // Adiciona o logo como Data URL
    logoUrl: logoBase64 ? `data:image/jpeg;base64,${logoBase64}` : null
  };

  try {
    // Renderiza o template usando EJS
    const htmlGerado = ejs.render(conteudoTemplate, dadosParaEJS, {
        filename: caminhoTemplate, // Necessário para includes/layouts no EJS
        async: false // Garante renderização síncrona se não usar async features do EJS
    });
    return { html: htmlGerado, orcamentoData: orcamento, orcamentos }; // Retorna dados originais também
  } catch (renderError) {
    console.error("Erro ao renderizar template EJS:", renderError);
    const err = new Error(`Erro ao processar template: ${renderError.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Rota para gerar o HTML do orçamento (visualização no front-end)
 */
app.get("/api/orcamentos/:id/gerar", async (req, res, next) => {
  try {
    const { html } = await renderizarHtmlOrcamento(req.params.id);
    res.json({ html });
  } catch (error) {
    next(error); // Passa o erro para o middleware
  }
});

/**
 * Rota para gerar e baixar o PDF do orçamento usando Puppeteer
 * AJUSTADA PARA MAIOR ROBUSTEZ (v2.3.0 - Margens reduzidas)
 */
app.get("/api/orcamentos/:id/pdf", async (req, res, next) => {
  const orcamentoId = req.params.id;
  const nomeArquivo = `orcamento_${orcamentoId}.pdf`;
  const caminhoArquivoPdf = path.join(__dirname, "public", "pdfs", nomeArquivo);
  let page = null;

  try {
    console.log(`[PDF ${orcamentoId}] Iniciando geração.`);
    // 1. Renderiza o HTML usando EJS
    const { html, orcamentoData, orcamentos } = await renderizarHtmlOrcamento(orcamentoId);
    console.log(`[PDF ${orcamentoId}] HTML renderizado com EJS.`);

    // 2. Inicia o Puppeteer
    console.log(`[PDF ${orcamentoId}] Obtendo instância do Puppeteer...`);
    const browser = await getBrowser();
    page = await browser.newPage();
    console.log(`[PDF ${orcamentoId}] Nova página aberta.`);

    // Adiciona tratamento para erros não capturados na página
    page.on("pageerror", (err) => {
        console.error(`[PDF ${orcamentoId}] Erro na página (pageerror): ${err}`);
    });
    page.on("error", (err) => {
        console.error(`[PDF ${orcamentoId}] Erro na página (error): ${err}`);
    });
    page.on("requestfailed", (request) => {
        console.error(`[PDF ${orcamentoId}] Falha na requisição: ${request.url()} - ${request.failure().errorText}`);
    });

    // 3. Define o conteúdo da página com o HTML renderizado
    console.log(`[PDF ${orcamentoId}] Definindo conteúdo da página...`);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 90000 }); 
    console.log(`[PDF ${orcamentoId}] Conteúdo HTML definido e rede ociosa.`);

    // 4. Gera o PDF com margens reduzidas
    console.log(`[PDF ${orcamentoId}] Gerando PDF com margens reduzidas...`);
    await page.pdf({
      path: caminhoArquivoPdf,
      format: "A4",
      printBackground: true,
      // Margens reduzidas (ex: 10mm)
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }, 
      timeout: 90000 // Aumenta timeout para a geração do PDF
    });
    console.log(`[PDF ${orcamentoId}] PDF gerado e salvo em: ${caminhoArquivoPdf}`);

    // 5. Fecha a página e o browser (movido para o finally)

    // 6. Atualiza o JSON do orçamento
    const index = orcamentos.findIndex((o) => o.id === orcamentoId);
    if (index !== -1) {
      orcamentos[index].status = "gerado";
      orcamentos[index].dataGeracao = new Date().toISOString();
      orcamentos[index].pdfUrl = `/pdfs/${nomeArquivo}`;
      await escreverArquivoJSON(path.join(__dirname, "data", "orcamentos.json"), orcamentos);
      console.log(`[PDF ${orcamentoId}] Orçamento atualizado no JSON.`);
    } else {
      console.warn(`[PDF ${orcamentoId}] Orçamento não encontrado para atualização após gerar PDF.`);
    }

    // 7. Envia o PDF para download
    console.log(`[PDF ${orcamentoId}] Enviando para download...`);
    res.download(caminhoArquivoPdf, nomeArquivo, (downloadError) => {
      if (downloadError) {
        console.error(`[PDF ${orcamentoId}] Erro ao enviar PDF ${nomeArquivo} para download:`, downloadError);
        // Não tenta enviar status se headers já foram enviados
      }
    });

  } catch (error) {
    console.error(`[PDF ${orcamentoId}] Erro GERAL ao gerar PDF:`, error);
    next(error); 

  } finally {
    // Garante que a página e o browser sejam fechados mesmo se ocorrer um erro
    if (page) {
        try {
            console.log(`[PDF ${orcamentoId}] Fechando página no finally...`);
            await page.close();
            console.log(`[PDF ${orcamentoId}] Página fechada no finally.`);
        } catch (closePageError) {
            console.error(`[PDF ${orcamentoId}] Erro ao fechar página no finally:`, closePageError);
        }
    }
  }
});

/**
 * Rota para excluir um orçamento
 */
app.delete("/api/orcamentos/:id", async (req, res, next) => {
  try {
    const orcamentoId = req.params.id;
    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const index = orcamentos.findIndex((o) => o.id === orcamentoId);
    if (index === -1) {
      return res.status(404).json({ erro: "Orçamento não encontrado" });
    }
    // Tenta remover o PDF associado
    if (orcamentos[index].pdfUrl) {
      try {
        const caminhoPdf = path.join(__dirname, "public", orcamentos[index].pdfUrl);
        await fs.unlink(caminhoPdf);
        console.log(`PDF removido: ${caminhoPdf}`);
      } catch (error) {
        if (error.code !== "ENOENT") {
             console.warn(`Erro ao remover PDF do orçamento ${orcamentoId}:`, error.message);
        }
      }
    }
    orcamentos.splice(index, 1);
    await escreverArquivoJSON(path.join(__dirname, "data", "orcamentos.json"), orcamentos);
    res.json({ mensagem: "Orçamento excluído com sucesso" });
  } catch (error) {
    next(error);
  }
});

// Rota para a página inicial (Catch-all para SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Middleware de tratamento de erros genérico
app.use((err, req, res, next) => {
  console.error("Erro detectado pelo Middleware:", err);
  // Se o erro for do Puppeteer, pode ser útil logar a causa
  if (err.message && (err.message.includes("Protocol error") || err.message.includes("Target closed"))) {
      console.error("Detalhes do erro Puppeteer:", err.cause || "Nenhuma causa específica informada");
  }
  
  if (res.headersSent) {
    console.error("Headers já enviados, não é possível enviar resposta de erro.");
    return next(err); // Passa para o próximo handler de erro, se houver
  }
  
  // Trata erro específico do Multer (arquivo grande)
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ erro: `Arquivo muito grande. Limite de ${upload.limits.fileSize / 1024 / 1024}MB.` });
  }
  
  // Resposta de erro padrão
  const status = err.status || 500;
  const message = err.message || "Algo deu errado no servidor!";
  res.status(status).json({ erro: message });
});
if (require.main === module) {
  const https = require("https");
  const http = require("http");

  // Certificados Let's Encrypt
  const sslOptions = {
    key: require("fs").readFileSync("/etc/letsencrypt/live/start.devlimassh.shop/privkey.pem"),
    cert: require("fs").readFileSync("/etc/letsencrypt/live/start.devlimassh.shop/fullchain.pem")
  };

  // Redirecionador HTTP → HTTPS
  const redirectApp = express();
  redirectApp.use((req, res) => {
    const host = req.headers.host.replace(/:\d+$/, "");
    res.redirect(`https://${host}${req.url}`);
  });

  http.createServer(redirectApp).listen(80, () => {
    console.log("🔁 Redirecionamento HTTP → HTTPS ativo (porta 80)");
  });

  // Servidor HTTPS real
  https.createServer(sslOptions, app).listen(443, () => {
    console.log("✅ Servidor HTTPS rodando em https://start.devlimassh.shop (porta 443)");
  });
}

module.exports = app;
