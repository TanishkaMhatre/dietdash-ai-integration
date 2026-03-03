const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');

// Home page
router.get('/', isAuthenticated, (req, res) => {
    res.render('index', { 
        title: 'Diet Dash - Your Personal Diet & Food Delivery App',
        user: req.user
    });
});

// About page
router.get('/about', isAuthenticated, (req, res) => {
    res.render('about', { 
        title: 'About Us - Diet Dash',
        user: req.user
    });
});

// Contact page
router.get('/contact', isAuthenticated, (req, res) => {
    res.render('contact', { 
        title: 'Contact Us - Diet Dash',
        user: req.user
    });
});

// 404 Error page
router.get('/404', (req, res) => {
    res.render('404', { 
        title: 'Page Not Found - Diet Dash'
    });
});

// 500 Error page
router.get('/500', (req, res) => {
    res.render('500', { 
        title: 'Server Error - Diet Dash',
        error: {}
    });
});

module.exports = router;