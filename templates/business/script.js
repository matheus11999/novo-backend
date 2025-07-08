// ==================================================
// CONFIGURAÇÃO IMPORTANTE - ALTERE AQUI!
// ==================================================
const CONFIG = {
    // VARIÁVEIS SUBSTITUÍDAS AUTOMATICAMENTE:
    MIKROTIK_ID: '{{MIKROTIK_ID}}',  // ← ID do MikroTik atual
    API_URL: '{{API_URL}}',  // ← URL da API (do .env)
    
    // Outras configurações:
    CHECK_INTERVAL: 5000,      // Intervalo de verificação (5 segundos)
    PAYMENT_TIMEOUT: 1800,     // Timeout do pagamento (30 minutos)
    DEBUG: {{DEBUG_MODE}}               // Ativar modo debug
};
// ==================================================

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
    trialInterval: null
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 MikroTik Captive Portal carregado');
    initializeApp();
    
    // Check for MikroTik error
    const mikrotikError = '$(error)';
    if (mikrotikError && !mikrotikError.includes('$(')) {
        showMessage('⚠️ Erro de autenticação: ' + mikrotikError, 'error');
        console.error('MikroTik Error:', mikrotikError);
    }
});

function initializeApp() {
    // Get URL parameters and MikroTik variables
    getUrlParams();
    
    // Override with CONFIG values
    state.mikrotikId = state.mikrotikId || CONFIG.MIKROTIK_ID;
    state.apiUrl = state.apiUrl || CONFIG.API_URL;
    state.debug = state.debug || CONFIG.DEBUG;
    
    // Clean API URL
    state.apiUrl = state.apiUrl.replace(/\/$/, '');
    
    // Update debug info
    updateDebugInfo('Aplicação inicializada');
    
    console.log('State initialized:', state);
    console.log('Configuration:', CONFIG);
    
    // Check if we have required configuration
    if (!state.mikrotikId || !state.apiUrl) {
        showMessage('⚠️ Configuração incompleta. Verifique MIKROTIK_ID e API_URL.', 'error');
    }
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
    
    console.log('URL params captured:', {
        mac: state.mac,
        ip: state.ip,
        interface: state.interface
    });
}

function updateDebugInfo(info) {
    if (!state.debug) return;
    
    const debugDiv = document.getElementById('debugInfo');
    if (debugDiv) {
        debugDiv.style.display = 'block';
        debugDiv.innerHTML = `
            <strong>Debug Info:</strong><br>
            ${info}<br>
            MAC: ${state.mac || 'N/A'}<br>
            IP: ${state.ip || 'N/A'}<br>
            MikroTik ID: ${state.mikrotikId || 'N/A'}<br>
            API URL: ${state.apiUrl || 'N/A'}
        `;
    }
}

// Screen navigation
function showWelcomeScreen() {
    showScreen('welcomeScreen');
    stopAllIntervals();
}

function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen
    setTimeout(() => {
        document.getElementById(screenId).classList.add('active');
    }, 50);
    
    updateDebugInfo('Tela: ' + screenId);
}

function showPasswordScreen() {
    showScreen('passwordScreen');
    stopAllIntervals();
    setTimeout(() => {
        document.getElementById('password').focus();
    }, 300);
}

function showPlansScreen() {
    showScreen('plansScreen');
    loadPlans();
}

function showInstructionsScreen() {
    if (!state.selectedPlan) {
        showMessage('Selecione um plano primeiro', 'error');
        return;
    }
    showScreen('instructionsScreen');
}

function showPixScreen() {
    showScreen('pixScreen');
}

function showSuccessScreen() {
    showScreen('successScreen');
}

function showLoadingScreen(text) {
    document.getElementById('loadingText').innerHTML = (text || 'Processando') + '<span class="loading-dots"></span>';
    showScreen('loadingScreen');
}

