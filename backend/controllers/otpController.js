const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const prisma = require('../prismaClient');

exports.sendOtp = async (req, res) => {
  try {
    const { roll, type = 'entry' } = req.body;
    if (!roll) {
      return res.status(400).json({ error: 'Roll number is required' });
    }

    // Role-based validation
    if (req.user.role === 'ENTRY_VOLUNTEER' && type !== 'entry') {
      return res.status(403).json({ error: 'Entry volunteers can only perform entry OTP sending.' });
    }
    if (req.user.role === 'FOOD_VOLUNTEER' && type !== 'food') {
      return res.status(403).json({ error: 'Food volunteers can only perform food OTP sending.' });
    }

    const attendee = await prisma.attendee.findUnique({ where: { roll } });
    if (!attendee) {
      return res.status(404).json({ error: 'Attendee not found' });
    }

    if (type === 'entry' && attendee.entryStatus) {
      return res.status(400).json({ error: 'Attendee has already checked in.' });
    }

    if (type === 'food') {
      if (!attendee.entryStatus) return res.status(400).json({ error: 'Entry required before food distribution.' });
      if (attendee.foodStatus) return res.status(400).json({ error: 'Food already collected.' });
    }

    const now = new Date();
    const scanTypeEnum = type === 'food' ? 'FOOD' : 'ENTRY';

    // Find recent OTP for cooldown/attempts
    const recentOtp = await prisma.otpLog.findFirst({
      where: { attendeeId: attendee.id, otpType: scanTypeEnum },
      orderBy: { createdAt: 'desc' }
    });

    if (recentOtp) {
      const timeDiff = now.getTime() - recentOtp.createdAt.getTime();
      if (timeDiff < 30000) {
        return res.status(429).json({ error: 'Please wait 30 seconds before requesting another OTP.' });
      }
      
      if (recentOtp.attempts >= 3) {
        return res.status(403).json({ error: 'Maximum OTP attempts exceeded for this user.' });
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(now.getTime() + 2 * 60 * 1000); // 2 mins

    // Atomic OTP Generation: invalidate all previous unused OTPs and create the new one
    await prisma.$transaction([
      prisma.otpLog.updateMany({
        where: {
          attendeeId: attendee.id,
          otpType: scanTypeEnum,
          used: false
        },
        data: {
          used: true // Invalidate previous unused OTPs
        }
      }),
      prisma.otpLog.create({
        data: {
          attendeeId: attendee.id,
          otpCode: code,
          otpType: scanTypeEnum,
          attempts: recentOtp ? recentOtp.attempts : 0,
          expiresAt: expiry
        }
      })
    ]);

    if (!attendee.email) {
      return res.status(400).json({ error: 'Attendee has no email address registered.' });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const subjectText = type === 'food' ? 'Your Food Distribution OTP' : 'Your Event Entry OTP';
    const bodyText = type === 'food' 
      ? `Your One-Time Password for food distribution is: ${code}. It expires in 2 minutes.`
      : `Your One-Time Password for event entry is: ${code}. It expires in 2 minutes.`;

    const str = [
      `To: ${attendee.email}`,
      `Subject: ${subjectText}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      bodyText
    ].join('\n');

    const encodedMail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMail
        }
      });
      res.status(200).json({ message: 'OTP sent to your email.' });
    } catch (mailErr) {
      console.error("Gmail API Error:", mailErr);
      return res.status(500).json({ 
        error: 'Failed to send OTP via Gmail API. Please check your credentials.',
        details: mailErr.message 
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { roll, otp, type = 'entry' } = req.body;
    if (!roll || !otp) {
      return res.status(400).json({ error: 'Roll number and OTP are required' });
    }

    // Role-based validation
    if (req.user.role === 'ENTRY_VOLUNTEER' && type !== 'entry') {
      return res.status(403).json({ error: 'Entry volunteers can only verify entry OTPs.' });
    }
    if (req.user.role === 'FOOD_VOLUNTEER' && type !== 'food') {
      return res.status(403).json({ error: 'Food volunteers can only verify food OTPs.' });
    }

    const scanTypeEnum = type === 'food' ? 'FOOD' : 'ENTRY';

    const result = await prisma.$transaction(async (tx) => {
      const attendee = await tx.attendee.findUnique({ where: { roll } });
      if (!attendee) return { status: 404, payload: { error: 'Attendee not found' } };

      if (type === 'entry' && attendee.entryStatus) {
        return { status: 400, payload: { error: 'Attendee has already checked in.' } };
      }

      if (type === 'food') {
        if (!attendee.entryStatus) return { status: 400, payload: { error: 'Entry required before food distribution.' } };
        if (attendee.foodStatus) return { status: 400, payload: { error: 'Food already collected.' } };
      }

      const otpLog = await tx.otpLog.findFirst({
        where: { attendeeId: attendee.id, otpType: scanTypeEnum, used: false },
        orderBy: { createdAt: 'desc' }
      });

      if (!otpLog) {
        return { status: 400, payload: { error: 'No valid OTP requested for this user' } };
      }

      if (otpLog.attempts >= 3) {
        return { status: 403, payload: { error: 'Maximum OTP attempts exceeded' } };
      }

      const isExpired = new Date() > otpLog.expiresAt;
      const isCorrect = otpLog.otpCode === otp;

      if (isExpired) {
        return { status: 400, payload: { error: 'OTP has expired' } };
      }

      if (!isCorrect) {
        await tx.otpLog.update({
          where: { id: otpLog.id },
          data: { attempts: otpLog.attempts + 1 }
        });
        return { status: 400, payload: { error: 'Invalid OTP' } };
      }

      // Success
      await tx.otpLog.update({
        where: { id: otpLog.id },
        data: { used: true, verifiedAt: new Date() }
      });

      if (type === 'entry') {
        const updated = await tx.attendee.updateMany({
          where: { id: attendee.id, entryStatus: false },
          data: { entryStatus: true, entryOtpUsed: true, entryScannedAt: new Date() }
        });
        if (updated.count === 0) return { status: 400, payload: { error: 'Attendee has already checked in' } };
      } else if (type === 'food') {
        const updated = await tx.attendee.updateMany({
          where: { id: attendee.id, foodStatus: false, entryStatus: true },
          data: { foodStatus: true, foodOtpUsed: true, foodScannedAt: new Date() }
        });
        if (updated.count === 0) return { status: 400, payload: { error: 'Food collection was just processed by another device.' } };
      }
      
      const finalAttendee = await tx.attendee.findUnique({ where: { id: attendee.id } });

      return {
        status: 200,
        payload: {
          status: 'ALLOWED',
          name: finalAttendee.name
        }
      };
    });

    res.status(result.status).json(result.payload);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
