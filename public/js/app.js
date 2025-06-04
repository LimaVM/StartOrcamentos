/**
 * Aplicativo PWA de Orçamentos
 * 
 * Este arquivo contém toda a lógica de frontend do aplicativo,
 * incluindo navegação, manipulação de dados e interação com a API.
 * 
 * @author Manus
 * @version 1.4.0 - Corrigido exibição de imagem Base64 e adicionado preview no modal
 */

// Variáveis globais
let produtosCache = [];
let templatesCache = [];
let orcamentosCache = [];
let usuariosCache = [];
let registrosCache = [];
let produtosSelecionados = []; // Formato: { id, nome, valorUnitario, quantidade, foto }
let deferredPrompt = null;
let isEditing = false; // Indica se um formulário de produto ou orçamento está aberto
let currentPage = "home"; // Página atual para controle do histórico
let usuarioAtual = null; // Dados do usuário logado

// Elementos DOM frequentemente acessados
const appContent = document.getElementById("app-content");
const menuToggle = document.getElementById("menu-toggle");
const menuClose = document.getElementById("menu-close");
const sideMenu = document.querySelector(".side-menu");
const overlay = document.getElementById("overlay");
const menuItems = document.querySelectorAll(".menu-items li");
const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
const pages = document.querySelectorAll(".page");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");
const loadingSpinner = document.getElementById("loading-spinner");
const pdfProgressOverlay = document.getElementById("pdf-progress-overlay");
const pdfProgressBar = document.getElementById("pdf-progress-bar");

// Elementos de login
const loginModal = document.getElementById("login-modal");
const loginForm = document.getElementById("login-form");
const loginUsuario = document.getElementById("login-usuario");
const loginSenha = document.getElementById("login-senha");

// Elementos da página inicial
const cardProdutos = document.getElementById("card-produtos");
const cardOrcamentos = document.getElementById("card-orcamentos");

// Elementos da página de produtos
const addProdutoBtn = document.getElementById("add-produto-btn");
const produtoSearch = document.getElementById("produto-search");
const produtosLista = document.getElementById("produtos-lista");

// Elementos da página de orçamentos
const addOrcamentoBtn = document.getElementById("add-orcamento-btn");
const orcamentoSearch = document.getElementById("orcamento-search");
const orcamentosLista = document.getElementById("orcamentos-lista");

// Elementos da página de usuários (admin)
const addUsuarioBtn = document.getElementById("add-usuario-btn");
const usuariosLista = document.getElementById("usuarios-lista");

// Elementos da página de registros (admin)
const registrosLista = document.getElementById("registros-lista");

// Elementos da página de perfil
const perfilForm = document.getElementById("perfil-form");
const perfilNome = document.getElementById("perfil-nome");
const perfilSenha = document.getElementById("perfil-senha");
const perfilFotoInput = document.getElementById("perfil-foto");
const perfilFotoPreview = document.getElementById("perfil-foto-preview");
const perfilFotoBtn = document.getElementById("perfil-foto-btn");

// Elementos do modal de usuário
const usuarioModal = document.getElementById("usuario-modal");
const usuarioModalTitle = document.getElementById("usuario-modal-title");
const usuarioForm = document.getElementById("usuario-form");
const usuarioId = document.getElementById("usuario-id");
const usuarioNome = document.getElementById("usuario-nome");
const usuarioSenha = document.getElementById("usuario-senha");
const usuarioAdmin = document.getElementById("usuario-admin");
const usuarioFoto = document.getElementById("usuario-foto");

// Elementos do modal de produto
const produtoModal = document.getElementById("produto-modal");
const produtoModalTitle = document.getElementById("produto-modal-title");
const produtoForm = document.getElementById("produto-form");
const produtoId = document.getElementById("produto-id");
const produtoNome = document.getElementById("produto-nome");
const produtoDescricao = document.getElementById("produto-descricao"); // Adicionado
const produtoValor = document.getElementById("produto-valor");
const produtoFotoInput = document.getElementById("produto-foto"); // Renomeado para clareza
const fotoPreviewContainer = document.getElementById("foto-preview-container"); // Adicionado container
const fotoPreview = document.getElementById("foto-preview");
const selectFotoBtn = document.getElementById("select-foto-btn");

// Elementos do modal de orçamento
const orcamentoModal = document.getElementById("orcamento-modal");
const orcamentoForm = document.getElementById("orcamento-form");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const prevTabBtn = document.getElementById("prev-tab");
const nextTabBtn = document.getElementById("next-tab");
const submitOrcamentoBtn = document.getElementById("submit-orcamento");
const orcamentoIdInput = document.getElementById("orcamento-id");
const clienteNome = document.getElementById("cliente-nome");
const clienteEndereco = document.getElementById("cliente-endereco");
const clienteTelefone = document.getElementById("cliente-telefone");
const clienteEmail = document.getElementById("cliente-email");
const produtosSelecionadosEl = document.getElementById("produtos-selecionados");
const addProdutosBtn = document.getElementById("add-produtos-btn");
const orcamentoObservacoes = document.getElementById("orcamento-observacoes");
const tipoDescontoSelect = document.getElementById("tipo-desconto");
const valorDescontoGroup = document.getElementById("valor-desconto-group");
const valorDescontoInput = document.getElementById("valor-desconto");
const valorDescontoHelper = document.getElementById("valor-desconto-helper");
const templatesLista = document.getElementById("templates-lista");

// Elementos do modal de seleção de produtos
const selecionarProdutosModal = document.getElementById("selecionar-produtos-modal");
const selecionarProdutosSearch = document.getElementById("selecionar-produtos-search");
const selecionarProdutosLista = document.getElementById("selecionar-produtos-lista");
const confirmarProdutosBtn = document.getElementById("confirmar-produtos");

