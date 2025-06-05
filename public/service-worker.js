/**
 * Service Worker para o PWA de Orçamentos
 * 
 * Este arquivo implementa o service worker para permitir o funcionamento
 * offline do aplicativo, cacheando recursos estáticos e dinâmicos.
 * 
 * @author Manus
 * @version 1.0.0
 */

// Nome do cache
const CACHE_NAME = 'orcafacil-v1';

// Recursos para cache inicial
const INITIAL_CACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/jspdf.umd.min.js',
  '/manifest.json',
  '/api/produtos',
  '/api/templates',
  '/images/placeholder.png',
  '/images/icons/icon-72x72.png',
  '/images/icons/icon-96x96.png',
  '/images/icons/icon-128x128.png',
  '/images/icons/icon-144x144.png',
  '/images/icons/icon-152x152.png',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-384x384.png',
  '/images/icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons'
];

// Instalação do service worker
self.addEventListener('install', event => {
  console.log('Service Worker instalando...');

  // Pré-cache de recursos estáticos
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(INITIAL_CACHE_URLS);
      })
      .then(precacheApiData)
      .then(() => {
        console.log('Recursos iniciais em cache');
        return self.skipWaiting();
      })
  );
});

async function precacheApiData() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const [produtos, templates] = await Promise.all([
      fetch('/api/produtos'),
      fetch('/api/templates')
    ]);
    if (produtos.ok) await cache.put('/api/produtos', produtos.clone());
    if (templates.ok) await cache.put('/api/templates', templates.clone());
  } catch (err) {
    console.warn('Falha ao pré-carregar dados da API', err);
  }
}

// Ativação do service worker
self.addEventListener('activate', event => {
  console.log('Service Worker ativando...');
  
  // Limpa caches antigos
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker ativo e controlando a página');
      return self.clients.claim();
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
  // Ignora requisições não GET
  if (event.request.method !== 'GET') return;
  

  // Responde com cache para produtos e templates quando offline
  if (event.request.url.includes('/api/produtos') || event.request.url.includes('/api/templates')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Ignora outras requisições de API
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // Estratégia Cache First para recursos estáticos
  if (isStaticAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then(response => {
              // Não armazena em cache se a resposta não for válida
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Armazena em cache a resposta
              let responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            });
        })
    );
  } else {
    // Estratégia Network First para outros recursos
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Não armazena em cache se a resposta não for válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Armazena em cache a resposta
          let responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});

// Notificações push
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Notificação', body: 'Você tem uma nova mensagem.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/images/icons/icon-192x192.png'
    })
  );
});

/**
 * Verifica se a URL é de um recurso estático
 * @param {string} url - URL da requisição
 * @returns {boolean} - true se for um recurso estático
 */
function isStaticAsset(url) {
  const staticExtensions = [
    '.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', 
    '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'
  ];
  
  return staticExtensions.some(ext => url.endsWith(ext)) || 
         url.includes('fonts.googleapis.com') || 
         url.includes('fonts.gstatic.com');
}

