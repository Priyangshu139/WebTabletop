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

  // Cursor Tracking for active avatar pointing
  private mouseX: number = 0;
  private mouseY: number = 0;
  private hasInitializedAngles: boolean = false;

  // Remote player poses received over WebRTC
  private remotePoses: Map<string, { theta: number; phi: number; mouseX: number; mouseY: number }> = new Map();

  /** Apply a received remote player pose */
  public applyRemotePose(playerId: string, theta: number, phi: number, mouseX: number, mouseY: number) {
    this.remotePoses.set(playerId, { theta, phi, mouseX, mouseY });
  }

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

    // Mouse Move listener to track cursor for avatar pointing
    window.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
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

    // Build cozy, optimized room props around the table
    this.setupRoomProps();
  }

  private setupRoomProps() {
    // 1. Cozy wooden floor under the table support
    const floorGeom = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a120b, // Warm dark wood/parquet tone
      roughness: 0.85,
      metalness: 0.05
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -3.1;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // 2. Room Walls in 360 degrees with light plaster texture bump mapping
    const wallTex = this.createWallTexture();
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9, // Lighter, clean off-white wall
      bumpMap: wallTex,
      bumpScale: 0.015, // Subtle stucco texture depth
      roughness: 0.95,
      metalness: 0.0
    });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), wallMat);
    backWall.position.set(0, 4.9, -12);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-12, 4.9, 0);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(12, 4.9, 0);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), wallMat);
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(0, 4.9, 12);
    frontWall.receiveShadow = true;
    this.scene.add(frontWall);

    // 3. Fake Window with CLOSED Burgundy Curtains on Left Wall
    const windowGroup = new THREE.Group();
    windowGroup.position.set(-11.9, 4.0, 0);

    // Glowing window pane
    const paneMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 6.0),
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.7,
        roughness: 0.1
      })
    );
    paneMesh.rotation.y = Math.PI / 2;
    windowGroup.add(paneMesh);

    // Window Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 4.2), frameMat);
    topFrame.position.set(0, 3.0, 0);
    windowGroup.add(topFrame);

    const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 4.2), frameMat);
    bottomFrame.position.set(0, -3.0, 0);
    windowGroup.add(bottomFrame);

    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 6.0, 0.15), frameMat);
    leftFrame.position.set(0, 0, -2.0);
    windowGroup.add(leftFrame);

    const rightFrame = leftFrame.clone();
    rightFrame.position.z = 2.0;
    windowGroup.add(rightFrame);

    // Center divider
    const centerDivider = new THREE.Mesh(new THREE.BoxGeometry(0.1, 6.0, 0.1), frameMat);
    centerDivider.position.set(0, 0, 0);
    windowGroup.add(centerDivider);

    // Closed Grey-Blue Curtains (built using accordion folds to look realistic and wavy)
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Grey-blue (Slate)
      roughness: 0.95,
      metalness: 0.05
    });

    const numFolds = 6;
    const foldWidth = 2.1 / numFolds;

    // Left curtain panel folds
    for (let i = 0; i < numFolds; i++) {
      const zOffset = -2.1 + (i + 0.5) * foldWidth;
      const xOffset = 0.05 + (i % 2 === 0 ? 0.04 : -0.04);
      const fold = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 6.5, foldWidth + 0.02),
        curtainMat
      );
      fold.position.set(xOffset, -0.1, zOffset);
      fold.castShadow = true;
      windowGroup.add(fold);
    }

    // Right curtain panel folds
    for (let i = 0; i < numFolds; i++) {
      const zOffset = (i + 0.5) * foldWidth;
      const xOffset = 0.05 + (i % 2 === 0 ? 0.04 : -0.04);
      const fold = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 6.5, foldWidth + 0.02),
        curtainMat
      );
      fold.position.set(xOffset, -0.1, zOffset);
      fold.castShadow = true;
      windowGroup.add(fold);
    }

    // Curtain Rod
    const rodMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 5.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.8, roughness: 0.2 }) // brass rod
    );
    rodMesh.rotation.x = Math.PI / 2;
    rodMesh.position.set(0.08, 3.2, 0);
    windowGroup.add(rodMesh);

    this.scene.add(windowGroup);

    // 4. Hanging Chandelier/Lamp on Top of Table
    const chandelier = new THREE.Group();
    chandelier.position.set(0, 8.0, 0);

    // Cord
    const cordMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 3.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 })
    );
    cordMesh.position.y = -1.75;
    chandelier.add(cordMesh);

    // Copper Shade
    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.8, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9, roughness: 0.2 }) // polished copper
    );
    lampShade.position.y = -3.5;
    chandelier.add(lampShade);

    // Bulb (glow)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffedd5 })
    );
    bulb.position.y = -3.7;
    chandelier.add(bulb);

    this.scene.add(chandelier);

    // 5. Cozy Corner Floor Lamps (Two lamps: back-left and front-right)
    // Floor Lamp 1 (Back-Left Corner)
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-9.0, -3.1, -9.0);

    const baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.2 })
    );
    baseMesh.position.y = 0.05;
    baseMesh.castShadow = true;
    lampGroup.add(baseMesh);

    const poleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.2 })
    );
    poleMesh.position.y = 2.25;
    poleMesh.castShadow = true;
    lampGroup.add(poleMesh);

    const shadeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.6, roughness: 0.5 })
    );
    shadeMesh.position.y = 4.6;
    shadeMesh.castShadow = true;
    lampGroup.add(shadeMesh);

    const lampLight = new THREE.PointLight(0xfff7ed, 3.5, 12);
    lampLight.position.set(-9.0, 1.5, -9.0);
    lampLight.castShadow = true;
    lampLight.shadow.bias = -0.002;
    this.scene.add(lampLight);

    this.scene.add(lampGroup);

    // Floor Lamp 2 (Front-Right Corner)
    const lampGroup2 = new THREE.Group();
    lampGroup2.position.set(9.0, -3.1, 9.0);

    const baseMesh2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.2 })
    );
    baseMesh2.position.y = 0.05;
    baseMesh2.castShadow = true;
    lampGroup2.add(baseMesh2);

    const poleMesh2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.2 })
    );
    poleMesh2.position.y = 2.25;
    poleMesh2.castShadow = true;
    lampGroup2.add(poleMesh2);

    const shadeMesh2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.6, roughness: 0.5 })
    );
    shadeMesh2.position.y = 4.6;
    shadeMesh2.castShadow = true;
    lampGroup2.add(shadeMesh2);

    const lampLight2 = new THREE.PointLight(0xfff7ed, 3.5, 12);
    lampLight2.position.set(9.0, 1.5, 9.0);
    lampLight2.castShadow = true;
    lampLight2.shadow.bias = -0.002;
    this.scene.add(lampLight2);

    this.scene.add(lampGroup2);

    // 6. Wall Paintings (Canvas & art details use MeshBasicMaterial so they are self-illuminated)
    // Painting 1: Abstract Art on Back Wall
    const painting1 = new THREE.Group();
    painting1.position.set(0, 4.0, -11.9);

    const pFrame1 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 }));
    painting1.add(pFrame1);

    const pCanvas1 = new THREE.Mesh(new THREE.BoxGeometry(4.7, 2.7, 0.05), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
    pCanvas1.position.z = 0.03;
    painting1.add(pCanvas1);

    const redBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.04), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    redBlock.position.set(-1.0, 0.4, 0.08);
    painting1.add(redBlock);

    const yellowBlock = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.04), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
    yellowBlock.position.set(0.6, -0.2, 0.08);
    painting1.add(yellowBlock);

    const blueBlock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.04), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    blueBlock.position.set(-0.4, -0.6, 0.08);
    painting1.add(blueBlock);

    this.scene.add(painting1);

    // Painting 2: Voxel Landscape on Right Wall
    const painting2 = new THREE.Group();
    painting2.position.set(11.9, 4.0, 0);
    painting2.rotation.y = -Math.PI / 2;

    const pFrame2 = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6 }));
    painting2.add(pFrame2);

    const pCanvas2 = new THREE.Mesh(new THREE.BoxGeometry(3.7, 2.2, 0.05), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    pCanvas2.position.z = 0.03;
    painting2.add(pCanvas2);

    const sun = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.04), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    sun.position.set(-1.0, 0.4, 0.08);
    painting2.add(sun);

    const hill1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.04), new THREE.MeshBasicMaterial({ color: 0x15803d }));
    hill1.position.set(-0.6, -0.6, 0.08);
    painting2.add(hill1);

    const hill2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.05), new THREE.MeshBasicMaterial({ color: 0x166534 }));
    hill2.position.set(0.7, -0.5, 0.09);
    painting2.add(hill2);

    this.scene.add(painting2);

    // Painting 3: Minimalist Figure Portrait on Front Wall
    const painting3 = new THREE.Group();
    painting3.position.set(-4.0, 4.0, 11.9);
    painting3.rotation.y = Math.PI;

    const pFrame3 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.8 }));
    painting3.add(pFrame3);

    const pCanvas3 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.7, 0.05), new THREE.MeshBasicMaterial({ color: 0xffedd5 }));
    pCanvas3.position.z = 0.03;
    painting3.add(pCanvas3);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.04), new THREE.MeshBasicMaterial({ color: 0x111827 }));
    hair.position.set(0, 0.6, 0.08);
    painting3.add(hair);

    const face = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0xfda4af }));
    face.position.set(0, 0.4, 0.09);
    painting3.add(face);

    const coat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.04), new THREE.MeshBasicMaterial({ color: 0xb91c1c }));
    coat.position.set(0, -0.5, 0.08);
    painting3.add(coat);

    this.scene.add(painting3);

    // 7. Detailed Wooden Door on Front Wall
    const doorGroup = new THREE.Group();
    doorGroup.position.set(4.0, -3.1, 11.9);
    doorGroup.rotation.y = Math.PI;

    // Door Frame
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 5.0, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 }) // dark brown
    );
    doorFrame.position.y = 2.5;
    doorGroup.add(doorFrame);

    // Door Slab
    const doorSlab = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 4.8, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7 }) // medium brown
    );
    doorSlab.position.set(0, 2.4, 0.03);
    doorGroup.add(doorSlab);

    // Brass Door Knob
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.9, roughness: 0.1 })
    );
    knob.position.set(0.7, 2.3, 0.12);
    doorGroup.add(knob);

    this.scene.add(doorGroup);

    // 8. Standing Voxel Bookcase (Back Wall)
    const bookcase = new THREE.Group();
    bookcase.position.set(-5.0, -3.1, -11.5);

    const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });

    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 6.0, 0.1), woodMaterial);
    backPanel.position.set(0, 3.0, 0);
    bookcase.add(backPanel);

    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 6.0, 1.0), woodMaterial);
    leftSide.position.set(-1.45, 3.0, 0.45);
    bookcase.add(leftSide);

    const rightSide = leftSide.clone();
    rightSide.position.x = 1.45;
    bookcase.add(rightSide);

    const shelfGeom = new THREE.BoxGeometry(2.8, 0.1, 0.9);
    for (let h = 0; h <= 4; h++) {
      const shelf = new THREE.Mesh(shelfGeom, woodMaterial);
      shelf.position.set(0, h * 1.5, 0.45);
      bookcase.add(shelf);

      if (h < 4) {
        const bookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xeab308, 0x8b5cf6, 0xec4899];
        const numBooks = 4 + Math.floor(Math.random() * 3);
        for (let b = 0; b < numBooks; b++) {
          const bookHeight = 0.5 + Math.random() * 0.3;
          const bookWidth = 0.15;
          const bookDepth = 0.5 + Math.random() * 0.2;
          const bookMat = new THREE.MeshStandardMaterial({
            color: bookColors[Math.floor(Math.random() * bookColors.length)],
            roughness: 0.7
          });
          const book = new THREE.Mesh(new THREE.BoxGeometry(bookWidth, bookHeight, bookDepth), bookMat);
          const bx = -1.0 + b * 0.45 + (Math.random() * 0.08 - 0.04);
          const by = h * 1.5 + 0.05 + bookHeight / 2;
          const bz = 0.3 + (Math.random() * 0.2);
          book.position.set(bx, by, bz);
          if (Math.random() > 0.7) {
            book.rotation.z = (Math.random() - 0.5) * 0.25;
          }
          bookcase.add(book);
        }
      }
    }

    this.scene.add(bookcase);

    // 9. Indoor Plants on Stands (Two plants: back-right and front-left)
    // Plant 1 (Back-Right Corner)
    const plantGroup = new THREE.Group();
    plantGroup.position.set(9.0, -3.1, -9.0);

    const standMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 })
    );
    standMesh.position.y = 0.6;
    standMesh.castShadow = true;
    standMesh.receiveShadow = true;
    plantGroup.add(standMesh);

    const potMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.4, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 })
    );
    potMesh.position.y = 1.6;
    potMesh.castShadow = true;
    plantGroup.add(potMesh);

    const dirtMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 })
    );
    dirtMesh.position.y = 1.96;
    plantGroup.add(dirtMesh);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    const plantCenterY = 2.0;
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), leafMat);
    stalk.position.set(0, plantCenterY + 0.75, 0);
    plantGroup.add(stalk);

    const leavesData = [
      { size: [0.6, 0.3, 0.6], pos: [0.2, 2.2, 0.2], rot: [0.2, 0.5, 0.2] },
      { size: [0.7, 0.2, 0.7], pos: [-0.3, 2.4, -0.1], rot: [-0.3, -0.4, -0.1] },
      { size: [0.5, 0.3, 0.8], pos: [0.1, 2.6, -0.4], rot: [0.1, 1.2, -0.3] },
      { size: [0.8, 0.25, 0.5], pos: [-0.4, 2.8, 0.3], rot: [-0.2, -1.0, 0.4] },
      { size: [0.6, 0.2, 0.6], pos: [0.3, 3.1, 0.1], rot: [0.3, 0.8, -0.2] },
      { size: [0.4, 0.4, 0.4], pos: [0.0, 3.4, 0.0], rot: [0, 0, 0] }
    ];

    leavesData.forEach(ld => {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(ld.size[0], ld.size[1], ld.size[2]), leafMat);
      leaf.position.set(ld.pos[0], ld.pos[1], ld.pos[2]);
      leaf.rotation.set(ld.rot[0], ld.rot[1], ld.rot[2]);
      leaf.castShadow = true;
      plantGroup.add(leaf);
    });

    this.scene.add(plantGroup);

    // Plant 2 (Front-Left Corner)
    const plantGroup2 = new THREE.Group();
    plantGroup2.position.set(-9.0, -3.1, 9.0);

    const standMesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 })
    );
    standMesh2.position.y = 0.6;
    standMesh2.castShadow = true;
    standMesh2.receiveShadow = true;
    plantGroup2.add(standMesh2);

    const potMesh2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.4, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 })
    );
    potMesh2.position.y = 1.6;
    potMesh2.castShadow = true;
    plantGroup2.add(potMesh2);

    const dirtMesh2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 })
    );
    dirtMesh2.position.y = 1.96;
    plantGroup2.add(dirtMesh2);

    const stalk2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), leafMat);
    stalk2.position.set(0, plantCenterY + 0.75, 0);
    plantGroup2.add(stalk2);

    leavesData.forEach(ld => {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(ld.size[0], ld.size[1], ld.size[2]), leafMat);
      leaf.position.set(ld.pos[0], ld.pos[1], ld.pos[2]);
      leaf.rotation.set(ld.rot[0], ld.rot[1], ld.rot[2]);
      leaf.castShadow = true;
      plantGroup2.add(leaf);
    });

    this.scene.add(plantGroup2);
  }

  private createWallTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      
      // Paint subtle fine stucco noise pattern
      const imgData = ctx.getImageData(0, 0, 128, 128);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const val = 240 + Math.floor(Math.random() * 15);
        data[i] = val;     // R
        data[i+1] = val;   // G
        data[i+2] = val;   // B
      }
      ctx.putImageData(imgData, 0, 0);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 3);
    return texture;
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
      this.phi = Math.max(0.2, Math.min(Math.PI / 1.7, this.phi - dy * 0.005)); // clamp tilt angles to stay above table

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
      this.phi = Math.max(0.2, Math.min(Math.PI / 1.7, this.phi - dy * 0.005));

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
    if (!this.currentState) {
      const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
      const y = this.radius * Math.cos(this.phi);
      const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
      this.camera.position.set(x, y, z);
      this.camera.lookAt(this.targetLookAt);
      return;
    }

    const myAvatar = this.avatarsMap.get(this.activePlayerId);
    if (myAvatar) {
      // Camera is fixed exactly at avatar's head eyes level
      // Tracks the breathing position.y of the avatar group!
      const headY = myAvatar.position.y + 0.98;
      this.camera.position.set(myAvatar.position.x, headY, myAvatar.position.z);

      // Looking direction vector from head outwards
      const lookDir = new THREE.Vector3(
        Math.sin(this.phi) * Math.sin(this.theta),
        Math.cos(this.phi),
        Math.sin(this.phi) * Math.cos(this.theta)
      );

      // Offset camera slightly forward along lookDir to clear the head/face mesh clipping
      this.camera.position.addScaledVector(lookDir, 0.22);

      const lookTarget = this.camera.position.clone().add(lookDir);
      this.camera.lookAt(lookTarget);
    } else {
      const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
      const y = this.radius * Math.cos(this.phi);
      const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
      this.camera.position.set(x, y, z);
      this.camera.lookAt(this.targetLookAt);
    }
  }

  private targetFov: number = 65;

  public toggleZoom() {
    this.targetFov = this.targetFov === 65 ? 35 : 65;
  }

  private isSpectator: boolean = false;

  public updateState(state: EngineState, isSpectator = false, spectatingPlayerId = 'P1') {
    this.currentState = state;
    this.isSpectator = isSpectator;
    this.activePlayerId = spectatingPlayerId; // Ensure activePlayerId matches the POV

    // Camera perspective focus matches the spectated player's seat position
    const targetPId = isSpectator ? spectatingPlayerId : this.activePlayerId;

    // Initialize starting view direction to face the center of the table
    if (!this.hasInitializedAngles && state.players[targetPId]) {
      const playerIds = Object.keys(state.players);
      const numPlayers = playerIds.length;
      const idx = playerIds.indexOf(targetPId);
      if (idx !== -1) {
        const angle = (idx / numPlayers) * Math.PI * 2;
        this.theta = angle + Math.PI; // Face opposite to seat, looking towards (0,0,0)
        this.phi = Math.PI / 2.15;    // Looking slightly downwards towards table center
        this.hasInitializedAngles = true;
        this.updateCameraPosition();
      }
    }

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

        // 2. Head Group (contains head mesh, hair, and face emoji plane so they rotate together)
        const headGroup = new THREE.Group();
        headGroup.name = 'avatar-head-group';
        headGroup.position.set(0, 0.95, 0); // pivot centered at neck
        group.add(headGroup);

        const headGeom = new THREE.BoxGeometry(0.44, 0.44, 0.44);
        const headMat = new THREE.MeshStandardMaterial({ color: skinToneColor, roughness: 0.6 });
        const headMesh = new THREE.Mesh(headGeom, headMat);
        headMesh.position.set(0, 0, 0); // local center
        headMesh.castShadow = true;
        headGroup.add(headMesh);

        // 3. Hair (Blocky haircut, added to headGroup)
        const hairGroup = new THREE.Group();
        const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
        
        // Top hair cap
        const topHair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), hairMat);
        topHair.position.set(0, 0.2, 0);
        hairGroup.add(topHair);

        // Back hair
        const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.35, 0.12), hairMat);
        backHair.position.set(0, 0.03, -0.2);
        hairGroup.add(backHair);

        // Sides hair
        const leftHair = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.46), hairMat);
        leftHair.position.set(-0.2, 0.05, 0.01);
        const rightHair = leftHair.clone();
        rightHair.position.x = 0.2;
        hairGroup.add(leftHair);
        hairGroup.add(rightHair);
        
        headGroup.add(hairGroup);

        // 4. Face text plane displaying player emoji face static on the front of the face!
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Stretched font size to fill the face canvas fully
          ctx.font = '118px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(state.players[pid].emojiFace || '🦊', 64, 64);
        }
        const faceTex = new THREE.CanvasTexture(canvas);
        const facePlaneMat = new THREE.MeshBasicMaterial({
          map: faceTex,
          transparent: true,
          depthWrite: false // avoid z-fighting
        });
        const facePlane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.44, 0.44),
          facePlaneMat
        );
        // Positioned at z = 0.252 relative to headGroup
        facePlane.position.set(0, 0, 0.252);
        headGroup.add(facePlane);

        // 5. Arms
        const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        
        // Left Arm (holding cards mesh, positioned at +0.4)
        const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), armMat);
        leftArm.name = 'left-arm-mesh';
        leftArm.position.set(0.4, 0.45, 0.1);
        leftArm.rotation.x = -0.6; // bent forward to present held cards
        leftArm.rotation.y = -0.3; // angled slightly inwards (negative since on right side +x)
        group.add(leftArm);

        // Held Cards mesh in left hand
        const heldCards = new THREE.Group();
        heldCards.name = 'held-cards';
        heldCards.position.set(0, -0.22, 0.08);
        heldCards.rotation.set(-0.2, -0.3, 0); // reverse Z rotation for left side

        const cardWidth = 0.14;
        const cardHeight = 0.22;
        const cardColors = [0xef4444, 0x10b981, 0x3b82f6]; // Red, Green, Blue
        cardColors.forEach((colorHex, cidx) => {
          const cardMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(cardWidth, cardHeight),
            new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide })
          );
          const fanAngle = (cidx - 1) * 0.25;
          cardMesh.rotation.z = fanAngle;
          cardMesh.position.set(
            (cidx - 1) * 0.04,
            0.02 * Math.cos(fanAngle),
            cidx * 0.005
          );
          heldCards.add(cardMesh);
        });
        leftArm.add(heldCards);

        // Make held cards visible only if the player actually has cards in hand
        const cardCountVal = state.players[pid]?.hand?.length || 0;
        heldCards.visible = cardCountVal > 0;

        // 6. Jointed Right Arm (Upper Arm, Lower Arm, and Sphere Palm, positioned at -0.4)
        const rightArmGroup = new THREE.Group();
        rightArmGroup.name = 'right-arm-group';
        rightArmGroup.position.set(-0.4, 0.6, 0.1); // pivot at shoulder
        group.add(rightArmGroup);

        const upperArm = new THREE.Group();
        upperArm.name = 'right-upper-arm';
        const upperMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.22, 0.12),
          armMat
        );
        upperMesh.position.y = -0.11;
        upperMesh.castShadow = true;
        upperArm.add(upperMesh);
        rightArmGroup.add(upperArm);

        const lowerArm = new THREE.Group();
        lowerArm.name = 'right-lower-arm';
        lowerArm.position.set(0, -0.22, 0); // pivot at elbow
        const lowerMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.22, 0.12),
          armMat
        );
        lowerMesh.position.y = -0.11;
        lowerMesh.castShadow = true;
        lowerArm.add(lowerMesh);
        upperArm.add(lowerArm);

        const palm = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8),
          new THREE.MeshStandardMaterial({ color: skinToneColor, roughness: 0.6 })
        );
        palm.name = 'right-palm';
        palm.position.set(0, -0.22, 0); // end of lower arm
        palm.castShadow = true;
        lowerArm.add(palm);

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

        // Update left hand held cards visibility
        const cardCountVal = state.players[pid]?.hand?.length || 0;
        const leftArm = group.getObjectByName('left-arm-mesh') as THREE.Mesh;
        if (leftArm) {
          const heldCards = leftArm.getObjectByName('held-cards');
          if (heldCards) {
            heldCards.visible = cardCountVal > 0;
          }
        }

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

      // Floating card count label above the discard pile
      const discardCount = state.moduleState.unoDiscardPile?.length || 0;
      if (discardCount > 0) {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 128;
        labelCanvas.height = 64;
        const lctx = labelCanvas.getContext('2d');
        if (lctx) {
          lctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          lctx.beginPath();
          lctx.roundRect(8, 4, 112, 56, 12);
          lctx.fill();
          lctx.font = 'bold 26px sans-serif';
          lctx.textAlign = 'center';
          lctx.textBaseline = 'middle';
          lctx.fillStyle = '#f59e0b'; // Amber yellow
          lctx.fillText(`${discardCount} 🎴`, 64, 30);
        }
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelSpriteMat = new THREE.SpriteMaterial({ map: labelTex });
        const labelSprite = new THREE.Sprite(labelSpriteMat);
        labelSprite.position.set(0.7, 0.65, 0);
        labelSprite.scale.set(0.7, 0.35, 1);
        this.scene.add(labelSprite);
        this.cardsMap.push(labelSprite);
      }
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

    // Dynamic S-curve zoom transition
    const fovDiff = this.targetFov - this.camera.fov;
    if (Math.abs(fovDiff) > 0.01) {
      this.camera.fov += fovDiff * 0.12; // Eased S-curve
      this.camera.updateProjectionMatrix();
    }

    // Simple procedural spins or micro-rotations to bring scene to life
    if (this.currentState) {
      const timer = Date.now() * 0.0005;
      
      // Update camera position to track breathing head
      this.updateCameraPosition();
      
      // Let seated avatars bounce/breathe gently, and animate their right hand moving
      this.avatarsMap.forEach((avatarGroup, pid) => {
        const index = Object.keys(this.currentState!.players).indexOf(pid);
        avatarGroup.position.y = Math.sin(timer * 2 + index) * 0.02;

        // Turn local player's head where camera looks/moves
        const headGroup = avatarGroup.getObjectByName('avatar-head-group') as THREE.Group;
        if (headGroup) {
          if (pid === this.activePlayerId && !this.isSpectator) {
            const playerIds = Object.keys(this.currentState!.players);
            const numPlayers = playerIds.length;
            const idx = playerIds.indexOf(pid);
            const angle = (idx / numPlayers) * Math.PI * 2;

            // Align head rotation.y with theta, and rotation.x with phi
            const targetY = this.theta - angle + Math.PI;
            const targetX = this.phi - Math.PI / 2;

            headGroup.rotation.y = THREE.MathUtils.lerp(headGroup.rotation.y, targetY, 0.15);
            headGroup.rotation.x = THREE.MathUtils.lerp(headGroup.rotation.x, targetX, 0.15);
          } else {
            // Other players: use remote pose if available, else idle
            const remotePose = this.remotePoses.get(pid);
            if (remotePose) {
              const playerIds = Object.keys(this.currentState!.players);
              const numPlayers = playerIds.length;
              const idx = playerIds.indexOf(pid);
              const angle = (idx / numPlayers) * Math.PI * 2;

              const targetY = remotePose.theta - angle + Math.PI;
              const targetX = remotePose.phi - Math.PI / 2;

              headGroup.rotation.y = THREE.MathUtils.lerp(headGroup.rotation.y, targetY, 0.12);
              headGroup.rotation.x = THREE.MathUtils.lerp(headGroup.rotation.x, targetX, 0.12);
            } else {
              headGroup.rotation.set(0, 0, 0);
            }
          }
        }

        // Animate jointed right arm (pointing to cursor for self, remote pose for others)
        const upper = avatarGroup.getObjectByName('right-upper-arm') as THREE.Group;
        const lower = avatarGroup.getObjectByName('right-lower-arm') as THREE.Group;
        if (upper && lower) {
          if (pid === this.activePlayerId && !this.isSpectator) {
            // Player's own avatar points towards the cursor! (increased multipliers for extra responsiveness)
            const targetXRot = -0.4 - this.mouseY * 1.5; // vertical tilt
            const targetYRot = -this.mouseX * 1.6;       // horizontal swing
            
            upper.rotation.x = THREE.MathUtils.lerp(upper.rotation.x, targetXRot, 0.15);
            upper.rotation.y = THREE.MathUtils.lerp(upper.rotation.y, targetYRot, 0.15);
            upper.rotation.z = THREE.MathUtils.lerp(upper.rotation.z, 0, 0.15); // reset side angle

            // 2nd joint (elbow) bends dynamically depending on target vertical & horizontal depth
            const targetLowerX = -0.5 + this.mouseY * 0.8 - Math.abs(this.mouseX) * 0.5;
            lower.rotation.x = THREE.MathUtils.lerp(lower.rotation.x, targetLowerX, 0.15);
          } else {
            // Other players: use remote pose if available, else procedural breathing
            const remotePose = this.remotePoses.get(pid);
            if (remotePose) {
              const rTargetXRot = -0.4 - remotePose.mouseY * 1.5;
              const rTargetYRot = -remotePose.mouseX * 1.6;

              upper.rotation.x = THREE.MathUtils.lerp(upper.rotation.x, rTargetXRot, 0.12);
              upper.rotation.y = THREE.MathUtils.lerp(upper.rotation.y, rTargetYRot, 0.12);
              upper.rotation.z = THREE.MathUtils.lerp(upper.rotation.z, 0, 0.12);

              // 2nd joint for remote player
              const rTargetLowerX = -0.5 + remotePose.mouseY * 0.8 - Math.abs(remotePose.mouseX) * 0.5;
              lower.rotation.x = THREE.MathUtils.lerp(lower.rotation.x, rTargetLowerX, 0.12);
            } else {
              upper.rotation.x = -0.4 + Math.sin(timer * 4 + index) * 0.15;
              upper.rotation.y = 0;
              upper.rotation.z = -0.15 - Math.cos(timer * 3 + index) * 0.08;
              lower.rotation.x = -0.3 + Math.sin(timer * 6 + index) * 0.2;
            }
          }
        }
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
