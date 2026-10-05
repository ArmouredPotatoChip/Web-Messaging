import "./App.css";
import { useSession } from "./features/auth/useSession";
import { AuthScreen } from "./features/auth/authScreen";
import { ChatScreen } from "./features/chat/chatScreen";

function App() {
  const { session, loading } = useSession();

  if (loading) return <div className="p-4">Yükleniyor...</div>;
  if (!session) return <AuthScreen />;

  return <ChatScreen myUserId={session.user.id} />;
}

export default App;