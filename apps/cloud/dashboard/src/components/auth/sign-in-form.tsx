import { useEffect, useState } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/common";
import { clerkCode, clerkMessage } from "@/components/auth/clerk-error";

/** Query flag on the OAuth return URL; main.tsx completes the redirect when it is present. */
export const SSO_FLAG = "af_sso";

type Step = { kind: "email" } | { kind: "code"; flow: "signIn" | "signUp" } | { kind: "password" } | { kind: "details"; fields: DetailField[] } | { kind: "newAccount" };

/** Sign-up fields this form can collect when the instance requires them. */
type DetailField = "first_name" | "last_name" | "username" | "password";
const DETAIL_LABELS: Record<DetailField, string> = { first_name: "First name", last_name: "Last name", username: "Username", password: "Password" };
const DETAIL_KEYS: Record<DetailField, string> = { first_name: "firstName", last_name: "lastName", username: "username", password: "password" };

function GoogleIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
			<path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.89 2.75 2.75 6.89 2.75 12S6.89 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51Z" />
		</svg>
	);
}

export function SignInForm({ completeUrl }: { completeUrl: string }) {
	const { isLoaded, signIn, setActive } = useSignIn();
	const { signUp } = useSignUp();
	const [step, setStep] = useState<Step>({ kind: "email" });
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [details, setDetails] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Returning from Google with a sign-up that still needs details (Clerk's continue step).
	useEffect(() => {
		if (signUp?.status === "missing_requirements" && signUp.verifications.externalAccount.status === "verified" && signUp.missingFields.length && step.kind === "email") {
			try {
				askDetails(signUp.missingFields);
			} catch (err) {
				setError(clerkMessage(err));
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [signUp?.status]);

	const run = async (what: string, fn: () => Promise<void>) => {
		setBusy(what);
		setError(null);
		try {
			await fn();
		} catch (err) {
			setError(clerkMessage(err));
		} finally {
			setBusy(null);
		}
	};

	const google = () =>
		run("google", async () => {
			if (!signIn) return;
			await signIn.authenticateWithRedirect({
				strategy: "oauth_google",
				redirectUrl: `${location.origin}/?${SSO_FLAG}=1`,
				redirectUrlComplete: completeUrl,
			});
		});

	const submitEmail = (e: React.FormEvent) => {
		e.preventDefault();
		void run("email", async () => {
			if (!signIn || !signUp) return;
			try {
				const si = await signIn.create({ identifier: email.trim() });
				const emailCode = si.supportedFirstFactors?.find((f) => f.strategy === "email_code") as { emailAddressId: string } | undefined;
				if (emailCode) {
					await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: emailCode.emailAddressId });
					setStep({ kind: "code", flow: "signIn" });
				} else if (si.supportedFirstFactors?.some((f) => f.strategy === "password")) {
					setStep({ kind: "password" });
				} else {
					throw new Error("This account has no email sign-in method. Continue with Google instead.");
				}
			} catch (err) {
				if (clerkCode(err) !== "form_identifier_not_found") throw err;
				// New address: collect what the account needs, then verify the email with a code.
				setStep({ kind: "newAccount" });
			}
		});
	};

	const submitCode = (e: React.FormEvent) => {
		e.preventDefault();
		if (step.kind !== "code") return;
		void run("code", async () => {
			const r = step.flow === "signIn" ? await signIn!.attemptFirstFactor({ strategy: "email_code", code: code.trim() }) : await signUp!.attemptEmailAddressVerification({ code: code.trim() });
			if (r.status === "missing_requirements" && step.flow === "signUp") return askDetails(r.missingFields);
			if (r.status !== "complete" || !r.createdSessionId) throw new Error("Sign-in needs another step this page does not support yet. Continue with Google instead.");
			await setActive!({ session: r.createdSessionId });
		});
	};

	const submitNewAccount = (e: React.FormEvent) => {
		e.preventDefault();
		void run("newAccount", async () => {
			await signUp!.create({
				emailAddress: email.trim(),
				password,
				...(details.first_name?.trim() ? { firstName: details.first_name.trim() } : {}),
				...(details.last_name?.trim() ? { lastName: details.last_name.trim() } : {}),
			});
			await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
			setStep({ kind: "code", flow: "signUp" });
		});
	};

	const askDetails = (missing: string[]) => {
		const fields = missing.filter((f): f is DetailField => f in DETAIL_LABELS);
		if (fields.length !== missing.length) throw new Error(`Account setup needs ${missing.join(", ")}, which this page cannot collect yet.`);
		setStep({ kind: "details", fields });
	};

	const submitDetails = (e: React.FormEvent) => {
		e.preventDefault();
		if (step.kind !== "details") return;
		void run("details", async () => {
			const body = Object.fromEntries(step.fields.map((f) => [DETAIL_KEYS[f], (details[f] ?? "").trim()]));
			const r = await signUp!.update(body);
						if (r.status === "missing_requirements") return askDetails(r.missingFields);
			if (r.status !== "complete" || !r.createdSessionId) throw new Error("Account setup did not finish. Try again.");
			await setActive!({ session: r.createdSessionId });
		});
	};

	const submitPassword = (e: React.FormEvent) => {
		e.preventDefault();
		void run("password", async () => {
			const r = await signIn!.attemptFirstFactor({ strategy: "password", password });
			if (r.status !== "complete" || !r.createdSessionId) throw new Error("Sign-in needs another step this page does not support yet.");
			await setActive!({ session: r.createdSessionId });
		});
	};

	const back = () => {
		setStep({ kind: "email" });
		setCode("");
		setPassword("");
		setError(null);
	};

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>{step.kind === "email" ? "Sign in to AgileFlow" : step.kind === "code" ? "Check your email" : step.kind === "details" ? "Finish your account" : step.kind === "newAccount" ? "Create your AgileFlow account" : "Enter your password"}</CardTitle>
				<CardDescription>
					{step.kind === "email" ? "Use your work account to reach your workspace." : step.kind === "code" ? `We sent a code to ${email.trim()}.` : step.kind === "details" ? "A few details to set up your AgileFlow account." : step.kind === "newAccount" ? `No account uses ${email.trim()} yet.` : email.trim()}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{step.kind === "email" ? (
					<>
						<Button variant="outline" onClick={google} disabled={!isLoaded || !!busy}>
							{busy === "google" ? <Spinner data-icon="inline-start" /> : <GoogleIcon />}
							Continue with Google
						</Button>
						<div className="flex items-center gap-3 text-xs text-muted-foreground">
							<span className="h-px flex-1 bg-border" />
							or
							<span className="h-px flex-1 bg-border" />
						</div>
						<form onSubmit={submitEmail} className="flex flex-col gap-4">
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="si-email">Email address</FieldLabel>
									<Input id="si-email" type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
								</Field>
							</FieldGroup>
							<Button type="submit" disabled={!isLoaded || !!busy}>
								{busy === "email" ? <Spinner data-icon="inline-start" /> : null}
								Continue
							</Button>
						</form>
						<p className="text-center text-xs text-muted-foreground">New here? Continue with your email and we will create your account.</p>
					</>
				) : step.kind === "code" ? (
					<form onSubmit={submitCode} className="flex flex-col gap-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="si-code">Verification code</FieldLabel>
								<Input id="si-code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
							</Field>
						</FieldGroup>
						<Button type="submit" disabled={!!busy}>
							{busy === "code" ? <Spinner data-icon="inline-start" /> : null}
							Verify
						</Button>
						<Button type="button" variant="ghost" onClick={back}>Use a different email</Button>
					</form>
				) : step.kind === "newAccount" ? (
					<form onSubmit={submitNewAccount} className="flex flex-col gap-4">
						<FieldGroup>
							<div className="grid grid-cols-2 gap-3">
								<Field>
									<FieldLabel htmlFor="na-first">First name</FieldLabel>
									<Input id="na-first" autoComplete="given-name" value={details.first_name ?? ""} onChange={(e) => setDetails((d) => ({ ...d, first_name: e.target.value }))} />
								</Field>
								<Field>
									<FieldLabel htmlFor="na-last">Last name</FieldLabel>
									<Input id="na-last" autoComplete="family-name" value={details.last_name ?? ""} onChange={(e) => setDetails((d) => ({ ...d, last_name: e.target.value }))} />
								</Field>
							</div>
							<Field>
								<FieldLabel htmlFor="na-password">Password</FieldLabel>
								<Input id="na-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
							</Field>
						</FieldGroup>
						<Button type="submit" disabled={!!busy}>
							{busy === "newAccount" ? <Spinner data-icon="inline-start" /> : null}
							Create account
						</Button>
						<Button type="button" variant="ghost" onClick={back}>Use a different email</Button>
					</form>
				) : step.kind === "details" ? (
					<form onSubmit={submitDetails} className="flex flex-col gap-4">
						<FieldGroup>
							{step.fields.map((f) => (
								<Field key={f}>
									<FieldLabel htmlFor={`su-${f}`}>{DETAIL_LABELS[f]}</FieldLabel>
									<Input
										id={`su-${f}`}
										required
										type={f === "password" ? "password" : "text"}
										autoComplete={f === "password" ? "new-password" : f === "first_name" ? "given-name" : f === "last_name" ? "family-name" : "username"}
										value={details[f] ?? ""}
										onChange={(e) => setDetails((d) => ({ ...d, [f]: e.target.value }))}
									/>
								</Field>
							))}
						</FieldGroup>
						<Button type="submit" disabled={!!busy}>
							{busy === "details" ? <Spinner data-icon="inline-start" /> : null}
							Create account
						</Button>
					</form>
				) : (
					<form onSubmit={submitPassword} className="flex flex-col gap-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="si-password">Password</FieldLabel>
								<Input id="si-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
							</Field>
						</FieldGroup>
						<Button type="submit" disabled={!!busy}>
							{busy === "password" ? <Spinner data-icon="inline-start" /> : null}
							Sign in
						</Button>
						<Button type="button" variant="ghost" onClick={back}>Use a different email</Button>
					</form>
				)}
				{error ? <Notice role="alert" title="Sign-in failed">{error}</Notice> : null}
			</CardContent>
		</Card>
	);
}
