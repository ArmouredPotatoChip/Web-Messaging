import { useState } from "react";
import { signOut } from "./api";
import { toAppError, type AppError } from "../../lib/errors";
import { ErrorNotice } from "../../ErrorNotice";

export function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<AppError | null>(null);

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setSignOutError(toAppError(err));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full p-3 text-left text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        {signingOut ? "Signing out..." : "Exit"}
      </button>
      {signOutError && (
        <ErrorNotice
          variant="inline"
          className="border-t p-3 text-xs"
          context="Couldn't sign out"
          error={signOutError}
          onRetry={handleSignOut}
          busy={signingOut}
        />
      )}
    </>
  );
}
