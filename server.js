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
const session = require("express-session");
const bcrypt = require("bcrypt");
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

app.use(
  session({
    secret: "startorcamentos-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // mantém sessão por 30 dias
  })
);

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
    const usuariosPath = path.join(__dirname, "data", "usuarios.json");
    const logsPath = path.join(__dirname, "data", "logs.json");
    try {
      await fs.access(produtosPath);
    } catch {
      await fs.writeFile(produtosPath, "[]", "utf8");
      if (process.env.NODE_ENV !== 'test') console.log("Arquivo produtos.json criado.");
    }
    try {
      await fs.access(orcamentosPath);
    } catch {
      await fs.writeFile(orcamentosPath, "[]", "utf8");
      if (process.env.NODE_ENV !== 'test') console.log("Arquivo orcamentos.json criado.");
    }
    try {
      await fs.access(usuariosPath);
    } catch {
      const senhaPadrao = await bcrypt.hash("start", 10);
      const adminPadrao = [{ id: "1", usuario: "start", senha: senhaPadrao, admin: true }];
      await fs.writeFile(usuariosPath, JSON.stringify(adminPadrao, null, 2), "utf8");
      if (process.env.NODE_ENV !== 'test') console.log("Arquivo usuarios.json criado com usuário admin padrão.");
    }
    try {
      await fs.access(logsPath);
    } catch {
      await fs.writeFile(logsPath, "[]", "utf8");
      if (process.env.NODE_ENV !== 'test') console.log("Arquivo logs.json criado.");
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

// --- Autenticação --- //
const usuariosPath = path.join(__dirname, "data", "usuarios.json");
const logsPath = path.join(__dirname, "data", "logs.json");

async function obterUsuarios() {
  return lerArquivoJSON(usuariosPath);
}

async function salvarUsuarios(lista) {
  await escreverArquivoJSON(usuariosPath, lista);
}

async function obterLogs() {
  return lerArquivoJSON(logsPath);
}

async function salvarLogs(lista) {
  await escreverArquivoJSON(logsPath, lista);
}

async function registrarAcao(req, descricao) {
  try {
    const logs = await obterLogs();
    const { nanoid } = await import('nanoid');
    const entry = {
      id: nanoid(8),
      timestamp: new Date().toISOString(),
      usuario: req.session?.usuario?.usuario || 'desconhecido',
      userId: req.session?.usuario?.id || null,
      ip: req.ip,
      descricao,
    };
    logs.push(entry);
    await salvarLogs(logs);
    console.log(`[LOG] ${entry.timestamp} - ${entry.usuario} (${entry.ip}): ${descricao}`);
  } catch (err) {
    console.error('Erro ao registrar ação:', err);
  }
}

function authRequired(req, res, next) {
  if (req.session.usuario) return next();
  res.status(401).json({ erro: "Não autenticado" });
}

function adminRequired(req, res, next) {
  if (req.session.usuario?.admin) return next();
  res.status(403).json({ erro: "Acesso restrito ao administrador" });
}

// --- Rotas de Login e Usuários --- //
app.post("/api/login", async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Credenciais inválidas" });
  }
  const usuarios = await obterUsuarios();
  const found = usuarios.find((u) => u.usuario === usuario);
  if (!found) return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  const ok = await bcrypt.compare(senha, found.senha);
  if (!ok) return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  req.session.usuario = { id: found.id, usuario: found.usuario, admin: found.admin };
  res.json({ id: found.id, usuario: found.usuario, admin: found.admin });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ mensagem: "Logout realizado" });
  });
});

app.get("/api/session", (req, res) => {
  if (req.session.usuario) {
    res.json({ autenticado: true, usuario: req.session.usuario });
  } else {
    res.json({ autenticado: false });
  }
});

// CRUD de usuários (admin)
app.get("/api/usuarios", authRequired, adminRequired, async (req, res) => {
  const usuarios = await obterUsuarios();
  const semSenha = usuarios.map(({ senha, ...rest }) => rest);
  res.json(semSenha);
});

