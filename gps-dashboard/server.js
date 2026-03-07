const http = require('http');
const fs = require('fs');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { exec } = require('child_process');

const PORT = 3000;

// GPS State
let gpsState = {
  fix: false,
  fixType: 'NO FIX',
  lat: null,
  lon: null,
  alt: null,
  speed: null,
  satellites: 0,
  satellitesInView: 0,
  hdop: null,
  time: null,
  lastUpdate: null
};

let systemState = {
  cpu: 0,
  temp: 0,
  ram: { used: 0, total: 0 },
  uptime: 0,
  ip: 'unknown'
};

let connectionState = {
  internet: false,
  signal: 0,
  lastCheck: null
};

let clients = [];

// SSE broadcast
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(res => {
    try { res.write(msg); return true; }
    catch { return false; }
  });
}

// Parse NMEA sentences
function parseNMEA(line) {
  if (!line.startsWith('$')) return;

  const parts = line.split(',');
  const type = parts[0];

  if (type === '$GPGGA' || type === '$GNGGA') {
    const time = parts[1];
    const lat = parseLatLon(parts[2], parts[3]);
    const lon = parseLatLon(parts[4], parts[5]);
    const fixQ = parseInt(parts[6]) || 0;
    const sats = parseInt(parts[7]) || 0;
    const hdop = parseFloat(parts[8]) || null;
    const alt = parseFloat(parts[9]) || null;

    gpsState.fix = fixQ > 0;
    gpsState.fixType = fixQ === 0 ? 'NO FIX' : fixQ === 1 ? '3D FIX' : fixQ === 2 ? 'DGPS' : '3D FIX';
    gpsState.lat = lat;
    gpsState.lon = lon;
    gpsState.alt = alt;
    gpsState.satellites = sats;
    gpsState.hdop = hdop;
    gpsState.time = time;
    gpsState.lastUpdate = Date.now();

    broadcast({ type: 'gps', data: gpsState });
  }

  if (type === '$GPGSV' || type === '$GNGSV') {
    const total = parseInt(parts[3]) || 0;
    gpsState.satellitesInView = total;
  }

  if (type === '$GPRMC' || type === '$GNRMC') {
    const speed = parseFloat(parts[7]) || 0;
    gpsState.speed = (speed * 1.852).toFixed(1); // knots to km/h
  }
}

function parseLatLon(val, dir) {
  if (!val || val === '') return null;
  const deg = parseFloat(val.substring(0, dir === 'N' || dir === 'S' ? 2 : 3));
  const min = parseFloat(val.substring(dir === 'N' || dir === 'S' ? 2 : 3));
  let decimal = deg + min / 60;
  if (dir === 'S' || dir === 'W') decimal = -decimal;
  return parseFloat(decimal.toFixed(6));
}

// Setup GPS serial
function setupGPS() {
  try {
    const port = new SerialPort({ path: '/dev/ttyUSB1', baudRate: 9600 });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    parser.on('data', parseNMEA);
    port.on('error', err => console.log('GPS port error:', err.message));
    console.log('GPS serial connected on /dev/ttyUSB1');
  } catch (e) {
    console.log('GPS not available:', e.message);
    // Generate mock GPS for testing
    setInterval(() => {
      gpsState.lastUpdate = Date.now();
      broadcast({ type: 'gps', data: gpsState });
    }, 1000);
  }
}

// System stats
function updateSystemStats() {
  exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", (err, stdout) => {
    if (!err) systemState.cpu = parseFloat(stdout.trim()) || 0;
  });

  exec("cat /sys/class/thermal/thermal_zone0/temp", (err, stdout) => {
    if (!err) systemState.temp = (parseInt(stdout.trim()) / 1000).toFixed(1);
  });

  exec("free -m | awk 'NR==2{printf \"%s %s\", $3,$2}'", (err, stdout) => {
    if (!err) {
      const parts = stdout.trim().split(' ');
      systemState.ram = { used: parseInt(parts[0]), total: parseInt(parts[1]) };
    }
  });

  exec("cat /proc/uptime", (err, stdout) => {
    if (!err) systemState.uptime = parseInt(parseFloat(stdout.split(' ')[0]));
  });

  exec("hostname -I | awk '{print $1}'", (err, stdout) => {
    if (!err) systemState.ip = stdout.trim();
  });

  // Check internet
  exec("ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1 && echo ok", (err, stdout) => {
    connectionState.internet = stdout.trim() === 'ok';
    connectionState.lastCheck = Date.now();
  });

  broadcast({ type: 'system', data: systemState });
  broadcast({ type: 'connection', data: connectionState });
}

// HTTP Server
const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'init', gps: gpsState, system: systemState, connection: connectionState })}\n\n`);
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }

  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ gps: gpsState, system: systemState, connection: connectionState }));
    return;
  }

  // Serve dashboard
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(path.join(__dirname, 'dashboard.html')));
});

setupGPS();
setInterval(updateSystemStats, 2000);
updateSystemStats();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 Dashcam dashboard running at http://localhost:${PORT}`);
});
