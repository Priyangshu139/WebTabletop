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
  public chatHistory: any[] = [];
  public playerTraits: any;

  public lobbyId: string;
  public secretHash: string;
  private signalingUrl: string;
  private restUrl: string;

  private signalingClient: SignalingClient;
  private webrtcManager: WebRTCManager;
  private onStateUpdate: (state: EngineState) => void;
  private onError?: (msg: string) => void;
  private onChatReceived?: (chat: any) => void;

  constructor(
    initialState: EngineState,
    lobbyId: string,
    playerId: string,
    secretHash: string,
    isHost: boolean,
    signalingUrl: string,
    restUrl: string,
    onStateUpdate: (state: EngineState) => void,
    onError?: (msg: string) => void,
    onChatReceived?: (chat: any) => void,
    playerTraits?: any
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
    this.onChatReceived = onChatReceived;
    this.playerTraits = playerTraits || {};

    this.signalingClient = new SignalingClient(this.signalingUrl);
    this.webrtcManager = new WebRTCManager(this.isHost, this.signalingClient);

    this.setupListeners();
  }

  public async start(): Promise<void> {
    await this.signalingClient.connect(this.lobbyId, this.playerId, this.secretHash);

    if (!this.isHost) {
      // Connect directly to host P1 over WebRTC
      await this.webrtcManager.initiatePeerConnection('P1');
    } else {
      // Authoritative host saves initial state representation
      await this.saveStateToBackend();
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
          if (data.chatHistory) {
            this.chatHistory = data.chatHistory;
            this.chatHistory.forEach(c => this.onChatReceived?.(c));
          }
          this.onStateUpdate(this.state);
        }
      } else if (data.type === 'CHAT') {
        if (this.isHost) {
          this.chatHistory.push(data.chat);
          if (this.chatHistory.length > 50) this.chatHistory.shift();
          this.webrtcManager.broadcast({ type: 'CHAT', chat: data.chat });
        }
        this.onChatReceived?.(data.chat);
      } else if (data.type === 'ERROR') {
        this.onError?.(data.message);
      } else if (data.type === 'HANDSHAKE') {
        if (this.isHost) {
          const payload: any = {
            color: data.traits?.color || '#3b82f6',
            emojiFace: data.traits?.emojiFace || '🐼',
            skinTone: data.traits?.skinTone || 'medium',
            isSpectator: !!data.traits?.isSpectator
          };

          // Draw starting hand if Uno and not a spectator
          if (this.state.activeModule === 'uno-go' && !payload.isSpectator) {
            const startHand: any[] = [];
            const deck = this.state.moduleState.unoDeck || [];
            for (let i = 0; i < 7; i++) {
              if (deck.length > 0) {
                const card = deck.shift();
                startHand.push(card);
              }
            }
            payload.startHand = startHand;
          }

          const joinEvent: EngineEvent = {
            type: 'PLAYER_JOINED',
            playerId: senderId,
            payload,
            timestamp: Date.now()
          };

          this.state = applyEvent(this.state, joinEvent);
          this.onStateUpdate(this.state);

          // Broadcast join event to all other peers
          this.webrtcManager.broadcast({
            type: 'EVENTS',
            events: [joinEvent]
          });

          // Send full synchronized state and chat history to the newly connected peer
          this.webrtcManager.sendTo(senderId, {
            type: 'SYNC_STATE',
            state: this.state,
            chatHistory: this.chatHistory
          });

          // Save the updated state to the backend
          this.saveStateToBackend();
        }
      }
    };

    this.webrtcManager.onPeerConnected = (peerId) => {
      if (!this.isHost && peerId === 'P1') {
        // Send traits handshake to Host P1
        this.webrtcManager.sendTo('P1', {
          type: 'HANDSHAKE',
          traits: this.playerTraits
        });
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

  public dispatch(cmdType: EngineCommand['type'], payload?: any) {
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

  public sendChat(text: string) {
    const chat = {
      id: Math.random().toString(36).substring(7),
      senderId: this.playerId,
      senderColor: this.state.players[this.playerId]?.color || '#ef4444',
      senderEmoji: this.state.players[this.playerId]?.emojiFace || '🦊',
      text,
      timestamp: Date.now()
    };

    if (this.isHost) {
      this.chatHistory.push(chat);
      if (this.chatHistory.length > 50) this.chatHistory.shift();
      this.webrtcManager.broadcast({ type: 'CHAT', chat });
      this.onChatReceived?.(chat);
    } else {
      try {
        this.webrtcManager.broadcast({ type: 'CHAT', chat });
      } catch (err: any) {
        console.error('Failed to send chat over P2P:', err);
      }
    }
  }

  public close() {
    this.webrtcManager.close();
    this.signalingClient.close();
  }
}
