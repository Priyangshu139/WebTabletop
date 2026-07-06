export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;

  public onPeerConnected?: (playerId: string, traits: any) => void;
  public onPeerDisconnected?: (playerId: string) => void;
  public onSignal?: (senderId: string, payload: any) => void;
  public onHostMigrate?: (newHostId: string) => void;
  public onDisconnect?: () => void;
  public onError?: (msg: string) => void;

  constructor(url: string) {
    this.url = url;
  }

  public connect(lobbyId: string, playerId: string, secretHash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          // Send verification credentials immediately
          this.ws?.send(JSON.stringify({
            type: 'VERIFY',
            lobbyId,
            playerId,
            secretHash
          }));
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'PEER_CONNECTED':
                this.onPeerConnected?.(data.senderId, data.payload.traits);
                break;
              case 'PEER_DISCONNECTED':
                this.onPeerDisconnected?.(data.senderId);
                break;
              case 'SIGNAL':
                this.onSignal?.(data.senderId, data.payload);
                break;
              case 'HOST_MIGRATE':
                this.onHostMigrate?.(data.payload.newHostId);
                break;
              case 'ERROR':
                this.onError?.(data.message);
                break;
            }
          } catch (err) {
            console.error('Signaling message parse error:', err);
          }
        };

        this.ws.onclose = () => {
          this.onDisconnect?.();
        };

        this.ws.onerror = (err) => {
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public sendSignal(targetId: string, payload: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling client is not connected.');
    }
    this.ws.send(JSON.stringify({
      type: 'SIGNAL',
      targetId,
      payload
    }));
  }

  public close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