// Elementos do modal de visualização de orçamento
const visualizarOrcamentoModal = document.getElementById("visualizar-orcamento-modal");
const orcamentoPreview = document.getElementById("orcamento-preview");
const imprimirOrcamentoBtn = document.getElementById("imprimir-orcamento");
const baixarPdfBtn = document.getElementById("baixar-pdf-orcamento");
const compartilharPdfBtn = document.getElementById("compartilhar-orcamento");

// Botões de fechar modal
const modalCloseBtns = document.querySelectorAll(".modal-close");
const modalCancelBtns = document.querySelectorAll(".modal-cancel");

/**
 * Ajusta o layout quando a largura da tela muda
 */
function updateLayout() {
  if (window.matchMedia("(min-width: 1024px)").matches) {
    sideMenu.classList.remove("open");
    overlay.classList.remove("active");
  }
}

function configurarMenuAdmin() {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = usuarioAtual && usuarioAtual.admin ? '' : 'none';
  });
}

async function verificarSessao() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data.autenticado) {
      usuarioAtual = data.usuario;
      iniciarAplicacao();
      configurarMenuAdmin();
      loginModal.classList.remove('active');
    } else {
      loginModal.classList.add('active');
      if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          await realizarLogin();
        });
      }
    }
  } catch (e) {
    console.error('Falha ao verificar sessão', e);
    loginModal.classList.add('active');
  }
}

async function realizarLogin() {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: loginUsuario.value, senha: loginSenha.value })
    });
    if (res.ok) {
      usuarioAtual = await res.json();
      configurarMenuAdmin();
      loginModal.classList.remove('active');
      iniciarAplicacao();
    } else {
      mostrarToast('Credenciais inválidas');
    }
  } catch (err) {
    console.error('Erro ao fazer login', err);
    mostrarToast('Erro ao fazer login');
  }
}

function iniciarAplicacao() {
  const initial = window.location.hash.replace('#', '') || 'home';
  navigateToPage(initial, false);
  history.replaceState({ pageId: initial }, '', `#${initial}`);
  initNavigation();
  initModals();
  initHomePage();
  initProdutosPage();
  initOrcamentosPage();
  initUsuariosPage();
  initPerfilPage();
  carregarDadosIniciais();
  initInstallPrompt();

}

/**
 * Inicializa o aplicativo quando o DOM estiver carregado
 */
document.addEventListener("DOMContentLoaded", () => {
  updateLayout();
  verificarSessao();
});

window.addEventListener("popstate", (e) => {
  const pageId = e.state?.pageId || "home";
  navigateToPage(pageId, false);
});

window.addEventListener("beforeunload", (e) => {
  if (isEditing) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/**
 * Carrega os dados iniciais (produtos, templates, orçamentos)
 */
async function carregarDadosIniciais() {
  mostrarLoading();
  try {
    // Carrega produtos primeiro, pois outros podem depender deles
    await carregarProdutos();
    await Promise.all([
      carregarTemplates(),
      carregarOrcamentos(),
    ]);
    if (usuarioAtual && usuarioAtual.admin) {
      await Promise.all([carregarUsuarios(), carregarRegistros()]);
    }
  } catch (error) {
    console.error("Erro ao carregar dados iniciais:", error);
    mostrarToast("Erro ao carregar dados. Verifique sua conexão.");
  } finally {
    esconderLoading();
  }
}

/**
 * Inicializa os eventos de navegação (menu lateral e inferior)
 */
function initNavigation() {
  menuToggle.addEventListener("click", () => {
    sideMenu.classList.add("open");
    overlay.classList.add("active");
  });
  menuClose.addEventListener("click", fecharMenu);
  overlay.addEventListener("click", fecharMenu);
  menuItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const pageId = item.getAttribute("data-page");
      navigateToPage(pageId);
      fecharMenu();
    });
  });
  bottomNavItems.forEach((item) => {
    item.addEventListener("click", () => {
      const pageId = item.getAttribute("data-page");
      navigateToPage(pageId);
    });
  });

  window.addEventListener("resize", updateLayout);
}

function fecharMenu() {
  sideMenu.classList.remove("open");
  overlay.classList.remove("active");
}

function navigateToPage(pageId, push = true) {
  if (currentPage === pageId) return;
  if (!confirmExitIfEditing()) return;
  menuItems.forEach((i) => i.classList.toggle("active", i.getAttribute("data-page") === pageId));
  bottomNavItems.forEach((i) => i.classList.toggle("active", i.getAttribute("data-page") === pageId));
  pages.forEach((page) => page.classList.toggle("active", page.id === pageId));
  currentPage = pageId;
  if (usuarioAtual && usuarioAtual.admin) {
    if (pageId === 'usuarios') carregarUsuarios();
    if (pageId === 'registros') carregarRegistros();
  }
  if (pageId === 'perfil') carregarPerfil();
  if (push) {
    history.pushState({ pageId }, "", `#${pageId}`);
  }
}

function confirmExitIfEditing() {
  if (isEditing) {
    return confirm("Tem certeza que deseja sair? Dados não salvos serão perdidos.");
  }
  return true;
}

function fecharModalComConfirmacao(modal) {
  if (!modal) return;
  const requiresConfirm = modal.id === "produto-modal" || modal.id === "orcamento-modal";
  if (requiresConfirm && !confirmExitIfEditing()) {
    return;
  }
  modal.classList.remove("active");
  if (modal.id === "visualizar-orcamento-modal") {
    orcamentoPreview.innerHTML = "";
  }
  if (requiresConfirm) {
    isEditing = false;
  }
}

function initModals() {
  modalCloseBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      fecharModalComConfirmacao(modal);
    });
  });
  modalCancelBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      fecharModalComConfirmacao(modal);
    });
  });
  initProdutoModal();
  initOrcamentoModal();
  initSelecionarProdutosModal();
  initVisualizarOrcamentoModal();
}

function initHomePage() {
  cardProdutos.addEventListener("click", () => navigateToPage("produtos"));
  cardOrcamentos.addEventListener("click", () => navigateToPage("orcamentos"));
}

