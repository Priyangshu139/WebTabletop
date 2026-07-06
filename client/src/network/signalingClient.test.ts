import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalingClient } from './signalingClient';

describe('SignalingClient', () => {
  let client: SignalingClient;
  let mockWebSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock WebSocket instance
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
    };

    // Mock global WebSocket class
    const mockWSClass = vi.fn().mockImplementation(() => mockWebSocket) as any;
    mockWSClass.OPEN = 1;
    global.WebSocket = mockWSClass;

    client = new SignalingClient('ws://localhost:3000');
  });

  it('initiates WebSocket connection and sends VERIFY message on connect', async () => {
    const connectPromise = client.connect('lobby-123', 'P1', 'hash-xyz');

    // Trigger onopen callback
    mockWebSocket.onopen();

    await connectPromise;

    expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:3000');
    expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'VERIFY',
      lobbyId: 'lobby-123',
      playerId: 'P1',
      secretHash: 'hash-xyz'
    }));
  });

  it('triggers onSignal callback when SIGNAL event is received', async () => {
    client.onSignal = vi.fn();
    const connectPromise = client.connect('lobby-123', 'P1', 'hash-xyz');
    mockWebSocket.onopen();
    await connectPromise;

    // Simulate incoming signal
    mockWebSocket.onmessage({
      data: JSON.stringify({
        type: 'SIGNAL',
        senderId: 'P2',
        payload: { sdp: 'sdp-data' }
      })
    });

    expect(client.onSignal).toHaveBeenCalledWith('P2', { sdp: 'sdp-data' });
  });

  it('sends SIGNAL payloads correctly', async () => {
    const connectPromise = client.connect('lobby-123', 'P1', 'hash-xyz');
    mockWebSocket.onopen();
    await connectPromise;

    client.sendSignal('P2', { candidate: 'ice-candidate' });

    expect(mockWebSocket.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'SIGNAL',
      targetId: 'P2',
      payload: { candidate: 'ice-candidate' }
    }));
  });
});
