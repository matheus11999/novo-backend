const supabase = require('../config/database');

const authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please provide a valid Bearer token'
            });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'The provided token is invalid'
            });
        }

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