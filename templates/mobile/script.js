// ==================================================
// MOBILE TEMPLATE CONFIGURATION
// ==================================================
const CONFIG = {
    // VARIÁVEIS SUBSTITUÍDAS AUTOMATICAMENTE:
    MIKROTIK_ID: '{{MIKROTIK_ID}}',
    API_URL: '{{API_URL}}',
    
    // Configurações específicas mobile:
    CHECK_INTERVAL: 5000,
    PAYMENT_TIMEOUT: 1800,
    DEBUG: {{DEBUG_MODE}},
    MOBILE_FEATURES: {
        HAPTIC_FEEDBACK: true,
        AUTO_FOCUS: true,
        SMOOTH_SCROLL: true,
        SWIPE_GESTURES: true
    }
};

// Global state
const state = {
    mac: null,
    ip: null,
    interface: null,
    linkOrig: null,
    linkLogin: null,
    mikrotikId: null,
    apiUrl: null,
    debug: false,
    plans: [],
    selectedPlan: null,
    paymentId: null,
    checkInterval: null,
    timerInterval: null,
    pixCopied: false,
    trialActivated: false,
    currentScreen: 'welcomeScreen',
    touchStartY: 0,
    touchEndY: 0
};

// Mobile-specific utilities
const MobileUtils = {
    // Haptic feedback for mobile devices
    vibrate(pattern = [50]) {
        if (CONFIG.MOBILE_FEATURES.HAPTIC_FEEDBACK && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    },

    // Check if device is mobile
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    // Get viewport height accounting for mobile browsers
    getViewportHeight() {
        return window.visualViewport ? window.visualViewport.height : window.innerHeight;
    },

    // Smooth scroll to element
    scrollToElement(element, offset = 0) {
        if (!CONFIG.MOBILE_FEATURES.SMOOTH_SCROLL) return;
        
        const elementPosition = element.offsetTop - offset;
        window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
        });
    },

    // Add loading state to button
    setButtonLoading(button, loading = true) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
            this.vibrate([30]);
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    },

    // Show toast-like message
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 20px;
            border-radius: 25px;
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
            color: white;
            font-weight: 600;
            font-size: 14px;
            z-index: 9999;
            box-shadow: var(--shadow-lg);
            animation: slideDown 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 MikroTik Mobile Portal carregado');
    initializeApp();
    setupMobileFeatures();
    
    // Check for MikroTik error
    const mikrotikError = '$(error)';
    if (mikrotikError && !mikrotikError.includes('$(')) {
        showMessage('⚠️ Erro de autenticação: ' + mikrotikError, 'error');
        console.error('MikroTik Error:', mikrotikError);
    }
});

function initializeApp() {
    getUrlParams();
    
    // Override with CONFIG values
    state.mikrotikId = state.mikrotikId || CONFIG.MIKROTIK_ID;
    state.apiUrl = state.apiUrl || CONFIG.API_URL;
    state.debug = state.debug || CONFIG.DEBUG;
    
    // Clean API URL
    if (state.apiUrl) {
        state.apiUrl = state.apiUrl.replace(/\/$/, '');
    }
    
    updateDebugInfo('Aplicação inicializada - Mobile');
    
    console.log('Mobile State initialized:', state);
    console.log('Mobile Configuration:', CONFIG);
    
    // Check configuration
    if (!state.mikrotikId || !state.apiUrl) {
        showMessage('⚠️ Configuração incompleta. Verifique MIKROTIK_ID e API_URL.', 'error');
    }
}

function setupMobileFeatures() {
    // Setup touch gestures
    if (CONFIG.MOBILE_FEATURES.SWIPE_GESTURES) {
        setupSwipeGestures();
    }
    
    // Setup viewport handler for mobile keyboards
    setupViewportHandler();
    
    // Setup auto-focus behavior
    if (CONFIG.MOBILE_FEATURES.AUTO_FOCUS) {
        setupAutoFocus();
    }
    
    // Add mobile-specific event listeners
    setupMobileEventListeners();
}

