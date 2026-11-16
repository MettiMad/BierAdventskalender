const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.js');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initiale data.js anlegen, falls noch nicht vorhanden
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      users: [],
      beers: {},
      ratings: {}
    };
    saveData(initialData);
  }
}

// Daten aus data.js lesen
function loadData() {
  initDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  // Entfernt "window.KALENDER_DATA = " und das abschließende ";"
  const jsonPart = raw
    .replace(/^window\.KALENDER_DATA\s*=\s*/, '')
    .replace(/;\s*$/, '');
  return JSON.parse(jsonPart);
}

// Daten als gültige JS-Datei speichern
const https = require('https');

// Hilfsfunktion: Daten lokal speichern UND direkt an GitHub senden
async function saveData(data) {
  const fileContent = `window.KALENDER_DATA = ${JSON.stringify(data, null, 2)};\n`;
  
  // 1. Lokal auf Render speichern (damit es sofort da ist)
  fs.writeFileSync(DATA_FILE, fileContent, 'utf8');

  // 2. Automatisch zu GitHub pushen, falls die Zugangsdaten hinterlegt sind
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    console.log('GitHub-Zugangsdaten fehlen. Es wird nur lokal gespeichert.');
    return;
  }

  try {
    const filePath = 'data.js'; // Pfad im Repo
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    // Schritt A: Aktuelle SHA der Datei von GitHub holen (wichtig für Updates)
    const getOptions = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/contents/${filePath}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Bier-Kalender-Server',
        'Authorization': `token ${token}`
      }
    };

    const sha = await new Promise((resolve, reject) => {
      https.get(getOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(json.sha || null);
          } catch (e) {
            resolve(null);
          }
        });
      }).on('error', err => reject(err));
    });

    // Schritt B: Datei auf GitHub aktualisieren (Commit erstellen)
    const updatedContentBase64 = Buffer.from(fileContent, 'utf8').toString('base64');
    const payload = JSON.stringify({
      message: 'Automatisches Update der Bier-Daten via Web-App',
      content: updatedContentBase64,
      sha: sha // Erforderlich, um die bestehende Datei zu überschreiben
    });

    const putOptions = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/contents/${filePath}`,
      method: 'PUT',
      headers: {
        'User-Agent': 'Bier-Kalender-Server',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(putOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('Erfolgreich zu GitHub gepusht!');
            resolve();
          } else {
            console.error('Fehler beim GitHub-Push:', body);
            reject(new Error(`GitHub API error: ${res.statusCode}`));
          }
        });
      });
      req.on('error', err => reject(err));
      req.write(payload);
      req.end();
    });

  } catch (err) {
    console.error('Fehler im GitHub-Sync:', err);
  }
}
// Optional: Direkter Abruf der data.js
app.get('/data.js', (req, res) => {
  initDataFile();
  res.sendFile(DATA_FILE);
});

// Aktuellen Stand abrufen
app.get('/api/data', (req, res) => {
  try {
    res.json(loadData());
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden der data.js' });
  }
});

// Nutzer registrieren / aktualisieren
app.post('/api/user', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name fehlt' });

  const cleanName = name.trim();
  const data = loadData();
  if (!data.users.includes(cleanName)) {
    data.users.push(cleanName);
    saveData(data);
  }
  res.json(data);
});

// Bier für ein Türchen (1-24) speichern
app.post('/api/beer', (req, res) => {
  const { day, name, brewery, style, abv, addedBy } = req.body;
  if (!day || !name) return res.status(400).json({ error: 'Tag oder Biername fehlt' });

  const data = loadData();
  data.beers[day] = {
    day: Number(day),
    name: name.trim(),
    brewery: (brewery || '').trim(),
    style: (style || '').trim(),
    abv: (abv || '').trim(),
    addedBy: addedBy || 'Unbekannt',
    updatedAt: new Date().toISOString()
  };
  saveData(data);
  res.json(data);
});

// Bewertung speichern (inkl. der 5 Kategorien)
app.post('/api/rate', (req, res) => {
  const { day, user, optik, geruch, geschmack, mundgefuehl, abgang, comment } = req.body;
  if (!day || !user) return res.status(400).json({ error: 'Daten unvollständig' });

  const total =
    Number(optik) +
    Number(geruch) +
    Number(geschmack) +
    Number(mundgefuehl) +
    Number(abgang);

  const data = loadData();
  if (!data.ratings[day]) data.ratings[day] = {};

  data.ratings[day][user] = {
    optik: Number(optik),
    geruch: Number(geruch),
    geschmack: Number(geschmack),
    mundgefuehl: Number(mundgefuehl),
    abgang: Number(abgang),
    total,
    comment: (comment || '').trim(),
    updatedAt: new Date().toISOString()
  };

  if (!data.users.includes(user)) {
    data.users.push(user);
  }

  saveData(data);
  res.json(data);
});

app.listen(PORT, () => {
  initDataFile();
  console.log(`Bier-Adventskalender läuft auf http://localhost:${PORT}`);
});
