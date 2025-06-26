const supabase = require('../config/database');

const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');
        
        console.log('[AUTH] Request URL:', req.url);
        console.log('[AUTH] Authorization Header:', authHeader ? 'Present' : 'Missing');
        console.log('[AUTH] Token extracted:', token ? 'Present' : 'Missing');
        console.log('[AUTH] Token length:', token ? token.length : 0);
        console.log('[AUTH] Token segments:', token ? token.split('.').length : 0);
        console.log('[AUTH] Token preview:', token ? token.substring(0, 50) + '...' : 'N/A');
        
        if (!token) {
            console.error('[AUTH] No token provided');
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please provide a valid Bearer token'
            });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error('[AUTH] Token validation failed:', error?.message || 'User not found');
            return res.status(401).json({
                error: 'Invalid token',
                message: 'The provided token is invalid'
            });
        }

        console.log('[AUTH] User authenticated successfully:', user.id);

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during authentication'
        });
    }
};

module.exports = authenticateUser;