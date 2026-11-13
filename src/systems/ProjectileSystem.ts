import { GAME_CONFIG } from '../config/gameConfig';
import { AmmoDefinition, AmmoSpecialBehavior } from '../ammo/ammoCatalogue';
import Matter from 'matter-js';

export interface ProjectileState {
  body: Matter.Body;
  graphics: Phaser.GameObjects.Graphics;
  trailGraphics: Phaser.GameObjects.Graphics;
  ammo: AmmoDefinition;
  behavior: AmmoSpecialBehavior;
  state: 'flying' | 'impact' | 'penetrating' | 'exploding' | 'finished' | 'sabot_discarded' | 'split' | 'drilling' | 'jet' | 'spalling' | 'bursting';
  penetrationRemaining: number;
  fuseTimer: number;
  drillPushesRemaining: number;
  lastDrillTime: number;
  splitProjectiles: ProjectileState[];
  jetDirection: number;
  hasBurst: boolean;
  impactPosition: { x: number; y: number } | null;
  impactNormal: { x: number; y: number } | null;
  hitBodies: Set<Matter.Body>;
  damageDealt: number;
  debrisCreated: boolean;
}

export class ProjectileSystem {
  private scene: Phaser.Scene;
  private matter: any;
  private effectsSystem: any;
  private audioSystem: any;
  private structureSystem: any;
  private activeProjectiles: ProjectileState[] = [];
  private projectilePool: ProjectileState[] = [];

  constructor(
    scene: Phaser.Scene,
    matter: any,
    effectsSystem: any,
    audioSystem: any,
    structureSystem: any
  ) {
    this.scene = scene;
    this.matter = matter;
    this.effectsSystem = effectsSystem;
    this.audioSystem = audioSystem;
    this.structureSystem = structureSystem;
  }

  fire(
    x: number,
    y: number,
    angle: number,
    power: number,
    mode: 'arc' | 'straight',
    ammo: AmmoDefinition
  ): ProjectileState {
    const speed = Phaser.Math.Clamp(power * 2, GAME_CONFIG.MIN_PROJECTILE_SPEED, GAME_CONFIG.MAX_PROJECTILE_SPEED);
    const rad = Phaser.Math.DegToRad(angle);
    
    let vx = Math.cos(rad) * speed;
    let vy = Math.sin(rad) * speed;
    
    if (mode === 'straight') {
      vy *= 0.3;
    }

    let projectile: ProjectileState;
    if (this.projectilePool.length > 0) {
      projectile = this.projectilePool.pop()!;
      this.resetProjectile(projectile, x, y, vx, vy, ammo);
    } else {
      projectile = this.createProjectile(x, y, vx, vy, ammo);
    }

    this.activeProjectiles.push(projectile);
    return projectile;
  }

