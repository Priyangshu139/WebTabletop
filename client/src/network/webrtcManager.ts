import { SignalingClient } from './signalingClient';

export class WebRTCManager {
  private isHost: boolean;
  private signalingClient: SignalingClient;

  // Host: multiple peer connections. Peer: single connection to host (keyed by host ID).
  private connections: Record<string, RTCPeerConnection> = {};
  private channels: Record<string, RTCDataChannel> = {};

  public onMessage?: (senderId: string, data: any) => void;
  public onPeerConnected?: (playerId: string) => void;
  public onPeerDisconnected?: (playerId: string) => void;

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  constructor(isHost: boolean, signalingClient: SignalingClient) {
    this.isHost = isHost;
    this.signalingClient = signalingClient;

    // Listen to signaling signals
    this.signalingClient.onSignal = (senderId, payload) => {
      this.handleSignal(senderId, payload);
    };
  }

  public async initiatePeerConnection(hostId: string): Promise<RTCDataChannel> {
    if (this.isHost) {
      throw new Error('Host cannot initiate connection to another peer in a Star Topology.');
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.connections[hostId] = pc;

    // Setup ICE candidate gathering
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient.sendSignal(hostId, {
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    // Create direct DataChannel
    const channel = pc.createDataChannel('game-channel');
    this.setupDataChannel(hostId, channel);

    // Create SDP Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send Offer through signaling channel
    this.signalingClient.sendSignal(hostId, {
      type: 'offer',
      sdp: offer.sdp
    });

    return new Promise((resolve) => {
      // IMPORTANT: setupDataChannel already set onmessage/onclose/onerror,
      // but did NOT set onopen. We set it here to both resolve the promise
      // AND fire the onPeerConnected callback.
      channel.onopen = () => {
        this.onPeerConnected?.(hostId);
        resolve(channel);
      };
    });
  }

  public async handleSignal(senderId: string, signal: any): Promise<void> {
    if (signal.type === 'offer') {
      // Host receives offer from Peer
      const pc = new RTCPeerConnection(this.rtcConfig);
      this.connections[senderId] = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.signalingClient.sendSignal(senderId, {
            type: 'candidate',
            candidate: event.candidate
          });
        }
      };

      // Listen for data channel creation by Peer
      pc.ondatachannel = (event) => {
        this.setupDataChannel(senderId, event.channel);
        this.onPeerConnected?.(senderId);
      };

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send SDP answer back to Peer
      this.signalingClient.sendSignal(senderId, {
        type: 'answer',
        sdp: answer.sdp
      });

    } else if (signal.type === 'answer') {
      // Peer receives answer from Host
      const pc = this.connections[senderId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
      }

    } else if (signal.type === 'candidate') {
      const pc = this.connections[senderId];
      if (pc && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }
  }

  private setupDataChannel(remotePlayerId: string, channel: RTCDataChannel) {
    this.channels[remotePlayerId] = channel;

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage?.(remotePlayerId, data);
      } catch (err) {
        console.error('DataChannel parse error:', err);
      }
    };

    channel.onclose = () => {
      this.cleanupConnection(remotePlayerId);
      this.onPeerDisconnected?.(remotePlayerId);
    };

    channel.onerror = (err) => {
      console.error(`DataChannel error on remote ${remotePlayerId}:`, err);
    };
  }

  private cleanupConnection(remotePlayerId: string) {
    const pc = this.connections[remotePlayerId];
    if (pc) {
      pc.close();
      delete this.connections[remotePlayerId];
    }
    delete this.channels[remotePlayerId];
  }

  public sendTo(targetId: string, data: any): void {
    const channel = this.channels[targetId];
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(data));
    } else {
      throw new Error(`DataChannel to ${targetId} is not open.`);
    }
  }

  public broadcast(data: any): void {
    // If Host, send to all connected peers. If Peer, send to Host.
    Object.keys(this.channels).forEach(remoteId => {
      this.sendTo(remoteId, data);
    });
  }

  public close(): void {
    Object.keys(this.connections).forEach(remoteId => {
      this.cleanupConnection(remoteId);
    });
  }
}