function initProdutosPage() {
  addProdutoBtn.addEventListener("click", () => abrirModalProduto());
  produtoSearch.addEventListener("input", () => {
    const termo = produtoSearch.value.toLowerCase();
    filtrarProdutos(termo);
  });
}

function initOrcamentosPage() {
  addOrcamentoBtn.addEventListener("click", () => abrirModalOrcamento());
  orcamentoSearch.addEventListener("input", () => {
    const termo = orcamentoSearch.value.toLowerCase();
    filtrarOrcamentos(termo);
  });
}

function initUsuariosPage() {
  if (!addUsuarioBtn) return;
  addUsuarioBtn.addEventListener("click", () => abrirModalUsuario());
}

function initPerfilPage() {
  if (!perfilForm) return;
  perfilFotoBtn.addEventListener('click', () => perfilFotoInput.click());
  perfilFotoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        perfilFotoPreview.src = ev.target.result;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });
  perfilForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarLoading();
    try {
      const formData = new FormData();
      formData.append('usuario', perfilNome.value);
      if (perfilSenha.value) formData.append('senha', perfilSenha.value);
      if (perfilFotoInput.files && perfilFotoInput.files[0]) {
        formData.append('foto', perfilFotoInput.files[0]);
      }
      const res = await fetch('/api/usuarios/me', { method: 'PUT', body: formData });
      if (!res.ok) throw new Error('Falha ao salvar perfil');
      const user = await res.json();
      usuarioAtual = { ...usuarioAtual, ...user };
      mostrarToast('Perfil atualizado');
    } catch (err) {
      console.error(err);
      mostrarToast('Erro ao salvar perfil');
    } finally {
      esconderLoading();
    }
  });
  carregarPerfil();
}

/**
 * Inicializa o modal de produto (com preview condicional)
 */
function initProdutoModal() {
  selectFotoBtn.addEventListener("click", () => produtoFotoInput.click());

  produtoFotoInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        fotoPreview.src = event.target.result;
        fotoPreviewContainer.style.display = "block"; // Mostra o preview
      };
      reader.readAsDataURL(e.target.files[0]);
    } else {
      // Se nenhum arquivo for selecionado (ou for cancelado), esconde o preview
      fotoPreview.src = "#"; // Limpa src anterior
      fotoPreviewContainer.style.display = "none";
    }
  });

  produtoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarLoading();
    try {
      const formData = new FormData();
      formData.append("nome", produtoNome.value);
      formData.append("descricao", produtoDescricao.value);
      formData.append("valor", produtoValor.value);
      // Anexa o arquivo de imagem apenas se um novo foi selecionado
      if (produtoFotoInput.files && produtoFotoInput.files[0]) {
        formData.append("foto", produtoFotoInput.files[0]);
      }
      // Se estiver editando e não selecionou nova foto, o backend manterá a antiga (Base64)

      const method = produtoId.value ? "PUT" : "POST";
      const url = produtoId.value ? `/api/produtos/${produtoId.value}` : "/api/produtos";

      const response = await fetch(url, { method, body: formData });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.erro || `Erro ${response.status} ao salvar produto`);
      }

      await carregarProdutos(); // Recarrega a lista para refletir a mudança
      produtoModal.classList.remove("active");
      isEditing = false;
      mostrarToast("Produto salvo com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      mostrarToast(`Erro ao salvar produto: ${error.message}`);
    } finally {
      esconderLoading();
    }
  });
}

/**
 * Inicializa o modal de orçamento
 */
function initOrcamentoModal() {
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      ativarTab(tab);
    });
  });
  prevTabBtn.addEventListener("click", navegarTabAnterior);
  nextTabBtn.addEventListener("click", navegarProximaTab);
  addProdutosBtn.addEventListener("click", abrirModalSelecionarProdutos);

  tipoDescontoSelect.addEventListener("change", () => {
    const tipo = tipoDescontoSelect.value;
    if (tipo === "nenhum") {
      valorDescontoGroup.style.display = "none";
      valorDescontoInput.value = "";
      valorDescontoInput.required = false;
    } else {
      valorDescontoGroup.style.display = "block";
      valorDescontoHelper.textContent = tipo === "percentual" ? "Digite a porcentagem de desconto (ex: 10 para 10%)" : "Digite o valor fixo do desconto em R$";
      valorDescontoInput.required = true;
    }
  });

  orcamentoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!clienteNome.value) {
      mostrarToast("Preencha o nome do cliente");
      ativarTab("cliente");
      return;
    }
    if (produtosSelecionados.length === 0) {
      mostrarToast("Selecione pelo menos um produto");
      ativarTab("produtos");
      return;
    }
    const templateSelecionado = document.querySelector(".template-item.selected");
    if (!templateSelecionado) {
      mostrarToast("Selecione um template");
      ativarTab("template");
      return;
    }
    if (valorDescontoInput.required && !valorDescontoInput.value) {
        mostrarToast("Preencha o valor do desconto");
        ativarTab("desconto");
        return;
    }

    mostrarLoading();
    try {
      const dadosOrcamento = {
        nomeCliente: clienteNome.value,
        enderecoCliente: clienteEndereco.value,
        telefoneCliente: clienteTelefone.value,
        emailCliente: clienteEmail.value,
        templateId: templateSelecionado.getAttribute("data-id"),
        produtos: produtosSelecionados.map((p) => ({ id: p.id, quantidade: p.quantidade })),
        observacoes: orcamentoObservacoes.value,
        tipoDesconto: tipoDescontoSelect.value === "nenhum" ? null : tipoDescontoSelect.value,
        valorDesconto: valorDescontoInput.value || 0,
      };

      const orcId = orcamentoIdInput.value;
      const response = await fetch(orcId ? `/api/orcamentos/${orcId}` : "/api/orcamentos", {
        method: orcId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosOrcamento),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.erro || `Erro ${response.status} ao criar orçamento`);
      }

      const orcamento = await response.json();
      await carregarOrcamentos();
      orcamentoModal.classList.remove("active");
      isEditing = false;
      mostrarToast(orcId ? "Orçamento atualizado" : "Orçamento criado com sucesso!");
      abrirModalVisualizarOrcamento(orcamento.id);
    } catch (error) {
      console.error("Erro ao criar orçamento:", error);
      mostrarToast(`Erro ao criar orçamento: ${error.message}`);
    } finally {
      esconderLoading();
    }
  });
}

