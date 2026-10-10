// Readable labels and values for Sleeper scoring settings

const LABELS: Record<string, string> = {
  pass_yd: 'Passing yards',
  pass_td: 'Passing TD',
  pass_td_40p: '40+ yd passing TD bonus',
  pass_td_50p: '50+ yd passing TD bonus',
  pass_int: 'Interception thrown',
  pass_2pt: '2-pt conversion (pass)',
  pass_cmp: 'Completion',
  pass_inc: 'Incompletion',
  pass_att: 'Pass attempt',
  pass_sack: 'Sacked',
  rush_yd: 'Rushing yards',
  rush_td: 'Rushing TD',
  rush_td_40p: '40+ yd rushing TD bonus',
  rush_td_50p: '50+ yd rushing TD bonus',
  rush_2pt: '2-pt conversion (rush)',
  rush_att: 'Rush attempt',
  rush_fd: 'Rushing first down',
  rec: 'Reception',
  rec_yd: 'Receiving yards',
  rec_td: 'Receiving TD',
  rec_td_40p: '40+ yd receiving TD bonus',
  rec_td_50p: '50+ yd receiving TD bonus',
  rec_2pt: '2-pt conversion (rec)',
  rec_fd: 'Receiving first down',
  bonus_rec_te: 'TE reception bonus',
  bonus_rec_rb: 'RB reception bonus',
  bonus_rec_wr: 'WR reception bonus',
  fum: 'Fumble',
  fum_lost: 'Fumble lost',
  fum_rec_td: 'Fumble recovery TD',
  fgm: 'Field goal made',
  fgm_0_19: 'FG made 0-19 yds',
  fgm_20_29: 'FG made 20-29 yds',
  fgm_30_39: 'FG made 30-39 yds',
  fgm_40_49: 'FG made 40-49 yds',
  fgm_50p: 'FG made 50+ yds',
  fgmiss: 'FG missed',
  xpm: 'Extra point made',
  xpmiss: 'Extra point missed',
  def_td: 'Defensive TD',
  def_st_td: 'Defense / ST TD',
  def_st_fum_rec: 'Defense / ST fumble recovery',
  def_st_ff: 'Defense / ST forced fumble',
  sack: 'Sack',
  int: 'Interception',
  fum_rec: 'Fumble recovery',
  ff: 'Forced fumble',
  safe: 'Safety',
  blk_kick: 'Blocked kick',
  st_td: 'Special teams TD',
  st_fum_rec: 'Special teams fumble recovery',
  st_ff: 'Special teams forced fumble',
  pts_allow_0: 'Points allowed: 0',
  pts_allow_1_6: 'Points allowed: 1-6',
  pts_allow_7_13: 'Points allowed: 7-13',
  pts_allow_14_20: 'Points allowed: 14-20',
  pts_allow_21_27: 'Points allowed: 21-27',
  pts_allow_28_34: 'Points allowed: 28-34',
  pts_allow_35p: 'Points allowed: 35+',
};

export type ScoringGroup = 'Passing' | 'Rushing' | 'Receiving' | 'Kicking' | 'Defense' | 'Special Teams' | 'Other';

export function scoringGroup(key: string): ScoringGroup {
  if (key.startsWith('pass_')) return 'Passing';
  if (key.startsWith('rush_')) return 'Rushing';
  if (key.startsWith('rec') || key.startsWith('bonus_rec')) return 'Receiving';
  if (key.startsWith('fg') || key.startsWith('xp')) return 'Kicking';
  if (key.startsWith('st_')) return 'Special Teams';
  if (
    key.startsWith('def_') || key.startsWith('pts_allow') || key.startsWith('yds_allow') ||
    ['sack', 'int', 'fum_rec', 'ff', 'safe', 'blk_kick', 'tkl', 'tkl_loss'].includes(key)
  ) return 'Defense';
  return 'Other';
}

export function scoringLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  // Fallback: whole-word abbreviations only
  return key
    .split('_')
    .map(w => ({ td: 'TD', qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', yd: 'yds', fd: 'first down', p: '+' } as Record<string, string>)[w] ?? w)
    .join(' ')
    .replace(/^\w/, c => c.toUpperCase());
}

// Sleeper stores per-yard scoring as floats (0.03999999910593033);
// show those as "1 pt / 25 yds" and everything else rounded
export function scoringValue(key: string, value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (key.endsWith('_yd') && Math.abs(value) > 0 && Math.abs(value) < 1) {
    const yardsPerPoint = Math.round(1 / Math.abs(value));
    return `${value < 0 ? '-' : ''}1 pt / ${yardsPerPoint} yds`;
  }
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
