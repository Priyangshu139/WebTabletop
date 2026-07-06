import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { setupSignaling, lobbies } from './signaling.js';

const app = express();
const port = process.env.PORT || 3000;

// Enable JSON parsing
app.use(express.json());

// Simple CORS middleware to allow requests from client
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Helper generators
function generateLobbyId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSecretHash(): string {
  return crypto.randomBytes(16).toString('hex');
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lobby-server' });
});

// REST Lobby matchmakers
app.post('/api/lobby/create', (req, res) => {
  const lobbyId = generateLobbyId();
  const secretHash = generateSecretHash();
  const traits = req.body.traits || {};

  lobbies[lobbyId] = {
    lobbyId,
    hostId: 'P1',
    players: {
      'P1': {
        playerId: 'P1',
        secretHash,
        traits
      }
    }
  };

  res.json({ lobbyId, playerId: 'P1', secretHash });
});

app.post('/api/lobby/join', (req, res) => {
  const { lobbyId, traits } = req.body;
  const lobby = lobbies[lobbyId];

  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found.' });
    return;
  }

  const existingPlayerIds = Object.keys(lobby.players);
  if (existingPlayerIds.length >= 8) {
    res.status(400).json({ error: 'Lobby is full.' });
    return;
  }

  const nextId = `P${existingPlayerIds.length + 1}`;
  const secretHash = generateSecretHash();

  lobby.players[nextId] = {
    playerId: nextId,
    secretHash,
    traits: traits || {}
  };

  res.json({ lobbyId, playerId: nextId, secretHash });
});

// Authoritative Host State Backups
app.post('/api/lobby/:id/save', (req, res) => {
  const lobbyId = req.params.id;
  const { playerId, secretHash, state } = req.body;
  const lobby = lobbies[lobbyId];

  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found.' });
    return;
  }

  // Authorization verification
  const player = lobby.players[playerId];
  if (!player || player.secretHash !== secretHash || lobby.hostId !== playerId) {
    res.status(401).json({ error: 'Unauthorized: Only the active Host can save state.' });
    return;
  }

  lobby.stateBackup = state;
  res.json({ status: 'success' });
});

app.get('/api/lobby/:id/state', (req, res) => {
  const lobbyId = req.params.id;
  const lobby = lobbies[lobbyId];

  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found.' });
    return;
  }

  res.json({ state: lobby.stateBackup || null });
});

// Wrap express server with http to attach WebSocket listener
const server = http.createServer(app);
setupSignaling(server);

server.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