function ativarTab(tabId) {
  tabBtns.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
  tabContents.forEach((content) => content.style.display = content.id === `tab-${tabId}` ? "block" : "none");
  atualizarBotoesNavegacaoTab();
}

function navegarTabAnterior() {
  const tabAtual = document.querySelector(".tab-btn.active");
  const tabAnterior = tabAtual.previousElementSibling;
  if (tabAnterior && tabAnterior.classList.contains("tab-btn")) {
    ativarTab(tabAnterior.getAttribute("data-tab"));
  }
}

function navegarProximaTab() {
  const tabAtual = document.querySelector(".tab-btn.active");
  const proximaTab = tabAtual.nextElementSibling;
  if (proximaTab && proximaTab.classList.contains("tab-btn")) {
    if (tabAtual.getAttribute("data-tab") === "cliente" && !clienteNome.value.trim()) {
      mostrarToast("Preencha o nome do cliente");
      return;
    }
    ativarTab(proximaTab.getAttribute("data-tab"));
  }
}

function atualizarBotoesNavegacaoTab() {
  const tabAtual = document.querySelector(".tab-btn.active");
  const isPrimeiraTab = !tabAtual.previousElementSibling?.classList.contains("tab-btn");
  const isUltimaTab = !tabAtual.nextElementSibling?.classList.contains("tab-btn");
  prevTabBtn.disabled = isPrimeiraTab;
  nextTabBtn.style.display = isUltimaTab ? "none" : "inline-flex";
  submitOrcamentoBtn.style.display = isUltimaTab ? "inline-flex" : "none";
}

function initSelecionarProdutosModal() {
  selecionarProdutosSearch.addEventListener("input", () => {
    const termo = selecionarProdutosSearch.value.toLowerCase();
    filtrarProdutosSelecionaveis(termo);
  });
  confirmarProdutosBtn.addEventListener("click", () => {
    selecionarProdutosModal.classList.remove("active");
    renderizarProdutosSelecionadosNoForm();
  });
}

function initVisualizarOrcamentoModal() {
  imprimirOrcamentoBtn.addEventListener("click", imprimirOrcamento);
  baixarPdfBtn.addEventListener("click", baixarPdfOrcamento);
  if (compartilharPdfBtn) {
    compartilharPdfBtn.addEventListener("click", compartilharPdfOrcamento);
  }
}

// --- Funções de Carregamento de Dados --- //

async function carregarProdutos() {
  try {
    const response = await fetch("/api/produtos");
    if (!response.ok) throw new Error("Erro ao buscar produtos");
    produtosCache = await response.json();
    renderizarProdutos();
  } catch (error) {
    console.error("Erro ao carregar produtos:", error);
    mostrarToast("Erro ao carregar produtos.");
    produtosCache = []; // Limpa cache em caso de erro
    renderizarProdutos(); // Renderiza estado vazio
  }
}

async function carregarTemplates() {
  try {
    const response = await fetch("/api/templates");
    if (!response.ok) throw new Error("Erro ao buscar templates");
    templatesCache = await response.json();
    // A renderização ocorre ao abrir o modal de orçamento
  } catch (error) {
    console.error("Erro ao carregar templates:", error);
    mostrarToast("Erro ao carregar templates.");
    templatesCache = [];
  }
}

async function carregarOrcamentos() {
  try {
    const response = await fetch("/api/orcamentos");
    if (!response.ok) throw new Error("Erro ao buscar orçamentos");
    orcamentosCache = await response.json();
    renderizarOrcamentos();
  } catch (error) {
    console.error("Erro ao carregar orçamentos:", error);
    mostrarToast("Erro ao carregar orçamentos.");
    orcamentosCache = [];
    renderizarOrcamentos();
  }
}

// --- Funções de Renderização --- //

function renderizarProdutos() {
  if (!produtosLista) return;
  if (produtosCache.length === 0) {
    produtosLista.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">inventory_2</span>
        <h3>Nenhum produto cadastrado</h3>
        <p>Adicione produtos para incluí-los nos orçamentos.</p>
        <button class="btn btn-primary" onclick="abrirModalProduto()">
          <span class="material-icons">add</span> Adicionar Produto
        </button>
      </div>
    `;
    return;
  }

  produtosLista.innerHTML = produtosCache
    .map((produto) => {
      // Usa a string Base64 diretamente se existir, senão usa placeholder
      const imgSrc = produto.foto ? produto.foto : "/images/placeholder.png";
      return `
        <div class="item-card" data-id="${produto.id}">
          <img src="${imgSrc}" alt="${produto.nome}" class="item-image" loading="lazy">
          <div class="item-details">
            <div class="item-title">${produto.nome}</div>
            <div class="item-subtitle">${formatarMoeda(produto.valor)}</div>
          </div>
          <div class="item-actions">
            <button class="btn-icon edit-produto" aria-label="Editar">
              <span class="material-icons">edit</span>
            </button>
            <button class="btn-icon delete-produto" aria-label="Excluir">
              <span class="material-icons">delete</span>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  // Adiciona eventos após renderizar
  produtosLista.querySelectorAll(".edit-produto").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const produtoId = e.target.closest(".item-card").getAttribute("data-id");
      abrirModalProduto(produtoId);
      e.stopPropagation();
    });
  });

  produtosLista.querySelectorAll(".delete-produto").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const produtoId = e.target.closest(".item-card").getAttribute("data-id");
      confirmarExclusaoProduto(produtoId);
      e.stopPropagation();
    });
  });
}

