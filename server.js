require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'stc@stc.dk';
const FROM_EMAIL = process.env.FROM_EMAIL || 'kontakt@stc.dk';

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

async function sendEmail({ navn, email, telefon, emne, besked }) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:8px;">
      <h2 style="margin-top:0;color:#111;">Ny henvendelse via stc.dk</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#555;width:120px;"><strong>Navn</strong></td><td style="padding:8px 0;">${navn}</td></tr>
        <tr><td style="padding:8px 0;color:#555;"><strong>Email</strong></td><td style="padding:8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
        ${telefon ? `<tr><td style="padding:8px 0;color:#555;"><strong>Telefon</strong></td><td style="padding:8px 0;"><a href="tel:${telefon}">${telefon}</a></td></tr>` : ''}
        ${emne ? `<tr><td style="padding:8px 0;color:#555;"><strong>Emne</strong></td><td style="padding:8px 0;">${emne}</td></tr>` : ''}
      </table>
      <div style="margin-top:20px;padding:20px;background:#fff;border-radius:6px;border-left:4px solid #2563eb;">
        <strong style="color:#555;">Besked:</strong>
        <p style="margin:8px 0 0;white-space:pre-wrap;">${besked}</p>
      </div>
      <p style="margin-top:24px;font-size:12px;color:#999;">Henvendelsen er gemt i databasen og sendt via stc.dk</p>
    </div>
  `;

  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.SMTP2GO_API_KEY,
      to: [NOTIFY_EMAIL],
      sender: FROM_EMAIL,
      subject: `Ny henvendelse fra ${navn}${emne ? ` – ${emne}` : ''}`,
      html_body: html
    })
  });

  const data = await response.json();
  if (!response.ok || data.data?.succeeded !== 1) {
    throw new Error(`SMTP2GO fejl: ${JSON.stringify(data)}`);
  }
}

app.use(express.json());

// Redirect /side.html → /side og /side/ → /side
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    return res.redirect(301, req.path.slice(0, -5));
  }
  if (req.path.length > 1 && req.path.endsWith('/')) {
    return res.redirect(301, req.path.slice(0, -1));
  }
  next();
});

app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// POST /api/contact
app.post('/api/contact', async (req, res) => {
  const { navn, email, telefon, emne, besked } = req.body;

  if (!navn || !email || !besked) {
    return res.status(400).json({ error: 'Navn, email og besked er påkrævet.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ugyldig email-adresse.' });
  }

  const data = {
    navn: navn.trim(),
    email: email.trim(),
    telefon: telefon?.trim() || null,
    emne: emne?.trim() || null,
    besked: besked.trim()
  };

  try {
    await pool.query(
      `INSERT INTO contact_submissions (navn, email, telefon, emne, besked)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.navn, data.email, data.telefon, data.emne, data.besked]
    );

    // Send email — log fejl men lad ikke det blokere succesrespons
    sendEmail(data).catch(err => console.error('Email fejl:', err));

    res.json({ success: true });
  } catch (err) {
    console.error('Database fejl:', err);
    res.status(500).json({ error: 'Noget gik galt. Prøv igen eller ring til os.' });
  }
});

app.get('*', (_req, res) => {
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
