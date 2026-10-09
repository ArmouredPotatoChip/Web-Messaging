import { isAuthError } from "@supabase/supabase-js";

export type AppError = {
    code: ErrorCode;
    message: string;
    retryable: boolean;
};

type CatalogEntry = { message: string; retryable: boolean };

const CATALOG = {
    NETWORK: {message: "No internet connection.", retryable: true},
    SESSION_EXPIRED: {message: "Your session has expired please sign in again.", retryable: false},
    PERMISSION_DENIED: {message: "You dont have permission to do that.", retryable: false},
    INVALID_CREDENTIALS: {message: "Incorrect email or password.", retryable: false},
    EMAIL_TAKEN: {message: "An account with this email already exists.", retryable: false},
    WEAK_PASSWORD: {message: "Password is weak.", retryable: false },
    SIGNUP_FAILED: {message: "Username may be taken or invalid.", retryable: false},
    USER_NOT_LOGGED_IN: {message: "Please sign in again", retryable: false},
    USER_NOT_FOUND: { message: "No user with that username.", retryable: false },
    CHAT_WITH_SELF: { message: "You can't start a conversation with yourself.", retryable: false },
    INVALID_MESSAGE: { message: "Message is empty or too long.", retryable: false },
    RATE_LIMITED: { message: "Too many attempts. Please wait a moment and try again.", retryable: true },
    UNKNOWN: { message: "Something went wrong.", retryable: true },
} satisfies Record<string, CatalogEntry>;

const AUTH_CODES: Record<string, ErrorCode> = {
  invalid_credentials: "INVALID_CREDENTIALS",
  user_already_exists: "EMAIL_TAKEN",
  email_exists: "EMAIL_TAKEN",
  weak_password: "WEAK_PASSWORD",
  session_expired: "SESSION_EXPIRED",
  refresh_token_not_found: "SESSION_EXPIRED",
  over_request_rate_limit: "RATE_LIMITED",
  over_email_send_rate_limit: "RATE_LIMITED",
};

const POSTGRES_CODES: Record<string, ErrorCode> = {
  "42501": "PERMISSION_DENIED",
  "23514": "INVALID_MESSAGE",
};

export type ErrorCode = keyof typeof CATALOG;

export class CodedError extends Error {
    constructor(
        readonly code: ErrorCode,
        readonly cause: unknown
    ) {
        super(code);
    }
}


function field(err: unknown, name: string): string | undefined{
    if(typeof err === "object" && err !== null && name in err){
        const value = (err as Record<string, unknown>)[name];
        return typeof value === "string" ? value: undefined;
    }
} 

function detectCode(err: unknown): ErrorCode {

    const message = field(err, "message") ?? String(err);
    if(!navigator.onLine || /failed to fetch/i.test(message)){
        return "NETWORK";
    }

    if(err instanceof CodedError){
        return err.code;
    }

    const hint = field(err, "hint");
    if(hint && hint in CATALOG){
        return hint as ErrorCode;
    }

    const code = field(err, "code");
    if(isAuthError(err) && code && AUTH_CODES[code]){
        return AUTH_CODES[code];
    }

    if(code?.startsWith("PGRST3")){
        return "SESSION_EXPIRED"
    }

    if (code && POSTGRES_CODES[code]) {
        return POSTGRES_CODES[code];
    }

    return "UNKNOWN";
}

export function toAppError(err: unknown): AppError {
  console.error(err);
  const code = detectCode(err);
  const entry = CATALOG[code];
  return { code, ...entry };
}