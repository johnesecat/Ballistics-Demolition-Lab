/**
 * Playback time scale for shot replays: how fast the recorded physics should
 * be shown. Pure presentation -- the simulation itself is fixed and
 * deterministic; this only stretches the viewing.
 *
 * The footage eases into slow motion around contact (0.25x on approach,
 * 0.18x at the hit) and, crucially, crawls through the bore (0.5x) so the
 * crush of the lattice and the tore geometry read in real time instead of
 * the round seemingly going through like butter.
 */
export function playbackTimeScale(elapsed: number, contactT: number | null, impactT: number | null): number {
  if (impactT === null) return 1;
  let scale = 1;
  const togo = impactT - elapsed;
  if (togo > 0) {
    if (togo < 260) scale = Math.min(scale, 0.25);
    else if (togo < 560) scale = Math.min(scale, 0.25 + 0.75 * ((togo - 260) / 300));
  } else {
    const since = -togo;
    if (since < 120) scale = Math.min(scale, 0.18);
    else if (since < 660) scale = Math.min(scale, 0.18 + 0.82 * ((since - 120) / 540));
  }
  // Bore pacing: while the round is working through layers (contact made,
  // terminal impact not yet reached) the replay crawls so the user can watch
  // the pixel squash and the damage happen.
  if (contactT !== null && elapsed >= contactT && elapsed < impactT) {
    scale = Math.min(scale, 0.5);
  }
  return scale;
}
