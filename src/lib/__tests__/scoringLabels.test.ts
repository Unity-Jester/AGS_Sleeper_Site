import { describe, it, expect } from 'vitest';
import { scoringLabel, scoringValue, scoringGroup } from '../scoringLabels';

describe('scoring labels', () => {
  it('names keys without mangling fumble recoveries', () => {
    expect(scoringLabel('def_st_fum_rec')).toBe('Defense / ST fumble recovery');
    expect(scoringLabel('fgm_50p')).toBe('FG made 50+ yds');
    expect(scoringLabel('idp_tkl_solo')).toBe('Idp tkl solo');
  });

  it('formats float per-yard values', () => {
    expect(scoringValue('pass_yd', 0.03999999910593033)).toBe('1 pt / 25 yds');
    expect(scoringValue('rush_yd', 0.10000000149011612)).toBe('1 pt / 10 yds');
    expect(scoringValue('pass_inc', -0.5)).toBe('-0.5');
    expect(scoringValue('rec', 1)).toBe('+1');
  });

  it('groups keys', () => {
    expect(scoringGroup('rec_td_40p')).toBe('Receiving');
    expect(scoringGroup('pts_allow_35p')).toBe('Defense');
    expect(scoringGroup('st_fum_rec')).toBe('Special Teams');
  });
});
