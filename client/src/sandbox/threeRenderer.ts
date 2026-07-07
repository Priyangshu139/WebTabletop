import * as THREE from 'three';
import { EngineState } from '../engine/types';
import ludoModule from './modules/ludo_go.json';
import monopolyModule from './modules/monopoly_go.json';

export class ThreeRenderer {
  private container: HTMLDivElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;

  // Camera Orbit Settings
  private radius: number = 8;
  private theta: number = 0; // horizontal angle
  private phi: number = Math.PI / 3; // vertical tilt angle
  private targetLookAt: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  // Drag variables
  private isDragging: boolean = false;
  private previousMouseX: number = 0;
  private previousMouseY: number = 0;

  // Procedural Meshes Maps
  private pawnsMap: Map<string, THREE.Mesh> = new Map();
  private tilesMap: THREE.Mesh[] = [];
  private cardsMap: THREE.Mesh[] = [];
  private avatarsMap: Map<string, THREE.Group> = new Map();
  private tableMesh!: THREE.Mesh;
  private deckMesh!: THREE.Group;

  // Active state
  private currentState: EngineState | null = null;
  private activePlayerId: string = 'P1';

  constructor(container: HTMLDivElement, activePlayerId: string) {
    this.container = container;
    this.activePlayerId = activePlayerId;

    this.initThree();
    this.setupTable();
    this.setupCameraControls();
    this.animate();
  }

  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a); // Slate background

    // Perspective Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    );
    this.updateCameraPosition();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // Window Resize Handler
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    if (!this.container || !this.renderer) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  private setupTable() {
    // 1. Procedural circular mahogany wooden table top
    const tableGeom = new THREE.CylinderGeometry(4.5, 4.5, 0.2, 64);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x3e2723, // mahogany brown
      roughness: 0.6,
      metalness: 0.1
    });
    this.tableMesh = new THREE.Mesh(tableGeom, tableMat);
    this.tableMesh.position.y = -0.1;
    this.tableMesh.receiveShadow = true;
    this.scene.add(this.tableMesh);

    // Table leg support
    const supportGeom = new THREE.CylinderGeometry(1, 1.2, 3, 32);
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x1a0f0a });
    const supportMesh = new THREE.Mesh(supportGeom, supportMat);
    supportMesh.position.y = -1.6;
    this.scene.add(supportMesh);
  }

  private setupCameraControls() {
    const dom = this.renderer.domElement;

    // Mouse drag orbit controls (no libraries)
    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.previousMouseX = e.clientX;
      this.previousMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.previousMouseX;
      const dy = e.clientY - this.previousMouseY;

      this.theta -= dx * 0.007; // adjust rotation speed
      this.phi = Math.max(0.2, Math.min(Math.PI / 2.1, this.phi - dy * 0.005)); // clamp tilt angles to stay above table

      this.previousMouseX = e.clientX;
      this.previousMouseY = e.clientY;
      this.updateCameraPosition();
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    // Touch events for mobile/Android
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches[0]) {
        this.isDragging = true;
        this.previousMouseX = e.touches[0].clientX;
        this.previousMouseY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDragging || !e.touches[0]) return;
      const dx = e.touches[0].clientX - this.previousMouseX;
      const dy = e.touches[0].clientY - this.previousMouseY;

      this.theta -= dx * 0.007;
      this.phi = Math.max(0.2, Math.min(Math.PI / 2.1, this.phi - dy * 0.005));

      this.previousMouseX = e.touches[0].clientX;
      this.previousMouseY = e.touches[0].clientY;
      this.updateCameraPosition();
    };

    // Zoom wheel
    const onWheel = (e: WheelEvent) => {
      this.radius = Math.max(4, Math.min(15, this.radius + e.deltaY * 0.005));
      this.updateCameraPosition();
    };

    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onMouseUp);

    dom.addEventListener('wheel', onWheel, { passive: true });
  }

  private updateCameraPosition() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.targetLookAt);
  }

  private isSpectator: boolean = false;

  public updateState(state: EngineState, isSpectator = false, spectatingPlayerId = 'P1') {
    this.currentState = state;
    this.isSpectator = isSpectator;

    // Camera perspective focus matches the spectated player's seat position
    const targetPId = isSpectator ? spectatingPlayerId : this.activePlayerId;

    // 1. Synchronize seated Avatars
    this.syncSeatedAvatars(state);

    // 2. Synchronize board elements depending on activeModule
    const activeModule = state.activeModule || 'ludo-go-classic';
    this.clearGameComponents();

    if (activeModule === 'uno-go') {
      this.renderUnoBoard(state, targetPId);
    } else {
      this.renderMonopolyLudoBoard(state);
    }
  }

  private syncSeatedAvatars(state: EngineState) {
    const playerIds = Object.keys(state.players);
    const numPlayers = playerIds.length;

    // Remove obsolete avatars
    this.avatarsMap.forEach((avatarGroup, pid) => {
      if (!state.players[pid]) {
        this.scene.remove(avatarGroup);
        this.avatarsMap.delete(pid);
      }
    });

    // Positions avatars evenly around the 4.5m table perimeter (at radius = 4.2)
    playerIds.forEach((pid, index) => {
      const angle = (index / numPlayers) * Math.PI * 2;
      const seatRadius = 4.2;
      const x = seatRadius * Math.sin(angle);
      const z = seatRadius * Math.cos(angle);

      let group = this.avatarsMap.get(pid);
      if (!group) {
        group = new THREE.Group();

        // Sitting Chest Mesh
        const chestGeom = new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8);
        const chestMat = new THREE.MeshStandardMaterial({
          color: state.players[pid].color,
          roughness: 0.5
        });
        const chestMesh = new THREE.Mesh(chestGeom, chestMat);
        chestMesh.position.y = 0.4;
        group.add(chestMesh);

        // Head Sphere Mesh
        const headGeom = new THREE.SphereGeometry(0.25, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({
          color: 0xffcc99, // default skin tone
          roughness: 0.6
        });
        const headMesh = new THREE.Mesh(headGeom, headMat);
        headMesh.position.y = 0.95;
        group.add(headMesh);

        // 3D Arms (Chairs armrests)
        const armGeom = new THREE.BoxGeometry(0.12, 0.35, 0.12);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const leftArm = new THREE.Mesh(armGeom, armMat);
        leftArm.position.set(-0.35, 0.3, 0.1);
        const rightArm = leftArm.clone();
        rightArm.position.x = 0.35;
        group.add(leftArm);
        group.add(rightArm);

        // Face text sprite displaying player emoji face!
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = '48px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(state.players[pid].emojiFace || '🦊', 32, 32);
        }
        const faceTex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: faceTex });
        const faceSprite = new THREE.Sprite(spriteMat);
        faceSprite.position.set(0, 0.95, 0.28);
        faceSprite.scale.set(0.48, 0.48, 0.48);
        group.add(faceSprite);

        group.position.set(x, 0, z);
        // Turn avatar to face the center of the table (lookAt 0,0,0)
        group.lookAt(0, 0, 0);

        this.scene.add(group);
        this.avatarsMap.set(pid, group);
      } else {
        // Update avatar position if count changed
        group.position.set(x, 0, z);
        group.lookAt(0, 0, 0);
      }
    });
  }

  private renderMonopolyLudoBoard(state: EngineState) {
    const isMonopoly = state.activeModule === 'monopoly-go';
    
    // Draw 3D square track: a flat rectangular panel in the center of the table
    const boardWidth = 4.8;
    const boardGeom = new THREE.BoxGeometry(boardWidth, 0.04, boardWidth);
    const boardMat = new THREE.MeshStandardMaterial({
      color: isMonopoly ? 0xd1fae5 : 0x1e293b, // monopoly green vs ludo dark slate
      roughness: 0.7
    });
    const boardMesh = new THREE.Mesh(boardGeom, boardMat);
    boardMesh.position.y = 0.01;
    this.scene.add(boardMesh);
    this.tilesMap.push(boardMesh);

    // Draw the 16 tiles (4 per side) around the edge of the square board
    const tilesData = isMonopoly ? monopolyModule.board.tiles : ludoModule.board.tiles;

    tilesData.forEach((tile: any) => {
      const index = tile.index;
      const side = Math.floor(index / 4);
      const step = index % 4;

      let tx = 0;
      let tz = 0;
      const extent = 2.0;

      // Position tiles in square perimeter
      if (side === 0) {
        tx = -extent + step * 1.33;
        tz = -extent;
      } else if (side === 1) {
        tx = extent;
        tz = -extent + step * 1.33;
      } else if (side === 2) {
        tx = extent - step * 1.33;
        tz = extent;
      } else if (side === 3) {
        tx = -extent;
        tz = extent - step * 1.33;
      }

      const tileGeom = new THREE.BoxGeometry(0.9, 0.05, 0.9);
      const tileMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(tile.color || '#334155'),
        roughness: 0.8
      });
      const tileMesh = new THREE.Mesh(tileGeom, tileMat);
      tileMesh.position.set(tx, 0.02, tz);
      this.scene.add(tileMesh);
      this.tilesMap.push(tileMesh);

      // Render flat tile title text
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(255,255,255,0.01)';
        ctx.fillRect(0,0,128,128);
        ctx.font = '22px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(tile.emoji, 64, 48);
        ctx.font = '16px sans-serif';
        ctx.fillText(tile.name.substring(0, 10), 64, 88);
      }
      const labelTex = new THREE.CanvasTexture(canvas);
      const labelGeom = new THREE.PlaneGeometry(0.7, 0.7);
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true,
        side: THREE.DoubleSide
      });
      const labelMesh = new THREE.Mesh(labelGeom, labelMat);
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.set(tx, 0.05, tz);
      this.scene.add(labelMesh);
      this.tilesMap.push(labelMesh);
    });

    // Draw 3D Player pawns
    Object.keys(state.players).forEach((pid) => {
      const playerPos = state.moduleState.playerPositions[pid] || 0;
      const tileIndex = playerPos % 16;
      const side = Math.floor(tileIndex / 4);
      const step = tileIndex % 4;

      let tx = 0;
      let tz = 0;
      const extent = 2.0;

      if (side === 0) {
        tx = -extent + step * 1.33;
        tz = -extent;
      } else if (side === 1) {
        tx = extent;
        tz = -extent + step * 1.33;
      } else if (side === 2) {
        tx = extent - step * 1.33;
        tz = extent;
      } else if (side === 3) {
        tx = -extent;
        tz = extent - step * 1.33;
      }

      // Conic pawn model
      const pawnGeom = new THREE.ConeGeometry(0.12, 0.45, 16);
      const pawnMat = new THREE.MeshStandardMaterial({
        color: state.players[pid].color,
        roughness: 0.3
      });
      const pawnMesh = new THREE.Mesh(pawnGeom, pawnMat);
      pawnMesh.position.set(tx, 0.25, tz);
      pawnMesh.castShadow = true;
      this.scene.add(pawnMesh);
      this.pawnsMap.set(pid, pawnMesh);

      // Top pawn sphere head
      const topGeom = new THREE.SphereGeometry(0.08, 8, 8);
      const topMesh = new THREE.Mesh(topGeom, pawnMat);
      topMesh.position.set(tx, 0.48, tz);
      this.scene.add(topMesh);
      this.tilesMap.push(topMesh);
    });
  }

  private renderUnoBoard(state: EngineState, targetPId: string) {
    // 1. Draw central card piles (deck stack & discard pile)
    this.deckMesh = new THREE.Group();

    // Draw deck stack of cards
    const cardHeight = 0.015;
    for (let i = 0; i < 8; i++) {
      const cardGeom = new THREE.BoxGeometry(0.6, cardHeight, 0.9);
      const cardMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6, // Blue card back color
        roughness: 0.6
      });
      const cardMesh = new THREE.Mesh(cardGeom, cardMat);
      cardMesh.position.y = i * cardHeight;
      this.deckMesh.add(cardMesh);
    }
    this.deckMesh.position.set(-0.6, 0.01, 0);
    this.scene.add(this.deckMesh);

    // Discard Pile card (lying flat)
    const topDiscard = state.moduleState.unoDiscardPile?.[state.moduleState.unoDiscardPile.length - 1];
    const discardGeom = new THREE.BoxGeometry(0.6, 0.02, 0.9);
    const discardColor = this.getUnoCardColor(topDiscard?.color || 'red');
    const discardMat = new THREE.MeshStandardMaterial({
      color: discardColor,
      roughness: 0.4
    });
    const discardMesh = new THREE.Mesh(discardGeom, discardMat);
    discardMesh.position.set(0.6, 0.01, 0);
    this.scene.add(discardMesh);
    this.cardsMap.push(discardMesh);

    // Draw card value label on the top card
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,0.01)';
      ctx.fillRect(0,0,64,128);
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText(topDiscard ? String(topDiscard.value).substring(0, 5) : 'Uno', 32, 64);
    }
    const discardTex = new THREE.CanvasTexture(canvas);
    const discardLabelGeom = new THREE.PlaneGeometry(0.5, 0.8);
    const discardLabelMat = new THREE.MeshBasicMaterial({
      map: discardTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    const discardLabelMesh = new THREE.Mesh(discardLabelGeom, discardLabelMat);
    discardLabelMesh.rotation.x = -Math.PI / 2;
    discardLabelMesh.position.set(0.6, 0.025, 0);
    this.scene.add(discardLabelMesh);
    this.cardsMap.push(discardLabelMesh);

    // 2. Draw active cards in player hands (offset in front of their seats)
    const playerIds = Object.keys(state.players);
    const numPlayers = playerIds.length;

    playerIds.forEach((pid, index) => {
      const angle = (index / numPlayers) * Math.PI * 2;
      const handRadius = 3.2; // slightly forward from the avatar
      const hx = handRadius * Math.sin(angle);
      const hz = handRadius * Math.cos(angle);

      const hand = state.players[pid]?.hand || [];
      const numCards = hand.length;

      // Draw each card arranged in a fan shape facing the center
      hand.forEach((card: any, cidx: number) => {
        const spreadAngle = 0.08;
        const offsetAngle = (cidx - (numCards - 1) / 2) * spreadAngle;
        const cardAngle = angle + offsetAngle;

        const cx = hx + 0.4 * Math.sin(cardAngle);
        const cz = hz + 0.4 * Math.cos(cardAngle);

        const cardBox = new THREE.BoxGeometry(0.35, 0.55, 0.02);
        
        // Hide details of other players' hands (facing away or colored grey/card-back blue)
        const isSelf = !this.isSpectator && (pid === targetPId);
        const cardColor = isSelf ? this.getUnoCardColor(card.color) : 0x3b82f6;

        const cardMat = new THREE.MeshStandardMaterial({
          color: cardColor,
          roughness: 0.5
        });
        const cardMesh = new THREE.Mesh(cardBox, cardMat);
        cardMesh.position.set(cx, 0.35, cz);
        
        // Face the card up towards the player's angle seat
        cardMesh.lookAt(hx, 0.35, hz);
        
        // Tilt cards backwards slightly (looking like they are held)
        cardMesh.rotateX(0.2);

        this.scene.add(cardMesh);
        this.cardsMap.push(cardMesh);

        // Value text if self card
        if (isSelf) {
          const cardCanvas = document.createElement('canvas');
          cardCanvas.width = 64;
          cardCanvas.height = 128;
          const cardCtx = cardCanvas.getContext('2d');
          if (cardCtx) {
            cardCtx.fillStyle = 'rgba(255,255,255,0.01)';
            cardCtx.fillRect(0,0,64,128);
            cardCtx.font = 'bold 36px sans-serif';
            cardCtx.fillStyle = 'white';
            cardCtx.textAlign = 'center';
            cardCtx.fillText(String(card.value).substring(0, 5), 32, 64);
          }
          const cardTex = new THREE.CanvasTexture(cardCanvas);
          const cardLabelGeom = new THREE.PlaneGeometry(0.3, 0.48);
          const cardLabelMat = new THREE.MeshBasicMaterial({
            map: cardTex,
            transparent: true,
            side: THREE.DoubleSide
          });
          const cardLabelMesh = new THREE.Mesh(cardLabelGeom, cardLabelMat);
          cardLabelMesh.position.set(cx, 0.35, cz);
          cardLabelMesh.lookAt(hx, 0.35, hz);
          cardLabelMesh.rotateX(0.2);
          cardLabelMesh.translateZ(0.012); // slightly offset forward to avoid clipping

          this.scene.add(cardLabelMesh);
          this.cardsMap.push(cardLabelMesh);
        }
      });
    });
  }

  private getUnoCardColor(color: string): number {
    switch (String(color).toLowerCase()) {
      case 'red': return 0xef4444;
      case 'blue': return 0x3b82f6;
      case 'green': return 0x10b981;
      case 'yellow': return 0xeab308;
      default: return 0x6b7280; // grey
    }
  }

  private clearGameComponents() {
    this.tilesMap.forEach(mesh => this.scene.remove(mesh));
    this.tilesMap = [];

    this.pawnsMap.forEach(mesh => this.scene.remove(mesh));
    this.pawnsMap.clear();

    this.cardsMap.forEach(mesh => this.scene.remove(mesh));
    this.cardsMap = [];

    if (this.deckMesh) {
      this.scene.remove(this.deckMesh);
    }
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Simple procedural spins or micro-rotations to bring scene to life
    if (this.currentState) {
      const timer = Date.now() * 0.0005;
      
      // Let seated avatars bounce/breathe gently
      this.avatarsMap.forEach((avatarGroup, pid) => {
        const index = Object.keys(this.currentState!.players).indexOf(pid);
        avatarGroup.position.y = Math.sin(timer * 2 + index) * 0.02;
      });
    }

    this.renderer.render(this.scene, this.camera);
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
