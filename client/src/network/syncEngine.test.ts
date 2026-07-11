import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine } from './syncEngine';
import { EngineState } from '../engine/types';
import { WebRTCManager } from './webrtcManager';

// Hoist-safe mocking
vi.mock('./signalingClient', () => {
  return {
    SignalingClient: vi.fn().mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        sendSignal: vi.fn(),
        close: vi.fn(),
      };
    })
  };
});

vi.mock('./webrtcManager', () => {
  return {
    WebRTCManager: vi.fn().mockImplementation(() => {
      return {
        initiatePeerConnection: vi.fn().mockResolvedValue(undefined),
        broadcast: vi.fn(),
        sendTo: vi.fn(),
        close: vi.fn(),
      };
    })
  };
});

describe('SyncEngine', () => {
  let mockState: EngineState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      seed: 'test-seed',
      prngState: 0,
      players: {
        'P1': { id: 'P1', color: 'red', skinTone: 'light', emojiFace: '😀', isHost: true },
        'P2': { id: 'P2', color: 'blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
      },
      turn: {
        currentPlayerId: 'P1',
        phase: 'Roll'
      },
      eventLog: [],
      moduleState: {
        lastDiceValue: 0,
        playerPositions: { 'P1': 0, 'P2': 0 }
      }
    };

    // Mock fetch for REST state backups
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('ok')
    }) as any;
  });

  it('runs command locally and triggers save if host', async () => {
    const onUpdate = vi.fn();
    const engine = new SyncEngine(
      mockState,
      'lobby-id',
      'P1',
      'hash-xyz',
      true, // isHost
      'ws://localhost:3000',
      'http://localhost:3000',
      onUpdate
    );

    engine.dispatch('ROLL_DICE');

    expect(onUpdate).toHaveBeenCalled();
    expect(engine.state.turn.phase).toBe('Move');
    expect(engine.state.moduleState.lastDiceValue).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalled(); // Backs up to server
  });

  it('forwards command to host if peer', async () => {
    const onUpdate = vi.fn();
    const engine = new SyncEngine(
      mockState,
      'lobby-id',
      'P2',
      'hash-xyz',
      false, // isHost
      'ws://localhost:3000',
      'http://localhost:3000',
      onUpdate
    );

    engine.dispatch('ROLL_DICE');

    expect(onUpdate).not.toHaveBeenCalled(); // Wait for host broadcast

    // Retrieve mock WebRTCManager instance returned in this test's SyncEngine
    const results = vi.mocked(WebRTCManager).mock.results;
    const mockWebRTC = results[results.length - 1].value as any;
    expect(mockWebRTC.broadcast).toHaveBeenCalledWith({
      type: 'COMMAND',
      command: {
        type: 'ROLL_DICE',
        playerId: 'P2',
        payload: undefined
      }
    });
  });
});