// Login with password
function loginWithPassword() {
    const passwordInput = document.getElementById('password');
    const password = passwordInput.value.trim();
    
    if (!password) {
        showMessage('Por favor, digite uma senha', 'error');
        passwordInput.focus();
        return;
    }
    
    // Se não temos configuração da API, fazer login direto
    if (!state.apiUrl || !state.mikrotikId) {
        console.log('⚠️ Configuração da API não encontrada, fazendo login direto');
        loginDirectly(password);
        return;
    }
    
    showLoadingScreen('Verificando Senha...');
    updateDebugInfo('Verificando senha via API: ' + password);
    
    console.log('🔍 Iniciando verificação de voucher:', {
        senha: password,
        mikrotik_id: state.mikrotikId,
        mac: state.mac,
        ip: state.ip,
        apiUrl: state.apiUrl
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
            user_agent: navigator.userAgent
        })
    })
    .then(function(response) {
        console.log('📥 Resposta da API:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });
        
        return response.json();
    })
    .then(function(result) {
        console.log('📋 Dados da resposta:', result);
        
        if (result.success) {
            // Usuário verificado com sucesso
            console.log('✅ Voucher verificado com sucesso:', result.data);
            
            // Criar mensagem baseada no tipo de voucher
            var successMessage = '✅ Voucher válido! ';
            if (result.data.plan_name) {
                successMessage += 'Plano: ' + result.data.plan_name;
            }
            
            // Se tem comentário (PIX voucher), mostrar valor
            if (result.data.has_comment !== false && result.data.plan_value && result.data.plan_value > 0) {
                successMessage += ' - R$ ' + result.data.plan_value.toFixed(2);
            } 
            // Se não tem comentário (voucher físico), indicar
            else if (result.data.has_comment === false) {
                successMessage += ' (Voucher Físico)';
            }
            // Fallback para outros casos
            else {
                successMessage += ' - R$ 0,00';
            }
            
            showMessage(successMessage, 'success');
            
            // Aguardar para mostrar a mensagem antes de fazer login
            setTimeout(function() {
                console.log('🚀 Conectando...');
                loginDirectly(password);
            }, 2000);
            
        } else {
            // Erro na verificação
            console.error('❌ Erro na verificação:', result);
            var userMessage = result.message || 'Voucher não encontrado ou inválido';
            showMessage('❌ ' + userMessage, 'error');
            
            // Voltar para tela de senha após erro
            setTimeout(function() {
                showPasswordScreen();
                passwordInput.value = '';
                passwordInput.focus();
            }, 3000);
        }
    })
    .catch(function(error) {
        console.error('❌ Erro na comunicação com API:', error);
        showMessage('⚠️ Erro de conexão. Tentando login direto...', 'warning');
        
        // Em caso de erro de conexão, fazer login direto após delay
        setTimeout(function() {
            console.log('🔄 Fallback: fazendo login direto devido a erro de conexão');
            loginDirectly(password);
        }, 2500);
    });
}

// Login direto no MikroTik
function loginDirectly(password) {
    console.log('🔗 Fazendo login direto no MikroTik');
    showMessage('Conectado !!!', 'success');
    updateDebugInfo('Login direto com senha: ' + password);
    
    // Set credentials and submit form
    document.getElementById('hiddenUsername').value = password;
    document.getElementById('hiddenPassword').value = password;
    document.forms.login.submit();
}

