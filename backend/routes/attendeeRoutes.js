const express = require('express');
const multer = require('multer');
const attendeeController = require('../controllers/attendeeController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Routes - Protected by role
router.post('/parse-excel', protect, authorize('ADMIN'), upload.single('file'), attendeeController.parseExcel);
router.post('/upload-excel', protect, authorize('ADMIN'), upload.single('file'), attendeeController.uploadExcel);
router.post('/scan', protect, authorize('ADMIN', 'ENTRY_VOLUNTEER', 'FOOD_VOLUNTEER'), attendeeController.scanAttendee);
router.get('/', protect, authorize('ADMIN'), attendeeController.getAllAttendees);
router.post('/send-email/:id', protect, authorize('ADMIN'), attendeeController.sendManualEmail);
router.post('/send-bulk', protect, authorize('ADMIN'), attendeeController.sendBulkEmails);

module.exports = router;
