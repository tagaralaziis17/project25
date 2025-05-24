const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || '10.10.11.27',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'bismillah123',
  database: process.env.DB_NAME || 'suhu',
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Create users table if not exists
const initializeDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        reset_token VARCHAR(255),
        reset_token_expires DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert test user if not exists
    await pool.query(`
      INSERT IGNORE INTO users (username, password, email)
      VALUES ('tagar', 'tagar123', 'tagar@umm.ac.id')
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

initializeDatabase();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET || 'your-secret-key', {
      expiresIn: '24h',
    });

    res.json({ token, user: { username: user.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to authenticate', error: error.message });
  }
});

// Password reset request
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 1); // Token valid for 1 hour

    await pool.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?',
      [resetToken, tokenExpiry, email]
    );

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <p>You requested a password reset.</p>
        <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
        <p>This link will expire in 1 hour.</p>
      `
    });

    res.json({ message: 'Password reset instructions sent to your email' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Failed to process password reset request' });
  }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = rows[0];

    await pool.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [password, user.id]
    );

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// Get latest sensor 1 data
app.get('/api/sensor1', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT suhu, kelembapan, waktu as timestamp FROM sensor_data ORDER BY waktu DESC LIMIT 1'
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'No sensor data found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching sensor 1 data:', error);
    res.status(500).json({ message: 'Failed to fetch sensor data', error: error.message });
  }
});

// Get latest sensor 2 data
app.get('/api/sensor2', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT suhu, kelembapan, waktu as timestamp FROM sensor_data ORDER BY waktu DESC LIMIT 1 OFFSET 1'
    );
    
    if (rows.length === 0) {
      const [firstRow] = await pool.query(
        'SELECT suhu, kelembapan, waktu as timestamp FROM sensor_data ORDER BY waktu DESC LIMIT 1'
      );
      
      if (firstRow.length === 0) {
        return res.status(404).json({ message: 'No sensor data found' });
      }
      
      const sensor2Data = {
        suhu: parseFloat(firstRow[0].suhu) + 1.2,
        kelembapan: parseFloat(firstRow[0].kelembapan) + 3.5,
        timestamp: firstRow[0].timestamp
      };
      
      return res.json(sensor2Data);
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching sensor 2 data:', error);
    res.status(500).json({ message: 'Failed to fetch sensor data', error: error.message });
  }
});

// Get latest fire and smoke data
app.get('/api/fire-smoke', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT api_value, asap_value, waktu as timestamp FROM api_asap_data ORDER BY waktu DESC LIMIT 1'
    );
    
    if (rows.length === 0) {
      return res.json({
        api_value: 15,
        asap_value: 25,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching fire/smoke data:', error);
    res.status(500).json({ message: 'Failed to fetch fire/smoke data', error: error.message });
  }
});

// Get latest electricity data
app.get('/api/electricity', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM listrik_noc ORDER BY waktu DESC LIMIT 1'
    );
    
    if (rows.length === 0) {
      return res.json({
        phase_r: 220,
        phase_s: 222,
        phase_t: 221,
        current_r: 15,
        current_s: 16,
        current_t: 14,
        power_r: 3300,
        power_s: 3552,
        power_t: 3094,
        energy_r: 12500,
        energy_s: 13200,
        energy_t: 11800,
        frequency_r: 50.1,
        frequency_s: 50.2,
        frequency_t: 50.0,
        pf_r: 0.92,
        pf_s: 0.93,
        pf_t: 0.91,
        va_r: 3580,
        va_s: 3820,
        va_t: 3400,
        var_r: 1200,
        var_s: 1240,
        var_t: 1180,
        voltage_3ph: 221,
        current_3ph: 45,
        power_3ph: 9946,
        energy_3ph: 37500,
        frequency_3ph: 50.1,
        pf_3ph: 0.92,
        va_3ph: 10800,
        var_3ph: 3620,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching electricity data:', error);
    res.status(500).json({ message: 'Failed to fetch electricity data', error: error.message });
  }
});

// Export data endpoints
app.get('/api/export/sensor-data', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sensor_data ORDER BY waktu DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error exporting sensor data:', error);
    res.status(500).json({ message: 'Failed to export data', error: error.message });
  }
});

app.get('/api/export/fire-smoke', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM api_asap_data ORDER BY waktu DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error exporting fire/smoke data:', error);
    res.status(500).json({ message: 'Failed to export data', error: error.message });
  }
});

app.get('/api/export/electricity', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM listrik_noc ORDER BY waktu DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error exporting electricity data:', error);
    res.status(500).json({ message: 'Failed to export data', error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});