// ── State ──────────────────────────────────────────────────
const state = {
    metaConnected: false,
    briefing: null,
    concepts: [],        // [{angle,hook,headline,body,cta,painPoint,targetEmotion,imageB64,selected}]
    campaigns: [],       // [{id, name, adSetIds, adIds, platform}] saved in localStorage
    pendingOptimizations: null,
    selectedProduct: null // {id, title, price, description, image, tags, type}
};

const STORAGE_KEY = 'andromeda_state_v1';
function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ briefing: state.briefing, concepts: state.concepts, campaigns: state.campaigns })); }
    catch (e) { console.warn('saveState error:', e); }
}
function loadState() {
    try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!s) return;
        if (s.briefing) state.briefing = s.briefing;
        if (s.concepts) state.concepts = s.concepts;
        if (s.campaigns) state.campaigns = s.campaigns;
    } catch (e) { console.warn('loadState error:', e); }
}

// ── DOM helpers ────────────────────────────────────────────
const $ = id => document.getElementById(id);
const metaHeaders = () => {
    const token = $('metaToken')?.value?.trim() || localStorage.getItem('meta_token') || '';
    const account = $('metaAdAccount')?.value?.trim() || localStorage.getItem('meta_account') || '';
    const pageId = $('metaPageId')?.value?.trim() || localStorage.getItem('meta_page') || '';
    return { 'x-meta-token': token, 'x-meta-account': account, 'x-meta-page': pageId, 'Content-Type': 'application/json' };
};
const googleHeaders = () => ({
    'x-google-token': localStorage.getItem('google_token') || '',
    'x-google-customer': localStorage.getItem('google_customer') || '',
    'x-google-dev-token': localStorage.getItem('google_dev_token') || '',
    'Content-Type': 'application/json'
});
const tiktokHeaders = () => ({
    'x-tiktok-token': localStorage.getItem('tiktok_token') || '',
    'x-tiktok-advertiser': localStorage.getItem('tiktok_advertiser') || '',
    'Content-Type': 'application/json'
});

function showStatus(elId, msg, type = 'info') {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    el.classList.remove('hidden');
}
function hideStatus(elId) { $(elId)?.classList.add('hidden'); }

function showLoader(msg = 'Procesando...') {
    let el = document.getElementById('loaderOverlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loaderOverlay';
        el.className = 'loader-overlay';
        el.innerHTML = `<div class="loader-spinner"></div><p id="loaderMsg">${msg}</p>`;
        document.body.appendChild(el);
    } else {
        document.getElementById('loaderMsg').textContent = msg;
        el.classList.remove('hidden');
    }
    setAgentStatus('thinking', msg);
}
function hideLoader() {
    document.getElementById('loaderOverlay')?.classList.add('hidden');
    setAgentStatus('idle');
}

function setAgentStatus(state, label = '') {
    const dot = $('agentDot');
    const lbl = $('agentLabel');
    dot.className = 'agent-dot' + (state === 'thinking' ? ' thinking' : state === 'active' ? ' active' : '');
    lbl.textContent = label || (state === 'thinking' ? 'Agente trabajando...' : 'Agentes listos');
}

// ── View routing ───────────────────────────────────────────
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const viewEl = document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1));
    if (viewEl) viewEl.classList.add('active');
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
}

// ── Initialization ─────────────────────────────────────────
function init() {
    loadState();
    restoreCredentials();

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
            if (view === 'concepts' && state.concepts.length > 0) renderConcepts();
            if (view === 'campaign') renderSelectedSummary();
            if (view === 'dashboard') populateCampaignSelector();
        });
    });

    // Setup — platform cards
    $('platformMeta').addEventListener('click', toggleMetaPanel);
    $('btnOpenMeta').addEventListener('click', e => { e.stopPropagation(); openMetaPanel(); });
    $('btnCloseMetaPanel').addEventListener('click', closeMetaPanel);
    $('btnVerifyMeta').addEventListener('click', verifyMeta);

    $('platformGoogle').addEventListener('click', toggleGooglePanel);
    $('btnOpenGoogle').addEventListener('click', e => { e.stopPropagation(); openGooglePanel(); });
    $('btnCloseGooglePanel').addEventListener('click', closeGooglePanel);
    $('btnVerifyGoogle').addEventListener('click', verifyGoogle);

    $('platformTikTok').addEventListener('click', toggleTikTokPanel);
    $('btnOpenTikTok').addEventListener('click', e => { e.stopPropagation(); openTikTokPanel(); });
    $('btnCloseTikTokPanel').addEventListener('click', closeTikTokPanel);
    $('btnVerifyTikTok').addEventListener('click', verifyTikTok);

    $('btnImportFromShopify').addEventListener('click', importFromShopify);

    // Campaign platform tabs
    document.querySelectorAll('.camp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.camp-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $('activePlatform').value = tab.dataset.platform;
        });
    });

    // Restore saved Shopify inputs
    const savedShop = localStorage.getItem('andromeda_shopify_shop');
    const savedToken = localStorage.getItem('andromeda_shopify_token');
    if (savedShop) $('shopifyShopUrl').value = savedShop;
    if (savedToken) $('shopifyTokenInput').value = savedToken;

    // Briefing — product picker
    $('btnLoadProducts').addEventListener('click', loadShopifyProducts);
    $('productSearchInput').addEventListener('input', () => renderProductList($('productSearchInput').value));
    $('btnClearSearch').addEventListener('click', () => { $('productSearchInput').value = ''; renderProductList(''); $('productSearchInput').focus(); });
    $('btnClearProduct').addEventListener('click', clearSelectedProduct);

    // Briefing
    document.querySelectorAll('.tone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            $('b5').value = btn.dataset.tone;
        });
    });
    $('btnGenerateConcepts').addEventListener('click', generateConcepts);

    // Concepts
    $('btnSelectAllConcepts').addEventListener('click', toggleSelectAllConcepts);
    $('btnGoToCampaign').addEventListener('click', () => {
        renderSelectedSummary();
        switchView('campaign');
    });

    // Creative modal
    $('btnCloseModal').addEventListener('click', closeModal);
    $('modal-backdrop') && document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            ['modeGenerate', 'modeShopify', 'modeEdit', 'modeManual'].forEach(id => $(id)?.classList.add('hidden'));
            const modeMap = { generate: 'modeGenerate', shopify: 'modeShopify', edit: 'modeEdit', manual: 'modeManual' };
            $(modeMap[tab.dataset.mode])?.classList.remove('hidden');
        });
    });
    $('btnGenerateCreative').addEventListener('click', generateCreative);
    setupFileUpload('photoUploadArea', 'photoFileInput', 'photoPreview');
    setupFileUpload('manualUploadArea', 'manualFileInput', 'manualPreview');

    // Campaign
    $('dailyBudget').addEventListener('input', updateBudgetHint);
    $('campaignDuration').addEventListener('input', updateBudgetHint);
    $('btnLaunchCampaign').addEventListener('click', launchCampaign);

    // Dashboard
    $('btnRefreshStats').addEventListener('click', refreshStats);
    $('btnAnalyzeAI').addEventListener('click', analyzeWithAI);
    $('btnApplyOptimizations').addEventListener('click', applyOptimizations);
    $('campaignSelector').addEventListener('change', () => { refreshStats(); checkPendingUploads(); });
    $('btnUploadPending')?.addEventListener('click', uploadToExistingCampaign);

    // Restore UI
    if (state.concepts.length > 0) {
        $('badgeConcepts').textContent = state.concepts.length;
        $('badgeConcepts').classList.add('visible');
    }
    if (state.campaigns.length > 0) {
        $('badgeDashboard').classList.add('visible');
    }

    setCampaignName();
}

