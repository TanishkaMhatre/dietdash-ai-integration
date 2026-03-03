const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { validationResult } = require('express-validator');

// Render signup page
const getSignup = (req, res) => {
    res.render('auth/signup', { 
        title: 'Sign Up - Diet Dash',
        error: null,
        formData: {}
    });
};

// Render login page
const getLogin = (req, res) => {
    res.render('auth/login', { 
        title: 'Login - Diet Dash',
        error: null,
        formData: {}
    });
};

// Handle user signup
const postSignup = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('auth/signup', {
                title: 'Sign Up - Diet Dash',
                error: errors.array()[0].msg,
                formData: req.body
            });
        }

        const { username, email, password, confirmPassword, role } = req.body;

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.render('auth/signup', {
                title: 'Sign Up - Diet Dash',
                error: 'Passwords do not match',
                formData: req.body
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'Email' : 'Username';
            return res.render('auth/signup', {
                title: 'Sign Up - Diet Dash',
                error: `${field} already exists`,
                formData: req.body
            });
        }

        // Create new user
        const user = new User({
            username,
            email,
            password,
            role: role || 'user'
        });

        // Generate a unique publicId (short alphanumeric) for social features
        const genPublicId = () => Math.random().toString(36).slice(2,10).toUpperCase();
        let pid = genPublicId();
        // Ensure uniqueness
        while (await User.findOne({ publicId: pid })) {
            pid = genPublicId();
        }
        user.publicId = pid;

        await user.save();

        // Generate JWT token
        const token = generateToken(user._id, user.role);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect based on role
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/user/profile/complete');
        }

    } catch (error) {
        console.error('Signup error:', error);
        res.render('auth/signup', {
            title: 'Sign Up - Diet Dash',
            error: 'An error occurred during signup. Please try again.',
            formData: req.body
        });
    }
};

// Handle user login
const postLogin = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('auth/login', {
                title: 'Login - Diet Dash',
                error: errors.array()[0].msg,
                formData: req.body
            });
        }

        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('auth/login', {
                title: 'Login - Diet Dash',
                error: 'Invalid email or password',
                formData: req.body
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('auth/login', {
                title: 'Login - Diet Dash',
                error: 'Invalid email or password',
                formData: req.body
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = generateToken(user._id, user.role);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect based on role and profile completion
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else if (!user.profileCompleted) {
            res.redirect('/user/profile/complete');
        } else {
            res.redirect('/user/dashboard');
        }

    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', {
            title: 'Login - Diet Dash',
            error: 'An error occurred during login. Please try again.',
            formData: req.body
        });
    }
};

// Handle logout
const logout = (req, res) => {
    res.clearCookie('token');
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }
        res.redirect('/');
    });
};

// API endpoints for mobile/AJAX requests
const apiSignup = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        const { username, email, password, role } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'Email' : 'Username';
            return res.status(400).json({
                success: false,
                message: `${field} already exists`
            });
        }

        // Create new user
        const user = new User({
            username,
            email,
            password,
            role: role || 'user'
        });

        // Generate a unique publicId for API-created users as well
        const genPublicId = () => Math.random().toString(36).slice(2,10).toUpperCase();
        let pid = genPublicId();
        while (await User.findOne({ publicId: pid })) pid = genPublicId();
        user.publicId = pid;

        await user.save();

        // Generate JWT token
        const token = generateToken(user._id, user.role);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                profileCompleted: user.profileCompleted
            }
        });

    } catch (error) {
        console.error('API Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

const apiLogin = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = generateToken(user._id, user.role);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                profileCompleted: user.profileCompleted
            }
        });

    } catch (error) {
        console.error('API Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    getSignup,
    getLogin,
    postSignup,
    postLogin,
    logout,
    apiSignup,
    apiLogin
};