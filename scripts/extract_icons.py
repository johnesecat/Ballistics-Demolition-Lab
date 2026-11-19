#!/usr/bin/env python3
"""Draw original projectile illustrations and pixel-flight sprites.

Inspired by the reference images, but no reference pixels, logos or codes are
used. The shared geometric recipes are editable here. Pillow is required.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/ammo'
manifest_path = OUT / 'manifest.json'
entries = json.loads(manifest_path.read_text())['items']
# The gameplay catalogue is authoritative: PELE is a Solid round.
for e in entries:
    if e['id'] == 'pele-sidewinder': e['category'] = 'solid'

PALETTE = {
    'solid': ((75, 91, 103), (159, 180, 190)),
    'soft': ((115, 72, 48), (224, 160, 101)),
    'heat': ((73, 94, 105), (160, 184, 190)),
    'hesh': ((74, 83, 65), (155, 163, 119)),
    'he': ((72, 82, 61), (154, 162, 115)),
    'aphe': ((76, 97, 111), (169, 188, 199)),
}
# Geometry is expressed in a 384×160 coordinate system. Silhouette and detail
# parameters are interpreted from the references; none are recovered originals.
SPECS = {
 'ap-solid-shot':('point',0), 'apc-capped':('cap',0), 'apbc-ballistic-cap':('long',0),
 'apcbc-combined-caps':('long',1), 'apcr-round':('subcaliber',0), 'apds-sabot':('sabot',0),
 'finned-dart':('dart',0), 'ap-breaker':('blunt',0), 'wedge':('wedge',0),
 'pele-sidewinder':('long',2), 'bankshot':('round',0), 'drillhead':('long',3),
 'soft-nose':('round',0), 'pancake':('wide',0), 'petal':('petal',0),
 'bonded-mushroom':('mushroom',0), 'crusher':('stepped',0), 'heavy-soft-shot':('wide',1),
 'cuff':('round',2), 'splitter':('blunt',3), 'anvil':('anvil',0),
 'heat-round':('finjet',0), 'double-jet':('finjet',1), 'wide-jet':('finjet',2),
 'crossfire':('round',1), 'sabot-heat':('sabot',1), 'double-strike':('finjet',3),
 'cornerjet':('finjet',4), 'forkjet':('finjet',5), 'roofbreaker':('finjet',6), 'needle-jet':('needle',0),
 'hesh-round':('round',0), 'broadhead':('wide',0), 'scab-lifter':('stepped',1),
 'shock':('blunt',0), 'hesh-demolition':('wide',1), 'ribbon-hesh':('round',2),
 'echo-hesh':('round',3), 'quake':('wide',4),
 'he-blast':('point',0), 'he-demolition':('wide',0), 'fragmentation':('round',2),
 'thermal':('round',3), 'rainmaker':('point',1), 'crownburst':('stepped',2),
 'obstacle-reducer':('wide',2), 'foundation-breaker':('blunt',1), 'pressure-hammer':('wide',3),
 'popcorn-burst':('round',4), 'meltdown':('round',5),
 'aphe-hybrid':('point',0), 'capped-aphe':('cap',1), 'bunkerbreaker':('stepped',3),
 'emberpiercer':('long',1), 'switchfuse':('point',2), 'sideburst':('cap',3),
 'latchburst':('long',4), 'adaptive-shell':('stepped',4), 'chain-blast':('point',5),
}

def draw_projectile(item, pixel=False):
    slug, cat = item['id'], item['category']
    shape, detail = SPECS[slug]
    # Draw separately at the actual pixel grid for flight; the card image is not
    # sampled or resized to produce the projectile texture.
    scale = 1/4 if pixel else 1
    w,h = round(384*scale), round(160*scale)
    im=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(im)
    def poly(points, fill): d.polygon([(round(x*scale),round(y*scale)) for x,y in points],fill=fill)
    def rect(box, fill): d.rectangle(tuple(round(v*scale) for v in box),fill=fill)
    dark, light=PALETTE[cat]
    def tint(rgb, m): return tuple(min(255,round(c*m)) for c in rgb)+(255,)
    body=(40,51,62,255) if cat=='soft' else tint(dark,1)
    highlight=tint(light,1)
    edge=(25,33,40,255)
    brass=(204,145,70,255)
    copper=(181,114,68,255)
    gold=(211,181,83,255)
    # Main silhouettes, nose pointing right.
    if shape=='dart': pts=[(35,55),(72,70),(260,72),(350,80),(260,88),(72,90),(35,105),(49,80)]
    elif shape=='needle': pts=[(30,53),(68,68),(106,66),(230,68),(268,75),(355,79),(355,82),(268,84),(230,92),(106,94),(68,92),(30,107),(43,80)]
    elif shape=='sabot': pts=[(30,46),(92,46),(105,62),(225,62),(266,66),(350,80),(266,94),(225,98),(105,98),(92,114),(30,114)]
    elif shape=='subcaliber': pts=[(30,48),(92,48),(92,67),(195,67),(195,43),(350,80),(195,117),(195,93),(92,93),(92,112),(30,112)]
    elif shape=='finjet': pts=[(27,39),(66,59),(105,62),(105,50),(236,50),(278,70),(335,76),(335,84),(278,90),(236,110),(105,110),(105,98),(66,101),(27,121),(42,80)]
    elif shape=='petal': pts=[(32,51),(224,51),(300,41),(335,57),(293,69),(278,80),(293,91),(335,103),(300,119),(224,109),(32,109)]
    elif shape=='mushroom': pts=[(32,56),(216,56),(216,44),(278,44),(312,55),(329,68),(329,92),(312,105),(278,116),(216,116),(216,104),(32,104)]
    elif shape=='anvil': pts=[(32,54),(240,54),(240,43),(330,43),(330,117),(240,117),(240,106),(32,106)]
    elif shape=='wedge': pts=[(32,50),(230,50),(230,42),(330,68),(330,92),(230,118),(230,110),(32,110)]
    elif shape=='stepped': pts=[(32,48),(235,48),(235,43),(280,43),(280,52),(310,52),(329,67),(329,93),(310,108),(280,108),(280,117),(235,117),(235,112),(32,112)]
    elif shape=='wide': pts=[(42,45),(237,45),(280,45),(314,57),(327,70),(327,90),(314,103),(280,115),(42,115)]
    elif shape=='blunt': pts=[(40,49),(250,49),(287,49),(318,58),(328,70),(328,90),(318,102),(287,111),(40,111)]
    elif shape=='cap': pts=[(32,49),(231,49),(231,44),(280,42),(314,53),(330,68),(336,80),(330,92),(314,107),(280,118),(231,116),(231,111),(32,111)]
    elif shape=='round': pts=[(32,50),(238,50),(276,53),(309,62),(329,73),(333,80),(329,87),(309,98),(276,107),(238,110),(32,110)]
    elif shape=='long': pts=[(32,53),(224,53),(250,55),(286,61),(350,80),(286,99),(250,105),(224,107),(32,107)]
    else: pts=[(32,49),(230,49),(265,54),(300,65),(344,80),(300,95),(265,106),(230,111),(32,111)]
    poly(pts,edge)
    # Horizontal stripes give rounded, shaded volume while clipped to silhouette.
    mask=Image.new('L',(w,h)); ImageDraw.Draw(mask).polygon([(round(x*scale),round(y*scale)) for x,y in pts],fill=255)
    layer=Image.new('RGBA',(w,h)); ld=ImageDraw.Draw(layer)
    for y in range(38,123):
        v=0.55+0.50*math.exp(-((y-66)/27)**2)
        col=tuple(min(255,round(c*v)) for c in (light if cat!='soft' else (183,123,82)))+(255,)
        ld.line((0,round(y*scale),w,round(y*scale)),fill=col,width=max(1,round(scale)))
    im.paste(layer,(0,0),mask); d=ImageDraw.Draw(im)
    # Flat base and reference-inspired driving band, no text or fabricated codes.
    if shape not in ('dart','needle','finjet'):
        rect((32,51,49,109),body); rect((51,51,64,109),brass); rect((65,51,69,109),(99,69,43,255))
    if shape=='finjet':
        poly([(27,39),(67,60),(67,100),(27,121),(42,80)],body)
        rect((70,63,81,97),brass); rect((86,63,94,97),(96,183,181,255))
        rect((310,76,338,84),(116,200,197,255))
    if shape in ('cap','long','point','round','wide','blunt','stepped','wedge'):
        rect((227,52,230,108),(45,53,58,255))
    if cat in ('hesh','he'):
        rect((225,51,232,109),gold)
    if cat=='aphe':
        rect((79,52,84,108),(181,103,79,255))
    if slug in ('ribbon-hesh','echo-hesh','double-strike','adaptive-shell','chain-blast','bunkerbreaker'):
        for x in (100,112): rect((x,50,x+4,110),tint(light,0.7))
    if slug in ('drillhead',):
        for x in range(235,310,16): poly([(x,96),(x+5,96),(x+28,63),(x+23,63)],(200,216,219,180))
    if slug in ('splitter','popcorn-burst'):
        rect((235,51,238,109),edge); rect((75,78,315,81),edge)
    if slug in ('fragmentation','sideburst'):
        for x in (125,157,189): rect((x,60,x+3,100),tint(dark,0.6))
    if slug=='meltdown': rect((228,52,239,108),(246,137,46,255))
    if slug=='quake':
        for x in (270,282,294): rect((x,53,x+4,107),(113,121,91,255))
    if slug=='petal': poly([(228,52),(300,42),(335,57),(293,69),(278,80),(293,91),(335,103),(300,118),(228,108)],copper)
    if slug=='cuff': rect((205,51,225,109),copper)
    if slug=='anvil': rect((268,44,330,116),(48,57,62,255)); rect((319,45,328,115),(126,139,142,255))
    if slug=='cornerjet': poly([(312,76),(338,66),(338,74),(315,84)],(92,169,168,255))
    if slug in ('forkjet','double-jet'): rect((310,71,337,76),(117,197,190,255)); rect((310,84,337,89),(117,197,190,255))
    # Highlight edges are intentionally marks, not lettering.
    if shape not in ('dart','needle'):
        rect((98,58,180,60),(210,218,216,95)); rect((104,101,177,103),(25,31,34,105))
    return im

icons=OUT/'icons'; rounds=OUT/'rounds'; icons.mkdir(exist_ok=True,parents=True); rounds.mkdir(exist_ok=True,parents=True)
assert len(entries)==59 and set(SPECS)=={e['id'] for e in entries}
for e in entries:
    slug=e['id']; draw_projectile(e).save(icons/f'{slug}.png',optimize=True)
    sprite=draw_projectile(e,True)
    sprite.save(rounds/f'{slug}.png',optimize=True)
    e['artwork']='original interpretation informed by supplied references'
manifest_path.write_text(json.dumps({'source':'original geometry; reference-informed interpretation','count':len(entries),'items':entries},indent=2)+'\n')
# Icons are displayed in cards at 96×40 CSS pixels in the contact sheet.
cols=5; cellw=150; cellh=80; rows=math.ceil(len(entries)/cols)
sheet=Image.new('RGB',(cols*cellw,rows*cellh),(12,20,31)); d=ImageDraw.Draw(sheet)
for i,e in enumerate(entries):
    x=(i%cols)*cellw; y=(i//cols)*cellh
    icon=Image.open(icons/f"{e['id']}.png").resize((96,40),Image.Resampling.LANCZOS)
    sheet.paste(icon,(x+27,y+4),icon); d.text((x+5,y+48),e['name'],fill=(222,228,226))
(ROOT/'docs').mkdir(exist_ok=True); sheet.save(ROOT/'docs/ammo-contact-sheet.png')
print(f'Generated {len(entries)} original icons and pixel sprites')
