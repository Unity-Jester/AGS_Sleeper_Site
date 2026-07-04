import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLeagueId } from '@/lib/utils';
import LeaguePicker from '@/components/LeaguePicker';

// Landing: a deployment configured with NEXT_PUBLIC_LEAGUE_ID goes straight
// to its home league; otherwise return visitors go to their last league and
// new visitors get the picker. Other leagues stay reachable at /league/<id>.
export default function HomePage() {
  const envLeagueId = getLeagueId();
  if (envLeagueId && envLeagueId !== 'your_league_id_here') {
    redirect(`/league/${envLeagueId}`);
  }

  const savedLeagueId = cookies().get('lastLeagueId')?.value;
  if (savedLeagueId && /^\d+$/.test(savedLeagueId)) {
    redirect(`/league/${savedLeagueId}`);
  }

  return <LeaguePicker />;
}
