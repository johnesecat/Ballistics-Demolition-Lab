const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Ammo definitions with visual properties
const AMMO_ICONS = [
  // SOLID
  { id: 'ap_solid_shot', category: 'solid', name: 'AP Solid Shot', bodyColor: '#667788', noseColor: '#99aabb', accentColor: '#445566', special: null },
  { id: 'apc_capped', category: 'solid', name: 'APC Capped', bodyColor: '#556677', noseColor: '#aabbaa', accentColor: '#445566', special: 'cap_seam' },
  { id: 'apbc_ballistic_cap', category: 'solid', name: 'APBC Ballistic Cap', bodyColor: '#556677', noseColor: '#cccccc', accentColor: '#445566', special: 'long_cap' },
  { id: 'apcbc_combined_caps', category: 'solid', name: 'APCBC Combined Caps', bodyColor: '#556677', noseColor: '#bbccaa', accentColor: '#445566', special: 'double_cap' },
  { id: 'apcr_round', category: 'solid', name: 'APCR Round', bodyColor: '#667788', noseColor: '#99aabb', accentColor: '#445566', special: 'sabot' },
  { id: 'apds_sabot', category: 'solid', name: 'APDS Sabot', bodyColor: '#556677', noseColor: '#aaaaaa', accentColor: '#445566', special: 'sabot' },
  { id: 'finned_dart', category: 'solid', name: 'Finned Dart', bodyColor: '#8899aa', noseColor: '#bbcccc', accentColor: '#445566', special: 'fins' },
  { id: 'ap_breaker', category: 'solid', name: 'AP Breaker', bodyColor: '#445566', noseColor: '#778899', accentColor: '#445566', special: 'wide_nose' },
  { id: 'wedge', category: 'solid', name: 'Wedge', bodyColor: '#556677', noseColor: '#99aabb', accentColor: '#445566', special: 'wedge' },
  { id: 'pele_sidewinder', category: 'solid', name: 'PELE Sidewinder', bodyColor: '#445566', noseColor: '#bbbbbb', accentColor: '#445566', special: 'pele' },
  { id: 'bankshot', category: 'solid', name: 'Bankshot', bodyColor: '#556677', noseColor: '#aaaaaa', accentColor: '#445566', special: 'round_nose' },
  { id: 'drillhead', category: 'solid', name: 'Drillhead', bodyColor: '#334455', noseColor: '#aaaaaa', accentColor: '#445566', special: 'drill' },

  // SOFT
  { id: 'soft_nose', category: 'soft', name: 'Soft Nose', bodyColor: '#6b4423', noseColor: '#cd7f32', accentColor: '#b87333', special: 'soft' },
  { id: 'pancake', category: 'soft', name: 'Pancake', bodyColor: '#6b4423', noseColor: '#cd7f32', accentColor: '#b87333', special: 'pancake' },
  { id: 'petal', category: 'soft', name: 'Petal', bodyColor: '#6b4423', noseColor: '#cd7f32', accentColor: '#b87333', special: 'petal' },
  { id: 'bonded_mushroom', category: 'soft', name: 'Bonded Mushroom', bodyColor: '#556677', noseColor: '#daa520', accentColor: '#b8860b', special: 'mushroom' },
  { id: 'crusher', category: 'soft', name: 'Crusher', bodyColor: '#445566', noseColor: '#8899aa', accentColor: '#445566', special: 'crusher' },
  { id: 'heavy_soft_shot', category: 'soft', name: 'Heavy Soft Shot', bodyColor: '#8b4513', noseColor: '#cd7f32', accentColor: '#b87333', special: 'heavy_soft' },
  { id: 'cuff', category: 'soft', name: 'Cuff', bodyColor: '#6b4423', noseColor: '#cd7f32', accentColor: '#b87333', special: 'cuff' },
  { id: 'splitter', category: 'soft', name: 'Splitter', bodyColor: '#556677', noseColor: '#cd7f32', accentColor: '#b87333', special: 'splitter' },
  { id: 'anvil', category: 'soft', name: 'Anvil', bodyColor: '#333333', noseColor: '#555555', accentColor: '#444444', special: 'anvil' },

  // HEAT
  { id: 'heat_round', category: 'heat', name: 'HEAT Round', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'heat' },
  { id: 'double_jet', category: 'heat', name: 'Double Jet', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'double_jet' },
  { id: 'wide_jet', category: 'heat', name: 'Wide Jet', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'wide_jet' },
  { id: 'crossfire', category: 'heat', name: 'Crossfire', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'crossfire' },
  { id: 'sabot_heat', category: 'heat', name: 'Sabot HEAT', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'sabot_heat' },
  { id: 'double_strike', category: 'heat', name: 'Double Strike', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'double_strike' },
  { id: 'cornerjet', category: 'heat', name: 'Cornerjet', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'cornerjet' },
  { id: 'forkjet', category: 'heat', name: 'Forkjet', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'forkjet' },
  { id: 'roofbreaker', category: 'heat', name: 'Roofbreaker', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'roofbreaker' },
  { id: 'needle_jet', category: 'heat', name: 'Needle Jet', bodyColor: '#445566', noseColor: '#ff6600', accentColor: '#ff8800', special: 'needle' },

  // HESH
  { id: 'hesh_round', category: 'hesh', name: 'HESH Round', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'hesh' },
  { id: 'broadhead', category: 'hesh', name: 'Broadhead', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'broadhead' },
  { id: 'scab_lifter', category: 'hesh', name: 'Scab Lifter', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'scab' },
  { id: 'shock', category: 'hesh', name: 'Shock', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'shock' },
  { id: 'hesh_demolition', category: 'hesh', name: 'HESH Demolition', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'demo' },
  { id: 'ribbon_hesh', category: 'hesh', name: 'Ribbon HESH', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'ribbon' },
  { id: 'echo_hesh', category: 'hesh', name: 'Echo HESH', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'echo' },
  { id: 'quake', category: 'hesh', name: 'Quake', bodyColor: '#4a5a3a', noseColor: '#ffd700', accentColor: '#888844', special: 'quake' },

  // HE
  { id: 'he_blast', category: 'he', name: 'HE Blast', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'he' },
  { id: 'he_demolition', category: 'he', name: 'HE Demolition', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'he_demo' },
  { id: 'fragmentation', category: 'he', name: 'Fragmentation', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'frag' },
  { id: 'thermal', category: 'he', name: 'Thermal', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'thermal' },
  { id: 'rainmaker', category: 'he', name: 'Rainmaker', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'rainmaker' },
  { id: 'crownburst', category: 'he', name: 'Crownburst', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'crown' },
  { id: 'obstacle_reducer', category: 'he', name: 'Obstacle Reducer', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'obstacle' },
  { id: 'foundation_breaker', category: 'he', name: 'Foundation Breaker', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'foundation' },
  { id: 'pressure_hammer', category: 'he', name: 'Pressure Hammer', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'pressure' },
  { id: 'popcorn_burst', category: 'he', name: 'Popcorn Burst', bodyColor: '#5a3a3a', noseColor: '#ff3344', accentColor: '#ff6666', special: 'popcorn' },
  { id: 'meltdown', category: 'he', name: 'Meltdown', bodyColor: '#5a3a3a', noseColor: '#ffffff', accentColor: '#ffaa00', special: 'meltdown' },

  // APHE
  { id: 'aphe_hybrid', category: 'aphe', name: 'APHE Hybrid', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'aphe' },
  { id: 'capped_aphe', category: 'aphe', name: 'Capped APHE', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'capped_aphe' },
  { id: 'bunkerbreaker', category: 'aphe', name: 'Bunkerbreaker', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'bunker' },
  { id: 'emberpiercer', category: 'aphe', name: 'Emberpiercer', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'ember' },
  { id: 'switchfuse', category: 'aphe', name: 'Switchfuse', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'switchfuse' },
  { id: 'sideburst', category: 'aphe', name: 'Sideburst', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'sideburst' },
  { id: 'latchburst', category: 'aphe', name: 'Latchburst', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'latch' },
  { id: 'adaptive_shell', category: 'aphe', name: 'Adaptive Shell', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'adaptive' },
  { id: 'chain_blast', category: 'aphe', name: 'Chain Blast', bodyColor: '#445566', noseColor: '#ffdd00', accentColor: '#ffee88', special: 'chain' },
];

