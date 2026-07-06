const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect()
    .then(() => console.log('Connesso al database PostgreSQL'))
    .catch(err => console.error('Errore connessione database:', err.message));

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/db-test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            status: 'connesso', 
            time: result.rows[0].now,
            database: 'PostgreSQL'
        });
    } catch (err) {
        res.status(500).json({ 
            status: 'errore', 
            message: err.message 
        });
    }
});

app.post('/api/visit', async (req, res) => {
    const { page, userAgent, referrer } = req.body;
    try {
        await pool.query(
            'INSERT INTO visits (page, user_agent, referrer, created_at) VALUES ($1, $2, $3, NOW())',
            [page || 'home', userAgent || '', referrer || '']
        );
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/click', async (req, res) => {
    const { subject, page } = req.body;
    try {
        await pool.query(
            'INSERT INTO subject_clicks (subject, page, created_at) VALUES ($1, $2, NOW())',
            [subject, page || 'home']
        );
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalVisits = await pool.query('SELECT COUNT(*) as count FROM visits');
        const uniqueVisits = await pool.query('SELECT COUNT(DISTINCT DATE(created_at)) as count FROM visits');
        const clicksBySubject = await pool.query(`
            SELECT subject, COUNT(*) as clicks,
                   ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM subject_clicks), 0), 2) as percentage
            FROM subject_clicks
            GROUP BY subject
            ORDER BY clicks DESC
        `);
        
        res.json({
            totalVisits: parseInt(totalVisits.rows[0].count),
            uniqueDays: parseInt(uniqueVisits.rows[0].count),
            subjectStats: clicksBySubject.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/quiz-scores', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM quiz_scores ORDER BY score DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/quiz-scores', async (req, res) => {
    const { name, category, score, total } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO quiz_scores (name, category, score, total, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [name, category, score, total]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS visits (
                id SERIAL PRIMARY KEY,
                page VARCHAR(100),
                user_agent TEXT,
                referrer TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subject_clicks (
                id SERIAL PRIMARY KEY,
                subject VARCHAR(100),
                page VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS quiz_scores (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                category VARCHAR(50),
                score INTEGER,
                total INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('Tabelle database create/verificate');
    } catch (err) {
        console.error('Errore creazione tabelle:', err.message);
    }
};

initDb();

app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});
