const express = require('express');
const { login, register } = require('../controllers/authController');

const router = express.Router();

const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/validate', protect, (req, res) => res.json({ role: req.user.role }));

module.exports = router;
