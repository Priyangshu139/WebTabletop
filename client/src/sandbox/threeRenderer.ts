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
  private pawnsMap: Map<string, THREE.Mesh | THREE.Group> = new Map();
  private pawnTargetsMap: Map<string, THREE.Vector3> = new Map();
  private tilesMap: (THREE.Mesh | THREE.Group)[] = [];
  private cardsMap: THREE.Object3D[] = [];
  private avatarsMap: Map<string, THREE.Group> = new Map();
  private tableMesh!: THREE.Mesh;
  private deckMesh!: THREE.Group;
  private unoLogoMesh!: THREE.Mesh;

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
    const ambientLight = new THREE.AmbientLight(0x4b5563, 0.45); // soft warm gray ambient
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(5, 12, 7);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // Warm table spotlight for dramatic voxel tabletop look
    const spotLight = new THREE.SpotLight(0xffedd5, 1.8, 18, Math.PI / 3, 0.6, 0.8);
    spotLight.position.set(0, 8, 0);
    spotLight.target.position.set(0, 0, 0);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    this.scene.add(spotLight);

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

    // Add stylized UNO logo on the center of the table (initially hidden)
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 512;
    logoCanvas.height = 512;
    const lctx = logoCanvas.getContext('2d');
    if (lctx) {
      lctx.fillStyle = 'rgba(0,0,0,0)';
      lctx.fillRect(0, 0, 512, 512);

      lctx.save();
      lctx.translate(256, 256);
      lctx.rotate(-0.15); // tilt like in reference images

      // Outermost glow
      lctx.shadowColor = 'rgba(0,0,0,0.5)';
      lctx.shadowBlur = 15;

      // Outer yellow ellipse
      lctx.fillStyle = '#fbbf24';
      lctx.beginPath();
      lctx.ellipse(0, 0, 180, 90, 0, 0, Math.PI * 2);
      lctx.fill();

      // Inner red ellipse
      lctx.shadowBlur = 0;
      lctx.fillStyle = '#ef4444';
      lctx.beginPath();
      lctx.ellipse(0, 0, 165, 76, 0, 0, Math.PI * 2);
      lctx.fill();

      // UNO Text
      lctx.font = 'italic bold 100px sans-serif';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      
      // Black offset for outline shadow
      lctx.fillStyle = '#1e1b4b';
      lctx.fillText('UNO', -4, 4);

      // White main text
      lctx.fillStyle = '#ffffff';
      lctx.fillText('UNO', 0, 0);

      lctx.restore();
    }
    
    const logoTex = new THREE.CanvasTexture(logoCanvas);
    const logoGeom = new THREE.PlaneGeometry(3.5, 3.5);
    const logoMat = new THREE.MeshBasicMaterial({
      map: logoTex,
      transparent: true,
      depthWrite: false, // avoid z-fighting
      opacity: 0.85
    });
    this.unoLogoMesh = new THREE.Mesh(logoGeom, logoMat);
    this.unoLogoMesh.rotation.x = -Math.PI / 2;
    this.unoLogoMesh.position.set(0, 0.005, 0); // slightly above wood
    this.unoLogoMesh.visible = false;
    this.scene.add(this.unoLogoMesh);
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
    this.unoLogoMesh.visible = (activeModule === 'uno-go');
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

        const color = state.players[pid].color || '#3b82f6';
        const skinToneColor = this.getSkinToneHex(state.players[pid].skinTone || 'medium');
        
        // Hair color selection based on playerId to make them unique
        const hairColors = ['#4a3728', '#1a1a1a', '#d4af37', '#9333ea', '#2563eb', '#16a34a'];
        const pIndex = parseInt(pid.substring(1)) || 0;
        const hairColor = hairColors[pIndex % hairColors.length];

        // 1. Torso (Hoodie/Body)
        const torsoGeom = new THREE.BoxGeometry(0.65, 0.8, 0.4);
        const torsoMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const torsoMesh = new THREE.Mesh(torsoGeom, torsoMat);
        torsoMesh.position.y = 0.4;
        torsoMesh.castShadow = true;
        torsoMesh.receiveShadow = true;
        group.add(torsoMesh);

        // 2. Head
        const headGeom = new THREE.BoxGeometry(0.44, 0.44, 0.44);
        const headMat = new THREE.MeshStandardMaterial({ color: skinToneColor, roughness: 0.6 });
        const headMesh = new THREE.Mesh(headGeom, headMat);
        headMesh.position.set(0, 0.95, 0);
        headMesh.castShadow = true;
        group.add(headMesh);

        // 3. Hair (Blocky haircut)
        const hairGroup = new THREE.Group();
        const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
        
        // Top hair cap
        const topHair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), hairMat);
        topHair.position.set(0, 1.15, 0);
        hairGroup.add(topHair);

        // Back hair
        const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.35, 0.12), hairMat);
        backHair.position.set(0, 0.98, -0.2);
        hairGroup.add(backHair);

        // Sides hair
        const leftHair = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.46), hairMat);
        leftHair.position.set(-0.2, 1.0, 0.01);
        const rightHair = leftHair.clone();
        rightHair.position.x = 0.2;
        hairGroup.add(leftHair);
        hairGroup.add(rightHair);
        
        group.add(hairGroup);

        // 4. Face text sprite displaying player emoji face!
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = '96px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(state.players[pid].emojiFace || '🦊', 64, 64);
        }
        const faceTex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: faceTex });
        const faceSprite = new THREE.Sprite(spriteMat);
        faceSprite.position.set(0, 0.95, 0.23); // positioned right on front face of voxel head
        faceSprite.scale.set(0.44, 0.44, 0.44);
        group.add(faceSprite);

        // 5. Arms
        const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const armGeom = new THREE.BoxGeometry(0.14, 0.4, 0.14);
        
        const leftArm = new THREE.Mesh(armGeom, armMat);
        leftArm.position.set(-0.4, 0.45, 0.1);
        leftArm.rotation.x = -0.4;
        
        const rightArm = new THREE.Mesh(armGeom, armMat);
        rightArm.position.set(0.4, 0.45, 0.1);
        rightArm.rotation.x = -0.4;
        group.add(leftArm);
        group.add(rightArm);

        group.position.set(x, 0, z);
        group.lookAt(0, 0, 0);

        this.scene.add(group);
        this.avatarsMap.set(pid, group);

        // 6. Card count label above head
        const cardCount = state.players[pid]?.hand?.length;
        if (cardCount !== undefined) {
          const countCanvas = document.createElement('canvas');
          countCanvas.width = 256;
          countCanvas.height = 128;
          const countCtx = countCanvas.getContext('2d');
          if (countCtx) {
            countCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            countCtx.beginPath();
            const x = 8, y = 4, w = 240, h = 120, r = 16;
            countCtx.moveTo(x + r, y);
            countCtx.lineTo(x + w - r, y);
            countCtx.quadraticCurveTo(x + w, y, x + w, y + r);
            countCtx.lineTo(x + w, y + h - r);
            countCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            countCtx.lineTo(x + r, y + h);
            countCtx.quadraticCurveTo(x, y + h, x, y + h - r);
            countCtx.lineTo(x, y + r);
            countCtx.quadraticCurveTo(x, y, x + r, y);
            countCtx.closePath();
            countCtx.fill();

            const emoji = state.players[pid]?.emojiFace || '🦊';
            const name = `Player ${pid.substring(1)}`;
            countCtx.font = 'bold 24px sans-serif';
            countCtx.textAlign = 'center';
            countCtx.fillStyle = '#ffffff';
            countCtx.fillText(`${emoji} ${name}`, 128, 48);

            countCtx.font = 'bold 30px sans-serif';
            countCtx.fillStyle = '#fbbf24';
            countCtx.fillText(`${cardCount} CARDS`, 128, 92);
          }
          const countTex = new THREE.CanvasTexture(countCanvas);
          const countSpriteMat = new THREE.SpriteMaterial({ map: countTex });
          const countSprite = new THREE.Sprite(countSpriteMat);
          countSprite.position.set(0, 1.6, 0);
          countSprite.scale.set(1.2, 0.6, 1);
          countSprite.name = 'card-count-label';
          group.add(countSprite);
        }
      } else {
        // Update avatar position if count changed
        group.position.set(x, 0, z);
        group.lookAt(0, 0, 0);

        // Update card count label
        const cardCount = state.players[pid]?.hand?.length;
        const existingLabel = group.getObjectByName('card-count-label') as THREE.Sprite;
        if (existingLabel && cardCount !== undefined) {
          const countCanvas = document.createElement('canvas');
          countCanvas.width = 256;
          countCanvas.height = 128;
          const countCtx = countCanvas.getContext('2d');
          if (countCtx) {
            countCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            countCtx.beginPath();
            const x = 8, y = 4, w = 240, h = 120, r = 16;
            countCtx.moveTo(x + r, y);
            countCtx.lineTo(x + w - r, y);
            countCtx.quadraticCurveTo(x + w, y, x + w, y + r);
            countCtx.lineTo(x + w, y + h - r);
            countCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            countCtx.lineTo(x + r, y + h);
            countCtx.quadraticCurveTo(x, y + h, x, y + h - r);
            countCtx.lineTo(x, y + r);
            countCtx.quadraticCurveTo(x, y, x + r, y);
            countCtx.closePath();
            countCtx.fill();

            const emoji = state.players[pid]?.emojiFace || '🦊';
            const name = `Player ${pid.substring(1)}`;
            countCtx.font = 'bold 24px sans-serif';
            countCtx.textAlign = 'center';
            countCtx.fillStyle = '#ffffff';
            countCtx.fillText(`${emoji} ${name}`, 128, 48);

            countCtx.font = 'bold 30px sans-serif';
            countCtx.fillStyle = '#fbbf24';
            countCtx.fillText(`${cardCount} CARDS`, 128, 92);
          }
          const countTex = new THREE.CanvasTexture(countCanvas);
          existingLabel.material.map = countTex;
          existingLabel.material.needsUpdate = true;
        }
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

      // Draw 3D flag ownership markers if owned (only for Monopoly)
      if (isMonopoly) {
        const ownerId = state.moduleState.propertiesOwned?.[index];
        if (ownerId) {
          const owner = state.players[ownerId];
          const ownerColor = owner?.color || '#ffffff';

          // Shift flag toward center of the board
          const len = Math.sqrt(tx * tx + tz * tz);
          let fx = tx;
          let fz = tz;
          if (len > 0.1) {
            fx = tx - (tx / len) * 0.28;
            fz = tz - (tz / len) * 0.28;
          }

          // Generate flagpole flag group
          const flagGroup = new THREE.Group();

          // Pole cylinder
          const poleGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8);
          const poleMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.2 });
          const poleMesh = new THREE.Mesh(poleGeom, poleMat);
          poleMesh.position.y = 0.175;
          flagGroup.add(poleMesh);

          // Flag banner
          const bannerGeom = new THREE.BoxGeometry(0.18, 0.1, 0.02);
          const bannerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(ownerColor), roughness: 0.6 });
          const bannerMesh = new THREE.Mesh(bannerGeom, bannerMat);
          bannerMesh.position.set(0.09, 0.28, 0);
          flagGroup.add(bannerMesh);

          flagGroup.position.set(fx, 0.02, fz);
          this.scene.add(flagGroup);
          this.tilesMap.push(flagGroup);
        }
      }
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

      // Conic pawn group
      const targetPos = new THREE.Vector3(tx, 0.02, tz);
      this.pawnTargetsMap.set(pid, targetPos);

      let pawnGroup = this.pawnsMap.get(pid) as any;
      if (!pawnGroup) {
        pawnGroup = new THREE.Group();

        const pawnGeom = new THREE.ConeGeometry(0.12, 0.45, 16);
        const pawnMat = new THREE.MeshStandardMaterial({
          color: state.players[pid].color,
          roughness: 0.3
        });
        const bodyMesh = new THREE.Mesh(pawnGeom, pawnMat);
        bodyMesh.position.y = 0.23;
        bodyMesh.castShadow = true;
        pawnGroup.add(bodyMesh);

        const topGeom = new THREE.SphereGeometry(0.08, 8, 8);
        const topMesh = new THREE.Mesh(topGeom, pawnMat);
        topMesh.position.y = 0.46;
        pawnGroup.add(topMesh);

        pawnGroup.position.copy(targetPos);
        this.scene.add(pawnGroup);
        this.pawnsMap.set(pid, pawnGroup);
      }
    });
  }

  private renderUnoBoard(state: EngineState, targetPId: string) {
    // 1. Draw central card piles (deck stack & discard pile)
    this.deckMesh = new THREE.Group();

    // Draw deck stack of cards (face down)
    const cardThickness = 0.012;
    for (let i = 0; i < 12; i++) {
      const card = this.createUnoCardMesh('red', 'Uno', false);
      card.rotation.x = -Math.PI / 2;
      card.position.set(-0.7, 0.01 + i * cardThickness, 0);
      this.deckMesh.add(card);
    }
    this.deckMesh.position.set(0, 0, 0); // Keep container at origin, positioning is handled per card
    this.scene.add(this.deckMesh);

    // Discard Pile card (lying flat, face up)
    const topDiscard = state.moduleState.unoDiscardPile?.[state.moduleState.unoDiscardPile.length - 1];
    if (topDiscard) {
      const discardMesh = this.createUnoCardMesh(topDiscard.color, String(topDiscard.value), true);
      discardMesh.rotation.x = -Math.PI / 2;
      discardMesh.rotation.z = 0.25; // slight organic rotation angle
      discardMesh.position.set(0.7, 0.01, 0);
      this.scene.add(discardMesh);
      this.cardsMap.push(discardMesh);
    }

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

        const isSelf = !this.isSpectator && (pid === targetPId);
        
        const cardMesh = this.createUnoCardMesh(card.color, String(card.value), isSelf);
        cardMesh.position.set(cx, 0.35, cz);
        
        // Face the card flat/upwards towards the player's seat angle
        cardMesh.lookAt(hx, 0.35, hz);
        
        // Tilt cards backwards slightly (looking like they are held)
        cardMesh.rotateX(0.2);

        this.scene.add(cardMesh);
        this.cardsMap.push(cardMesh);
      });
    });
  }



  private clearGameComponents() {
    this.tilesMap.forEach(mesh => this.scene.remove(mesh));
    this.tilesMap = [];

    // Remove obsolete pawns whose players left
    if (this.currentState) {
      this.pawnsMap.forEach((mesh, pid) => {
        if (!this.currentState!.players[pid]) {
          this.scene.remove(mesh);
          this.pawnsMap.delete(pid);
          this.pawnTargetsMap.delete(pid);
        }
      });
    }

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

      // Lerp pawn group positions smoothly towards their current targets
      this.pawnsMap.forEach((pawnGroup, pid) => {
        const target = this.pawnTargetsMap.get(pid);
        if (target) {
          pawnGroup.position.lerp(target, 0.12);
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  };

  private getSkinToneHex(tone: string): string {
    switch (tone) {
      case 'light': return '#ffdbac';
      case 'medium': return '#f1c27d';
      case 'dark': return '#ae703f';
      default: return '#e0ac69';
    }
  }

  private createUnoCardMesh(cardColor: string, cardValue: string, isFaceUp: boolean): THREE.Mesh {
    const cardWidth = 0.35;
    const cardHeight = 0.55;
    const cardThickness = 0.012;

    const cardGeom = new THREE.BoxGeometry(cardWidth, cardHeight, cardThickness);
    
    const frontTex = this.getUnoCardTexture(cardColor, cardValue, false);
    const backTex = this.getUnoCardTexture(cardColor, cardValue, true);

    const paperEdgeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.4 });
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.4 });

    const materials = [
      paperEdgeMat, // +X
      paperEdgeMat, // -X
      paperEdgeMat, // +Y
      paperEdgeMat, // -Y
      isFaceUp ? frontMat : backMat,  // +Z (front)
      isFaceUp ? backMat : frontMat   // -Z (back)
    ];

    const mesh = new THREE.Mesh(cardGeom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private getUnoCardTexture(cardColorName: string, cardValue: string, isBack: boolean): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    if (isBack) {
      // Draw Card Back
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 128, 256);
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 120, 248);

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(6, 6, 116, 244);

      ctx.save();
      ctx.translate(64, 128);
      ctx.rotate(-0.3);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(0, 0, 50, 26, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'italic bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText('UNO', 0, 0);
      ctx.restore();
    } else {
      // Draw Card Front
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 256);

      const hexColor = this.getUnoColorHexStr(cardColorName);
      ctx.fillStyle = hexColor;
      ctx.fillRect(4, 4, 120, 248);

      ctx.save();
      ctx.translate(64, 128);
      ctx.rotate(-0.35);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 48, 88, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = hexColor;
      ctx.font = 'bold 72px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cardValue, 64, 128);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText(cardValue, 20, 26);
      
      ctx.save();
      ctx.translate(108, 230);
      ctx.rotate(Math.PI);
      ctx.fillText(cardValue, 0, 0);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private getUnoColorHexStr(color: string): string {
    switch (String(color).toLowerCase()) {
      case 'red': return '#ef4444';
      case 'blue': return '#3b82f6';
      case 'green': return '#10b981';
      case 'yellow': return '#fbbf24';
      case 'wild': return '#1e1b4b';
      default: return '#374151';
    }
  }





  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