// Load plans from API
async function loadPlans() {
    if (!state.apiUrl || !state.mikrotikId) {
        showMessage('Configuração da API não encontrada', 'error');
        document.getElementById('plansContainer').innerHTML = 
            '<div style="text-align: center; padding: 40px; color: var(--gray);">' +
            '<p>❌ Configure MIKROTIK_ID e API_URL</p>' +
            '</div>';
        document.getElementById('loadingPlans').style.display = 'none';
        return;
    }

    document.getElementById('loadingPlans').style.display = 'block';
    document.getElementById('plansContainer').innerHTML = '';

    try {
        const response = await fetch(state.apiUrl + '/api/payment/plans-by-mikrotik', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mikrotik_id: state.mikrotikId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro na API: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.planos && data.planos.length > 0) {
            // Ordenar planos do mais barato para o mais caro
            const sortedPlans = data.planos.sort((a, b) => Number(a.preco) - Number(b.preco));
            state.plans = sortedPlans;
            displayPlans(sortedPlans);
        } else {
            throw new Error('Nenhum plano disponível');
        }
    } catch (error) {
        console.error('Error loading plans:', error);
        showMessage('Erro ao carregar planos: ' + error.message, 'error');
        document.getElementById('plansContainer').innerHTML = 
            '<div style="text-align: center; padding: 40px; color: var(--gray);">' +
            '<p>❌ Erro ao carregar planos</p>' +
            '<button onclick="loadPlans()" class="btn btn-primary" style="margin-top: 15px;">🔄 Tentar Novamente</button>' +
            '</div>';
    } finally {
        document.getElementById('loadingPlans').style.display = 'none';
    }
}

