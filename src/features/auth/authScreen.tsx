import { useState, type FormEvent } from "react";
import { isUsernameAvailable, signIn, signUp } from "./api";
import { toAppError, type AppError } from "../../lib/errors";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setInputError(null);

    const cleanUsername = username.trim();
    if (mode === "signup" && (cleanUsername.length < 3 || cleanUsername.length > 30)) {
      setInputError("Username must be 3-30 characters long.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        if (!(await isUsernameAvailable(cleanUsername))) {
          setInputError("That username is already taken.");
          return;
        }
        await signUp(email, password, cleanUsername);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(toAppError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function toggleMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setError(null);
    setInputError(null);
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

        {inputError && <p className="text-sm text-red-600">{inputError}</p>}
        {error && (
          <div className="text-sm text-red-600">
            <p className="font-medium">{mode === "signin" ? "Couldn't sign in" : "Couldn't sign up"}</p>
            <p>{error.message}</p>
            {error.retryable && (
              <button type="button" onClick={submit} disabled={busy} className="underline disabled:opacity-50">
                Try again
              </button>
            )}
          </div>
        )}

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
          onClick={toggleMode}
        >
          {mode === "signin" ? "Dont have an Account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}