app.post("/api/usuarios", authRequired, adminRequired, upload.single("foto"), async (req, res) => {
  const { usuario, senha, admin } = req.body;
  if (!usuario || !senha) return res.status(400).json({ erro: "Dados inválidos" });
  const usuarios = await obterUsuarios();
  if (usuarios.find((u) => u.usuario === usuario)) {
    return res.status(400).json({ erro: "Usuário já existe" });
  }
  const { nanoid } = await import("nanoid");
  const novo = {
    id: nanoid(8),
    usuario,
    senha: await bcrypt.hash(senha, 10),
    admin: !!admin,
    foto: req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}` : null,
  };
  usuarios.push(novo);
  await salvarUsuarios(usuarios);
  await registrarAcao(req, `Criou usuário ${usuario} (admin=${!!admin})`);
  res.status(201).json({ id: novo.id, usuario: novo.usuario, admin: novo.admin });
});

app.put("/api/usuarios/:id", authRequired, adminRequired, upload.single("foto"), async (req, res) => {
  const { usuario, senha, admin } = req.body;
  const usuarios = await obterUsuarios();
  const index = usuarios.findIndex((u) => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ erro: "Usuário não encontrado" });
  if (usuario) {
    if (usuarios.some((u, i) => u.usuario === usuario && i !== index)) {
      return res.status(400).json({ erro: "Usuário já existe" });
    }
    usuarios[index].usuario = usuario;
  }
  if (senha) usuarios[index].senha = await bcrypt.hash(senha, 10);
  if (admin !== undefined) usuarios[index].admin = !!admin;
  if (req.file) {
    usuarios[index].foto = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  }
  await salvarUsuarios(usuarios);
  const { senha: s, ...usuarioResp } = usuarios[index];
  res.json(usuarioResp);
});

app.delete("/api/usuarios/:id", authRequired, adminRequired, async (req, res) => {
  const usuarios = await obterUsuarios();
  const index = usuarios.findIndex((u) => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ erro: "Usuário não encontrado" });
  usuarios.splice(index, 1);
  await salvarUsuarios(usuarios);
  res.json({ mensagem: "Usuário removido" });
});

// Perfil do usuário logado
app.get("/api/usuarios/me", authRequired, async (req, res) => {
  const usuarios = await obterUsuarios();
  const user = usuarios.find(u => u.id === req.session.usuario.id);
  if (!user) return res.status(404).json({ erro: "Usuário não encontrado" });
  const { senha, ...semSenha } = user;
  res.json(semSenha);
});

app.put("/api/usuarios/me", authRequired, upload.single("foto"), async (req, res) => {
  const { usuario, senha } = req.body;
  const usuarios = await obterUsuarios();
  const index = usuarios.findIndex(u => u.id === req.session.usuario.id);
  if (index === -1) return res.status(404).json({ erro: "Usuário não encontrado" });
  if (usuario) {
    if (usuarios.some((u, i) => u.usuario === usuario && i !== index)) {
      return res.status(400).json({ erro: "Usuário já existe" });
    }
    usuarios[index].usuario = usuario;
    req.session.usuario.usuario = usuario;
  }
  if (senha) usuarios[index].senha = await bcrypt.hash(senha, 10);
  if (req.file) {
    usuarios[index].foto = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  }
  await salvarUsuarios(usuarios);
  const { senha: s, ...updatedUser } = usuarios[index];
  res.json(updatedUser);
});

// Logs (admin)
app.get("/api/logs", authRequired, adminRequired, async (req, res) => {
  const logs = await obterLogs();
  res.json(logs);
});

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

app.post("/api/produtos", authRequired, adminRequired, upload.single("foto"), async (req, res, next) => {
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
    await registrarAcao(req, `Criou produto ${nome}`);
    const { foto, ...produtoSemFoto } = novoProduto;
    res.status(201).json(produtoSemFoto);
  } catch (error) {
    next(error);
  }
});

app.put("/api/produtos/:id", authRequired, adminRequired, upload.single("foto"), async (req, res, next) => {
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
    await registrarAcao(req, `Editou produto ${produtoAtualizado.nome}`);
    const { foto, ...produtoSemFoto } = produtoAtualizado;
    res.json(produtoSemFoto);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/produtos/:id", authRequired, adminRequired, async (req, res, next) => {
  try {
    const produtoId = req.params.id;
    const produtos = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    const index = produtos.findIndex((p) => p.id === produtoId);
    if (index === -1) {
      return res.status(404).json({ erro: "Produto não encontrado" });
    }
    const nomeRemovido = produtos[index].nome;
    produtos.splice(index, 1);
    await escreverArquivoJSON(path.join(__dirname, "data", "produtos.json"), produtos);
    await registrarAcao(req, `Removeu produto ${nomeRemovido}`);
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
app.get("/api/orcamentos", authRequired, async (req, res, next) => {
  try {
    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const filtrados = req.session.usuario.admin ? orcamentos : orcamentos.filter(o => o.userId === req.session.usuario.id);
    const orcamentosSemFotoItens = filtrados.map(orc => ({
        ...orc,
        itens: orc.itens.map(({ foto, ...restoItem }) => restoItem)
    }));
    res.json(orcamentosSemFotoItens);
  } catch (error) {
    next(error);
  }
});

app.get("/api/orcamentos/:id", authRequired, async (req, res, next) => {
  try {
    const orcamentoId = req.params.id;
    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const orcamento = orcamentos.find((o) => o.id === orcamentoId);
    if (!orcamento) {
      return res.status(404).json({ erro: "Orçamento não encontrado" });
    }
    if (!req.session.usuario.admin && orcamento.userId !== req.session.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    res.json(orcamento);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orcamentos", authRequired, async (req, res, next) => {
  try {
    const { customAlphabet } = await import("nanoid");
    const gerarCodigo = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 4);
    const {
      nomeCliente,
      cepCliente,
      enderecoCliente,
      telefoneCliente,
      emailCliente,
      cpfCliente,
      templateId,
      produtos: produtosInput,
      observacoes,
      tipoDesconto,
      valorDesconto,
      formaPagamento,
      avistaTipo,
      parcelas,
      jurosMes,
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

    const modoPg = formaPagamento === 'prazo' ? 'prazo' : 'avista';
    const numParcelas = parseInt(parcelas, 10) || 1;
    const juros = parseFloat(jurosMes) || 0;
    let valorTotalComJuros = valorTotalFinal;
    let valorParcela = valorTotalFinal;
    if (modoPg === 'prazo') {
      valorTotalComJuros = valorTotalFinal * (1 + (juros / 100) * numParcelas);
      valorParcela = valorTotalComJuros / numParcelas;
    }



    const novoOrcamento = {
      id: gerarCodigo(),
      nomeCliente,
      cepCliente: cepCliente || "",
      enderecoCliente: enderecoCliente || "",
      telefoneCliente: telefoneCliente || "",
      emailCliente: emailCliente || "",
      cpfCliente: cpfCliente || "",
      templateId,
      itens: itensDoOrcamento,
      valorTotalBruto: valorTotalBruto,
      tipoDesconto: tipoDesconto || null,
      valorDescontoInput: valorDesconto || 0,
      descontoCalculado: descontoCalculado,
      valorTotal: valorTotalFinal,
      formaPagamento: modoPg,
      avistaTipo: modoPg === 'avista' ? (avistaTipo || 'dinheiro') : null,
      parcelas: modoPg === 'prazo' ? numParcelas : 1,
      jurosMes: modoPg === 'prazo' ? juros : 0,
      valorTotalComJuros,
      valorParcela,
      observacoes: observacoes || "",
      dataCriacao: new Date().toISOString(),
      status: "pendente",
      pdfUrl: null,
      userId: req.session.usuario.id,
    };

    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    orcamentos.push(novoOrcamento);
    await escreverArquivoJSON(path.join(__dirname, "data", "orcamentos.json"), orcamentos);
    await registrarAcao(req, `Criou orçamento ${novoOrcamento.id} valor ${formatarMoeda(novoOrcamento.valorTotal)}`);

    const { itens, ...orcamentoSemFotoItens } = novoOrcamento;
    const itensSemFoto = itens.map(({ foto, ...restoItem }) => restoItem);
    res.status(201).json({ ...orcamentoSemFotoItens, itens: itensSemFoto });

  } catch (error) {
    next(error); // Passa o erro para o middleware
  }
});

app.put("/api/orcamentos/:id", authRequired, async (req, res, next) => {
  try {
    const orcamentoId = req.params.id;
    const {
      nomeCliente,
      cepCliente,
      enderecoCliente,
      telefoneCliente,
      emailCliente,
      cpfCliente,
      templateId,
      produtos: produtosInput,
      observacoes,
      tipoDesconto,
      valorDesconto,
    } = req.body;

    if (!nomeCliente || !templateId || !Array.isArray(produtosInput) || produtosInput.length === 0) {
      return res.status(400).json({ erro: "Dados incompletos. Nome do cliente, template e pelo menos um produto são obrigatórios" });
    }

    if (templateId.includes("..") || templateId.includes("/") || !templateId.endsWith(".html")) {
      return res.status(400).json({ erro: "ID de template inválido" });
    }
    try {
      await fs.access(path.join(__dirname, "templates", templateId));
    } catch (error) {
      return res.status(400).json({ erro: `Template ${templateId} não encontrado` });
    }

    const produtosCadastrados = await lerArquivoJSON(path.join(__dirname, "data", "produtos.json"));
    let valorTotalBruto = 0;
    const itens = [];
    for (const item of produtosInput) {
      const produto = produtosCadastrados.find(p => p.id === item.id);
      if (!produto) {
        return res.status(400).json({ erro: `Produto com ID ${item.id} não encontrado no cadastro.` });
      }
      const quantidade = parseInt(item.quantidade, 10) || 1;
      const valorUnitario = parseFloat(produto.valor);
      if (isNaN(quantidade) || quantidade <= 0 || isNaN(valorUnitario)) {
        return res.status(400).json({ erro: `Dados inválidos para o produto ${produto.nome}.` });
      }
      const subtotal = valorUnitario * quantidade;
      valorTotalBruto += subtotal;
      itens.push({
        id: produto.id,
        nome: produto.nome,
        descricao: produto.descricao || "",
        valorUnitario,
        quantidade,
        valorTotal: subtotal,
        foto: produto.foto
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

    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const index = orcamentos.findIndex(o => o.id === orcamentoId);
    if (index === -1) {
      return res.status(404).json({ erro: "Orçamento não encontrado" });
    }
    if (!req.session.usuario.admin && orcamentos[index].userId !== req.session.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    orcamentos[index] = {
      ...orcamentos[index],
      nomeCliente,
      cepCliente: cepCliente || "",
      enderecoCliente: enderecoCliente || "",
      telefoneCliente: telefoneCliente || "",
      emailCliente: emailCliente || "",
      cpfCliente: cpfCliente || "",
      templateId,
      itens,
      valorTotalBruto,
      tipoDesconto: tipoDesconto || null,
      valorDescontoInput: valorDesconto || 0,
      descontoCalculado,
      valorTotal: valorTotalFinal,
      formaPagamento: modoPg,
      avistaTipo: modoPg === 'avista' ? (avistaTipo || 'dinheiro') : null,
      parcelas: modoPg === 'prazo' ? numParcelas : 1,
      jurosMes: modoPg === 'prazo' ? juros : 0,
      valorTotalComJuros,
      valorParcela,
      observacoes: observacoes || "",
      dataAtualizacao: new Date().toISOString(),
    };

    await escreverArquivoJSON(path.join(__dirname, "data", "orcamentos.json"), orcamentos);
    await registrarAcao(req, `Editou orçamento ${orcamentoId}`);

    const { itens: itensFoto, ...orcSemFoto } = orcamentos[index];
    const itensSemFoto = itensFoto.map(({ foto, ...rest }) => rest);
    res.json({ ...orcSemFoto, itens: itensSemFoto });
  } catch (error) {
    next(error);
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

  let vendedorNome = "";
  try {
      const usuarios = await obterUsuarios();
      const vendedor = usuarios.find(u => u.id === orcamento.userId);
      if (vendedor) vendedorNome = vendedor.usuario;
  } catch (vendError) {
      console.warn("Não foi possível determinar o vendedor do orçamento:", vendError);
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
        valorTotalComJurosFormatado: formatarMoeda(orcamento.valorTotalComJuros),
        valorParcelaFormatada: formatarMoeda(orcamento.valorParcela),
        // Formata itens dentro do objeto orcamento para o template
        itens: orcamento.itens.map(item => ({
            ...item,
            valorUnitarioOriginalFormatado: formatarMoeda(item.valorUnitario),
            valorTotalItemFormatado: formatarMoeda(item.valorTotal),
            imagemUrl: item.foto // Usa a string Base64 diretamente
        }))
    },
    vendedor: vendedorNome,
    referencia: orcamento.id,
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
app.get("/api/orcamentos/:id/gerar", authRequired, async (req, res, next) => {
  try {
    const { html, orcamentoData } = await renderizarHtmlOrcamento(req.params.id);
    if (!req.session.usuario.admin && orcamentoData.userId !== req.session.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    res.json({ html });
  } catch (error) {
    next(error); // Passa o erro para o middleware
  }
});

/**
 * Rota para gerar e baixar o PDF do orçamento usando Puppeteer
 * AJUSTADA PARA MAIOR ROBUSTEZ (v2.3.0 - Margens reduzidas)
 */
app.get("/api/orcamentos/:id/pdf", authRequired, async (req, res, next) => {
  const orcamentoId = req.params.id;
  const nomeArquivo = `orcamento_${orcamentoId}.pdf`;
  const caminhoArquivoPdf = path.join(__dirname, "public", "pdfs", nomeArquivo);
  let page = null;

  try {
    console.log(`[PDF ${orcamentoId}] Iniciando geração.`);
    // 1. Renderiza o HTML usando EJS
    const { html, orcamentoData, orcamentos } = await renderizarHtmlOrcamento(orcamentoId);
    if (!req.session.usuario.admin && orcamentoData.userId !== req.session.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
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
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }
    });
    console.log(`[PDF ${orcamentoId}] PDF gerado e salvo em: ${caminhoArquivoPdf}`);

    // 5. Fecha apenas a página (o browser permanece aberto para reutilização)

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
    // Garante que a página seja fechada mesmo se ocorrer um erro
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
app.delete("/api/orcamentos/:id", authRequired, async (req, res, next) => {
  try {
    const orcamentoId = req.params.id;
    const orcamentos = await lerArquivoJSON(path.join(__dirname, "data", "orcamentos.json"));
    const index = orcamentos.findIndex((o) => o.id === orcamentoId);
    if (index === -1) {
      return res.status(404).json({ erro: "Orçamento não encontrado" });
    }
    if (!req.session.usuario.admin && orcamentos[index].userId !== req.session.usuario.id) {
      return res.status(403).json({ erro: "Acesso negado" });
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
    const hostHeader = req.headers.host || "";
    const host = hostHeader.replace(/:\d+$/, "");
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
