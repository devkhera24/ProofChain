import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext.jsx";
import { toApiError } from "../../api/client.js";
import ServerStatusBanner from "../common/ServerStatusBanner.jsx";

const MODES = {
  login: {
    title: "Log in to ProofChain",
    submit: "Log in",
    pending: "Logging in…",
    fields: ["email", "password"],
    switchText: "No account?",
    switchLink: { to: "/register", label: "Register" },
  },
  register: {
    title: "Create your account",
    submit: "Create account",
    pending: "Creating account…",
    fields: ["name", "email", "password"],
    switchText: "Already registered?",
    switchLink: { to: "/login", label: "Log in" },
  },
};

const FIELD_PROPS = {
  name: { label: "Name", type: "text", autoComplete: "name" },
  email: { label: "Email", type: "email", autoComplete: "email" },
  password: { label: "Password", type: "password" },
};

export default function AuthForm({ mode }) {
  const config = MODES[mode];
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const target = location.state?.from?.pathname ?? "/projects";
  if (auth.user) return <Navigate to={target} replace />;

  const fieldError = (name) => error?.issues?.find((i) => i.path === name)?.message;

  async function onSubmit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = Object.fromEntries(config.fields.map((f) => [f, values[f]]));
      await auth[mode](data);
      navigate(target, { replace: true });
    } catch (err) {
      setError(toApiError(err));
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <div className="flex flex-1 items-center justify-center p-4">
        <form onSubmit={onSubmit} noValidate className="card w-full max-w-sm space-y-4">
          <h1 className="text-xl font-semibold text-navy">{config.title}</h1>

          {error && !error.issues && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error.message}
            </p>
          )}

          {config.fields.map((name) => {
            const { label, ...props } = FIELD_PROPS[name];
            const msg = fieldError(name);
            return (
              <label key={name} className="block space-y-1">
                <span className="text-sm font-medium text-ink">{label}</span>
                <input
                  {...props}
                  name={name}
                  autoComplete={name === "password" ? (mode === "login" ? "current-password" : "new-password") : props.autoComplete}
                  className="input"
                  value={values[name]}
                  onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                  aria-invalid={!!msg}
                  required
                />
                {msg && <span className="block text-xs text-red-700">{msg}</span>}
                {name === "password" && mode === "register" && !msg && (
                  <span className="block text-xs text-muted">At least 8 characters.</span>
                )}
              </label>
            );
          })}

          <button type="submit" className="btn-primary w-full justify-center" disabled={pending}>
            {pending ? config.pending : config.submit}
          </button>

          <p className="text-sm text-muted">
            {config.switchText}{" "}
            <Link to={config.switchLink.to} state={location.state} className="text-teal hover:underline">
              {config.switchLink.label}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
