const prisma = require('../prismaClient');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

const signToken = (id, role) => {
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '30d' });
};

exports.register = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { name: username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Strict role validation
    const validRoles = ['ADMIN', 'ENTRY_VOLUNTEER', 'FOOD_VOLUNTEER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN, ENTRY_VOLUNTEER, or FOOD_VOLUNTEER' });
    }

    const user = await prisma.user.create({
      data: {
        name: username,
        passwordHash: hashedPassword,
        role: role
      }
    });

    const token = signToken(user.id, user.role);

    res.status(201).json({ token, role: user.role, username: user.name });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Please provide username and password' });
    }

    const user = await prisma.user.findUnique({ where: { name: username } });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid credentials or inactive user' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user.id, user.role);
    res.status(200).json({ token, role: user.role, username: user.name });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
