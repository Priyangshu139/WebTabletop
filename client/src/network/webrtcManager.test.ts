import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebRTCManager } from './webrtcManager';
import { SignalingClient } from './signalingClient';

describe('WebRTCManager', () => {
  let mockSignalingClient: any;
  let mockPC: any;
  let mockChannel: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChannel = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 'open',
    };

    mockPC = {
      createDataChannel: vi.fn().mockReturnValue(mockChannel),
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-offer-sdp' }),
      createAnswer: vi.fn().mockResolvedValue({ sdp: 'mock-answer-sdp' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addIceCandidate: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };

    // Mock global WebRTC objects
    global.RTCPeerConnection = vi.fn().mockImplementation(() => mockPC) as any;
    global.RTCSessionDescription = vi.fn().mockImplementation((init) => init) as any;
    global.RTCIceCandidate = vi.fn().mockImplementation((init) => init) as any;

    mockSignalingClient = {
      sendSignal: vi.fn(),
      onSignal: undefined,
    };
  });

  it('initiates Peer connection and generates SDP offer', async () => {
    const manager = new WebRTCManager(false, mockSignalingClient as unknown as SignalingClient);

    const initPromise = manager.initiatePeerConnection('P1');

    // Trigger channel open to resolve the promise
    setTimeout(() => {
      mockChannel.onopen();
    }, 0);

    const channel = await initPromise;

    expect(global.RTCPeerConnection).toHaveBeenCalled();
    expect(mockPC.createDataChannel).toHaveBeenCalledWith('game-channel');
    expect(mockPC.createOffer).toHaveBeenCalled();
    expect(mockPC.setLocalDescription).toHaveBeenCalled();
    expect(mockSignalingClient.sendSignal).toHaveBeenCalledWith('P1', {
      type: 'offer',
      sdp: 'mock-offer-sdp'
    });
    expect(channel).toBe(mockChannel);
  });

  it('host handles Peer offer, sets remote description, and responds with answer', async () => {
    const manager = new WebRTCManager(true, mockSignalingClient as unknown as SignalingClient);

    // Simulate Peer Offer
    await manager.handleSignal('P2', {
      type: 'offer',
      sdp: 'peer-offer-sdp'
    });

    expect(mockPC.setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'peer-offer-sdp'
    });
    expect(mockPC.createAnswer).toHaveBeenCalled();
    expect(mockPC.setLocalDescription).toHaveBeenCalled();
    expect(mockSignalingClient.sendSignal).toHaveBeenCalledWith('P2', {
      type: 'answer',
      sdp: 'mock-answer-sdp'
    });
  });
});