function setupSwipeGestures() {
    let touchStartY = 0;
    let touchEndY = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        touchEndY = e.changedTouches[0].screenY;
        handleSwipeGesture();
    }, { passive: true });
    
    function handleSwipeGesture() {
        const swipeThreshold = 50;
        const diff = touchStartY - touchEndY;
        
        if (Math.abs(diff) < swipeThreshold) return;
        
        // Swipe up (show next logical screen)
        if (diff > 0) {
            handleSwipeUp();
        }
        // Swipe down (show previous screen or refresh)
        else {
            handleSwipeDown();
        }
    }
    
    function handleSwipeUp() {
        const currentScreen = state.currentScreen;
        MobileUtils.vibrate([25]);
        
        switch (currentScreen) {
            case 'welcomeScreen':
                // Quick action to plans
                if (MobileUtils.isMobile()) {
                    showPlansScreen();
                }
                break;
            case 'plansScreen':
                // If plan selected, go to instructions
                if (state.selectedPlan) {
                    showInstructionsScreen();
                }
                break;
        }
    }
    
    function handleSwipeDown() {
        MobileUtils.vibrate([25]);
        
        // Pull to refresh on welcome screen
        if (state.currentScreen === 'welcomeScreen') {
            location.reload();
        }
        // Go back on other screens
        else {
            goBack();
        }
    }
}

function setupViewportHandler() {
    // Handle viewport changes (keyboard show/hide)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const container = document.querySelector('.container');
            if (container) {
                const viewportHeight = window.visualViewport.height;
                const windowHeight = window.innerHeight;
                
                // Keyboard is showing
                if (viewportHeight < windowHeight * 0.75) {
                    document.body.style.height = viewportHeight + 'px';
                    container.style.transform = 'translateY(-20px)';
                } else {
                    document.body.style.height = '';
                    container.style.transform = '';
                }
            }
        });
    }
}

function setupAutoFocus() {
    // Auto-focus inputs when screens become active
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.classList.contains('active')) {
                    setTimeout(() => {
                        const input = target.querySelector('input[type="password"], input[type="text"]');
                        if (input && CONFIG.MOBILE_FEATURES.AUTO_FOCUS) {
                            input.focus();
                        }
                    }, 300);
                }
            }
        });
    });
    
    document.querySelectorAll('.screen').forEach(screen => {
        observer.observe(screen, { attributes: true });
    });
}

function setupMobileEventListeners() {
    // Add touch feedback to buttons
    document.addEventListener('touchstart', (e) => {
        if (e.target.matches('.btn, .plan-card')) {
            e.target.style.transform = 'scale(0.98)';
            MobileUtils.vibrate([25]);
        }
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        if (e.target.matches('.btn, .plan-card')) {
            setTimeout(() => {
                e.target.style.transform = '';
            }, 100);
        }
    }, { passive: true });
}

function getUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Get MikroTik variables
    state.mac = urlParams.get('mac') || '$(mac)';
    state.ip = urlParams.get('ip') || '$(ip)';
    state.interface = urlParams.get('interface') || '$(interface-name)';
    state.linkOrig = urlParams.get('link-orig') || '$(link-orig)';
    state.linkLogin = urlParams.get('link-login') || '$(link-login)';
    
    // Clean MikroTik template variables
    if (state.mac && state.mac.includes('$(')) state.mac = null;
    if (state.ip && state.ip.includes('$(')) state.ip = null;
    if (state.interface && state.interface.includes('$(')) state.interface = null;
    if (state.linkOrig && state.linkOrig.includes('$(')) state.linkOrig = null;
    if (state.linkLogin && state.linkLogin.includes('$(')) state.linkLogin = null;
    
    console.log('Mobile URL params captured:', {
        mac: state.mac,
        ip: state.ip,
        interface: state.interface,
        isMobile: MobileUtils.isMobile()
    });
}

