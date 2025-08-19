/* ClockStore - JS principal
   - Catálogo com filtros/ordenação e busca
   - Carrinho com localStorage
   - Checkout com validação simples
*/

// ===== Utils =====
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const money = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ===== Helpers (sorting, pagination buttons) =====
function applySort(arr, key){
  switch(key){
    case 'price-asc': return arr.sort((a,b)=>a.price-b.price);
    case 'price-desc': return arr.sort((a,b)=>b.price-a.price);
    case 'name-asc': return arr.sort((a,b)=>a.name.localeCompare(b.name));
    case 'name-desc': return arr.sort((a,b)=>b.name.localeCompare(a.name));
    default: return arr;
  }
}
function createPageButton(label, gotoPage, opts, onClick){
  const b = document.createElement('button');
  b.className = 'page-btn';
  b.textContent = String(label);
  if (opts?.disabled){ b.disabled = true; b.setAttribute('aria-disabled','true'); }
  if (opts?.current) b.setAttribute('aria-current','page');
  if (!opts?.disabled && !opts?.current && typeof onClick === 'function'){
    b.addEventListener('click', ()=> onClick(gotoPage));
  }
  return b;
}

// Pure helpers to keep initHome() lighter
function filterProducts(products, state){
  const { category, query, onlyFav, selBrands, priceMin, priceMax, minRating, selTag, onlyFree, sort } = state;
  const list = products
    .filter(p => (!category || p.category===category))
    .filter(p => (!query || (p.name+" "+(p.brand||'')).toLowerCase().includes(query)))
    .filter(p => (!onlyFav || Wishlist.has(p.id)))
    .filter(p => (selBrands.size===0 || selBrands.has(p.brand)))
    .filter(p => (priceMin==null || p.price >= priceMin))
    .filter(p => (priceMax==null || p.price <= priceMax))
    .filter(p => (minRating==null || getRatingForProduct(p).rating >= minRating))
    .filter(p => (!selTag || (p.tag||'')===selTag))
    .filter(p => (!onlyFree || p.price >= 300));
  return applySort(list, sort);
}
function paginate(list, page, pageSize){
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const visible = list.slice(start, start + pageSize);
  return { total, totalPages, start, visible, page: safePage };
}

const CART_KEY = 'clockstore_cart_v1';
const ORDER_KEY = 'clockstore_last_order_v1';
const SUBS_KEY = 'clockstore_subs_v1';
const COUPON_KEY = 'clockstore_coupon_v1';

const Storage = {
  getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  },
  setCart(items) { localStorage.setItem(CART_KEY, JSON.stringify(items)); },
  clearCart() { localStorage.removeItem(CART_KEY); },
  setOrder(order) { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); },
  getOrder() { try { return JSON.parse(localStorage.getItem(ORDER_KEY)||'null'); } catch { return null } },
  subscribe(email){
    const list = (()=>{ try{ return JSON.parse(localStorage.getItem(SUBS_KEY)||'[]'); }catch{ return []; } })();
    if (email && !list.includes(email)) list.push(email);
    localStorage.setItem(SUBS_KEY, JSON.stringify(list));
  },
  setCoupon(code){ if(code) localStorage.setItem(COUPON_KEY, String(code)); else localStorage.removeItem(COUPON_KEY); },
  getCoupon(){ return localStorage.getItem(COUPON_KEY) || ''; }
};

// ===== Image mapping by category =====
const CATEGORY_IMAGES = {
  'masculino': 'assets/imgs/relogio.png',
  'feminino': 'assets/imgs/relogio.png',
  'esportivo': 'assets/imgs/relogio.png',
  'clássico': 'assets/imgs/relogio.png',
};
function getImageForProduct(p){
  return CATEGORY_IMAGES[p.category] || p.image;
}

// ===== Ratings helpers =====
function hashStr(s){ let h=0; for (let i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h|=0; } return Math.abs(h); }
function getRatingForProduct(p){
  const h = hashStr(p.id + p.name);
  const rating = 4 + ((h % 10) / 20); // 4.0 .. 4.45
  const count = 60 + (h % 240); // 60..299
  return { rating: Math.round(rating*2)/2, count };
}
function renderStars(rating){
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `${'<i class="fa-solid fa-star"></i>'.repeat(full)}${half?'<i class="fa-solid fa-star-half-stroke"></i>':''}${'<i class="fa-regular fa-star"></i>'.repeat(empty)}`;
}

