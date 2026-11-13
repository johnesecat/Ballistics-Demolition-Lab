import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { BaseUIComponent } from '../ui/BaseUI';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { getAllAmmo, getAmmoByCategory, AMMO_CATALOGUE, AmmoDefinition } from '../ammo/ammoCatalogue';

export class ArmoryScene extends Scene {
  private audioSystem!: AudioSystem;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private categoryTabs: Phaser.GameObjects.Container[] = [];
  private currentCategory: string = 'all';
  private materialFilters: Phaser.GameObjects.Container[] = [];
  private activeMaterialFilters: Set<string> = new Set();
  private ammoCards: Phaser.GameObjects.Container[] = [];
  private cardsContainer!: Phaser.GameObjects.Container;
  private scrollOffset: number = 0;
  private selectedAmmo: AmmoDefinition | null = null;
  private detailPanel!: Phaser.GameObjects.Container;
  private backButton!: Phaser.GameObjects.Container;
  private loadoutSlots: Phaser.GameObjects.Container[] = [];
  private currencyText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ArmoryScene' });
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    this.createBackground();
    this.createHeader();
    this.createCategoryTabs();
    this.createMaterialFilters();
    this.createAmmoList();
    this.createDetailPanel();
    this.createLoadoutBar();
    this.createBackButton();
    
