import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PortfolioEntry from '@/components/PortfolioEntry';

// Returning visitors go straight to their saved portfolio; the entry form
// stays reachable via /portfolio?switch=1 (used by the "not you?" link).
export default function PortfolioPage({
  searchParams,
}: {
  searchParams: { switch?: string };
}) {
  if (!searchParams.switch) {
    const saved = cookies().get('portfolioUsername')?.value;
    if (saved) {
      redirect(`/portfolio/${encodeURIComponent(saved)}`);
    }
  }
  return <PortfolioEntry />;
}