function displayPlans(plans) {
    const container = document.getElementById('plansContainer');
    container.innerHTML = '';
    
    plans.forEach(function(plan) {
        const planCard = document.createElement('div');
        planCard.className = 'plan-card';
        planCard.setAttribute('data-plan-id', plan.id);
        
        const planNumber = plans.indexOf(plan) + 1;
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
    }
    
    // Store selected plan
    const selectedPlan = state.plans.find(plan => plan.id == planId);
    if (selectedPlan) {
        state.selectedPlan = selectedPlan;
    }
}

// Generate PIX payment
async function generatePix() {
    if (!state.selectedPlan) {
        showMessage('Selecione um plano primeiro', 'error');
        return;
    }
    
    if (!state.mac) {
        showMessage('MAC address não encontrado', 'error');
        return;
    }
    
    showLoadingScreen('Gerando PIX');
    
    try {
        const response = await fetch(state.apiUrl + '/api/payment/create-captive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mikrotik_id: state.mikrotikId,
                plano_id: state.selectedPlan.id,
                mac_address: state.mac
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Erro ao criar pagamento: ${response.status}`);
        }
        
        const paymentData = await response.json();
        
        if (paymentData && paymentData.success && paymentData.data) {
            showPixScreen();
            
            // Store payment data
            state.paymentId = paymentData.data.payment_id;
            
            // Display PIX data
            displayPixData({
                qrcode: paymentData.data.qr_code,
                chave_pix: paymentData.data.pix_code,
                valor: paymentData.data.amount,
                plano: {
                    nome: paymentData.data.plan_name,
                    duracao: paymentData.data.plan_duration
                }
            });
            
            // Start payment check
            startPaymentCheck();
            
            console.log('✅ Pagamento PIX criado:', paymentData.data.payment_id);
        } else {
            throw new Error('Erro na resposta da API ao criar pagamento');
        }
    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        showMessage('Erro ao gerar PIX: ' + error.message, 'error');
        showPlansScreen();
    }
}

function displayPixData(data) {
    // Set QR Code
    if (data.qrcode) {
        document.getElementById('qrCode').src = 'data:image/png;base64,' + data.qrcode;
    }
    
    // Set PIX code
    if (data.chave_pix) {
        document.getElementById('pixCode').textContent = data.chave_pix;
    }
    
    // Set plan info
    if (data.plano) {
        document.getElementById('pixPlanName').textContent = data.plano.nome || 'N/A';
        document.getElementById('pixPlanDuration').textContent = data.plano.duracao || 'N/A';
    }
    
    // Set amount
    if (data.valor) {
        document.getElementById('pixAmount').textContent = 'R$ ' + Number(data.valor).toFixed(2);
    }
    
    // Configurar event listener do botão de copiar (agora que ele existe no DOM)
    setTimeout(() => {
        const copyBtn = document.getElementById('copyPixBtn');
        if (copyBtn) {
            // Remove listeners antigos se existirem
            copyBtn.replaceWith(copyBtn.cloneNode(true));
            const newCopyBtn = document.getElementById('copyPixBtn');
            
            newCopyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('🔘 Botão de copiar PIX clicado');
                copyPixCode();
            });
            console.log('✅ Event listener do botão copiar PIX configurado');
        } else {
            console.error('❌ Botão copiar PIX não encontrado após mostrar dados');
        }
    }, 100);
    
    // Start timer
    startPaymentTimer();
}

function copyPixCode() {
    console.log('copyPixCode function called');
    
    const pixCode = document.getElementById('pixCode').textContent;
    const btn = document.getElementById('copyPixBtn');
    
    console.log('PIX Code:', pixCode);
    console.log('Button:', btn);
    
    if (!pixCode || pixCode.trim() === '') {
        showMessage('❌ Código PIX não encontrado', 'error');
        console.error('Código PIX vazio ou não encontrado');
        return;
    }
    
    // Verifica se o botão existe
    if (!btn) {
        showMessage('❌ Botão não encontrado', 'error');
        console.error('Botão de copiar não encontrado');
        return;
    }
    
    console.log('Tentando copiar código PIX:', pixCode);
    
    // Tenta usar Clipboard API primeiro
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pixCode).then(() => {
            console.log('✅ Código copiado com sucesso via Clipboard API');
            handleCopySuccess(btn);
        }).catch((err) => {
            console.warn('Clipboard API falhou, tentando fallback:', err);
            copyPixCodeFallback(pixCode, btn);
        });
    } else {
        console.log('Clipboard API não disponível, usando fallback');
        copyPixCodeFallback(pixCode, btn);
    }
}

function copyPixCodeFallback(pixCode, btn) {
    try {
        // Método fallback para navegadores antigos
        const textArea = document.createElement('textarea');
        textArea.value = pixCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            console.log('✅ Código copiado com sucesso via fallback');
            handleCopySuccess(btn);
        } else {
            throw new Error('execCommand failed');
        }
    } catch (err) {
        console.error('❌ Erro no fallback de cópia:', err);
        showMessage('❌ Erro ao copiar código. Tente selecionar e copiar manualmente.', 'error');
    }
}

function handleCopySuccess(btn) {
    showMessage('📋 Código PIX copiado! Ativando acesso trial em 3 segundos...', 'success');
    state.pixCopied = true;
    
    // Visual feedback no botão
    btn.classList.add('copied');
    btn.innerHTML = '✅ Copiado!';
    
    // Ativa trial em 3 segundos
    console.log('🚀 PIX copiado - ativando trial em 3 segundos...');
    
    setTimeout(() => {
        console.log('🚀 3 segundos passaram - ativando trial...');
        activateTrial();
    }, 3000);
    
    // Reset do botão após 5 segundos
    setTimeout(() => {
        if (btn) {
            btn.classList.remove('copied');
            btn.innerHTML = '📋 Copiar Chave PIX';
        }
    }, 5000);
}

function startPaymentTimer() {
    let timeLeft = CONFIG.PAYMENT_TIMEOUT; // 30 minutes
    
    state.timerInterval = setInterval(() => {
        timeLeft--;
        
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        document.getElementById('paymentTimer').textContent = 
            `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(state.timerInterval);
            showMessage('⏰ Tempo esgotado! Gere um novo PIX.', 'warning');
            showPlansScreen();
        }
    }, 1000);
}

function startPaymentCheck() {
    state.checkInterval = setInterval(checkPaymentStatus, CONFIG.CHECK_INTERVAL);
    document.getElementById('paymentChecking').style.display = 'block';
}

function stopPaymentCheck() {
    if (state.checkInterval) {
        clearInterval(state.checkInterval);
        state.checkInterval = null;
    }
    document.getElementById('paymentChecking').style.display = 'none';
}