    this.scale.on('resize', this.handleResize, this);
    this.refreshAmmoList();
  }

  private createBackground(): void {
    this.backgroundGraphics = this.add.graphics();
    this.backgroundGraphics.setDepth(GAME_CONFIG.Z.BACKGROUND);
    this.drawBackground();
  }

  private drawBackground(): void {
    const { width, height } = this.scale;
    const gfx = this.backgroundGraphics;
    gfx.clear();
    gfx.fillStyle(GAME_CONFIG.COLORS.BACKGROUND, 1);
    gfx.fillRect(0, 0, width, height);
  }

  private createHeader(): void {
    const { width } = this.scale;
    
    this.add.text(20, 15, 'ARMORY', {
      fontSize: '28px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    const data = saveSystem.getData();
    this.currencyText = this.add.text(width - 20, 15, `COINS: ${data.currency}`, {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  private createCategoryTabs(): void {
    const { width } = this.scale;
    const categories = ['all', 'solid', 'heat', 'hesh', 'he', 'aphe', 'soft'];
    const tabWidth = 90;
    const tabHeight = 36;
    const spacing = 4;
    const startX = (width - (categories.length * tabWidth + (categories.length - 1) * spacing)) / 2;
    const y = 60;

    const categoryColors: Record<string, number> = {
      all: GAME_CONFIG.COLORS.TEXT_DIM,
      solid: 0x4488cc,
      heat: 0xff6600,
      hesh: 0xaa44ff,
      he: 0xff3344,
      aphe: 0xffdd00,
      soft: 0xcd7f32,
    };

    categories.forEach((cat, i) => {
      const x = startX + i * (tabWidth + spacing);
      const tab = this.add.container(x + tabWidth/2, y + tabHeight/2).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const bg = this.add.graphics();
      const isActive = cat === this.currentCategory;
      bg.fillStyle(isActive ? categoryColors[cat] : GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
      bg.lineStyle(2, isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
      tab.add(bg);

      const label = this.add.text(0, 0, cat.toUpperCase(), {
        fontSize: '12px',
        color: `#${(isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      tab.add(label);

      tab.setData('category', cat);
      tab.setSize(tabWidth, tabHeight);
      tab.setInteractive(new Phaser.Geom.Rectangle(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight), Phaser.Geom.Rectangle.Contains);
      
      tab.on('pointerdown', () => {
        this.audioSystem?.playUISelect();
        this.selectCategory(cat);
      });

      this.categoryTabs.push(tab);
    });
  }

  private createMaterialFilters(): void {
    const { width } = this.scale;
    const filters = ['steel', 'armor', 'brick', 'wood', 'concrete', 'slopes'];
    const btnWidth = 90;
    const btnHeight = 30;
    const spacing = 4;
    const startX = (width - (filters.length * btnWidth + (filters.length - 1) * spacing)) / 2;
    const y = 105;

    const filterColors: Record<string, number> = {
      steel: 0x8899aa,
      armor: 0x5a6a7a,
      brick: 0x8b3e2f,
      wood: 0x8b5a2b,
      concrete: 0x6b6b6b,
      slopes: 0x7a5a3a,
    };

    filters.forEach((filter, i) => {
      const x = startX + i * (btnWidth + spacing);
      const btn = this.add.container(x + btnWidth/2, y + btnHeight/2).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const bg = this.add.graphics();
      const isActive = this.activeMaterialFilters.has(filter);
      bg.fillStyle(isActive ? filterColors[filter] : GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 4);
      bg.lineStyle(2, isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 4);
      btn.add(bg);

      const label = this.add.text(0, 0, filter.toUpperCase(), {
        fontSize: '11px',
        color: `#${(isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.add(label);

      btn.setData('filter', filter);
      btn.setSize(btnWidth, btnHeight);
      btn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
      
      btn.on('pointerdown', () => {
        this.audioSystem?.playUISelect();
        this.toggleMaterialFilter(filter);
      });

      this.materialFilters.push(btn);
    });
  }

  private createAmmoList(): void {
    const { width, height } = this.scale;
    this.cardsContainer = this.add.container(20, 150).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    // Scroll indicators
    this.add.text(width/2, 155, '▲', { fontSize: '16px', color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}` })
      .setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1).setAlpha(0);
    this.add.text(width/2, height - 10, '▼', { fontSize: '16px', color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}` })
      .setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1).setAlpha(0);
  }

  private createDetailPanel(): void {
    const { width, height } = this.scale;
    const panelWidth = 360;
    const panelHeight = height - 170;
    const x = width - panelWidth - 20;
    const y = 150;

    this.detailPanel = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.detailPanel.setVisible(false);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.95);
    bg.fillRoundedRect(0, 0, panelWidth, panelHeight, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.3);
    bg.strokeRoundedRect(0, 0, panelWidth, panelHeight, 8);
    this.detailPanel.add(bg);
  }

  private createLoadoutBar(): void {
    const { width, height } = this.scale;
    const slotSize = 60;
    const spacing = 8;
    const startX = (width - (6 * slotSize + 5 * spacing)) / 2;
    const y = height - 80;

    const loadout = saveSystem.getAmmoLoadout();
    
    for (let i = 0; i < 6; i++) {
      const x = startX + i * (slotSize + spacing);
      const slot = this.add.container(x + slotSize/2, y + slotSize/2).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const bg = this.add.graphics();
      bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-slotSize/2, -slotSize/2, slotSize, slotSize, 6);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-slotSize/2, -slotSize/2, slotSize, slotSize, 6);
      slot.add(bg);

      const ammoId = loadout[i];
      if (ammoId) {
        const ammo = AMMO_CATALOGUE.find(a => a.id === ammoId);
        if (ammo) {
          // Icon
          const icon = this.add.image(0, -10, `icon_${ammoId}`).setScale(0.8).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
          slot.add(icon);
          
          // Name
          this.add.text(0, 28, ammo.name, {
            fontSize: '10px',
            color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
            fontFamily: 'Arial, sans-serif',
            wordWrap: { width: slotSize - 10 },
          }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
        }
      } else {
        this.add.text(0, 0, '+', {
          fontSize: '24px',
          color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
      }

      slot.setData('slotIndex', i);
      slot.setSize(slotSize, slotSize);
      slot.setInteractive(new Phaser.Geom.Rectangle(-slotSize/2, -slotSize/2, slotSize, slotSize), Phaser.Geom.Rectangle.Contains);
      
      slot.on('pointerdown', () => {
        if (this.selectedAmmo && !loadout.includes(this.selectedAmmo.id)) {
          this.assignToLoadout(i, this.selectedAmmo.id);
        } else if (loadout[i]) {
          // Remove from loadout
          this.removeFromLoadout(i);
        }
      });

      this.loadoutSlots.push(slot);
    }
  }

  private createBackButton(): void {
    const { height } = this.scale;
    this.backButton = this.add.container(80, height - 50).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    bg.fillRoundedRect(-60, -25, 120, 50, 6);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    bg.strokeRoundedRect(-60, -25, 120, 50, 6);
    this.backButton.add(bg);

    this.add.text(0, 0, 'BACK', {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.backButton.setSize(120, 50);
    this.backButton.setInteractive(new Phaser.Geom.Rectangle(-60, -25, 120, 50), Phaser.Geom.Rectangle.Contains);
    
    this.backButton.on('pointerdown', () => {
      this.audioSystem?.playUICancel();
      this.scene.start('MainMenuScene');
    });
  }

  private selectCategory(category: string): void {
    this.currentCategory = category;
    this.scrollOffset = 0;
    
    // Update tab visuals
    this.categoryTabs.forEach(tab => {
      const cat = tab.getData('category');
      const bg = tab.getAt(0) as Phaser.GameObjects.Graphics;
      const label = tab.getAt(1) as Phaser.GameObjects.Text;
      const isActive = cat === category;
      
      const categoryColors: Record<string, number> = {
        all: GAME_CONFIG.COLORS.TEXT_DIM,
        solid: 0x4488cc,
        heat: 0xff6600,
        hesh: 0xaa44ff,
        he: 0xff3344,
        aphe: 0xffdd00,
        soft: 0xcd7f32,
      };
      
      bg.clear();
      bg.fillStyle(isActive ? categoryColors[cat] : GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-45, -18, 90, 36, 6);
      bg.lineStyle(2, isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-45, -18, 90, 36, 6);
      label.setColor(`#${(isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`);
    });
    
    this.refreshAmmoList();
  }

  private toggleMaterialFilter(filter: string): void {
    if (this.activeMaterialFilters.has(filter)) {
      this.activeMaterialFilters.delete(filter);
    } else {
      this.activeMaterialFilters.add(filter);
    }
    
    // Update button visuals
    this.materialFilters.forEach(btn => {
      const f = btn.getData('filter');
      const bg = btn.getAt(0) as Phaser.GameObjects.Graphics;
      const label = btn.getAt(1) as Phaser.GameObjects.Text;
      const isActive = this.activeMaterialFilters.has(f);
      
      const filterColors: Record<string, number> = {
        steel: 0x8899aa,
        armor: 0x5a6a7a,
        brick: 0x8b3e2f,
        wood: 0x8b5a2b,
        concrete: 0x6b6b6b,
        slopes: 0x7a5a3a,
      };
      
      bg.clear();
      bg.fillStyle(isActive ? filterColors[f] : GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-45, -15, 90, 30, 4);
      bg.lineStyle(2, isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-45, -15, 90, 30, 4);
      label.setColor(`#${(isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`);
    });
    
    this.refreshAmmoList();
  }

  private refreshAmmoList(): void {
    this.cardsContainer.removeAll(true);
    this.ammoCards = [];
    
    let ammoList = getAllAmmo();
    
    // Filter by category
    if (this.currentCategory !== 'all') {
      if (this.currentCategory === 'soft') {
        ammoList = ammoList.filter(a => a.subcategory === 'soft');
      } else {
        ammoList = ammoList.filter(a => a.category === this.currentCategory);
      }
    }
    
    // Filter by material
    if (this.activeMaterialFilters.size > 0) {
      ammoList = ammoList.filter(ammo => {
        return Array.from(this.activeMaterialFilters).some(filter => 
          (ammo.stats.materialModifiers[filter as any] || 0) > 1.0
        );
      });
    }
    
    // Sort: unlocked first, then by cost
    ammoList.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return a.unlockCost - b.unlockCost;
    });

    const cardWidth = 280;
    const cardHeight = 140;
    const spacing = 10;
    const cols = 3;
    
    ammoList.forEach((ammo, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * (cardWidth + spacing) + cardWidth / 2;
      const y = row * (cardHeight + spacing) + cardHeight / 2 + this.scrollOffset;
      
      const card = this.createAmmoCard(ammo, x, y, cardWidth, cardHeight);
      this.cardsContainer.add(card);
      this.ammoCards.push(card);
    });
  }

  private createAmmoCard(ammo: AmmoDefinition, x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
    const card = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    card.setData('ammoId', ammo.id);
    
    const unlocked = saveSystem.isAmmoUnlocked(ammo.id);
    const inLoadout = saveSystem.getAmmoLoadout().includes(ammo.id);
    
    // Background
    const bg = this.add.graphics();
    const isSelected = this.selectedAmmo?.id === ammo.id;
    let bgColor = unlocked ? GAME_CONFIG.COLORS.PANEL : 0x1a1a2a;
    if (isSelected) bgColor = GAME_CONFIG.COLORS.SELECTION;
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
    bg.lineStyle(2, 
      isSelected ? GAME_CONFIG.COLORS.SELECTION : 
      unlocked ? GAME_CONFIG.COLORS.PRIMARY : GAME_CONFIG.COLORS.TEXT_DIM, 
      0.5
    );
    bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
    card.add(bg);

    // Category badge
    const catColors: Record<string, number> = {
      solid: 0x4488cc,
      heat: 0xff6600,
      hesh: 0xaa44ff,
      he: 0xff3344,
      aphe: 0xffdd00,
      soft: 0xcd7f32,
    };
    
    const badgeText = ammo.subcategory === 'soft' ? 'SOFT' : ammo.category.toUpperCase();
    const badgeColor = ammo.subcategory === 'soft' ? catColors.soft : catColors[ammo.category];
    
    const badge = this.add.graphics();
    badge.fillStyle(badgeColor, 1);
    badge.fillRoundedRect(-width/2 + 8, -height/2 + 8, 60, 20, 10);
    card.add(badge);
    
    this.add.text(-width/2 + 38, -height/2 + 18, badgeText, {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Icon
    const icon = this.add.image(-width/2 + 50, 0, `icon_${ammo.id}`).setScale(0.7).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    if (!unlocked) icon.setAlpha(0.5);
    card.add(icon);

    // Name
    this.add.text(-width/2 + 100, -height/2 + 15, ammo.name, {
      fontSize: '14px',
      color: `#${(unlocked ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      wordWrap: { width: width - 110 },
    }).setOrigin(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Description
    this.add.text(-width/2 + 100, -height/2 + 45, ammo.description, {
      fontSize: '11px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      wordWrap: { width: width - 110 },
    }).setOrigin(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Best Used For
    this.add.text(-width/2 + 100, -height/2 + 85, 'Best: ' + ammo.bestUsedFor, {
      fontSize: '10px',
      color: `#${GAME_CONFIG.COLORS.SUCCESS.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'italic',
      wordWrap: { width: width - 110 },
    }).setOrigin(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Lock/Unlock/Cost
    if (!unlocked) {
      this.add.text(width/2 - 10, height/2 - 15, `${ammo.unlockCost}`, {
        fontSize: '14px',
        color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
      
      this.add.image(width/2 - 10, height/2 - 15, 'coin_icon').setScale(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    } else if (!inLoadout) {
      const selectBtn = this.add.text(width/2 - 10, height/2 - 15, 'SELECT', {
        fontSize: '12px',
        color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    } else {
      this.add.text(width/2 - 10, height/2 - 15, 'EQUIPPED', {
        fontSize: '11px',
        color: `#${GAME_CONFIG.COLORS.SUCCESS.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    }

    if (unlocked) {
      card.setSize(width, height);
      card.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
      
      card.on('pointerdown', () => {
        this.audioSystem?.playUISelect();
        this.selectAmmo(ammo);
      });
    }

    return card;
  }

  private selectAmmo(ammo: AmmoDefinition): void {
    this.selectedAmmo = ammo;
    this.updateDetailPanel(ammo);
    this.refreshAmmoList();
  }

  private updateDetailPanel(ammo: AmmoDefinition): void {
    this.detailPanel.removeAll(true);
    this.detailPanel.setVisible(true);
    
    const { width: panelWidth } = { width: 360 };
    let y = 20;
    
    const addText = (text: string, fontSize: number = 13, color: number = GAME_CONFIG.COLORS.TEXT, bold: boolean = false, centered: boolean = false) => {
      const txt = this.add.text(centered ? panelWidth/2 : 15, y, text, {
        fontSize: `${fontSize}px`,
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: bold ? 'bold' : 'normal',
        wordWrap: { width: panelWidth - 30 },
      }).setOrigin(centered ? 0.5 : 0, 0);
      this.detailPanel.add(txt);
      y += txt.height + 8;
      return txt;
    };

    // Large icon
    const icon = this.add.image(panelWidth/2, y + 40, `icon_${ammo.id}`).setScale(1.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    this.detailPanel.add(icon);
    y += 100;

    // Name & Category
    addText(ammo.name, 20, GAME_CONFIG.COLORS.PRIMARY, true, true);
    
    const catColors: Record<string, number> = {
      solid: 0x4488cc,
      heat: 0xff6600,
      hesh: 0xaa44ff,
      he: 0xff3344,
      aphe: 0xffdd00,
      soft: 0xcd7f32,
    };
    const catText = ammo.subcategory === 'soft' ? 'SOFT' : ammo.category.toUpperCase();
    addText(catText, 12, catColors[ammo.category] || GAME_CONFIG.COLORS.TEXT_DIM, true, true);
    
    y += 10;
    
    // Description
    addText('DESCRIPTION', 12, GAME_CONFIG.COLORS.TEXT_DIM, true);
    addText(ammo.description, 12, GAME_CONFIG.COLORS.TEXT);
    
    y += 5;
    
    // Best Used For
    addText('BEST USED FOR', 12, GAME_CONFIG.COLORS.TEXT_DIM, true);
    addText(ammo.bestUsedFor, 12, GAME_CONFIG.COLORS.SUCCESS);
    
    if (ammo.watchFor) {
      y += 5;
      addText('WATCH FOR', 12, GAME_CONFIG.COLORS.TEXT_DIM, true);
      addText(ammo.watchFor, 12, GAME_CONFIG.COLORS.WARNING);
    }
    
    y += 10;
    
    // Stats
    addText('STATISTICS', 12, GAME_CONFIG.COLORS.TEXT_DIM, true);
    
    const stats = [
      { label: 'Speed', value: ammo.stats.speed },
      { label: 'Mass', value: ammo.stats.mass },
      { label: 'Direct Damage', value: ammo.stats.directDamage },
      { label: 'Penetration', value: ammo.stats.penetration },
      { label: 'Blast Radius', value: ammo.stats.blastRadius },
      { label: 'Blast Damage', value: ammo.stats.blastDamage },
      { label: 'Impulse', value: ammo.stats.impulse },
      { label: 'Max Range', value: ammo.stats.maxRange },
    ];
    
    stats.forEach(stat => {
      addText(`${stat.label}: ${stat.value}`, 11, GAME_CONFIG.COLORS.TEXT, false);
    });
    
    // Material modifiers
    y += 5;
    addText('MATERIAL EFFECTIVENESS', 12, GAME_CONFIG.COLORS.TEXT_DIM, true);
    
    const materials = ['steel', 'armor', 'brick', 'wood', 'concrete', 'slopes'];
    materials.forEach(mat => {
      const mod = ammo.stats.materialModifiers[mat as any];
      if (mod && mod !== 1.0) {
        const color = mod > 1 ? GAME_CONFIG.COLORS.SUCCESS : GAME_CONFIG.COLORS.DANGER;
        addText(`${mat}: ${mod}x`, 11, color, false);
      }
    });
    
    // Special behavior
    if (ammo.behavior.type !== 'none') {
      y += 5;
      addText('SPECIAL BEHAVIOR', 12, GAME_CONFIG.COLORS.TEXT_DIM, true);
      addText(this.formatBehavior(ammo.behavior), 11, GAME_CONFIG.COLORS.PRIMARY);
    }
    
    // Inferred notice
    if (ammo.inferred) {
      y += 10;
      addText('⚠ Mechanics inferred from description', 10, GAME_CONFIG.COLORS.WARNING, true, true);
    }
    
    // Unlock/Select button
    const unlocked = saveSystem.isAmmoUnlocked(ammo.id);
    const inLoadout = saveSystem.getAmmoLoadout().includes(ammo.id);
    
    y += 20;
    if (!unlocked) {
      const btn = this.createButton(panelWidth/2, y, 200, 40, `UNLOCK (${ammo.unlockCost})`, () => {
        if (saveSystem.spendCurrency(ammo.unlockCost)) {
          saveSystem.unlockAmmo(ammo.id);
          this.audioSystem?.playUIConfirm();
          this.updateDetailPanel(ammo);
          this.refreshAmmoList();
          this.updateCurrency();
        }
      }, { color: GAME_CONFIG.COLORS.APHE_YELLOW });
      this.detailPanel.add(btn);
    } else if (!inLoadout && saveSystem.getAmmoLoadout().length < 6) {
      const btn = this.createButton(panelWidth/2, y, 200, 40, 'ADD TO LOADOUT', () => {
        const loadout = saveSystem.getAmmoLoadout();
        if (!loadout.includes(ammo.id)) {
          loadout.push(ammo.id);
          saveSystem.setAmmoLoadout(loadout);
          this.audioSystem?.playUIConfirm();
          this.updateDetailPanel(ammo);
          this.refreshLoadoutBar();
        }
      }, { color: GAME_CONFIG.COLORS.SUCCESS });
      this.detailPanel.add(btn);
    }
  }

  private formatBehavior(behavior: any): string {
    const descriptions: Record<string, string> = {
      sabot: 'Discards outer carrier after short flight',
      finned: 'Stabilized flight, reduced drag',
      wedge: 'Tears wide seams in thin plates',
      bankshot: 'Can ricochet off angled surfaces',
      drill: 'Multiple penetrating pushes after impact',
      soft_flatten: 'Flattens on impact, crushes thin steel',
      pancake: 'Extra-wide flatten, folds panels',
      petal: 'Splits into 4 petals, strips thin steel',
      bonded_mushroom: 'Drives coherent plug through gap',
      crusher: 'Hardens on brick/wood, plows through',
      heavy_soft: 'Massive frame-bending impact',
      cuff: 'Reinforced nose for off-center hits',
      splitter: 'Pre-impact split into 4 soft pellets',
      anvil: 'Heavy lobbed impact, smashes from above',
      heat_jet: 'Focused copper jet penetrates armor',
      double_jet: 'Two parallel copper jets',
      wide_jet: 'Broader, shallower copper jet',
      crossfire: 'Jet + wide blast for mixed targets',
      sabot_heat: 'Sabot carrier + finned HEAT core',
      double_strike: 'Tandem jets, defeats reactive armor',
      cornerjet: 'Player-selectable angled jet',
      forkjet: 'Two diverging jets',
      roofbreaker: 'Air burst + downward jet',
      needle_jet: 'Ultra-long thin jet, minimal blast',
      hesh_spall: 'Rear-face spalling fragments',
      broadhead: 'Wide shallow spall',
      scab_lifter: 'Extra fragments from damaged armor',
      shock: 'Concentrated blast bends metal',
      hesh_demolition: 'Wide surface breakup around armor',
      ribbon_hesh: 'Broad rear-face fragment release',
      echo_hesh: 'Double blast on same spot',
      quake: 'Shock ring shakes loose supports',
      he_blast: 'Standard explosive blast',
      he_demolition: 'Stronger blast, throws debris',
      fragmentation: 'Wide fragment spray',
      thermal: 'Leaves glowing hot patch',
      rainmaker: 'Air burst + 5 copper streams down',
      crownburst: 'Pre-contact directed burst',
      obstacle_reducer: 'Targets wood/brick supports',
      foundation_breaker: 'Delayed blast at lower joints',
      pressure_hammer: 'Wide impulse bends thin plates',
      popcorn: '4 sequential popping pods',
      meltdown: '2-second white-hot steel melt patch',
      aphe_hybrid: 'Penetrates then internal burst',
      capped_aphe: 'Angled cap + internal burst',
      bunkerbreaker: 'Short nose + quick blast for brick',
      emberpiercer: 'Penetrates + long glow marking',
      switchfuse: 'Selectable quick/delayed fuse',
      sideburst: 'Penetrates + sideways fragments',
      latchburst: 'Grips surface before burst',
      adaptive_shell: 'Selectable armor/building mode',
      chain_blast: '3 sequential deepening blasts',
    };
    return descriptions[behavior.type] || behavior.type;
  }

  private createButton(x: number, y: number, width: number, height: number, text: string, callback: () => void, options: { color?: number } = {}): Phaser.GameObjects.Container {
    const { color = GAME_CONFIG.COLORS.PRIMARY } = options;
    const btn = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-width/2, -height/2, width, height, 6);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    bg.strokeRoundedRect(-width/2, -height/2, width, height, 6);
    btn.add(bg);

    const label = this.add.text(0, 0, text, {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(label);

    btn.setSize(width, height);
    btn.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
    
    btn.on('pointerdown', () => {
      this.audioSystem?.playUIConfirm();
      bg.clear();
      bg.fillStyle(0xaa5500, 1);
      bg.fillRoundedRect(-width/2, -height/2, width, height, 6);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
      bg.strokeRoundedRect(-width/2, -height/2, width, height, 6);
      callback();
    });
    
    btn.on('pointerup', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-width/2, -height/2, width, height, 6);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
      bg.strokeRoundedRect(-width/2, -height/2, width, height, 6);
    });

    return btn;
  }

  private assignToLoadout(slotIndex: number, ammoId: string): void {
    const loadout = saveSystem.getAmmoLoadout();
    if (!loadout.includes(ammoId)) {
      if (loadout.length < 6) {
        loadout.push(ammoId);
      } else {
        loadout[slotIndex] = ammoId;
      }
      saveSystem.setAmmoLoadout(loadout);
      this.audioSystem?.playUIConfirm();
      this.refreshLoadoutBar();
      this.updateDetailPanel(this.selectedAmmo!);
    }
  }

  private removeFromLoadout(slotIndex: number): void {
    const loadout = saveSystem.getAmmoLoadout();
    loadout.splice(slotIndex, 1);
    saveSystem.setAmmoLoadout(loadout);
    this.audioSystem?.playUICancel();
    this.refreshLoadoutBar();
    if (this.selectedAmmo) this.updateDetailPanel(this.selectedAmmo);
  }

  private refreshLoadoutBar(): void {
    const loadout = saveSystem.getAmmoLoadout();
    
    this.loadoutSlots.forEach((slot, i) => {
      slot.removeAll(true);
      
      const bg = this.add.graphics();
      bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-30, -30, 60, 60, 6);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-30, -30, 60, 60, 6);
      slot.add(bg);

      const ammoId = loadout[i];
      if (ammoId) {
        const ammo = AMMO_CATALOGUE.find(a => a.id === ammoId);
        if (ammo) {
          const icon = this.add.image(0, -10, `icon_${ammoId}`).setScale(0.8).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
          slot.add(icon);
          
          this.add.text(0, 28, ammo.name, {
            fontSize: '10px',
            color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
            fontFamily: 'Arial, sans-serif',
            wordWrap: { width: 50 },
          }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
        }
      } else {
        this.add.text(0, 0, '+', {
          fontSize: '24px',
          color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
      }
    });
  }

  private updateCurrency(): void {
    const data = saveSystem.getData();
    this.currencyText.setText(`COINS: ${data.currency}`);
  }

  private handleResize(): void {
    this.drawBackground();
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
    this.cardsContainer?.destroy();
    this.detailPanel?.destroy();
  }
}