function updateDebugInfo(info) {
    if (!state.debug) return;
    
    const debugDiv = document.getElementById('debugInfo');
    if (debugDiv) {
        debugDiv.style.display = 'block';
        debugDiv.innerHTML = `
            <strong>Mobile Debug:</strong><br>
            ${info}<br>
            MAC: ${state.mac || 'N/A'}<br>
            IP: ${state.ip || 'N/A'}<br>
            MikroTik ID: ${state.mikrotikId || 'N/A'}<br>
            API URL: ${state.apiUrl || 'N/A'}<br>
            Mobile: ${MobileUtils.isMobile() ? 'Yes' : 'No'}<br>
            Viewport: ${MobileUtils.getViewportHeight()}px
        `;
    }
}

// Enhanced screen navigation with mobile optimizations
function showScreen(screenId) {
    const previousScreen = state.currentScreen;
    
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen with animation
    setTimeout(() => {
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            state.currentScreen = screenId;
            
            // Scroll to top smoothly
            if (CONFIG.MOBILE_FEATURES.SMOOTH_SCROLL) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            
            // Announce screen change for accessibility
            if (MobileUtils.isMobile()) {
                const title = targetScreen.querySelector('.title');
                if (title) {
                    MobileUtils.showToast(title.textContent, 'info', 1500);
                }
            }
        }
    }, 50);
    
    updateDebugInfo(`Tela: ${screenId} (anterior: ${previousScreen})`);
}

function showWelcomeScreen() {
    showScreen('welcomeScreen');
    stopAllIntervals();
}

function showPasswordScreen() {
    showScreen('passwordScreen');
    stopAllIntervals();
}

function showPlansScreen() {
    showScreen('plansScreen');
    loadPlans();
}

function showInstructionsScreen() {
    if (!state.selectedPlan) {
        showMessage('Selecione um plano primeiro', 'error');
        MobileUtils.vibrate([100, 50, 100]);
        return;
    }
    showScreen('instructionsScreen');
}

function showPixScreen() {
    showScreen('pixScreen');
}

function showSuccessScreen() {
    showScreen('successScreen');
    MobileUtils.vibrate([200, 100, 200]);
}

function showLoadingScreen(text) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) {
        loadingText.innerHTML = (text || 'Processando') + '<span class="loading-dots"></span>';
    }
    showScreen('loadingScreen');
}

function goBack() {
    const currentScreen = state.currentScreen;
    
    switch (currentScreen) {
        case 'passwordScreen':
        case 'plansScreen':
            showWelcomeScreen();
            break;
        case 'instructionsScreen':
            showPlansScreen();
            break;
        case 'pixScreen':
            showInstructionsScreen();
            break;
        case 'successScreen':
            showWelcomeScreen();
            break;
        default:
            showWelcomeScreen();
    }
}