function renderizarOrcamentos() {
  if (!orcamentosLista) return;
  if (orcamentosCache.length === 0) {
    orcamentosLista.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">description</span>
        <h3>Nenhum orçamento cadastrado</h3>
        <p>Crie seu primeiro orçamento.</p>
         <button class="btn btn-primary" onclick="abrirModalOrcamento()">
          <span class="material-icons">add</span> Criar Orçamento
        </button>
      </div>
    `;
    return;
  }

  const orcamentosOrdenados = [...orcamentosCache].sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

  orcamentosLista.innerHTML = orcamentosOrdenados
    .map((orcamento) => `
      <div class="item-card" data-id="${orcamento.id}">
        <div class="item-details">
          <div class="item-title">${orcamento.nomeCliente} (ID: ${orcamento.id})</div>
          <div class="item-subtitle">
            ${formatarData(orcamento.dataCriacao)} - ${formatarMoeda(orcamento.valorTotal)}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-icon view-orcamento" aria-label="Visualizar">
            <span class="material-icons">visibility</span>
          </button>
          <button class="btn-icon edit-orcamento" aria-label="Editar">
            <span class="material-icons">edit</span>
          </button>
          <button class="btn-icon delete-orcamento" aria-label="Excluir">
            <span class="material-icons">delete</span>
          </button>
        </div>
      </div>
    `)
    .join("");

  orcamentosLista.querySelectorAll(".view-orcamento").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const orcamentoId = e.target.closest(".item-card").getAttribute("data-id");
      abrirModalVisualizarOrcamento(orcamentoId);
      e.stopPropagation();
    });
  });

  orcamentosLista.querySelectorAll(".edit-orcamento").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const orcamentoId = e.target.closest(".item-card").getAttribute("data-id");
      abrirModalEditarOrcamento(orcamentoId);
      e.stopPropagation();
    });
  });

  orcamentosLista.querySelectorAll(".delete-orcamento").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const orcamentoId = e.target.closest(".item-card").getAttribute("data-id");
      confirmarExclusaoOrcamento(orcamentoId);
      e.stopPropagation();
    });
  });
}

function renderizarTemplates() {
  if (!templatesLista) return;
  if (templatesCache.length === 0) {
    templatesLista.innerHTML = `<div class="empty-state"><p>Nenhum template disponível</p></div>`;
    return;
  }
  templatesLista.innerHTML = templatesCache
    .map((template) => `
      <div class="template-item" data-id="${template.id}">
        <span class="material-icons">description</span>
        <span>${template.nome}</span>
      </div>
    `)
    .join("");
  templatesLista.querySelectorAll(".template-item").forEach((item) => {
    item.addEventListener("click", () => {
      templatesLista.querySelectorAll(".template-item").forEach((i) => i.classList.remove("selected"));
      item.classList.add("selected");
    });
  });
}

function renderizarProdutosSelecionaveis() {
  if (!selecionarProdutosLista) return;
  if (produtosCache.length === 0) {
    selecionarProdutosLista.innerHTML = `<div class="empty-state"><p>Nenhum produto cadastrado</p></div>`;
    return;
  }

  selecionarProdutosLista.innerHTML = produtosCache
    .map((produto) => {
      const selecionado = produtosSelecionados.find((p) => p.id === produto.id);
      const quantidade = selecionado ? selecionado.quantidade : 0;
      const imgSrc = produto.foto ? produto.foto : "/images/placeholder.png";
      return `
        <div class="item-card selectable ${selecionado ? "selected" : ""}" data-id="${produto.id}">
          <img src="${imgSrc}" alt="${produto.nome}" class="item-image" loading="lazy">
          <div class="item-details">
            <div class="item-title">${produto.nome}</div>
            <div class="item-subtitle">${formatarMoeda(produto.valor)}</div>
          </div>
          <div class="item-quantity">
            <button class="btn-icon quantity-decrease" ${quantidade === 0 ? "disabled" : ""}>-</button>
            <input type="number" class="quantity-input" value="${quantidade}" min="0">
            <button class="btn-icon quantity-increase">+</button>
          </div>
        </div>
      `;
    })
    .join("");

  selecionarProdutosLista.querySelectorAll(".item-card.selectable").forEach(card => {
    const produtoId = card.getAttribute("data-id");
    const input = card.querySelector(".quantity-input");
    const decreaseBtn = card.querySelector(".quantity-decrease");
    const increaseBtn = card.querySelector(".quantity-increase");

    input.addEventListener("change", (e) => {
        const novaQuantidade = parseInt(e.target.value, 10) || 0;
        atualizarQuantidadeProdutoSelecionado(produtoId, novaQuantidade, card);
    });
    decreaseBtn.addEventListener("click", () => {
        const novaQuantidade = Math.max(0, (parseInt(input.value, 10) || 0) - 1);
        input.value = novaQuantidade;
        atualizarQuantidadeProdutoSelecionado(produtoId, novaQuantidade, card);
    });
    increaseBtn.addEventListener("click", () => {
        const novaQuantidade = (parseInt(input.value, 10) || 0) + 1;
        input.value = novaQuantidade;
        atualizarQuantidadeProdutoSelecionado(produtoId, novaQuantidade, card);
    });
  });
}

function renderizarProdutosSelecionadosNoForm() {
  if (!produtosSelecionadosEl) return;
  if (produtosSelecionados.length === 0) {
    produtosSelecionadosEl.innerHTML = `<div class="empty-state"><p>Nenhum produto selecionado</p></div>`;
    return;
  }

  produtosSelecionadosEl.innerHTML = produtosSelecionados
    .map((produto) => {
        const imgSrc = produto.foto ? produto.foto : "/images/placeholder.png";
        return `
          <div class="selected-item" data-id="${produto.id}">
            <img src="${imgSrc}" alt="${produto.nome}" class="item-image-small" loading="lazy">
            <div class="item-details">
              <span>${produto.nome} (Qtd: ${produto.quantidade})</span>
            </div>
            <button class="btn-icon remove-produto-selecionado" aria-label="Remover">
              <span class="material-icons">close</span>
            </button>
          </div>
        `;
    })
    .join("");

  produtosSelecionadosEl.querySelectorAll(".remove-produto-selecionado").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const produtoId = e.target.closest(".selected-item").getAttribute("data-id");
        atualizarQuantidadeProdutoSelecionado(produtoId, 0); // Remove ao setar qtd para 0
        renderizarProdutosSelecionadosNoForm(); // Re-renderiza a lista no form
      });
    });
}

// --- Funções de Abertura de Modais --- //

async function abrirModalProduto(id = null) {
  produtoForm.reset();
  produtoId.value = "";
  produtoFotoInput.value = ""; // Limpa seleção de arquivo anterior
  fotoPreview.src = "#"; // Limpa src do preview
  fotoPreviewContainer.style.display = "none"; // Esconde o preview inicialmente

  if (id) {
    produtoModalTitle.textContent = "Editar Produto";
    // Busca o produto completo (com foto) da API, pois o cache pode não ter
    mostrarLoading();
    try {
        const response = await fetch(`/api/produtos/${id}`);
        if (!response.ok) throw new Error("Produto não encontrado para edição.");
        const produto = await response.json();

        produtoId.value = produto.id;
        produtoNome.value = produto.nome;
        produtoDescricao.value = produto.descricao || "";
        produtoValor.value = produto.valor;
        // Se o produto tem foto, mostra no preview
        if (produto.foto) {
            fotoPreview.src = produto.foto;
            fotoPreviewContainer.style.display = "block";
        }
    } catch (error) {
        console.error("Erro ao buscar produto para edição:", error);
        mostrarToast(error.message || "Erro ao carregar dados do produto.");
        esconderLoading();
        return; // Não abre o modal se não conseguir carregar
    } finally {
        esconderLoading();
    }

  } else {
    produtoModalTitle.textContent = "Novo Produto";
    // Garante que campos estejam limpos para novo produto
    produtoNome.value = "";
    produtoDescricao.value = "";
    produtoValor.value = "";
  }
  produtoModal.classList.add("active");
  isEditing = true;
}

function abrirModalOrcamento() {
  orcamentoForm.reset();
  produtosSelecionados = [];
  renderizarProdutosSelecionadosNoForm();
  renderizarTemplates();
  ativarTab("cliente");
  tipoDescontoSelect.value = "nenhum";
  valorDescontoGroup.style.display = "none";
  valorDescontoInput.value = "";
  valorDescontoInput.required = false;
  orcamentoIdInput.value = "";
  orcamentoModal.classList.add("active");
  isEditing = true;
}

async function abrirModalEditarOrcamento(id) {
  if (!id) return;
  orcamentoForm.reset();
  produtosSelecionados = [];
  ativarTab("cliente");
  mostrarLoading();
  try {
    const res = await fetch(`/api/orcamentos/${id}`);
    if (!res.ok) throw new Error("Orçamento não encontrado");
    const orc = await res.json();
    orcamentoIdInput.value = id;
    clienteNome.value = orc.nomeCliente;
    clienteEndereco.value = orc.enderecoCliente || "";
    clienteTelefone.value = orc.telefoneCliente || "";
    clienteEmail.value = orc.emailCliente || "";
    orcamentoObservacoes.value = orc.observacoes || "";
    tipoDescontoSelect.value = orc.tipoDesconto || "nenhum";
    if (orc.tipoDesconto && orc.valorDescontoInput) {
      valorDescontoInput.value = orc.valorDescontoInput;
      valorDescontoGroup.style.display = "block";
      valorDescontoInput.required = true;
    } else {
      valorDescontoInput.value = "";
      valorDescontoGroup.style.display = "none";
      valorDescontoInput.required = false;
    }
    produtosSelecionados = orc.itens.map(it => ({
      id: it.id,
      nome: it.nome,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
      foto: it.foto
    }));
    renderizarProdutosSelecionadosNoForm();
    await carregarTemplates();
    renderizarTemplates();
    templatesLista.querySelectorAll(".template-item").forEach(item => {
      item.classList.toggle("selected", item.getAttribute("data-id") === orc.templateId);
    });
    orcamentoModal.classList.add("active");
    isEditing = true;
  } catch (err) {
    console.error("Erro ao abrir orçamento para edição", err);
    mostrarToast("Erro ao carregar orçamento");
  } finally {
    esconderLoading();
  }
}

function abrirModalSelecionarProdutos() {
  renderizarProdutosSelecionaveis();
  selecionarProdutosModal.classList.add("active");
}

async function abrirModalVisualizarOrcamento(id) {
  if (!id) return;
  iniciarProgressoPdf();
  orcamentoPreview.innerHTML = `<div class="loading"><div class="spinner"></div><p>Gerando pré-visualização...</p></div>`;
  visualizarOrcamentoModal.classList.add("active");

  try {
    const response = await fetch(`/api/orcamentos/${id}/gerar`);
    if (!response.ok) {
      throw new Error("Erro ao gerar pré-visualização do orçamento");
    }
    const data = await response.json();
    orcamentoPreview.innerHTML = data.html;
    imprimirOrcamentoBtn.setAttribute("data-id", id);
    baixarPdfBtn.setAttribute("data-id", id);
    if (compartilharPdfBtn) compartilharPdfBtn.setAttribute("data-id", id);
  } catch (error) {
    console.error("Erro ao visualizar orçamento:", error);
    orcamentoPreview.innerHTML = `<p class="error">Erro ao carregar orçamento: ${error.message}</p>`;
    mostrarToast("Erro ao carregar orçamento.");
  } finally {
    finalizarProgressoPdf();
  }
}

// --- Funções de Ação (Excluir, Editar, etc.) --- //

function confirmarExclusaoProduto(id) {
  if (confirm("Tem certeza que deseja excluir este produto?")) {
    excluirProduto(id);
  }
}

async function excluirProduto(id) {
  mostrarLoading();
  try {
    const response = await fetch(`/api/produtos/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Erro ao excluir produto");
    }
    await carregarProdutos();
    mostrarToast("Produto excluído com sucesso!");
  } catch (error) {
    console.error("Erro ao excluir produto:", error);
    mostrarToast("Erro ao excluir produto.");
  } finally {
    esconderLoading();
  }
}

