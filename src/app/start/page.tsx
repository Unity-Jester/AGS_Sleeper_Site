import LeaguePicker from '@/components/LeaguePicker';

// Always shows the picker, even when the deployment has a default league
// or the visitor has a saved one - this is the "switch league" page.
export default function StartPage() {
  return <LeaguePicker />;
}