// ── Platform panel helpers ──────────────────────────────────
function openMetaPanel() {
    $('metaFormPanel').classList.add('open');
    $('platformMeta').classList.add('active');
}
function closeMetaPanel() {
    $('metaFormPanel').classList.remove('open');
    $('platformMeta').classList.remove('active');
}
function toggleMetaPanel() {
    $('metaFormPanel').classList.contains('open') ? closeMetaPanel() : openMetaPanel();
}

function setMetaBadge(connected) {
    const badge = $('metaBadge');
    if (!badge) return;
    if (connected) {
        badge.className = 'platform-status-badge connected';
        badge.innerHTML = '<span class="status-dot"></span><span class="status-text">Conectado</span>';
        $('btnOpenMeta').textContent = 'Editar →';
    } else {
        badge.className = 'platform-status-badge';
        badge.innerHTML = '<span class="status-dot"></span><span class="status-text">Sin conectar</span>';
        $('btnOpenMeta').textContent = 'Configurar →';
    }
}

// Google panel
function openGooglePanel() { $('googleFormPanel').classList.add('open'); $('platformGoogle').classList.add('active'); closeTikTokPanel(); closeMetaPanel(); }
function closeGooglePanel() { $('googleFormPanel').classList.remove('open'); $('platformGoogle').classList.remove('active'); }
function toggleGooglePanel() { $('googleFormPanel').classList.contains('open') ? closeGooglePanel() : openGooglePanel(); }

function setGoogleBadge(connected) {
    const badge = $('googleBadge');
    if (!badge) return;
    badge.className = connected ? 'platform-status-badge connected' : 'platform-status-badge';
    badge.innerHTML = `<span class="status-dot"></span><span class="status-text">${connected ? 'Conectado' : 'Sin conectar'}</span>`;
    $('btnOpenGoogle').textContent = connected ? 'Editar →' : 'Configurar →';
}

// TikTok panel
function openTikTokPanel() { $('tiktokFormPanel').classList.add('open'); $('platformTikTok').classList.add('active'); closeGooglePanel(); closeMetaPanel(); }
function closeTikTokPanel() { $('tiktokFormPanel').classList.remove('open'); $('platformTikTok').classList.remove('active'); }
function toggleTikTokPanel() { $('tiktokFormPanel').classList.contains('open') ? closeTikTokPanel() : openTikTokPanel(); }

function setTikTokBadge(connected) {
    const badge = $('tiktokBadge');
    if (!badge) return;
    badge.className = connected ? 'platform-status-badge connected' : 'platform-status-badge';
    badge.innerHTML = `<span class="status-dot"></span><span class="status-text">${connected ? 'Conectado' : 'Sin conectar'}</span>`;
    $('btnOpenTikTok').textContent = connected ? 'Editar →' : 'Configurar →';
}

function restoreCredentials() {
    // Meta
    const metaToken = localStorage.getItem('meta_token');
    const metaAccount = localStorage.getItem('meta_account');
    const metaPage = localStorage.getItem('meta_page');
    if (metaToken) $('metaToken').value = metaToken;
    if (metaAccount) $('metaAdAccount').value = metaAccount;
    if (metaPage) $('metaPageId').value = metaPage;
    if (metaToken && metaAccount) {
        state.metaConnected = true;
        setMetaBadge(true);
        showStatus('metaStatus', '✅ Credenciales guardadas', 'success');
        $('badgeSetup').textContent = '✓';
        $('badgeSetup').classList.add('visible');
    }

    // Google
    const gToken = localStorage.getItem('google_token');
    const gCustomer = localStorage.getItem('google_customer');
    const gDevToken = localStorage.getItem('google_dev_token');
    if (gToken) $('googleAccessToken').value = gToken;
    if (gCustomer) $('googleCustomerId').value = gCustomer;
    if (gDevToken) $('googleDevToken').value = gDevToken;
    if (gToken && gCustomer) {
        setGoogleBadge(true);
        showStatus('googleStatus', '✅ Credenciales guardadas', 'success');
    }

    // TikTok
    const ttToken = localStorage.getItem('tiktok_token');
    const ttAdv = localStorage.getItem('tiktok_advertiser');
    if (ttToken) $('tiktokAccessToken').value = ttToken;
    if (ttAdv) $('tiktokAdvertiserId').value = ttAdv;
    if (ttToken && ttAdv) {
        setTikTokBadge(true);
        showStatus('tiktokStatus', '✅ Credenciales guardadas', 'success');
    }
}

