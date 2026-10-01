import { SocialHome } from '../social-home';
export const dynamic='force-dynamic';
export default async function UsernamePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <SocialHome initialUsername={username} />;
}
