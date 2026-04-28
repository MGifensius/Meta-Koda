import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const initialError = error === 'suspended' ? 'Your account has been suspended.' : undefined;
  return initialError ? <LoginForm initialError={initialError} /> : <LoginForm />;
}