function confirmarExclusaoOrcamento(id) {
  if (confirm("Tem certeza que deseja excluir este orçamento?")) {
    excluirOrcamento(id);
  }
}

async function excluirOrcamento(id) {
  mostrarLoading();
  try {
    const response = await fetch(`/api/orcamentos/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Erro ao excluir orçamento");
    }
    await carregarOrcamentos();
    mostrarToast("Orçamento excluído com sucesso!");
  } catch (error) {
    console.error("Erro ao excluir orçamento:", error);
    mostrarToast("Erro ao excluir orçamento.");
  } finally {
    esconderLoading();
  }
}

function atualizarQuantidadeProdutoSelecionado(produtoId, quantidade, cardElement = null) {
    const index = produtosSelecionados.findIndex(p => p.id === produtoId);
    const produtoOriginal = produtosCache.find(p => p.id === produtoId);
    if (!produtoOriginal) return;

    if (quantidade > 0) {
        if (index > -1) {
            produtosSelecionados[index].quantidade = quantidade;
        } else {
            produtosSelecionados.push({
                id: produtoId,
                nome: produtoOriginal.nome,
                valorUnitario: produtoOriginal.valor,
                quantidade: quantidade,
                foto: produtoOriginal.foto // Inclui a foto base64 na seleção
            });
        }
        if (cardElement) cardElement.classList.add("selected");
    } else {
        if (index > -1) {
            produtosSelecionados.splice(index, 1);
        }
        if (cardElement) cardElement.classList.remove("selected");
    }
    if (cardElement) {
        const decreaseBtn = cardElement.querySelector(".quantity-decrease");
        if (decreaseBtn) decreaseBtn.disabled = quantidade === 0;
    }
}

// --- Funções de Filtragem --- //

function filtrarProdutos(termo) {
  const itens = produtosLista.querySelectorAll(".item-card");
  itens.forEach((item) => {
    const nome = item.querySelector(".item-title").textContent.toLowerCase();
    item.style.display = nome.includes(termo) ? "flex" : "none";
  });
}

function filtrarOrcamentos(termo) {
  const itens = orcamentosLista.querySelectorAll(".item-card");
  itens.forEach((item) => {
    const nome = item.querySelector(".item-title").textContent.toLowerCase();
    item.style.display = nome.includes(termo) ? "flex" : "none";
  });
}

function filtrarProdutosSelecionaveis(termo) {
  const itens = selecionarProdutosLista.querySelectorAll(".item-card");
  itens.forEach((item) => {
    const nome = item.querySelector(".item-title").textContent.toLowerCase();
    item.style.display = nome.includes(termo) ? "flex" : "none";
  });
}

// --- Funções de Ação do Orçamento (PDF, Imprimir) --- //

async function baixarPdfOrcamento() {
  const orcamentoId = baixarPdfBtn.getAttribute("data-id");
  if (!orcamentoId) return;
  iniciarProgressoPdf();
  try {
    const response = await fetch(`/api/orcamentos/${orcamentoId}/pdf`);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Erro ${response.status} ao gerar PDF`);
    }
    const disposition = response.headers.get("content-disposition");
    let filename = `orcamento_${orcamentoId}.pdf`;
    if (disposition && disposition.indexOf("attachment") !== -1) {
      const filenameRegex = /filename[^;=\n]*=(([""]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) filename = matches[1].replace(/[""]/g, "");
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
    mostrarToast("Download do PDF iniciado!");
  } catch (error) {
    console.error("Erro ao baixar PDF:", error);
    mostrarToast(`Erro ao baixar PDF: ${error.message}`);
  } finally {
    finalizarProgressoPdf();
  }
}

async function compartilharPdfOrcamento() {
  const orcamentoId = compartilharPdfBtn.getAttribute("data-id");
  if (!orcamentoId) return;
  iniciarProgressoPdf();
  try {
    const response = await fetch(`/api/orcamentos/${orcamentoId}/pdf`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Erro ${response.status} ao gerar PDF`);
    }
    const blob = await response.blob();
    const file = new File([blob], `orcamento_${orcamentoId}.pdf`, { type: "application/pdf" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Orçamento",
        text: "Confira este orçamento",
      });
    } else {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orcamento_${orcamentoId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      mostrarToast("PDF baixado. Compartilhe manualmente.");
    }
  } catch (error) {
    console.error("Erro ao compartilhar PDF:", error);
    mostrarToast(`Erro ao compartilhar PDF: ${error.message}`);
  } finally {
    finalizarProgressoPdf();
  }
}

function imprimirOrcamento() {
  const orcamentoId = imprimirOrcamentoBtn.getAttribute("data-id");
  if (!orcamentoId) return;
  const conteudo = orcamentoPreview.innerHTML;
  const janelaImpressao = window.open("", "_blank");
  janelaImpressao.document.write(`
    <html>
      <head>
        <title>Imprimir Orçamento ${orcamentoId}</title>
        <link rel="stylesheet" href="/css/modern-style.css">
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .modal-actions { display: none; }
          }
          /* Adicione estilos específicos de impressão aqui, se necessário */
          body { margin: 20px; }
          .orcamento-preview-container { border: none; box-shadow: none; }
        </style>
      </head>
      <body>
        ${conteudo}
        <script> window.onload = () => window.print(); setTimeout(() => window.close(), 100); </script>
      </body>
    </html>
  `);
  janelaImpressao.document.close();
}

// --- Funções Utilitárias --- //

function formatarMoeda(valor) {
  const numValor = Number(valor);
  if (isNaN(numValor)) return "R$ 0,00";
  return numValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(dataString) {
  if (!dataString) return "";
  const data = new Date(dataString);
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function mostrarToast(mensagem) {
  if (!toast) return;
  if (toastMessage) {
    toastMessage.textContent = mensagem;
  } else {
    toast.textContent = mensagem;
  }
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function mostrarLoading() {
  if (loadingSpinner) loadingSpinner.style.display = "flex";
}

function esconderLoading() {
  if (loadingSpinner) loadingSpinner.style.display = "none";
}

let pdfProgressInterval = null;
function iniciarProgressoPdf() {
  if (!pdfProgressOverlay || !pdfProgressBar) return;
  pdfProgressBar.style.width = "0%";
  pdfProgressOverlay.classList.add("active");
  let progress = 0;
  pdfProgressInterval = setInterval(() => {
    progress += Math.random() * 10;
    if (progress > 90) progress = 90;
    pdfProgressBar.style.width = progress + "%";
  }, 200);
}

function finalizarProgressoPdf() {
  if (!pdfProgressOverlay || !pdfProgressBar) return;
  if (pdfProgressInterval) clearInterval(pdfProgressInterval);
  pdfProgressBar.style.width = "100%";
  setTimeout(() => {
    pdfProgressOverlay.classList.remove("active");
    pdfProgressBar.style.width = "0%";
    pdfProgressInterval = null;
  }, 400);
}

// --- Usuários (Admin) --- //
async function carregarUsuarios() {
  try {
    const res = await fetch('/api/usuarios');
    if (!res.ok) throw new Error('Erro ao buscar usuários');
    usuariosCache = await res.json();
    renderizarUsuarios();
  } catch (err) {
    console.error('Falha ao carregar usuários', err);
    mostrarToast('Erro ao carregar usuários');
    usuariosCache = [];
    renderizarUsuarios();
  }
}

function renderizarUsuarios() {
  if (!usuariosLista) return;
  if (usuariosCache.length === 0) {
    usuariosLista.innerHTML = '<p>Nenhum usuário cadastrado</p>';
    return;
  }
  usuariosLista.innerHTML = usuariosCache.map(u => `
    <div class="item-card" data-id="${u.id}">
      <div class="item-details">
        <div class="item-title">${u.usuario}</div>
        <div class="item-subtitle">${u.admin ? 'Admin' : 'Usuário'}</div>
      </div>
    </div>
  `).join('');

  usuariosLista.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      const u = usuariosCache.find(x => x.id === id);
      if (u) abrirModalUsuario(u);
    });
  });
}

function abrirModalUsuario(usuario = null) {
  usuarioForm.reset();
  if (usuario) {
    usuarioId.value = usuario.id;
    usuarioNome.value = usuario.usuario;
    usuarioAdmin.checked = !!usuario.admin;
    usuarioFoto.value = '';
    if (usuario.foto) {
      // not previewed but inform file cannot be set programmatically
    }
    usuarioModalTitle.textContent = 'Editar Usuário';
  } else {
    usuarioId.value = '';
    usuarioModalTitle.textContent = 'Novo Usuário';
  }
  usuarioModal.classList.add('active');
  isEditing = true;
}

usuarioForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const formData = new FormData();
    formData.append('usuario', usuarioNome.value);
    formData.append('senha', usuarioSenha.value);
    formData.append('admin', usuarioAdmin.checked);
    if (usuarioFoto.files && usuarioFoto.files[0]) {
      formData.append('foto', usuarioFoto.files[0]);
    }
    const method = usuarioId.value ? 'PUT' : 'POST';
    const url = usuarioId.value ? `/api/usuarios/${usuarioId.value}` : '/api/usuarios';
    const res = await fetch(url, { method, body: formData });
    if (!res.ok) throw new Error('Falha ao salvar usuário');
    usuarioModal.classList.remove('active');
    isEditing = false;
    await carregarUsuarios();
    mostrarToast('Usuário salvo');
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao salvar usuário');
  }
});

document.querySelectorAll('#usuario-modal .modal-close, #usuario-modal .modal-cancel').forEach(btn => {
  btn.addEventListener('click', () => fecharModalComConfirmacao(usuarioModal));
});

// --- Registros (Admin) --- //
async function carregarRegistros() {
  try {
    const res = await fetch('/api/logs');
    if (!res.ok) throw new Error('Erro ao buscar registros');
    registrosCache = await res.json();
    renderizarRegistros();
  } catch (err) {
    console.error('Falha ao carregar registros', err);
    mostrarToast('Erro ao carregar registros');
    registrosCache = [];
    renderizarRegistros();
  }
}

function renderizarRegistros() {
  if (!registrosLista) return;
  if (registrosCache.length === 0) {
    registrosLista.innerHTML = '<p>Nenhum registro disponível</p>';
    return;
  }
  registrosLista.innerHTML = registrosCache.map(l => `
    <div class="item-card">
      <div class="item-details">
        <div class="item-title">${l.descricao}</div>
        <div class="item-subtitle">${formatarData(l.timestamp)} - ${l.usuario}</div>
      </div>
    </div>
  `).join('');
}

async function carregarPerfil() {
  if (!perfilForm) return;
  try {
    const res = await fetch('/api/usuarios/me');
    if (!res.ok) throw new Error('Erro ao carregar perfil');
    const user = await res.json();
    perfilNome.value = user.usuario;
    if (user.foto) perfilFotoPreview.src = user.foto;
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao carregar perfil');
  }
}

// --- Service Worker e PWA --- //

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => console.log("Service worker registrado:", reg))
      .catch((err) => console.log("Erro ao registrar service worker:", err));
  });
}

function initInstallPrompt() {
  const installButton = document.getElementById("install-app-btn");
  if (!installButton) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installButton.style.display = "inline-flex"; // Mostra o botão
  });

  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installButton.style.display = "none"; // Esconde após tentativa
    }
  });

  window.addEventListener("appinstalled", () => {
    console.log("PWA instalado com sucesso!");
    installButton.style.display = "none";
  });
}

