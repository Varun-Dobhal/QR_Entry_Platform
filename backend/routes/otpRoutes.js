const express = require('express');
const { sendOtp, verifyOtp } = require('../controllers/otpController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/send', protect, authorize('ADMIN', 'ENTRY_VOLUNTEER', 'FOOD_VOLUNTEER'), sendOtp);
router.post('/verify', protect, authorize('ADMIN', 'ENTRY_VOLUNTEER', 'FOOD_VOLUNTEER'), verifyOtp);

module.exports = router;
