const supabase = require('../config/database');

const authenticateApiToken = async (req, res, next) => {
    try {
        const token = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                error: 'API token is required',
                message: 'Please provide a valid API token in the X-API-Token header or Authorization header'
            });
        }

        const { data: mikrotik, error } = await supabase
            .from('mikrotiks')
            .select('*')
            .eq('token', token)
            .eq('ativo', true)
            .single();

        if (error || !mikrotik) {
            return res.status(401).json({
                error: 'Invalid API token',
                message: 'The provided API token is invalid or inactive'
            });
        }

        req.mikrotik = mikrotik;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during authentication'
        });
    }
};

module.exports = authenticateApiToken;