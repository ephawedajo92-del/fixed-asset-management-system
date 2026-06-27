require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// ===== CATEGORY ROUTES =====

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT * FROM categories ORDER BY name');
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ===== ASSET ROUTES =====

// Get all assets with category details
app.get('/api/assets', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const query = `
      SELECT a.*, c.name as category_name 
      FROM assets a 
      JOIN categories c ON a.category_id = c.id 
      ORDER BY a.created_at DESC
    `;
    const [rows] = await connection.query(query);
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Get single asset
app.get('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const query = `
      SELECT a.*, c.name as category_name 
      FROM assets a 
      JOIN categories c ON a.category_id = c.id 
      WHERE a.id = ?
    `;
    const [rows] = await connection.query(query, [id]);
    connection.release();
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching asset:', error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// Search assets
app.get('/api/assets/search', async (req, res) => {
  try {
    const { q } = req.query;
    const connection = await pool.getConnection();
    const query = `
      SELECT a.*, c.name as category_name 
      FROM assets a 
      JOIN categories c ON a.category_id = c.id 
      WHERE a.asset_name LIKE ? OR a.asset_code LIKE ? OR c.name LIKE ?
      ORDER BY a.created_at DESC
    `;
    const searchTerm = `%${q}%`;
    const [rows] = await connection.query(query, [searchTerm, searchTerm, searchTerm]);
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error searching assets:', error);
    res.status(500).json({ error: 'Failed to search assets' });
  }
});

// Create asset
app.post('/api/assets', async (req, res) => {
  try {
    const { asset_name, asset_code, category_id, description, purchase_date, purchase_cost, location, status, notes } = req.body;

    // Validation
    if (!asset_name || !asset_code || !category_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const connection = await pool.getConnection();
    const query = `
      INSERT INTO assets (asset_name, asset_code, category_id, description, purchase_date, purchase_cost, location, status, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await connection.query(query, [
      asset_name, asset_code, category_id, description, purchase_date, purchase_cost, location, status || 'Active', notes
    ]);
    connection.release();

    res.status(201).json({ 
      message: 'Asset created successfully',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Asset code already exists' });
    }
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// Update asset
app.put('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { asset_name, asset_code, category_id, description, purchase_date, purchase_cost, location, status, notes } = req.body;

    if (!asset_name || !asset_code || !category_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const connection = await pool.getConnection();
    const query = `
      UPDATE assets 
      SET asset_name = ?, asset_code = ?, category_id = ?, description = ?, purchase_date = ?, purchase_cost = ?, location = ?, status = ?, notes = ?
      WHERE id = ?
    `;
    const [result] = await connection.query(query, [
      asset_name, asset_code, category_id, description, purchase_date, purchase_cost, location, status, notes, id
    ]);
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ message: 'Asset updated successfully' });
  } catch (error) {
    console.error('Error updating asset:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Asset code already exists' });
    }
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Delete asset
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const query = 'DELETE FROM assets WHERE id = ?';
    const [result] = await connection.query(query, [id]);
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
