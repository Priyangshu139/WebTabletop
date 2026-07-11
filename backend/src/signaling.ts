import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface PlayerSession {
  playerId: string;
  secretHash: string;
  ws?: WebSocket;
  traits?: any;
}

export interface LobbySession {
  lobbyId: string;
  hostId: string;
  players: Record<string, PlayerSession>;
  stateBackup?: any;
}

// Global in-memory lobby store shared between REST routes and WebSocket signaling
export const lobbies: Record<string, LobbySession> = {};
const lobbyCleanups: Record<string, NodeJS.Timeout> = {};

export function setupSignaling(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    let clientLobbyId: string | null = null;
    let clientPlayerId: string | null = null;

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case 'VERIFY': {
            const { lobbyId, playerId, secretHash } = data;
            const lobby = lobbies[lobbyId];
            if (!lobby) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Lobby not found.' }));
              return;
            }

            const player = lobby.players[playerId];
            if (!player || player.secretHash !== secretHash) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized session.' }));
              return;
            }

            // Bind socket
            player.ws = ws;
            clientLobbyId = lobbyId;
            clientPlayerId = playerId;

            if (lobbyCleanups[lobbyId]) {
              clearTimeout(lobbyCleanups[lobbyId]);
              delete lobbyCleanups[lobbyId];
            }

            // Broadcast connection update to other peers
            Object.values(lobby.players).forEach(p => {
              if (p.playerId !== playerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({
                  type: 'PEER_CONNECTED',
                  senderId: playerId,
                  payload: { traits: player.traits }
                }));
              }
            });
            break;
          }

          case 'SIGNAL': {
            if (!clientLobbyId || !clientPlayerId) return;
            const { targetId, payload } = data;
            const lobby = lobbies[clientLobbyId];
            if (!lobby) return;

            const target = lobby.players[targetId];
            if (target && target.ws && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({
                type: 'SIGNAL',
                senderId: clientPlayerId,
                payload
              }));
            }
            break;
          }
        }
      } catch (err) {
        console.error('Signaling msg parse error:', err);
      }
    });

    ws.on('close', () => {
      if (!clientLobbyId || !clientPlayerId) return;
      const lobby = lobbies[clientLobbyId];
      if (!lobby) return;

      const player = lobby.players[clientPlayerId];
      if (player) {
        player.ws = undefined; // clear socket reference
      }

      // Notify other peers
      Object.values(lobby.players).forEach(p => {
        if (p.playerId !== clientPlayerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({
            type: 'PEER_DISCONNECTED',
            senderId: clientPlayerId
          }));
        }
      });

      // Host disconnect handling
      if (lobby.hostId === clientPlayerId) {
        // Trigger host migration after a 5 second grace period to allow reconnect
        setTimeout(() => {
          const currentLobby = lobbies[clientLobbyId!];
          if (!currentLobby) return;

          // If host socket is still undefined
          const hostPlayer = currentLobby.players[currentLobby.hostId];
          if (!hostPlayer || !hostPlayer.ws) {
            // Find another active player
            const activePlayerIds = Object.keys(currentLobby.players).filter(pid => {
              return pid !== currentLobby.hostId && currentLobby.players[pid].ws !== undefined;
            });

            if (activePlayerIds.length > 0) {
              // Elect lowest index player (e.g. sort alphabetically)
              activePlayerIds.sort();
              const newHostId = activePlayerIds[0];
              currentLobby.hostId = newHostId;

              // Broadcast host migration to all remaining peers
              Object.values(currentLobby.players).forEach(p => {
                if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(JSON.stringify({
                    type: 'HOST_MIGRATE',
                    payload: { newHostId }
                  }));
                }
              });
            }
          }
        }, 5000);
      }

      // Inactivity cleanup if all players disconnected
      const activeCount = Object.values(lobby.players).filter(p => p.ws !== undefined).length;
      if (activeCount === 0) {
        if (lobbyCleanups[clientLobbyId]) {
          clearTimeout(lobbyCleanups[clientLobbyId]);
        }
        lobbyCleanups[clientLobbyId] = setTimeout(() => {
          delete lobbies[clientLobbyId!];
          delete lobbyCleanups[clientLobbyId!];
          console.log(`Lobby ${clientLobbyId} deleted due to inactivity.`);
        }, 30 * 60 * 1000); // 30 minutes
      }
    });
  });
}
