require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Neon PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create table if it doesn't exist
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id SERIAL PRIMARY KEY,
      navn VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      telefon VARCHAR(50),
      emne VARCHAR(255),
      besked TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Database ready');
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// POST /api/contact — gem henvendelse i Neon
app.post('/api/contact', async (req, res) => {
  const { navn, email, telefon, emne, besked } = req.body;

  if (!navn || !email || !besked) {
    return res.status(400).json({ error: 'Navn, email og besked er påkrævet.' });
  }

  // Simpel email-validering
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ugyldig email-adresse.' });
  }

  try {
    await pool.query(
      `INSERT INTO contact_submissions (navn, email, telefon, emne, besked)
       VALUES ($1, $2, $3, $4, $5)`,
      [navn.trim(), email.trim(), telefon?.trim() || null, emne?.trim() || null, besked.trim()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Noget gik galt. Prøv igen eller ring til os.' });
  }
});

// Alle andre ruter → index.html (SPA fallback ikke nødvendig her, men god sikkerhed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`STC server kører på port ${PORT}`));
  })
  .catch(err => {
    console.error('Kunne ikke forbinde til database:', err);
    process.exit(1);
  });
