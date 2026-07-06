import { EngineState, EngineEvent, Player } from './types';
import { applyEvent } from './reducer';

export interface ReplayPayload {
  moduleId: string;
  seed: string;
  players: Record<string, Player>;
  eventLog: EngineEvent[];
  name?: string;
}

export class ReplayEngine {
  public state: EngineState;
  public eventLog: EngineEvent[];
  public currentIndex: number = -1; // -1 represents the starting state (seed + players, no events applied)

  private initialState: EngineState;
  private onStateUpdate: (state: EngineState) => void;
  private playbackInterval: any = null;

  constructor(payload: ReplayPayload, onStateUpdate: (state: EngineState) => void) {
    this.eventLog = payload.eventLog;
    this.onStateUpdate = onStateUpdate;

    // Construct the initial rehydration state
    const playerPositions: Record<string, number> = {};
    Object.keys(payload.players).forEach(pid => {
      playerPositions[pid] = 0;
    });

    this.initialState = {
      seed: payload.seed,
      prngState: 0,
      players: payload.players,
      turn: {
        currentPlayerId: Object.keys(payload.players)[0] || 'P1',
        phase: 'StartTurn'
      },
      eventLog: [],
      moduleState: {
        lastDiceValue: 0,
        playerPositions
      }
    };

    this.state = JSON.parse(JSON.stringify(this.initialState));
  }

  public stepForward(): boolean {
    if (this.currentIndex >= this.eventLog.length - 1) {
      this.pause();
      return false; // reached the end
    }

    this.currentIndex++;
    const event = this.eventLog[this.currentIndex];
    this.state = applyEvent(this.state, event);
    this.onStateUpdate(this.state);
    return true;
  }

  public stepBackward(): boolean {
    if (this.currentIndex < 0) {
      return false; // already at beginning
    }

    this.currentIndex--;
    this.rehydrateToCurrentIndex();
    return true;
  }

  public goToEvent(index: number) {
    const target = Math.max(-1, Math.min(index, this.eventLog.length - 1));
    this.currentIndex = target;
    this.rehydrateToCurrentIndex();
  }

  public play(speedMs: number = 1000, onComplete?: () => void) {
    if (this.playbackInterval) return;

    this.playbackInterval = setInterval(() => {
      const advanced = this.stepForward();
      if (!advanced) {
        onComplete?.();
      }
    }, speedMs);
  }

  public pause() {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  public isPlaying(): boolean {
    return this.playbackInterval !== null;
  }

  private rehydrateToCurrentIndex() {
    // Reset state to initial conditions
    let nextState = JSON.parse(JSON.stringify(this.initialState));

    // Sequentially apply all events up to the current index
    for (let i = 0; i <= this.currentIndex; i++) {
      nextState = applyEvent(nextState, this.eventLog[i]);
    }

    this.state = nextState;
    this.onStateUpdate(this.state);
  }

  public destroy() {
    this.pause();
  }
}
