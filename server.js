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
function saveData(data) {
  const fileContent = `window.KALENDER_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(DATA_FILE, fileContent, 'utf8');
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