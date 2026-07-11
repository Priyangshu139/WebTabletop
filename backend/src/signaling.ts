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
  heartbeatTimeout?: NodeJS.Timeout;
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

            // Start/reset heartbeat if this rejoining/connecting player is the host
            if (lobby.hostId === playerId) {
              resetHostHeartbeatTimeout(lobby);
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

          case 'HEARTBEAT': {
            if (!clientLobbyId || !clientPlayerId) return;
            const lobby = lobbies[clientLobbyId];
            if (!lobby || lobby.hostId !== clientPlayerId) return;

            resetHostHeartbeatTimeout(lobby);
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

      // Clear host heartbeat timer if host disconnected
      if (lobby.hostId === clientPlayerId) {
        if (lobby.heartbeatTimeout) {
          clearTimeout(lobby.heartbeatTimeout);
          lobby.heartbeatTimeout = undefined;
        }
      }

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

function resetHostHeartbeatTimeout(lobby: LobbySession) {
  if (lobby.heartbeatTimeout) {
    clearTimeout(lobby.heartbeatTimeout);
  }
  lobby.heartbeatTimeout = setTimeout(() => {
    triggerHostReelection(lobby);
  }, 15000); // 15 seconds timeout
}

function triggerHostReelection(lobby: LobbySession) {
  const activePlayerIds = Object.keys(lobby.players).filter(pid => {
    return pid !== lobby.hostId && lobby.players[pid].ws !== undefined && lobby.players[pid].ws!.readyState === 1; // 1 = OPEN
  });

  if (activePlayerIds.length > 0) {
    activePlayerIds.sort();
    const newHostId = activePlayerIds[0];
    const oldHostId = lobby.hostId;
    lobby.hostId = newHostId;

    console.log(`Lobby ${lobby.lobbyId}: Host ${oldHostId} heartbeat timed out. Migrating to ${newHostId}.`);

    // Broadcast host migration to all remaining active peers
    Object.values(lobby.players).forEach(p => {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify({
          type: 'HOST_MIGRATE',
          payload: { newHostId }
        }));
      }
    });

    resetHostHeartbeatTimeout(lobby);
  } else {
    if (lobby.heartbeatTimeout) {
      clearTimeout(lobby.heartbeatTimeout);
      lobby.heartbeatTimeout = undefined;
    }
  }
}