// ===== Pricing helpers (frete e cupom) =====
function normalizeCoupon(code){ return String(code||'').trim().toUpperCase(); }
function getDiscountPercent(coupon){
  const c = normalizeCoupon(coupon);
  if (c === 'CLOCK10' || c === 'WELCOME10') return 0.10; // 10%
  return 0;
}
function hasFreeShipping(coupon, subtotalAfterDiscount){
  const c = normalizeCoupon(coupon);
  if (c === 'FRETEGRATIS') return true;
  return subtotalAfterDiscount >= 300; // frete grátis acima de R$300
}
function calcShipping(coupon, subtotalAfterDiscount){
  if (subtotalAfterDiscount <= 0) return 0;
  return hasFreeShipping(coupon, subtotalAfterDiscount) ? 0 : 19.9;
}
function calcTotals(items, coupon){
  const subtotal = items.reduce((a,b)=>a + b.qtd*b.price, 0);
  const discount = subtotal * getDiscountPercent(coupon);
  const after = Math.max(0, subtotal - discount);
  const shipping = calcShipping(coupon, after);
  const total = after + shipping;
  return { subtotal, discount, shipping, total };
}

// ===== Mock de produtos (poderia vir de API/JSON) =====
const PRODUCTS = [
  { id: 'w001', name: 'Apex Steel', brand: 'Zenith', category: 'masculino', price: 699.9, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Novo' },
  { id: 'w002', name: 'Luna Pearl', brand: 'Aurora', category: 'feminino', price: 549.5, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Top' },
  { id: 'w003', name: 'SportX Pro', brand: 'Vector', category: 'esportivo', price: 459.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Promo' },
  { id: 'w004', name: 'Classic Gold', brand: 'Royal', category: 'clássico', price: 1199.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Luxo' },
  { id: 'w005', name: 'Urban Slate', brand: 'Metro', category: 'masculino', price: 389.9, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Promo' },
  { id: 'w006', name: 'Bloom Rose', brand: 'Fleur', category: 'feminino', price: 429.9, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Novo' },
  { id: 'w007', name: 'Runner Fit', brand: 'Pulse', category: 'esportivo', price: 299.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Top' },
  { id: 'w008', name: 'Vintage Leather', brand: 'Heritage', category: 'clássico', price: 649.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Vintage' },
  { id: 'w009', name: 'Ocean Blue', brand: 'Mariner', category: 'esportivo', price: 379.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Verão' },
  { id: 'w010', name: 'Noir Minimal', brand: 'Mono', category: 'masculino', price: 499.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Minimal' },
  { id: 'w011', name: 'Pearl Shine', brand: 'Eden', category: 'feminino', price: 589.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Brilho' },
  { id: 'w012', name: 'Retro Bronze', brand: 'Era', category: 'clássico', price: 729.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Retro' },
  { id: 'w013', name: 'Trail Master', brand: 'Hike', category: 'esportivo', price: 339.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Aventura' },
  { id: 'w014', name: 'Silver Edge', brand: 'Prime', category: 'masculino', price: 569.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Top' },
  { id: 'w015', name: 'Rose Velvet', brand: 'Charm', category: 'feminino', price: 519.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Novo' },
  { id: 'w016', name: 'Chrono Graphite', brand: 'Vector', category: 'esportivo', price: 469.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Novo' },
  { id: 'w017', name: 'Ivory Classic', brand: 'Royal', category: 'clássico', price: 799.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Luxo' },
  { id: 'w018', name: 'Midnight Blue', brand: 'Zenith', category: 'masculino', price: 619.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Top' },
  { id: 'w019', name: 'Blush Petite', brand: 'Fleur', category: 'feminino', price: 309.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Leve' },
  { id: 'w020', name: 'Rally Carbon', brand: 'Pulse', category: 'esportivo', price: 359.0, image: 'https://png.pngtree.com/png-vector/20241015/ourmid/pngtree-rolex-mens-watch-isolated-png-image_14092707.png', tag: 'Esportivo' },
];

// ===== Cart =====
const Cart = {
  items: Storage.getCart(),
  save(){ Storage.setCart(this.items); this.renderBadge(); },
  find(id){ return this.items.find(i => i.id === id); },
  add(prod){
    const f = this.find(prod.id);
    if (f) { f.qtd += 1; }
    else { this.items.push({ id: prod.id, name: prod.name, brand: prod.brand, price: prod.price, image: prod.image, qtd: 1 }); }
    this.save();
  },
  setQty(id, qtd){
    const it = this.find(id);
    if (!it) return;
    it.qtd = Math.max(1, Number(qtd)||1);
    this.save();
  },
  remove(id){ this.items = this.items.filter(i => i.id !== id); this.save(); },
  count(){ return this.items.reduce((a,b)=>a+b.qtd,0); },
  total(){ return this.items.reduce((a,b)=>a + b.qtd*b.price,0); },
  clear(){ this.items = []; this.save(); },
  renderBadge(){
    const n = this.count();
    const el1 = $('#cartCount'); if (el1) el1.textContent = n;
    const el2 = $('#cartFloatCount'); if (el2) el2.textContent = n;
  }
};

// Smooth scroll with header offset
function smoothScrollToId(id){
  const header = document.querySelector('.header');
  const offset = (header?.offsetHeight || 0) + 8; // small breathing space
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

// ===== Catalog (Home) =====
function initHome(){
  const grid = $('#productsGrid');
  if (!grid) return; // not on home

  const cardTpl = $('#productCardTpl');
  const searchForm = $('#searchForm');
  const searchInput = $('#searchInput');
  const heroSearchForm = document.getElementById('heroSearchForm');
  const heroSearchInput = document.getElementById('heroSearchInput');
  const heroCta = document.querySelector('.hero__cta');
  const filterCategory = $('#filterCategory');
  const sortSelect = $('#sortSelect');
  const paginationEl = $('#catalogPagination');
  const pageSizeSelect = $('#pageSizeSelect');
  const paginationStatus = $('#paginationStatus');
  const favoritesOnly = $('#favoritesOnly');
  // Sidebar filter elements
  const brandChecks = $$('input[name="brand"]');
  const priceMinEl = $('#priceMin');
  const priceMaxEl = $('#priceMax');
  const minRatingEl = $('#minRating');
  const tagSelect = $('#tagSelect');
  const freeShipEl = $('#freeShip');

  // Modal elements
  const dlg = document.getElementById('detailsModal');
  const mdImg = document.getElementById('mdImg');
  const mdTitle = document.getElementById('mdTitle');
  const mdBrand = document.getElementById('mdBrand');
  const mdRating = document.getElementById('mdRating');
  const mdPrice = document.getElementById('mdPrice');
  const mdBuy = document.getElementById('mdBuy');
  const mdClose = $('.modal__close');

  function openDetails(p){
    if (!dlg) return;
    mdImg.src = getImageForProduct(p);
    mdImg.alt = p.name;
    mdTitle.textContent = p.name;
    mdBrand.textContent = p.brand;
    const r = getRatingForProduct(p);
    mdRating.innerHTML = `${renderStars(r.rating)} <span class="rating__count">(${r.count})</span>`;
    mdPrice.innerHTML = `${money(p.price)} <small>ou 6x de ${money(p.price/6)}</small>`;
    // Reset and bind buy action
    mdBuy.onclick = ()=>{ Cart.add({ ...p, image: getImageForProduct(p) }); dlg.close(); };
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.removeAttribute('hidden');
  }
  if (mdClose){ mdClose.addEventListener('click', ()=> { if(dlg) dlg.close(); }); }
  if (dlg){ dlg.addEventListener('click', (e)=>{ if (e.target === dlg) dlg.close(); }); }

  let query = '';
  let category = '';
  let sort = '';
  let page = 1;
  let onlyFav = Boolean(favoritesOnly?.checked);
  // Sidebar filter state
  let selBrands = new Set(brandChecks.filter(ch=>ch.checked).map(ch=>ch.value));
  let priceMin = priceMinEl ? Number(priceMinEl.value) || null : null;
  let priceMax = priceMaxEl ? Number(priceMaxEl.value) || null : null;
  let minRating = minRatingEl ? Number(minRatingEl.value) || null : null;
  let selTag = tagSelect ? (tagSelect.value || '') : '';
  let onlyFree = Boolean(freeShipEl?.checked);
  // Restore page size preference
  let pageSize = Number(localStorage.getItem('clockstore_page_size') || (pageSizeSelect?.value) || 12) || 12;
  if (pageSizeSelect) pageSizeSelect.value = String(pageSize);

  function render(){
    grid.innerHTML = '';
    
    const getList = ()=> filterProducts(PRODUCTS, { category, query, onlyFav, selBrands, priceMin, priceMax, minRating, selTag, onlyFree, sort });

    const renderProducts = (visible)=>{
      if (visible.length === 0){
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.style.padding = '16px';
        empty.textContent = 'Nenhum produto encontrado para os filtros/busca selecionados.';
        grid.appendChild(empty);
        return;
      }
      for (const p of visible){
        const node = cardTpl.content.firstElementChild.cloneNode(true);
        const img = $('.card__img', node);
        const chip = $('.chip', node);
        const chipFree = $('.chip--free', node);
        const title = $('.card__title', node);
        const rating = $('.card__rating', node);
        const priceOld = $('.price-old', node);
        const priceNew = $('.price-new', node);
        img.src = getImageForProduct(p);
        img.alt = p.name;
        chip.textContent = p.tag || '';
        chip.hidden = !p.tag;
        chipFree.hidden = (p.price < 300);
        title.textContent = p.name;
        const r = getRatingForProduct(p);
        rating.innerHTML = `${renderStars(r.rating)} <span class="rating__count">(${r.count})</span>`;
        // Prices: show old if provided and greater than price
        const hasOld = typeof p.oldPrice === 'number' && p.oldPrice > p.price;
        if (hasOld){ priceOld.textContent = money(p.oldPrice); priceOld.hidden = false; } else { priceOld.hidden = true; }
        priceNew.textContent = money(p.price);

        // FAB actions
        $('.fab--cart', node)?.addEventListener('click', ()=>{
          Cart.add({ ...p, image: getImageForProduct(p) });
        });
        const wishBtn = $('.fab--wish', node);
        if (wishBtn){
          const initPressed = Wishlist.has(p.id);
          wishBtn.setAttribute('aria-pressed', String(initPressed));
          wishBtn.classList.toggle('is-active', initPressed);
          wishBtn.addEventListener('click', ()=>{
            const now = Wishlist.toggle(p.id);
            wishBtn.setAttribute('aria-pressed', String(now));
            wishBtn.classList.toggle('is-active', now);
          });
        }
        // Open details from image or title
        img.addEventListener('click', ()=> openDetails(p));
        title.addEventListener('click', ()=> openDetails(p));
        node.id = `p-${p.id}`;
        grid.appendChild(node);
      }
    };

    const renderPaginationControls = (pageInfo)=>{
      const { total, totalPages, start, visible } = pageInfo;
      if (!paginationEl) return;
      paginationEl.innerHTML = '';
      const prev = createPageButton('Anterior', Math.max(1, page-1), { disabled: page===1 }, (goto)=>{ page = goto; render(); smoothScrollToId('catalogo'); });
      paginationEl.appendChild(prev);

      const pages = new Set([1, totalPages, page-1, page, page+1].filter(n=> n>=1 && n<=totalPages));
      const arr = Array.from(pages).sort((a,b)=>a-b);
      for (let i=0;i<arr.length;i++){
        const current = arr[i];
        const prevNum = arr[i-1];
        if (i>0 && current - prevNum > 1){
          const dots = document.createElement('span');
          dots.className = 'text-muted';
          dots.textContent = '…';
          dots.setAttribute('aria-hidden','true');
          paginationEl.appendChild(dots);
        }
        const btn = createPageButton(current, current, { current: current===page }, (goto)=>{ page = goto; render(); smoothScrollToId('catalogo'); });
        paginationEl.appendChild(btn);
      }
      const next = createPageButton('Próximo', Math.min(totalPages, page+1), { disabled: page===totalPages }, (goto)=>{ page = goto; render(); smoothScrollToId('catalogo'); });
      paginationEl.appendChild(next);

      if (paginationStatus){
        const from = total ? (start + 1) : 0;
        const to = start + visible.length;
        paginationStatus.textContent = `Página ${page} de ${totalPages}. Exibindo ${from}-${to} de ${total} itens.`;
      }
    };

    // Compose
    const list = getList();
    const pageInfo = paginate(list, page, pageSize);
    page = pageInfo.page;
    renderProducts(pageInfo.visible);
    renderPaginationControls(pageInfo);

    // JSON-LD for current list
    try{
      const base = (document.querySelector('link[rel="canonical"]')?.href) || (location.origin + location.pathname);
      const elId = 'productsJsonLd';
      { const prev = document.getElementById(elId); if (prev) prev.remove(); }
      const itemList = list.map((p)=>{
        const r = getRatingForProduct(p);
        return {
          '@type':'Product',
          name: p.name,
          image: getImageForProduct(p),
          url: `${base}#p-${p.id}`,
          brand: { '@type':'Brand', name: p.brand },
          category: p.category,
          offers: { '@type':'Offer', priceCurrency:'BRL', price: p.price, availability: 'https://schema.org/InStock' },
          aggregateRating: { '@type':'AggregateRating', ratingValue: r.rating, reviewCount: r.count }
        };
      });
      const json = {
        '@context':'https://schema.org',
        '@type':'ItemList',
        itemListElement: itemList.map((prod, i)=>({ '@type':'ListItem', position: i+1, item: prod }))
      };
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = elId;
      s.textContent = JSON.stringify(json);
      document.head.appendChild(s);

      const elId2 = 'productsJsonLdItems';
      { const prev2 = document.getElementById(elId2); if (prev2) prev2.remove(); }
      const products = list.map((p)=>{
        const r = getRatingForProduct(p);
        return {
          '@context':'https://schema.org',
          '@type':'Product',
          name: p.name,
          image: getImageForProduct(p),
          url: `${base}#p-${p.id}`,
          brand: { '@type':'Brand', name: p.brand },
          category: p.category,
          offers: { '@type':'Offer', priceCurrency:'BRL', price: p.price, availability: 'https://schema.org/InStock' },
          aggregateRating: { '@type':'AggregateRating', ratingValue: r.rating, reviewCount: r.count }
        };
      });
      const s2 = document.createElement('script');
      s2.type = 'application/ld+json';
      s2.id = elId2;
      s2.textContent = JSON.stringify(products);
      document.head.appendChild(s2);
    }catch{}
  }

  if (searchForm) searchForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    query = (searchInput?.value||'').trim().toLowerCase();
    page = 1;
    render();
  });
  if (filterCategory) filterCategory.addEventListener('change', (e)=>{ category = e.target.value; page = 1; render(); });
  if (sortSelect) sortSelect.addEventListener('change', (e)=>{ sort = e.target.value; page = 1; render(); });
  if (favoritesOnly) favoritesOnly.addEventListener('change', (e)=>{ onlyFav = !!e.target.checked; page = 1; render(); });
  // Sidebar listeners
  if (brandChecks.length){
    const syncBrands = ()=>{ selBrands = new Set(brandChecks.filter(ch=>ch.checked).map(ch=>ch.value)); page = 1; render(); };
    brandChecks.forEach(ch=> ch.addEventListener('change', syncBrands));
  }
  if (priceMinEl) priceMinEl.addEventListener('input', ()=>{ const v = Number(priceMinEl.value); priceMin = Number.isFinite(v) && v>=0 ? v : null; page=1; render(); });
  if (priceMaxEl) priceMaxEl.addEventListener('input', ()=>{ const v = Number(priceMaxEl.value); priceMax = Number.isFinite(v) && v>=0 ? v : null; page=1; render(); });
  if (minRatingEl) minRatingEl.addEventListener('change', (e)=>{ const v = Number(e.target.value); minRating = Number.isFinite(v) && v>0 ? v : null; page=1; render(); });
  if (tagSelect) tagSelect.addEventListener('change', (e)=>{ selTag = e.target.value || ''; page=1; render(); });
  if (freeShipEl) freeShipEl.addEventListener('change', (e)=>{ onlyFree = !!e.target.checked; page=1; render(); });
  if (pageSizeSelect) pageSizeSelect.addEventListener('change', (e)=>{ 
    pageSize = Math.max(1, Number(e.target.value)||12); 
    localStorage.setItem('clockstore_page_size', String(pageSize));
    page = 1; 
    render(); 
  });
  if (heroSearchForm) heroSearchForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = (heroSearchInput?.value||'').trim().toLowerCase();
    if (searchInput) searchInput.value = q;
    query = q;
    page = 1;
    render();
    smoothScrollToId('catalogo');
  });
  if (heroCta){
    heroCta.querySelectorAll('a[href^="#"]').forEach((a)=>{
      a.addEventListener('click', (ev)=>{
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')){
          ev.preventDefault();
          smoothScrollToId(href.slice(1));
        }
      });
    });
  }
  // Smooth scroll for any direct #catalogo links on the page (e.g., nav/banners)
  document.querySelectorAll('a[href="#catalogo"]').forEach((a)=>{
    a.addEventListener('click', (ev)=>{ ev.preventDefault(); smoothScrollToId('catalogo'); });
  });

  render();
}

// ===== Cart page =====
function initCart(){
  const body = $('#cartBody');
  if (!body) return; // not on cart

  const rowTpl = $('#cartRowTpl');
  const empty = $('#cartEmpty');
  const tableWrap = $('#cartTableWrap');
  const sumItems = $('#sumItems');
  const sumSubtotal = $('#sumSubtotal');
  const sumDiscount = $('#sumDiscount');
  const sumShipping = $('#sumShipping');
  const sumTotal = $('#sumTotal');
  const couponForm = $('#cartCouponForm');
  const couponInput = $('#cartCoupon');

  // Prefill coupon from storage
  if (couponInput){ couponInput.value = Storage.getCoupon(); }

  function render(){
    const items = Cart.items;
    const has = items.length>0;
    empty.hidden = has;
    tableWrap.hidden = !has;

    body.innerHTML = '';
    for(const it of items){
      const p = PRODUCTS.find(p=>p.id===it.id) || it; // fallback
      const row = rowTpl.content.firstElementChild.cloneNode(true);
      $('.cart__img', row).src = it.image;
      $('.cart__img', row).alt = it.name;
      $('.cart__title', row).textContent = it.name;
      $('.cart__brand', row).textContent = p.brand || it.brand || '';
      $('.cart__price', row).textContent = money(it.price);
      $('.cart__subtotal', row).textContent = money(it.price * it.qtd);
      const qtyInput = $('.qty__input', row);
      qtyInput.value = it.qtd;

      row.addEventListener('click', (e)=>{
        const btn = e.target.closest('.qty__btn');
        if(btn){
          const act = btn.dataset.act;
          const q = Number(qtyInput.value)||1;
          const nq = Math.max(1, act==='inc'? q+1: q-1);
          qtyInput.value = nq;
          Cart.setQty(it.id, nq); renderSummary();
          $('.cart__subtotal', row).textContent = money(it.price * nq);
        }
        if (e.target.closest('.remove')){ Cart.remove(it.id); render(); renderSummary(); }
      });

      qtyInput.addEventListener('change', ()=>{ Cart.setQty(it.id, qtyInput.value); renderSummary(); $('.cart__subtotal', row).textContent = money(it.price * (Number(qtyInput.value)||1)); });

      body.appendChild(row);
    }

    renderSummary();
  }

  function renderSummary(){
    const coupon = couponInput ? couponInput.value : Storage.getCoupon();
    const t = calcTotals(Cart.items, coupon);
    sumItems.textContent = String(Cart.count());
    sumSubtotal.textContent = money(t.subtotal);
    sumDiscount.textContent = `- ${money(t.discount)}`;
    sumShipping.textContent = money(t.shipping);
    sumTotal.textContent = money(t.total);
  }

  render();

  // Apply coupon (cart page)
  couponForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const code = couponInput.value.trim();
    Storage.setCoupon(code);
    renderSummary();
    alert(code ? 'Cupom aplicado!' : 'Cupom removido.');
  });
}

// ===== Checkout page =====
function initCheckout(){
  const form = $('#checkoutForm');
  if (!form) return; // not on checkout

  const coItems = $('#coItems');
  const coSubtotal = $('#coSubtotal');
  const coDiscount = $('#coDiscount');
  const coShipping = $('#coShipping');
  const coTotal = $('#coTotal');
  const coCouponForm = $('#coCouponForm');
  const coCoupon = $('#coCoupon');

  if (coCoupon){ coCoupon.value = Storage.getCoupon(); }
  const empty = $('#checkoutEmpty');

  if (Cart.items.length === 0){
    empty.hidden = false;
    form.style.display = 'none';
    return;
  }

  function renderSummary(){
    const coupon = coCoupon ? coCoupon.value : Storage.getCoupon();
    const t = calcTotals(Cart.items, coupon);
    coItems.textContent = String(Cart.count());
    coSubtotal.textContent = money(t.subtotal);
    coDiscount.textContent = `- ${money(t.discount)}`;
    coShipping.textContent = money(t.shipping);
    coTotal.textContent = money(t.total);
  }
  renderSummary();

  coCouponForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const code = coCoupon.value.trim();
    Storage.setCoupon(code);
    renderSummary();
    alert(code ? 'Cupom aplicado no checkout!' : 'Cupom removido.');
  });

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    // validação bem simples
    const required = ['fullName','email','phone','cpf','cep','address','number','district','city','state','cardName','cardNumber','cardExpiry','cardCvv'];
    const missing = required.filter(k => !String(data[k]||'').trim());
    if (missing.length){ alert('Preencha todos os campos obrigatórios.'); return; }

    const coupon = Storage.getCoupon();
    const totals = calcTotals(Cart.items, coupon);
    const order = {
      id: Math.random().toString(36).slice(2,8).toUpperCase(),
      items: Cart.items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      total: totals.total,
      coupon: normalizeCoupon(coupon) || null,
      customer: { name: data.fullName, email: data.email },
      createdAt: new Date().toISOString(),
    };
    Storage.setOrder(order);
    Cart.clear();
    Storage.setCoupon('');
    window.location.href = './thankyou.html';
  });
}

// ===== Thank you page =====
function initThankYou(){
  const el = $('#orderId');
  if (!el) return;
  const order = Storage.getOrder();
  el.textContent = order?.id ? `#${order.id}` : '#000000';
}

// ===== Newsletter =====
function initNewsletter(){
  const form = $('#newsletterForm');
  if (!form) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const raw = fd.get('email');
    const email = typeof raw === 'string' ? raw.trim() : '';
    if(!email){ alert('Informe seu e-mail.'); return; }
    Storage.subscribe(email);
    form.reset();
    alert('Obrigado! Você agora receberá nossas ofertas por e-mail.');
  });
}

// ===== Wishlist (localStorage) =====
const Wishlist = {
  key: 'clockstore_wishlist',
  get(){
    try{ return JSON.parse(localStorage.getItem(this.key) || '[]') || []; }
    catch{ return []; }
  },
  set(arr){ localStorage.setItem(this.key, JSON.stringify(Array.from(new Set(arr)))); },
  has(id){ return this.get().includes(id); },
  toggle(id){
    const arr = this.get();
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i,1); else arr.push(id);
    this.set(arr);
    return this.has(id);
  }
};

// ===== Common init =====
(function init(){
  // ano no rodapé
  { const y = $('#year'); if (y) y.textContent = new Date().getFullYear(); }
  Cart.renderBadge();
  initHeroCarousel();
  initHome();
  initCart();
  initCheckout();
  initThankYou();
  initNewsletter();
})();

// ===== Hero Carousel =====
function initHeroCarousel(){
  const root = document.getElementById('heroCarousel');
  if (!root) return;
  const track = root.querySelector('.carousel__track');
  const slides = Array.from(root.querySelectorAll('.carousel__slide'));
  const btnPrev = root.querySelector('.carousel__btn.prev');
  const btnNext = root.querySelector('.carousel__btn.next');
  const dotsWrap = root.querySelector('.carousel__dots');
  let index = 0;
  const go = (i)=>{
    index = (i+slides.length)%slides.length;
    slides.forEach((s,idx)=> s.classList.toggle('is-active', idx===index));
    track.style.transform = `translateX(${-index*100}%)`;
    dotsWrap?.querySelectorAll('button')?.forEach((d,di)=>{
      d.setAttribute('aria-selected', String(di===index));
      d.classList.toggle('is-active', di===index);
    });
  };
  // dots
  if (dotsWrap){
    dotsWrap.innerHTML = '';
    slides.forEach((_,i)=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role','tab');
      b.setAttribute('aria-label', `Ir para slide ${i+1}`);
      b.addEventListener('click', ()=> go(i));
      dotsWrap.appendChild(b);
    });
  }
  if (btnPrev) btnPrev.addEventListener('click', ()=> go(index-1));
  if (btnNext) btnNext.addEventListener('click', ()=> go(index+1));
  // Autoplay com respeito a prefers-reduced-motion
  const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let autoplay = !(mql && mql.matches);
  let timer = null;
  const start = ()=>{ if (autoplay && !timer) timer = setInterval(()=> go(index+1), 5000); };
  const stop = ()=>{ if (timer){ clearInterval(timer); timer = null; } };
  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  if (mql && typeof mql.addEventListener === 'function'){
    mql.addEventListener('change', (e)=>{ autoplay = !e.matches; if (!autoplay) stop(); else start(); });
  }
  start();
  go(0);
}