function stopAllIntervals() {
    stopPaymentCheck();
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

// Check payment status
async function checkPaymentStatus() {
    if (!state.paymentId) {
        console.error('Payment ID not found');
        return false;
    }
    
    try {
        const response = await fetch(state.apiUrl + '/api/payment/status-captive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_id: state.paymentId,
                mac_address: state.mac
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro na verificação: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.success && data.data) {
            const payment = data.data;
            
            console.log('Status do pagamento:', payment.status);
            
            if (payment.status === 'completed') {
                stopPaymentCheck();
                
                // Update success info
                if (payment.usuario_criado && payment.senha_usuario) {
                    document.getElementById('successUser').textContent = payment.usuario_criado;
                    document.getElementById('successPass').textContent = payment.senha_usuario;
                }
                
                showSuccessScreen();
                return true;
            }
            
            return false;
        } else {
            console.error('Resposta inválida da API:', data);
            return false;
        }
    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        return false;
    }
}

function connectWithCredentials() {
    const username = document.getElementById('successUser').textContent;
    const password = document.getElementById('successPass').textContent;
    
    if (username && password && username !== '-' && password !== '-') {
        document.getElementById('hiddenUsername').value = username;
        document.getElementById('hiddenPassword').value = password;
        document.forms.login.submit();
    } else {
        showMessage('Credenciais não encontradas', 'error');
    }
}

function activateTrial() {
    if (state.trialActivated) {
        console.log('Trial já foi ativado anteriormente');
        return;
    }
    
    console.log('=== ATIVANDO TRIAL - URL MIKROTIK ===');
    
    // Mark as activated
    state.trialActivated = true;
    
    // Pega informações direto do MikroTik (como no exemplo original)
    const form = document.forms.login;
    const linkLoginOnly = form ? form.action : null;
    const linkOrig = state.linkOrig;
    const mac = state.mac;
    
    console.log('Informações do MikroTik:');
    console.log('- link-login-only:', linkLoginOnly);
    console.log('- link-orig:', linkOrig);
    console.log('- mac:', mac);
    
    // Verifica se temos as informações necessárias
    if (!linkLoginOnly || linkLoginOnly.includes('$(')) {
        console.error('❌ link-login-only não disponível');
        showMessage('⚠️ Informações do MikroTik não disponíveis para trial', 'warning');
        return;
    }
    
    if (!mac || mac.includes('$(')) {
        console.error('❌ MAC address não disponível');
        showMessage('⚠️ MAC address não disponível para trial', 'warning');
        return;
    }
    
    // Monta URL exatamente como no exemplo original:
    // $(link-login-only)?dst=$(link-orig-esc)&username=T-$(mac-esc)
    let trialUrl = linkLoginOnly;
    
    // Adiciona parâmetros
    const params = [];
    
    // dst=$(link-orig-esc)
    if (linkOrig && !linkOrig.includes('$(')) {
        params.push('dst=' + encodeURIComponent(linkOrig));
    }
    
    // username=T-$(mac-esc) - mantém os : do MAC
    params.push('username=T-' + mac);
    
    // Monta URL final
    if (params.length > 0) {
        trialUrl += (trialUrl.includes('?') ? '&' : '?') + params.join('&');
    }
    
    console.log('🚀 URL DO TRIAL:', trialUrl);
    console.log('🚀 MAC ORIGINAL:', mac);
    console.log('🚀 USERNAME:', 'T-' + mac);
    
    // Mostra mensagem de redirecionamento
    showMessage('🚀 Ativando acesso trial...', 'success');
    
    // Redirecionamento direto (como clicar no link do MikroTik)
    console.log('REDIRECIONANDO AGORA...');
    window.location.href = trialUrl;
}

function showMessage(message, type) {
    // Remove existing messages
    document.querySelectorAll('.message').forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = message;
    
    // Insert at top of current screen
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        activeScreen.insertBefore(messageDiv, activeScreen.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }
}