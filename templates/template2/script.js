// ==================================================
// CONFIGURAÇÃO IMPORTANTE - ALTERE AQUI!
// ==================================================
const CONFIG = {
    // VARIÁVEIS SUBSTITUÍDAS AUTOMATICAMENTE:
    MIKROTIK_ID: 'ad8ba643-627d-4539-a6ef-e6636ee0773b',  // ← ID do MikroTik atual
    API_URL: 'https://api.mikropix.online',  // ← URL da API (do .env)
    
    // Outras configurações:
    CHECK_INTERVAL: 5000,      // Intervalo de verificação (5 segundos)
    PAYMENT_TIMEOUT: 1800,     // Timeout do pagamento (30 minutos)
    DEBUG: false               // Ativar modo debug
};
// ==================================================

// Global state
const state = {
    mac: null,
    ip: null,
    interface: null,
    linkOrig: null,
    linkLogin: null,
    mikrotikId: "ad8ba643-627d-4539-a6ef-e6636ee0773b",
    apiUrl: "https://api.mikropix.online",
    debug: true,
    plans: [],
    selectedPlan: null,
    paymentId: null,
    checkInterval: null,
    timerInterval: null,
    pixCopied: false,
    trialActivated: false,
    trialInterval: null
};

// --------------------------------------------------
// Garantir que a inicialização roda mesmo se o script
// for carregado DEPOIS do DOMContentLoaded (script async)
// --------------------------------------------------
(function initWhenReady(){
    function start(){
        // Evita múltiplas execuções
        if (window.__otpSetupDone) return;
        window.__otpSetupDone = true;

        console.log('⚡️ Iniciando aplicação (readyState=' + document.readyState + ')');
        // Pequeno delay para garantir render
        setTimeout(()=>{
            setupOtpAutoAdvance();
            initializeApp();
        }, 50);
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', start);
    }else{
        // Já pronto ("interactive" ou "complete")
        start();
    }
})();

// Initialize
// Mantém verificação de erro fora da função acima, pois depende de variáveis do template
const _mkErr = '$(error)';
if(_mkErr && !_mkErr.includes('$(')){
    showMessage('⚠️ Erro de autenticação: ' + _mkErr, 'error');
    console.error('MikroTik Error:', _mkErr);
}

