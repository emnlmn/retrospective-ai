import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to the page within the (main) layout group
  redirect('/home');
}
