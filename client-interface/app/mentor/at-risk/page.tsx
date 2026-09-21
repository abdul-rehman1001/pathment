import { redirect } from 'next/navigation';

export default function AtRiskRedirect() {
  redirect('/mentor/mentees?filter=attention');
}