const CATEGORY_BADGE_COLORS = {
  solid: '#4488cc',
  heat: '#ff6600',
  hesh: '#aa44ff',
  he: '#ff3344',
  aphe: '#ffdd00',
  soft: '#cd7f32',
};

function drawAmmoIcon(ctx, ammo, size) {
  const centerX = size / 2;
  const centerY = size / 2;
  const length = size * 0.65;
  const width = size * 0.22;

  // Body
  ctx.fillStyle = ammo.bodyColor;
  ctx.beginPath();
  ctx.roundRect(centerX - length/2, centerY - width/2, length * 0.7, width, width * 0.2);
  ctx.fill();

  // Nose
  ctx.fillStyle = ammo.noseColor;
  ctx.beginPath();
  ctx.moveTo(centerX + length * 0.05, centerY - width/2);
  ctx.lineTo(centerX + length * 0.05, centerY + width/2);
  ctx.lineTo(centerX + length/2, centerY);
  ctx.closePath();
  ctx.fill();

  // Accent band
  ctx.fillStyle = ammo.accentColor;
  ctx.fillRect(centerX - length/2 + size * 0.09, centerY - width/2 + size * 0.03, size * 0.07, width - size * 0.06);

  // Special features
  switch (ammo.special) {
    case 'cap_seam':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.02;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.05, centerY - width/2);
      ctx.lineTo(centerX + length * 0.05, centerY + width/2);
      ctx.stroke();
      break;
    case 'long_cap':
      ctx.fillStyle = '#dddddd';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.15, centerY - width/2 * 0.8);
      ctx.lineTo(centerX + length * 0.15, centerY + width/2 * 0.8);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'double_cap':
      ctx.fillStyle = '#aaccaa';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.08, centerY - width/2);
      ctx.lineTo(centerX + length * 0.08, centerY + width/2);
      ctx.lineTo(centerX + length * 0.2, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ccddaa';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.2, centerY - width/2 * 0.7);
      ctx.lineTo(centerX + length * 0.2, centerY + width/2 * 0.7);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'sabot':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.02;
      ctx.setLineDash([size * 0.05, size * 0.03]);
      ctx.beginPath();
      ctx.moveTo(centerX - length/2 + size * 0.15, centerY - width/2);
      ctx.lineTo(centerX - length/2 + size * 0.15, centerY + width/2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'fins':
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.moveTo(centerX - length/2, centerY - width/2);
      ctx.lineTo(centerX - length/2 - size * 0.12, centerY - width);
      ctx.lineTo(centerX - length/2 + size * 0.06, centerY - width/2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(centerX - length/2, centerY + width/2);
      ctx.lineTo(centerX - length/2 - size * 0.12, centerY + width);
      ctx.lineTo(centerX - length/2 + size * 0.06, centerY + width/2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'wide_nose':
      ctx.fillStyle = '#8899aa';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.05, centerY - width/2 * 1.2);
      ctx.lineTo(centerX + length * 0.05, centerY + width/2 * 1.2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'wedge':
      ctx.fillStyle = '#99aabb';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length/2, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'pele':
      // Sideways split indicator
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.015;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.15, centerY - width/3);
      ctx.lineTo(centerX + length * 0.25, centerY - width/3);
      ctx.moveTo(centerX + length * 0.15, centerY + width/3);
      ctx.lineTo(centerX + length * 0.25, centerY + width/3);
      ctx.stroke();
      break;
    case 'round_nose':
      ctx.fillStyle = '#aaaaaa';
      ctx.beginPath();
      ctx.arc(centerX + length/2, centerY, width/2, Math.PI * 0.5, Math.PI * 1.5);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length * 0.1, centerY - width/2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'drill':
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = size * 0.025;
      for (let i = 0; i < 4; i++) {
        const y = centerY - width/2 + i * width/4;
        ctx.beginPath();
        ctx.moveTo(centerX + length * 0.15, y);
        ctx.lineTo(centerX + length * 0.35, y);
        ctx.stroke();
      }
      break;
    case 'soft':
      // Rounded soft nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.arc(centerX + length * 0.2, centerY, width/2 * 1.1, Math.PI * 0.5, Math.PI * 1.5);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2 * 1.1);
      ctx.lineTo(centerX + length * 0.1, centerY - width/2 * 1.1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'pancake':
      // Extra wide flat nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.15, centerY - width);
      ctx.lineTo(centerX + length * 0.15, centerY + width);
      ctx.arc(centerX + length/2, centerY, width, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'petal':
      // Four petal shapes at front
      ctx.fillStyle = ammo.noseColor;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(centerX + length * 0.1, centerY);
        ctx.lineTo(centerX + length * 0.1 + Math.cos(angle) * size * 0.15, centerY + Math.sin(angle) * size * 0.15);
        ctx.lineTo(centerX + length * 0.1 + Math.cos(angle + Math.PI/4) * size * 0.1, centerY + Math.sin(angle + Math.PI/4) * size * 0.1);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'mushroom':
      // Broad mushroom head
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width);
      ctx.lineTo(centerX + length * 0.1, centerY + width);
      ctx.arc(centerX + length/2 + size * 0.05, centerY, width * 1.3, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'crusher':
      // Stepped nose
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(centerX + length * 0.1, centerY - width/2, size * 0.08, width);
      ctx.fillRect(centerX + length * 0.18, centerY - width/2 * 0.8, size * 0.08, width * 0.8);
      ctx.fillRect(centerX + length * 0.26, centerY - width/2 * 0.6, size * 0.08, width * 0.6);
      break;
    case 'heavy_soft':
      // Very blunt heavy nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.15, centerY - width * 1.2);
      ctx.lineTo(centerX + length * 0.15, centerY + width * 1.2);
      ctx.arc(centerX + length/2, centerY, width * 1.2, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cuff':
      // Copper cuff band
      ctx.fillStyle = '#b87333';
      ctx.fillRect(centerX + length * 0.18, centerY - width/2 * 1.1, size * 0.08, width * 1.1);
      break;
    case 'splitter':
      // Blunt split front
      ctx.fillStyle = ammo.noseColor;
      ctx.fillRect(centerX + length * 0.05, centerY - width/2, length * 0.3, width);
      break;
    case 'anvil':
      // Block shape
      ctx.clearRect(centerX - length/2, centerY - width/2, length, width);
      ctx.fillStyle = ammo.bodyColor;
      ctx.fillRect(centerX - length/2, centerY - width/2, length, width);
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = size * 0.02;
      ctx.strokeRect(centerX - length/2, centerY - width/2, length, width);
      break;
    case 'heat':
      // Standard HEAT nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'double_jet':
      // Twin nozzle
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/3);
      ctx.lineTo(centerX + length * 0.1, centerY + width/3);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'wide_jet':
      // Wide nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.08, centerY - width/2 * 1.3);
      ctx.lineTo(centerX + length * 0.08, centerY + width/2 * 1.3);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'crossfire':
      // Dual purpose indicator
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Small blast indicator
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.arc(centerX + length * 0.2, centerY - width, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'sabot_heat':
      // Sabot + heat
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.02;
      ctx.setLineDash([size * 0.05, size * 0.03]);
      ctx.beginPath();
      ctx.moveTo(centerX - length/2 + size * 0.15, centerY - width/2);
      ctx.lineTo(centerX - length/2 + size * 0.15, centerY + width/2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'double_strike':
      // Tandem indicator
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.08, centerY - width/2);
      ctx.lineTo(centerX + length * 0.08, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Second stage indicator
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(centerX + length * 0.15, centerY - width/4, size * 0.04, width/2);
      break;
    case 'cornerjet':
      // Angled nozzle
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY);
      ctx.lineTo(centerX + length/2, centerY - width/2);
      ctx.lineTo(centerX + length/2, centerY + width/2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'forkjet':
      // Two diverging jets
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/3);
      ctx.lineTo(centerX + length/2, centerY - width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY + width/3);
      ctx.lineTo(centerX + length/2, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'roofbreaker':
      // Downward jet indicator
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Downward arrow
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = size * 0.02;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.2, centerY - width);
      ctx.lineTo(centerX + length * 0.2, centerY - width/2);
      ctx.lineTo(centerX + length * 0.15, centerY - width * 0.7);
      ctx.moveTo(centerX + length * 0.2, centerY - width/2);
      ctx.lineTo(centerX + length * 0.25, centerY - width * 0.7);
      ctx.stroke();
      break;
    case 'needle':
      // Very long thin nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/4);
      ctx.lineTo(centerX + length * 0.1, centerY + width/4);
      ctx.lineTo(centerX + length/2 * 1.5, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hesh':
      // Squat HESH nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2 * 1.1);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2 * 1.1);
      ctx.lineTo(centerX + length/2 * 0.8, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'broadhead':
      // Wide arrowhead
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.05, centerY - width);
      ctx.lineTo(centerX + length * 0.05, centerY + width);
      ctx.lineTo(centerX + length/2 * 0.9, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'scab':
      // Stepped front
      ctx.fillStyle = ammo.noseColor;
      ctx.fillRect(centerX + length * 0.08, centerY - width/2, size * 0.06, width);
      ctx.fillRect(centerX + length * 0.14, centerY - width/2 * 0.8, size * 0.06, width * 0.8);
      ctx.fillRect(centerX + length * 0.2, centerY - width/2 * 0.6, size * 0.06, width * 0.6);
      break;
    case 'shock':
      // Rounded blunt
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.arc(centerX + length * 0.2, centerY, width/2 * 1.2, Math.PI * 0.5, Math.PI * 1.5);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2 * 1.2);
      ctx.lineTo(centerX + length * 0.1, centerY - width/2 * 1.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'demo':
      // Large heavy nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.08, centerY - width/2 * 1.3);
      ctx.lineTo(centerX + length * 0.08, centerY + width/2 * 1.3);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Rear detail
      ctx.fillStyle = '#333333';
      ctx.fillRect(centerX - length/2, centerY - width/2 * 1.5, size * 0.08, width * 1.5);
      break;
    case 'ribbon':
      // Ribbon bands
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = size * 0.015;
      for (let i = 1; i < 4; i++) {
        const x = centerX - length/2 + i * length/4;
        ctx.beginPath();
        ctx.moveTo(x, centerY - width/2);
        ctx.lineTo(x, centerY + width/2);
        ctx.stroke();
      }
      break;
    case 'echo':
      // Double band
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = size * 0.02;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.15, centerY - width/2);
      ctx.lineTo(centerX + length * 0.15, centerY + width/2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.25, centerY - width/2);
      ctx.lineTo(centerX + length * 0.25, centerY + width/2);
      ctx.stroke();
      break;
    case 'quake':
      // Ring indicator
      ctx.strokeStyle = '#aa88ff';
      ctx.lineWidth = size * 0.02;
      ctx.beginPath();
      ctx.arc(centerX + length * 0.2, centerY, width/2 * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'he':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'he_demo':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.08, centerY - width/2 * 1.2);
      ctx.lineTo(centerX + length * 0.08, centerY + width/2 * 1.2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'frag':
      // Segmented casing
      ctx.strokeStyle = '#886644';
      ctx.lineWidth = size * 0.015;
      for (let i = 0; i < 3; i++) {
        const x = centerX - length/2 + i * length/3 + length/6;
        ctx.beginPath();
        ctx.moveTo(x, centerY - width/2);
        ctx.lineTo(x, centerY + width/2);
        ctx.stroke();
      }
      break;
    case 'thermal':
      // Heat band
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(centerX + length * 0.08, centerY - width/4, size * 0.06, width/2);
      break;
    case 'rainmaker':
      // Ogive nose with streams
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.quadraticCurveTo(centerX + length/2, centerY, centerX + length * 0.1, centerY + width/2);
      ctx.closePath();
      ctx.fill();
      // Stream indicators
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = size * 0.01;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX + length * 0.2, centerY - width/2 + i * width/4);
        ctx.lineTo(centerX + length * 0.3, centerY - width/2 + i * width/4);
        ctx.stroke();
      }
      break;
    case 'crown':
      // Crown/stepped nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      // Crown points
      for (let i = 0; i < 3; i++) {
        const x = centerX + length * 0.1 + i * length/12;
        ctx.lineTo(x, centerY - width/2 * (i % 2 === 0 ? 1.3 : 0.7));
        ctx.lineTo(x + length/12, centerY - width/2 * (i % 2 === 0 ? 0.7 : 1.3));
      }
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'obstacle':
      // Stout nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2 * 1.3);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2 * 1.3);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Red separator
      ctx.fillStyle = '#ff3344';
      ctx.fillRect(centerX + length * 0.05, centerY - width/2 * 1.3, size * 0.03, width * 1.3);
      break;
    case 'foundation':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Delayed fuse indicator
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(centerX + length * 0.15, centerY - width/4, size * 0.06, width/2);
      break;
    case 'pressure':
      // Wide blunt nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.08, centerY - width/2 * 1.2);
      ctx.lineTo(centerX + length * 0.08, centerY + width/2 * 1.2);
      ctx.lineTo(centerX + length/2 * 0.9, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'popcorn':
      // Four pods
      ctx.fillStyle = '#ffaa00';
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const cx = centerX + length * 0.2 + Math.cos(angle) * size * 0.08;
        const cy = centerY + Math.sin(angle) * size * 0.08;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'meltdown':
      // White-hot tip
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/3);
      ctx.lineTo(centerX + length * 0.1, centerY + width/3);
      ctx.lineTo(centerX + length/2 * 1.2, centerY);
      ctx.closePath();
      ctx.fill();
      // Hot band
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(centerX + length * 0.08, centerY - width/2 * 0.8, size * 0.04, width * 0.8);
      break;
    case 'aphe':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'capped_aphe':
      ctx.fillStyle = '#667788';
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2 * 0.8, centerY);
      ctx.closePath();
      ctx.fill();
      // Cap seam
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.015;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.stroke();
      break;
    case 'bunker':
      // Short heavy nose
      ctx.fillStyle = '#334455';
      ctx.fillRect(centerX + length * 0.1, centerY - width/2 * 1.2, size * 0.12, width * 1.2);
      break;
    case 'ember':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Glow band
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(centerX + length * 0.05, centerY - width/4, size * 0.03, width/2);
      break;
    case 'switchfuse':
      // Toggle indicator
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Switch
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(centerX + length * 0.15, centerY - width/4, size * 0.08, width/2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(centerX + length * 0.17, centerY - width/6, size * 0.04, width/3);
      break;
    case 'sideburst':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Side ports
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(centerX + length * 0.2, centerY - width/2, size * 0.03, width/4);
      ctx.fillRect(centerX + length * 0.2, centerY + width/4, size * 0.03, width/4);
      break;
    case 'latch':
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      // Hook
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.02;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.2, centerY - width/3);
      ctx.lineTo(centerX + length * 0.25, centerY - width/3);
      ctx.lineTo(centerX + length * 0.25, centerY);
      ctx.stroke();
      break;
    case 'adaptive':
      // Modular bands
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = size * 0.015;
      for (let i = 1; i < 4; i++) {
        const x = centerX + length * 0.1 + i * length/12;
        ctx.beginPath();
        ctx.moveTo(x, centerY - width/2);
        ctx.lineTo(x, centerY + width/2);
        ctx.stroke();
      }
      break;
    case 'chain':
      // Multi-stage nose
      ctx.fillStyle = ammo.noseColor;
      ctx.beginPath();
      ctx.moveTo(centerX + length * 0.1, centerY - width/2);
      ctx.lineTo(centerX + length * 0.1, centerY + width/2);
      for (let i = 0; i < 3; i++) {
        const x = centerX + length * 0.1 + i * length/12;
        ctx.lineTo(x, centerY - width/2 * (1 - i * 0.2));
        ctx.lineTo(x + length/12, centerY - width/2 * (1 - i * 0.2));
      }
      ctx.lineTo(centerX + length/2, centerY);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

function generateIcons() {
  const outputDir = path.join(__dirname, '..', 'public', 'assets', 'ammo-icons');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const iconSize = 128;
  const contactSheetCols = 10;
  const contactSheetRows = Math.ceil(AMMO_ICONS.length / contactSheetCols);
  const contactSheetWidth = contactSheetCols * iconSize;
  const contactSheetHeight = contactSheetRows * iconSize;

  const contactCanvas = createCanvas(contactSheetWidth, contactSheetHeight);
  const contactCtx = contactCanvas.getContext('2d');
  contactCtx.fillStyle = '#0a0f1a';
  contactCtx.fillRect(0, 0, contactSheetWidth, contactSheetHeight);

  AMMO_ICONS.forEach((ammo, index) => {
    // Individual icon
    const canvas = createCanvas(iconSize, iconSize);
    const ctx = canvas.getContext('2d');
    
    // Transparent background
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, iconSize, iconSize);
    
    // Draw icon centered
    drawAmmoIcon(ctx, ammo, iconSize);
    
    // Save individual PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(outputDir, `${ammo.id}.png`), buffer);
    
    // Add to contact sheet
    const col = index % contactSheetCols;
    const row = Math.floor(index / contactSheetCols);
    contactCtx.drawImage(canvas, col * iconSize, row * iconSize);
    
    console.log(`Generated: ${ammo.id}.png`);
  });

  // Save contact sheet
  const sheetBuffer = contactCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outputDir, 'contact_sheet.png'), sheetBuffer);
  console.log('Generated contact_sheet.png');

  // Generate category badges
  const badgeDir = path.join(__dirname, '..', 'public', 'assets', 'badges');
  if (!fs.existsSync(badgeDir)) {
    fs.mkdirSync(badgeDir, { recursive: true });
  }

  Object.entries(CATEGORY_BADGE_COLORS).forEach(([cat, color]) => {
    const canvas = createCanvas(80, 28);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, 80, 28, 14);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.toUpperCase(), 40, 14);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(badgeDir, `badge_${cat}.png`), buffer);
  });

  console.log('All assets generated successfully!');
}

generateIcons();