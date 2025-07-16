// JavaScript Test File for Template Variable Substitution

// Configuration object with replaced variables
const templateConfig = {
    mikrotikId: '{{MIKROTIK_ID}}',
    apiUrl: '{{API_URL}}',
    provider: '{{PROVIDER_NAME}}',
    logoUrl: '{{LOGO_URL}}',
    primaryColor: '{{PRIMARY_COLOR}}'
};

// Function to initialize template with variables
function initializeTemplate() {
    console.log('Template Configuration:', templateConfig);
    
    // Example API call using substituted variables
    if (templateConfig.apiUrl && templateConfig.mikrotikId) {
        const apiEndpoint = `${templateConfig.apiUrl}/api/mikrotik/${templateConfig.mikrotikId}/status`;
        console.log('API Endpoint:', apiEndpoint);
        
        // You could make actual API calls here
        // fetch(apiEndpoint).then(response => response.json()).then(data => console.log(data));
    }
    
    // Update UI elements with configuration
    updateUIElements();
}

// Function to update UI elements with configuration values
function updateUIElements() {
    // Update page title if provider name is available
    if (templateConfig.provider && templateConfig.provider !== '{{PROVIDER_NAME}}') {
        document.title = `${templateConfig.provider} - Portal Wi-Fi`;
    }
    
    // Update logo if URL is available
    if (templateConfig.logoUrl && templateConfig.logoUrl !== '{{LOGO_URL}}') {
        const logoElements = document.querySelectorAll('img[data-logo]');
        logoElements.forEach(img => {
            img.src = templateConfig.logoUrl;
            img.alt = `${templateConfig.provider} Logo`;
        });
    }
    
    // Update primary color if available
    if (templateConfig.primaryColor && templateConfig.primaryColor !== '{{PRIMARY_COLOR}}') {
        document.documentElement.style.setProperty('--primary-color', templateConfig.primaryColor);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeTemplate);

// Export for use in other modules
window.templateConfig = templateConfig;