import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const VALID_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  'invite',
  'magiclink',
  'recovery',
  'signup',
  'email_change',
  'email',
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/accept-invite';
  const supabase = await createServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type && VALID_OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=invite_invalid`);
}