  private createProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    ammo: AmmoDefinition
  ): ProjectileState {
    const radius = ammo.stats.collisionRadius;
    
    const body = this.matter.add.circle(x, y, radius, {
      label: `projectile_${ammo.id}`,
      density: ammo.stats.mass / (Math.PI * radius * radius),
      friction: 0,
      restitution: 0.1,
      collisionFilter: { group: -2 },
      isSensor: false,
    });
    
    body.isStatic = false;
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    (body as any).isProjectile = true;
    (body as any).ammoId = ammo.id;

    const graphics = this.scene.add.graphics();
    graphics.setDepth(GAME_CONFIG.Z.PROJECTILE);
    
    const trailGraphics = this.scene.add.graphics();
    trailGraphics.setDepth(GAME_CONFIG.Z.PROJECTILE - 1);

    const projectile: ProjectileState = {
      body,
      graphics,
      trailGraphics,
      ammo,
      behavior: ammo.behavior,
      state: 'flying',
      penetrationRemaining: ammo.stats.penetration,
      fuseTimer: ammo.stats.fuseDelay,
      drillPushesRemaining: 0,
      lastDrillTime: 0,
      splitProjectiles: [],
      jetDirection: 0,
      hasBurst: false,
      impactPosition: null,
      impactNormal: null,
      hitBodies: new Set(),
      damageDealt: 0,
      debrisCreated: false,
    };

    this.drawProjectile(projectile);
    return projectile;
  }

  private resetProjectile(
    projectile: ProjectileState,
    x: number,
    y: number,
    vx: number,
    vy: number,
    ammo: AmmoDefinition
  ): void {
    Matter.Body.setPosition(projectile.body, { x, y });
    Matter.Body.setVelocity(projectile.body, { x: vx, y: vy });
    Matter.Body.setAngle(projectile.body, 0);
    Matter.Body.setAngularVelocity(projectile.body, 0);
    projectile.body.isSensor = false;
    (projectile.body as any).isProjectile = true;
    (projectile.body as any).ammoId = ammo.id;
    
    projectile.ammo = ammo;
    projectile.behavior = ammo.behavior;
    projectile.state = 'flying';
    projectile.penetrationRemaining = ammo.stats.penetration;
    projectile.fuseTimer = ammo.stats.fuseDelay;
    projectile.drillPushesRemaining = 0;
    projectile.lastDrillTime = 0;
    projectile.splitProjectiles = [];
    projectile.jetDirection = 0;
    projectile.hasBurst = false;
    projectile.impactPosition = null;
    projectile.impactNormal = null;
    projectile.hitBodies.clear();
    projectile.damageDealt = 0;
    projectile.debrisCreated = false;
    
    projectile.graphics.clear();
    projectile.trailGraphics.clear();
    projectile.graphics.setVisible(true);
    projectile.trailGraphics.setVisible(true);
    
    this.drawProjectile(projectile);
  }

  private drawProjectile(projectile: ProjectileState): void {
    const { graphics, ammo } = projectile;
    graphics.clear();
    
    const x = 0;
    const y = 0;
    const length = 20;
    const width = 8;
    
    // Draw based on category
    const categoryColors: Record<string, { body: number; nose: number; accent: number }> = {
      solid: { body: 0x667788, nose: 0x99aabb, accent: 0x445566 },
      heat: { body: 0x445566, nose: 0xff6600, accent: 0xff8800 },
      hesh: { body: 0x4a5a3a, nose: 0xffd700, accent: 0x888844 },
      he: { body: 0x5a3a3a, nose: 0xff3344, accent: 0xff6666 },
      aphe: { body: 0x445566, nose: 0xffdd00, accent: 0xffee88 },
    };
    
    const colors = categoryColors[ammo.category] || categoryColors.solid;
    
    // Body
    graphics.fillStyle(colors.body, 1);
    graphics.fillRoundedRect(-length/2, -width/2, length * 0.7, width, 2);
    
    // Nose
    graphics.fillStyle(colors.nose, 1);
    graphics.fillTriangle(
      length * 0.2, -width/2,
      length * 0.2, width/2,
      length/2, 0
    );
    
    // Accent band
    graphics.fillStyle(colors.accent, 1);
    graphics.fillRect(-length/2 + 5, -width/2 + 1, 4, width - 2);
    
    // Special features based on ammo type
    this.drawSpecialFeatures(graphics, ammo, length, width);
  }

  private drawSpecialFeatures(
    graphics: Phaser.GameObjects.Graphics,
    ammo: AmmoDefinition,
    length: number,
    width: number
  ): void {
    switch (ammo.id) {
      case 'apds_sabot':
      case 'sabot_heat':
        // Carrier separation line
        graphics.lineStyle(1, 0xffffff, 0.5);
        graphics.beginPath();
        graphics.moveTo(-length/2 + 8, -width/2);
        graphics.lineTo(-length/2 + 8, width/2);
        graphics.strokePath();
        break;
      case 'finned_dart':
      case 'needle_jet':
        // Fins
        graphics.fillStyle(0x888888, 1);
        graphics.fillTriangle(-length/2, -width/2, -length/2 - 5, -width, -length/2 + 3, -width/2);
        graphics.fillTriangle(-length/2, width/2, -length/2 - 5, width, -length/2 + 3, width/2);
        break;
      case 'petal':
        // Petal indicators
        graphics.fillStyle(0xcd7f32, 1);
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2;
          graphics.fillTriangle(
            length * 0.1, 0,
            length * 0.1 + Math.cos(angle) * 6, Math.sin(angle) * 6,
            length * 0.1 + Math.cos(angle + Math.PI/4) * 4, Math.sin(angle + Math.PI/4) * 4
          );
        }
        break;
      case 'wedge':
        // Wedge shape
        graphics.fillStyle(0x99aabb, 1);
        graphics.fillTriangle(length * 0.1, -width/2, length/2, -width/2, length * 0.1, width/2);
        break;
      case 'heat_round':
      case 'double_jet':
      case 'wide_jet':
        // HEAT nose cone
        graphics.fillStyle(0xff6600, 1);
        graphics.fillTriangle(length * 0.1, -width/2, length * 0.1, width/2, length/2, 0);
        break;
      case 'drillhead':
        // Drill ridges
        graphics.lineStyle(2, 0xcccccc, 1);
        for (let i = 0; i < 4; i++) {
          const y = -width/2 + i * width/4;
          graphics.beginPath();
          graphics.moveTo(length * 0.15, y);
          graphics.lineTo(length * 0.35, y);
          graphics.strokePath();
        }
        break;
      case 'anvil':
        // Blocky shape
        graphics.clear();
        graphics.fillStyle(0x444444, 1);
        graphics.fillRect(-length/2, -width/2, length, width);
        graphics.lineStyle(2, 0x666666, 1);
        graphics.strokeRect(-length/2, -width/2, length, width);
        break;
    }
  }

  update(delta: number): void {
    const dt = delta / 1000;

    // Update main projectiles
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      this.updateProjectile(proj, dt);
      
      if (proj.state === 'finished') {
        this.recycleProjectile(proj);
        this.activeProjectiles.splice(i, 1);
      }
    }

    // Update split projectiles
    for (const proj of this.activeProjectiles) {
      for (let j = proj.splitProjectiles.length - 1; j >= 0; j--) {
        const split = proj.splitProjectiles[j];
        this.updateProjectile(split, dt);
        if (split.state === 'finished') {
          this.recycleProjectile(split);
          proj.splitProjectiles.splice(j, 1);
        }
      }
    }
  }

  private updateProjectile(proj: ProjectileState, dt: number): void {
    const { body, ammo, behavior, state } = proj;

    if (state === 'finished') return;

    // Apply drag
    const vel = Matter.Body.getVelocity(body);
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (speed > 0) {
      const dragForce = GAME_CONFIG.DRAG_COEFFICIENT * speed * speed * dt;
      Matter.Body.setVelocity(body, {
        x: vel.x - (vel.x / speed) * dragForce,
        y: vel.y - (vel.y / speed) * dragForce,
      });
    }

    // Apply gravity based on mode
    if (state === 'flying' || state === 'penetrating' || state === 'drilling') {
      const gravity = GAME_CONFIG.GRAVITY * dt;
      Matter.Body.setVelocity(body, { x: vel.x, y: vel.y + gravity });
    }

    // Update fuse timer
    if (proj.fuseTimer > 0) {
      proj.fuseTimer -= dt;
      if (proj.fuseTimer <= 0) {
        this.triggerBurst(proj);
      }
    }

    // State-specific behavior
    switch (state) {
      case 'flying':
        this.updateFlying(proj, dt);
        break;
      case 'penetrating':
        this.updatePenetrating(proj, dt);
        break;
      case 'drilling':
        this.updateDrilling(proj, dt);
        break;
      case 'jet':
        this.updateJet(proj, dt);
        break;
      case 'spalling':
        this.updateSpalling(proj, dt);
        break;
      case 'bursting':
        this.updateBursting(proj, dt);
        break;
      case 'sabot_discarded':
        this.updateSabotDiscarded(proj, dt);
        break;
      case 'split':
        this.updateSplit(proj, dt);
        break;
    }

    // Update graphics position
    this.updateGraphics(proj);
    
    // Check bounds
    if (body.position.x < -100 || body.position.x > this.scene.scale.width + 100 ||
        body.position.y > this.scene.scale.height + 200) {
      proj.state = 'finished';
    }
  }

  private updateFlying(proj: ProjectileState, dt: number): void {
    const { body, behavior } = proj;

    // Check for sabot discard
    if (behavior.type === 'sabot' || behavior.type === 'sabot_heat') {
      if (!proj.hitBodies.has(body) && proj.state === 'flying') {
        const timeSinceFire = this.scene.time.now / 1000 - (body as any).fireTime;
        if (timeSinceFire > (behavior.params.discardTime || 0.1)) {
          this.discardSabot(proj);
        }
      }
    }

    // Check for splitter pre-impact
    if (behavior.type === 'splitter' && proj.fuseTimer <= 0 && proj.state === 'flying') {
      this.splitProjectile(proj);
    }

    // Check for popcorn burst
    if (behavior.type === 'popcorn' && proj.fuseTimer <= 0 && proj.state === 'flying') {
      this.popcornBurst(proj);
    }

    // Check for crownburst pre-contact
    if (behavior.type === 'crownburst' && !proj.hasBurst) {
      // Check distance to nearest structure
      const nearest = this.findNearestStructure(body.position.x, body.position.y);
      if (nearest && nearest.distance < (behavior.params.burstDistance || 20)) {
        this.triggerBurst(proj);
      }
    }

    // Check for roofbreaker air burst
    if (behavior.type === 'roofbreaker' && proj.fuseTimer <= 0 && proj.state === 'flying') {
      this.triggerBurst(proj);
    }

    // Check for rainmaker air burst
    if (behavior.type === 'rainmaker' && proj.fuseTimer <= 0 && proj.state === 'flying') {
      this.triggerBurst(proj);
    }
  }

  private updatePenetrating(proj: ProjectileState, dt: number): void {
    // Continue moving with reduced penetration
    proj.penetrationRemaining -= dt * 1000;
    if (proj.penetrationRemaining <= 0) {
      proj.state = 'finished';
    }
  }

  private updateDrilling(proj: ProjectileState, dt: number): void {
    const now = this.scene.time.now;
    if (now - proj.lastDrillTime > (proj.behavior.params.pushInterval || 150)) {
      if (proj.drillPushesRemaining > 0) {
        this.doDrillPush(proj);
        proj.drillPushesRemaining--;
        proj.lastDrillTime = now;
      } else {
        proj.state = 'finished';
      }
    }
  }

  private updateJet(proj: ProjectileState, dt: number): void {
    // Jet travels instantly, just visual
    proj.state = 'finished';
  }

  private updateSpalling(proj: ProjectileState, dt: number): void {
    // Spall fragments travel
    proj.state = 'finished';
  }

  private updateBursting(proj: ProjectileState, dt: number): void {
    // Explosion visual
    proj.state = 'finished';
  }

  private updateSabotDiscarded(proj: ProjectileState, dt: number): void {
    // Core continues flying
    proj.state = 'flying';
  }

  private updateSplit(proj: ProjectileState, dt: number): void {
    // Split pellets fly independently
    proj.state = 'flying';
  }

  private discardSabot(proj: ProjectileState): void {
    proj.state = 'sabot_discarded';
    
    // Visual effect - carrier falls away
    this.effectsSystem?.emitImpact(
      proj.body.position.x,
      proj.body.position.y,
      'steel',
      0.3
    );
    
    // Reduce mass, increase speed
    const vel = Matter.Body.getVelocity(proj.body);
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y) * 1.2;
    const angle = Math.atan2(vel.y, vel.x);
    Matter.Body.setVelocity(proj.body, {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    });
    
    // Update graphics to show core only
    this.drawProjectileCoreOnly(proj);
  }

  private drawProjectileCoreOnly(proj: ProjectileState): void {
    proj.graphics.clear();
    const colors = { body: 0x99aabb, nose: 0xccddee, accent: 0x8899aa };
    const length = 12;
    const width = 4;
    proj.graphics.fillStyle(colors.body, 1);
    proj.graphics.fillRoundedRect(-length/2, -width/2, length * 0.7, width, 1);
    proj.graphics.fillStyle(colors.nose, 1);
    proj.graphics.fillTriangle(length * 0.1, -width/2, length * 0.1, width/2, length/2, 0);
  }

  private splitProjectile(proj: ProjectileState): void {
    proj.state = 'split';
    const { body, behavior } = proj;
    const vel = Matter.Body.getVelocity(body);
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    const baseAngle = Math.atan2(vel.y, vel.x);
    const spread = behavior.params.spreadAngle || 40;
    const count = behavior.params.pelletCount || 4;

    for (let i = 0; i < count; i++) {
      const angle = baseAngle + Phaser.Math.DegToRad(
        -spread/2 + (i / (count - 1)) * spread
      );
      
      const splitBody = this.matter.add.circle(
        body.position.x,
        body.position.y,
        3,
        {
          label: `split_${proj.ammo.id}_${i}`,
          density: 0.5,
          friction: 0,
          restitution: 0.1,
          collisionFilter: { group: -2 },
        }
      );
      
      const splitSpeed = speed * 0.8;
      Matter.Body.setVelocity(splitBody, {
        x: Math.cos(angle) * splitSpeed,
        y: Math.sin(angle) * splitSpeed,
      });
      (splitBody as any).isProjectile = true;
      (splitBody as any).isSplit = true;

      const splitGraphics = this.scene.add.graphics();
      splitGraphics.setDepth(GAME_CONFIG.Z.PROJECTILE);
      splitGraphics.fillStyle(0xcd7f32, 1);
      splitGraphics.fillCircle(0, 0, 3);

      const splitTrail = this.scene.add.graphics();
      splitTrail.setDepth(GAME_CONFIG.Z.PROJECTILE - 1);

      proj.splitProjectiles.push({
        body: splitBody,
        graphics: splitGraphics,
        trailGraphics: splitTrail,
        ammo: proj.ammo,
        behavior: { type: 'none', params: {} },
        state: 'flying',
        penetrationRemaining: proj.ammo.stats.penetration * 0.3,
        fuseTimer: 0,
        drillPushesRemaining: 0,
        lastDrillTime: 0,
        splitProjectiles: [],
        jetDirection: 0,
        hasBurst: false,
        impactPosition: null,
        impactNormal: null,
        hitBodies: new Set(),
        damageDealt: 0,
        debrisCreated: false,
      });
    }
  }

  private popcornBurst(proj: ProjectileState): void {
    const { body, behavior } = proj;
    const count = behavior.params.podCount || 4;
    const scatter = behavior.params.scatterRadius || 80;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = Phaser.Math.Between(10, scatter);
      const px = body.position.x + Math.cos(angle) * distance;
      const py = body.position.y + Math.sin(angle) * distance;

      const podBody = this.matter.add.circle(px, py, 4, {
        label: `popcorn_${proj.ammo.id}_${i}`,
        density: 0.8,
        friction: 0.5,
        restitution: 0.2,
        collisionFilter: { group: -2 },
        isStatic: true,
      });
      (podBody as any).isProjectile = true;
      (podBody as any).isPod = true;
      (podBody as any).popTime = this.scene.time.now + (behavior.params.sequentialDelay || 150) * i;

      const podGraphics = this.scene.add.graphics();
      podGraphics.setDepth(GAME_CONFIG.Z.PROJECTILE);
      podGraphics.fillStyle(0xff8800, 1);
      podGraphics.fillCircle(0, 0, 4);

      proj.splitProjectiles.push({
        body: podBody,
        graphics: podGraphics,
        trailGraphics: this.scene.add.graphics(),
        ammo: proj.ammo,
        behavior: { type: 'none', params: {} },
        state: 'flying',
        penetrationRemaining: 0,
        fuseTimer: 0,
        drillPushesRemaining: 0,
        lastDrillTime: 0,
        splitProjectiles: [],
        jetDirection: 0,
        hasBurst: false,
        impactPosition: null,
        impactNormal: null,
        hitBodies: new Set(),
        damageDealt: 0,
        debrisCreated: false,
      });
    }

    proj.state = 'bursting';
  }

  private findNearestStructure(x: number, y: number): { body: Matter.Body; distance: number } | null {
    const bodies = this.matter.world.bodies;
    let nearest: { body: Matter.Body; distance: number } | null = null;
    let minDist = Infinity;

    for (const body of bodies) {
      if (body.isStatic && body.label?.startsWith('structure_')) {
        const dist = Phaser.Math.Distance.Between(x, y, body.position.x, body.position.y);
        if (dist < minDist) {
          minDist = dist;
          nearest = { body, distance: dist };
        }
      }
    }

    return nearest;
  }

  private triggerBurst(proj: ProjectileState): void {
    proj.hasBurst = true;
    proj.state = 'bursting';
    
    const { body, ammo, behavior } = proj;
    const x = body.position.x;
    const y = body.position.y;

    // Explosion flash
    this.effectsSystem?.emitImpact(x, y, 'steel', 1);
    this.effectsSystem?.screenShake(1);
    this.audioSystem?.playExplosion(
      ammo.stats.blastRadius > 100 ? 'large' : 
      ammo.stats.blastRadius > 50 ? 'medium' : 'small'
    );

    // Apply blast damage
    this.applyBlastDamage(x, y, ammo, behavior);

    // Special burst behaviors
    switch (behavior.type) {
      case 'heat_jet':
      case 'double_jet':
      case 'wide_jet':
      case 'needle_jet':
        this.createJet(proj, behavior);
        break;
      case 'crossfire':
        this.createCrossfire(proj, behavior);
        break;
      case 'double_strike':
        this.createDoubleStrike(proj, behavior);
        break;
      case 'cornerjet':
        this.createCornerJet(proj, behavior);
        break;
      case 'forkjet':
        this.createForkJet(proj, behavior);
        break;
      case 'roofbreaker':
        this.createRoofbreakerJet(proj, behavior);
        break;
      case 'hesh_spall':
      case 'broadhead':
      case 'scab_lifter':
      case 'ribbon_hesh':
      case 'echo_hesh':
        this.createSpall(proj, behavior);
        break;
      case 'shock':
        this.createShock(proj, behavior);
        break;
      case 'quake':
        this.createQuake(proj, behavior);
        break;
      case 'fragmentation':
        this.createFragments(proj, behavior);
        break;
      case 'thermal':
        this.createThermalPatch(proj, behavior);
        break;
      case 'rainmaker':
        this.createRainmaker(proj, behavior);
        break;
      case 'crownburst':
        this.createCrownburst(proj, behavior);
        break;
      case 'meltdown':
        this.createMeltdownPatch(proj, behavior);
        break;
      case 'aphe_hybrid':
      case 'capped_aphe':
      case 'bunkerbreaker':
      case 'emberpiercer':
      case 'sideburst':
      case 'latchburst':
      case 'chain_blast':
        this.createAPHEBurst(proj, behavior);
        break;
      case 'switchfuse':
      case 'adaptive_shell':
        // Handled by player selection
        this.createAPHEBurst(proj, behavior);
        break;
      case 'foundation_breaker':
        this.createFoundationBreaker(proj, behavior);
        break;
      case 'pressure_hammer':
        this.createPressureHammer(proj, behavior);
        break;
    }

    proj.state = 'finished';
  }

  private applyBlastDamage(
    x: number,
    y: number,
    ammo: AmmoDefinition,
    behavior: AmmoSpecialBehavior
  ): void {
    const radius = behavior.params.blastRadius || ammo.stats.blastRadius;
    const damage = behavior.params.blastDamage || ammo.stats.blastDamage;
    const impulse = ammo.stats.impulse;

    const bodies = Matter.Query.region(
      this.matter.world.bodies,
      Matter.Bounds.create(
        this.matter.world.bodies.map(b => b.bounds),
        { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
      )
    );

    for (const body of bodies) {
      if (body.isStatic && body.label?.startsWith('structure_')) {
        const dist = Phaser.Math.Distance.Between(x, y, body.position.x, body.position.y);
        if (dist <= radius) {
          const falloff = 1 - dist / radius;
          const actualDamage = damage * falloff;
          const actualImpulse = impulse * falloff;

          this.structureSystem?.applyDamage(
            body,
            actualDamage,
            x, y,
            ammo.id,
            ammo.stats.materialModifiers
          );

          // Apply impulse
          if (!body.isStatic) {
            const angle = Math.atan2(body.position.y - y, body.position.x - x);
            Matter.Body.applyForce(body, body.position, {
              x: Math.cos(angle) * actualImpulse * 0.001,
              y: Math.sin(angle) * actualImpulse * 0.001,
            });
          }
        }
      }
    }
  }

  private createJet(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const angle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    const length = behavior.params.jetLength || 200;
    const width = behavior.params.jetWidth || 8;
    const damage = behavior.params.jetDamage || 120;

    proj.state = 'jet';
    
    // Visual jet
    this.effectsSystem?.emitJet(x, y, Phaser.Math.RadToDeg(angle), length, 0xff6600);

    // Damage along jet path
    const steps = Math.ceil(length / 10);
    for (let i = 0; i <= steps; i++) {
      const px = x + Math.cos(angle) * (i / steps) * length;
      const py = y + Math.sin(angle) * (i / steps) * length;
      
      const hitBodies = Matter.Query.point(this.matter.world.bodies, { x: px, y: py });
      for (const hitBody of hitBodies) {
        if (hitBody.isStatic && hitBody.label?.startsWith('structure_')) {
          this.structureSystem?.applyDamage(
            hitBody,
            damage / steps,
            px, py,
            proj.ammo.id,
            proj.ammo.stats.materialModifiers
          );
        }
      }
    }

    this.audioSystem?.playJet();
  }

  private createCrossfire(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    this.createJet(proj, { ...behavior, params: { ...behavior.params, jetLength: behavior.params.jetLength || 160, jetWidth: 8 } });
    
    // Additional blast
    const { body } = proj;
    this.applyBlastDamage(body.position.x, body.position.y, proj.ammo, {
      type: 'he_blast',
      params: { blastRadius: behavior.params.blastRadius || 80, blastDamage: behavior.params.blastDamage || 50 }
    });
  }

  private createDoubleStrike(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const angle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    
    // First jet
    this.createJet(proj, {
      ...behavior,
      params: { ...behavior.params, jetLength: 160, jetWidth: 8, jetDamage: behavior.params.firstJetDamage || 60 }
    });

    // Second jet after delay
    this.scene.time.delayedCall(behavior.params.delay || 50, () => {
      this.createJet(proj, {
        ...behavior,
        params: { ...behavior.params, jetLength: 180, jetWidth: 8, jetDamage: behavior.params.secondJetDamage || 130 }
      });
    });
  }

  private createCornerJet(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const baseAngle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    const jetAngle = baseAngle + Phaser.Math.DegToRad(proj.jetDirection || 0);
    
    this.createJet(proj, {
      ...behavior,
      params: { ...behavior.params, jetLength: 180, jetWidth: 8 }
    });
  }

  private createForkJet(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const baseAngle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    const spread = Phaser.Math.DegToRad(behavior.params.spreadAngle || 30);
    
    for (let i = 0; i < (behavior.params.jetCount || 2); i++) {
      const angle = baseAngle - spread/2 + (i / Math.max(1, (behavior.params.jetCount || 2) - 1)) * spread;
      this.createJet(proj, {
        ...behavior,
        params: { ...behavior.params, jetLength: 160, jetWidth: 7 }
      });
    }
  }

  private createRoofbreakerJet(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    // Jet goes downward
    const angle = -Math.PI / 2;
    
    this.createJet(proj, {
      ...behavior,
      params: { ...behavior.params, jetLength: 200, jetWidth: 10 }
    });
  }

  private createSpall(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    
    // Spall goes backward from impact face
    const impactAngle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    const spallAngle = impactAngle + Math.PI;
    
    proj.state = 'spalling';
    
    const count = behavior.params.fragmentCount || 8;
    const radius = behavior.params.spallRadius || 80;
    const damage = behavior.params.spallDamage || 100;
    
    this.effectsSystem?.emitSpall(x, y, Phaser.Math.RadToDeg(spallAngle), count);
    this.audioSystem?.playSpall();

    // Damage behind the impact face
    for (let i = 0; i < count; i++) {
      const angle = spallAngle + Phaser.Math.FloatBetween(-Math.PI/4, Math.PI/4);
      const dist = Phaser.Math.Between(10, radius);
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;

      const hitBodies = Matter.Query.point(this.matter.world.bodies, { x: px, y: py });
      for (const hitBody of hitBodies) {
        if (hitBody.isStatic && hitBody.label?.startsWith('structure_')) {
          let mult = 1;
          if (behavior.type === 'scab_lifter' && (hitBody as any).damageState >= 1) {
            mult = behavior.params.damagedArmorBonus || 1.5;
          }
          this.structureSystem?.applyDamage(
            hitBody,
            (damage / count) * mult,
            px, py,
            proj.ammo.id,
            proj.ammo.stats.materialModifiers
          );
        }
      }
    }
  }

  private createShock(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    
    proj.state = 'bursting';
    
    // Concentrated blast with high impulse
    this.applyBlastDamage(x, y, proj.ammo, {
      ...behavior,
      params: { ...behavior.params, blastRadius: 50, blastDamage: 85 }
    });
    
    // Extra impulse to loose pieces
    const radius = 80;
    const bodies = Matter.Query.region(this.matter.world.bodies, 
      Matter.Bounds.create(this.matter.world.bodies.map(b => b.bounds), 
        { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
      )
    );
    
    for (const b of bodies) {
      if (!b.isStatic && b.label?.startsWith('structure_')) {
        const angle = Math.atan2(b.position.y - y, b.position.x - x);
        const force = behavior.params.bendForce || 300;
        Matter.Body.applyForce(b, b.position, {
          x: Math.cos(angle) * force * 0.001,
          y: Math.sin(angle) * force * 0.001,
        });
      }
    }
  }

  private createQuake(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    
    proj.state = 'bursting';
    
    // Shock ring
    this.effectsSystem?.emitShockRing(x, y, behavior.params.ringRadius || 150);
    this.effectsSystem?.screenShake(2);
    
    // Damage in ring
    const radius = behavior.params.ringRadius || 150;
    this.applyBlastDamage(x, y, proj.ammo, {
      ...behavior,
      params: { ...behavior.params, blastRadius: radius, blastDamage: 70 }
    });
    
    // Shake supports
    const bodies = Matter.Query.region(this.matter.world.bodies,
      Matter.Bounds.create(this.matter.world.bodies.map(b => b.bounds),
        { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
      )
    );
    
    for (const b of bodies) {
      if (b.isStatic && b.label?.startsWith('structure_')) {
        const block = this.structureSystem?.blocks?.get(b);
        if (block?.isSupport) {
          this.structureSystem?.makeBlockFall(block);
        }
      }
    }
  }

  private createFragments(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const count = behavior.params.fragmentCount || 24;
    const speed = behavior.params.fragmentSpeed || 400;
    
    proj.state = 'bursting';
    
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const fragBody = this.matter.add.circle(x, y, 2, {
        label: `frag_${proj.ammo.id}_${i}`,
        density: 0.3,
        friction: 0,
        restitution: 0.3,
        collisionFilter: { group: -2 },
      });
      
      Matter.Body.setVelocity(fragBody, {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      });
      (fragBody as any).isProjectile = true;
      (fragBody as any).isFragment = true;

      const fragGraphics = this.scene.add.graphics();
      fragGraphics.setDepth(GAME_CONFIG.Z.PROJECTILE);
      fragGraphics.fillStyle(0xaa8844, 1);
      fragGraphics.fillTriangle(0, -4, 3, 2, -3, 2);

      proj.splitProjectiles.push({
        body: fragBody,
        graphics: fragGraphics,
        trailGraphics: this.scene.add.graphics(),
        ammo: proj.ammo,
        behavior: { type: 'none', params: {} },
        state: 'flying',
        penetrationRemaining: 10,
        fuseTimer: 0,
        drillPushesRemaining: 0,
        lastDrillTime: 0,
        splitProjectiles: [],
        jetDirection: 0,
        hasBurst: false,
        impactPosition: null,
        impactNormal: null,
        hitBodies: new Set(),
        damageDealt: 0,
        debrisCreated: false,
      });
    }
  }

  private createThermalPatch(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    
    proj.state = 'bursting';
    
    // Visual glow
    this.effectsSystem?.emitThermalGlow(x, y, 50);
    
    // Mark area for bonus damage
    // This would be implemented as a zone that increases damage for subsequent hits
  }

  private createRainmaker(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const count = behavior.params.streamCount || 5;
    const angle = behavior.params.streamAngle || -30;
    const length = behavior.params.streamLength || 150;
    
    proj.state = 'bursting';
    
    for (let i = 0; i < count; i++) {
      const spreadAngle = angle + Phaser.Math.DegToRad(Phaser.Math.FloatBetween(-15, 15));
      this.effectsSystem?.emitJet(x, y, Phaser.Math.RadToDeg(spreadAngle), length, 0xff6600);
      
      // Damage along stream
      const steps = Math.ceil(length / 10);
      for (let j = 0; j <= steps; j++) {
        const px = x + Math.cos(spreadAngle) * (j / steps) * length;
        const py = y + Math.sin(spreadAngle) * (j / steps) * length;
        
        const hitBodies = Matter.Query.point(this.matter.world.bodies, { x: px, y: py });
        for (const hitBody of hitBodies) {
          if (hitBody.isStatic && hitBody.label?.startsWith('structure_')) {
            this.structureSystem?.applyDamage(
              hitBody,
              30 / steps,
              px, py,
              proj.ammo.id,
              proj.ammo.stats.materialModifiers
            );
          }
        }
      }
    }
  }

  private createCrownburst(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const impactAngle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    
    proj.state = 'bursting';
    
    // Directed fragments into target
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = impactAngle + Math.PI + Phaser.Math.FloatBetween(-Math.PI/3, Math.PI/3);
      const fragBody = this.matter.add.circle(x, y, 3, {
        label: `crown_${proj.ammo.id}_${i}`,
        density: 0.5,
        friction: 0,
        restitution: 0.2,
        collisionFilter: { group: -2 },
      });
      
      Matter.Body.setVelocity(fragBody, {
        x: Math.cos(angle) * 300,
        y: Math.sin(angle) * 300,
      });
      (fragBody as any).isProjectile = true;

      const fragGraphics = this.scene.add.graphics();
      fragGraphics.setDepth(GAME_CONFIG.Z.PROJECTILE);
      fragGraphics.fillStyle(0xff8800, 1);
      fragGraphics.fillCircle(0, 0, 3);
    }
  }

  private createMeltdownPatch(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const radius = behavior.params.patchRadius || 30;
    const duration = behavior.params.hotPatchDuration || 2000;
    const damage = behavior.params.steelMeltDamage || 50;
    
    proj.state = 'bursting';
    
    // Visual
    this.effectsSystem?.emitThermalGlow(x, y, radius);
    
    // Create damage zone
    const zone = this.scene.add.zone(x, y, radius * 2, radius * 2);
    zone.setData('meltdown', { damage, radius, endTime: this.scene.time.now + duration });
    
    // Immediate damage
    const hitBodies = Matter.Query.region(this.matter.world.bodies,
      Matter.Bounds.create(this.matter.world.bodies.map(b => b.bounds),
        { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
      )
    );
    
    for (const hitBody of hitBodies) {
      if (hitBody.isStatic && hitBody.label?.startsWith('structure_')) {
        const block = this.structureSystem?.blocks?.get(hitBody);
        if (block && (block.material === 'steel' || block.material === 'armor')) {
          this.structureSystem?.applyDamage(hitBody, damage, x, y, proj.ammo.id, proj.ammo.stats.materialModifiers);
        }
      }
    }
    
    // Persistent damage handled by game scene update
  }

  private createAPHEBurst(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const impactAngle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    
    proj.state = 'bursting';
    
    // Internal burst
    this.applyBlastDamage(x, y, proj.ammo, {
      type: 'he_blast',
      params: { blastRadius: 40, blastDamage: behavior.params.blastDamage || 60 }
    });
    
    // Special behaviors
    if (behavior.type === 'sideburst') {
      // Sideways fragments
      for (let i = 0; i < (behavior.params.sideFragments || 8); i++) {
        const angle = impactAngle + Phaser.Math.DegToRad(90 + Phaser.Math.FloatBetween(-30, 30));
        const fragBody = this.matter.add.circle(x, y, 3, {
          label: `side_${proj.ammo.id}_${i}`,
          density: 0.4,
          friction: 0,
          restitution: 0.2,
          collisionFilter: { group: -2 },
        });
        
        Matter.Body.setVelocity(fragBody, {
          x: Math.cos(angle) * 250,
          y: Math.sin(angle) * 250,
        });
        (fragBody as any).isProjectile = true;
      }
    }
    
    if (behavior.type === 'chain_blast') {
      // Sequential blasts deeper
      for (let i = 0; i < (behavior.params.blastCount || 3); i++) {
        this.scene.time.delayedCall((behavior.params.blastInterval || 80) * i, () => {
          const depth = (behavior.params.stepDepth || 40) * (i + 1);
          const bx = x + Math.cos(impactAngle) * depth;
          const by = y + Math.sin(impactAngle) * depth;
          
          this.applyBlastDamage(bx, by, proj.ammo, {
            type: 'he_blast',
            params: { blastRadius: 30, blastDamage: 40 }
          });
        });
      }
    }
  }

  private createFoundationBreaker(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    
    proj.state = 'bursting';
    
    // Target lower structures
    const radius = 90;
    const bodies = Matter.Query.region(this.matter.world.bodies,
      Matter.Bounds.create(this.matter.world.bodies.map(b => b.bounds),
        { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
      )
    );
    
    for (const b of bodies) {
      if (b.isStatic && b.label?.startsWith('structure_')) {
        const block = this.structureSystem?.blocks?.get(b);
        if (block && block.isSupport) {
          this.structureSystem?.applyDamage(b, 120, x, y, proj.ammo.id, proj.ammo.stats.materialModifiers);
        }
      }
    }
  }

  private createPressureHammer(proj: ProjectileState, behavior: AmmoSpecialBehavior): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    
    proj.state = 'bursting';
    
    // Wide impulse
    const radius = behavior.params.pushRadius || 110;
    const bodies = Matter.Query.region(this.matter.world.bodies,
      Matter.Bounds.create(this.matter.world.bodies.map(b => b.bounds),
        { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
      )
    );
    
    for (const b of bodies) {
      if (!b.isStatic && b.label?.startsWith('structure_')) {
        const angle = Math.atan2(b.position.y - y, b.position.x - x);
        const force = 300;
        Matter.Body.applyForce(b, b.position, {
          x: Math.cos(angle) * force * 0.001,
          y: Math.sin(angle) * force * 0.001,
        });
      }
    }
    
    // Blast damage
    this.applyBlastDamage(x, y, proj.ammo, {
      ...behavior,
      params: { ...behavior.params, blastRadius: radius, blastDamage: 80 }
    });
  }

  private doDrillPush(proj: ProjectileState): void {
    const { body } = proj;
    const x = body.position.x;
    const y = body.position.y;
    const angle = Math.atan2(Matter.Body.getVelocity(body).y, Matter.Body.getVelocity(body).x);
    
    // Push forward
    const pushDist = 20;
    const nx = x + Math.cos(angle) * pushDist;
    const ny = y + Math.sin(angle) * pushDist;
    
    // Damage at push point
    const hitBodies = Matter.Query.point(this.matter.world.bodies, { x: nx, y: ny });
    for (const hitBody of hitBodies) {
      if (hitBody.isStatic && hitBody.label?.startsWith('structure_')) {
        this.structureSystem?.applyDamage(
          hitBody,
          proj.behavior.params.pushDamage || 40,
          nx, ny,
          proj.ammo.id,
          proj.ammo.stats.materialModifiers
        );
      }
    }
    
    // Visual
    this.effectsSystem?.emitDrillPush(nx, ny);
    this.audioSystem?.playImpact('steel', 0.5);
    
    // Move projectile
    Matter.Body.setPosition(body, { x: nx, y: ny });
  }

  private updateGraphics(proj: ProjectileState): void {
    const { body, graphics, trailGraphics } = proj;
    
    graphics.setPosition(body.position.x, body.position.y);
    graphics.setRotation(body.angle);
    
    // Trail
    trailGraphics.clear();
    trailGraphics.lineStyle(2, 0xff8800, 0.4);
    trailGraphics.beginPath();
    trailGraphics.moveTo(body.position.x, body.position.y);
    const vel = Matter.Body.getVelocity(body);
    trailGraphics.lineTo(body.position.x - vel.x * 0.05, body.position.y - vel.y * 0.05);
    trailGraphics.strokePath();
  }

  private recycleProjectile(proj: ProjectileState): void {
    proj.graphics.destroy();
    proj.trailGraphics.destroy();
    this.matter.world.removeBody(proj.body);
    
    // Reset for pool
    proj.graphics = null as any;
    proj.trailGraphics = null as any;
    proj.body = null as any;
    this.projectilePool.push(proj);
  }

  handleImpact(
    projectile: ProjectileState,
    targetBody: Matter.Body,
    impactPoint: { x: number; y: number },
    impactNormal: { x: number; y: number }
  ): void {
    if (projectile.state !== 'flying' && projectile.state !== 'penetrating' && projectile.state !== 'sabot_discarded') {
      return;
    }

    projectile.impactPosition = impactPoint;
    projectile.impactNormal = impactNormal;
    projectile.hitBodies.add(targetBody);

    const { ammo, behavior } = projectile;

    // Check for bankshot
    if (behavior.type === 'bankshot' && targetBody.isStatic) {
      const angle = Math.atan2(Matter.Body.getVelocity(projectile.body).y, Matter.Body.getVelocity(projectile.body).x);
      const surfaceAngle = Math.atan2(impactNormal.y, impactNormal.x);
      const diff = Math.abs(angle - surfaceAngle - Math.PI/2);
      
      if (diff < Phaser.Math.DegToRad(behavior.params.minAngle || 20)) {
        // Ricochet
        const bounceRetention = behavior.params.bounceRetention || 0.6;
        const vel = Matter.Body.getVelocity(projectile.body);
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y) * bounceRetention;
        const newAngle = surfaceAngle * 2 - angle + Math.PI;
        
        Matter.Body.setVelocity(projectile.body, {
          x: Math.cos(newAngle) * speed,
          y: Math.sin(newAngle) * speed,
        });
        
        this.effectsSystem?.emitImpact(impactPoint.x, impactPoint.y, 'steel', 0.5);
        this.audioSystem?.playImpact('steel', 0.5);
        return;
      }
    }

    // Check for latchburst
    if (behavior.type === 'latchburst') {
      // Grip surface briefly
      projectile.state = 'penetrating';
      projectile.fuseTimer = behavior.params.gripDuration || 0.1;
      return;
    }

    // Apply direct damage
    const damage = ammo.stats.directDamage;
    const result = this.structureSystem?.applyDamage(
      targetBody,
      damage,
      impactPoint.x, impactPoint.y,
      ammo.id,
      ammo.stats.materialModifiers
    );

    projectile.damageDealt += damage;

    // Handle penetration
    if (ammo.stats.penetration > 0 && result && !result.destroyed) {
      projectile.state = 'penetrating';
      projectile.penetrationRemaining = ammo.stats.penetration;
      
      // Continue through
      const vel = Matter.Body.getVelocity(projectile.body);
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y) * 0.7;
      const angle = Math.atan2(vel.y, vel.x);
      Matter.Body.setVelocity(projectile.body, {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      });
    } else if (behavior.type === 'drill') {
      projectile.state = 'drilling';
      projectile.drillPushesRemaining = behavior.params.pushes || 4;
      projectile.lastDrillTime = this.scene.time.now;
    } else if (ammo.stats.fuseDelay > 0 && !projectile.hasBurst) {
      projectile.fuseTimer = ammo.stats.fuseDelay;
    } else if (ammo.stats.blastRadius > 0) {
      this.triggerBurst(projectile);
    } else {
      projectile.state = 'finished';
    }

    // Soft round behaviors
    if (behavior.type === 'soft_flatten' || behavior.type === 'pancake') {
      this.effectsSystem?.emitSoftCrush(impactPoint.x, impactPoint.y, behavior.params.flattenWidth || 2.5 * 20);
      this.audioSystem?.playImpact('steel', 1);
    }
    
    if (behavior.type === 'petal') {
      this.effectsSystem?.emitPetalStrip(impactPoint.x, impactPoint.y, Phaser.Math.RadToDeg(Math.atan2(impactNormal.y, impactNormal.x)));
    }
    
    if (behavior.type === 'bonded_mushroom') {
      // Push plug forward
      const plugDist = behavior.params.pushDistance || 120;
      const angle = Math.atan2(impactNormal.y, impactNormal.x) + Math.PI;
      // Implementation would push a debris plug
    }
    
    if (behavior.type === 'crusher') {
      // Already handled by material modifiers
    }
    
    if (behavior.type === 'heavy_soft') {
      // Structural weaken handled in StructureSystem
      this.effectsSystem?.screenShake(1.5);
    }
    
    if (behavior.type === 'pele_sidewinder') {
      // Sideways fragments
      this.effectsSystem?.emitSpall(impactPoint.x, impactPoint.y, Phaser.Math.RadToDeg(Math.atan2(impactNormal.y, impactNormal.x)) + 90, 3);
      this.effectsSystem?.emitSpall(impactPoint.x, impactPoint.y, Phaser.Math.RadToDeg(Math.atan2(impactNormal.y, impactNormal.x)) - 90, 3);
    }
  }

  getActiveProjectiles(): ProjectileState[] {
    return this.activeProjectiles;
  }

  clear(): void {
    for (const proj of this.activeProjectiles) {
      this.recycleProjectile(proj);
    }
    this.activeProjectiles = [];
  }

  destroy(): void {
    this.clear();
    for (const proj of this.projectilePool) {
      if (proj.graphics) proj.graphics.destroy();
      if (proj.trailGraphics) proj.trailGraphics.destroy();
      if (proj.body) this.matter.world.removeBody(proj.body);
    }
    this.projectilePool = [];
  }
}