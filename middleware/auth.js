const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token. User not found.' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid token.' 
        });
    }
};

// Check if user is authenticated (for views)
const isAuthenticated = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.session.token;
        
        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        req.user = user;
        next();
    } catch (error) {
        req.user = null;
        next();
    }
};

// Require authentication for views
const requireAuth = (req, res, next) => {
    const token = req.cookies.token || req.session.token;
    
    if (!token) {
        return res.redirect('/auth/login');
    }
    
    next();
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. Please login.' 
        });
    }
    
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Admin privileges required.' 
        });
    }
    
    next();
};

// User role middleware
const requireUser = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. Please login.' 
        });
    }
    
    if (req.user.role !== 'user') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. User privileges required.' 
        });
    }
    
    next();
};

// Check profile completion
const requireCompleteProfile = (req, res, next) => {
    if (!req.user.profileCompleted) {
        return res.redirect('/user/profile/complete');
    }
    next();
};

module.exports = {
    authenticateToken,
    isAuthenticated,
    requireAuth,
    requireAdmin,
    requireUser,
    requireCompleteProfile
};