// Enhanced login with mobile optimizations
function loginWithPassword() {
    const passwordInput = document.getElementById('password');
    const password = passwordInput.value.trim();
    
    if (!password) {
        showMessage('Por favor, digite uma senha', 'error');
        MobileUtils.vibrate([100, 50, 100]);
        passwordInput.focus();
        return;
    }
    
    // Mobile haptic feedback
    MobileUtils.vibrate([50]);
    
    // Se não temos configuração da API, fazer login direto
    if (!state.apiUrl || !state.mikrotikId) {
        console.log('⚠️ Configuração da API não encontrada, fazendo login direto');
        loginDirectly(password);
        return;
    }
    
    showLoadingScreen('Verificando Senha...');
    updateDebugInfo('Verificando senha via API: ' + password);
    
    console.log('🔍 Iniciando verificação de voucher (Mobile):', {
        senha: password,
        mikrotik_id: state.mikrotikId,
        mac: state.mac,
        ip: state.ip,
        userAgent: navigator.userAgent,
        isMobile: MobileUtils.isMobile()
    });
    
    // Verificar voucher via API
    fetch(state.apiUrl + '/api/payment/captive/check-user', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            username: password,
            password: password,
            mikrotik_id: state.mikrotikId,
            mac_address: state.mac,
            ip_address: state.ip,
            user_agent: navigator.userAgent,
            mobile_device: MobileUtils.isMobile()
        })
    })
    .then(function(response) {
        console.log('📥 Resposta da API (Mobile):', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });
        
        return response.json();
    })
    .then(function(result) {
        console.log('📋 Dados da resposta (Mobile):', result);
        
        if (result.success) {
            console.log('✅ Voucher verificado com sucesso (Mobile):', result.data);
            
            // Success haptic feedback
            MobileUtils.vibrate([100, 50, 100, 50, 100]);
            
            var successMessage = '✅ Voucher válido! ';
            if (result.data.plan_name) {
                successMessage += 'Plano: ' + result.data.plan_name;
            }
            
            if (result.data.has_comment !== false && result.data.plan_value && result.data.plan_value > 0) {
                successMessage += ' - R$ ' + result.data.plan_value.toFixed(2);
            } 
            else if (result.data.has_comment === false) {
                successMessage += ' (Voucher Físico)';
            }
            else {
                successMessage += ' - R$ 0,00';
            }
            
            showMessage(successMessage, 'success');
            
            setTimeout(function() {
                console.log('🚀 Conectando (Mobile)...');
                loginDirectly(password);
            }, 2000);
            
        } else {
            console.error('❌ Erro na verificação (Mobile):', result);
            
            // Error haptic feedback
            MobileUtils.vibrate([200, 100, 200]);
            
            var userMessage = result.message || 'Voucher não encontrado ou inválido';
            showMessage('❌ ' + userMessage, 'error');
            
            setTimeout(function() {
                showPasswordScreen();
                passwordInput.value = '';
                if (CONFIG.MOBILE_FEATURES.AUTO_FOCUS) {
                    passwordInput.focus();
                }
            }, 3000);
        }
    })
    .catch(function(error) {
        console.error('❌ Erro na comunicação com API (Mobile):', error);
        showMessage('⚠️ Erro de conexão. Tentando login direto...', 'warning');
        
        setTimeout(function() {
            console.log('🔄 Fallback: fazendo login direto devido a erro de conexão (Mobile)');
            loginDirectly(password);
        }, 2500);
    });
}

function loginDirectly(password) {
    console.log('🔗 Fazendo login direto no MikroTik (Mobile)');
    showMessage('Conectando...', 'success');
    updateDebugInfo('Login direto com senha: ' + password);
    
    // Success haptic feedback
    MobileUtils.vibrate([50, 25, 50]);
    
    document.getElementById('hiddenUsername').value = password;
    document.getElementById('hiddenPassword').value = password;
    document.forms.login.submit();
}

// Enhanced plan loading with mobile optimizations
async function loadPlans() {
    if (!state.apiUrl || !state.mikrotikId) {
        showMessage('Configuração da API não encontrada', 'error');
        const container = document.getElementById('plansContainer');
        if (container) {
            container.innerHTML = 
                '<div style="text-align: center; padding: 40px; color: var(--gray);">' +
                '<p>❌ Configure MIKROTIK_ID e API_URL</p>' +
                '</div>';
        }
        document.getElementById('loadingPlans').style.display = 'none';
        return;
    }

    document.getElementById('loadingPlans').style.display = 'block';
    const container = document.getElementById('plansContainer');
    if (container) {
        container.innerHTML = '';
    }

    try {
        const response = await fetch(state.apiUrl + '/api/payment/plans-by-mikrotik', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mikrotik_id: state.mikrotikId,
                mobile_device: MobileUtils.isMobile()
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro na API: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.planos && data.planos.length > 0) {
            const sortedPlans = data.planos.sort((a, b) => Number(a.preco) - Number(b.preco));
            state.plans = sortedPlans;
            displayPlans(sortedPlans);
            
            // Success haptic feedback
            MobileUtils.vibrate([25]);
        } else {
            throw new Error('Nenhum plano disponível');
        }
    } catch (error) {
        console.error('Error loading plans (Mobile):', error);
        showMessage('Erro ao carregar planos: ' + error.message, 'error');
        
        if (container) {
            container.innerHTML = 
                '<div style="text-align: center; padding: 40px; color: var(--gray);">' +
                '<p>❌ Erro ao carregar planos</p>' +
                '<button onclick="loadPlans()" class="btn btn-primary" style="margin-top: 15px;">🔄 Tentar Novamente</button>' +
                '</div>';
        }
    } finally {
        document.getElementById('loadingPlans').style.display = 'none';
    }
}