function setupOtpAutoAdvance(){
    console.log('🎯 SETUP OTP AUTO-ADVANCE INICIADO');
    
    // Aguardar um pouco mais para garantir que o DOM está pronto
    setTimeout(() => {
        const inputs = document.querySelectorAll('.otp-inputs .otp');
        console.log('🎯 Encontrados', inputs.length, 'campos OTP');
        
        if (inputs.length === 0) {
            console.error('❌ NENHUM INPUT OTP ENCONTRADO!');
            return;
        }
        
        // Limpar listeners existentes e reset
        inputs.forEach((input, idx) => {
            input.value = '';
            input.classList.remove('filled', 'completed');
            
            // Remover listeners existentes
            // Verifica se handlers antigos existem antes de removê-los para evitar ReferenceError
            if (typeof handleOtpInput === 'function') {
                input.removeEventListener('input', handleOtpInput);
            }
            if (typeof handleOtpKeydown === 'function') {
                input.removeEventListener('keydown', handleOtpKeydown);
            }
            
            console.log(`📝 Configurando campo ${idx}`);
        });
        
        // Adicionar novos listeners
        inputs.forEach((input, idx) => {
            // INPUT EVENT - MAIS SIMPLES POSSÍVEL
            input.addEventListener('input', function(e) {
                console.log(`🔢 INPUT no campo ${idx}:`, e.target.value);
                
                // Filtrar apenas números
                const val = e.target.value.replace(/\D/g, '').slice(0, 1);
                e.target.value = val;
                
                if (val) {
                    e.target.classList.add('filled');
                    console.log(`✅ Campo ${idx} preenchido com: ${val}`);
                    
                    // MOVER PARA PRÓXIMO CAMPO IMEDIATAMENTE
                    if (idx < inputs.length - 1) {
                        console.log(`🔄 MOVENDO para campo ${idx + 1}`);
                        inputs[idx + 1].focus();
                        inputs[idx + 1].click(); // Forçar foco
                    }
                } else {
                    e.target.classList.remove('filled');
                }
                
                // Verificar se todos estão preenchidos
                checkAllFilled(inputs);
            });
            
            // KEYDOWN EVENT - APENAS PARA VALIDAÇÃO
            input.addEventListener('keydown', function(e) {
                console.log(`⌨️ KEYDOWN no campo ${idx}:`, e.key);
                
                // Backspace para voltar
                if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                    console.log(`⬅️ BACKSPACE - voltando para campo ${idx - 1}`);
                    inputs[idx - 1].focus();
                }
                
                // Permitir apenas números
                if (!/[0-9]/.test(e.key) && !['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                }
            });
        });
        
        console.log('✅ OTP AUTO-ADVANCE CONFIGURADO COM SUCESSO!');
    }, 200);
}

function checkAllFilled(inputs) {
    const filled = Array.from(inputs).filter(inp => inp.value.trim() !== '');
    console.log(`📊 Campos preenchidos: ${filled.length}/${inputs.length}`);
    
    if (filled.length >= 5) {
        console.log('🎉 TODOS OS CAMPOS PREENCHIDOS!');
        inputs.forEach(inp => inp.classList.add('completed'));
        setTimeout(() => loginWithPassword(), 800);
    }
}

function initializeApp() {
    // Get URL parameters and MikroTik variables
    getUrlParams();
    
    // Set debug mode first
    state.debug = CONFIG.DEBUG;
    
    // If debug mode is enabled, use mocked data
    if (state.debug) {
        console.log('🔧 DEBUG MODE: Using mocked data');
        state.mac = '00:11:22:33:44:55';  // Mock MAC address
        state.ip = '192.168.1.100';       // Mock IP address
        state.interface = 'wlan1';        // Mock interface
        state.linkOrig = 'http://google.com';
        state.linkLogin = 'javascript:void(0)';
        state.mikrotikId = CONFIG.MIKROTIK_ID;
        state.apiUrl = CONFIG.API_URL;
        
        // Garantir que as variáveis mockadas sejam usadas
        console.log('🔧 Dados mockados definidos:', {
            mac: state.mac,
            ip: state.ip,
            interface: state.interface,
            mikrotikId: state.mikrotikId,
            apiUrl: state.apiUrl
        });
    } else {
        // Initialize with MikroTik variables for production
        if (window.mikrotikVars) {
            state.mac = window.mikrotikVars.mac || state.mac;
            state.ip = window.mikrotikVars.ip || state.ip;
            state.interface = window.mikrotikVars.interface || state.interface;
            state.linkOrig = window.mikrotikVars.linkOrig || state.linkOrig;
            state.linkLogin = window.mikrotikVars.linkLogin || state.linkLogin;
            
            console.log('MikroTik Variables loaded:', window.mikrotikVars);
        }
        
        // Override with CONFIG values
        state.mikrotikId = state.mikrotikId || CONFIG.MIKROTIK_ID;
        state.apiUrl = state.apiUrl || CONFIG.API_URL;
    }
    
    // Clean API URL
    if (state.apiUrl) {
        state.apiUrl = state.apiUrl.replace(/\/$/, '');
    }
    
    // Update debug info
    updateDebugInfo('Aplicação inicializada');
    
    console.log('State initialized:', state);
    console.log('Configuration:', CONFIG);
    
    // Check if we have required configuration
    if (!state.mikrotikId || !state.apiUrl) {
        console.warn('⚠️ Configuração incompleta. Modo offline ativado.');
        showMessage('ℹ️ Modo offline - Login direto disponível', 'info');
    }
    
    // Add debug info to welcome screen
    if (state.debug) {
        const debugInfo = document.createElement('div');
        debugInfo.innerHTML = `
            <div style="margin-top: 20px; padding: 15px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 12px; font-size: 11px; color: #f1f5f9; font-family: monospace;">
                <strong style="color: #3b82f6;">🔧 DEBUG MODE</strong><br>
                <span style="opacity: 0.8;">API: ${state.apiUrl}</span><br>
                <span style="opacity: 0.8;">MikroTik ID: ${state.mikrotikId}</span><br>
                <span style="opacity: 0.8;">MAC: ${state.mac} (mocked)</span><br>
                <span style="opacity: 0.8;">IP: ${state.ip} (mocked)</span><br>
                <span style="opacity: 0.8;">Interface: ${state.interface} (mocked)</span>
            </div>
        `;
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.appendChild(debugInfo);
        }
        console.log('🔧 Debug info adicionado à tela de boas-vindas');
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
    
    console.log('🔧 DEBUG:', info);
    
    const debugDiv = document.getElementById('debugInfo');
    if (debugDiv) {
        debugDiv.style.display = 'block';
        debugDiv.innerHTML = `
            <strong style="color: #3b82f6;">🔧 DEBUG:</strong> ${info}<br>
            <span style="opacity: 0.8;">MAC: ${state.mac || 'N/A'}</span><br>
            <span style="opacity: 0.8;">IP: ${state.ip || 'N/A'}</span><br>
            <span style="opacity: 0.8;">MikroTik ID: ${state.mikrotikId || 'N/A'}</span><br>
            <span style="opacity: 0.8;">API URL: ${state.apiUrl || 'N/A'}</span>
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
    
    // Show target screen with animation
    setTimeout(() => {
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            targetScreen.classList.add('slide-up');
        }
    }, 50);
    
    updateDebugInfo('Tela: ' + screenId);
}

function showPasswordScreen() {
    showScreen('passwordScreen');
    stopAllIntervals();
    setTimeout(() => {
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.focus();
        }
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
    const loadingTextElement = document.getElementById('loadingText');
    if (loadingTextElement) {
        loadingTextElement.innerHTML = (text || 'Processando') + '<span class="loading-dots"></span>';
    }
    showScreen('loadingScreen');
}

function showVerificationScreen(text = 'Verificando sua senha...') {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div class="verification-animation">
                <div class="verification-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                    </svg>
                </div>
                <div class="verification-text" id="verificationText">${text}</div>
                <div class="verification-dots">
                    <div class="verification-dot"></div>
                    <div class="verification-dot"></div>
                    <div class="verification-dot"></div>
                </div>
            </div>
        `;
    }
    showScreen('loadingScreen');
}

function updateVerificationText(text) {
    const verificationText = document.getElementById('verificationText');
    if (verificationText) {
        verificationText.innerHTML = text;
    }
}

function showPixGenerationAnimation() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div class="pix-generation-animation">
                <div class="pix-generation-icon">
                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                        <path d="M8 10h8M8 14h8"/>
                    </svg>
                    <div class="pix-logo">PIX</div>
                </div>
                <div class="pix-generation-text">Gerando código PIX...</div>
                <div class="pix-generation-progress">
                    <div class="pix-progress-bar"></div>
                </div>
                <div class="pix-generation-steps">
                    <div class="pix-step active">1. Criando pagamento</div>
                    <div class="pix-step">2. Gerando QR Code</div>
                    <div class="pix-step">3. Preparando chave PIX</div>
                </div>
            </div>
        `;
        
        // Animar steps
        setTimeout(() => {
            const steps = document.querySelectorAll('.pix-step');
            steps[0].classList.remove('active');
            steps[1].classList.add('active');
        }, 1000);
        
        setTimeout(() => {
            const steps = document.querySelectorAll('.pix-step');
            steps[1].classList.remove('active');
            steps[2].classList.add('active');
        }, 2000);
    }
    showScreen('loadingScreen');
}

// OTP helpers
function getOtpCode() {
    return Array.from(document.querySelectorAll('.otp-inputs .otp'))
            .map(i => i.value.trim())
            .join('');
}

function clearOtpInputs() {
    document.querySelectorAll('.otp-inputs .otp').forEach(i => {
        i.value = '';
        i.classList.remove('filled', 'error');
    });
    focusFirstOtp();
}

function focusFirstOtp() {
    const first = document.querySelector('.otp-inputs .otp');
    if(first) first.focus();
}

function setOtpError() {
    document.querySelectorAll('.otp-inputs .otp').forEach(i => {
        i.classList.add('error');
    });
    setTimeout(() => {
        document.querySelectorAll('.otp-inputs .otp').forEach(i => {
            i.classList.remove('error');
        });
    }, 1000);
}

// Login with password
function loginWithPassword() {
    const password = getOtpCode();
    
    if (!password || password.length < 5) {
        showMessage('Por favor, digite o código completo', 'error');
        setOtpError();
        focusFirstOtp();
        return;
    }
    
    // Usar CONFIG diretamente se state não estiver definido
    const apiUrl = state.apiUrl || CONFIG.API_URL;
    const mikrotikId = state.mikrotikId || CONFIG.MIKROTIK_ID;
    
    // Se não temos configuração da API, fazer login direto
    if (!apiUrl || !mikrotikId) {
        console.log('⚠️ Configuração da API não encontrada, fazendo login direto');
        loginDirectly(password);
        return;
    }
    
    showVerificationScreen();
    updateDebugInfo('Verificando senha via API: ' + password);
    
    console.log('🔍 Iniciando verificação de voucher:', {
        senha: password,
        mikrotik_id: mikrotikId,
        mac: state.mac,
        ip: state.ip,
        apiUrl: apiUrl
    });
    
    // Verificar voucher via API
    fetch(apiUrl + '/api/payment/captive/check-user', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            username: password,
            password: password,
            mikrotik_id: mikrotikId,
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
            var successMessage = '✅ Voucher válido!<br>';
            if (result.data.plan_name) {
                successMessage += '<span style="font-size: 0.9rem; opacity: 0.9;">Plano: ' + result.data.plan_name + '</span>';
            }
            
            // Se tem comentário (PIX voucher), mostrar valor
            if (result.data.has_comment !== false && result.data.plan_value && result.data.plan_value > 0) {
                successMessage += '<br><span style="font-size: 0.9rem; opacity: 0.9;">Valor: R$ ' + result.data.plan_value.toFixed(2) + '</span>';
            } 
            // Se não tem comentário (voucher físico), indicar
            else if (result.data.has_comment === false) {
                successMessage += '<br><span style="font-size: 0.9rem; opacity: 0.9;">Voucher Físico</span>';
            }
            
            // Atualizar texto na animação
            updateVerificationText(successMessage);
            
            // Aguardar para mostrar a mensagem antes de fazer login
            setTimeout(function() {
                updateVerificationText('🚀 Conectando...');
                setTimeout(function() {
                    console.log('🚀 Conectando...');
                    loginDirectly(password);
                }, 1000);
            }, 2500);
            
        } else {
            // Erro na verificação
            console.error('❌ Erro na verificação:', result);
            var userMessage = result.message || 'Voucher não encontrado ou inválido';
            updateVerificationText('❌ ' + userMessage);
            
            // Voltar para tela principal após erro
            setTimeout(function() {
                showWelcomeScreen();
                clearOtpInputs();
            }, 3000);
        }
    })
    .catch(function(error) {
        console.error('❌ Erro na comunicação com API:', error);
        updateVerificationText('⚠️ Erro de conexão<br><span style="font-size: 0.9rem; opacity: 0.9;">Tentando login direto...</span>');
        
        // Em caso de erro de conexão, fazer login direto após delay
        setTimeout(function() {
            console.log('🔄 Fallback: fazendo login direto devido a erro de conexão');
            updateVerificationText('🚀 Conectando...');
            setTimeout(function() {
                loginDirectly(password);
            }, 1000);
        }, 2500);
    });
}

// Login direto no MikroTik
function loginDirectly(password) {
    console.log('🔗 Fazendo login direto no MikroTik');
    showMessage('Conectando...', 'info');
    updateDebugInfo('Login direto com senha: ' + password);
    
    try {
        // Method 1: Try hidden form
        if (document.forms.login) {
            document.getElementById('hiddenUsername').value = password;
            document.getElementById('hiddenPassword').value = password;
            document.forms.login.submit();
            return;
        }
        
        // Method 2: Try alternative form
        if (document.forms.sendin) {
            document.getElementById('directUsername').value = password;
            document.getElementById('directPassword').value = password;
            document.forms.sendin.submit();
            return;
        }
        
        // Method 3: Create dynamic form
        const form = document.createElement('form');
        form.method = 'post';
        form.action = window.mikrotikVars ? window.mikrotikVars.linkLoginOnly : '$(link-login-only)';
        
        const usernameInput = document.createElement('input');
        usernameInput.type = 'hidden';
        usernameInput.name = 'username';
        usernameInput.value = password;
        
        const passwordInput = document.createElement('input');
        passwordInput.type = 'hidden';
        passwordInput.name = 'password';
        passwordInput.value = password;
        
        const dstInput = document.createElement('input');
        dstInput.type = 'hidden';
        dstInput.name = 'dst';
        dstInput.value = window.mikrotikVars ? window.mikrotikVars.linkOrig : '$(link-orig)';
        
        form.appendChild(usernameInput);
        form.appendChild(passwordInput);
        form.appendChild(dstInput);
        
        document.body.appendChild(form);
        form.submit();
        
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        showMessage('Erro ao conectar. Tente novamente.', 'error');
    }
}

// Load plans from API
async function loadPlans() {
    // Usar CONFIG diretamente se state não estiver definido
    const apiUrl = state.apiUrl || CONFIG.API_URL;
    const mikrotikId = state.mikrotikId || CONFIG.MIKROTIK_ID;
    
    console.log('🔍 LoadPlans - Verificando configurações:', {
        'state.apiUrl': state.apiUrl,
        'state.mikrotikId': state.mikrotikId,
        'CONFIG.API_URL': CONFIG.API_URL,
        'CONFIG.MIKROTIK_ID': CONFIG.MIKROTIK_ID,
        'apiUrl final': apiUrl,
        'mikrotikId final': mikrotikId
    });
    
    if (!apiUrl || !mikrotikId) {
        showMessage('Configuração da API não encontrada', 'error');
        const plansContainer = document.getElementById('plansContainer');
        if (plansContainer) {
            plansContainer.innerHTML = 
                '<div style="text-align: center; padding: 40px; color: #94a3b8;">' +
                '<p>❌ Configure MIKROTIK_ID e API_URL</p>' +
                '<p style="font-size: 0.8rem; margin-top: 10px;">Debug: API=' + (apiUrl || 'null') + ', ID=' + (mikrotikId || 'null') + '</p>' +
                '</div>';
        }
        const loadingPlans = document.getElementById('loadingPlans');
        if (loadingPlans) {
            loadingPlans.style.display = 'none';
        }
        return;
    }

    const loadingPlans = document.getElementById('loadingPlans');
    const plansContainer = document.getElementById('plansContainer');
    
    if (loadingPlans) loadingPlans.style.display = 'block';
    if (plansContainer) plansContainer.innerHTML = '';

    try {
        console.log('🚀 Fazendo requisição para:', apiUrl + '/api/payment/plans-by-mikrotik');
        console.log('📋 Dados enviados:', { mikrotik_id: mikrotikId });
        
        const response = await fetch(apiUrl + '/api/payment/plans-by-mikrotik', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mikrotik_id: mikrotikId
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
        if (plansContainer) {
            plansContainer.innerHTML = 
                '<div style="text-align: center; padding: 40px; color: var(--gray);">' +
                '<p>❌ Erro ao carregar planos</p>' +
                '<button onclick="loadPlans()" class="btn btn-primary" style="margin-top: 15px;">🔄 Tentar Novamente</button>' +
                '</div>';
        }
    } finally {
        if (loadingPlans) {
            loadingPlans.style.display = 'none';
        }
    }
}

function displayPlans(plans) {
    const container = document.getElementById('plansContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    plans.forEach(function(plan, index) {
        const planCard = document.createElement('div');
        planCard.className = 'plan-card';
        planCard.setAttribute('data-plan-id', plan.id);
        
        const planNumber = index + 1;
        const price = Number(plan.preco);
        const isPopular = index === 1; // Middle plan is popular
        
        planCard.innerHTML = `
            <div class="plan-header">
                <div class="plan-badge ${isPopular ? 'popular' : ''}">
                    ${isPopular ? '🔥 POPULAR' : 'PLANO ' + planNumber}
                </div>
                <div class="plan-price-container">
                    <div class="plan-price">
                        <span class="plan-currency">R$</span>
                        ${price.toFixed(2).replace('.', ',')}
                    </div>
                </div>
            </div>
            <div class="plan-duration">${plan.duracao}</div>
        `;
        
        if (isPopular) {
            planCard.style.borderColor = 'var(--primary)';
            planCard.style.transform = 'scale(1.05)';
        }
        
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
    console.log('🔧 generatePix() chamado - Debug mode:', state.debug);
    console.log('🔧 state.mac atual:', state.mac);
    console.log('🔧 CONFIG.DEBUG:', CONFIG.DEBUG);
    
    if (!state.selectedPlan) {
        showMessage('Selecione um plano primeiro', 'error');
        return;
    }
    
    // FORÇAR MAC MOCKADO EM DEBUG
    let macAddress;
    if (CONFIG.DEBUG) {
        console.log('🔧 FORÇANDO MAC MOCKADO');
        macAddress = '00:11:22:33:44:55';
        state.mac = macAddress; // Garantir que está no state também
    } else {
        macAddress = state.mac;
    }
    
    console.log('🔧 MAC address final:', macAddress);
    
    if (!macAddress) {
        showMessage('MAC address não encontrado', 'error');
        return;
    }
    
    showPixGenerationAnimation();
    
    try {
        const response = await fetch(state.apiUrl + '/api/payment/create-captive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mikrotik_id: state.mikrotikId,
                plano_id: state.selectedPlan.id,
                mac_address: macAddress
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
        const qrCodeElement = document.getElementById('qrCode');
        if (qrCodeElement) {
            qrCodeElement.src = 'data:image/png;base64,' + data.qrcode;
        }
    }
    
    // Set PIX code
    if (data.chave_pix) {
        const pixCodeElement = document.getElementById('pixCode');
        if (pixCodeElement) {
            pixCodeElement.textContent = data.chave_pix;
        }
    }
    
    // Set plan info
    if (data.plano) {
        const pixPlanNameElement = document.getElementById('pixPlanName');
        const pixPlanDurationElement = document.getElementById('pixPlanDuration');
        
        if (pixPlanNameElement) {
            pixPlanNameElement.textContent = data.plano.nome || 'N/A';
        }
        if (pixPlanDurationElement) {
            pixPlanDurationElement.textContent = data.plano.duracao || 'N/A';
        }
    }
    
    // Set amount
    if (data.valor) {
        const pixAmountElement = document.getElementById('pixAmount');
        if (pixAmountElement) {
            pixAmountElement.textContent = 'R$ ' + Number(data.valor).toFixed(2);
        }
    }
    
    // Configurar event listener do botão de copiar
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
    
    const pixCodeElement = document.getElementById('pixCode');
    const btn = document.getElementById('copyPixBtn');
    
    if (!pixCodeElement || !btn) {
        showMessage('❌ Elementos não encontrados', 'error');
        return;
    }
    
    const pixCode = pixCodeElement.textContent;
    
    console.log('PIX Code:', pixCode);
    
    if (!pixCode || pixCode.trim() === '') {
        showMessage('❌ Código PIX não encontrado', 'error');
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
        
        const timerElement = document.getElementById('paymentTimer');
        if (timerElement) {
            timerElement.textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (timeLeft <= 0) {
            clearInterval(state.timerInterval);
            showMessage('⏰ Tempo esgotado! Gere um novo PIX.', 'warning');
            showPlansScreen();
        }
    }, 1000);
}

function startPaymentCheck() {
    state.checkInterval = setInterval(checkPaymentStatus, CONFIG.CHECK_INTERVAL);
    const paymentCheckingElement = document.getElementById('paymentChecking');
    if (paymentCheckingElement) {
        paymentCheckingElement.style.display = 'block';
    }
}

function stopPaymentCheck() {
    if (state.checkInterval) {
        clearInterval(state.checkInterval);
        state.checkInterval = null;
    }
    const paymentCheckingElement = document.getElementById('paymentChecking');
    if (paymentCheckingElement) {
        paymentCheckingElement.style.display = 'none';
    }
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
                    const successUserElement = document.getElementById('successUser');
                    const successPassElement = document.getElementById('successPass');
                    
                    if (successUserElement) {
                        successUserElement.textContent = payment.usuario_criado;
                    }
                    if (successPassElement) {
                        successPassElement.textContent = payment.senha_usuario;
                    }
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
    const successUserElement = document.getElementById('successUser');
    const successPassElement = document.getElementById('successPass');
    
    if (!successUserElement || !successPassElement) {
        showMessage('Credenciais não encontradas', 'error');
        return;
    }
    
    const username = successUserElement.textContent;
    const password = successPassElement.textContent;
    
    if (username && password && username !== '-' && password !== '-') {
        console.log('🔗 Conectando com credenciais do pagamento');
        showMessage('Conectando...', 'info');
        
        try {
            // Method 1: Try hidden form
            if (document.forms.login) {
                document.getElementById('hiddenUsername').value = username;
                document.getElementById('hiddenPassword').value = password;
                document.forms.login.submit();
                return;
            }
            
            // Method 2: Try alternative form
            if (document.forms.sendin) {
                document.getElementById('directUsername').value = username;
                document.getElementById('directPassword').value = password;
                document.forms.sendin.submit();
                return;
            }
            
            // Method 3: Create dynamic form
            const form = document.createElement('form');
            form.method = 'post';
            form.action = window.mikrotikVars ? window.mikrotikVars.linkLoginOnly : '$(link-login-only)';
            
            const usernameInput = document.createElement('input');
            usernameInput.type = 'hidden';
            usernameInput.name = 'username';
            usernameInput.value = username;
            
            const passwordInput = document.createElement('input');
            passwordInput.type = 'hidden';
            passwordInput.name = 'password';
            passwordInput.value = password;
            
            const dstInput = document.createElement('input');
            dstInput.type = 'hidden';
            dstInput.name = 'dst';
            dstInput.value = window.mikrotikVars ? window.mikrotikVars.linkOrig : '$(link-orig)';
            
            form.appendChild(usernameInput);
            form.appendChild(passwordInput);
            form.appendChild(dstInput);
            
            document.body.appendChild(form);
            form.submit();
            
        } catch (error) {
            console.error('Erro ao conectar com credenciais:', error);
            showMessage('Erro ao conectar. Tente novamente.', 'error');
        }
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
    
    // Pega informações direto do MikroTik ou usa dados mockados
    const form = document.forms.login;
    let linkLoginOnly, linkOrig, mac;
    
    if (state.debug) {
        console.log('🔧 DEBUG MODE - Usando dados mockados para trial');
        linkLoginOnly = 'javascript:void(0)';
        linkOrig = 'http://google.com';
        mac = '00:11:22:33:44:55';
    } else {
        linkLoginOnly = form ? form.action : null;
        linkOrig = state.linkOrig;
        mac = state.mac;
    }
    
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
    
    // Monta URL do trial
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
    
    // Redirecionamento direto
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