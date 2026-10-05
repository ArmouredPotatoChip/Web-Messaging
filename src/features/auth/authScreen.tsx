import { useState, type FormEvent } from "react";
import { signIn, signUp } from "./api";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (mode === "signup" && (cleanUsername.length < 3 || cleanUsername.length > 30)) {
      setError("username must be 3-30 characters long");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, cleanUsername);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "an error occured.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="w-80 space-y-3 rounded-lg bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold">
          {mode === "signin" ? "Login" : "Sign up"}
        </h1>

        {mode === "signup" && (
          <input
            className="w-full rounded border p-2"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        )}
        <input
          className="w-full rounded border p-2"
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded border p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : mode === "signin" ? "Sign in" : "Sign Up"}
        </button>

        <button
          type="button"
          className="w-full text-sm text-blue-600"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Dont have an Account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}