function setCampaignName() {
    const now = new Date();
    const mon = now.toLocaleString('es', { month: 'short' }).toUpperCase();
    $('campaignName').value = `Andromeda_Moda_${mon}${now.getFullYear()}`;
}

// ── Setup / Shopify brand import ───────────────────────────
async function importFromShopify() {
    const shop = $('shopifyShopUrl').value.trim();
    const token = $('shopifyTokenInput').value.trim();
    if (!shop || !token) {
        showStatus('shopifyImportStatus', 'Introduce la URL de la tienda y el token de acceso', 'error');
        return;
    }

    $('btnImportFromShopify').disabled = true;
    $('btnImportFromShopify').innerHTML = '<span class="spinner-inline"></span>Analizando con IA...';
    hideStatus('shopifyImportStatus');
    showLoader('Analizando tu tienda de Shopify con IA...');

    try {
        const res = await fetch('/api/shopify-analyze', {
            method: 'POST',
            headers: {
                'x-shopify-shop': shop,
                'x-shopify-token': token,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        const p = data.brandProfile;

        // Auto-fill briefing fields
        if ($('b1')) $('b1').value = p.product || '';
        if ($('b2')) $('b2').value = p.audience || '';
        if ($('b3')) $('b3').value = p.painPoint || '';
        if ($('b4')) $('b4').value = p.differentiator || '';

        // Select matching tone button
        if (p.tone) {
            document.querySelectorAll('.tone-btn').forEach(btn => {
                if (btn.dataset.tone && p.tone.toLowerCase().includes(btn.dataset.tone.toLowerCase())) {
                    btn.click();
                }
            });
        }

        // Persist credentials
        localStorage.setItem('andromeda_shopify_shop', shop);
        localStorage.setItem('andromeda_shopify_token', token);

        hideLoader();
        showStatus('shopifyImportStatus',
            `✅ Marca importada: ${data.storeName} (${data.productCount} productos analizados)`,
            'success'
        );

        // Navigate to briefing after short delay
        setTimeout(() => switchView('briefing'), 1500);

    } catch (err) {
        hideLoader();
        showStatus('shopifyImportStatus', `❌ ${err.message}`, 'error');
    } finally {
        $('btnImportFromShopify').disabled = false;
        $('btnImportFromShopify').innerHTML = '✨ Analizar tienda con IA';
    }
}

// ── Setup / Meta validation ────────────────────────────────
async function verifyMeta() {
    const token = $('metaToken').value.trim();
    const account = $('metaAdAccount').value.trim();
    const page = $('metaPageId').value.trim();
    if (!token || !account) { showStatus('metaStatus', 'Introduce el token y el Ad Account ID', 'error'); return; }

    $('btnVerifyMeta').disabled = true;
    $('btnVerifyMeta').innerHTML = '<span class="spinner-inline"></span>Verificando...';
    hideStatus('metaStatus');

    try {
        const res = await fetch('/api/meta-validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, adAccountId: account, pageId: page })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        localStorage.setItem('meta_token', token);
        localStorage.setItem('meta_account', account);
        if (page) localStorage.setItem('meta_page', page);

        state.metaConnected = true;
        setMetaBadge(true);
        showStatus('metaStatus', `✅ Conectado: ${data.accountName} (${account})`, 'success');
        $('badgeSetup').textContent = '✓';
        $('badgeSetup').classList.add('visible');
        setAgentStatus('active', 'Meta conectado');
        setTimeout(closeMetaPanel, 1200);
    } catch (err) {
        showStatus('metaStatus', `❌ ${err.message}`, 'error');
    } finally {
        $('btnVerifyMeta').disabled = false;
        $('btnVerifyMeta').textContent = '🔗 Verificar Conexión';
    }
}

async function verifyGoogle() {
    const customerId = $('googleCustomerId').value.trim();
    const developerToken = $('googleDevToken').value.trim();
    const accessToken = $('googleAccessToken').value.trim();
    if (!customerId || !developerToken || !accessToken) {
        showStatus('googleStatus', 'Introduce los 3 campos de Google Ads', 'error'); return;
    }
    $('btnVerifyGoogle').disabled = true;
    $('btnVerifyGoogle').innerHTML = '<span class="spinner-inline"></span>Verificando...';
    hideStatus('googleStatus');
    try {
        const res = await fetch('/api/google-validate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId, developerToken, accessToken })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        localStorage.setItem('google_token', accessToken);
        localStorage.setItem('google_customer', customerId.replace(/-/g, ''));
        localStorage.setItem('google_dev_token', developerToken);
        setGoogleBadge(true);
        showStatus('googleStatus', `✅ Conectado: ${data.accountName}`, 'success');
        $('badgeSetup').textContent = '✓'; $('badgeSetup').classList.add('visible');
        setTimeout(closeGooglePanel, 1200);
    } catch (err) {
        showStatus('googleStatus', `❌ ${err.message}`, 'error');
    } finally {
        $('btnVerifyGoogle').disabled = false;
        $('btnVerifyGoogle').textContent = '🔗 Verificar Conexión';
    }
}

async function verifyTikTok() {
    const accessToken = $('tiktokAccessToken').value.trim();
    const advertiserId = $('tiktokAdvertiserId').value.trim();
    if (!accessToken || !advertiserId) {
        showStatus('tiktokStatus', 'Introduce el Access Token y el Advertiser ID', 'error'); return;
    }
    $('btnVerifyTikTok').disabled = true;
    $('btnVerifyTikTok').innerHTML = '<span class="spinner-inline"></span>Verificando...';
    hideStatus('tiktokStatus');
    try {
        const res = await fetch('/api/tiktok-validate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, advertiserId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        localStorage.setItem('tiktok_token', accessToken);
        localStorage.setItem('tiktok_advertiser', advertiserId);
        setTikTokBadge(true);
        showStatus('tiktokStatus', `✅ Conectado: ${data.accountName}`, 'success');
        $('badgeSetup').textContent = '✓'; $('badgeSetup').classList.add('visible');
        setTimeout(closeTikTokPanel, 1200);
    } catch (err) {
        showStatus('tiktokStatus', `❌ ${err.message}`, 'error');
    } finally {
        $('btnVerifyTikTok').disabled = false;
        $('btnVerifyTikTok').textContent = '🔗 Verificar Conexión';
    }
}

// ── Product picker ──────────────────────────────────────────
let _allProducts = [];

async function loadShopifyProducts() {
    const shop = localStorage.getItem('andromeda_shopify_shop');
    const token = localStorage.getItem('andromeda_shopify_token');
    if (!shop || !token) {
        showStatus('productPickerStatus', '❌ Conecta tu tienda Shopify primero en la pestaña Configuración', 'error');
        return;
    }
    $('btnLoadProducts').disabled = true;
    $('btnLoadProducts').innerHTML = '<span class="spinner-inline"></span>Cargando...';
    hideStatus('productPickerStatus');
    try {
        const res = await fetch('/api/shopify-products', {
            method: 'POST',
            headers: { 'x-shopify-shop': shop, 'x-shopify-token': token, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        _allProducts = data.products;
        $('productPickerWrap').classList.remove('hidden');
        $('productSearchInput').value = '';
        renderProductList('');
        $('productSearchInput').focus();
        showStatus('productPickerStatus', `✅ ${data.total} productos cargados — busca y selecciona`, 'success');
    } catch (err) {
        showStatus('productPickerStatus', `❌ ${err.message}`, 'error');
    } finally {
        $('btnLoadProducts').disabled = false;
        $('btnLoadProducts').textContent = '🛍️ Cargar desde Shopify';
    }
}

function renderProductList(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = q
        ? _allProducts.filter(p => p.title.toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q) || (p.tags || '').toLowerCase().includes(q))
        : _allProducts;

    const list = $('productResultsList');
    if (filtered.length === 0) {
        list.innerHTML = `<div class="product-result-empty">Sin resultados para "${query}"</div>`;
        return;
    }
    list.innerHTML = filtered.map(p => `
        <div class="product-result-item" data-id="${p.id}">
            ${p.image
            ? `<img src="${p.image}" class="product-result-img" alt="" loading="lazy" />`
            : `<div class="product-result-img product-result-no-img">📦</div>`}
            <div class="product-result-info">
                <span class="product-result-name">${p.title}</span>
                <span class="product-result-price">$${p.price}</span>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.product-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const product = _allProducts.find(p => String(p.id) === item.dataset.id);
            if (product) selectProduct(product);
        });
    });
}

async function selectProduct(minimalProduct) {
    // Hide search, show preview immediately with minimal data + loading state
    $('productPickerWrap').classList.add('hidden');

    const img = $('selectedProductImg');
    if (minimalProduct.image) { img.src = minimalProduct.image; img.classList.remove('hidden'); }
    else img.classList.add('hidden');

    $('selectedProductName').textContent = minimalProduct.title;
    $('selectedProductPrice').textContent = `$${minimalProduct.price}`;
    $('selectedProductDesc').textContent = 'Cargando detalles...';
    $('selectedProductPreview').classList.remove('hidden');

    // Store minimal data immediately so concepts can use title+price while full data loads
    state.selectedProduct = { ...minimalProduct };

    // Lazy-load full product details
    const shop = localStorage.getItem('andromeda_shopify_shop');
    const token = localStorage.getItem('andromeda_shopify_token');
    if (shop && token) {
        try {
            const res = await fetch('/api/shopify-product', {
                method: 'POST',
                headers: { 'x-shopify-shop': shop, 'x-shopify-token': token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: minimalProduct.id })
            });
            const full = await res.json();
            if (res.ok) {
                state.selectedProduct = full;
                $('selectedProductDesc').textContent = full.description?.substring(0, 150) || '';

                // Auto-generate briefing with AI
                if ($('b1')) {
                    $('b1').value = '✨ Generando briefing con IA...';
                    $('b2').value = ''; $('b3').value = ''; $('b4').value = '';
                    try {
                        const ar = await fetch('/api/analyze-product', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ product: full })
                        });
                        const analysis = await ar.json();
                        if (ar.ok) {
                            $('b1').value = analysis.product || '';
                            $('b2').value = analysis.audience || '';
                            $('b3').value = analysis.painPoint || '';
                            $('b4').value = analysis.differentiator || '';
                            if (analysis.tone) {
                                document.querySelectorAll('.tone-btn').forEach(btn => {
                                    btn.classList.remove('selected');
                                    if (btn.dataset.tone === analysis.tone) {
                                        btn.classList.add('selected');
                                        $('b5').value = analysis.tone;
                                    }
                                });
                            }
                        } else {
                            $('b1').value = `${full.title} — $${full.price}`;
                        }
                    } catch {
                        $('b1').value = `${full.title} — $${full.price}`;
                    }
                }
            } else {
                $('selectedProductDesc').textContent = '';
            }
        } catch {
            $('selectedProductDesc').textContent = '';
        }
    }

    hideStatus('productPickerStatus');
    showStatus('productPickerStatus', `✅ ${minimalProduct.title} seleccionado`, 'success');
}

function clearSelectedProduct() {
    state.selectedProduct = null;
    $('selectedProductPreview').classList.add('hidden');
    if ($('b1')) { $('b1').value = ''; $('b2').value = ''; $('b3').value = ''; $('b4').value = ''; $('b5').value = ''; }
    document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('selected'));
    if (_allProducts.length > 0) {
        $('productSearchInput').value = '';
        renderProductList('');
        $('productPickerWrap').classList.remove('hidden');
    }
    hideStatus('productPickerStatus');
}

// ── Briefing → Concepts ────────────────────────────────────
async function generateConcepts() {
    const b = {
        product: $('b1').value.trim(),
        audience: $('b2').value.trim(),
        painPoint: $('b3').value.trim(),
        differentiator: $('b4').value.trim(),
        tone: $('b5').value.trim()
    };
    if (!b.product || !b.audience || !b.painPoint) {
        showStatus('briefingStatus', 'Rellena al menos las 3 primeras preguntas', 'error');
        return;
    }

    showLoader('El Agente Copywriter está generando 10 conceptos...');
    hideStatus('briefingStatus');

    try {
        const res = await fetch('/api/generate-concepts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ briefing: b, selectedProduct: state.selectedProduct || null })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        state.briefing = b;
        state.concepts = data.concepts.map(c => ({ ...c, selected: false, imageB64: null }));
        saveState();

        $('badgeBriefing').textContent = '✓';
        $('badgeBriefing').classList.add('visible');
        $('badgeConcepts').textContent = state.concepts.length;
        $('badgeConcepts').classList.add('visible');

        hideLoader();
        renderConcepts();
        switchView('concepts');
    } catch (err) {
        hideLoader();
        showStatus('briefingStatus', `❌ ${err.message}`, 'error');
    }
}

// ── Concepts rendering ────────────────────────────────────
function renderConcepts() {
    const grid = $('conceptsGrid');
    grid.innerHTML = '';
    state.concepts.forEach((c, i) => {
        const card = document.createElement('div');
        card.className = 'concept-card' + (c.selected ? ' selected' : '');
        card.dataset.index = i;
        card.innerHTML = `
            <div class="concept-num">Concepto ${i + 1} — ${c.targetEmotion || ''}</div>
            <div class="concept-angle">${c.angle}</div>
            <div class="concept-headline">"${c.headline}"</div>
            <div class="concept-body">${c.body}</div>
            <div class="concept-cta">${c.cta}</div>
            <div class="concept-pain">💔 ${c.painPoint}</div>
            ${c.imageB64 ? `<div class="concept-creative"><img class="concept-img" src="data:image/png;base64,${c.imageB64}" /></div>` : ''}
            <div class="concept-footer">
                <div class="concept-check">${c.selected ? '✓' : ''}</div>
                <button class="btn btn-secondary btn-sm btn-gen-creative" data-index="${i}">🎨 Generar imagen</button>
            </div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-gen-creative')) return;
            toggleConceptSelection(i, card);
        });
        card.querySelector('.btn-gen-creative').addEventListener('click', () => openModal(i));
        grid.appendChild(card);
    });
    updateConceptsToolbar();
}

function toggleConceptSelection(index, card) {
    state.concepts[index].selected = !state.concepts[index].selected;
    card.classList.toggle('selected', state.concepts[index].selected);
    card.querySelector('.concept-check').textContent = state.concepts[index].selected ? '✓' : '';
    saveState();
    updateConceptsToolbar();
}

function toggleSelectAllConcepts() {
    const allSelected = state.concepts.every(c => c.selected);
    state.concepts.forEach(c => c.selected = !allSelected);
    saveState();
    renderConcepts();
}

function updateConceptsToolbar() {
    const count = state.concepts.filter(c => c.selected).length;
    $('conceptsSelectedCount').textContent = `${count} seleccionado${count !== 1 ? 's' : ''}`;
    $('btnGoToCampaign').disabled = count === 0;
}

// ── Creative Modal ─────────────────────────────────────────
let currentConceptIndex = null;
let selectedShopifyImageUrl = null;

function openModal(index) {
    currentConceptIndex = index;
    selectedShopifyImageUrl = null;
    const c = state.concepts[index];
    $('modalTitle').textContent = `Creativo: ${c.angle}`;
    $('creativeModal').classList.remove('hidden');
    $('modalResult').classList.add('hidden');
    hideStatus('modalStatus');

    // Populate shopify photos grid
    const grid = $('shopifyPhotosGrid');
    const empty = $('shopifyPhotosEmpty');
    const images = state.selectedProduct?.images || (state.selectedProduct?.image ? [state.selectedProduct.image] : []);
    grid.innerHTML = '';
    if (images.length > 0) {
        empty.classList.add('hidden');
        grid.classList.remove('hidden');
        images.forEach(url => {
            const item = document.createElement('div');
            item.className = 'shopify-photo-item';
            item.innerHTML = `<img src="${url}" loading="lazy" />`;
            item.addEventListener('click', () => {
                grid.querySelectorAll('.shopify-photo-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedShopifyImageUrl = url;
            });
            grid.appendChild(item);
        });
    } else {
        grid.classList.add('hidden');
        empty.classList.remove('hidden');
    }
}
function closeModal() { $('creativeModal').classList.add('hidden'); currentConceptIndex = null; selectedShopifyImageUrl = null; }

function setupFileUpload(areaId, inputId, previewId) {
    const area = $(areaId);
    const input = $(inputId);
    const preview = $(previewId);
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--accent)'; });
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file) readFileToPreview(file, preview);
    });
    input.addEventListener('change', () => {
        if (input.files[0]) readFileToPreview(input.files[0], preview);
    });
}
function readFileToPreview(file, previewEl) {
    const reader = new FileReader();
    reader.onload = e => { previewEl.src = e.target.result; previewEl.classList.remove('hidden'); };
    reader.readAsDataURL(file);
}

async function generateCreative() {
    if (currentConceptIndex === null) return;
    const c = state.concepts[currentConceptIndex];
    const activeTab = document.querySelector('.modal-tab.active')?.dataset.mode || 'generate';
    const style = $('genStyle')?.value.trim() || '';

    $('btnGenerateCreative').disabled = true;
    $('btnGenerateCreative').innerHTML = '<span class="spinner-inline"></span>Generando...';
    hideStatus('modalStatus');

    try {
        // mode 'shopify' maps to 'edit' on the backend using the product's own photo
        const backendMode = activeTab === 'shopify' ? 'edit' : activeTab;
        let body = { mode: backendMode, concept: c, style, selectedProduct: state.selectedProduct || null };

        if (activeTab === 'shopify') {
            if (!selectedShopifyImageUrl) throw new Error('Selecciona una foto del producto');
            // Fetch the Shopify CDN image and convert to base64
            const imgRes = await fetch(selectedShopifyImageUrl);
            if (!imgRes.ok) throw new Error('No se pudo cargar la imagen del producto');
            const blob = await imgRes.blob();
            const b64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            body.imageBase64 = b64;
            body.mimeType = blob.type || 'image/jpeg';
        } else if (activeTab === 'edit') {
            const src = $('photoPreview')?.src;
            if (!src || src === window.location.href) throw new Error('Sube una foto de producto');
            body.imageBase64 = src.split(',')[1];
            body.mimeType = 'image/jpeg';
        } else if (activeTab === 'manual') {
            const src = $('manualPreview')?.src;
            if (!src || src === window.location.href) throw new Error('Sube la imagen del anuncio');
            body.imageBase64 = src.split(',')[1];
            body.mimeType = 'image/jpeg';
        }

        const res = await fetch('/api/generate-creative', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        const b64 = data.b64;
        state.concepts[currentConceptIndex].imageB64 = b64;
        saveState();

        $('generatedCreative').src = `data:image/png;base64,${b64}`;
        $('btnDownloadCreative').href = `data:image/png;base64,${b64}`;
        $('modalResult').classList.remove('hidden');
        renderConcepts();
    } catch (err) {
        showStatus('modalStatus', `❌ ${err.message}`, 'error');
    } finally {
        $('btnGenerateCreative').disabled = false;
        $('btnGenerateCreative').textContent = '🎨 Generar';
    }
}

// ── Campaign ───────────────────────────────────────────────
function updateBudgetHint() {
    const budget = parseFloat($('dailyBudget').value) || 5;
    const days = parseInt($('campaignDuration').value) || 7;
    const selected = state.concepts.filter(c => c.selected).length || 1;
    const total = budget * days * selected;
    $('budgetHint').textContent = `$${budget}/día × ${days} días × ${selected} ad set${selected !== 1 ? 's' : ''} = $${total.toFixed(0)} total`;
}

function renderSelectedSummary() {
    const selected = state.concepts.filter(c => c.selected);
    $('selectedCount').textContent = selected.length;
    const list = $('selectedConceptsList');
    list.innerHTML = selected.map((c, i) => `
        <div class="selected-item">
            ${c.imageB64 ? `<img src="data:image/png;base64,${c.imageB64}" style="width:48px;height:48px;border-radius:6px;object-fit:cover" />` : '<span style="font-size:24px">💡</span>'}
            <div>
                <div style="font-weight:700;font-size:13px">${c.angle}</div>
                <div style="font-size:11px;color:var(--text-dim)">${c.headline}</div>
            </div>
        </div>
    `).join('');
    updateBudgetHint();
}

async function launchCampaign() {
    const platform = $('activePlatform').value || 'meta';
    const selected = state.concepts.filter(c => c.selected);
    if (selected.length === 0) {
        showStatus('campaignStatus', '❌ Selecciona al menos un concepto', 'error'); return;
    }

    // Check platform credentials
    const platformNames = { meta: 'Meta', google: 'Google Ads', tiktok: 'TikTok Ads' };
    const credChecks = {
        meta: () => localStorage.getItem('meta_token') && localStorage.getItem('meta_account'),
        google: () => localStorage.getItem('google_token') && localStorage.getItem('google_customer'),
        tiktok: () => localStorage.getItem('tiktok_token') && localStorage.getItem('tiktok_advertiser')
    };
    if (!credChecks[platform]?.()) {
        showStatus('campaignStatus', `❌ Conecta tu cuenta de ${platformNames[platform]} primero (pestaña Configuración)`, 'error'); return;
    }

    const payload = {
        campaignName: $('campaignName').value.trim(),
        objective: $('campaignObjective').value,
        dailyBudgetUsd: parseFloat($('dailyBudget').value) || 5,
        durationDays: parseInt($('campaignDuration').value) || 7,
        destinationUrl: $('destinationUrl').value.trim(),
        targeting: {
            countries: $('targetCountries').value.split(',').map(s => s.trim().toUpperCase()),
            ageMin: parseInt($('ageMin').value) || 18,
            ageMax: parseInt($('ageMax').value) || 45,
            gender: $('targetGender').value,
            interests: $('targetInterests').value.split(',').map(s => s.trim())
        },
        // Strip imageB64 (too large), pass imageUrl instead so the backend uploads by URL
        concepts: selected.map(({ imageB64, ...c }) => ({
            ...c,
            imageUrl: c.imageUrl || (state.selectedProduct?.image || null)
        }))
    };

    const apiMap = { meta: '/api/meta-create-campaign', google: '/api/google-create-campaign', tiktok: '/api/tiktok-create-campaign' };
    const hdrMap = { meta: metaHeaders(), google: googleHeaders(), tiktok: tiktokHeaders() };

    showLoader(`Lanzando campaña en ${platformNames[platform]}...`);
    hideStatus('campaignStatus');

    try {
        const res = await fetch(apiMap[platform], { method: 'POST', headers: hdrMap[platform], body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        const campaign = {
            id: data.campaignId, name: payload.campaignName,
            adSetIds: data.adSetIds, adIds: data.adIds,
            platform, createdAt: new Date().toISOString(),
            destinationUrl: payload.destinationUrl,
            conceptAngles: selected.map(c => c.angle)
        };
        state.campaigns.push(campaign);
        saveState();

        $('badgeCampaign').textContent = '✓'; $('badgeCampaign').classList.add('visible');
        $('badgeDashboard').classList.add('visible');
        hideLoader();

        const successMsg = `✅ Campaña lanzada: ${payload.campaignName}\n(ID: ${data.campaignId}, ${data.adSetIds.length} Ad Sets, ${data.adIds.length} Ads)`;
        showStatus('campaignStatus', successMsg, 'success');

        // Auto-upload AI-generated images if platform is Meta and concepts have imageB64
        const hasImages = platform === 'meta' && selected.some(c => c.imageB64);
        if (hasImages) {
            setTimeout(() => uploadPendingImages(campaign, selected), 800);
        } else {
            setTimeout(() => { populateCampaignSelector(); switchView('dashboard'); }, 1500);
        }
    } catch (err) {
        hideLoader();
        showStatus('campaignStatus', `❌ ${err.message}`, 'error');
    }
}

// ── Image Upload to Running Campaign ───────────────────────

async function uploadPendingImages(campaign, conceptsArg) {
    const { adSetIds, destinationUrl, conceptAngles } = campaign;
    if (!adSetIds?.length) { populateCampaignSelector(); switchView('dashboard'); return; }

    // Build list of concepts to upload (keep imageB64)
    let concepts = conceptsArg;
    if (!concepts) {
        // Match by stored angles
        const angles = conceptAngles || [];
        concepts = angles.map(angle => state.concepts.find(c => c.angle === angle)).filter(Boolean);
    }

    const toUpload = concepts.filter(c => c.imageB64);
    if (toUpload.length === 0) { populateCampaignSelector(); switchView('dashboard'); return; }

    const destUrl = destinationUrl || $('destinationUrl')?.value?.trim() || '';
    if (!destUrl) {
        showStatus('campaignStatus', '⚠️ Campaña lanzada pero sin URL de destino para subir imágenes', 'warning');
        populateCampaignSelector(); switchView('dashboard'); return;
    }

    const newAdIds = [...(campaign.adIds || [])];
    let uploaded = 0, failed = 0;

    for (let i = 0; i < Math.min(toUpload.length, adSetIds.length); i++) {
        const concept = toUpload[i];
        const adSetId = adSetIds[i];
        if (!adSetId) continue;

        showStatus('campaignStatus', `📤 Subiendo imagen ${i + 1}/${toUpload.length} a Meta...`, 'info');

        try {
            const res = await fetch('/api/meta-upload-creative', {
                method: 'POST',
                headers: metaHeaders(),
                body: JSON.stringify({
                    adSetId,
                    imageB64: concept.imageB64,
                    headline: concept.headline,
                    body: concept.body,
                    destinationUrl: destUrl
                })
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            newAdIds.push(d.adId);
            uploaded++;
        } catch (e) {
            console.warn(`Upload failed adSet ${adSetId}: ${e.message}`);
            failed++;
        }
    }

    // Persist updated adIds
    const idx = state.campaigns.findIndex(c => c.id === campaign.id);
    if (idx >= 0) { state.campaigns[idx].adIds = newAdIds; saveState(); }

    const msg = failed > 0
        ? `✅ Campaña activa — ${uploaded} imagen${uploaded !== 1 ? 'es' : ''} subida${uploaded !== 1 ? 's' : ''}, ${failed} fallaron`
        : `✅ Campaña activa con ${uploaded} imagen${uploaded !== 1 ? 'es' : ''} — ID: ${campaign.id}`;
    showStatus('campaignStatus', msg, uploaded > 0 ? 'success' : 'error');

    populateCampaignSelector();
    switchView('dashboard');
    // Show upload panel if there are concepts still without images
    setTimeout(checkPendingUploads, 500);
}

function checkPendingUploads() {
    const sel = $('campaignSelector');
    const campaignId = sel?.value;
    const panel = $('pendingImagesPanel');
    if (!panel) return;

    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign || campaign.platform !== 'meta') { panel.classList.add('hidden'); return; }

    const angles = campaign.conceptAngles || [];
    const concepts = angles.map(a => state.concepts.find(c => c.angle === a)).filter(c => c?.imageB64);
    const pendingCount = concepts.length - (campaign.adIds?.length || 0);

    if (pendingCount <= 0) { panel.classList.add('hidden'); return; }

    panel.classList.remove('hidden');
    $('pendingCount').textContent = pendingCount;
}

async function uploadToExistingCampaign() {
    const campaignId = $('campaignSelector').value;
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    $('btnUploadPending').disabled = true;
    $('btnUploadPending').textContent = 'Subiendo...';

    await uploadPendingImages(campaign, null);

    $('btnUploadPending').disabled = false;
    $('btnUploadPending').textContent = 'Subir imágenes';
    checkPendingUploads();
}

// ── Dashboard ──────────────────────────────────────────────
const PLATFORM_ICONS = { meta: '📘', google: '🔵', tiktok: '🎵' };

function populateCampaignSelector() {
    const sel = $('campaignSelector');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Selecciona una campaña...</option>';
    state.campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.dataset.platform = c.platform || 'meta';
        const icon = PLATFORM_ICONS[c.platform || 'meta'] || '📢';
        opt.textContent = `${icon} ${c.name} (${new Date(c.createdAt).toLocaleDateString('es')})`;
        sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
}

async function refreshStats() {
    const campaignId = $('campaignSelector').value;
    if (!campaignId) return;

    const campaign = state.campaigns.find(c => c.id === campaignId);
    const platform = campaign?.platform || 'meta';

    const apiMap = {
        meta: [`/api/meta-stats?campaignId=${campaignId}`, metaHeaders()],
        google: [`/api/google-stats?campaignId=${campaignId}`, googleHeaders()],
        tiktok: [`/api/tiktok-stats?campaignId=${campaignId}`, tiktokHeaders()]
    };
    const [url, headers] = apiMap[platform] || apiMap.meta;

    $('btnRefreshStats').innerHTML = '<span class="spinner-inline"></span>';
    try {
        const res = await fetch(url, { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        renderStats(data);
    } catch (err) {
        alert(`Error al obtener stats: ${err.message}`);
    } finally {
        $('btnRefreshStats').innerHTML = '↺ Actualizar';
    }
}

function renderStats(data) {
    const kpis = data.summary || {};
    $('kpiSpend').textContent = `$${(kpis.spend || 0).toFixed(2)}`;
    $('kpiImpressions').textContent = (kpis.impressions || 0).toLocaleString();
    $('kpiClicks').textContent = (kpis.clicks || 0).toLocaleString();
    $('kpiCtr').textContent = `${(kpis.ctr || 0).toFixed(2)}%`;
    $('kpiCpm').textContent = `$${(kpis.cpm || 0).toFixed(2)}`;
    $('kpiConversions').textContent = (kpis.conversions || 0).toLocaleString();

    const tbody = $('adsTableBody');
    tbody.innerHTML = '';
    (data.ads || []).forEach(ad => {
        const ctr = parseFloat(ad.ctr || 0);
        const roas = parseFloat(ad.roas || 0);
        let rowClass = 'row-hold', tag = 'tag-hold', label = 'Mantener';
        if (ctr > 2 || roas > 1.5) { rowClass = 'row-scale'; tag = 'tag-scale'; label = '⬆ Escalar'; }
        else if (ctr < 0.5 || (roas > 0 && roas < 0.8)) { rowClass = 'row-pause'; tag = 'tag-pause'; label = '⏸ Pausar'; }
        const tr = document.createElement('tr');
        tr.className = rowClass;
        tr.innerHTML = `
            <td>${ad.name || ad.id}</td>
            <td>$${parseFloat(ad.spend || 0).toFixed(2)}</td>
            <td>${parseInt(ad.impressions || 0).toLocaleString()}</td>
            <td>${parseFloat(ad.ctr || 0).toFixed(2)}%</td>
            <td>$${parseFloat(ad.cpm || 0).toFixed(2)}</td>
            <td>${ad.conversions || 0}</td>
            <td>${roas > 0 ? roas.toFixed(2) + 'x' : '—'}</td>
            <td><span class="${tag}">${label}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

async function analyzeWithAI() {
    const campaignId = $('campaignSelector').value;
    if (!campaignId) { alert('Selecciona una campaña primero'); return; }

    showLoader('Agente Media Buyer analizando rendimiento...');
    try {
        const statsRes = await fetch(`/api/meta-stats?campaignId=${campaignId}`, { headers: metaHeaders() });
        const statsData = await statsRes.json();
        if (!statsRes.ok) throw new Error(statsData.error);

        const res = await fetch('/api/meta-optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId, stats: statsData, briefing: state.briefing })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        state.pendingOptimizations = data;
        renderOptimizations(data);
        hideLoader();
    } catch (err) {
        hideLoader();
        alert(`Error: ${err.message}`);
    }
}

function renderOptimizations(data) {
    const panel = $('optimizationPanel');
    const content = $('optimizationContent');
    panel.classList.remove('hidden');

    let html = `<div class="opt-section"><h4>📊 Análisis General</h4><div class="opt-item">${data.insights || ''}</div></div>`;

    if (data.pause?.length > 0) {
        html += `<div class="opt-section"><h4>⏸ Pausar (bajo rendimiento)</h4>`;
        data.pause.forEach(id => { html += `<div class="opt-item">Ad ID: ${id}</div>`; });
        html += '</div>';
    }
    if (data.scale?.length > 0) {
        html += `<div class="opt-section"><h4>⬆ Escalar (alto rendimiento)</h4>`;
        data.scale.forEach(s => { html += `<div class="opt-item">Ad ID: ${s.adId} → Nuevo presupuesto: $${s.newBudget}/día</div>`; });
        html += '</div>';
    }
    if (data.copyTweaks) {
        html += `<div class="opt-section"><h4>✏️ Mejoras de Copy Sugeridas</h4><div class="opt-item">${data.copyTweaks}</div></div>`;
    }

    content.innerHTML = html;
    if ((data.pause?.length || 0) + (data.scale?.length || 0) > 0) {
        $('btnApplyOptimizations').classList.remove('hidden');
    }
}

async function applyOptimizations() {
    if (!state.pendingOptimizations) return;
    if (!confirm('¿Aplicar las recomendaciones de la IA en Meta Ads?')) return;

    showLoader('Aplicando optimizaciones en Meta...');
    try {
        const res = await fetch('/api/meta-optimize', {
            method: 'PATCH',
            headers: metaHeaders(),
            body: JSON.stringify(state.pendingOptimizations)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        hideLoader();
        state.pendingOptimizations = null;
        $('btnApplyOptimizations').classList.add('hidden');
        alert('✅ Optimizaciones aplicadas correctamente');
        await refreshStats();
    } catch (err) {
        hideLoader();
        alert(`Error: ${err.message}`);
    }
}

// ── Boot ───────────────────────────────────────────────────
init();
