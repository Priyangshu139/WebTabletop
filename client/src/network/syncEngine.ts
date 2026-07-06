import { EngineState, EngineCommand, EngineEvent } from '../engine/types';
import { PRNG } from '../engine/prng';
import { validateCommand } from '../engine/rules';
import { applyEvent } from '../engine/reducer';
import { SignalingClient } from './signalingClient';
import { WebRTCManager } from './webrtcManager';

export class SyncEngine {
  public state: EngineState;
  public playerId: string;
  public isHost: boolean;

  private lobbyId: string;
  private secretHash: string;
  private signalingUrl: string;
  private restUrl: string;

  private signalingClient: SignalingClient;
  private webrtcManager: WebRTCManager;
  private onStateUpdate: (state: EngineState) => void;
  private onError?: (msg: string) => void;

  constructor(
    initialState: EngineState,
    lobbyId: string,
    playerId: string,
    secretHash: string,
    isHost: boolean,
    signalingUrl: string,
    restUrl: string,
    onStateUpdate: (state: EngineState) => void,
    onError?: (msg: string) => void
  ) {
    this.state = initialState;
    this.lobbyId = lobbyId;
    this.playerId = playerId;
    this.secretHash = secretHash;
    this.isHost = isHost;
    this.signalingUrl = signalingUrl;
    this.restUrl = restUrl;
    this.onStateUpdate = onStateUpdate;
    this.onError = onError;

    this.signalingClient = new SignalingClient(this.signalingUrl);
    this.webrtcManager = new WebRTCManager(this.isHost, this.signalingClient);

    this.setupListeners();
  }

  public async start(): Promise<void> {
    await this.signalingClient.connect(this.lobbyId, this.playerId, this.secretHash);

    if (!this.isHost) {
      // Connect directly to host P1 over WebRTC
      await this.webrtcManager.initiatePeerConnection('P1');
    }
  }

  private setupListeners() {
    // 1. Signaling Handlers
    this.signalingClient.onHostMigrate = async (newHostId) => {
      this.webrtcManager.close();

      if (newHostId === this.playerId) {
        // We are the new Host
        this.isHost = true;
        this.webrtcManager = new WebRTCManager(true, this.signalingClient);
        this.setupListeners(); // re-bind listeners
        this.onStateUpdate(this.state);
      } else {
        // We are still a Peer; initiate connection to the new Host
        this.webrtcManager = new WebRTCManager(false, this.signalingClient);
        this.setupListeners();
        await this.webrtcManager.initiatePeerConnection(newHostId);
      }
    };

    // 2. WebRTC Handlers
    this.webrtcManager.onMessage = (senderId, data) => {
      if (data.type === 'COMMAND') {
        if (this.isHost) {
          this.executeAuthoritativeCommand(data.command, senderId);
        }
      } else if (data.type === 'EVENTS') {
        if (!this.isHost) {
          const events: EngineEvent[] = data.events;
          events.forEach(evt => {
            this.state = applyEvent(this.state, evt);
          });
          this.onStateUpdate(this.state);
        }
      } else if (data.type === 'SYNC_STATE') {
        if (!this.isHost) {
          this.state = data.state;
          this.onStateUpdate(this.state);
        }
      } else if (data.type === 'ERROR') {
        this.onError?.(data.message);
      }
    };

    this.webrtcManager.onPeerConnected = (peerId) => {
      if (this.isHost) {
        // Generate a PLAYER_JOINED event authoritative state transition
        const joinEvent: EngineEvent = {
          type: 'PLAYER_JOINED',
          playerId: peerId,
          payload: {
            color: peerId === 'P1' ? '#ef4444' : '#3b82f6',
            emojiFace: peerId === 'P1' ? '🦊' : '🐼',
            skinTone: 'medium'
          },
          timestamp: Date.now()
        };

        this.state = applyEvent(this.state, joinEvent);
        this.onStateUpdate(this.state);

        // Broadcast the PLAYER_JOINED event to all connected peers
        this.webrtcManager.broadcast({
          type: 'EVENTS',
          events: [joinEvent]
        });

        // Send full synchronized state to the newly connected peer
        this.webrtcManager.sendTo(peerId, {
          type: 'SYNC_STATE',
          state: this.state
        });

        // Save the updated state to the backend
        this.saveStateToBackend();
      }
    };

    this.webrtcManager.onPeerDisconnected = async (remoteId) => {
      if (!this.isHost && remoteId === 'P1') {
        // Host disconnected; reconnect signaling client to receive migration command
        try {
          await this.signalingClient.connect(this.lobbyId, this.playerId, this.secretHash);
        } catch (err) {
          console.error('Failed to reconnect to signaling server for host migration:', err);
        }
      }
    };
  }

  public dispatch(cmdType: 'ROLL_DICE' | 'MOVE_PIECE' | 'END_TURN', payload?: any) {
    const command: EngineCommand = {
      type: cmdType,
      playerId: this.playerId,
      payload
    };

    if (this.isHost) {
      // Host executes locally
      this.executeAuthoritativeCommand(command, this.playerId);
    } else {
      // Peer forwards command to Host
      try {
        this.webrtcManager.broadcast({
          type: 'COMMAND',
          command
        });
      } catch (err: any) {
        this.onError?.(`Failed to send action: ${err.message}`);
      }
    }
  }

  private executeAuthoritativeCommand(command: EngineCommand, senderId: string) {
    try {
      const prng = new PRNG(this.state.seed, this.state.prngState);
      const events = validateCommand(this.state, command, prng);

      events.forEach(evt => {
        this.state = applyEvent(this.state, evt);
      });

      this.onStateUpdate(this.state);

      // Broadcast events to all peers
      this.webrtcManager.broadcast({
        type: 'EVENTS',
        events
      });

      // Periodic state backup to backend server via REST
      this.saveStateToBackend();

    } catch (err: any) {
      if (senderId === this.playerId) {
        this.onError?.(err.message);
      } else {
        // Send error back to initiating Peer
        try {
          this.webrtcManager.sendTo(senderId, {
            type: 'ERROR',
            message: err.message
          });
        } catch (sendErr) {
          console.error('Failed to send error back to peer:', sendErr);
        }
      }
    }
  }

  private async saveStateToBackend() {
    try {
      const response = await fetch(`${this.restUrl}/api/lobby/${this.lobbyId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: this.playerId,
          secretHash: this.secretHash,
          state: this.state
        })
      });
      if (!response.ok) {
        console.error('Failed to backup state:', await response.text());
      }
    } catch (err) {
      console.error('State backup REST error:', err);
    }
  }

  public close() {
    this.webrtcManager.close();
    this.signalingClient.close();
  }
}