function displayPlans(plans) {
    const container = document.getElementById('plansContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    plans.forEach(function(plan, index) {
        const planCard = document.createElement('div');
        planCard.className = 'plan-card fade-in';
        planCard.setAttribute('data-plan-id', plan.id);
        planCard.style.animationDelay = (index * 0.1) + 's';
        
        const planNumber = index + 1;
        planCard.innerHTML = 
            '<div class="plan-number">PLANO ' + planNumber + '</div>' +
            '<div class="plan-info">' +
                '<div class="plan-duration">' + plan.duracao + '</div>' +
                '<div class="plan-price">R$ ' + Number(plan.preco).toFixed(2) + '</div>' +
            '</div>';
        
        planCard.addEventListener('click', function() {
            selectPlan(plan.id);
            setTimeout(() => {
                showInstructionsScreen();
            }, 300);
        });
        
        container.appendChild(planCard);
    });
}

function selectPlan(planId) {
    // Remove previous selection
    document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selection to clicked plan
    const planCard = document.querySelector('[data-plan-id="' + planId + '"]');
    if (planCard) {
        planCard.classList.add('selected');
        MobileUtils.vibrate([50]);
    }
    
    // Store selected plan
    const selectedPlan = state.plans.find(plan => plan.id == planId);
    if (selectedPlan) {
        state.selectedPlan = selectedPlan;
        console.log('Plano selecionado (Mobile):', selectedPlan);
    }
}

