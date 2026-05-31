import { auth } from "@/lib/auth";
import { WelcomeChat } from "./_components/welcome-chat";

export default async function AppHome() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "";

  return (
    <div className="h-dvh">
      <WelcomeChat userName={userName} />
    </div>
  );
}