// Enhanced PIX generation with mobile optimizations
async function generatePix() {
    if (!state.selectedPlan) {
        showMessage('Selecione um plano primeiro', 'error');
        MobileUtils.vibrate([100, 50, 100]);
        return;
    }
    
    if (!state.mac) {
        showMessage('MAC address não encontrado', 'error');
        MobileUtils.vibrate([100, 50, 100]);
        return;
    }
    
    showLoadingScreen('Gerando PIX...');
    MobileUtils.vibrate([50]);
    
    try {
        const response = await fetch(state.apiUrl + '/api/payment/create-captive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mikrotik_id: state.mikrotikId,
                plano_id: state.selectedPlan.id,
                mac_address: state.mac,
                mobile_device: MobileUtils.isMobile()
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Erro ao criar pagamento: ${response.status}`);
        }
        
        const paymentData = await response.json();
        
        if (paymentData && paymentData.success && paymentData.data) {
            showPixScreen();
            
            state.paymentId = paymentData.data.payment_id;
            
            displayPixData({
                qrcode: paymentData.data.qr_code,
                chave_pix: paymentData.data.pix_code,
                valor: paymentData.data.amount,
                plano: {
                    nome: paymentData.data.plan_name,
                    duracao: paymentData.data.plan_duration
                }
            });
            
            startPaymentCheck();
            
            // Success haptic feedback
            MobileUtils.vibrate([100, 50, 100]);
            
            console.log('✅ Pagamento PIX criado (Mobile):', paymentData.data.payment_id);
        } else {
            throw new Error('Erro na resposta da API ao criar pagamento');
        }
    } catch (error) {
        console.error('Erro ao gerar PIX (Mobile):', error);
        showMessage('Erro ao gerar PIX: ' + error.message, 'error');
        MobileUtils.vibrate([200, 100, 200]);
        showPlansScreen();
    }
}

function displayPixData(data) {
    // Set QR Code
    if (data.qrcode) {
        const qrImg = document.getElementById('qrCode');
        if (qrImg) {
            qrImg.src = 'data:image/png;base64,' + data.qrcode;
            qrImg.onload = () => {
                qrImg.classList.add('fade-in');
            };
        }
    }
    
    // Set PIX code
    if (data.chave_pix) {
        const pixCodeEl = document.getElementById('pixCode');
        if (pixCodeEl) {
            pixCodeEl.textContent = data.chave_pix;
        }
    }
    
    // Set plan info
    if (data.plano) {
        const planNameEl = document.getElementById('pixPlanName');
        const planDurationEl = document.getElementById('pixPlanDuration');
        
        if (planNameEl) planNameEl.textContent = data.plano.nome || 'N/A';
        if (planDurationEl) planDurationEl.textContent = data.plano.duracao || 'N/A';
    }
    
    // Set amount
    if (data.valor) {
        const amountEl = document.getElementById('pixAmount');
        if (amountEl) {
            amountEl.textContent = 'R$ ' + Number(data.valor).toFixed(2);
        }
    }
    
    // Setup copy button with mobile optimizations
    setTimeout(() => {
        const copyBtn = document.getElementById('copyPixBtn');
        if (copyBtn) {
            copyBtn.replaceWith(copyBtn.cloneNode(true));
            const newCopyBtn = document.getElementById('copyPixBtn');
            
            newCopyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('🔘 Botão de copiar PIX clicado (Mobile)');
                copyPixCode();
            });
            
            // Add long press for alternative copy method on mobile
            if (MobileUtils.isMobile()) {
                let pressTimer;
                
                newCopyBtn.addEventListener('touchstart', function(e) {
                    pressTimer = setTimeout(() => {
                        MobileUtils.vibrate([100]);
                        MobileUtils.showToast('Mantém pressionado para copiar', 'info', 2000);
                    }, 500);
                });
                
                newCopyBtn.addEventListener('touchend', function(e) {
                    clearTimeout(pressTimer);
                });
            }
            
            console.log('✅ Event listener do botão copiar PIX configurado (Mobile)');
        }
    }, 100);
    
    startPaymentTimer();
}

function copyPixCode() {
    console.log('copyPixCode function called (Mobile)');
    
    const pixCodeEl = document.getElementById('pixCode');
    const btn = document.getElementById('copyPixBtn');
    
    if (!pixCodeEl || !btn) {
        showMessage('❌ Elementos não encontrados', 'error');
        MobileUtils.vibrate([100, 50, 100]);
        return;
    }
    
    const pixCode = pixCodeEl.textContent;
    
    if (!pixCode || pixCode.trim() === '') {
        showMessage('❌ Código PIX não encontrado', 'error');
        MobileUtils.vibrate([100, 50, 100]);
        return;
    }
    
    console.log('Tentando copiar código PIX (Mobile):', pixCode);
    
    // Try Clipboard API first (preferred for mobile)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pixCode).then(() => {
            console.log('✅ Código copiado com sucesso via Clipboard API (Mobile)');
            handleCopySuccess(btn);
        }).catch((err) => {
            console.warn('Clipboard API falhou, tentando fallback (Mobile):', err);
            copyPixCodeFallback(pixCode, btn);
        });
    } else {
        console.log('Clipboard API não disponível, usando fallback (Mobile)');
        copyPixCodeFallback(pixCode, btn);
    }
}

function copyPixCodeFallback(pixCode, btn) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = pixCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.zIndex = '-1';
        textArea.readOnly = true;
        
        document.body.appendChild(textArea);
        
        // Mobile-specific selection
        if (MobileUtils.isMobile()) {
            textArea.setSelectionRange(0, pixCode.length);
        } else {
            textArea.select();
        }
        
        textArea.focus();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            console.log('✅ Código copiado com sucesso via fallback (Mobile)');
            handleCopySuccess(btn);
        } else {
            throw new Error('execCommand failed');
        }
    } catch (err) {
        console.error('❌ Erro no fallback de cópia (Mobile):', err);
        
        // Show manual copy instructions for mobile
        if (MobileUtils.isMobile()) {
            showMessage('📱 Toque e segure o código para copiar manualmente', 'warning');
            
            // Add manual copy functionality
            const pixCodeEl = document.getElementById('pixCode');
            if (pixCodeEl) {
                pixCodeEl.style.userSelect = 'all';
                pixCodeEl.style.webkitUserSelect = 'all';
                
                setTimeout(() => {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(pixCodeEl);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }, 100);
            }
        } else {
            showMessage('❌ Erro ao copiar código. Tente selecionar e copiar manualmente.', 'error');
        }
        
        MobileUtils.vibrate([200, 100, 200]);
    }
}

function handleCopySuccess(btn) {
    showMessage('📋 Código PIX copiado! Ativando acesso trial em 3 segundos...', 'success');
    state.pixCopied = true;
    
    // Enhanced haptic feedback for successful copy
    MobileUtils.vibrate([100, 50, 100, 50, 100]);
    
    // Visual feedback
    btn.classList.add('copied');
    btn.innerHTML = '✅ Copiado!';
    
    // Show floating success message for mobile
    if (MobileUtils.isMobile()) {
        MobileUtils.showToast('PIX copiado! Trial em 3 segundos...', 'success', 3000);
    }
    
    console.log('🚀 PIX copiado - ativando trial em 3 segundos (Mobile)...');
    
    setTimeout(() => {
        console.log('🚀 3 segundos passaram - ativando trial (Mobile)...');
        activateTrial();
    }, 3000);
    
    // Reset button
    setTimeout(() => {
        if (btn) {
            btn.classList.remove('copied');
            btn.innerHTML = '📋 Copiar PIX';
        }
    }, 5000);
}

function startPaymentTimer() {
    let timeLeft = CONFIG.PAYMENT_TIMEOUT;
    
    state.timerInterval = setInterval(() => {
        timeLeft--;
        
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        const timerEl = document.getElementById('paymentTimer');
        if (timerEl) {
            timerEl.textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Visual warning when time is running low
            if (timeLeft <= 300) { // 5 minutes
                timerEl.classList.add('pulse');
            }
            
            // Mobile notification when time is almost up
            if (timeLeft === 60 && MobileUtils.isMobile()) {
                MobileUtils.vibrate([200, 100, 200]);
                MobileUtils.showToast('⚠️ Restam apenas 1 minuto!', 'warning', 5000);
            }
        }
        
        if (timeLeft <= 0) {
            clearInterval(state.timerInterval);
            showMessage('⏰ Tempo esgotado! Gere um novo PIX.', 'warning');
            MobileUtils.vibrate([300, 100, 300]);
            showPlansScreen();
        }
    }, 1000);
}

function startPaymentCheck() {
    state.checkInterval = setInterval(checkPaymentStatus, CONFIG.CHECK_INTERVAL);
    const checkingEl = document.getElementById('paymentChecking');
    if (checkingEl) {
        checkingEl.style.display = 'block';
    }
}

function stopPaymentCheck() {
    if (state.checkInterval) {
        clearInterval(state.checkInterval);
        state.checkInterval = null;
    }
    const checkingEl = document.getElementById('paymentChecking');
    if (checkingEl) {
        checkingEl.style.display = 'none';
    }
}

function stopAllIntervals() {
    stopPaymentCheck();
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

// Enhanced payment status check
async function checkPaymentStatus() {
    if (!state.paymentId) {
        console.error('Payment ID not found (Mobile)');
        return false;
    }
    
    try {
        const response = await fetch(state.apiUrl + '/api/payment/status-captive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_id: state.paymentId,
                mac_address: state.mac,
                mobile_device: MobileUtils.isMobile()
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro na verificação: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.success && data.data) {
            const payment = data.data;
            
            console.log('Status do pagamento (Mobile):', payment.status);
            
            if (payment.status === 'completed') {
                stopPaymentCheck();
                
                // Update success info
                if (payment.usuario_criado && payment.senha_usuario) {
                    const userEl = document.getElementById('successUser');
                    const passEl = document.getElementById('successPass');
                    
                    if (userEl) userEl.textContent = payment.usuario_criado;
                    if (passEl) passEl.textContent = payment.senha_usuario;
                }
                
                showSuccessScreen();
                
                // Success celebration vibration
                MobileUtils.vibrate([200, 100, 200, 100, 200]);
                
                return true;
            }
            
            return false;
        } else {
            console.error('Resposta inválida da API (Mobile):', data);
            return false;
        }
    } catch (error) {
        console.error('Erro ao verificar pagamento (Mobile):', error);
        return false;
    }
}

function connectWithCredentials() {
    const userEl = document.getElementById('successUser');
    const passEl = document.getElementById('successPass');
    
    if (!userEl || !passEl) return;
    
    const username = userEl.textContent;
    const password = passEl.textContent;
    
    if (username && password && username !== '-' && password !== '-') {
        MobileUtils.vibrate([50, 25, 50]);
        
        document.getElementById('hiddenUsername').value = username;
        document.getElementById('hiddenPassword').value = password;
        document.forms.login.submit();
    } else {
        showMessage('Credenciais não encontradas', 'error');
        MobileUtils.vibrate([100, 50, 100]);
    }
}

function activateTrial() {
    if (state.trialActivated) {
        console.log('Trial já foi ativado anteriormente (Mobile)');
        return;
    }
    
    console.log('=== ATIVANDO TRIAL - MOBILE VERSION ===');
    
    state.trialActivated = true;
    
    const form = document.forms.login;
    const linkLoginOnly = form ? form.action : null;
    const linkOrig = state.linkOrig;
    const mac = state.mac;
    
    console.log('Informações do MikroTik (Mobile):');
    console.log('- link-login-only:', linkLoginOnly);
    console.log('- link-orig:', linkOrig);
    console.log('- mac:', mac);
    console.log('- isMobile:', MobileUtils.isMobile());
    
    if (!linkLoginOnly || linkLoginOnly.includes('$(')) {
        console.error('❌ link-login-only não disponível (Mobile)');
        showMessage('⚠️ Informações do MikroTik não disponíveis para trial', 'warning');
        MobileUtils.vibrate([200, 100, 200]);
        return;
    }
    
    if (!mac || mac.includes('$(')) {
        console.error('❌ MAC address não disponível (Mobile)');
        showMessage('⚠️ MAC address não disponível para trial', 'warning');
        MobileUtils.vibrate([200, 100, 200]);
        return;
    }
    
    let trialUrl = linkLoginOnly;
    const params = [];
    
    if (linkOrig && !linkOrig.includes('$(')) {
        params.push('dst=' + encodeURIComponent(linkOrig));
    }
    
    params.push('username=T-' + mac);
    
    if (params.length > 0) {
        trialUrl += (trialUrl.includes('?') ? '&' : '?') + params.join('&');
    }
    
    console.log('🚀 URL DO TRIAL (Mobile):', trialUrl);
    console.log('🚀 MAC ORIGINAL:', mac);
    console.log('🚀 USERNAME:', 'T-' + mac);
    
    showMessage('🚀 Ativando acesso trial...', 'success');
    
    // Enhanced mobile feedback
    MobileUtils.vibrate([300, 100, 300, 100, 300]);
    MobileUtils.showToast('Redirecionando para trial...', 'success', 2000);
    
    console.log('REDIRECIONANDO AGORA (Mobile)...');
    window.location.href = trialUrl;
}

function showMessage(message, type) {
    // Remove existing messages
    document.querySelectorAll('.message').forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} fade-in`;
    messageDiv.innerHTML = message;
    
    // Insert at top of current screen
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        activeScreen.insertBefore(messageDiv, activeScreen.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            messageDiv.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => messageDiv.remove(), 300);
        }, 5000);
    }
    
    // Also show mobile toast for important messages
    if (MobileUtils.isMobile() && (type === 'error' || type === 'warning')) {
        MobileUtils.showToast(message.replace(/[⚠️❌🚀✅📋]/g, '').trim(), type, 3000);
    }
}

// Add CSS animations via JavaScript
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(0); opacity: 1; }
        to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(style);